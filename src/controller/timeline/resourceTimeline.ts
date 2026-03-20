import { Subtimeline } from './subtimeline';
import { TimelineEvent, eventDuration } from '../../consts/viewTypes';
import { TOTAL_FRAMES } from '../../utils/timeline';

/** A frame range where game-time is frozen (no regen). */
export interface TimeStopRange {
  startFrame: number;
  endFrame: number;
}

/**
 * A point on the resource line graph.
 * `frame` is the x-axis (time), `value` is the y-axis (resource amount).
 */
export interface ResourcePoint {
  frame: number;
  value: number;
}

export type ResourceGraphListener = (points: ResourcePoint[]) => void;

/**
 * Abstract resource timeline that tracks a numeric value over time.
 *
 * The resource starts at `startValue`, regenerates at `regenPerFrame`,
 * and is clamped to [min, max]. Events on the underlying subtimeline
 * represent instant consumption costs — each event's segment duration
 * is used as the cost amount.
 *
 * Subclasses define the concrete resource parameters.
 */
export abstract class ResourceTimeline {
  abstract min: number;
  abstract max: number;
  abstract startValue: number;
  /** Resource gained per frame (e.g. 8 SP/sec at 120fps = 8/120). */
  abstract regenPerFrame: number;

  readonly subtimeline: Subtimeline;

  protected cachedGraph: ResourcePoint[] = [];
  protected graphListeners = new Set<ResourceGraphListener>();
  private unsubscribe: (() => void) | null = null;
  /** Sorted time-stop ranges where regen is paused. */
  protected timeStops: TimeStopRange[] = [];

  constructor(subtimeline: Subtimeline) {
    this.subtimeline = subtimeline;
    this.unsubscribe = subtimeline.subscribe(() => this.recompute());
    // NOTE: do NOT call recompute() here — subclass field initializers
    // (min, max, startValue, regenPerFrame) haven't run yet.
    // Subclasses must call this.init() after super().
  }

  /** Call from subclass constructor after super() to run the initial computation. */
  protected init(): void {
    this.recompute();
  }

  /** Set time-stop ranges (sorted by startFrame) and recompute. */
  setTimeStops(stops: TimeStopRange[]): void {
    this.timeStops = stops;
    this.recompute();
  }

  /** Update resource parameters and recompute. */
  updateConfig(config: { startValue?: number; max?: number; regenPerFrame?: number }): void {
    if (config.startValue !== undefined) this.startValue = config.startValue;
    if (config.max !== undefined) this.max = config.max;
    if (config.regenPerFrame !== undefined) this.regenPerFrame = config.regenPerFrame;
    this.recompute();
  }

  /** Get the resource value at a specific frame. */
  valueAt(frame: number): number {
    const events = this.subtimeline.getEvents(); // sorted by startFrame
    let value = this.startValue;
    let lastFrame = 0;

    for (const ev of events) {
      if (ev.startFrame > frame) break;

      // Regen from lastFrame to this event (paused during time-stops)
      const regenFrames = this.effectiveRegenFrames(lastFrame, ev.startFrame);
      value = this.clamp(value + regenFrames * this.regenPerFrame);

      // Apply cost
      value = this.clamp(value - this.getCost(ev));
      lastFrame = ev.startFrame;
    }

    // Regen from last event to query frame
    const remaining = this.effectiveRegenFrames(lastFrame, frame);
    value = this.clamp(value + remaining * this.regenPerFrame);

    return value;
  }

  /** Get the line graph data series. */
  getGraph(): ReadonlyArray<ResourcePoint> {
    return this.cachedGraph;
  }

  /** Subscribe to graph changes. Returns an unsubscribe function. */
  onGraphChange(listener: ResourceGraphListener): () => void {
    this.graphListeners.add(listener);
    return () => { this.graphListeners.delete(listener); };
  }

  /** Extract the cost from an event. Override in subclasses for custom cost logic. */
  protected getCost(ev: TimelineEvent): number {
    return eventDuration(ev);
  }

