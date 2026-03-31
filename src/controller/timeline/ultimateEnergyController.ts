/**
 * UltimateEnergyController — persistent singleton that receives gauge gain,
 * consume, and no-gain-window notifications incrementally from
 * DerivedEventController and SkillPointController.
 *
 * Pure receiver: never scans the event array. DerivedEventController calls
 * addGaugeGain / addConsume / addNoGainWindow per event/frame; SPController
 * calls onNaturalSpConsumed per battle skill after its own finalize.
 */

import { SegmentType, StatType } from '../../consts/enums';
import { VerbType, NounType } from '../../dsl/semantics';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../../view/OperatorLoadoutHeader';
import { LoadoutProperties, getDefaultLoadoutProperties } from '../../view/InformationPane';
import { Operator, TimelineEvent, eventDuration } from '../../consts/viewTypes';
import { aggregateLoadoutStats } from '../calculation/loadoutAggregator';
import { UltEnergyEvent, computeUltimateEnergyGraph, UltimateEnergyResult } from './ultimateEnergyTimeline';
import { NATURAL_SP_TO_ULTIMATE_RATIO } from '../../consts/stats';
import type { SkillPointConsumptionHistory } from './skillPointTimeline';

// ── Raw gauge gain type (still exported for tests) ───────────────────────────

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

// ── Slot config ──────────────────────────────────────────────────────────────

interface SlotConfig {
  max: number;
  startValue: number;
  chargePerFrame: number;
  efficiency: number;
}

// ── UltimateEnergyController class ───────────────────────────────────────────

export class UltimateEnergyController {
  /** Per-slot configuration. */
  private slotConfigs = new Map<string, SlotConfig>();

  /** Accumulated raw gauge gains (from combo/battle frames). */
  private rawGaugeGains: RawGaugeGainEvent[] = [];

  /** Per-slot no-gain windows. */
  private noGainWindows = new Map<string, { start: number; end: number }[]>();

  /** Per-slot ultimate consume events. */
  private consumeEvents = new Map<string, UltEnergyEvent[]>();

  /** Natural SP consumption per battle skill event UID (from SPController). */
  private naturalSpMap = new Map<string, number>();

  /** Computed per-slot UE graphs (after finalize). */
  private slotGraphs = new Map<string, UltimateEnergyResult>();

  // ── Configuration ────────────────────────────────────────────────────────

  configureSlot(slotId: string, config: SlotConfig) {
    this.slotConfigs.set(slotId, config);
  }

  /** Update a slot's efficiency from the stat accumulator (after APPLY STAT deltas). */
  updateSlotEfficiency(slotId: string, efficiency: number) {
    const cfg = this.slotConfigs.get(slotId);
    if (cfg) cfg.efficiency = efficiency;
  }

  // ── Clear (called at pipeline start) ─────────────────────────────────────

  clear() {
    this.rawGaugeGains = [];
    this.noGainWindows.clear();
    this.consumeEvents.clear();
    this.naturalSpMap.clear();
    this.slotGraphs.clear();
    // slotConfigs intentionally kept — reconfigured before each pipeline run
  }

  // ── Accumulation methods (called by DerivedEventController) ──────────────

  /**
   * Called per frame that has gaugeGain or teamGaugeGain.
   * @param frame Absolute frame of the gauge gain.
   * @param selfGain Gain for the source operator only.
   * @param teamGain Gain for all operators on the team.
   * @param sourceSlotId Slot that produced this gain.
   */
  addGaugeGain(frame: number, sourceSlotId: string, selfGain: number, teamGain: number) {
    if (selfGain <= 0 && teamGain <= 0) return;
    this.rawGaugeGains.push({ frame, sourceSlotId, selfGain, teamGain });
  }

  /**
   * Called per ultimate event (consume the full gauge).
   */
  addConsume(frame: number, slotId: string) {
    const cfg = this.slotConfigs.get(slotId);
    const arr = this.consumeEvents.get(slotId) ?? [];
    arr.push({ frame, type: 'consume', amount: cfg?.max ?? 0 });
    this.consumeEvents.set(slotId, arr);
  }

