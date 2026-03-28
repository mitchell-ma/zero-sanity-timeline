/**
 * @jest-environment jsdom
 */

/**
 * Chen Qianyu — Freeform infliction trigger isolation.
 *
 * Regression tests for triggerIndex.matchEvent verb-filtering bug:
 * matchEvent() was not filtering by verb, so DEAL:* triggers (Slashing Edge)
 * would incorrectly match APPLY events (freeform inflictions).
 *
 * Also tests that freeform inflictions correctly block Ardelia's combo window
 * via the HAVE negated conditions (enemy must not have active inflictions).
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { INFLICTION_COLUMNS, ENEMY_OWNER_ID, USER_ID, COMBO_WINDOW_COLUMN_ID } from '../../../../model/channels';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { OperatorType } from '../../../../model/enums/operators';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';

const SLOT_CHEN = 'slot-0';
const SLOT_ARDELIA = 'slot-3';
const SLASHING_EDGE_ID = 'SLASHING_EDGE';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

describe('Chen Qianyu — freeform infliction must not trigger Slashing Edge', () => {
  it('freeform nature infliction does not produce Slashing Edge status', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.handleSwapOperator(SLOT_CHEN, OperatorType.CHEN_QIANYU);
    });

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.NATURE, 2 * FPS,
        {
          name: INFLICTION_COLUMNS.NATURE,
          segments: [{ properties: { duration: 20 * FPS } }],
          sourceOwnerId: USER_ID,
        },
      );
    });

    const inflictions = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(inflictions.length).toBeGreaterThanOrEqual(1);

    const slashingEdge = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID || ev.id === SLASHING_EDGE_ID,
    );
    expect(slashingEdge).toHaveLength(0);
  });

  it('freeform heat infliction does not produce Slashing Edge status', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.handleSwapOperator(SLOT_CHEN, OperatorType.CHEN_QIANYU);
    });

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT, 2 * FPS,
        {
          name: INFLICTION_COLUMNS.HEAT,
          segments: [{ properties: { duration: 20 * FPS } }],
          sourceOwnerId: USER_ID,
        },
      );
    });

    const slashingEdge = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID || ev.id === SLASHING_EDGE_ID,
    );
    expect(slashingEdge).toHaveLength(0);
  });
});

describe('Chen + Ardelia — freeform nature infliction blocks combo window', () => {
  it('Ardelia combo window does not open when enemy has active nature infliction', () => {
    const { result } = renderHook(() => useApp());

    // Swap Chen into slot-0; Ardelia is already in slot-3
    act(() => {
      result.current.handleSwapOperator(SLOT_CHEN, OperatorType.CHEN_QIANYU);
    });

    // Freeform nature infliction on enemy at t=1s (lasts 20s)
    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });
    act(() => {
      result.current.handleAddEvent(
        ENEMY_OWNER_ID, INFLICTION_COLUMNS.NATURE, 1 * FPS,
        {
          name: INFLICTION_COLUMNS.NATURE,
          segments: [{ properties: { duration: 20 * FPS } }],
          sourceOwnerId: USER_ID,
        },
      );
    });

    // Back to strict mode for skill placement
    act(() => {
      result.current.setInteractionMode(InteractionModeType.STRICT);
    });

    // Chen basic attack at t=2s — overlaps the nature infliction, has FINAL_STRIKE frames
    const chenBasicCol = findColumn(result.current, SLOT_CHEN, NounType.BASIC_ATTACK);
    expect(chenBasicCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_CHEN, NounType.BASIC_ATTACK, 2 * FPS, chenBasicCol!.defaultEvent!,
      );
    });

    // Ardelia's combo window must NOT open — nature infliction is active on the enemy
    const comboWindows = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === SLOT_ARDELIA,
    );
    expect(comboWindows).toHaveLength(0);

    // Slashing Edge must also not have been triggered by the infliction
    const slashingEdge = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID || ev.id === SLASHING_EDGE_ID,
    );
    // Only Slashing Edge from Chen's BATK damage frames, none from the infliction
    for (const ev of slashingEdge) {
      expect(ev.startFrame).toBeGreaterThanOrEqual(2 * FPS);
    }
  });
});
