import { TimelineEvent } from '../../consts/viewTypes';
import { COMBO_WINDOW_COLUMN_ID, comboWindowEndFrame } from './processInteractions';

/**
 * Controller for combo skill event validation.
 *
 * Combo events must have their startFrame within a combo activation window event:
 *   startFrame >= window.startFrame && startFrame < windowEndFrame
 */
export class ComboSkillEventController {
  static isCombo(event: TimelineEvent): boolean {
    return event.columnId === 'combo';
  }

  /** Get combo activation window events for a given ownerId from processed events. */
  private static getWindows(ownerId: string, processedEvents: TimelineEvent[]): TimelineEvent[] {
    return processedEvents.filter(
      (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === ownerId,
    );
  }

  /**
   * Validate a move for a combo event. Clamps startFrame to the nearest
   * activation window boundary if the new position falls outside all windows.
   * Returns the original newStartFrame if valid, or the clamped value.
   * Non-combo events pass through unchanged.
   */
  static validateMove(
    target: TimelineEvent,
    newStartFrame: number,
    processedEvents: TimelineEvent[] | null,
  ): number {
    if (!this.isCombo(target) || !processedEvents) return newStartFrame;

    const windows = this.getWindows(target.ownerId, processedEvents);
    if (windows.length === 0) return newStartFrame;

    // If already inside a window, allow it
    for (const w of windows) {
      const endFrame = comboWindowEndFrame(w);
      if (newStartFrame >= w.startFrame && newStartFrame < endFrame) {
        return newStartFrame;
      }
    }

    // Clamp to nearest window boundary
    let closest = newStartFrame;
    let minDist = Infinity;
    for (const w of windows) {
      const endFrame = comboWindowEndFrame(w);
      const clamped = Math.max(w.startFrame, Math.min(endFrame - 1, newStartFrame));
      const dist = Math.abs(clamped - newStartFrame);
      if (dist < minDist) {
        minDist = dist;
        closest = clamped;
      }
    }
    return closest;
  }

  /**
   * Validate an update to a combo event's startFrame.
   * Delegates to validateMove for the startFrame field.
   */
  static validateUpdate(
    target: TimelineEvent,
    updates: Partial<TimelineEvent>,
    processedEvents: TimelineEvent[] | null,
  ): Partial<TimelineEvent> {
    if (updates.startFrame === undefined || !this.isCombo(target)) return updates;
    return {
      ...updates,
      startFrame: this.validateMove(target, updates.startFrame, processedEvents),
    };
  }
}
