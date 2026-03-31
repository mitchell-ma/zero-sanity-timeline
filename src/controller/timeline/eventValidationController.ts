/**
 * Event validation controller — consolidates all validation useMemos into
 * pure functions that return typed validation maps.
 *
 * CombatPlanner calls computeAllValidations() + aggregateEventWarnings()
 * instead of 10+ separate useMemos.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import type { InteractionModeType } from '../../consts/enums';
import { INFLICTION_COLUMN_IDS, OPERATOR_COLUMNS, SKILL_COLUMN_ORDER } from '../../model/channels';
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

// ── Structural equality helpers ──────────────────────────────────────────
// Reuse previous Map/Set/array references when content hasn't changed,
// so downstream useMemos keyed on these objects don't re-run needlessly.

const EMPTY_MAP: Map<string, string> = new Map();
const EMPTY_SET: Set<string> = new Set();

function mapsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  let equal = true;
  a.forEach((v, k) => { if (equal && b.get(k) !== v) equal = false; });
  return equal;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  let equal = true;
  a.forEach((v) => { if (equal && !b.has(v)) equal = false; });
  return equal;
}

function timeStopRegionsEqual(a: TimeStopRegion[], b: TimeStopRegion[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].startFrame !== b[i].startFrame || a[i].durationFrames !== b[i].durationFrames) return false;
  }
  return true;
}

/** Reuse prev if structurally equal, otherwise return next. */
function stableMap(next: Map<string, string>, prev: Map<string, string> | undefined): Map<string, string> {
  if (prev && mapsEqual(next, prev)) return prev;
  return next;
}

function stableSet(next: Set<string>, prev: Set<string> | undefined): Set<string> {
  if (prev && setsEqual(next, prev)) return prev;
  return next;
}

// Module-level cache for previous result
let _prevValidation: ValidationResult | null = null;

/**
 * Runs all event validators in one pass. Returns all validation maps,
 * time-stop regions, and auto-finisher IDs.
 *
 * Uses structural equality: if a validation map's content hasn't changed
 * since the last call, the previous Map reference is reused. This prevents
 * downstream React useMemos from invalidating on every drag tick when the
 * pipeline re-runs but most warnings stay the same.
 */
