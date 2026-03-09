import { TimelineEvent } from '../../consts/viewTypes';
import { TOTAL_FRAMES } from '../../utils/timeline';

const MF_COLUMN_ID = 'melting-flame';

/**
 * Controller for Melting Flame subtimeline validation.
 *
 * Melting Flame stacks have a monotonic ordering constraint: each stack's
 * startFrame must be >= the previous stack's and <= the next stack's.
 * This controller enforces that constraint during updates and moves.
 */
export class MeltingFlameController {
  /**
   * Returns whether the given event belongs to a melting flame column.
   */
  static isMeltingFlame(event: TimelineEvent): boolean {
    return event.columnId === MF_COLUMN_ID;
  }

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

    // Skip co-located siblings (same startFrame) — equal values satisfy
    // the monotonic constraint, so they shouldn't block each other.
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
   *
   * For non-MF events, passes updates through with only duration clamping.
   */
  static validateUpdate(
    allEvents: TimelineEvent[],
    target: TimelineEvent,
    updates: Partial<TimelineEvent>,
  ): Partial<TimelineEvent> {
    const validated = { ...updates };

    // Clamp durations to non-negative (applies to all events)
    if (validated.activationDuration !== undefined)
      validated.activationDuration = Math.max(0, validated.activationDuration);
    if (validated.activeDuration !== undefined)
      validated.activeDuration = Math.max(0, validated.activeDuration);
    if (validated.cooldownDuration !== undefined)
      validated.cooldownDuration = Math.max(0, validated.cooldownDuration);

    // Monotonic ordering (MF only)
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
