import { ResourcePoint } from './resourceTimeline';
import { TOTAL_FRAMES } from '../../utils/timeline';

/** A gain or consume event on the ultimate energy timeline. */
export interface UltEnergyEvent {
  frame: number;
  type: 'consume' | 'gain';
  amount: number;
}

/** Result of computing an ultimate energy timeline for one operator. */
export interface UltimateEnergyResult {
  points: ResourcePoint[];
  /** Total ultimate charge wasted due to gains that would exceed max. */
  wastedCharge: number;
}

/**
 * Computes the ultimate energy graph for a single operator slot,
 * tracking wasted charge from overflow.
 *
 * Pure function — no subscriptions or side effects.
 * Called per-slot from useResourceGraphs.
 */
export function computeUltimateEnergyGraph(
  timeline: readonly UltEnergyEvent[],
  max: number,
  startValue: number,
  chargePerFrame: number,
): UltimateEnergyResult {
  const points: ResourcePoint[] = [];
  let value = startValue;
  let lastFrame = 0;
  let wasted = 0;

  points.push({ frame: 0, value });

  for (const te of timeline) {
    // Regen from last event to this one
    const regenFrames = te.frame - lastFrame;
    const rawRegen = regenFrames * chargePerFrame;
    const preAction = Math.min(max, value + rawRegen);
    if (value + rawRegen > max) {
      wasted += (value + rawRegen) - max;
    }

    if (preAction !== value || te.frame !== lastFrame) {
      if (preAction !== points[points.length - 1].value || te.frame !== points[points.length - 1].frame) {
        points.push({ frame: te.frame, value: preAction });
      }
    }

    let postAction: number;
    if (te.type === 'consume') {
      postAction = Math.max(0, preAction - te.amount);
    } else {
      const raw = preAction + te.amount;
      postAction = Math.min(max, raw);
      if (raw > max) {
        wasted += raw - max;
      }
    }
    points.push({ frame: te.frame, value: postAction });
    value = postAction;
    lastFrame = te.frame;
  }

  // Regen to end of timeline
  const rawEndRegen = (TOTAL_FRAMES - lastFrame) * chargePerFrame;
  const endValue = Math.min(max, value + rawEndRegen);
  if (value + rawEndRegen > max) {
    wasted += (value + rawEndRegen) - max;
  }

  if (endValue !== value && chargePerFrame > 0 && value < max) {
    const framesToMax = Math.ceil((max - value) / chargePerFrame);
    const maxFrame = Math.min(lastFrame + framesToMax, TOTAL_FRAMES);
    if (maxFrame < TOTAL_FRAMES) {
      points.push({ frame: maxFrame, value: max });
    }
  }
  points.push({ frame: TOTAL_FRAMES, value: endValue });

  return { points, wastedCharge: Math.max(0, wasted) };
}