  /** Clean up subscriptions. */
  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.graphListeners.clear();
  }

  /**
   * Recompute the line graph from the current events.
   * Produces a point at every change (event consumption, regen hitting max).
   */
  protected recompute(): void {
    const events = this.subtimeline.getEvents();
    const points: ResourcePoint[] = [];

    let value = this.startValue;
    let lastFrame = 0;

    // Starting point
    points.push({ frame: 0, value });

    for (const ev of events) {
      // Point just before consumption (after regen, paused during time-stops)
      const regenFrames = this.effectiveRegenFrames(lastFrame, ev.startFrame);
      const preConsume = this.clamp(value + regenFrames * this.regenPerFrame);

      if (preConsume !== value || ev.startFrame !== lastFrame) {
        // If value changed due to regen, or time advanced, record the pre-consume point
        if (preConsume !== points[points.length - 1].value || ev.startFrame !== points[points.length - 1].frame) {
          points.push({ frame: ev.startFrame, value: preConsume });
        }
      }

      // Apply cost
      const postConsume = this.clamp(preConsume - this.getCost(ev));
      points.push({ frame: ev.startFrame, value: postConsume });

      value = postConsume;
      lastFrame = ev.startFrame;
    }

    // Regen to end of timeline
    const endRegenFrames = this.effectiveRegenFrames(lastFrame, TOTAL_FRAMES);
    const endValue = this.clamp(value + endRegenFrames * this.regenPerFrame);
    if (endValue !== value) {
      // Find frame where max is reached (if regen is positive)
      if (this.regenPerFrame > 0 && value < this.max) {
        const framesToMax = Math.ceil((this.max - value) / this.regenPerFrame);
        // Account for time-stops: walk forward from lastFrame counting effective frames
        const maxFrame = this.frameAfterEffectiveFrames(lastFrame, framesToMax);
        if (maxFrame < TOTAL_FRAMES) {
          points.push({ frame: maxFrame, value: this.max });
        }
      }
    }
    points.push({ frame: TOTAL_FRAMES, value: endValue });

    // Insert points at time-stop boundaries so the graph shows flat segments
    // where regen is paused, instead of interpolating straight through.
    const finalPoints = this.insertTimeStopPoints(points);

    this.cachedGraph = finalPoints;
    this.onRecompute();
    this.graphListeners.forEach((cb) => cb(finalPoints));
  }

  /** Hook for subclasses to react after the graph is recomputed. */
  protected onRecompute(): void {}


  /**
   * Find the actual game-frame that is `needed` effective (non-stopped) frames
   * after `from`. Skips over time-stop ranges.
   */
  protected frameAfterEffectiveFrames(from: number, needed: number): number {
    let remaining = needed;
    let cursor = from;

    for (const ts of this.timeStops) {
      if (ts.startFrame <= cursor) {
        // Time-stop started before/at cursor — skip past it
        cursor = Math.max(cursor, ts.endFrame);
        continue;
      }
      // Gap before this time-stop
      const gap = ts.startFrame - cursor;
      if (remaining <= gap) return cursor + remaining;
      remaining -= gap;
      cursor = ts.endFrame;
    }

    return Math.min(cursor + remaining, TOTAL_FRAMES);
  }

  /**
   * Compute effective regen frames between two game-frames,
   * subtracting any overlapping time-stop durations where regen is paused.
   */
  protected effectiveRegenFrames(from: number, to: number): number {
    let total = to - from;
    for (const ts of this.timeStops) {
      if (ts.startFrame >= to) break;
      if (ts.endFrame <= from) continue;
      // Overlap between [from, to) and [ts.startFrame, ts.endFrame)
      const overlapStart = Math.max(from, ts.startFrame);
      const overlapEnd = Math.min(to, ts.endFrame);
      total -= (overlapEnd - overlapStart);
    }
    return Math.max(0, total);
  }

  /**
   * Walk through graph points and insert extra points at time-stop boundaries.
   * Between any two consecutive points where regen is happening, if a time-stop
   * falls in that interval, we insert a point at the stop start (with regened value)
   * and at the stop end (same value, flat).
   */
  protected insertTimeStopPoints(points: ResourcePoint[]): ResourcePoint[] {
    if (this.timeStops.length === 0 || points.length < 2) return points;

    const result: ResourcePoint[] = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const prev = result[result.length - 1];
      const curr = points[i];

      // If same frame (e.g. pre/post consume at same frame), just add it
      if (curr.frame === prev.frame) {
        result.push(curr);
        continue;
      }

      // Check for time-stops between prev.frame and curr.frame
      // Only insert if there's actual regen happening (values differ or could differ)
      for (const ts of this.timeStops) {
        if (ts.startFrame >= curr.frame) break;
        if (ts.endFrame <= prev.frame) continue;

        const stopStart = Math.max(ts.startFrame, prev.frame);
        const stopEnd = Math.min(ts.endFrame, curr.frame);

        if (stopStart <= prev.frame && stopEnd >= curr.frame) continue; // entire span is stopped

        // Insert point at time-stop start (value regened from last result point)
        if (stopStart > result[result.length - 1].frame) {
          const lastPt = result[result.length - 1];
          const regenFrames = this.effectiveRegenFrames(lastPt.frame, stopStart);
          const val = this.clamp(lastPt.value + regenFrames * this.regenPerFrame);
          result.push({ frame: stopStart, value: val });
        }

        // Insert point at time-stop end (same value — no regen during stop)
        if (stopEnd < curr.frame && stopEnd > result[result.length - 1].frame) {
          const lastPt = result[result.length - 1];
          result.push({ frame: stopEnd, value: lastPt.value });
        }
      }

      result.push(curr);
    }

    return result;
  }

  protected clamp(value: number): number {
    return Math.max(this.min, Math.min(this.max, value));
  }
}
