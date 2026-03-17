/**
 * Ultimate energy controller — resolves how much ultimate energy each operator
 * actually gains when skills recover ultimate energy, based on each operator's
 * ultimate energy gain efficiency stat from their loadout.
 */

import { StatType } from '../../consts/enums';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../../view/OperatorLoadoutHeader';
import { LoadoutProperties, getDefaultLoadoutProperties } from '../../view/InformationPane';
import { Operator, TimelineEvent } from '../../consts/viewTypes';
import { aggregateLoadoutStats } from '../calculation/loadoutAggregator';
import { UltEnergyEvent } from './ultimateEnergyTimeline';
import { getOperatorJson } from '../../model/event-frames/operatorJsonLoader';
import { SKILL_COLUMNS } from '../../model/channels';
import { NATURAL_SP_TO_ULTIMATE_RATIO } from '../../consts/stats';
import { SkillPointConsumptionHistory } from './skillPointTimeline';

/** A raw gauge gain event before efficiency is applied. */
export interface RawGaugeGainEvent {
  frame: number;
  /** Slot ID of the skill's owner (who cast the skill). */
  sourceSlotId: string;
  /** Ultimate energy recovered for the source operator only. */
  selfGain: number;
  /** Ultimate energy recovered for all operators on the team. */
  teamGain: number;
}

/**
 * Resolves the ultimate gain efficiency multiplier for each operator slot
 * from their aggregated loadout stats.
 *
 * Returns a map of slotId → efficiency multiplier (e.g. 0.20 means +20%).
 */
export function resolveGainEfficiencies(
  operators: (Operator | null)[],
  slotIds: string[],
  loadouts: Record<string, OperatorLoadoutState>,
  loadoutProperties: Record<string, LoadoutProperties>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (let i = 0; i < slotIds.length; i++) {
    const op = operators[i];
    if (!op) continue;
    const slotId = slotIds[i];
    const agg = aggregateLoadoutStats(
      op.id,
      loadouts[slotId] ?? EMPTY_LOADOUT,
      loadoutProperties[slotId] ?? getDefaultLoadoutProperties(op),
    );
    if (agg) {
      result[slotId] = agg.stats[StatType.ULTIMATE_GAIN_EFFICIENCY] ?? 0;
    }
  }
  return result;
}

// ── Multi-dimensional BASED_ON resolver ──────────────────────────────────────

/** Context values for resolving BASED_ON lookups. */
interface ResolveContext {
  potential: number;
  talentLevel: number;
  skillLevel?: number;
}

/**
 * Maps a BASED_ON dimension type to the lookup key for the current context.
 * For threshold-based dimensions (POTENTIAL), finds the highest key <= actual value.
 */
function getDimensionKey(dimension: string, ctx: ResolveContext, keys: string[]): string | undefined {
  if (dimension === 'POTENTIAL') {
    // Keys are "P0", "P3", etc. Find highest Pn where n <= ctx.potential
    let best: string | undefined;
    let bestN = -1;
    for (const k of keys) {
      const m = k.match(/^P(\d+)$/);
      if (!m) continue;
      const n = Number(m[1]);
      if (n <= ctx.potential && n > bestN) { bestN = n; best = k; }
    }
    return best;
  }
  if (dimension === 'TALENT_LEVEL') {
    // Keys are "1", "2", etc. Find highest key <= ctx.talentLevel
    let best: string | undefined;
    let bestN = 0;
    for (const k of keys) {
      const n = Number(k);
      if (!isNaN(n) && n <= ctx.talentLevel && n > bestN) { bestN = n; best = k; }
    }
    return best;
  }
  if (dimension === 'SKILL_LEVEL') {
    const sl = ctx.skillLevel ?? 12;
    let best: string | undefined;
    let bestN = 0;
    for (const k of keys) {
      const n = Number(k);
      if (!isNaN(n) && n <= sl && n > bestN) { bestN = n; best = k; }
    }
    return best;
  }
  return undefined;
}

/**
 * Resolve a BASED_ON value block, supporting both single-dimension (array)
 * and multi-dimension (nested object) lookups.
 */
