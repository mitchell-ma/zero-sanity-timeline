/**
 * Phase 8 step 7c — talent selection extracted from runEventQueue.
 *
 * Pure selector: takes the trigger index's talent events and filters out
 * ones already present in the registered-events list (matched by
 * columnId + ownerId). The caller routes the returned events through
 * DEC.createSkillEvent (the sole ingress path).
 */
import { TimelineEvent } from '../../../consts/viewTypes';
import type { TriggerIndex } from '../triggerIndex';

export function selectNewTalents(
  triggerIdx: TriggerIndex,
  allEvents: readonly TimelineEvent[],
): TimelineEvent[] {
  const talentEvents = triggerIdx.getAllTalentEvents();
  return talentEvents.filter(
    t => !allEvents.some(ev => ev.columnId === t.columnId && ev.ownerId === t.ownerId),
  );
}
