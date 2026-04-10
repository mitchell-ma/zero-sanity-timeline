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
import { TEAM_ID, COMMON_COLUMN_IDS } from './commonSlotController';
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
    this.subtimeline = new Subtimeline(TEAM_ID, COMMON_COLUMN_IDS.SKILL_POINTS);
    this.timeline = new SkillPointTimeline(this.subtimeline);
    // On every SP graph change, rebuild the per-slot insufficiency zones
    // map AND push natural-SP consumption updates to UE controller. Both
    // flow reactively from addCost/addRecovery — no finalize step.
    this.timeline.onGraphChange(() => {
      this._recomputeInsufficiencyZones();
      this._notifyUeNaturalConsumption();
    });
  }

  private _notifyUeNaturalConsumption() {
    if (!this.ueController) return;
    for (const record of this.timeline.consumptionHistory) {
      this.ueController.onNaturalSpConsumed(record);
    }
  }

  private _recomputeInsufficiencyZones() {
    const next = new Map<string, ResourceZone[]>();
    this.slotSpCosts.forEach((cost, slotId) => {
      const zones = this.timeline.insufficiencyZones(cost);
      if (zones.length > 0) next.set(`${slotId}:${NounType.BATTLE}`, zones);
    });
    this.insufficiencyZones = next;
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
   * Receive the current time-stop ranges from DEC._maybeRegisterStop.
   * The caller passes the complete set each call; the SP timeline
   * recomputes regen pauses against the latest stops.
   */
  setTimeStops(stops: readonly TimeStopRegion[]) {
    this.timeline.setTimeStops(
      stops.map(s => ({ startFrame: s.startFrame, endFrame: s.startFrame + s.durationFrames })),
    );
  }

  /**
   * Seed per-slot SP costs for insufficiency zone computation.
   * Called before the pipeline so the reactive insufficiency-zones cache
   * covers ALL slots, not just those with battle skill events. Triggers a
   * recompute so any prior graph state already projects against the new
   * slot set.
   */
  seedSlotCosts(costs: ReadonlyMap<string, number>) {
    costs.forEach((cost, slotId) => this.slotSpCosts.set(slotId, cost));
    this._recomputeInsufficiencyZones();
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
      ownerId: TEAM_ID,
      columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
      startFrame: frame,
      segments: durationSegment(amount),
    });
    this.battleSkillGainFrames.set(eventUid, { frame: ultimateEnergyGainFrame, slotId: ownerId });
    // Track per-slot SP cost for insufficiency zones
    if (!this.slotSpCosts.has(ownerId)) {
      this.slotSpCosts.set(ownerId, amount);
    }
    // Push the battle skill gain frame to UE so the SP → UE conversion
    // runs reactively without a finalize-time gainFrames param.
    if (this.ueController) {
      this.ueController.setBattleSkillGainFrame(eventUid, ultimateEnergyGainFrame, ownerId);
    }
    this.flushSpEvents();
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
      ownerId: TEAM_ID,
      columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
      startFrame: frame,
      segments: [{ properties: { duration: amount } }],
      sourceOwnerId,
      sourceSkillName,
    });
    this.flushSpEvents();
  }

  /**
   * Called per SP recovery event (already derived by the interpret pipeline).
   */
  addSpRecoveryEvent(ev: TimelineEvent) {
    this.pendingSpEvents.push(ev);
    this.flushSpEvents();
  }

  /**
   * Push current pendingSpEvents into the subtimeline, sorted with
   * cost-before-return tiebreaker at the same frame. Called on every
   * addCost/addRecovery so the SP graph is always current — no separate
   * finalize step needed for graph building.
   */
  private flushSpEvents() {
    this.pendingSpEvents.sort(
      (a, b) => a.startFrame - b.startFrame || (a.name === SP_COST_EVENT_ID ? -1 : 1),
    );
    this.subtimeline.setEvents(this.pendingSpEvents);
  }

  // ── Clear (called at pipeline start) ────────────────────────────────────

  /**
   * Reset accumulated state for a new pipeline run. Called once per run
   * before the drain begins. Does NOT clear the subtimeline/graph — the
   * next flushSpEvents replaces it.
   */
  clearPending() {
    this.pendingSpEvents = [];
    this.battleSkillGainFrames = new Map();
    this.slotSpCosts = new Map();
  }

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
