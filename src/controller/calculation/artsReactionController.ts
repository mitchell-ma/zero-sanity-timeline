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
 *               × SusceptibilityMultiplier × WeakenMultiplier
 *               × FragilityMultiplier × DMGReductionMultiplier
 */

import { DamageType, ElementType } from '../../consts/enums';
import { StatusLevel } from '../../consts/types';
import { TimelineEvent, eventEndFrame } from '../../consts/viewTypes';
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
  getWeakenMultiplier,
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
  sourceOwnerId?: string,
): Omit<StatusDamageParams, 'statusBaseMultiplier'> {
  return {
    attack: opCtx.totalAttack,
    artsIntensityMultiplier: getArtsIntensityMultiplier(opCtx.artsIntensity),
    hiddenMultiplier: getArtsHiddenMultiplier(opCtx.operatorLevel),
    defenseMultiplier: getDefenseMultiplier(modelEnemy.getDef()),
    resistanceMultiplier: (() => {
      let res = getResistanceMultiplier(modelEnemy, element);
      if (statusQuery && frame != null && element !== ElementType.PHYSICAL) {
        const corrosionReduction = statusQuery.getCorrosionResistanceReduction(frame);
        if (corrosionReduction > 0) {
          res += corrosionReduction / 100;
        }
        if (sourceOwnerId) {
          const ignoredRes = statusQuery.getIgnoredResistance(frame, element, sourceOwnerId);
          if (ignoredRes > 0) {
            res += ignoredRes / 100;
          }
        }
      }
      return res;
    })(),
    susceptibilityMultiplier: getSusceptibilityMultiplier(
      statusQuery && frame != null ? statusQuery.getSusceptibilityBonus(frame, element) : 0,
    ),
    weakenMultiplier: getWeakenMultiplier(
      statusQuery && frame != null ? statusQuery.getWeakenEffects(frame) : [],
    ),
    fragilityMultiplier: getFragilityMultiplier(
      statusQuery && frame != null ? statusQuery.getFragilityBonus(frame, element) : 0,
    ),
    dmgReductionMultiplier: getDmgReductionMultiplier(
      statusQuery && frame != null ? statusQuery.getDmgReductionEffects(frame) : [],
    ),
  };
}

function isForced(ev: TimelineEvent): boolean {
  return !!(ev.isForced || ev.forcedReaction);
}

function getStacks(ev: TimelineEvent): StatusLevel {
  return Math.min(ev.stacks ?? 1, MAX_STATUS_LEVEL) as StatusLevel;
}

/**
 * Build the initial reaction damage tick (shared by all reaction types).
 * Returns null if the reaction is forced (no initial damage).
 */
function buildInitialTick(
  reactionEvent: TimelineEvent,
  reactionLabel: string,
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  element: ElementType,
  statusQuery?: EventsQueryService,
): ReactionDamageTick | null {
  if (isForced(reactionEvent)) return null;

  const stackCount = reactionEvent.stacks ?? 1;
  const initialMultiplier = getArtsReactionBaseMultiplier(stackCount);
  const base = buildBaseParams(opCtx, modelEnemy, element, statusQuery, reactionEvent.startFrame, reactionEvent.sourceOwnerId);
  const params: StatusDamageParams = { ...base, statusBaseMultiplier: initialMultiplier };
  return {
    absoluteFrame: reactionEvent.startFrame,
    label: `${reactionLabel} > Initial`,
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


  const initial = buildInitialTick(reactionEvent, 'Combustion', opCtx, modelEnemy, element, statusQuery);
  if (initial) {
    ticks.push(initial);
  }

  const dotMultiplier = getCombustionDotMultiplier(stacks);
  for (let i = 1; i <= COMBUSTION_TICKS; i++) {
    const tickFrame = reactionEvent.startFrame + i * FPS;
    const reactionEndFrame = eventEndFrame(reactionEvent);
    if (tickFrame > reactionEndFrame) break;

    const dotBase = buildBaseParams(opCtx, modelEnemy, element, statusQuery, tickFrame, reactionEvent.sourceOwnerId);
    const dotParams: StatusDamageParams = { ...dotBase, statusBaseMultiplier: dotMultiplier };
    ticks.push({
      absoluteFrame: tickFrame,
      label: `Combustion > DoT Tick ${i}`,
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

  const initial = buildInitialTick(reactionEvent, 'Solidification', opCtx, modelEnemy, element, statusQuery);
  if (initial) ticks.push(initial);

  return ticks;
}

/**
 * Shatter: single physical damage tick at frame 0.
 * Multiplier = 120% + 120% per solidification stack level (240%/360%/480%/600%).
 * Uses the trigger operator's stats (sourceOwnerId on the shatter event).
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
  const base = buildBaseParams(opCtx, modelEnemy, element, statusQuery, reactionEvent.startFrame, reactionEvent.sourceOwnerId);
  const params: StatusDamageParams = { ...base, statusBaseMultiplier: shatterMultiplier };
  return [{
    absoluteFrame: reactionEvent.startFrame,
    label: 'Shatter',
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

  const initial = buildInitialTick(reactionEvent, 'Corrosion', opCtx, modelEnemy, element, statusQuery);
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

  const initial = buildInitialTick(reactionEvent, 'Electrification', opCtx, modelEnemy, element, statusQuery);
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
    case 'combustion':      return computeCombustionDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    case 'solidification':  return computeSolidificationDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    case 'corrosion':       return computeCorrosionDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    case 'electrification': return computeElectrificationDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    case 'shatter':         return computeShatterDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
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
    ownerId: reactionEvent.sourceOwnerId ?? reactionEvent.ownerId,
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
  }));
}

