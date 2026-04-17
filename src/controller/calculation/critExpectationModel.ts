/**
 * CritExpectationModel — expected-value probability model for crit-dependent statuses.
 *
 * For each operator in EXPECTED mode, computes the probability distribution over
 * all crit-triggered status stack counts at each damage frame. Uses the recursive
 * relation: all stacks update using E_total(T-1), then E_total(T) is recomputed
 * from the updated distributions.
 *
 * Three stacking mechanism types:
 * - Type 1 (Lifecycle): permanent stacks → threshold triggers timed buff → buff expires → consume all (Markov chain)
 * - Type 2 (SharedTimer): finite duration shared timer, refreshes on crit (Markov chain)
 * - Type 3 (FIFO): independent per-stack timers, oldest replaced at cap (Poisson binomial)
 *
 * Feedback statuses (those granting CRITICAL_RATE at some threshold) contribute to E_total.
 * Dependent statuses consume E_total but don't influence it.
 */

import { StackInteractionType, CritMode, PERMANENT_DURATION, UnitType } from '../../consts/enums';
import { StatType, resolveEffectStat } from '../../model/enums/stats';
import { VerbType, NounType } from '../../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from './valueResolver';
import type { ValueNode } from '../../dsl/semantics';
import type { TriggerIndex, TriggerDefEntry } from '../timeline/triggerIndex';
import { getStatusDef } from '../../controller/timeline/configCache';
import { FPS } from '../../utils/timeline';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CritSource {
  label: string;
  statusId?: string;
  /** The crit rate contribution (absolute, e.g. 0.05 = 5%). */
  value: number;
  /** P(this source is active). Omitted for unconditional sources (base crit). */
  probability?: number;
  /** For threshold sources: the required stack count. */
  thresholdStacks?: number;
}

/** Per-status, per-stat contribution with stack info for breakdown display. */
export interface StatusStatContribution {
  /** Status display name. */
  label: string;
  statusId: string;
  stat: StatType;
  /** Expected (or actual) stack count contributing to this stat. */
  expectedStacks: number;
  /** Value per stack (0 for threshold effects). */
  valuePerStack: number;
  /** Total expected contribution (expected stacks × perStack, or probability × threshold value). */
  total: number;
  /** P(stacks > 0) — probability the status is active at all. */
  uptime: number;
  /** For threshold effects: required stacks and probability of reaching them. */
  threshold?: { atStacks: number; probability: number };
}

export interface CritFrameSnapshot {
  /** Effective expected crit rate at this frame (base + conditional bonuses). */
  expectedCritRate: number;
  /** Sources contributing to the crit rate. */
  critSources: CritSource[];
  /** Per-status: probability of each stack count [P(0), P(1), ..., P(cap)]. */
  statusDistributions: Map<string, number[]>;
  /** Expected stat deltas from all crit-dependent statuses (weighted by probability). */
  expectedStatDeltas: Partial<Record<StatType, number>>;
  /** Full-value stats if all crit statuses were at max stacks (what ALWAYS mode gives). */
  fullStatValues: Partial<Record<StatType, number>>;
  /** Per-status, per-stat contributions for breakdown display. */
  statContributions: StatusStatContribution[];
}

/** Configuration extracted from a crit-triggered status config. */
interface CritStatusConfig {
  statusId: string;
  label: string;
  stackCap: number;
  /** Duration in absolute frames. PERMANENT_DURATION for infinite. */
  durationFrames: number;
  interactionType: string;
  /** Whether this status feeds back into crit rate. */
  isFeedback: boolean;
  /** Stat effects per stack (from clause effects). */
  perStackStats: { stat: StatType; valuePerStack: number }[];
  /** Threshold-conditional stat effects (e.g. MI Security +5% crit at 5 stacks). */
  thresholdStats: { stat: StatType; value: number; atStacks: number; label?: string }[];
  /** Lifecycle: spawned buff status ID, buff duration in frames, or undefined if not lifecycle. */
  lifecycle?: { buffStatusId: string; buffDurationFrames: number };
}

