/**
 * @jest-environment jsdom
 */

/**
 * Akekuri Battle Skill — Ultimate Energy Double-Counting Regression Test
 *
 * Placing Akekuri's battle skill should grant 6.5 UE to Akekuri and 6.5 UE
 * to her teammates (shared team UE gain). A double-counting bug would push
 * one of these to ~13.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ultimateGraphKey } from '../../../../model/channels';
import { InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { findColumn, getMenuPayload } from '../../helpers';

const SLOT_AKEKURI = 'slot-1';
const SLOT_OTHER = 'slot-0';

function maxUltimateEnergy(app: ReturnType<typeof useApp>, slot: string) {
  const graph = app.resourceGraphs.get(ultimateGraphKey(slot));
  expect(graph).toBeDefined();
  return Math.max(...graph!.points.map((p) => p.value));
}

describe('Akekuri battle skill — ultimate energy not double-counted', () => {
  it('grants 6.5 UE to Akekuri and 6.5 UE to a teammate', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    const bsCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE);
    expect(bsCol).toBeDefined();

    const payload = getMenuPayload(result.current, bsCol!, 1 * FPS);
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId,
        payload.atFrame, payload.defaultSkill,
      );
    });

    expect(maxUltimateEnergy(result.current, SLOT_AKEKURI)).toBeCloseTo(6.5, 5);
    expect(maxUltimateEnergy(result.current, SLOT_OTHER)).toBeCloseTo(6.5, 5);
  });
});
