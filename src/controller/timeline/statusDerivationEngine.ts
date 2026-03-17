/**
 * Generic status derivation engine.
 *
 * Evaluates `statusEvents` from operator JSONs against timeline state,
 * producing derived TimelineEvent instances. Replaces hardcoded derive*
 * functions in processStatus.ts one at a time.
 *
 * Supports:
 * - Empty triggerClause (passive/talent buffs, e.g. Messenger's Song)
 * - PERFORM triggers (skill-cast-based, e.g. Scorching Heart via Melting Flame)
 * - HAVE STATUS triggers (reaction-based, e.g. Scorching Fangs on Combustion)
 * - Compound triggers (PERFORM X while ENEMY HAVE Y, e.g. Wildland Trekker)
 * - Stack threshold clauses (at max stacks → apply derived status)
 * - Stack interaction types: NONE (independent), RESET (refresh earlier)
 */
import { TimelineEvent, EventSegmentData } from '../../consts/viewTypes';
import { CombatSkillsType, EventStatusType } from '../../consts/enums';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { ENEMY_OWNER_ID, OPERATOR_COLUMNS, REACTION_COLUMNS, SKILL_COLUMNS } from '../../model/channels';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { getOperatorJson, getSkillIds, getAllOperatorIds } from '../../model/event-frames/operatorJsonLoader';
import { getWeaponEffectDefs, getGearEffectDefs } from '../../model/game-data/weaponGearEffectLoader';
import { LoadoutProperties } from '../../view/InformationPane';
import { ELEMENT_TO_INFLICTION_COLUMN } from './processInfliction';
import { getFinalStrikeTriggerFrame } from './processComboSkill';
import { evaluateInteraction, evaluateConditions, ConditionContext } from './conditionEvaluator';
import { executeEffects, applyMutations } from './effectExecutor';
import type { ExecutionContext } from './effectExecutor';
import type { Interaction, Effect as SemanticEffect } from '../../consts/semantics';

// ── Types from JSON ─────────────────────────────────────────────────────────

interface StatusSegmentDef {
  name: string;
  properties?: { duration?: { value: number[]; unit: string } };
  clause?: EffectClause[];
}

interface StatusEventDef {
  name: string;
  type?: string;
  target: string;
  targetDeterminer?: string;
  element?: string;
  isNamedEvent?: boolean;
  stack: {
    verbType: string;
    max: Record<string, number>;
    instances: number;
  };
  triggerClause: TriggerClause[];
  clause?: EffectClause[];
  consumeClause?: EffectClause[];
  /** Effects that fire once when this status becomes active. */
  onActivationClause?: EffectClause[];
  /** Effects that fire each time a condition is newly met during this status's lifetime. */
  reactiveTriggerClause?: EffectClause[];
  duration?: { value: number[]; unit: string };
  properties?: { duration?: { value: number[]; unit: string } };
  stats?: unknown[];
  minTalentLevel?: { talent: number; minLevel: number };
  p3TeamShare?: { durationMultiplier: number };
  susceptibility?: Record<string, number[]>;
  /** Multi-phase segments (e.g. Antal Focus: 20s Focus + 40s Empowered Focus). */
  segments?: StatusSegmentDef[];
}

interface TriggerClause {
  conditions: Predicate[];
  effects?: TriggerEffect[];
}

interface EffectClause {
  conditions: Predicate[];
  effects: Effect[];
}

interface Predicate {
  subjectType: string;
  verbType: string;
  objectType?: string;
  objectId?: string;
  cardinalityConstraint?: string;
  cardinality?: number | string;
}

interface Effect {
  verbType: string;
  objectType: string;
  objectId?: string;
  prepositionType?: string;
  toObjectType?: string;
}

interface TriggerEffect {
  verbType: string;
  cardinalityConstraint?: string;
  cardinality?: number | string;
  effects?: TriggerSubEffect[];
}

interface TriggerSubEffect {
  verbType: string;
  cardinality?: number;
  objectType?: string;
  objectId?: string;
  element?: string;
  fromObjectType?: string;
  toObjectType?: string;
}

// ── Multi-dimensional BASED_ON resolver ──────────────────────────────────────

/**
 * Resolve a dimension key for a multi-dimensional BASED_ON lookup.
 * Finds the highest key whose numeric value ≤ the actual context value.
 */
function resolveClauseDimensionKey(
  dim: string,
  ctx: DeriveContext,
  def: StatusEventDef,
  keys: string[],
): string | undefined {
  if (dim === 'POTENTIAL') {
    let best: string | undefined;
    let bestN = -1;
    for (const k of keys) {
      const m = k.match(/^P(\d+)$/);
      if (!m) continue;
      const n = Number(m[1]);
      if (n <= ctx.potential && n > bestN) { bestN = n; best = k; }
    }
    return best;
  }
  if (dim === 'TALENT_LEVEL' || dim === 'INTELLECT') {
    const talentLevel = def.minTalentLevel?.talent === 2
      ? (ctx.loadoutProperties?.operator.talentTwoLevel ?? 0)
      : (ctx.loadoutProperties?.operator.talentOneLevel ?? 0);
    let best: string | undefined;
    let bestN = 0;
    for (const k of keys) {
      const n = Number(k);
      if (!isNaN(n) && n <= talentLevel && n > bestN) { bestN = n; best = k; }
    }
    return best;
  }
  if (dim === 'SKILL_LEVEL') {
    const sl = ctx.loadoutProperties?.skills.battleSkillLevel ?? 12;
    let best: string | undefined;
    let bestN = 0;
    for (const k of keys) {
      const n = Number(k);
      if (!isNaN(n) && n <= sl && n > bestN) { bestN = n; best = k; }
    }
    return best;
  }
  return undefined;
}

// ── Clause effect resolution ────────────────────────────────────────────────

/**
 * Resolve clause effects from a raw clauses array into timeline event properties.
 * Reads SUSCEPTIBILITY, DAMAGE_BONUS, and RESISTANCE effects from the clause structure.
 * Supports both short keys (verb, object, with) and legacy keys (verbType, objectType, withPreposition).
 *
 * When `skipConditional` is false, evaluates non-THIS_EVENT conditions and applies matching effects.
 */
