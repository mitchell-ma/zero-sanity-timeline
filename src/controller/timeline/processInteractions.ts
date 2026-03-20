/**
 * Main orchestrator for the event processing pipeline.
 * Delegates entirely to processEventQueue — no pre/post processing here.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { LoadoutProperties } from '../../view/InformationPane';
import { processEventQueue } from './eventQueueController';
import { mergeReactions, attachReactionFrames } from './processInfliction';
import type { DerivedEventController } from './derivedEventController';

// Re-export commonly used types and constants from sub-modules
export type { TimeStopRegion } from './processTimeStop';
export { collectTimeStopRegions, extendByTimeStops } from './processTimeStop';
export type { SlotTriggerWiring } from './processComboSkill';
export { COMBO_WINDOW_COLUMN_ID, comboWindowEndFrame, getFinalStrikeTriggerFrame, hasActiveEventInColumns } from './processComboSkill';

// ── Last-computed controller ─────────────────────────────────────────────────

let _lastController: DerivedEventController | null = null;

/** Get the DerivedEventController from the most recent processInflictionEvents run. */
export function getLastController(): DerivedEventController {
  return _lastController!;
}

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
  const { events, controller } = processEventQueue(
    rawEvents, loadoutProperties, slotWeapons, slotWirings,
    slotOperatorMap, slotGearSets,
  );
  _lastController = controller;
  // Merge overlapping same-type reactions (refresh + inherit max statusLevel),
  // then rebuild their segments with the merged stats.
  return attachReactionFrames(mergeReactions(events));
}
