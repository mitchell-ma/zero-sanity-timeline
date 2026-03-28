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
} from '../../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT, buildContextForSkillColumn } from '../calculation/valueResolver';
import type { ValueNode } from '../../dsl/semantics';
import type { ValueResolutionContext } from '../calculation/valueResolver';
import { TimelineEvent, durationSegment, setEventDuration } from '../../consts/viewTypes';
import { FPS } from '../../utils/timeline';
import { CritMode, EventStatusType } from '../../consts/enums';
import { ENEMY_OWNER_ID, INFLICTION_COLUMNS, REACTION_STATUS_TO_COLUMN } from '../../model/channels/index';
import { statusIdToColumnId } from './triggerMatch';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { evaluateConditions, ConditionContext } from './conditionEvaluator';
import { activeEventsAtFrame, activeInflictionsOfElement } from './timelineQueries';
import { LoadoutProperties } from '../../view/InformationPane';
import { genEventUid } from './inputEventController';
import { allocDerivedEvent } from './objectPool';

// ── Types ────────────────────────────────────────────────────────────────

/** Information about a clamped (shortened/consumed) event. */
export interface ClampInfo {
  /** New duration in frames (shortened to clampFrame - startFrame). */
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
  /** Events to clamp (shorten duration), keyed by event UID. */
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
  /** Counter for generating unique event UIDs within a single execution. */
  idCounter: number;
  /** End frame of the parent status event (for EXTEND UNTIL END). */
  parentEventEndFrame?: number;
  /** Target operator ID for OTHER/ANY determiner resolution. */
  targetOwnerId?: string;
  /** Operator who triggered the effect (for TRIGGER determiner). */
  triggerOwnerId?: string;
  /** Query which operator slot is controlled at a given frame. */
  getControlledSlotAtFrame?: (frame: number) => string;
  /** CritMode for resolving CHANCE verbs. */
  critMode?: CritMode;
  /** Cumulative chance multiplier for EXPECTED mode (default 1.0). */
  chanceMultiplier?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function emptyMutationSet(): MutationSet {
  return { produced: [], clamped: new Map(), failed: false };
}


function buildValueContext(ctx: ExecutionContext): ValueResolutionContext {
  const loadout = ctx.loadoutProperties?.[ctx.sourceOwnerId];
  const baseCtx = buildContextForSkillColumn(loadout, NounType.BATTLE_SKILL);
  // Override potential from execution context if provided (e.g. cross-operator effects)
  if (ctx.potential != null) baseCtx.potential = ctx.potential;
  return baseCtx;
}

function resolveWith(node: ValueNode | undefined, ctx: ExecutionContext): number | undefined {
  if (!node) return undefined;
  return resolveValueNode(node, buildValueContext(ctx)) * (ctx.chanceMultiplier ?? 1);
}

/** Merge source MutationSet into target (in place). */
function mergeMutations(target: MutationSet, source: MutationSet) {
  target.produced.push(...source.produced);
  source.clamped.forEach((info, id) => {
    target.clamped.set(id, info);
  });
}

function resolveOwnerId(target: string | undefined, ctx: ExecutionContext, determiner?: string): string {
  if (target === NounType.OPERATOR) {
    switch (determiner ?? DeterminerType.THIS) {
      case DeterminerType.THIS: return ctx.sourceOwnerId;
      case DeterminerType.ALL: return COMMON_OWNER_ID;
      case DeterminerType.OTHER: return ctx.targetOwnerId ?? ctx.sourceOwnerId;
      case DeterminerType.ANY: return ctx.targetOwnerId ?? ctx.sourceOwnerId;
      case DeterminerType.CONTROLLED:
        return ctx.getControlledSlotAtFrame?.(ctx.frame) ?? ctx.sourceOwnerId;
      case DeterminerType.TRIGGER: return ctx.triggerOwnerId ?? ctx.sourceOwnerId;
      case DeterminerType.SOURCE: return ctx.sourceOwnerId;
      default: return ctx.sourceOwnerId;
    }
  }
  switch (target) {
    case NounType.ENEMY: return ENEMY_OWNER_ID;
    default: {
      if (target && ctx.operatorSlotMap) {
        const slotId = ctx.operatorSlotMap[target.toLowerCase()];
        if (slotId) return slotId;
      }
      return ctx.sourceOwnerId;
    }
  }
}

/** Resolve cardinality, handling THRESHOLD_MAX → potential-based max, ValueNode → number. */
function resolveCardinality(
  cardinality: ValueNode | typeof THRESHOLD_MAX | undefined,
  potential: number,
  defaultMax = 999,
): number {
  if (cardinality === THRESHOLD_MAX) {
    // MAX is potential-dependent; without explicit max map, use a reasonable default.
    // In practice, the caller provides the resolved max from operator JSON.
    return defaultMax;
  }
  if (cardinality != null && typeof cardinality === 'object') {
    return resolveValueNode(cardinality, DEFAULT_VALUE_CONTEXT) ?? defaultMax;
  }
  return defaultMax;
}

// ── Column ID resolution ─────────────────────────────────────────────────

const ELEMENT_TO_INFLICTION_COLUMN: Record<string, string> = {
  HEAT:     INFLICTION_COLUMNS.HEAT,
  CRYO:     INFLICTION_COLUMNS.CRYO,
  NATURE:   INFLICTION_COLUMNS.NATURE,
  ELECTRIC: INFLICTION_COLUMNS.ELECTRIC,
};


function resolveInflictionColumnId(objectQualifier?: AdjectiveType | AdjectiveType[]): string | undefined {
  const adj = Array.isArray(objectQualifier) ? objectQualifier[0] : objectQualifier;
  if (!adj) return undefined;
  return ELEMENT_TO_INFLICTION_COLUMN[adj];
}

function resolveReactionColumnId(objectQualifier?: AdjectiveType | AdjectiveType[]): string | undefined {
  const adj = Array.isArray(objectQualifier) ? objectQualifier[0] : objectQualifier;
  if (!adj) return undefined;
  return REACTION_STATUS_TO_COLUMN[adj];
}

// ── Verb Handlers ────────────────────────────────────────────────────────

function executeApply(effect: Effect, ctx: ExecutionContext): MutationSet {
  const result = emptyMutationSet();
  const ownerId = resolveOwnerId(effect.to as string, ctx, effect.toDeterminer);

  if (effect.object === NounType.INFLICTION) {
    const columnId = resolveInflictionColumnId(effect.objectQualifier);
    if (!columnId) { result.failed = true; return result; }

    const durationValue = resolveWith(effect.with?.duration, ctx);
    const duration = durationValue != null ? Math.round(durationValue * FPS) : FPS;

    const ev = allocDerivedEvent();
    ev.uid = `infliction-${genEventUid()}`;
    ev.id = effect.objectId ?? String(effect.objectQualifier);
    ev.name = effect.objectId ?? String(effect.objectQualifier);
    ev.ownerId = ownerId;
    ev.columnId = columnId;
    ev.startFrame = ctx.frame;
    ev.segments = durationSegment(duration);
    ev.sourceOwnerId = ctx.sourceOwnerId;
    ev.sourceSkillName = ctx.sourceSkillName;
    result.produced.push(ev);
    return result;
  }

  if (effect.object === NounType.STATUS) {
    const skipTeamCheck = effect.to != null && effect.to !== NounType.TEAM;
    const columnId = statusIdToColumnId(effect.objectId ?? '', skipTeamCheck);

    const durationValue = resolveWith(effect.with?.duration, ctx);
    const duration = durationValue != null ? Math.round(durationValue * FPS) : 2400;

    const ev = allocDerivedEvent();
    ev.uid = `status-${genEventUid()}`;
    ev.id = effect.objectId ?? 'UNKNOWN_STATUS';
    ev.name = effect.objectId ?? 'UNKNOWN_STATUS';
    ev.ownerId = ownerId;
    ev.columnId = columnId;
    ev.startFrame = ctx.frame;
    ev.segments = durationSegment(duration);
    ev.sourceOwnerId = ctx.sourceOwnerId;
    ev.sourceSkillName = ctx.sourceSkillName;
    result.produced.push(ev);
    return result;
  }

  if (effect.object === NounType.REACTION) {
    const columnId = resolveReactionColumnId(effect.objectQualifier);
    if (!columnId) { result.failed = true; return result; }

    const durationValue = resolveWith(effect.with?.duration, ctx);
    const duration = durationValue != null ? Math.round(durationValue * FPS) : 2400;
    const stacksValue = resolveWith(effect.with?.stacks, ctx);

    const ev = allocDerivedEvent();
    ev.uid = `reaction-${genEventUid()}`;
    ev.id = String(effect.objectQualifier);
    ev.name = String(effect.objectQualifier);
    ev.ownerId = ownerId;
    ev.columnId = columnId;
    ev.startFrame = ctx.frame;
    ev.segments = durationSegment(duration);
    ev.sourceOwnerId = ctx.sourceOwnerId;
    ev.sourceSkillName = ctx.sourceSkillName;
    ev.stacks = typeof stacksValue === 'number' ? stacksValue : undefined;
    result.produced.push(ev);
    return result;
  }

  // Fallback for other APPLY targets
  result.failed = true;
  return result;
}

function executeConsume(effect: Effect, ctx: ExecutionContext): MutationSet {
  const result = emptyMutationSet();
  const ownerId = resolveOwnerId(effect.fromObject as string ?? effect.to as string, ctx, effect.fromDeterminer ?? effect.toDeterminer);

  if (effect.object === NounType.INFLICTION) {
    const columnId = resolveInflictionColumnId(effect.objectQualifier);
    if (!columnId) { result.failed = true; return result; }

    const targets = activeInflictionsOfElement(ctx.events, columnId, ctx.frame);
    if (targets.length === 0) { result.failed = true; return result; }

    // Consume the oldest active infliction
    const target = targets.sort((a, b) => a.startFrame - b.startFrame)[0];
    result.clamped.set(target.uid, {
      newDuration: Math.max(0, ctx.frame - target.startFrame),
      eventStatus: EventStatusType.CONSUMED,
      sourceOwnerId: ctx.sourceOwnerId,
      sourceSkillName: ctx.sourceSkillName,
    });
    return result;
  }

  if (effect.object === NounType.STATUS) {
    const skipTeamCheck = (effect.fromObject ?? effect.to) != null && (effect.fromObject ?? effect.to) !== NounType.TEAM;
    const columnId = statusIdToColumnId(effect.objectId ?? '', skipTeamCheck);
    const targets = activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame)
      .filter(ev => ev.eventStatus !== EventStatusType.CONSUMED)
      .sort((a, b) => a.startFrame - b.startFrame);

    if (targets.length === 0) { result.failed = true; return result; }

    // If stacks is specified, consume that many stacks (oldest first);
    // otherwise consume all active stacks.
    const consumeCount = resolveWith(effect.with?.stacks, ctx) ?? targets.length;
    const toConsume = targets.slice(0, consumeCount);
    for (const target of toConsume) {
      result.clamped.set(target.uid, {
        newDuration: Math.max(0, ctx.frame - target.startFrame),
        eventStatus: EventStatusType.CONSUMED,
        sourceOwnerId: ctx.sourceOwnerId,
        sourceSkillName: ctx.sourceSkillName,
      });
    }
    return result;
  }

