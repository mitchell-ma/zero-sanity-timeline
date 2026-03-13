/**
 * Damage table builder — controller that orchestrates damage calculation.
 *
 * Takes dumb model data (operator stats, enemy stats, skill multipliers)
 * and combines them into computed damage numbers for the dumb view.
 */
import { TimelineEvent, Column, MiniTimeline, Enemy as ViewEnemy } from '../../consts/viewTypes';
import { COMBAT_SKILL_LABELS } from '../../consts/channelLabels';
import { CombatSkillsType, CombatSkillType, ElementType, EnemyTierType, StatType, TimelineSourceType } from '../../consts/enums';
import { SkillLevel, Potential } from '../../consts/types';
import { StatusDamageParams } from '../../model/calculation/damageFormulas';
import { getModelEnemy } from './enemyRegistry';
import { getSkillMultiplier } from './skillMultiplierRegistry';
import { aggregateLoadoutStats } from './loadoutAggregator';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../../view/OperatorLoadoutHeader';
import {
  calculateDamage,
  DamageParams,
  DamageSubComponents,
  getAmpMultiplier,
  getAttributeBonus,
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
import { StatusQueryService } from './statusQueryService';
import { LoadoutStats, DEFAULT_LOADOUT_STATS } from '../../view/InformationPane';
import type { Slot } from '../timeline/columnBuilder';
import { ENEMY_OWNER_ID, REACTION_COLUMN_IDS } from '../../model/channels';
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
  /** Status/reaction damage parameters. Null for normal skill hits. */
  statusParams?: StatusDamageParams | null;
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

  // Lifeng T1 — Illumination: every point of INT + WIL grants additional ATK%
  let extraAttackPct = 0;
  if (operatorId === 'lifeng' && stats.talentOneLevel >= 1) {
    const intWil = Math.floor(agg.stats[StatType.INTELLECT]) + Math.floor(agg.stats[StatType.WILL]);
    extraAttackPct = intWil * (stats.talentOneLevel >= 2 ? 0.0015 : 0.0010);
  }

  const totalAttack = getTotalAttack(
    agg.operatorBaseAttack,
    agg.weaponBaseAttack,
    agg.stats[StatType.ATTACK_BONUS] + extraAttackPct,
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

    // Look up default segments for max frame counts (users can delete frames)
    const defaultSegs = col.eventVariants?.find((v) => v.name === ev.name)?.segments
      ?? col.defaultEvent?.segments;

    if (ev.segments && ev.segments.length > 0) {
      let segmentFrameOffset = 0;
      for (let si = 0; si < ev.segments.length; si++) {
        const seg = ev.segments[si];
        const segLabel = seg.label ?? `Seg ${si + 1}`;

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
              multiplier = getSkillMultiplier(
                operatorId,
                ev.name as CombatSkillsType,
                seg.label,
                skillLevel,
                potential,
              );

              // Segment multiplier is for the entire segment; divide by max frame count
              if (multiplier != null && maxFrames > 1) {
                multiplier = multiplier / maxFrames;
              }

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
                const isStaggered = statusQuery?.isStaggered(absFrame) ?? false;

                // ── Operator talent conditional bonuses ──────────────────────
                let talentStaggerDmgBonus = 0;
                let talentCritDmgBonus = 0;
                let talentSpecialMultiplier = 1;
                let talentDmgDealBonus = 0;

                // Perlica T1 — Obliteration Protocol: DMG Dealt +20/30% to Staggered
                if (operatorId === 'perlica' && stats.talentOneLevel >= 1 && isStaggered) {
                  talentStaggerDmgBonus += stats.talentOneLevel >= 2 ? 0.30 : 0.20;
                }
                // Yvonne T2 — Freezing Point: Crit DMG +10/20% vs Cryo-inflicted; doubled vs Solidified
                if (operatorId === 'yvonne' && stats.talentTwoLevel >= 1 && statusQuery) {
                  if (statusQuery.isSolidificationActive(absFrame)) {
                    talentCritDmgBonus += (stats.talentTwoLevel >= 2 ? 0.20 : 0.10) * 2;
                  } else if (statusQuery.isCryoInflictionActive(absFrame)) {
                    talentCritDmgBonus += stats.talentTwoLevel >= 2 ? 0.20 : 0.10;
                  }
                }
                // Yvonne P3 — Tink-a-Power: Crit DMG +10% vs Cryo, doubled vs Solidification
                if (operatorId === 'yvonne' && potential >= 3 && statusQuery) {
                  if (statusQuery.isSolidificationActive(absFrame)) {
                    talentCritDmgBonus += 0.10 * 2;
                  } else if (statusQuery.isCryoInflictionActive(absFrame)) {
                    talentCritDmgBonus += 0.10;
                  }
                }
                // Last Rite T2 — Cryogenic Embrittlement: Ultimate DMG x1.2/1.5 vs Cryo Susceptibility
                if (operatorId === 'lastRite' && stats.talentTwoLevel >= 1 && skillType === CombatSkillType.ULTIMATE && statusQuery) {
                  if (statusQuery.getSusceptibilityBonus(absFrame, ElementType.CRYO) > 0) {
                    talentSpecialMultiplier *= stats.talentTwoLevel >= 2 ? 1.5 : 1.2;
                  }
                }
                // Avywenna P5 — Carrot and Sharp Stick: 1.15x vs Electric Susceptible
                if (operatorId === 'avywenna' && potential >= 5 && statusQuery) {
                  if (statusQuery.getSusceptibilityBonus(absFrame, ElementType.ELECTRIC) > 0) {
                    talentSpecialMultiplier *= 1.15;
                  }
                }
                // Chen Qianyu P1 — DMG Dealt +20% to enemies below 50% HP
                if (operatorId === 'chenQianyu' && potential >= 1) {
                  talentDmgDealBonus += 0.20;
                }
                // Fluorite T1 — Love the Stab and Twist: DMG +10/20% vs Slowed
                if (operatorId === 'fluorite' && stats.talentOneLevel >= 1) {
                  talentDmgDealBonus += stats.talentOneLevel >= 2 ? 0.20 : 0.10;
                }
                // Alesh P5 — Ultimate DMG x1.5 vs enemies below 50% HP
                if (operatorId === 'alesh' && potential >= 5 && skillType === CombatSkillType.ULTIMATE) {
                  talentSpecialMultiplier *= 1.5;
                }
                // Laevatain P5 — Proof of Existence: Enhanced basic attack DMG multiplier x1.2
                if (operatorId === 'laevatain' && potential >= 5 && ev.name === CombatSkillsType.FLAMING_CINDERS_ENHANCED) {
                  talentSpecialMultiplier *= 1.2;
                }

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
                const subStaggerDmg = isStaggered ? (opData.stats[StatType.STAGGER_DAMAGE_BONUS] ?? 0) + talentStaggerDmgBonus : 0;

                const multiplierGroup = getDamageBonus(
                  subElementDmg, subSkillTypeDmg, subSkillDmg, subArtsDmg, subStaggerDmg, talentDmgDealBonus,
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

                // Crit not currently factored into calculations
                const expectedCrit = 1;

                // Finisher: applies when the event is a finisher attack during stagger break
                const isFinisher = ev.name === CombatSkillsType.FINISHER;
                const enemyTier = modelEnemy?.tier ?? EnemyTierType.COMMON;

                // Link bonus depends on stacks and skill type (battle skill vs ultimate)
                const linkBonus = statusQuery?.getLinkBonus(absFrame, skillType) ?? 0;

                // Sub-component arrays for multiplicative multipliers
                const subWeakenEffects = statusQuery?.getWeakenEffects(absFrame) ?? [];
                const subDmgReductionEffects = statusQuery?.getDmgReductionEffects(absFrame) ?? [];
                const subProtectionEffects = statusQuery?.getProtectionEffects(absFrame) ?? [];
                const subFragilityBonus = statusQuery?.getFragilityBonus(absFrame, element) ?? 0;

                // Special multiplier sources
                const specialSources: { label: string; value: number }[] = [];
                if (operatorId === 'lastRite' && stats.talentTwoLevel >= 1 && skillType === CombatSkillType.ULTIMATE && statusQuery && statusQuery.getSusceptibilityBonus(absFrame, ElementType.CRYO) > 0) {
                  specialSources.push({ label: 'Cryogenic Embrittlement', value: stats.talentTwoLevel >= 2 ? 1.5 : 1.2 });
                }
                if (operatorId === 'avywenna' && potential >= 5 && statusQuery && statusQuery.getSusceptibilityBonus(absFrame, ElementType.ELECTRIC) > 0) {
                  specialSources.push({ label: 'Carrot and Sharp Stick (P5)', value: 1.15 });
                }
                if (operatorId === 'alesh' && potential >= 5 && skillType === CombatSkillType.ULTIMATE) {
                  specialSources.push({ label: 'P5: x1.5 vs <50% HP', value: 1.5 });
                }
                if (operatorId === 'laevatain' && potential >= 5 && ev.name === CombatSkillsType.FLAMING_CINDERS_ENHANCED) {
                  specialSources.push({ label: 'Proof of Existence (P5)', value: 1.2 });
                }

                const sub: DamageSubComponents = {
                  element,
                  elementDmgBonus: subElementDmg,
                  allElementDmgBonuses,
                  skillTypeDmgBonus: subSkillTypeDmg,
                  skillDmgBonus: subSkillDmg,
                  artsDmgBonus: subArtsDmg,
                  staggerDmgBonus: subStaggerDmg,
                  talentDmgDealBonus,
                  critRate: opData.critRate,
                  critDamage: opData.critDamage,
                  talentCritDmgBonus: talentCritDmgBonus,
                  baseResistance,
                  corrosionReduction: subCorrosionReduction,
                  ignoredResistance: subIgnoredRes,
                  fragilityBonus: subFragilityBonus,
                  weakenEffects: subWeakenEffects,
                  dmgReductionEffects: subDmgReductionEffects,
                  protectionEffects: subProtectionEffects,
                  specialSources,
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
                  specialMultiplier: talentSpecialMultiplier !== 1 ? talentSpecialMultiplier : undefined,
                  sub,
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

  // ── Catcher T2/P1 — Additional damage strikes ─────────────────────────────
  for (const ev of events) {
    const oid = opIdCache.get(ev.ownerId);
    if (oid !== 'catcher') continue;
    const opData = opCache.get(ev.ownerId);
    if (!opData) continue;
    const catcherStats = loadoutStats[ev.ownerId] ?? DEFAULT_LOADOUT_STATS;
    const catcherPotential = (catcherStats.potential ?? 5) as Potential;

    const isBattle = ev.name === CombatSkillsType.RIGID_INTERDICTION;
    const isUlt = ev.name === CombatSkillsType.TEXTBOOK_ASSAULT;
    if (!isBattle && !isUlt) continue;

    const absFrame = ev.startFrame;
    const col = colLookup.get(`${ev.ownerId}-${ev.columnId}`);
    if (!col) continue;

    // P1 — Multi-layered Readiness: Battle/ultimate gain strike at [300 + DEF×5.0] Physical DMG
    // DEF comes from gear and is not tracked in the stat aggregation; use base 300 as minimum
    if (catcherPotential >= 1) {
      const p1Damage = 300;
      rows.push({
        key: `${ev.id}-p1-strike`,
        absoluteFrame: absFrame,
        label: `${getEventDisplayName(ev.name)} > P1 Strike`,
        columnKey: col.key,
        ownerId: ev.ownerId,
        columnId: ev.columnId,
        eventId: ev.id,
        segmentIndex: 0,
        frameIndex: 0,
        damage: p1Damage,
        multiplier: null,
        segmentLabel: undefined,
        skillName: ev.name,
        hpRemaining: null,
        params: null,
      });
    }

    // T2 — Comprehensive Mindset: Ultimate creates shockwaves at 30/45% ATK Physical DMG each
    if (isUlt && catcherStats.talentTwoLevel >= 1) {
      const waveCount = catcherStats.talentTwoLevel >= 2 ? 3 : 2;
      const waveMultiplier = catcherStats.talentTwoLevel >= 2 ? 0.45 : 0.30;
      const waveDamage = Math.floor(opData.totalAttack * waveMultiplier * opData.attributeBonus);
      for (let w = 0; w < waveCount; w++) {
        rows.push({
          key: `${ev.id}-t2-wave-${w}`,
          absoluteFrame: absFrame,
          label: `Textbook Assault > Shockwave ${w + 1}`,
          columnKey: col.key,
          ownerId: ev.ownerId,
          columnId: ev.columnId,
          eventId: ev.id,
          segmentIndex: 0,
          frameIndex: w,
          damage: waveDamage,
          multiplier: waveMultiplier,
          segmentLabel: undefined,
          skillName: ev.name,
          hpRemaining: null,
          params: null,
        });
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
    const sourceStats = loadoutStats[ev.sourceOwnerId] ?? DEFAULT_LOADOUT_STATS;
    if (!sourceOpData || !modelEnemy) continue;

    const sourceOperatorId = opIdCache.get(ev.sourceOwnerId) ?? undefined;
    const opCtx: ReactionOperatorContext = {
      totalAttack: sourceOpData.totalAttack,
      artsIntensity: sourceOpData.stats[StatType.ARTS_INTENSITY] ?? 0,
      operatorLevel: sourceStats.operatorLevel,
      operatorId: sourceOperatorId,
      potential: sourceStats.potential,
    };

    // Find a column key for this reaction — use the source operator's column
    const sourceCol = colLookup.get(`${ev.sourceOwnerId}-basic`);
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
