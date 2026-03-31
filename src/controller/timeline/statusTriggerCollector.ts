/**
 * Status trigger collector — queue-seeding functions for status derivation.
 *
 * Collects trigger contexts from operator/weapon/gear JSON configs and
 * produces queue entries for the event pipeline. Trigger matching logic
 * lives in triggerMatch.ts; this module handles config resolution and
 * queue entry construction.
 */
import { TimelineEvent, EventSegmentData, eventEndFrame, durationSegment, setEventDuration } from '../../consts/viewTypes';
import { CritMode, EventCategoryType, EventFrameType, EventStatusType, StackInteractionType, UnitType } from '../../consts/enums';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { ENEMY_OWNER_ID, ELEMENT_TO_INFLICTION_COLUMN, REACTION_COLUMNS } from '../../model/channels';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { getSkillIds, getAllOperatorIds, getEnabledStatusEvents, getOperatorBase } from '../gameDataStore';
import { getWeaponEffectDefs, getGearEffectDefs } from '../gameDataStore';
import type { NormalizedEffectDef } from '../gameDataStore';
import { LoadoutProperties } from '../../view/InformationPane';
import { evaluateConditions, ConditionContext } from './conditionEvaluator';
import { executeEffects, applyMutations } from './effectExecutor';
import type { ExecutionContext } from './effectExecutor';
import { VerbType, NounType, DeterminerType, ClauseEvaluationType } from '../../dsl/semantics';
import { derivedEventUid } from './inputEventController';
import type { Interaction, Effect as SemanticEffect, ValueNode } from '../../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT, buildContextForSkillColumn } from '../calculation/valueResolver';
import type { ValueResolutionContext } from '../calculation/valueResolver';
import { findClauseTriggerMatches } from './triggerMatch';
import type { TriggerMatch, TriggerEffect, Predicate } from './triggerMatch';

// ── Talent level resolution ─────────────────────────────────────────────────

/**
 * Resolve the talent level for a status def, based on which talent slot it belongs to.
 * Checks if the def's ID or originId matches the operator's talent one or two.
 */
function resolveTalentLevel(def: StatusEventDef, ctx: DeriveContext): number {
  const props = ctx.loadoutProperties?.operator;
  if (!props) return 0;
  const op = getOperatorBase(ctx.operatorId);
  if (!op) return props.talentOneLevel;
  const talentOneId = op.talents.one?.id;
  const talentTwoId = op.talents.two?.id;
  const defId = def.properties.id;
  const originId = def.metadata?.originId;
  if (defId === talentTwoId || originId === talentTwoId) return props.talentTwoLevel;
  if (defId === talentOneId || originId === talentOneId) return props.talentOneLevel;
  // Default to talent one
  return props.talentOneLevel;
}

// ── Types from JSON ─────────────────────────────────────────────────────────

interface StatusFrameDef {
  metadata?: { eventComponentType?: string };
  properties?: { offset?: { value: number; unit: string } };
  clause?: EffectClause[];
}

interface StatusSegmentDef {
  metadata?: { eventComponentType?: string };
  properties?: { name?: string; duration?: { value: ValueNode; unit: string }; segmentTypes?: string[] };
  clause?: EffectClause[];
  frames?: StatusFrameDef[];
  onTriggerClause?: TriggerClause[];
  onEntryClause?: EffectClause[];
  onExitClause?: EffectClause[];
}

/** Properties block nested inside a status event definition. */
interface StatusProperties {
  id: string;
  name?: string;
  type?: string;
  eventCategoryType?: string;
  element?: string;
  target?: string;
  targetDeterminer?: string;
  isForced?: boolean;
  enhancementTypes?: string[];
  stacks: {
    interactionType: string;
    limit: ValueNode;
  };
  duration?: { value: ValueNode; unit: string };
  susceptibility?: Record<string, number[]>;
  cooldownSeconds?: number;
}

export interface StatusEventDef {
  properties: StatusProperties;
  metadata?: { originId?: string; isEnabled?: boolean };
  onTriggerClause?: TriggerClause[];
  onEntryClause?: EffectClause[];
  clause?: EffectClause[];
  onExitClause?: EffectClause[];
  /** Multi-phase segments (e.g. Antal Focus: 20s Focus + 40s Empowered Focus). */
  segments?: StatusSegmentDef[];
  /** Clause evaluation mode: FIRST_MATCH evaluates clauses in order, fires first match only. */
  clauseType?: ClauseEvaluationType;
}

interface TriggerClause {
  conditions: Predicate[];
  effects?: TriggerEffect[];
}

