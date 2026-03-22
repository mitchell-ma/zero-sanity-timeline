/**
 * SkillPointController — persistent singleton that receives SP cost and
 * recovery notifications incrementally from DerivedEventController.
 *
 * Pure receiver: never scans the event array. DerivedEventController calls
 * addCost / addRecovery per event or frame. After all events are processed,
 * finalize() sorts accumulated events, feeds them to the SP subtimeline,
 * computes insufficiency zones, and notifies UltimateEnergyController about
 * natural SP consumption per battle skill.
 */
import { TimelineEvent, durationSegment } from '../../consts/viewTypes';
import { SKILL_COLUMNS, OPERATOR_COLUMNS } from '../../model/channels';
import { ENEMY_OWNER_ID } from '../../model/channels';
import { absoluteFrame, foreignStopsFor } from '../timeline/processTimeStop';
import type { TimeStopRegion } from '../timeline/processTimeStop';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
import { Subtimeline } from '../timeline/subtimeline';
import { SkillPointTimeline, ResourceZone, SkillPointConsumptionHistory } from '../timeline/skillPointTimeline';
import { ResourceGraphListener, ResourcePoint } from '../timeline/resourceTimeline';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from './commonSlotController';
import type { UltimateEnergyController } from '../timeline/ultimateEnergyController';

export type { ResourceZone, SkillPointConsumptionHistory };

export class SkillPointController {
  private readonly subtimeline: Subtimeline;
  private readonly timeline: SkillPointTimeline;

  /** Per-slot SP insufficiency zones, keyed by `slotId:battle`. */
  insufficiencyZones: Map<string, ResourceZone[]> = new Map();

  /** Accumulated SP events (costs and recoveries) during pipeline. */
  private pendingSpEvents: TimelineEvent[] = [];

  /** Map of battle skill event UID → { frame, ownerId } for UE gauge gain placement. */
  private battleSkillGainFrames = new Map<string, { frame: number; slotId: string }>();

  /** Per-slot SP cost tracking (for insufficiency zones). */
  private slotSpCosts = new Map<string, number>();

  /** Reference to UE controller for natural SP consumption notification. */
  private ueController: UltimateEnergyController | null = null;

  constructor() {
    this.subtimeline = new Subtimeline(COMMON_OWNER_ID, COMMON_COLUMN_IDS.SKILL_POINTS);
    this.timeline = new SkillPointTimeline(this.subtimeline);
  }

  // ── Delegated resource properties ───────────────────────────────────────

  get min() { return this.timeline.min; }
  get max() { return this.timeline.max; }
  get consumptionHistory(): SkillPointConsumptionHistory[] { return this.timeline.consumptionHistory; }
  get wastedSP() { return this.timeline.wastedSP; }

  getSubtimeline(): Subtimeline { return this.subtimeline; }
  getGraph(): ReadonlyArray<ResourcePoint> { return this.timeline.getGraph(); }
  onGraphChange(listener: ResourceGraphListener): () => void { return this.timeline.onGraphChange(listener); }
  valueAt(frame: number): number { return this.timeline.valueAt(frame); }

  // ── Configuration ──────────────────────────────────────────────────────

  updateConfig(config: { startValue?: number; max?: number; regenPerFrame?: number }): void {
    this.timeline.updateConfig(config);
  }

  setUltimateEnergyController(ue: UltimateEnergyController) {
    this.ueController = ue;
  }

  /**
   * Seed per-slot SP costs for insufficiency zone computation.
   * Must be called before the pipeline so that finalize() computes zones for
   * ALL slots — not just those with battle skill events.
   */
  seedSlotCosts(costs: ReadonlyMap<string, number>) {
    costs.forEach((cost, slotId) => this.slotSpCosts.set(slotId, cost));
  }

  // ── Accumulation methods (called by DerivedEventController) ─────────────

  /**
   * Called per battle skill event with an SP cost.
   * @param eventUid Original event UID (for UE natural SP tracking).
   * @param frame The frame at which SP is consumed.
   * @param amount SP cost amount.
   * @param ownerId Slot that owns the battle skill.
   * @param gaugeGainFrame Frame where UE gauge gain should be placed for this BS.
   */
  addCost(eventUid: string, frame: number, amount: number, ownerId: string, gaugeGainFrame: number) {
    this.pendingSpEvents.push({
      uid: `${eventUid}-sp`,
      id: 'sp-cost',
      name: 'sp-cost',
      ownerId: COMMON_OWNER_ID,
      columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
      startFrame: frame,
      segments: durationSegment(amount),
    });
    this.battleSkillGainFrames.set(eventUid, { frame: gaugeGainFrame, slotId: ownerId });
    // Track per-slot SP cost for insufficiency zones
    if (!this.slotSpCosts.has(ownerId)) {
      this.slotSpCosts.set(ownerId, amount);
    }
  }

