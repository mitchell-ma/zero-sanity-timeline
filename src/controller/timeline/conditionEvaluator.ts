/**
 * Condition evaluator for the DSL effect executor.
 *
 * Evaluates `Interaction[]` conditions (AND'd) against timeline state.
 * Conditions use verbs IS, HAVE, PERFORM, BECOME — they assert state,
 * they don't mutate it.
 */
import { Interaction, CardinalityConstraintType, NounType, DeterminerType, VerbType, AdjectiveType, type ValueNode } from '../../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';
import { StatusType, UnitType } from '../../consts/enums';
import { StatType } from '../../model/enums/stats';
import { TimelineEvent } from '../../consts/viewTypes';
import { ENEMY_ID, PHYSICAL_STATUS_COLUMNS, REACTION_COLUMNS, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, SKILL_COLUMN_ORDER } from '../../model/channels';
import { TEAM_ID } from '../slot/commonSlotController';
import { activeEventsAtFrame, activeCountAtFrame } from './timelineQueries';
import { resolveColumnIds } from './columnResolution';

// Stat-based state adjective mapping — single source of truth lives in
// ./statStateMap.ts. Imported for IS/BECOME predicate evaluation.
import { ADJECTIVE_TO_STAT } from './statStateMap';

// ── Column ID resolution ─────────────────────────────────────────────────
// Canonical `resolveColumnIds` lives in `./columnResolution.ts`.

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
  sourceEntityId: string;
  /** Maps operator slot → operator columns (for resolving THIS_OPERATOR etc). */
  operatorSlotMap?: Record<string, string>;
  /** Target operator ID for OTHER/ANY determiner resolution. */
  targetEntityId?: string;
  /** Operator who matched the primary trigger condition (for TRIGGER determiner). */
  triggerEntityId?: string;
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
  /** Callback to resolve the ownerEntityId of the parent status event via causality DAG lookup. */
  getParentEventEntityId?: () => string | undefined;
  /** UID of the source skill event (for EVENT HAVE LINK — checks consumed LINK stacks). */
  sourceEventUid?: string;
  /** Query consumed LINK stacks for an event UID. */
  getLinkStacks?: (uid: string) => number;
  /** Query stat accumulator value for an entity. */
  getStatValue?: (entityId: string, stat: StatType) => number | undefined;
  /** Override for BECOME: the stack count before this specific trigger was created.
   *  When set, BECOME uses this instead of querying frame-1 state. */
  previousStackCount?: number;
}

// ── Subject resolution ───────────────────────────────────────────────────

function resolveEntityId(subject: string, ctx: ConditionContext, determiner?: string): string | undefined {
  if (subject === NounType.OPERATOR) {
    switch (determiner ?? DeterminerType.THIS) {
      case DeterminerType.THIS: return ctx.sourceEntityId;
      case DeterminerType.ALL: return TEAM_ID;
      case DeterminerType.OTHER: return ctx.targetEntityId ?? undefined;
      case DeterminerType.ANY: return ctx.targetEntityId ?? undefined; // wildcard if no target
      case DeterminerType.TRIGGER: return ctx.triggerEntityId ?? ctx.sourceEntityId;
      case DeterminerType.CONTROLLED:
        return ctx.getControlledSlotAtFrame?.(ctx.frame) ?? ctx.sourceEntityId;
      default: return ctx.sourceEntityId;
    }
  }
  switch (subject) {
    case NounType.EVENT: return ctx.getParentEventEntityId?.() ?? ctx.sourceEntityId;
    case NounType.ENEMY: return ENEMY_ID;
    case NounType.TEAM: return TEAM_ID;
    default: return ctx.sourceEntityId;
  }
}

