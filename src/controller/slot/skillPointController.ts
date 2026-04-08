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
import { NounType } from '../../dsl/semantics';
import type { TimeStopRegion } from '../timeline/processTimeStop';
import { Subtimeline } from '../timeline/subtimeline';
import { SkillPointTimeline, ResourceZone, SkillPointConsumptionHistory } from '../timeline/skillPointTimeline';
import { ResourceGraphListener, ResourcePoint } from '../timeline/resourceTimeline';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from './commonSlotController';
import type { UltimateEnergyController } from '../timeline/ultimateEnergyController';

export type { ResourceZone, SkillPointConsumptionHistory };

const SP_COST_EVENT_ID = 'sp-cost';

export class SkillPointController {
  private readonly subtimeline: Subtimeline;
  private readonly timeline: SkillPointTimeline;

  /** Per-slot SP insufficiency zones, keyed by `slotId:battle`. */
  insufficiencyZones: Map<string, ResourceZone[]> = new Map();

  /** Accumulated SP events (costs and recoveries) during pipeline. */
  private pendingSpEvents: TimelineEvent[] = [];

  /** Map of battle skill event UID → { frame, ownerId } for UE ultimate energy gain placement. */
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
   * @param ultimateEnergyGainFrame Frame where UE ultimate energy gain should be placed for this BS.
   */
  addCost(eventUid: string, frame: number, amount: number, ownerId: string, ultimateEnergyGainFrame: number) {
    this.pendingSpEvents.push({
      uid: `${eventUid}-sp`,
      id: SP_COST_EVENT_ID,
      name: SP_COST_EVENT_ID,
      ownerId: COMMON_OWNER_ID,
      columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
      startFrame: frame,
      segments: durationSegment(amount),
    });
    this.battleSkillGainFrames.set(eventUid, { frame: ultimateEnergyGainFrame, slotId: ownerId });
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
   * Called per SP recovery event (already derived by the interpret pipeline).
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
      (a, b) => a.startFrame - b.startFrame || (a.name === SP_COST_EVENT_ID ? -1 : 1),
    );
    this.subtimeline.setEvents(this.pendingSpEvents);

    // Compute per-slot SP insufficiency zones using tracked costs
    this.insufficiencyZones = new Map();
    this.slotSpCosts.forEach((cost, slotId) => {
      const zones = this.timeline.insufficiencyZones(cost);
      if (zones.length > 0) {
        this.insufficiencyZones.set(`${slotId}:${NounType.BATTLE}`, zones);
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

/** Get battle skill gain frames map (for UE finalize). */
  getBattleSkillGainFrames(): ReadonlyMap<string, { frame: number; slotId: string }> {
    return this.battleSkillGainFrames;
  }
}
