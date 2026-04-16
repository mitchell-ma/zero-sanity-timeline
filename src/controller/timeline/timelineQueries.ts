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
 * Count the active stacks of a given status on the given column + owner at a frame.
 * Single authority for "how many stacks of STATUS X does OWNER have at FRAME".
 *
 * Two shapes of `ev.stacks` are in use:
 *  - Position marker (each event = 1 stack, e.g. inflictions): the last event's
 *    `stacks` field equals the running count, so using the last active event's
 *    value gives the total.
 *  - Accumulator (1 event = N stacks, e.g. NONE-stacking statuses applied with a
 *    bulk stacks value): a single event carries the full count.
 *
 * Matches `evaluateStacksSubject` in conditionEvaluator.ts.
 */
export function countActiveStatusStacks(
  events: readonly TimelineEvent[],
  frame: number,
  ownerEntityId: string,
  statusId: string,
): number {
  let lastActive: TimelineEvent | undefined;
  let activeCount = 0;
  for (const ev of events) {
    if (ev.ownerEntityId !== ownerEntityId || ev.columnId !== statusId) continue;
    if (!isActiveAtFrame(ev, frame)) continue;
    activeCount += 1;
    lastActive = ev;
  }
  if (lastActive == null) return 0;
  return lastActive.stacks ?? activeCount;
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