function resolveClauseEffectsFromClauses(
  ev: TimelineEvent,
  clauses: { conditions: any[]; effects: Record<string, any>[] }[],
  ctx: DeriveContext,
  def: StatusEventDef,
  skipConditional = true,
): void {
  for (const clause of clauses) {
    if (clause.conditions && clause.conditions.length > 0) {
      if (skipConditional) {
        // Check if all conditions reference THIS_EVENT — those are threshold conditions
        // handled by evaluateThresholdClauses, so skip them here.
        const hasThisEvent = clause.conditions.some((c: any) => c.subjectType === 'THIS_EVENT');
        if (hasThisEvent) continue;

        // Non-THIS_EVENT conditions: evaluate them now
        const condCtx: ConditionContext = {
          events: ctx.events,
          frame: ev.startFrame,
          sourceOwnerId: ctx.operatorSlotId,
        };
        if (!evaluateConditions(clause.conditions as unknown as Interaction[], condCtx)) continue;
      } else {
        continue;
      }
    }
    if (!clause.effects) continue;

    for (const effect of clause.effects) {
      const verb = effect.verb ?? effect.verbType;
      const object = effect.object ?? effect.objectType;
      const adjective = effect.adjective;
      const withBlock = effect.with ?? effect.withPreposition;
      const wp = withBlock?.value;
      if (!wp) continue;

      const resolveValue = (): number | undefined => {
        if (wp.verb === 'IS' && typeof wp.value === 'number') return wp.value;
        if (wp.verb !== 'BASED_ON') return undefined;

        const dims = wp.object;
        const val = wp.value;

        // Single dimension: object is a string, value is a flat array
        if (typeof dims === 'string' && Array.isArray(val)) {
          const arr = val as number[];
          if (dims === 'SKILL_LEVEL') {
            const skillLevel = ctx.loadoutProperties?.skills.battleSkillLevel ?? 12;
            return arr[Math.min(skillLevel, arr.length) - 1] ?? arr[0];
          }
          if (dims === 'TALENT_LEVEL' || dims === 'INTELLECT') {
            const talentLevel = def.minTalentLevel?.talent === 2
              ? (ctx.loadoutProperties?.operator.talentTwoLevel ?? 0)
              : (ctx.loadoutProperties?.operator.talentOneLevel ?? 0);
            return arr[Math.min(talentLevel, arr.length) - 1] ?? arr[0];
          }
          return undefined;
        }

        // Multi-dimension: object is an array, value is a nested map
        if (Array.isArray(dims) && typeof val === 'object' && !Array.isArray(val)) {
          let current: any = val;
          for (const dim of dims as string[]) {
            if (typeof current !== 'object' || current === null) return undefined;
            const keys = Object.keys(current);
            const key = resolveClauseDimensionKey(dim, ctx, def, keys);
            if (!key) return undefined;
            current = current[key];
          }
          return typeof current === 'number' ? current : undefined;
        }

        return undefined;
      };

      if (verb === 'APPLY' && object === 'SUSCEPTIBILITY' && adjective) {
        const val = resolveValue();
        if (val != null) {
          if (!ev.susceptibility) ev.susceptibility = {};
          (ev.susceptibility as Record<string, number>)[adjective] = val;
        }
      }

      if (verb === 'APPLY' && object === 'DAMAGE_BONUS') {
        const val = resolveValue();
        if (val != null) ev.statusValue = val;
      }

      if (verb === 'IGNORE' && object === 'RESISTANCE') {
        const val = resolveValue();
        if (val != null) ev.statusValue = val;
      }
    }
  }
}

/**
 * Resolve clause effects into timeline event properties.
 * Delegates to resolveClauseEffectsFromClauses with the def's own clauses.
 */
function resolveClauseEffects(ev: TimelineEvent, def: StatusEventDef, ctx: DeriveContext): void {
  const clauses = def.clause as { conditions: any[]; effects: Record<string, any>[] }[] | undefined;
  if (!clauses) return;
  resolveClauseEffectsFromClauses(ev, clauses, ctx, def);
}

// ── Operator detection ──────────────────────────────────────────────────────

/** Find which slot owns a given operator by scanning events for their skill names. */
function findOperatorSlot(
  events: TimelineEvent[],
  operatorId: string,
): string | null {
  const skillNames = getSkillIds(operatorId);
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID) continue;
    if (skillNames.has(ev.name)) return ev.ownerId;
  }
  return null;
}

// ── Column ID mapping ───────────────────────────────────────────────────────

const REACTION_STATUS_TO_COLUMN: Record<string, string> = {
  COMBUSTION: REACTION_COLUMNS.COMBUSTION,
  SOLIDIFICATION: REACTION_COLUMNS.SOLIDIFICATION,
  CORROSION: REACTION_COLUMNS.CORROSION,
  ELECTRIFICATION: REACTION_COLUMNS.ELECTRIFICATION,
};

function statusNameToColumnId(name: string): string {
  return REACTION_STATUS_TO_COLUMN[name]
    ?? (OPERATOR_COLUMNS as Record<string, string>)[name]
    ?? name.toLowerCase().replace(/_/g, '-');
}

// ── Target resolution ───────────────────────────────────────────────────────

/**
 * Resolve a target string to an owner ID.
 * Supports: 'OPERATOR' (with determiner), 'ENEMY', and operator IDs
 * (e.g. 'LAEVATAIN') which are resolved via the operatorSlotMap.
 */
function resolveOwnerId(
  target: string,
  operatorSlotId: string,
  operatorSlotMap?: Record<string, string>,
  determiner?: string,
  targetOwnerId?: string,
): string {
  if (target === 'OPERATOR') {
    switch (determiner ?? 'THIS') {
      case 'THIS': return operatorSlotId;
      case 'ALL': return COMMON_OWNER_ID;
      case 'OTHER': return targetOwnerId ?? operatorSlotId;
      case 'ANY': return targetOwnerId ?? operatorSlotId;
      default: return operatorSlotId;
    }
  }
  switch (target) {
    case 'ENEMY': return ENEMY_OWNER_ID;
    default: {
      // Try to resolve as an operator ID (e.g. 'LAEVATAIN' → 'slot1')
      if (operatorSlotMap) {
        const slotId = operatorSlotMap[target.toLowerCase()];
        if (slotId) return slotId;
      }
      return operatorSlotId;
    }
  }
}

// ── Max stacks by potential ─────────────────────────────────────────────────

function getMaxStacks(stackMax: Record<string, number>, potential: number): number {
  const key = `P${potential}`;
  return stackMax[key] ?? stackMax.P0 ?? 1;
}

// ── Duration resolution ─────────────────────────────────────────────────────

function getDurationFrames(duration: { value: number[]; unit: string }): number {
  const val = duration.value[0];
  if (val < 0) return TOTAL_FRAMES; // -1 = permanent
  if (duration.unit === 'SECOND') return Math.round(val * 120);
  return val;
}

// ── Trigger evaluation ──────────────────────────────────────────────────────

interface TriggerMatch {
  frame: number;
  sourceOwnerId: string;
  sourceSkillName: string;
  effects?: TriggerEffect[];
}

interface AbsorbedInfliction {
  eventId: string;
  clampFrame: number;
  sourceOwnerId: string;
  sourceSkillName: string;
}

interface DeriveResult {
  derived: TimelineEvent[];
  absorbedInflictions: AbsorbedInfliction[];
}

