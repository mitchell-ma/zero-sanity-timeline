/**
 * Condition evaluator for the DSL effect executor.
 *
 * Evaluates `Interaction[]` conditions (AND'd) against timeline state.
 * Conditions use verbs IS, HAVE, PERFORM, BECOME — they assert state,
 * they don't mutate it.
 */
import { Interaction, CardinalityConstraintType, NounType, DeterminerType, VerbType, AdjectiveType, type ValueNode } from '../../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';
import { UnitType } from '../../consts/enums';
import { TimelineEvent } from '../../consts/viewTypes';
import { ENEMY_OWNER_ID, INFLICTION_COLUMNS, PHYSICAL_INFLICTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, PHYSICAL_STATUS_COLUMN_IDS, REACTION_COLUMNS, REACTION_STATUS_TO_COLUMN, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, SKILL_COLUMN_ORDER } from '../../model/channels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { activeEventsAtFrame, activeCountAtFrame } from './timelineQueries';

// ── Column ID resolution ─────────────────────────────────────────────────

const ELEMENT_TO_INFLICTION_COLUMN: Record<string, string> = {
  HEAT:       INFLICTION_COLUMNS.HEAT,
  CRYO:       INFLICTION_COLUMNS.CRYO,
  NATURE:     INFLICTION_COLUMNS.NATURE,
  ELECTRIC:   INFLICTION_COLUMNS.ELECTRIC,
  VULNERABLE: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
};

const SKILL_TYPE_TO_COLUMN: Record<string, string> = {
  BASIC_ATTACK:  NounType.BASIC_ATTACK,
  BATTLE_SKILL:  NounType.BATTLE,
  COMBO_SKILL:   NounType.COMBO,
  ULTIMATE:      NounType.ULTIMATE,
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
  /** Operator potential level (0–5) for HAVE POTENTIAL conditions. */
  potential?: number;
  /** User-supplied parameter values (e.g. { ENEMY_HIT: 2 }). */
  suppliedParameters?: Record<string, number>;
  /** Get operator flat HP at frame. */
  getOperatorFlatHp?: (operatorId: string, frame: number) => number;
  /** Get operator HP as percentage (0–100) at frame. */
  getOperatorPercentageHp?: (operatorId: string, frame: number) => number;
  /** Owner ID of the parent status event (for THIS EVENT resolution in trigger contexts). */
  parentStatusOwnerId?: string;
}

// ── Subject resolution ───────────────────────────────────────────────────

function resolveOwnerId(subject: string, ctx: ConditionContext, determiner?: string): string | undefined {
  if (subject === NounType.OPERATOR) {
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
    case NounType.EVENT: return ctx.parentStatusOwnerId ?? ctx.sourceOwnerId;
    case NounType.ENEMY: return ENEMY_OWNER_ID;
    case NounType.TEAM: return COMMON_OWNER_ID;
    default: return ctx.sourceOwnerId;
  }
}

// ── Column resolution for status/infliction objectId ─────────────────────

export function resolveColumnIds(object: string, objectId?: string, qualifier?: string): string[] {
  // Direct object form: object=INFLICTION qualifier=ARTS → all arts infliction columns
  if (object === NounType.INFLICTION) {
    if (qualifier === AdjectiveType.ARTS) return Object.values(INFLICTION_COLUMNS);
    if (qualifier) { const c = ELEMENT_TO_INFLICTION_COLUMN[qualifier]; return c ? [c] : []; }
    return Object.values(INFLICTION_COLUMNS);
  }
  if (object !== NounType.STATUS || !objectId) return [];

  // Category-based: objectId is the category, qualifier narrows it
  if (objectId === NounType.INFLICTION) {
    if (qualifier === AdjectiveType.ARTS) return Object.values(INFLICTION_COLUMNS);
    if (qualifier) { const c = ELEMENT_TO_INFLICTION_COLUMN[qualifier]; return c ? [c] : []; }
    return Object.values(INFLICTION_COLUMNS);
  }
  if (objectId === NounType.REACTION) {
    if (qualifier) { const c = REACTION_STATUS_TO_COLUMN[qualifier]; return c ? [c] : []; }
    return Object.values(REACTION_COLUMNS);
  }
  if (objectId === AdjectiveType.PHYSICAL) {
    if (qualifier) return [qualifier];
    return Array.from(PHYSICAL_STATUS_COLUMN_IDS);
  }

  // Specific status ID — qualifier doesn't affect column resolution
  return [objectId];
}

