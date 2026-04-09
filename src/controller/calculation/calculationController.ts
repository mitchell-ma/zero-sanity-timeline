/**
 * CalculationController — owns all damage calculation state.
 *
 * Computes aggregated operator stats, status queries, and damage table rows.
 * The view layer (CombatSheet) receives pre-computed results and only handles
 * presentation (formatting, column visibility, rendering).
 *
 * Also exports the per-frame damage helpers (`computeFrameMarkerDamage`,
 * `buildDamageOpCache`) used by the interpreter to push incremental
 * enemy damage ticks to `hpController` during the queue drain.
 */
import { CritMode, DamageScalingStatType, PhysicalStatusType, StatType } from '../../consts/enums';
import type { OverrideStore } from '../../consts/overrideTypes';
import { NounType } from '../../dsl/semantics';
import type { ValueNode } from '../../dsl/semantics';
import { resolveValueNode } from './valueResolver';
import { TimelineEvent, Column, Enemy as ViewEnemy } from '../../consts/viewTypes';
import { PHYSICAL_STATUS_COLUMN_IDS } from '../../model/channels';
import { getPhysicalStatusStagger, getTotalAttack } from '../../model/calculation/damageFormulas';
import { LoadoutProperties, DEFAULT_LOADOUT_PROPERTIES } from '../../view/InformationPane';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../../view/OperatorLoadoutHeader';
import { aggregateLoadoutStats } from './loadoutAggregator';
import { buildDealStaggerClause, stripStaggerClauses, findDealDamageInClauses, hasDealDamageClause } from '../timeline/clauseQueries';
import { buildDamageTableRows, DamageTableRow } from './damageTableBuilder';
import { getSkillMultiplier } from './jsonMultiplierEngine';
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

// HP tracking flows through `hpController` via incremental
// `addEnemyDamageTick` calls during the queue drain. The legacy global
// fallback (_bossMaxHp, _damageTicks, initHpTracker, global
// getEnemyHpPercentage, precomputeDamageByFrame) was deleted.

/** Per-operator static data used by the simplified damage formula. */
export interface DamageOpData {
  totalAttack: number;
  totalDefense: number;
  effectiveHp: number;
  attributeBonus: number;
  operatorId: string;
}

/** Build the per-slot operator data cache from loadouts. Called once per pipeline run. */
export function buildDamageOpCache(
  slots: readonly { slotId: string; operatorId?: string }[],
  loadoutProperties: Record<string, LoadoutProperties>,
  loadouts: Record<string, OperatorLoadoutState> | undefined,
): Map<string, DamageOpData> {
  const opData = new Map<string, DamageOpData>();
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
    opData.set(slot.slotId, {
      totalAttack,
      totalDefense: agg.totalDefense,
      effectiveHp: agg.effectiveHp,
      attributeBonus: agg.attributeBonus,
      operatorId: slot.operatorId,
    });
  }
  return opData;
}

/**
 * Compute simplified damage for a single frame marker on a skill event.
 *
 * Called from `handleProcessFrame` per damage frame during the queue drain
 * to feed `hpController.addEnemyDamageTick`. Formula:
 * `mainStat × multiplier × attributeBonus × defenseMultiplier`. Uses
 * static loadout stats — runtime stat buffs / fragility / crit are
 * intentionally excluded to match HP-threshold behavior (the damage table
 * builder uses the full formula separately for display).
 *
 * Returns undefined when the frame has no damage multiplier.
 */
export function computeFrameMarkerDamage(
  ev: TimelineEvent,
  segmentIdx: number,
  frameIdx: number,
  damageSegIdx: number,
  op: DamageOpData,
  defMult: number,
  skillLevel: SkillLevel,
  potential: Potential,
): number | undefined {
  const seg = ev.segments[segmentIdx];
  if (!seg.frames) return undefined;
  const f = seg.frames[frameIdx];
  if (!f) return undefined;
  const maxFrames = seg.frames.length;
  let multiplier: number | null = null;
  const dealInfo = findDealDamageInClauses(f.clauses);
  if (dealInfo && dealInfo.multipliers.length > 0) {
    const idx = Math.min(skillLevel - 1, dealInfo.multipliers.length - 1);
    multiplier = dealInfo.multipliers[idx];
  } else if (dealInfo?.multiplierNode) {
    const resolved = resolveValueNode(dealInfo.multiplierNode as ValueNode, { skillLevel, potential, stats: {} });
    if (resolved != null && resolved > 0) multiplier = resolved;
  } else {
    const segMult = getSkillMultiplier(op.operatorId, ev.id, damageSegIdx, skillLevel, potential);
    if (segMult != null) {
      multiplier = maxFrames > 1 ? segMult / maxFrames : segMult;
    }
  }
  if (multiplier == null || multiplier <= 0) return undefined;
  const mainStatValue = dealInfo?.mainStat === DamageScalingStatType.DEFENSE ? op.totalDefense
    : dealInfo?.mainStat === DamageScalingStatType.HP ? op.effectiveHp
    : op.totalAttack;
  return mainStatValue * multiplier * op.attributeBonus * defMult;
}

/** Skill level lookup by column ID. */
export function getSkillLevelForColumn(columnId: string, props: LoadoutProperties): SkillLevel {
  switch (columnId) {
    case NounType.BASIC_ATTACK: return props.skills.basicAttackLevel as SkillLevel;
    case NounType.BATTLE: return props.skills.battleSkillLevel as SkillLevel;
    case NounType.COMBO: return props.skills.comboSkillLevel as SkillLevel;
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
        if (hasDealDamageClause(frame.clauses)) {
          // Replace any existing DEAL STAGGER clause with the runtime-resolved
          // value (depends on the source operator's arts intensity).
          const stripped = stripStaggerClauses(frame.clauses);
          frame.clauses = [...(stripped ?? []), buildDealStaggerClause(stagger)];
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
let _calculationEnabled = true;
let _cachedResult: CalculationResult | null = null;

/** Enable or disable the damage calculation pipeline. When disabled, returns cached/empty results. */
export function setCalculationEnabled(enabled: boolean) { _calculationEnabled = enabled; }
export function isCalculationEnabled() { return _calculationEnabled; }

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
  if (!_calculationEnabled) {
    return _cachedResult ?? { aggregatedStats: {}, statusQuery: undefined as unknown as EventsQueryService, rows: [] };
  }
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

  const result = { aggregatedStats, statusQuery, rows };
  _cachedResult = result;
  return result;
}
