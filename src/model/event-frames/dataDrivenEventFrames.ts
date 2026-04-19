import { EventFrameType, SegmentType } from "../../consts/enums";
import { NounType, VerbType, DeterminerType, AdjectiveType, flattenQualifiedId } from "../../dsl/semantics";
import type { Effect, ValueNode } from "../../dsl/semantics";
import { resolveValueNode, DEFAULT_VALUE_CONTEXT, collapseConstantExpressions, type ValueResolutionContext } from "../../controller/calculation/valueResolver";
import { parseJsonClauseArray, findFirstEffectValue } from "../../controller/timeline/clauseQueries";
import {
  SkillEventFrame,
  FrameClausePredicate,
  FrameCondition,
} from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";

// ── JSON types (matching operator JSON DSL structure) ────────────────────────

interface JsonDuration {
  value: ValueNode;
  unit: string;
}

/** WITH preposition value: verb determines value shape (IS = single, VARY_BY = array by level/potential). */
interface JsonWithValue {
  verb?: string; // "IS" | "VARY_BY"
  object?: string;
  value?: number | number[];
  /** ValueExpression fields (operation + left/right). */
  operation?: string;
  left?: JsonWithValue;
  right?: JsonWithValue;
  of?: { determiner?: string; object: string };
}

/** DSL Effect: Verb-Object with optional object qualifier and prepositional phrases. */
interface JsonEffect {
  verb: string;
  object?: string;
  objectId?: string;
  objectType?: string;
  objectQualifier?: string;
  objectDeterminer?: string;
  toDeterminer?: string;
  to?: string;
  fromDeterminer?: string;
  from?: string;
  onObject?: string;
  /** WITH — properties (duration, stacks, value, multiplier, etc.). */
  with?: Record<string, JsonWithValue>;
  /** Constraint on cardinality (for compound ALL/ANY grouping). */
  cardinalityConstraint?: string;
  /** Value for compound constraints. */
  value?: unknown;
  eventName?: string;
  susceptibility?: Record<string, number[]>;
  stackingInteraction?: string;
  segments?: { name: string; duration: number; susceptibility?: Record<string, number[]> }[];
  conversion?: { object: string; objectId?: string };
  conditions?: { enemiesHitThreshold: number };
  /** Nested effects for compound verbs (ALL/ANY). */
  effects?: JsonEffect[];
  /** For CONSUME REACTION: status to apply if the reaction is successfully consumed. */
  applyOnConsume?: {
    status: string;
    target: string;
    durationSeconds: number;
    eventName?: string;
    susceptibility?: Record<string, number[]>;
  };
}

/** A clause predicate in JSON: conditions → effects. */
interface JsonClausePredicate {
  conditions: JsonClauseCondition[];
  effects: JsonEffect[];
}

interface JsonClauseCondition {
  subjectDeterminer?: string;
  subject: string;
  verb: string;
  negated?: boolean;
  objectQualifier?: string;
  object?: string;
  objectId?: string;
  objectDeterminer?: string;
  cardinalityConstraint?: string;
  value?: unknown;
  with?: Record<string, unknown>;
  of?: import('../../dsl/semantics').OfClause;
}

interface JsonOffset {
  value: number;
  unit: string;
}

interface JsonFrame {
  metadata?: { eventComponentType?: string; dataSources?: string[] };
  properties?: {
    offset?: JsonOffset;
    element?: string;
    dependencyTypes?: string[];
    /**
     * Tags this frame as a particular variant (FINAL_STRIKE, FINISHER, DIVE).
     * Lives in `properties` alongside the other frame metadata fields
     * (offset/element/dependencyTypes) for consistency.
     */
    frameTypes?: string[];
    suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
  };
  clause?: JsonClausePredicate[];
  clauseType?: string;
  damageElement?: string;
}

interface JsonSegment {
  metadata?: { eventComponentType?: string; dataSources?: string[] };
  properties: { segmentTypes?: string[]; duration?: JsonDuration; name?: string; element?: string; delayedHitLabel?: string; timeDependency?: string; timeInteractionType?: string; suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]> };
  clause?: { conditions: JsonClauseCondition[]; effects: { verb: string; objectQualifier?: string; object: string; toDeterminer?: string; to?: string }[] }[];
  frames: JsonFrame[];
}