// ── Threshold resolution ─────────────────────────────────────────────────

/** Extract target value and constraint from a condition, supporting both direct (value/cardinalityConstraint) and with-based (with.value ValueNode) formats. */
function resolveConditionThreshold(cond: Interaction): { target: number; constraint?: string } {
  const withBlock = (cond as unknown as Record<string, unknown>).with as Record<string, unknown> | undefined;
  const rawValue = cond.value ?? withBlock?.value;
  const target = (rawValue ? resolveValueNode(rawValue as ValueNode, DEFAULT_VALUE_CONTEXT) : undefined) ?? 0;
  return { target, constraint: cond.cardinalityConstraint };
}

// ── Evaluators ───────────────────────────────────────────────────────────

function evaluateParameter(cond: Interaction, ctx: ConditionContext): boolean {
  const paramName = (cond as unknown as Record<string, unknown>).subjectId as string ?? cond.object as string;
  const paramValue = ctx.suppliedParameters?.[paramName] ?? 0;
  // Target comes from cond.value (standard) or cond.with.value (extended form)
  const withBlock = (cond as unknown as Record<string, unknown>).with as Record<string, unknown> | undefined;
  const targetNode = cond.value ?? withBlock?.value;
  const target = targetNode ? resolveValueNode(targetNode as unknown as ValueNode, DEFAULT_VALUE_CONTEXT) : undefined;
  if (target == null) return false;
  const constraint = cond.cardinalityConstraint ?? cond.verb;
  switch (constraint) {
    case CardinalityConstraintType.GREATER_THAN: return paramValue > target;
    case CardinalityConstraintType.GREATER_THAN_EQUAL: return paramValue >= target;
    case CardinalityConstraintType.LESS_THAN: return paramValue < target;
    case CardinalityConstraintType.LESS_THAN_EQUAL: return paramValue <= target;
    case CardinalityConstraintType.EXACTLY: return paramValue === target;
  }
  return paramValue >= target;
}

