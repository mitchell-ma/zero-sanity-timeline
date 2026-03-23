/**
 * Event presentation controller — single source for "how events appear
 * in the timeline."
 *
 * Consolidates:
 * - Per-event display props (label, color, flags)
 * - Event-to-column filtering, sorting, derived truncation
 * - Micro-column slot assignment and positioning (fractional)
 * - Status stack labels and visual truncation
 *
 * Views call computeTimelinePresentation() once per render cycle, then
 * look up ColumnViewModel per column key. Viewport culling and UI-state
 * filtering (hidden status types) remain in the view layer.
 */
import { TimelineEvent, Column, MiniTimeline, EventSegmentData, eventEndFrame } from '../../consts/viewTypes';
import { TimelineSourceType, ELEMENT_COLORS, ElementType, InteractionModeType, EventStatusType } from '../../consts/enums';
import { COMBAT_SKILL_LABELS, INFLICTION_EVENT_LABELS } from '../../consts/timelineColumnLabels';
import { CombatSkillType } from '../../consts/enums';
import { SKILL_COLUMNS, COMBO_WINDOW_COLUMN_ID, REACTION_COLUMNS } from '../../model/channels';
import { formatSegmentShortName } from '../../dsl/semanticsTranslation';
import { getOperatorJson, getAllOperatorIds } from '../../model/event-frames/operatorJsonLoader';

import type { Slot } from './columnBuilder';
import type { ValidationMaps } from './eventValidationController';
import { aggregateEventWarnings } from './eventValidationController';

// ════════════════════════════════════════════════════════════════════════
// Status view overrides — stack-aware labels + visual truncation
// (absorbed from statusViewController.ts)
// ════════════════════════════════════════════════════════════════════════

const REACTION_COLUMN_IDS: Set<string> = new Set(Object.values(REACTION_COLUMNS));
const MAX_ROMAN = 9;

function stackLabel(stackNumber: number): string {
  if (stackNumber <= MAX_ROMAN) return formatSegmentShortName(undefined, stackNumber - 1);
  return `${stackNumber}`;
}

interface StatusStackInfo {
  instances: number;
  verb: string;
}

let statusStackCache: Map<string, StatusStackInfo> | null = null;

function getStatusStackInfo(statusName: string): StatusStackInfo | undefined {
  if (!statusStackCache) {
    statusStackCache = new Map();
    for (const opId of getAllOperatorIds()) {
      const json = getOperatorJson(opId);
      const statusEvents = json?.statusEvents as { id: string; stacks?: { limit?: { value?: number }; interactionType?: string } }[] | undefined;
      if (!statusEvents) continue;
      for (const se of statusEvents) {
        if (statusStackCache.has(se.id)) continue;
        const limit = se.stacks?.limit?.value ?? 1;
        const verb = se.stacks?.interactionType ?? 'NONE';
        statusStackCache.set(se.id, { instances: limit, verb });
      }
    }
  }
  return statusStackCache.get(statusName);
}

function isSingleInstanceStatus(statusName: string): boolean {
  const info = getStatusStackInfo(statusName);
  if (!info) return false;
  return info.instances <= 1 && (info.verb === 'NONE' || info.verb === 'RESET');
}

function isStackableStatus(statusName: string): boolean {
  const info = getStatusStackInfo(statusName);
  return !!info && info.instances > 1;
}

export interface StatusViewOverride {
  label: string;
  /** Truncated activation duration (frames) for visual rendering. */
  visualActivationDuration?: number;
}

/**
 * Compute stack-aware labels and visual truncations for all status events
 * in micro-column columns.
 */