/**
 * Evaluate a single predicate (condition) at a given frame using the shared condition evaluator.
 */
function checkPredicate(
  pred: Predicate,
  events: TimelineEvent[],
  operatorSlotId: string,
  candidateFrame: number,
): boolean {
  const ctx: ConditionContext = {
    events,
    frame: candidateFrame,
    sourceOwnerId: operatorSlotId,
  };
  return evaluateInteraction(pred as unknown as Interaction, ctx);
}

/**
 * Get the absolute frame of the first event frame tick in an event's segments.
 * Falls back to ev.startFrame if no segment frame data exists.
 */
function getFirstEventFrame(ev: TimelineEvent): number {
  if (ev.segments) {
    for (const seg of ev.segments) {
      if (seg.frames && seg.frames.length > 0) {
        return ev.startFrame + seg.frames[0].offsetFrame;
      }
    }
  }
  return ev.startFrame;
}

/**
 * Find all trigger matches for a status event definition.
 */
function findTriggerMatches(
  def: StatusEventDef,
  events: TimelineEvent[],
  operatorSlotId: string,
): TriggerMatch[] {
  const matches: TriggerMatch[] = [];

  // Empty triggerClause = no engine-created trigger.
  // Statuses with empty triggerClause are either:
  // - Talent/passive (handled by the TALENT type path, not here)
  // - Frame-created (APPLY STATUS from skill frames)
  // - Threshold-created (via another status's clause)
  // None of these should produce a passive trigger at frame 0.
  if (def.triggerClause.length === 0) {
    return matches;
  }

  for (const clause of def.triggerClause) {
    // Classify conditions
    const performConds = clause.conditions.filter(c => c.verbType === 'PERFORM');
    const haveConds = clause.conditions.filter(c => c.verbType === 'HAVE');

    if (performConds.length > 0) {
      const performCond = performConds[0];
      const isAnyOperator = (performCond.subjectType === 'OPERATOR' && (performCond as any).subjectDeterminer === 'ANY');
      const isFinalStrike = performCond.objectType === 'FINAL_STRIKE';

      if (isFinalStrike) {
        // FINAL_STRIKE: scan basic attack events for Final Strike frames
        for (const ev of events) {
          if (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID) continue;
          if (!isAnyOperator && ev.ownerId !== operatorSlotId) continue;
          if (ev.columnId !== SKILL_COLUMNS.BASIC) continue;
          // Skip non-sequence basic attacks (Finisher, Dive)
          if (ev.name === CombatSkillsType.FINISHER || ev.name === CombatSkillsType.DIVE) continue;

          const triggerFrame = getFinalStrikeTriggerFrame(ev);
          if (triggerFrame == null) continue;

          const allHaveMet = haveConds.every(hc =>
            checkPredicate(hc, events, operatorSlotId, triggerFrame)
          );
          if (!allHaveMet) continue;

          matches.push({
            frame: triggerFrame,
            sourceOwnerId: ev.ownerId,
            sourceSkillName: ev.name,
            effects: clause.effects,
          });
        }
      } else {
        // Standard PERFORM trigger: find skill casts matching the objectType
        const matchingSkillColumn = performCond.objectType === 'BATTLE_SKILL' ? 'battle'
          : performCond.objectType === 'COMBO_SKILL' ? 'combo'
          : performCond.objectType === 'ULTIMATE' ? 'ultimate'
          : performCond.objectType;

        for (const ev of events) {
          if (!isAnyOperator && ev.ownerId !== operatorSlotId) continue;
          if (isAnyOperator && (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID)) continue;
          if (ev.columnId !== matchingSkillColumn) continue;

          // Use first event frame tick as trigger point (e.g. battle skill hit frame),
          // falling back to event start if no frame data exists
          const triggerFrame = getFirstEventFrame(ev);

          const allHaveMet = haveConds.every(hc =>
            checkPredicate(hc, events, operatorSlotId, triggerFrame)
          );
          if (!allHaveMet) continue;

          matches.push({
            frame: triggerFrame,
            sourceOwnerId: ev.ownerId,
            sourceSkillName: ev.name,
            effects: clause.effects,
          });
        }
      }
    } else if (haveConds.length > 0) {
      // Pure HAVE trigger (e.g. ENEMY HAVE COMBUSTION, or THIS_OPERATOR HAVE STATUS X EXACTLY N):
      // trigger on each matching status event start, but only if cardinality is satisfied.
      const haveCond = haveConds[0];
      if (haveCond.objectType === 'STATUS' && haveCond.objectId) {
        const colId = statusNameToColumnId(haveCond.objectId);
        for (const ev of events) {
          if (ev.columnId !== colId) continue;
          if (haveCond.subjectType === 'ENEMY' && ev.ownerId !== ENEMY_OWNER_ID) continue;

          // Check cardinality constraint if specified
          if (haveCond.cardinality != null) {
            if (!checkPredicate(haveCond, events, operatorSlotId, ev.startFrame)) continue;
          }

          matches.push({
            frame: ev.startFrame,
            sourceOwnerId: ev.ownerId,
            sourceSkillName: ev.name,
            effects: clause.effects,
          });
        }
      }
    } else {
      // Classify other condition types
      const recoverConds = clause.conditions.filter(c => c.verbType === 'RECOVER');
      const isConds = clause.conditions.filter(c => c.verbType === 'IS');

      if (recoverConds.length > 0) {
        // RECOVER trigger (e.g. RECOVER SKILL_POINT): scan event segments for recovery frames
        const recoverCond = recoverConds[0];
        const isThisOperator = (recoverCond as any).subjectDeterminer === 'THIS';
        const isSpRecovery = recoverCond.objectType === 'SKILL_POINT';

        if (isSpRecovery) {
          for (const ev of events) {
            if (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID) continue;
            if (isThisOperator && ev.ownerId !== operatorSlotId) continue;
            if (!ev.segments) continue;
            let cumulativeOffset = 0;
            for (const seg of ev.segments) {
              if (seg.frames) {
                for (const frame of seg.frames) {
                  if (frame.skillPointRecovery && frame.skillPointRecovery > 0) {
                    matches.push({
                      frame: ev.startFrame + cumulativeOffset + frame.offsetFrame,
                      sourceOwnerId: ev.ownerId,
                      sourceSkillName: ev.name,
                      effects: clause.effects,
                    });
                  }
                }
              }
              cumulativeOffset += seg.durationFrames;
            }
          }
        }
      } else if (isConds.length > 0) {
        // IS trigger (e.g. ENEMY IS COMBUSTED): trigger on each matching reaction event
        const isCond = isConds[0];
        const reactionMap: Record<string, string> = {
          COMBUSTED: 'combustion', SOLIDIFIED: 'solidification',
          CORRODED: 'corrosion', ELECTRIFIED: 'electrification',
        };
        const colId = reactionMap[isCond.objectType ?? ''];
        if (colId) {
          for (const ev of events) {
            if (ev.columnId !== colId) continue;
            if (isCond.subjectType === 'ENEMY' && ev.ownerId !== ENEMY_OWNER_ID) continue;
            matches.push({
              frame: ev.startFrame,
              sourceOwnerId: ev.ownerId,
              sourceSkillName: ev.name,
              effects: clause.effects,
            });
          }
        }
      }
    }
  }

  // Deduplicate by frame (if multiple clauses match the same frame)
  const seen = new Set<number>();
  return matches.filter(m => {
    if (seen.has(m.frame)) return false;
    seen.add(m.frame);
    return true;
  }).sort((a, b) => a.frame - b.frame);
}

