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
import { TimelineEvent } from '../../consts/viewTypes';
import { getOperatorJson } from '../../model/event-frames/operatorJsonLoader';
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
import type { StatusQueryService } from './statusQueryService';
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
  statusQuery?: StatusQueryService,
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

function getStatusLevel(ev: TimelineEvent): StatusLevel {
  const stacks = ev.inflictionStacks ?? 1;
  return Math.min(stacks, MAX_STATUS_LEVEL) as StatusLevel;
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
  statusQuery?: StatusQueryService,
): ReactionDamageTick | null {
  if (isForced(reactionEvent)) return null;

  const stacks = reactionEvent.inflictionStacks ?? 1;
  const initialMultiplier = getArtsReactionBaseMultiplier(stacks);
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
  statusQuery?: StatusQueryService,
): ReactionDamageTick[] {
  const element = REACTION_ELEMENT[reactionEvent.columnId] ?? ElementType.HEAT;
  const statusLevel = getStatusLevel(reactionEvent);
  const ticks: ReactionDamageTick[] = [];

  // Talent reaction multiplier (e.g. Laevatain P3 — Fragments from the Past: Combustion DMG x1.5)
  const reactionTalentMult = opCtx.operatorId
    ? getReactionTalentMultiplier(opCtx.operatorId, opCtx.potential ?? 0, reactionEvent.columnId)
    : 1;

  const initial = buildInitialTick(reactionEvent, 'Combustion', opCtx, modelEnemy, element, statusQuery);
  if (initial) {
    if (reactionTalentMult !== 1) {
      initial.damage = initial.damage * reactionTalentMult;
    }
    ticks.push(initial);
  }

  const dotMultiplier = getCombustionDotMultiplier(statusLevel);
  for (let i = 1; i <= COMBUSTION_TICKS; i++) {
    const tickFrame = reactionEvent.startFrame + i * FPS;
    const reactionEndFrame = reactionEvent.startFrame + reactionEvent.activationDuration;
    if (tickFrame > reactionEndFrame) break;

    const dotBase = buildBaseParams(opCtx, modelEnemy, element, statusQuery, tickFrame, reactionEvent.sourceOwnerId);
    const dotParams: StatusDamageParams = { ...dotBase, statusBaseMultiplier: dotMultiplier };
    ticks.push({
      absoluteFrame: tickFrame,
      label: `Combustion > DoT Tick ${i}`,
      damage: calculateStatusDamage(dotParams) * reactionTalentMult,
      params: dotParams,
      damageType: DamageType.DAMAGE_OVER_TIME,
    });
  }

  return ticks;
}

// ── Solidification ──────────────────────────────────────────────────────────

/**
 * Solidification: initial hit + shatter damage at the end of the duration.
 * Shatter = 120% + 120% ATK per status level.
 */
export function computeSolidificationDamage(
  reactionEvent: TimelineEvent,
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  statusQuery?: StatusQueryService,
): ReactionDamageTick[] {
  const element = REACTION_ELEMENT[reactionEvent.columnId] ?? ElementType.CRYO;
  const statusLevel = getStatusLevel(reactionEvent);
  const ticks: ReactionDamageTick[] = [];

  const initial = buildInitialTick(reactionEvent, 'Solidification', opCtx, modelEnemy, element, statusQuery);
  if (initial) ticks.push(initial);

  // Shatter at the end of the reaction duration
  const shatterFrame = reactionEvent.startFrame + reactionEvent.activationDuration;
  const shatterMultiplier = getShatterBaseMultiplier(statusLevel);
  const shatterBase = buildBaseParams(opCtx, modelEnemy, element, statusQuery, shatterFrame, reactionEvent.sourceOwnerId);
  const shatterParams: StatusDamageParams = { ...shatterBase, statusBaseMultiplier: shatterMultiplier };
  ticks.push({
    absoluteFrame: shatterFrame,
    label: 'Solidification > Shatter',
    damage: calculateStatusDamage(shatterParams),
    params: shatterParams,
  });

  return ticks;
}

// ── Corrosion ───────────────────────────────────────────────────────────────

/**
 * Corrosion: initial hit only. The resistance reduction is a debuff, not damage.
 */