const enum ModelType {
  LIFECYCLE = 1,
  SHARED_TIMER = 2,
  FIFO = 3,
}

// Numeric key encoding for Markov state maps.
// Encodes (stacks, frame) as a single number to avoid string alloc/parse overhead.
// frame is stored as (frame + 1) so that -1 (no crit) maps to 0.
const FRAME_MULTIPLIER = 1_000_000;
function encodeKey(stacks: number, frame: number): number {
  return stacks * FRAME_MULTIPLIER + (frame + 1);
}
function decodeStacks(key: number): number {
  return (key / FRAME_MULTIPLIER) | 0;
}
function decodeFrame(key: number): number {
  return (key % FRAME_MULTIPLIER) - 1;
}

// Status config loaded via unified configCache (getStatusDef imported above).

function resolveValue(node: ValueNode): number {
  return resolveValueNode(node, DEFAULT_VALUE_CONTEXT);
}

function getDurationFrames(duration?: { value: ValueNode; unit: string }): number {
  if (!duration) return PERMANENT_DURATION * FPS;
  const val = resolveValue(duration.value);
  if (val >= PERMANENT_DURATION) return PERMANENT_DURATION * FPS;
  return duration.unit === UnitType.SECOND ? Math.round(val * FPS) : val;
}

// ── Config extraction ────────────────────────────────────────────────────────

/**
 * Extract CritStatusConfig from a TriggerDefEntry + its applied status def.
 * Returns undefined if the status config can't be loaded.
 */
