/**
 * Trigger clause matching utility.
 *
 * Evaluates onTriggerClause conditions against timeline events using a
 * verb-handler registry. Each clause's conditions are grouped by verb,
 * the highest-priority verb is selected as primary, and its handler scans
 * events for trigger frames. Remaining conditions are checked as secondary
 * predicates at each candidate frame.
 */
import { TimelineEvent, computeSegmentsSpan } from '../../consts/viewTypes';
import { CombatSkillsType } from '../../consts/enums';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import {
  ELEMENT_TO_INFLICTION_COLUMN,
  ENEMY_OWNER_ID, OPERATOR_COLUMNS, REACTION_COLUMNS,
  REACTION_COLUMN_IDS, INFLICTION_COLUMN_IDS, SKILL_COLUMNS,
  PHYSICAL_INFLICTION_COLUMNS,
} from '../../model/channels';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { getFinalStrikeTriggerFrame } from './processComboSkill';
import { evaluateInteraction } from './conditionEvaluator';
import type { ConditionContext } from './conditionEvaluator';
import type { TimeStopRegion } from './processTimeStop';
import type { Interaction } from '../../consts/semantics';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Predicate {
  subject: string;
  verb: string;
  object?: string;
  objectId?: string;
  cardinalityConstraint?: string;
  cardinality?: number | string;
  element?: string;
  adjective?: string;
  subjectDeterminer?: string;
  toObject?: string;
  toDeterminer?: string;
  with?: Record<string, unknown>;
}

export interface TriggerEffect {
  verb: string;
  cardinalityConstraint?: string;
  cardinality?: number | string;
  effects?: TriggerSubEffect[];
}

export interface TriggerSubEffect {
  verb: string;
  cardinality?: number;
  object?: string;
  objectId?: string;
  element?: string;
  fromObject?: string;
  toObject?: string;
}

export interface TriggerMatch {
  frame: number;
  sourceOwnerId: string;
  sourceSkillName: string;
  /** The operator that caused this event (e.g. who applied the infliction). */
  originOwnerId?: string;
  /** The column ID of the source event that matched this trigger. */
  sourceColumnId?: string;
  effects?: TriggerEffect[];
}

interface VerbHandlerContext {
  events: TimelineEvent[];
  operatorSlotId: string;
  secondaryConditions: Predicate[];
  clauseEffects?: TriggerEffect[];
  stops?: readonly TimeStopRegion[];
}

type VerbHandlerFn = (primaryCond: Predicate, ctx: VerbHandlerContext) => TriggerMatch[];

interface VerbHandler {
  /** Lower = higher priority when selecting the primary verb from a clause. */
  priority: number;
  findMatches: VerbHandlerFn;
}

// ── Column ID mapping ─────────────────────────────────────────────────────────

const REACTION_STATUS_TO_COLUMN: Record<string, string> = {
  COMBUSTION: REACTION_COLUMNS.COMBUSTION,
  SOLIDIFICATION: REACTION_COLUMNS.SOLIDIFICATION,
  CORROSION: REACTION_COLUMNS.CORROSION,
  ELECTRIFICATION: REACTION_COLUMNS.ELECTRIFICATION,
};

export function statusNameToColumnId(name: string): string {
  return REACTION_STATUS_TO_COLUMN[name]
    ?? (OPERATOR_COLUMNS as Record<string, string>)[name]
    ?? (PHYSICAL_INFLICTION_COLUMNS as Record<string, string>)[name]
    ?? name.toLowerCase().replace(/_/g, '-');
}

// ── Shared helpers ────────────────────────────────────────────────────────────

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

const SKILL_OBJECT_TO_COLUMN: Record<string, string> = {
  BASIC_ATTACK: SKILL_COLUMNS.BASIC,
  BATTLE_SKILL: SKILL_COLUMNS.BATTLE,
  COMBO_SKILL:  SKILL_COLUMNS.COMBO,
  ULTIMATE:     SKILL_COLUMNS.ULTIMATE,
};

