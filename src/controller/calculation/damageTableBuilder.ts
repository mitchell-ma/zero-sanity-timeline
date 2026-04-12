/**
 * Damage table builder — controller that orchestrates damage calculation.
 *
 * Takes dumb model data (operator stats, enemy stats, skill multipliers)
 * and combines them into computed damage numbers for the dumb view.
 */
import { TimelineEvent, Column, MiniTimeline, Enemy as ViewEnemy } from '../../consts/viewTypes';
import type { OverrideStore } from '../../consts/overrideTypes';
import { buildOverrideKey } from '../overrideController';
import { NounType, isQualifiedId } from '../../dsl/semantics';
import { StatusType } from '../../consts/enums';
import type { ValueNode } from '../../dsl/semantics';
import { getAllSkillLabels, getOperatorSkill } from '../gameDataStore';
import { resolveValueNode, buildContextForSkillColumn } from './valueResolver';
import { ColumnType, CritMode, DamageScalingStatType, DamageType, ElementType, EnemyTierType, EventFrameType, StatType, TimelineSourceType } from '../../consts/enums';
import { SkillLevel, Potential } from '../../consts/types';
import { StatusDamageParams } from '../../model/calculation/damageFormulas';
import { getModelEnemy } from './enemyRegistry';
import { getSkillMultiplier, isDamageSegment } from './jsonMultiplierEngine';
import { aggregateLoadoutStats, StatSourceEntry } from './loadoutAggregator';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../../view/OperatorLoadoutHeader';
import type { MultiplierSource } from '../../model/calculation/damageFormulas';
import {
  calculateDamage,
  DamageParams,
  DamageSubComponents,
  getAmpMultiplier,
  getDamageBonus,
  getDefenseMultiplier,
  getDmgReductionMultiplier,
  getElementDamageBonusStat,
  getFinisherMultiplier,
  getFragilityMultiplier,
  getLinkMultiplier,
  getProtectionMultiplier,
  getResistanceMultiplier,
  getSkillTypeDamageBonusStat,
  getStaggerMultiplier,
  getSusceptibilityMultiplier,
  getTotalAttack,
} from '../../model/calculation/damageFormulas';
import { EventsQueryService } from '../timeline/eventsQueryService';
import { hasDealDamageClause, findDealDamageInClauses, shouldFireChance } from '../timeline/clauseQueries';
import { LoadoutProperties, DEFAULT_LOADOUT_PROPERTIES } from '../../view/InformationPane';
import type { Slot } from '../timeline/columnBuilder';
import { ENEMY_ID, OPERATOR_COLUMNS, REACTION_COLUMN_IDS } from '../../model/channels';
import { TEAM_ID } from '../slot/commonSlotController';
import { buildReactionDamageRows, ReactionOperatorContext } from './artsReactionController';
import { buildCritExpectationModel, getFrameExpectation } from './critExpectationModel';
import type { CritExpectationModel, CritFrameSnapshot, StatusStatContribution } from './critExpectationModel';
import { getLastTriggerIndex, getLastStatAccumulator } from '../timeline/eventQueueController';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Merge two partial stat delta maps, summing values for shared keys. */
function mergeStatDeltas(
  a: Partial<Record<StatType, number>> | undefined,
  b: Partial<Record<StatType, number>> | undefined,
): Partial<Record<StatType, number>> | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const merged = { ...a };
  for (const key of Object.keys(b) as StatType[]) {
    merged[key] = (merged[key] ?? 0) + (b[key] ?? 0);
  }
  return merged;
}

/** Merge two stat source arrays (for display breakdown). */
function mergeStatSources(
  a: readonly import('./statAccumulator').StatSource[] | undefined,
  b: readonly import('./statAccumulator').StatSource[] | undefined,
): readonly import('./statAccumulator').StatSource[] | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return [...a, ...b];
}

// ── Types ────────────────────────────────────────────────────────────────────

/** A single row in the damage calculation table — one per frame tick. */
export interface DamageTableRow {
  key: string;
  absoluteFrame: number;
  label: string;
  columnKey: string;
  ownerEntityId: string;
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
  /** Skill name () for this tick. */
  skillName: string;
  /** Remaining boss HP after this tick's damage (can go negative). Null if HP unknown. */
  hpRemaining: number | null;
  /** Full damage calculation parameters. Null if damage could not be computed. */
  params: DamageParams | null;
  /** Status/reaction damage parameters. Null for normal skill hits. */
  statusParams?: StatusDamageParams | null;
  /** Damage type: NORMAL or DAMAGE_OVER_TIME. DOT cannot crit. */
  damageType?: DamageType;
  /** Element used for this tick's damage calculation. */
  element?: ElementType;
  /** Child frame rows when this row is a folded segment/event aggregate. */
  foldedFrames?: DamageTableRow[];
}

