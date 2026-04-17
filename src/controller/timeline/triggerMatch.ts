/**
 * Trigger clause matching utility.
 *
 * Evaluates onTriggerClause conditions against timeline events using a
 * verb-handler registry. Conditions are order-agnostic AND'd predicates.
 * The first scannable condition (verb with a registered handler) drives event
 * scanning via its handler. All other scannable conditions are checked
 * as secondary predicates at each candidate frame. Conditions requiring
 * full engine context (HAVE TALENT_LEVEL, HAVE HP, etc.) are skipped
 * and deferred to handleEngineTrigger.
 */
import { TimelineEvent, computeSegmentsSpan } from '../../consts/viewTypes';
import { EventStatusType } from '../../consts/enums';
import { TEAM_ID } from '../slot/commonSlotController';
import {
  ENEMY_ID, ENEMY_ACTION_COLUMN_ID,
  REACTION_COLUMN_IDS, INFLICTION_COLUMN_IDS,
  PHYSICAL_STATUS_COLUMN_IDS,
} from '../../model/channels';
import { resolveColumnIds, ELEMENT_TO_INFLICTION_COLUMN } from './columnResolution';
import { STATE_TO_COLUMN } from './triggerIndex';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { getFinalStrikeTriggerFrame } from './processComboSkill';
import { evaluateInteraction } from './conditionEvaluator';
import { hasSkillPointClause, findDealDamageInClauses } from './clauseQueries';
import type { ConditionContext } from './conditionEvaluator';
import type { TimeStopRegion } from './processTimeStop';
import { VerbType, NounType, DeterminerType, CardinalityConstraintType, AdjectiveType } from '../../dsl/semantics';
import type { Interaction } from '../../dsl/semantics';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Predicate {
  subject: string;
  subjectId?: string;
  verb: string;
  negated?: boolean;
  object?: string;
  objectId?: string;
  cardinalityConstraint?: string;
  value?: number | string | Record<string, unknown>;
  element?: string;
  objectQualifier?: string;
  subjectDeterminer?: string;
  /** OF — possessor clause for the subject. */
  of?: Record<string, unknown>;
  to?: string;
  toDeterminer?: string;
  with?: Record<string, unknown>;
}

export interface TriggerEffect {
  verb: string;
  cardinalityConstraint?: string;
  value?: number | string | Record<string, unknown>;
  effects?: TriggerSubEffect[];
  /** Direct effect fields (same shape as TriggerSubEffect) for non-compound effects. */
  object?: string;
  objectId?: string;
  objectDeterminer?: string;
  element?: string;
  objectQualifier?: string;
  from?: string;
  to?: string;
  toDeterminer?: string;
  with?: Record<string, unknown>;
  until?: Record<string, unknown>;
  of?: Record<string, unknown>;
}

export interface TriggerSubEffect {
  verb: string;
  value?: number | Record<string, unknown>;
  object?: string;
  objectId?: string;
  element?: string;
  objectQualifier?: string;
  from?: string;
  to?: string;
  toDeterminer?: string;
  with?: Record<string, unknown>;
  until?: Record<string, unknown>;
  of?: Record<string, unknown>;
}

export interface TriggerMatch {
  frame: number;
  sourceEntityId: string;
  sourceSkillName: string;
  /** The operator that caused this event (e.g. who applied the infliction). */
  originEntityId?: string;
  /** The column ID of the source event that matched this trigger. */
  sourceColumnId?: string;
  /**
   * UID of the source event that matched this trigger. Direct event ref used
   * by chain-of-action lookups (e.g. `duplicateTriggerSource` reads the live
   * source event from `getAllEvents()` via this uid).
   */
  sourceEventUid?: string;
  /** Status level of the triggering physical status (= Vulnerability stacks consumed). */
  triggerStacks?: number;
  effects?: TriggerEffect[];
}

interface VerbHandlerContext {
  events: readonly TimelineEvent[];
  operatorSlotId: string;
  secondaryConditions: Predicate[];
  clauseEffects?: TriggerEffect[];
  stops?: readonly TimeStopRegion[];
  controlledSlotId?: string | ((frame: number) => string);
}

type VerbHandlerFn = (primaryCond: Predicate, ctx: VerbHandlerContext) => TriggerMatch[];