interface JsonSkillCategory {
  name?: string;
  description?: string;
  properties?: {
    duration?: JsonDuration;
    trigger?: unknown;
    hasDelayedHit?: boolean;
    delayedHitLabel?: string;
    enhancementTypes?: string[];
    dependencyTypes?: string[];
    suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
  };
  clause?: JsonClausePredicate[];
  frames?: JsonFrame[];
  segments?: JsonSegment[];
  dataSources?: string[];
}

// ── Skill-level clause queries ──────────────────────────────────────────
//
// Loader-time scalar metadata queries (cooldowns, SP costs, energy costs)
// use the same clause-walking API as runtime frame consumers. Raw JSON
// clause predicates are wrapped into `FrameClausePredicate[]` via
// `parseJsonClauseArray` and queried via `findFirstEffectValue`. This
// replaces the previous local `flattenClauseEffects` / `findEffectValue` /
// `withValue` helpers that walked raw JSON directly — one query API now.

/** Find a value from a skill category's parsed clause effects (searches all segments). */
function findSkillValue(
  category: JsonSkillCategory | undefined,
  object: string,
  verb: string,
  target?: string,
  ctx?: ValueResolutionContext,
): number | undefined {
  const segments = (category?.segments as { clause?: unknown[] }[] | undefined) ?? [];
  const allClauses = segments.flatMap(s => Array.isArray(s.clause) ? s.clause : []);
  if (allClauses.length === 0) return undefined;
  const parsed = parseJsonClauseArray(allClauses as Parameters<typeof parseJsonClauseArray>[0]);
  return findFirstEffectValue(parsed, verb, object, target, ctx);
}

// ── DataDrivenSkillEventFrame ───────────────────────────────────────────────

export class DataDrivenSkillEventFrame extends SkillEventFrame {
  private readonly _offsetSeconds: number;
  private readonly _damageElement: string | null;
  private readonly _duplicateTriggerSource: boolean;
  private readonly _clauses: readonly FrameClausePredicate[];
  private readonly _clauseType: string | undefined;
  private readonly _hasConditionalClauses: boolean;
  private readonly _dependencyTypes: readonly string[];
  private readonly _frameTypes: readonly EventFrameType[];
  private readonly _suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;

