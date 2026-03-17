/**
 * Main orchestrator for the event processing pipeline.
 * Coordinates time-stop resolution, infliction derivation, status processing,
 * combo activation windows, and SP return calculations.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { LoadoutProperties } from '../../view/InformationPane';
import { collectTimeStopRegions, applyTimeStopExtension, resolveFramePositions, validateTimeStopStarts } from './processTimeStop';
import { applyComboChaining, applyPotentialEffects, deriveComboActivationWindows, resolveComboTriggerColumns, SlotTriggerWiring } from './processComboSkill';
import { deriveFrameInflictions, deriveComboMirroredInflictions, applyAbsorptions, deriveReactions, mergeReactions, applySameElementRefresh, applyPhysicalInflictionRefresh, attachReactionFrames, attachSusceptibilityFrames, consumeReactionsForStatus } from './processInfliction';
import { consumeTeamStatuses, consumeOperatorStatuses, consumeCryoForSusceptibility, applyXaihiP5AmpBoost } from './processStatus';
import { deriveStatusesFromEngine } from './statusDerivationEngine';


// Re-export commonly used types and constants from sub-modules
export type { TimeStopRegion } from './processTimeStop';
export { collectTimeStopRegions, extendByTimeStops } from './processTimeStop';
export type { SlotTriggerWiring } from './processComboSkill';
export { COMBO_WINDOW_COLUMN_ID, ENEMY_COLUMN_TO_INTERACTIONS, comboWindowEndFrame, getFinalStrikeTriggerFrame, hasActiveEventInColumns } from './processComboSkill';

/**
 * Processes raw timeline events into renderable events.
 *
 * 1. Derives infliction events from operator frames with applyArtsInfliction.
 * 2. Derives arts reaction events from cross-element infliction overlaps.
 *    The triggering (incoming) infliction is removed; the consumed inflictions
 *    are clamped at the reaction frame.
 * 3. Same-element infliction refresh: slots 0–2 get durations extended to the
 *    newest stack's end time. Slot 3 shows sequential bars.
 */
export function processInflictionEvents(
  rawEvents: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotWeapons?: Record<string, string | undefined>,
  slotWirings?: SlotTriggerWiring[],
  /** Slot ID → operator ID mapping (guarantees slot detection for talent events). */
  slotOperatorMap?: Record<string, string>,
  /** Slot ID → gear set type mapping for gear effect derivation. */
  slotGearSets?: Record<string, string | undefined>,
): TimelineEvent[] {
  // ── Phase 1: Finalize time-stop regions ──────────────────────────────────
  // Combo chaining truncates overlapping combo animations, finalizing the
  // time-stop regions used throughout the pipeline.
  const withComboChaining = applyComboChaining(rawEvents);
  const stops = collectTimeStopRegions(withComboChaining);

  // Shared set tracks which event IDs have already been extended to prevent
  // double-extension across multiple applyTimeStopExtension passes.
  const extendedIds = new Set<string>();

  // ── Phase 2: Extend user-placed events by time-stop overlap ──────────────
  // All durations are real-time. Events that overlap foreign time-stop regions
  // have their durations extended (timer paused during time-stops).
  const ext1 = applyTimeStopExtension(withComboChaining, stops, extendedIds);

  // ── Phase 2b: Resolve combo trigger columns ───────────────────────────────
  // Derive combo windows early so that combo events' comboTriggerColumnId
  // reflects the current source (e.g. when the source event was dragged).
  const withResolvedCombos = slotWirings && slotWirings.length > 0
    ? resolveComboTriggerColumns(ext1, slotWirings, stops)
    : ext1;

  // ── Phase 3: Derive inflictions and statuses ─────────────────────────────
  // Focus and other frame-level statuses are created here (from battle skill
  // frames with applyStatus). These must exist before combo trigger resolution.
  const withPotentialEffects = applyPotentialEffects(withResolvedCombos);
  const withDerivedInflictions = deriveFrameInflictions(withPotentialEffects, loadoutProperties, stops);
  // Build reaction segments before time-stop extension so segment durations
  // are based on raw game-time (extension stretches segments afterward).
  const withEarlyReactionFrames = attachReactionFrames(withDerivedInflictions);
  const ext2 = applyTimeStopExtension(withEarlyReactionFrames, stops, extendedIds);
  const withConsumedTeam = consumeTeamStatuses(ext2);

  // ── Phase 3b: Re-resolve combo trigger columns after frame-derived statuses ─
  // Statuses like Focus are derived by deriveFrameInflictions above. Combos that
  // require an active status column (e.g. Antal requires Focus) couldn't resolve
  // in Phase 2b. Re-resolve now and derive combo-mirrored inflictions.
  const withReResolvedCombos = slotWirings && slotWirings.length > 0
    ? resolveComboTriggerColumns(withConsumedTeam, slotWirings, stops)
    : withConsumedTeam;
  const withLateInflictions = deriveComboMirroredInflictions(withReResolvedCombos, stops);
  const withLateReactionFrames = attachReactionFrames(withLateInflictions);
  const extLate = applyTimeStopExtension(withLateReactionFrames, stops, extendedIds);

  // ── Phase 4: Refresh, engine, absorb, consume ──────────────────────────
  // All inflictions (regular + combo-mirrored) now exist.
  const withSameElementRefresh = applySameElementRefresh(extLate);
  const withPhysicalRefresh = applyPhysicalInflictionRefresh(withSameElementRefresh);
  // Engine-derived statuses (Scorching Heart, etc.) run AFTER combo mirroring
  // so they see all inflictions (e.g. Antal's mirrored heat for MF absorption).
  const withEngineDerived = deriveStatusesFromEngine(withPhysicalRefresh, loadoutProperties, slotOperatorMap, slotWeapons, slotGearSets);
  const withAbsorptions = applyAbsorptions(withEngineDerived, stops);
  // Consume operator statuses (e.g. Melting Flame) after absorptions derive them
  const withConsumedOperatorStatuses = consumeOperatorStatuses(withAbsorptions, stops, extendedIds);

  const withReactions = deriveReactions(withConsumedOperatorStatuses);
  const withReactionFrames = attachReactionFrames(withReactions);
  const withSusceptibilityFrames = attachSusceptibilityFrames(withReactionFrames, loadoutProperties);
  const ext3 = applyTimeStopExtension(withSusceptibilityFrames, stops, extendedIds);
  const withMergedReactions = mergeReactions(ext3);
  const withConsumedReactions = consumeReactionsForStatus(withMergedReactions, loadoutProperties, stops);
  const withCryoConsumed = consumeCryoForSusceptibility(withConsumedReactions, loadoutProperties);
  const withXaihiP5 = applyXaihiP5AmpBoost(withCryoConsumed, loadoutProperties);
  // Final extension for engine-derived events, weapon/gear effects, and other derived events
  const ext4 = applyTimeStopExtension(withXaihiP5, stops, extendedIds);

  // ── Derive combo activation windows ────────────────────────────────────
  const withComboWindows = slotWirings && slotWirings.length > 0
    ? [...ext4, ...deriveComboActivationWindows(ext4, slotWirings, stops)]
    : ext4;

  // ── Phase 4: Resolve frame positions & validate ────────────────────────
  const withResolvedFrames = resolveFramePositions(withComboWindows, stops);
  const withValidation = validateTimeStopStarts(withResolvedFrames, stops);
  return withValidation;
}
