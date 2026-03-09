import { TimelineEvent } from '../../consts/viewTypes';
import { ActivationWindow, WindowsMap } from '../combat-loadout';

/**
 * Controller for combo skill event validation.
 *
 * Combo events must have their startFrame within an activation window:
 *   startFrame >= window.startFrame && startFrame < window.endFrame
 */
export class ComboSkillEventController {
  static isCombo(event: TimelineEvent): boolean {
    return event.columnId === 'combo';
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
    activationWindows: WindowsMap | null,
  ): number {
    if (!this.isCombo(target) || !activationWindows) return newStartFrame;

    const windows = activationWindows.get(target.ownerId);
    if (!windows || windows.length === 0) return newStartFrame;

    // If already inside a window, allow it
    for (const w of windows) {
      if (newStartFrame >= w.startFrame && newStartFrame < w.endFrame) {
        return newStartFrame;
      }
    }

    // Clamp to nearest window boundary
    let closest = newStartFrame;
    let minDist = Infinity;
    for (const w of windows) {
      // Clamp to [startFrame, endFrame - 1]
      const clamped = Math.max(w.startFrame, Math.min(w.endFrame - 1, newStartFrame));
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
    activationWindows: WindowsMap | null,
  ): Partial<TimelineEvent> {
    if (updates.startFrame === undefined || !this.isCombo(target)) return updates;
    return {
      ...updates,
      startFrame: this.validateMove(target, updates.startFrame, activationWindows),
    };
  }
}