function extractStatusConfig(entry: TriggerDefEntry, skillLevel: number): CritStatusConfig | undefined {
  // The trigger effect is APPLY STATUS <statusId>
  const applyEffect = entry.triggerEffects?.find(
    e => e.verb === VerbType.APPLY && e.object === NounType.STATUS,
  );
  if (!applyEffect) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statusId = (applyEffect as any).objectId as string | undefined;
  if (!statusId) return undefined;

  const def = getStatusDef(statusId);
  if (!def) return undefined;

  const stackCap = def.properties.stacks?.limit
    ? resolveValue(def.properties.stacks.limit)
    : 1;
  const durationFrames = getDurationFrames(def.properties.duration);
  const interactionType = def.properties.stacks?.interactionType ?? StackInteractionType.NONE;

  // Extract stat effects from clause
  const perStackStats: CritStatusConfig['perStackStats'] = [];
  const thresholdStats: CritStatusConfig['thresholdStats'] = [];
  let isFeedback = false;

  if (def.clause && Array.isArray(def.clause)) {
    for (const clause of def.clause) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = clause as any;
      const conditions = c.conditions ?? [];
      const effects = c.effects ?? [];

      // Check for threshold conditions (HAVE STACKS EXACTLY N)
      const haveCondition = conditions.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cond: any) => cond.verb === VerbType.HAVE && (cond.object === NounType.STACKS || cond.object === NounType.STATUS),
      );
      const thresholdStacks = haveCondition
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? resolveValue((haveCondition as any).value ?? { verb: VerbType.IS, value: stackCap })
        : undefined;

      for (const effect of effects) {
        const stat = resolveEffectStat(effect);
        if (!stat) continue;

        // Resolve the value — handle VARY_BY STATUS_LEVEL (per-stack) and IS (flat)
        const withBlock = effect.with;
        if (!withBlock?.value) continue;

        const valueNode = withBlock.value;
        let resolvedValue: number;

        if (valueNode.verb === VerbType.VARY_BY && valueNode.object === NounType.STATUS_LEVEL) {
          // Per-stack: value array indexed by status level (stack count)
          const values = valueNode.value as number[];
          resolvedValue = values[0] ?? 0;
        } else if (valueNode.verb === VerbType.VARY_BY && valueNode.object === NounType.SKILL_LEVEL) {
          // Skill level dependent
          const values = valueNode.value as number[];
          const idx = Math.min(skillLevel - 1, values.length - 1);
          resolvedValue = values[idx] ?? 0;
        } else {
          resolvedValue = resolveValue(valueNode);
        }

        if (thresholdStacks !== undefined) {
          thresholdStats.push({ stat, value: resolvedValue, atStacks: thresholdStacks });
          if (stat === StatType.CRITICAL_RATE) isFeedback = true;
        } else if (valueNode.verb === VerbType.VARY_BY && valueNode.object === NounType.STATUS_LEVEL) {
          perStackStats.push({ stat, valuePerStack: resolvedValue });
        } else {
          // Flat effect (always active while status is up) — treat as 1-stack threshold
          perStackStats.push({ stat, valuePerStack: resolvedValue });
        }
      }
    }
  }

  // Detect lifecycle: check if the status def has onTriggerClause with BECOME STACKS
  // that triggers another status, and that status has onExitClause consuming this one back
  let lifecycle: CritStatusConfig['lifecycle'] | undefined;
  if (def.onTriggerClause) {
    for (const tc of def.onTriggerClause) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const becomeCond = tc.conditions.find((c: any) =>
        c.verb === VerbType.BECOME && (c.object === NounType.STACKS || c.object === NounType.STATUS),
      );
      if (!becomeCond) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spawnEffect = tc.effects?.find((e: any) =>
        e.verb === VerbType.APPLY && e.object === NounType.STATUS,
      );
      if (!spawnEffect) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffStatusId = (spawnEffect as any).objectId as string | undefined;
      if (!buffStatusId) continue;

      const buffDef = getStatusDef(buffStatusId);
      if (!buffDef) continue;

      // Check if the buff has onExitClause that consumes this status
      const hasConsume = buffDef.onExitClause?.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => c.effects?.some((e: any) =>
          e.verb === VerbType.CONSUME && e.object === NounType.STATUS && e.objectId === statusId,
        ),
      );

      if (hasConsume) {
        const buffDurationFrames = getDurationFrames(buffDef.properties.duration);
        lifecycle = { buffStatusId, buffDurationFrames };

        // Also extract stat effects from the buff status
        if (buffDef.clause && Array.isArray(buffDef.clause)) {
          for (const bc of buffDef.clause) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bEffects = (bc as any).effects ?? [];
            for (const bEffect of bEffects) {
              const bStat = resolveEffectStat(bEffect);
              if (!bStat) continue;
              const bWith = bEffect.with;
              if (!bWith?.value) continue;
              const bValueNode = bWith.value;
              let bResolved: number;
              if (bValueNode.verb === VerbType.VARY_BY && bValueNode.object === NounType.SKILL_LEVEL) {
                const values = bValueNode.value as number[];
                const idx = Math.min(skillLevel - 1, values.length - 1);
                bResolved = values[idx] ?? 0;
              } else {
                bResolved = resolveValue(bValueNode);
              }
              // Threshold at cap = buff is active when stacks reached cap
              const buffLabel = buffDef.properties.name ?? buffStatusId;
              thresholdStats.push({ stat: bStat, value: bResolved, atStacks: stackCap, label: buffLabel });
            }
          }
        }
        break;
      }
    }
  }

  return {
    statusId,
    label: def.properties.name ?? statusId,
    stackCap,
    durationFrames,
    interactionType,
    isFeedback,
    perStackStats,
    thresholdStats,
    lifecycle,
  };
}

function classifyModelType(config: CritStatusConfig): ModelType {
  if (config.lifecycle) return ModelType.LIFECYCLE;
  if (config.interactionType === StackInteractionType.RESET) return ModelType.FIFO;
  return ModelType.SHARED_TIMER;
}

// ── Model Interfaces ─────────────────────────────────────────────────────────

interface StatusModel {
  config: CritStatusConfig;
  modelType: ModelType;
  /** Step the model forward to damage frame at absoluteFrame. */
  step(absoluteFrame: number, eCrit: number): void;
  /** Get current stack probability distribution [P(0), P(1), ..., P(cap)]. */
  getDistribution(): number[];
  /** For lifecycle models: P(buff is active at current frame). */
  getBuffProbability?(): number;
}

