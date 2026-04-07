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
import { NounType } from '../../dsl/semantics';
import { TimelineSourceType, ELEMENT_COLORS, ElementType, InteractionModeType, EventStatusType, DEFAULT_EVENT_COLOR } from '../../consts/enums';
import { getAllSkillLabels, getAllStatusLabels, getAllInflictionLabels, getStatusById } from '../gameDataStore';
import { StackInteractionType } from '../../consts/enums';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';
import type { ValueNode } from '../../dsl/semantics';
import { COMBO_WINDOW_COLUMN_ID, REACTION_COLUMNS } from '../../model/channels';
import { formatSegmentShortName, translateDslToken } from '../../dsl/semanticsTranslation';
import { getAllOperatorStatuses } from '../gameDataStore';
import { getAllWeaponStatuses } from '../../model/game-data/weaponStatusesStore';
import { getAllGearStatuses } from '../../model/game-data/gearStatusesStore';

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

function getStatusStackInfo(statusId: string): StatusStackInfo | undefined {
  if (!statusStackCache) {
    statusStackCache = new Map();
    for (const se of [...getAllOperatorStatuses(), ...getAllWeaponStatuses(), ...getAllGearStatuses()]) {
      if (!se.id || statusStackCache.has(se.id)) continue;
      const rawLimit = se.stacks?.limit;
      const limit = rawLimit == null ? 1
        : typeof rawLimit === 'number' ? rawLimit
        : typeof (rawLimit as { value?: number }).value === 'number' ? (rawLimit as { value?: number }).value!
        : resolveValueNode(rawLimit as unknown as ValueNode, DEFAULT_VALUE_CONTEXT);
      const verb = se.stacks?.interactionType ?? StackInteractionType.NONE;
      const info = { instances: limit, verb };
      statusStackCache.set(se.id, info);
    }
  }
  return statusStackCache.get(statusId);
}

function isSingleInstanceStatus(statusId: string): boolean {
  const info = getStatusStackInfo(statusId);
  if (!info) return true; // No config found → treat as independent single-instance
  // Statuses with segment frames (e.g. DoT waterspouts) are self-contained entities —
  // each renders independently with its own micro-column, not as stacked counters.
  const statusDef = getStatusById(statusId);
  if (statusDef && statusDef.segments.some(s => s.frames && s.frames.length > 0)) return true;
  return info.instances <= 1 && (info.verb === StackInteractionType.NONE || info.verb === StackInteractionType.RESET);
}

function isStackableStatus(statusId: string): boolean {
  const info = getStatusStackInfo(statusId);
  return !!info && info.instances > 1;
}

/** Returns true if the status has RESET interaction (new instance clamps the previous one). */
export function isResetStatus(statusId: string): boolean {
  const info = getStatusStackInfo(statusId);
  return !!info && info.verb === StackInteractionType.RESET;
}

