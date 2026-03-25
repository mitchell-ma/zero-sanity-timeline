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
import type { LoadoutProperties } from '../../view/InformationPane';
import type { StatusEventDef } from './statusTriggerCollector';
import type { Predicate, TriggerEffect } from './triggerMatch';
import type { ValueNode } from '../../dsl/semantics';
import { VerbType } from '../../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';
import { getAllOperatorIds, getSkillIds, getEnabledStatusEvents } from '../gameDataStore';
import { getWeaponEffectDefs, getGearEffectDefs } from '../gameDataStore';
import type { NormalizedEffectDef } from '../gameDataStore';
import { ENEMY_OWNER_ID, SKILL_COLUMNS, REACTION_COLUMNS, INFLICTION_COLUMNS } from '../../model/channels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { TOTAL_FRAMES, FPS } from '../../utils/timeline';
import { statusNameToColumnId } from './triggerMatch';
import { TimelineEvent, durationSegment } from '../../consts/viewTypes';

// ── Verb-to-column mapping (mirrors triggerMatch.ts SKILL_OBJECT_TO_COLUMN) ──

const SKILL_OBJECT_TO_COLUMN: Record<string, string> = {
  BASIC_ATTACK: SKILL_COLUMNS.BASIC,
  BATTLE_SKILL: SKILL_COLUMNS.BATTLE,
  COMBO_SKILL: SKILL_COLUMNS.COMBO,
  ULTIMATE: SKILL_COLUMNS.ULTIMATE,
  ULTIMATE_SKILL: SKILL_COLUMNS.ULTIMATE,
};

/** Maps IS/BECOME state adjectives to reaction column IDs for index keying. */
const STATE_TO_COLUMN: Record<string, string> = {
  COMBUSTED: REACTION_COLUMNS.COMBUSTION,
  SOLIDIFIED: REACTION_COLUMNS.SOLIDIFICATION,
  CORRODED: REACTION_COLUMNS.CORROSION,
  ELECTRIFIED: REACTION_COLUMNS.ELECTRIFICATION,
};

/** Maps APPLY INFLICTION element adjectives to infliction column IDs. */
const ELEMENT_TO_INFLICTION: Record<string, string> = {
  HEAT: INFLICTION_COLUMNS.HEAT,
  CRYO: INFLICTION_COLUMNS.CRYO,
  NATURE: INFLICTION_COLUMNS.NATURE,
  ELECTRIC: INFLICTION_COLUMNS.ELECTRIC,
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
  /** Effects from the first onTriggerClause. */
  triggerEffects?: TriggerEffect[];
}

export interface LifecycleDefEntry {
  def: StatusEventDef;
  operatorId: string;
  /** HAVE conditions resolved to concrete form (STACKS → STATUS with max value). */
  haveConditions: Predicate[];
  /** Effects from the clause (e.g. APPLY STATUS SCORCHING_HEART_EFFECT). */
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
  talentEvent: TimelineEvent;
}

// ── Priority registry (mirrors triggerMatch.ts) ─────────────────────────────

const VERB_PRIORITIES: Record<string, number> = {
  PERFORM: 10, APPLY: 20, CONSUME: 25, DEAL: 30, HIT: 35,
  DEFEAT: 40, RECEIVE: 50, BECOME: 55, RECOVER: 60, HAVE: 70, IS: 80,
};