// ── Derive events ───────────────────────────────────────────────────────────

interface DeriveContext {
  events: TimelineEvent[];
  operatorId: string;
  operatorSlotId: string;
  potential: number;
  /** Maps operator ID (lowercase) → slot ID for cross-operator target resolution. */
  operatorSlotMap: Record<string, string>;
  /** Loadout properties for the operator's slot (talent levels, etc.). */
  loadoutProperties?: LoadoutProperties;
}

function deriveStatusEvents(
  def: StatusEventDef,
  ctx: DeriveContext,
  /** Only process triggers strictly after this frame (used for post-consumption re-derivation). */
  minTriggerFrame = -1,
  /** Pre-existing derived events to include in active stack count (consumed events with clamped durations). */
  priorDerived: TimelineEvent[] = [],
): DeriveResult {
  const { events, operatorSlotId } = ctx;
  const empty: DeriveResult = { derived: [], absorbedInflictions: [] };

  // Check if ALL effects redirect output to a different status (e.g. talent triggers that produce MF)
  const applySubEffect = def.triggerClause
    .flatMap(c => c.effects ?? [])
    .filter(e => e.verbType === 'ALL')
    .flatMap(e => e.effects ?? [])
    .find(e => e.verbType === 'APPLY' && e.objectType === 'STATUS' && e.objectId);
  let outputDef = def;
  if (applySubEffect?.objectId) {
    const json = getOperatorJson(ctx.operatorId);
    const targetDef = (json?.statusEvents as StatusEventDef[] ?? [])
      .find(d => d.name === applySubEffect.objectId);
    if (targetDef) outputDef = targetDef;
  }

  const duration = outputDef.properties?.duration ?? outputDef.duration;
  if (!duration) return empty;
  const durationFrames = getDurationFrames(duration);
  const ownerId = resolveOwnerId(outputDef.target, operatorSlotId, ctx.operatorSlotMap, outputDef.targetDeterminer);
  const columnId = statusNameToColumnId(outputDef.name);
  const maxStacks = getMaxStacks(outputDef.stack.max, ctx.potential);

  const triggers = findTriggerMatches(def, events, operatorSlotId);
  if (triggers.length === 0) return empty;

  const derived: TimelineEvent[] = [];
  const absorbedInflictions: AbsorbedInfliction[] = [];
  const absorbedIds = new Set<string>();
  let idCounter = 0;

  for (const trigger of triggers) {
    // Skip triggers at or before the minimum frame (for post-consumption re-derivation)
    if (trigger.frame <= minTriggerFrame) continue;

    // Enforce max stack cap: count active events from prior, new derived, and
    // existing events in the timeline that match the output column
    const allDerived = [...priorDerived, ...derived];
    let activeAtFrame = allDerived.filter(ev => {
      const end = ev.startFrame + ev.activationDuration;
      return ev.startFrame <= trigger.frame && trigger.frame < end;
    }).length;
    // Always count existing events (frame-derived or from a previous derivation pass)
    activeAtFrame += events.filter(ev =>
      ev.columnId === columnId &&
      ev.ownerId === ownerId &&
      ev.eventStatus !== EventStatusType.CONSUMED &&
      ev.startFrame <= trigger.frame &&
      trigger.frame < ev.startFrame + ev.activationDuration
    ).length;
    if (activeAtFrame >= maxStacks) continue;

    // Determine how many events to create: 1 normally, N for ALL with CONSUME infliction
    let createCount = 1;
    const allEffect = trigger.effects?.find(e => e.verbType === 'ALL');
    const absorbSubEffect = allEffect?.effects?.find(e => e.verbType === 'CONSUME' && e.objectType === 'INFLICTION');
    let inflictionsToAbsorb: TimelineEvent[] = [];

    if (absorbSubEffect?.element) {
      const inflictionCol = ELEMENT_TO_INFLICTION_COLUMN[absorbSubEffect.element];
      if (inflictionCol) {
        inflictionsToAbsorb = events.filter(ev =>
          ev.ownerId === ENEMY_OWNER_ID &&
          ev.columnId === inflictionCol &&
          ev.startFrame <= trigger.frame &&
          trigger.frame < ev.startFrame + ev.activationDuration &&
          ev.eventStatus !== EventStatusType.CONSUMED &&
          !absorbedIds.has(ev.id)
        ).sort((a, b) => a.startFrame - b.startFrame);

        createCount = Math.min(maxStacks - activeAtFrame, inflictionsToAbsorb.length);
        if (createCount <= 0) continue;
      }
    }

    for (let ci = 0; ci < createCount; ci++) {
      const evId = `${outputDef.name.toLowerCase()}-${operatorSlotId}-${idCounter++}`;

      // For RESET stacks: clamp previous instances
      if (outputDef.stack.verbType === 'RESET' && derived.length > 0) {
        const prev = derived[derived.length - 1];
        const prevEnd = prev.startFrame + prev.activationDuration;
        if (trigger.frame < prevEnd) {
          derived[derived.length - 1] = {
            ...prev,
            activationDuration: trigger.frame - prev.startFrame,
            eventStatus: EventStatusType.REFRESHED,
            eventStatusOwnerId: trigger.sourceOwnerId,
            eventStatusSkillName: trigger.sourceSkillName,
          };
        }
      }

      const ev: TimelineEvent = {
        id: evId,
        name: outputDef.name,
        ownerId,
        columnId,
        startFrame: trigger.frame,
        activationDuration: durationFrames,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: operatorSlotId,
        sourceSkillName: trigger.sourceSkillName,
      };

      // Resolve clause effects (susceptibility, damage bonus, resistance ignore)
      resolveClauseEffects(ev, outputDef, ctx);

      // Segment support: multi-phase statuses (e.g. Antal Focus: 20s Focus + 40s Empowered Focus)
      if (outputDef.segments && outputDef.segments.length > 0) {
        const segments: EventSegmentData[] = [];
        let totalDuration = 0;
        for (const seg of outputDef.segments) {
          const segDuration = seg.properties?.duration
            ? getDurationFrames(seg.properties.duration)
            : durationFrames;
          const segData: EventSegmentData = {
            durationFrames: segDuration,
            label: seg.name,
          };
          // Resolve per-segment susceptibility from segment clauses
          if (seg.clause) {
            const segEv: TimelineEvent = { ...ev, susceptibility: undefined };
            resolveClauseEffectsFromClauses(
              segEv,
              seg.clause as { conditions: any[]; effects: Record<string, any>[] }[],
              ctx, def, false,
            );
            if (segEv.susceptibility) {
              segData.susceptibility = segEv.susceptibility as Record<string, number>;
            }
          }
          segments.push(segData);
          totalDuration += segDuration;
        }
        ev.segments = segments;
        ev.activationDuration = totalDuration;
        // Use first segment's susceptibility as event-level default
        if (!ev.susceptibility && segments[0]?.susceptibility) {
          ev.susceptibility = segments[0].susceptibility;
        }
      }

      // Legacy: susceptibility from flat config (e.g. skills JSON statusEvents)
      if (!ev.susceptibility && outputDef.susceptibility) {
        const resolved: Record<string, number> = {};
        for (const [element, values] of Object.entries(outputDef.susceptibility)) {
          const arr = values as number[];
          const talentLevel = outputDef.minTalentLevel?.talent === 2
            ? (ctx.loadoutProperties?.operator.talentTwoLevel ?? 0)
            : (ctx.loadoutProperties?.operator.talentOneLevel ?? 0);
          resolved[element] = arr[Math.min(talentLevel, arr.length) - 1] ?? arr[0];
        }
        ev.susceptibility = resolved;
      }

      // Legacy: statusValue from flat stats config (e.g. skills JSON statusEvents)
      if (ev.statusValue == null && outputDef.stats && outputDef.stats.length > 0) {
        const stat = outputDef.stats[0] as { perIntellect?: number[] };
        if (stat.perIntellect) {
          const talentLevel = outputDef.minTalentLevel?.talent === 2
            ? (ctx.loadoutProperties?.operator.talentTwoLevel ?? 0)
            : (ctx.loadoutProperties?.operator.talentOneLevel ?? 0);
          ev.statusValue = stat.perIntellect[Math.min(talentLevel, stat.perIntellect.length) - 1] ?? stat.perIntellect[0];
        }
      }

      derived.push(ev);

      // Track absorption
      if (ci < inflictionsToAbsorb.length) {
        absorbedIds.add(inflictionsToAbsorb[ci].id);
        absorbedInflictions.push({
          eventId: inflictionsToAbsorb[ci].id,
          clampFrame: trigger.frame,
          sourceOwnerId: trigger.sourceOwnerId,
          sourceSkillName: trigger.sourceSkillName,
        });
      }

      // p3TeamShare: create shared copies for all other team operators at reduced duration
      if (outputDef.p3TeamShare && ctx.potential >= 3) {
        const sharedDuration = Math.floor(durationFrames * outputDef.p3TeamShare.durationMultiplier);
        const teamSlots = new Set<string>();
        for (const e of events) {
          if (e.ownerId !== ENEMY_OWNER_ID && e.ownerId !== COMMON_OWNER_ID && e.ownerId !== operatorSlotId) {
            teamSlots.add(e.ownerId);
          }
        }
        for (const teamSlotId of Array.from(teamSlots)) {
          // RESET: clamp previous team copy
          if (outputDef.stack.verbType === 'RESET') {
            const prev = derived.filter(d => d.ownerId === teamSlotId);
            const last = prev[prev.length - 1];
            if (last && trigger.frame < last.startFrame + last.activationDuration) {
              const idx = derived.indexOf(last);
              derived[idx] = {
                ...last,
                activationDuration: trigger.frame - last.startFrame,
                eventStatus: EventStatusType.REFRESHED,
                eventStatusOwnerId: operatorSlotId,
                eventStatusSkillName: trigger.sourceSkillName,
              };
            }
          }
          derived.push({
            id: `${evId}-share-${teamSlotId}`,
            name: outputDef.name,
            ownerId: teamSlotId,
            columnId,
            startFrame: trigger.frame,
            activationDuration: sharedDuration,
            activeDuration: 0,
            cooldownDuration: 0,
            sourceOwnerId: operatorSlotId,
            sourceSkillName: trigger.sourceSkillName,
          });
        }
      }
    }
  }

  return { derived, absorbedInflictions };
}

