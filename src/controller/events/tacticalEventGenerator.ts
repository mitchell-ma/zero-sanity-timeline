import { TimelineEvent, EventSegmentData } from '../../consts/viewTypes';
import { getTactical } from '../gameDataStore';
import type { Interaction } from '../../dsl/semantics';
import { FPS } from '../../utils/timeline';

/**
 * Configuration for a tactical item's derived event behaviour.
 */
interface TacticalEventConfig {
  name: string;
  /** Duration in frames. */
  durationFrames: number;
  /** Max uses per battle. */
  usageLimit: number;
  /** Trigger condition type. */
  trigger: Interaction;
  /** Ultimate energy restore as a fraction of max (e.g. 0.2 = 20%). */
  ultEnergyRestore: number;
  /** Threshold fraction below which the tactical triggers (e.g. 0.5 = 50%). */
  ultThreshold: number;
}

/** Resolve tactical config from a tactical ID. */
function getTacticalConfig(tacticalId: string): TacticalEventConfig | null {
  const tactical = getTactical(tacticalId);
  if (!tactical) return null;

  return {
    name: tactical.name,
    durationFrames: Math.round(tactical.durationSeconds * FPS),
    usageLimit: tactical.resolvedUsageLimit,
    trigger: tactical.triggerCondition,
    ultEnergyRestore: tactical.ultEnergyRestore,
    ultThreshold: tactical.triggerThreshold,
  };
}

/**
 * Result of tactical event generation for a single operator slot.
 */
export interface TacticalEventResult {
  /** Derived tactical events to display on the tactical column. */
  events: TimelineEvent[];
  /** Gauge gain entries to inject into the ult energy calculation. */
  gaugeGains: { frame: number; amount: number }[];
}

/**
 * Generate derived tactical events for one operator slot.
 *
 * Iteratively scans the ultimate energy graph (including previously generated
 * tactical gains) to find frames where energy drops below the trigger threshold,
 * up to `usageLimit`.
 *
 * @param slotId       Operator slot ID
 * @param tacticalId   Equipped tactical item ID
 * @param ultMax       Ultimate energy cost (max gauge)
 * @param ultTimeline  Sorted ult timeline events: { frame, type, amount }[]
 * @param chargePerFrame Ult charge per frame (regen rate)
 * @param startValue   Starting ult energy value
 */
export function generateTacticalEvents(
  slotId: string,
  tacticalId: string,
  ultMax: number,
  ultTimeline: { frame: number; type: 'consume' | 'gain'; amount: number }[],
  chargePerFrame: number,
  startValue: number,
  usageLimitOverride?: number,
): TacticalEventResult | null {
  const config = getTacticalConfig(tacticalId);
  if (!config) return null;
  if (usageLimitOverride !== undefined) config.usageLimit = usageLimitOverride;

  const threshold = config.ultThreshold * ultMax;
  const restoreAmount = config.ultEnergyRestore * ultMax;
  const events: TimelineEvent[] = [];
  const gaugeGains: { frame: number; amount: number }[] = [];

  // Build a mutable working timeline that we'll augment with tactical gains
  const workingTimeline = ultTimeline.map((t) => ({ ...t }));

  for (let use = 0; use < config.usageLimit; use++) {
    // Simulate the ult energy graph to find the first frame below threshold
    const triggerFrame = findFirstBelowThreshold(
      workingTimeline, ultMax, chargePerFrame, startValue, threshold,
    );
    if (triggerFrame === null) break;

    // Create the derived event
    const segment: EventSegmentData = {
      properties: { duration: config.durationFrames },
      frames: [{ offsetFrame: 0 }],
    };

    events.push({
      uid: `tactical-${slotId}-${use}`,
      id: config.name,
      name: config.name,
      ownerId: slotId,
      columnId: 'tactical',
      startFrame: triggerFrame,
      segments: [segment],
      sourceOwnerId: slotId,
      sourceSkillName: config.name,
    });

    gaugeGains.push({ frame: triggerFrame, amount: restoreAmount });

    // Insert the tactical gain into the working timeline for next iteration
    workingTimeline.push({ frame: triggerFrame, type: 'gain', amount: restoreAmount });
    workingTimeline.sort((a, b) => a.frame - b.frame || (a.type === 'gain' ? -1 : 1));
  }

  return events.length > 0 ? { events, gaugeGains } : null;
}

/**
 * Simulate the ult energy graph and return the first frame where energy drops
 * below `threshold`. Returns null if energy never drops below.
 */
function findFirstBelowThreshold(
  timeline: { frame: number; type: 'consume' | 'gain'; amount: number }[],
  max: number,
  chargePerFrame: number,
  startValue: number,
  threshold: number,
): number | null {
  let value = startValue;
  let lastFrame = 0;

  const clamp = (v: number) => Math.max(0, Math.min(max, v));

  // Check starting value
  if (value < threshold) return 0;

  for (const te of timeline) {
    // Regen from lastFrame to this event
    if (chargePerFrame > 0 && te.frame > lastFrame) {
      // Check if value drops below threshold during regen (it wouldn't — regen only increases)
      value = clamp(value + (te.frame - lastFrame) * chargePerFrame);
    }

    const preAction = value;

    if (te.type === 'consume') {
      value = clamp(preAction - te.amount);
    } else {
      value = clamp(preAction + te.amount);
    }

    if (value < threshold) {
      return te.frame;
    }

    lastFrame = te.frame;
  }

  // Check remaining frames (with regen only, value can only increase, so no trigger)
  return null;
}