// ── Equip def normalization (mirrors statusTriggerCollector.ts) ─────────────

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
          if (effect.to === 'ENEMY') { target = 'ENEMY'; targetDeterminer = 'THIS'; break; }
          if (effect.toDeterminer === 'OTHER') { target = 'OPERATOR'; targetDeterminer = 'OTHER'; break; }
          if (effect.toDeterminer === 'ALL') { target = 'OPERATOR'; targetDeterminer = 'ALL'; break; }
          if (effect.to === 'OPERATOR') { target = 'OPERATOR'; targetDeterminer = effect.toDeterminer ?? 'THIS'; break; }
        }
        if (target) break;
      }
    }
    if (!target) { target = 'OPERATOR'; targetDeterminer = 'THIS'; }
  }
  const sl = raw.stacks ?? (rp?.stacks as NormalizedEffectDef['stacks']);
  const limit = (sl?.limit ?? { verb: VerbType.IS, value: 1 }) as ValueNode;
  const stacks: StatusEventDef['properties']['stacks'] = {
    limit,
    interactionType: (sl as Record<string, unknown>)?.interactionType as string ?? 'NONE',
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
  if (target === 'ENEMY') return ENEMY_OWNER_ID;
  if (target === 'OPERATOR' || !target) {
    if (determiner === 'ALL') return COMMON_OWNER_ID;
    if (determiner === 'OTHER') return COMMON_OWNER_ID;
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
  if (duration.unit === 'SECOND') return Math.round(val * FPS);
  return val;
}

/** Resolve primary verb key for indexing: verb + resolved column/object. */
function resolveTriggerKey(verb: string, cond: Predicate): string {
  if (verb === 'PERFORM') {
    // Frame-level perform actions keep their own key so they are only matched
    // by checkPerformTriggers (not by generic column-level reactive triggers).
    if (cond.object === 'FINAL_STRIKE' || cond.object === 'FINISHER' || cond.object === 'DIVE_ATTACK') {
      return `PERFORM:${cond.object}`;
    }
    const col = SKILL_OBJECT_TO_COLUMN[cond.object ?? ''] ?? cond.object;
    return `PERFORM:${col}`;
  }
  if (verb === 'APPLY' || verb === 'CONSUME' || verb === 'RECEIVE') {
    if (cond.objectId) {
      const col = statusNameToColumnId(cond.objectId);
      return `${verb}:${col}`;
    }
    // INFLICTION with element adjective → resolve to infliction column
    if (cond.object === 'INFLICTION' && cond.element) {
      const inflCol = ELEMENT_TO_INFLICTION[cond.element];
      if (inflCol) return `${verb}:${inflCol}`;
    }
    return `${verb}:${cond.object ?? '*'}`;
  }
  if (verb === 'IS' || verb === 'BECOME') {
    // Map state adjectives (COMBUSTED) to column IDs (combustion) for matching
    const stateCol = STATE_TO_COLUMN[cond.object ?? ''];
    return `${verb}:${stateCol ?? cond.object ?? '*'}`;
  }
  if (verb === 'DEAL') return 'DEAL:*';
  if (verb === 'RECOVER') return `RECOVER:${cond.object ?? '*'}`;
  // HIT/DEFEAT: index under the lowercase verb as column ID (user-placed events use 'hit'/'defeat')
  if (verb === 'HIT') return 'HIT:hit';
  if (verb === 'DEFEAT') return 'DEFEAT:defeat';
  return `${verb}:${cond.object ?? '*'}`;
}

/** Resolve generic category targets that a specific column ID belongs to. */
function resolveCategories(columnId: string): string[] {
  const categories: string[] = [];
  const reactionColumns = new Set<string>(Object.values(REACTION_COLUMNS));
  const inflictionColumns = new Set<string>(Object.values(INFLICTION_COLUMNS));
  if (reactionColumns.has(columnId)) categories.push('REACTION');
  if (inflictionColumns.has(columnId)) categories.push('INFLICTION');
  if (!reactionColumns.has(columnId) && !inflictionColumns.has(columnId)) categories.push('STATUS');
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
   * Searches all verb buckets for entries whose resolved target matches
   * the event's column ID. Handles generic category targets (REACTION,
   * INFLICTION, STATUS) matching specific column IDs.
   */
  matchEvent(columnId: string): readonly TriggerDefEntry[] {
    const results: TriggerDefEntry[] = [];
    // Resolve category for the column ID (e.g. 'combustion' → REACTION)
    const categories = resolveCategories(columnId);
    this.index.forEach((entries, key) => {
      const target = key.split(':')[1];
      if (target === columnId || target === '*' || categories.includes(target)) {
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
      for (const d of defs) events.push(d.talentEvent);
    });
    return events;
  }

  // ── Build ───────────────────────────────────────────────────────────────

  static build(
    slotOperatorMap?: Record<string, string>,
    loadoutProperties?: Record<string, LoadoutProperties>,
    slotWeapons?: Record<string, string | undefined>,
    slotGearSets?: Record<string, string | undefined>,
    registeredEvents?: readonly TimelineEvent[],
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
          if (skillNames.has(ev.name)) { operatorSlotMap[opId] = ev.ownerId; break; }
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

    // Process weapon defs
    if (slotWeapons) {
      for (const [slotId, weaponName] of Object.entries(slotWeapons)) {
        if (!weaponName) continue;
        const opId = slotOperatorMap?.[slotId] ?? '';
        idx.processDefsForSlot(slotId, opId, getWeaponEffectDefs(weaponName).map(normalizeEquipDef), true, loadoutProperties, operatorSlotMap, registeredEvents);
      }
    }

    // Process gear defs
    if (slotGearSets) {
      for (const [slotId, gearSetType] of Object.entries(slotGearSets)) {
        if (!gearSetType) continue;
        const opId = slotOperatorMap?.[slotId] ?? '';
        idx.processDefsForSlot(slotId, opId, getGearEffectDefs(gearSetType).map(normalizeEquipDef), true, loadoutProperties, operatorSlotMap, registeredEvents);
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
      if (def.properties.type === 'TALENT') {
        const talentDuration = def.properties.duration;
        const talentDurationFrames = talentDuration ? getDurationFrames(talentDuration) : TOTAL_FRAMES;
        const talentOwnerId = resolveTargetOwnerId(def.properties.target, slotId, opSlotMap, def.properties.targetDeterminer);
        const talentColumnId = statusNameToColumnId(def.properties.id);
        // Skip if already exists in registered events
        if (registeredEvents?.some(ev => ev.columnId === talentColumnId && ev.ownerId === talentOwnerId)) continue;

        const talentEvent: TimelineEvent = {
          uid: `${def.properties.id.toLowerCase()}-talent-${slotId}`,
          id: def.properties.id,
          name: def.properties.id,
          ownerId: talentOwnerId,
          columnId: talentColumnId,
          startFrame: 0,
          segments: durationSegment(talentDurationFrames),
          sourceOwnerId: slotId,
          sourceSkillName: def.properties.id,
        };

        const existing = this.talentsBySlot.get(slotId) ?? [];
        existing.push({ def, operatorId, operatorSlotId: slotId, talentEvent });
        this.talentsBySlot.set(slotId, existing);
      }

      // ── Lifecycle clauses (clause with HAVE conditions) ──────────────
      if (def.clause && Array.isArray(def.clause)) {
        for (const c of def.clause) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clause = c as any;
          const conditions = clause.conditions ?? [];
          const effects = clause.effects ?? [];
          const haveConds = conditions.filter((p: { verb?: string }) => p.verb === 'HAVE');
          if (haveConds.length > 0 && effects.length > 0) {
            // Resolve abstract STACKS → concrete STATUS conditions
            const maxStacks = def.properties.stacks?.limit
              ? getMaxStacks(def.properties.stacks.limit)
              : 1;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const resolvedConds = haveConds.map((cond: any) => {
              if (cond.object === 'STACKS') {
                return {
                  ...cond,
                  object: 'STATUS',
                  objectId: def.properties.id,
                  value: cond.value === 'MAX' ? { verb: 'IS', value: maxStacks } : cond.value,
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
      if (!hasEffects && !hasClauseEffects && def.properties.type !== 'TALENT') continue;

      for (const clause of def.onTriggerClause) {
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

        const primaryCond = clause.conditions.find(c => c.verb === primaryVerb)!;
        const haveConds = clause.conditions.filter((c: Predicate) => c.verb === 'HAVE');
        const secondaryConds = clause.conditions.filter(c => c !== primaryCond && c.verb !== 'HAVE');

        const key = resolveTriggerKey(primaryVerb, primaryCond);
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
        };

        const existing = this.index.get(key) ?? [];
        existing.push(entry);
        this.index.set(key, existing);
      }
    }
  }
}
