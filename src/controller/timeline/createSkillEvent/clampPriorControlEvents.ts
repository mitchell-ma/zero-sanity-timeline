/**
 * When ev is a CONTROL input event, clamp earlier CONTROL events on other
 * owners so they end at ev.startFrame. Mutates registeredEvents in place.
 */
import { TimelineEvent, computeSegmentsSpan } from '../../../consts/viewTypes';
import { NounType } from '../../../dsl/semantics';
import { OPERATOR_COLUMNS } from '../../../model/channels';

export function clampPriorControlEvents(
  ev: TimelineEvent,
  registeredEvents: TimelineEvent[],
) {
  if (ev.id !== NounType.CONTROL || ev.columnId !== OPERATOR_COLUMNS.INPUT) return;
  for (let j = 0; j < registeredEvents.length; j++) {
    const prev = registeredEvents[j];
    if (prev.id !== NounType.CONTROL || prev.columnId !== OPERATOR_COLUMNS.INPUT) continue;
    if (prev.ownerId === ev.ownerId) continue;
    const prevEnd = prev.startFrame + computeSegmentsSpan(prev.segments);
    if (prevEnd <= ev.startFrame) continue;
    registeredEvents[j] = {
      ...prev,
      segments: [{
        properties: {
          ...prev.segments[0]?.properties,
          duration: ev.startFrame - prev.startFrame,
        },
      }],
    };
  }
}
