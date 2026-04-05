/**
 * TriggerIndex — config-driven index of all trigger definitions.
 *
 * Built once at the start of runEventQueue from operator/weapon/gear configs.
 * Maps observable events (verb + object) to the trigger defs that care about
 * them, enabling O(1) lookup during queue processing.
 *
 * Indexes three types of triggers:
 * - onTriggerClause: event-driven triggers (PERFORM, APPLY, CONSUME, etc.)
 * - clause: lifecycle triggers (HAVE STACKS conditions, e.g. MF → SH)
 * - TALENT: permanent presence events created on first encounter
 *
 * Replaces the pre-queue collectEngineTriggerEntries scan.
 */
import { StackInteractionType, UnitType, UNLIMITED_STACKS } from '../../consts/enums';
import type { LoadoutProperties } from '../../view/InformationPane';
import type { StatusEventDef } from './eventQueueTypes';
import type { Predicate, TriggerEffect } from './triggerMatch';
import type { ValueNode } from '../../dsl/semantics';
import { VerbType, NounType, ObjectType, AdjectiveType, DeterminerType, THRESHOLD_MAX } from '../../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';
import { getAllOperatorIds, getSkillIds, getEnabledStatusEvents, getOperatorSkills } from '../gameDataStore';
import { getWeaponTriggerDefs, getWeaponStatusTriggerDefs, getGearTriggerDefs, getGearStatusTriggerDefs, getConsumablePassiveDef, getTacticalTriggerDef } from '../gameDataStore';
import type { NormalizedEffectDef } from '../gameDataStore';
import { ENEMY_OWNER_ID, ENEMY_ACTION_COLUMN_ID, REACTION_COLUMNS, INFLICTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, PHYSICAL_STATUS_COLUMN_IDS, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID } from '../../model/channels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { TOTAL_FRAMES, FPS } from '../../utils/timeline';
import { TimelineEvent, durationSegment } from '../../consts/viewTypes';

// ── Skill-alias-to-column mapping ────────────────────────────────────────────

/** Maps legacy skill aliases to their NounType column ID. */
const SKILL_ALIAS_TO_COLUMN: Record<string, string> = {
  ULTIMATE_SKILL: NounType.ULTIMATE,
};

/** Maps IS/BECOME state qualifiers to column IDs for index keying. */
export const STATE_TO_COLUMN: Record<string, string> = {
  // Arts reactions
  [ObjectType.COMBUSTED]: REACTION_COLUMNS.COMBUSTION,
  [ObjectType.SOLIDIFIED]: REACTION_COLUMNS.SOLIDIFICATION,
  [ObjectType.CORRODED]: REACTION_COLUMNS.CORROSION,
  [ObjectType.ELECTRIFIED]: REACTION_COLUMNS.ELECTRIFICATION,
  // Physical statuses
  [ObjectType.LIFTED]: PHYSICAL_STATUS_COLUMNS.LIFT,
  [ObjectType.KNOCKED_DOWN]: PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
  [ObjectType.CRUSHED]: PHYSICAL_STATUS_COLUMNS.CRUSH,
  [ObjectType.BREACHED]: PHYSICAL_STATUS_COLUMNS.BREACH,
  // Stagger states
  [ObjectType.NODE_STAGGERED]: NODE_STAGGER_COLUMN_ID,
  [ObjectType.FULL_STAGGERED]: FULL_STAGGER_COLUMN_ID,
};

/** Maps APPLY INFLICTION element qualifiers to infliction column IDs. */
const ELEMENT_TO_INFLICTION: Record<string, string> = {
  [AdjectiveType.HEAT]: INFLICTION_COLUMNS.HEAT,
  [AdjectiveType.CRYO]: INFLICTION_COLUMNS.CRYO,
  [AdjectiveType.NATURE]: INFLICTION_COLUMNS.NATURE,
  [AdjectiveType.ELECTRIC]: INFLICTION_COLUMNS.ELECTRIC,
};

// ── Types ───────────────────────────────────────────────────────────────────