  constructor(frame: JsonFrame) {
    super();
    this._offsetSeconds = frame.properties!.offset!.value;
    this._damageElement = frame.properties?.element ?? frame.damageElement ?? null;
    if (frame.properties?.suppliedParameters) this._suppliedParameters = frame.properties.suppliedParameters;
    let duplicateSource = false;
    const frameTypes: EventFrameType[] = [];


    // ── Clause parsing ─────────────────────────────────────────────────────
    const clauses: FrameClausePredicate[] = [];

    for (const pred of (frame.clause ?? [])) {
      const conditions: FrameCondition[] = (pred.conditions ?? []).map(c => {
        const isNegatedVerb = typeof c.verb === 'string' && c.verb.startsWith('NOT_');
        const normalizedVerb = isNegatedVerb ? c.verb.slice(4) : c.verb;
        return {
          ...(c.subjectDeterminer && { subjectDeterminer: c.subjectDeterminer }),
          subject: c.subject,
          verb: normalizedVerb,
          ...(((c.negated != null && c.negated) || isNegatedVerb) && { negated: true }),
          ...(c.objectQualifier && { objectQualifier: c.objectQualifier }),
          ...(c.object && { object: c.object }),
          ...(c.objectId && { objectId: c.objectId }),
          ...(c.objectDeterminer && { objectDeterminer: c.objectDeterminer }),
          ...(c.cardinalityConstraint && { cardinalityConstraint: c.cardinalityConstraint }),
          ...(c.value != null && { value: c.value }),
          ...(c.with && { with: c.with }),
          ...(c.of && { of: c.of }),
        };
      });

      const clauseEffects: Effect[] = [];
      for (const ef of pred.effects) {
        const isSource = ef.objectDeterminer === DeterminerType.TRIGGER;

        // ── Parse-time side effects that don't produce a DSL clause ───────
        // These verbs collect metadata during parse and do NOT push a clause
        // effect — the interpreter reads the flags/frameTypes directly.
        if (ef.verb === VerbType.APPLY && isSource && ef.object === NounType.STATUS) {
          // `OF TRIGGER` marker — the frame mirrors the triggering source's
          // infliction/status onto the owner at runtime via duplicateTriggerSource.
          duplicateSource = true;
          continue;
        }
        if (ef.verb === VerbType.PERFORM) {
          // PERFORM FINAL_STRIKE / FINISHER / DIVE marks the frame type for
          // downstream finisher/final-strike gating; no runtime effect to dispatch.
          const PERFORM_TO_FRAME_TYPE: Record<string, EventFrameType> = {
            [NounType.FINAL_STRIKE]: EventFrameType.FINAL_STRIKE,
            [NounType.FINISHER]: EventFrameType.FINISHER,
            [NounType.DIVE]: EventFrameType.DIVE,
          };
          const skillKey = ef.object === NounType.SKILL ? (ef.objectId ?? '') : (ef.object ?? '');
          const ft = PERFORM_TO_FRAME_TYPE[skillKey];
          if (ft && !frameTypes.includes(ft)) frameTypes.push(ft);
          continue;
        }
        // ── Known-unsupported cases dropped explicitly (not silently) ─────
        if (ef.verb === VerbType.CONSUME && ef.object === NounType.STATUS && ef.objectId === NounType.INFLICTION && ef.conversion) {
          // Absorb/exchange conversion — no engine handler yet.
          continue;
        }

        // ── Shape normalization: legacy `objectType: STATUS` JSON shape ──
        const normalizedEffect = (ef.verb === VerbType.APPLY || ef.verb === VerbType.CONSUME)
            && ef.objectType === NounType.STATUS && ef.object !== NounType.STATUS
          ? { ...ef, object: NounType.STATUS, objectId: ef.object } as unknown as Effect
          : ef as unknown as Effect;

        // Default: pass through to interpret() at runtime. Any verb/object
        // the interpreter understands (APPLY STAT / WEAKNESS / SLOW / SHIELD,
        // DEAL * , RECOVER * , RETURN *, EXTEND, REDUCE, RESET, IGNORE,
        // DISABLE, ENABLE, compound CHANCE/ALL/ANY, …) works at frame level
        // without a parse-time allowlist. Unknown verbs fall through to
        // interpret()'s default case and are harmlessly no-oped.
        clauseEffects.push(normalizedEffect);
      }
      // ── Parse-time optimizations ──────────────────────────────────────────
      // 1. Collapse constant ValueNode expressions in effect WITH blocks
      // 2. Pre-compose qualified status IDs (objectQualifier + objectId → flat ID)
      for (const dsl of clauseEffects) {
        // (1) Collapse constant expressions in WITH properties
        if (dsl.with) {
          const w = dsl.with as Record<string, ValueNode>;
          for (const key of Object.keys(w)) {
            if (w[key] != null) {
              w[key] = collapseConstantExpressions(w[key]) as ValueNode;
            }
          }
        }
        // Also collapse the top-level `value` if it's a ValueNode expression
        if (dsl.value != null && typeof dsl.value === 'object' && 'operation' in (dsl.value as object)) {
          (dsl as { value: ValueNode }).value = collapseConstantExpressions(dsl.value as ValueNode);
        }
        // (2) Pre-compose qualified status IDs at parse time
        // Caches the flattened qualifier+objectId so the interpreter can skip
        // the runtime flattenQualifiedId call. Keeps objectQualifier intact for
        // other consumers (column resolution, susceptibility handling, etc.).
        if (dsl.object === NounType.STATUS && dsl.objectId && dsl.objectQualifier
            && dsl.objectId !== NounType.INFLICTION
            && dsl.objectId !== NounType.REACTION
            && dsl.objectId !== AdjectiveType.PHYSICAL) {
          (dsl as { _composedQualifiedId?: string })._composedQualifiedId =
            flattenQualifiedId(dsl.objectQualifier as string, dsl.objectId);
        }
      }

      clauses.push({ conditions, effects: clauseEffects });
    }

    this._clauses = clauses;
    this._clauseType = frame.clauseType;
    // (3) Pre-compute whether any clause has conditions for fast-path in interpreter
    this._hasConditionalClauses = clauses.some(p => p.conditions.length > 0);
    this._duplicateTriggerSource = duplicateSource;
    this._dependencyTypes = (frame.properties?.dependencyTypes ?? []) as string[];
    // Merge explicit frameTypes from JSON (e.g. "frameTypes": ["DIVE"]) with
    // clause-derived ones. The canonical location is `frame.properties.frameTypes`
    // (alongside offset/element). The legacy top-level `frame.frameTypes` is also
    // accepted for backwards compatibility but should be migrated.
    const explicitFrameTypes = (frame.properties?.frameTypes
      ?? (frame as { frameTypes?: string[] }).frameTypes) as EventFrameType[] | undefined;
    if (explicitFrameTypes) {
      for (const ft of explicitFrameTypes) {
        if (!frameTypes.includes(ft)) frameTypes.push(ft);
      }
    }
    this._frameTypes = frameTypes;
  }

