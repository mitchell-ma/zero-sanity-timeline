/**
 * When ev is a CONTROL input event, clamp earlier CONTROL events on other
 * owners so they end at ev.startFrame. Mutates the existing segment in
 * place so both `allEvents` and the `stacks` index (which share
 * the same event references after _pushToStorage clone) see the update.
 */
import { TimelineEvent, computeSegmentsSpan, setEventDuration } from '../../../consts/viewTypes';
import { NounType } from '../../../dsl/semantics';
import { OPERATOR_COLUMNS } from '../../../model/channels';

export function clampPriorControlEvents(
  ev: TimelineEvent,
  allEvents: TimelineEvent[],
) {
  if (ev.id !== NounType.CONTROL || ev.columnId !== OPERATOR_COLUMNS.INPUT) return;
  for (let j = 0; j < allEvents.length; j++) {
    const prev = allEvents[j];
    if (prev.id !== NounType.CONTROL || prev.columnId !== OPERATOR_COLUMNS.INPUT) continue;
    if (prev.ownerEntityId === ev.ownerEntityId) continue;
    const prevEnd = prev.startFrame + computeSegmentsSpan(prev.segments);
    if (prevEnd <= ev.startFrame) continue;
    // Prev is DEC-owned (cloned in _pushToStorage), so mutate its segment
    // in place. The stacks index holds the same reference and sees the
    // truncated duration automatically.
    setEventDuration(prev, ev.startFrame - prev.startFrame);
  }
}