// ── Type 2: Shared Timer Markov Chain ────────────────────────────────────────

/**
 * Shared-timer model: all stacks share one duration timer that refreshes on each crit.
 * State = (stacks, lastCritFrame). When T - lastCrit > duration, stacks expire to 0.
 * Uses a Map<string, number> keyed by "stacks:lastCritFrame" for compact state management.
 */
class SharedTimerModel implements StatusModel {
  readonly modelType = ModelType.SHARED_TIMER;

  private stateMap: Map<number, number>;
  private swapMap = new Map<number, number>();
  private readonly cap: number;
  private readonly durationFrames: number;
  private cachedDist: number[] | undefined;
  /** Reusable buffer for keys to prune (avoids per-step allocation). */
  private _pruneKeys = new Array<number>(64);

  constructor(readonly config: CritStatusConfig) {
    this.cap = config.stackCap;
    this.durationFrames = config.durationFrames;
    this.stateMap = new Map<number, number>();
    this.stateMap.set(encodeKey(0, -1), 1.0);
  }

  step(absoluteFrame: number, eCrit: number): void {
    const newMap = this.swapMap;
    newMap.clear();
    const clampedE = Math.min(Math.max(eCrit, 0), 1);
    const dur = this.durationFrames;
    const cap = this.cap;

    this.stateMap.forEach((prob, key) => {
      if (prob < 1e-15) return;
      const stacks = decodeStacks(key);
      const lastCritFrame = decodeFrame(key);

      // Check expiry: if last crit is too old, force stacks to 0
      let effectiveStacks = stacks;
      if (effectiveStacks > 0 && lastCritFrame >= 0 && absoluteFrame - lastCritFrame > dur) {
        effectiveStacks = 0;
      }

      // Branch: crit
      const newStacks = Math.min(effectiveStacks + 1, cap);
      const critKey = encodeKey(newStacks, absoluteFrame);
      newMap.set(critKey, (newMap.get(critKey) ?? 0) + prob * clampedE);

      // Branch: no crit
      const noCritKey = encodeKey(effectiveStacks, effectiveStacks > 0 ? lastCritFrame : -1);
      newMap.set(noCritKey, (newMap.get(noCritKey) ?? 0) + prob * (1 - clampedE));
    });

    // Prune tiny probabilities and merge expired states
    const zeroKey = encodeKey(0, -1);
    let pruneIdx = 0;
    newMap.forEach((prob, key) => {
      if (prob < 1e-15) { this._pruneKeys[pruneIdx++] = key; return; }
      const stacks = decodeStacks(key);
      if (stacks > 0) {
        const lastCritFrame = decodeFrame(key);
        if (lastCritFrame >= 0 && absoluteFrame - lastCritFrame > dur) {
          newMap.set(zeroKey, (newMap.get(zeroKey) ?? 0) + prob);
          this._pruneKeys[pruneIdx++] = key;
        }
      }
    });
    for (let i = 0; i < pruneIdx; i++) newMap.delete(this._pruneKeys[i]);

    // Swap buffers instead of allocating
    this.swapMap = this.stateMap;
    this.stateMap = newMap;
    this.cachedDist = undefined;
  }

  getDistribution(): number[] {
    if (this.cachedDist) return this.cachedDist;
    const dist = new Array<number>(this.cap + 1).fill(0);
    this.stateMap.forEach((prob, key) => {
      dist[decodeStacks(key)] += prob;
    });
    this.cachedDist = dist;
    return dist;
  }
}

// ── Type 3: FIFO / Poisson Binomial ─────────────────────────────────────────

/**
 * Independent per-stack timer model. Active stacks = number of crits within
 * the sliding duration window. Computed as a Poisson binomial distribution.
 */
class FifoModel implements StatusModel {
  readonly modelType = ModelType.FIFO;

  /** History of (absoluteFrame, E(T)) for frames within the duration window. */
  private history: { frame: number; eCrit: number }[] = [];
  /** Start index into history (avoids O(n) shift). */
  private startIdx = 0;
  private cachedDist: number[] | undefined;