interface EffectClause {
  conditions: Predicate[];
  effects: Effect[];
}

interface Effect {
  verb: string;
  object: string;
  objectId?: string;
  to?: string;
  toDeterminer?: string;
}

/** Shape of a with-value block inside a clause effect (IS or VARY_BY). */
interface ClauseWithValue {
  verb: string;
  object?: string | string[];
  value: number | number[] | Record<string, unknown>;
}

/** Effect shape inside clause arrays: supports objectQualifier + with block. */
interface ClauseEffectEntry {
  verb: string;
  object: string;
  objectQualifier?: string;
  with?: { value: ClauseWithValue };
}

/** A clause with conditions and clause-style effects (as used in resolveClauseEffectsFromClauses). */
interface ResolvedClause {
  conditions: Predicate[];
  effects: ClauseEffectEntry[];
}

/** Get enabled status event defs for an operator, typed as StatusEventDef[]. */
function getEnabledDefs(operatorId: string): StatusEventDef[] {
  return getEnabledStatusEvents(operatorId).map(s => s.serialize() as unknown as StatusEventDef);
}

/** Build a ValueResolutionContext from DeriveContext for the talent owner. */
function buildDeriveValueContext(ctx: DeriveContext): ValueResolutionContext {
  const baseCtx = buildContextForSkillColumn(ctx.loadoutProperties, NounType.BATTLE_SKILL);
  baseCtx.potential = ctx.potential ?? baseCtx.potential;
  return baseCtx;
}

// ── Multi-dimensional VARY_BY resolver ───────────────────────────────────────