// `resolveColumnIds` is canonical in `./columnResolution.ts` — imported at
// the top of this file and re-exported there so existing imports from
// conditionEvaluator keep working.

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
      const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
      if (!ownerEntityId || !ctx.getOperatorPercentageHp) return true; // default to full if no tracker
      return ctx.getOperatorPercentageHp(ownerEntityId, ctx.frame) >= 100;
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
        const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
        // Default to 100% HP when no tracker is available (assume full health)
        if (!ownerEntityId || !ctx.getOperatorPercentageHp) { hpPct = 100; }
        else { hpPct = ctx.getOperatorPercentageHp(ownerEntityId, ctx.frame); }
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

  // EVENT HAVE STATUS LINK: check if the source event consumed LINK stacks
  if (cond.subject === NounType.EVENT && cond.objectId === StatusType.LINK
    && ctx.sourceEventUid && ctx.getLinkStacks) {
    return ctx.getLinkStacks(ctx.sourceEventUid) > 0;
  }

  const columnIds = resolveColumnIds(cond.object, cond.objectId, cond.objectQualifier);
  if (columnIds.length === 0) return false;

  const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
  let count = 0;
  for (const colId of columnIds) {
    count += activeCountAtFrame(ctx.events, colId, ownerEntityId, ctx.frame);
  }

  // For LESS_THAN / LESS_THAN_EQUAL, count=0 is a valid result (0 ≤ N).
  // Only early-exit when no cardinality constraint accepts 0.
  const hasLessThanConstraint = cond.cardinalityConstraint === CardinalityConstraintType.LESS_THAN
    || cond.cardinalityConstraint === CardinalityConstraintType.LESS_THAN_EQUAL;
  if (count === 0 && !hasLessThanConstraint) return false;

  const condValue = cond.value ?? (cond as unknown as { with?: { value?: ValueNode } }).with?.value;
  if (condValue != null) {
    const valueCtx = ctx.potential != null
      ? { ...DEFAULT_VALUE_CONTEXT, potential: ctx.potential }
      : DEFAULT_VALUE_CONTEXT;
    const target = resolveValueNode(condValue as ValueNode, valueCtx) ?? 0;
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

  // Stat-based states (SLOWED, STAGGERED): check stat accumulator for existence.
  // IS handles its own negation (line 512 skips negation for IS verb).
  const isStatKey = ADJECTIVE_TO_STAT[cond.object];
  if (isStatKey) {
    if (!ctx.getStatValue) return cond.negated ? true : false;
    const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
    if (!ownerEntityId) return cond.negated ? true : false;
    const val = ctx.getStatValue(ownerEntityId, isStatKey);
    const hasActive = val != null && val > 0;
    return cond.negated ? !hasActive : hasActive;
  }

  if (cond.object === NounType.ACTIVE) {
    // Check if the subject has any active skill events at this frame
    const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
    for (const col of SKILL_COLUMN_ORDER) {
      if (activeCountAtFrame(ctx.events, col, ownerEntityId, ctx.frame) > 0) return true;
    }
    return false;
  }

  if (cond.object === NounType.CONTROLLED_STATE) {
    // "THIS OPERATOR IS CONTROLLED" — check if this operator is the controlled operator at this frame
    const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
    if (!ctx.getControlledSlotAtFrame || !ownerEntityId) return false;
    const result = ctx.getControlledSlotAtFrame(ctx.frame) === ownerEntityId;
    return cond.negated ? !result : result;
  }

  const columnId = stateToColumn[cond.object];
  if (!columnId) return false;

  const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
  const active = activeEventsAtFrame(ctx.events, columnId, ownerEntityId, ctx.frame);
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
    const ownerEntityId = resolveEntityId(ownerSubject as string, ctx, ownerDeterminer);
    let countNow = 0;
    let countBefore = 0;
    if (ctx.previousStackCount != null) {
      // Compound iteration: use the per-iteration before/after counts
      countBefore = ctx.previousStackCount;
      countNow = ctx.previousStackCount + 1;
    } else {
      for (const colId of columnIds) {
        const activeNow = activeEventsAtFrame(ctx.events, colId, ownerEntityId, ctx.frame);
        for (const ev of activeNow) {
          countNow += ev.stacks ?? 1;
        }
        if (ctx.frame > 0) {
          const activeBefore = activeEventsAtFrame(ctx.events, colId, ownerEntityId, ctx.frame - 1);
          for (const ev of activeBefore) {
            countBefore += ev.stacks ?? 1;
          }
        }
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

  // Stat-based state transitions: BECOME SLOWED / BECOME STAGGERED.
  // The transition is detected by the trigger firing logic (0→positive guard);
  // at evaluation time we just check whether the stat is currently non-zero.
  // Negation is handled by evaluateInteraction (line 512) for BECOME verb.
  const becomeStatKey = ADJECTIVE_TO_STAT[cond.object];
  if (becomeStatKey) {
    if (!ctx.getStatValue) return false;
    const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
    if (!ownerEntityId) return false;
    const val = ctx.getStatValue(ownerEntityId, becomeStatKey);
    return val != null && val > 0;
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
    const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
    const activeNow = SKILL_COLUMN_ORDER.some(
      col => activeCountAtFrame(ctx.events, col, ownerEntityId, ctx.frame) > 0,
    );
    if (!activeNow) return false;
    const activeBefore = ctx.frame > 0 && SKILL_COLUMN_ORDER.some(
      col => activeCountAtFrame(ctx.events, col, ownerEntityId, ctx.frame - 1) > 0,
    );
    return !activeBefore;
  }

  const columnId = stateToColumn[cond.object];
  if (!columnId) return false;

  const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
  const activeNow = activeEventsAtFrame(ctx.events, columnId, ownerEntityId, ctx.frame).length > 0;
  if (!activeNow) return false;
  const activeBefore = ctx.frame > 0
    && activeEventsAtFrame(ctx.events, columnId, ownerEntityId, ctx.frame - 1).length > 0;
  return !activeBefore;
}

function evaluateReceive(cond: Interaction, ctx: ConditionContext): boolean {
  // RECEIVE: check if a matching status/infliction/reaction event starts at exactly this frame.
  const columnIds = resolveColumnIds(cond.object, cond.objectId, cond.objectQualifier);
  if (columnIds.length === 0) return false;

  const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
  return ctx.events.some(ev =>
    columnIds.includes(ev.columnId) &&
    (ownerEntityId == null || ev.ownerEntityId === ownerEntityId) &&
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

  const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
  return ctx.events.some(ev =>
    ev.columnId === columnId &&
    (ownerEntityId == null || ev.ownerEntityId === ownerEntityId) &&
    ev.startFrame <= ctx.frame
  );
}

// ── STACKS subject ──────────────────────────────────────────────────────

/** Evaluate "STACKS of X of OWNER IS >= N" — count-based assertion via OF clause. */
function evaluateStacksSubject(cond: Interaction, ctx: ConditionContext): boolean {
  const ofClause = cond.of as { object?: string; objectId?: string; objectQualifier?: string; determiner?: string; of?: { object?: string; determiner?: string } } | undefined;
  const statusId = ofClause?.objectId;
  const qualifier = ofClause?.objectQualifier;
  const columnIds = resolveColumnIds(NounType.STATUS, statusId, qualifier);
  if (columnIds.length === 0) return false;
  const ownerSubject = ofClause?.of?.object ?? NounType.ENEMY;
  const ownerDeterminer = ofClause?.of?.determiner;
  const ownerEntityId = resolveEntityId(ownerSubject as string, ctx, ownerDeterminer);
  let count = 0;
  for (const colId of columnIds) {
    const active = activeEventsAtFrame(ctx.events, colId, ownerEntityId, ctx.frame);
    const last = active.length > 0 ? active[active.length - 1] : undefined;
    count += last?.stacks != null ? last.stacks : active.length;
  }
  if (cond.value != null) {
    const valueCtx = ctx.potential != null ? { ...DEFAULT_VALUE_CONTEXT, potential: ctx.potential } : DEFAULT_VALUE_CONTEXT;
    const target = resolveValueNode(cond.value!, valueCtx) ?? 0;
    switch (cond.cardinalityConstraint) {
      case CardinalityConstraintType.EXACTLY: return count === target;
      case CardinalityConstraintType.GREATER_THAN: return count > target;
      case CardinalityConstraintType.GREATER_THAN_EQUAL: return count >= target;
      case CardinalityConstraintType.LESS_THAN: return count < target;
      case CardinalityConstraintType.LESS_THAN_EQUAL: return count <= target;
    }
  }
  return count > 0;
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

  // STACKS subject: count-based assertion — "STACKS of X of OWNER IS >= N"
  if ((cond.subject as string) === NounType.STACKS) {
    return evaluateStacksSubject(cond, ctx);
  }

  let result: boolean;

  const verb = cond.verb as string;
  switch (verb) {
    case VerbType.HAVE: result = evaluateHave(cond, ctx); break;
    case VerbType.IS: result = evaluateIs(cond, ctx); break;
    case VerbType.PERFORM: result = evaluatePerform(cond, ctx); break;
    case VerbType.BECOME: result = evaluateBecome(cond, ctx); break;
    case VerbType.RECEIVE: result = evaluateReceive(cond, ctx); break;
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