interface VerbHandler {
  findMatches: VerbHandlerFn;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Evaluate a single predicate (condition) at a given frame using the shared condition evaluator.
 */
function checkPredicate(
  pred: Predicate,
  events: readonly TimelineEvent[],
  operatorSlotId: string,
  candidateFrame: number,
  triggerEntityId?: string,
): boolean {
  const ctx: ConditionContext = {
    events,
    frame: candidateFrame,
    sourceEntityId: operatorSlotId,
    triggerEntityId,
  };
  return evaluateInteraction(pred as unknown as Interaction, ctx);
}

/**
 * Get the absolute frame of the first event frame tick in an event's segments.
 * Falls back to ev.startFrame if no segment frame data exists.
 */
export function getFirstEventFrame(ev: TimelineEvent): number {
  if (ev.segments) {
    for (const seg of ev.segments) {
      if (seg.frames && seg.frames.length > 0) {
        return ev.startFrame + seg.frames[0].offsetFrame;
      }
    }
  }
  return ev.startFrame;
}

// ── Column + owner resolution ─────────────────────────────────────────────────



const SKIP_COLUMNS = new Set<string>([
  NounType.BASIC_ATTACK, NounType.BATTLE, NounType.COMBO, NounType.ULTIMATE,
]);

/**
 * Resolve which timeline columns to scan for a given object + element/objectQualifier + objectId.
 * Returns undefined for generic STATUS (needs fallback scan logic).
 */
function resolveColumns(cond: Predicate): Set<string> | undefined {
  const el = cond.element ?? cond.objectQualifier;

  switch (cond.object) {
    case 'INFLICTION': {
      const ids = resolveColumnIds(cond.object, cond.objectId, cond.objectQualifier);
      if (ids.length > 0) return new Set(ids);
      if (el) {
        const colId = ELEMENT_TO_INFLICTION_COLUMN[el];
        return colId ? new Set([colId]) : new Set();
      }
      return new Set(INFLICTION_COLUMN_IDS);
    }

    case 'ARTS_BURST':
      // Arts Burst events live in infliction columns, filtered by isArtsBurst flag in scanEvents
      return new Set(INFLICTION_COLUMN_IDS);

    case 'STATUS':
      if (cond.objectId === AdjectiveType.PHYSICAL) {
        // APPLY PHYSICAL STATUS — resolve qualifier to specific column, or all physical columns
        if (cond.objectQualifier) return new Set([cond.objectQualifier]);
        return new Set(PHYSICAL_STATUS_COLUMN_IDS);
      }
      if (cond.objectId) {
        const ids = resolveColumnIds(cond.object, cond.objectId, cond.objectQualifier);
        return ids.length > 0 ? new Set(ids) : new Set([cond.objectId]);
      }
      return undefined; // generic — needs fallback

    case 'STAGGER':
      return new Set(['node-stagger', 'full-stagger']);

    default:
      return undefined;
  }
}

/**
 * Resolve which ownerEntityId to filter events by, based on verb semantics.
 *
 * For action verbs (APPLY, CONSUME), the subject is the actor and the target
 * (to) is the recipient. Timeline events are owned by the recipient.
 * For state/possession verbs (HAVE, IS, RECEIVE), the subject is the entity.
 * For skill verbs (PERFORM, DEAL, RECOVER), the subject is the performer.
 */
function resolveOwnerFilter(cond: Predicate, operatorSlotId: string, verb?: string, controlledSlotId?: string | ((frame: number) => string)) {
  const det = cond.subjectDeterminer;
  const isControlledOperator = cond.subject === NounType.OPERATOR && det === DeterminerType.CONTROLLED;
  const isAnyOperator = cond.subject === NounType.OPERATOR && (det === DeterminerType.ANY || (isControlledOperator && !controlledSlotId));
  const isAnyOtherOperator = cond.subject === NounType.OPERATOR && det === DeterminerType.ANY_OTHER;
  const toObj = cond.to;
  const toDet = cond.toDeterminer;

  // Action verbs: event ownerEntityId = recipient (to), not subject
  const isActionVerb = verb === VerbType.APPLY || verb === VerbType.CONSUME;

  return {
    isAnyOperator: isAnyOperator || isAnyOtherOperator,
    matchesOwner(ownerEntityId: string, atFrame?: number) {
      if (isActionVerb && toObj) {
        if (toObj === NounType.ENEMY) return ownerEntityId === ENEMY_ID;
        if (toObj === NounType.OPERATOR) {
          if (toDet === DeterminerType.ANY) return ownerEntityId !== ENEMY_ID && ownerEntityId !== TEAM_ID;
          if (toDet === DeterminerType.ALL) return true;
          if (toDet === DeterminerType.OTHER) return ownerEntityId !== operatorSlotId && ownerEntityId !== ENEMY_ID && ownerEntityId !== TEAM_ID;
          return ownerEntityId === operatorSlotId;
        }
        return true;
      }
      if (isActionVerb) return true;
      // Subject-based filtering
      if (cond.subject === NounType.ENEMY) return ownerEntityId === ENEMY_ID;
      if (isControlledOperator && controlledSlotId) {
        const resolved = typeof controlledSlotId === 'function' ? controlledSlotId(atFrame ?? 0) : controlledSlotId;
        return ownerEntityId === resolved;
      }
      if (isAnyOtherOperator) return ownerEntityId !== operatorSlotId && ownerEntityId !== ENEMY_ID && ownerEntityId !== TEAM_ID;
      if (isAnyOperator) return ownerEntityId !== ENEMY_ID && ownerEntityId !== TEAM_ID;
      return ownerEntityId === operatorSlotId;
    },
  };
}

function checkSecondary(ctx: VerbHandlerContext, frame: number, triggerEntityId?: string): boolean {
  return ctx.secondaryConditions.every(sc =>
    checkPredicate(sc, ctx.events, ctx.operatorSlotId, frame, triggerEntityId)
  );
}

function makeMatch(frame: number, ev: TimelineEvent, effects?: TriggerEffect[]): TriggerMatch {
  return { frame, sourceEntityId: ev.ownerEntityId, sourceSkillName: ev.id, originEntityId: ev.sourceEntityId, sourceColumnId: ev.columnId, sourceEventUid: ev.uid, triggerStacks: ev.statusLevel ?? ev.stacks, effects };
}

/**
 * Generic event scanner: resolve columns + owner, scan events, trigger on startFrame.
 * Used by APPLY, CONSUME, RECEIVE.
 */
function scanEvents(primaryCond: Predicate, ctx: VerbHandlerContext, verb: string): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const columns = resolveColumns(primaryCond);
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, verb);
  // CONSUME triggers should only match events that were actually consumed
  // (eventStatus === CONSUMED), not merely present. APPLY / RECEIVE match
  // any event on the column regardless of status.
  const requireConsumed = verb === VerbType.CONSUME;
  for (const ev of ctx.events) {
    if (columns) {
      if (!columns.has(ev.columnId)) continue;
    } else {
      // Generic fallback: scan all status columns (exclude skill/infliction/reaction)
      if (REACTION_COLUMN_IDS.has(ev.columnId)) continue;
      if (INFLICTION_COLUMN_IDS.has(ev.columnId)) continue;
      if (SKIP_COLUMNS.has(ev.columnId)) continue;
    }
    if (requireConsumed && ev.eventStatus !== EventStatusType.CONSUMED) continue;
    // Arts Burst: only match infliction events flagged as same-element stacking
    if (primaryCond.object === NounType.ARTS_BURST && !ev.isArtsBurst) continue;
    if (!matchesOwner(ev.ownerEntityId)) continue;
    // For CONSUME, the trigger fires at the consumption frame (event end after
    // duration clamping), not the event's original startFrame. The engine clamps
    // a consumed event's duration to the consumption point, so startFrame +
    // eventDuration = the frame at which the consume action happened.
    const triggerFrame = requireConsumed
      ? ev.startFrame + computeSegmentsSpan(ev.segments)
      : ev.startFrame;
    if (!checkSecondary(ctx, triggerFrame, ev.ownerEntityId)) continue;

    matches.push(makeMatch(triggerFrame, ev, ctx.clauseEffects));
  }
  return matches;
}

