/**
 * SkillPointController — owns the SP resource timeline, subtimeline, and all
 * sync/query logic for skill point tracking.
 *
 * Extracts SP cost and return events from processed skill events, feeds them
 * into the underlying SkillPointTimeline, and computes per-slot insufficiency
 * zones for battle skill columns.
 */
import { TimelineEvent, getAnimationDuration, durationSegment } from '../../consts/viewTypes';
import { SKILL_COLUMNS, OPERATOR_COLUMNS } from '../../model/channels';
import { ENEMY_OWNER_ID } from '../../model/channels';
import { absoluteFrame, foreignStopsFor } from '../timeline/processTimeStop';
import type { TimeStopRegion } from '../timeline/processTimeStop';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
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
                id: `${event.id}-sp-${si}-${fi}`,
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
      if (event.columnId === OPERATOR_COLUMNS.DASH && event.isPerfectDodge) {
        derived.push({
          id: `${event.id}-sp-dodge`,
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
}