function evaluateHave(cond: Interaction, ctx: ConditionContext): boolean {
  // POTENTIAL: check operator potential level
  if (cond.object === NounType.POTENTIAL) {
    const pot = ctx.potential ?? 0;
    const { target, constraint } = resolveConditionThreshold(cond);
    switch (constraint) {
      case CardinalityConstraintType.GREATER_THAN: return pot > target;
      case CardinalityConstraintType.GREATER_THAN_EQUAL: return pot >= target;
      case CardinalityConstraintType.LESS_THAN: return pot < target;
      case CardinalityConstraintType.LESS_THAN_EQUAL: return pot <= target;
      case CardinalityConstraintType.EXACTLY: return pot === target;
    }
    return pot >= target;
  }

  // HP with FULL qualifier: check if operator is at max HP
  // HP with value+unit PERCENTAGE: check operator HP% threshold
  if (cond.object === NounType.HP) {
    const qualifier = (cond as unknown as Record<string, unknown>).objectQualifier as string | undefined;
    if (qualifier === AdjectiveType.FULL) {
      const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
      if (!ownerId || !ctx.getOperatorPercentageHp) return true; // default to full if no tracker
      return ctx.getOperatorPercentageHp(ownerId, ctx.frame) >= 100;
    }
    // Value+unit PERCENTAGE pattern: HAVE HP LESS_THAN_EQUAL/GREATER_THAN_EQUAL N (UNIT PERCENTAGE)
    const withBlock = (cond as unknown as Record<string, unknown>).with as Record<string, unknown> | undefined;
    const valueWrapper = withBlock?.value as Record<string, unknown> | undefined;
    if (valueWrapper?.unit === UnitType.PERCENTAGE) {
      const innerValue = valueWrapper.value as Record<string, unknown> | undefined;
      const target = innerValue ? resolveValueNode(innerValue as unknown as ValueNode, DEFAULT_VALUE_CONTEXT) ?? 100 : 100;
      // Route by subject: ENEMY → enemy HP tracker, OPERATOR → operator HP tracker
      const isEnemy = cond.subject === NounType.ENEMY;
      let hpPct: number;
      if (isEnemy) {
        if (!ctx.getEnemyHpPercentage) return false;
        const pct = ctx.getEnemyHpPercentage(ctx.frame);
        if (pct == null) return false;
        hpPct = pct;
      } else {
        const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
        if (!ownerId || !ctx.getOperatorPercentageHp) return true;
        hpPct = ctx.getOperatorPercentageHp(ownerId, ctx.frame);
      }
      switch (cond.cardinalityConstraint) {
        case CardinalityConstraintType.GREATER_THAN: return hpPct > target;
        case CardinalityConstraintType.GREATER_THAN_EQUAL: return hpPct >= target;
        case CardinalityConstraintType.LESS_THAN: return hpPct < target;
        case CardinalityConstraintType.LESS_THAN_EQUAL: return hpPct <= target;
        case CardinalityConstraintType.EXACTLY: return Math.round(hpPct) === target;
      }
      return false;
    }
    return false;
  }

  // PERCENTAGE_HP: query live HP% from calculationController
  if (cond.object === NounType.PERCENTAGE_HP) {
    if (!ctx.getEnemyHpPercentage) return false;
    const hpPct = ctx.getEnemyHpPercentage(ctx.frame);
    if (hpPct == null) return false;
    const target = (cond.value ? resolveValueNode(cond.value!, DEFAULT_VALUE_CONTEXT) : undefined) ?? 100;
    switch (cond.cardinalityConstraint) {
      case CardinalityConstraintType.GREATER_THAN: return hpPct > target;
      case CardinalityConstraintType.GREATER_THAN_EQUAL: return hpPct >= target;
      case CardinalityConstraintType.LESS_THAN: return hpPct < target;
      case CardinalityConstraintType.LESS_THAN_EQUAL: return hpPct <= target;
      case CardinalityConstraintType.EXACTLY: return Math.round(hpPct) === target;
    }
    return false;
  }

  const columnIds = resolveColumnIds(cond.object, cond.objectId, cond.objectQualifier);
  if (columnIds.length === 0) return false;

  const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
  let count = 0;
  for (const colId of columnIds) {
    count += activeCountAtFrame(ctx.events, colId, ownerId, ctx.frame);
  }

  if (count === 0) return false;

  const condValue = cond.value ?? (cond as unknown as { with?: { value?: ValueNode } }).with?.value;
  if (condValue != null) {
    const target = resolveValueNode(condValue as ValueNode, DEFAULT_VALUE_CONTEXT) ?? 0;
    switch (cond.cardinalityConstraint) {
      case CardinalityConstraintType.EXACTLY: return count === target;
      case CardinalityConstraintType.GREATER_THAN: return count > target;
      case CardinalityConstraintType.GREATER_THAN_EQUAL: return count >= target;
      case CardinalityConstraintType.LESS_THAN: return count < target;
      case CardinalityConstraintType.LESS_THAN_EQUAL: return count <= target;
      default: return count === target;
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

  if (cond.object === NounType.ACTIVE) {
    // Check if the subject has any active skill events at this frame
    const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
    for (const col of SKILL_COLUMN_ORDER) {
      if (activeCountAtFrame(ctx.events, col, ownerId, ctx.frame) > 0) return true;
    }
    return false;
  }

  if (cond.object === NounType.CONTROLLED_STATE) {
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
  // For external monitoring (e.g. combo watches AUXILIARY_CRYSTAL), use of clause
  // to resolve the possessor (whose status to check).
  if (cond.object === NounType.STATUS || cond.object === NounType.STACKS) {
    const statusId = cond.subjectId ?? cond.objectId;
    const columnIds = resolveColumnIds(cond.object === NounType.STACKS ? NounType.STATUS : cond.object, statusId, cond.objectQualifier);
    if (columnIds.length === 0) return false;
    // Use of clause for possessor resolution if available, otherwise fall back to subject
    const ownerSubject = cond.of?.object ?? cond.subject;
    const ownerDeterminer = cond.of?.determiner ?? cond.subjectDeterminer;
    const ownerId = resolveOwnerId(ownerSubject as string, ctx, ownerDeterminer);
    let countNow = 0;
    let countBefore = 0;
    for (const colId of columnIds) {
      // Use the stacks field of the latest active event when available (counter pattern),
      // otherwise fall back to the number of active events.
      const activeNow = activeEventsAtFrame(ctx.events, colId, ownerId, ctx.frame);
      const lastNow = activeNow.length > 0 ? activeNow[activeNow.length - 1] : undefined;
      countNow += lastNow?.stacks != null ? lastNow.stacks : activeNow.length;
      if (ctx.frame > 0) {
        const activeBefore = activeEventsAtFrame(ctx.events, colId, ownerId, ctx.frame - 1);
        const lastBefore = activeBefore.length > 0 ? activeBefore[activeBefore.length - 1] : undefined;
        countBefore += lastBefore?.stacks != null ? lastBefore.stacks : activeBefore.length;
      }
    }
    if (countNow === countBefore) return false;
    if (cond.value != null) {
      const valueCtx = ctx.potential != null ? { ...DEFAULT_VALUE_CONTEXT, potential: ctx.potential } : DEFAULT_VALUE_CONTEXT;
      const target = resolveValueNode(cond.value!, valueCtx) ?? 0;
      switch (cond.cardinalityConstraint) {
        case CardinalityConstraintType.EXACTLY: return countNow === target;
        case CardinalityConstraintType.GREATER_THAN: return countNow > target;
        case CardinalityConstraintType.GREATER_THAN_EQUAL: return countNow >= target;
        case CardinalityConstraintType.LESS_THAN: return countNow < target;
        case CardinalityConstraintType.LESS_THAN_EQUAL: return countNow <= target;
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

  if (cond.object === NounType.ACTIVE) {
    const ownerId = resolveOwnerId(cond.subject, ctx, cond.subjectDeterminer);
    const activeNow = SKILL_COLUMN_ORDER.some(
      col => activeCountAtFrame(ctx.events, col, ownerId, ctx.frame) > 0,
    );
    if (!activeNow) return false;
    const activeBefore = ctx.frame > 0 && SKILL_COLUMN_ORDER.some(
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
  const columnIds = resolveColumnIds(cond.object, cond.objectId, cond.objectQualifier);
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
  const columnId = SKILL_TYPE_TO_COLUMN[cond.object];
  if (!columnId) {
    // Frame-type PERFORM targets (FINAL_STRIKE, FINISHER, DIVE) don't map to
    // columns — they're validated by the trigger frame finder. If we reached
    // condition evaluation at this frame, the PERFORM is inherently satisfied.
    return true;
  }

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
  // PARAMETER conditions are subject-based, not verb-based
  if ((cond.subject as string) === NounType.PARAMETER) {
    const result = evaluateParameter(cond, ctx);
    return cond.negated ? !result : result;
  }

  let result: boolean;

  const verb = cond.verb as string;
  switch (verb) {
    case VerbType.HAVE: result = evaluateHave(cond, ctx); break;
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
