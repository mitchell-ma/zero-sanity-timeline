/**
 * CalculationController — owns all damage calculation state.
 *
 * Computes aggregated operator stats, status queries, and damage table rows.
 * The view layer (CombatSheet) receives pre-computed results and only handles
 * presentation (formatting, column visibility, rendering).
 *
 * Also provides live HP% tracking during event queue processing: pre-computes
 * estimated damage per frame from registered skill events, stores cumulative
 * damage by frame, and exposes getEnemyHpPercentage() for HP threshold predicates.
 */
import { CritMode, CombatSkillType, DamageScalingStatType, PhysicalStatusType, StatType } from '../../consts/enums';
import type { OverrideStore } from '../../consts/overrideTypes';
import { NounType } from '../../dsl/semantics';
import { TimelineEvent, Column, Enemy as ViewEnemy } from '../../consts/viewTypes';
import { PHYSICAL_STATUS_COLUMN_IDS, SKILL_COLUMN_ORDER, ENEMY_OWNER_ID } from '../../model/channels';
import { getPhysicalStatusStagger, getDefenseMultiplier, getTotalAttack } from '../../model/calculation/damageFormulas';
import { LoadoutProperties, DEFAULT_LOADOUT_PROPERTIES } from '../../view/InformationPane';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../../view/OperatorLoadoutHeader';
import { aggregateLoadoutStats } from './loadoutAggregator';
import { buildDamageTableRows, DamageTableRow } from './damageTableBuilder';
import { getSkillMultiplier } from './jsonMultiplierEngine';
import { getModelEnemy } from './enemyRegistry';
import {
  EventsQueryService,
  statToFragilityElements,
  type WeaponFragilityEffect,
  type OperatorTalentFragility,
} from '../timeline/eventsQueryService';
import { getLastController } from '../timeline/eventQueueController';
import { getWeapon, getWeaponEffectDefs, resolveTargetDisplay } from '../gameDataStore';

import type { Slot } from '../timeline/columnBuilder';
import type { StaggerBreak } from '../timeline/staggerTimeline';
import type { Potential, SkillLevel } from '../../consts/types';

// ── Frame-indexed HP tracker ─────────────────────────────────────────────────

/**
 * Pre-computed damage by frame for live HP% queries during event queue processing.
 *
 * Before the queue runs, `precomputeDamageByFrame()` scans registered events,
 * computes estimated damage per frame tick (ATK × multiplier × attributeBonus ×
 * defenseMultiplier), and builds a sorted cumulative damage timeline.
 *
 * `getEnemyHpPercentage(frame)` returns the HP% at any frame via binary search.
 */
let _bossMaxHp: number | null = null;
/** Sorted (frame, cumDamage) pairs. */
let _damageTicks: { frame: number; cumDamage: number }[] = [];

/** Initialize the HP tracker before the event queue runs. */
export function initHpTracker(bossMaxHp: number | null) {
  _bossMaxHp = bossMaxHp;
  _damageTicks = [];
}

/**
 * Pre-compute estimated damage per frame from registered skill events.
 * Uses a simplified formula: ATK × multiplier × attributeBonus × defenseMultiplier.
 * Stores cumulative damage sorted by frame for O(log n) HP% lookups.
 */
