/**
 * Damage table builder — controller that orchestrates damage calculation.
 *
 * Takes dumb model data (operator stats, enemy stats, skill multipliers)
 * and combines them into computed damage numbers for the dumb view.
 */
import { TimelineEvent, Column, MiniTimeline, Enemy as ViewEnemy } from '../../consts/viewTypes';
import { COMBAT_SKILL_LABELS } from '../../consts/timelineColumnLabels';
import { CombatSkillType, CritMode, DamageType, ElementType, EnemyTierType, StatType, TimelineSourceType } from '../../consts/enums';
import { SkillLevel, Potential } from '../../consts/types';
import { StatusDamageParams } from '../../model/calculation/damageFormulas';
import { getModelEnemy } from './enemyRegistry';
import { getSkillMultiplier, getFrameMultiplier } from './jsonMultiplierEngine';
import { aggregateLoadoutStats } from './loadoutAggregator';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../../view/OperatorLoadoutHeader';
import {
  calculateDamage,
  DamageParams,
  DamageSubComponents,
  getAmpMultiplier,
  getCritMultiplier,
  getDamageBonus,
  getDefenseMultiplier,
  getDmgReductionMultiplier,
  getElementDamageBonusStat,
  getExpectedCritMultiplier,
  getFinisherMultiplier,
  getFragilityMultiplier,
  getLinkMultiplier,
  getProtectionMultiplier,
  getResistanceMultiplier,
  getSkillTypeDamageBonusStat,
  getStaggerMultiplier,
  getSusceptibilityMultiplier,
  getTotalAttack,
  getWeakenMultiplier,
} from '../../model/calculation/damageFormulas';
import { EventsQueryService } from '../timeline/eventsQueryService';
import { LoadoutProperties, DEFAULT_LOADOUT_PROPERTIES } from '../../view/InformationPane';
import type { Slot } from '../timeline/columnBuilder';
import { ENEMY_OWNER_ID, OPERATOR_COLUMNS, REACTION_COLUMN_IDS, SKILL_COLUMNS } from '../../model/channels';
import { buildReactionDamageRows, ReactionOperatorContext } from './artsReactionController';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single row in the damage calculation table — one per frame tick. */
export interface DamageTableRow {
  key: string;
  absoluteFrame: number;
  label: string;
  columnKey: string;
  ownerId: string;
  columnId: string;
  eventUid: string;
  segmentIndex: number;
  frameIndex: number;
  /** Computed expected damage (crit-averaged). Null if multiplier data unavailable. */
  damage: number | null;
  /** Skill multiplier used for this tick. Null if unavailable. */
  multiplier: number | null;
  /** Segment label (e.g. "1", "2") for multiplier lookup. */
  segmentLabel: string | undefined;
  /** Skill name (CombatSkillType) for this tick. */
  skillName: string;
  /** Remaining boss HP after this tick's damage (can go negative). Null if HP unknown. */
  hpRemaining: number | null;
  /** Full damage calculation parameters. Null if damage could not be computed. */
  params: DamageParams | null;
  /** Status/reaction damage parameters. Null for normal skill hits. */
  statusParams?: StatusDamageParams | null;
  /** Damage type: NORMAL or DAMAGE_OVER_TIME. DOT cannot crit. */
  damageType?: DamageType;
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
  /** Highest single-tick damage across all rows. */
  highestTick: { damage: number; label: string; ownerId: string } | null;
  /** Team DPS (total damage / last tick time in seconds). */
  teamDps: number | null;
  /** Frame at which boss HP reaches 0 (null if no boss or never killed). */
  timeToKill: number | null;
  /** Highest 5-second burst window damage. */
  highestBurst: { damage: number; startFrame: number; endFrame: number } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEventDisplayName(name: string): string {
  return COMBAT_SKILL_LABELS[name as CombatSkillType] ?? name;
}

function isUltEnhanced(name: string): boolean {
  return name.includes('_ENHANCED');
}

/** Map columnId to the CombatSkillType enum for damage bonus lookup. */
function columnIdToSkillType(columnId: string): CombatSkillType {
  switch (columnId) {
    case SKILL_COLUMNS.BASIC: return CombatSkillType.BASIC_ATTACK;
    case SKILL_COLUMNS.BATTLE: return CombatSkillType.BATTLE_SKILL;
    case SKILL_COLUMNS.COMBO: return CombatSkillType.COMBO_SKILL;
    case SKILL_COLUMNS.ULTIMATE: return CombatSkillType.ULTIMATE;
    case OPERATOR_COLUMNS.OTHER: return CombatSkillType.BASIC_ATTACK;
    default: return CombatSkillType.BASIC_ATTACK;
  }
}

/** Map columnId to the skill level field in LoadoutProperties. */
function getSkillLevel(columnId: string, props: LoadoutProperties): SkillLevel {
  switch (columnId) {
    case SKILL_COLUMNS.BASIC: return props.skills.basicAttackLevel as SkillLevel;
    case SKILL_COLUMNS.BATTLE: return props.skills.battleSkillLevel as SkillLevel;
    case SKILL_COLUMNS.COMBO: return props.skills.comboSkillLevel as SkillLevel;
    case SKILL_COLUMNS.ULTIMATE: return props.skills.ultimateLevel as SkillLevel;
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
  // Attack sub-components for breakdown display
  operatorBaseAttack: number;
  weaponBaseAttack: number;
  atkBonusPct: number;
  flatAtkBonuses: number;
  // Attribute sub-components
  mainAttrType: StatType;
  mainAttrValue: number;
  secondaryAttrType: StatType;
  secondaryAttrValue: number;
}

function buildOperatorCalcData(
  operatorId: string,
  loadout: OperatorLoadoutState,
  props: LoadoutProperties,
): OperatorCalcData | null {
  const agg = aggregateLoadoutStats(operatorId, loadout, props);
  if (!agg) return null;

  const totalAttack = getTotalAttack(
    agg.operatorBaseAttack,
    agg.weaponBaseAttack,
    agg.stats[StatType.ATTACK_BONUS],
    agg.flatAttackBonuses,
  );
  const attributeBonus = agg.attributeBonus;

  return {
    totalAttack,
    attributeBonus,
    critRate: Math.min(Math.max(agg.stats[StatType.CRITICAL_RATE], 0), 1),
    critDamage: agg.stats[StatType.CRITICAL_DAMAGE],
    stats: agg.stats,
    element: agg.element,
    operatorBaseAttack: agg.operatorBaseAttack,
    weaponBaseAttack: agg.weaponBaseAttack,
    atkBonusPct: agg.stats[StatType.ATTACK_BONUS],
    flatAtkBonuses: agg.flatAttackBonuses,
    mainAttrType: agg.mainAttributeType,
    mainAttrValue: agg.stats[agg.mainAttributeType] ?? 0,
    secondaryAttrType: agg.secondaryAttributeType,
    secondaryAttrValue: agg.stats[agg.secondaryAttributeType] ?? 0,
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
  loadoutStats: Record<string, LoadoutProperties>,
  loadouts?: Record<string, OperatorLoadoutState>,
  statusQuery?: EventsQueryService,
  critMode?: CritMode,
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
    const slotStats = loadoutStats[slot.slotId] ?? DEFAULT_LOADOUT_PROPERTIES;
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
    const effectiveColumnId = isUltEnhanced(ev.name) ? SKILL_COLUMNS.ULTIMATE : ev.columnId;
    const col = colLookup.get(`${ev.ownerId}-${effectiveColumnId}`)
      ?? colLookup.get(`${ev.ownerId}-${ev.columnId}`);
    if (!col) continue;

    const eventName = getEventDisplayName(ev.name);
    const opData = opCache.get(ev.ownerId);
    const operatorId = opIdCache.get(ev.ownerId);
    const props = loadoutStats[ev.ownerId] ?? DEFAULT_LOADOUT_PROPERTIES;
    const skillLevel = getSkillLevel(effectiveColumnId, props);
    const potential = (props.operator.potential ?? 5) as Potential;

    // Look up default segments for max frame counts (users can delete frames)
    const defaultSegs = col.eventVariants?.find((v) => v.name === ev.id)?.segments
      ?? col.defaultEvent?.segments;

    if (ev.segments.length > 0) {
      let segmentFrameOffset = 0;
      for (let si = 0; si < ev.segments.length; si++) {
        const seg = ev.segments[si];
        const segLabel = seg.properties.name ?? `Seg ${si + 1}`;

        if (seg.frames) {
          // Max frames from default segment (not current, which may have deletions)
          const maxFrames = defaultSegs?.[si]?.frames?.length ?? seg.frames.length;
          for (let fi = 0; fi < seg.frames.length; fi++) {
            const frame = seg.frames[fi];
            const absFrame = frame.absoluteFrame ?? (ev.startFrame + segmentFrameOffset + frame.offsetFrame);

            // Look up multiplier
            let multiplier: number | null = null;
            let damage: number | null = null;
            let params: DamageParams | null = null;

            if (operatorId && opData) {
              let segmentMultiplier: number | null;
              let isPerTick = false;

              // Check for inline DEAL DAMAGE multiplier (DSL v2 clause)
              if (frame.dealDamage && frame.dealDamage.multipliers.length > 0) {
                const levelIdx = Math.min(skillLevel - 1, frame.dealDamage.multipliers.length - 1);
                multiplier = frame.dealDamage.multipliers[levelIdx];
                segmentMultiplier = null;
                isPerTick = true;
              } else {
                // Try per-tick multiplier first (for skills with ramping damage like Smouldering Fire)
                const perTickMult = getFrameMultiplier(
                  operatorId,
                  ev.name as CombatSkillType,
                  skillLevel,
                  potential,
                  fi,
                );

                if (perTickMult != null) {
                  // Per-tick multiplier: use directly, no division needed
                  multiplier = perTickMult;
                  segmentMultiplier = null;
                  isPerTick = true;
                } else {
                  multiplier = getSkillMultiplier(
                    operatorId,
                    ev.name as CombatSkillType,
                    si,
                    skillLevel,
                    potential,
                  );

                  // Segment multiplier is for the entire segment; divide by max frame count
                  segmentMultiplier = multiplier;
                  if (multiplier != null && maxFrames > 1) {
                    multiplier = multiplier / maxFrames;
                  }
                }
              }

              if (multiplier != null && multiplier > 0) {
                // Get element from inline DEAL DAMAGE, frame marker, or skill column
                const frameElement = frame.dealDamage?.element
                  ?? frame.damageElement
                  ?? frame.applyArtsInfliction?.element
                  ?? col.skillElement;
                const element = (frameElement as ElementType) ?? opData.element;

                // Damage bonus group
                const elementBonusStat = getElementDamageBonusStat(element);
                const skillType = columnIdToSkillType(effectiveColumnId);
                const skillTypeBonusStat = getSkillTypeDamageBonusStat(skillType);
                const isArts = element !== ElementType.PHYSICAL && element !== ElementType.NONE;
                const isStaggered = statusQuery?.isStaggered(absFrame) ?? false;

                // Damage Bonus sub-components
                const allElementDmgBonuses = {
                  [ElementType.NONE]: opData.stats[StatType.PHYSICAL_DAMAGE_BONUS],
                  [ElementType.PHYSICAL]: opData.stats[StatType.PHYSICAL_DAMAGE_BONUS],
                  [ElementType.HEAT]: opData.stats[StatType.HEAT_DAMAGE_BONUS],
                  [ElementType.CRYO]: opData.stats[StatType.CRYO_DAMAGE_BONUS],
                  [ElementType.NATURE]: opData.stats[StatType.NATURE_DAMAGE_BONUS],
                  [ElementType.ELECTRIC]: opData.stats[StatType.ELECTRIC_DAMAGE_BONUS],
                } as Record<ElementType, number>;
                // Wildland Trekker: adds Electric DMG% from Arclight's talent
                const wildlandTrekkerBonus = statusQuery?.getWildlandTrekkerBonus(absFrame) ?? 0;
                if (wildlandTrekkerBonus > 0) {
                  allElementDmgBonuses[ElementType.ELECTRIC] = (allElementDmgBonuses[ElementType.ELECTRIC] ?? 0) + wildlandTrekkerBonus;
                }

                const subElementDmg = (element === ElementType.ELECTRIC)
                  ? opData.stats[elementBonusStat] + wildlandTrekkerBonus
                  : opData.stats[elementBonusStat];
                const subSkillTypeDmg = opData.stats[skillTypeBonusStat];
                const subSkillDmg = opData.stats[StatType.SKILL_DAMAGE_BONUS];
                const subArtsDmg = isArts ? opData.stats[StatType.ARTS_DAMAGE_BONUS] : 0;
                const subStaggerDmg = isStaggered ? (opData.stats[StatType.STAGGER_DAMAGE_BONUS] ?? 0) : 0;

                const multiplierGroup = getDamageBonus(
                  subElementDmg, subSkillTypeDmg, subSkillDmg, subArtsDmg, subStaggerDmg,
                );

                // Resistance (with corrosion reduction + ignored resistance)
                // Formula: 1 - Resistance/100 + IgnoredResistance/100
                // Can exceed 1.0 when corrosion + ignored resistance push past zero
                const baseResistance = modelEnemy
                  ? getResistanceMultiplier(modelEnemy, element)
                  : 1;
                let resMultiplier = baseResistance;
                let subCorrosionReduction = 0;
                let subIgnoredRes = 0;
                if (statusQuery && element !== ElementType.PHYSICAL && element !== ElementType.NONE) {
                  subCorrosionReduction = statusQuery.getCorrosionResistanceReduction(absFrame);
                  if (subCorrosionReduction > 0) {
                    resMultiplier += subCorrosionReduction / 100;
                  }
                  subIgnoredRes = statusQuery.getIgnoredResistance(absFrame, element, ev.ownerId);
                  if (subIgnoredRes > 0) {
                    resMultiplier += subIgnoredRes / 100;
                  }
                }

                // Crit multiplier based on crit mode (DOT frames cannot crit)
                const isDot = frame.damageType === DamageType.DAMAGE_OVER_TIME;
                const canCrit = !isDot;
                let frameCrit: boolean | undefined;
                let expectedCrit: number;
                if (!canCrit) {
                  expectedCrit = 1;
                } else if (critMode === CritMode.ALWAYS) {
                  expectedCrit = getCritMultiplier(true, opData.critDamage);
                } else if (critMode === CritMode.NEVER) {
                  expectedCrit = 1;
                } else if (critMode === CritMode.SIMULATION) {
                  frameCrit = Math.random() < opData.critRate;
                  frame.isCrit = frameCrit;
                  expectedCrit = frameCrit
                    ? getCritMultiplier(true, opData.critDamage)
                    : 1;
                } else {
                  expectedCrit = getExpectedCritMultiplier(opData.critRate, opData.critDamage);
                }

                // Finisher: applies when the event is a finisher attack during stagger break
                const isFinisher = ev.id === CombatSkillType.FINISHER;
                const enemyTier = modelEnemy?.tier ?? EnemyTierType.COMMON;

                // Link bonus depends on stacks and skill type (battle skill vs ultimate)
                const linkBonus = statusQuery?.getLinkBonus(absFrame, skillType) ?? 0;

                // Sub-component arrays for multiplicative multipliers
                const subWeakenEffects = statusQuery?.getWeakenEffects(absFrame) ?? [];
                const subDmgReductionEffects = statusQuery?.getDmgReductionEffects(absFrame) ?? [];
                const subProtectionEffects = statusQuery?.getProtectionEffects(absFrame) ?? [];
                const subFragilityBonus = statusQuery?.getFragilityBonus(absFrame, element) ?? 0;

                const sub: DamageSubComponents = {
                  operatorBaseAttack: opData.operatorBaseAttack,
                  weaponBaseAttack: opData.weaponBaseAttack,
                  atkBonusPct: opData.atkBonusPct,
                  flatAtkBonuses: opData.flatAtkBonuses,
                  mainAttrType: opData.mainAttrType,
                  mainAttrValue: opData.mainAttrValue,
                  secondaryAttrType: opData.secondaryAttrType,
                  secondaryAttrValue: opData.secondaryAttrValue,
                  element,
                  elementDmgBonus: subElementDmg,
                  allElementDmgBonuses,
                  skillTypeDmgBonus: subSkillTypeDmg,
                  skillDmgBonus: subSkillDmg,
                  artsDmgBonus: subArtsDmg,
                  staggerDmgBonus: subStaggerDmg,
                  critRate: opData.critRate,
                  critDamage: opData.critDamage,
                  baseResistance,
                  corrosionReduction: subCorrosionReduction,
                  ignoredResistance: subIgnoredRes,
                  fragilityBonus: subFragilityBonus,
                  fragilitySources: statusQuery?.getFragilitySources(absFrame, element) ?? [],
                  susceptibilitySources: statusQuery?.getSusceptibilitySources(absFrame, element) ?? [],
                  ampSources: statusQuery?.getAmpSources(absFrame) ?? [],
                  weakenEffects: subWeakenEffects,
                  dmgReductionEffects: subDmgReductionEffects,
                  protectionEffects: subProtectionEffects,
                  segmentMultiplier: segmentMultiplier ?? undefined,
                  segmentFrameCount: (segmentMultiplier != null && maxFrames > 1) ? maxFrames : undefined,
                  isPerTickMultiplier: isPerTick,
                };

                params = {
                  attack: opData.totalAttack,
                  baseMultiplier: multiplier,
                  attributeBonus: opData.attributeBonus,
                  multiplierGroup,
                  critMultiplier: expectedCrit,
                  ampMultiplier: getAmpMultiplier(statusQuery?.getAmpBonus(absFrame) ?? 0),
                  staggerMultiplier: getStaggerMultiplier(isStaggered),
                  finisherMultiplier: getFinisherMultiplier(enemyTier, isFinisher),
                  linkMultiplier: getLinkMultiplier(linkBonus, linkBonus > 0),
                  weakenMultiplier: getWeakenMultiplier(subWeakenEffects),
                  susceptibilityMultiplier: getSusceptibilityMultiplier(statusQuery?.getSusceptibilityBonus(absFrame, element) ?? 0),
                  fragilityMultiplier: getFragilityMultiplier(subFragilityBonus),
                  dmgReductionMultiplier: getDmgReductionMultiplier(subDmgReductionEffects),
                  protectionMultiplier: getProtectionMultiplier(subProtectionEffects),
                  defenseMultiplier: defMultiplier,
                  resistanceMultiplier: resMultiplier,
                  specialMultiplier: undefined,
                  sub,
                };

                damage = calculateDamage(params);
              }
            }

            rows.push({
              key: `${ev.uid}-s${si}-f${fi}`,
              absoluteFrame: absFrame,
              label: `${eventName} > ${segLabel} > Tick ${fi + 1}`,
              columnKey: col.key,
              ownerId: ev.ownerId,
              columnId: effectiveColumnId,
              eventUid: ev.uid,
              segmentIndex: si,
              frameIndex: fi,
              damage,
              multiplier,
              segmentLabel: seg.properties.name,
              skillName: ev.name,
              hpRemaining: null, // computed after sorting
              params,
              damageType: frame.damageType,
            });
          }
        }
        segmentFrameOffset += seg.properties.duration;
      }
    }
  }

  // ── Arts reaction damage rows ──────────────────────────────────────────────
  // Find reaction events on the enemy timeline and compute their damage
  // using the triggering operator's loadout.
  for (const ev of events) {
    if (ev.ownerId !== ENEMY_OWNER_ID || !REACTION_COLUMN_IDS.has(ev.columnId)) continue;
    if (!ev.sourceOwnerId) continue;

    // Look up triggering operator's calc data
    const sourceOpData = opCache.get(ev.sourceOwnerId);
    const sourceProps = loadoutStats[ev.sourceOwnerId] ?? DEFAULT_LOADOUT_PROPERTIES;
    if (!sourceOpData || !modelEnemy) continue;

    const sourceOperatorId = opIdCache.get(ev.sourceOwnerId) ?? undefined;
    const opCtx: ReactionOperatorContext = {
      totalAttack: sourceOpData.totalAttack,
      artsIntensity: sourceOpData.stats[StatType.ARTS_INTENSITY] ?? 0,
      operatorLevel: sourceProps.operator.level,
      operatorId: sourceOperatorId,
      potential: sourceProps.operator.potential,
    };

    // Find a column key for this reaction — use the source operator's OTHER column
    const sourceCol = colLookup.get(`${ev.sourceOwnerId}-${OPERATOR_COLUMNS.OTHER}`)
      ?? colLookup.get(`${ev.sourceOwnerId}-basic`);
    const columnKey = sourceCol ? sourceCol.key : `${ev.sourceOwnerId}-${ev.columnId}`;

    const reactionRows = buildReactionDamageRows(
      ev, opCtx, modelEnemy, columnKey, statusQuery,
    );
    rows.push(...reactionRows);
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
/** Column IDs excluded from the damage sheet (no damage data). */
const EXCLUDED_SHEET_COLUMNS = new Set<string>([OPERATOR_COLUMNS.INPUT]);

export function buildDamageTableColumns(columns: Column[]): DamageTableColumn[] {
  const result: DamageTableColumn[] = [];
  for (const col of columns) {
    if (col.type !== 'mini-timeline') continue;
    if (col.source !== TimelineSourceType.OPERATOR) continue;
    if ((col as MiniTimeline).derived) continue;
    if (EXCLUDED_SHEET_COLUMNS.has(col.columnId)) continue;
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

// ── Merged rows (reduce sparseness) ───────────────────────────────────────

/** A visual row that may contain damage values from multiple columns at the same frame. */
export interface MergedDamageRow {
  absoluteFrame: number;
  /** Map from columnKey → DamageTableRow for cells that have data. */
  cells: Map<string, DamageTableRow>;
  /** Total damage across all cells in this merged row. */
  totalDamage: number;
  /** Key for React rendering. */
  key: string;
  /** Boss HP remaining after this merged row (from the last cell chronologically). */
  hpRemaining: number | null;
}

/**
 * Merge adjacent rows at the same absoluteFrame into single visual rows.
 * This dramatically reduces sparseness when multiple operators hit on the same frame.
 */
export function mergeRowsByFrame(rows: DamageTableRow[]): MergedDamageRow[] {
  if (rows.length === 0) return [];
  const merged: MergedDamageRow[] = [];
  let current: MergedDamageRow | null = null;

  for (const row of rows) {
    if (current && current.absoluteFrame === row.absoluteFrame) {
      current.cells.set(row.columnKey, row);
      current.totalDamage += row.damage ?? 0;
      current.hpRemaining = row.hpRemaining;
    } else {
      current = {
        absoluteFrame: row.absoluteFrame,
        cells: new Map([[row.columnKey, row]]),
        totalDamage: row.damage ?? 0,
        key: `merged-${row.absoluteFrame}`,
        hpRemaining: row.hpRemaining,
      };
      merged.push(current);
    }
  }
  return merged;
}

/** Collapsed column descriptor — one per operator, aggregating all skill columns. */
export interface CollapsedColumn {
  key: string;
  ownerId: string;
  label: string;
  color: string;
  /** Original column keys that are collapsed into this one. */
  sourceColumnKeys: string[];
}

/** Build collapsed columns — one per operator. */
export function buildCollapsedColumns(tableColumns: DamageTableColumn[], slots: Slot[]): CollapsedColumn[] {
  const ownerOrder: string[] = [];
  const ownerMap = new Map<string, DamageTableColumn[]>();
  for (const col of tableColumns) {
    if (!ownerMap.has(col.ownerId)) {
      ownerOrder.push(col.ownerId);
      ownerMap.set(col.ownerId, []);
    }
    ownerMap.get(col.ownerId)!.push(col);
  }
  return ownerOrder.map((ownerId) => {
    const cols = ownerMap.get(ownerId)!;
    const slot = slots.find((s) => s.slotId === ownerId);
    return {
      key: `collapsed-${ownerId}`,
      ownerId,
      label: slot?.operator?.name ?? ownerId,
      color: cols[0]?.color ?? '#666',
      sourceColumnKeys: cols.map((c) => c.key),
    };
  });
}

/**
 * Compute damage statistics from calculated rows.
 */
export function computeDamageStatistics(
  rows: DamageTableRow[],
  tableColumns: DamageTableColumn[],
  bossMaxHp?: number | null,
  /** Optional frame range to restrict DPS and total calculations. */
  rangeStartFrame?: number,
  rangeEndFrame?: number,
): DamageStatistics {
  // Filter rows to the requested range (if any)
  const hasRange = rangeStartFrame != null || rangeEndFrame != null;
  const filteredRows = hasRange
    ? rows.filter((r) => {
        if (rangeStartFrame != null && r.absoluteFrame < rangeStartFrame) return false;
        if (rangeEndFrame != null && r.absoluteFrame > rangeEndFrame) return false;
        return true;
      })
    : rows;

  // Aggregate per-column totals
  const columnTotals = new Map<string, number>();
  for (const col of tableColumns) {
    columnTotals.set(col.key, 0);
  }
  for (const row of filteredRows) {
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

  // ── Extended statistics ──────────────────────────────────────────────────
  // Highest single tick
  let highestTick: DamageStatistics['highestTick'] = null;
  for (const row of filteredRows) {
    if (row.damage != null && (highestTick === null || row.damage > highestTick.damage)) {
      highestTick = { damage: row.damage, label: row.label, ownerId: row.ownerId };
    }
  }

  // Team DPS — use range bounds if set, otherwise first→last tick
  let teamDps: number | null = null;
  if (filteredRows.length > 0 && teamTotalDamage > 0) {
    const FPS = 120;
    const dpsStart = rangeStartFrame ?? filteredRows[0].absoluteFrame;
    const dpsEnd = rangeEndFrame ?? filteredRows[filteredRows.length - 1].absoluteFrame;
    const durationSec = (dpsEnd - dpsStart) / FPS;
    if (durationSec > 0) {
      teamDps = teamTotalDamage / durationSec;
    }
  }

  // Time to kill (uses unfiltered rows — TTK is absolute)
  let timeToKill: number | null = null;
  if (bossMaxHp != null) {
    for (const row of rows) {
      if (row.hpRemaining != null && row.hpRemaining <= 0) {
        timeToKill = row.absoluteFrame;
        break;
      }
    }
  }

  // Highest 5-second burst window (600 frames at 120 FPS)
  const BURST_WINDOW = 600;
  let highestBurst: DamageStatistics['highestBurst'] = null;
  if (filteredRows.length > 0) {
    let windowStart = 0;
    let windowSum = 0;
    for (let end = 0; end < filteredRows.length; end++) {
      windowSum += filteredRows[end].damage ?? 0;
      while (filteredRows[end].absoluteFrame - filteredRows[windowStart].absoluteFrame > BURST_WINDOW) {
        windowSum -= filteredRows[windowStart].damage ?? 0;
        windowStart++;
      }
      if (highestBurst === null || windowSum > highestBurst.damage) {
        highestBurst = {
          damage: windowSum,
          startFrame: filteredRows[windowStart].absoluteFrame,
          endFrame: filteredRows[end].absoluteFrame,
        };
      }
    }
  }

  return { teamTotalDamage, operators, columnTotals, bossMaxHp: bossMaxHp ?? null, highestTick, teamDps, timeToKill, highestBurst };
}
