import { TimelineEvent, Column, MiniTimeline, eventEndFrame } from '../../consts/viewTypes';
import { EventStatusType } from '../../consts/enums';

/**
 * Base controller for micro-column slot assignment and dynamic-split positioning.
 * Domain-specific controllers (e.g. MeltingFlameController) extend this class.
 *
 * Consumed events are excluded from active slot counting — once consumed
 * (by absorption, reaction, etc.), the event no longer occupies a slot.
 */
export class MicroColumnController {
  /**
   * Slot assignment for reuseExpiredSlots columns.
   * Maps eventId → assigned micro-column index.
   * Consumed events are excluded from active count.
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
      for (const ev of sorted) {
        let activeCount = 0;
        for (const other of sorted) {
          if (other.id === ev.id) continue;
          if (other.eventStatus === EventStatusType.CONSUMED) continue;
          const otherEnd = eventEndFrame(other);
          if (other.startFrame <= ev.startFrame && otherEnd > ev.startFrame) {
            activeCount++;
          }
        }
        assignments.set(ev.id, Math.min(activeCount, microCount - 1));
      }
    }
    return assignments;
  }

  /**
   * Compute dynamic-split overlap info for an event: returns the number of
   * overlapping distinct types and this event's type-group index in the stable ordering.
   *
   * Same-type events (same columnId) share a single slot — only events of
   * different types split into separate sub-columns.
   */
  static dynamicSplitPosition(
    ev: TimelineEvent,
    colEvents: TimelineEvent[],
    _typeOrder: Map<string, number>,
  ): { count: number; index: number } {
    const evEnd = eventEndFrame(ev);

    // Collect distinct types that overlap with this event
    const overlappingTypes = new Set<string>([ev.columnId]);
    for (const other of colEvents) {
      if (other.id === ev.id) continue;
      const otherEnd = eventEndFrame(other);
      if (other.startFrame < evEnd && otherEnd > ev.startFrame) {
        overlappingTypes.add(other.columnId);
      }
    }

    // Sort types by their order in the type order map for stable positioning
    const sortedTypes = Array.from(overlappingTypes).sort((a, b) => {
      const oa = _typeOrder.get(a) ?? 999;
      const ob = _typeOrder.get(b) ?? 999;
      return oa - ob || a.localeCompare(b);
    });

    return {
      count: sortedTypes.length,
      index: sortedTypes.indexOf(ev.columnId),
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

  /**
   * Compute pixel positions for all events in micro-column layouts.
   * Returns a map of eventId → { left, right, color } in absolute pixels.
   */
  static computeMicroColumnPixelPositions(
    events: TimelineEvent[],
    columns: Column[],
    columnPositions: Map<string, { left: number; right: number }>,
    greedySlots: Map<string, number>,
  ): Map<string, { left: number; right: number; color: string }> {
    const positions = new Map<string, { left: number; right: number; color: string }>();
    for (const col of columns) {
      if (col.type !== 'mini-timeline' || !col.microColumns) continue;
      const colPos = columnPositions.get(col.key);
      if (!colPos) continue;
      const colWidth = colPos.right - colPos.left;
      const microCount = col.microColumns.length;
      const microW = colWidth / microCount;

      if (col.microColumnAssignment === 'by-order') {
        const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
        const colEvents = events.filter(
          (ev) => ev.ownerId === col.ownerId &&
            (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
        ).sort((a, b) => a.startFrame - b.startFrame);
        colEvents.forEach((ev, i) => {
          const microIdx = greedySlots.get(ev.id) ?? Math.min(i, microCount - 1);
          const mcMatch = matchSet
            ? col.microColumns!.find((mc) => mc.id === ev.columnId)
            : undefined;
          positions.set(ev.id, {
            left: colPos.left + microIdx * microW,
            right: colPos.left + (microIdx + 1) * microW,
            color: mcMatch?.color ?? col.microColumns![microIdx].color,
          });
        });
      } else if (col.microColumnAssignment === 'dynamic-split') {
        const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
        const colEvents = events.filter(
          (ev) => ev.ownerId === col.ownerId &&
            (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
        );

        const typeOrder = new Map<string, number>();
        col.microColumns!.forEach((mc, idx) => typeOrder.set(mc.id, idx));
        const mcById = new Map(col.microColumns!.map((mc) => [mc.id, mc]));

        // Collect all active types and assign stable indices by type order
        const activeTypes = new Set<string>();
        for (const ev of colEvents) activeTypes.add(ev.columnId);
        const sortedTypes = Array.from(activeTypes).sort((a, b) => {
          const oa = typeOrder.get(a) ?? 999;
          const ob = typeOrder.get(b) ?? 999;
          return oa - ob || a.localeCompare(b);
        });
        // Compute per-type widths, respecting maxWidth constraints
        const typeWidths: number[] = [];
        let cappedTotal = 0;
        let uncappedCount = 0;
        for (const t of sortedTypes) {
          const mc = mcById.get(t);
          if (mc?.maxWidth != null) {
            cappedTotal += mc.maxWidth;
            typeWidths.push(mc.maxWidth);
          } else {
            uncappedCount++;
            typeWidths.push(0); // placeholder
          }
        }
        const remainingWidth = Math.max(0, colWidth - cappedTotal);
        const uncappedW = uncappedCount > 0 ? remainingWidth / uncappedCount : 0;
        for (let i = 0; i < typeWidths.length; i++) {
          if (typeWidths[i] === 0) typeWidths[i] = uncappedW;
        }

        // Build cumulative left offsets
        const typeLefts: number[] = [];
        let cumLeft = 0;
        for (const w of typeWidths) {
          typeLefts.push(cumLeft);
          cumLeft += w;
        }

        const typeIndex = new Map<string, number>();
        sortedTypes.forEach((t, i) => typeIndex.set(t, i));

        for (const ev of colEvents) {
          const idx = typeIndex.get(ev.columnId) ?? 0;
          positions.set(ev.id, {
            left: colPos.left + typeLefts[idx],
            right: colPos.left + typeLefts[idx] + typeWidths[idx],
            color: mcById.get(ev.columnId)?.color ?? col.color,
          });
        }
      } else {
        // by-column-id
        col.microColumns.forEach((mc, mcIdx) => {
          const mcEvents = events.filter(
            (ev) => ev.ownerId === col.ownerId && ev.columnId === mc.id,
          );
          mcEvents.forEach((ev) => {
            positions.set(ev.id, {
              left: colPos.left + mcIdx * microW,
              right: colPos.left + (mcIdx + 1) * microW,
              color: mc.color,
            });
          });
        });
      }
    }
    return positions;
  }
}
