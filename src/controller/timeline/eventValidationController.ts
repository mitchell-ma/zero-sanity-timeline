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
  validateRegularBasicDuringUltimate,
  validateVariantClauses,
  validateFinisherStaggerBreak,
  getAutoFinisherIds,
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
 */
export function computeAllValidations(
  events: TimelineEvent[],
  slots: Slot[],
  resourceGraphs: Map<string, ResourceGraphData> | undefined,
  staggerBreaks: readonly StaggerBreak[] | undefined,
  draggingIds: Set<string> | null,
  interactionMode?: InteractionModeType,
): ValidationResult {
  const timeStopRegions = computeTimeStopRegions(events);

  const maps: ValidationMaps = {
    combo: validateComboWindows(events, slots, draggingIds),
    resource: resourceGraphs
      ? validateResources(events, resourceGraphs, slots, draggingIds ?? undefined)
      : new Map(),
    empowered: validateEmpowered(events),
    enhanced: validateEnhanced(events),
    regularBasic: validateRegularBasicDuringUltimate(events),
    clause: validateVariantClauses(events, slots),
    finisherStagger: staggerBreaks
      ? validateFinisherStaggerBreak(events, staggerBreaks)
      : new Map(),
    timeStop: validateTimeStops(events, timeStopRegions),
    infliction: validateInflictionStacks(events),
  };

  const autoFinisherIds = staggerBreaks
    ? getAutoFinisherIds(events, staggerBreaks)
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
