/**
 * DSL Effect Executor.
 *
 * Executes Effect trees atomically, producing MutationSets (events to add,
 * events to clamp). ALL/ANY compound effects evaluate predicates and recurse.
 * Leaf effects (APPLY, CONSUME, etc.) produce concrete mutations.
 *
 * This module is pure — it does not mutate input events. Callers apply
 * the returned MutationSet to the timeline.
 */
import {
  Effect,
  VerbType,
  THRESHOLD_MAX,
  NounType,
  DeterminerType,
  AdjectiveType,
  DURATION_END,
} from '../../consts/semantics';
import { TimelineEvent, durationSegment, eventDuration, setEventDuration } from '../../consts/viewTypes';
import { EventStatusType, PhysicalStatusType } from '../../consts/enums';
import { ENEMY_OWNER_ID, INFLICTION_COLUMNS, REACTION_COLUMNS } from '../../model/channels/index';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { evaluateConditions, ConditionContext } from './conditionEvaluator';
import { activeEventsAtFrame, activeInflictionsOfElement } from './timelineQueries';
import { LoadoutProperties } from '../../view/InformationPane';

// ── Types ────────────────────────────────────────────────────────────────

/** Information about a clamped (shortened/consumed) event. */
export interface ClampInfo {
  /** New activationDuration (shortened to clampFrame - startFrame). */
  newDuration: number;
  /** Status applied to the clamped event. */
  eventStatus: EventStatusType;
  /** Who caused the clamp. */
  sourceOwnerId: string;
  /** Skill that caused the clamp. */
  sourceSkillName: string;
}

/** The result of executing an effect tree. */
export interface MutationSet {
  /** New events to add to the timeline. */
  produced: TimelineEvent[];
  /** Events to clamp (shorten duration), keyed by event ID. */
  clamped: Map<string, ClampInfo>;
  /** Whether the execution failed (e.g. CONSUME target not found). */
  failed: boolean;
}

