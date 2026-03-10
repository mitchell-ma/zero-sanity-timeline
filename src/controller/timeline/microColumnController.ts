import { TimelineEvent, Column, MiniTimeline, MicroColumn } from '../../consts/viewTypes';

/**
 * Controller for micro-column slot assignment and dynamic-split positioning.
 * Extracts layout computation logic from the view layer.
 */
export class MicroColumnController {
  /**
   * Greedy bin-packing slot assignment for reuseExpiredSlots columns.
   * Maps eventId → assigned micro-column index.
   */
  static greedySlotAssignments(
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

      const slotEndFrames = new Array(microCount).fill(-1);
      for (const ev of sorted) {
        const endFrame = ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
        let assigned = -1;
        for (let s = 0; s < microCount; s++) {
          if (slotEndFrames[s] <= ev.startFrame) {
            assigned = s;
            slotEndFrames[s] = endFrame;
            break;
          }
        }
        if (assigned < 0) assigned = microCount - 1;
        assignments.set(ev.id, assigned);
      }
    }
    return assignments;
  }

  /**
   * Compute dynamic-split overlap info for an event: returns the number of
   * overlapping distinct types and this event's index in the stable ordering.
   */
  static dynamicSplitPosition(
    ev: TimelineEvent,
    colEvents: TimelineEvent[],
    _typeOrder: Map<string, number>,
  ): { count: number; index: number } {
    const evEnd = ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;

    // Collect all overlapping events (including self)
    const overlapping: TimelineEvent[] = [ev];
    for (const other of colEvents) {
      if (other.id === ev.id) continue;
      const otherEnd = other.startFrame + other.activationDuration + other.activeDuration + other.cooldownDuration;
      if (other.startFrame < evEnd && otherEnd > ev.startFrame) {
        overlapping.push(other);
      }
    }

    // Sort by startFrame (earlier events on the left), break ties by id for stability
    overlapping.sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));

    return {
      count: overlapping.length,
      index: overlapping.findIndex((o) => o.id === ev.id),
    };
  }

  /**
   * Compute monotonic drag bounds for events in requiresMonotonicOrder columns.
   * Returns a map of eventId → { min, max } startFrame bounds.
   */
  static computeMonotonicBounds(
    draggedIds: string[],
    events: TimelineEvent[],
    columns: Column[],
    totalFrames: number,
  ): Map<string, { min: number; max: number }> {
    const bounds = new Map<string, { min: number; max: number }>();
    const draggedSet = new Set(draggedIds);
    const monotonicCols = columns.filter(
      (c): c is MiniTimeline => c.type === 'mini-timeline' && !!c.requiresMonotonicOrder,
    );
    for (const eid of draggedIds) {
      const ev = events.find((e) => e.id === eid);
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
      const idx = allInCol.findIndex((e) => e.id === eid);
      if (idx < 0) continue;
      const orig = ev.startFrame;
      let min = 0;
      let max = totalFrames - 1;
      for (let i = idx - 1; i >= 0; i--) {
        if (draggedSet.has(allInCol[i].id)) continue;
        // Skip co-located siblings — equal values satisfy monotonic constraint
        if (allInCol[i].startFrame === orig) continue;
        min = allInCol[i].startFrame;
        break;
      }
      for (let i = idx + 1; i < allInCol.length; i++) {
        if (draggedSet.has(allInCol[i].id)) continue;
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
  static isColumnFull(
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
          ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration > atFrame,
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
  static isBeforeLastEvent(
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
}