  constructor(readonly config: CritStatusConfig) {}

  /** Number of active entries in the sliding window. */
  private get length() { return this.history.length - this.startIdx; }

  step(absoluteFrame: number, eCrit: number): void {
    // Add current frame
    this.history.push({ frame: absoluteFrame, eCrit: Math.min(Math.max(eCrit, 0), 1) });

    // Prune expired entries by advancing startIdx
    const durationFrames = this.config.durationFrames;
    while (this.startIdx < this.history.length && absoluteFrame - this.history[this.startIdx].frame > durationFrames) {
      this.startIdx++;
    }

    // Compact when dead entries exceed half the array to prevent unbounded memory growth
    if (this.startIdx > this.history.length >> 1) {
      this.history = this.history.slice(this.startIdx);
      this.startIdx = 0;
    }

    this.cachedDist = undefined;
  }

  getDistribution(): number[] {
    if (this.cachedDist) return this.cachedDist;

    const cap = this.config.stackCap;
    const n = this.length;
    const startIdx = this.startIdx;

    // Cap-bounded Poisson binomial DP: O(n * cap) instead of O(n^2).
    // dp[k] = P(capped stacks = k). At k = cap, absorb all overflow
    // (both "was at cap, crit" and "was at cap, no crit" stay at cap).
    const dp = new Float64Array(cap + 1);
    dp[0] = 1.0;

    for (let i = startIdx; i < startIdx + n; i++) {
      const p = this.history[i].eCrit;
      const q = 1 - p;
      // k = cap: absorb overflow — P(stay at cap) + P(promoted from cap-1)
      dp[cap] = dp[cap] + (cap > 0 ? dp[cap - 1] * p : 0);
      // k < cap: standard recurrence (reverse order to avoid overwriting)
      for (let k = cap - 1; k >= 1; k--) {
        dp[k] = dp[k] * q + dp[k - 1] * p;
      }
      dp[0] *= q;
    }

    const dist = Array.from(dp) as number[];
    this.cachedDist = dist;
    return dist;
  }
}

// ── Type 1: Lifecycle Cycle Markov Chain ─────────────────────────────────────

/**
 * Lifecycle model: permanent stacks → threshold triggers timed buff → buff expires → consume all.
 * State = (stacks, buffTriggerFrame | null). During buff phase, crits don't add stacks.
 */
class LifecycleModel implements StatusModel {
  readonly modelType = ModelType.LIFECYCLE;

  private stateMap: Map<number, number>;
  private swapMap = new Map<number, number>();
  private readonly cap: number;
  private readonly buffDurationFrames: number;
  private cachedDist: number[] | undefined;
  private _pruneKeys = new Array<number>(64);

  constructor(readonly config: CritStatusConfig) {
    this.cap = config.stackCap;
    this.buffDurationFrames = config.lifecycle!.buffDurationFrames;
    this.stateMap = new Map<number, number>();
    this.stateMap.set(encodeKey(0, -1), 1.0);
  }

  step(absoluteFrame: number, eCrit: number): void {
    const newMap = this.swapMap;
    newMap.clear();
    const clampedE = Math.min(Math.max(eCrit, 0), 1);
    const cap = this.cap;
    const buffDur = this.buffDurationFrames;

    this.stateMap.forEach((prob, key) => {
      if (prob < 1e-15) return;
      const stacks = decodeStacks(key);
      const buffTrigger = decodeFrame(key);

      // Check buff expiry
      if (buffTrigger >= 0 && absoluteFrame - buffTrigger >= buffDur) {
        const resetKey = encodeKey(0, -1);
        newMap.set(resetKey, (newMap.get(resetKey) ?? 0) + prob);
        return;
      }

      if (buffTrigger >= 0) {
        const key2 = encodeKey(stacks, buffTrigger);
        newMap.set(key2, (newMap.get(key2) ?? 0) + prob);
        return;
      }

      // Ramping phase — crit adds a stack
      const critStacks = Math.min(stacks + 1, cap);

      if (critStacks >= cap) {
        const buffKey = encodeKey(cap, absoluteFrame);
        newMap.set(buffKey, (newMap.get(buffKey) ?? 0) + prob * clampedE);
      } else {
        const critKey = encodeKey(critStacks, -1);
        newMap.set(critKey, (newMap.get(critKey) ?? 0) + prob * clampedE);
      }

      const noCritKey = encodeKey(stacks, -1);
      newMap.set(noCritKey, (newMap.get(noCritKey) ?? 0) + prob * (1 - clampedE));
    });

    // Prune tiny probabilities
    let pruneIdx = 0;
    newMap.forEach((prob, key) => {
      if (prob < 1e-15) this._pruneKeys[pruneIdx++] = key;
    });
    for (let i = 0; i < pruneIdx; i++) newMap.delete(this._pruneKeys[i]);

    this.swapMap = this.stateMap;
    this.stateMap = newMap;
    this.cachedDist = undefined;
  }

