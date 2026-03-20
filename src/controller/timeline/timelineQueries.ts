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
 * Optionally filter by ownerId.
 */
export function activeEventsAtFrame(
  events: readonly TimelineEvent[],
  columnId: string,
  ownerId: string | undefined,
  frame: number,
) {
  return events.filter(ev =>
    ev.columnId === columnId &&
    (ownerId == null || ev.ownerId === ownerId) &&
    isActiveAtFrame(ev, frame)
  );
}

/**
 * Count active events in a specific column at a given frame.
 */
export function activeCountAtFrame(
  events: readonly TimelineEvent[],
  columnId: string,
  ownerId: string | undefined,
  frame: number,
) {
  return activeEventsAtFrame(events, columnId, ownerId, frame).length;
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
    ev.ownerId === 'enemy' &&
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
  ownerId: string,
  frame: number,
) {
  return events.filter(ev =>
    ev.columnId === statusColumnId &&
    ev.ownerId === ownerId &&
    ev.eventStatus !== EventStatusType.CONSUMED &&
    isActiveAtFrame(ev, frame)
  );
}
