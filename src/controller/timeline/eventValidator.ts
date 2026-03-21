/**
 * Event validation — computes warnings for placed timeline events.
 *
 * Validates combo windows, resource availability (SP / ultimate energy),
 * empowered skill prerequisites, and time-stop overlap constraints.
 */
import { TimelineEvent, SkillType, EventSegmentData, computeSegmentsSpan, getAnimationDuration, eventDuration, eventEndFrame } from '../../consts/viewTypes';
import { CombatSkillsType, StatusType, TimeDependency } from '../../consts/enums';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import type { ResourceZone } from './skillPointTimeline';
import { getOperatorJson, getComboTriggerClause } from '../../model/event-frames/operatorJsonLoader';
import type { Interaction, Predicate } from '../../consts/semantics';
import { extendByTimeStops } from './processTimeStop';
import { ENEMY_OWNER_ID, INFLICTION_COLUMN_IDS, OPERATOR_COLUMNS, SKILL_COLUMNS, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID, COMBO_WINDOW_COLUMN_ID } from '../../model/channels';
import { STATUS_LABELS } from '../../consts/timelineColumnLabels';
import type { Slot } from './columnBuilder';
import type { ResourceGraphData } from '../../app/useResourceGraphs';
import { isClauseAlwaysAvailable } from './triggerMatch';

export type TimeStopRegion = {
  startFrame: number;
  durationFrames: number;
  ownerId: string;
  sourceColumnId: string;
};

/** Map column IDs to DSL ENHANCE object types. */
const COLUMN_TO_ENHANCE_OBJECT: Record<string, string> = {
  basic: 'BASIC_ATTACK',
  battle: 'BATTLE_SKILL',
  combo: 'COMBO_SKILL',
  ultimate: 'ULTIMATE',
};

/**
 * Check if any overlapping segment across all events for a given owner
 * has an ENHANCE clause for the specified skill object type at the given frame.
 */
export function hasEnhanceClauseAtFrame(
  events: readonly TimelineEvent[],
  ownerId: string,
  enhanceObject: string,
  atFrame: number,
): boolean {
  for (const ev of events) {
    if (ev.ownerId !== ownerId) continue;
    let cursor = ev.startFrame;
    for (const seg of ev.segments) {
      const segEnd = cursor + seg.properties.duration;
      if (atFrame >= cursor && atFrame < segEnd && seg.clause) {
        if (seg.clause.some(c => c.effects.some(e => e.verb === 'ENHANCE' && e.object === enhanceObject))) {
          return true;
        }
      }
      cursor = segEnd;
    }
  }
  return false;
}

/**
 * Check if any overlapping segment has a DISABLE clause for the specified
 * skill object type at the given frame. Returns the adjective (e.g. 'NORMAL')
 * if found, or null if no DISABLE clause is active.
 */
function getDisableAdjectiveAtFrame(
  events: readonly TimelineEvent[],
  ownerId: string,
  disableObject: string,
  atFrame: number,
): string | null {
  for (const ev of events) {
    if (ev.ownerId !== ownerId) continue;
    let cursor = ev.startFrame;
    for (const seg of ev.segments) {
      const segEnd = cursor + seg.properties.duration;
      if (atFrame >= cursor && atFrame < segEnd && seg.clause) {
        for (const c of seg.clause) {
          for (const e of c.effects) {
            if (e.verb === 'DISABLE' && e.object === disableObject && e.adjective) {
              return e.adjective;
            }
          }
        }
      }
      cursor = segEnd;
    }
  }
  return null;
}

// ── Time-stop regions ─────────────────────────────────────────────────────────

export function computeTimeStopRegions(events: TimelineEvent[]): TimeStopRegion[] {
  const stops: TimeStopRegion[] = [];
  for (const ev of events) {
    const anim = getAnimationDuration(ev);
    if (anim <= 0) continue;
    const isTimeStop = ev.columnId === SKILL_COLUMNS.ULTIMATE || ev.columnId === SKILL_COLUMNS.COMBO ||
      (ev.columnId === 'dash' && ev.isPerfectDodge);
    if (!isTimeStop) continue;
    stops.push({ startFrame: ev.startFrame, durationFrames: anim, ownerId: ev.ownerId, sourceColumnId: ev.columnId });
  }
  return stops;
}

// ── Resource graph helpers ────────────────────────────────────────────────────

/**
 * Get the pre-consumption value at a frame from a resource graph.
 * When multiple points exist at the same frame (pre/post consumption),
 * returns the highest value (the pre-consumption level).
 */
export function preConsumptionValue(
  graph: ResourceGraphData | undefined,
  frame: number,
): number | null {
  if (!graph || graph.points.length === 0) return null;
  const pts = graph.points;
  let maxAtFrame = -Infinity;
  let foundAtFrame = false;
  let lastBeforeIdx = 0;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].frame > frame) break;
    if (pts[i].frame === frame) {
      foundAtFrame = true;
      maxAtFrame = Math.max(maxAtFrame, pts[i].value);
    } else {
      lastBeforeIdx = i;
    }
  }
  if (foundAtFrame) return maxAtFrame;
  const p0 = pts[lastBeforeIdx];
  const p1 = pts[lastBeforeIdx + 1];
  if (!p1 || p0.frame === p1.frame) return p0.value;
  const t = (frame - p0.frame) / (p1.frame - p0.frame);
  const interpolated = p0.value + t * (p1.value - p0.value);
  // Round to avoid floating-point errors (e.g. 99.9999 instead of 100)
  return Math.round(interpolated * 100) / 100;
}

// ── SP-insufficient zones ─────────────────────────────────────────────────────

export type { ResourceZone } from './skillPointTimeline';

// ── Resource insufficiency zone helpers ───────────────────────────────────────

/** Tolerance for floating-point comparisons on accumulated resource values. */
const RESOURCE_EPSILON = 0.01;

/** Returns true if `value` is below `threshold`, accounting for floating-point imprecision. */
function belowThreshold(value: number, threshold: number) {
  return value < threshold - RESOURCE_EPSILON;
}

/**
 * Walks a resource graph and finds frame ranges where the value is below `threshold`.
 * Uses linear interpolation for threshold crossings between graph points.
 */
