/**
 * @jest-environment jsdom
 *
 * Integration test verifying that trigger conditions with multiple predicates
 * still fire correctly through the flattened conditions pipeline.
 *
 * The core order-agnosticism logic is tested in unit/triggerConditionOrder.test.ts.
 * Operator-specific trigger scenarios (Fluorite T1, Arclight IS ELECTRIFIED,
 * Fluorite STACKS combo) are covered by their respective operator test suites.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { InteractionModeType } from '../../../consts/enums';
import { NounType } from '../../../dsl/semantics';
import { FPS } from '../../../utils/timeline';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';

// Akekuri is the default operator on slot-1
const SLOT_AKEKURI = 'slot-1';
const P1_STATUS_ID = 'AKEKURI_P1_POSITIVE_FEEDBACK';

function setPotential(app: AppResult, potential: number) {
  const props = app.loadoutProperties[SLOT_AKEKURI];
  app.handleStatsChange(SLOT_AKEKURI, {
    ...props,
    operator: { ...props.operator, potential },
  });
}

function addCombo(app: AppResult, atFrame: number) {
  const comboCol = findColumn(app, SLOT_AKEKURI, NounType.COMBO);
  expect(comboCol).toBeDefined();
  const payload = getMenuPayload(app, comboCol!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

beforeEach(() => { localStorage.clear(); });

describe('Flattened trigger conditions pipeline', () => {
  test('Akekuri P1: RECOVER + HAVE POTENTIAL fires through flat conditions', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setPotential(result.current, 1); });
    act(() => { addCombo(result.current, 1 * FPS); });

    const p1Events = result.current.allProcessedEvents.filter(
      ev => ev.columnId === P1_STATUS_ID && ev.ownerEntityId === SLOT_AKEKURI,
    );
    expect(p1Events.length).toBeGreaterThanOrEqual(1);

    // No duplicates from multi-key dedup
    const uids = new Set(p1Events.map(ev => ev.uid));
    expect(uids.size).toBe(p1Events.length);
  });

  test('Akekuri P0: HAVE POTENTIAL gate blocks Positive Feedback', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    act(() => { setPotential(result.current, 0); });
    act(() => { addCombo(result.current, 1 * FPS); });

    const p1Events = result.current.allProcessedEvents.filter(
      ev => ev.columnId === P1_STATUS_ID && ev.ownerEntityId === SLOT_AKEKURI,
    );
    expect(p1Events.length).toBe(0);
  });
});
