/**
 * Condition evaluator for the DSL effect executor.
 *
 * Evaluates `Interaction[]` conditions (AND'd) against timeline state.
 * Conditions use verbs IS, HAVE, PERFORM, BECOME — they assert state,
 * they don't mutate it.
 */
import { Interaction, CardinalityConstraintType, NounType, DeterminerType, VerbType } from '../../dsl/semantics';
import { getSimpleValue } from '../calculation/valueResolver';
import { TimelineEvent } from '../../consts/viewTypes';
import { ENEMY_OWNER_ID, INFLICTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, REACTION_COLUMNS, SKILL_COLUMNS, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID } from '../../model/channels/index';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { activeEventsAtFrame, activeCountAtFrame } from './timelineQueries';

// ── Column ID resolution ─────────────────────────────────────────────────

const REACTION_TO_COLUMN: Record<string, string> = {
  COMBUSTION:       REACTION_COLUMNS.COMBUSTION,
  SOLIDIFICATION:   REACTION_COLUMNS.SOLIDIFICATION,
  CORROSION:        REACTION_COLUMNS.CORROSION,
  ELECTRIFICATION:  REACTION_COLUMNS.ELECTRIFICATION,
};

const ELEMENT_TO_INFLICTION_COLUMN: Record<string, string> = {
  HEAT:     INFLICTION_COLUMNS.HEAT,
  CRYO:     INFLICTION_COLUMNS.CRYO,
  NATURE:   INFLICTION_COLUMNS.NATURE,
  ELECTRIC: INFLICTION_COLUMNS.ELECTRIC,
};

const SKILL_TYPE_TO_COLUMN: Record<string, string> = {
  BASIC_ATTACK:  SKILL_COLUMNS.BASIC,
  BATTLE_SKILL:  SKILL_COLUMNS.BATTLE,
  COMBO_SKILL:   SKILL_COLUMNS.COMBO,
  ULTIMATE:      SKILL_COLUMNS.ULTIMATE,
};

// ── Context ──────────────────────────────────────────────────────────────

export interface ConditionContext {
  events: readonly TimelineEvent[];
  frame: number;
  sourceOwnerId: string;
  /** Maps operator slot → operator columns (for resolving THIS_OPERATOR etc). */
  operatorSlotMap?: Record<string, string>;
  /** Target operator ID for OTHER/ANY determiner resolution. */
  targetOwnerId?: string;
  /** Operator who matched the primary trigger condition (for TRIGGER determiner). */
  triggerOwnerId?: string;
  /** Live enemy HP percentage query (0–100). Provided by calculationController during queue processing. */
  getEnemyHpPercentage?: (frame: number) => number | null;
  /** Query which operator slot is controlled at a given frame. */
  getControlledSlotAtFrame?: (frame: number) => string;
}

// ── Subject resolution ───────────────────────────────────────────────────

function resolveOwnerId(subject: string, ctx: ConditionContext, determiner?: string): string | undefined {
  if (subject === NounType.OPERATOR || subject === 'OPERATOR') {
    switch (determiner ?? DeterminerType.THIS) {
      case DeterminerType.THIS: return ctx.sourceOwnerId;
      case DeterminerType.ALL: return COMMON_OWNER_ID;
      case DeterminerType.OTHER: return ctx.targetOwnerId ?? undefined;
      case DeterminerType.ANY: return ctx.targetOwnerId ?? undefined; // wildcard if no target
      case DeterminerType.TRIGGER: return ctx.triggerOwnerId ?? ctx.sourceOwnerId;
      case DeterminerType.CONTROLLED:
        return ctx.getControlledSlotAtFrame?.(ctx.frame) ?? ctx.sourceOwnerId;
      default: return ctx.sourceOwnerId;
    }
  }
  switch (subject) {
    case NounType.ENEMY:
    case 'ENEMY': return ENEMY_OWNER_ID;
    default: return ctx.sourceOwnerId;
  }
}

// ── Column resolution for status/infliction objectId ─────────────────────

function resolveColumnIds(object: string, objectId?: string, element?: string): string[] {
  if (object === 'STATUS' && objectId) {
    if (REACTION_TO_COLUMN[objectId]) return [REACTION_TO_COLUMN[objectId]];
    // Status column IDs may be raw SCREAMING_CASE (e.g. "FOCUS") or kebab-case
    // (e.g. "melting-flame"). Return both forms so lookups match either convention.
    const kebab = objectId.toLowerCase().replace(/_/g, '-');
    return kebab !== objectId ? [objectId, kebab] : [objectId];
  }
  if (object === 'INFLICTION') {
    const el = objectId ?? element;
    if (el) { const c = ELEMENT_TO_INFLICTION_COLUMN[el]; return c ? [c] : []; }
    return [];
  }
  if (object === 'REACTION' && objectId) {
    const c = REACTION_TO_COLUMN[objectId]; return c ? [c] : [];
  }
  return [];
}