export interface TriggerDefEntry {
  def: StatusEventDef;
  operatorId: string;
  operatorSlotId: string;
  potential: number;
  operatorSlotMap: Record<string, string>;
  loadoutProperties?: LoadoutProperties;
  isEquip: boolean;
  /** The primary verb that activates this trigger. */
  primaryVerb: string;
  /** The primary condition from the onTriggerClause. */
  primaryCondition: Predicate;
  /** Non-primary, non-HAVE conditions checked at evaluation time. */
  secondaryConditions: Predicate[];
  /** HAVE conditions deferred to queue-time evaluation. */
  haveConditions: Predicate[];
  /** Effects from the onTriggerClause. */
  triggerEffects?: TriggerEffect[];
  /** Clause index within the def's onTriggerClause array (for FIRST_MATCH dedup). */
  clauseIndex: number;
  /** Maximum number of times this trigger can fire (e.g. tactical/gear usage limits). */
  usageLimit?: number;
}

export interface LifecycleDefEntry {
  def: StatusEventDef;
  operatorId: string;
  /** HAVE conditions resolved to concrete form (STACKS → STATUS with max value). */
  haveConditions: Predicate[];
  /** Effects from the clause (e.g. APPLY STATUS SCORCHING_HEART). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effects: any[];
  /** Full serialized def for ENGINE_TRIGGER context. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fullDef: any;
  /** Max stacks of the source status. */
  maxStacks: number;
}

export interface TalentDefEntry {
  def: StatusEventDef;
  operatorId: string;
  operatorSlotId: string;
  talentEvent: TimelineEvent | null;
}

// ── Priority registry (mirrors triggerMatch.ts) ─────────────────────────────

const VERB_PRIORITIES: Record<string, number> = {
  [VerbType.PERFORM]: 10, [VerbType.APPLY]: 20, [VerbType.CONSUME]: 25, [VerbType.DEAL]: 30, [VerbType.HIT]: 35,
  [VerbType.DEFEAT]: 40, [VerbType.RECEIVE]: 50, [VerbType.BECOME]: 55, [VerbType.RECOVER]: 60, [VerbType.HAVE]: 70, [VerbType.IS]: 80,
};

// ── Equip def normalization ─────────────────────────────────────────────────

function normalizeEquipDef(raw: NormalizedEffectDef): StatusEventDef {
  const rp = raw.properties as Record<string, unknown> | undefined;
  const id = raw.id ?? raw.name ?? (rp?.id as string) ?? (rp?.name as string) ?? '';
  const name = raw.name ?? (rp?.name as string);
  let target = raw.target ?? (rp?.target as string);
  let targetDeterminer = raw.targetDeterminer ?? (rp?.targetDeterminer as string);
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
      id, name, target, targetDeterminer,
      isForced: raw.isForced ?? (rp?.isForced as boolean),
      enhancementTypes: raw.enhancementTypes ?? (rp?.enhancementTypes as string[]),
      stacks,
      duration: rp?.duration as StatusEventDef['properties']['duration'],
      susceptibility: raw.susceptibility ?? (rp?.susceptibility as string),
      cooldownSeconds: raw.cooldownSeconds ?? (rp?.cooldownSeconds as number),
      ...(raw.eventIdType ? { eventIdType: raw.eventIdType } : {}),
    },
    onTriggerClause: raw.onTriggerClause as StatusEventDef['onTriggerClause'] ?? [],
  } as StatusEventDef;
}

// ── Resolve helpers ─────────────────────────────────────────────────────────

function resolveTargetOwnerId(
  target: string | undefined,
  slotId: string,
  operatorSlotMap: Record<string, string>,
  determiner?: string,
): string {
  if (target === NounType.ENEMY) return ENEMY_OWNER_ID;
  if (target === NounType.TEAM) return COMMON_OWNER_ID;
  if (target === NounType.OPERATOR || !target) {
    if (determiner === DeterminerType.ALL) return COMMON_OWNER_ID;
    if (determiner === DeterminerType.OTHER) return COMMON_OWNER_ID;
    return slotId;
  }
  // Named operator (e.g. 'LAEVATAIN') — resolve via slot map
  const slot = operatorSlotMap[target.toLowerCase()];
  return slot ?? slotId;
}

function getMaxStacks(limit: ValueNode): number {
  return resolveValueNode(limit, DEFAULT_VALUE_CONTEXT);
}

function getDurationFrames(duration: { value: ValueNode; unit: string }): number {
  const raw = duration.value;
  const val = Array.isArray(raw) ? (raw as number[])[0] ?? 0
    : typeof raw === 'number' ? raw
    : resolveValueNode(raw, DEFAULT_VALUE_CONTEXT);
  if (val < 0) return TOTAL_FRAMES;
  if (duration.unit === UnitType.SECOND) return Math.round(val * FPS);
  return val;
}

