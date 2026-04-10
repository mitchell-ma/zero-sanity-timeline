/**
 * Controlled-operator seed factory. Builds the synthetic CONTROL event
 * that initializes the controlled-operator lane for the first occupied
 * slot. Caller routes the returned event through DEC.createSkillEvent.
 */
import { TimelineEvent } from '../../../consts/viewTypes';
import { NounType } from '../../../dsl/semantics';
import { OPERATOR_COLUMNS } from '../../../model/channels';
import { TOTAL_FRAMES } from '../../../utils/timeline';
import { allocInputEvent } from '../objectPool';

export function buildControlSeed(
  firstOccupiedSlotId: string | undefined,
  operatorId?: string,
): TimelineEvent | null {
  if (!firstOccupiedSlotId) return null;
  const ev = allocInputEvent();
  ev.uid = `controlled-seed-${firstOccupiedSlotId}`;
  ev.id = NounType.CONTROL;
  ev.name = NounType.CONTROL;
  ev.ownerEntityId = firstOccupiedSlotId;
  ev.columnId = OPERATOR_COLUMNS.INPUT;
  ev.startFrame = 0;
  ev.segments = [{ properties: { duration: TOTAL_FRAMES } }];
  ev.sourceEntityId = operatorId ?? firstOccupiedSlotId;
  ev.sourceSkillName = NounType.CONTROL;
  ev.ownerSlotId = firstOccupiedSlotId;
  ev.ownerOperatorId = operatorId ?? firstOccupiedSlotId;
  return ev;
}