// ── PERFORM handler ──────────────────────────────────────────────────────────

function handlePerform(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const { matchesOwner, isAnyOperator } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, VerbType.PERFORM, ctx.controlledSlotId);

  // Enemy action triggers: `ENEMY PERFORM STATUS <action-id>` matches events
  // on the enemy-action column whose `id` equals the objectId. This is how
  // enemy behaviors like CHARGE (wind-up before a big attack) surface as
  // triggers for operator combo activation windows (e.g. Catcher's Timely
  // Suppression opening on ENEMY PERFORM STATUS CHARGE).
  if (primaryCond.subject === NounType.ENEMY
      && primaryCond.object === NounType.STATUS
      && primaryCond.objectId) {
    const targetId = primaryCond.objectId;
    for (const ev of ctx.events) {
      if (ev.ownerEntityId !== ENEMY_ID) continue;
      if (ev.columnId !== ENEMY_ACTION_COLUMN_ID) continue;
      if (ev.id !== targetId) continue;
      const triggerFrame = getFirstEventFrame(ev);
      if (!checkSecondary(ctx, triggerFrame, ev.ownerEntityId)) continue;
      matches.push(makeMatch(triggerFrame, ev, ctx.clauseEffects));
    }
    return matches;
  }

  // Resolve the effective skill ID: for normalized SKILL objects, use objectId
  const skillId = primaryCond.object === NounType.SKILL ? primaryCond.objectId : primaryCond.object;

  if (skillId === NounType.FINAL_STRIKE) {
    for (const ev of ctx.events) {
      if (ev.columnId !== NounType.BASIC_ATTACK) continue;
      if (ev.id === NounType.FINISHER || ev.id === NounType.DIVE) continue;

      const triggerFrame = getFinalStrikeTriggerFrame(ev, ctx.stops);
      if (triggerFrame == null) continue;
      if (!matchesOwner(ev.ownerEntityId, triggerFrame)) continue;
      if (!checkSecondary(ctx, triggerFrame, ev.ownerEntityId)) continue;

      matches.push(makeMatch(triggerFrame, ev, ctx.clauseEffects));
    }
    return matches;
  }

  // FINISHER / DIVE_ATTACK — match events on basic column by skill name
  if (skillId === NounType.FINISHER || skillId === NounType.DIVE) {
    const targetName = skillId === NounType.FINISHER ? NounType.FINISHER : NounType.DIVE;
    for (const ev of ctx.events) {
      if (!matchesOwner(ev.ownerEntityId)) continue;
      if (ev.columnId !== NounType.BASIC_ATTACK) continue;
      if (ev.id !== targetName) continue;

      const triggerFrame = getFirstEventFrame(ev);
      if (!checkSecondary(ctx, triggerFrame, ev.ownerEntityId)) continue;

      matches.push(makeMatch(triggerFrame, ev, ctx.clauseEffects));
    }
    return matches;
  }

  const matchingColumn = skillId;

  for (const ev of ctx.events) {
    if (!isAnyOperator && ev.ownerEntityId !== ctx.operatorSlotId) continue;
    if (isAnyOperator && (ev.ownerEntityId === ENEMY_ID || ev.ownerEntityId === TEAM_ID)) continue;
    if (ev.columnId !== matchingColumn) continue;

    const triggerFrame = getFirstEventFrame(ev);
    if (!checkSecondary(ctx, triggerFrame, ev.ownerEntityId)) continue;

    matches.push(makeMatch(triggerFrame, ev, ctx.clauseEffects));
  }
  return matches;
}

