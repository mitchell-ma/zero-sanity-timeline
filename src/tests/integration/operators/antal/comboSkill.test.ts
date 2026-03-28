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
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled for each column
 * 2. Controller: processed events contain expected infliction/status data
 * 3. View: computeTimelinePresentation includes combo and infliction events in their columns
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
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload, type AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CHEN = 'slot-1';
const SLOT_AKEKURI = 'slot-1';
const SLOT_ANTAL = 'slot-2';

/** Helper: add Antal battle skill, Akekuri battle skill, then Antal combo skill. */
function setupAntalComboWithHeat(result: { current: AppResult }) {
  // 1. Antal uses battle skill (SPECIFIED_RESEARCH_SUBJECT) — applies Focus to enemy
  const antalBattleCol = findColumn(result.current, SLOT_ANTAL, NounType.BATTLE_SKILL);
  expect(antalBattleCol).toBeDefined();

  const antalBattlePayload = getMenuPayload(result.current, antalBattleCol!, 2 * FPS);

  act(() => {
    result.current.handleAddEvent(
      antalBattlePayload.ownerId, antalBattlePayload.columnId,
      antalBattlePayload.atFrame, antalBattlePayload.defaultSkill,
    );
  });

  // 2. Akekuri uses battle skill (BURST_OF_PASSION) — applies heat infliction
  const akekuriBattleCol = findColumn(result.current, SLOT_AKEKURI, NounType.BATTLE_SKILL);
  expect(akekuriBattleCol).toBeDefined();

  const akekuriBattlePayload = getMenuPayload(result.current, akekuriBattleCol!, 5 * FPS);

  act(() => {
    result.current.handleAddEvent(
      akekuriBattlePayload.ownerId, akekuriBattlePayload.columnId,
      akekuriBattlePayload.atFrame, akekuriBattlePayload.defaultSkill,
    );
  });

  // 3. Antal uses combo skill (EMP_TEST_SITE) — triggered by Akekuri's heat infliction
  const antalComboCol = findColumn(result.current, SLOT_ANTAL, NounType.COMBO_SKILL);
  expect(antalComboCol).toBeDefined();

  const antalComboMenu = buildContextMenu(result.current, antalComboCol!, 8 * FPS);
  expect(antalComboMenu).not.toBeNull();
  expect(antalComboMenu!.length).toBeGreaterThan(0);

  const antalComboPayload = getMenuPayload(result.current, antalComboCol!, 8 * FPS);

  act(() => {
    result.current.handleAddEvent(
      antalComboPayload.ownerId, antalComboPayload.columnId,
      antalComboPayload.atFrame, antalComboPayload.defaultSkill,
    );
  });
}

