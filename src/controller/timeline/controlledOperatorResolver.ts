/**
 * Controlled Operator Resolver — determines which operator the player controls
 * at each point in the timeline.
 *
 * Control is determined by:
 * 1. Explicit user-placed "take control" events on the controlled column
 * 2. Skill events that imply a swap (basic attacks, battle skills on a different operator)
 *
 * Only one operator can be controlled at a time. The first operator (slot-0) starts controlled.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { CombatSkillType } from '../../consts/enums';
import { SKILL_COLUMNS } from '../../model/channels';

/** Skill columns that imply the player is controlling the operator. */
const CONTROL_IMPLYING_COLUMNS = new Set<string>([
  SKILL_COLUMNS.BASIC,
  SKILL_COLUMNS.BATTLE,
]);

interface ControlSegment {
  slotId: string;
  startFrame: number;
}

/**
 * Resolve which operator is controlled at each frame.
 * Returns a query function for use by the DSL engine's CONTROLLED determiner.
 */
export function resolveControlledOperator(
  events: readonly TimelineEvent[],
  slotIds: readonly string[],
  initialSlotId?: string,
): (frame: number) => string {
  const defaultSlot = initialSlotId ?? slotIds[0] ?? '';

  // Collect control transfer points
  const transferPoints: { frame: number; slotId: string }[] = [];

  for (const ev of events) {
    if (ev.id === CombatSkillType.CONTROL) {
      transferPoints.push({ frame: ev.startFrame, slotId: ev.ownerId });
    } else if (CONTROL_IMPLYING_COLUMNS.has(ev.columnId)) {
      transferPoints.push({ frame: ev.startFrame, slotId: ev.ownerId });
    }
  }

  // Sort by frame (stable: earlier events first)
  transferPoints.sort((a, b) => a.frame - b.frame);

  // Build control segments — deduplicate consecutive same-slot transfers
  const segments: ControlSegment[] = [{ slotId: defaultSlot, startFrame: 0 }];
  for (const tp of transferPoints) {
    const last = segments[segments.length - 1];
    if (tp.slotId !== last.slotId) {
      segments.push({ slotId: tp.slotId, startFrame: tp.frame });
    }
  }

  // Query function: binary search for the segment containing the frame
  return (frame: number): string => {
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (segments[mid].startFrame <= frame) lo = mid;
      else hi = mid - 1;
    }
    return segments[lo].slotId;
  };
}
