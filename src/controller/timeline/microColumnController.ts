import { TimelineEvent, Column, MiniTimeline, eventEndFrame } from '../../consts/viewTypes';
import { ColumnType } from '../../consts/enums';

/**
 * Input validation functions for micro-column columns.
 * Layout/positioning logic has been consolidated into eventPresentationController.ts.
 */

/**
 * Compute monotonic drag bounds for events in requiresMonotonicOrder columns.
 * Returns a map of eventUid → { min, max } startFrame bounds.
 */
export function computeMonotonicBounds(
  draggedIds: string[],
  events: TimelineEvent[],
  columns: Column[],
  totalFrames: number,
): Map<string, { min: number; max: number }> {
  const bounds = new Map<string, { min: number; max: number }>();
  const draggedSet = new Set(draggedIds);
  const monotonicCols = columns.filter(
    (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE && !!c.requiresMonotonicOrder,
  );
  for (const eid of draggedIds) {
    const ev = events.find((e) => e.uid === eid);
    if (!ev) continue;
    const col = monotonicCols.find((c) => {
      if (c.ownerId !== ev.ownerId) return false;
      if (c.matchColumnIds) return c.matchColumnIds.includes(ev.columnId);
      return c.columnId === ev.columnId;
    });
    if (!col) continue;
    const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
    const allInCol = events.filter((e) =>
      e.ownerId === col.ownerId &&
      (matchSet ? matchSet.has(e.columnId) : e.columnId === col.columnId),
    );
    const idx = allInCol.findIndex((e) => e.uid === eid);
    if (idx < 0) continue;
    const orig = ev.startFrame;
    let min = 0;
    let max = totalFrames - 1;
    for (let i = idx - 1; i >= 0; i--) {
      if (draggedSet.has(allInCol[i].uid)) continue;
      if (allInCol[i].startFrame === orig) continue;
      min = allInCol[i].startFrame;
      break;
    }
    for (let i = idx + 1; i < allInCol.length; i++) {
      if (draggedSet.has(allInCol[i].uid)) continue;
      if (allInCol[i].startFrame === orig) continue;
      max = allInCol[i].startFrame;
      break;
    }
    bounds.set(eid, { min, max });
  }
  return bounds;
}

/**
 * Check if a by-order column is full at a given frame.
 * For reuseExpiredSlots columns, checks active events at the frame.
 * Otherwise checks total events against maxEvents.
 */
export function isColumnFull(
  col: MiniTimeline,
  events: TimelineEvent[],
  atFrame: number,
): boolean {
  const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
  if (col.reuseExpiredSlots && col.microColumns) {
    const activeAtFrame = events.filter(
      (ev) => ev.ownerId === col.ownerId &&
        (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId) &&
        ev.startFrame <= atFrame &&
        eventEndFrame(ev) > atFrame,
    );
    return activeAtFrame.length >= col.microColumns.length;
  }
  const existing = events.filter(
    (ev) => ev.ownerId === col.ownerId &&
      (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
  );
  return col.maxEvents != null && existing.length >= col.maxEvents;
}

/**
 * Check if adding an event at atFrame would violate monotonic ordering.
 */
export function isBeforeLastEvent(
  col: MiniTimeline,
  events: TimelineEvent[],
  atFrame: number,
): boolean {
  if (!col.requiresMonotonicOrder) return false;
  const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
  const existing = events.filter(
    (ev) => ev.ownerId === col.ownerId &&
      (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
  );
  if (existing.length === 0) return false;
  return atFrame < existing[existing.length - 1].startFrame;
}
