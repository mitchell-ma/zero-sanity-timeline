/**
 * Event validation controller — consolidates all validation useMemos into
 * pure functions that return typed validation maps.
 *
 * CombatPlanner calls computeAllValidations() + aggregateEventWarnings()
 * instead of 10+ separate useMemos.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import type { Slot } from './columnBuilder';
import type { ResourceGraphData } from '../../app/useResourceGraphs';
import type { StaggerBreak } from './staggerTimeline';
import {
  computeTimeStopRegions,
  validateComboWindows,
  validateResources,
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

// ── Structural equality helpers ──────────────────────────────────────────
// Reuse previous Map/Set/array references when content hasn't changed,
// so downstream useMemos keyed on these objects don't re-run needlessly.

const EMPTY_MAP: Map<string, string> = new Map();
const EMPTY_SET: Set<string> = new Set();

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
): ValidationResult {
  const timeStopRegions = computeTimeStopRegions(events);

  const maps: ValidationMaps = {
    combo: validateComboWindows(events, slots, draggingIds),
    resource: resourceGraphs
      ? validateResources(events, resourceGraphs, slots, draggingIds ?? undefined)
      : EMPTY_MAP,
    enhanced: validateEnhanced(events, slots),
    regularBasic: validateDisabledVariants(events),
    clause: validateVariantClauses(events, slots),
    finisherStagger: staggerBreaks
      ? validateFinisherStaggerBreak(events, getEffectiveStaggerWindows(events, staggerBreaks))
      : EMPTY_MAP,
    timeStop: validateTimeStops(events, timeStopRegions),
    infliction: validateInflictionStacks(events),
  };

  const autoFinisherIds = staggerBreaks
    ? getAutoFinisherIds(events, getEffectiveStaggerWindows(events, staggerBreaks))
    : EMPTY_SET;

  return { maps, timeStopRegions, autoFinisherIds };
}

/**
 * Aggregates per-event warnings from all validation maps into a single
 * warning string (newline-separated) per event. Returns null for clean events.
 *
 * Cached: returns the same string reference if the underlying warnings
 * haven't changed, avoiding array/join allocation on every call.
 */
let _warningCache = new Map<string, { maps: ValidationMaps; result: string | null }>();

export function aggregateEventWarnings(
  eventId: string,
  maps: ValidationMaps,
): string | null {
  const cached = _warningCache.get(eventId);
  if (cached && cached.maps === maps) return cached.result;

  let result: string | null = null;
  const c = maps.combo.get(eventId);
  const r = maps.resource.get(eventId);
  const en = maps.enhanced.get(eventId);
  const rb = maps.regularBasic.get(eventId);
  const cl = maps.clause.get(eventId);
  const fs = maps.finisherStagger.get(eventId);
  const ts = maps.timeStop.get(eventId);
  const inf = maps.infliction.get(eventId);

  if (c || r || en || rb || cl || fs || ts || inf) {
    let s = '';
    if (c) s += c;
    if (r) s += (s ? '\n' : '') + r;
    if (en) s += (s ? '\n' : '') + en;
    if (rb) s += (s ? '\n' : '') + rb;
    if (cl) s += (s ? '\n' : '') + cl;
    if (fs) s += (s ? '\n' : '') + fs;
    if (ts) s += (s ? '\n' : '') + ts;
    if (inf) s += (s ? '\n' : '') + inf;
    result = s;
  }

  _warningCache.set(eventId, { maps, result });
  return result;
}

/** Clear warning cache (call when validation maps are rebuilt). */
export function clearWarningCache() {
  _warningCache = new Map();
}