function findInsufficientZones(
  pts: ReadonlyArray<{ frame: number; value: number }>,
  threshold: number,
): ResourceZone[] {
  if (pts.length < 2) return [];
  const gaps: ResourceZone[] = [];
  let insuffStart: number | null = belowThreshold(pts[0].value, threshold) ? pts[0].frame : null;

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];

    if (prev.frame === curr.frame) {
      if (belowThreshold(curr.value, threshold) && insuffStart === null) {
        insuffStart = curr.frame;
      } else if (!belowThreshold(curr.value, threshold) && insuffStart !== null) {
        gaps.push({ start: insuffStart, end: curr.frame });
        insuffStart = null;
      }
      continue;
    }

    const prevBelow = belowThreshold(prev.value, threshold);
    const currBelow = belowThreshold(curr.value, threshold);

    if (prevBelow && !currBelow) {
      const t = (threshold - prev.value) / (curr.value - prev.value);
      const crossFrame = Math.round(prev.frame + t * (curr.frame - prev.frame));
      if (insuffStart !== null) {
        gaps.push({ start: insuffStart, end: crossFrame });
        insuffStart = null;
      }
    } else if (!prevBelow && currBelow) {
      const t = (threshold - prev.value) / (curr.value - prev.value);
      const crossFrame = Math.round(prev.frame + t * (curr.frame - prev.frame));
      insuffStart = crossFrame;
    }
  }

  if (insuffStart !== null) {
    gaps.push({ start: insuffStart, end: pts[pts.length - 1].frame });
  }
  return gaps;
}

/**
 * Adjusts a resource graph by adding back excluded consumption amounts.
 * For each exclusion at a given frame, the consumed SP/energy is restored to
 * all subsequent graph points (capped at max). This is approximate near the
 * cap (may slightly overestimate available resources when regen would have
 * been wasted), but correct when the pool doesn't hit the cap between events.
 */
function adjustGraphExcluding(
  points: ReadonlyArray<{ frame: number; value: number }>,
  exclusions: { frame: number; cost: number }[],
  max: number,
): { frame: number; value: number }[] {
  if (exclusions.length === 0) return points as { frame: number; value: number }[];

  // Build lookup: frame → total cost to add back
  const costByFrame = new Map<number, number>();
  for (const ex of exclusions) {
    costByFrame.set(ex.frame, (costByFrame.get(ex.frame) ?? 0) + ex.cost);
  }

  const result: { frame: number; value: number }[] = [];
  let offset = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];

    // Detect consumption pair: two points at the same frame where value drops.
    // The first is pre-consumption, the second is post-consumption.
    // When we find the excluded consumption, add its cost to the running offset.
    if (
      costByFrame.has(pt.frame) &&
      i > 0 &&
      points[i - 1].frame === pt.frame &&
      points[i - 1].value > pt.value
    ) {
      const drop = points[i - 1].value - pt.value;
      const excludeCost = costByFrame.get(pt.frame)!;
      costByFrame.delete(pt.frame);
      offset += Math.min(excludeCost, drop);
    }

    result.push({ frame: pt.frame, value: Math.min(pt.value + offset, max) });
  }

  return result;
}

/**
 * Computes resource insufficiency zones with specified events excluded from
 * the resource graph. Used at drag start so that the dragged event's own
 * resource consumption doesn't block repositioning.
 */
export function computeResourceZonesForDrag(
  resourceGraphs: Map<string, ResourceGraphData>,
  slots: Slot[],
  draggedIds: ReadonlySet<string>,
  events: ReadonlyArray<TimelineEvent>,
): Map<string, ResourceZone[]> {
  // Collect SP exclusions from dragged battle events
  const spExclusions: { frame: number; cost: number }[] = [];
  for (const ev of events) {
    if (!draggedIds.has(ev.id)) continue;
    if (ev.columnId === SKILL_COLUMNS.BATTLE) {
      const cost = ev.skillPointCost ?? 0;
      if (cost > 0) spExclusions.push({ frame: ev.startFrame, cost });
    }
  }

  // Collect ultimate exclusions from dragged ultimate events
  const ultExclusions = new Map<string, { frame: number; cost: number }[]>();
  for (const ev of events) {
    if (!draggedIds.has(ev.id)) continue;
    if (ev.columnId === SKILL_COLUMNS.ULTIMATE) {
      const ultKey = `${ev.ownerId}-${SKILL_COLUMNS.ULTIMATE}`;
      const graph = resourceGraphs.get(ultKey);
      if (graph) {
        const arr = ultExclusions.get(ultKey) ?? [];
        arr.push({ frame: ev.startFrame, cost: graph.max });
        ultExclusions.set(ultKey, arr);
      }
    }
  }

  // Build adjusted resource graphs
  const adjusted = new Map(resourceGraphs);
  if (spExclusions.length > 0) {
    const spKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
    const spGraph = resourceGraphs.get(spKey);
    if (spGraph) {
      adjusted.set(spKey, {
        ...spGraph,
        points: adjustGraphExcluding(spGraph.points, spExclusions, spGraph.max),
      });
    }
  }
  for (const [ultKey, exclusions] of Array.from(ultExclusions)) {
    const graph = resourceGraphs.get(ultKey);
    if (graph) {
      adjusted.set(ultKey, {
        ...graph,
        points: adjustGraphExcluding(graph.points, exclusions, graph.max),
      });
    }
  }

  return computeResourceInsufficiencyZones(adjusted, slots);
}

/**
 * Computes resource insufficiency zones for all resource-gated column types.
 * Returns a Map keyed by `slotId:columnId` → ResourceZone[].
 * Currently covers:
 * - `battle` — SP below skill cost (shared SP graph, per-slot cost)
 * - `ultimate` — energy below max (per-slot ultimate graph)
 */
export function computeResourceInsufficiencyZones(
  resourceGraphs: Map<string, ResourceGraphData>,
  slots: Slot[],
): Map<string, ResourceZone[]> {
  const zones = new Map<string, ResourceZone[]>();

  // SP zones for battle skills (shared graph, per-slot cost threshold)
  const spKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
  const spGraph = resourceGraphs.get(spKey);
  if (spGraph && spGraph.points.length >= 2) {
    for (const slot of slots) {
      if (!slot.operator) continue;
      const cost = slot.operator.skills.battle.skillPointCost ?? 100;
      const gaps = findInsufficientZones(spGraph.points, cost);
      if (gaps.length > 0) zones.set(`${slot.slotId}:${SKILL_COLUMNS.BATTLE}`, gaps);
    }
  }

  // Ultimate energy zones (per-slot graph, threshold = max)
  for (const slot of slots) {
    if (!slot.operator) continue;
    const ultKey = `${slot.slotId}-${SKILL_COLUMNS.ULTIMATE}`;
    const graph = resourceGraphs.get(ultKey);
    if (!graph || graph.points.length < 2) continue;
    const gaps = findInsufficientZones(graph.points, graph.max);
    if (gaps.length > 0) zones.set(`${slot.slotId}:${SKILL_COLUMNS.ULTIMATE}`, gaps);
  }

  return zones;
}

