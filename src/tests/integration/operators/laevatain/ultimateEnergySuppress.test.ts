/**
 * @jest-environment jsdom
 */

/**
 * Laevatain Ultimate Energy Suppression — Integration Test
 *
 * Verifies that during Laevatain's ultimate (Twilight), she does not gain
 * ultimate energy. The ultimate has two suppression mechanisms:
 *   1. ANIMATION segment: IGNORE ULTIMATE_ENERGY clause
 *   2. ACTIVE segment: segmentType ACTIVE triggers no-gain window
 *
 * Test flow:
 *   1. Place a battle skill (generates UE via SP conversion)
 *   2. Set UE to max, place ultimate
 *   3. Place a battle skill DURING the ultimate's active phase
 *   4. Verify UE does not increase during the active phase
 *   5. Place a battle skill AFTER the ultimate ends
 *   6. Verify UE resumes gaining after the ultimate ends
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ultimateGraphKey } from '../../../../model/channels';
import { getUltimateEnergyCost } from '../../../../controller/operators/operatorRegistry';
import { InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const TWILIGHT_ID: string = require('../../../../model/game-data/operators/laevatain/skills/ultimate-twilight.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';
const SLOT_INDEX = 0;

describe('Laevatain — ultimate energy suppression during Twilight', () => {
  it('does not gain ultimate energy while ultimate is active', () => {
    const { result } = renderHook(() => useApp());

    // ── Setup: give Laevatain max UE so we can place ultimate ──────────────
    act(() => {
      setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX);
    });

    // ── Find columns ───────────────────────────────────────────────────────
    const ultCol = findColumn(result.current, SLOT, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const bsCol = findColumn(result.current, SLOT, NounType.BATTLE_SKILL);
    expect(bsCol).toBeDefined();

    // ── Place ultimate at t=2s ─────────────────────────────────────────────
    const ultPayload = getMenuPayload(result.current, ultCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerId, ultPayload.columnId,
        ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Verify ultimate was placed
    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT && ev.name === TWILIGHT_ID,
    );
    expect(ultEvents).toHaveLength(1);

    const ultEvent = ultEvents[0];
    const ultStart = ultEvent.startFrame;
    const ultEnd = ultStart + ultEvent.segments.reduce(
      (sum, seg) => sum + seg.properties.duration, 0,
    );

    // ── Layer 2: Verify UE was consumed (dropped to 0) ─────────────────────
    const ueKey = ultimateGraphKey(SLOT);
    const graphAfterUlt = result.current.resourceGraphs.get(ueKey);
    expect(graphAfterUlt).toBeDefined();

    // Energy should be 0 right after consumption
    const pointsAfterConsume = graphAfterUlt!.points.filter(
      (p) => p.frame > ultStart && p.frame <= ultStart + 1 * FPS,
    );
    for (const p of pointsAfterConsume) {
      expect(p.value).toBe(0);
    }

    // ── Switch to freeform to place BS during ultimate ──────────────────────
    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // Place a battle skill during the ultimate's active phase (at t=10s,
    // well within the 15s active window starting after animation+stasis)
    const bsDuringFrame = ultStart + 5 * FPS;
    const bsDuringPayload = getMenuPayload(result.current, bsCol!, bsDuringFrame);
    act(() => {
      result.current.handleAddEvent(
        bsDuringPayload.ownerId, bsDuringPayload.columnId,
        bsDuringPayload.atFrame, bsDuringPayload.defaultSkill,
      );
    });

    // ── Layer 2: Verify UE stays at 0 during the active phase ──────────────
    const graphDuring = result.current.resourceGraphs.get(ueKey);
    expect(graphDuring).toBeDefined();

    // Check all points during the ultimate's active window — energy must be 0
    const pointsDuringUlt = graphDuring!.points.filter(
      (p) => p.frame > ultStart && p.frame < ultEnd,
    );
    for (const p of pointsDuringUlt) {
      expect(p.value).toBe(0);
    }

    // ── Place a battle skill AFTER the ultimate ends ────────────────────────
    const bsAfterFrame = ultEnd + 2 * FPS;
    const bsAfterPayload = getMenuPayload(result.current, bsCol!, bsAfterFrame);
    act(() => {
      result.current.handleAddEvent(
        bsAfterPayload.ownerId, bsAfterPayload.columnId,
        bsAfterPayload.atFrame, bsAfterPayload.defaultSkill,
      );
    });

    // ── Layer 2: Verify UE gains resume after the ultimate ends ─────────────
    const graphAfter = result.current.resourceGraphs.get(ueKey);
    expect(graphAfter).toBeDefined();

    // Find the max energy value after the ultimate ends
    const pointsAfterUlt = graphAfter!.points.filter(
      (p) => p.frame > ultEnd,
    );
    const maxAfter = Math.max(...pointsAfterUlt.map((p) => p.value));
    expect(maxAfter).toBeGreaterThan(0);

    // ── Layer 1: Context menu — verify ult is disabled in strict mode ─────────
    // Switch back to strict mode where energy gates apply
    act(() => {
      result.current.setInteractionMode(InteractionModeType.STRICT);
    });

    const maxEnergy = getUltimateEnergyCost(result.current.operators[SLOT_INDEX]!.id);
    // UE gained from one BS after ult should be far below max
    expect(maxAfter).toBeLessThan(maxEnergy);

    const menuAfter = buildContextMenu(result.current, ultCol!, bsAfterFrame);
    expect(menuAfter).not.toBeNull();
    const ultMenuItem = menuAfter!.find((i) => i.actionId === 'addEvent');
    // Ultimate should be disabled in strict mode — insufficient energy
    expect(ultMenuItem).toBeDefined();
    expect(ultMenuItem!.disabled).toBe(true);

    // ── Layer 3: View — verify ultimate event renders in the column ─────────
    const ultColAfter = findColumn(result.current, SLOT, NounType.ULTIMATE);
    expect(ultColAfter).toBeDefined();
    const ultEventsInCol = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEventsInCol).toHaveLength(1);
  });
});