/** Resolve primary verb key for indexing: verb + resolved column/object. */
function resolveTriggerKey(verb: string, cond: Predicate): string {
  if (verb === VerbType.PERFORM) {
    // Normalized skill: object=SKILL, objectId=BASIC_ATTACK/BATTLE_SKILL/etc.
    // Resolve to the specific skill column via objectId.
    if (cond.object === NounType.SKILL && cond.objectId) {
      const col = SKILL_ALIAS_TO_COLUMN[cond.objectId] ?? cond.objectId;
      return `${VerbType.PERFORM}:${col}`;
    }
    // Legacy/non-skill frame-level actions (NORMAL_ATTACK, CHARGE, CRITICAL_HIT)
    const col = SKILL_ALIAS_TO_COLUMN[cond.object ?? ''] ?? cond.object;
    return `${VerbType.PERFORM}:${col}`;
  }
  if (verb === VerbType.APPLY || verb === VerbType.CONSUME || verb === VerbType.RECEIVE) {
    if (cond.objectId) {
      const col = cond.objectId;
      return `${verb}:${col}`;
    }
    // INFLICTION with element qualifier → resolve to infliction column
    const inflElement = cond.element ?? cond.objectQualifier;
    if (cond.object === NounType.INFLICTION && inflElement) {
      const inflCol = ELEMENT_TO_INFLICTION[inflElement];
      if (inflCol) return `${verb}:${inflCol}`;
    }
    return `${verb}:${cond.object ?? '*'}`;
  }
  if (verb === VerbType.IS || verb === VerbType.BECOME) {
    // Map state qualifiers (COMBUSTED) to column IDs (combustion) for matching
    const stateCol = STATE_TO_COLUMN[cond.object ?? ''];
    return `${verb}:${stateCol ?? cond.object ?? '*'}`;
  }
  if (verb === VerbType.DEAL) return `${VerbType.DEAL}:${NounType.DAMAGE}`;
  if (verb === VerbType.RECOVER) {
    if (!cond.object) return '';
    return `${VerbType.RECOVER}:${cond.object}`;
  }
  if (verb === VerbType.HIT) return `${VerbType.HIT}:${ENEMY_ACTION_COLUMN_ID}`;
  if (verb === VerbType.DEFEAT) return `${VerbType.DEFEAT}:${NounType.ENEMY}`;
  if (!cond.object) return '';
  return `${verb}:${cond.object}`;
}

/** Resolve generic category targets that a specific column ID belongs to. */
function resolveCategories(columnId: string): string[] {
  const categories: string[] = [];
  const reactionColumns = new Set<string>(Object.values(REACTION_COLUMNS));
  const inflictionColumns = new Set<string>(Object.values(INFLICTION_COLUMNS));
  if (reactionColumns.has(columnId)) categories.push(NounType.REACTION);
  if (inflictionColumns.has(columnId)) categories.push(NounType.INFLICTION);
  if (PHYSICAL_STATUS_COLUMN_IDS.has(columnId)) {
    categories.push(NounType.STATUS);
    // PHYSICAL as category — matches triggers with objectId: 'PHYSICAL' (e.g. APPLY STATUS PHYSICAL)
    categories.push('PHYSICAL');
  } else if (!reactionColumns.has(columnId) && !inflictionColumns.has(columnId)) {
    categories.push(NounType.STATUS);
  }
  return categories;
}

// ── TriggerIndex ────────────────────────────────────────────────────────────

export class TriggerIndex {
  /** onTriggerClause defs indexed by verb:object key. */
  private index = new Map<string, TriggerDefEntry[]>();
  /** clause-based lifecycle defs indexed by status ID (e.g. MELTING_FLAME). */
  private lifecycleIndex = new Map<string, LifecycleDefEntry>();
  /** Talent defs indexed by slot ID. */
  private talentsBySlot = new Map<string, TalentDefEntry[]>();
  /** HP-threshold defs (evaluated inline after every PROCESS_FRAME). */
  private hpThresholdDefs: TriggerDefEntry[] = [];

  // ── Lookup API ──────────────────────────────────────────────────────────