// ── Stack threshold evaluation ──────────────────────────────────────────────

function evaluateThresholdClauses(
  def: StatusEventDef,
  derivedEvents: TimelineEvent[],
  ctx: DeriveContext,
): TimelineEvent[] {
  if (!def.clause || def.clause.length === 0) return [];

  const maxStacks = getMaxStacks(def.stack.max, ctx.potential);
  const thresholdDerived: TimelineEvent[] = [];
  let idCounter = 0;

  for (const clause of def.clause) {
    // Check for HAVE STACKS EXACTLY MAX condition
    const stackCond = clause.conditions.find(c =>
      c.subjectType === 'THIS_EVENT' && c.verbType === 'HAVE' && c.objectType === 'STACKS'
    );
    if (!stackCond) continue;

    const targetCount = stackCond.cardinality === 'MAX' ? maxStacks : Number(stackCond.cardinality);

    // Find frames where the stack count crosses the threshold
    const allStatusEvents = [...ctx.events, ...derivedEvents]
      .filter(ev => ev.columnId === statusNameToColumnId(def.name) && ev.ownerId === resolveOwnerId(def.target, ctx.operatorSlotId, ctx.operatorSlotMap, def.targetDeterminer))
      .sort((a, b) => a.startFrame - b.startFrame);

    for (const ev of allStatusEvents) {
      // Count active stacks at this event's start frame (including itself)
      let activeCount = 0;
      let countWithout = 0;
      for (const other of allStatusEvents) {
        const otherEnd = other.startFrame + other.activationDuration;
        if (other.startFrame <= ev.startFrame && ev.startFrame < otherEnd) {
          activeCount++;
          if (other.id !== ev.id) countWithout++;
        }
      }

      if (activeCount < targetCount) continue;
      if (countWithout >= targetCount) continue; // already at threshold before this event

      // Execute clause effects
      for (const effect of clause.effects) {
        if (effect.verbType === 'APPLY' && effect.objectType === 'STATUS' && effect.objectId) {
          // Find the target status definition to get its properties
          const targetStatusName = effect.objectId;

          // Look for the target status def in the same operator's statusEvents
          const json = getOperatorJson(ctx.operatorId);
          const targetDef = (json?.statusEvents as StatusEventDef[] ?? [])
            .find(d => d.name === targetStatusName);

          // Resolve owner from the target def's own target field (authoritative),
          // falling back to the clause's toObjectType
          const targetField = targetDef?.target ?? effect.toObjectType;
          const targetDet = targetDef?.targetDeterminer ?? (effect as any).toObjectDeterminer;
          const targetOwnerId = resolveOwnerId(targetField ?? 'OPERATOR', ctx.operatorSlotId, ctx.operatorSlotMap, targetDet ?? 'THIS');

          const targetDuration = targetDef
            ? (targetDef.properties?.duration ?? targetDef.duration)
            : undefined;
          const duration = targetDuration
            ? getDurationFrames(targetDuration)
            : 2400; // fallback 20s

          const targetColumnId = statusNameToColumnId(targetStatusName);

          // Refresh: clamp previous instances of the target status
          if (thresholdDerived.length > 0) {
            const prev = thresholdDerived[thresholdDerived.length - 1];
            const prevEnd = prev.startFrame + prev.activationDuration;
            if (ev.startFrame < prevEnd && prev.columnId === targetColumnId) {
              thresholdDerived[thresholdDerived.length - 1] = {
                ...prev,
                activationDuration: ev.startFrame - prev.startFrame,
                eventStatus: EventStatusType.REFRESHED,
                eventStatusOwnerId: ctx.operatorSlotId,
                eventStatusSkillName: def.name,
              };
            }
          }

          thresholdDerived.push({
            id: `${targetStatusName.toLowerCase()}-${ctx.operatorSlotId}-${idCounter++}`,
            name: targetStatusName,
            ownerId: targetOwnerId,
            columnId: targetColumnId,
            startFrame: ev.startFrame,
            activationDuration: duration,
            activeDuration: 0,
            cooldownDuration: 0,
            sourceOwnerId: ctx.operatorSlotId,
            sourceSkillName: def.name,
          });
        }
      }
    }
  }

  return thresholdDerived;
}

