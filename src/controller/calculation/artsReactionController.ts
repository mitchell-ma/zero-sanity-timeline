/**
 * Arts Reaction Controller — computes damage for arts reactions.
 *
 * Knows about the triggering operator's loadout and provides the damage formula
 * calculator with the necessary parameters (ATK, Arts Intensity, hidden multiplier,
 * status base multiplier) to compute reaction damage.
 *
 * Status damage formula:
 *   StatusDamage = Attack × StatusBaseMultiplier × ArtsIntensityMultiplier
 *               × HiddenMultiplier × DefenseMultiplier × ResistanceMultiplier
 *               × SusceptibilityMultiplier × WeaknessMultiplier
 *               × FragilityMultiplier × DMGReductionMultiplier
 */

import { DamageType, ElementType, StatType, StatusType } from '../../consts/enums';
import { ENEMY_ID, REACTION_COLUMNS } from '../../model/channels';
import { getLastStatAccumulator } from '../timeline/eventQueueController';
import type { StatusLevel } from '../../consts/types';
import { TimelineEvent, eventEndFrame } from '../../consts/viewTypes';
import { resolveEventLabel } from '../timeline/eventPresentationController';
import { t } from '../../locales/locale';
import {
  StatusDamageParams,
  calculateStatusDamage,
  getArtsReactionBaseMultiplier,
  getCombustionDotMultiplier,
  getDmgReductionMultiplier,
  getShatterBaseMultiplier,
  getArtsHiddenMultiplier,
  getArtsIntensityMultiplier,
  getDefenseMultiplier,
  getResistanceMultiplier,
  getSusceptibilityMultiplier,
  getFragilityMultiplier,
  getWeaknessMultiplier,
} from '../../model/calculation/damageFormulas';
import { Enemy } from '../../model/enemies/enemy';
import type { DamageTableRow } from './damageTableBuilder';
import type { EventsQueryService } from '../timeline/eventsQueryService';
import { FPS } from '../../utils/timeline';

// ── Constants ────────────────────────────────────────────────────────────────

const COMBUSTION_TICKS = 10; // 1 per second for 10 seconds
const MAX_STATUS_LEVEL: StatusLevel = 4;

/** Maps reaction columnId to the element it deals damage as. */
const REACTION_ELEMENT: Record<string, ElementType> = {
  combustion:      ElementType.HEAT,
  solidification:  ElementType.CRYO,
  corrosion:       ElementType.NATURE,
  electrification: ElementType.ELECTRIC,
  shatter:         ElementType.PHYSICAL,
};

// ── Operator context for reaction damage ─────────────────────────────────────

/** Minimal operator data needed for reaction damage computation. */
export interface ReactionOperatorContext {
  /** Total ATK: (operator + weapon) × (1 + ATK%) + flat bonuses. */
  totalAttack: number;
  /** Operator's Arts Intensity stat. */
  artsIntensity: number;
  /** Operator level (for hidden multiplier). */
  operatorLevel: number;
  /** Operator ID for potential-dependent reaction bonuses. */
  operatorId?: string;
  /** Operator potential (0–5). */
  potential?: number;
}

// ── Reaction damage results ─────────────────────────────────────────────────