/**
 * Clamps a drag delta to prevent resource-gated events (battle, ultimate) from
 * landing in resource-insufficient zones. Skips zones that contain the event's
 * drag-start position (self-caused). Returns the clamped delta.
 *
 * If `invalidAtDragStart` contains this event, the event was already in an
 * invalid zone when the drag began. In that case, free movement is allowed
 * until the target reaches a valid position (outside all zones), at which
 * point the event is moved to `revalidated` and normal clamping resumes
 * WITHOUT the self-caused zone exemption (so it can't re-enter any zone).
 */
export function clampDeltaByResourceZones(
  clampedDelta: number,
  eventId: string,
  events: TimelineEvent[],
  startFrame: number,
  resourceZones: Map<string, ResourceZone[]>,
  invalidAtDragStart?: Set<string>,
  revalidated?: Set<string>,
): number {
  const ev = events.find((e) => e.id === eventId);
  if (!ev || (ev.columnId !== SKILL_COLUMNS.BATTLE && ev.columnId !== SKILL_COLUMNS.ULTIMATE)) return clampedDelta;
  const zones = resourceZones.get(`${ev.ownerId}:${ev.columnId}`);
  if (!zones || zones.length === 0) return clampedDelta;

  const target = startFrame + clampedDelta;

  // Event was invalid at drag start — allow free movement through zones
  // until the target reaches a valid (non-zone) position.
  if (invalidAtDragStart?.has(eventId)) {
    const inZone = zones.some((z) => target >= z.start && target < z.end);
    if (inZone) return clampedDelta; // still in a zone, free movement
    // Target is now valid — transition: block ALL zones including the original
    invalidAtDragStart.delete(eventId);
    revalidated?.add(eventId);
    return clampedDelta; // current position is valid, no clamping needed
  }

  // Whether to skip the self-caused zone exemption (revalidated events must
  // be blocked from every zone, including the one at their drag-start origin).
  const skipSelfExemption = revalidated?.has(eventId);

  for (const zone of zones) {
    // Skip zones containing the event's drag-start position (self-caused),
    // unless the event was revalidated mid-drag.
    if (!skipSelfExemption && startFrame >= zone.start && startFrame < zone.end) continue;
    if (target >= zone.start && target < zone.end) {
      if (skipSelfExemption) {
        // Revalidated event: startFrame is inside the zone, so the normal
        // Math.max(0,...)/Math.min(0,...) would snap back to startFrame.
        // Instead, clamp to whichever zone boundary the target is closer to.
        const distToStart = target - zone.start + 1;
        const distToEnd = zone.end - target;
        return distToStart <= distToEnd
          ? zone.start - 1 - startFrame
          : zone.end - startFrame;
      }
      if (clampedDelta >= 0) {
        // Dragging down (later) → stop just before zone
        return Math.max(0, zone.start - 1 - startFrame);
      } else {
        // Dragging up (earlier) → stop just after zone
        return Math.min(0, zone.end - startFrame);
      }
    }
  }
  return clampedDelta;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getAlwaysAvailableComboSlots(slots: Slot[]): Set<string> {
  const set = new Set<string>();
  for (const s of slots) {
    if (!s.operator) continue;
    const clause = getComboTriggerClause(s.operator.id);
    if (clause && isClauseAlwaysAvailable(clause)) {
      set.add(s.slotId);
    }
  }
  return set;
}

// ── Resource availability for placement ───────────────────────────────────────

export type ResourceAvailability = {
  sufficient: boolean;
  reason?: string;
};

/**
 * Checks whether the resource (SP or ultimate energy) is sufficient to place
 * an event of a given column type at a given frame.
 */
export function checkResourceAvailability(
  columnId: string,
  ownerId: string,
  atFrame: number,
  resourceGraphs: Map<string, ResourceGraphData>,
  slots: Slot[],
): ResourceAvailability {
  if (columnId === SKILL_COLUMNS.ULTIMATE) {
    const ultKey = `${ownerId}-${SKILL_COLUMNS.ULTIMATE}`;
    const graph = resourceGraphs.get(ultKey);
    if (graph) {
      const val = preConsumptionValue(graph, atFrame);
      if (val !== null && belowThreshold(val, graph.max)) {
        return { sufficient: false, reason: `Not enough ultimate energy (${Math.floor(val)}/${graph.max})` };
      }
    }
  } else if (columnId === SKILL_COLUMNS.BATTLE) {
    const slot = slots.find((s) => s.slotId === ownerId);
    const spCost = slot?.operator?.skills.battle.skillPointCost ?? 100;
    const spKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
    const spGraph = resourceGraphs.get(spKey);
    if (spGraph) {
      const val = preConsumptionValue(spGraph, atFrame);
      if (val !== null && belowThreshold(val, spCost)) {
        return { sufficient: false, reason: `Not enough SP (${Math.floor(val)}/${spCost})` };
      }
    }
  }
  return { sufficient: true };
}

// ── Segment addition overlap ─────────────────────────────────────────────────

/**
 * Checks if adding a segment to an event would cause it to overlap siblings.
 */
export function wouldSegmentAdditionOverlap(
  event: TimelineEvent,
  addedDurationFrames: number,
  events: TimelineEvent[],
): boolean {
  const currentRange = event.nonOverlappableRange
    ?? (event.segments ? computeSegmentsSpan(event.segments) : 0);
  const newRange = currentRange + addedDurationFrames;

  return events.some((sib) => {
    if (sib.id === event.id || sib.ownerId !== event.ownerId || sib.columnId !== event.columnId) return false;
    const sibRange = sib.nonOverlappableRange
      ?? (sib.segments ? computeSegmentsSpan(sib.segments) : 0);
    if (sibRange > 0 && event.startFrame >= sib.startFrame && event.startFrame < sib.startFrame + sibRange) return true;
    if (newRange > 0 && sib.startFrame >= event.startFrame && sib.startFrame < event.startFrame + newRange) return true;
    return false;
  });
}

// ── Duplicate placement validation ───────────────────────────────────────────

/**
 * Checks if a duplicated event can be placed at a given frame.
 * Validates SP zone violations for battle skills.
 */
export function isDuplicatePlacementInResourceZone(
  event: TimelineEvent,
  ghostFrame: number,
  resourceZones: Map<string, ResourceZone[]>,
): boolean {
  if (event.columnId !== SKILL_COLUMNS.BATTLE && event.columnId !== SKILL_COLUMNS.ULTIMATE) return false;
  const zones = resourceZones.get(`${event.ownerId}:${event.columnId}`);
  if (!zones) return false;
  return zones.some((z) => ghostFrame >= z.start && ghostFrame < z.end);
}

// ── Combo window drag clamping ────────────────────────────────────────────────

/**
 * Clamps a drag delta to keep a combo event within its activation window.
 * Uses the processed events to find combo windows for the event's owner.
 * Non-combo events pass through unchanged.
 *
 * If `invalidAtDragStart` contains this event, the event was outside all
 * combo windows when the drag began. In that case, free movement is allowed
 * until the target enters a window, at which point the event is removed
 * from the set and clamped within that window going forward.
 */
export function clampDeltaByComboWindow(
  clampedDelta: number,
  eventId: string,
  events: TimelineEvent[],
  startFrame: number,
  processedEvents: readonly TimelineEvent[],
  invalidAtDragStart?: Set<string>,
): number {
  const ev = events.find((e) => e.id === eventId);
  if (!ev || ev.columnId !== SKILL_COLUMNS.COMBO) {
    return clampedDelta;
  }

  const windows = processedEvents.filter(
    (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === ev.ownerId,
  );
  if (windows.length === 0) return clampedDelta;

  // Compute window end frame using segments
  const windowEndFrame = (w: TimelineEvent) => eventEndFrame(w);

  const target = startFrame + clampedDelta;

  // Event was invalid at drag start (outside all windows) — allow free
  // movement until the target enters a window, then clamp within it.
  if (invalidAtDragStart?.has(eventId)) {
    const targetWindow = windows.find((w) => target >= w.startFrame && target < windowEndFrame(w));
    if (!targetWindow) return clampedDelta; // still outside, free movement
    // Entered a window — transition to clamped mode
    invalidAtDragStart.delete(eventId);
    const wStart = targetWindow.startFrame;
    const wEnd = windowEndFrame(targetWindow);
    if (target < wStart) return wStart - startFrame;
    if (target >= wEnd) return wEnd - 1 - startFrame;
    return clampedDelta;
  }

  // Find the window the event started in, or fall back to the window the
  // target is currently in (handles post-transition from invalid state).
  // Third fallback: a window crossed between startFrame and target (overshoot).
  let origWindow = windows.find((w) => startFrame >= w.startFrame && startFrame < windowEndFrame(w));
  if (!origWindow) {
    origWindow = windows.find((w) => target >= w.startFrame && target < windowEndFrame(w));
  }
  if (!origWindow) {
    // Target overshot past a window — find the closest window between
    // startFrame and target so we clamp to its boundary instead of escaping.
    origWindow = windows.find((w) => {
      const wEnd = windowEndFrame(w);
      return (startFrame < w.startFrame && wEnd <= target)
        || (startFrame >= wEnd && w.startFrame >= target);
    });
  }
  if (!origWindow) return clampedDelta;

  const windowStart = origWindow.startFrame;
  const windowEnd = windowEndFrame(origWindow);

  if (target < windowStart) {
    return windowStart - startFrame;
  }
  if (target >= windowEnd) {
    return windowEnd - 1 - startFrame;
  }
  return clampedDelta;
}

// ── Event placement checks ────────────────────────────────────────────────────

/**
 * Checks if placing an event at `atFrame` would overlap with existing sibling
 * events in the same column, using nonOverlappableRange from segments.
 */
export function wouldOverlapSiblings(
  ownerId: string,
  columnId: string,
  atFrame: number,
  range: number,
  events: TimelineEvent[],
): boolean {
  if (range <= 0) return false;
  return events.some((sib) => {
    if (sib.ownerId !== ownerId || sib.columnId !== columnId) return false;
    const sibRange = sib.nonOverlappableRange ?? computeSegmentsSpan(sib.segments);
    if (sibRange > 0 && atFrame >= sib.startFrame && atFrame < sib.startFrame + sibRange) return true;
    if (sib.startFrame >= atFrame && sib.startFrame < atFrame + range) return true;
    return false;
  });
}

/**
 * Checks if placing an event of a given column type at `atFrame` is blocked
 * by an active time-stop animation region.
 *
 * Returns `{ blocked: false }` or `{ blocked: true, reason: string }`.
 */
export function isBlockedByTimeStop(
  columnId: string,
  atFrame: number,
  timeStopRegions: TimeStopRegion[],
  prospectiveAnimDuration?: number,
): { blocked: boolean; reason?: string } {
  // Check if another ultimate animation overlaps the placement frame or the
  // prospective animation range. Ultimates block each other's animations.
  const ultBlock = timeStopRegions.some(
    (stop) => stop.sourceColumnId === SKILL_COLUMNS.ULTIMATE && atFrame >= stop.startFrame && atFrame < stop.startFrame + stop.durationFrames,
  );
  if (ultBlock && columnId !== SKILL_COLUMNS.ULTIMATE) return { blocked: true, reason: 'Ultimate animation active' };
  if (ultBlock && columnId === SKILL_COLUMNS.ULTIMATE) return { blocked: true, reason: 'Another ultimate animation active' };
  // Also check if our animation would overlap another ultimate's start
  if (columnId === SKILL_COLUMNS.ULTIMATE && prospectiveAnimDuration && prospectiveAnimDuration > 0) {
    const animEnd = atFrame + prospectiveAnimDuration;
    const wouldOverlap = timeStopRegions.some(
      (stop) => stop.sourceColumnId === SKILL_COLUMNS.ULTIMATE && stop.startFrame >= atFrame && stop.startFrame < animEnd,
    );
    if (wouldOverlap) return { blocked: true, reason: 'Would overlap another ultimate animation' };
  }
  if (columnId === SKILL_COLUMNS.BATTLE || columnId === SKILL_COLUMNS.BASIC) {
    const comboBlock = timeStopRegions.some(
      (stop) => stop.sourceColumnId === SKILL_COLUMNS.COMBO && atFrame >= stop.startFrame && atFrame < stop.startFrame + stop.durationFrames,
    );
    if (comboBlock) return { blocked: true, reason: 'Combo animation active' };
  }
  return { blocked: false };
}

/**
 * Computes the non-overlappable frame range for a prospective event
 * from its segments or default activation duration.
 */
export function computeProspectiveRange(
  defaultSkill: { segments?: EventSegmentData[] } | null,
  atFrame?: number,
  timeStopRegions?: readonly TimeStopRegion[],
): number {
  if (!defaultSkill?.segments) return 0;
  if (!timeStopRegions || timeStopRegions.length === 0 || atFrame === undefined) {
    return computeSegmentsSpan(defaultSkill.segments);
  }
  // Walk segments, extending game-time segments by time-stop overlap
  let cursor = atFrame;
  for (const s of defaultSkill.segments) {
    if (s.properties.timeDependency === TimeDependency.REAL_TIME) {
      cursor += s.properties.duration;
    } else {
      cursor += extendByTimeStops(cursor, s.properties.duration, timeStopRegions as unknown as readonly import('./processTimeStop').TimeStopRegion[]);
    }
  }
  return cursor - atFrame;
}

// ── Combo window availability ─────────────────────────────────────────────────

export type ComboWindowAvailability = {
  available: boolean;
  reason?: string;
  /** The combo trigger column ID from the matching window, if any. */
  comboTriggerColumnId?: string;
};

/**
 * Checks whether a combo skill can be placed at a given frame for an owner.
 *
 * Checks:
 * - A combo activation window exists for this owner at this frame
 * - The window hasn't already been consumed by another combo event
 * - Always-available combo operators bypass window checks
 */
export function checkComboWindowAvailability(
  ownerId: string,
  atFrame: number,
  events: TimelineEvent[],
  alwaysAvailableSlots: Set<string>,
): ComboWindowAvailability {
  if (alwaysAvailableSlots.has(ownerId)) {
    return { available: true };
  }

  const windowEvents = events.filter(
    (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === ownerId,
  );
  const matchingWindow = windowEvents.find((w) => {
    const endFrame = eventEndFrame(w);
    return atFrame >= w.startFrame && atFrame < endFrame;
  });

  if (!matchingWindow) {
    return { available: false, reason: 'No trigger active' };
  }

  const windowConsumed = events.some((ev) =>
    ev.columnId === SKILL_COLUMNS.COMBO && ev.ownerId === ownerId &&
    ev.startFrame >= matchingWindow.startFrame &&
    ev.startFrame < eventEndFrame(matchingWindow),
  );

  if (windowConsumed) {
    return { available: false, reason: 'Combo skill already activated' };
  }

  return { available: true, comboTriggerColumnId: matchingWindow.comboTriggerColumnId };
}

// ── Segment / frame contiguity ────────────────────────────────────────────────

/**
 * Validates that an event's segments and frames form contiguous runs.
 * Returns an array of warning strings (empty if valid).
 *
 * - Segments: present segments must be consecutive within allSegmentLabels.
 * - Frames: within each segment, present frames must form a consecutive run
 *   starting at index 0 relative to allDefaultSegments.
 */
export function validateSegmentContiguity(
  segments: EventSegmentData[],
  allSegmentLabels?: string[],
  allDefaultSegments?: EventSegmentData[],
): string[] {
  const warnings: string[] = [];

  // Segment-level contiguity
  if (allSegmentLabels && allSegmentLabels.length > 1 && segments.length < allSegmentLabels.length) {
    const presentLabels = new Set(segments.map((s) => s.properties.name));
    const indices = allSegmentLabels
      .map((l, i) => presentLabels.has(l) ? i : -1)
      .filter((i) => i >= 0);
    for (let j = 1; j < indices.length; j++) {
      if (indices[j] !== indices[j - 1] + 1) {
        const missingLabels = allSegmentLabels.filter((l) => !presentLabels.has(l));
        warnings.push(`Non-contiguous sequences (missing: ${missingLabels.join(', ')})`);
        break;
      }
    }
  }

  // Frame-level contiguity per segment
  if (allDefaultSegments) {
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const defaultSeg = allDefaultSegments.find((ds) => ds.properties.name === seg.properties.name) ?? allDefaultSegments[si];
      const allFrameOffsets = defaultSeg?.frames?.map((f) => f.offsetFrame) ?? [];
      const presentOffsets = new Set((seg.frames ?? []).map((f) => f.offsetFrame));
      if (allFrameOffsets.length > 0 && presentOffsets.size < allFrameOffsets.length) {
        const presentIndices = allFrameOffsets
          .map((o, i) => presentOffsets.has(o) ? i : -1)
          .filter((i) => i >= 0);
        const isNonContiguous = presentIndices.length === 0 ||
          presentIndices[0] !== 0 ||
          presentIndices.some((idx, j) => j > 0 && idx !== presentIndices[j - 1] + 1);
        if (isNonContiguous) {
          const missingNums = allFrameOffsets
            .map((o, i) => presentOffsets.has(o) ? null : i + 1)
            .filter((n) => n !== null);
          warnings.push(`Sequence ${seg.properties.name ?? si + 1}: non-contiguous frames (missing: ${missingNums.join(', ')})`);
        }
      }
    }
  }

  return warnings;
}

// ── Variant availability ─────────────────────────────────────────────────────

export type VariantAvailability = {
  disabled: boolean;
  reason?: string;
};

/**
 * Determines whether an event variant is available at a given frame.
 *
 * Checks:
 * - Enhanced variants require an active ultimate
 * - Non-enhanced variants are unavailable while ultimate is active
 * - Empowered variants require max Melting Flame stacks (4)
 */
/** Column types whose variants are affected by ultimate active/enhanced logic. */
const ENHANCED_VARIANT_COLUMNS = new Set([SKILL_COLUMNS.BASIC, SKILL_COLUMNS.BATTLE, SKILL_COLUMNS.COMBO]);

export function checkVariantAvailability(
  variantName: string,
  ownerId: string,
  events: TimelineEvent[],
  atFrame: number,
  columnId?: string,
  slots?: Slot[],
  enhancementType?: string,
): VariantAvailability {
  const isEnhanced = enhancementType ? enhancementType === 'ENHANCED' : variantName.includes('ENHANCED');
  const isEmpowered = enhancementType ? enhancementType === 'EMPOWERED' : variantName.includes('EMPOWERED');

  // Enhanced/non-enhanced checks only apply to basic, battle, and combo skills
  const hasEnhancedVariants = columnId ? ENHANCED_VARIANT_COLUMNS.has(columnId as SkillType) : true;
  const enhanceObject = columnId ? COLUMN_TO_ENHANCE_OBJECT[columnId] : undefined;

  // Evaluate segment clause conditions (e.g. Finisher blocked during ultimate)
  {
    const slot = slots?.find((s) => s.slotId === ownerId);
    if (slot?.operator) {
      const clause = getVariantClause(slot.operator.id, variantName);
      if (clause) {
        const enhanceActive = enhanceObject ? hasEnhanceClauseAtFrame(events, ownerId, enhanceObject, atFrame) : false;
        const result = evaluateClause(clause, { enhanceActive });
        if (!result.pass) return { disabled: true, reason: result.reason };
      }
    }
  }

  // Enhanced variant: requires an active ENHANCE clause for this skill type
  if (isEnhanced && enhanceObject && hasEnhancedVariants) {
    if (!hasEnhanceClauseAtFrame(events, ownerId, enhanceObject, atFrame)) {
      return { disabled: true, reason: 'No active ENHANCE effect' };
    }
  }

  // Regular variant blocked by DISABLE clause or when ENHANCE clause is active
  if (!isEnhanced && !isEmpowered && enhanceObject && hasEnhancedVariants
    && variantName !== CombatSkillsType.FINISHER && variantName !== CombatSkillsType.DIVE) {
    const disableAdj = getDisableAdjectiveAtFrame(events, ownerId, enhanceObject, atFrame);
    if (disableAdj) {
      return { disabled: true, reason: `${disableAdj} variant disabled during this window` };
    }
    if (hasEnhanceClauseAtFrame(events, ownerId, enhanceObject, atFrame)) {
      return { disabled: true, reason: 'Enhanced variant active (use enhanced)' };
    }
  }

  // Check operator status stacks for empowered variants (data-driven)
  if (isEmpowered) {
    const slot = slots?.find((s) => s.slotId === ownerId);
    const opId = slot?.operator?.id;
    if (opId) {
      const opJson = getOperatorJson(opId);
      const statusEvents = opJson?.statusEvents as { target?: string; targetDeterminer?: string; isNamedEvent?: boolean; name?: string; stack?: { max?: Record<string, number> } }[] | undefined;
      const statusDef = statusEvents?.find(
        (se) => se.target === 'OPERATOR' && (!se.targetDeterminer || se.targetDeterminer === 'THIS') && se.isNamedEvent && se.stack,
      );
      if (statusDef && statusDef.stack && statusDef.name) {
        const potKey = `P${slot?.potential ?? 0}`;
        const maxStacks = statusDef.stack.max?.[potKey] ?? statusDef.stack.max?.P0 ?? 4;
        const colId = (OPERATOR_COLUMNS as Record<string, string>)[statusDef.name]
          ?? statusDef.name.toLowerCase().replace(/_/g, '-');
        const statusLabel = STATUS_LABELS[statusDef.name as StatusType] ?? statusDef.name;
        const activeCount = events.filter(
          (ev) =>
            ev.ownerId === ownerId &&
            ev.columnId === colId &&
            ev.startFrame <= atFrame &&
            eventEndFrame(ev) > atFrame,
        ).length;
        if (activeCount < maxStacks) {
          return { disabled: true, reason: `Requires max ${statusLabel} (${activeCount}/${maxStacks})` };
        }
      }
    }
  }

  return { disabled: false };
}

// ── Validation functions ──────────────────────────────────────────────────────

export function validateComboWindows(
  events: TimelineEvent[],
  slots: Slot[],
  draggingIds: Set<string> | null,
): Map<string, string> {
  const map = new Map<string, string>();

  const alwaysAvailable = getAlwaysAvailableComboSlots(slots);

  const windowEvents = events.filter((ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID);
  const consumedWindows = new Map<string, string>();

  // First pass: non-dragged events consume windows
  for (const ev of events) {
    if (draggingIds?.has(ev.id)) continue;
    if (ev.columnId !== SKILL_COLUMNS.COMBO) continue;
    if (alwaysAvailable.has(ev.ownerId)) continue;
    const ownerWindows = windowEvents.filter((w) => w.ownerId === ev.ownerId);
    if (ownerWindows.length === 0) {
      map.set(ev.id, 'No combo trigger window available');
      continue;
    }
    const matchingWindow = ownerWindows.find((w) => {
      const endFrame = eventEndFrame(w);
      return ev.startFrame >= w.startFrame && ev.startFrame < endFrame;
    });
    if (!matchingWindow) {
      map.set(ev.id, 'Outside combo trigger window');
      continue;
    }
    const existing = consumedWindows.get(matchingWindow.id);
    if (existing) {
      map.set(ev.id, 'Combo skill already activated by another combo');
    } else {
      consumedWindows.set(matchingWindow.id, ev.id);
    }
  }

  // Second pass: dragged events check windows without consuming
  if (draggingIds) {
    for (const ev of events) {
      if (!draggingIds.has(ev.id)) continue;
      if (ev.columnId !== SKILL_COLUMNS.COMBO) continue;
      if (alwaysAvailable.has(ev.ownerId)) continue;
      const ownerWindows = windowEvents.filter((w) => w.ownerId === ev.ownerId);
      if (ownerWindows.length === 0) {
        map.set(ev.id, 'No combo trigger window available');
        continue;
      }
      const matchingWindow = ownerWindows.find((w) => {
        const endFrame = eventEndFrame(w);
        return ev.startFrame >= w.startFrame && ev.startFrame < endFrame;
      });
      if (!matchingWindow) {
        map.set(ev.id, 'Outside combo trigger window');
        continue;
      }
      const existing = consumedWindows.get(matchingWindow.id);
      if (existing) {
        map.set(ev.id, 'Combo skill already activated by another combo');
      }
    }
  }

  return map;
}

export function validateResources(
  events: TimelineEvent[],
  resourceGraphs: Map<string, ResourceGraphData>,
  slots: Slot[],
  skipIds?: ReadonlySet<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  const spKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;

  for (const ev of events) {
    if (skipIds?.has(ev.id)) continue;
    if (ev.columnId === SKILL_COLUMNS.ULTIMATE) {
      const ultKey = `${ev.ownerId}-${SKILL_COLUMNS.ULTIMATE}`;
      const graph = resourceGraphs.get(ultKey);
      if (!graph) continue;
      const val = preConsumptionValue(graph, ev.startFrame);
      if (val !== null && belowThreshold(val, graph.max)) {
        map.set(ev.id, `Not enough ultimate energy (${Math.floor(val)}/${graph.max})`);
      }
    } else if (ev.columnId === SKILL_COLUMNS.BATTLE) {
      const spCost = ev.skillPointCost ?? 100;
      const spGraph = resourceGraphs.get(spKey);
      if (!spGraph) continue;
      const val = preConsumptionValue(spGraph, ev.startFrame);
      if (val !== null && belowThreshold(val, spCost)) {
        map.set(ev.id, `Not enough SP (${Math.floor(val)}/${spCost})`);
      }
    }
  }
  return map;
}

export function validateEmpowered(events: TimelineEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  const empoweredNames = new Set([
    CombatSkillsType.SMOULDERING_FIRE_EMPOWERED,
    CombatSkillsType.SMOULDERING_FIRE_ENHANCED_EMPOWERED,
  ]);
  for (const ev of events) {
    if (!empoweredNames.has(ev.name as CombatSkillsType)) continue;
    const mfEvents = events.filter(
      (mf) =>
        mf.ownerId === ev.ownerId &&
        mf.columnId === 'melting-flame' &&
        mf.startFrame <= ev.startFrame &&
        eventEndFrame(mf) > ev.startFrame,
    );
    if (mfEvents.length < 4) {
      map.set(ev.id, `Requires max Melting Flame stacks (${mfEvents.length}/4)`);
    }
  }
  return map;
}

export function validateEnhanced(events: TimelineEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const ev of events) {
    if (!ev.name?.includes('ENHANCED') || ev.name?.includes('EMPOWERED')) continue;
    if (ev.columnId === SKILL_COLUMNS.ULTIMATE) continue;

    const enhanceObject = COLUMN_TO_ENHANCE_OBJECT[ev.columnId];
    if (!enhanceObject) continue;

    // Collect all segment start frames; fall back to event start if no segments
    const segStarts: number[] = [];
    if (ev.segments.length > 0) {
      let offset = ev.startFrame;
      for (const seg of ev.segments) {
        segStarts.push(offset);
        offset += seg.properties.duration;
      }
    } else {
      segStarts.push(ev.startFrame);
    }

    // Every segment start must fall within an active ENHANCE clause
    for (const frame of segStarts) {
      if (!hasEnhanceClauseAtFrame(events, ev.ownerId, enhanceObject, frame)) {
        map.set(ev.id, 'Enhanced skill must be within an active ENHANCE effect');
        break;
      }
    }
  }
  return map;
}

/**
 * Validates that regular (non-enhanced) basic attack segments do NOT start
 * inside the ultimate active phase. Mirrors validateEnhanced (inverse logic).
 * Only applies to operators that have enhanced basic attack variants.
 */
export function validateDisabledVariants(events: TimelineEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const ev of events) {
    if (ev.columnId !== SKILL_COLUMNS.BASIC) continue;
    // Skip enhanced, empowered, finisher, dive — only check regular basic attacks
    if (!ev.name || ev.name.includes('ENHANCED') || ev.name.includes('EMPOWERED')) continue;
    if (ev.name === CombatSkillsType.FINISHER || ev.name === CombatSkillsType.DIVE) continue;

    const enhanceObject = COLUMN_TO_ENHANCE_OBJECT[ev.columnId];
    if (!enhanceObject) continue;

    // Collect all segment start frames
    const segStarts: number[] = [];
    if (ev.segments.length > 0) {
      let offset = ev.startFrame;
      for (const seg of ev.segments) {
        segStarts.push(offset);
        offset += seg.properties.duration;
      }
    } else {
      segStarts.push(ev.startFrame);
    }

    for (const frame of segStarts) {
      if (hasEnhanceClauseAtFrame(events, ev.ownerId, enhanceObject, frame)) {
        map.set(ev.id, 'Regular basic attack cannot be used during ENHANCE effect (use enhanced variant)');
        break;
      }
    }
  }
  return map;
}

/**
 * Get the clause for a variant from its segment or skill category in the operator JSON.
 * Searches all skill categories for segments with a matching name and a clause,
 * or for a skill category with a matching id and a clause.
 */
function getVariantClause(operatorId: string, variantName: string): Predicate[] | null {
  const json = getOperatorJson(operatorId);
  if (!json?.skills) return null;
  for (const cat of Object.values(json.skills) as { id?: string; clause?: Predicate[]; segments?: { name?: string; clause?: Predicate[] }[] }[]) {
    // Check skill category-level clause (matched by id)
    if (cat.id === variantName && cat.clause) return cat.clause;
    // Check segment-level clauses (matched by name, case-insensitive)
    if (cat.segments) {
      for (const seg of cat.segments) {
        if (seg.clause && seg.name?.toUpperCase() === variantName) return seg.clause;
      }
    }
  }
  return null;
}

interface ClauseContext {
  enhanceActive: boolean;
}

/** Evaluate a single interaction condition against the current state. */
function evaluateCondition(cond: Interaction, ctx: ClauseContext): boolean {
  let result = true;
  if (cond.verb === 'IS' && cond.object === 'ACTIVE') {
    if (cond.subjectProperty === 'ULTIMATE') {
      // "ULTIMATE IS ACTIVE" is equivalent to an active ENHANCE clause
      result = ctx.enhanceActive;
    }
  }
  return cond.negated ? !result : result;
}

/**
 * Evaluate a clause (OR of predicates, each AND of conditions).
 * Returns { pass: true } if any predicate's conditions all hold,
 * or { pass: false, reason } if none pass.
 */
function evaluateClause(clause: Predicate[], ctx: ClauseContext): { pass: boolean; reason?: string } {
  for (const pred of clause) {
    if (!pred.conditions?.length) continue;
    const allMet = pred.conditions.every((c) => evaluateCondition(c, ctx));
    if (allMet) return { pass: true };
  }
  // Build reason from first predicate's failed conditions
  const firstCond = clause[0]?.conditions?.[0];
  if (firstCond?.subjectProperty === 'ULTIMATE' && firstCond?.object === 'ACTIVE' && firstCond?.negated) {
    return { pass: false, reason: 'Cannot be used while ultimate is active' };
  }
  return { pass: false, reason: 'Activation condition not met' };
}

export function validateVariantClauses(
  events: TimelineEvent[],
  slots: Slot[],
): Map<string, string> {
  const map = new Map<string, string>();

  // Build operator ID lookup per slot
  const slotOperatorId = new Map<string, string>();
  for (const s of slots) {
    if (s.operator) slotOperatorId.set(s.slotId, s.operator.id);
  }

  for (const ev of events) {
    if (!ev.name) continue;
    const operatorId = slotOperatorId.get(ev.ownerId);
    if (!operatorId) continue;

    const clause = getVariantClause(operatorId, ev.name);
    if (!clause) continue;

    const enhanceObject = COLUMN_TO_ENHANCE_OBJECT[ev.columnId];
    const enhanceActive = enhanceObject ? hasEnhanceClauseAtFrame(events, ev.ownerId, enhanceObject, ev.startFrame) : false;

    const result = evaluateClause(clause, { enhanceActive });
    if (!result.pass) {
      map.set(ev.id, result.reason ?? 'Activation condition not met');
    }
  }
  return map;
}

/**
 * Build effective stagger windows by combining computed stagger breaks with
 * freeform-placed stagger events (Full Stagger and Node Stagger).
 *
 * Computed breaks come from StaggerTimeline; freeform events are user-placed
 * on NODE_STAGGER_COLUMN_ID / FULL_STAGGER_COLUMN_ID columns.
 */
export function getEffectiveStaggerWindows(
  events: readonly TimelineEvent[],
  staggerBreaks: readonly import('./staggerTimeline').StaggerBreak[],
): readonly import('./staggerTimeline').StaggerBreak[] {
  const freeformWindows: import('./staggerTimeline').StaggerBreak[] = [];
  for (const ev of events) {
    if (
      (ev.columnId === NODE_STAGGER_COLUMN_ID || ev.columnId === FULL_STAGGER_COLUMN_ID)
      && eventDuration(ev) > 0
    ) {
      const endFrame = eventEndFrame(ev);
      // Skip if already covered by a computed break
      const covered = staggerBreaks.some(
        (b) => ev.startFrame >= b.startFrame && endFrame <= b.endFrame,
      );
      if (!covered) {
        freeformWindows.push({ startFrame: ev.startFrame, endFrame });
      }
    }
  }
  if (freeformWindows.length === 0) return staggerBreaks;
  return [...staggerBreaks, ...freeformWindows];
}

/**
 * Mark the first basic attack during each stagger break as a finisher.
 *
 * Returns a map of event ID → true for events that should be treated as finishers.
 * Only one basic attack per break qualifies; subsequent basics in the same break
 * are normal attacks. Manually placed FINISHER events count and block auto-promotion.
 */
export function getAutoFinisherIds(
  events: TimelineEvent[],
  staggerBreaks: readonly import('./staggerTimeline').StaggerBreak[],
): Set<string> {
  const autoFinishers = new Set<string>();
  if (staggerBreaks.length === 0) return autoFinishers;

  for (const brk of staggerBreaks) {
    // Check if a manually placed finisher already exists in this break
    const hasManualFinisher = events.some(
      (ev) => ev.name === CombatSkillsType.FINISHER
        && ev.startFrame >= brk.startFrame && ev.startFrame < brk.endFrame,
    );
    if (hasManualFinisher) continue;

    // Find the first basic attack event (any operator) during this break
    const firstBasic = events
      .filter((ev) =>
        ev.columnId === SKILL_COLUMNS.BASIC
        && ev.name !== CombatSkillsType.FINISHER
        && ev.name !== CombatSkillsType.DIVE
        && ev.startFrame >= brk.startFrame
        && ev.startFrame < brk.endFrame,
      )
      .sort((a, b) => a.startFrame - b.startFrame)[0];

    if (firstBasic) {
      autoFinishers.add(firstBasic.id);
    }
  }
  return autoFinishers;
}

/**
 * Validates finisher events: only one finisher (across all operators) per stagger break,
 * and the finisher must be placed during a stagger break.
 */
export function validateFinisherStaggerBreak(
  events: TimelineEvent[],
  staggerBreaks: readonly import('./staggerTimeline').StaggerBreak[],
): Map<string, string> {
  const map = new Map<string, string>();
  const finishers = events.filter((ev) => ev.name === CombatSkillsType.FINISHER);
  if (finishers.length === 0) return map;

  for (const ev of finishers) {
    const inBreak = staggerBreaks.find(
      (b) => ev.startFrame >= b.startFrame && ev.startFrame < b.endFrame,
    );
    if (!inBreak) {
      map.set(ev.id, 'Finisher can only be used during stagger break');
      continue;
    }
    // Check if another finisher (from any operator) already exists in the same break
    const duplicate = finishers.some(
      (other) => other.id !== ev.id
        && other.startFrame >= inBreak.startFrame && other.startFrame < inBreak.endFrame,
    );
    if (duplicate) {
      map.set(ev.id, 'Only one Finisher allowed per stagger break');
    }
  }
  return map;
}

export function validateTimeStops(
  events: TimelineEvent[],
  timeStopRegions: TimeStopRegion[],
): Map<string, string> {
  const map = new Map<string, string>();
  const ultStops = timeStopRegions.filter((s) => s.sourceColumnId === SKILL_COLUMNS.ULTIMATE);
  const comboStops = timeStopRegions.filter((s) => s.sourceColumnId === SKILL_COLUMNS.COMBO);
  for (const ev of events) {
    // Only validate player-input skill columns — status/infliction/reaction events
    // are derived and can legitimately start at the same frame as a timestop
    const isBasic = ev.columnId === SKILL_COLUMNS.BASIC;
    const isBattle = ev.columnId === SKILL_COLUMNS.BATTLE;
    const isCombo = ev.columnId === SKILL_COLUMNS.COMBO;
    if (!isBasic && !isBattle && !isCombo) continue;
    for (const stop of ultStops) {
      if (ev.startFrame >= stop.startFrame && ev.startFrame < stop.startFrame + stop.durationFrames) {
        const skillType = ev.columnId.charAt(0).toUpperCase() + ev.columnId.slice(1) + ' skill';
        map.set(ev.id, `${skillType} input is not possible during ultimate animations`);
        break;
      }
    }
    if ((isBattle || isBasic) && !map.has(ev.id)) {
      for (const stop of comboStops) {
        if (ev.startFrame >= stop.startFrame && ev.startFrame < stop.startFrame + stop.durationFrames) {
          const label = ev.columnId === SKILL_COLUMNS.BASIC ? 'Basic attack' : 'Battle skill';
          map.set(ev.id, `${label} input is not possible during combo animations`);
          break;
        }
      }
    }
  }
  return map;
}

// ── Arts infliction stack validation ──────────────────────────────────────────

/** Max concurrent stacks of the same arts infliction element. */
const MAX_INFLICTION_STACKS = 4;

/**
 * Validates arts infliction events:
 * - At most MAX_INFLICTION_STACKS (4) concurrent stacks of the same element
 *
 * Returns a Map of infliction event ID → warning message for violating events.
 */
export function validateInflictionStacks(events: TimelineEvent[]): Map<string, string> {
  const map = new Map<string, string>();

  const inflictionsByColumn = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID && INFLICTION_COLUMN_IDS.has(ev.columnId)) {
      const group = inflictionsByColumn.get(ev.columnId) ?? [];
      group.push(ev);
      inflictionsByColumn.set(ev.columnId, group);
    }
  }

  if (inflictionsByColumn.size === 0) return map;

  // Check max stacks per element
  inflictionsByColumn.forEach((group) => {
    if (group.length <= MAX_INFLICTION_STACKS) return;
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);

    for (let i = 0; i < sorted.length; i++) {
      const incoming = sorted[i];
      // Count how many OTHER same-element stacks are active at incoming's start frame
      let activeCount = 0;
      for (let j = 0; j < sorted.length; j++) {
        if (j === i) continue;
        if (map.has(sorted[j].id)) continue; // already flagged as excess
        const endFrame = eventEndFrame(sorted[j]);
        if (sorted[j].startFrame <= incoming.startFrame && endFrame > incoming.startFrame) {
          activeCount++;
        }
      }
      if (activeCount >= MAX_INFLICTION_STACKS) {
        map.set(incoming.id, `Exceeds max ${MAX_INFLICTION_STACKS} stacks of same element`);
      }
    }
  });

  return map;
}