// ── HAVE handler ─────────────────────────────────────────────────────────────

function handleHave(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  if ((primaryCond.object !== NounType.STATUS && primaryCond.object !== NounType.INFLICTION) || !primaryCond.objectId) return matches;

  // Collect ALL conditions (primary + secondary) that use HAVE — each contributes candidate frames
  const allHaveConds = [primaryCond, ...ctx.secondaryConditions.filter(sc => sc.verb === VerbType.HAVE)];
  // Gather candidate frames from ALL HAVE conditions' matching events
  const candidateFrames = new Set<number>();
  for (const cond of allHaveConds) {
    const colIds = resolveColumns(cond);
    if (!colIds) continue;
    const { matchesOwner } = resolveOwnerFilter(cond, ctx.operatorSlotId, VerbType.HAVE);
    for (const ev of ctx.events) {
      if (!colIds.has(ev.columnId)) continue;
      if (!matchesOwner(ev.ownerEntityId)) continue;
      candidateFrames.add(ev.startFrame);
    }
  }

  // At each candidate frame, check ALL conditions (primary + all secondary)
  const allConditions = [primaryCond, ...ctx.secondaryConditions];
  for (const frame of Array.from(candidateFrames)) {
    const allPass = allConditions.every(cond =>
      checkPredicate(cond, ctx.events, ctx.operatorSlotId, frame),
    );
    if (!allPass) continue;

    // Find the event at this frame to use as source — prefer primary condition's matching event
    const primaryColIds = resolveColumns(primaryCond);
    const { matchesOwner: primaryMatchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, VerbType.HAVE);
    const sourceEv = ctx.events.find(ev =>
      ev.startFrame <= frame && frame < ev.startFrame + computeSegmentsSpan(ev.segments) &&
      primaryColIds?.has(ev.columnId) && primaryMatchesOwner(ev.ownerEntityId),
    ) ?? ctx.events.find(ev => ev.startFrame === frame);
    if (sourceEv) {
      matches.push(makeMatch(frame, sourceEv, ctx.clauseEffects));
    }
  }

  return matches;
}