/** Context for effect execution. */
export interface ExecutionContext {
  events: readonly TimelineEvent[];
  frame: number;
  sourceOwnerId: string;
  sourceSkillName: string;
  loadoutProperties?: Record<string, LoadoutProperties>;
  operatorSlotMap?: Record<string, string>;
  potential?: number;
  /** Counter for generating unique event IDs within a single execution. */
  idCounter: number;
  /** End frame of the parent status event (for EXTEND UNTIL END). */
  parentEventEndFrame?: number;
  /** Target operator ID for OTHER/ANY determiner resolution. */
  targetOwnerId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function emptyMutationSet(): MutationSet {
  return { produced: [], clamped: new Map(), failed: false };
}


/** Merge source MutationSet into target (in place). */
function mergeMutations(target: MutationSet, source: MutationSet) {
  target.produced.push(...source.produced);
  source.clamped.forEach((info, id) => {
    target.clamped.set(id, info);
  });
}

function resolveOwnerId(target: string | undefined, ctx: ExecutionContext, determiner?: string): string {
  if (target === NounType.OPERATOR || target === 'OPERATOR') {
    switch (determiner ?? DeterminerType.THIS) {
      case DeterminerType.THIS: return ctx.sourceOwnerId;
      case DeterminerType.ALL: return COMMON_OWNER_ID;
      case DeterminerType.OTHER: return ctx.targetOwnerId ?? ctx.sourceOwnerId;
      case DeterminerType.ANY: return ctx.targetOwnerId ?? ctx.sourceOwnerId;
      default: return ctx.sourceOwnerId;
    }
  }
  switch (target) {
    case NounType.ENEMY:
    case 'ENEMY': return ENEMY_OWNER_ID;
    default: {
      if (target && ctx.operatorSlotMap) {
        const slotId = ctx.operatorSlotMap[target.toLowerCase()];
        if (slotId) return slotId;
      }
      return ctx.sourceOwnerId;
    }
  }
}

/** Resolve cardinality, handling THRESHOLD_MAX → potential-based max. */
function resolveCardinality(
  cardinality: number | typeof THRESHOLD_MAX | undefined,
  potential: number,
  defaultMax = 999,
): number {
  if (cardinality === THRESHOLD_MAX) {
    // MAX is potential-dependent; without explicit max map, use a reasonable default.
    // In practice, the caller provides the resolved max from operator JSON.
    return defaultMax;
  }
  return cardinality ?? defaultMax;
}

// ── Column ID resolution ─────────────────────────────────────────────────

const ELEMENT_TO_INFLICTION_COLUMN: Record<string, string> = {
  HEAT:     INFLICTION_COLUMNS.HEAT,
  CRYO:     INFLICTION_COLUMNS.CRYO,
  NATURE:   INFLICTION_COLUMNS.NATURE,
  ELECTRIC: INFLICTION_COLUMNS.ELECTRIC,
};

const REACTION_TO_COLUMN: Record<string, string> = {
  COMBUSTION:       REACTION_COLUMNS.COMBUSTION,
  SOLIDIFICATION:   REACTION_COLUMNS.SOLIDIFICATION,
  CORROSION:        REACTION_COLUMNS.CORROSION,
  ELECTRIFICATION:  REACTION_COLUMNS.ELECTRIFICATION,
};

const PHYSICAL_STATUS_VALUES = new Set<string>(Object.values(PhysicalStatusType));

function resolveStatusColumnId(objectId?: string): string {
  if (!objectId) return 'unknown-status';
  if (REACTION_TO_COLUMN[objectId]) return REACTION_TO_COLUMN[objectId];
  if (PHYSICAL_STATUS_VALUES.has(objectId)) return objectId;
  return objectId.toLowerCase().replace(/_/g, '-');
}

function resolveInflictionColumnId(adjective?: AdjectiveType | AdjectiveType[]): string | undefined {
  const adj = Array.isArray(adjective) ? adjective[0] : adjective;
  if (!adj) return undefined;
  return ELEMENT_TO_INFLICTION_COLUMN[adj];
}

function resolveReactionColumnId(adjective?: AdjectiveType | AdjectiveType[]): string | undefined {
  const adj = Array.isArray(adjective) ? adjective[0] : adjective;
  if (!adj) return undefined;
  return REACTION_TO_COLUMN[adj];
}

// ── Verb Handlers ────────────────────────────────────────────────────────

function executeApply(effect: Effect, ctx: ExecutionContext): MutationSet {
  const result = emptyMutationSet();
  const ownerId = resolveOwnerId(effect.toObject as string, ctx, effect.toDeterminer);

  if (effect.object === 'INFLICTION') {
    const columnId = resolveInflictionColumnId(effect.adjective);
    if (!columnId) { result.failed = true; return result; }

    const durationValue = effect.with?.duration?.value;
    const duration = typeof durationValue === 'number' ? Math.round(durationValue * 120) : 120;

    const ev: TimelineEvent = {
      id: `infliction-${ctx.sourceOwnerId}-${ctx.idCounter++}`,
      name: effect.objectId ?? String(effect.adjective),
      ownerId,
      columnId,
      startFrame: ctx.frame,
      segments: durationSegment(duration),
      sourceOwnerId: ctx.sourceOwnerId,
      sourceSkillName: ctx.sourceSkillName,
    };
    result.produced.push(ev);
    return result;
  }

  if (effect.object === 'STATUS') {
    const columnId = resolveStatusColumnId(effect.objectId);

    const durationValue = effect.with?.duration?.value;
    const duration = typeof durationValue === 'number' ? Math.round(durationValue * 120) : 2400;

    const ev: TimelineEvent = {
      id: `status-${effect.objectId?.toLowerCase() ?? 'unknown'}-${ctx.sourceOwnerId}-${ctx.idCounter++}`,
      name: effect.objectId ?? 'UNKNOWN_STATUS',
      ownerId,
      columnId,
      startFrame: ctx.frame,
      segments: durationSegment(duration),
      sourceOwnerId: ctx.sourceOwnerId,
      sourceSkillName: ctx.sourceSkillName,
    };
    result.produced.push(ev);
    return result;
  }

  if (effect.object === 'REACTION') {
    const columnId = resolveReactionColumnId(effect.adjective);
    if (!columnId) { result.failed = true; return result; }

    const durationValue = effect.with?.duration?.value;
    const duration = typeof durationValue === 'number' ? Math.round(durationValue * 120) : 2400;
    const statusLevel = effect.with?.statusLevel?.value;

    const ev: TimelineEvent = {
      id: `reaction-${ctx.sourceOwnerId}-${ctx.idCounter++}`,
      name: String(effect.adjective),
      ownerId,
      columnId,
      startFrame: ctx.frame,
      segments: durationSegment(duration),
      sourceOwnerId: ctx.sourceOwnerId,
      sourceSkillName: ctx.sourceSkillName,
      statusLevel: typeof statusLevel === 'number' ? statusLevel : undefined,
    };
    result.produced.push(ev);
    return result;
  }

  // Fallback for other APPLY targets
  result.failed = true;
  return result;
}

function executeConsume(effect: Effect, ctx: ExecutionContext): MutationSet {
  const result = emptyMutationSet();
  const ownerId = resolveOwnerId(effect.fromObject as string ?? effect.toObject as string, ctx, effect.fromDeterminer ?? effect.toDeterminer);

  if (effect.object === 'INFLICTION') {
    const columnId = resolveInflictionColumnId(effect.adjective);
    if (!columnId) { result.failed = true; return result; }

    const targets = activeInflictionsOfElement(ctx.events, columnId, ctx.frame);
    if (targets.length === 0) { result.failed = true; return result; }

    // Consume the oldest active infliction
    const target = targets.sort((a, b) => a.startFrame - b.startFrame)[0];
    result.clamped.set(target.id, {
      newDuration: Math.max(0, ctx.frame - target.startFrame),
      eventStatus: EventStatusType.CONSUMED,
      sourceOwnerId: ctx.sourceOwnerId,
      sourceSkillName: ctx.sourceSkillName,
    });
    return result;
  }

  if (effect.object === 'STATUS') {
    const columnId = resolveStatusColumnId(effect.objectId);
    const targets = activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame)
      .filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);