export function precomputeDamageByFrame(
  events: readonly TimelineEvent[],
  slots: readonly { slotId: string; operatorId?: string }[],
  loadoutProperties: Record<string, LoadoutProperties>,
  loadouts: Record<string, OperatorLoadoutState> | undefined,
  enemyId: string,
  hpController?: import('./hpController').HPController,
) {
  if (!hpController && _bossMaxHp == null) return;

  const modelEnemy = getModelEnemy(enemyId);
  const enemyDef = modelEnemy ? modelEnemy.getDef() : 100;
  const defMult = getDefenseMultiplier(enemyDef);

  // Build operator data cache: slotId → { totalAttack, totalDefense, effectiveHp, attributeBonus, operatorId }
  const opData = new Map<string, { totalAttack: number; totalDefense: number; effectiveHp: number; attributeBonus: number; operatorId: string }>();
  for (const slot of slots) {
    if (!slot.operatorId) continue;
    const props = loadoutProperties[slot.slotId] ?? DEFAULT_LOADOUT_PROPERTIES;
    const loadout = loadouts?.[slot.slotId] ?? EMPTY_LOADOUT;
    const agg = aggregateLoadoutStats(slot.operatorId, loadout, props);
    if (!agg) continue;
    const totalAttack = getTotalAttack(
      agg.operatorBaseAttack, agg.weaponBaseAttack,
      agg.stats[StatType.ATTACK_BONUS], agg.flatAttackBonuses,
    );
    opData.set(slot.slotId, { totalAttack, totalDefense: agg.totalDefense, effectiveHp: agg.effectiveHp, attributeBonus: agg.attributeBonus, operatorId: slot.operatorId });
  }

  // Collect (frame, damage) pairs from all skill event frame markers
  const ticks: { frame: number; damage: number }[] = [];
  const SKILL_COLUMN_IDS = new Set<string>(SKILL_COLUMN_ORDER);

  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID) continue;
    if (!SKILL_COLUMN_IDS.has(ev.columnId)) continue;
    const op = opData.get(ev.ownerId);
    if (!op) continue;

    const props = loadoutProperties[ev.ownerId] ?? DEFAULT_LOADOUT_PROPERTIES;
    const effectiveColumnId = ev.id.includes('_ENHANCED') ? NounType.ULTIMATE : ev.columnId;
    const skillLevel = getSkillLevelForColumn(effectiveColumnId, props);
    const potential = (props.operator.potential ?? 5) as Potential;

    let segOffset = 0;
    for (let si = 0; si < ev.segments.length; si++) {
      const seg = ev.segments[si];
      if (seg.frames) {
        const maxFrames = seg.frames.length;
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const f = seg.frames[fi];
          const absFrame = f.absoluteFrame ?? (ev.startFrame + segOffset + f.offsetFrame);

          let multiplier: number | null = null;

          // Inline DEAL DAMAGE multiplier
          if (f.dealDamage && f.dealDamage.multipliers.length > 0) {
            const idx = Math.min(skillLevel - 1, f.dealDamage.multipliers.length - 1);
            multiplier = f.dealDamage.multipliers[idx];
          } else {
            // Segment multiplier divided by frame count
            const segMult = getSkillMultiplier(op.operatorId, ev.name as CombatSkillType, si, skillLevel, potential);
            if (segMult != null) {
              multiplier = maxFrames > 1 ? segMult / maxFrames : segMult;
            }
          }

          if (multiplier != null && multiplier > 0) {
            const mainStatValue = f.dealDamage?.mainStat === DamageScalingStatType.DEFENSE ? op.totalDefense
              : f.dealDamage?.mainStat === DamageScalingStatType.HP ? op.effectiveHp
              : op.totalAttack;
            const damage = mainStatValue * multiplier * op.attributeBonus * defMult;
            ticks.push({ frame: absFrame, damage });
          }
        }
      }
      segOffset += seg.properties.duration;
    }
  }

  // Sort by frame and build cumulative
  if (hpController) {
    hpController.setEnemyDamageTicks(ticks);
  } else {
    ticks.sort((a, b) => a.frame - b.frame);
    let cum = 0;
    _damageTicks = ticks.map(t => {
      cum += t.damage;
      return { frame: t.frame, cumDamage: cum };
    });
  }
}

/**
 * Get enemy HP as a percentage (0–100) at the given frame.
 * Uses binary search on pre-computed cumulative damage.
 * Returns null if no boss HP configured.
 */
export function getEnemyHpPercentage(frame: number): number | null {
  if (_bossMaxHp == null || _bossMaxHp <= 0) return null;
  if (_damageTicks.length === 0) return 100;

  // Binary search: find last tick at or before `frame`
  let lo = 0;
  let hi = _damageTicks.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (_damageTicks[mid].frame <= frame) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const cumDamage = result >= 0 ? _damageTicks[result].cumDamage : 0;
  return Math.max(0, (_bossMaxHp - cumDamage) / _bossMaxHp * 100);
}

