import { Subtimeline } from './subtimeline';
import { TimelineEvent } from '../../consts/viewTypes';
import { TOTAL_FRAMES } from '../../utils/timeline';

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
 * represent instant consumption costs — each event's `activationDuration`
 * is used as the cost amount.
 *
 * Subclasses define the concrete resource parameters.
 */
export abstract class ResourceTimeline {
  abstract readonly min: number;
  abstract readonly max: number;
  abstract readonly startValue: number;
  /** Resource gained per frame (e.g. 8 SP/sec at 120fps = 8/120). */
  abstract readonly regenPerFrame: number;

  readonly subtimeline: Subtimeline;

  private cachedGraph: ResourcePoint[] = [];
  private graphListeners = new Set<ResourceGraphListener>();
  private unsubscribe: (() => void) | null = null;

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

  /** Get the resource value at a specific frame. */
  valueAt(frame: number): number {
    const events = this.subtimeline.getEvents(); // sorted by startFrame
    let value = this.startValue;
    let lastFrame = 0;

    for (const ev of events) {
      if (ev.startFrame > frame) break;

      // Regen from lastFrame to this event
      const regenFrames = ev.startFrame - lastFrame;
      value = this.clamp(value + regenFrames * this.regenPerFrame);

      // Apply cost
      value = this.clamp(value - this.getCost(ev));
      lastFrame = ev.startFrame;
    }

    // Regen from last event to query frame
    const remaining = frame - lastFrame;
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
    return ev.activationDuration;
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
  private recompute(): void {
    const events = this.subtimeline.getEvents();
    const points: ResourcePoint[] = [];

    let value = this.startValue;
    let lastFrame = 0;

    // Starting point
    points.push({ frame: 0, value });

    for (const ev of events) {
      // Point just before consumption (after regen)
      const regenFrames = ev.startFrame - lastFrame;
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
    const endValue = this.clamp(value + (TOTAL_FRAMES - lastFrame) * this.regenPerFrame);
    if (endValue !== value) {
      // Find frame where max is reached (if regen is positive)
      if (this.regenPerFrame > 0 && value < this.max) {
        const framesToMax = Math.ceil((this.max - value) / this.regenPerFrame);
        const maxFrame = Math.min(lastFrame + framesToMax, TOTAL_FRAMES);
        if (maxFrame < TOTAL_FRAMES) {
          points.push({ frame: maxFrame, value: this.max });
        }
      }
    }
    points.push({ frame: TOTAL_FRAMES, value: endValue });

    this.cachedGraph = points;
    this.graphListeners.forEach((cb) => cb(points));
  }

  private clamp(value: number): number {
    return Math.max(this.min, Math.min(this.max, value));
  }
}