    if (targets.length === 0) { result.failed = true; return result; }

    // Consume the oldest active status
    const target = targets.sort((a, b) => a.startFrame - b.startFrame)[0];
    result.clamped.set(target.id, {
      newDuration: Math.max(0, ctx.frame - target.startFrame),
      eventStatus: EventStatusType.CONSUMED,
      sourceOwnerId: ctx.sourceOwnerId,
      sourceSkillName: ctx.sourceSkillName,
    });
    return result;
  }

  if (effect.object === 'REACTION') {
    const columnId = resolveReactionColumnId(effect.adjective);
    if (!columnId) { result.failed = true; return result; }

    const targets = activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame)
      .filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);

    if (targets.length === 0) { result.failed = true; return result; }

    const target = targets.sort((a, b) => a.startFrame - b.startFrame)[0];
    result.clamped.set(target.id, {
      newDuration: Math.max(0, ctx.frame - target.startFrame),
      eventStatus: EventStatusType.CONSUMED,
      sourceOwnerId: ctx.sourceOwnerId,
      sourceSkillName: ctx.sourceSkillName,
    });
    return result;
  }

  // CONSUME SKILL_POINT, ULTIMATE_ENERGY, COOLDOWN, STACKS — resource verbs.
  // These don't produce timeline mutations (resources tracked separately).
  return result;
}

function executeRefresh(effect: Effect, ctx: ExecutionContext): MutationSet {
  const result = emptyMutationSet();
  const ownerId = resolveOwnerId(effect.toObject as string, ctx, effect.toDeterminer);

  const columnId = effect.object === 'INFLICTION'
    ? resolveInflictionColumnId(effect.adjective)
    : effect.object === 'REACTION'
      ? resolveReactionColumnId(effect.adjective)
      : resolveStatusColumnId(effect.objectId);

  if (!columnId) { result.failed = true; return result; }

  const targets = activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame)
    .filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);

  for (const target of targets) {
    result.clamped.set(target.id, {
      newDuration: Math.max(0, ctx.frame - target.startFrame),
      eventStatus: EventStatusType.REFRESHED,
      sourceOwnerId: ctx.sourceOwnerId,
      sourceSkillName: ctx.sourceSkillName,
    });
  }
  return result;
}