const STATE_TO_REACTION_COLUMN: Record<string, string> = {
  COMBUSTED:     REACTION_COLUMNS.COMBUSTION,
  SOLIDIFIED:    REACTION_COLUMNS.SOLIDIFICATION,
  CORRODED:      REACTION_COLUMNS.CORROSION,
  ELECTRIFIED:   REACTION_COLUMNS.ELECTRIFICATION,
};

const SKIP_COLUMNS = new Set<string>([
  SKILL_COLUMNS.BASIC, SKILL_COLUMNS.BATTLE, SKILL_COLUMNS.COMBO, SKILL_COLUMNS.ULTIMATE,
]);

/**
 * Resolve which timeline columns to scan for a given object + element/adjective + objectId.
 * Returns undefined for generic STATUS (needs fallback scan logic).
 */
function resolveColumns(cond: Predicate): Set<string> | undefined {
  const el = cond.element ?? cond.adjective;

  switch (cond.object) {
    case 'REACTION':
    case 'ARTS_REACTION':
      if (cond.objectId) {
        const colId = (REACTION_COLUMNS as Record<string, string>)[cond.objectId];
        return colId ? new Set([colId]) : new Set();
      }
      return new Set(REACTION_COLUMN_IDS);

    case 'INFLICTION':
      if (el) {
        const colId = ELEMENT_TO_INFLICTION_COLUMN[el];
        return colId ? new Set([colId]) : new Set();
      }
      return new Set(INFLICTION_COLUMN_IDS);

    case 'ARTS_BURST':
      // Arts Burst events live in infliction columns, filtered by isArtsBurst flag in scanEvents
      return new Set(INFLICTION_COLUMN_IDS);

    case 'STATUS':
      if (cond.objectId) return new Set([statusNameToColumnId(cond.objectId)]);
      return undefined; // generic — needs fallback

    case 'STAGGER':
      return new Set(['node-stagger', 'full-stagger']);

    default:
      return undefined;
  }
}

/**
 * Resolve which ownerId to filter events by, based on verb semantics.
 *
 * For action verbs (APPLY, CONSUME), the subject is the actor and the target
 * (toObject) is the recipient. Timeline events are owned by the recipient.
 * For state/possession verbs (HAVE, IS, RECEIVE), the subject is the entity.
 * For skill verbs (PERFORM, DEAL, RECOVER), the subject is the performer.
 */
function resolveOwnerFilter(cond: Predicate, operatorSlotId: string, verb?: string) {
  const det = cond.subjectDeterminer;
  const isAnyOperator = cond.subject === 'OPERATOR' && det === 'ANY';
  const toObj = cond.toObject;
  const toDet = cond.toDeterminer;

  // Action verbs: event ownerId = recipient (toObject), not subject
  const isActionVerb = verb === 'APPLY' || verb === 'CONSUME';

  return {
    isAnyOperator,
    matchesOwner(ownerId: string) {
      if (isActionVerb && toObj) {
        // Explicit target — match event owner against target
        if (toObj === 'ENEMY') return ownerId === ENEMY_OWNER_ID;
        if (toObj === 'OPERATOR') {
          if (toDet === 'ANY') return ownerId !== ENEMY_OWNER_ID && ownerId !== COMMON_OWNER_ID;
          if (toDet === 'ALL') return true; // team-wide
          if (toDet === 'OTHER') return ownerId !== operatorSlotId && ownerId !== ENEMY_OWNER_ID && ownerId !== COMMON_OWNER_ID;
          return ownerId === operatorSlotId; // THIS or default
        }
        return true;
      }
      if (isActionVerb) {
        // No explicit target — wildcard (match any recipient)
        return true;
      }
      // Subject-based filtering (PERFORM, HAVE, IS, RECEIVE, DEAL, RECOVER, etc.)
      if (cond.subject === 'ENEMY') return ownerId === ENEMY_OWNER_ID;
      if (isAnyOperator) return ownerId !== ENEMY_OWNER_ID && ownerId !== COMMON_OWNER_ID;
      return ownerId === operatorSlotId;
    },
  };
}

function checkSecondary(ctx: VerbHandlerContext, frame: number): boolean {
  return ctx.secondaryConditions.every(sc =>
    checkPredicate(sc, ctx.events, ctx.operatorSlotId, frame)
  );
}

