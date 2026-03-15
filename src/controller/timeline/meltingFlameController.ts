import { TimelineEvent, Column, MiniTimeline } from '../../consts/viewTypes';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { MicroColumnController } from './microColumnController';

const MF_COLUMN_ID = 'melting-flame';

/**
 * Melting Flame micro-column controller. Extends MicroColumnController with
 * MF-specific monotonic ordering constraints.
 *
 * Same pattern as arts infliction subtimeline — reuseExpiredSlots + by-order
 * micro-columns. Consumed-event slot freeing is handled by the base class.
 */
export class MeltingFlameController extends MicroColumnController {
  /**
   * Returns whether the given event belongs to a melting flame column.
   */
  static isMeltingFlame(event: TimelineEvent): boolean {
    return event.columnId === MF_COLUMN_ID;
  }

  /**
   * Returns whether the given column definition is a melting flame column.
   */
  static isMeltingFlameColumn(col: Column | MiniTimeline): boolean {
    if (col.type !== 'mini-timeline') return false;
    return col.columnId === MF_COLUMN_ID
      || (!!col.matchColumnIds && col.matchColumnIds.includes(MF_COLUMN_ID));
  }

  // ── Monotonic ordering constraints ────────────────────────────────────────

  /**
   * Compute the valid startFrame range for a given MF event based on its
   * siblings in the same owner+column. Uses stable array position (insertion
   * order) to determine prev/next, avoiding deadlocks when events share a frame.
   */
  static getBounds(
    allEvents: TimelineEvent[],
    target: TimelineEvent,
  ): { min: number; max: number } {
    const colEvents = allEvents.filter(
      (e) => e.ownerId === target.ownerId &&
        e.columnId === target.columnId,
    );
    const targetIdx = colEvents.findIndex((e) => e.id === target.id);
    if (targetIdx < 0) return { min: 0, max: TOTAL_FRAMES - 1 };

    let min = 0;
    for (let i = targetIdx - 1; i >= 0; i--) {
      if (colEvents[i].startFrame < target.startFrame) {
        min = colEvents[i].startFrame;
        break;
      }
    }
    let max = TOTAL_FRAMES - 1;
    for (let i = targetIdx + 1; i < colEvents.length; i++) {
      if (colEvents[i].startFrame > target.startFrame) {
        max = colEvents[i].startFrame;
        break;
      }
    }

    return { min, max };
  }

  /**
   * Validate an update to an MF event. Clamps startFrame to maintain
   * monotonic ordering and durations to non-negative.
   */
  static validateUpdate(
    allEvents: TimelineEvent[],
    target: TimelineEvent,
    updates: Partial<TimelineEvent>,
  ): Partial<TimelineEvent> {
    const validated = { ...updates };

    if (validated.activationDuration !== undefined)
      validated.activationDuration = Math.max(0, validated.activationDuration);
    if (validated.activeDuration !== undefined)
      validated.activeDuration = Math.max(0, validated.activeDuration);
    if (validated.cooldownDuration !== undefined)
      validated.cooldownDuration = Math.max(0, validated.cooldownDuration);

    if (validated.startFrame !== undefined && this.isMeltingFlame(target)) {
      const bounds = this.getBounds(allEvents, target);
      validated.startFrame = Math.max(bounds.min, Math.min(bounds.max, validated.startFrame));
    }

    return validated;
  }

  /**
   * Validate a move (startFrame change) for an event. Clamps MF events to
   * maintain monotonic ordering. Non-MF events are clamped to [0, TOTAL_FRAMES-1].
   */
  static validateMove(
    allEvents: TimelineEvent[],
    target: TimelineEvent,
    newStartFrame: number,
  ): number {
    if (this.isMeltingFlame(target)) {
      const bounds = this.getBounds(allEvents, target);
      return Math.max(bounds.min, Math.min(bounds.max, newStartFrame));
    }
    return Math.max(0, Math.min(TOTAL_FRAMES - 1, newStartFrame));
  }
}