/** Column descriptor for the damage table header. */
export interface DamageTableColumn {
  key: string;
  label: string;
  ownerEntityId: string;
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
  ownerEntityId: string;
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
  highestTick: { damage: number; label: string; ownerEntityId: string } | null;
  /** Team DPS (total damage / last tick time in seconds). */
  teamDps: number | null;
  /** Frame at which boss HP reaches 0 (null if no boss or never killed). */
  timeToKill: number | null;
  /** Highest 5-second burst window damage. */
  highestBurst: { damage: number; startFrame: number; endFrame: number } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEventDisplayName(name: string): string {
  return getAllSkillLabels()[name as string] ?? name;
}

function isUltEnhanced(name: string): boolean {
  return name.includes('_ENHANCED');
}

/** Resolve the column type (BATTLE, COMBO, etc.) for a source skill by looking up its eventIdType. */
function getSourceSkillColumnId(operatorId: string, skillName: string): string {
  const skill = getOperatorSkill(operatorId, skillName);
  return skill?.eventIdType ?? NounType.BATTLE;
}

/** Map columnId to the skill NounType for damage bonus lookup. */
function columnIdToSkillType(columnId: string): string {
  switch (columnId) {
    case NounType.BASIC_ATTACK: return NounType.BASIC_ATTACK;
    case NounType.BATTLE: return NounType.BATTLE;
    case NounType.COMBO: return NounType.COMBO;
    case NounType.ULTIMATE: return NounType.ULTIMATE;
    case OPERATOR_COLUMNS.OTHER: return NounType.BASIC_ATTACK;
    default: return NounType.BASIC_ATTACK;
  }
}

/** Map columnId to the skill level field in LoadoutProperties. */
function getSkillLevel(columnId: string, props: LoadoutProperties): SkillLevel {
  switch (columnId) {
    case NounType.BASIC_ATTACK: return props.skills.basicAttackLevel as SkillLevel;
    case NounType.BATTLE: return props.skills.battleSkillLevel as SkillLevel;
    case NounType.COMBO: return props.skills.comboSkillLevel as SkillLevel;
    case NounType.ULTIMATE: return props.skills.ultimateLevel as SkillLevel;
    default: return 12 as SkillLevel;
  }
}

/**
 * Merge runtime status stat contributions from the crit model into the static
 * stat sources from loadout aggregation. Returns a new map with entries appended.
 *
 * Skips CRITICAL_RATE threshold contributions — those are displayed separately
 * via critSources in the crit breakdown section.
 */
function mergeRuntimeStatSources(
  base: Partial<Record<StatType, StatSourceEntry[]>>,
  contributions: StatusStatContribution[],
): Partial<Record<StatType, StatSourceEntry[]>> {
  if (contributions.length === 0) return base;
  const merged = { ...base };
  for (let i = 0; i < contributions.length; i++) {
    const c = contributions[i];
    if (Math.abs(c.total) < 1e-8) continue;
    // Threshold CRITICAL_RATE contributions are shown via critSources, not statSources
    if (c.stat === StatType.CRITICAL_RATE && c.threshold) continue;
    if (!merged[c.stat]) merged[c.stat] = [...(base[c.stat] ?? [])];
    else if (merged[c.stat] === base[c.stat]) merged[c.stat] = [...(base[c.stat] ?? [])];
    merged[c.stat]!.push({ source: c.label, value: c.total, contributionIndex: i });
  }
  return merged;
}

// ── Cached model data per operator ───────────────────────────────────────────

interface OperatorCalcData {
  totalAttack: number;
  totalDefense: number;
  effectiveHp: number;
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
  // Source breakdown
  statSources: Partial<Record<StatType, { source: string; value: number }[]>>;
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
    totalDefense: agg.totalDefense,
    effectiveHp: agg.effectiveHp,
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
    statSources: agg.statSources,
  };
}

const ALL_DISPLAY_ELEMENTS: ElementType[] = [
  ElementType.PHYSICAL, ElementType.HEAT, ElementType.CRYO,
  ElementType.NATURE, ElementType.ELECTRIC,
];

function buildAllElementSources(
  frame: number,
  query: EventsQueryService,
  type: 'fragility' | 'susceptibility',
): Partial<Record<ElementType, MultiplierSource[]>> {
  const result: Partial<Record<ElementType, MultiplierSource[]>> = {};
  for (const el of ALL_DISPLAY_ELEMENTS) {
    const sources = type === 'fragility'
      ? query.getFragilitySources(frame, el)
      : query.getSusceptibilitySources(frame, el);
    if (sources.length > 0) result[el] = sources;
  }
  return result;
}

/** Combine event-based AMP sources with runtime stat accumulator AMP sources. */
function buildAmpSources(
  eventSources: MultiplierSource[],
  runtimeDeltas: Partial<Record<StatType, number>> | undefined,
  ampStatSources: readonly import('./statAccumulator').StatSource[] | undefined,
): MultiplierSource[] {
  const ampDelta = runtimeDeltas?.[StatType.AMP];
  if (!ampDelta) return eventSources;
  if (ampStatSources?.length) {
    return [...eventSources, ...ampStatSources.map(s => ({
      label: s.label,
      value: s.value,
      category: NounType.ARTS_AMP,
      subSources: s.subSources?.map(ss => ({ label: ss.label, value: ss.value })),
    }))];
  }
  return [...eventSources, { label: NounType.ARTS_AMP, value: ampDelta, category: NounType.ARTS_AMP }];
}

