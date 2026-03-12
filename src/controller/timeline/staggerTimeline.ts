import { Subtimeline } from './subtimeline';
import { ResourceTimeline, ResourcePoint } from './resourceTimeline';
import { TimelineEvent } from '../../consts/viewTypes';
import { TOTAL_FRAMES } from '../../utils/timeline';

const DEFAULT_STAGGER_HP = 60;

/** A frame where the stagger meter crossed a node threshold. */
export interface StaggerNodeCrossing {
  /** Frame at which the node threshold was reached. */
  frame: number;
  /** Which node was crossed (1-based). */
  nodeIndex: number;
}

/** A frame range where the enemy is fully staggered (meter hit max). */
export interface StaggerBreak {
  startFrame: number;
  endFrame: number;
}

/**
 * Stagger meter resource timeline.
 *
 * Starts at 0 and builds up as the team deals stagger damage.
 * No passive regen.
 *
 * When the meter reaches max (stagger HP), a stagger break occurs:
 * - The meter drains from max→0 over `breakDurationFrames` (game-time,
 *   paused during time-stops).
 * - Incoming stagger is ignored during the break.
 * - After break, stagger accumulation resumes from 0.
 *
 * Node thresholds are evenly spaced within the stagger bar. When the meter
 * crosses a node threshold, a crossing is recorded for frailty event generation.
 */
export class StaggerTimeline extends ResourceTimeline {
  min = 0;
  max = DEFAULT_STAGGER_HP;
  startValue = 0;
  regenPerFrame = 0;

  /** Number of intermediate stagger nodes. */
  private nodeCount = 0;
  /** Duration of a full stagger break in frames. Also the drain duration. */
  private breakDurationFrames = 0;

  private cachedNodeCrossings: StaggerNodeCrossing[] = [];
  private cachedBreaks: StaggerBreak[] = [];

  constructor(subtimeline: Subtimeline) {
    super(subtimeline);
    this.init();
  }

  /** Configure stagger nodes. */
  setNodeCount(count: number): void {
    if (count === this.nodeCount) return;
    this.nodeCount = count;
    this.recompute();
  }

  /** Set the stagger break duration in frames. */
  setBreakDuration(frames: number): void {
    if (frames === this.breakDurationFrames) return;
    this.breakDurationFrames = frames;
    this.recompute();
  }

  /** Get the node thresholds as values (e.g. [140] for 1 node with max=280). */
  getNodeThresholds(): number[] {
    if (this.nodeCount <= 0) return [];
    const thresholds: number[] = [];
    const step = this.max / (this.nodeCount + 1);
    for (let i = 1; i <= this.nodeCount; i++) {
      thresholds.push(step * i);
    }
    return thresholds;
  }

  /** Get frames where the stagger meter crossed node thresholds. */
  getNodeCrossings(): readonly StaggerNodeCrossing[] {
    return this.cachedNodeCrossings;
  }

  /** Get stagger break periods (meter hit max). */
  getBreaks(): readonly StaggerBreak[] {
    return this.cachedBreaks;
  }

  /** Negate cost so stagger damage increases the meter value. */
  protected getCost(ev: TimelineEvent): number {
    return -ev.activationDuration;
  }

  /**
   * Override recompute to handle stagger breaks and node crossings.
   *
   * When the meter reaches max:
   * 1. Record a stagger break starting at that frame
   * 2. Linearly drain the meter from max→0 over breakDurationFrames (game-time)
   * 3. Skip any stagger events that land during the break
   * 4. Resume accumulation from 0 after the break ends
   */
  protected recompute(): void {
    const allEvents = this.subtimeline.getEvents();
    const points: ResourcePoint[] = [];
    const breaks: StaggerBreak[] = [];
    const nodeThresholds = this.getNodeThresholds();
    const crossedNodes = new Array(nodeThresholds.length).fill(false);
    this.cachedNodeCrossings = [];

    let value = this.startValue;
    let lastFrame = 0;
    let breakEndFrame = -1; // End frame of current break (-1 = not in break)

    points.push({ frame: 0, value });

    for (const ev of allEvents) {
      // Skip events during a stagger break (stagger cannot be built)
      if (ev.startFrame < breakEndFrame) continue;

      // If we were in a break that just ended, resume from 0
      if (breakEndFrame > 0 && lastFrame < breakEndFrame) {
        // The drain has completed at breakEndFrame
        lastFrame = breakEndFrame;
        breakEndFrame = -1;
      }

      const prevValue = value;

      // Apply stagger damage
      value = Math.min(this.max, value + ev.activationDuration);

      if (value !== prevValue || ev.startFrame !== lastFrame) {
        if (prevValue !== points[points.length - 1].value || ev.startFrame !== points[points.length - 1].frame) {
          points.push({ frame: ev.startFrame, value: prevValue });
        }
      }
      points.push({ frame: ev.startFrame, value });

      // Check node crossings
      for (let t = 0; t < nodeThresholds.length; t++) {
        if (crossedNodes[t]) continue;
        if (prevValue < nodeThresholds[t] && value >= nodeThresholds[t]) {
          crossedNodes[t] = true;
          this.cachedNodeCrossings.push({ frame: ev.startFrame, nodeIndex: t + 1 });
        }
      }

      // Check stagger break (meter reached max)
      if (value >= this.max && this.breakDurationFrames > 0) {
        const breakStart = ev.startFrame;
        // Break end accounts for time-stops: need breakDurationFrames of game-time
        const breakEnd = this.frameAfterEffectiveFrames(breakStart, this.breakDurationFrames);
        breaks.push({ startFrame: breakStart, endFrame: breakEnd });

        // Add drain graph points: max at start, 0 at end
        points.push({ frame: breakEnd, value: 0 });

        value = 0;
        lastFrame = breakEnd;
        breakEndFrame = breakEnd;

        // Reset crossed nodes after full break
        crossedNodes.fill(false);
      } else {
        lastFrame = ev.startFrame;
      }
    }

    // If still in a break at the end, add the drain endpoint
    if (breakEndFrame > 0 && breakEndFrame <= TOTAL_FRAMES) {
      // Already added the drain endpoint above
    }

    // Final point
    if (points[points.length - 1].frame < TOTAL_FRAMES) {
      points.push({ frame: TOTAL_FRAMES, value });
    }

    this.cachedGraph = points;
    this.cachedBreaks = breaks;
    this.onRecompute();
    this.graphListeners.forEach((cb) => cb(points));
  }

  /** No-op — crossings computed inline in recompute. */
  protected onRecompute(): void {}
}