// ── Consume clause evaluation ───────────────────────────────────────────────

/**
 * Evaluate consumeClause on a status definition. When conditions are met
 * (e.g. PERFORM BATTLE_SKILL while at MAX stacks), clamp all active derived
 * events at the consumption frame, freeing up stack slots for re-accumulation.
 *
 * Mutates `derivedEvents` in place (shortens activationDuration).
 * Returns the frames at which consumption occurred (for downstream use).
 */
interface PreExistingConsumption {
  id: string;
  clampFrame: number;
  sourceOwnerId: string;
  sourceSkillName: string;
}

function evaluateConsumeClauses(
  def: StatusEventDef,
  derivedEvents: TimelineEvent[],
  ctx: DeriveContext,
): { consumeFrames: number[]; preExistingConsumptions: PreExistingConsumption[] } {
  if (!def.consumeClause || def.consumeClause.length === 0) return { consumeFrames: [], preExistingConsumptions: [] };

  const maxStacks = getMaxStacks(def.stack.max, ctx.potential);
  const consumeFrames: number[] = [];
  const preExistingConsumptions: PreExistingConsumption[] = [];
  const columnId = statusNameToColumnId(def.name);
  const ownerId = resolveOwnerId(def.target, ctx.operatorSlotId, ctx.operatorSlotMap, def.targetDeterminer);

  for (const clause of def.consumeClause) {
    // Find PERFORM conditions to scan for trigger events
    const performConds = clause.conditions.filter(c => c.verbType === 'PERFORM');
    const stackConds = clause.conditions.filter(c =>
      c.subjectType === 'THIS_EVENT' && c.verbType === 'HAVE' && c.objectType === 'STACKS'
    );
    if (performConds.length === 0) continue;

    const performCond = performConds[0];
    const matchingColumn = performCond.objectType === 'BATTLE_SKILL' ? 'battle'
      : performCond.objectType === 'COMBO_SKILL' ? 'combo'
      : performCond.objectType === 'ULTIMATE' ? 'ultimate'
      : performCond.objectType;

    // Check if effects include CONSUME ALL_STACKS
    const consumeAll = clause.effects.some(e =>
      e.verbType === 'CONSUME' && e.objectType === 'ALL_STACKS'
    );
    if (!consumeAll) continue;

    // Scan input events for matching skill casts, sorted chronologically.
    // Array order may differ from chronological order after drag operations.
    const matchingEvents = ctx.events
      .filter(ev => ev.ownerId === ctx.operatorSlotId && ev.columnId === matchingColumn)
      .sort((a, b) => a.startFrame - b.startFrame);
    for (const ev of matchingEvents) {

      // Check stack condition: count stacks that were active BEFORE this trigger.
      // A trigger that successfully created an MF should not also consume — only
      // triggers that were blocked by the max cap should consume.
      if (stackConds.length > 0) {
        const stackCond = stackConds[0];
        const targetCount = stackCond.cardinality === 'MAX' ? maxStacks : Number(stackCond.cardinality);

        // Count active stacks from derived events EXCLUDING any created at this exact frame
        // by this trigger (those were just added, not pre-existing)
        const preExistingCount = derivedEvents.filter(d =>
          d.columnId === columnId &&
          d.ownerId === ownerId &&
          d.startFrame < ev.startFrame &&
          ev.startFrame < d.startFrame + d.activationDuration
        ).length;

        if (stackCond.cardinalityConstraint === 'EXACTLY' && preExistingCount !== targetCount) continue;
        if (stackCond.cardinalityConstraint === 'AT_LEAST' && preExistingCount < targetCount) continue;
      }

      // Consume: clamp all active events (both derived and pre-existing) at this frame
      for (const d of derivedEvents) {
        if (d.columnId !== columnId || d.ownerId !== ownerId) continue;
        const end = d.startFrame + d.activationDuration;
        if (d.startFrame <= ev.startFrame && ev.startFrame < end) {
          d.activationDuration = ev.startFrame - d.startFrame;
          d.eventStatus = EventStatusType.CONSUMED;
          d.eventStatusOwnerId = ev.ownerId;
          d.eventStatusSkillName = ev.name;
        }
      }
      // Also clamp pre-existing events in the input array (e.g. Originium Crystals
      // placed by frame effects, not engine-derived)
      for (const d of ctx.events) {
        if (d.columnId !== columnId || d.ownerId !== ownerId) continue;
        if (d.eventStatus === EventStatusType.CONSUMED) continue;
        const end = d.startFrame + d.activationDuration;
        if (d.startFrame <= ev.startFrame && ev.startFrame < end) {
          preExistingConsumptions.push({
            id: d.id,
            clampFrame: ev.startFrame,
            sourceOwnerId: ev.ownerId,
            sourceSkillName: ev.name,
          });
        }
      }

      consumeFrames.push(ev.startFrame);
    }
  }

  return { consumeFrames, preExistingConsumptions };
}

// ── Lifecycle clause evaluation ──────────────────────────────────────────────