describe('Antal combo skill — heat infliction mirroring after drag', () => {
  it('combo mirrors heat infliction when Akekuri battle skill precedes it', () => {
    const { result } = renderHook(() => useApp());

    setupAntalComboWithHeat(result);

    // ── Controller layer ────────────────────────────────────────────────
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

    // ── View layer ──────────────────────────────────────────────────────
    // Verify: heat infliction events appear in the enemy's infliction column view model
    const enemyHeatCol = result.current.columns.find(
      (c): c is MiniTimeline =>
        c.type === ColumnType.MINI_TIMELINE &&
        c.ownerId === ENEMY_OWNER_ID &&
        (c.matchColumnIds?.includes(INFLICTION_COLUMNS.HEAT) ?? false),
    );
    expect(enemyHeatCol).toBeDefined();

    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(enemyHeatCol!.key);
    expect(vm).toBeDefined();

    const heatInVM = vm!.events.filter(
      (ev) => ev.columnId === INFLICTION_COLUMNS.HEAT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(heatInVM).toHaveLength(2);

    // Verify: combo event appears in Antal's combo column view model
    const antalComboCol = findColumn(result.current, SLOT_ANTAL, NounType.COMBO_SKILL);
    const comboVM = viewModels.get(antalComboCol!.key);
    expect(comboVM).toBeDefined();
    expect(comboVM!.events.length).toBeGreaterThan(0);
  });

  it('combo loses heat infliction when Akekuri battle skill is dragged after it', () => {
    const { result } = renderHook(() => useApp());

    setupAntalComboWithHeat(result);

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
      result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID);
    });

    // ── Context menu layer: Antal battle skill ─────────────────────────
    // 1. Antal uses battle skill — applies Focus to enemy
    const antalBattleCol = findColumn(result.current, SLOT_ANTAL, NounType.BATTLE_SKILL);
    expect(antalBattleCol).toBeDefined();

    const antalBattleMenu = buildContextMenu(result.current, antalBattleCol!, 0);
    expect(antalBattleMenu).not.toBeNull();

    const antalBattlePayload = getMenuPayload(result.current, antalBattleCol!, 0);

    act(() => {
      result.current.handleAddEvent(
        antalBattlePayload.ownerId, antalBattlePayload.columnId,
        antalBattlePayload.atFrame, antalBattlePayload.defaultSkill,
      );
    });

    // ── Context menu layer: Chen battle skill x2 ───────────────────────
    // 2. Chen uses battle skill twice — first adds Vulnerable, second triggers Lift
    const chenBattleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE_SKILL);
    expect(chenBattleCol).toBeDefined();

    const chenPayload1 = getMenuPayload(result.current, chenBattleCol!, 0);

    act(() => {
      result.current.handleAddEvent(
        chenPayload1.ownerId, chenPayload1.columnId,
        chenPayload1.atFrame, chenPayload1.defaultSkill,
      );
    });

    const chenPayload2 = getMenuPayload(result.current, chenBattleCol!, 15 * FPS);

    act(() => {
      result.current.handleAddEvent(
        chenPayload2.ownerId, chenPayload2.columnId,
        chenPayload2.atFrame, chenPayload2.defaultSkill,
      );
    });

    // ── Controller layer ────────────────────────────────────────────────
    // Verify: enemy has Lift status
    const liftEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(liftEvents).toHaveLength(1);

    // ── Context menu layer: Antal combo skill ──────────────────────────
    // 3. Antal uses combo skill — should be triggered by Lift (physical status)
    const antalComboCol = findColumn(result.current, SLOT_ANTAL, NounType.COMBO_SKILL);
    expect(antalComboCol).toBeDefined();

    const comboMenu = buildContextMenu(result.current, antalComboCol!, 16 * FPS);
    expect(comboMenu).not.toBeNull();
    expect(comboMenu!.length).toBeGreaterThan(0);

    const comboPayload = getMenuPayload(result.current, antalComboCol!, 16 * FPS);

    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // ── Controller layer ────────────────────────────────────────────────
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
      result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID);
    });

    // Antal battle skill — Focus on enemy
    const antalBattleCol = findColumn(result.current, SLOT_ANTAL, NounType.BATTLE_SKILL);
    const antalBattlePayload = getMenuPayload(result.current, antalBattleCol!, 0);

    act(() => {
      result.current.handleAddEvent(
        antalBattlePayload.ownerId, antalBattlePayload.columnId,
        antalBattlePayload.atFrame, antalBattlePayload.defaultSkill,
      );
    });

    // Chen battle skill x2 — Vulnerable + Lift
    const chenBattleCol = findColumn(result.current, SLOT_CHEN, NounType.BATTLE_SKILL);

    const chenPayload1 = getMenuPayload(result.current, chenBattleCol!, 0);
    act(() => {
      result.current.handleAddEvent(
        chenPayload1.ownerId, chenPayload1.columnId,
        chenPayload1.atFrame, chenPayload1.defaultSkill,
      );
    });

    const chenPayload2 = getMenuPayload(result.current, chenBattleCol!, 15 * FPS);
    act(() => {
      result.current.handleAddEvent(
        chenPayload2.ownerId, chenPayload2.columnId,
        chenPayload2.atFrame, chenPayload2.defaultSkill,
      );
    });

    // Count Vulnerable stacks before combo (2 from Chen's two battle skills)
    const vulnBefore = result.current.allProcessedEvents.filter(
      (ev) => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE && ev.ownerId === ENEMY_OWNER_ID,
    );
    expect(vulnBefore).toHaveLength(2);

    // Antal combo skill — triggered by Lift
    const antalComboCol = findColumn(result.current, SLOT_ANTAL, NounType.COMBO_SKILL);
    const comboPayload = getMenuPayload(result.current, antalComboCol!, 16 * FPS);

    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerId, comboPayload.columnId,
        comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    // ── Controller layer ────────────────────────────────────────────────
    // Combo should duplicate the trigger source (Lift -> adds another Vulnerable stack)
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
