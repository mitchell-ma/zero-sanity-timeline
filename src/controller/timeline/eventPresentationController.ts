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
import { ELEMENT_COLORS, ElementType, InteractionModeType, EventStatusType, DEFAULT_EVENT_COLOR } from '../../consts/enums';
import { getAllSkillLabels, getAllStatusLabels, getAllInflictionLabels, getStatusById } from '../gameDataStore';
import { getOperatorSkill } from '../../model/game-data/operatorSkillsStore';
import { StackInteractionType } from '../../consts/enums';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';
import type { ValueNode } from '../../dsl/semantics';
import { COMBO_WINDOW_COLUMN_ID, REACTION_COLUMNS, INFLICTION_COLUMN_IDS } from '../../model/channels';
import { formatSegmentShortName, translateDslToken, formatEventLabel } from '../../dsl/semanticsTranslation';
import { getAllOperatorStatuses } from '../gameDataStore';
import { getAllWeaponStats } from '../../model/game-data/weaponStatusesStore';
import { getAllGearStats } from '../../model/game-data/gearStatusesStore';

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
    for (const se of [...getAllOperatorStatuses(), ...getAllWeaponStats(), ...getAllGearStats()]) {
      if (!se.id || statusStackCache.has(se.id)) continue;
      const rawLimit = se.stacks?.limit;
      const limit = rawLimit == null ? 1
        : typeof rawLimit === 'number' ? rawLimit
        : typeof (rawLimit as { value?: number }).value === 'number' ? (rawLimit as { value?: number }).value!
        : resolveMaxPossibleLimit(rawLimit as unknown as ValueNode);
      const verb = se.stacks?.interactionType ?? StackInteractionType.NONE;
      const info = { instances: limit, verb };
      statusStackCache.set(se.id, info);
    }
  }
  return statusStackCache.get(statusId);
}

/**
 * Resolve a stacks.limit expression to its maximum possible value across all
 * loadout states (potential 0-5). Used as the view-layer upper bound for stack
 * label positioning — so e.g. Pog Fervent Morale labels can reach "V" even if
 * a specific event hasn't stamped its per-apply runtime cap yet.
 *
 * The per-apply runtime cap (stamped on each event's `maxStacks` at apply time
 * via the engine) is still the authoritative cap for column gating and label
 * rendering. This is purely the ceiling fallback.
 */
function resolveMaxPossibleLimit(node: ValueNode): number {
  let maxLimit = 0;
  for (let potential = 0; potential <= 5; potential++) {
    const ctx = { ...DEFAULT_VALUE_CONTEXT, potential };
    const v = resolveValueNode(node, ctx);
    if (typeof v === 'number' && v > maxLimit) maxLimit = v;
  }
  return maxLimit > 0 ? maxLimit : 1;
}

/**
 * True when clamping an event of status `statusId` to `visualDur` frames
 * would hide any internal frame marker (e.g. Waterspout's 2s/3s damage
 * ticks if clamped to 1s). Used to opt out of visual tiling for events
 * whose per-segment frame offsets would otherwise be cut off.
 */
/**
 * True when the status has at least one segment frame at offset > 0 (i.e., an
 * interior damage/effect tick that can't be visually clamped). Used by
 * DYNAMIC_SPLIT slot assignment to prevent such statuses from sharing a slot:
 * tiling them would hide the interior frames. Frames at offset 0 don't count —
 * they render at event start regardless of clamping.
 */
function hasInteriorSegmentFrames(statusId: string): boolean {
  const def = getStatusById(statusId);
  if (!def) return false;
  for (const seg of def.segments) {
    if (!seg.frames) continue;
    for (const f of seg.frames) {
      if (f.offsetFrame > 0) return true;
    }
  }
  return false;
}

