/**
 * Main orchestrator for the event processing pipeline.
 * Delegates entirely to processEventQueue — no pre/post processing here.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { LoadoutProperties } from '../../view/InformationPane';
import { processEventQueue } from './eventQueue';
import { mergeReactions, attachReactionFrames } from './processInfliction';

// Re-export commonly used types and constants from sub-modules
export type { TimeStopRegion } from './processTimeStop';
export { collectTimeStopRegions, extendByTimeStops } from './processTimeStop';
export type { SlotTriggerWiring } from './processComboSkill';
export { COMBO_WINDOW_COLUMN_ID, ENEMY_COLUMN_TO_INTERACTIONS, comboWindowEndFrame, getFinalStrikeTriggerFrame, hasActiveEventInColumns } from './processComboSkill';

/**
 * Processes raw timeline events into renderable events.
 * All processing (time-stop resolution, infliction derivation, reaction handling,
 * exchange statuses, combo windows, frame positions, validation) happens inside
 * processEventQueue.
 */
export function processInflictionEvents(
  rawEvents: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotWeapons?: Record<string, string | undefined>,
  slotWirings?: import('./processComboSkill').SlotTriggerWiring[],
  /** Slot ID → operator ID mapping (guarantees slot detection for talent events). */
  slotOperatorMap?: Record<string, string>,
  /** Slot ID → gear set type mapping for gear effect derivation. */
  slotGearSets?: Record<string, string | undefined>,
): TimelineEvent[] {
  let events = processEventQueue(
    rawEvents, loadoutProperties, slotWeapons, slotWirings,
    slotOperatorMap, slotGearSets,
  );
  // Merge overlapping same-type reactions (refresh + inherit max statusLevel),
  // then rebuild their segments with the merged stats.
  events = attachReactionFrames(mergeReactions(events));
  return events;
}
