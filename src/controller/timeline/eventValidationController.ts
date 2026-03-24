/**
 * Event validation controller — consolidates all validation useMemos into
 * pure functions that return typed validation maps.
 *
 * CombatPlanner calls computeAllValidations() + aggregateEventWarnings()
 * instead of 10+ separate useMemos.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import type { InteractionModeType } from '../../consts/enums';
import type { Slot } from './columnBuilder';
import type { ResourceGraphData } from '../../app/useResourceGraphs';
import type { StaggerBreak } from './staggerTimeline';
import {
  computeTimeStopRegions,
  validateComboWindows,
  validateResources,
  validateEmpowered,
  validateEnhanced,
  validateDisabledVariants,
  validateVariantClauses,
  validateFinisherStaggerBreak,
  getAutoFinisherIds,
  getEffectiveStaggerWindows,
  validateTimeStops,
  validateInflictionStacks,
  type TimeStopRegion,
} from './eventValidator';

export interface ValidationMaps {
  combo: Map<string, string>;
  resource: Map<string, string>;
  empowered: Map<string, string>;
  enhanced: Map<string, string>;
  regularBasic: Map<string, string>;
  clause: Map<string, string>;
  finisherStagger: Map<string, string>;
  timeStop: Map<string, string>;
  infliction: Map<string, string>;
}

export interface ValidationResult {
  maps: ValidationMaps;
  timeStopRegions: TimeStopRegion[];
  autoFinisherIds: Set<string>;
}

/**
 * Runs all event validators in one pass. Returns all validation maps,
 * time-stop regions, and auto-finisher IDs.
 *
 * When `previousResult` is provided (drag in progress), position-independent
 * validators reuse their cached results — only position-sensitive validators
 * (combo, resource, time-stop, finisher-stagger) re-run.
 */
export function computeAllValidations(
  events: TimelineEvent[],
  slots: Slot[],
  resourceGraphs: Map<string, ResourceGraphData> | undefined,
  staggerBreaks: readonly StaggerBreak[] | undefined,
  draggingIds: Set<string> | null,
  interactionMode?: InteractionModeType,
  previousResult?: ValidationResult | null,
): ValidationResult {
  const timeStopRegions = computeTimeStopRegions(events);

  // Position-sensitive validators — always re-run
  const combo = validateComboWindows(events, slots, draggingIds);
  const resource = resourceGraphs
    ? validateResources(events, resourceGraphs, slots, draggingIds ?? undefined)
    : new Map<string, string>();
  const timeStop = validateTimeStops(events, timeStopRegions);
  const finisherStagger = staggerBreaks
    ? validateFinisherStaggerBreak(events, getEffectiveStaggerWindows(events, staggerBreaks))
    : new Map<string, string>();

  // Position-independent validators — reuse previous results during drag
  const prev = previousResult?.maps;
  const empowered = prev ? prev.empowered : validateEmpowered(events, slots);
  const enhanced = prev ? prev.enhanced : validateEnhanced(events);
  const regularBasic = prev ? prev.regularBasic : validateDisabledVariants(events);
  const clause = prev ? prev.clause : validateVariantClauses(events, slots);
  const infliction = prev ? prev.infliction : validateInflictionStacks(events);

  const maps: ValidationMaps = {
    combo, resource, empowered, enhanced, regularBasic, clause,
    finisherStagger, timeStop, infliction,
  };

  const autoFinisherIds = previousResult
    ? previousResult.autoFinisherIds
    : staggerBreaks
      ? getAutoFinisherIds(events, getEffectiveStaggerWindows(events, staggerBreaks))
      : new Set<string>();

  return { maps, timeStopRegions, autoFinisherIds };
}

/**
 * Aggregates per-event warnings from all validation maps into a single
 * warning string (newline-separated) per event. Returns null for clean events.
 */
export function aggregateEventWarnings(
  eventId: string,
  maps: ValidationMaps,
): string | null {
  const warnings = [
    maps.combo.get(eventId),
    maps.resource.get(eventId),
    maps.empowered.get(eventId),
    maps.enhanced.get(eventId),
    maps.regularBasic.get(eventId),
    maps.clause.get(eventId),
    maps.finisherStagger.get(eventId),
    maps.timeStop.get(eventId),
    maps.infliction.get(eventId),
  ].filter(Boolean);

  return warnings.length > 0 ? warnings.join('\n') : null;
}