/** Extract a stacks threshold from a predicate's `with.stacks` block. */
// ── RECOVER handler ──────────────────────────────────────────────────────────

function handleRecover(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, VerbType.RECOVER);

  if (primaryCond.object === NounType.SKILL_POINT) {
    for (const ev of ctx.events) {
      if (!matchesOwner(ev.ownerEntityId)) continue;
      let cumulativeOffset = 0;
      for (const seg of ev.segments) {
        if (seg.frames) {
          for (const frame of seg.frames) {
            if (hasSkillPointClause(frame.clauses)) {
              const triggerFrame = ev.startFrame + cumulativeOffset + frame.offsetFrame;
              if (!checkSecondary(ctx, triggerFrame, ev.ownerEntityId)) continue;
              matches.push(makeMatch(triggerFrame, ev, ctx.clauseEffects));
            }
          }
        }
        cumulativeOffset += seg.properties.duration;
      }
    }
  }
  return matches;
}

// ── IS / BECOME handlers ─────────────────────────────────────────────────────

function handleIs(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  // STACKS as subject: resolve columns from OF clause, scan for candidate frames,
  // check threshold via checkPredicate → evaluateStacksSubject
  if (primaryCond.subject === NounType.STACKS) {
    const ofClause = primaryCond.of as { objectId?: string; objectQualifier?: string; of?: { object?: string; determiner?: string } } | undefined;
    const columnIds = resolveColumnIds(NounType.STATUS, ofClause?.objectId, ofClause?.objectQualifier);
    if (columnIds.length === 0) return [];
    const ownerSubject = ofClause?.of?.object ?? NounType.ENEMY;
    const ownerDeterminer = ofClause?.of?.determiner;
    const { matchesOwner } = resolveOwnerFilter(
      { ...primaryCond, subject: ownerSubject, subjectDeterminer: ownerDeterminer } as Predicate,
      ctx.operatorSlotId, VerbType.IS,
    );
    const matches: TriggerMatch[] = [];
    const candidateFrames = new Set<number>();
    for (const ev of ctx.events) {
      if (!columnIds.includes(ev.columnId)) continue;
      if (!matchesOwner(ev.ownerEntityId)) continue;
      candidateFrames.add(ev.startFrame);
    }
    for (const frame of Array.from(candidateFrames)) {
      if (!checkPredicate(primaryCond, ctx.events, ctx.operatorSlotId, frame)) continue;
      if (!checkSecondary(ctx, frame)) continue;
      const sourceEv = ctx.events.find(ev =>
        columnIds.includes(ev.columnId) && matchesOwner(ev.ownerEntityId) &&
        ev.startFrame <= frame && frame < ev.startFrame + computeSegmentsSpan(ev.segments),
      );
      if (sourceEv) matches.push(makeMatch(frame, sourceEv, ctx.clauseEffects));
    }
    return matches;
  }

  const colId = STATE_TO_COLUMN[primaryCond.object ?? ''];
  if (!colId) return [];

  const isPhysicalStatus = PHYSICAL_STATUS_COLUMN_IDS.has(colId);
  const matches: TriggerMatch[] = [];
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, VerbType.IS);

  for (const ev of ctx.events) {
    if (ev.columnId !== colId) continue;
    if (!matchesOwner(ev.ownerEntityId)) continue;
    // Skip forced physical statuses — no Vulnerability was consumed
    if (isPhysicalStatus && ev.isForced) continue;
    if (!checkSecondary(ctx, ev.startFrame, ev.ownerEntityId)) continue;
    matches.push(makeMatch(ev.startFrame, ev, ctx.clauseEffects));
  }
  return matches;
}