  /**
   * Called per frame or event that recovers/returns SP.
   * @param frame Absolute frame of the recovery.
   * @param amount SP amount recovered (positive).
   * @param sourceOwnerId Owner of the skill that produced this recovery.
   * @param sourceSkillName Skill name that produced this recovery.
   */
  addRecovery(frame: number, amount: number, sourceOwnerId: string, sourceSkillName: string) {
    if (amount <= 0) return;
    this.pendingSpEvents.push({
      uid: `sp-return-${frame}-${this.pendingSpEvents.length}`,
      id: 'sp-return',
      name: 'sp-return',
      ownerId: COMMON_OWNER_ID,
      columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
      startFrame: frame,
      segments: [{ properties: { duration: amount } }],
      sourceOwnerId,
      sourceSkillName,
    });
  }

  /**
   * Called per SP recovery event (already derived, e.g. from deriveSPRecoveryEvents).
   */
  addSpRecoveryEvent(ev: TimelineEvent) {
    this.pendingSpEvents.push(ev);
  }

  // ── Clear (called at pipeline start) ────────────────────────────────────

  /**
   * Reset accumulated state for a new pipeline run.
   * Does NOT clear the subtimeline/graph — that happens in finalize.
   */
  clearPending() {
    this.pendingSpEvents = [];
    this.battleSkillGainFrames = new Map();
    this.slotSpCosts = new Map();
  }

  // ── Finalize ────────────────────────────────────────────────────────────

  /**
   * Sort accumulated SP events, feed to subtimeline, compute insufficiency
   * zones, and notify UE controller about natural SP consumption.
   *
   * @param stops Time-stop regions for regen pausing.
   * @param slotSpCosts Map of slotId → SP cost threshold for insufficiency zones.
   */
  finalize(
    stops: readonly TimeStopRegion[],
  ) {
    // Apply time-stops for regen pausing (convert TimeStopRegion → TimeStopRange)
    this.timeline.setTimeStops(
      stops.map(s => ({ startFrame: s.startFrame, endFrame: s.startFrame + s.durationFrames })),
    );

    // Sort: costs before returns at same frame
    this.pendingSpEvents.sort(
      (a, b) => a.startFrame - b.startFrame || (a.name === 'sp-cost' ? -1 : 1),
    );
    this.subtimeline.setEvents(this.pendingSpEvents);

    // Compute per-slot SP insufficiency zones using tracked costs
    this.insufficiencyZones = new Map();
    this.slotSpCosts.forEach((cost, slotId) => {
      const zones = this.timeline.insufficiencyZones(cost);
      if (zones.length > 0) {
        this.insufficiencyZones.set(`${slotId}:${SKILL_COLUMNS.BATTLE}`, zones);
      }
    });

    // Notify UE controller about natural SP consumption per battle skill
    if (this.ueController) {
      for (const record of this.timeline.consumptionHistory) {
        this.ueController.onNaturalSpConsumed(record);
      }
    }
  }

  // ── Legacy clear / cleanup ──────────────────────────────────────────────

  clear(): void {
    this.subtimeline.clear();
    this.clearPending();
  }

  destroy(): void {
    this.timeline.destroy();
  }

  /**
   * Derive SP recovery events from skill frame markers and perfect dodge events.
   * Returns the input events array with SP recovery events appended.
   */
  static deriveSPRecoveryEvents(events: TimelineEvent[], stops: readonly TimeStopRegion[] = []): TimelineEvent[] {
    const derived: TimelineEvent[] = [];

    for (const event of events) {
      if (event.ownerId === ENEMY_OWNER_ID) continue;

      const fStops = foreignStopsFor(event, stops);
      let cumulativeOffset = 0;
      for (let si = 0; si < event.segments.length; si++) {
        const seg = event.segments[si];
        if (seg.frames) {
          for (let fi = 0; fi < seg.frames.length; fi++) {
            const frame = seg.frames[fi];
            if ((frame.skillPointRecovery ?? 0) > 0) {
              derived.push({
                uid: `${event.uid}-sp-${si}-${fi}`,
                id: 'sp-recovery',
                name: 'sp-recovery',
                ownerId: COMMON_OWNER_ID,
                columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
                startFrame: absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops),
                segments: [{ properties: { duration: -(frame.skillPointRecovery!) } }],
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
              });
            }
          }
        }
        cumulativeOffset += seg.properties.duration;
      }
    }

    // Perfect dodge dash events → SP recovery
    for (const event of events) {
      if (event.columnId === OPERATOR_COLUMNS.INPUT && event.isPerfectDodge) {
        derived.push({
          uid: `${event.uid}-sp-dodge`,
          id: 'sp-recovery',
          name: 'sp-recovery',
          ownerId: COMMON_OWNER_ID,
          columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
          startFrame: event.startFrame,
          segments: [{ properties: { duration: -GENERAL_MECHANICS.skillPoints.perfectDodgeRecovery } }],
          sourceOwnerId: event.ownerId,
          sourceSkillName: event.name,
        });
      }
    }

    if (derived.length === 0) return events;
    return [...events, ...derived];
  }

  /** Get battle skill gain frames map (for UE finalize). */
  getBattleSkillGainFrames(): ReadonlyMap<string, { frame: number; slotId: string }> {
    return this.battleSkillGainFrames;
  }
}