/** Skill level lookup by column ID. */
function getSkillLevelForColumn(columnId: string, props: LoadoutProperties): SkillLevel {
  switch (columnId) {
    case NounType.BASIC_ATTACK: return props.skills.basicAttackLevel as SkillLevel;
    case NounType.BATTLE_SKILL: return props.skills.battleSkillLevel as SkillLevel;
    case NounType.COMBO_SKILL: return props.skills.comboSkillLevel as SkillLevel;
    case NounType.ULTIMATE: return props.skills.ultimateLevel as SkillLevel;
    default: return 12 as SkillLevel;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CalculationResult {
  /** Pre-computed aggregated stats per slot. */
  aggregatedStats: Record<string, { stats: Record<StatType, number> }>;
  /** Status query service for frame-based lookups. */
  statusQuery: EventsQueryService;
  /** Computed damage table rows (one per frame tick). */
  rows: DamageTableRow[];
}

// ── Aggregation helpers ──────────────────────────────────────────────────────

/** Build aggregated operator stats per slot (ATK, crit, Arts Intensity, etc.). */
export function buildAggregatedStats(
  slots: Slot[],
  loadoutProperties: Record<string, LoadoutProperties>,
  loadouts?: Record<string, OperatorLoadoutState>,
): Record<string, { stats: Record<StatType, number> }> {
  const result: Record<string, { stats: Record<StatType, number> }> = {};
  for (const slot of slots) {
    if (!slot.operator) continue;
    const slotLoadout = loadouts?.[slot.slotId] ?? EMPTY_LOADOUT;
    const slotStats = loadoutProperties[slot.slotId] ?? DEFAULT_LOADOUT_PROPERTIES;
    const agg = aggregateLoadoutStats(slot.operator.id, slotLoadout, slotStats);
    if (agg) {
      result[slot.slotId] = { stats: agg.stats };
    }
  }
  return result;
}

/** Build weapon fragility effects per slot. */
export function buildWeaponFragility(
  slots: Slot[],
): Record<string, WeaponFragilityEffect[]> {
  const result: Record<string, WeaponFragilityEffect[]> = {};
  for (const slot of slots) {
    if (!slot.operator || !slot.weaponId) continue;
    const weaponDisplayName = getWeapon(slot.weaponId)?.name;
    if (!weaponDisplayName) continue;
    const defs = getWeaponEffectDefs(weaponDisplayName);
    if (defs.length === 0) continue;
    const effects: WeaponFragilityEffect[] = [];
    for (const def of defs) {
      if (resolveTargetDisplay(def) !== 'enemy') continue;
      for (const buff of (def.buffs ?? [])) {
        const elements = statToFragilityElements(buff.stat as string);
        if (elements) {
          effects.push({ elements, bonus: buff.valueMax ?? buff.value ?? 0 });
        }
      }
    }
    if (effects.length > 0) {
      result[slot.slotId] = effects;
    }
  }
  return result;
}

/** Build operator talent fragility effects — stub, to be data-driven from operator configs. */
export function buildTalentFragility(
  _slots: Slot[],
  _loadoutProperties: Record<string, LoadoutProperties>,
): OperatorTalentFragility[] {
  return [];
}

// ── Physical status stagger resolution ────────────────────────────────────────

/**
 * Resolve stagger values on physical status events (Lift, Knock Down, etc.).
 *
 * Physical status stagger depends on the source operator's Arts Intensity,
 * which is only available after stat aggregation. This pass enriches the
 * frame markers with the computed stagger value.
 */
function resolvePhysicalStatusStagger(
  events: TimelineEvent[],
  aggregatedStats: Record<string, { stats: Record<string, number> }>,
): void {
  for (const ev of events) {
    if (!PHYSICAL_STATUS_COLUMN_IDS.has(ev.columnId)) continue;
    if (!ev.sourceOwnerId) continue;

    const artsIntensity = aggregatedStats[ev.sourceOwnerId]?.stats[StatType.ARTS_INTENSITY] ?? 0;
    const stagger = getPhysicalStatusStagger(ev.columnId as PhysicalStatusType, artsIntensity);
    if (stagger === 0) continue;

    for (const seg of ev.segments) {
      if (!seg.frames) continue;
      for (const frame of seg.frames) {
        if (frame.damageMultiplier != null) {
          frame.staggerValue = stagger;
        }
      }
    }
  }
}

// ── Main calculation entry point ─────────────────────────────────────────────

/**
 * Run the full damage calculation pipeline.
 *
 * 1. Aggregate operator stats (ATK, crit, Arts Intensity, etc.)
 * 2. Build weapon/talent fragility effects
 * 3. Create EventsQueryService for frame-based status lookups
 * 4. Build damage table rows with all sub-components resolved
 */
export function runCalculation(
  events: TimelineEvent[],
  columns: Column[],
  slots: Slot[],
  enemy: ViewEnemy,
  loadoutProperties: Record<string, LoadoutProperties>,
  loadouts?: Record<string, OperatorLoadoutState>,
  staggerBreaks?: readonly StaggerBreak[],
  critMode?: CritMode,
  overrides?: OverrideStore,
): CalculationResult {
  const aggregatedStats = buildAggregatedStats(slots, loadoutProperties, loadouts);
  const weaponFragility = buildWeaponFragility(slots);
  const talentFragility = buildTalentFragility(slots, loadoutProperties);

  // Resolve stagger values on physical status events using aggregated Arts Intensity
  resolvePhysicalStatusStagger(events, aggregatedStats);

  const statusQuery = new EventsQueryService(
    getLastController(),
    staggerBreaks ?? [],
    loadoutProperties,
    aggregatedStats,
    weaponFragility,
    talentFragility,
  );

  const rows = buildDamageTableRows(
    events, columns, slots, enemy,
    loadoutProperties, loadouts, statusQuery, critMode, overrides,
  );

  return { aggregatedStats, statusQuery, rows };
}