  getOffsetSeconds(): number { return this._offsetSeconds; }
  getDamageElement(): string | null { return this._damageElement; }
  getDuplicateTriggerSource(): boolean { return this._duplicateTriggerSource; }
  getClauses(): readonly FrameClausePredicate[] { return this._clauses; }
  getClauseType(): string | undefined { return this._clauseType; }
  /** True if any clause has conditions; false = all clauses are unconditional (skip filterClauses). */
  getHasConditionalClauses(): boolean { return this._hasConditionalClauses; }
  getDependencyTypes(): readonly string[] { return this._dependencyTypes; }
  getFrameTypes(): readonly EventFrameType[] { return this._frameTypes; }
  getSuppliedParameters(): Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]> | undefined { return this._suppliedParameters; }
}

// ── DataDrivenSkillEventSequence ────────────────────────────────────────────

export class DataDrivenSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _durationNode: ValueNode | null;
  private readonly _frames: readonly DataDrivenSkillEventFrame[];
  readonly segmentName?: string;
  readonly segmentElement?: string;
  readonly segmentTypes?: string[];
  readonly timeDependency?: string;
  readonly timeInteractionType?: string;
  readonly delayedHitLabel?: string;
  readonly suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
  readonly clause?: { effects: { verb: string; object: string; toDeterminer?: string; to?: string }[] }[];

  constructor(segment: JsonSegment) {
    super();
    this._durationNode = segment.properties?.duration?.value ?? null;
    this._durationSeconds = resolveDur(segment.properties!.duration!);
    this._frames = segment.frames.map(f => new DataDrivenSkillEventFrame(f));
    this.segmentName = segment.properties?.name;
    this.segmentElement = segment.properties?.element;
    this.segmentTypes = segment.properties.segmentTypes;
    if (segment.properties?.delayedHitLabel) this.delayedHitLabel = segment.properties.delayedHitLabel;
    this.timeDependency = segment.properties?.timeDependency;
    this.timeInteractionType = segment.properties?.timeInteractionType;
    if (segment.properties?.suppliedParameters) this.suppliedParameters = segment.properties.suppliedParameters;
    this.clause = segment.clause;
  }

  getDurationSeconds(): number { return this._durationSeconds; }

  /** True if the duration depends on runtime event state (e.g. STACKS of LINK of EVENT). */
  hasRuntimeConditionalDuration(): boolean {
    if (!this._durationNode || typeof this._durationNode !== 'object') return false;
    // Recursively check if any node in the expression references EVENT stacks
    const check = (n: unknown): boolean => {
      if (!n || typeof n !== 'object') return false;
      const obj = n as Record<string, unknown>;
      if (obj.object === NounType.STACKS && (obj.of as Record<string, unknown>)?.object === NounType.EVENT) return true;
      return check(obj.left) || check(obj.right);
    };
    return check(this._durationNode);
  }

  getDurationSecondsWithContext(ctx?: ValueResolutionContext): number {
    if (!ctx || !this._durationNode) return this._durationSeconds;
    return resolveValueNode(this._durationNode, ctx);
  }

  getFrames(): readonly DataDrivenSkillEventFrame[] { return this._frames; }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Build SkillEventSequence[] from an operator JSON skill category.
 * Handles both shapes: segments[] (basic attacks, multi-part) and flat duration+frames (single-part).
 */