export function computeCorrosionDamage(
  reactionEvent: TimelineEvent,
  opCtx: ReactionOperatorContext,
  modelEnemy: Enemy,
  statusQuery?: StatusQueryService,
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
  statusQuery?: StatusQueryService,
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
  statusQuery?: StatusQueryService,
): ReactionDamageTick[] {
  switch (reactionEvent.columnId) {
    case 'combustion':      return computeCombustionDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    case 'solidification':  return computeSolidificationDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    case 'corrosion':       return computeCorrosionDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
    case 'electrification': return computeElectrificationDamage(reactionEvent, opCtx, modelEnemy, statusQuery);
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
  statusQuery?: StatusQueryService,
): DamageTableRow[] {
  const ticks = computeReactionDamage(reactionEvent, opCtx, modelEnemy, statusQuery);

  return ticks.map((tick, i) => ({
    key: `${reactionEvent.id}-reaction-${i}`,
    absoluteFrame: tick.absoluteFrame,
    label: tick.label,
    columnKey,
    ownerId: reactionEvent.sourceOwnerId ?? reactionEvent.ownerId,
    columnId: reactionEvent.columnId,
    eventId: reactionEvent.id,
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

// ── Data-driven reaction talent multiplier ──────────────────────────────────

/** Reaction column ID → reaction type name mapping. */
const REACTION_COLUMN_TO_TYPE: Record<string, string> = {
  combustion: 'COMBUSTION',
  solidification: 'SOLIDIFICATION',
  corrosion: 'CORROSION',
  electrification: 'ELECTRIFICATION',
};

/**
 * Get the talent-based reaction damage multiplier for an operator.
 * Reads from talentEffects with bonusType === 'REACTION_MULTIPLIER'.
 * Supports both legacy format (source/minPotential/values) and
 * BASED_ON format (value with multi-dimensional lookup).
 */
function getReactionTalentMultiplier(operatorId: string, potential: number, reactionColumnId: string): number {
  const json = getOperatorJson(operatorId);
  if (!json?.talentEffects) return 1;

  const reactionType = REACTION_COLUMN_TO_TYPE[reactionColumnId];
  if (!reactionType) return 1;

  let multiplier = 1;
  for (const effect of json.talentEffects as any[]) {
    if (effect.bonusType !== 'REACTION_MULTIPLIER') continue;
    if (effect.condition?.reactionType !== reactionType) continue;

    if (effect.value?.verb === 'BASED_ON') {
      const resolved = resolveBasedOnValueForCalc(effect.value, { potential });
      if (resolved != null) multiplier *= resolved;
    }
  }

  return multiplier;
}

/**
 * Resolve a BASED_ON value block for damage calculation contexts.
 * Supports multi-dimensional lookups keyed by POTENTIAL, TALENT_LEVEL, SKILL_LEVEL.
 */
function resolveBasedOnValueForCalc(
  wp: Record<string, any>,
  ctx: { potential: number; talentLevel?: number; skillLevel?: number },
): number | undefined {
  if (wp.verb !== 'BASED_ON') return typeof wp.value === 'number' ? wp.value : undefined;

  const dims = wp.object;
  const val = wp.value;

  // Single dimension with flat array
  if (typeof dims === 'string' && Array.isArray(val)) {
    if (dims === 'POTENTIAL') {
      // Shouldn't be an array for potential, but handle gracefully
      return val[0];
    }
    const level = dims === 'TALENT_LEVEL' ? (ctx.talentLevel ?? 1)
      : dims === 'SKILL_LEVEL' ? (ctx.skillLevel ?? 12) : 1;
    return val[Math.min(level, val.length) - 1] ?? val[0];
  }

  // Multi-dimension with nested map
  if (Array.isArray(dims) && typeof val === 'object' && !Array.isArray(val)) {
    let current: any = val;
    for (const dim of dims as string[]) {
      if (typeof current !== 'object' || current === null) return undefined;
      const keys = Object.keys(current);
      let best: string | undefined;
      let bestN = -1;

      if (dim === 'POTENTIAL') {
        for (const k of keys) {
          const m = k.match(/^P(\d+)$/);
          if (!m) continue;
          const n = Number(m[1]);
          if (n <= ctx.potential && n > bestN) { bestN = n; best = k; }
        }
      } else {
        const level = dim === 'TALENT_LEVEL' ? (ctx.talentLevel ?? 1)
          : dim === 'SKILL_LEVEL' ? (ctx.skillLevel ?? 12) : 1;
        for (const k of keys) {
          const n = Number(k);
          if (!isNaN(n) && n <= level && n > bestN) { bestN = n; best = k; }
        }
      }

      if (!best) return undefined;
      current = current[best];
    }
    return typeof current === 'number' ? current : undefined;
  }

  return undefined;
}