export function computeStatusViewOverrides(
  events: TimelineEvent[],
  columns: Column[],
): Map<string, StatusViewOverride> {
  const overrides = new Map<string, StatusViewOverride>();

  for (const col of columns) {
    if (col.type !== 'mini-timeline' || !col.microColumns) continue;

    const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
    const colEvents = events.filter(
      (ev) => ev.ownerId === col.ownerId &&
        (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
    );

    const byType = new Map<string, TimelineEvent[]>();
    for (const ev of colEvents) {
      const group = byType.get(ev.columnId) ?? [];
      group.push(ev);
      byType.set(ev.columnId, group);
    }

    for (const [columnId, typeEvents] of Array.from(byType.entries())) {
      if (REACTION_COLUMN_IDS.has(columnId)) continue;

      // Exclude consumed events — they already have correct durations and
      // should not cause visual truncation of active events before them.
      const active = typeEvents.filter((ev) => ev.eventStatus !== EventStatusType.CONSUMED);
      const sorted = [...active].sort((a, b) => a.startFrame - b.startFrame || a.uid.localeCompare(b.uid));
      if (sorted.length === 0) continue;
      const baseName = INFLICTION_EVENT_LABELS[columnId] ?? INFLICTION_EVENT_LABELS[sorted[0].name] ?? sorted[0].name;

      const singleInstance = isSingleInstanceStatus(sorted[0].name);
      const stackable = isStackableStatus(sorted[0].name);

      if (sorted.length <= 1 && !stackable) continue;

      for (let i = 0; i < sorted.length; i++) {
        const ev = sorted[i];
        let activeEarlier = 0;
        for (let j = 0; j < i; j++) {
          const prev = sorted[j];
          const prevEnd = eventEndFrame(prev);
          if (prevEnd > ev.startFrame) activeEarlier++;
        }
        const position = activeEarlier + 1;

        const override: StatusViewOverride = {
          label: singleInstance ? baseName : `${baseName} ${stackLabel(position)}`,
        };

        if (i < sorted.length - 1) {
          const nextStart = sorted[i + 1].startFrame;
          const totalDur = eventEndFrame(ev) - ev.startFrame;
          const evEnd = ev.startFrame + totalDur;
          if (nextStart < evEnd) {
            const visualDur = nextStart - ev.startFrame;
            if (visualDur >= 0) {
              override.visualActivationDuration = visualDur;
            }
          }
        }

        overrides.set(ev.uid, override);
      }
    }
  }

  return overrides;
}

// ════════════════════════════════════════════════════════════════════════
// Micro-column slot assignment (absorbed from microColumnController.ts)
// ════════════════════════════════════════════════════════════════════════

/**
 * Slot assignment for reuseExpiredSlots columns.
 * Maps eventUid → assigned micro-column index.
 * Consumed events are excluded from active count.
 */
function computeGreedySlotAssignments(
  events: TimelineEvent[],
  columns: Column[],
): Map<string, number> {
  const assignments = new Map<string, number>();
  for (const col of columns) {
    if (col.type !== 'mini-timeline' || !col.reuseExpiredSlots || !col.microColumns) continue;
    const microCount = col.microColumns.length;

    const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
    const colEvents = events.filter(
      (ev) => ev.ownerId === col.ownerId &&
        (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
    );
    const sorted = [...colEvents].sort((a, b) => a.startFrame - b.startFrame);
    for (const ev of sorted) {
      let activeCount = 0;
      for (const other of sorted) {
        if (other.uid === ev.uid) continue;
        if (other.eventStatus === EventStatusType.CONSUMED) continue;
        const otherEnd = eventEndFrame(other);
        if (other.startFrame <= ev.startFrame && otherEnd > ev.startFrame) {
          activeCount++;
        }
      }
      assignments.set(ev.uid, Math.min(activeCount, microCount - 1));
    }
  }
  return assignments;
}

// ════════════════════════════════════════════════════════════════════════
// Per-event presentation (existing)
// ════════════════════════════════════════════════════════════════════════

function isWindowConsumed(windowEv: TimelineEvent, events: readonly TimelineEvent[]): boolean {
  const endFrame = eventEndFrame(windowEv);
  return events.some((ev) =>
    ev.columnId === SKILL_COLUMNS.COMBO &&
    ev.ownerId === windowEv.ownerId &&
    ev.startFrame >= windowEv.startFrame &&
    ev.startFrame < endFrame,
  );
}

export interface EventPresentation {
  label: string;
  color: string;
  comboWarning: string | null;
  passive: boolean;
  notDraggable: boolean;
  derived: boolean;
  isAutoFinisher: boolean;
  skillElement?: string;
  allSegmentLabels?: string[];
  allDefaultSegments?: EventSegmentData[];
  /** If set, overrides the event's visual duration (in frames) for rendering only. */
  visualActivationDuration?: number;
}

/**
 * Resolves the display label for an event.
 */
export function resolveEventLabel(ev: TimelineEvent): string {
  if (ev.isPerfectDodge) return 'Dodge';
  return COMBAT_SKILL_LABELS[ev.name as CombatSkillType]
    ?? INFLICTION_EVENT_LABELS[ev.name]
    ?? ev.name;
}

/**
 * Resolves the color for an event based on column config and sequencing.
 */
export function resolveEventColor(
  ev: TimelineEvent,
  col: Column,
  slotElementColors: Record<string, string>,
): string {
  if (col.type !== 'mini-timeline') return col.color;
  const isSequenced = ev.segments.length > 0;
  if (!isSequenced) return col.color;
  const skillElColor = col.skillElement
    ? ELEMENT_COLORS[col.skillElement as ElementType]
    : undefined;
  return skillElColor ?? slotElementColors[col.ownerId] ?? col.color;
}

/**
 * Computes the element color map for all slots.
 */
export function computeSlotElementColors(slots: Slot[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of slots) {
    if (s.operator) {
      map[s.slotId] = ELEMENT_COLORS[s.operator.element as ElementType] ?? s.operator.color;
    }
  }
  return map;
}

/**
 * Computes full presentation props for a single event in a column context.
 */
export function computeEventPresentation(
  ev: TimelineEvent,
  col: Column,
  options: {
    slotElementColors: Record<string, string>;
    autoFinisherIds: Set<string>;
    validationMaps: ValidationMaps;
    interactionMode?: InteractionModeType;
    statusViewOverrides?: Map<string, StatusViewOverride>;
    events?: readonly TimelineEvent[];
  },
): EventPresentation {
  const { slotElementColors, autoFinisherIds, validationMaps, interactionMode, statusViewOverrides, events } = options;
  const isWindow = ev.columnId === COMBO_WINDOW_COLUMN_ID;
  const isDerivedCol = col.type === 'mini-timeline' && !!col.derived && interactionMode === InteractionModeType.STRICT;
  const isEnemy = col.type === 'mini-timeline' && col.source === TimelineSourceType.ENEMY;

  const statusOverride = statusViewOverrides?.get(ev.uid);
  const label = isWindow
    ? (events && isWindowConsumed(ev, events) ? '' : 'COMBO ACTIVATION WINDOW')
    : (statusOverride?.label ?? resolveEventLabel(ev));
  const color = resolveEventColor(ev, col, slotElementColors);

  const validationWarning = isWindow
    ? null
    : aggregateEventWarnings(ev.uid, validationMaps);
  const eventWarnings = ev.warnings && ev.warnings.length > 0
    ? ev.warnings.join('\n')
    : null;
  const comboWarning = validationWarning && eventWarnings
    ? `${validationWarning}\n${eventWarnings}`
    : validationWarning ?? eventWarnings;

  const passive = isWindow;
  const notDraggable = isWindow || isDerivedCol || (isEnemy && interactionMode === InteractionModeType.STRICT);
  const derived = isDerivedCol;
  const isAutoFinisher = autoFinisherIds.has(ev.uid);

  const skillElement = isWindow
    ? undefined
    : col.type === 'mini-timeline' ? col.skillElement : undefined;

  let allSegmentLabels: string[] | undefined;
  let allDefaultSegments: EventSegmentData[] | undefined;
  if (!isWindow && col.type === 'mini-timeline') {
    const variantSegs = col.eventVariants?.find((v) => v.name === ev.id)?.segments
      ?? col.defaultEvent?.segments;
    allSegmentLabels = variantSegs?.map((s) => s.properties.name!);
    allDefaultSegments = variantSegs;
  }

  return {
    label,
    color,
    comboWarning,
    passive,
    notDraggable,
    derived,
    isAutoFinisher,
    skillElement,
    allSegmentLabels,
    allDefaultSegments,
    visualActivationDuration: statusOverride?.visualActivationDuration,
  };
}

// ════════════════════════════════════════════════════════════════════════
// Timeline presentation — column view model computation
// ════════════════════════════════════════════════════════════════════════

export interface MicroPosition {
  /** Fractional left offset within the column (0–1). */
  leftFrac: number;
  /** Fractional width within the column (0–1). */
  widthFrac: number;
  color: string;
}

/** Overlap lane assignment for events that share temporal space within a column. */
export interface OverlapLane {
  /** 0-based lane index. */
  lane: number;
  /** Total number of concurrent lanes at this event's position. */
  laneCount: number;
}

export interface ColumnViewModel {
  column: Column;
  /** Events for this column: filtered, sorted, and (for derived columns) truncated. */
  events: TimelineEvent[];
  /** Micro-column positioning for events (eventUid → position). Empty for non-micro columns. */
  microPositions: Map<string, MicroPosition>;
  /** Status view overrides for events (eventUid → label/visual override). */
  statusOverrides: Map<string, StatusViewOverride>;
  /** Overlap lane assignments for non-micro columns (eventUid → lane info). */
  overlapLanes: Map<string, OverlapLane>;
}

/**
 * Filter events belonging to a mini-timeline column.
 */
function getEventsForColumn(col: MiniTimeline, events: TimelineEvent[]): TimelineEvent[] {
  if (col.matchColumnIds) {
    const matchSet = new Set(col.matchColumnIds);
    return events.filter(
      (ev) => ev.ownerId === col.ownerId && matchSet.has(ev.columnId),
    );
  }
  if (col.microColumns && col.microColumnAssignment === 'by-column-id') {
    const mcIds = new Set(col.microColumns.map((mc) => mc.id));
    return events.filter(
      (ev) => ev.ownerId === col.ownerId && mcIds.has(ev.columnId),
    );
  }
  return events.filter(
    (ev) => ev.ownerId === col.ownerId && ev.columnId === col.columnId,
  );
}

/**
 * Sort column events by startFrame when required (by-order and derived columns).
 * Returns a new array if sorting is needed, otherwise the original.
 */
function sortColumnEvents(col: MiniTimeline, colEvents: TimelineEvent[]): TimelineEvent[] {
  if (col.microColumnAssignment === 'by-order' || col.derived) {
    return [...colEvents].sort((a, b) => a.startFrame - b.startFrame);
  }
  return colEvents;
}

/**
 * For derived (overlappable) single-column layouts, truncate each event's
 * visual duration at the start of the next event. Skip for dynamic-split,
 * by-order, and reuseExpiredSlots columns where events share width or slots.
 */
function truncateDerivedEvents(col: MiniTimeline, colEvents: TimelineEvent[]): TimelineEvent[] {
  if (!col.derived) return colEvents;
  if (col.microColumnAssignment === 'dynamic-split') return colEvents;
  if (col.microColumnAssignment === 'by-order') return colEvents;
  if (col.reuseExpiredSlots) return colEvents;

  const result = [...colEvents];
  for (let i = 0; i < result.length - 1; i++) {
    const cur = result[i];
    const next = result[i + 1];
    const curEnd = eventEndFrame(cur);
    if (curEnd > next.startFrame) {
      const clampedTotal = next.startFrame - cur.startFrame;
      let remaining = clampedTotal;
      const clampedSegments = cur.segments.map(s => {
        if (remaining <= 0) return { ...s, properties: { ...s.properties, duration: 0 } };
        const dur = Math.min(s.properties.duration, remaining);
        remaining -= dur;
        return { ...s, properties: { ...s.properties, duration: dur } };
      }).filter(s => s.properties.duration > 0);
      result[i] = {
        ...cur,
        segments: clampedSegments.length === 0
          ? [{ properties: { duration: clampedTotal } } as TimelineEvent['segments'][0]]
          : clampedSegments,
      };
    }
  }
  return result;
}

/**
 * Compute fractional micro-column positions for events in a single column.
 *
 * Three assignment strategies:
 * - **dynamic-split**: greedy left-pack, 1/3 max width, visual-overlap-aware
 * - **by-order**: greedy slot assignment with reuse of expired slots
 * - **by-column-id**: fixed mapping from event columnId to micro-column index
 */
function computeMicroPositions(
  col: MiniTimeline,
  colEvents: TimelineEvent[],
  greedySlots: Map<string, number>,
  statusOverrides: Map<string, StatusViewOverride>,
): Map<string, MicroPosition> {
  const positions = new Map<string, MicroPosition>();
  if (!col.microColumns) return positions;

  const microCount = col.microColumns.length;

  if (col.microColumnAssignment === 'dynamic-split') {
    const mcById = new Map(col.microColumns.map((mc) => [mc.id, mc]));

    // True greedy left-pack: assign each event to the lowest slot index
    // where no different-type event overlaps. Same-type events share slots.
    // Processes events chronologically so earlier events claim lower slots.
    const sorted = [...colEvents].sort((a, b) => a.startFrame - b.startFrame);

    // Each slot tracks active ranges: { type, start, end }
    const slots: { type: string; start: number; end: number }[][] = [];
    // type → assigned slot index (same-type events reuse their type's slot)
    const typeSlots = new Map<string, number>();
    // eventUid → assigned slot index (for second pass)
    const eventSlots = new Map<string, number>();

    for (const ev of sorted) {
      const evStart = ev.startFrame;
      const evEnd = eventEndFrame(ev);

      // If this type already has a slot assigned, reuse it — unless a
      // different-type event now overlaps in that slot.
      const existingSlot = typeSlots.get(ev.columnId);
      if (existingSlot != null) {
        let conflict = false;
        for (const r of slots[existingSlot]) {
          if (r.type !== ev.columnId && r.start < evEnd && r.end > evStart) {
            conflict = true;
            break;
          }
        }
        if (!conflict) {
          slots[existingSlot].push({ type: ev.columnId, start: evStart, end: evEnd });
          eventSlots.set(ev.uid, existingSlot);
          continue;
        }
      }

      // Find the lowest slot with no overlapping different-type event
      let assignedSlot = -1;
      for (let s = 0; s < slots.length; s++) {
        const ranges = slots[s];
        let conflict = false;
        for (const r of ranges) {
          if (r.type === ev.columnId) continue;
          if (r.start < evEnd && r.end > evStart) { conflict = true; break; }
        }
        if (!conflict) { assignedSlot = s; break; }
      }
      if (assignedSlot < 0) {
        assignedSlot = slots.length;
        slots.push([]);
      }

      slots[assignedSlot].push({ type: ev.columnId, start: evStart, end: evEnd });
      typeSlots.set(ev.columnId, assignedSlot);
      eventSlots.set(ev.uid, assignedSlot);
    }

    // Compute widthFrac from actual slot count so all slots fit within the column
    const slotCount = Math.max(slots.length, 1);
    const slotFrac = 1 / slotCount;

    for (const ev of sorted) {
      const slot = eventSlots.get(ev.uid) ?? 0;
      positions.set(ev.uid, {
        leftFrac: slot * slotFrac,
        widthFrac: slotFrac,
        color: mcById.get(ev.columnId)?.color ?? col.color,
      });
    }
  } else if (col.microColumnAssignment === 'by-order') {
    const microW = 1 / microCount;
    const sorted = [...colEvents].sort((a, b) => a.startFrame - b.startFrame);
    sorted.forEach((ev, i) => {
      const microIdx = greedySlots.get(ev.uid) ?? Math.min(i, microCount - 1);
      const mcMatch = col.matchColumnIds
        ? col.microColumns!.find((mc) => mc.id === ev.columnId)
        : undefined;
      positions.set(ev.uid, {
        leftFrac: microIdx * microW,
        widthFrac: microW,
        color: mcMatch?.color ?? col.microColumns![microIdx].color,
      });
    });
  } else {
    // by-column-id
    const microW = 1 / microCount;
    col.microColumns.forEach((mc, mcIdx) => {
      const mcEvents = colEvents.filter(
        (ev) => ev.columnId === mc.id,
      );
      for (const ev of mcEvents) {
        positions.set(ev.uid, {
          leftFrac: mcIdx * microW,
          widthFrac: microW,
          color: mc.color,
        });
      }
    });
  }

  return positions;
}

/**
 * Compute overlap lane assignments for events in a single column.
 * Events that overlap temporally are assigned to side-by-side lanes.
 */
function computeOverlapLanes(colEvents: TimelineEvent[]): Map<string, OverlapLane> {
  const result = new Map<string, OverlapLane>();
  if (colEvents.length === 0) return result;

  // Exclude passive/window events — they render full-width behind everything
  const laneEligible = colEvents.filter((ev) => ev.columnId !== COMBO_WINDOW_COLUMN_ID);

  // Sort by start frame, then by end frame descending (wider events first)
  const sorted = [...laneEligible].sort((a, b) =>
    a.startFrame - b.startFrame || eventEndFrame(b) - eventEndFrame(a),
  );

  // Assign each event to the first available lane (greedy interval packing)
  // laneEnds[i] = end frame of the last event in lane i
  const laneEnds: number[] = [];
  const laneAssignments = new Map<string, number>();

  for (const ev of sorted) {
    const start = ev.startFrame;
    const end = eventEndFrame(ev);
    let assignedLane = -1;

    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= start) {
        assignedLane = i;
        laneEnds[i] = end;
        break;
      }
    }

    if (assignedLane === -1) {
      assignedLane = laneEnds.length;
      laneEnds.push(end);
    }

    laneAssignments.set(ev.uid, assignedLane);
  }

  // Now compute laneCount per event: max concurrent lanes among all events overlapping it
  for (const ev of sorted) {
    const lane = laneAssignments.get(ev.uid)!;
    const evStart = ev.startFrame;
    const evEnd = eventEndFrame(ev);

    // Count how many lanes are active during this event's span
    let maxConcurrent = 0;
    for (const other of sorted) {
      const otherStart = other.startFrame;
      const otherEnd = eventEndFrame(other);
      if (otherStart < evEnd && otherEnd > evStart) {
        const otherLane = laneAssignments.get(other.uid)!;
        if (otherLane + 1 > maxConcurrent) maxConcurrent = otherLane + 1;
      }
    }

    result.set(ev.uid, { lane, laneCount: maxConcurrent });
  }

  return result;
}