  /** Get trigger defs matching a verb:object key. */
  lookup(key: string): readonly TriggerDefEntry[] {
    return this.index.get(key) ?? [];
  }

  /** Get all keys in the index (for seeding PERFORM/DEAL/RECOVER from input events). */
  keys(): IterableIterator<string> {
    return this.index.keys();
  }

  /**
   * Find all trigger defs whose indexed key matches an observable event.
   * Only returns entries whose verb matches the supplied verb, and whose
   * resolved target matches the event's column ID. Handles generic category
   * targets (REACTION, INFLICTION, STATUS) matching specific column IDs.
   */
  matchEvent(verb: string, columnId: string): readonly TriggerDefEntry[] {
    const results: TriggerDefEntry[] = [];
    // Resolve category for the column ID (e.g. REACTION_COLUMNS.COMBUSTION → REACTION)
    const categories = resolveCategories(columnId);
    this.index.forEach((entries, key) => {
      const [keyVerb, target] = key.split(':');
      if (keyVerb !== verb) return;
      if (target === columnId || categories.includes(target)) {
        results.push(...entries);
      }
    });
    return results;
  }

  /** Get lifecycle clause def for a status ID (e.g. MELTING_FLAME → SH trigger). */
  getLifecycle(statusId: string): LifecycleDefEntry | undefined {
    return this.lifecycleIndex.get(statusId);
  }

  /** Get talent defs for a slot. */
  getTalents(slotId: string): readonly TalentDefEntry[] {
    return this.talentsBySlot.get(slotId) ?? [];
  }