export function buildSequencesFromSkillCategory(
  skillCategory: JsonSkillCategory,
): readonly DataDrivenSkillEventSequence[] {
  if (skillCategory.segments) {
    return skillCategory.segments
      .filter(seg => {
        const dur = seg.properties!.duration!;
        // Preserve segments with runtime-conditional durations (e.g. STACKS of LINK of EVENT)
        // even if they resolve to 0 at build time — they are re-resolved during queue processing.
        const seq = new DataDrivenSkillEventSequence(seg);
        if (seq.hasRuntimeConditionalDuration()) return true;
        return resolveDur(dur) > 0;
      })
      .map(seg => new DataDrivenSkillEventSequence(seg));
  }

  // Flat shape: wrap duration + frames into a single segment
  if (skillCategory.properties?.duration && skillCategory.frames) {
    const segment: JsonSegment = {
      properties: { duration: skillCategory.properties.duration },
      frames: skillCategory.frames,
    };
    return [new DataDrivenSkillEventSequence(segment)];
  }

  return [];
}

/**
 * Build sequences for a given skill category from an operator JSON.
 * All skill data lives in the skills JSON — no operator-level overrides.
 */
export function buildSequencesFromOperatorJson(
  operatorJson: Record<string, unknown>,
  skillCategoryKey: string,
): readonly DataDrivenSkillEventSequence[] {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory> | undefined;
  if (!skills) return [];
  // Skills are aliased by category/sub-type key in buildMergedOperatorJson — direct access
  const cat = skills[skillCategoryKey];
  if (!cat) return [];
  return buildSequencesFromSkillCategory(cat);
}

// ── Timing extraction (from operator JSON) ──────────────────────────────────

function dur(seconds: number): number { return Math.round(seconds * 120); }

/** Resolve a JsonDuration's ValueNode to seconds. */
function resolveDur(d?: JsonDuration, ctx?: ValueResolutionContext): number {
  if (!d) return 0;
  return resolveValueNode(d.value, ctx ?? DEFAULT_VALUE_CONTEXT);
}

/** Get duration from a skill category. */
function catDuration(cat?: JsonSkillCategory, ctx?: ValueResolutionContext): number {
  return resolveDur(cat?.properties?.duration, ctx);
}

/** Get animation duration from a skill category's ANIMATION segment. */
function catAnimationDur(cat?: JsonSkillCategory, ctx?: ValueResolutionContext): number {
  if (!cat?.segments) return 0;
  const animSeg = cat.segments.find(s => s.properties.segmentTypes?.includes(SegmentType.ANIMATION));
  return resolveDur(animSeg?.properties?.duration, ctx);
}

export interface SkillTimings {
  battleDur: number;
  comboDur: number;
  comboCd: number;
  comboAnimDur: number;
  ultDur: number;
  ultAnimDur: number;
  ultCd: number;
}