/** Returns the stacking mode for a known status, or undefined if not a status. */
export function getStatusStackingMode(statusId: string): string | undefined {
  return getStatusStackInfo(statusId)?.verb;
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

    const colEvents = col.matchAllExcept
      ? events.filter(ev => ev.ownerId === col.ownerId && !col.matchAllExcept!.has(ev.columnId))
      : (() => {
        const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
        return events.filter(ev => ev.ownerId === col.ownerId &&
          (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId));
      })();

    const byType = new Map<string, TimelineEvent[]>();
    for (const ev of colEvents) {
      const group = byType.get(ev.columnId) ?? [];
      group.push(ev);
      byType.set(ev.columnId, group);
    }

    for (const [columnId, typeEvents] of Array.from(byType.entries())) {
      if (REACTION_COLUMN_IDS.has(columnId)) continue;

      // Include all events (including consumed) for labeling — consumed events
      // with recorded stacks still need their stack label for display.
      const allSorted = [...typeEvents].sort((a, b) => a.startFrame - b.startFrame || a.uid.localeCompare(b.uid));
      if (allSorted.length === 0) continue;
      const baseName = getAllInflictionLabels()[columnId] ?? getAllInflictionLabels()[allSorted[0].name] ?? getAllStatusLabels()[allSorted[0].name] ?? translateDslToken(allSorted[0].name);

      const statusInfo = getStatusStackInfo(allSorted[0].name);
      const singleInstance = isSingleInstanceStatus(allSorted[0].name);
      const stackable = isStackableStatus(allSorted[0].name);
      const stackLimit = statusInfo?.instances;

      const hasRecordedStacks = allSorted.some((ev) => ev.stacks != null);
      if (allSorted.length <= 1 && !stackable && !hasRecordedStacks) continue;

      for (const ev of allSorted) {
        // Use stacks recorded at creation time; fall back to dynamic position from active events
        let position: number;
        // Position = number of earlier overlapping events + 1 (determines roman numeral label)
        // Uses allSorted (including consumed) so consumed events retain their position.
        let activeEarlier = 0;
        for (const prev of allSorted) {
          if (prev.uid === ev.uid) break;
          if (eventEndFrame(prev) > ev.startFrame) activeEarlier++;
        }
        position = activeEarlier + 1;
        // Clamp to stack limit — events beyond the cap repeat the max label
        if (stackLimit != null && position > stackLimit) position = stackLimit;

        const labelValue = ev.stacks != null ? ev.stacks : position;
        const displayLabel = singleInstance ? baseName : `${baseName} ${stackLabel(labelValue)}`;

        const override: StatusViewOverride = {
          label: displayLabel,
        };

        // Visual truncation: truncate at the next event's start frame so
        // stacking events tile without overlapping wrappers.  Applies to all
        // events (including consumed) because consumed inflictions can be
        // extended before eviction and their tall wrappers overlap later events.
        // Single-instance RESET statuses render independently (no tiling).
        // Single-instance NONE statuses with unlimited stacks (accumulators) DO clamp.
        const isIndependentReset = singleInstance && statusInfo?.verb === StackInteractionType.RESET;
        const allIdx = allSorted.indexOf(ev);
        if (!isIndependentReset && allIdx >= 0 && allIdx < allSorted.length - 1) {
          const nextStart = allSorted[allIdx + 1].startFrame;
          const evEnd = eventEndFrame(ev);
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

    const colEvents2 = col.matchAllExcept
      ? events.filter(ev => ev.ownerId === col.ownerId && !col.matchAllExcept!.has(ev.columnId))
      : (() => {
        const ms = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
        return events.filter(ev => ev.ownerId === col.ownerId &&
          (ms ? ms.has(ev.columnId) : ev.columnId === col.columnId));
      })();
    const sorted = [...colEvents2].sort((a, b) => a.startFrame - b.startFrame);
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
  const max = windowEv.maxSkills ?? 1;
  let count = 0;
  for (const ev of events) {
    if (ev.columnId === NounType.COMBO &&
        ev.ownerId === windowEv.ownerId &&
        ev.startFrame >= windowEv.startFrame &&
        ev.startFrame < endFrame) {
      count++;
      if (count >= max) return true;
    }
  }
  return false;
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
  return getAllSkillLabels()[ev.name as string]
    ?? getAllInflictionLabels()[ev.name]
    ?? getAllStatusLabels()[ev.name]
    ?? translateDslToken(ev.name);
}

/**
 * Resolves the dominant element from an event's segments by frame count.
 * Returns the element with the most damage frames, or undefined if no
 * segment carries an element.
 */
function getDominantSegmentElement(ev: TimelineEvent): string | undefined {
  const counts: Partial<Record<string, number>> = {};
  for (const seg of ev.segments) {
    const el = seg.properties.element;
    if (!el) continue;
    counts[el] = (counts[el] ?? 0) + (seg.frames?.length ?? 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [el, count] of Object.entries(counts)) {
    if (count! > bestCount) { best = el; bestCount = count!; }
  }
  return best;
}

/**
 * Resolves the color for an event based on column config and sequencing.
 * Uses the dominant element across the event's segments when available.
 */
export function resolveEventColor(
  ev: TimelineEvent,
  col: Column,
  slotElementColors: Record<string, string>,
): string {
  if (col.type !== 'mini-timeline') return col.color;
  // Non-skill columns (ACTION, status) always use their own column color
  if (!col.skillElement) return col.color;
  // Skill columns: prefer the dominant element from the event's own segments
  const dominant = getDominantSegmentElement(ev);
  const elColor = dominant
    ? ELEMENT_COLORS[dominant as ElementType]
    : ELEMENT_COLORS[col.skillElement as ElementType];
  return elColor ?? slotElementColors[col.ownerId] ?? DEFAULT_EVENT_COLOR;
}

/**
 * Computes the element color map for all slots.
 */
export function computeSlotElementColors(slots: Slot[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of slots) {
    if (s.operator) {
      map[s.slotId] = ELEMENT_COLORS[s.operator.element as ElementType] ?? DEFAULT_EVENT_COLOR;
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
  const isDerivedCol = col.type === 'mini-timeline' && !!col.derived;
  const isEnemy = col.type === 'mini-timeline' && col.source === TimelineSourceType.ENEMY;
  // User-placed events (any creationInteractionMode) are draggable; engine-derived events are not
  const isUserPlaced = ev.creationInteractionMode != null;

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
  const notDraggable = isWindow || (isDerivedCol && !isUserPlaced) || (isEnemy && !isUserPlaced);
  const derived = isDerivedCol && interactionMode === InteractionModeType.STRICT && !isUserPlaced;
  const isAutoFinisher = autoFinisherIds.has(ev.uid);

  const skillElement = isWindow
    ? undefined
    : col.type === 'mini-timeline' ? col.skillElement : undefined;

  let allSegmentLabels: string[] | undefined;
  let allDefaultSegments: EventSegmentData[] | undefined;
  if (!isWindow && col.type === 'mini-timeline') {
    const variantSegs = col.eventVariants?.find((v) => v.id === ev.id)?.segments
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
// Used by external callers (e.g. tests, future incremental updates)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getEventsForColumn(col: MiniTimeline, events: TimelineEvent[]): TimelineEvent[] {
  if (col.matchAllExcept) return events.filter(ev => ev.ownerId === col.ownerId && !col.matchAllExcept!.has(ev.columnId));
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

/** O(1) grouped lookup version of getEventsForColumn. */
function getEventsForColumnGrouped(
  col: MiniTimeline,
  grouped: Map<string, TimelineEvent[]>,
): TimelineEvent[] {
  if (col.matchAllExcept) {
    const result: TimelineEvent[] = [];
    grouped.forEach((arr, key) => {
      if (!key.startsWith(`${col.ownerId}\0`)) return;
      const colId = key.slice(col.ownerId.length + 1);
      if (!col.matchAllExcept!.has(colId)) result.push(...arr);
    });
    return result;
  }
  if (col.matchColumnIds) {
    const result: TimelineEvent[] = [];
    for (const cid of col.matchColumnIds) {
      const arr = grouped.get(`${col.ownerId}\0${cid}`);
      if (arr) result.push(...arr);
    }
    return result;
  }
  if (col.microColumns && col.microColumnAssignment === 'by-column-id') {
    const result: TimelineEvent[] = [];
    for (const mc of col.microColumns) {
      const arr = grouped.get(`${col.ownerId}\0${mc.id}`);
      if (arr) result.push(...arr);
    }
    return result;
  }
  return grouped.get(`${col.ownerId}\0${col.columnId}`) ?? [];
}

/**
 * Sort column events by startFrame when required (by-order and derived columns).
 * Returns a new array if sorting is needed, otherwise the original.
 */
function sortColumnEvents(col: MiniTimeline, colEvents: TimelineEvent[]): TimelineEvent[] {
  if (col.microColumnAssignment === 'by-order' || col.microColumnAssignment === 'dynamic-split' || col.derived) {
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
    const mcIdSet = new Set(col.microColumns.map((mc) => mc.id));

    // Stable slot assignment: assign each declared micro-column a slot based on its
    // position in the micro-column definitions, NOT based on chronological event
    // order. This prevents micro-columns from visually swapping during drag.
    const sorted = [...colEvents].sort((a, b) => a.startFrame - b.startFrame);

    // typeKey resolution: events whose columnId matches a declared micro-column
    // use the columnId as their typeKey (so all instances of the same declared
    // type share one slot). Events whose columnId isn't declared fall back to uid.
    const typeKeyOf = (ev: TimelineEvent) =>
      mcIdSet.has(ev.columnId) ? ev.columnId : ev.uid;

    // Pre-assign slots to every declared micro-column that has at least one event,
    // in definition order. This guarantees each declared type gets its own dedicated
    // visual slot regardless of whether it is single-instance or stackable.
    const typeSlots = new Map<string, number>();
    let nextSlot = 0;
    for (const mcId of col.microColumns.map(mc => mc.id)) {
      if (typeSlots.has(mcId)) continue;
      if (sorted.some(ev => ev.columnId === mcId)) {
        typeSlots.set(mcId, nextSlot++);
      }
    }

    // Initialize slot ranges for pre-assigned types.
    const slots: { type: string; start: number; end: number }[][] = [];
    for (let s = 0; s < nextSlot; s++) slots.push([]);

    // Populate pre-assigned slot ranges for all events that have a pre-assigned slot.
    for (const ev of sorted) {
      const typeKey = typeKeyOf(ev);
      const preSlot = typeSlots.get(typeKey);
      if (preSlot != null) {
        slots[preSlot].push({ type: typeKey, start: ev.startFrame, end: eventEndFrame(ev) });
      }
    }

    // eventUid → assigned slot index
    const eventSlots = new Map<string, number>();

    for (const ev of sorted) {
      const evStart = ev.startFrame;
      const evEnd = eventEndFrame(ev);
      const typeKey = typeKeyOf(ev);

      // Use pre-assigned slot if available
      const preSlot = typeSlots.get(typeKey);
      if (preSlot != null) {
        eventSlots.set(ev.uid, preSlot);
        continue;
      }

      // Greedy left-pack for events whose columnId isn't a declared micro-column.
      let assignedSlot = -1;
      for (let s = 0; s < slots.length; s++) {
        const ranges = slots[s];
        let conflict = false;
        for (const r of ranges) {
          if (r.type === typeKey) continue;
          if (r.start < evEnd && r.end > evStart) { conflict = true; break; }
        }
        if (!conflict) { assignedSlot = s; break; }
      }
      if (assignedSlot < 0) {
        assignedSlot = slots.length;
        slots.push([]);
      }

      slots[assignedSlot].push({ type: typeKey, start: evStart, end: evEnd });
      typeSlots.set(typeKey, assignedSlot);
      eventSlots.set(ev.uid, assignedSlot);
    }

    // Each event renders at its assigned slot with fixed width 1/slotCount.
    // We deliberately do NOT greedy-expand across slot boundaries: declared
    // micro-columns have stable visual positions regardless of temporal gaps
    // in neighboring slots, so users don't see a bar "taking over" an adjacent
    // column at time ranges where the neighbor is momentarily empty.
    const slotCount = Math.max(slots.length, 1);
    const slotFrac = 1 / slotCount;

    for (const ev of sorted) {
      const slot = eventSlots.get(ev.uid) ?? 0;
      positions.set(ev.uid, {
        leftFrac: slot * slotFrac,
        widthFrac: slotFrac,
        color: mcById.get(ev.columnId)?.color ?? DEFAULT_EVENT_COLOR,
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

  const eventsByOwnerColumn = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const key = `${ev.ownerId}\0${ev.columnId}`;
    let arr = eventsByOwnerColumn.get(key);
    if (!arr) { arr = []; eventsByOwnerColumn.set(key, arr); }
    arr.push(ev);
  }

  const allStatusOverrides = computeStatusViewOverrides(events, columns);
  const allGreedySlots = computeGreedySlotAssignments(events, columns);

  for (const col of columns) {
    if (col.type !== 'mini-timeline') continue;

    let colEvents = getEventsForColumnGrouped(col, eventsByOwnerColumn);
    colEvents = sortColumnEvents(col, colEvents);
    colEvents = truncateDerivedEvents(col, colEvents);
    // Hide events with 0 stacks (e.g. Living Banner presence before any SP is gained)
    colEvents = colEvents.filter(ev => ev.stacks !== 0);

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
