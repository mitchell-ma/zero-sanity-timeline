import { Subtimeline } from './subtimeline';
import { ResourceTimeline, ResourcePoint } from './resourceTimeline';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';

const SP_MAX = 300;
const SP_REGEN_PER_SECOND = 8;

/** Record of how SP was consumed for a single battle skill cost event. */
export interface SkillPointConsumptionHistory {
  eventId: string;
  frame: number;
  naturalConsumed: number;
  returnedConsumed: number;
}

/**
 * Skill Point resource timeline with dual-pool tracking.
 *
 * Two internal pools: natural SP (regens) and returned SP (from skill recoveries).
 * Both sum to 300 max. Cost events consume returned first, then natural.
 * The graph output is the combined total — same format as before.
 */
export class SkillPointTimeline extends ResourceTimeline {
  min = 0;
  max = SP_MAX;
  startValue = 200;
  regenPerFrame = SP_REGEN_PER_SECOND / FPS;

  /** Log of natural vs returned SP consumption per battle skill cost event. */
  consumptionHistory: SkillPointConsumptionHistory[] = [];

  constructor(subtimeline: Subtimeline) {
    super(subtimeline);
    this.init();
  }

  /** Override recompute to track dual pools internally. */
  protected recompute(): void {
    const events = this.subtimeline.getEvents();
    const points: ResourcePoint[] = [];
    const log: SkillPointConsumptionHistory[] = [];

    // Natural pool starts at startValue; returned pool starts at 0
    let naturalPool = this.startValue;
    let returnedPool = 0;
    let lastFrame = 0;

    points.push({ frame: 0, value: naturalPool + returnedPool });

    for (const ev of events) {
      // Regen natural pool from lastFrame to this event
      const regenFrames = this.effectiveRegenFrames(lastFrame, ev.startFrame);
      const regenAmount = regenFrames * this.regenPerFrame;
      // Natural regens, capped so total ≤ max
      const headroomForRegen = Math.max(0, this.max - naturalPool - returnedPool);
      naturalPool += Math.min(regenAmount, headroomForRegen);

      const preTotal = naturalPool + returnedPool;
      if (preTotal !== points[points.length - 1].value || ev.startFrame !== points[points.length - 1].frame) {
        points.push({ frame: ev.startFrame, value: preTotal });
      }

      if (ev.name === 'sp-return') {
        // Return event: add to returned pool, capped so total ≤ max
        const returnAmount = ev.activationDuration;
        const headroom = Math.max(0, this.max - naturalPool - returnedPool);
        returnedPool += Math.min(returnAmount, headroom);
      } else {
        // Cost event: consume returned first, then natural
        const cost = this.getCost(ev);
        const fromReturned = Math.min(returnedPool, cost);
        const fromNatural = Math.min(naturalPool, cost - fromReturned);
        returnedPool -= fromReturned;
        naturalPool -= fromNatural;

        // Extract the original event ID (strip '-sp' suffix)
        const originalEventId = ev.id.endsWith('-sp') ? ev.id.slice(0, -3) : ev.id;
        log.push({
          eventId: originalEventId,
          frame: ev.startFrame,
          naturalConsumed: fromNatural,
          returnedConsumed: fromReturned,
        });
      }

      const postTotal = naturalPool + returnedPool;
      points.push({ frame: ev.startFrame, value: postTotal });

      lastFrame = ev.startFrame;
    }

    // Regen to end of timeline
    const preEndTotal = naturalPool + returnedPool;
    const endRegenFrames = this.effectiveRegenFrames(lastFrame, TOTAL_FRAMES);
    const endRegen = endRegenFrames * this.regenPerFrame;
    const endHeadroom = Math.max(0, this.max - preEndTotal);
    naturalPool += Math.min(endRegen, endHeadroom);
    const endValue = naturalPool + returnedPool;

    if (endValue !== preEndTotal) {
      if (this.regenPerFrame > 0 && preEndTotal < this.max) {
        const framesToMax = Math.ceil((this.max - preEndTotal) / this.regenPerFrame);
        const maxFrame = this.frameAfterEffectiveFrames(lastFrame, framesToMax);
        if (maxFrame < TOTAL_FRAMES) {
          points.push({ frame: maxFrame, value: this.max });
        }
      }
    }
    points.push({ frame: TOTAL_FRAMES, value: endValue });

    // Insert time-stop boundary points
    const finalPoints = this.insertTimeStopPoints(points);

    this.cachedGraph = finalPoints;
    this.consumptionHistory = log;
    this.graphListeners.forEach((cb) => cb(finalPoints));
  }
}