  /**
   * Called per ultimate segment that blocks energy gain (ACTIVE phase or
   * IGNORE ULTIMATE_ENERGY clause).
   */
  addNoGainWindow(start: number, end: number, slotId: string) {
    const arr = this.noGainWindows.get(slotId) ?? [];
    arr.push({ start, end });
    this.noGainWindows.set(slotId, arr);
  }

  // ── Called by SPController after its finalize ────────────────────────────

  /**
   * Receives natural SP consumption data for a single battle skill.
   * The natural SP consumed converts to team-wide gauge gain.
   */
  onNaturalSpConsumed(record: SkillPointConsumptionHistory) {
    if (record.naturalConsumed > 0) {
      this.naturalSpMap.set(record.eventUid, record.naturalConsumed);
    }
  }

  // ── Finalize (called after SPController.finalize) ────────────────────────

  /**
   * Converts natural SP consumption to gauge gains, applies per-slot
   * efficiency, and computes per-slot UE graphs.
   *
   * @param battleSkillGainFrames Map of eventUid → frame where the gauge gain
   *   should be placed (the battle skill's first frame or startFrame).
   */
  finalize(battleSkillGainFrames: ReadonlyMap<string, { frame: number; slotId: string }>) {
    // Convert natural SP consumption to gauge gains
    for (const [eventUid, naturalConsumed] of Array.from(this.naturalSpMap)) {
      const info = battleSkillGainFrames.get(eventUid);
      if (!info) continue;
      const gain = naturalConsumed * NATURAL_SP_TO_ULTIMATE_RATIO;
      this.rawGaugeGains.push({
        frame: info.frame,
        sourceSlotId: info.slotId,
        selfGain: gain,
        teamGain: gain,
      });
    }

    // Sort raw gains
    this.rawGaugeGains.sort((a, b) => a.frame - b.frame);

    // Compute per-slot graphs
    for (const [slotId, cfg] of Array.from(this.slotConfigs)) {
      const windows = this.noGainWindows.get(slotId) ?? [];
      const gains = applyGainEfficiency(this.rawGaugeGains, slotId, cfg.efficiency, windows);
      const consumes = this.consumeEvents.get(slotId) ?? [];
      const timeline = [...gains, ...consumes]
        .sort((a, b) => a.frame - b.frame || (a.type === 'gain' ? -1 : 1));

      const result = computeUltimateEnergyGraph(timeline, cfg.max, cfg.startValue, cfg.chargePerFrame);
      this.slotGraphs.set(slotId, result);
    }
  }

  // ── Query methods ────────────────────────────────────────────────────────

  getGraph(slotId: string): UltimateEnergyResult | undefined {
    return this.slotGraphs.get(slotId);
  }

  getAllGraphs(): ReadonlyMap<string, UltimateEnergyResult> {
    return this.slotGraphs;
  }
}

// ── Helpers for extracting no-gain windows from a single ultimate event ──────

/**
 * Extracts no-gain windows from a single ultimate event's segments.
 * Called by DerivedEventController per ultimate event during registration.
 */
export function collectNoGainWindowsForEvent(
  ev: TimelineEvent,
): { start: number; end: number }[] {
  const windows: { start: number; end: number }[] = [];
  let cursor = ev.startFrame;
  let foundTypedSegment = false;
  for (const seg of ev.segments) {
    const isActive = seg.properties.segmentTypes?.includes(SegmentType.ACTIVE);
    const ignoresUlt = seg.clause?.some(c =>
      c.effects.some(e => e.verb === VerbType.IGNORE && e.object === NounType.ULTIMATE_ENERGY)
    );
    if (isActive || ignoresUlt) {
      windows.push({ start: cursor, end: cursor + seg.properties.duration });
      foundTypedSegment = true;
    } else if (seg.properties.segmentTypes?.length) {
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
  return windows;
}

// ── Pure helper functions (kept for internal use and tests) ──────────────────

/**
 * Applies ultimate gain efficiency to raw gauge gain events for a specific operator slot.
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
 * Resolves the ultimate gain efficiency multiplier for each operator slot
 * from their aggregated loadout stats.
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

