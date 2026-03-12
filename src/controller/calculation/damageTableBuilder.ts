/**
 * Damage table builder — controller that orchestrates damage calculation.
 *
 * Takes dumb model data (operator stats, enemy stats, skill multipliers)
 * and combines them into computed damage numbers for the dumb view.
 */
import { TimelineEvent, Column, MiniTimeline, Enemy as ViewEnemy } from '../../consts/viewTypes';
import { COMBAT_SKILL_LABELS } from '../../consts/channelLabels';
import { CombatSkillsType, CombatSkillType, ElementType, StatType, TimelineSourceType } from '../../consts/enums';
import { SkillLevel, Potential } from '../../consts/types';
import { getModelEnemy } from './enemyRegistry';
import { getSkillMultiplier } from './skillMultiplierRegistry';
import { aggregateLoadoutStats } from './loadoutAggregator';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../../view/OperatorLoadoutHeader';
import {
  calculateDamage,
  DamageParams,
  getAmpMultiplier,
  getAttributeBonus,
  getDamageBonus,
  getDefenseMultiplier,
  getElementDamageBonusStat,
  getExpectedCritMultiplier,
  getFragilityMultiplier,
  getLinkMultiplier,
  getResistanceMultiplier,
  getSkillTypeDamageBonusStat,
  getStaggerMultiplier,
  getSusceptibilityMultiplier,
  getTotalAttack,
} from '../../model/calculation/damageFormulas';
import { StatusQueryService } from './statusQueryService';
import { LoadoutStats, DEFAULT_LOADOUT_STATS } from '../../view/InformationPane';
import type { Slot } from '../timeline/columnBuilder';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single row in the damage calculation table — one per frame tick. */
export interface DamageTableRow {
  key: string;
  absoluteFrame: number;
  label: string;
  columnKey: string;
  ownerId: string;
  columnId: string;
  eventId: string;
  segmentIndex: number;
  frameIndex: number;
  /** Computed expected damage (crit-averaged). Null if multiplier data unavailable. */
  damage: number | null;
  /** Skill multiplier used for this tick. Null if unavailable. */
  multiplier: number | null;
  /** Segment label (e.g. "1", "2") for multiplier lookup. */
  segmentLabel: string | undefined;
  /** Skill name (CombatSkillsType) for this tick. */
  skillName: string;
  /** Remaining boss HP after this tick's damage (can go negative). Null if HP unknown. */
  hpRemaining: number | null;
  /** Full damage calculation parameters. Null if damage could not be computed. */
  params: DamageParams | null;
}

/** Column descriptor for the damage table header. */
export interface DamageTableColumn {
  key: string;
  label: string;
  ownerId: string;
  columnId: string;
  color: string;
}

/** Per-column damage statistics. */
export interface ColumnDamageStats {
  columnKey: string;
  totalDamage: number;
  /** Percentage of operator's total damage. */
  operatorPct: number;
  /** Percentage of team's total damage. */
  teamPct: number;
}

/** Per-operator damage statistics. */
export interface OperatorDamageStats {
  ownerId: string;
  totalDamage: number;
  /** Percentage of team total. */
  teamPct: number;
  /** Per-column breakdown. */
  columns: ColumnDamageStats[];
}

