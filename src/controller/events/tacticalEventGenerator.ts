import { TimelineEvent, EventSegmentData } from '../../consts/viewTypes';
import { TACTICALS } from '../../utils/loadoutRegistry';
import { Tactical } from '../../model/consumables/tactical';
import { StewMeeting } from '../../model/consumables/stewMeeting';
import { TriggerConditionType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';

/**
 * Configuration for a tactical item's derived event behaviour.
 */
interface TacticalEventConfig {
  name: string;
  /** Duration in frames. */
  durationFrames: number;
  /** Max uses per battle. */
  maxUses: number;
  /** Trigger condition type. */
  trigger: TriggerConditionType;
  /** Ultimate energy restore as a fraction of max (e.g. 0.2 = 20%). */
  ultEnergyRestore: number;
  /** Threshold fraction below which the tactical triggers (e.g. 0.5 = 50%). */
  ultThreshold: number;
}

/** Resolve tactical config from a tactical name. */
function getTacticalConfig(tacticalName: string): TacticalEventConfig | null {
  const entry = TACTICALS.find((t) => t.name === tacticalName);
  if (!entry) return null;
  const tactical = entry.create() as Tactical;

  if (tactical instanceof StewMeeting) {
    return {
      name: tactical.name,
      durationFrames: Math.round(1 * FPS), // 1 second
      maxUses: tactical.maxUses,
      trigger: tactical.triggerCondition,
      ultEnergyRestore: StewMeeting.ULTIMATE_ENERGY_RESTORE,
      ultThreshold: StewMeeting.TRIGGER_THRESHOLD,
    };
  }

  return null;
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
 * up to `maxUses`.
 *
 * @param slotId       Operator slot ID
 * @param tacticalName Equipped tactical item name
 * @param ultMax       Ultimate energy cost (max gauge)
 * @param ultTimeline  Sorted ult timeline events: { frame, type, amount }[]
 * @param chargePerFrame Ult charge per frame (regen rate)
 * @param startValue   Starting ult energy value
 */
export function generateTacticalEvents(
  slotId: string,
  tacticalName: string,
  ultMax: number,
  ultTimeline: { frame: number; type: 'consume' | 'gain'; amount: number }[],
  chargePerFrame: number,
  startValue: number,
): TacticalEventResult | null {
  const config = getTacticalConfig(tacticalName);
  if (!config) return null;

  const threshold = config.ultThreshold * ultMax;
  const restoreAmount = config.ultEnergyRestore * ultMax;
  const events: TimelineEvent[] = [];
  const gaugeGains: { frame: number; amount: number }[] = [];

  // Build a mutable working timeline that we'll augment with tactical gains
  const workingTimeline = ultTimeline.map((t) => ({ ...t }));

  for (let use = 0; use < config.maxUses; use++) {
    // Simulate the ult energy graph to find the first frame below threshold
    const triggerFrame = findFirstBelowThreshold(
      workingTimeline, ultMax, chargePerFrame, startValue, threshold,
    );
    if (triggerFrame === null) break;

    // Create the derived event
    const segment: EventSegmentData = {
      durationFrames: config.durationFrames,
      frames: [{ offsetFrame: 0 }],
    };

    events.push({
      id: `tactical-${slotId}-${use}`,
      name: config.name,
      ownerId: slotId,
      columnId: 'tactical',
      startFrame: triggerFrame,
      activationDuration: config.durationFrames,
      activeDuration: 0,
      cooldownDuration: 0,
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