function handleBecome(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  // BECOME STACKS: check transition points where a status's stack count changes.
  // Only scan frames where matching events start or end (not every frame).
  if (primaryCond.object === NounType.STACKS) {
    const statusId = primaryCond.subjectId ?? primaryCond.objectId;
    if (!statusId) return [];
    const colId = statusId;
    const ofClause = primaryCond.of as { object?: string; determiner?: string } | undefined;
    const possessorSubject = ofClause?.object ?? primaryCond.subject;
    const possessorDeterminer = ofClause?.determiner ?? primaryCond.subjectDeterminer;
    const { matchesOwner } = resolveOwnerFilter(
      { ...primaryCond, subject: possessorSubject, subjectDeterminer: possessorDeterminer } as Predicate,
      ctx.operatorSlotId, VerbType.BECOME,
    );
    const targetValue = primaryCond.value != null
      ? (typeof primaryCond.value === 'object' && 'value' in primaryCond.value
          ? (primaryCond.value as { value: number }).value
          : Number(primaryCond.value))
      : undefined;
    const constraint = primaryCond.cardinalityConstraint;

    // Collect ALL relevant status events (including consumed — their clamped
    // duration is needed to detect consumption-based transitions).
    const statusEvents = ctx.events.filter(ev =>
      ev.columnId === colId && matchesOwner(ev.ownerEntityId),
    );
    if (statusEvents.length === 0) return [];

    // Transition points: frames where events start or end (stack count changes)
    const transitionFrames = new Set<number>();
    for (const ev of statusEvents) {
      transitionFrames.add(ev.startFrame);
      const endFrame = ev.startFrame + computeSegmentsSpan(ev.segments);
      transitionFrames.add(endFrame);
    }

    const countAt = (frame: number) => statusEvents
      .filter(ev => ev.startFrame <= frame && frame < ev.startFrame + computeSegmentsSpan(ev.segments))
      .reduce((sum, ev) => sum + (ev.stacks ?? 1), 0);

    const matches: TriggerMatch[] = [];
    for (const frame of Array.from(transitionFrames)) {
      if (frame < 1) continue;
      const countNow = countAt(frame);
      const countBefore = countAt(frame - 1);
      if (countNow === countBefore) continue;
      if (targetValue != null) {
        const passes = constraint === CardinalityConstraintType.EXACTLY ? countNow === targetValue
          : constraint === CardinalityConstraintType.GREATER_THAN ? countNow > targetValue
          : constraint === CardinalityConstraintType.GREATER_THAN_EQUAL ? countNow >= targetValue
          : constraint === CardinalityConstraintType.LESS_THAN ? countNow < targetValue
          : constraint === CardinalityConstraintType.LESS_THAN_EQUAL ? countNow <= targetValue
          : countNow === targetValue;
        if (!passes) continue;
      }
      // Exclude natural expiry: only trigger when a stack was actively consumed
      // at this frame (event clamped to end here with CONSUMED status), not when
      // it simply reached its natural duration end.
      if (targetValue === 0) {
        const wasConsumed = statusEvents.some(ev =>
          ev.eventStatus === EventStatusType.CONSUMED &&
          ev.startFrame + computeSegmentsSpan(ev.segments) === frame,
        );
        if (!wasConsumed) continue;
      }
      if (!checkSecondary(ctx, frame, ctx.operatorSlotId)) continue;
      const synthetic = { ownerEntityId: ctx.operatorSlotId, name: '' } as TimelineEvent;
      matches.push(makeMatch(frame, synthetic, ctx.clauseEffects));
    }
    return matches;
  }

  return handleIs(primaryCond, ctx);
}

// ── APPLY / CONSUME / RECEIVE handlers ───────────────────────────────────────

function handleApply(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  return scanEvents(primaryCond, ctx, VerbType.APPLY);
}

function handleConsume(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  return scanEvents(primaryCond, ctx, VerbType.CONSUME);
}

function handleReceive(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  return scanEvents(primaryCond, ctx, VerbType.RECEIVE);
}