// ── Evaluators ───────────────────────────────────────────────────────────

function evaluateHave(cond: Interaction, ctx: ConditionContext): boolean {
  // PERCENTAGE_HP: query live HP% from calculationController
  if (cond.object === 'PERCENTAGE_HP') {
    if (!ctx.getEnemyHpPercentage) return false;
    const hpPct = ctx.getEnemyHpPercentage(ctx.frame);
    if (hpPct == null) return false;
    const target = (cond.value ? getSimpleValue(cond.value) : undefined) ?? 100;
    switch (cond.cardinalityConstraint) {
      case CardinalityConstraintType.AT_MOST: return hpPct <= target;
      case CardinalityConstraintType.AT_LEAST: return hpPct >= target;
      case CardinalityConstraintType.EXACTLY: return Math.round(hpPct) === target;
    }
    return false;
  }

  const columnIds = resolveColumnIds(cond.object, cond.objectId, cond.element);
  if (columnIds.length === 0) return false;

  const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
  let count = 0;
  for (const colId of columnIds) {
    count += activeCountAtFrame(ctx.events, colId, ownerId, ctx.frame);
  }

  if (count === 0) return false;

  if (cond.value != null) {
    const target = getSimpleValue(cond.value) ?? 0;
    switch (cond.cardinalityConstraint) {
      case CardinalityConstraintType.EXACTLY: return count === target;
      case CardinalityConstraintType.AT_LEAST: return count >= target;
      case CardinalityConstraintType.AT_MOST: return count <= target;
    }
  }
  return true;
}

function evaluateIs(cond: Interaction, ctx: ConditionContext): boolean {
  // State assertions: check if the subject is in the specified state.
  // Map object qualifier states to their corresponding status columns.
  const stateToColumn: Record<string, string> = {
    COMBUSTED: REACTION_COLUMNS.COMBUSTION,
    SOLIDIFIED: REACTION_COLUMNS.SOLIDIFICATION,
    CORRODED: REACTION_COLUMNS.CORROSION,
    ELECTRIFIED: REACTION_COLUMNS.ELECTRIFICATION,
    BREACHED: PHYSICAL_STATUS_COLUMNS.BREACH,
    LIFTED: PHYSICAL_STATUS_COLUMNS.LIFT,
    KNOCKED_DOWN: PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    CRUSHED: PHYSICAL_STATUS_COLUMNS.CRUSH,
    NODE_STAGGERED: NODE_STAGGER_COLUMN_ID,
    FULL_STAGGERED: FULL_STAGGER_COLUMN_ID,
  };

  if (cond.object === 'ACTIVE') {
    // Check if the subject has any active skill events at this frame
    const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
    for (const col of Object.values(SKILL_COLUMNS)) {
      if (activeCountAtFrame(ctx.events, col, ownerId, ctx.frame) > 0) return true;
    }
    return false;
  }

  if (cond.object === 'CONTROLLED') {
    // "THIS OPERATOR IS CONTROLLED" — check if this operator is the controlled operator at this frame
    const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
    if (!ctx.getControlledSlotAtFrame || !ownerId) return false;
    const result = ctx.getControlledSlotAtFrame(ctx.frame) === ownerId;
    return cond.negated ? !result : result;
  }

  const columnId = stateToColumn[cond.object];
  if (!columnId) return false;

  const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
  const active = activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame);
  const result = active.length > 0;
  return cond.negated ? !result : result;
}

