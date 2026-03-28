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
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { INFLICTION_COLUMNS, PHYSICAL_INFLICTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, ENEMY_OWNER_ID } from '../../../../model/channels';
import { ColumnType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';

const SLOT_CHEN = 'slot-1';
const SLOT_AKEKURI = 'slot-1';
const SLOT_ANTAL = 'slot-2';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

describe('Antal combo skill — heat infliction mirroring after drag', () => {
  it('combo mirrors heat infliction when Akekuri battle skill precedes it', () => {
    const { result } = renderHook(() => useApp());

    // 1. Antal uses battle skill (SPECIFIED_RESEARCH_SUBJECT) — applies Focus to enemy
    const antalBattleCol = findColumn(result.current, SLOT_ANTAL, NounType.BATTLE_SKILL);
    expect(antalBattleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, NounType.BATTLE_SKILL, 2 * FPS, antalBattleCol!.defaultEvent!,
      );
    });

    // 2. Akekuri uses battle skill (BURST_OF_PASSION) — applies heat infliction
    const akekuriBattleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);
    expect(akekuriBattleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BATTLE_SKILL, 5 * FPS, akekuriBattleCol!.defaultEvent!,
      );
    });

    // 3. Antal uses combo skill (EMP_TEST_SITE) — triggered by Akekuri's heat infliction
    const antalComboCol = findColumn(result.current, SLOT_ANTAL, NounType.COMBO_SKILL);
    expect(antalComboCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, NounType.COMBO_SKILL, 8 * FPS, antalComboCol!.defaultEvent!,
      );
    });

    // 4. Verify: enemy has 2 heat inflictions (one from Akekuri, one mirrored from Antal combo)
    const heatsWithCombo = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(heatsWithCombo).toHaveLength(2);

    // Verify the combo event has a comboTriggerColumnId pointing to heat
    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_ANTAL && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(comboEvent).toBeDefined();
    expect(comboEvent!.comboTriggerColumnId).toBe(INFLICTION_COLUMNS.HEAT);
  });

  it('combo loses heat infliction when Akekuri battle skill is dragged after it', () => {
    const { result } = renderHook(() => useApp());

    // Setup: Antal battle → Akekuri battle → Antal combo (same as above)
    const antalBattleCol = findColumn(result.current, SLOT_ANTAL, NounType.BATTLE_SKILL);
    const akekuriBattleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);
    const antalComboCol = findColumn(result.current, SLOT_ANTAL, NounType.COMBO_SKILL);

    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, NounType.BATTLE_SKILL, 2 * FPS, antalBattleCol!.defaultEvent!,
      );
    });
    act(() => {
      result.current.handleAddEvent(
        SLOT_AKEKURI, NounType.BATTLE_SKILL, 5 * FPS, akekuriBattleCol!.defaultEvent!,
      );
    });
    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, NounType.COMBO_SKILL, 8 * FPS, antalComboCol!.defaultEvent!,
      );
    });

    // Sanity check: 2 heat inflictions before drag
    const heatsBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(heatsBefore).toHaveLength(2);

    // 5. Drag Akekuri's battle skill to AFTER Antal's combo skill
    const akekuriBattle = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_AKEKURI && ev.columnId === NounType.BATTLE_SKILL,
    );
    expect(akekuriBattle).toBeDefined();

    act(() => {
      result.current.handleMoveEvent(akekuriBattle!.uid, 30 * FPS);
    });

    // 6. Verify: combo no longer has a trigger infliction
    const comboAfterDrag = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_ANTAL && ev.columnId === NounType.COMBO_SKILL,
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

describe('Antal combo skill — physical status (Lift) trigger', () => {
  it('combo window activates when Chen Qianyu applies Lift while enemy has Focus', () => {
    const { result } = renderHook(() => useApp());

    // Swap Chen Qianyu into slot-1 (replaces Akekuri)
    act(() => {
      result.current.handleSwapOperator(SLOT_CHEN, 'CHEN_QIANYU');
    });

    // 1. Antal uses battle skill — applies Focus to enemy
    const antalBattleCol = findColumn(result.current, SLOT_ANTAL, NounType.BATTLE_SKILL);
    expect(antalBattleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, NounType.BATTLE_SKILL, 0, antalBattleCol!.defaultEvent!,
      );
    });

    // 2. Chen uses battle skill twice — first adds Vulnerable, second triggers Lift
    const chenBattleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE_SKILL);
    expect(chenBattleCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_CHEN, NounType.BATTLE_SKILL, 0, chenBattleCol!.defaultEvent!,
      );
    });
    act(() => {
      result.current.handleAddEvent(
        SLOT_CHEN, NounType.BATTLE_SKILL, 15 * FPS, chenBattleCol!.defaultEvent!,
      );
    });

    // Verify: enemy has Lift status
    const liftEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(liftEvents).toHaveLength(1);

    // 3. Antal uses combo skill — should be triggered by Lift (physical status)
    const antalComboCol = findColumn(result.current, SLOT_ANTAL, NounType.COMBO_SKILL);
    expect(antalComboCol).toBeDefined();

    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, NounType.COMBO_SKILL, 16 * FPS, antalComboCol!.defaultEvent!,
      );
    });

    // Verify: combo has a trigger pointing to the Lift column
    const comboEvent = result.current.allProcessedEvents.find(
      (ev) => ev.ownerId === SLOT_ANTAL && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(comboEvent).toBeDefined();
    expect(comboEvent!.comboTriggerColumnId).toBe(PHYSICAL_STATUS_COLUMNS.LIFT);
  });

  it('combo duplicates Lift (adds Vulnerable), not infliction, when triggered by physical status', () => {
    const { result } = renderHook(() => useApp());

    // Swap Chen Qianyu into slot-1
    act(() => {
      result.current.handleSwapOperator(SLOT_CHEN, 'CHEN_QIANYU');
    });

    // Antal battle skill → Focus on enemy
    const antalBattleCol = findColumn(result.current, SLOT_ANTAL, NounType.BATTLE_SKILL);
    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, NounType.BATTLE_SKILL, 0, antalBattleCol!.defaultEvent!,
      );
    });

    // Chen battle skill ×2 → Vulnerable + Lift
    const chenBattleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE_SKILL);
    act(() => {
      result.current.handleAddEvent(
        SLOT_CHEN, NounType.BATTLE_SKILL, 0, chenBattleCol!.defaultEvent!,
      );
    });
    act(() => {
      result.current.handleAddEvent(
        SLOT_CHEN, NounType.BATTLE_SKILL, 15 * FPS, chenBattleCol!.defaultEvent!,
      );
    });

    // Count Vulnerable stacks before combo (2 from Chen's two battle skills)
    const vulnBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(vulnBefore).toHaveLength(2);

    // Antal combo skill — triggered by Lift
    const antalComboCol = findColumn(result.current, SLOT_ANTAL, NounType.COMBO_SKILL);
    act(() => {
      result.current.handleAddEvent(
        SLOT_ANTAL, NounType.COMBO_SKILL, 16 * FPS, antalComboCol!.defaultEvent!,
      );
    });

    // Combo should duplicate the trigger source (Lift → adds another Vulnerable stack)
    const vulnAfter = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(vulnAfter).toHaveLength(3);

    // No heat infliction should be created (combo was not triggered by infliction)
    const heatEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(heatEvents).toHaveLength(0);
  });
});