/** Evaluate lifecycle clauses for a single status event. Returns updated events array. */
function evaluateLifecycleForEvent(
  events: TimelineEvent[],
  def: StatusEventDef,
  statusEv: TimelineEvent,
  operatorSlotMap: Record<string, string>,
): TimelineEvent[] {
  let result = events;
  const parentEndFrame = statusEv.startFrame + statusEv.activationDuration;
  const sourceOwnerId = statusEv.sourceOwnerId ?? statusEv.ownerId;

  const makeExecCtx = (frame: number): ExecutionContext => ({
    events: result,
    frame,
    sourceOwnerId,
    sourceSkillName: statusEv.name,
    operatorSlotMap,
    idCounter: 0,
    parentEventEndFrame: parentEndFrame,
  });

  // onActivationClause: evaluate once at startFrame
  if (def.onActivationClause) {
    for (const clause of def.onActivationClause) {
      const condCtx: ConditionContext = {
        events: result,
        frame: statusEv.startFrame,
        sourceOwnerId,
      };
      if (!evaluateConditions(clause.conditions as unknown as Interaction[], condCtx)) continue;
      const execCtx = makeExecCtx(statusEv.startFrame);
      const mutations = executeEffects(clause.effects as unknown as SemanticEffect[], execCtx);
      if (!mutations.failed) {
        result = applyMutations(result, mutations);
      }
    }
  }

  // reactiveTriggerClause: for each clause, find matching events during the status's active window
  if (def.reactiveTriggerClause) {
    for (const clause of def.reactiveTriggerClause) {
      const receiveConds = clause.conditions.filter(
        (c: Predicate) => c.verbType === 'RECEIVE'
      );
      if (receiveConds.length === 0) continue;

      const receiveCond = receiveConds[0];
      const targetColumnId = resolveReceiveColumnId(receiveCond);
      if (!targetColumnId) continue;

      const triggerEvents = result.filter(ev =>
        ev.columnId === targetColumnId &&
        ev.startFrame >= statusEv.startFrame &&
        ev.startFrame < parentEndFrame
      );

      for (const triggerEv of triggerEvents) {
        const condCtx: ConditionContext = {
          events: result,
          frame: triggerEv.startFrame,
          sourceOwnerId,
        };
        if (!evaluateConditions(clause.conditions as unknown as Interaction[], condCtx)) continue;
        const execCtx = makeExecCtx(triggerEv.startFrame);
        const mutations = executeEffects(clause.effects as unknown as SemanticEffect[], execCtx);
        if (!mutations.failed) {
          result = applyMutations(result, mutations);
        }
      }
    }
  }

  return result;
}

/**
 * Evaluate lifecycle clauses (onActivationClause, reactiveTriggerClause) on all
 * status events in the timeline that match a statusEvent definition by name.
 *
 * This covers both engine-created statuses (from triggerClause) and frame-created
 * statuses (e.g. APPLY STATUS from skill frames).
 */
function evaluateLifecycleClauses(
  events: TimelineEvent[],
  allDefs: StatusEventDef[],
  operatorSlotMap: Record<string, string>,
): TimelineEvent[] {
  let result = [...events];

  // Build a map of statusEvent defs that have lifecycle clauses
  const lifecycleDefs = allDefs.filter(d =>
    (d.onActivationClause && d.onActivationClause.length > 0) ||
    (d.reactiveTriggerClause && d.reactiveTriggerClause.length > 0)
  );
  if (lifecycleDefs.length === 0) return result;

  for (const def of lifecycleDefs) {
    const columnId = statusNameToColumnId(def.name);

    // Find all status events in the timeline matching this def
    const matchingEvents = result.filter(ev => ev.columnId === columnId && ev.name === def.name);

    for (const statusEv of matchingEvents) {
      result = evaluateLifecycleForEvent(result, def, statusEv, operatorSlotMap);
    }
  }

  return result;
}