/**
 * Resolve a dimension key for a multi-dimensional VARY_BY lookup.
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
    const talentLevel = resolveTalentLevel(def, ctx);
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
        const hasThisEvent = clause.conditions.some((c: Predicate) => c.subject === NounType.EVENT);
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
      const objectQualifier = effect.objectQualifier;
      const withBlock = effect.with ?? effect.with;
      const wp = withBlock?.value;
      if (!wp) continue;

      const resolveValue = (): number | undefined => {
        if (wp.verb === VerbType.IS && typeof wp.value === 'number') return wp.value;
        if (wp.verb !== VerbType.VARY_BY) return undefined;

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
            const talentLevel = resolveTalentLevel(def, ctx);
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

      if (verb === VerbType.APPLY && object === NounType.SUSCEPTIBILITY && objectQualifier) {
        const val = resolveValue();
        if (val != null) {
          if (!ev.susceptibility) ev.susceptibility = {};
          (ev.susceptibility as Record<string, number>)[objectQualifier] = val;
        }
      }

      if (verb === VerbType.APPLY && object === NounType.DAMAGE_BONUS) {
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
export function resolveClauseEffects(ev: TimelineEvent, def: StatusEventDef, ctx: DeriveContext): void {
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
    if (skillNames.has(ev.id)) return ev.ownerId;
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
  triggerOwnerId?: string,
): string {
  if (!target) return operatorSlotId;
  if (target === NounType.OPERATOR) {
    switch (determiner ?? DeterminerType.THIS) {
      case DeterminerType.THIS: return operatorSlotId;
      case DeterminerType.ALL: return operatorSlotId; // ALL handled by caller loop, not here
      case DeterminerType.OTHER: return targetOwnerId ?? operatorSlotId;
      case DeterminerType.ANY: return targetOwnerId ?? operatorSlotId;
      case DeterminerType.TRIGGER: return triggerOwnerId ?? operatorSlotId;
      case DeterminerType.SOURCE: return operatorSlotId;
      default: return operatorSlotId;
    }
  }
  switch (target) {
    case NounType.ENEMY: return ENEMY_OWNER_ID;
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
  let target = raw.target ?? (rp?.target as string);
  let targetDeterminer = raw.targetDeterminer ?? (rp?.targetDeterminer as string);
  // Infer target from clause effects if not explicitly set
  if (!target) {
    const clauses = raw.clause as { effects?: { to?: string; toDeterminer?: string }[] }[] | undefined;
    if (clauses) {
      for (const clause of clauses) {
        for (const effect of clause.effects ?? []) {
          if (effect.to === NounType.ENEMY) { target = NounType.ENEMY; targetDeterminer = DeterminerType.THIS; break; }
          if (effect.toDeterminer === DeterminerType.OTHER) { target = NounType.OPERATOR; targetDeterminer = DeterminerType.OTHER; break; }
          if (effect.toDeterminer === DeterminerType.ALL) { target = NounType.OPERATOR; targetDeterminer = DeterminerType.ALL; break; }
          if (effect.to === NounType.OPERATOR) { target = NounType.OPERATOR; targetDeterminer = effect.toDeterminer ?? DeterminerType.THIS; break; }
        }
        if (target) break;
      }
    }
    if (!target) { target = NounType.OPERATOR; targetDeterminer = DeterminerType.THIS; }
  }
  const sl = raw.stacks ?? (rp?.stacks as NormalizedEffectDef['stacks']);

  const limit = (sl?.limit ?? { verb: VerbType.IS, value: 1 }) as ValueNode;
  const stacks: StatusEventDef['properties']['stacks'] = {
    limit,
    interactionType: (sl as Record<string, unknown>)?.interactionType as string ?? StackInteractionType.NONE,
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
      stacks,
      duration: rp?.duration as StatusEventDef['properties']['duration'],
      susceptibility: raw.susceptibility ?? (rp?.susceptibility as string),
      cooldownSeconds: raw.cooldownSeconds ?? (rp?.cooldownSeconds as number),
    },
    onTriggerClause: raw.onTriggerClause as TriggerClause[] ?? [],
  } as StatusEventDef;
}

// ── Max stacks by potential ─────────────────────────────────────────────────

function getMaxStacks(limit: ValueNode, _potential: number): number {
  return resolveValueNode(limit, DEFAULT_VALUE_CONTEXT);
}

// ── Duration resolution ─────────────────────────────────────────────────────

export function getDurationFrames(duration: { value: ValueNode; unit: string }): number {
  // Handle bare arrays (e.g. [20] from weapon/gear JSON) and bare numbers
  const raw = duration.value;
  const val = Array.isArray(raw) ? (raw as number[])[0] ?? 0
    : typeof raw === 'number' ? raw
    : resolveValueNode(raw, DEFAULT_VALUE_CONTEXT);
  if (val < 0) return TOTAL_FRAMES; // -1 = permanent
  if (duration.unit === 'SECOND') return Math.round(val * 120);
  return val;
}

// ── Trigger evaluation ──────────────────────────────────────────────────────

interface AbsorbedInfliction {
  eventUid: string;
  clampFrame: number;
  sourceOwnerId: string;
  sourceSkillName: string;
}

interface DeriveResult {
  derived: TimelineEvent[];
  absorbedInflictions: AbsorbedInfliction[];
}

// ── findTriggerMatches ───────────────────────────────────────────────────────

function findTriggerMatches(
  def: StatusEventDef,
  events: readonly TimelineEvent[],
  operatorSlotId: string,
): TriggerMatch[] {
  return findClauseTriggerMatches(def.onTriggerClause ?? [], events, operatorSlotId);
}

// ── Derive events ───────────────────────────────────────────────────────────

export interface DeriveContext {
  events: readonly TimelineEvent[];
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

  // Check if effects redirect output to a different status (e.g. talent triggers that produce MF)
  // First check nested ALL sub-effects (existing pattern), then direct effects for TALENT-type defs
  const nestedApply = (def.onTriggerClause ?? [])
    .flatMap(c => c.effects ?? [])
    .filter(e => e.verb === VerbType.ALL)
    .flatMap(e => e.effects ?? [])
    .find(e => e.verb === VerbType.APPLY && e.object === NounType.STATUS && e.objectId);
  // For TALENT-type defs, also check direct APPLY STATUS effects (e.g. IMPROVISER_TALENT → IMPROVISER)
  const directApply = !nestedApply && (def.properties.eventCategoryType ?? def.properties.type) === EventCategoryType.TALENT
    ? (def.onTriggerClause ?? [])
        .flatMap(c => (c.effects ?? []) as unknown as Effect[])
        .find(e => e.verb === VerbType.APPLY && e.object === NounType.STATUS && e.objectId)
    : undefined;
  const applySubEffect = nestedApply ?? directApply;

  // If trigger clauses have no effects and no output redirect, this def doesn't produce
  // events on its own — another def (e.g. a talent) handles creation via its own effects.
  const hasAnyEffects = (def.onTriggerClause ?? []).some(c => c.effects && c.effects.length > 0);
  if (!applySubEffect && !hasAnyEffects) return empty;
  // Non-self-producing statuses (e.g. STEEL_OATH: only CONSUME + APPLY other statuses)
  // are created by the interpretor's APPLY STATUS effect, not by this collector.
  // TODO: implement per-clause trigger consumption (CONSUME stacks, APPLY sub-statuses)
  // without creating parent status instances.
  if (!applySubEffect && hasAnyEffects) {
    const selfProducing = (def.onTriggerClause ?? []).some(c =>
      (c.effects ?? []).some(e =>
        e.verb === VerbType.APPLY && e.object === NounType.STATUS && (!e.objectId || e.objectId === def.properties.id)
      )
    );
    if (!selfProducing) return empty;
  }

  const applyToDeterminer = directApply?.toDeterminer ?? (nestedApply as unknown as Effect | undefined)?.toDeterminer;
  let outputDef = def;
  if (applySubEffect?.objectId) {
    const targetDef = getEnabledDefs(ctx.operatorId)
      .find(d => d.properties.id === applySubEffect.objectId);
    if (targetDef) outputDef = targetDef;
  }

  const durationFrames = outputDef.properties.duration ? getDurationFrames(outputDef.properties.duration) : TOTAL_FRAMES;
  // For TRIGGER determiner, ownerId is resolved per-trigger inside the loop
  const staticOwnerId = applyToDeterminer !== 'TRIGGER'
    ? resolveOwnerId(outputDef.properties.target, operatorSlotId, ctx.operatorSlotMap, applyToDeterminer ?? outputDef.properties.targetDeterminer)
    : undefined;
  const statusId = outputDef.properties.id ?? outputDef.properties.name;
  if (!statusId) return empty;
  const columnId = statusId;
  const limitMap = outputDef.properties.stacks?.limit;
  const maxStacks = limitMap ? getMaxStacks(limitMap, ctx.potential) : 1;

  const triggers = findTriggerMatches(def, events, operatorSlotId);
  if (triggers.length === 0) return empty;

  const derived: TimelineEvent[] = [];
  const absorbedInflictions: AbsorbedInfliction[] = [];
  const absorbedIds = new Set<string>();
  const cooldownFrames = outputDef.properties.cooldownSeconds
    ? Math.round(outputDef.properties.cooldownSeconds * 120)
    : 0;
  let lastProcFrame = -Infinity;

  for (const trigger of triggers) {
    // Skip triggers at or before the minimum frame (for post-consumption re-derivation)
    if (trigger.frame <= minTriggerFrame) continue;

    // Enforce cooldown between procs
    if (cooldownFrames > 0 && trigger.frame < lastProcFrame + cooldownFrames) continue;

    // Resolve ownerId: static for most determiners, per-trigger for TRIGGER
    const ownerId = staticOwnerId ?? resolveOwnerId(
      outputDef.properties.target, operatorSlotId, ctx.operatorSlotMap,
      applyToDeterminer, undefined, trigger.sourceOwnerId,
    );

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
    // At capacity: RESET can clamp oldest to make room, others skip
    if (activeAtFrame >= maxStacks) {
      if (outputDef.properties.stacks?.interactionType !== StackInteractionType.RESET) continue;
    }

    // Determine how many events to create: 1 normally, N for ALL with CONSUME infliction
    let createCount = 1;
    const allEffect = trigger.effects?.find(e => e.verb === VerbType.ALL);
    const absorbSubEffect = allEffect?.effects?.find(e => e.verb === VerbType.CONSUME && e.object === NounType.INFLICTION);
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
          !absorbedIds.has(ev.uid)
        ).sort((a, b) => a.startFrame - b.startFrame);

        createCount = Math.min(maxStacks - activeAtFrame, inflictionsToAbsorb.length);
        if (createCount <= 0) continue;
      }
    }

    for (let ci = 0; ci < createCount; ci++) {
      const evId = derivedEventUid(columnId, ctx.operatorId, trigger.frame, `${ci}`);

      // RESET overflow: clamp oldest when at capacity
      if (outputDef.properties.stacks?.interactionType === StackInteractionType.RESET && activeAtFrame >= maxStacks) {
        // Find oldest active in derived events
        const oldestActive = derived.find(d =>
          d.eventStatus !== EventStatusType.REFRESHED &&
          d.eventStatus !== EventStatusType.CONSUMED &&
          d.startFrame <= trigger.frame &&
          trigger.frame < eventEndFrame(d)
        );
        if (oldestActive) {
          setEventDuration(oldestActive, trigger.frame - oldestActive.startFrame);
          oldestActive.eventStatus = EventStatusType.REFRESHED;
          oldestActive.eventStatusOwnerId = trigger.sourceOwnerId;
          oldestActive.eventStatusSkillName = trigger.sourceSkillName;
        }
      }

      const ev: TimelineEvent = {
        uid: evId,
        id: outputDef.properties.id,
        name: outputDef.properties.id,
        ownerId,
        columnId,
        startFrame: trigger.frame,
        segments: durationSegment(durationFrames),
        sourceOwnerId: ctx.operatorId,
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
          // Resolve frame effects (e.g. RESTORE HP from IMPROVISER)
          if (seg.frames && seg.frames.length > 0) {
            const valueCtx = buildDeriveValueContext(ctx);
            // For SOURCE determiner: sourceContext = talent owner's context (same as valueCtx here)
            valueCtx.sourceContext = valueCtx;
            for (const frame of seg.frames) {
              if (!frame.clause) continue;
              for (const clause of frame.clause) {
                for (const effect of (clause as unknown as { effects: Effect[] }).effects ?? []) {
                  if (effect.verb === 'RESTORE' && effect.object === NounType.HP) {
                    const withBlock = (effect as unknown as { with?: { value?: ValueNode } }).with;
                    if (withBlock?.value) {
                      const healValue = resolveValueNode(withBlock.value, valueCtx);
                      segData.unknown = { ...segData.unknown, healValue };
                    }
                  }
                }
              }
            }
          }
          // Store segmentTypes from def (e.g. COOLDOWN)
          if (seg.properties?.segmentTypes) {
            segData.unknown = { ...segData.unknown, segmentTypes: seg.properties.segmentTypes };
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
          const talentLevel = resolveTalentLevel(outputDef, ctx);
          resolved[element] = arr[Math.min(talentLevel, arr.length) - 1] ?? arr[0];
        }
        ev.susceptibility = resolved;
      }


      derived.push(ev);
      lastProcFrame = trigger.frame;

      // Track absorption
      if (ci < inflictionsToAbsorb.length) {
        absorbedIds.add(inflictionsToAbsorb[ci].uid);
        absorbedInflictions.push({
          eventUid: inflictionsToAbsorb[ci].uid,
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

  const maxStacks = getMaxStacks(def.properties.stacks.limit, ctx.potential);
  const thresholdDerived: TimelineEvent[] = [];

  for (const clause of def.clause) {
    // Check for HAVE STACKS EXACTLY MAX condition
    const stackCond = clause.conditions.find(c =>
      c.subject === NounType.EVENT && c.verb === VerbType.HAVE && c.object === NounType.STACKS
    );
    if (!stackCond) continue;

    const targetCount = stackCond.value === 'MAX' ? maxStacks : Number(stackCond.value);

    // Find frames where the stack count crosses the threshold
    const allStatusEvents = [...ctx.events, ...derivedEvents]
      .filter(ev => ev.columnId === def.properties.id && ev.ownerId === resolveOwnerId(def.properties.target, ctx.operatorSlotId, ctx.operatorSlotMap, def.properties.targetDeterminer))
      .sort((a, b) => a.startFrame - b.startFrame);

    for (const ev of allStatusEvents) {
      // Count active stacks at this event's start frame (including itself)
      let activeCount = 0;
      let countWithout = 0;
      for (const other of allStatusEvents) {
        const otherEnd = eventEndFrame(other);
        if (other.startFrame <= ev.startFrame && ev.startFrame < otherEnd) {
          activeCount++;
          if (other.uid !== ev.uid) countWithout++;
        }
      }

      if (activeCount < targetCount) continue;
      if (countWithout >= targetCount) continue; // already at threshold before this event

      // Execute clause effects
      for (const effect of clause.effects) {
        if (effect.verb === VerbType.APPLY && effect.object === NounType.STATUS && effect.objectId) {
          // Find the target status definition to get its properties
          const targetStatusId = effect.objectId;

          // Look for the target status def in the same operator's statusEvents
          const targetDef = getEnabledDefs(ctx.operatorId)
            .find(d => d.properties.id === targetStatusId);

          // Resolve owner from the target def's own target field (authoritative),
          // falling back to the clause's to
          const targetField = targetDef?.properties.target ?? effect.to;
          const targetDet = targetDef?.properties.targetDeterminer ?? effect.toDeterminer;
          const targetOwnerId = resolveOwnerId(targetField ?? 'OPERATOR', ctx.operatorSlotId, ctx.operatorSlotMap, targetDet ?? 'THIS');

          const targetDuration = targetDef
            ? (targetDef.properties.duration)
            : undefined;
          const duration = targetDuration
            ? getDurationFrames(targetDuration)
            : 2400; // fallback 20s

          const targetColumnId = targetStatusId;

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
            uid: derivedEventUid(targetColumnId, ctx.operatorId, ev.startFrame),
            id: targetStatusId,
            name: targetStatusId,
            ownerId: targetOwnerId,
            columnId: targetColumnId,
            startFrame: ev.startFrame,
            segments: durationSegment(duration),
            sourceOwnerId: ctx.operatorId,
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
  critMode?: CritMode,
): TimelineEvent[] {
  let result = events;
  const parentEndFrame = eventEndFrame(statusEv);
  const sourceOwnerId = statusEv.sourceOwnerId ?? statusEv.ownerId;

  const makeExecCtx = (frame: number): ExecutionContext => {
    // Compute the segment end frame for the given frame within the parent event
    let segmentEndFrame = parentEndFrame;
    let segStart = statusEv.startFrame;
    for (const seg of statusEv.segments) {
      const segEnd = segStart + (seg.properties.duration ?? 0);
      if (frame >= segStart && frame < segEnd) {
        segmentEndFrame = segEnd;
        break;
      }
      segStart = segEnd;
    }
    return {
      events: result,
      frame,
      sourceOwnerId,
      sourceSkillName: statusEv.name,
      operatorSlotMap,
      idCounter: 0,
      parentEventEndFrame: parentEndFrame,
      parentSegmentEndFrame: segmentEndFrame,
      critMode,
      // The slot where the status event currently lives (for self-consumption)
      currentOwnerId: statusEv.ownerId,
    };
  };

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
      // RECEIVE conditions: find events in a matching column
      const receiveConds = clause.conditions.filter(
        (c: Predicate) => c.verb === VerbType.RECEIVE
      );
      // PERFORM conditions: find skill events with matching frame effects
      const performConds = clause.conditions.filter(
        (c: Predicate) => c.verb === VerbType.PERFORM
      );
      if (receiveConds.length === 0 && performConds.length === 0) continue;

      let triggerFrames: number[] = [];

      if (receiveConds.length > 0) {
        const receiveCond = receiveConds[0];
        const targetColumnId = resolveReceiveColumnId(receiveCond);
        if (!targetColumnId) continue;

        triggerFrames = result
          .filter(ev =>
            ev.columnId === targetColumnId &&
            ev.startFrame >= statusEv.startFrame &&
            ev.startFrame < parentEndFrame
          )
          .map(ev => ev.startFrame);
      } else if (performConds.length > 0) {
        // Find frames where PERFORM FINAL_STRIKE (or other skill types) occur
        triggerFrames = collectPerformTriggerFrames(
          performConds[0] as unknown as Interaction,
          result,
          statusEv.startFrame,
          parentEndFrame,
          sourceOwnerId,
        );
      }

      for (const triggerFrame of triggerFrames) {
        const condCtx: ConditionContext = {
          events: result,
          frame: triggerFrame,
          sourceOwnerId,
        };
        if (!evaluateConditions(clause.conditions as unknown as Interaction[], condCtx)) continue;
        const execCtx = makeExecCtx(triggerFrame);
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
  critMode?: CritMode,
): TimelineEvent[] {
  let result = [...events];

  // Build a map of statusEvent defs that have lifecycle clauses
  const lifecycleDefs = allDefs.filter(d =>
    (d.onEntryClause && d.onEntryClause.length > 0) ||
    (d.onTriggerClause && d.onTriggerClause.length > 0)
  );
  if (lifecycleDefs.length === 0) return result;

  for (const def of lifecycleDefs) {
    const columnId = def.properties.id;

    // Find all status events in the timeline matching this def
    const matchingEvents = result.filter(ev => ev.columnId === columnId && ev.id === def.properties.id);

    for (const statusEv of matchingEvents) {
      result = evaluateLifecycleForEvent(result, def, statusEv, operatorSlotMap, critMode);
    }
  }

  return result;
}

/** Resolve a RECEIVE condition's target column ID. */
function resolveReceiveColumnId(cond: Predicate): string | undefined {
  if (cond.object === NounType.STATUS && cond.objectId) {
    return REACTION_STATUS_TO_COLUMN[cond.objectId]
      ?? cond.objectId;
  }
  return undefined;
}