  /** Get all talent events across all slots. */
  getAllTalentEvents(): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    this.talentsBySlot.forEach(defs => {
      for (const d of defs) {
        if (d.talentEvent) events.push(d.talentEvent);
      }
    });
    return events;
  }

  /** Get HP-threshold defs for inline evaluation on damage frames. */
  getHpThresholdDefs(): readonly TriggerDefEntry[] {
    return this.hpThresholdDefs;
  }

  // ── Build ───────────────────────────────────────────────────────────────

  static build(
    slotOperatorMap?: Record<string, string>,
    loadoutProperties?: Record<string, LoadoutProperties>,
    slotWeapons?: Record<string, string | undefined>,
    slotGearSets?: Record<string, string | undefined>,
    registeredEvents?: readonly TimelineEvent[],
    slotConsumables?: Record<string, string | undefined>,
    slotTacticals?: Record<string, string | undefined>,
  ): TriggerIndex {
    const idx = new TriggerIndex();

    // Build reverse map: operatorId → slotId
    const operatorSlotMap: Record<string, string> = {};
    if (slotOperatorMap) {
      for (const [slotId, opId] of Object.entries(slotOperatorMap)) {
        operatorSlotMap[opId] = slotId;
      }
    }
    // Fallback: scan events for operator slot detection
    if (registeredEvents) {
      for (const opId of getAllOperatorIds()) {
        if (operatorSlotMap[opId]) continue;
        const skillNames = getSkillIds(opId);
        for (const ev of registeredEvents) {
          if (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID) continue;
          if (skillNames.has(ev.id)) { operatorSlotMap[opId] = ev.ownerId; break; }
        }
      }
    }

    // Process operator status defs
    for (const opId of getAllOperatorIds()) {
      const defs = getEnabledStatusEvents(opId).map(s => s.serialize() as unknown as StatusEventDef);
      if (!defs.length) continue;
      const slotId = operatorSlotMap[opId];
      if (!slotId) continue;
      idx.processDefsForSlot(slotId, opId, defs, false, loadoutProperties, operatorSlotMap, registeredEvents);
    }

    // Process operator skill onTriggerClause defs
    for (const opId of getAllOperatorIds()) {
      const skills = getOperatorSkills(opId);
      if (!skills) continue;
      const slotId = operatorSlotMap[opId];
      if (!slotId) continue;
      const skillTriggerDefs: StatusEventDef[] = [];
      skills.forEach((skill) => {
        if (!skill.onTriggerClause?.length) return;
        // Wrap skill onTriggerClause into a pseudo-StatusEventDef so processDefsForSlot can index it
        skillTriggerDefs.push({
          properties: {
            id: skill.id,
            eventIdType: skill.eventIdType,
          },
          onTriggerClause: skill.onTriggerClause as unknown as StatusEventDef['onTriggerClause'],
        } as unknown as StatusEventDef);
      });
      if (skillTriggerDefs.length) {
        idx.processDefsForSlot(slotId, opId, skillTriggerDefs, false, loadoutProperties, operatorSlotMap, registeredEvents);
      }
    }

    // Process weapon trigger defs (weapon skill triggers)
    if (slotWeapons) {
      for (const [slotId, weaponId] of Object.entries(slotWeapons)) {
        if (!weaponId) continue;
        const opId = slotOperatorMap?.[slotId] ?? '';
        idx.processDefsForSlot(slotId, opId, getWeaponTriggerDefs(weaponId).map(normalizeEquipDef), true, loadoutProperties, operatorSlotMap, registeredEvents);
        // Weapon status triggers (e.g., BECOME STACKS on Wolven Blood)
        idx.processDefsForSlot(slotId, opId, getWeaponStatusTriggerDefs(weaponId).map(normalizeEquipDef), true, loadoutProperties, operatorSlotMap, registeredEvents);
      }
    }

    // Process gear defs
    if (slotGearSets) {
      for (const [slotId, gearSetType] of Object.entries(slotGearSets)) {
        if (!gearSetType) continue;
        const opId = slotOperatorMap?.[slotId] ?? '';
        idx.processDefsForSlot(slotId, opId, getGearTriggerDefs(gearSetType).map(normalizeEquipDef), true, loadoutProperties, operatorSlotMap, registeredEvents);
        // Gear status triggers
        idx.processDefsForSlot(slotId, opId, getGearStatusTriggerDefs(gearSetType).map(normalizeEquipDef), true, loadoutProperties, operatorSlotMap, registeredEvents);
      }
    }

    // Process consumable defs
    if (slotConsumables) {
      for (const [slotId, consumableId] of Object.entries(slotConsumables)) {
        if (!consumableId) continue;
        const opId = slotOperatorMap?.[slotId] ?? '';
        const def = getConsumablePassiveDef(consumableId);
        if (def) idx.processDefsForSlot(slotId, opId, [normalizeEquipDef(def)], true, loadoutProperties, operatorSlotMap, registeredEvents);
      }
    }

    // Process tactical defs
    if (slotTacticals) {
      for (const [slotId, tacticalId] of Object.entries(slotTacticals)) {
        if (!tacticalId) continue;
        const opId = slotOperatorMap?.[slotId] ?? '';
        const def = getTacticalTriggerDef(tacticalId);
        if (def) idx.processDefsForSlot(slotId, opId, [normalizeEquipDef(def)], true, loadoutProperties, operatorSlotMap, registeredEvents);
      }
    }

    return idx;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private processDefsForSlot(
    slotId: string,
    operatorId: string,
    defs: StatusEventDef[],
    isEquip: boolean,
    loadoutProperties?: Record<string, LoadoutProperties>,
    operatorSlotMap?: Record<string, string>,
    registeredEvents?: readonly TimelineEvent[],
  ) {
    const props = loadoutProperties?.[slotId];
    const potential = props?.operator.potential ?? 0;
    const opSlotMap = operatorSlotMap ?? {};

    for (const def of defs) {
      // ── Talent defs ──────────────────────────────────────────────────
      if ((def.properties.eventIdType ?? def.properties.type) === NounType.TALENT) {
        // Description-only talents (no trigger, no clause, no segments) are metadata-only — skip.
        // Their effects are baked into skill frames; the talent JSON is just a label.
        const hasTrigger = def.onTriggerClause && def.onTriggerClause.length > 0;
        const hasClause = def.clause && def.clause.length > 0;
        const hasSegments = def.segments && def.segments.length > 0;
        if (!hasTrigger && !hasClause && !hasSegments) continue;

        const talentDuration = def.properties.duration;
        const talentDurationFrames = talentDuration ? getDurationFrames(talentDuration) : TOTAL_FRAMES;
        const talentOwnerId = resolveTargetOwnerId(def.properties.target, slotId, opSlotMap, def.properties.targetDeterminer);
        const talentColumnId = def.properties.id;

        // Trigger-only talents (have onTriggerClause + finite duration) create instances
        // via APPLY EVENT during queue processing — no template event. Template events
        // for these falsely satisfy HAVE STATUS conditions.
        const hasNegativeDuration = talentDuration && getDurationFrames(talentDuration) === TOTAL_FRAMES
          && resolveValueNode(talentDuration.value, DEFAULT_VALUE_CONTEXT) < 0;
        const isPassive = talentDurationFrames >= TOTAL_FRAMES && !hasNegativeDuration;
        if (hasTrigger && !isPassive) {
          const existing = this.talentsBySlot.get(slotId) ?? [];
          existing.push({ def, operatorId, operatorSlotId: slotId, talentEvent: null });
          this.talentsBySlot.set(slotId, existing);
          // Fall through to onTriggerClause indexing below (don't continue)
        } else if (!isPassive) {
          // Finite-duration talent with no trigger: template-only status.
          // These are applied dynamically by other effects (e.g. APPLY STATUS from
          // empowered battle skill clauses) — do NOT create a presence event or
          // register for passive stat interpretation at frame 0.
          continue;
        } else {
          // Skip if already exists in registered events or already indexed in this build (any slot)
          if (registeredEvents?.some(ev => ev.columnId === talentColumnId && ev.ownerId === talentOwnerId)) continue;
          let alreadyIndexed = false;
          this.talentsBySlot.forEach(entries => {
            if (alreadyIndexed) return;
            if (entries.some(t => t.talentEvent?.columnId === talentColumnId && t.talentEvent?.ownerId === talentOwnerId)) alreadyIndexed = true;
          });
          if (alreadyIndexed) continue;

          // Counter talents (NONE + unlimited stacks, e.g. Living Banner) start at 0 —
          // no presence event. The first APPLY creates the event at the frame where stacks are gained.
          const stackLimit = def.properties.stacks?.limit;
          const resolvedLimit = typeof stackLimit === 'number' ? stackLimit
            : typeof (stackLimit as { value?: number })?.value === 'number' ? (stackLimit as { value?: number }).value! : 0;
          const isCounter = def.properties.stacks?.interactionType === StackInteractionType.NONE
            && resolvedLimit >= UNLIMITED_STACKS;
          if (isCounter) {
            const existing = this.talentsBySlot.get(slotId) ?? [];
            existing.push({ def, operatorId, operatorSlotId: slotId, talentEvent: null });
            this.talentsBySlot.set(slotId, existing);
            // Fall through to onTriggerClause indexing below
          } else {

          const talentEvent: TimelineEvent = {
            uid: `${def.properties.id.toLowerCase()}-talent-${slotId}`,
            id: def.properties.id,
            name: def.properties.id,
            ownerId: talentOwnerId,
            columnId: talentColumnId,
            startFrame: 0,
            segments: durationSegment(talentDurationFrames),
            sourceOwnerId: operatorId,
            sourceSkillName: def.properties.id,
          };

          const existing = this.talentsBySlot.get(slotId) ?? [];
          existing.push({ def, operatorId, operatorSlotId: slotId, talentEvent });
          this.talentsBySlot.set(slotId, existing);
          }
        }
      }

      // ── Non-talent equip defs with passive clauses ──────────────
      // Weapons, gear, consumables, and tacticals can have passive APPLY STAT
      // clauses. Register these for passive stat interpretation at frame 0.
      // Consumables also get a presence event (they're active-at-start buffs).
      const ect = def.properties.eventIdType ?? def.properties.type;
      if (isEquip && ect !== NounType.TALENT && def.clause && Array.isArray(def.clause)) {
        const hasPassiveStats = (def.clause as { conditions?: unknown[]; effects?: { verb?: string; object?: string }[] }[])
          .some(c => (!c.conditions || c.conditions.length === 0) && c.effects?.some(e => e.verb === VerbType.APPLY && e.object === NounType.STAT));
        if (hasPassiveStats) {
          // Consumables are active-at-start buffs — create a presence event like talents.
          let presenceEvent: TimelineEvent | null = null;
          if (ect === NounType.CONSUMABLE) {
            const dur = def.properties.duration ? getDurationFrames(def.properties.duration) : TOTAL_FRAMES;
            const ownerId = resolveTargetOwnerId(def.properties.target, slotId, opSlotMap, def.properties.targetDeterminer);
            presenceEvent = {
              uid: `${def.properties.id.toLowerCase()}-consumable-${slotId}`,
              id: def.properties.id,
              name: def.properties.id,
              ownerId,
              columnId: NounType.CONSUMABLE,
              startFrame: 0,
              segments: durationSegment(dur),
              sourceOwnerId: operatorId,
              sourceSkillName: def.properties.id,
            };
          }
          const existing = this.talentsBySlot.get(slotId) ?? [];
          existing.push({ def, operatorId, operatorSlotId: slotId, talentEvent: presenceEvent });
          this.talentsBySlot.set(slotId, existing);
        }
      }

      // ── Lifecycle clauses (clause with HAVE conditions) ──────────────
      // Skip lifecycle indexing for passive talents — they're pre-registered as permanent
      // presence events and shouldn't be re-created by the lifecycle trigger system.
      const isTalentType = ect === NounType.TALENT;
      const talentDur = def.properties.duration;
      const isPassiveTalent = isTalentType && (!talentDur || getDurationFrames(talentDur) >= TOTAL_FRAMES);
      if (!isPassiveTalent && def.clause && Array.isArray(def.clause)) {
        for (const c of def.clause) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clause = c as any;
          const conditions = clause.conditions ?? [];
          const effects = clause.effects ?? [];
          const haveConds = conditions.filter((p: { verb?: string }) => p.verb === VerbType.HAVE);
          if (haveConds.length > 0 && effects.length > 0) {
            // Resolve abstract STACKS → concrete STATUS conditions
            const maxStacks = def.properties.stacks?.limit
              ? getMaxStacks(def.properties.stacks.limit)
              : 1;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const resolvedConds = haveConds.map((cond: any) => {
              if (cond.object === NounType.STACKS) {
                return {
                  ...cond,
                  object: NounType.STATUS,
                  objectId: def.properties.id,
                  value: cond.value === THRESHOLD_MAX ? { verb: VerbType.IS, value: maxStacks } : cond.value,
                };
              }
              return cond;
            });
            this.lifecycleIndex.set(def.properties.id, {
              def: def as StatusEventDef,
              operatorId,
              haveConditions: resolvedConds,
              effects,
              fullDef: def,
              maxStacks,
            });
            break; // one lifecycle clause per status
          }
        }
      }

      // ── onTriggerClause defs ─────────────────────────────────────────
      if (!def.onTriggerClause || def.onTriggerClause.length === 0) continue;

      const hasEffects = def.onTriggerClause.some(c => c.effects && c.effects.length > 0);
      const hasClauseEffects = (def.clause as { effects?: unknown[] }[] | undefined)?.some(c => c.effects && c.effects.length > 0);
      if (!hasEffects && !hasClauseEffects && (def.properties.eventIdType ?? def.properties.type) !== NounType.TALENT) continue;

      for (let ci = 0; ci < def.onTriggerClause.length; ci++) {
        const clause = def.onTriggerClause[ci];
        // Find primary verb (lowest priority)
        let primaryVerb: string | undefined;
        let bestPriority = Infinity;
        for (const cond of clause.conditions) {
          const priority = VERB_PRIORITIES[cond.verb as string];
          if (priority != null && priority < bestPriority) {
            bestPriority = priority;
            primaryVerb = cond.verb as string;
          }
        }
        if (!primaryVerb) continue;

        // HAVE-only clauses with HP PERCENTAGE: collect separately for inline
        // evaluation after every PROCESS_FRAME (HP changes from cumulative damage,
        // and inline skill damage doesn't fire DEAL:DAMAGE reactive triggers).
        if (primaryVerb === VerbType.HAVE && clause.conditions.some((c: Predicate) => {
          if (c.object !== NounType.HP) return false;
          const w = (c as unknown as Record<string, unknown>).with as Record<string, unknown> | undefined;
          const v = w?.value as Record<string, unknown> | undefined;
          return v?.unit === UnitType.PERCENTAGE;
        })) {
          this.hpThresholdDefs.push({
            def,
            operatorId,
            operatorSlotId: slotId,
            potential,
            operatorSlotMap: opSlotMap,
            loadoutProperties: props,
            isEquip,
            primaryVerb: VerbType.HAVE,
            primaryCondition: clause.conditions[0],
            secondaryConditions: [],
            haveConditions: clause.conditions as Predicate[],
            triggerEffects: clause.effects,
            clauseIndex: ci,
          });
          continue;
        }

        let primaryCond = clause.conditions.find(c => c.verb === primaryVerb)!;
        const rawDeferredConds = clause.conditions.filter((c: Predicate) =>
          c.verb === VerbType.HAVE || c.verb === VerbType.BECOME,
        );
        const secondaryConds = clause.conditions.filter(c =>
          c !== primaryCond && !rawDeferredConds.includes(c),
        );

        // Resolve abstract STACKS → concrete STATUS <self-id> for deferred conditions
        const maxStacks = def.properties.stacks?.limit
          ? getMaxStacks(def.properties.stacks.limit)
          : 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const haveConds = rawDeferredConds.map((cond: any) => {
          if (cond.object === NounType.STACKS) {
            const rawValue = cond.value ?? cond.with?.value;
            return {
              ...cond,
              object: NounType.STATUS,
              objectId: def.properties.id,
              value: rawValue === THRESHOLD_MAX ? { verb: VerbType.IS, value: maxStacks } : rawValue,
            };
          }
          return cond;
        });

        // BECOME STACKS: index under APPLY:{status-column} so it fires when the
        // status receives a new stack. For self-referential (MF watching own stacks),
        // use def.properties.id. For external (combo watching another status), use
        // the condition's subjectId.
        if (primaryVerb === VerbType.BECOME && primaryCond.object === NounType.STACKS) {
          const targetStatusId = primaryCond.subjectId ?? def.properties.id;
          primaryVerb = VerbType.APPLY;
          primaryCond = { verb: VerbType.APPLY, object: NounType.STATUS, objectId: targetStatusId } as Predicate;
        }

        // BECOME <state> (LIFTED, COMBUSTED, etc.) fires when the corresponding
        // status is applied. Remap to APPLY:<column> so reactive triggers match.
        if (primaryVerb === VerbType.BECOME && primaryCond.object !== NounType.STACKS) {
          const stateCol = STATE_TO_COLUMN[primaryCond.object as string];
          if (stateCol) {
            primaryVerb = VerbType.APPLY;
            primaryCond = { ...primaryCond, verb: VerbType.APPLY, object: NounType.STATUS, objectId: stateCol } as Predicate;
          }
        }

        const key = resolveTriggerKey(primaryVerb, primaryCond);
        if (!key) continue;
        const entry: TriggerDefEntry = {
          def,
          operatorId,
          operatorSlotId: slotId,
          potential,
          operatorSlotMap: opSlotMap,
          loadoutProperties: props,
          isEquip,
          primaryVerb,
          primaryCondition: primaryCond,
          secondaryConditions: secondaryConds,
          haveConditions: haveConds,
          triggerEffects: clause.effects,
          clauseIndex: ci,
          ...((def as unknown as { usageLimit?: number }).usageLimit != null
            ? { usageLimit: (def as unknown as { usageLimit?: number }).usageLimit }
            : {}),
        };

        // If this status is applied via CONTROLLED (e.g. Auxiliary Crystal),
        // create trigger entries for ALL operator slots since the status can
        // live on any slot. Each entry gets its own operatorSlotId so THIS
        // resolves to the correct status owner.
        const targetSlots = isControlledAppliedStatus(operatorId, def.properties.id)
          ? Object.values(opSlotMap).filter(s => s !== slotId)
          : [];

        const existing = this.index.get(key) ?? [];
        existing.push(entry);
        for (const targetSlot of targetSlots) {
          existing.push({ ...entry, operatorSlotId: targetSlot });
        }
        this.index.set(key, existing);
      }
    }
  }
}

/** Check if a status is applied to CONTROLLED OPERATOR by scanning skill frame effects. */
function isControlledAppliedStatus(operatorId: string, statusId: string): boolean {
  const skills = getOperatorSkills(operatorId);
  if (!skills) return false;
  let found = false;
  skills.forEach((skill) => {
    if (found) return;
    const serialized = skill.serialize() as Record<string, unknown>;
    const segments = (serialized.segments ?? []) as { frames?: { clause?: { effects?: Record<string, unknown>[] }[] }[] }[];
    for (const seg of segments) {
      for (const frame of (seg.frames ?? [])) {
        for (const clause of (frame.clause ?? [])) {
          for (const eff of (clause.effects ?? [])) {
            if (eff.verb === VerbType.APPLY && eff.object === NounType.STATUS &&
                eff.objectId === statusId && eff.toDeterminer === DeterminerType.CONTROLLED) {
              found = true;
              return;
            }
          }
        }
      }
    }
  });
  return found;
}