function evaluateBecome(cond: Interaction, ctx: ConditionContext): boolean {
  // BECOME STACKS: count-based transition — current count meets cardinality AND differs from previous.
  // e.g. MF III → MF IV triggers, MF IV → MF IV does not.
  if (cond.object === 'STATUS' || cond.object === 'STACKS') {
    const columnIds = resolveColumnIds(cond.object === 'STACKS' ? 'STATUS' : cond.object, cond.objectId, cond.element);
    if (columnIds.length === 0) return false;
    const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
    let countNow = 0;
    let countBefore = 0;
    for (const colId of columnIds) {
      countNow += activeCountAtFrame(ctx.events, colId, ownerId, ctx.frame);
      if (ctx.frame > 0) countBefore += activeCountAtFrame(ctx.events, colId, ownerId, ctx.frame - 1);
    }
    if (countNow === countBefore) return false;
    if (cond.value != null) {
      const target = getSimpleValue(cond.value) ?? 0;
      switch (cond.cardinalityConstraint) {
        case CardinalityConstraintType.EXACTLY: return countNow === target;
        case CardinalityConstraintType.AT_LEAST: return countNow >= target;
        case CardinalityConstraintType.AT_MOST: return countNow <= target;
      }
    }
    return true;
  }

  // State transition: active at current frame AND not active at previous frame.
  const stateToColumn: Record<string, string> = {
    COMBUSTED: REACTION_COLUMNS.COMBUSTION,
    SOLIDIFIED: REACTION_COLUMNS.SOLIDIFICATION,
    CORRODED: REACTION_COLUMNS.CORROSION,
    ELECTRIFIED: REACTION_COLUMNS.ELECTRIFICATION,
    BREACHED: PHYSICAL_STATUS_COLUMNS.BREACH,
    LIFTED: PHYSICAL_STATUS_COLUMNS.LIFT,
    KNOCKED_DOWN: PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    CRUSHED: PHYSICAL_STATUS_COLUMNS.CRUSH,
    NODE_STAGGERED: NODE_STAGGER_COLUMN_ID,
    FULL_STAGGERED: FULL_STAGGER_COLUMN_ID,
  };

  if (cond.object === 'ACTIVE') {
    const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
    const activeNow = Object.values(SKILL_COLUMNS).some(
      col => activeCountAtFrame(ctx.events, col, ownerId, ctx.frame) > 0,
    );
    if (!activeNow) return false;
    const activeBefore = ctx.frame > 0 && Object.values(SKILL_COLUMNS).some(
      col => activeCountAtFrame(ctx.events, col, ownerId, ctx.frame - 1) > 0,
    );
    return !activeBefore;
  }

  const columnId = stateToColumn[cond.object];
  if (!columnId) return false;

  const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
  const activeNow = activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame).length > 0;
  if (!activeNow) return false;
  const activeBefore = ctx.frame > 0
    && activeEventsAtFrame(ctx.events, columnId, ownerId, ctx.frame - 1).length > 0;
  return !activeBefore;
}

function evaluateReceive(cond: Interaction, ctx: ConditionContext): boolean {
  // RECEIVE: check if a matching status/infliction/reaction event starts at exactly this frame.
  const columnIds = resolveColumnIds(cond.object, cond.objectId, cond.element);
  if (columnIds.length === 0) return false;

  const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
  return ctx.events.some(ev =>
    columnIds.includes(ev.columnId) &&
    (ownerId == null || ev.ownerId === ownerId) &&
    ev.startFrame === ctx.frame
  );
}

function evaluatePerform(cond: Interaction, ctx: ConditionContext): boolean {
  // PERFORM conditions check if a skill event exists at/before this frame.
  // This is primarily used for trigger matching, not condition evaluation.
  const columnId = SKILL_TYPE_TO_COLUMN[cond.object];
  if (!columnId) return false;

  const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
  return ctx.events.some(ev =>
    ev.columnId === columnId &&
    (ownerId == null || ev.ownerId === ownerId) &&
    ev.startFrame <= ctx.frame
  );
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Evaluate a single interaction condition against the current timeline state.
 */
export function evaluateInteraction(cond: Interaction, ctx: ConditionContext): boolean {
  let result: boolean;

  const verb = cond.verb as string;
  switch (verb) {
    case 'HAVE': result = evaluateHave(cond, ctx); break;
    case 'IS': result = evaluateIs(cond, ctx); break;
    case 'PERFORM': result = evaluatePerform(cond, ctx); break;
    case 'BECOME': result = evaluateBecome(cond, ctx); break;
    case 'RECEIVE': result = evaluateReceive(cond, ctx); break;
    default: result = false;
  }

  // Apply negation (IS handles its own negation for state checks)
  if (cond.negated && cond.verb !== VerbType.IS) return !result;
  return result;
}

/**
 * Evaluate a list of conditions (AND'd). All must pass.
 * An empty conditions array passes unconditionally.
 */
export function evaluateConditions(conditions: readonly Interaction[], ctx: ConditionContext): boolean {
  if (conditions.length === 0) return true;
  return conditions.every(c => evaluateInteraction(c, ctx));
}
