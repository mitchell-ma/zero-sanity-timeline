/**
 * Generic status derivation engine.
 *
 * Evaluates `statusEvents` from operator JSONs against timeline state,
 * producing derived TimelineEvent instances. Replaces hardcoded derive*
 * functions in processStatus.ts one at a time.
 *
 * Supports:
 * - Empty onTriggerClause (passive/talent buffs, e.g. Messenger's Song)
 * - PERFORM triggers (skill-cast-based, e.g. Scorching Heart via Melting Flame)
 * - HAVE STATUS triggers (reaction-based, e.g. Scorching Fangs on Combustion)
 * - Compound triggers (PERFORM X while ENEMY HAVE Y, e.g. Wildland Trekker)
 * - Stack threshold clauses (at max stacks → apply derived status)
 * - Stack interaction types: NONE (independent), RESET (refresh earlier)
 */
import { TimelineEvent, EventSegmentData, eventEndFrame, durationSegment, setEventDuration } from '../../consts/viewTypes';
import { CombatSkillsType, EventStatusType } from '../../consts/enums';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { ENEMY_OWNER_ID, OPERATOR_COLUMNS, REACTION_COLUMNS, REACTION_COLUMN_IDS, INFLICTION_COLUMN_IDS, SKILL_COLUMNS } from '../../model/channels';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { getOperatorJson, getSkillIds, getAllOperatorIds } from '../../model/event-frames/operatorJsonLoader';
import { getWeaponEffectDefs, getGearEffectDefs, NormalizedEffectDef } from '../../model/game-data/weaponGearEffectLoader';
import { LoadoutProperties } from '../../view/InformationPane';
import { ELEMENT_TO_INFLICTION_COLUMN } from './processInfliction';
import { getFinalStrikeTriggerFrame } from './processComboSkill';
import { evaluateInteraction, evaluateConditions, ConditionContext } from './conditionEvaluator';
import { executeEffects, applyMutations } from './effectExecutor';
import type { ExecutionContext } from './effectExecutor';
import type { Interaction, Effect as SemanticEffect } from '../../consts/semantics';

// ── Types from JSON ─────────────────────────────────────────────────────────

interface StatusSegmentDef {
  properties?: { name?: string; duration?: { value: number | number[]; unit: string } };
  clause?: EffectClause[];
  onTriggerClause?: TriggerClause[];
  onEntryClause?: EffectClause[];
  onExitClause?: EffectClause[];
}

/** Properties block nested inside a status event definition. */
interface StatusProperties {
  id: string;
  name?: string;
  type?: string;
  element?: string;
  target?: string;
  targetDeterminer?: string;
  isForced?: boolean;
  enhancementTypes?: string[];
  statusLevel: {
    statusLevelInteractionType: string;
    limit: { verb: string; value: number };
  };
  duration?: { value: number | number[]; unit: string };
  susceptibility?: Record<string, number[]>;
  cooldownSeconds?: number;
}

export interface StatusEventDef {
  properties: StatusProperties;
  metadata?: { originId?: string };
  onTriggerClause?: TriggerClause[];
  onEntryClause?: EffectClause[];
  clause?: EffectClause[];
  onExitClause?: EffectClause[];
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
}

interface Effect {
  verb: string;
  object: string;
  objectId?: string;
  toObject?: string;
  toDeterminer?: string;
}

interface TriggerEffect {
  verb: string;
  cardinalityConstraint?: string;
  cardinality?: number | string;
  effects?: TriggerSubEffect[];
}

interface TriggerSubEffect {
  verb: string;
  cardinality?: number;
  object?: string;
  objectId?: string;
  element?: string;
  fromObject?: string;
  toObject?: string;
}

/** Shape of a with-value block inside a clause effect (IS or BASED_ON). */
interface ClauseWithValue {
  verb: string;
  object?: string | string[];
  value: number | number[] | Record<string, unknown>;
}

/** Effect shape inside clause arrays: supports adjective + with block. */
interface ClauseEffectEntry {
  verb: string;
  object: string;
  adjective?: string;
  with?: { value: ClauseWithValue };
}