// ── DEAL handler ─────────────────────────────────────────────────────────────

function handleDeal(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, VerbType.DEAL);
  const qualifier = primaryCond.objectQualifier as string | undefined;
  // ARTS_BURST is not a damage element — it's a reaction. DEAL ARTS_BURST DAMAGE matches
  // arts burst infliction events, not regular damage frames. Skip all damage frames for it.
  if (qualifier === NounType.ARTS_BURST) return matches;

  for (const ev of ctx.events) {
    if (!matchesOwner(ev.ownerEntityId)) continue;

    let cumulativeOffset = 0;
    for (const seg of ev.segments) {
      if (seg.frames) {
        for (const frame of seg.frames) {
          // Filter by damage element when qualifier is an element (CRYO, HEAT, etc.)
          if (qualifier) {
            const dealInfo = findDealDamageInClauses(frame.clauses);
            if (dealInfo?.element && dealInfo.element !== qualifier) continue;
          }
          const triggerFrame = ev.startFrame + cumulativeOffset + frame.offsetFrame;
          if (!checkSecondary(ctx, triggerFrame, ev.ownerEntityId)) continue;
          matches.push(makeMatch(triggerFrame, ev, ctx.clauseEffects));
        }
      }
      cumulativeOffset += seg.properties.duration;
    }
  }
  return matches;
}

// ── HIT / DEFEAT handlers ────────────────────────────────────────────────────
// HIT scans enemy ACTION timeline events; falls back to periodic triggers if none exist.

function handleHit(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const hitEvents = ctx.events.filter(
    (ev) => ev.ownerEntityId === ENEMY_ID && ev.columnId === ENEMY_ACTION_COLUMN_ID,
  );
  if (hitEvents.length > 0) {
    const matches: TriggerMatch[] = [];
    for (const ev of hitEvents) {
      if (!checkSecondary(ctx, ev.startFrame, ctx.operatorSlotId)) continue;
      matches.push(makeMatch(ev.startFrame, ev, ctx.clauseEffects));
    }
    return matches;
  }
  return generatePeriodicTriggers(primaryCond, ctx);
}

function handleDefeat(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  return generatePeriodicTriggers(primaryCond, ctx);
}

