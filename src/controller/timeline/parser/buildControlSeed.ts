/**
 * Phase 8 step 7d — controlled-operator seed factory.
 *
 * Builds the synthetic CONTROL event used to initialize the controlled-
 * operator lane for the first occupied slot. Caller routes the returned
 * event through DEC.createSkillEvent (the sole ingress path).
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
  ev.ownerId = firstOccupiedSlotId;
  ev.columnId = OPERATOR_COLUMNS.INPUT;
  ev.startFrame = 0;
  ev.segments = [{ properties: { duration: TOTAL_FRAMES } }];
  ev.sourceOwnerId = operatorId ?? firstOccupiedSlotId;
  ev.sourceSkillName = NounType.CONTROL;
  return ev;
}