function resolveBasedOnValue(
  wp: Record<string, any>,
  ctx: ResolveContext,
): number | undefined {
  if (wp.verb !== 'BASED_ON') {
    return typeof wp.value === 'number' ? wp.value : undefined;
  }

  const dims = wp.object;
  const val = wp.value;

  // Single dimension: object is a string, value is a flat array
  if (typeof dims === 'string' && Array.isArray(val)) {
    if (dims === 'TALENT_LEVEL') {
      return val[Math.min(ctx.talentLevel, val.length) - 1] ?? val[0];
    }
    if (dims === 'SKILL_LEVEL') {
      const sl = ctx.skillLevel ?? 12;
      return val[Math.min(sl, val.length) - 1] ?? val[0];
    }
    return val[0];
  }

  // Multi-dimension: object is an array of dimension types, value is nested map
  if (Array.isArray(dims) && typeof val === 'object' && !Array.isArray(val)) {
    let current: any = val;
    for (const dim of dims) {
      if (typeof current !== 'object' || current === null) return undefined;
      const key = getDimensionKey(dim, ctx, Object.keys(current));
      if (!key) return undefined;
      current = current[key];
    }
    return typeof current === 'number' ? current : undefined;
  }

  return undefined;
}

/**
 * Computes Messenger's Song efficiency bonuses for each operator slot.
 * Reads the ENERGY_GAIN_EFFICIENCY clause effects from Gilberta's talent JSON,
 * resolves values by talent level, and applies to eligible operator classes.
 *
 * Returns a map of slotId → bonus (e.g. 0.04 or 0.07).
 */
export function resolveMessengersSongBonuses(
  operators: (Operator | null)[],
  slotIds: string[],
  loadoutProperties: Record<string, LoadoutProperties>,
): Record<string, number> {
  // Find the Messenger's Song source (Gilberta) on the team
  let sourceSlotId: string | undefined;
  let sourceOp: Operator | null = null;
  for (let i = 0; i < slotIds.length; i++) {
    const op = operators[i];
    if (!op || op.id !== 'gilberta') continue;
    sourceSlotId = slotIds[i];
    sourceOp = op;
    break;
  }
  if (!sourceSlotId || !sourceOp) return {};

  const props = loadoutProperties[sourceSlotId];
  const potential = props?.operator.potential ?? 0;
  const talentLevel = props?.operator.talentOneLevel ?? 1;
  if (talentLevel <= 0) return {};

  // Read clause effects from the talent JSON
  const opJson = getOperatorJson('gilberta');
  const statusEvents = opJson?.statusEvents as { name: string; clause?: { conditions: any[]; effects: any[] }[] }[] | undefined;
  const msDef = statusEvents?.find(se => se.name === 'MESSENGERS_SONG');
  if (!msDef?.clause) return {};

  // Collect class → bonus value from ENERGY_GAIN_EFFICIENCY effects
  const classBonuses = new Map<string, number>();
  for (const clause of msDef.clause) {
    if (clause.conditions?.length) continue;
    for (const effect of clause.effects ?? []) {
      const verb = effect.verb ?? effect.verbType;
      const object = effect.object ?? effect.objectType;
      if (verb !== 'APPLY' || object !== 'ENERGY_GAIN_EFFICIENCY') continue;

      const targetClass = effect.to as string;
      const wp = (effect.with ?? effect.withPreposition)?.value;
      if (!wp || !targetClass) continue;

      const value = resolveBasedOnValue(wp, { potential, talentLevel });
      if (value != null) classBonuses.set(targetClass, value);
    }
  }
  if (classBonuses.size === 0) return {};

  // Apply bonuses to eligible operators
  const result: Record<string, number> = {};
  for (let i = 0; i < slotIds.length; i++) {
    const op = operators[i];
    if (!op || op.id === 'gilberta') continue;
    const bonus = op.operatorClassType ? classBonuses.get(op.operatorClassType) : undefined;
    if (bonus != null) result[slotIds[i]] = bonus;
  }
  return result;
}