  getDistribution(): number[] {
    if (this.cachedDist) return this.cachedDist;
    const dist = new Array<number>(this.cap + 1).fill(0);
    this.stateMap.forEach((prob, key) => {
      dist[decodeStacks(key)] += prob;
    });
    this.cachedDist = dist;
    return dist;
  }

  getBuffProbability(): number {
    let buffProb = 0;
    this.stateMap.forEach((prob, key) => {
      if (decodeFrame(key) >= 0) buffProb += prob;
    });
    return buffProb;
  }
}

// ── Model factory ────────────────────────────────────────────────────────────

function createModel(config: CritStatusConfig): StatusModel {
  const type = classifyModelType(config);
  switch (type) {
    case ModelType.LIFECYCLE: return new LifecycleModel(config);
    case ModelType.SHARED_TIMER: return new SharedTimerModel(config);
    case ModelType.FIFO: return new FifoModel(config);
  }
}

// ── CritExpectationModel (orchestrator) ──────────────────────────────────────

/**
 * Orchestrates all crit-dependent status models for a single operator.
 * Call step() at each damage frame to advance the model and get a snapshot.
 */
export class CritExpectationModel {
  private feedbackModels: StatusModel[] = [];
  private dependentModels: StatusModel[] = [];
  /** Cached concatenation of feedback + dependent models, invalidated on addModel. */
  private _allModels: StatusModel[] | undefined;
  private readonly baseCritRate: number;
  private lastE: number;

  constructor(baseCritRate: number) {
    this.baseCritRate = baseCritRate;
    this.lastE = baseCritRate;
  }

  private get allModels(): StatusModel[] {
    if (!this._allModels) {
      this._allModels = [...this.feedbackModels, ...this.dependentModels];
    }
    return this._allModels;
  }

  /** Add a status model. Feedback models contribute to E_total; dependent models only consume it. */
  addModel(model: StatusModel): void {
    if (model.config.isFeedback) {
      this.feedbackModels.push(model);
    } else {
      this.dependentModels.push(model);
    }
    this._allModels = undefined;
  }

  /** Whether this model has any crit-dependent statuses registered. */
  get hasModels(): boolean {
    return this.feedbackModels.length > 0 || this.dependentModels.length > 0;
  }

  /** Get full stat values (max stacks for all statuses) without stepping the model. */
  getFullStatValues(): Partial<Record<StatType, number>> {
    const full: Partial<Record<StatType, number>> = {};
    const allModels = this.allModels;
    for (const model of allModels) {
      for (const ps of model.config.perStackStats) {
        full[ps.stat] = (full[ps.stat] ?? 0) + model.config.stackCap * ps.valuePerStack;
      }
      for (const ts of model.config.thresholdStats) {
        full[ts.stat] = (full[ts.stat] ?? 0) + ts.value;
      }
    }
    return full;
  }