/** A clause with conditions and clause-style effects (as used in resolveClauseEffectsFromClauses). */
interface ResolvedClause {
  conditions: Predicate[];
  effects: ClauseEffectEntry[];
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
    const talentLevel = 1 // TODO: resolve talent level from DSL;
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
 * Supports short keys (verb, object, with) from operator-statuses JSONs.
 *
 * When `skipConditional` is false, evaluates non-EVENT conditions and applies matching effects.
 */
function resolveClauseEffectsFromClauses(
  ev: TimelineEvent,
  clauses: ResolvedClause[],
  ctx: DeriveContext,
  def: StatusEventDef,
  skipConditional = true,
): void {
  for (const clause of clauses) {
    if (clause.conditions && clause.conditions.length > 0) {
      if (skipConditional) {
        // Check if all conditions reference EVENT — those are threshold conditions
        // handled by evaluateThresholdClauses, so skip them here.
        const hasThisEvent = clause.conditions.some((c: Predicate) => c.subject === 'EVENT');
        if (hasThisEvent) continue;

        // Non-EVENT conditions: evaluate them now
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
      const verb = effect.verb ?? effect.verb;
      const object = effect.object ?? effect.object;
      const adjective = effect.adjective;
      const withBlock = effect.with ?? effect.with;
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
            const talentLevel = 1 // TODO: resolve talent level from DSL;
            return arr[Math.min(talentLevel, arr.length) - 1] ?? arr[0];
          }
          return undefined;
        }

        // Multi-dimension: object is an array, value is a nested map
        if (Array.isArray(dims) && typeof val === 'object' && !Array.isArray(val)) {
          let current: unknown = val;
          for (const dim of dims as string[]) {
            if (typeof current !== 'object' || current === null) return undefined;
            const currentObj = current as Record<string, unknown>;
            const keys = Object.keys(currentObj);
            const key = resolveClauseDimensionKey(dim, ctx, def, keys);
            if (!key) return undefined;
            current = currentObj[key];
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
  const clauses = def.clause as ResolvedClause[] | undefined;
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
  target: string | undefined,
  operatorSlotId: string,
  operatorSlotMap?: Record<string, string>,
  determiner?: string,
  targetOwnerId?: string,
): string {
  if (!target) return operatorSlotId;
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

// ── Normalize weapon/gear effect defs into StatusEventDef shape ──────────────

function normalizeEquipDef(raw: NormalizedEffectDef): StatusEventDef {
  // Support both pre-normalized (top-level fields) and raw JSON (nested in properties)
  const rp = raw.properties as Record<string, unknown> | undefined;
  const id = raw.id ?? raw.name ?? (rp?.id as string) ?? (rp?.name as string) ?? '';
  const name = raw.name ?? (rp?.name as string);
  const target = raw.target ?? (rp?.target as string);
  const targetDeterminer = raw.targetDeterminer ?? (rp?.targetDeterminer as string);
  const sl = raw.statusLevel ?? (rp?.statusLevel as NormalizedEffectDef['statusLevel']);

  const slLimit = sl?.limit as { verb?: string; value?: number } | undefined;
  const statusLevel: StatusEventDef['properties']['statusLevel'] = {
    limit: slLimit?.verb
      ? { verb: slLimit.verb, value: slLimit.value ?? 1 }
      : { verb: 'IS', value: 1 },
    statusLevelInteractionType: sl?.statusLevelInteractionType ?? 'NONE',
  };

  return {
    ...raw,
    properties: {
      id,
      name,
      target,
      targetDeterminer,
      isForced: raw.isForced ?? (rp?.isForced as boolean),
      enhancementTypes: raw.enhancementTypes ?? (rp?.enhancementTypes as string[]),
      statusLevel,
      duration: rp?.duration as StatusEventDef['properties']['duration'],
      susceptibility: raw.susceptibility ?? (rp?.susceptibility as string),
      cooldownSeconds: raw.cooldownSeconds ?? (rp?.cooldownSeconds as number),
    },
    onTriggerClause: raw.onTriggerClause as TriggerClause[] ?? [],
  } as StatusEventDef;
}

// ── Max stacks by potential ─────────────────────────────────────────────────

function getMaxStacks(limit: { verb: string; value: number }, _potential: number): number {
  return limit.value ?? 1;
}

// ── Duration resolution ─────────────────────────────────────────────────────

function getDurationFrames(duration: { value: number | number[]; unit: string }): number {
  const val = Array.isArray(duration.value) ? duration.value[0] : duration.value;
  if (val < 0) return TOTAL_FRAMES; // -1 = permanent
  if (duration.unit === 'SECOND') return Math.round(val * 120);
  return val;
}

// ── Trigger evaluation ──────────────────────────────────────────────────────

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

// ── Verb handler registry ────────────────────────────────────────────────────

interface VerbHandlerContext {
  events: TimelineEvent[];
  operatorSlotId: string;
  secondaryConditions: Predicate[];
  clauseEffects?: TriggerEffect[];
  stops?: readonly import('./processTimeStop').TimeStopRegion[];
}

type VerbHandlerFn = (primaryCond: Predicate, ctx: VerbHandlerContext) => TriggerMatch[];

interface VerbHandler {
  /** Lower = higher priority when selecting the primary verb from a clause. */
  priority: number;
  findMatches: VerbHandlerFn;
}

// ── Shared column + owner resolution ─────────────────────────────────────────

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
 * Used by APPLY, CONSUME, RECEIVE, IS, BECOME.
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
  if (primaryCond.object !== 'STATUS' || !primaryCond.objectId) return matches;

  const colId = statusNameToColumnId(primaryCond.objectId);
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, 'HAVE');

  for (const ev of ctx.events) {
    if (ev.columnId !== colId) continue;
    if (!matchesOwner(ev.ownerId)) continue;

    if (primaryCond.cardinality != null) {
      if (!checkPredicate(primaryCond, ctx.events, ctx.operatorSlotId, ev.startFrame)) continue;
    }
    if (!checkSecondary(ctx, ev.startFrame)) continue;

    matches.push(makeMatch(ev.startFrame, ev, ctx.clauseEffects));
  }
  return matches;
}

// ── RECOVER handler ──────────────────────────────────────────────────────────

function handleRecover(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, 'RECOVER');

  if (primaryCond.object === 'SKILL_POINT') {
    for (const ev of ctx.events) {
      if (!matchesOwner(ev.ownerId)) continue;
      if (!ev.segments) continue;
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
// All three scan the same column types (infliction/reaction/status).
// The difference is semantic owner resolution:
//   APPLY/CONSUME: subject = actor, event owner = recipient (use toObject)
//   RECEIVE: subject = recipient, event owner = subject

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
// Scans skill events for frame ticks (damage frames).

function handleDeal(primaryCond: Predicate, ctx: VerbHandlerContext): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const { matchesOwner } = resolveOwnerFilter(primaryCond, ctx.operatorSlotId, 'DEAL');

  for (const ev of ctx.events) {
    if (!matchesOwner(ev.ownerId)) continue;
    if (!ev.segments) continue;

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
// Cooldown/stack system in deriveStatusEvents filters to actual procs.

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

// ── findTriggerMatches ───────────────────────────────────────────────────────

/**
 * Find all trigger matches for a status event definition.
 *
 * Uses a verb-handler registry: each trigger clause's conditions are grouped
 * by verb, the highest-priority verb is selected as primary, and its handler
 * scans events for trigger frames. Remaining conditions are checked as
 * secondary predicates at each candidate frame.
 */
/**
 * Find all trigger matches for a set of trigger clauses against timeline events.
 * Exported so combo window derivation can reuse the same verb-handler registry.
 */
export function findClauseTriggerMatches(
  onTriggerClauses: readonly { conditions: Predicate[]; effects?: TriggerEffect[] }[],
  events: TimelineEvent[],
  operatorSlotId: string,
  stops?: readonly import('./processTimeStop').TimeStopRegion[],
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
 */
const ALWAYS_AVAILABLE_VERBS = new Set(['HIT', 'HAVE']);
export function isClauseAlwaysAvailable(
  clauses: readonly { conditions: readonly { verb: string }[] }[],
): boolean {
  if (clauses.length === 0) return false;
  return clauses.every(clause =>
    clause.conditions.length > 0 &&
    clause.conditions.every(c => ALWAYS_AVAILABLE_VERBS.has(c.verb)),
  );
}

function findTriggerMatches(
  def: StatusEventDef,
  events: TimelineEvent[],
  operatorSlotId: string,
): TriggerMatch[] {
  return findClauseTriggerMatches(def.onTriggerClause ?? [], events, operatorSlotId);
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
  const applySubEffect = (def.onTriggerClause ?? [])
    .flatMap(c => c.effects ?? [])
    .filter(e => e.verb === 'ALL')
    .flatMap(e => e.effects ?? [])
    .find(e => e.verb === 'APPLY' && e.object === 'STATUS' && e.objectId);
  let outputDef = def;
  if (applySubEffect?.objectId) {
    const json = getOperatorJson(ctx.operatorId);
    const targetDef = (json?.statusEvents as StatusEventDef[] ?? [])
      .find(d => d.properties.id === applySubEffect.objectId);
    if (targetDef) outputDef = targetDef;
  }

  const durationFrames = outputDef.properties.duration ? getDurationFrames(outputDef.properties.duration) : TOTAL_FRAMES;
  const ownerId = resolveOwnerId(outputDef.properties.target, operatorSlotId, ctx.operatorSlotMap, outputDef.properties.targetDeterminer);
  const statusId = outputDef.properties.id ?? outputDef.properties.name;
  if (!statusId) return empty;
  const columnId = statusNameToColumnId(statusId);
  const limitMap = outputDef.properties.statusLevel.limit;
  const maxStacks = getMaxStacks(limitMap, ctx.potential);

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
      const end = eventEndFrame(ev);
      return ev.startFrame <= trigger.frame && trigger.frame < end;
    }).length;
    // Always count existing events (frame-derived or from a previous derivation pass)
    activeAtFrame += events.filter(ev =>
      ev.columnId === columnId &&
      ev.ownerId === ownerId &&
      ev.eventStatus !== EventStatusType.CONSUMED &&
      ev.startFrame <= trigger.frame &&
      trigger.frame < eventEndFrame(ev)
    ).length;
    if (activeAtFrame >= maxStacks) continue;

    // Determine how many events to create: 1 normally, N for ALL with CONSUME infliction
    let createCount = 1;
    const allEffect = trigger.effects?.find(e => e.verb === 'ALL');
    const absorbSubEffect = allEffect?.effects?.find(e => e.verb === 'CONSUME' && e.object === 'INFLICTION');
    let inflictionsToAbsorb: TimelineEvent[] = [];

    if (absorbSubEffect?.element) {
      const inflictionCol = ELEMENT_TO_INFLICTION_COLUMN[absorbSubEffect.element];
      if (inflictionCol) {
        inflictionsToAbsorb = events.filter(ev =>
          ev.ownerId === ENEMY_OWNER_ID &&
          ev.columnId === inflictionCol &&
          ev.startFrame <= trigger.frame &&
          trigger.frame < eventEndFrame(ev) &&
          ev.eventStatus !== EventStatusType.CONSUMED &&
          !absorbedIds.has(ev.id)
        ).sort((a, b) => a.startFrame - b.startFrame);

        createCount = Math.min(maxStacks - activeAtFrame, inflictionsToAbsorb.length);
        if (createCount <= 0) continue;
      }
    }

    for (let ci = 0; ci < createCount; ci++) {
      const evId = `${outputDef.properties.id.toLowerCase()}-${operatorSlotId}-${idCounter++}`;

      // For RESET stacks: clamp previous instances
      if (outputDef.properties.statusLevel.statusLevelInteractionType === 'RESET' && derived.length > 0) {
        const prev = derived[derived.length - 1];
        const prevEnd = eventEndFrame(prev);
        if (trigger.frame < prevEnd) {
          const clampedPrev = { ...prev, segments: [...prev.segments] };
          setEventDuration(clampedPrev, trigger.frame - prev.startFrame);
          derived[derived.length - 1] = {
            ...clampedPrev,
            eventStatus: EventStatusType.REFRESHED,
            eventStatusOwnerId: trigger.sourceOwnerId,
            eventStatusSkillName: trigger.sourceSkillName,
          };
        }
      }

      const ev: TimelineEvent = {
        id: evId,
        name: outputDef.properties.id,
        ownerId,
        columnId,
        startFrame: trigger.frame,
        segments: durationSegment(durationFrames),
        sourceOwnerId: operatorSlotId,
        sourceSkillName: trigger.sourceSkillName,
      };

      // Resolve clause effects (susceptibility, damage bonus, resistance ignore)
      resolveClauseEffects(ev, outputDef, ctx);

      // Segment support: multi-phase statuses (e.g. Antal Focus: 20s Focus + 40s Empowered Focus)
      if (outputDef.segments && outputDef.segments.length > 0) {
        const segments: EventSegmentData[] = [];
        for (const seg of outputDef.segments) {
          const segDuration = seg.properties?.duration
            ? getDurationFrames(seg.properties.duration)
            : durationFrames;
          const segData: EventSegmentData = {
            properties: { duration: segDuration, name: seg.properties?.name },
          };
          // Resolve per-segment susceptibility from segment clauses
          if (seg.clause) {
            const segEv: TimelineEvent = { ...ev, susceptibility: undefined };
            resolveClauseEffectsFromClauses(
              segEv,
              seg.clause as ResolvedClause[],
              ctx, def, false,
            );
            if (segEv.susceptibility) {
              segData.unknown = { ...segData.unknown, susceptibility: segEv.susceptibility };
            }
          }
          segments.push(segData);
        }
        ev.segments = segments;
        // Use first segment's susceptibility as event-level default
        if (!ev.susceptibility && segments[0]?.unknown?.susceptibility) {
          ev.susceptibility = segments[0].unknown.susceptibility as TimelineEvent['susceptibility'];
        }
      }

      // Legacy: susceptibility from flat config (e.g. skills JSON statusEvents)
      if (!ev.susceptibility && outputDef.properties.susceptibility) {
        const resolved: Record<string, number> = {};
        for (const [element, values] of Object.entries(outputDef.properties.susceptibility)) {
          const arr = values as number[];
          const talentLevel = 1; // TODO: resolve talent level from DSL
          resolved[element] = arr[Math.min(talentLevel, arr.length) - 1] ?? arr[0];
        }
        ev.susceptibility = resolved;
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

  const maxStacks = getMaxStacks(def.properties.statusLevel.limit, ctx.potential);
  const thresholdDerived: TimelineEvent[] = [];
  let idCounter = 0;

  for (const clause of def.clause) {
    // Check for HAVE STACKS EXACTLY MAX condition
    const stackCond = clause.conditions.find(c =>
      c.subject === 'EVENT' && c.verb === 'HAVE' && c.object === 'STACKS'
    );
    if (!stackCond) continue;

    const targetCount = stackCond.cardinality === 'MAX' ? maxStacks : Number(stackCond.cardinality);

    // Find frames where the stack count crosses the threshold
    const allStatusEvents = [...ctx.events, ...derivedEvents]
      .filter(ev => ev.columnId === statusNameToColumnId(def.properties.id) && ev.ownerId === resolveOwnerId(def.properties.target, ctx.operatorSlotId, ctx.operatorSlotMap, def.properties.targetDeterminer))
      .sort((a, b) => a.startFrame - b.startFrame);

    for (const ev of allStatusEvents) {
      // Count active stacks at this event's start frame (including itself)
      let activeCount = 0;
      let countWithout = 0;
      for (const other of allStatusEvents) {
        const otherEnd = eventEndFrame(other);
        if (other.startFrame <= ev.startFrame && ev.startFrame < otherEnd) {
          activeCount++;
          if (other.id !== ev.id) countWithout++;
        }
      }

      if (activeCount < targetCount) continue;
      if (countWithout >= targetCount) continue; // already at threshold before this event

      // Execute clause effects
      for (const effect of clause.effects) {
        if (effect.verb === 'APPLY' && effect.object === 'STATUS' && effect.objectId) {
          // Find the target status definition to get its properties
          const targetStatusName = effect.objectId;

          // Look for the target status def in the same operator's statusEvents
          const json = getOperatorJson(ctx.operatorId);
          const targetDef = (json?.statusEvents as StatusEventDef[] ?? [])
            .find(d => d.properties.id === targetStatusName);

          // Resolve owner from the target def's own target field (authoritative),
          // falling back to the clause's toObject
          const targetField = targetDef?.properties.target ?? effect.toObject;
          const targetDet = targetDef?.properties.targetDeterminer ?? effect.toDeterminer;
          const targetOwnerId = resolveOwnerId(targetField ?? 'OPERATOR', ctx.operatorSlotId, ctx.operatorSlotMap, targetDet ?? 'THIS');

          const targetDuration = targetDef
            ? (targetDef.properties.duration)
            : undefined;
          const duration = targetDuration
            ? getDurationFrames(targetDuration)
            : 2400; // fallback 20s

          const targetColumnId = statusNameToColumnId(targetStatusName);

          // Refresh: clamp previous instances of the target status
          if (thresholdDerived.length > 0) {
            const prev = thresholdDerived[thresholdDerived.length - 1];
            const prevEnd = eventEndFrame(prev);
            if (ev.startFrame < prevEnd && prev.columnId === targetColumnId) {
              const clampedPrev = { ...prev, segments: [...prev.segments] };
              setEventDuration(clampedPrev, ev.startFrame - prev.startFrame);
              thresholdDerived[thresholdDerived.length - 1] = {
                ...clampedPrev,
                eventStatus: EventStatusType.REFRESHED,
                eventStatusOwnerId: ctx.operatorSlotId,
                eventStatusSkillName: def.properties.id,
              };
            }
          }

          thresholdDerived.push({
            id: `${targetStatusName.toLowerCase()}-${ctx.operatorSlotId}-${idCounter++}`,
            name: targetStatusName,
            ownerId: targetOwnerId,
            columnId: targetColumnId,
            startFrame: ev.startFrame,
            segments: durationSegment(duration),
            sourceOwnerId: ctx.operatorSlotId,
            sourceSkillName: def.properties.id,
          });
        }
      }
    }
  }

  return thresholdDerived;
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
  const parentEndFrame = eventEndFrame(statusEv);
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

  // onEntryClause: evaluate once at startFrame
  if (def.onEntryClause) {
    for (const clause of def.onEntryClause) {
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

  // onTriggerClause: for each clause, find matching events during the status's active window
  if (def.onTriggerClause) {
    for (const clause of def.onTriggerClause) {
      const receiveConds = clause.conditions.filter(
        (c: Predicate) => c.verb === 'RECEIVE'
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
 * Evaluate lifecycle clauses (onEntryClause, onTriggerClause) on all
 * status events in the timeline that match a statusEvent definition by name.
 *
 * This covers both engine-created statuses (from onTriggerClause) and frame-created
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
    (d.onEntryClause && d.onEntryClause.length > 0) ||
    (d.onTriggerClause && d.onTriggerClause.length > 0)
  );
  if (lifecycleDefs.length === 0) return result;

  for (const def of lifecycleDefs) {
    const columnId = statusNameToColumnId(def.properties.id);

    // Find all status events in the timeline matching this def
    const matchingEvents = result.filter(ev => ev.columnId === columnId && ev.name === def.properties.id);

    for (const statusEv of matchingEvents) {
      result = evaluateLifecycleForEvent(result, def, statusEv, operatorSlotMap);
    }
  }

  return result;
}

/** Resolve a RECEIVE condition's target column ID. */
function resolveReceiveColumnId(cond: Predicate): string | undefined {
  if (cond.object === 'STATUS' && cond.objectId) {
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
  /** Def names to skip (handled externally by the event queue). */
  skipDefNames?: ReadonlySet<string>,
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
      // Skip defs handled by the event queue (exchange statuses)
      if (skipDefNames?.has(def.properties.id)) continue;

      // Check talent level requirement

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
      if (def.properties.type === 'TALENT') {
        const talentDuration = def.properties.duration;
        const talentDurationFrames = talentDuration ? getDurationFrames(talentDuration) : TOTAL_FRAMES;
        const talentOwnerId = resolveOwnerId(def.properties.target, slotId, operatorSlotMap, def.properties.targetDeterminer);
        const talentColumnId = statusNameToColumnId(def.properties.id);
        // Only create if not already present
        if (!result.some(ev => ev.columnId === talentColumnId && ev.ownerId === talentOwnerId)) {
          result.push({
            id: `${def.properties.id.toLowerCase()}-talent-${slotId}`,
            name: def.properties.id,
            ownerId: talentOwnerId,
            columnId: talentColumnId,
            startFrame: 0,
            segments: durationSegment(talentDurationFrames),
            sourceOwnerId: slotId,
            sourceSkillName: def.properties.id,
          });
        }
      }

      const { derived, absorbedInflictions } = deriveStatusEvents(def, ctx);

      // Apply absorption clamping to infliction events (e.g. heat infliction consumed by Final Strike)
      if (absorbedInflictions.length > 0) {
        result = result.map(ev => {
          const absorption = absorbedInflictions.find(a => a.eventId === ev.id);
          if (!absorption) return ev;
          const clamped = { ...ev, segments: [...ev.segments] };
          setEventDuration(clamped, Math.max(0, absorption.clampFrame - ev.startFrame));
          return {
            ...clamped,
            eventStatus: EventStatusType.CONSUMED,
            eventStatusOwnerId: absorption.sourceOwnerId,
            eventStatusSkillName: absorption.sourceSkillName,
          };
        });
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
      for (const raw of getWeaponEffectDefs(weaponName)) {
        equipDefs.push({ slotId, def: normalizeEquipDef(raw) });
      }
    }
  }
  if (slotGearSets) {
    for (const [slotId, gearSetType] of Object.entries(slotGearSets)) {
      if (!gearSetType) continue;
      for (const raw of getGearEffectDefs(gearSetType)) {
        equipDefs.push({ slotId, def: normalizeEquipDef(raw) });
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
    const remapped = def.properties.targetDeterminer === 'OTHER'
      ? derived.map(ev => ev.ownerId === slotId ? { ...ev, ownerId: COMMON_OWNER_ID } : ev)
      : derived;
    result = [...result, ...remapped];
  }

  // ── Second pass: lifecycle clause evaluation ──────────────────────────────
  // After all onTriggerClause-derived statuses exist, evaluate onEntryClause
  // and onTriggerClause on ALL status events (engine-created and frame-created).
  const allLifecycleDefs: StatusEventDef[] = [];
  for (const operatorId of getAllOperatorIds()) {
    const json = getOperatorJson(operatorId);
    if (!json?.statusEvents) continue;
    for (const def of json.statusEvents as StatusEventDef[]) {
      if (def.onEntryClause?.length || def.onTriggerClause?.length) {
        allLifecycleDefs.push(def);
      }
    }
  }
  if (allLifecycleDefs.length > 0) {
    result = evaluateLifecycleClauses(result, allLifecycleDefs, operatorSlotMap);
  }

  return result;
}

// ── Exchange status queue support ──────────────────────────────────────────

/** Trigger match for queue-based exchange status processing. */
export interface ExchangeStatusTrigger {
  frame: number;
  sourceOwnerId: string;
  sourceSkillName: string;
}

/** Context for a single exchange status definition, used by the event queue. */
export interface ExchangeStatusQueueContext {
  statusName: string;
  columnId: string;
  ownerId: string;
  maxStacks: number;
  durationFrames: number;
  operatorSlotId: string;
  operatorId: string;
  potential: number;
  triggers: ExchangeStatusTrigger[];
  /** @internal Raw def for threshold evaluation. */
  _def: StatusEventDef;
}

/**
 * Collect trigger contexts for exchange status defs.
 * These defs are skipped by deriveStatusesFromEngine and processed
 * by the event queue instead.
 */
export function collectExchangeStatusTriggers(
  events: TimelineEvent[],
  exchangeStatusNames: ReadonlySet<string>,
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotOperatorMap?: Record<string, string>,
): ExchangeStatusQueueContext[] {
  const contexts: ExchangeStatusQueueContext[] = [];

  const operatorSlotMap: Record<string, string> = {};
  if (slotOperatorMap) {
    for (const [slotId, opId] of Object.entries(slotOperatorMap)) {
      operatorSlotMap[opId] = slotId;
    }
  }
  for (const opId of getAllOperatorIds()) {
    if (operatorSlotMap[opId]) continue;
    const slot = findOperatorSlot(events, opId);
    if (slot) operatorSlotMap[opId] = slot;
  }

  for (const operatorId of Array.from(ENGINE_HANDLED_OPERATORS)) {
    const json = getOperatorJson(operatorId);
    if (!json?.statusEvents) continue;

    const slotId = operatorSlotMap[operatorId] ?? findOperatorSlot(events, operatorId);
    if (!slotId) continue;

    const props = loadoutProperties?.[slotId];
    const potential = props?.operator.potential ?? 0;

    for (const def of json.statusEvents as StatusEventDef[]) {
      if (!exchangeStatusNames.has(def.properties.id)) continue;

      const duration = def.properties.duration;

      contexts.push({
        statusName: def.properties.id,
        columnId: statusNameToColumnId(def.properties.id),
        ownerId: resolveOwnerId(def.properties.target, slotId, operatorSlotMap, def.properties.targetDeterminer),
        maxStacks: getMaxStacks(def.properties.statusLevel.limit, potential),
        durationFrames: duration ? getDurationFrames(duration) : TOTAL_FRAMES,
        operatorSlotId: slotId,
        operatorId,
        potential,
        triggers: findTriggerMatches(def, events, slotId),
        _def: def,
      });
    }
  }

  return contexts;
}

/**
 * Evaluate threshold for a specific exchange status crossing at a given frame.
 * Called inline by the queue when an exchange event creation pushes the active
 * count to the threshold. Returns any threshold-derived events to create.
 */
export function evaluateThresholdForExchange(
  ctx: ExchangeStatusQueueContext,
  crossingFrame: number,
  previousThresholdEvents: TimelineEvent[],
  slotOperatorMap?: Record<string, string>,
): TimelineEvent[] {
  const def = ctx._def;
  if (!def.clause || def.clause.length === 0) return [];

  const maxStacks = getMaxStacks(def.properties.statusLevel.limit, ctx.potential);
  const result: TimelineEvent[] = [];

  const operatorSlotMap: Record<string, string> = {};
  if (slotOperatorMap) {
    for (const [slotId, opId] of Object.entries(slotOperatorMap)) {
      operatorSlotMap[opId] = slotId;
    }
  }

  for (const clause of def.clause) {
    const stackCond = clause.conditions.find(c =>
      c.subject === 'EVENT' && c.verb === 'HAVE' && c.object === 'STACKS'
    );
    if (!stackCond) continue;

    const targetCount = stackCond.cardinality === 'MAX' ? maxStacks : Number(stackCond.cardinality);
    if (targetCount !== maxStacks) continue; // only fire at the configured threshold

    for (const effect of clause.effects) {
      if (effect.verb !== 'APPLY' || effect.object !== 'STATUS' || !effect.objectId) continue;
      const targetStatusName = effect.objectId;

      const json = getOperatorJson(ctx.operatorId);
      const targetDef = (json?.statusEvents as StatusEventDef[] ?? [])
        .find(d => d.properties.id === targetStatusName);

      const targetField = targetDef?.properties.target ?? effect.toObject;
      const targetDet = targetDef?.properties.targetDeterminer ?? effect.toDeterminer;
      const targetOwnerId = resolveOwnerId(targetField ?? 'OPERATOR', ctx.operatorSlotId, operatorSlotMap, targetDet ?? 'THIS');

      const targetDuration = targetDef
        ? (targetDef.properties.duration)
        : undefined;
      const duration = targetDuration ? getDurationFrames(targetDuration) : 2400;
      const targetColumnId = statusNameToColumnId(targetStatusName);

      // Refresh: clamp previous threshold events of same column
      for (const prev of previousThresholdEvents) {
        if (prev.columnId !== targetColumnId) continue;
        const prevEnd = eventEndFrame(prev);
        if (crossingFrame < prevEnd) {
          setEventDuration(prev, crossingFrame - prev.startFrame);
          prev.eventStatus = EventStatusType.REFRESHED;
          prev.eventStatusOwnerId = ctx.operatorSlotId;
          prev.eventStatusSkillName = def.properties.id;
        }
      }

      result.push({
        id: `${targetStatusName.toLowerCase()}-${ctx.operatorSlotId}-inline-${crossingFrame}`,
        name: targetStatusName,
        ownerId: targetOwnerId,
        columnId: targetColumnId,
        startFrame: crossingFrame,
        segments: durationSegment(duration),
        sourceOwnerId: ctx.operatorSlotId,
        sourceSkillName: def.properties.id,
      });
    }
  }

  return result;
}

// ── Absorption trigger support (queue-evaluated) ──────────────────────────

/** Context for a talent absorption trigger (e.g. Scorching Heart). */
export interface AbsorptionContext {
  /** Infliction element column to absorb from enemy (e.g. infliction-heat). */
  inflictionColumnId: string;
  /** Exchange status to create per absorbed infliction (e.g. MELTING_FLAME). */
  exchangeStatusName: string;
  exchangeColumnId: string;
  exchangeOwnerId: string;
  exchangeMaxStacks: number;
  exchangeDurationFrames: number;
  operatorSlotId: string;
}

/**
 * Collect absorption trigger contexts from talent definitions.
 *
 * Scans talent JSONs for compound PERFORM FINAL_STRIKE + HAVE INFLICTION
 * triggers. These can't be pre-evaluated because infliction events don't
 * exist yet — the queue evaluates them at processing time against DerivedEventController.
 */
export function collectAbsorptionContexts(
  events: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotOperatorMap?: Record<string, string>,
): AbsorptionContext[] {
  const contexts: AbsorptionContext[] = [];

  const operatorSlotMap: Record<string, string> = {};
  if (slotOperatorMap) {
    for (const [slotId, opId] of Object.entries(slotOperatorMap)) {
      operatorSlotMap[opId] = slotId;
    }
  }
  for (const opId of getAllOperatorIds()) {
    if (operatorSlotMap[opId]) continue;
    const slot = findOperatorSlot(events, opId);
    if (slot) operatorSlotMap[opId] = slot;
  }

  for (const operatorId of Array.from(ENGINE_HANDLED_OPERATORS)) {
    const json = getOperatorJson(operatorId);
    if (!json?.statusEvents) continue;

    const slotId = operatorSlotMap[operatorId] ?? findOperatorSlot(events, operatorId);
    if (!slotId) continue;

    const props = loadoutProperties?.[slotId];
    const potential = props?.operator.potential ?? 0;

    for (const def of json.statusEvents as StatusEventDef[]) {
      if (def.properties.type !== 'TALENT') continue;

      for (const clause of def.onTriggerClause ?? []) {
        const performConds = clause.conditions.filter((c: Predicate) => c.verb === 'PERFORM');
        const haveConds = clause.conditions.filter((c: Predicate) => c.verb === 'HAVE');
        if (performConds.length === 0 || haveConds.length === 0) continue;

        const isFinalStrike = performConds[0].object === 'FINAL_STRIKE';
        if (!isFinalStrike) continue;

        const haveInfliction = haveConds.find((c: Predicate) => c.object === 'INFLICTION');
        if (!haveInfliction?.objectId) continue;
        const inflictionColumnId = ELEMENT_TO_INFLICTION_COLUMN[haveInfliction.objectId];
        if (!inflictionColumnId) continue;

        const allEffect = (clause.effects ?? []).find((e: TriggerEffect) => e.verb === 'ALL');
        const applyEffect = (allEffect?.effects ?? []).find(
          (e: TriggerSubEffect) => e.verb === 'APPLY' && e.object === 'STATUS' && e.objectId
        );
        if (!applyEffect?.objectId) continue;

        const targetDef = (json.statusEvents as StatusEventDef[])
          .find(d => d.properties.id === applyEffect.objectId);
        if (!targetDef) continue;

        const duration = targetDef.properties.duration;

        contexts.push({
          inflictionColumnId,
          exchangeStatusName: targetDef.properties.id,
          exchangeColumnId: statusNameToColumnId(targetDef.properties.id),
          exchangeOwnerId: resolveOwnerId(targetDef.properties.target, slotId, operatorSlotMap, targetDef.properties.targetDeterminer),
          exchangeMaxStacks: getMaxStacks(targetDef.properties.statusLevel.limit, potential),
          exchangeDurationFrames: duration ? getDurationFrames(duration) : TOTAL_FRAMES,
          operatorSlotId: slotId,
        });
      }
    }
  }

  return contexts;
}

// ── ENGINE_TRIGGER queue support ──────────────────────────────────────────

/** Context carried on an ENGINE_TRIGGER queue entry. */
export interface EngineTriggerContext {
  def: StatusEventDef;
  operatorId: string;
  operatorSlotId: string;
  potential: number;
  operatorSlotMap: Record<string, string>;
  loadoutProperties?: LoadoutProperties;
  haveConditions: Predicate[];
  triggerEffects?: TriggerEffect[];
}

export interface EngineTriggerEntry {
  frame: number;
  sourceOwnerId: string;
  sourceSkillName: string;
  ctx: EngineTriggerContext;
  isEquip: boolean;
}

/**
 * Collect ENGINE_TRIGGER entries for all non-exchange status defs.
 * Scans PERFORM/RECOVER/IS conditions to find candidate frames WITHOUT
 * evaluating HAVE conditions (deferred to queue time).
 *
 * Also returns TALENT events (permanent presence, no trigger dependency).
 */
export function collectEngineTriggerEntries(
  events: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotOperatorMap?: Record<string, string>,
  slotWeapons?: Record<string, string | undefined>,
  slotGearSets?: Record<string, string | undefined>,
  skipDefNames?: ReadonlySet<string>,
): { entries: EngineTriggerEntry[]; talentEvents: TimelineEvent[] } {
  const entries: EngineTriggerEntry[] = [];
  const talentEvents: TimelineEvent[] = [];

  const operatorSlotMap: Record<string, string> = {};
  if (slotOperatorMap) {
    for (const [slotId, opId] of Object.entries(slotOperatorMap)) {
      operatorSlotMap[opId] = slotId;
    }
  }
  for (const opId of getAllOperatorIds()) {
    if (operatorSlotMap[opId]) continue;
    const slot = findOperatorSlot(events, opId);
    if (slot) operatorSlotMap[opId] = slot;
  }

  const processDefsForSlot = (slotId: string, operatorId: string, defs: StatusEventDef[], isEquip = false) => {
    const props = loadoutProperties?.[slotId];
    const potential = props?.operator.potential ?? 0;

    for (const def of defs) {
      if (skipDefNames?.has(def.properties.id)) continue;

      // TALENT type: permanent presence event (check BEFORE final-strike skip)
      if (def.properties.type === 'TALENT') {
        const talentDuration = def.properties.duration;
        const talentDurationFrames = talentDuration ? getDurationFrames(talentDuration) : TOTAL_FRAMES;
        const talentOwnerId = resolveOwnerId(def.properties.target, slotId, operatorSlotMap, def.properties.targetDeterminer);
        const talentColumnId = statusNameToColumnId(def.properties.id);
        if (!events.some(ev => ev.columnId === talentColumnId && ev.ownerId === talentOwnerId)) {
          talentEvents.push({
            id: `${def.properties.id.toLowerCase()}-talent-${slotId}`,
            name: def.properties.id,
            ownerId: talentOwnerId,
            columnId: talentColumnId,
            startFrame: 0,
            segments: durationSegment(talentDurationFrames),
            sourceOwnerId: slotId,
            sourceSkillName: def.properties.id,
          });
        }
      }

      // Skip defs with FINAL_STRIKE triggers — handled by collectAbsorptionContexts
      const hasFinalStrikeTrigger = def.onTriggerClause?.some(c =>
        c.conditions.some((p: Predicate) => p.verb === 'PERFORM' && p.object === 'FINAL_STRIKE')
      );
      if (hasFinalStrikeTrigger) continue;

      if (!def.onTriggerClause || def.onTriggerClause.length === 0) continue;

      for (const clause of def.onTriggerClause) {
        const performConds = clause.conditions.filter(c => c.verb === 'PERFORM');
        const haveConds = clause.conditions.filter(c => c.verb === 'HAVE');
        const recoverConds = clause.conditions.filter(c => c.verb === 'RECOVER');
        const isConds = clause.conditions.filter(c => c.verb === 'IS');

        const triggerCtx: EngineTriggerContext = {
          def, operatorId, operatorSlotId: slotId, potential, operatorSlotMap,
          loadoutProperties: props, haveConditions: haveConds, triggerEffects: clause.effects,
        };

        if (performConds.length > 0) {
          const pc = performConds[0];
          const isAny = pc.subject === 'OPERATOR' && pc.subjectDeterminer === 'ANY';

          if (pc.object === 'FINAL_STRIKE') {
            for (const ev of events) {
              if (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID) continue;
              if (!isAny && ev.ownerId !== slotId) continue;
              if (ev.columnId !== SKILL_COLUMNS.BASIC) continue;
              if (ev.name === CombatSkillsType.FINISHER || ev.name === CombatSkillsType.DIVE) continue;
              const f = getFinalStrikeTriggerFrame(ev);
              if (f != null) entries.push({ frame: f, sourceOwnerId: ev.ownerId, sourceSkillName: ev.name, ctx: triggerCtx, isEquip });
            }
          } else if (pc.object === 'FINISHER' || pc.object === 'DIVE_ATTACK') {
            const targetName = pc.object === 'FINISHER' ? CombatSkillsType.FINISHER : CombatSkillsType.DIVE;
            for (const ev of events) {
              if (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID) continue;
              if (!isAny && ev.ownerId !== slotId) continue;
              if (ev.columnId !== SKILL_COLUMNS.BASIC) continue;
              if (ev.name !== targetName) continue;
              entries.push({ frame: getFirstEventFrame(ev), sourceOwnerId: ev.ownerId, sourceSkillName: ev.name, ctx: triggerCtx, isEquip });
            }
          } else {
            const col = pc.object === 'BATTLE_SKILL' ? 'battle'
              : pc.object === 'COMBO_SKILL' ? 'combo'
              : pc.object === 'ULTIMATE' ? 'ultimate' : pc.object;
            for (const ev of events) {
              if (!isAny && ev.ownerId !== slotId) continue;
              if (isAny && (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID)) continue;
              if (ev.columnId !== col) continue;
              entries.push({ frame: getFirstEventFrame(ev), sourceOwnerId: ev.ownerId, sourceSkillName: ev.name, ctx: triggerCtx, isEquip });
            }
          }
        } else if (haveConds.length > 0 && recoverConds.length === 0 && isConds.length === 0) {
          // Pure HAVE: create entries from matching status events in base events
          const hc = haveConds[0];
          if (hc.object === 'STATUS' && hc.objectId) {
            const colId = statusNameToColumnId(hc.objectId);
            for (const ev of events) {
              if (ev.columnId !== colId) continue;
              if (hc.subject === 'ENEMY' && ev.ownerId !== ENEMY_OWNER_ID) continue;
              entries.push({ frame: ev.startFrame, sourceOwnerId: ev.ownerId, sourceSkillName: ev.name, ctx: triggerCtx, isEquip });
            }
          }
        } else if (recoverConds.length > 0) {
          const rc = recoverConds[0];
          const isThis = rc.subjectDeterminer === 'THIS';
          if (rc.object === 'SKILL_POINT') {
            for (const ev of events) {
              if (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID) continue;
              if (isThis && ev.ownerId !== slotId) continue;
              if (!ev.segments) continue;
              let cum = 0;
              for (const seg of ev.segments) {
                if (seg.frames) {
                  for (const fr of seg.frames) {
                    if (fr.skillPointRecovery && fr.skillPointRecovery > 0) {
                      entries.push({ frame: ev.startFrame + cum + fr.offsetFrame, sourceOwnerId: ev.ownerId, sourceSkillName: ev.name, ctx: triggerCtx, isEquip });
                    }
                  }
                }
                cum += seg.properties.duration;
              }
            }
          }
        } else if (isConds.length > 0) {
          const ic = isConds[0];
          const rm: Record<string, string> = { COMBUSTED: 'combustion', SOLIDIFIED: 'solidification', CORRODED: 'corrosion', ELECTRIFIED: 'electrification' };
          const colId = rm[ic.object ?? ''];
          if (colId) {
            for (const ev of events) {
              if (ev.columnId !== colId) continue;
              if (ic.subject === 'ENEMY' && ev.ownerId !== ENEMY_OWNER_ID) continue;
              entries.push({ frame: ev.startFrame, sourceOwnerId: ev.ownerId, sourceSkillName: ev.name, ctx: triggerCtx, isEquip });
            }
          }
        }
      }
    }
  };

  for (const operatorId of Array.from(ENGINE_HANDLED_OPERATORS)) {
    const json = getOperatorJson(operatorId);
    if (!json?.statusEvents) continue;
    const slotId = operatorSlotMap[operatorId] ?? findOperatorSlot(events, operatorId);
    if (!slotId) continue;
    processDefsForSlot(slotId, operatorId, json.statusEvents as StatusEventDef[]);
  }

  if (slotWeapons) {
    for (const [slotId, weaponName] of Object.entries(slotWeapons)) {
      if (!weaponName) continue;
      const opId = slotOperatorMap ? Object.entries(slotOperatorMap).find(([s]) => s === slotId)?.[1] : undefined;
      processDefsForSlot(slotId, opId ?? '', getWeaponEffectDefs(weaponName).map(normalizeEquipDef), true);
    }
  }
  if (slotGearSets) {
    for (const [slotId, gearSetType] of Object.entries(slotGearSets)) {
      if (!gearSetType) continue;
      const opId = slotOperatorMap ? Object.entries(slotOperatorMap).find(([s]) => s === slotId)?.[1] : undefined;
      processDefsForSlot(slotId, opId ?? '', getGearEffectDefs(gearSetType).map(normalizeEquipDef), true);
    }
  }

  const seen = new Set<string>();
  const deduped = entries.filter(e => {
    const key = `${e.ctx.def.properties.id}:${e.ctx.operatorSlotId}:${e.frame}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { entries: deduped.sort((a, b) => a.frame - b.frame), talentEvents };
}

/**
 * Evaluate an ENGINE_TRIGGER at queue time: check HAVE conditions against
 * DerivedEventController, enforce stack caps, and create the derived status event.
 */
export function evaluateEngineTrigger(
  entry: EngineTriggerEntry,
  events: TimelineEvent[],
  activeCountFn: (columnId: string, ownerId: string, frame: number) => number,
  addEventFn: (ev: TimelineEvent) => void,
) {
  const { ctx } = entry;
  const { def } = ctx;

  if (ctx.haveConditions.length > 0) {
    const allMet = ctx.haveConditions.every(hc =>
      checkPredicate(hc, events, ctx.operatorSlotId, entry.frame)
    );
    if (!allMet) return;
  }

  // Resolve output def (follows ALL APPLY STATUS redirects)
  const applySubEffect = (ctx.triggerEffects ?? [])
    .filter(e => e.verb === 'ALL')
    .flatMap(e => e.effects ?? [])
    .find(e => e.verb === 'APPLY' && e.object === 'STATUS' && e.objectId);
  let outputDef = def;
  if (applySubEffect?.objectId) {
    const json = getOperatorJson(ctx.operatorId);
    const targetDef = (json?.statusEvents as StatusEventDef[] ?? [])
      .find(d => d.properties.id === applySubEffect.objectId);
    if (targetDef) outputDef = targetDef;
  }

  const durationFrames = outputDef.properties.duration ? getDurationFrames(outputDef.properties.duration) : TOTAL_FRAMES;
  const ownerId = resolveOwnerId(outputDef.properties.target, ctx.operatorSlotId, ctx.operatorSlotMap, outputDef.properties.targetDeterminer);
  const eqStatusId = outputDef.properties.id ?? outputDef.properties.name;
  if (!eqStatusId) return;
  const columnId = statusNameToColumnId(eqStatusId);
  const eqLimitMap = outputDef.properties.statusLevel.limit;
  const maxStacks = getMaxStacks(eqLimitMap, ctx.potential);

  if (activeCountFn(columnId, ownerId, entry.frame) >= maxStacks) return;

  const finalOwnerId = entry.isEquip && outputDef.properties.targetDeterminer === 'OTHER'
    ? COMMON_OWNER_ID : ownerId;

  const ev: TimelineEvent = {
    id: `${outputDef.properties.id.toLowerCase()}-${ctx.operatorSlotId}-q-${entry.frame}`,
    name: outputDef.properties.id,
    ownerId: finalOwnerId,
    columnId,
    startFrame: entry.frame,
    segments: durationSegment(durationFrames),
    sourceOwnerId: ctx.operatorSlotId,
    sourceSkillName: entry.sourceSkillName,
  };

  const deriveCtx: DeriveContext = {
    events, operatorId: ctx.operatorId, operatorSlotId: ctx.operatorSlotId,
    potential: ctx.potential, operatorSlotMap: ctx.operatorSlotMap, loadoutProperties: ctx.loadoutProperties,
  };
  resolveClauseEffects(ev, outputDef, deriveCtx);

  if (outputDef.segments && outputDef.segments.length > 0) {
    const segments: EventSegmentData[] = [];
    for (const seg of outputDef.segments) {
      const segDuration = seg.properties?.duration ? getDurationFrames(seg.properties.duration) : durationFrames;
      const segData: EventSegmentData = { properties: { duration: segDuration, name: seg.properties?.name } };
      if (seg.clause) {
        const segEv: TimelineEvent = { ...ev, susceptibility: undefined };
        resolveClauseEffectsFromClauses(segEv, seg.clause as ResolvedClause[], deriveCtx, def, false);
        if (segEv.susceptibility) segData.unknown = { ...segData.unknown, susceptibility: segEv.susceptibility };
      }
      segments.push(segData);
    }
    ev.segments = segments;
    if (!ev.susceptibility && segments[0]?.unknown?.susceptibility) ev.susceptibility = segments[0].unknown.susceptibility as TimelineEvent['susceptibility'];
  }

  if (!ev.susceptibility && outputDef.properties.susceptibility) {
    const resolved: Record<string, number> = {};
    for (const [element, values] of Object.entries(outputDef.properties.susceptibility)) {
      const arr = values as number[];
      const tl = 1; // TODO: resolve talent level from DSL
      resolved[element] = arr[Math.min(tl, arr.length) - 1] ?? arr[0];
    }
    ev.susceptibility = resolved;
  }

  addEventFn(ev);
}