/**
 * Collects raw gauge gain events from timeline events.
 * Battle skills gain gauge on their first frame; combo skills gain on first frame too.
 * Battle skills also derive gauge from natural SP consumed.
 */
export function collectRawGaugeGains(
  events: TimelineEvent[],
  consumptionHistory: SkillPointConsumptionHistory[],
): RawGaugeGainEvent[] {
  const consumptionByEventId = new Map<string, SkillPointConsumptionHistory>();
  for (const rec of consumptionHistory) {
    consumptionByEventId.set(rec.eventId, rec);
  }

  const gaugeEvents: RawGaugeGainEvent[] = [];
  for (const ev of events) {
    if (ev.columnId === SKILL_COLUMNS.BATTLE) {
      // Battle skills: gauge gain happens on the first frame of the event
      const firstFrame = ev.segments?.[0]?.frames?.[0];
      const gainFrame = firstFrame?.absoluteFrame ?? ev.startFrame;
      const rec = consumptionByEventId.get(ev.id);
      if (rec) {
        const gain = rec.naturalConsumed * NATURAL_SP_TO_ULTIMATE_RATIO;
        if (gain > 0) {
          gaugeEvents.push({
            frame: gainFrame,
            sourceSlotId: ev.ownerId,
            selfGain: gain,
            teamGain: gain,
          });
        }
      }
      // Additional frame-level gauge gains (e.g. empowered battle skill extra ultimate recovery)
      if (firstFrame?.gaugeGain && firstFrame.gaugeGain > 0) {
        gaugeEvents.push({
          frame: gainFrame,
          sourceSlotId: ev.ownerId,
          selfGain: firstFrame.gaugeGain,
          teamGain: 0,
        });
      }
    } else if (ev.columnId === SKILL_COLUMNS.COMBO) {
      // Combo skills: gauge gain from the first frame
      const firstFrame = ev.segments?.[0]?.frames?.[0];
      const selfGain = firstFrame?.gaugeGain ?? 0;
      const teamGain = firstFrame?.teamGaugeGain ?? 0;
      if (selfGain > 0 || teamGain > 0) {
        gaugeEvents.push({
          frame: firstFrame?.absoluteFrame ?? ev.startFrame,
          sourceSlotId: ev.ownerId,
          selfGain,
          teamGain,
        });
      }
    }
  }
  gaugeEvents.sort((a, b) => a.frame - b.frame);
  return gaugeEvents;
}

/**
 * Applies ultimate gain efficiency to raw gauge gain events for a specific operator slot.
 *
 * Each operator has their own ultimate gain efficiency stat, so the same team-wide
 * recovery event will grant different amounts to different operators depending on
 * their individual efficiency.
 *
 * @param gaugeEvents - Raw gauge gain events (unsorted is fine, will be consumed in order)
 * @param slotId - The operator slot receiving the energy
 * @param efficiencyBonus - The operator's ULTIMATE_GAIN_EFFICIENCY stat (e.g. 0.20 = +20%)
 * @param ultActiveWindows - Frame ranges where the operator's ultimate is active (no gains)
 * @returns UltEnergyEvent[] gain events with efficiency applied
 */
export function applyGainEfficiency(
  gaugeEvents: readonly RawGaugeGainEvent[],
  slotId: string,
  efficiencyBonus: number,
  ultActiveWindows: readonly { start: number; end: number }[],
): UltEnergyEvent[] {
  const multiplier = 1 + efficiencyBonus;
  const gains: UltEnergyEvent[] = [];

  for (const ge of gaugeEvents) {
    // Skip gains during ultimate active phase
    if (ultActiveWindows.some(w => ge.frame >= w.start && ge.frame < w.end)) continue;

    const rawGain = (ge.sourceSlotId === slotId ? ge.selfGain : 0) + ge.teamGain;
    if (rawGain > 0) {
      gains.push({
        frame: ge.frame,
        type: 'gain',
        amount: rawGain * multiplier,
      });
    }
  }

  return gains;
}