export function computeAllValidations(
  events: TimelineEvent[],
  slots: Slot[],
  resourceGraphs: Map<string, ResourceGraphData> | undefined,
  staggerBreaks: readonly StaggerBreak[] | undefined,
  draggingIds: Set<string> | null,
  interactionMode?: InteractionModeType,
  changedUids?: ReadonlySet<string>,
): ValidationResult {
  const prev = _prevValidation;

  // ── Fast path: if few events changed and we have previous results, only
  // re-run validators that could be affected by the changed events. ──────
  if (changedUids && changedUids.size > 0 && prev
    && changedUids.size < events.length * 0.5) {
    // Classify what kind of events changed to determine which validators to skip
    let hasSkillChange = false;
    let hasTimeStopChange = false;
    let hasInflictionChange = false;
    for (const ev of events) {
      if (!changedUids.has(ev.uid)) continue;
      // Match computeTimeStopRegions logic: ult, combo, or perfect dodge
      if (ev.columnId === NounType.ULTIMATE || ev.columnId === NounType.COMBO_SKILL
        || (ev.columnId === OPERATOR_COLUMNS.INPUT && ev.isPerfectDodge)) hasTimeStopChange = true;
      if ((SKILL_COLUMN_ORDER as readonly string[]).includes(ev.columnId)) hasSkillChange = true;
      if (INFLICTION_COLUMN_IDS.has(ev.columnId)) hasInflictionChange = true;
    }

    const timeStopRegionsRaw = hasTimeStopChange ? computeTimeStopRegions(events) : null;
    const timeStopRegions = timeStopRegionsRaw
      ? (prev && timeStopRegionsEqual(timeStopRegionsRaw, prev.timeStopRegions) ? prev.timeStopRegions : timeStopRegionsRaw)
      : prev.timeStopRegions;

    // Position-dependent validators (timeStop, resource, combo) always run — any event
    // could have moved into/out of a zone. Type-specific validators only run when relevant.
    const maps: ValidationMaps = {
      combo: stableMap(validateComboWindows(events, slots, draggingIds), prev.maps.combo),
      resource: resourceGraphs
        ? stableMap(validateResources(events, resourceGraphs, slots, draggingIds ?? undefined), prev.maps.resource)
        : (prev.maps.resource.size === 0 ? prev.maps.resource : EMPTY_MAP),
      empowered: hasSkillChange ? stableMap(validateEmpowered(events, slots), prev.maps.empowered) : prev.maps.empowered,
      enhanced: hasSkillChange ? stableMap(validateEnhanced(events), prev.maps.enhanced) : prev.maps.enhanced,
      regularBasic: hasSkillChange ? stableMap(validateDisabledVariants(events), prev.maps.regularBasic) : prev.maps.regularBasic,
      clause: hasSkillChange ? stableMap(validateVariantClauses(events, slots), prev.maps.clause) : prev.maps.clause,
      finisherStagger: staggerBreaks && hasSkillChange
        ? stableMap(validateFinisherStaggerBreak(events, getEffectiveStaggerWindows(events, staggerBreaks)), prev.maps.finisherStagger)
        : prev.maps.finisherStagger,
      timeStop: stableMap(validateTimeStops(events, timeStopRegions), prev.maps.timeStop),
      infliction: hasInflictionChange ? stableMap(validateInflictionStacks(events), prev.maps.infliction) : prev.maps.infliction,
    };

    const stableMaps = maps.combo === prev.maps.combo
      && maps.resource === prev.maps.resource
      && maps.empowered === prev.maps.empowered
      && maps.enhanced === prev.maps.enhanced
      && maps.regularBasic === prev.maps.regularBasic
      && maps.clause === prev.maps.clause
      && maps.finisherStagger === prev.maps.finisherStagger
      && maps.timeStop === prev.maps.timeStop
      && maps.infliction === prev.maps.infliction
      ? prev.maps
      : maps;

    const autoFinisherIdsRaw = staggerBreaks && hasSkillChange
      ? getAutoFinisherIds(events, getEffectiveStaggerWindows(events, staggerBreaks))
      : null;
    const autoFinisherIds = autoFinisherIdsRaw
      ? stableSet(autoFinisherIdsRaw, prev.autoFinisherIds)
      : prev.autoFinisherIds;

    if (stableMaps === prev.maps && timeStopRegions === prev.timeStopRegions && autoFinisherIds === prev.autoFinisherIds) {
      return prev;
    }

    const result: ValidationResult = { maps: stableMaps, timeStopRegions, autoFinisherIds };
    _prevValidation = result;
    return result;
  }

  // ── Full computation (no changedUids or too many changes) ──────────────
  const timeStopRegionsRaw = computeTimeStopRegions(events);
  const timeStopRegions = prev && timeStopRegionsEqual(timeStopRegionsRaw, prev.timeStopRegions)
    ? prev.timeStopRegions
    : timeStopRegionsRaw;

  const maps: ValidationMaps = {
    combo: stableMap(validateComboWindows(events, slots, draggingIds), prev?.maps.combo),
    resource: resourceGraphs
      ? stableMap(validateResources(events, resourceGraphs, slots, draggingIds ?? undefined), prev?.maps.resource)
      : (prev?.maps.resource?.size === 0 ? prev.maps.resource : EMPTY_MAP),
    empowered: stableMap(validateEmpowered(events, slots), prev?.maps.empowered),
    enhanced: stableMap(validateEnhanced(events), prev?.maps.enhanced),
    regularBasic: stableMap(validateDisabledVariants(events), prev?.maps.regularBasic),
    clause: stableMap(validateVariantClauses(events, slots), prev?.maps.clause),
    finisherStagger: staggerBreaks
      ? stableMap(validateFinisherStaggerBreak(events, getEffectiveStaggerWindows(events, staggerBreaks)), prev?.maps.finisherStagger)
      : (prev?.maps.finisherStagger?.size === 0 ? prev.maps.finisherStagger : EMPTY_MAP),
    timeStop: stableMap(validateTimeStops(events, timeStopRegions), prev?.maps.timeStop),
    infliction: stableMap(validateInflictionStacks(events), prev?.maps.infliction),
  };

  const stableMaps = prev
    && maps.combo === prev.maps.combo
    && maps.resource === prev.maps.resource
    && maps.empowered === prev.maps.empowered
    && maps.enhanced === prev.maps.enhanced
    && maps.regularBasic === prev.maps.regularBasic
    && maps.clause === prev.maps.clause
    && maps.finisherStagger === prev.maps.finisherStagger
    && maps.timeStop === prev.maps.timeStop
    && maps.infliction === prev.maps.infliction
    ? prev.maps
    : maps;

  const autoFinisherIdsRaw = staggerBreaks
    ? getAutoFinisherIds(events, getEffectiveStaggerWindows(events, staggerBreaks))
    : EMPTY_SET;
  const autoFinisherIds = stableSet(autoFinisherIdsRaw, prev?.autoFinisherIds);

  if (prev && stableMaps === prev.maps && timeStopRegions === prev.timeStopRegions && autoFinisherIds === prev.autoFinisherIds) {
    return prev;
  }

  const result: ValidationResult = { maps: stableMaps, timeStopRegions, autoFinisherIds };
  _prevValidation = result;
  return result;
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
  const em = maps.empowered.get(eventId);
  const en = maps.enhanced.get(eventId);
  const rb = maps.regularBasic.get(eventId);
  const cl = maps.clause.get(eventId);
  const fs = maps.finisherStagger.get(eventId);
  const ts = maps.timeStop.get(eventId);
  const inf = maps.infliction.get(eventId);

  if (c || r || em || en || rb || cl || fs || ts || inf) {
    let s = '';
    if (c) s += c;
    if (r) s += (s ? '\n' : '') + r;
    if (em) s += (s ? '\n' : '') + em;
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