export function clampWouldHideFrame(statusId: string, visualDur: number): boolean {
  const statusDef = getStatusById(statusId);
  if (!statusDef) return false;
  let segStart = 0;
  for (const seg of statusDef.segments) {
    if (seg.frames) {
      for (const f of seg.frames) {
        if (segStart + f.offsetFrame > visualDur) return true;
      }
    }
    segStart += seg.properties.duration;
  }
  return false;
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
      ? events.filter(ev => ev.ownerEntityId === col.ownerEntityId && !col.matchAllExcept!.has(ev.columnId))
      : (() => {
        const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
        return events.filter(ev => ev.ownerEntityId === col.ownerEntityId &&
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

      const allSorted = [...typeEvents].sort((a, b) => a.startFrame - b.startFrame || a.uid.localeCompare(b.uid));
      if (allSorted.length === 0) continue;
      const baseName = getAllInflictionLabels()[columnId] ?? resolveEventLabel(allSorted[0]);

      const statusInfo = getStatusStackInfo(allSorted[0].name);
      const singleInstance = isSingleInstanceStatus(allSorted[0].name);
      const stackable = isStackableStatus(allSorted[0].name);

      const hasRecordedStacks = allSorted.some((ev) => ev.stacks != null);
      if (allSorted.length <= 1 && !stackable && !hasRecordedStacks) continue;

      // NONE accumulators (Living Banner, Wildland Trekker): one event = one
      // stack of a running counter. Each event gets a unique position label
      // (1, 2, …, 20) based on how many preceding events overlap at its start.
      // Uses clamped ends so consumed events don't inflate post-consume labels.
      const isNoneAccumulator = statusInfo?.verb === StackInteractionType.NONE;

      // Stack limit for label capping: prefer per-event runtime-resolved cap
      // (stamped at apply time for loadout-dependent limits like P5 Fervent
      // Morale cap=5), fall back to static config limit.
      const runtimeLimit = allSorted.reduce<number | undefined>((acc, ev) => {
        if (ev.maxStacks == null) return acc;
        return acc == null ? ev.maxStacks : Math.max(acc, ev.maxStacks);
      }, undefined);
      const stackLimit = runtimeLimit ?? statusInfo?.instances;

      // Transition-based stack count (for pool-count statuses like RESET/MERGE).
      // For each event emit +stacks at its startFrame and -stacks at its
      // (possibly consume-clamped) endFrame. Walk transitions in order; at each
      // unique frame the running total = cumulative active stack count.
      // All events at the same start frame share the same label (pool count).
      //
      // Consume ordering: at the same frame, process -deltas before +deltas
      // so a leftover created by an absorb-and-reapply consume reflects the
      // post-consume total, not the pre-consume total.
      interface Transition { frame: number; delta: number }
      const countAtFrame = new Map<number, number>();
      if (!isNoneAccumulator) {
        const transitions: Transition[] = [];
        for (const ev of allSorted) {
          const s = ev.stacks ?? 1;
          if (s === 0) continue;
          transitions.push({ frame: ev.startFrame, delta: s });
          transitions.push({ frame: eventEndFrame(ev), delta: -s });
        }
        transitions.sort((a, b) => a.frame - b.frame || a.delta - b.delta);
        let running = 0;
        let ti = 0;
        while (ti < transitions.length) {
          const f = transitions[ti].frame;
          while (ti < transitions.length && transitions[ti].frame === f) {
            running += transitions[ti].delta;
            ti++;
          }
          countAtFrame.set(f, running);
        }
      }

      for (const ev of allSorted) {
        let labelValue: number;
        if (ev.stacks != null) {
          // Event has a pre-computed stack label (inflictions, physical statuses).
          // Use it directly — infliction stacks represent the total at creation
          // time, not how many stacks this event adds.
          labelValue = ev.stacks;
        } else if (isNoneAccumulator) {
          // Per-event position: count preceding events whose clamped end
          // overlaps this event's startFrame. Uses `>=` (inclusive) so events
          // that triggered a same-frame CONSUME (e.g. Arclight cast2 whose
          // apply trips the threshold and clamps cast1's end to F=cast2.start,
          // or Living Banner's 81st event that fires the threshold at its own
          // start frame) still see the prior batch as "active at apply time".
          // Post-consume NEW batches at later frames naturally get correct
          // labels: consumed priors have end=Fconsume < new.start, excluded.
          let activeEarlier = 0;
          for (const prev of allSorted) {
            if (prev.uid === ev.uid) break;
            if ((prev.stacks ?? 1) === 0) continue;
            if (eventEndFrame(prev) >= ev.startFrame) activeEarlier++;
          }
          labelValue = activeEarlier + 1;
        } else {
          // Transition-based pool count (RESET/MERGE/REFRESH): running total
          // at this event's start frame. Each event = 1 stack (stacks field
          // is not set for these).
          labelValue = countAtFrame.get(ev.startFrame) ?? 1;
        }
        if (stackLimit != null && labelValue > stackLimit) labelValue = stackLimit;
        const displayLabel = singleInstance ? baseName : `${baseName} ${stackLabel(Math.max(1, labelValue))}`;

        const override: StatusViewOverride = { label: displayLabel };

        // Visual truncation: truncate at the next event's start frame so
        // stacking events tile without overlapping wrappers. Applies to all
        // events (including consumed) because consumed inflictions can be
        // extended before eviction and their tall wrappers overlap later events.
        //
        // Two opt-outs:
        // (a) Single-instance RESET statuses (limit<=1) — render independently.
        // (b) Events whose internal frames would be hidden by the clamp —
        //     e.g. Waterspout has damage ticks at 1s/2s/3s; clamping to 1s
        //     would hide the 2s/3s ticks, so skip the clamp.
        const isIndependentReset = (statusInfo?.instances ?? 1) <= 1
          && statusInfo?.verb === StackInteractionType.RESET;
        const allIdx = allSorted.indexOf(ev);
        if (!isIndependentReset && allIdx >= 0 && allIdx < allSorted.length - 1) {
          const nextStart = allSorted[allIdx + 1].startFrame;
          const evEnd = eventEndFrame(ev);
          if (nextStart < evEnd) {
            const visualDur = nextStart - ev.startFrame;
            if (visualDur >= 0 && !clampWouldHideFrame(ev.name, visualDur)) {
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
      ? events.filter(ev => ev.ownerEntityId === col.ownerEntityId && !col.matchAllExcept!.has(ev.columnId))
      : (() => {
        const ms = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
        return events.filter(ev => ev.ownerEntityId === col.ownerEntityId &&
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
        ev.ownerEntityId === windowEv.ownerEntityId &&
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
 * For reaction events, appends the roman numeral level (e.g. "Combustion II").
 */
const ROMAN = ['I', 'II', 'III', 'IV'] as const;

export function resolveEventLabel(ev: TimelineEvent): string {
  if (ev.isPerfectDodge) return 'Dodge';
  const base = getAllSkillLabels()[ev.name as string]
    ?? getAllInflictionLabels()[ev.name]
    ?? getAllStatusLabels()[ev.name]
    ?? translateDslToken(ev.name);
  if (REACTION_COLUMN_IDS.has(ev.columnId)) {
    const level = ev.statusLevel ?? 1;
    return `${base} ${ROMAN[level - 1] ?? level}`;
  }
  return formatEventLabel(base, ev.name, getStatusById(ev.name)?.eventCategoryType);
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
 * Resolves the color for an event from its own segment data.
 * Priority: dominant element across segments → slot's operator element → default.
 */
export function resolveEventColor(
  ev: TimelineEvent,
  slotElementColors: Record<string, string>,
): string {
  const dominant = getDominantSegmentElement(ev);
  if (dominant) {
    const elColor = ELEMENT_COLORS[dominant as ElementType];
    if (elColor) return elColor;
  }
  return slotElementColors[ev.ownerEntityId] ?? DEFAULT_EVENT_COLOR;
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
  const isUserPlaced = ev.creationInteractionMode != null;

  const statusOverride = statusViewOverrides?.get(ev.uid);
  const label = isWindow
    ? (events && isWindowConsumed(ev, events) ? '' : 'COMBO ACTIVATION WINDOW')
    : (statusOverride?.label ?? resolveEventLabel(ev));
  const color = resolveEventColor(ev, slotElementColors);

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
  const notDraggable = isWindow || !isUserPlaced;
  const derived = !isUserPlaced && interactionMode === InteractionModeType.STRICT;
  const isAutoFinisher = autoFinisherIds.has(ev.uid);

  // Segment labels from the skill definition (for segment name display).
  // The event's own segments carry frame data; the skill def carries names.
  const srcEntity = ev.sourceEntityId ?? '';
  const skillDef = ev.sourceSkillId
    ? (getOperatorSkill(srcEntity, ev.sourceSkillId)
      ?? getOperatorSkill(srcEntity, ev.id))
    : null;
  const defSegs = skillDef?.segments as EventSegmentData[] | undefined;
  const allSegmentLabels = defSegs?.map((s) => s.properties.name!);
  const allDefaultSegments = defSegs;

  // Fallback element for frame diamond coloring when the frame doesn't
  // declare its own — the operator's element via slotElementColors.
  const skillElement = slotElementColors[ev.ownerEntityId]
    ? getDominantSegmentElement(ev) ?? undefined
    : undefined;

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
  if (col.matchAllExcept) return events.filter(ev => ev.ownerEntityId === col.ownerEntityId && !col.matchAllExcept!.has(ev.columnId));
  if (col.matchColumnIds) {
    const matchSet = new Set(col.matchColumnIds);
    return events.filter(
      (ev) => ev.ownerEntityId === col.ownerEntityId && matchSet.has(ev.columnId),
    );
  }
  if (col.microColumns && col.microColumnAssignment === 'by-column-id') {
    const mcIds = new Set(col.microColumns.map((mc) => mc.id));
    return events.filter(
      (ev) => ev.ownerEntityId === col.ownerEntityId && mcIds.has(ev.columnId),
    );
  }
  return events.filter(
    (ev) => ev.ownerEntityId === col.ownerEntityId && ev.columnId === col.columnId,
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
      if (!key.startsWith(`${col.ownerEntityId}\0`)) return;
      const colId = key.slice(col.ownerEntityId.length + 1);
      if (!col.matchAllExcept!.has(colId)) result.push(...arr);
    });
    return result;
  }
  if (col.matchColumnIds) {
    const result: TimelineEvent[] = [];
    for (const cid of col.matchColumnIds) {
      const arr = grouped.get(`${col.ownerEntityId}\0${cid}`);
      if (arr) result.push(...arr);
    }
    return result;
  }
  if (col.microColumns && col.microColumnAssignment === 'by-column-id') {
    const result: TimelineEvent[] = [];
    for (const mc of col.microColumns) {
      const arr = grouped.get(`${col.ownerEntityId}\0${mc.id}`);
      if (arr) result.push(...arr);
    }
    return result;
  }
  return grouped.get(`${col.ownerEntityId}\0${col.columnId}`) ?? [];
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
      if (clampWouldHideFrame(cur.name, clampedTotal)) continue;
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

    // Visual end frame: use visualActivationDuration when present so visually-
    // truncated status events (e.g. stacking statuses tiled sequentially) don't
    // block greedy expansion for time ranges where they're not rendered.
    const visualEndFrame = (ev: TimelineEvent) => {
      const override = statusOverrides.get(ev.uid);
      return override?.visualActivationDuration != null
        ? ev.startFrame + override.visualActivationDuration
        : eventEndFrame(ev);
    };

    // typeKey resolution: events whose columnId matches a declared micro-column
    // normally share a slot via the columnId typeKey (lets stacking statuses like
    // Focus or Link tile in one visual column). But statuses with interior segment
    // frames (Waterspout's 1s/2s/3s damage ticks) can't be visually clamped without
    // hiding frames — so each instance needs its own slot. Fall back to uid in
    // that case; the label/visualActivationDuration logic already treats these
    // events as independent.
    const typeKeyOf = (ev: TimelineEvent) =>
      (mcIdSet.has(ev.columnId) && !hasInteriorSegmentFrames(ev.name)) ? ev.columnId : ev.uid;

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
        slots[preSlot].push({ type: typeKey, start: ev.startFrame, end: visualEndFrame(ev) });
      }
    }

    // eventUid → assigned slot index
    const eventSlots = new Map<string, number>();

    for (const ev of sorted) {
      const evStart = ev.startFrame;
      const evEnd = visualEndFrame(ev);
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

    // Greedy width expansion: each event expands into adjacent slots whose
    // time ranges don't overlap the event's, so events are as wide as they
    // can fit for visual clarity. Uses strict half-open interval overlap —
    // two events that are temporally adjacent (A ends at frame X, B starts
    // at frame X) don't block each other since they never coexist.
    const slotCount = Math.max(slots.length, 1);
    const slotFrac = 1 / slotCount;

    // Expansion-aware occupancy: each slot tracks both its originally-assigned
    // events AND ranges claimed by other events that have already expanded into
    // it. This prevents two events from expanding into the same slot region and
    // visually overlapping.
    const expandedRanges: { start: number; end: number }[][] = slots.map(
      (rs) => rs.map((r) => ({ start: r.start, end: r.end })),
    );
    const slotOccupiedDuring = (s: number, start: number, end: number) => {
      for (const r of expandedRanges[s]) {
        if (r.start < end && r.end > start) return true;
      }
      return false;
    };

    for (const ev of sorted) {
      const s = eventSlots.get(ev.uid) ?? 0;
      const evStart = ev.startFrame;
      const evEnd = visualEndFrame(ev);

      // Expand left into contiguous empty slots (respecting visual buffer).
      let leftBound = s;
      while (leftBound > 0 && !slotOccupiedDuring(leftBound - 1, evStart, evEnd)) {
        leftBound--;
      }
      // Expand right into contiguous empty slots.
      let rightBound = s;
      while (rightBound < slotCount - 1 && !slotOccupiedDuring(rightBound + 1, evStart, evEnd)) {
        rightBound++;
      }

      // Reserve the expanded range in every newly-claimed neighbor slot so
      // subsequent events see this expansion when checking overlap.
      for (let cs = leftBound; cs <= rightBound; cs++) {
        if (cs === s) continue;
        expandedRanges[cs].push({ start: evStart, end: evEnd });
      }

      positions.set(ev.uid, {
        leftFrac: leftBound * slotFrac,
        widthFrac: (rightBound - leftBound + 1) * slotFrac,
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
/**
 * For events on arts-infliction columns, split each bar's single segment
 * into multiple segments at every frame where the column's cumulative active
 * stack count changes (another heat added, or any heat consumed). Each
 * segment's `name` becomes `"${baseName} ${stackLabel(count)}"` so the
 * canvas renderer (which shows per-segment names for multi-segment
 * non-BATK events) displays the evolving stack count across the bar.
 *
 * Why view-layer: the underlying event duration and start frame are
 * preserved; only the visual representation gets split into time-sliced
 * labeled sub-bars. This lets users see "Heat I → Heat II → Heat I" as
 * stacks grow and shrink over time without mutating engine state.
 */
function applyInflictionStackSplits(events: TimelineEvent[]): TimelineEvent[] {
  // Group by (ownerEntityId, columnId); only process infliction columns.
  const groups = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (!INFLICTION_COLUMN_IDS.has(ev.columnId)) continue;
    const key = `${ev.ownerEntityId}\0${ev.columnId}`;
    const arr = groups.get(key);
    if (arr) arr.push(ev);
    else groups.set(key, [ev]);
  }
  if (groups.size === 0) return events;

  const replacements = new Map<string, TimelineEvent>();
  groups.forEach((group, key) => {
    const columnId = key.slice(key.indexOf('\0') + 1);
    const baseName = getAllInflictionLabels()[columnId] ?? resolveEventLabel(group[0]);
    splitInflictionStackSegments(group, baseName, replacements);
  });

  if (replacements.size === 0) return events;
  return events.map((ev) => replacements.get(ev.uid) ?? ev);
}

/**
 * Build a transition timeline from the group's events (each event contributes
 * +1 at its startFrame and -1 at its current endFrame) and split each event
 * into segments aligned to those transitions.
 */
function splitInflictionStackSegments(
  group: TimelineEvent[],
  baseName: string,
  out: Map<string, TimelineEvent>,
) {
  // Transitions: sort by frame; when frames tie, process ends before starts
  // so that "heat ends at F AND heat starts at F" correctly yields the same
  // count (consumed heat has already left when the new one arrives).
  interface Transition { frame: number; delta: number }
  const transitions: Transition[] = [];
  for (const ev of group) {
    const end = eventEndFrame(ev);
    if (end <= ev.startFrame) continue;
    transitions.push({ frame: ev.startFrame, delta: +1 });
    transitions.push({ frame: end, delta: -1 });
  }
  transitions.sort((a, b) => a.frame - b.frame || a.delta - b.delta);

  // Precompute cumulative count at each transition point (count AFTER the
  // transition's delta is applied). We walk transitions once and record,
  // for each unique frame, the count after processing all deltas at that frame.
  // frameCountAfter[i] = count from transitions[i].frame up until the next transition frame.
  const countAfter: number[] = new Array(transitions.length);
  {
    let c = 0;
    for (let i = 0; i < transitions.length; i++) {
      c += transitions[i].delta;
      countAfter[i] = c;
    }
  }

  // For each event, slice transitions overlapping [evStart, evEnd) and build
  // segments. Only emit splits when there's actually more than one value.
  for (const ev of group) {
    const evStart = ev.startFrame;
    const evEnd = eventEndFrame(ev);
    if (evEnd <= evStart) continue;
    // Must be a single-segment event (all infliction events from the engine
    // are; anything else is already a view-layer derivation we shouldn't touch).
    if (ev.segments.length !== 1) continue;

    // Walk transitions to find split frames within (evStart, evEnd). The count
    // at evStart is `countAfter` of the LAST transition whose frame <= evStart.
    type SegSpec = { from: number; to: number; count: number };
    const segs: SegSpec[] = [];
    let cursor = evStart;
    let curCount = 0;
    // Find count at evStart by scanning transitions up to evStart (inclusive).
    // Transitions at evStart with delta=+1 include this event itself.
    for (let i = 0; i < transitions.length; i++) {
      if (transitions[i].frame > evStart) break;
      curCount = countAfter[i];
    }

    // Collect split frames strictly within (evStart, evEnd).
    // Group transitions by frame so the count is read AFTER all deltas at that frame are applied.
    let i = 0;
    while (i < transitions.length) {
      const f = transitions[i].frame;
      // advance past transitions at the same frame
      let j = i;
      while (j < transitions.length && transitions[j].frame === f) j++;
      const countAtThisFrame = countAfter[j - 1];
      i = j;
      if (f <= evStart) continue;
      if (f >= evEnd) break;
      // Emit segment [cursor, f) with curCount, then update
      segs.push({ from: cursor, to: f, count: curCount });
      cursor = f;
      curCount = countAtThisFrame;
    }
    // Final segment: [cursor, evEnd) with curCount
    segs.push({ from: cursor, to: evEnd, count: curCount });

    // If all segments have the same count, no split needed — keep the event as-is.
    const uniqueCounts = new Set(segs.map(s => s.count));
    if (uniqueCounts.size <= 1) continue;

    // Build new segments preserving the original segment's other properties
    // (metadata, dataSources, etc.) — clone each from the original.
    const originalSeg = ev.segments[0];
    const newSegments: EventSegmentData[] = segs
      .filter(s => s.to > s.from)
      .map(s => ({
        ...originalSeg,
        properties: {
          ...originalSeg.properties,
          duration: s.to - s.from,
          name: `${baseName} ${stackLabel(Math.max(1, s.count))}`,
        },
      }));

    out.set(ev.uid, { ...ev, segments: newSegments });
  }
}

export function computeTimelinePresentation(
  events: TimelineEvent[],
  columns: Column[],
): Map<string, ColumnViewModel> {
  const result = new Map<string, ColumnViewModel>();

  // Replace infliction events with stack-timeline-split clones so each bar
  // renders multiple labeled sub-segments reflecting the cumulative active
  // stack count over time. See splitInflictionStackSegments.
  events = applyInflictionStackSplits(events);

  const eventsByOwnerColumn = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const key = `${ev.ownerEntityId}\0${ev.columnId}`;
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
