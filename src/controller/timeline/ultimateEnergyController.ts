/**
 * Ultimate energy controller — resolves how much ultimate energy each operator
 * actually gains when skills recover ultimate energy, based on each operator's
 * ultimate energy gain efficiency stat from their loadout.
 */

import { SegmentType, StatType } from '../../consts/enums';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../../view/OperatorLoadoutHeader';
import { LoadoutProperties, getDefaultLoadoutProperties } from '../../view/InformationPane';
import { Operator, TimelineEvent, getAnimationDuration, eventDuration } from '../../consts/viewTypes';
import { aggregateLoadoutStats } from '../calculation/loadoutAggregator';
import { UltEnergyEvent } from './ultimateEnergyTimeline';
import { getOperatorJson } from '../../model/event-frames/operatorJsonLoader';
import { SKILL_COLUMNS } from '../../model/channels';
import { NATURAL_SP_TO_ULTIMATE_RATIO } from '../../consts/stats';
import { FPS } from '../../utils/timeline';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';

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

// ── Multi-dimensional VARY_BY resolver ───────────────────────────────────────

/** Context values for resolving VARY_BY lookups. */
interface ResolveContext {
  potential: number;
  talentLevel: number;
  skillLevel?: number;
}

/**
 * Maps a VARY_BY dimension type to the lookup key for the current context.
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
 * Resolve a VARY_BY value block, supporting both single-dimension (array)
 * and multi-dimension (nested object) lookups.
 */
