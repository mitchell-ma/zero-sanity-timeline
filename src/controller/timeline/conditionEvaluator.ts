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
import { ENEMY_ID, PHYSICAL_STATUS_COLUMNS, PHYSICAL_INFLICTION_COLUMNS, REACTION_COLUMNS, INFLICTION_COLUMNS, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, SKILL_COLUMN_ORDER, ENEMY_ACTION_COLUMN_ID } from '../../model/channels';
import { EnemyActionType } from '../../consts/enums';
import { TEAM_ID } from '../slot/commonSlotController';
import { activeEventsAtFrame, activeCountAtFrame, isActiveAtFrame } from './timelineQueries';
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
  /** Operator talent level for HAVE TALENT_LEVEL conditions. Defaults to
   *  talentOneLevel from the loadout (matches valueResolver convention). */
  talentLevel?: number;
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
  /** Status/event id of the trigger currently being evaluated. Populated by the
   *  engine-context trigger path (`handleEngineTrigger`) from the def's
   *  `properties.id`. Used by `THIS EVENT IS OCCURRENCE` to count prior
   *  instances of the same trigger status on the resolved owner. */
  currentTriggerStatusId?: string;
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
  // TALENT_LEVEL: check operator talent level (defaults to talentOneLevel —
  // matches valueResolver.buildContextForSkillColumn's resolution rule).
  if (cond.object === NounType.TALENT_LEVEL) {
    const tl = ctx.talentLevel ?? 0;
    const { target, constraint } = resolveConditionThreshold(cond);
    switch (constraint) {
      case CardinalityConstraintType.GREATER_THAN: return tl > target;
      case CardinalityConstraintType.GREATER_THAN_EQUAL: return tl >= target;
      case CardinalityConstraintType.LESS_THAN: return tl < target;
      case CardinalityConstraintType.LESS_THAN_EQUAL: return tl <= target;
      case CardinalityConstraintType.EXACTLY: return tl === target;
    }
    return tl >= target;
  }

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

  // ENEMY HAVE CHARGE: check whether an enemy-action CHARGE event is active
  // at the query frame. CHARGE events live on the enemy-action column with
  // `ev.id === "CHARGE"`, not on a dedicated status column, so they aren't
  // reachable via the generic column-id path below.
  if (cond.subject === NounType.ENEMY && cond.object === NounType.CHARGE) {
    return ctx.events.some(ev =>
      ev.ownerEntityId === ENEMY_ID
      && ev.columnId === ENEMY_ACTION_COLUMN_ID
      && ev.id === EnemyActionType.CHARGE
      && isActiveAtFrame(ev, ctx.frame),
    );
  }

  // Resolve the condition's `{object, objectId, objectQualifier}` triple to
  // a set of matching column IDs via `resolveColumnIds`, which handles
  // umbrella expansions (INFLICTION/ARTS fan-out, REACTION wildcard,
  // PHYSICAL wildcard) and flattens struct-form `(SUSCEPTIBILITY, PHYSICAL)`
  // to the qualified column `PHYSICAL_SUSCEPTIBILITY` for the match.
  const columnIds = resolveColumnIds(cond.object, cond.objectId, cond.objectQualifier);
  if (columnIds.length === 0) return false;

  const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
  let count = 0;
  for (const colId of columnIds) {
    count += activeCountAtFrame(ctx.events, colId, ownerEntityId, ctx.frame);
  }

  // Without a cardinalityConstraint, `HAVE X` defaults to count ≥ 1 — bail early
  // when count is 0. With a constraint, count=0 may still satisfy (e.g. EXACTLY 0,
  // LESS_THAN 1, GREATER_THAN_EQUAL 0) — fall through to the switch below.
  if (count === 0 && !cond.cardinalityConstraint) return false;

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
  // Entity equality — "SUBJECT_OPERATOR IS OBJECT_OPERATOR" compares the
  // resolved subject and object entities. Used by talents that discriminate
  // based on the originator (e.g. Alesh T1: "THIS OPERATOR IS TRIGGER OPERATOR"
  // fires the self-applied solidification bonus only when the talent owner
  // and the trigger operator are the same entity).
  if (cond.subject === NounType.OPERATOR && cond.object === NounType.OPERATOR) {
    const subjectEntity = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
    const objectDeterminer = (cond as unknown as { objectDeterminer?: string }).objectDeterminer;
    const objectEntity = resolveEntityId(cond.object, ctx, objectDeterminer);
    if (!subjectEntity || !objectEntity) return cond.negated === true;
    const equal = subjectEntity === objectEntity;
    return cond.negated ? !equal : equal;
  }

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
    CRYO_INFLICTED: INFLICTION_COLUMNS.CRYO,
    HEAT_INFLICTED: INFLICTION_COLUMNS.HEAT,
    NATURE_INFLICTED: INFLICTION_COLUMNS.NATURE,
    ELECTRIC_INFLICTED: INFLICTION_COLUMNS.ELECTRIC,
    VULNERABLE_INFLICTED: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
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

  // "THIS EVENT IS OCCURRENCE WITH VALUE IS N" — true when this trigger is
  // firing for the Nth time on the resolved owner's timeline. Counts prior
  // applied instances of the current trigger's status id (events with columnId
  // === currentTriggerStatusId, same owner, startFrame < ctx.frame), adds 1
  // for the instance this trigger would create, and compares to the target.
  if (cond.subject === NounType.EVENT && cond.object === NounType.OCCURRENCE) {
    const statusId = ctx.currentTriggerStatusId;
    if (!statusId) return cond.negated ? true : false;
    const ownerEntityId = resolveEntityId(cond.subject, ctx, cond.subjectDeterminer);
    if (!ownerEntityId) return cond.negated ? true : false;
    let priorCount = 0;
    for (const ev of ctx.events) {
      if (ev.ownerEntityId !== ownerEntityId) continue;
      if (ev.columnId !== statusId) continue;
      if (ev.startFrame >= ctx.frame) continue;
      priorCount += 1;
    }
    const occurrenceNumber = priorCount + 1;
    const condValue = cond.value ?? (cond as unknown as { with?: { value?: ValueNode } }).with?.value;
    const valueCtx = ctx.potential != null
      ? { ...DEFAULT_VALUE_CONTEXT, potential: ctx.potential }
      : DEFAULT_VALUE_CONTEXT;
    const target = condValue != null ? resolveValueNode(condValue as ValueNode, valueCtx) : 1;
    let match: boolean;
    switch (cond.cardinalityConstraint) {
      case CardinalityConstraintType.GREATER_THAN:       match = occurrenceNumber > target; break;
      case CardinalityConstraintType.GREATER_THAN_EQUAL: match = occurrenceNumber >= target; break;
      case CardinalityConstraintType.LESS_THAN:          match = occurrenceNumber < target; break;
      case CardinalityConstraintType.LESS_THAN_EQUAL:    match = occurrenceNumber <= target; break;
      default:                                           match = occurrenceNumber === target; break;
    }
    return cond.negated ? !match : match;
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
    CRYO_INFLICTED: INFLICTION_COLUMNS.CRYO,
    HEAT_INFLICTED: INFLICTION_COLUMNS.HEAT,
    NATURE_INFLICTED: INFLICTION_COLUMNS.NATURE,
    ELECTRIC_INFLICTED: INFLICTION_COLUMNS.ELECTRIC,
    VULNERABLE_INFLICTED: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
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
