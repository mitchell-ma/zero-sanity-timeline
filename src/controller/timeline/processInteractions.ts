/**
 * Main orchestrator for the event processing pipeline.
 * Coordinates time-stop resolution, infliction derivation, status processing,
 * combo activation windows, and SP return calculations.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { LoadoutStats } from '../../view/InformationPane';
import { collectTimeStopRegions, applyTimeStopExtension, resolveFramePositions, validateTimeStopStarts } from './processTimeStop';
import { applyComboChaining, applyPotentialEffects, deriveComboActivationWindows, resolveComboTriggerColumns, SlotTriggerWiring } from './processComboSkill';
import { deriveFrameInflictions, applyAbsorptions, deriveReactions, mergeReactions, applySameElementRefresh, applyPhysicalInflictionRefresh, attachReactionFrames, attachSusceptibilityFrames, consumeReactionsForStatus } from './processInfliction';
import { consumeTeamStatuses, consumeOperatorStatuses, deriveUnbridledEdge, consumeVulnerabilityForSusceptibility, consumeCryoForSusceptibility, applyXaihiP5AmpBoost } from './processStatus';
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
  loadoutStats?: Record<string, LoadoutStats>,
  slotWeapons?: Record<string, string | undefined>,
  slotWirings?: SlotTriggerWiring[],
  /** Slot ID → operator ID mapping (guarantees slot detection for talent events). */
  slotOperatorMap?: Record<string, string>,
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

  // ── Phase 3: Process pipeline (all durations are extended real-time) ──────
  const withPotentialEffects = applyPotentialEffects(withResolvedCombos);
  const withDerivedInflictions = deriveFrameInflictions(withPotentialEffects, loadoutStats, stops);
  // Extend newly derived events by time-stop overlap
  const ext2 = applyTimeStopExtension(withDerivedInflictions, stops, extendedIds);
  // Refresh same-element stacks BEFORE absorptions/reactions so that
  // overlapping stacks get their durations extended using the original
  // infliction duration. Later steps (absorption, reaction) can then
  // clamp the already-extended events as needed.
  const withSameElementRefresh = applySameElementRefresh(ext2);
  const withPhysicalRefresh = applyPhysicalInflictionRefresh(withSameElementRefresh);
  const withConsumedTeam = consumeTeamStatuses(withPhysicalRefresh);
  const withAbsorptions = applyAbsorptions(withConsumedTeam, stops);
  // Consume operator statuses (e.g. Melting Flame) after absorptions derive them
  const withConsumedOperatorStatuses = consumeOperatorStatuses(withAbsorptions, stops, extendedIds);
  // Generic status derivation engine — handles all operators with statusEvents in their JSON
  const withEngineDerived = deriveStatusesFromEngine(withConsumedOperatorStatuses, loadoutStats, slotOperatorMap);
  const withReactions = deriveReactions(withEngineDerived);
  const withReactionFrames = attachReactionFrames(withReactions);
  const withSusceptibilityFrames = attachSusceptibilityFrames(withReactionFrames, loadoutStats);
  const ext3 = applyTimeStopExtension(withSusceptibilityFrames, stops, extendedIds);
  const withMergedReactions = mergeReactions(ext3);
  const withConsumedReactions = consumeReactionsForStatus(withMergedReactions, loadoutStats, stops);
  const withVulnConsumed = consumeVulnerabilityForSusceptibility(withConsumedReactions, loadoutStats);
  const withCryoConsumed = consumeCryoForSusceptibility(withVulnConsumed, loadoutStats);
  const withXaihiP5 = applyXaihiP5AmpBoost(withCryoConsumed, loadoutStats);
  const withUnbridledEdge = deriveUnbridledEdge(withXaihiP5, slotWeapons, stops);
  // Final extension for engine-derived events, Unbridled Edge, and other derived events
  const ext4 = applyTimeStopExtension(withUnbridledEdge, stops, extendedIds);

  // ── Derive combo activation windows ────────────────────────────────────
  const withComboWindows = slotWirings && slotWirings.length > 0
    ? [...ext4, ...deriveComboActivationWindows(ext4, slotWirings, stops)]
    : ext4;

  // ── Phase 4: Resolve frame positions & validate ────────────────────────
  const withResolvedFrames = resolveFramePositions(withComboWindows, stops);
  const withValidation = validateTimeStopStarts(withResolvedFrames, stops);
  return withValidation;
}
