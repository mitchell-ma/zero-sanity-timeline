/**
 * CalculationController — owns all damage calculation state.
 *
 * Computes aggregated operator stats, status queries, and damage table rows.
 * The view layer (CombatSheet) receives pre-computed results and only handles
 * presentation (formatting, column visibility, rendering).
 */
import { CritMode, ElementType, PhysicalStatusType, StatType } from '../../consts/enums';
import { TimelineEvent, Column, Enemy as ViewEnemy } from '../../consts/viewTypes';
import { PHYSICAL_STATUS_COLUMN_IDS } from '../../model/channels';
import { getPhysicalStatusStagger } from '../../model/calculation/damageFormulas';
import { LoadoutProperties, DEFAULT_LOADOUT_PROPERTIES } from '../../view/InformationPane';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../../view/OperatorLoadoutHeader';
import { aggregateLoadoutStats } from './loadoutAggregator';
import { buildDamageTableRows, DamageTableRow } from './damageTableBuilder';
import {
  EventsQueryService,
  statToFragilityElements,
  type WeaponFragilityEffect,
  type OperatorTalentFragility,
} from '../timeline/eventsQueryService';
import { getLastController } from '../timeline/processInteractions';
import { getWeaponEffectDefs, resolveTargetDisplay } from '../../model/game-data/weaponGearEffectLoader';
import { INFLICTION_COLUMNS, OPERATOR_COLUMNS } from '../../model/channels';
import type { Slot } from '../timeline/columnBuilder';
import type { StaggerBreak } from '../timeline/staggerTimeline';

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
    if (!slot.operator || !slot.weaponName) continue;
    const defs = getWeaponEffectDefs(slot.weaponName);
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

/** Build operator talent fragility effects. */
export function buildTalentFragility(
  slots: Slot[],
  loadoutProperties: Record<string, LoadoutProperties>,
): OperatorTalentFragility[] {
  const effects: OperatorTalentFragility[] = [];
  for (const slot of slots) {
    if (!slot.operator) continue;
    const stats = loadoutProperties[slot.slotId];
    if (!stats) continue;
    if (slot.operator.id === 'xaihi' && stats.operator.talentOneLevel >= 1) {
      const bonus = stats.operator.talentOneLevel >= 2 ? 0.10 : 0.07;
      effects.push({ elements: [ElementType.CRYO], bonus, requiredColumnId: INFLICTION_COLUMNS.CRYO });
    }
    if (slot.operator.id === 'endministrator' && stats.operator.talentTwoLevel >= 1) {
      const bonus = stats.operator.talentTwoLevel >= 2 ? 0.20 : 0.10;
      effects.push({ elements: [ElementType.PHYSICAL], bonus, requiredColumnId: OPERATOR_COLUMNS.ORIGINIUM_CRYSTAL });
    }
  }
  return effects;
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
    loadoutProperties, loadouts, statusQuery, critMode,
  );

  return { aggregatedStats, statusQuery, rows };
}
