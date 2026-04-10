import { TimelineEvent } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import { comboWindowEndFrame } from './processComboSkill';
import { COMBO_WINDOW_COLUMN_ID } from '../../model/channels';

/**
 * Controller for combo skill event validation.
 *
 * Combo events must have their startFrame within a combo activation window event:
 *   startFrame >= window.startFrame && startFrame < windowEndFrame
 */
export class ComboSkillEventController {
  static isCombo(event: TimelineEvent): boolean {
    return event.columnId === NounType.COMBO;
  }

  /** Get combo activation window events for a given ownerEntityId from processed events. */
  private static getWindows(ownerEntityId: string, processedEvents: TimelineEvent[]): TimelineEvent[] {
    return processedEvents.filter(
      (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerEntityId === ownerEntityId,
    );
  }

  /**
   * Find the combo activation window containing `frame` for a given owner.
   * Returns the window event or undefined if none matches.
   */
  static findWindowAt(
    ownerEntityId: string,
    frame: number,
    processedEvents: TimelineEvent[],
  ): TimelineEvent | undefined {
    const windows = this.getWindows(ownerEntityId, processedEvents);
    for (const w of windows) {
      const endFrame = comboWindowEndFrame(w);
      if (frame >= w.startFrame && frame < endFrame) return w;
    }
    return undefined;
  }

  /** Clamp a frame to stay within a specific combo activation window. */
  static clampToWindow(frame: number, window: TimelineEvent): number {
    const wEnd = comboWindowEndFrame(window);
    return Math.max(window.startFrame, Math.min(wEnd - 1, frame));
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

    const windows = this.getWindows(target.ownerEntityId, processedEvents);
    if (windows.length === 0) return newStartFrame;

    // If already inside a window, allow it
    for (const w of windows) {
      const endFrame = comboWindowEndFrame(w);
      if (newStartFrame >= w.startFrame && newStartFrame < endFrame) {
        return newStartFrame;
      }
    }

    // Outside all windows — clamp to nearest window boundary
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
   * Resolve the comboTriggerColumnId for a combo event at a given frame.
   * Returns the trigger column from the matching activation window, or the
   * event's existing value if no window is found or not a combo event.
   */
  static resolveComboTriggerColumnId(
    target: TimelineEvent,
    atFrame: number,
    processedEvents: TimelineEvent[] | null,
  ): string | undefined {
    if (!this.isCombo(target) || !processedEvents) return target.comboTriggerColumnId;
    const window = this.findWindowAt(target.ownerEntityId, atFrame, processedEvents);
    return window?.comboTriggerColumnId ?? target.comboTriggerColumnId;
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
    const clampedFrame = this.validateMove(target, updates.startFrame, processedEvents);
    const triggerCol = this.resolveComboTriggerColumnId(target, clampedFrame, processedEvents);
    return {
      ...updates,
      startFrame: clampedFrame,
      ...(triggerCol !== undefined ? { comboTriggerColumnId: triggerCol } : {}),
    };
  }
}