  if (effect.object === NounType.REACTION) {
    const columnId = resolveReactionColumnId(effect.objectQualifier);
    if (!columnId) { result.failed = true; return result; }

    const targets = activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame)
      .filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);

    if (targets.length === 0) { result.failed = true; return result; }

    const target = targets.sort((a, b) => a.startFrame - b.startFrame)[0];
    result.clamped.set(target.uid, {
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

function executeReset(effect: Effect, ctx: ExecutionContext): MutationSet {
  const result = emptyMutationSet();
  // RESET STACKS or RESET COOLDOWN — clamp all active instances
  if (effect.object === NounType.STACKS && effect.objectId) {
    const skipTeamCheck = effect.to != null && effect.to !== NounType.TEAM;
    const columnId = statusIdToColumnId(effect.objectId ?? '', skipTeamCheck);
    const ownerId = resolveOwnerId(effect.to as string, ctx, effect.toDeterminer);
    const targets = activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame)
      .filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);

    for (const target of targets) {
      result.clamped.set(target.uid, {
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
  // Iterate multiple times when an explicit cardinality is set (e.g. ALL AT_MOST MAX, ALL FOR AT_MOST 4).
  // Without it, ALL executes its predicates once (single pass). Hard cap at 10 for safety.
  const explicitCardinality = effect.for?.value ?? effect.value;
  const maxIterations = Math.min(
    explicitCardinality != null
      ? resolveCardinality(explicitCardinality, ctx.potential ?? 0)
      : 1,
    10,
  );

  // Support both predicated (conditions + effects) and flat (effects only) forms.
  // Flat effects are treated as a single unconditional predicate.
  const predicates = effect.predicates ??
    (effect.effects?.length ? [{ conditions: [], effects: effect.effects }] : []);
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
        getControlledSlotAtFrame: ctx.getControlledSlotAtFrame,
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
    getControlledSlotAtFrame: ctx.getControlledSlotAtFrame,
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

// ── Compound: CHANCE ─────────────────────────────────────────────────────

function executeChance(effect: Effect, ctx: ExecutionContext): MutationSet {
  const childEffects = effect.effects ?? [];
  if (childEffects.length === 0) return emptyMutationSet();

  const chanceNode = effect.with?.value;
  const chance = chanceNode
    ? resolveValueNode(chanceNode, buildValueContext(ctx))
    : 1;
  const critMode = ctx.critMode ?? CritMode.EXPECTED;

  let shouldExecute: boolean;
  let childChanceMultiplier = ctx.chanceMultiplier ?? 1;

  switch (critMode) {
    case CritMode.ALWAYS:     shouldExecute = true; break;
    case CritMode.NEVER:      shouldExecute = false; break;
    case CritMode.SIMULATION: shouldExecute = Math.random() < chance; break;
    case CritMode.EXPECTED:
      shouldExecute = true;
      childChanceMultiplier *= chance;
      break;
  }

  if (!shouldExecute) return emptyMutationSet();

  const result = emptyMutationSet();
  const childCtx = { ...ctx, chanceMultiplier: childChanceMultiplier };
  for (const child of childEffects) {
    const childResult = executeEffect(child, childCtx);
    if (childResult.failed) return childResult;
    mergeMutations(result, childResult);
  }
  return result;
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
    case VerbType.CHANCE: return executeChance(effect, ctx);
    case VerbType.APPLY:  return executeApply(effect, ctx);
    case VerbType.CONSUME: return executeConsume(effect, ctx);
    case VerbType.RESET:   return executeReset(effect, ctx);

    // Resource verbs and verbs handled by the interpretor — no timeline mutations here
    case VerbType.REFRESH:
    case VerbType.EXTEND:
    case VerbType.MERGE:
    case VerbType.RECOVER:
    case VerbType.RETURN:
    case VerbType.DEAL:
    case VerbType.HIT:
    case VerbType.DEFEAT:
    case VerbType.IGNORE:
    case VerbType.OVERHEAL:
    case VerbType.EXPERIENCE:
    case VerbType.REDUCE:
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
    const clamp = mutations.clamped.get(ev.uid);
    if (!clamp) return ev;
    ev.eventStatus = clamp.eventStatus;
    ev.eventStatusOwnerId = clamp.sourceOwnerId;
    ev.eventStatusSkillName = clamp.sourceSkillName;
    setEventDuration(ev, clamp.newDuration);
    return ev;
  });
  result.push(...mutations.produced);
  return result;
}
