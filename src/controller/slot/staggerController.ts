/**
 * StaggerController — owns the stagger resource timeline, subtimeline, and all
 * sync/query logic for enemy stagger tracking.
 *
 * Configures stagger parameters from enemy stats, extracts stagger damage from
 * processed skill segments, feeds events into the underlying StaggerTimeline,
 * and generates frailty events for node crossings and full stagger breaks.
 */
import { StatType, SegmentType } from '../../consts/enums';
import { NounType } from '../../dsl/semantics';
import { TimelineEvent, getAnimationDuration, durationSegment } from '../../consts/viewTypes';
import { ENEMY_OWNER_ID, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID } from '../../model/channels';
import { Subtimeline } from '../timeline/subtimeline';
import { StaggerTimeline, StaggerBreak } from '../timeline/staggerTimeline';
import { ResourceGraphListener, ResourcePoint } from '../timeline/resourceTimeline';
import { collectTimeStopRanges } from '../timeline/processTimeStop';
import { FPS } from '../../utils/timeline';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from './commonSlotController';

export type { StaggerBreak };

export interface StaggerEnemyStats {
  staggerNodes: number;
  staggerNodeRecoverySeconds: number;
  staggerStartValue?: number;
  [StatType.STAGGER_HP]: number;
  [StatType.STAGGER_RECOVERY]: number;
}

export class StaggerController {
  private readonly subtimeline: Subtimeline;
  private readonly timeline: StaggerTimeline;

  /** Cached frailty events from the last sync. */
  frailtyEvents: TimelineEvent[] = [];

  /** Cached stagger breaks from the last sync. */
  breaks: readonly StaggerBreak[] = [];

  constructor() {
    this.subtimeline = new Subtimeline(COMMON_OWNER_ID, COMMON_COLUMN_IDS.STAGGER);
    this.timeline = new StaggerTimeline(this.subtimeline);
  }

  // ── Delegated resource properties ───────────────────────────────────────

  get min() { return this.timeline.min; }
  get max() { return this.timeline.max; }

  getSubtimeline(): Subtimeline { return this.subtimeline; }
  getGraph(): ReadonlyArray<ResourcePoint> { return this.timeline.getGraph(); }
  onGraphChange(listener: ResourceGraphListener): () => void { return this.timeline.onGraphChange(listener); }
  getNodeThresholds(): number[] { return this.timeline.getNodeThresholds(); }

  // ── Event sync ─────────────────────────────────────────────────────────

  /**
   * Configure the stagger timeline and sync stagger damage events from
   * processed skill events.
   *
   * Extracts time-stops and stagger frame data from segments, configures
   * max/nodes/break from enemy stats, feeds events into the stagger
   * subtimeline, and generates frailty events for node crossings and
   * full breaks.
   */
  sync(
    processedEvents: ReadonlyArray<TimelineEvent>,
    enemyStats: StaggerEnemyStats,
  ): void {
    // Extract and apply time-stops from processed events
    this.timeline.setTimeStops(collectTimeStopRanges(processedEvents));

    // Configure stagger timeline from enemy stats
    this.timeline.setNodeCount(enemyStats.staggerNodes);
    this.timeline.setBreakDuration(Math.round(enemyStats[StatType.STAGGER_RECOVERY] * FPS));
    this.timeline.updateConfig({
      max: enemyStats[StatType.STAGGER_HP],
      startValue: enemyStats.staggerStartValue ?? 0,
    });

    // Extract stagger damage events from skill segments
    const staggerEvents: TimelineEvent[] = [];
    for (const ev of processedEvents) {
      const animOffset = (ev.columnId === NounType.COMBO_SKILL || ev.columnId === NounType.ULTIMATE)
        ? getAnimationDuration(ev) : 0;
      let segOffset = 0;
      for (const seg of ev.segments) {
        // Skip ANIMATION segments — their offset is already in animOffset
        if (seg.properties.segmentTypes?.includes(SegmentType.ANIMATION)) continue;
        if (seg.frames) {
          for (const f of seg.frames) {
            if (f.stagger && f.stagger > 0) {
              const frame = f.absoluteFrame ?? (ev.startFrame + animOffset + segOffset + f.offsetFrame);
              staggerEvents.push({
                uid: `${ev.uid}-stagger-${frame}`,
                id: 'stagger',
                name: 'stagger',
                ownerId: ev.ownerId,
                columnId: COMMON_COLUMN_IDS.STAGGER,
                startFrame: frame,
                segments: durationSegment(f.stagger),
              });
            }
          }
        }
        segOffset += seg.properties.duration;
      }
    }

    this.subtimeline.setEvents(staggerEvents.sort((a, b) => a.startFrame - b.startFrame));

    // Generate frailty events and cache breaks
    const nodeRecoveryFrames = Math.round((enemyStats.staggerNodeRecoverySeconds ?? 0) * FPS);
    this.frailtyEvents = this.timeline.generateFrailtyEvents(
      nodeRecoveryFrames,
      NODE_STAGGER_COLUMN_ID,
      FULL_STAGGER_COLUMN_ID,
      ENEMY_OWNER_ID,
      'stagger-frailty',
    );
    this.breaks = this.timeline.getBreaks();
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  clear(): void {
    this.subtimeline.clear();
  }

  destroy(): void {
    this.timeline.destroy();
  }
}
