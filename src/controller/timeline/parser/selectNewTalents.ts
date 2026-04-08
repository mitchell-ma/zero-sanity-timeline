/**
 * Phase 8 step 7c — talent selection extracted from runEventQueue.
 *
 * Pure selector: takes the trigger index's talent events and filters out
 * ones already present in the registered-events list (matched by
 * columnId + ownerId). The caller is still responsible for actually
 * registering the returned events — this is plumbing only, no behavior
 * change from the inline version in `eventQueueController.ts`.
 *
 * Future sub-steps (7e onward) will replace the caller's
 * `registerEvents(newTalents)` with a parser-emitted TALENT_SEED queue
 * frame at frame 0.
 */
import { TimelineEvent } from '../../../consts/viewTypes';
import type { TriggerIndex } from '../triggerIndex';

export function selectNewTalents(
  triggerIdx: TriggerIndex,
  registeredEvents: readonly TimelineEvent[],
): TimelineEvent[] {
  const talentEvents = triggerIdx.getAllTalentEvents();
  return talentEvents.filter(
    t => !registeredEvents.some(ev => ev.columnId === t.columnId && ev.ownerId === t.ownerId),
  );
}