  /**
   * Step the model forward to a damage frame at the given absolute frame.
   * @param overrideE — Force the crit rate for this step (e.g. 1.0 for ALWAYS, 0.0 for NEVER).
   *   When provided, bypasses the feedback loop and uses this value directly.
   * Returns a snapshot of the expected crit state at this frame.
   */
  step(absoluteFrame: number, overrideE?: number): CritFrameSnapshot {
    const ePrev = overrideE ?? this.lastE;

    // ── Snapshot BEFORE advancing ───────────────────────────────────────────
    // The crit trigger fires AFTER the damage frame, so the snapshot must
    // reflect the state that existed when damage was dealt — before this
    // frame's crit updates the stack distributions.

    // Compute E_total from current (pre-step) feedback distributions
    const critSources: CritSource[] = [
      { label: 'Base', value: this.baseCritRate },
    ];
    let eTotal = this.baseCritRate;

    for (const model of this.feedbackModels) {
      const dist = model.getDistribution();
      for (const ts of model.config.thresholdStats) {
        if (ts.stat !== StatType.CRITICAL_RATE) continue;
        const prob = ts.atStacks <= dist.length - 1 ? dist[ts.atStacks] : 0;
        const contribution = prob * ts.value;
        eTotal += contribution;
        if (prob > 1e-6) {
          // Disambiguate from the same status's per-stack / always-on sources
          // when the status also provides a non-threshold crit-rate bonus
          // (e.g. MI Security: 3-piece passive +5% AND at-max-stacks +5%).
          const baseLabel = ts.label ?? model.config.label;
          const displayLabel = ts.label
            ? baseLabel
            : ts.atStacks === model.config.stackCap
              ? `${baseLabel} (Max Stacks)`
              : `${baseLabel} (${ts.atStacks} Stacks)`;
          critSources.push({
            label: displayLabel,
            statusId: model.config.statusId,
            value: ts.value,
            probability: prob,
            thresholdStacks: ts.atStacks,
          });
        }
      }
    }

    eTotal = Math.min(Math.max(eTotal, 0), 1);
    // When overrideE is provided, use it as the output E as well (deterministic modes)
    this.lastE = overrideE ?? eTotal;

    // Collect distributions, expected stat deltas, full (ALWAYS) stat values, and per-status contributions
    const statusDistributions = new Map<string, number[]>();
    const expectedStatDeltas: Partial<Record<StatType, number>> = {};
    const fullStatValues: Partial<Record<StatType, number>> = {};
    const statContributions: StatusStatContribution[] = [];
    const allModels = this.allModels;

    for (const model of allModels) {
      const dist = model.getDistribution();
      statusDistributions.set(model.config.statusId, dist);

      // Expected stack count for per-stack contributions: E[stacks] = Σ P(s) × s
      let expectedStacks = 0;
      for (let s = 1; s < dist.length; s++) {
        expectedStacks += dist[s] * s;
      }

      // Uptime: P(stacks > 0)
      const uptime = 1 - dist[0];

      // Per-stack stat contributions
      for (const ps of model.config.perStackStats) {
        // Expected: E[bonus] = Σ P(s) × s × valuePerStack
        let expected = 0;
        for (let s = 1; s < dist.length; s++) {
          expected += dist[s] * s * ps.valuePerStack;
        }
        expectedStatDeltas[ps.stat] = (expectedStatDeltas[ps.stat] ?? 0) + expected;
        // Full (ALWAYS): cap × valuePerStack
        fullStatValues[ps.stat] = (fullStatValues[ps.stat] ?? 0) + model.config.stackCap * ps.valuePerStack;

        statContributions.push({
          label: model.config.label,
          statusId: model.config.statusId,
          stat: ps.stat,
          expectedStacks,
          valuePerStack: ps.valuePerStack,
          total: expected,
          uptime,
        });
      }

      // Threshold stat contributions
      for (const ts of model.config.thresholdStats) {
        // Expected: P(threshold reached) × value
        let prob: number;
        if (model.modelType === ModelType.LIFECYCLE && model.getBuffProbability) {
          prob = model.getBuffProbability();
        } else {
          prob = ts.atStacks <= dist.length - 1 ? dist[ts.atStacks] : 0;
        }
        expectedStatDeltas[ts.stat] = (expectedStatDeltas[ts.stat] ?? 0) + prob * ts.value;
        // Full (ALWAYS): threshold always met
        fullStatValues[ts.stat] = (fullStatValues[ts.stat] ?? 0) + ts.value;

        statContributions.push({
          label: ts.label ?? model.config.label,
          statusId: model.config.statusId,
          stat: ts.stat,
          expectedStacks: 0,
          valuePerStack: 0,
          total: prob * ts.value,
          uptime,
          threshold: { atStacks: ts.atStacks, probability: prob },
        });
      }
    }

    // ── Advance models AFTER snapshot ───────────────────────────────────────
    // Crit trigger fires after damage — stack distributions advance now,
    // so the next frame sees the updated state.

    for (const model of this.feedbackModels) {
      model.step(absoluteFrame, ePrev);
    }
    for (const model of this.dependentModels) {
      model.step(absoluteFrame, ePrev);
    }

    return {
      expectedCritRate: eTotal,
      critSources,
      statusDistributions,
      expectedStatDeltas,
      fullStatValues,
      statContributions,
    };
  }
}

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build a CritExpectationModel for an operator by discovering all crit-triggered
 * statuses from the TriggerIndex.
 *
 * @param triggerIndex - The built trigger index
 * @param slotId - The operator's slot ID
 * @param baseCritRate - The operator's base crit rate (from loadout stats)
 * @param skillLevel - Weapon/gear skill level for value resolution
 * @returns A CritExpectationModel, or undefined if no crit-triggered statuses found
 */
