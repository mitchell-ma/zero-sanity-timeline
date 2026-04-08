/**
 * UltimateEnergyController — persistent singleton that receives ultimate energy gain,
 * consume, and no-gain-window notifications incrementally from
 * DerivedEventController and SkillPointController.
 *
 * Pure receiver: never scans the event array. DerivedEventController calls
 * addUltimateEnergyGain / addConsume / addNoGainWindow per event/frame; SPController
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

// ── Raw ultimate energy gain type (still exported for tests) ───────────────────────────

/** A raw ultimate energy gain event before efficiency is applied. */
export interface RawUltimateEnergyGainEvent {
  frame: number;
  /** Slot ID of the skill's owner (who cast the skill). */
  sourceSlotId: string;
  /** Ultimate energy recovered for the source operator only. */
  selfGain: number;
  /** Ultimate energy recovered for all operators on the team. */
  teamGain: number;
  /**
   * Phase 9b: when set, this gain was synthesized by _computeGraphs from a
   * SP cost event's natural consumption. Used as a key for idempotent
   * removal during recompute (so re-runs don't double-count).
   */
  spDerivedFromUid?: string;
  /**
   * Phase 9b: per-recipient ultimate gain efficiency captured AT THE FRAME
   * the gain occurred. Set by DEC.recordUltimateEnergyGain from the stat
   * accumulator's current state during queue drain. Fixes the latent bug
   * where post-pipeline `cfg.efficiency` retroactively scaled all gains
   * regardless of when an efficiency boost activated.
   *
   * When undefined (e.g. tests constructing this directly), applyGainEfficiency
   * falls back to the passed-in `efficiencyBonus` parameter — preserves the
   * existing test behavior.
   */
  slotEfficiencies?: ReadonlyMap<string, number>;
}

// ── Slot config ──────────────────────────────────────────────────────────────

interface SlotConfig {
  max: number;
  startValue: number;
  chargePerFrame: number;
  efficiency: number;
  /** When true, this slot ignores external UE gains (IGNORE ULTIMATE_ENERGY status clause). */
  ignoreExternalGain: boolean;
}

// ── UltimateEnergyController class ───────────────────────────────────────────

export class UltimateEnergyController {
  /** Per-slot configuration. */
  private slotConfigs = new Map<string, SlotConfig>();

  /** Accumulated raw ultimate energy gains (from combo/battle frames). */
  private rawUltimateEnergyGains: RawUltimateEnergyGainEvent[] = [];

  /** Per-slot no-gain windows. */
  private noGainWindows = new Map<string, { start: number; end: number }[]>();

  /** Per-slot ultimate consume events. */
  private consumeEvents = new Map<string, UltEnergyEvent[]>();

  /** Natural SP consumption per battle skill event UID (from SPController). */
  private naturalSpMap = new Map<string, number>();

  /**
   * Phase 9b: battle skill gain frames pushed by SPController.addCost.
   * Replaces the finalize-time `battleSkillGainFrames` parameter so the
   * SP → UE conversion can run reactively.
   */
  private battleSkillGainFrames = new Map<string, { frame: number; slotId: string }>();

  /** Computed per-slot UE graphs. Auto-rebuilt by _computeGraphs on state change. */
  private slotGraphs = new Map<string, UltimateEnergyResult>();

  // ── Configuration ────────────────────────────────────────────────────────

  configureSlot(slotId: string, config: Omit<SlotConfig, 'ignoreExternalGain'> & { ignoreExternalGain?: boolean }) {
    this.slotConfigs.set(slotId, { ...config, ignoreExternalGain: config.ignoreExternalGain ?? false });
  }

  /** Mark a slot as ignoring external UE gains (driven by IGNORE ULTIMATE_ENERGY status clause). */
  setIgnoreExternalGain(slotId: string, ignore: boolean) {
    const cfg = this.slotConfigs.get(slotId);
    if (cfg && cfg.ignoreExternalGain !== ignore) {
      cfg.ignoreExternalGain = ignore;
      this._computeGraphs();
    }
  }

  /** Update a slot's efficiency from the stat accumulator (after APPLY STAT deltas). */
  updateSlotEfficiency(slotId: string, efficiency: number) {
    const cfg = this.slotConfigs.get(slotId);
    if (cfg) cfg.efficiency = efficiency;
  }

  // ── Clear (called at pipeline start) ─────────────────────────────────────

  clear() {
    this.rawUltimateEnergyGains = [];
    this.noGainWindows.clear();
    this.consumeEvents.clear();
    this.naturalSpMap.clear();
    this.battleSkillGainFrames.clear();
    this.slotGraphs.clear();
    // slotConfigs intentionally kept — reconfigured before each pipeline run
  }

  // ── Accumulation methods (called by DerivedEventController) ──────────────

  /**
   * Called per frame that has ultimateEnergyGain or teamUltimateEnergyGain.
   * @param frame Absolute frame of the ultimate energy gain.
   * @param selfGain Gain for the source operator only.
   * @param teamGain Gain for all operators on the team.
   * @param sourceSlotId Slot that produced this gain.
   */
  addUltimateEnergyGain(
    frame: number,
    sourceSlotId: string,
    selfGain: number,
    teamGain: number,
    slotEfficiencies?: ReadonlyMap<string, number>,
  ) {
    if (selfGain <= 0 && teamGain <= 0) return;
    this.rawUltimateEnergyGains.push({ frame, sourceSlotId, selfGain, teamGain, slotEfficiencies });
    this._computeGraphs();
  }