function generatePeriodicTriggers(_primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const synthetic = { ownerEntityId: ctx.operatorSlotId, name: '' } as TimelineEvent;
  for (let frame = 0; frame < TOTAL_FRAMES; frame += FPS) {
    if (!checkSecondary(ctx, frame, ctx.operatorSlotId)) continue;
    matches.push(makeMatch(frame, synthetic, ctx.clauseEffects));
  }
  return matches;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const VERB_HANDLER_REGISTRY = new Map<string, VerbHandler>([
  [VerbType.PERFORM, { findMatches: handlePerform }],
  [VerbType.APPLY,   { findMatches: handleApply }],
  [VerbType.CONSUME, { findMatches: handleConsume }],
  [VerbType.DEAL,    { findMatches: handleDeal }],
  [VerbType.HIT,     { findMatches: handleHit }],
  [VerbType.DEFEAT,  { findMatches: handleDefeat }],
  [VerbType.RECEIVE, { findMatches: handleReceive }],
  [VerbType.BECOME,  { findMatches: handleBecome }],
  [VerbType.RECOVER, { findMatches: handleRecover }],
  [VerbType.HAVE,    { findMatches: handleHave }],
  [VerbType.IS,      { findMatches: handleIs }],
]);

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the condition requires full engine context (talent level, HP,
 * stats) and cannot be evaluated at scan time with only events + frame.
 * These conditions are skipped by findClauseTriggerMatches and deferred to
 * handleEngineTrigger which has the full ConditionContext.
 */
function needsEngineContext(cond: Predicate): boolean {
  if (cond.verb !== VerbType.HAVE && cond.verb !== VerbType.IS) return false;
  // HAVE STATUS / HAVE INFLICTION — evaluable at scan time (checks event presence)
  if (cond.object === NounType.STATUS || cond.object === NounType.INFLICTION) return false;
  // IS/HAVE with state adjectives (ELECTRIFIED, STAGGERED, etc.) — evaluable at scan time
  // via STATE_TO_COLUMN mapping and the IS/BECOME verb handlers
  if (cond.object && STATE_TO_COLUMN[cond.object]) return false;
  // STACKS as subject or object — evaluable at scan time (checks event count)
  if (cond.object === NounType.STACKS || cond.subject === NounType.STACKS) return false;
  // HAVE TALENT_LEVEL, HAVE HP, HAVE POTENTIAL — need full context
  return true;
}

/**
 * Find all trigger matches for a set of trigger clauses against timeline events.
 * Conditions are order-agnostic AND'd predicates. The first scannable condition
 * (any verb with a registered handler, excluding engine-context) drives event scanning. All other
 * scannable conditions are checked as secondary predicates at each candidate frame.
 * Conditions requiring full engine context are skipped (deferred to handleEngineTrigger).
 */
export function findClauseTriggerMatches(
  onTriggerClauses: readonly { conditions: Predicate[]; effects?: TriggerEffect[] }[],
  events: readonly TimelineEvent[],
  operatorSlotId: string,
  stops?: readonly TimeStopRegion[],
  controlledSlotId?: string | ((frame: number) => string),
): TriggerMatch[] {
  const matches: TriggerMatch[] = [];

  if (onTriggerClauses.length === 0) return matches;

  for (const clause of onTriggerClauses) {
    if (!clause.conditions.length) continue;

    // Find the best driver condition. Prefer event-scanning verbs (PERFORM, DEAL,
    // APPLY, etc.) over state-check verbs (HAVE, IS) because state checks work as
    // secondary predicates via evaluateInteraction, but event verbs (DEAL, PERFORM)
    // have no evaluateInteraction handler and can only drive scanning.
    // Within each tier, take the first matching condition (order-agnostic within tier).
    let driverIdx = clause.conditions.findIndex(c =>
      VERB_HANDLER_REGISTRY.has(c.verb as string) && !needsEngineContext(c)
      && c.verb !== VerbType.HAVE && c.verb !== VerbType.IS
    );
    // Fallback: HAVE/IS as driver when no event verb exists
    if (driverIdx === -1) {
      driverIdx = clause.conditions.findIndex(c =>
        VERB_HANDLER_REGISTRY.has(c.verb as string) && !needsEngineContext(c)
      );
    }
    if (driverIdx === -1) continue; // no scannable condition
    const driverCond = clause.conditions[driverIdx];
    const verb = driverCond.verb as string;
    const handler = VERB_HANDLER_REGISTRY.get(verb);
    if (!handler) continue;

    // All other conditions become secondary filters, except those needing engine context
    const otherConditions = clause.conditions.filter((_, i) => i !== driverIdx);
    const scannableConditions = otherConditions.filter(c => !needsEngineContext(c));

    const ctx: VerbHandlerContext = {
      events,
      operatorSlotId,
      secondaryConditions: scannableConditions,
      clauseEffects: clause.effects,
      stops,
      controlledSlotId,
    };

    matches.push(...handler.findMatches(driverCond, ctx));
  }

  // Deduplicate by frame (if multiple clauses match the same frame)
  const seen = new Set<number>();
  return matches.filter(m => {
    if (seen.has(m.frame)) return false;
    seen.add(m.frame);
    return true;
  }).sort((a, b) => a.frame - b.frame);
}

/**
 * Check if a set of trigger clauses represents an "always available" combo
 * (i.e., all conditions use verbs like HIT or HAVE that don't require specific
 * event-based triggers — the combo window spans the entire timeline).
 *
 * HAVE with a stacks threshold (e.g. HAVE VULNERABLE WITH stacks GREATER_THAN_EQUAL 4)
 * is NOT always available — it requires a specific stack count to be reached.
 */
const ALWAYS_AVAILABLE_VERBS = new Set([VerbType.HIT]);
export function isClauseAlwaysAvailable(
  clauses: readonly { conditions: readonly { verb: string; with?: Record<string, unknown> }[] }[],
): boolean {
  if (clauses.length === 0) return false;
  return clauses.every(clause =>
    clause.conditions.length > 0 &&
    clause.conditions.every(c => {
      if (!ALWAYS_AVAILABLE_VERBS.has(c.verb as VerbType)) return false;
      // HAVE with a stacks threshold is event-dependent, not always available
      if (c.verb === VerbType.HAVE && c.with?.stacks) return false;
      return true;
    }),
  );
}