/** Build per-element amp source breakdown for display. */
function buildAllAmpSources(
  frame: number,
  activeElement: ElementType,
  query: EventsQueryService | undefined,
  rd: Partial<Record<StatType, number>> | undefined,
  accumulator: import('./statAccumulator').StatAccumulator | null | undefined,
  frameKey: string,
  ownerEntityId: string,
): Partial<Record<ElementType, MultiplierSource[]>> {
  const result: Partial<Record<ElementType, MultiplierSource[]>> = {};
  const ampStatSources = mergeStatSources(
    accumulator?.getFrameStatSources(frameKey, ownerEntityId, StatType.AMP),
    accumulator?.getFrameStatSources(frameKey, TEAM_ID, StatType.AMP),
  );
  for (const el of ALL_DISPLAY_ELEMENTS) {
    // Per-element: event-based AMP only (element-filtered), no runtime stat AMP
    const eventSources = query?.getAmpSources(frame, el) ?? [];
    if (eventSources.length > 0) result[el] = eventSources;
  }
  // Runtime stat AMP (not element-qualified) shown under the active element
  const statSources = buildAmpSources([], rd, ampStatSources);
  if (statSources.length > 0) {
    result[activeElement] = [...(result[activeElement] ?? []), ...statSources];
  }
  return result;
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
  overrides?: OverrideStore,
): DamageTableRow[] {
  const rows: DamageTableRow[] = [];
  const resolvedCritMode = critMode ?? CritMode.EXPECTED;

  // Build column lookup: ownerEntityId-columnId → Column
  const colLookup = new Map<string, MiniTimeline>();
  for (const col of columns) {
    if (col.type === ColumnType.MINI_TIMELINE && col.source === TimelineSourceType.OPERATOR) {
      colLookup.set(`${col.ownerEntityId}-${col.columnId}`, col);
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
  // Reverse map: operatorId → slotId (for attributing enemy status damage to source operator)
  const opToSlotCache = new Map<string, string>();
  opIdCache.forEach((opId, slotId) => {
    if (opId) opToSlotCache.set(opId, slotId);
  });

  // Build crit expectation models per slot (all modes — needed for stat deltas)
  const critModels = new Map<string, CritExpectationModel>();
  {
    const triggerIndex = getLastTriggerIndex();
    if (triggerIndex) {
      for (const slot of slots) {
        if (!slot.operator) continue;
        const opData = opCache.get(slot.slotId);
        if (!opData) continue;
        const model = buildCritExpectationModel(triggerIndex, slot.slotId, opData.critRate);
        if (model) critModels.set(slot.slotId, model);
      }
    }
  }

  // Get model enemy for DEF/resistance/HP
  const modelEnemy = getModelEnemy(enemy.id);
  const enemyDef = modelEnemy ? modelEnemy.getDef() : 100;
  const defMultiplier = getDefenseMultiplier(enemyDef);
  const bossMaxHp = modelEnemy ? modelEnemy.getHp() : null;

  // ── Pre-pass: step crit models chronologically per operator ───────────────
  // Events are ordered by column, not by absolute frame. When events overlap
  // (e.g. BATK frame 5 at t=2.5s vs BS frame 1 at t=1.0s), processing
  // event-by-event steps the model out of order. Collect all crittable frames
  // per operator, sort by absolute frame, then step in chronological order.
  const critSnapshots = new Map<string, CritFrameSnapshot>();
  // Global frame position index for intra-frame ordering.
  // Status events created by a damage frame carry a sourceFrameKey; the damage
  // builder excludes statuses whose source frame is at-or-after the current
  // damage frame in the chronological sequence at the same absFrame.
  const allDamageFrameKeys: { absFrame: number; key: string }[] = [];
  {
    // Collect frames per owner
    const ownerFrames = new Map<string, { absFrame: number; key: string; isCrit?: boolean; isDot: boolean }[]>();
    for (const ev of events) {
      if (!ev.segments.length) continue;
      let segOff = 0;
      for (let si = 0; si < ev.segments.length; si++) {
        const seg = ev.segments[si];
        if (seg.frames) {
          for (let fi = 0; fi < seg.frames.length; fi++) {
            const f = seg.frames[fi];
            const absFrame = f.absoluteFrame ?? (ev.startFrame + segOff + f.offsetFrame);
            const isDot = f.damageType === DamageType.DAMAGE_OVER_TIME;
            const key = `${ev.uid}:${si}:${fi}`;
            // All damage frames participate in intra-frame ordering
            if (hasDealDamageClause(f.clauses)) {
              allDamageFrameKeys.push({ absFrame, key });
            }
            if (isDot) continue; // DOT can't crit
            let arr = ownerFrames.get(ev.ownerEntityId);
            if (!arr) { arr = []; ownerFrames.set(ev.ownerEntityId, arr); }
            arr.push({ absFrame, key, isCrit: f.isCrit, isDot });
          }
        }
        segOff += seg.properties.duration;
      }
    }
    // Sort each owner's frames chronologically and step the model
    ownerFrames.forEach((frames, ownerEntityId) => {
      const model = critModels.get(ownerEntityId);
      if (!model) return;
      frames.sort((a, b) => a.absFrame - b.absFrame);
      for (const fr of frames) {
        const overrideE = resolvedCritMode === CritMode.ALWAYS ? 1.0
          : resolvedCritMode === CritMode.NEVER ? 0.0
          : resolvedCritMode === CritMode.EXPECTED ? undefined
          : (fr.isCrit ? 1.0 : 0.0);
        const snapshot = model.step(fr.absFrame, overrideE);
        critSnapshots.set(fr.key, snapshot);
      }
    });
  }

  // Build global position map and per-absFrame lookup for exclusion sets
  allDamageFrameKeys.sort((a, b) => a.absFrame - b.absFrame);
  const framePosition = new Map<string, number>();
  const frameKeysByAbsFrame = new Map<number, { key: string; pos: number }[]>();
  for (let i = 0; i < allDamageFrameKeys.length; i++) {
    const f = allDamageFrameKeys[i];
    framePosition.set(f.key, i);
    let arr = frameKeysByAbsFrame.get(f.absFrame);
    if (!arr) { arr = []; frameKeysByAbsFrame.set(f.absFrame, arr); }
    arr.push({ key: f.key, pos: i });
  }

  for (const ev of events) {
    let effectiveColumnId = isUltEnhanced(ev.id) ? NounType.ULTIMATE : ev.columnId;
    let col = colLookup.get(`${ev.ownerEntityId}-${effectiveColumnId}`)
      ?? colLookup.get(`${ev.ownerEntityId}-${ev.columnId}`);

    // Status events with an operator source: attribute to the source operator's slot
    // via the source skill's eventIdType. Examples:
    //  - IMPROVISED_EXPLOSIVE explosion frame (enemy-owned) → source operator's BATTLE col
    //  - SATURATED_DEFENSE_RETALIATION_BURST (operator-owned, burst column) → same source
    //    operator's BATTLE col (the burst is triggered by the operator's BS shield)
    // The fallback runs whenever the primary columnId lookup failed — we don't gate on
    // "owner != source slot" because an operator-owned status column (e.g. the burst)
    // still needs routing through its source skill to find a valid mini-timeline column.
    let resolvedEntityId = ev.ownerEntityId;
    if (!col && ev.sourceEntityId) {
      // Reverse-lookup: source operator ID → slot ID via opToSlotCache
      const sourceSlotId = opToSlotCache.get(ev.sourceEntityId);
      if (sourceSlotId) {
        const sourceSkillCol = ev.sourceSkillName
          ? getSourceSkillColumnId(ev.sourceEntityId, ev.sourceSkillName)
          : NounType.BATTLE;
        col = colLookup.get(`${sourceSlotId}-${sourceSkillCol}`);
        effectiveColumnId = sourceSkillCol;
        resolvedEntityId = sourceSlotId;
      }
    }
    if (!col) continue;

    const eventName = getEventDisplayName(ev.name);
    const opData = opCache.get(resolvedEntityId);
    const operatorId = opIdCache.get(resolvedEntityId);
    const props = loadoutStats[resolvedEntityId] ?? DEFAULT_LOADOUT_PROPERTIES;
    const skillLevel = getSkillLevel(effectiveColumnId, props);
    const potential = (props.operator.potential ?? 5) as Potential;

    // Look up default segments for max frame counts (users can delete frames)
    const defaultSegs = col.eventVariants?.find((v) => v.id === ev.id)?.segments
      ?? col.defaultEvent?.segments;

    if (ev.segments.length > 0) {
      let segmentFrameOffset = 0;
      let damageSegIdx = 0;
      for (let si = 0; si < ev.segments.length; si++) {
        const seg = ev.segments[si];
        const segLabel = seg.properties.name ?? `Segment ${si + 1}`;
        const isDmgSeg = isDamageSegment(seg.properties.segmentTypes);

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

            // Runtime stat deltas from status effects (e.g. SF Minor APPLY STAT DAMAGE_BONUS HEAT)
            const accumulator = getLastStatAccumulator();
            const currentFrameKey = `${ev.uid}:${si}:${fi}`;
            const operatorDeltas = accumulator?.getFrameStatDeltas(currentFrameKey, ev.ownerEntityId);
            // Team-wide stat deltas (e.g. Wildland Trekker APPLY STAT DAMAGE_BONUS ELECTRIC to TEAM)
            const teamDeltas = accumulator?.getFrameStatDeltas(currentFrameKey, TEAM_ID);
            // Merge operator + team deltas so team-wide buffs affect individual operators
            const runtimeDeltas = mergeStatDeltas(operatorDeltas, teamDeltas);
            // Enemy-side runtime stat deltas (e.g. WEAKNESS applied by status clauses).
            const enemyRuntimeDeltas = accumulator?.getFrameStatDeltas(currentFrameKey, ENEMY_ID);

            if (frame.frameSkipped) {
              // All conditional clauses evaluated and none matched — row shows "-"
            } else if (operatorId && opData) {
              let segmentMultiplier: number | null;
              let isPerTick = false;

              // Resolve which CHANCE branch to show: pin wins, mode is default.
              const chancePin = overrides?.[buildOverrideKey(ev)]?.segments?.[si]?.frames?.[fi]?.isChance;
              const chanceHit = shouldFireChance(resolvedCritMode, chancePin);
              // Find the DEAL DAMAGE from the active branch (hit or else).
              const dealInfo = findDealDamageInClauses(frame.clauses, chanceHit);
              if (dealInfo && dealInfo.multipliers.length > 0) {
                const levelIdx = Math.min(skillLevel - 1, dealInfo.multipliers.length - 1);
                multiplier = dealInfo.multipliers[levelIdx];
                segmentMultiplier = null;
                isPerTick = true;
              } else if (dealInfo?.multiplierNode) {
                // Compound expression (MULT, ADD, etc.) — resolve with full context
                const ctx = buildContextForSkillColumn(props, effectiveColumnId);
                if (ctx) {
                  ctx.potential = potential;
                }
                ctx.getStatusStacks = (statusId: string) => {
                  if (!statusQuery) return 0;
                  return statusQuery.getActiveOperatorStatusStacks(absFrame, ev.ownerEntityId, statusId);
                };
                ctx.getEnemyStatusStacks = (statusId: string) => {
                  if (!statusQuery) return 0;
                  // Parse "<ELEMENT>_SUSCEPTIBILITY" → element
                  if (isQualifiedId(statusId, StatusType.SUSCEPTIBILITY)) {
                    const elem = statusId.slice(0, -(StatusType.SUSCEPTIBILITY.length + 1)) as ElementType;
                    return statusQuery.getActiveSusceptibilityStacks(absFrame, elem);
                  }
                  return 0;
                };
                multiplier = resolveValueNode(dealInfo.multiplierNode as ValueNode, ctx);
                segmentMultiplier = null;
                isPerTick = true;
              } else {
                multiplier = getSkillMultiplier(
                  operatorId,
                  ev.id as string,
                  damageSegIdx,
                  skillLevel,
                  potential,
                );

                // Segment multiplier is for the entire segment; divide by max frame count
                segmentMultiplier = multiplier;
                if (multiplier != null && maxFrames > 1) {
                  multiplier = multiplier / maxFrames;
                }
              }

              if (multiplier != null && multiplier > 0) {
                // Intra-frame ordering: exclude statuses created by this or later
                // damage frames at the same absFrame so they don't affect this frame's damage.
                const currentFrameKey = `${ev.uid}:${si}:${fi}`;
                const currentPos = framePosition.get(currentFrameKey);
                if (statusQuery && currentPos !== undefined) {
                  const sameFrame = frameKeysByAbsFrame.get(absFrame);
                  if (sameFrame && sameFrame.length > 1) {
                    const excludeKeys = new Set<string>();
                    for (const entry of sameFrame) {
                      if (entry.pos >= currentPos) excludeKeys.add(entry.key);
                    }
                    statusQuery.setFrameExclusion(absFrame, excludeKeys);
                  }
                }

                // Get element from inline DEAL DAMAGE, frame marker, or skill column
                const frameElement = dealInfo?.element
                  ?? frame.damageElement
                  ?? col.skillElement;
                const element = (frameElement as ElementType) ?? opData.element;

                // Damage bonus group
                const elementBonusStat = getElementDamageBonusStat(element);
                const skillType = columnIdToSkillType(effectiveColumnId);
                const skillTypeBonusStat = getSkillTypeDamageBonusStat(skillType);
                const isArts = element !== ElementType.PHYSICAL && element !== ElementType.NONE;
                const isStaggered = statusQuery?.isStaggered(absFrame) ?? false;

                // Look up pre-computed crit snapshot (stepped chronologically in the pre-pass)
                const isDot = frame.damageType === DamageType.DAMAGE_OVER_TIME;
                const canCrit = !isDot;
                const earlySnapshot = canCrit ? critSnapshots.get(`${ev.uid}:${si}:${fi}`) : undefined;
                if (earlySnapshot && resolvedCritMode === CritMode.EXPECTED) {
                  frame.expectedCritRate = earlySnapshot.expectedCritRate;
                }
                // Use the model's expectedStatDeltas for all modes.
                // The model was stepped with the mode's E(T) (via getFrameExpectation),
                // so the deltas already reflect the correct stack accumulation per mode.
                const critDeltas = earlySnapshot?.expectedStatDeltas;

                // Runtime stat helper: base + runtime deltas from status effects
                const rd = runtimeDeltas;
                const stat = (s: StatType) => (opData.stats[s] ?? 0) + (rd?.[s] ?? 0);

                // Damage Bonus sub-components
                const allElementDmgBonuses = {
                  [ElementType.NONE]: stat(StatType.PHYSICAL_DAMAGE_BONUS),
                  [ElementType.PHYSICAL]: stat(StatType.PHYSICAL_DAMAGE_BONUS),
                  [ElementType.HEAT]: stat(StatType.HEAT_DAMAGE_BONUS),
                  [ElementType.CRYO]: stat(StatType.CRYO_DAMAGE_BONUS),
                  [ElementType.NATURE]: stat(StatType.NATURE_DAMAGE_BONUS),
                  [ElementType.ELECTRIC]: stat(StatType.ELECTRIC_DAMAGE_BONUS),
                } as Record<ElementType, number>;
                // Add crit-dependent element DMG deltas to the per-element map
                if (critDeltas) {
                  const elementStatMap: Partial<Record<ElementType, StatType>> = {
                    [ElementType.PHYSICAL]: StatType.PHYSICAL_DAMAGE_BONUS,
                    [ElementType.NONE]: StatType.PHYSICAL_DAMAGE_BONUS,
                    [ElementType.HEAT]: StatType.HEAT_DAMAGE_BONUS,
                    [ElementType.CRYO]: StatType.CRYO_DAMAGE_BONUS,
                    [ElementType.NATURE]: StatType.NATURE_DAMAGE_BONUS,
                    [ElementType.ELECTRIC]: StatType.ELECTRIC_DAMAGE_BONUS,
                  };
                  for (const [el, stat] of Object.entries(elementStatMap)) {
                    const delta = critDeltas[stat as StatType] ?? 0;
                    if (delta > 0) {
                      allElementDmgBonuses[el as ElementType] = (allElementDmgBonuses[el as ElementType] ?? 0) + delta;
                    }
                  }
                }

                // Element and skill damage bonuses (with runtime + crit-dependent deltas)
                const critElementDelta = critDeltas?.[elementBonusStat] ?? 0;
                const subElementDmg = stat(elementBonusStat) + critElementDelta;
                const critSkillTypeDelta = critDeltas?.[skillTypeBonusStat] ?? 0;
                const subSkillTypeDmg = stat(skillTypeBonusStat) + critSkillTypeDelta;
                const critSkillDelta = critDeltas?.[StatType.SKILL_DAMAGE_BONUS] ?? 0;
                const subSkillDmg = stat(StatType.SKILL_DAMAGE_BONUS) + critSkillDelta;
                const critArtsDelta = isArts ? (critDeltas?.[StatType.ARTS_DAMAGE_BONUS] ?? 0) : 0;
                const subArtsDmg = isArts ? stat(StatType.ARTS_DAMAGE_BONUS) + critArtsDelta : 0;
                const subStaggerDmg = isStaggered ? stat(StatType.STAGGER_DAMAGE_BONUS) : 0;
                const isFinalStrike = frame.frameTypes?.includes(EventFrameType.FINAL_STRIKE) ?? false;
                const subFinalStrikeDmg = isFinalStrike ? stat(StatType.FINAL_STRIKE_DAMAGE_BONUS) : 0;

                const multiplierGroup = getDamageBonus(
                  subElementDmg, subSkillTypeDmg, subSkillDmg, subArtsDmg, subStaggerDmg + subFinalStrikeDmg,
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
                  subIgnoredRes = statusQuery.getIgnoredResistance(absFrame, element, ev.ownerEntityId);
                  if (subIgnoredRes > 0) {
                    resMultiplier += subIgnoredRes / 100;
                  }
                }

                // Crit multiplier — unified via getFrameExpectation()
                // Deterministic modes (NEVER/ALWAYS/EXPECTED) are authoritative over pins.
                // Pins only matter for MANUAL.
                let frameCrit: boolean | undefined;
                let expectedCrit: number;
                const critSnapshot = earlySnapshot;
                if (!canCrit) {
                  expectedCrit = 1;
                } else {
                  const critPin = overrides?.[buildOverrideKey(ev)]?.segments?.[si]?.frames?.[fi]?.isCritical;
                  if (resolvedCritMode === CritMode.ALWAYS || resolvedCritMode === CritMode.EXPECTED) {
                    frameCrit = true;
                  } else if (resolvedCritMode === CritMode.NEVER) {
                    frameCrit = false;
                  } else {
                    // MANUAL: use pin, default false
                    frameCrit = critPin ?? false;
                  }

                  // Unified: critMultiplier = 1 + critDamage × expectation
                  const expectation = getFrameExpectation(resolvedCritMode, critSnapshot, frameCrit, opData.critRate);
                  expectedCrit = 1 + opData.critDamage * expectation;
                }

                // Finisher: applies when the event is a finisher attack during stagger break
                const isFinisher = ev.id === NounType.FINISHER;
                const enemyTier = modelEnemy?.tier ?? EnemyTierType.COMMON;

                // Link bonus depends on stacks and skill type (battle skill vs ultimate)
                const linkBonus = statusQuery?.getLinkBonus(absFrame, skillType) ?? 0;

                // Sub-component arrays for multiplicative multipliers
                // WEAKNESS is read from the enemy's runtime stat delta (base 1, multiplied
                // by each APPLY STAT WEAKNESS from status clauses). Current value = 1 + delta.
                const weaknessStatValue = 1 + (enemyRuntimeDeltas?.[StatType.WEAKNESS] ?? 0);
                const subDmgReductionEffects = statusQuery?.getDmgReductionEffects(absFrame) ?? [];
                const subProtectionEffects = statusQuery?.getProtectionEffects(absFrame) ?? [];
                const subFragilityBonus = statusQuery?.getFragilityBonus(absFrame, element) ?? 0;

                const sub: DamageSubComponents = {
                  operatorBaseAttack: opData.operatorBaseAttack,
                  weaponBaseAttack: opData.weaponBaseAttack,
                  atkBonusPct: opData.atkBonusPct + (rd?.[StatType.ATTACK_BONUS] ?? 0) + (critDeltas?.[StatType.ATTACK_BONUS] ?? 0),
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
                  critMode: critMode ?? CritMode.EXPECTED,
                  isCrit: frameCrit,
                  critSnapshot,
                  baseResistance,
                  corrosionReduction: subCorrosionReduction,
                  ignoredResistance: subIgnoredRes,
                  fragilityBonus: subFragilityBonus,
                  fragilitySources: statusQuery?.getFragilitySources(absFrame, element) ?? [],
                  allFragilitySources: statusQuery ? buildAllElementSources(absFrame, statusQuery, 'fragility') : {},
                  susceptibilitySources: statusQuery?.getSusceptibilitySources(absFrame, element) ?? [],
                  allSusceptibilitySources: statusQuery ? buildAllElementSources(absFrame, statusQuery, 'susceptibility') : {},
                  ampSources: buildAmpSources(statusQuery?.getAmpSources(absFrame, element) ?? [], rd, mergeStatSources(accumulator?.getFrameStatSources(currentFrameKey, ev.ownerEntityId, StatType.AMP), accumulator?.getFrameStatSources(currentFrameKey, TEAM_ID, StatType.AMP))),
                  allAmpSources: buildAllAmpSources(absFrame, element, statusQuery, rd, accumulator, currentFrameKey, ev.ownerEntityId),
                  weaknessStatValue,
                  weaknessSources: (accumulator?.getFrameStatSources(currentFrameKey, ENEMY_ID, StatType.WEAKNESS) ?? []).map(s => ({
                    label: s.label,
                    value: s.value,
                    category: NounType.WEAKNESS,
                  })),
                  dmgReductionEffects: subDmgReductionEffects,
                  dmgReductionSources: statusQuery?.getDmgReductionSources(absFrame) ?? [],
                  protectionEffects: subProtectionEffects,
                  protectionSources: statusQuery?.getProtectionSources(absFrame) ?? [],
                  segmentMultiplier: segmentMultiplier ?? undefined,
                  segmentFrameCount: (segmentMultiplier != null && maxFrames > 1) ? maxFrames : undefined,
                  isPerTickMultiplier: isPerTick,
                  statSources: critSnapshot?.statContributions
                    ? mergeRuntimeStatSources(opData.statSources, critSnapshot.statContributions)
                    : opData.statSources,
                  statContributions: critSnapshot?.statContributions,
                  skillTypeDmgBonusStat: skillTypeBonusStat,
                };

                // Compute attack with runtime + crit-dependent ATK% adjustment
                const runtimeAtkDelta = rd?.[StatType.ATTACK_BONUS] ?? 0;
                const critAtkDelta = critDeltas?.[StatType.ATTACK_BONUS] ?? 0;
                const totalAtkDelta = runtimeAtkDelta + critAtkDelta;
                const effectiveAttack = totalAtkDelta > 0
                  ? getTotalAttack(opData.operatorBaseAttack, opData.weaponBaseAttack, opData.atkBonusPct + totalAtkDelta, opData.flatAtkBonuses)
                  : opData.totalAttack;
                const mainStatValue = dealInfo?.mainStat === DamageScalingStatType.DEFENSE ? opData.totalDefense
                  : dealInfo?.mainStat === DamageScalingStatType.HP ? opData.effectiveHp
                  : effectiveAttack;

                // CHANCE gate: when this DEAL DAMAGE is nested inside a CHANCE
                // compound, the row fires only if the frame's isChance pin (or
                // mode-driven default) resolves to hit. Miss → skip the row
                // entirely (no damage, no multiplier dilution). Pure pin-driven;
                // the probability in the CHANCE wrapper is display-only and has
                // no effect here.
                // No per-row CHANCE gating needed — findDealDamageInClauses
                // already selected the right branch (hit or else) based on
                // the chanceHit parameter above.

                params = {
                  attack: mainStatValue,
                  baseMultiplier: multiplier,
                  attributeBonus: opData.attributeBonus,
                  multiplierGroup,
                  critMultiplier: expectedCrit,
                  ampMultiplier: getAmpMultiplier((statusQuery?.getAmpBonus(absFrame, element) ?? 0) + (rd?.[StatType.AMP] ?? 0)),
                  staggerMultiplier: getStaggerMultiplier(isStaggered),
                  finisherMultiplier: getFinisherMultiplier(enemyTier, isFinisher),
                  linkMultiplier: getLinkMultiplier(linkBonus, linkBonus > 0),
                  weaknessMultiplier: weaknessStatValue,
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
                statusQuery?.clearFrameExclusion();
              }
            }

            const chancePin2 = overrides?.[buildOverrideKey(ev)]?.segments?.[si]?.frames?.[fi]?.isChance;
            const rowDealInfo = findDealDamageInClauses(frame.clauses, shouldFireChance(resolvedCritMode, chancePin2));
            const rowElement = ((rowDealInfo?.element ?? frame.damageElement ?? col.skillElement) as ElementType | undefined) ?? opData?.element;
            rows.push({
              key: `${ev.uid}-s${si}-f${fi}`,
              absoluteFrame: absFrame,
              label: `${eventName} > ${segLabel} > Frame ${fi + 1}`,
              columnKey: col.key,
              ownerEntityId: resolvedEntityId,
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
              element: rowElement,
            });
          }
        }
        segmentFrameOffset += seg.properties.duration;
        if (isDmgSeg) damageSegIdx++;
      }
    }
  }

  // ── Arts reaction damage rows ──────────────────────────────────────────────
  // Find reaction events on the enemy timeline and compute their damage
  // using the triggering operator's loadout.
  for (const ev of events) {
    if (ev.ownerEntityId !== ENEMY_ID || !REACTION_COLUMN_IDS.has(ev.columnId)) continue;
    if (!ev.sourceEntityId) continue;

    // Look up triggering operator's calc data
    const sourceOpData = opCache.get(ev.sourceEntityId);
    const sourceProps = loadoutStats[ev.sourceEntityId] ?? DEFAULT_LOADOUT_PROPERTIES;
    if (!sourceOpData || !modelEnemy) continue;

    const sourceOperatorId = opIdCache.get(ev.sourceEntityId) ?? undefined;
    const opCtx: ReactionOperatorContext = {
      totalAttack: sourceOpData.totalAttack,
      artsIntensity: sourceOpData.stats[StatType.ARTS_INTENSITY] ?? 0,
      operatorLevel: sourceProps.operator.level,
      operatorId: sourceOperatorId,
      potential: sourceProps.operator.potential,
    };

    // Find a column key for this reaction — use the source operator's OTHER column
    const sourceCol = colLookup.get(`${ev.sourceEntityId}-${OPERATOR_COLUMNS.OTHER}`)
      ?? colLookup.get(`${ev.sourceEntityId}-basic`);
    const columnKey = sourceCol ? sourceCol.key : `${ev.sourceEntityId}-${ev.columnId}`;

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
    if (col.type !== ColumnType.MINI_TIMELINE) continue;
    if (col.source !== TimelineSourceType.OPERATOR) continue;
    if ((col as MiniTimeline).derived) continue;
    if (EXCLUDED_SHEET_COLUMNS.has(col.columnId)) continue;
    result.push({
      key: col.key,
      label: col.label,
      ownerEntityId: col.ownerEntityId,
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
  ownerEntityId: string;
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
    if (!ownerMap.has(col.ownerEntityId)) {
      ownerOrder.push(col.ownerEntityId);
      ownerMap.set(col.ownerEntityId, []);
    }
    ownerMap.get(col.ownerEntityId)!.push(col);
  }
  return ownerOrder.map((ownerEntityId) => {
    const cols = ownerMap.get(ownerEntityId)!;
    const slot = slots.find((s) => s.slotId === ownerEntityId);
    return {
      key: `collapsed-${ownerEntityId}`,
      ownerEntityId,
      label: slot?.operator?.name ?? ownerEntityId,
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
    if (!operatorMap.has(col.ownerEntityId)) {
      operatorMap.set(col.ownerEntityId, { total: 0, columns: [] });
    }
    const colTotal = columnTotals.get(col.key) ?? 0;
    const opEntry = operatorMap.get(col.ownerEntityId)!;
    opEntry.total += colTotal;
    opEntry.columns.push([col.key, colTotal]);
  }

  const operators: OperatorDamageStats[] = [];
  operatorMap.forEach((data, ownerEntityId) => {
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
      ownerEntityId,
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
      highestTick = { damage: row.damage, label: row.label, ownerEntityId: row.ownerEntityId };
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