export function buildCritExpectationModel(
  triggerIndex: TriggerIndex,
  slotId: string,
  baseCritRate: number,
  skillLevel = 1,
): CritExpectationModel | undefined {
  const triggerKey = `${VerbType.PERFORM}:${NounType.CRITICAL_HIT}`;
  const entries = triggerIndex.lookup(triggerKey);

  const model = new CritExpectationModel(baseCritRate);
  let found = false;

  for (const entry of entries) {
    // Only process entries for this operator's slot
    if (entry.operatorSlotId !== slotId) continue;

    const config = extractStatusConfig(entry, skillLevel);
    if (!config) continue;

    const statusModel = createModel(config);
    model.addModel(statusModel);
    found = true;
  }

  return found ? model : undefined;
}

// ── Expectation utilities ────────────────────────────────────────────────────

/**
 * Get the crit expectation multiplier for a damage frame.
 * Returns 0..1: the probability of critting (or binary 0/1 for deterministic modes).
 * Used as: critMultiplier = 1 + critDamage × getFrameExpectation(...)
 */
export function getFrameExpectation(
  critMode: CritMode,
  critSnapshot?: CritFrameSnapshot,
  frameCrit?: boolean,
  baseCritRate = 0,
): number {
  switch (critMode) {
    case CritMode.NEVER:      return 0;
    case CritMode.ALWAYS:     return 1;
    case CritMode.EXPECTED:   return critSnapshot?.expectedCritRate ?? baseCritRate;
    case CritMode.MANUAL:     return frameCrit ? 1 : 0;
  }
}

/**
 * Get the uptime expectation for a specific crit-dependent status.
 * Returns 0..1: the probability the status has any stacks (or binary for deterministic modes).
 */
export function getStatusExpectation(
  critMode: CritMode,
  critSnapshot: CritFrameSnapshot | undefined,
  statusId: string,
  frameCrit?: boolean,
): number {
  switch (critMode) {
    case CritMode.NEVER:      return 0;
    case CritMode.ALWAYS:     return 1;
    case CritMode.EXPECTED: {
      const dist = critSnapshot?.statusDistributions.get(statusId);
      return dist ? 1 - dist[0] : 1;
    }
    case CritMode.MANUAL:     return frameCrit ? 1 : 0;
  }
}

// ── Test helpers (exported for unit tests) ──────────────────────────────────

export { SharedTimerModel, FifoModel, LifecycleModel, createModel, classifyModelType };
export type { CritStatusConfig, StatusModel, ModelType };