/**
 * Collect frames where a PERFORM condition is satisfied within a time window.
 *
 * Scans frame clauses for PERFORM effects matching the condition's object
 * (e.g. FINAL_STRIKE, FINISHER). This is DSL-driven — frameTypes are derived
 * from PERFORM effects, so we scan the source effects directly.
 */
function collectPerformTriggerFrames(
  cond: Interaction,
  events: TimelineEvent[],
  windowStart: number,
  windowEnd: number,
  operatorSlotId: string,
): number[] {
  const frames: number[] = [];
  const targetObject = cond.object;
  const det = cond.subjectDeterminer ?? DeterminerType.THIS;

  for (const ev of events) {
    // THIS: only check the defining operator's own events
    // CONTROLLED: accept from any operator (controlled can be any slot)
    if (det === DeterminerType.THIS && ev.ownerId !== operatorSlotId) continue;
    if (!ev.segments) continue;

    let cumulativeOffset = 0;
    for (const seg of ev.segments) {
      if (seg.frames) {
        for (const frame of seg.frames) {
          const hasPerform = frame.frameTypes?.includes(targetObject as unknown as EventFrameType);
          if (!hasPerform) continue;

          const absFrame = frame.absoluteFrame ?? (ev.startFrame + cumulativeOffset + frame.offsetFrame);
          if (absFrame >= windowStart && absFrame < windowEnd) {
            frames.push(absFrame);
          }
        }
      }
      cumulativeOffset += seg.properties.duration;
    }
  }

  return frames.sort((a, b) => a - b);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Operator IDs with statusEvents in their JSON.
 * Built dynamically — any operator with statusEvents is automatically handled.
 */
const ENGINE_HANDLED_OPERATORS = new Set(
  getAllOperatorIds().filter(id => getEnabledDefs(id).length > 0)
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
  /** CritMode for CHANCE verb resolution in effect execution. */
  critMode?: CritMode,
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
    const defs = getEnabledDefs(operatorId);
    if (!defs.length) continue;

    const slotId = operatorSlotMap[operatorId] ?? findOperatorSlot(result, operatorId);
    if (!slotId) continue;

    const props = loadoutProperties?.[slotId];
    const potential = props?.operator.potential ?? 0;

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
      if ((def.properties.eventCategoryType ?? def.properties.type) === EventCategoryType.TALENT) {
        const talentDuration = def.properties.duration;
        const talentDurationFrames = talentDuration ? getDurationFrames(talentDuration) : TOTAL_FRAMES;
        const talentOwnerId = resolveOwnerId(def.properties.target, slotId, operatorSlotMap, def.properties.targetDeterminer);
        const talentColumnId = def.properties.id;
        // Only create if not already present
        if (!result.some(ev => ev.columnId === talentColumnId && ev.ownerId === talentOwnerId)) {
          result.push({
            uid: `${def.properties.id.toLowerCase()}-talent-${slotId}`,
            id: def.properties.id,
            name: def.properties.id,
            ownerId: talentOwnerId,
            columnId: talentColumnId,
            startFrame: 0,
            segments: durationSegment(talentDurationFrames),
            sourceOwnerId: operatorId,
            sourceSkillName: def.properties.id,
          });
        }
      }

      const { derived, absorbedInflictions } = deriveStatusEvents(def, ctx);

      // Apply absorption clamping to infliction events (e.g. heat infliction consumed by Final Strike)
      if (absorbedInflictions.length > 0) {
        result = result.map(ev => {
          const absorption = absorbedInflictions.find(a => a.eventUid === ev.uid);
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
    for (const [slotId, weaponId] of Object.entries(slotWeapons)) {
      if (!weaponId) continue;
      for (const raw of getWeaponEffectDefs(weaponId)) {
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
    for (const def of getEnabledDefs(operatorId)) {
      if (def.onEntryClause?.length || def.onTriggerClause?.length) {
        allLifecycleDefs.push(def);
      }
    }
  }
  if (allLifecycleDefs.length > 0) {
    result = evaluateLifecycleClauses(result, allLifecycleDefs, operatorSlotMap, critMode);
  }

  return result;
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
  /** Slot ID of the operator that triggered this entry (for TRIGGER determiner resolution). */
  triggerSlotId?: string;
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
      if ((def.properties.eventCategoryType ?? def.properties.type) === EventCategoryType.TALENT) {
        const talentDuration = def.properties.duration;
        const talentDurationFrames = talentDuration ? getDurationFrames(talentDuration) : TOTAL_FRAMES;
        const talentOwnerId = resolveOwnerId(def.properties.target, slotId, operatorSlotMap, def.properties.targetDeterminer);
        const talentColumnId = def.properties.id;
        if (!events.some(ev => ev.columnId === talentColumnId && ev.ownerId === talentOwnerId)) {
          talentEvents.push({
            uid: `${def.properties.id.toLowerCase()}-talent-${slotId}`,
            id: def.properties.id,
            name: def.properties.id,
            ownerId: talentOwnerId,
            columnId: talentColumnId,
            startFrame: 0,
            segments: durationSegment(talentDurationFrames),
            sourceOwnerId: operatorId,
            sourceSkillName: def.properties.id,
          });
        }
      }

      if (!def.onTriggerClause || def.onTriggerClause.length === 0) continue;

      // Skip defs whose trigger clauses have no effects AND no clause effects —
      // these define triggers for other defs (e.g. a talent) to use, they don't produce events on their own.
      // Weapon/gear defs often have output effects in `clause` rather than `onTriggerClause[].effects`.
      const hasEffects = def.onTriggerClause.some(c => c.effects && c.effects.length > 0);
      const hasClauseEffects = (def.clause as { effects?: unknown[] }[] | undefined)?.some(c => c.effects && c.effects.length > 0);
      if (!hasEffects && !hasClauseEffects && (def.properties.eventCategoryType ?? def.properties.type) !== EventCategoryType.TALENT) continue;

      // Use the unified verb-handler registry to find trigger matches for ALL verb types.
      // HAVE conditions are extracted and deferred to queue-time evaluation — they must
      // be removed from the clauses before matching so they don't block trigger detection
      // (derived events like freeform inflictions aren't registered at collection time).
      const haveConds = def.onTriggerClause.flatMap(c =>
        c.conditions.filter((p: Predicate) => p.verb === VerbType.HAVE)
      );

      // Check if any clause has an HP% condition — these need periodic evaluation
      // since HP changes on every damage tick, not at discrete event frames.
      // Supports both PERCENTAGE_HP (legacy) and HP with unit PERCENTAGE (value+unit wrapper).
      const hasHpThreshold = haveConds.some((c: Predicate) => {
        if (c.object === NounType.PERCENTAGE_HP) return true;
        if (c.object === NounType.HP) {
          const w = (c as unknown as Record<string, unknown>).with as Record<string, unknown> | undefined;
          const v = w?.value as Record<string, unknown> | undefined;
          return v?.unit === UnitType.PERCENTAGE;
        }
        return false;
      });

      // Strip HAVE conditions from clauses for matching — they'll be re-evaluated at queue time.
      const strippedClauses = haveConds.length > 0
        ? def.onTriggerClause.map(c => ({
          ...c,
          conditions: c.conditions.filter((p: Predicate) => p.verb !== VerbType.HAVE),
        }))
        : def.onTriggerClause;

      const matches = findClauseTriggerMatches(strippedClauses, events, slotId);

      if (matches.length === 0 && hasHpThreshold) {
        // All-HAVE clause with PERCENTAGE_HP: generate periodic triggers (every second)
        // so the HP threshold gets evaluated as cumulative damage accumulates.
        const triggerCtx: EngineTriggerContext = {
          def, operatorId, operatorSlotId: slotId, potential, operatorSlotMap,
          loadoutProperties: props, haveConditions: haveConds,
          triggerEffects: def.onTriggerClause[0]?.effects,
        };
        for (let frame = 0; frame < TOTAL_FRAMES; frame += FPS) {
          entries.push({
            frame,
            sourceOwnerId: operatorId,
            sourceSkillName: def.properties.id,
            triggerSlotId: slotId,
            ctx: triggerCtx,
            isEquip,
          });
        }
      } else {
        for (const match of matches) {
          const triggerCtx: EngineTriggerContext = {
            def, operatorId, operatorSlotId: slotId, potential, operatorSlotMap,
            loadoutProperties: props, haveConditions: haveConds,
            triggerEffects: def.onTriggerClause[0]?.effects,
          };
          entries.push({
            frame: match.frame,
            sourceOwnerId: operatorId,
            sourceSkillName: match.sourceSkillName,
            triggerSlotId: match.sourceOwnerId,
            ctx: triggerCtx,
            isEquip,
          });
        }
      }
    }
  };

  for (const operatorId of Array.from(ENGINE_HANDLED_OPERATORS)) {
    const defs = getEnabledDefs(operatorId);
    if (!defs.length) continue;
    const slotId = operatorSlotMap[operatorId] ?? findOperatorSlot(events, operatorId);
    if (!slotId) continue;
    processDefsForSlot(slotId, operatorId, defs);
  }

  if (slotWeapons) {
    for (const [slotId, weaponId] of Object.entries(slotWeapons)) {
      if (!weaponId) continue;
      const opId = slotOperatorMap ? Object.entries(slotOperatorMap).find(([s]) => s === slotId)?.[1] : undefined;
      processDefsForSlot(slotId, opId ?? '', getWeaponEffectDefs(weaponId).map(normalizeEquipDef), true);
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