/**
 * Compute the full timeline presentation model for all mini-timeline columns.
 *
 * Returns a map of column key → ColumnViewModel containing:
 * - Filtered, sorted, and truncated events
 * - Fractional micro-column positions
 * - Status view overrides (stack labels, visual truncation)
 * - Overlap lane assignments for non-micro columns
 *
 * Viewport culling is NOT applied — the view layer should filter
 * ColumnViewModel.events by visible frame range before rendering.
 */
export function computeTimelinePresentation(
  events: TimelineEvent[],
  columns: Column[],
): Map<string, ColumnViewModel> {
  const result = new Map<string, ColumnViewModel>();

  // Pre-compute cross-column data
  const allStatusOverrides = computeStatusViewOverrides(events, columns);
  const allGreedySlots = computeGreedySlotAssignments(events, columns);

  for (const col of columns) {
    if (col.type !== 'mini-timeline') continue;

    let colEvents = getEventsForColumn(col, events);
    colEvents = sortColumnEvents(col, colEvents);
    colEvents = truncateDerivedEvents(col, colEvents);

    // Collect status overrides for this column's events
    const colStatusOverrides = new Map<string, StatusViewOverride>();
    for (const ev of colEvents) {
      const override = allStatusOverrides.get(ev.uid);
      if (override) colStatusOverrides.set(ev.uid, override);
    }

    const microPositions = col.microColumns
      ? computeMicroPositions(col, colEvents, allGreedySlots, allStatusOverrides)
      : new Map<string, MicroPosition>();

    const overlapLanes = col.microColumns
      ? new Map<string, OverlapLane>()
      : computeOverlapLanes(colEvents);

    result.set(col.key, {
      column: col,
      events: colEvents,
      microPositions,
      statusOverrides: colStatusOverrides,
      overlapLanes,
    });
  }

  return result;
}