function resolveBasedOnValue(
  wp: Record<string, unknown>,
  ctx: ResolveContext,
): number | undefined {
  if (wp.verb !== 'VARY_BY') {
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
    let current: unknown = val;
    for (const dim of dims) {
      if (typeof current !== 'object' || current === null) return undefined;
      const currentObj = current as Record<string, unknown>;
      const key = getDimensionKey(dim, ctx, Object.keys(currentObj));
      if (!key) return undefined;
      current = currentObj[key];
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
  const statusEvents = opJson?.statusEvents as { id: string; properties?: Record<string, unknown>; clause?: { conditions: Record<string, unknown>[]; effects: Record<string, unknown>[] }[] }[] | undefined;
  const msDef = statusEvents?.find(se =>
    se.id === 'MESSENGERS_SONG' || (se.properties as Record<string, unknown> | undefined)?.id === 'MESSENGERS_SONG'
  );
  if (!msDef?.clause) return {};

  // Collect class → bonus value from ULTIMATE_ENERGY_GAIN / ENERGY_GAIN_EFFICIENCY effects
  const classBonuses = new Map<string, number>();
  for (const clause of msDef.clause) {
    // Check if clause has a potential condition we need to evaluate
    const conditions = clause.conditions ?? [];
    let potentialThreshold = 0;
    for (const cond of conditions) {
      if (cond.object === 'POTENTIAL' || cond.verb === 'HAVE') {
        const condWith = cond.with as Record<string, unknown> | undefined;
        const condValue = condWith?.value as Record<string, unknown> | undefined;
        if (condValue?.verb === 'AT_LEAST') {
          potentialThreshold = condValue.value as number;
        }
      }
    }
    if (potentialThreshold > 0 && potential < potentialThreshold) continue;

    for (const effect of clause.effects ?? []) {
      const verb = effect.verb;
      const object = effect.object;
      if (verb !== 'APPLY' || (object !== 'ENERGY_GAIN_EFFICIENCY' && object !== 'ULTIMATE_ENERGY_GAIN')) continue;

      const withObj = effect.with as Record<string, unknown> | undefined;
      if (!withObj) continue;

      // Resolve target classes
      const targetClasses: string[] = [];
      const tcObj = withObj.targetClasses as Record<string, unknown> | undefined;
      if (tcObj?.values && Array.isArray(tcObj.values)) {
        targetClasses.push(...(tcObj.values as string[]));
      } else if (typeof effect.to === 'string' && effect.to !== 'OPERATOR') {
        targetClasses.push(effect.to as string);
      }

      // Resolve bonus value
      const wp = withObj.value as Record<string, unknown> | undefined;
      if (!wp || targetClasses.length === 0) continue;

      // Normalize TALENT_ONE_LEVEL → TALENT_LEVEL for resolveBasedOnValue
      const normalizedWp = { ...wp };
      if (normalizedWp.object === 'TALENT_ONE_LEVEL') normalizedWp.object = 'TALENT_LEVEL';
      // Handle `values` array (new format) vs `value` (old format)
      if (normalizedWp.values && !normalizedWp.value) {
        const vals = normalizedWp.values as unknown[];
        normalizedWp.value = vals.length === 1 ? vals[0] : vals;
      }

      const value = resolveBasedOnValue(normalizedWp, { potential, talentLevel });
      if (value != null) {
        for (const cls of targetClasses) {
          classBonuses.set(cls, (classBonuses.get(cls) ?? 0) + value);
        }
      }
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
 * Simulate dual-pool SP tracking to determine natural vs returned SP consumption
 * per battle skill. Returns a map of eventId → naturalConsumed.
 *
 * Two pools: natural (regens over time) and returned (from skill SP recovery).
 * Cost events consume returned first, then natural.
 * Only natural SP consumed converts to ultimate energy.
 */
function computeNaturalSpConsumption(events: TimelineEvent[]): Map<string, number> {
  const SP_MAX = GENERAL_MECHANICS.skillPoints.max;
  const SP_START = GENERAL_MECHANICS.skillPoints.startValue;
  const SP_REGEN_PER_FRAME = GENERAL_MECHANICS.skillPoints.regenPerSecond / FPS;

  // Build sorted SP event list: costs + returns from all battle skill events
  type SpEvent = { frame: number; type: 'cost' | 'return'; amount: number; eventId: string };
  const spEvents: SpEvent[] = [];

  for (const ev of events) {
    if (ev.columnId !== SKILL_COLUMNS.BATTLE || !ev.skillPointCost) continue;
    spEvents.push({ frame: ev.startFrame, type: 'cost', amount: ev.skillPointCost, eventId: ev.id });

    // SP returns from frame-level skillPointRecovery
    if (ev.segments) {
      const animOffset = getAnimationDuration(ev);
      let segOffset = 0;
      for (const seg of ev.segments) {
        if (seg.frames) {
          for (const f of seg.frames) {
            if (f.skillPointRecovery && f.skillPointRecovery > 0) {
              const frame = f.absoluteFrame ?? (ev.startFrame + animOffset + segOffset + f.offsetFrame);
              spEvents.push({ frame, type: 'return', amount: f.skillPointRecovery, eventId: ev.id });
            }
          }
        }
        segOffset += seg.properties.duration;
      }
    }
  }
  // Sort: costs before returns at same frame (matches SP timeline behavior)
  spEvents.sort((a, b) => a.frame - b.frame || (a.type === 'cost' ? -1 : 1));

  // Simulate dual pools
  let naturalPool = SP_START;
  let returnedPool = 0;
  let lastFrame = 0;
  const result = new Map<string, number>();

  for (const spe of spEvents) {
    // Regen natural pool
    const regenFrames = spe.frame - lastFrame;
    const regenAmount = regenFrames * SP_REGEN_PER_FRAME;
    const headroom = Math.max(0, SP_MAX - naturalPool - returnedPool);
    naturalPool += Math.min(regenAmount, headroom);

    if (spe.type === 'return') {
      const returnHeadroom = Math.max(0, SP_MAX - naturalPool - returnedPool);
      returnedPool += Math.min(spe.amount, returnHeadroom);
    } else {
      // Cost: consume returned first, then natural
      const fromReturned = Math.min(returnedPool, spe.amount);
      const fromNatural = Math.min(naturalPool, spe.amount - fromReturned);
      returnedPool -= fromReturned;
      naturalPool -= fromNatural;
      result.set(spe.eventId, fromNatural);
    }
    lastFrame = spe.frame;
  }

  return result;
}

/**
 * Collects raw gauge gain events from timeline events.
 * Battle skills gain gauge on their first frame; combo skills gain on first frame too.
 * Battle skills derive gauge from natural SP consumed (computed inline via dual-pool simulation).
 */
export function collectRawGaugeGains(
  events: TimelineEvent[],
): RawGaugeGainEvent[] {
  const naturalSpMap = computeNaturalSpConsumption(events);

  const gaugeEvents: RawGaugeGainEvent[] = [];
  for (const ev of events) {
    if (ev.columnId === SKILL_COLUMNS.BATTLE) {
      // Battle skills: gauge gain happens on the first frame of the event
      const firstFrame = ev.segments[0]?.frames?.[0];
      const gainFrame = firstFrame?.absoluteFrame ?? ev.startFrame;
      const naturalConsumed = naturalSpMap.get(ev.id) ?? 0;
      if (naturalConsumed > 0) {
        const gain = naturalConsumed * NATURAL_SP_TO_ULTIMATE_RATIO;
        gaugeEvents.push({
          frame: gainFrame,
          sourceSlotId: ev.ownerId,
          selfGain: gain,
          teamGain: gain,
        });
      }
      // Additional frame-level gauge gains (e.g. empowered battle skill extra ultimate recovery)
      for (const seg of ev.segments) {
        for (const f of seg.frames ?? []) {
          if (f.gaugeGain && f.gaugeGain > 0) {
            gaugeEvents.push({
              frame: f.absoluteFrame ?? ev.startFrame,
              sourceSlotId: ev.ownerId,
              selfGain: f.gaugeGain,
              teamGain: 0,
            });
          }
        }
      }
    } else if (ev.columnId === SKILL_COLUMNS.COMBO) {
      // Combo skills: gauge gain from the first frame
      const firstFrame = ev.segments[0]?.frames?.[0];
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
    // Skip gains during no-gain windows (active phase, IGNORE ULTIMATE_ENERGY segments).
    // Exclusive start: gains at the boundary frame happen before the window opens.
    if (ultActiveWindows.some(w => ge.frame > w.start && ge.frame < w.end)) continue;

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

/**
 * Collects frame windows during which an operator cannot gain ultimate energy.
 * Scans all ultimate segments for:
 * - ACTIVE phase (universal: no energy gain during own ultimate)
 * - Segments with IGNORE ULTIMATE_ENERGY clause (e.g. Laevatain animation)
 */
export function collectNoGainWindows(
  events: readonly TimelineEvent[],
  slotId: string,
): { start: number; end: number }[] {
  const windows: { start: number; end: number }[] = [];
  for (const ev of events) {
    if (ev.ownerId !== slotId || ev.columnId !== SKILL_COLUMNS.ULTIMATE) continue;
    let cursor = ev.startFrame;
    let foundTypedSegment = false;
    for (const seg of ev.segments) {
      const isActive = seg.metadata?.segmentType === SegmentType.ACTIVE;
      const ignoresUlt = seg.clause?.some(c =>
        c.effects.some(e => e.verb === 'IGNORE' && e.object === 'ULTIMATE_ENERGY')
      );
      if (isActive || ignoresUlt) {
        windows.push({ start: cursor, end: cursor + seg.properties.duration });
        foundTypedSegment = true;
      } else if (seg.metadata?.segmentType) {
        foundTypedSegment = true;
      }
      cursor += seg.properties.duration;
    }
    // Fallback for events with no typed segments — treat event duration as animation,
    // then assume an 1800-frame active window after it
    if (!foundTypedSegment) {
      const start = ev.startFrame + eventDuration(ev);
      windows.push({ start, end: start + 1800 });
    }
  }
  return windows;
}