function makeMatch(frame: number, ev: TimelineEvent, effects?: TriggerEffect[]): TriggerMatch {
  return { frame, sourceOwnerId: ev.ownerId, sourceSkillName: ev.name, originOwnerId: ev.sourceOwnerId, sourceColumnId: ev.columnId, effects };
}

/**
 * Generic event scanner: resolve columns + owner, scan events, trigger on startFrame.
 * Used by APPLY, CONSUME, RECEIVE.
 */
function scanEvents(primaryCond: Predicate, ctx: VerbHandlerContext, verb: string): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const columns = resolveColumns(primaryCond);
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, verb);

  for (const ev of ctx.events) {
    if (columns) {
      if (!columns.has(ev.columnId)) continue;
    } else if (primaryCond.object === 'STATUS') {
      // Generic STATUS fallback: exclude skill/infliction/reaction columns
      if (REACTION_COLUMN_IDS.has(ev.columnId)) continue;
      if (INFLICTION_COLUMN_IDS.has(ev.columnId)) continue;
      if (SKIP_COLUMNS.has(ev.columnId)) continue;
    } else {
      continue;
    }
    // Arts Burst: only match infliction events flagged as same-element stacking
    if (primaryCond.object === 'ARTS_BURST' && !ev.isArtsBurst) continue;
    if (!matchesOwner(ev.ownerId)) continue;
    if (!checkSecondary(ctx, ev.startFrame)) continue;

    matches.push(makeMatch(ev.startFrame, ev, ctx.clauseEffects));
  }
  return matches;
}

// ── PERFORM handler ──────────────────────────────────────────────────────────

function handlePerform(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const { matchesOwner, isAnyOperator } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, 'PERFORM');

  if (primaryCond.object === 'FINAL_STRIKE') {
    for (const ev of ctx.events) {
      if (!matchesOwner(ev.ownerId)) continue;
      if (ev.columnId !== SKILL_COLUMNS.BASIC) continue;
      if (ev.name === CombatSkillsType.FINISHER || ev.name === CombatSkillsType.DIVE) continue;

      const triggerFrame = getFinalStrikeTriggerFrame(ev, ctx.stops);
      if (triggerFrame == null) continue;
      if (!checkSecondary(ctx, triggerFrame)) continue;

      matches.push(makeMatch(triggerFrame, ev, ctx.clauseEffects));
    }
    return matches;
  }

  // FINISHER / DIVE_ATTACK — match events on basic column by skill name
  if (primaryCond.object === 'FINISHER' || primaryCond.object === 'DIVE_ATTACK') {
    const targetName = primaryCond.object === 'FINISHER' ? CombatSkillsType.FINISHER : CombatSkillsType.DIVE;
    for (const ev of ctx.events) {
      if (!matchesOwner(ev.ownerId)) continue;
      if (ev.columnId !== SKILL_COLUMNS.BASIC) continue;
      if (ev.name !== targetName) continue;

      const triggerFrame = getFirstEventFrame(ev);
      if (!checkSecondary(ctx, triggerFrame)) continue;

      matches.push(makeMatch(triggerFrame, ev, ctx.clauseEffects));
    }
    return matches;
  }

  const matchingColumn = SKILL_OBJECT_TO_COLUMN[primaryCond.object ?? ''] ?? primaryCond.object;

  for (const ev of ctx.events) {
    if (!isAnyOperator && ev.ownerId !== ctx.operatorSlotId) continue;
    if (isAnyOperator && (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID)) continue;
    if (ev.columnId !== matchingColumn) continue;

    const triggerFrame = getFirstEventFrame(ev);
    if (!checkSecondary(ctx, triggerFrame)) continue;

    matches.push(makeMatch(triggerFrame, ev, ctx.clauseEffects));
  }
  return matches;
}

// ── HAVE handler ─────────────────────────────────────────────────────────────

