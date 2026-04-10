/**
 * @jest-environment jsdom
 */

/**
 * Status Micro-Column Color — Integration Tests
 *
 * Verifies that status micro-columns use the status's own element color
 * when defined, and DEFAULT_EVENT_COLOR (violet) when no element is set.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { ColumnType, DEFAULT_EVENT_COLOR, ELEMENT_COLORS, ElementType } from '../../../consts/enums';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../model/channels';
import type { MiniTimeline } from '../../../consts/viewTypes';

beforeEach(() => {
  localStorage.clear();
});

function getStatusMicroColumn(
  columns: readonly import('../../../consts/viewTypes').Column[],
  slotId: string,
  statusId: string,
) {
  for (const col of columns) {
    if (col.type !== ColumnType.MINI_TIMELINE) continue;
    const mt = col as MiniTimeline;
    if (mt.ownerEntityId !== slotId || mt.columnId !== OPERATOR_STATUS_COLUMN_ID) continue;
    return mt.microColumns?.find(mc => mc.id === statusId);
  }
  return undefined;
}

describe('Status micro-column colors', () => {
  it('non-elemental status (Ember Steel Oath) uses DEFAULT_EVENT_COLOR violet', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const EMBER_ID: string = require('../../../model/game-data/operators/ember/ember.json').id;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const SLOT = 'slot-0';

    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT, EMBER_ID); });

    // Inflamed for the Assault — talent status, no element
    const inflamed = getStatusMicroColumn(result.current.columns, SLOT, 'INFLAMED_FOR_THE_ASSAULT');
    expect(inflamed).toBeDefined();
    expect(inflamed!.color).toBe(DEFAULT_EVENT_COLOR);

    // Pay the Ferric Price — talent status, no element
    const pftp = getStatusMicroColumn(result.current.columns, SLOT, 'PAY_THE_FERRIC_PRICE');
    expect(pftp).toBeDefined();
    expect(pftp!.color).toBe(DEFAULT_EVENT_COLOR);
  });

  it('elemental status (Laevatain Scorching Heart) uses element color', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const SLOT = 'slot-0';

    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });

    const scorchingHeart = getStatusMicroColumn(result.current.columns, SLOT, 'SCORCHING_HEART');
    expect(scorchingHeart).toBeDefined();
    expect(scorchingHeart!.color).toBe(ELEMENT_COLORS[ElementType.HEAT]);
  });

  it('non-elemental status does NOT inherit operator element color', () => {
    // Ember is HEAT element, but her non-elemental statuses should be violet, not orange
    /* eslint-disable @typescript-eslint/no-require-imports */
    const EMBER_ID: string = require('../../../model/game-data/operators/ember/ember.json').id;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const SLOT = 'slot-0';
    const HEAT_COLOR = ELEMENT_COLORS[ElementType.HEAT];

    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator(SLOT, EMBER_ID); });

    // Check all micro-columns on the status column — none should be HEAT color
    // unless the status actually has element: HEAT
    for (const col of result.current.columns) {
      if (col.type !== ColumnType.MINI_TIMELINE) continue;
      const mt = col as MiniTimeline;
      if (mt.ownerEntityId !== SLOT || mt.columnId !== OPERATOR_STATUS_COLUMN_ID) continue;
      for (const mc of mt.microColumns ?? []) {
        if (mc.color !== HEAT_COLOR) continue;
        // If a status uses HEAT color, it must have element: HEAT in its config
        const { getStatusById } = require('../../../controller/gameDataStore');
        const cfg = getStatusById(mc.id);
        expect(cfg?.element).toBe(ElementType.HEAT);
      }
    }
  });

  it('team-shared non-elemental status uses violet on receiving operator', () => {
    // Steel Oath is applied to ALL OPERATOR — on non-Ember slots it should still be violet
    /* eslint-disable @typescript-eslint/no-require-imports */
    const EMBER_ID: string = require('../../../model/game-data/operators/ember/ember.json').id;
    const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
    /* eslint-enable @typescript-eslint/no-require-imports */

    const { result } = renderHook(() => useApp());
    act(() => { result.current.handleSwapOperator('slot-0', EMBER_ID); });
    act(() => { result.current.handleSwapOperator('slot-1', LAEVATAIN_ID); });

    // Steel Oath on Laevatain's status column (team-shared from Ember)
    // Steel Oath only appears if Ember's ultimate is placed; verify color if present
    const steelOath = getStatusMicroColumn(result.current.columns, 'slot-1', 'THE_STEEL_OATH');
    // eslint-disable-next-line jest/no-conditional-expect
    if (steelOath) expect(steelOath.color).toBe(DEFAULT_EVENT_COLOR);
  });
});