/** Resolve a RECEIVE condition's target column ID. */
function resolveReceiveColumnId(cond: Predicate): string | undefined {
  if (cond.objectType === 'STATUS' && cond.objectId) {
    return REACTION_STATUS_TO_COLUMN[cond.objectId]
      ?? cond.objectId.toLowerCase().replace(/_/g, '-');
  }
  return undefined;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Operator IDs with statusEvents in their JSON.
 * Built dynamically — any operator with statusEvents is automatically handled.
 */
const ENGINE_HANDLED_OPERATORS = new Set(
  getAllOperatorIds().filter(id => {
    const json = getOperatorJson(id);
    return json?.statusEvents;
  })
);

/**
 * Run the generic status derivation engine for all operators present in the timeline.
 * Returns the events array with derived status events appended.
 */
export function deriveStatusesFromEngine(
  events: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
  /** Slot ID → operator ID mapping from the app layer (guarantees slot detection without events). */
  slotOperatorMap?: Record<string, string>,
  /** Slot ID → weapon name mapping for weapon effect derivation. */
  slotWeapons?: Record<string, string | undefined>,
  /** Slot ID → gear set type mapping for gear effect derivation. */
  slotGearSets?: Record<string, string | undefined>,
): TimelineEvent[] {
  let result = [...events];

  // Build operator ID → slot ID map for cross-operator target resolution.
  // Prefer the app-provided slotOperatorMap (works even when no events exist).
  const operatorSlotMap: Record<string, string> = {};
  if (slotOperatorMap) {
    for (const [slotId, opId] of Object.entries(slotOperatorMap)) {
      operatorSlotMap[opId] = slotId;
    }
  }
  for (const opId of Array.from(ENGINE_HANDLED_OPERATORS)) {
    if (operatorSlotMap[opId]) continue;
    const slot = findOperatorSlot(result, opId);
    if (slot) operatorSlotMap[opId] = slot;
  }
  // Also scan all operator JSONs (not just engine-handled) for slot mapping
  for (const opId of getAllOperatorIds()) {
    if (operatorSlotMap[opId]) continue;
    const slot = findOperatorSlot(result, opId);
    if (slot) operatorSlotMap[opId] = slot;
  }

  for (const operatorId of Array.from(ENGINE_HANDLED_OPERATORS)) {
    const json = getOperatorJson(operatorId);
    if (!json?.statusEvents) continue;

    const slotId = operatorSlotMap[operatorId] ?? findOperatorSlot(result, operatorId);
    if (!slotId) continue;

    const props = loadoutProperties?.[slotId];
    const potential = props?.operator.potential ?? 0;

    const defs = json.statusEvents as StatusEventDef[];
    for (const def of defs) {
      // Check talent level requirement
      if (def.minTalentLevel) {
        const talentLevel = def.minTalentLevel.talent === 1
          ? (props?.operator.talentOneLevel ?? 0)
          : (props?.operator.talentTwoLevel ?? 0);
        if (talentLevel < def.minTalentLevel.minLevel) continue;
      }

      const ctx: DeriveContext = {
        events: result,
        operatorId,
        operatorSlotId: slotId,
        potential,
        operatorSlotMap,
        loadoutProperties: props,
      };

      // TALENT type: create a permanent presence event on the operator's timeline.
      // The talent event is separate from the trigger effects (e.g. absorption → MF).
      if (def.type === 'TALENT') {
        const talentDuration = def.properties?.duration ?? def.duration;
        const talentDurationFrames = talentDuration ? getDurationFrames(talentDuration) : TOTAL_FRAMES;
        const talentOwnerId = resolveOwnerId(def.target, slotId, operatorSlotMap, def.targetDeterminer);
        const talentColumnId = statusNameToColumnId(def.name);
        // Only create if not already present
        if (!result.some(ev => ev.columnId === talentColumnId && ev.ownerId === talentOwnerId)) {
          result.push({
            id: `${def.name.toLowerCase()}-talent-${slotId}`,
            name: def.name,
            ownerId: talentOwnerId,
            columnId: talentColumnId,
            startFrame: 0,
            activationDuration: talentDurationFrames,
            activeDuration: 0,
            cooldownDuration: 0,
            sourceOwnerId: slotId,
            sourceSkillName: def.name,
          });
        }
      }

      const { derived, absorbedInflictions } = deriveStatusEvents(def, ctx);

      // Apply absorption clamping to infliction events (e.g. heat infliction consumed by Final Strike)
      if (absorbedInflictions.length > 0) {
        result = result.map(ev => {
          const absorption = absorbedInflictions.find(a => a.eventId === ev.id);
          if (!absorption) return ev;
          return {
            ...ev,
            activationDuration: Math.max(0, absorption.clampFrame - ev.startFrame),
            eventStatus: EventStatusType.CONSUMED,
            eventStatusOwnerId: absorption.sourceOwnerId,
            eventStatusSkillName: absorption.sourceSkillName,
          };
        });
      }

      // Evaluate consume clauses — mutates derived events (clamps durations)
      const { consumeFrames, preExistingConsumptions } = evaluateConsumeClauses(def, derived, ctx);

      // Apply clamping to pre-existing events (e.g. Originium Crystals placed by frame effects)
      if (preExistingConsumptions.length > 0) {
        result = result.map(ev => {
          const consumption = preExistingConsumptions.find(c => c.id === ev.id);
          if (!consumption) return ev;
          return {
            ...ev,
            activationDuration: Math.max(0, consumption.clampFrame - ev.startFrame),
            eventStatus: EventStatusType.CONSUMED,
            eventStatusOwnerId: consumption.sourceOwnerId,
            eventStatusSkillName: consumption.sourceSkillName,
          };
        });
      }

      // After consumption, re-derive to fill new stacks from triggers after each consume point.
      // Generic loop capped at MAX_REDERIVE_DEPTH to handle chains of consume→re-derive cycles.
      const MAX_REDERIVE_DEPTH = 5;
      let currentConsumeFrames = consumeFrames;
      let allPrior = [...derived];
      for (let depth = 0; depth < MAX_REDERIVE_DEPTH && currentConsumeFrames.length > 0; depth++) {
        const earliestConsume = Math.min(...currentConsumeFrames);
        const reCtx = { ...ctx, events: result };
        const { derived: reDerived, absorbedInflictions: reAbsorbed } = deriveStatusEvents(def, reCtx, earliestConsume, allPrior);

        // Apply re-absorption clamping
        if (reAbsorbed.length > 0) {
          result = result.map(ev => {
            const absorption = reAbsorbed.find(a => a.eventId === ev.id);
            if (!absorption) return ev;
            return {
              ...ev,
              activationDuration: Math.max(0, absorption.clampFrame - ev.startFrame),
              eventStatus: EventStatusType.CONSUMED,
              eventStatusOwnerId: absorption.sourceOwnerId,
              eventStatusSkillName: absorption.sourceSkillName,
            };
          });
        }

        // Evaluate consume clauses on re-derived events for the next cycle
        const { consumeFrames: nextConsumeFrames } = evaluateConsumeClauses(def, reDerived, reCtx);
        derived.push(...reDerived);
        allPrior = [...allPrior, ...reDerived];
        currentConsumeFrames = nextConsumeFrames;
      }

      const thresholdDerived = evaluateThresholdClauses(def, derived, ctx);
      result = [...result, ...derived, ...thresholdDerived];
    }
  }

  // ── Weapon/gear effect derivation ────────────────────────────────────────
  const equipDefs: { slotId: string; def: StatusEventDef }[] = [];
  if (slotWeapons) {
    for (const [slotId, weaponName] of Object.entries(slotWeapons)) {
      if (!weaponName) continue;
      for (const def of getWeaponEffectDefs(weaponName) as StatusEventDef[]) {
        equipDefs.push({ slotId, def });
      }
    }
  }
  if (slotGearSets) {
    for (const [slotId, gearSetType] of Object.entries(slotGearSets)) {
      if (!gearSetType) continue;
      for (const def of getGearEffectDefs(gearSetType) as StatusEventDef[]) {
        equipDefs.push({ slotId, def });
      }
    }
  }
  for (const { slotId, def } of equipDefs) {
    const opId = slotOperatorMap
      ? Object.entries(slotOperatorMap).find(([s]) => s === slotId)?.[1]
      : undefined;
    const ctx: DeriveContext = {
      events: result,
      operatorId: opId ?? '',
      operatorSlotId: slotId,
      potential: 0,
      operatorSlotMap,
      loadoutProperties: loadoutProperties?.[slotId],
    };
    const { derived } = deriveStatusEvents(def, ctx);
    // Remap OTHER-targeted events to COMMON_OWNER_ID (team buff column)
    const remapped = def.targetDeterminer === 'OTHER'
      ? derived.map(ev => ev.ownerId === slotId ? { ...ev, ownerId: COMMON_OWNER_ID } : ev)
      : derived;
    result = [...result, ...remapped];
  }

  // ── Second pass: lifecycle clause evaluation ──────────────────────────────
  // After all triggerClause-derived statuses exist, evaluate onActivationClause
  // and reactiveTriggerClause on ALL status events (engine-created and frame-created).
  const allLifecycleDefs: StatusEventDef[] = [];
  for (const operatorId of getAllOperatorIds()) {
    const json = getOperatorJson(operatorId);
    if (!json?.statusEvents) continue;
    for (const def of json.statusEvents as StatusEventDef[]) {
      if (def.onActivationClause?.length || def.reactiveTriggerClause?.length) {
        allLifecycleDefs.push(def);
      }
    }
  }
  if (allLifecycleDefs.length > 0) {
    result = evaluateLifecycleClauses(result, allLifecycleDefs, operatorSlotMap);
  }

  return result;
}

// (collectExchangeAbsorptions removed — absorption is now handled inline by deriveStatusEvents)