export interface ReactionDamageTick {
  /** Absolute frame of this tick. */
  absoluteFrame: number;
  /** Label for display. */
  label: string;
  /** Computed damage for this tick. */
  damage: number;
  /** Full calculation parameters for breakdown display. */
  params: StatusDamageParams;
  /** Damage type: NORMAL or DAMAGE_OVER_TIME. */
  damageType?: DamageType;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

const ARTS_ELEMENTS_FOR_STAT: ReadonlySet<ElementType> = new Set([
  ElementType.HEAT, ElementType.CRYO, ElementType.NATURE, ElementType.ELECTRIC,
]);

/** Read one stat from the enemy accumulator, guarded by registered-StatType. */
function readEnemyStatIfExists(key: string): number {
  if (!(Object.values(StatType) as string[]).includes(key)) return 0;
  return getLastStatAccumulator()?.getStat(ENEMY_ID, key as StatType) ?? 0;
}

/** Read enemy's effective SUSCEPTIBILITY stat for `element`: per-element
 *  (HEAT_SUSCEPTIBILITY etc.) plus ARTS_SUSCEPTIBILITY when `element` is an
 *  arts element. Mirrors damageTableBuilder so APPLY STAT flows into reaction
 *  damage multipliers. */
function getEnemySusceptibilityStat(element: ElementType): number {
  let sum = readEnemyStatIfExists(`${element}_${StatusType.SUSCEPTIBILITY}`);
  if (ARTS_ELEMENTS_FOR_STAT.has(element)) {
    sum += readEnemyStatIfExists(`${ElementType.ARTS}_${StatusType.SUSCEPTIBILITY}`);
  }
  return sum;
}

/** Read enemy's effective FRAGILITY stat for `element`. Same umbrella logic
 *  as susceptibility — arts damage reads the per-element stat plus
 *  ARTS_FRAGILITY. */
function getEnemyFragilityStat(element: ElementType): number {
  let sum = readEnemyStatIfExists(`${element}_${StatusType.FRAGILITY}`);
  if (ARTS_ELEMENTS_FOR_STAT.has(element)) {
    sum += readEnemyStatIfExists(`${ElementType.ARTS}_${StatusType.FRAGILITY}`);
  }
  return sum;
}

/** Read one operator stat from the accumulator, guarded by registered StatType. */
function readOperatorStatIfExists(entityId: string, key: string): number {
  if (!(Object.values(StatType) as string[]).includes(key)) return 0;
  return getLastStatAccumulator()?.getStat(entityId, key as StatType) ?? 0;
}

/** Resistance addback for `element` from operator RESISTANCE_IGNORE +
 *  enemy RESISTANCE_REDUCTION (with ARTS umbrella for arts elements).
 *  Corrosion contributes via per-segment APPLY ARTS RESISTANCE_REDUCTION
 *  STAT clauses (see processInfliction.buildCorrosionSegments) — already
 *  in the accumulator, no special case needed. */
function getResistanceAddback(element: ElementType, sourceEntityId: string | undefined): number {
  let sum = 0;
  sum += readEnemyStatIfExists(`${element}_RESISTANCE_REDUCTION`);
  if (sourceEntityId) sum += readOperatorStatIfExists(sourceEntityId, `${element}_RESISTANCE_IGNORE`);
  if (ARTS_ELEMENTS_FOR_STAT.has(element)) {
    sum += readEnemyStatIfExists(`${ElementType.ARTS}_RESISTANCE_REDUCTION`);
    if (sourceEntityId) sum += readOperatorStatIfExists(sourceEntityId, `${ElementType.ARTS}_RESISTANCE_IGNORE`);
  }
  return sum;
}

/**
 * Build the shared base StatusDamageParams for a reaction, minus the
 * status-specific base multiplier (which differs for initial vs DoT/shatter).
 */
function buildBaseParams(
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  element: ElementType,
  statusQuery?: EventsQueryService,
  frame?: number,
  sourceEntityId?: string,
): Omit<StatusDamageParams, 'statusBaseMultiplier'> {
  return {
    attack: opCtx.totalAttack,
    artsIntensityMultiplier: getArtsIntensityMultiplier(opCtx.artsIntensity),
    hiddenMultiplier: getArtsHiddenMultiplier(opCtx.operatorLevel),
    defenseMultiplier: getDefenseMultiplier(modelEnemy.getDef()),
    resistanceMultiplier: (() => {
      let res = getResistanceMultiplier(modelEnemy, element);
      const addback = getResistanceAddback(element, sourceEntityId);
      if (addback !== 0) res += addback / 100;
      return res;
    })(),
    susceptibilityMultiplier: getSusceptibilityMultiplier(
      (statusQuery && frame != null ? statusQuery.getSusceptibilityBonus(frame, element) : 0)
      + getEnemySusceptibilityStat(element),
    ),
    weaknessMultiplier: getWeaknessMultiplier(
      getLastStatAccumulator()?.getStat(ENEMY_ID, StatType.WEAKNESS) ?? 1,
    ),
    fragilityMultiplier: getFragilityMultiplier(
      (statusQuery && frame != null ? statusQuery.getFragilityBonus(frame, element) : 0)
      + getEnemyFragilityStat(element),
    ),
    dmgReductionMultiplier: getDmgReductionMultiplier(
      statusQuery && frame != null ? statusQuery.getDmgReductionEffects(frame) : [],
    ),
  };
}

function isForced(ev: TimelineEvent): boolean {
  return !!ev.isForced;
}

function getStacks(ev: TimelineEvent): StatusLevel {
  return Math.min(ev.statusLevel ?? 1, MAX_STATUS_LEVEL) as StatusLevel;
}

/**
 * Build the initial reaction damage tick (shared by all reaction types).
 * Returns null if the reaction is forced (no initial damage).
 */
function buildInitialTick(
  reactionEvent: TimelineEvent,
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  element: ElementType,
  statusQuery?: EventsQueryService,
): ReactionDamageTick | null {
  if (isForced(reactionEvent)) return null;

  const stackCount = reactionEvent.statusLevel ?? 1;
  const initialMultiplier = getArtsReactionBaseMultiplier(stackCount);
  const base = buildBaseParams(opCtx, modelEnemy, element, statusQuery, reactionEvent.startFrame, reactionEvent.sourceEntityId);
  const params: StatusDamageParams = { ...base, statusBaseMultiplier: initialMultiplier };
  return {
    absoluteFrame: reactionEvent.startFrame,
    label: `${resolveEventLabel(reactionEvent)} > ${t('reaction.initial')}`,
    damage: calculateStatusDamage(params),
    params,
  };
}

// ── Combustion ──────────────────────────────────────────────────────────────

/**
 * Combustion: initial hit + DoT ticks (12% + 12% per level, 1/sec for 10s).
 */
export function computeCombustionDamage(
  reactionEvent: TimelineEvent,
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  statusQuery?: EventsQueryService,
): ReactionDamageTick[] {
  const element = REACTION_ELEMENT[reactionEvent.columnId] ?? ElementType.HEAT;
  const stacks = getStacks(reactionEvent);
  const ticks: ReactionDamageTick[] = [];


  const initial = buildInitialTick(reactionEvent, opCtx, modelEnemy, element, statusQuery);
  if (initial) {
    ticks.push(initial);
  }

  const dotMultiplier = getCombustionDotMultiplier(stacks);
  for (let i = 1; i <= COMBUSTION_TICKS; i++) {
    const tickFrame = reactionEvent.startFrame + i * FPS;
    const reactionEndFrame = eventEndFrame(reactionEvent);
    if (tickFrame > reactionEndFrame) break;

    const dotBase = buildBaseParams(opCtx, modelEnemy, element, statusQuery, tickFrame, reactionEvent.sourceEntityId);
    const dotParams: StatusDamageParams = { ...dotBase, statusBaseMultiplier: dotMultiplier };
    ticks.push({
      absoluteFrame: tickFrame,
      label: `${resolveEventLabel(reactionEvent)} > ${t('reaction.dotTick', { n: i })}`,
      damage: calculateStatusDamage(dotParams),
      params: dotParams,
      damageType: DamageType.DAMAGE_OVER_TIME,
    });
  }

  return ticks;
}

// ── Solidification ──────────────────────────────────────────────────────────

/**
 * Solidification: initial hit only. Shatter is a separate reaction triggered
 * by physical status consumption of solidification.
 */
export function computeSolidificationDamage(
  reactionEvent: TimelineEvent,
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  statusQuery?: EventsQueryService,
): ReactionDamageTick[] {
  const element = REACTION_ELEMENT[reactionEvent.columnId] ?? ElementType.CRYO;
  const ticks: ReactionDamageTick[] = [];

  const initial = buildInitialTick(reactionEvent, opCtx, modelEnemy, element, statusQuery);
  if (initial) ticks.push(initial);

  return ticks;
}

/**
 * Shatter: single physical damage tick at frame 0.
 * Multiplier = 120% + 120% per solidification stack level (240%/360%/480%/600%).
 * Uses the trigger operator's stats (sourceEntityId on the shatter event).
 */
export function computeShatterDamage(
  reactionEvent: TimelineEvent,
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  statusQuery?: EventsQueryService,
): ReactionDamageTick[] {
  const element = REACTION_ELEMENT[reactionEvent.columnId] ?? ElementType.PHYSICAL;
  const stacks = getStacks(reactionEvent);
  const shatterMultiplier = getShatterBaseMultiplier(stacks);
  const base = buildBaseParams(opCtx, modelEnemy, element, statusQuery, reactionEvent.startFrame, reactionEvent.sourceEntityId);
  const params: StatusDamageParams = { ...base, statusBaseMultiplier: shatterMultiplier };
  return [{
    absoluteFrame: reactionEvent.startFrame,
    label: resolveEventLabel(reactionEvent),
    damage: calculateStatusDamage(params),
    params,
  }];
}

// ── Corrosion ───────────────────────────────────────────────────────────────

/**
 * Corrosion: initial hit only. The resistance reduction is a debuff, not damage.
 */
export function computeCorrosionDamage(
  reactionEvent: TimelineEvent,
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  statusQuery?: EventsQueryService,
): ReactionDamageTick[] {
  const element = REACTION_ELEMENT[reactionEvent.columnId] ?? ElementType.NATURE;
  const ticks: ReactionDamageTick[] = [];

  const initial = buildInitialTick(reactionEvent, opCtx, modelEnemy, element, statusQuery);
  if (initial) ticks.push(initial);

  return ticks;
}

// ── Electrification ─────────────────────────────────────────────────────────

/**
 * Electrification: initial hit only. The fragility buff is a debuff, not damage.
 */
export function computeElectrificationDamage(
  reactionEvent: TimelineEvent,
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  statusQuery?: EventsQueryService,
): ReactionDamageTick[] {
  const element = REACTION_ELEMENT[reactionEvent.columnId] ?? ElementType.ELECTRIC;
  const ticks: ReactionDamageTick[] = [];

  const initial = buildInitialTick(reactionEvent, opCtx, modelEnemy, element, statusQuery);
  if (initial) ticks.push(initial);

  return ticks;
}

// ── Unified entry point ─────────────────────────────────────────────────────

/**
 * Compute reaction damage ticks for any reaction type.
 */
export function computeReactionDamage(
  reactionEvent: TimelineEvent,
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  statusQuery?: EventsQueryService,
): ReactionDamageTick[] {
  switch (reactionEvent.columnId) {
    case REACTION_COLUMNS.COMBUSTION:      return computeCombustionDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    case REACTION_COLUMNS.SOLIDIFICATION:  return computeSolidificationDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    case REACTION_COLUMNS.CORROSION:       return computeCorrosionDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    case REACTION_COLUMNS.ELECTRIFICATION: return computeElectrificationDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    case REACTION_COLUMNS.SHATTER:         return computeShatterDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    default:                return [];
  }
}

// ── Integration with damage table ───────────────────────────────────────────

/**
 * Build damage table rows for any reaction event.
 */
export function buildReactionDamageRows(
  reactionEvent: TimelineEvent,
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  columnKey: string,
  statusQuery?: EventsQueryService,
): DamageTableRow[] {
  const ticks = computeReactionDamage(reactionEvent, opCtx, modelEnemy, statusQuery);

  return ticks.map((tick, i) => ({
    key: `${reactionEvent.uid}-reaction-${i}`,
    absoluteFrame: tick.absoluteFrame,
    label: tick.label,
    columnKey,
    ownerEntityId: reactionEvent.sourceEntityId ?? reactionEvent.ownerEntityId,
    columnId: reactionEvent.columnId,
    eventUid: reactionEvent.uid,
    segmentIndex: 0,
    frameIndex: i,
    damage: tick.damage,
    multiplier: tick.params.statusBaseMultiplier,
    segmentLabel: undefined,
    skillName: reactionEvent.columnId,
    hpRemaining: null,
    params: null,
    statusParams: tick.params,
    damageType: tick.damageType,
    element: REACTION_ELEMENT[reactionEvent.columnId],
  }));
}