export function getSkillTimings(operatorJson: Record<string, unknown>, ctx?: ValueResolutionContext): SkillTimings {
  const skills = (operatorJson.skills ?? {}) as Record<string, JsonSkillCategory>;

  // Battle skill duration
  const battleSkill = skills[NounType.BATTLE];
  const battleDur = dur(catDuration(battleSkill, ctx));

  // Combo skill
  const comboSkill = skills[NounType.COMBO];
  // Duration: prefer top-level property, fall back to sum of non-cooldown segments
  const comboTopDur = catDuration(comboSkill, ctx);
  const comboDur = dur(comboTopDur || ((comboSkill?.segments as JsonSegment[] | undefined)
    ?.filter(s => !s.properties.segmentTypes?.includes(SegmentType.COOLDOWN))
    .reduce((sum, s) => sum + resolveDur(s.properties?.duration, ctx), 0) ?? 0));
  const comboCdFromClause = findSkillValue(comboSkill, NounType.COOLDOWN, VerbType.CONSUME, undefined, ctx);
  const comboCdSeg = (comboSkill?.segments as JsonSegment[] | undefined)
    ?.find(s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN));
  const comboCdFromSegment = comboCdSeg?.properties?.duration
    ? resolveDur(comboCdSeg.properties.duration, ctx)
    : undefined;
  const comboCd = dur(comboCdFromClause ?? comboCdFromSegment ?? 0);
  const comboAnimDur = dur(catAnimationDur(comboSkill, ctx) || 0.5);

  // Ultimate — read from flat properties or derive from typed segments
  const ultimate = skills[NounType.ULTIMATE];
  const ultSegs = (ultimate?.segments as JsonSegment[] | undefined)?.filter(
    s => s.properties.segmentTypes?.length,
  );
  let ultTotalDur: number;
  let ultAnimDur: number;
  let ultCdFrames: number;
  if (ultSegs?.length) {
    // Data-driven: derive timings from typed segments
    const segDur = (type: string) => {
      const s = ultSegs.find(seg => seg.properties.segmentTypes?.includes(type));
      return s ? dur(resolveDur(s.properties?.duration, ctx)) : 0;
    };
    ultAnimDur = segDur(SegmentType.ANIMATION);
    ultTotalDur = ultAnimDur + segDur(SegmentType.STASIS);
    ultCdFrames = segDur(SegmentType.COOLDOWN);
  } else {
    ultTotalDur = dur(catDuration(ultimate, ctx));
    const ultAnimRaw = catAnimationDur(ultimate, ctx);
    ultAnimDur = ultAnimRaw > 0 ? dur(ultAnimRaw) : ultTotalDur;
    const ultCdRaw = findSkillValue(ultimate, NounType.COOLDOWN, VerbType.CONSUME, undefined, ctx);
    ultCdFrames = ultCdRaw != null ? dur(ultCdRaw) : 0;
  }

  return {
    battleDur,
    comboDur,
    comboCd,
    comboAnimDur,
    ultDur: ultTotalDur,
    ultAnimDur,
    ultCd: ultCdFrames,
  };
}

export function getUltimateEnergyCost(operatorJson: Record<string, unknown>, ctx?: ValueResolutionContext): number {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const ultimate = skills?.[NounType.ULTIMATE];
  return findSkillValue(ultimate, NounType.ULTIMATE_ENERGY, VerbType.CONSUME, undefined, ctx) ?? 0;
}

/** Extract the SP cost for battle skill from merged operator JSON (skills keyed by skill ID). */
export function getBattleSkillSpCost(operatorJson: Record<string, unknown>, ctx?: ValueResolutionContext): number {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory> | undefined;
  const battleSkillId = NounType.BATTLE;
  return findSkillValue(skills?.[battleSkillId], NounType.SKILL_POINT, VerbType.CONSUME, undefined, ctx) ?? 0;
}

/**
 * Get the durations of basic attack segments from operator JSON.
 * Returns an array of duration values in seconds.
 */
export function getBasicAttackDurations(operatorJson: Record<string, unknown>, ctx?: ValueResolutionContext): number[] {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  // BATK is aliased to skills[BATK] by buildMergedOperatorJson; also try BASIC_ATTACK key
  const basicAttack = skills?.[NounType.BATK] ?? skills?.[NounType.BASIC_ATTACK];
  if (!basicAttack?.segments) return [];
  return basicAttack.segments.map(seg => resolveDur(seg.properties!.duration!, ctx));
}
