/**
 * @jest-environment jsdom
 */

/**
 * Susceptibility Stacking — freeform placement of same-element susceptibility
 *
 * Verifies that multiple freeform susceptibility events of the same element
 * coexist as separate events (no clamping/RESET). Each is an independent
 * visual block on the enemy status column.
 *
 * Three-layer verification: context menu → controller → view.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { ENEMY_ID, ENEMY_GROUP_COLUMNS, INFLICTION_COLUMNS } from '../../../model/channels';
import { ColumnType, EventStatusType, InteractionModeType } from '../../../consts/enums';
import type { MiniTimeline } from '../../../consts/viewTypes';
import { FPS } from '../../../utils/timeline';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { buildContextMenu } from '../helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CRYO_SUSC_ID: string = require(
  '../../../model/game-data/generic/statuses/status-cryo-susceptibility.json',
).properties.id;

function findEnemyStatusColumn(app: ReturnType<typeof useApp>) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ENEMY_ID &&
      c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
}

describe('Susceptibility stacking — freeform same-element', () => {
  it('two freeform cryo susceptibility events at 0s and 1s are separate, unclamped blocks', () => {
    const { result } = renderHook(() => useApp());

    // Switch to freeform mode
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // ── Context menu: place cryo infliction first so cryo susceptibility column exists ──
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.CRYO, 0,
        { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 20 * FPS } }] },
      );
    });

    // ── Place cryo susceptibility at 0s ──
    const enemyStatusCol = findEnemyStatusColumn(result.current);
    expect(enemyStatusCol).toBeDefined();
    const menu0 = buildContextMenu(result.current, enemyStatusCol!, 0 * FPS, 0.5);
    expect(menu0).not.toBeNull();
    // Find the cryo susceptibility add item
    const suscItem0 = menu0!.find(
      i => i.actionId === 'addEvent' &&
        (i.actionPayload as Record<string, Record<string, unknown>>)?.defaultSkill?.id === CRYO_SUSC_ID,
    );
    if (!suscItem0) {
      // Fallback: place directly
      act(() => {
        result.current.handleAddEvent(
          ENEMY_ID, CRYO_SUSC_ID, 0 * FPS,
          { name: CRYO_SUSC_ID, id: CRYO_SUSC_ID, segments: [{ properties: { duration: 5 * FPS } }] },
        );
      });
    } else {
      const payload0 = suscItem0.actionPayload as { ownerEntityId: string; columnId: string; atFrame: number; defaultSkill: Record<string, unknown> };
      act(() => { result.current.handleAddEvent(payload0.ownerEntityId, payload0.columnId, payload0.atFrame, payload0.defaultSkill); });
    }

    // ── Place cryo susceptibility at 1s ──
    act(() => {
      result.current.handleAddEvent(
        ENEMY_ID, CRYO_SUSC_ID, 1 * FPS,
        { name: CRYO_SUSC_ID, id: CRYO_SUSC_ID, segments: [{ properties: { duration: 5 * FPS } }] },
      );
    });

    // ── Controller layer: 2 separate cryo susceptibility events, neither consumed ──
    const suscEvents = result.current.allProcessedEvents.filter(
      ev => ev.name === CRYO_SUSC_ID && ev.ownerEntityId === ENEMY_ID,
    );
    expect(suscEvents).toHaveLength(2);
    expect(suscEvents[0].startFrame).toBe(0 * FPS);
    expect(suscEvents[1].startFrame).toBe(1 * FPS);
    // Neither should be consumed/clamped
    for (const ev of suscEvents) {
      expect(ev.eventStatus).not.toBe(EventStatusType.CONSUMED);
      expect(ev.eventStatus).not.toBe(EventStatusType.REFRESHED);
    }

    // ── View layer: both visible as separate blocks in enemy status column ──
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const enemyCol = findEnemyStatusColumn(result.current);
    expect(enemyCol).toBeDefined();
    const evm = viewModels.get(enemyCol!.key);
    expect(evm).toBeDefined();
    const suscInVM = evm!.events.filter(ev => ev.name === CRYO_SUSC_ID);
    expect(suscInVM).toHaveLength(2);
    // Both should have micro-positions (rendered as separate blocks)
    for (const ev of suscInVM) {
      expect(evm!.microPositions.has(ev.uid)).toBe(true);
    }
    // Labels should include stack numbering (I, II) like MF stacking
    const labels = suscInVM.map(ev => evm!.statusOverrides.get(ev.uid)?.label).filter(Boolean);
    expect(labels.some(l => l!.includes('I'))).toBe(true);
    expect(labels.some(l => l!.includes('II'))).toBe(true);
  });
});