  /**
   * Called per ultimate event (consume the full ultimate energy).
   */
  addConsume(frame: number, slotId: string) {
    const cfg = this.slotConfigs.get(slotId);
    const arr = this.consumeEvents.get(slotId) ?? [];
    arr.push({ frame, type: 'consume', amount: cfg?.max ?? 0 });
    this.consumeEvents.set(slotId, arr);
    this._computeGraphs();
  }

  /**
   * Called per ultimate segment that blocks energy gain (ACTIVE phase or
   * IGNORE ULTIMATE_ENERGY clause).
   */
  addNoGainWindow(start: number, end: number, slotId: string) {
    const arr = this.noGainWindows.get(slotId) ?? [];
    arr.push({ start, end });
    this.noGainWindows.set(slotId, arr);
    this._computeGraphs();
  }

  /**
   * Phase 9b: receive battle skill gain frame info pushed by SPController.addCost.
   * Replaces the finalize-time `battleSkillGainFrames` parameter.
   */
  setBattleSkillGainFrame(eventUid: string, frame: number, slotId: string) {
    this.battleSkillGainFrames.set(eventUid, { frame, slotId });
    this._computeGraphs();
  }

  // ── Called by SPController after its finalize ────────────────────────────

  /**
   * Receives natural SP consumption data for a single battle skill.
   * The natural SP consumed converts to team-wide ultimate energy gain.
   * Phase 9a step 5: idempotent — callable on every SP recompute. Setting
   * naturalConsumed = 0 clears the entry so reactive updates can shrink
   * the natural pool when more returns absorb prior natural consumption.
   */
  onNaturalSpConsumed(record: SkillPointConsumptionHistory) {
    if (record.naturalConsumed > 0) {
      this.naturalSpMap.set(record.eventUid, record.naturalConsumed);
    } else {
      this.naturalSpMap.delete(record.eventUid);
    }
    this._computeGraphs();
  }

  /**
   * Phase 9b: reactive per-slot UE graph computation. Called from every
   * state-change setter so the slotGraphs map stays current without a
   * post-pipeline finalize sweep.
   *
   * Builds the natural-SP-to-UE-gain conversion from the current
   * naturalSpMap + battleSkillGainFrames maps each call (idempotent —
   * we filter the SP-derived gains out of rawUltimateEnergyGains before
   * appending the latest set so re-runs don't double-count).
   */
  private _computeGraphs() {
    // Strip any prior SP-derived gains so we can rebuild them from the
    // current naturalSpMap snapshot.
    const naturalUids = new Set<string>();
    this.naturalSpMap.forEach((_, uid) => naturalUids.add(uid));
    const directGains: RawUltimateEnergyGainEvent[] = [];
    for (const ge of this.rawUltimateEnergyGains) {
      // SP-derived gains are tagged via spDerivedFromUid below.
      if (!ge.spDerivedFromUid) directGains.push(ge);
    }
    this.rawUltimateEnergyGains = directGains;

    // Append fresh SP-derived gains from the current natural SP snapshot.
    for (const [eventUid, naturalConsumed] of Array.from(this.naturalSpMap)) {
      const info = this.battleSkillGainFrames.get(eventUid);
      if (!info) continue;
      const gain = naturalConsumed * NATURAL_SP_TO_ULTIMATE_RATIO;
      this.rawUltimateEnergyGains.push({
        frame: info.frame,
        sourceSlotId: info.slotId,
        selfGain: 0,
        teamGain: gain,
        spDerivedFromUid: eventUid,
      });
    }

    // Sort and recompute per-slot graphs
    this.rawUltimateEnergyGains.sort((a, b) => a.frame - b.frame);

    for (const [slotId, cfg] of Array.from(this.slotConfigs)) {
      const windows = this.noGainWindows.get(slotId) ?? [];
      const gains = applyGainEfficiency(this.rawUltimateEnergyGains, slotId, cfg.efficiency, windows, cfg.ignoreExternalGain);
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
 * Applies ultimate gain efficiency to raw ultimate energy gain events for a specific operator slot.
 */
export function applyGainEfficiency(
  ultimateEnergyEvents: readonly RawUltimateEnergyGainEvent[],
  slotId: string,
  efficiencyBonus: number,
  ultActiveWindows: readonly { start: number; end: number }[],
  ignoreExternalGain = false,
): UltEnergyEvent[] {
  const fallbackMultiplier = 1 + efficiencyBonus;
  const gains: UltEnergyEvent[] = [];

  for (const ge of ultimateEnergyEvents) {
    // Skip gains during no-gain windows (active phase, IGNORE ULTIMATE_ENERGY segments).
    // Exclusive start: gains at the boundary frame happen before the window opens.
    if (ultActiveWindows.some(w => ge.frame > w.start && ge.frame < w.end)) continue;

    // IGNORE ULTIMATE_ENERGY status: skip all gains from other operators' skills
    if (ignoreExternalGain && ge.sourceSlotId !== slotId) continue;

    const rawGain = (ge.sourceSlotId === slotId ? ge.selfGain : 0) + ge.teamGain;
    if (rawGain > 0) {
      // Phase 9b: prefer the per-event slotEfficiencies snapshot captured at
      // gain time. Falls back to fallbackMultiplier when absent (tests that
      // construct RawUltimateEnergyGainEvent without snapshots).
      const eff = ge.slotEfficiencies?.get(slotId);
      const multiplier = eff != null ? 1 + eff : fallbackMultiplier;
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