function executeExtend(effect: Effect, ctx: ExecutionContext): MutationSet {
  const result = emptyMutationSet();
  const ownerId = resolveOwnerId(effect.onObject as string ?? effect.toObject as string, ctx, effect.onDeterminer ?? effect.toDeterminer);

  const columnId = effect.object === 'INFLICTION'
    ? resolveInflictionColumnId(effect.adjective)
    : resolveStatusColumnId(effect.objectId);

  if (!columnId) { result.failed = true; return result; }

  const targets = activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame)
    .filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);

  // UNTIL END: extend target to the parent event's end frame (never shorten)
  if (effect.until === DURATION_END && ctx.parentEventEndFrame != null) {
    for (const target of targets) {
      const untilDuration = ctx.parentEventEndFrame - target.startFrame;
      if (untilDuration <= eventDuration(target)) continue; // don't shorten
      result.clamped.set(target.id, {
        newDuration: untilDuration,
        eventStatus: EventStatusType.EXTENDED,
        sourceOwnerId: ctx.sourceOwnerId,
        sourceSkillName: ctx.sourceSkillName,
      });
    }
    return result;
  }

  // Standard EXTEND: add duration frames
  const extensionValue = effect.with?.duration?.value;
  const extensionFrames = typeof extensionValue === 'number' ? Math.round(extensionValue * 120) : 0;

  for (const target of targets) {
    result.clamped.set(target.id, {
      newDuration: eventDuration(target) + extensionFrames,
      eventStatus: EventStatusType.EXTENDED,
      sourceOwnerId: ctx.sourceOwnerId,
      sourceSkillName: ctx.sourceSkillName,
    });
  }
  return result;
}

function executeMerge(effect: Effect, ctx: ExecutionContext): MutationSet {
  const result = emptyMutationSet();
  const ownerId = resolveOwnerId(effect.toObject as string, ctx, effect.toDeterminer);

  const columnId = effect.object === 'INFLICTION'
    ? resolveInflictionColumnId(effect.adjective)
    : resolveStatusColumnId(effect.objectId);

  if (!columnId) { result.failed = true; return result; }

  const targets = activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame)
    .filter(ev => ev.eventStatus !== EventStatusType.CONSUMED)
    .sort((a, b) => a.startFrame - b.startFrame);

  // Merge: newer subsumes older — clamp all but the latest
  if (targets.length > 1) {
    for (let i = 0; i < targets.length - 1; i++) {
      result.clamped.set(targets[i].id, {
        newDuration: Math.max(0, ctx.frame - targets[i].startFrame),
        eventStatus: EventStatusType.CONSUMED,
        sourceOwnerId: ctx.sourceOwnerId,
        sourceSkillName: ctx.sourceSkillName,
      });
    }
  }
  return result;
}

function executeReset(effect: Effect, ctx: ExecutionContext): MutationSet {
  const result = emptyMutationSet();
  // RESET STACKS or RESET COOLDOWN — clamp all active instances
  if (effect.object === 'STACKS' && effect.objectId) {
    const columnId = resolveStatusColumnId(effect.objectId);
    const ownerId = resolveOwnerId(effect.toObject as string, ctx, effect.toDeterminer);
    const targets = activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame)
      .filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);

    for (const target of targets) {
      result.clamped.set(target.id, {
        newDuration: Math.max(0, ctx.frame - target.startFrame),
        eventStatus: EventStatusType.CONSUMED,
        sourceOwnerId: ctx.sourceOwnerId,
        sourceSkillName: ctx.sourceSkillName,
      });
    }
  }
  return result;
}

// ── Compound: ALL / ANY ──────────────────────────────────────────────────

function executeAll(effect: Effect, ctx: ExecutionContext): MutationSet {
  const result = emptyMutationSet();
  // Only iterate multiple times when an explicit FOR cardinality is set (e.g. ALL FOR AT_MOST MAX).
  // Without it, ALL executes its predicates once (single pass). Hard cap at 10 for safety.
  const maxIterations = Math.min(
    effect.for
      ? resolveCardinality(effect.for.cardinality, ctx.potential ?? 0)
      : 1,
    10,
  );

  const predicates = effect.predicates ?? [];
  if (predicates.length === 0) return result;

  // Track evolving event state across iterations so that consumed/clamped
  // events from earlier iterations are reflected in later ones.
  let iterationEvents = ctx.events;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let iterationProduced = false;
    const iterCtx = { ...ctx, events: iterationEvents };

    for (const pred of predicates) {
      const condCtx: ConditionContext = {
        events: iterationEvents,
        frame: ctx.frame,
        sourceOwnerId: ctx.sourceOwnerId,
        operatorSlotMap: ctx.operatorSlotMap,
        targetOwnerId: ctx.targetOwnerId,
      };

      if (!evaluateConditions(pred.conditions, condCtx)) continue;

      // Execute all effects in this predicate
      const predResult = emptyMutationSet();
      let anyFailed = false;

      for (const childEffect of pred.effects) {
        const childResult = executeEffect(childEffect, iterCtx);
        if (childResult.failed) { anyFailed = true; break; }
        mergeMutations(predResult, childResult);
      }

      if (anyFailed) continue;

      mergeMutations(result, predResult);
      iterationProduced = true;

      // Update event state for next iteration (apply clamps + add produced)
      iterationEvents = applyMutations(iterationEvents, predResult);
    }

    // If no predicate produced results this iteration, stop
    if (!iterationProduced) break;
  }

  return result;
}

