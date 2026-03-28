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
 * Verification layers:
 * - Context menu: enemy status column menu items for infliction placement
 * - Controller: allProcessedEvents counts, event absence checks
 * - View: computeTimelinePresentation column view models
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { INFLICTION_COLUMNS, ENEMY_OWNER_ID, ENEMY_GROUP_COLUMNS, COMBO_WINDOW_COLUMN_ID } from '../../../../model/channels';
import { InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
const SLASHING_EDGE_ID: string = require('../../../../model/game-data/operators/chen-qianyu/statuses/status-slashing-edge.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CHEN = 'slot-0';
const SLOT_ARDELIA = 'slot-3';

/**
 * Find the infliction menu item for a specific element on the enemy status column.
 * Right-clicks the enemy status column (DYNAMIC_SPLIT) and locates the addEvent
 * entry whose payload targets the given infliction column.
 */
function getInflictionPayload(app: AppResult, atFrame: number, inflictionColumnId: string): AddEventPayload {
  act(() => {
    app.setInteractionMode(InteractionModeType.FREEFORM);
  });

  const enemyStatusCol = findColumn(app, ENEMY_OWNER_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
  expect(enemyStatusCol).toBeDefined();

  const menuItems = buildContextMenu(app, enemyStatusCol!, atFrame);
  expect(menuItems).not.toBeNull();

  const inflictionItem = menuItems!.find(
    (i) => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.columnId === inflictionColumnId,
  );
  expect(inflictionItem).toBeDefined();
  expect(inflictionItem!.disabled).toBeFalsy();

  return inflictionItem!.actionPayload as AddEventPayload;
}

describe('Chen Qianyu — freeform infliction must not trigger Slashing Edge', () => {
  it('freeform nature infliction does not produce Slashing Edge status', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID);
    });

    // Context menu layer: verify nature infliction menu item is available on enemy
    const payload = getInflictionPayload(result.current, 2 * FPS, INFLICTION_COLUMNS.NATURE);

    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller layer: infliction exists, Slashing Edge does not
    const inflictions = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(inflictions.length).toBeGreaterThanOrEqual(1);

    const slashingEdge = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID || ev.id === SLASHING_EDGE_ID,
    );
    expect(slashingEdge).toHaveLength(0);

    // View layer: computeTimelinePresentation should include the infliction but no Slashing Edge
    const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
    let foundInfliction = false;
    let foundSlashingEdge = false;
    for (const [, vm] of Array.from(vms.entries())) {
      for (const ev of vm.events) {
        if (ev.columnId === INFLICTION_COLUMNS.NATURE && ev.ownerId === ENEMY_OWNER_ID) {
          foundInfliction = true;
        }
        if (ev.columnId === SLASHING_EDGE_ID || ev.id === SLASHING_EDGE_ID) {
          foundSlashingEdge = true;
        }
      }
    }
    expect(foundInfliction).toBe(true);
    expect(foundSlashingEdge).toBe(false);
  });

  it('freeform heat infliction does not produce Slashing Edge status', () => {
    const { result } = renderHook(() => useApp());

    act(() => {
      result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID);
    });

    // Context menu layer: verify heat infliction menu item is available on enemy
    const payload = getInflictionPayload(result.current, 2 * FPS, INFLICTION_COLUMNS.HEAT);

    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller layer: no Slashing Edge produced
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
      result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID);
    });

    // Context menu layer: place freeform nature infliction on enemy at t=1s
    const inflictionPayload = getInflictionPayload(result.current, 1 * FPS, INFLICTION_COLUMNS.NATURE);

    act(() => {
      result.current.handleAddEvent(
        inflictionPayload.ownerId, inflictionPayload.columnId,
        inflictionPayload.atFrame, inflictionPayload.defaultSkill,
      );
    });

    // Back to strict mode for skill placement
    act(() => {
      result.current.setInteractionMode(InteractionModeType.STRICT);
    });

    // Context menu layer: Chen basic attack at t=2s via strict-mode menu
    const chenBasicCol = findColumn(result.current, SLOT_CHEN, NounType.BASIC_ATTACK);
    expect(chenBasicCol).toBeDefined();

    const basicPayload = getMenuPayload(result.current, chenBasicCol!, 2 * FPS);

    act(() => {
      result.current.handleAddEvent(
        basicPayload.ownerId, basicPayload.columnId, basicPayload.atFrame, basicPayload.defaultSkill,
      );
    });

    // Controller layer: Ardelia's combo window must NOT open — nature infliction is active
    const comboWindows = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === SLOT_ARDELIA,
    );
    expect(comboWindows).toHaveLength(0);

    // Slashing Edge must not have been triggered by the infliction;
    // only from Chen's BATK damage frames (if any)
    const slashingEdge = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === SLASHING_EDGE_ID || ev.id === SLASHING_EDGE_ID,
    );
    for (const ev of slashingEdge) {
      expect(ev.startFrame).toBeGreaterThanOrEqual(2 * FPS);
    }
  });
});
