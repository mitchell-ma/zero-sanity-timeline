/**
 * SkillPointController — owns the SP resource timeline, subtimeline, and all
 * sync/query logic for skill point tracking.
 *
 * Extracts SP cost and return events from processed skill events, feeds them
 * into the underlying SkillPointTimeline, and computes per-slot insufficiency
 * zones for battle skill columns.
 */
import { TimelineEvent, getAnimationDuration, durationSegment } from '../../consts/viewTypes';
import { SKILL_COLUMNS } from '../../model/channels';
import { Subtimeline } from '../timeline/subtimeline';
import { SkillPointTimeline, ResourceZone, SkillPointConsumptionHistory } from '../timeline/skillPointTimeline';
import { ResourceGraphListener, ResourcePoint } from '../timeline/resourceTimeline';
import { collectTimeStopRanges } from '../timeline/processTimeStop';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from './commonSlotController';

export type { ResourceZone, SkillPointConsumptionHistory };

export class SkillPointController {
  private readonly subtimeline: Subtimeline;
  private readonly timeline: SkillPointTimeline;

  /** Per-slot SP insufficiency zones, keyed by `slotId:battle`. */
  insufficiencyZones: Map<string, ResourceZone[]> = new Map();

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

  // ── Event sync ─────────────────────────────────────────────────────────

  /**
   * Build SP cost and return events from processed battle skill events,
   * merge with derived SP recovery events, and feed them to the SP subtimeline.
   * Then compute per-slot insufficiency zones for battle skill columns.
   *
   * Extracts time-stops from processed events and applies them to the
   * SP timeline so regen pauses during animation freezes.
   *
   * @param processedEvents All processed timeline events.
   * @param slotSpCosts Map of slotId → SP cost threshold for that slot's battle skill.
   */
  sync(
    processedEvents: ReadonlyArray<TimelineEvent>,
    slotSpCosts?: ReadonlyMap<string, number>,
  ): void {
    // Extract and apply time-stops from processed events
    this.timeline.setTimeStops(collectTimeStopRanges(processedEvents));

    // Collect derived SP recovery events (from processInflictions)
    const spRecovery = processedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === COMMON_COLUMN_IDS.SKILL_POINTS,
    );

    const battleCosts: TimelineEvent[] = [];
    const spReturns: TimelineEvent[] = [];

    for (const ev of processedEvents) {
      if (ev.columnId !== SKILL_COLUMNS.BATTLE || !ev.skillPointCost) continue;

      battleCosts.push({
        id: `${ev.id}-sp`,
        name: 'sp-cost',
        ownerId: COMMON_OWNER_ID,
        columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
        startFrame: ev.startFrame,
        segments: durationSegment(ev.skillPointCost),
      });

      if (ev.segments) {
        const animOffset = getAnimationDuration(ev);
        let segOffset = 0;
        for (const seg of ev.segments) {
          if (seg.frames) {
            for (const f of seg.frames) {
              if (f.skillPointRecovery && f.skillPointRecovery > 0) {
                const frame = f.absoluteFrame ?? (ev.startFrame + animOffset + segOffset + f.offsetFrame);
                spReturns.push({
                  id: `${ev.id}-sp-return-${frame}`,
                  name: 'sp-return',
                  ownerId: COMMON_OWNER_ID,
                  columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
                  startFrame: frame,
                  segments: durationSegment(f.skillPointRecovery),
                });
              }
            }
          }
          segOffset += seg.properties.duration;
        }
      }
    }

    const allSpEvents = [...spRecovery, ...battleCosts, ...spReturns]
      .sort((a, b) => a.startFrame - b.startFrame || (a.name === 'sp-cost' ? -1 : 1));
    this.subtimeline.setEvents(allSpEvents);

    // Compute per-slot SP insufficiency zones for battle skill columns
    this.insufficiencyZones = new Map();
    if (slotSpCosts) {
      slotSpCosts.forEach((cost, slotId) => {
        const zones = this.timeline.insufficiencyZones(cost);
        if (zones.length > 0) {
          this.insufficiencyZones.set(`${slotId}:${SKILL_COLUMNS.BATTLE}`, zones);
        }
      });
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  clear(): void {
    this.subtimeline.clear();
  }

  destroy(): void {
    this.timeline.destroy();
  }
}
