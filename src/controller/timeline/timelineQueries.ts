/**
 * Shared timeline query functions.
 *
 * Pure helpers for querying timeline event state at a given frame.
 * Used by the condition evaluator and effect executor.
 */
import { TimelineEvent, eventEndFrame } from '../../consts/viewTypes';
import { EventStatusType } from '../../consts/enums';

/**
 * Check if an event is active at a given frame.
 * An event is active from startFrame (inclusive) to startFrame + eventDuration (exclusive).
 */
export function isActiveAtFrame(ev: TimelineEvent, frame: number) {
  return ev.startFrame <= frame && frame < eventEndFrame(ev);
}

/**
 * Get all active events in a specific column at a given frame.
 * Optionally filter by ownerEntityId.
 */
export function activeEventsAtFrame(
  events: readonly TimelineEvent[],
  columnId: string,
  ownerEntityId: string | undefined,
  frame: number,
) {
  return events.filter(ev =>
    ev.columnId === columnId &&
    (ownerEntityId == null || ev.ownerEntityId === ownerEntityId) &&
    isActiveAtFrame(ev, frame)
  );
}

/**
 * Count active events in a specific column at a given frame.
 */
export function activeCountAtFrame(
  events: readonly TimelineEvent[],
  columnId: string,
  ownerEntityId: string | undefined,
  frame: number,
) {
  return activeEventsAtFrame(events, columnId, ownerEntityId, frame).length;
}

/**
 * Sum the `stacks` of all active events on the given column + owner at a frame.
 * Single authority for "how many stacks of STATUS X does OWNER have at FRAME".
 * Events with no explicit `stacks` field count as 1 each.
 */
export function countActiveStatusStacks(
  events: readonly TimelineEvent[],
  frame: number,
  ownerEntityId: string,
  statusId: string,
): number {
  let n = 0;
  for (const ev of events) {
    if (ev.ownerEntityId !== ownerEntityId || ev.columnId !== statusId) continue;
    if (!isActiveAtFrame(ev, frame)) continue;
    n += ev.stacks ?? 1;
  }
  return n;
}

/**
 * Get active infliction events of a given element at a given frame.
 * Element is mapped to column ID externally.
 */
export function activeInflictionsOfElement(
  events: readonly TimelineEvent[],
  inflictionColumnId: string,
  frame: number,
) {
  return events.filter(ev =>
    ev.ownerEntityId === 'enemy' &&
    ev.columnId === inflictionColumnId &&
    ev.eventStatus !== EventStatusType.CONSUMED &&
    isActiveAtFrame(ev, frame)
  );
}

/**
 * Get active status events of a given type (by column ID) for a specific owner at a given frame.
 */
export function activeStatusesOfType(
  events: readonly TimelineEvent[],
  statusColumnId: string,
  ownerEntityId: string,
  frame: number,
) {
  return events.filter(ev =>
    ev.columnId === statusColumnId &&
    ev.ownerEntityId === ownerEntityId &&
    ev.eventStatus !== EventStatusType.CONSUMED &&
    isActiveAtFrame(ev, frame)
  );
}