function handleHave(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  if ((primaryCond.object !== 'STATUS' && primaryCond.object !== 'INFLICTION') || !primaryCond.objectId) return matches;

  const colId = statusNameToColumnId(primaryCond.objectId);
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, 'HAVE');

  // Extract statusLevel threshold from `with.statusLevel` if present
  const statusLevelThreshold = extractStatusLevelThreshold(primaryCond);

  if (statusLevelThreshold != null) {
    // Count concurrent events on the column to find when the threshold is reached.
    const colEvents = ctx.events
      .filter(ev => ev.columnId === colId && matchesOwner(ev.ownerId))
      .sort((a, b) => a.startFrame - b.startFrame);

    for (let i = 0; i < colEvents.length; i++) {
      const candidateFrame = colEvents[i].startFrame;
      let activeCount = 0;
      for (const ev of colEvents) {
        const evEnd = ev.startFrame + computeSegmentsSpan(ev.segments);
        if (ev.startFrame <= candidateFrame && candidateFrame < evEnd) {
          activeCount++;
        }
      }
      if (activeCount >= statusLevelThreshold) {
        if (!checkSecondary(ctx, candidateFrame)) continue;
        matches.push(makeMatch(candidateFrame, colEvents[i], ctx.clauseEffects));
      }
    }
  } else {
    for (const ev of ctx.events) {
      if (ev.columnId !== colId) continue;
      if (!matchesOwner(ev.ownerId)) continue;

      if (primaryCond.cardinality != null) {
        if (!checkPredicate(primaryCond, ctx.events, ctx.operatorSlotId, ev.startFrame)) continue;
      }
      if (!checkSecondary(ctx, ev.startFrame)) continue;

      matches.push(makeMatch(ev.startFrame, ev, ctx.clauseEffects));
    }
  }
  return matches;
}

/** Extract a statusLevel threshold from a predicate's `with.statusLevel` block. */
function extractStatusLevelThreshold(cond: Predicate): number | null {
  const w = cond.with;
  if (!w) return null;
  const sl = w.statusLevel as { verb?: string; cardinalityConstraint?: string; values?: number[] } | undefined;
  if (!sl?.values?.length) return null;
  if (sl.cardinalityConstraint === 'AT_LEAST') return sl.values[0];
  return null;
}

// ── RECOVER handler ──────────────────────────────────────────────────────────

