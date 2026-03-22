/**
 * @jest-environment jsdom
 */

/**
 * Antal Combo Skill — Integration Tests
 *
 * Tests the interaction between Akekuri's battle skill (which applies heat infliction)
 * and Antal's combo skill (which mirrors the trigger infliction) through the full useApp
 * pipeline. Verifies that dragging Akekuri's battle skill after Antal's combo invalidates
 * the combo's trigger infliction.
 *
 * Default slot order: slot-0=Laevatain, slot-1=Akekuri, slot-2=Antal, slot-3=Ardelia
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { SKILL_COLUMNS, INFLICTION_COLUMNS, ENEMY_OWNER_ID } from '../../model/channels';
import { FPS } from '../../utils/timeline';
import type { MiniTimeline } from '../../consts/viewTypes';

const SLOT_AKEKURI = 'slot-1';
const SLOT_ANTAL = 'slot-2';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

describe('Antal combo skill — heat infliction mirroring after drag', () => {
  it('combo mirrors heat infliction when Akekuri battle skill precedes it', () => {
    const { result } = renderHook(() => useApp());

    // 1. Antal uses battle skill (SPECIFIED_RESEARCH_SUBJECT) — applies Focus to enemy
    const antalBattleCol = findColumn(result.current, SLOT_ANTAL, SKILL_COLUMNS.BATTLE);
    expect(antalBattleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, SKILL_COLUMNS.BATTLE, 2 * FPS, antalBattleCol!.defaultEvent!,
      );
    });

    // 2. Akekuri uses battle skill (BURST_OF_PASSION) — applies heat infliction
    const akekuriBattleCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.BATTLE);
    expect(akekuriBattleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.BATTLE, 5 * FPS, akekuriBattleCol!.defaultEvent!,
      );
    });

    // 3. Antal uses combo skill (EMP_TEST_SITE) — triggered by Akekuri's heat infliction
    const antalComboCol = findColumn(result.current, SLOT_ANTAL, SKILL_COLUMNS.COMBO);
    expect(antalComboCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, SKILL_COLUMNS.COMBO, 8 * FPS, antalComboCol!.defaultEvent!,
      );
    });

    // 4. Verify: enemy has 2 heat inflictions (one from Akekuri, one mirrored from Antal combo)
    const heatsWithCombo = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(heatsWithCombo).toHaveLength(2);

    // Verify the combo event has a comboTriggerColumnId pointing to heat
    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_ANTAL && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    expect(comboEvent).toBeDefined();
    expect(comboEvent!.comboTriggerColumnId).toBe(INFLICTION_COLUMNS.HEAT);
  });

  it('combo loses heat infliction when Akekuri battle skill is dragged after it', () => {
    const { result } = renderHook(() => useApp());

    // Setup: Antal battle → Akekuri battle → Antal combo (same as above)
    const antalBattleCol = findColumn(result.current, SLOT_ANTAL, SKILL_COLUMNS.BATTLE);
    const akekuriBattleCol = findColumn(result.current, SLOT_AKEKURI, SKILL_COLUMNS.BATTLE);
    const antalComboCol = findColumn(result.current, SLOT_ANTAL, SKILL_COLUMNS.COMBO);

    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, SKILL_COLUMNS.BATTLE, 2 * FPS, antalBattleCol!.defaultEvent!,
      );
    });
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, SKILL_COLUMNS.BATTLE, 5 * FPS, akekuriBattleCol!.defaultEvent!,
      );
    });
    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, SKILL_COLUMNS.COMBO, 8 * FPS, antalComboCol!.defaultEvent!,
      );
    });

    // Sanity check: 2 heat inflictions before drag
    const heatsBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(heatsBefore).toHaveLength(2);

    // 5. Drag Akekuri's battle skill to AFTER Antal's combo skill
    const akekuriBattle = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(akekuriBattle).toBeDefined();

    act(() => {
      result.current.handleMoveEvent(akekuriBattle!.uid, 30 * FPS);
    });

    // 6. Verify: combo no longer has a trigger infliction
    const comboAfterDrag = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_ANTAL && ev.columnId === SKILL_COLUMNS.COMBO,
    );
    expect(comboAfterDrag).toBeDefined();
    expect(comboAfterDrag!.comboTriggerColumnId).toBeUndefined();

    // 7. Verify: only 1 heat infliction remains (from Akekuri only, no mirrored combo infliction)
    const heatsAfterDrag = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(heatsAfterDrag).toHaveLength(1);
  });
});