/** Team-wide damage statistics. */
export interface DamageStatistics {
  teamTotalDamage: number;
  operators: OperatorDamageStats[];
  /** Quick lookup: columnKey → totalDamage. */
  columnTotals: Map<string, number>;
  /** Boss max HP (null if enemy has no HP data). */
  bossMaxHp: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEventDisplayName(name: string): string {
  return COMBAT_SKILL_LABELS[name as CombatSkillsType] ?? name;
}

function isUltEnhanced(name: string): boolean {
  return name.includes('_ENHANCED');
}

/** Map columnId to the CombatSkillType enum for damage bonus lookup. */
function columnIdToSkillType(columnId: string): CombatSkillType {
  switch (columnId) {
    case 'basic': return CombatSkillType.BASIC_ATTACK;
    case 'battle': return CombatSkillType.BATTLE_SKILL;
    case 'combo': return CombatSkillType.COMBO_SKILL;
    case 'ultimate': return CombatSkillType.ULTIMATE;
    default: return CombatSkillType.BASIC_ATTACK;
  }
}

/** Map columnId to the skill level field in LoadoutStats. */
function getSkillLevel(columnId: string, stats: LoadoutStats): SkillLevel {
  switch (columnId) {
    case 'basic': return stats.basicAttackLevel as SkillLevel;
    case 'battle': return stats.battleSkillLevel as SkillLevel;
    case 'combo': return stats.comboSkillLevel as SkillLevel;
    case 'ultimate': return stats.ultimateLevel as SkillLevel;
    default: return 12 as SkillLevel;
  }
}

// ── Cached model data per operator ───────────────────────────────────────────

interface OperatorCalcData {
  totalAttack: number;
  attributeBonus: number;
  critRate: number;
  critDamage: number;
  stats: Record<StatType, number>;
  element: ElementType;
}

function buildOperatorCalcData(
  operatorId: string,
  loadout: OperatorLoadoutState,
  stats: LoadoutStats,
): OperatorCalcData | null {
  const agg = aggregateLoadoutStats(operatorId, loadout, stats);
  if (!agg) return null;

  const totalAttack = getTotalAttack(
    agg.operatorBaseAttack,
    agg.weaponBaseAttack,
    agg.stats[StatType.ATTACK_BONUS],
    agg.flatAttackBonuses,
  );
  const attributeBonus = getAttributeBonus(
    agg.stats[agg.mainAttributeType],
    agg.stats[agg.secondaryAttributeType],
  );

  return {
    totalAttack,
    attributeBonus,
    critRate: Math.min(Math.max(agg.stats[StatType.CRITICAL_RATE], 0), 1),
    critDamage: agg.stats[StatType.CRITICAL_DAMAGE],
    stats: agg.stats,
    element: agg.element,
  };
}

// ── Main builder functions ───────────────────────────────────────────────────

/**
 * Build damage table rows from timeline events.
 * Computes actual damage using operator stats, enemy stats, and skill multipliers.
 */
export function buildDamageTableRows(
  events: TimelineEvent[],
  columns: Column[],
  slots: Slot[],
  enemy: ViewEnemy,
  loadoutStats: Record<string, LoadoutStats>,
  loadouts?: Record<string, OperatorLoadoutState>,
  statusQuery?: StatusQueryService,
): DamageTableRow[] {
  const rows: DamageTableRow[] = [];

  // Build column lookup: ownerId-columnId → Column
  const colLookup = new Map<string, MiniTimeline>();
  for (const col of columns) {
    if (col.type === 'mini-timeline' && col.source === TimelineSourceType.OPERATOR) {
      colLookup.set(`${col.ownerId}-${col.columnId}`, col);
    }
  }

  // Build operator data cache: slotId → calc data
  const opCache = new Map<string, OperatorCalcData | null>();
  const opIdCache = new Map<string, string | null>(); // slotId → operatorId
  for (const slot of slots) {
    if (!slot.operator) {
      opCache.set(slot.slotId, null);
      opIdCache.set(slot.slotId, null);
      continue;
    }
    const slotLoadout = loadouts?.[slot.slotId] ?? EMPTY_LOADOUT;
    const slotStats = loadoutStats[slot.slotId] ?? DEFAULT_LOADOUT_STATS;
    const data = buildOperatorCalcData(slot.operator.id, slotLoadout, slotStats);
    opCache.set(slot.slotId, data);
    opIdCache.set(slot.slotId, slot.operator.id);
  }

  // Get model enemy for DEF/resistance/HP
  const modelEnemy = getModelEnemy(enemy.id);
  const enemyDef = modelEnemy ? modelEnemy.getDef() : 100;
  const defMultiplier = getDefenseMultiplier(enemyDef);
  const bossMaxHp = modelEnemy ? modelEnemy.getHp() : null;

  for (const ev of events) {
    const effectiveColumnId = isUltEnhanced(ev.name) ? 'ultimate' : ev.columnId;
    const col = colLookup.get(`${ev.ownerId}-${effectiveColumnId}`)
      ?? colLookup.get(`${ev.ownerId}-${ev.columnId}`);
    if (!col) continue;

    const eventName = getEventDisplayName(ev.name);
    const opData = opCache.get(ev.ownerId);
    const operatorId = opIdCache.get(ev.ownerId);
    const stats = loadoutStats[ev.ownerId] ?? DEFAULT_LOADOUT_STATS;
    const skillLevel = getSkillLevel(effectiveColumnId, stats);
    const potential = (stats.potential ?? 5) as Potential;

    if (ev.segments && ev.segments.length > 0) {
      let segmentFrameOffset = 0;
      for (let si = 0; si < ev.segments.length; si++) {
        const seg = ev.segments[si];
        const segLabel = seg.label ?? `Seg ${si + 1}`;

        if (seg.frames) {
          for (let fi = 0; fi < seg.frames.length; fi++) {
            const frame = seg.frames[fi];
            const absFrame = frame.absoluteFrame ?? (ev.startFrame + segmentFrameOffset + frame.offsetFrame);

            // Look up multiplier
            let multiplier: number | null = null;
            let damage: number | null = null;
            let params: DamageParams | null = null;

            if (operatorId && opData) {
              multiplier = getSkillMultiplier(
                operatorId,
                ev.name as CombatSkillsType,
                seg.label,
                skillLevel,
                potential,
              );

              if (multiplier != null && multiplier > 0) {
                // Get element from frame marker or skill column
                const frameElement = frame.damageElement
                  ?? frame.applyArtsInfliction?.element
                  ?? col.skillElement;
                const element = (frameElement as ElementType) ?? opData.element;

                // Damage bonus group
                const elementBonusStat = getElementDamageBonusStat(element);
                const skillType = columnIdToSkillType(effectiveColumnId);
                const skillTypeBonusStat = getSkillTypeDamageBonusStat(skillType);
                const isArts = element !== ElementType.PHYSICAL && element !== ElementType.NONE;
                const multiplierGroup = getDamageBonus(
                  opData.stats[elementBonusStat],
                  opData.stats[skillTypeBonusStat],
                  opData.stats[StatType.SKILL_DAMAGE_BONUS],
                  isArts ? opData.stats[StatType.ARTS_DAMAGE_BONUS] : 0,
                );

                // Resistance
                const resMultiplier = modelEnemy
                  ? getResistanceMultiplier(modelEnemy, element)
                  : 1;

                // Expected crit multiplier
                const expectedCrit = getExpectedCritMultiplier(opData.critRate, opData.critDamage);

                params = {
                  attack: opData.totalAttack,
                  baseMultiplier: multiplier,
                  attributeBonus: opData.attributeBonus,
                  multiplierGroup,
                  critMultiplier: expectedCrit,
                  ampMultiplier: getAmpMultiplier(statusQuery?.isArtsAmpActive(absFrame) ? 0.15 : 0), // TODO: read amp bonus from operator ult skill level instead of 0.15 placeholder
                  staggerMultiplier: getStaggerMultiplier(statusQuery?.isStaggered(absFrame) ?? false),
                  finisherMultiplier: 1, // TODO: wire up finisher detection (final strike + enemy tier)
                  linkMultiplier: getLinkMultiplier(0.15, statusQuery?.isLinkActive(absFrame) ?? false), // TODO: read link bonus from operator ult skill level instead of 0.15 placeholder
                  weakenMultiplier: 1, // TODO: wire up weaken status events
                  susceptibilityMultiplier: getSusceptibilityMultiplier(statusQuery?.getSusceptibilityBonus(absFrame, element) ?? 0),
                  fragilityMultiplier: getFragilityMultiplier(statusQuery?.getFragilityBonus(absFrame) ?? 0),
                  dmgReductionMultiplier: 1, // TODO: wire up damage reduction status events
                  protectionMultiplier: 1, // TODO: wire up protection status events
                  defenseMultiplier: defMultiplier,
                  resistanceMultiplier: resMultiplier,
                };

                damage = Math.floor(calculateDamage(params));
              }
            }

            rows.push({
              key: `${ev.id}-s${si}-f${fi}`,
              absoluteFrame: absFrame,
              label: `${eventName} > ${segLabel} > Tick ${fi + 1}`,
              columnKey: col.key,
              ownerId: ev.ownerId,
              columnId: effectiveColumnId,
              eventId: ev.id,
              segmentIndex: si,
              frameIndex: fi,
              damage,
              multiplier,
              segmentLabel: seg.label,
              skillName: ev.name,
              hpRemaining: null, // computed after sorting
              params,
            });
          }
        }
        segmentFrameOffset += seg.durationFrames;
      }
    }
  }

  rows.sort((a, b) => a.absoluteFrame - b.absoluteFrame || a.label.localeCompare(b.label));

  // Compute cumulative boss HP remaining
  if (bossMaxHp != null) {
    let cumDamage = 0;
    for (const row of rows) {
      if (row.damage != null) cumDamage += row.damage;
      row.hpRemaining = bossMaxHp - cumDamage;
    }
  }

  return rows;
}

/**
 * Build the column descriptors for the damage table.
 * Returns only operator skill columns (no common, no enemy, no placeholders, no derived).
 */
export function buildDamageTableColumns(columns: Column[]): DamageTableColumn[] {
  const result: DamageTableColumn[] = [];
  for (const col of columns) {
    if (col.type !== 'mini-timeline') continue;
    if (col.source !== TimelineSourceType.OPERATOR) continue;
    if ((col as MiniTimeline).derived) continue;
    result.push({
      key: col.key,
      label: col.label,
      ownerId: col.ownerId,
      columnId: col.columnId,
      color: col.color,
    });
  }
  return result;
}

/**
 * Compute damage statistics from calculated rows.
 */
export function computeDamageStatistics(
  rows: DamageTableRow[],
  tableColumns: DamageTableColumn[],
  bossMaxHp?: number | null,
): DamageStatistics {
  // Aggregate per-column totals
  const columnTotals = new Map<string, number>();
  for (const col of tableColumns) {
    columnTotals.set(col.key, 0);
  }
  for (const row of rows) {
    if (row.damage != null) {
      columnTotals.set(row.columnKey, (columnTotals.get(row.columnKey) ?? 0) + row.damage);
    }
  }

  // Team total
  let teamTotalDamage = 0;
  columnTotals.forEach((total) => { teamTotalDamage += total; });

  // Per-operator stats
  const operatorMap = new Map<string, { total: number; columns: Array<[string, number]> }>();
  for (const col of tableColumns) {
    if (!operatorMap.has(col.ownerId)) {
      operatorMap.set(col.ownerId, { total: 0, columns: [] });
    }
    const colTotal = columnTotals.get(col.key) ?? 0;
    const opEntry = operatorMap.get(col.ownerId)!;
    opEntry.total += colTotal;
    opEntry.columns.push([col.key, colTotal]);
  }

  const operators: OperatorDamageStats[] = [];
  operatorMap.forEach((data, ownerId) => {
    const columns: ColumnDamageStats[] = [];
    for (const [colKey, colTotal] of data.columns) {
      columns.push({
        columnKey: colKey,
        totalDamage: colTotal,
        operatorPct: data.total > 0 ? colTotal / data.total : 0,
        teamPct: teamTotalDamage > 0 ? colTotal / teamTotalDamage : 0,
      });
    }
    operators.push({
      ownerId,
      totalDamage: data.total,
      teamPct: teamTotalDamage > 0 ? data.total / teamTotalDamage : 0,
      columns,
    });
  });

  return { teamTotalDamage, operators, columnTotals, bossMaxHp: bossMaxHp ?? null };
}