function handleRecover(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, 'RECOVER');

  if (primaryCond.object === 'SKILL_POINT') {
    for (const ev of ctx.events) {
      if (!matchesOwner(ev.ownerId)) continue;
      let cumulativeOffset = 0;
      for (const seg of ev.segments) {
        if (seg.frames) {
          for (const frame of seg.frames) {
            if (frame.skillPointRecovery && frame.skillPointRecovery > 0) {
              const triggerFrame = ev.startFrame + cumulativeOffset + frame.offsetFrame;
              if (!checkSecondary(ctx, triggerFrame)) continue;
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
  const colId = STATE_TO_REACTION_COLUMN[primaryCond.object ?? ''];
  if (!colId) return [];

  const matches: TriggerMatch[] = [];
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, 'IS');

  for (const ev of ctx.events) {
    if (ev.columnId !== colId) continue;
    if (!matchesOwner(ev.ownerId)) continue;
    if (!checkSecondary(ctx, ev.startFrame)) continue;
    matches.push(makeMatch(ev.startFrame, ev, ctx.clauseEffects));
  }
  return matches;
}

function handleBecome(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  return handleIs(primaryCond, ctx);
}

// ── APPLY / CONSUME / RECEIVE handlers ───────────────────────────────────────

function handleApply(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  return scanEvents(primaryCond, ctx, 'APPLY');
}

function handleConsume(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  return scanEvents(primaryCond, ctx, 'CONSUME');
}

function handleReceive(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  return scanEvents(primaryCond, ctx, 'RECEIVE');
}

// ── DEAL handler ─────────────────────────────────────────────────────────────

function handleDeal(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, 'DEAL');

  for (const ev of ctx.events) {
    if (!matchesOwner(ev.ownerId)) continue;

    let cumulativeOffset = 0;
    for (const seg of ev.segments) {
      if (seg.frames) {
        for (const frame of seg.frames) {
          const triggerFrame = ev.startFrame + cumulativeOffset + frame.offsetFrame;
          if (!checkSecondary(ctx, triggerFrame)) continue;
          matches.push(makeMatch(triggerFrame, ev, ctx.clauseEffects));
        }
      }
      cumulativeOffset += seg.properties.duration;
    }
  }
  return matches;
}

// ── HIT / DEFEAT handlers ────────────────────────────────────────────────────
// Non-observable in a planner — generate periodic triggers every second.

function handleHit(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  return generatePeriodicTriggers(primaryCond, ctx);
}

function handleDefeat(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  return generatePeriodicTriggers(primaryCond, ctx);
}

function generatePeriodicTriggers(_primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const synthetic = { ownerId: ctx.operatorSlotId, name: '' } as TimelineEvent;
  for (let frame = 0; frame < TOTAL_FRAMES; frame += FPS) {
    if (!checkSecondary(ctx, frame)) continue;
    matches.push(makeMatch(frame, synthetic, ctx.clauseEffects));
  }
  return matches;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const VERB_HANDLER_REGISTRY = new Map<string, VerbHandler>([
  ['PERFORM', { priority: 10, findMatches: handlePerform }],
  ['APPLY',   { priority: 20, findMatches: handleApply }],
  ['CONSUME', { priority: 25, findMatches: handleConsume }],
  ['DEAL',    { priority: 30, findMatches: handleDeal }],
  ['HIT',     { priority: 35, findMatches: handleHit }],
  ['DEFEAT',  { priority: 40, findMatches: handleDefeat }],
  ['RECEIVE', { priority: 50, findMatches: handleReceive }],
  ['BECOME',  { priority: 55, findMatches: handleBecome }],
  ['RECOVER', { priority: 60, findMatches: handleRecover }],
  ['HAVE',    { priority: 70, findMatches: handleHave }],
  ['IS',      { priority: 80, findMatches: handleIs }],
]);

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Find all trigger matches for a set of trigger clauses against timeline events.
 * Uses a verb-handler registry: each trigger clause's conditions are grouped
 * by verb, the highest-priority verb is selected as primary, and its handler
 * scans events for trigger frames. Remaining conditions are checked as
 * secondary predicates at each candidate frame.
 */
export function findClauseTriggerMatches(
  onTriggerClauses: readonly { conditions: Predicate[]; effects?: TriggerEffect[] }[],
  events: TimelineEvent[],
  operatorSlotId: string,
  stops?: readonly TimeStopRegion[],
): TriggerMatch[] {
  const matches: TriggerMatch[] = [];

  if (onTriggerClauses.length === 0) return matches;

  for (const clause of onTriggerClauses) {
    // Find the primary verb — the one with the lowest priority number
    let primaryVerb: string | undefined;
    let bestPriority = Infinity;
    for (const cond of clause.conditions) {
      const handler = VERB_HANDLER_REGISTRY.get(cond.verb as string);
      if (handler && handler.priority < bestPriority) {
        bestPriority = handler.priority;
        primaryVerb = cond.verb as string;
      }
    }

    if (!primaryVerb) continue;
    const handler = VERB_HANDLER_REGISTRY.get(primaryVerb)!;
    const primaryCond = clause.conditions.find(c => c.verb === primaryVerb)!;
    const secondaryConditions = clause.conditions.filter(c => c !== primaryCond);

    const ctx: VerbHandlerContext = {
      events,
      operatorSlotId,
      secondaryConditions,
      clauseEffects: clause.effects,
      stops,
    };

    matches.push(...handler.findMatches(primaryCond, ctx));
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
 * HAVE with a statusLevel threshold (e.g. HAVE VULNERABLE WITH statusLevel AT_LEAST 4)
 * is NOT always available — it requires a specific stack count to be reached.
 */
const ALWAYS_AVAILABLE_VERBS = new Set(['HIT', 'HAVE']);
export function isClauseAlwaysAvailable(
  clauses: readonly { conditions: readonly { verb: string; with?: Record<string, unknown> }[] }[],
): boolean {
  if (clauses.length === 0) return false;
  return clauses.every(clause =>
    clause.conditions.length > 0 &&
    clause.conditions.every(c => {
      if (!ALWAYS_AVAILABLE_VERBS.has(c.verb)) return false;
      // HAVE with a statusLevel threshold is event-dependent, not always available
      if (c.verb === 'HAVE' && c.with?.statusLevel) return false;
      return true;
    }),
  );
}