function executeAny(effect: Effect, ctx: ExecutionContext): MutationSet {
  const predicates = effect.predicates ?? [];

  const condCtx: ConditionContext = {
    events: ctx.events,
    frame: ctx.frame,
    sourceOwnerId: ctx.sourceOwnerId,
    operatorSlotMap: ctx.operatorSlotMap,
    targetOwnerId: ctx.targetOwnerId,
  };

  for (const pred of predicates) {
    if (!evaluateConditions(pred.conditions, condCtx)) continue;

    // Execute all effects in this predicate
    const predResult = emptyMutationSet();
    let anyFailed = false;

    for (const childEffect of pred.effects) {
      const childResult = executeEffect(childEffect, ctx);
      if (childResult.failed) { anyFailed = true; break; }
      mergeMutations(predResult, childResult);
    }

    if (anyFailed) continue;

    // ANY: return the first passing predicate's results
    return predResult;
  }

  // No predicate passed — not a failure, just empty
  return emptyMutationSet();
}

// ── Main dispatcher ──────────────────────────────────────────────────────

/**
 * Execute a single Effect and return the resulting mutations.
 * Recurses for ALL/ANY compound effects.
 */
export function executeEffect(effect: Effect, ctx: ExecutionContext): MutationSet {
  switch (effect.verb) {
    case VerbType.ALL:    return executeAll(effect, ctx);
    case VerbType.ANY:    return executeAny(effect, ctx);
    case VerbType.APPLY:  return executeApply(effect, ctx);
    case VerbType.CONSUME: return executeConsume(effect, ctx);
    case VerbType.REFRESH: return executeRefresh(effect, ctx);
    case VerbType.EXTEND:  return executeExtend(effect, ctx);
    case VerbType.MERGE:   return executeMerge(effect, ctx);
    case VerbType.RESET:   return executeReset(effect, ctx);

    // Resource verbs — don't produce timeline mutations
    case VerbType.RECOVER:
    case VerbType.RETURN:
    case VerbType.DEAL:
    case VerbType.HIT:
    case VerbType.DEFEAT:
    case VerbType.IGNORE:
    case VerbType.OVERHEAL:
    case VerbType.EXPERIENCE:
      return emptyMutationSet();

    default:
      return emptyMutationSet();
  }
}

/**
 * Execute a list of effects sequentially, accumulating mutations.
 * If any required effect fails, returns a failed MutationSet.
 */
export function executeEffects(effects: readonly Effect[], ctx: ExecutionContext): MutationSet {
  const result = emptyMutationSet();
  for (const effect of effects) {
    const childResult = executeEffect(effect, ctx);
    if (childResult.failed) return childResult;
    mergeMutations(result, childResult);
  }
  return result;
}

/**
 * Apply a MutationSet to a timeline, producing a new events array.
 * Immutable — returns a new array.
 */
export function applyMutations(events: readonly TimelineEvent[], mutations: MutationSet): TimelineEvent[] {
  const result = events.map(ev => {
    const clamp = mutations.clamped.get(ev.id);
    if (!clamp) return ev;
    const clamped = {
      ...ev,
      eventStatus: clamp.eventStatus,
      eventStatusOwnerId: clamp.sourceOwnerId,
      eventStatusSkillName: clamp.sourceSkillName,
    };
    setEventDuration(clamped, clamp.newDuration);
    return clamped;
  });
  result.push(...mutations.produced);
  return result;
}
