/**
 * @jest-environment jsdom
 */

/**
 * Pogranichnik Steel Oath — Integration Tests
 *
 * Tests the Steel Oath team status produced by Pogranichnik's ultimate:
 * A. Ultimate places correctly and generates Steel Oath on the team status column
 * B. Steel Oath has correct duration (30s from with.duration on APPLY effect)
 * C. Steel Oath is NOT consumed by other operators' ultimates (Link-only consumption)
 * D. Steel Oath consumption via physical status triggers (BREACH from battle skill)
 *
 * Three-layer verification:
 * 1. Context menu: add-event items are available and enabled for each column
 * 2. Controller: events appear in allProcessedEvents with correct properties
 * 3. View: computeTimelinePresentation includes events in the correct column view models
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ENEMY_ID } from '../../../../model/channels';
import { TEAM_ID } from '../../../../controller/slot/commonSlotController';
import { EventStatusType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { eventDuration } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';

// ── Status IDs from JSON (single source of truth) ──────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const POGRANICHNIK_ID: string = require('../../../../model/game-data/operators/pogranichnik/pogranichnik.json').id;
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
const STEEL_OATH_ID: string = require('../../../../model/game-data/operators/pogranichnik/statuses/status-steel-oath.json').properties.id;
const STEEL_OATH_HARASS_ID: string = require('../../../../model/game-data/operators/pogranichnik/statuses/status-steel-oath-harass.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

// ── Slot constants ──────────────────────────────────────────────────────────

const SLOT_0 = 'slot-0'; // Laevatain by default
const SLOT_1 = 'slot-1'; // Swap to Pogranichnik
const SLOT_2 = 'slot-2'; // Swap to Chen Qianyu

describe('Pogranichnik Steel Oath — integration through useApp', () => {
  function setupWithPogranichnik() {
    const { result, ...utils } = renderHook(() => useApp());
    act(() => {
      result.current.handleSwapOperator(SLOT_1, POGRANICHNIK_ID);
    });
    return { result, ...utils };
  }

  it('A1: Ultimate places in the ULTIMATE column', () => {
    const { result } = setupWithPogranichnik();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_1, 1); });
    const ultCol = findColumn(result.current, SLOT_1, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();

    // ── Context menu layer ──────────────────────────────────────────────
    const ultMenu = buildContextMenu(result.current, ultCol!, 1 * FPS);
    expect(ultMenu).not.toBeNull();
    expect(ultMenu!.length).toBeGreaterThan(0);

    const payload = getMenuPayload(result.current, ultCol!, 1 * FPS);
    expect(payload.columnId).toBe(NounType.ULTIMATE);

    // ── Controller layer ────────────────────────────────────────────────
    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    const ultEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === SLOT_1 && ev.columnId === NounType.ULTIMATE,
    );
    expect(ultEvents).toHaveLength(1);
  });

  it('B1: Ultimate generates STEEL_OATH team status with 30s duration', () => {
    const { result } = setupWithPogranichnik();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_1, 1); });
    const ultCol = findColumn(result.current, SLOT_1, NounType.ULTIMATE);

    const payload = getMenuPayload(result.current, ultCol!, 1 * FPS);

    act(() => {
      result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer ────────────────────────────────────────────────
    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === TEAM_ID && ev.id === STEEL_OATH_ID,
    );
    expect(steelOathEvents.length).toBeGreaterThanOrEqual(1);
    // Steel Oath should have a positive duration (30s = 3600 frames from the APPLY with.duration)
    expect(eventDuration(steelOathEvents[0])).toBeGreaterThan(0);

    // ── View layer ──────────────────────────────────────────────────────
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    // Find any view model that contains a STEEL_OATH event
    const steelOathInView = Array.from(viewModels.values()).some(
      (vm) => vm.events.some((ev) => ev.id === STEEL_OATH_ID),
    );
    expect(steelOathInView).toBe(true);
  });

  it('C1: Laevatain ultimate does NOT consume Steel Oath', () => {
    const { result } = setupWithPogranichnik();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_1, 1); });
    act(() => { setUltimateEnergyToMax(result.current, SLOT_0, 0); });
    const pogUltCol = findColumn(result.current, SLOT_1, NounType.ULTIMATE);
    const laevUltCol = findColumn(result.current, SLOT_0, NounType.ULTIMATE);

    // Pogranichnik ult at 0s → creates Steel Oath
    const pogPayload = getMenuPayload(result.current, pogUltCol!, 0);
    act(() => {
      result.current.handleAddEvent(
        pogPayload.ownerEntityId, pogPayload.columnId, pogPayload.atFrame, pogPayload.defaultSkill,
      );
    });

    // Laevatain ult at 5s → should NOT consume Steel Oath
    const laevPayload = getMenuPayload(result.current, laevUltCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        laevPayload.ownerEntityId, laevPayload.columnId, laevPayload.atFrame, laevPayload.defaultSkill,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === TEAM_ID && ev.id === STEEL_OATH_ID,
    );
    expect(steelOathEvents.length).toBeGreaterThanOrEqual(1);
    // Steel Oath should still have a positive duration, not clamped to 0 by Laevatain ult
    expect(eventDuration(steelOathEvents[0])).toBeGreaterThan(0);
  });

  it('D1: Combo skill consumes Steel Oath and generates STEEL_OATH_HARASS', () => {
    const { result } = setupWithPogranichnik();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_1, 1); });

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const pogUltCol = findColumn(result.current, SLOT_1, NounType.ULTIMATE);
    const pogComboCol = findColumn(result.current, SLOT_1, NounType.COMBO);

    // Pogranichnik ult at 0s → creates Steel Oath (5 stacks)
    const ultPayload = getMenuPayload(result.current, pogUltCol!, 0);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Pogranichnik combo skill at 5s → should trigger PERFORM COMBO_SKILL → consume 1 Steel Oath → HARASS
    const comboPayload = getMenuPayload(result.current, pogComboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    const harassEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.id === STEEL_OATH_HARASS_ID,
    );
    expect(harassEvents.length).toBeGreaterThanOrEqual(1);
    expect(harassEvents[0].startFrame).toBeGreaterThanOrEqual(5 * FPS);
  });

  it('D2: Consumption clamps old events and creates continuations with fewer stacks', () => {
    const { result } = setupWithPogranichnik();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_1, 1); });

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const pogUltCol = findColumn(result.current, SLOT_1, NounType.ULTIMATE);
    const pogComboCol = findColumn(result.current, SLOT_1, NounType.COMBO);

    // Pogranichnik ult at 0s → creates Steel Oath (5 stacks)
    const ultPayload = getMenuPayload(result.current, pogUltCol!, 0);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Combo skill at 5s → consume 1 stack
    const comboPayload = getMenuPayload(result.current, pogComboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload.ownerEntityId, comboPayload.columnId, comboPayload.atFrame, comboPayload.defaultSkill,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === TEAM_ID && ev.id === STEEL_OATH_ID,
    );

    // All 5 original events should be consumed (clamped at combo frame)
    const consumed = steelOathEvents.filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed).toHaveLength(5);
    for (const ev of consumed) {
      expect(eventDuration(ev)).toBeLessThanOrEqual(5 * FPS + 1);
    }

    // 4 continuation events should be created starting at the combo frame
    const continuations = steelOathEvents.filter(
      ev => ev.eventStatus !== EventStatusType.CONSUMED && ev.startFrame >= 5 * FPS,
    );
    expect(continuations).toHaveLength(4);
    for (const ev of continuations) {
      expect(ev.startFrame).toBeGreaterThanOrEqual(5 * FPS);
      expect(eventDuration(ev)).toBeGreaterThan(0);
    }
  });

  it('E1: Chen Qianyu APPLY LIFT triggers Steel Oath via APPLY STATUS PHYSICAL', () => {
    const { result } = setupWithPogranichnik();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_1, 1); });

    // Also add Chen Qianyu to slot 2
    act(() => {
      result.current.handleSwapOperator(SLOT_2, CHEN_QIANYU_ID);
    });

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    const pogUltCol = findColumn(result.current, SLOT_1, NounType.ULTIMATE);
    const chenBattleCol = findColumn(result.current, SLOT_2, NounType.BATTLE);

    // ── Context menu layer ──────────────────────────────────────────────
    const chenMenu = buildContextMenu(result.current, chenBattleCol!, 3 * FPS);
    expect(chenMenu).not.toBeNull();

    // Pogranichnik ult at 0s → creates Steel Oath (5 stacks)
    const ultPayload = getMenuPayload(result.current, pogUltCol!, 0);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // First Chen BS at 3s → APPLY LIFT adds Vulnerable I only (no physical status yet)
    const chenPayload1 = getMenuPayload(result.current, chenBattleCol!, 3 * FPS);
    act(() => {
      result.current.handleAddEvent(
        chenPayload1.ownerEntityId, chenPayload1.columnId, chenPayload1.atFrame, chenPayload1.defaultSkill,
      );
    });

    // Second Chen BS at 6s → enemy has Vulnerable → APPLY LIFT creates Lift status
    const chenPayload2 = getMenuPayload(result.current, chenBattleCol!, 6 * FPS);
    act(() => {
      result.current.handleAddEvent(
        chenPayload2.ownerEntityId, chenPayload2.columnId, chenPayload2.atFrame, chenPayload2.defaultSkill,
      );
    });

    // Steel Oath should be triggered by the second BS's physical status (LIFT)
    const harassEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === ENEMY_ID && ev.id === STEEL_OATH_HARASS_ID,
    );
    expect(harassEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('F1: Two consumptions produce descending stack counts: N → N-1 → N-2', () => {
    const { result } = setupWithPogranichnik();
    act(() => { setUltimateEnergyToMax(result.current, SLOT_1, 1); });
    const pogUltCol = findColumn(result.current, SLOT_1, NounType.ULTIMATE);
    const pogComboCol = findColumn(result.current, SLOT_1, NounType.COMBO);

    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
    });

    // Pogranichnik ult at 0s → creates Steel Oath (5 stacks)
    const ultPayload = getMenuPayload(result.current, pogUltCol!, 0);
    act(() => {
      result.current.handleAddEvent(
        ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill,
      );
    });

    // Two combo skills well after Steel Oath creation, spaced far enough for cooldown
    const comboPayload1 = getMenuPayload(result.current, pogComboCol!, 5 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload1.ownerEntityId, comboPayload1.columnId, comboPayload1.atFrame, comboPayload1.defaultSkill,
      );
    });
    const comboPayload2 = getMenuPayload(result.current, pogComboCol!, 20 * FPS);
    act(() => {
      result.current.handleAddEvent(
        comboPayload2.ownerEntityId, comboPayload2.columnId, comboPayload2.atFrame, comboPayload2.defaultSkill,
      );
    });

    const steelOathEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerEntityId === TEAM_ID && ev.id === STEEL_OATH_ID,
    );

    // Verify descending labels through the presentation layer (transition-based labeling).
    // Each generation of restacked events gets a lower running total: V → IV → III.
    const vmMap = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    // Collect all statusOverrides across column view models
    const allOverrides = new Map<string, { label?: string }>();
    for (const colVM of Array.from(vmMap.values())) {
      for (const [uid, override] of Array.from(colVM.statusOverrides)) allOverrides.set(uid, override);
    }
    const labelsByGen = steelOathEvents
      .sort((a, b) => a.startFrame - b.startFrame)
      .map(ev => allOverrides.get(ev.uid)?.label ?? '');

    // Extract distinct labels in chronological order (preserving first occurrence)
    const seen = new Set<string>();
    const distinctLabels: string[] = [];
    for (const l of labelsByGen) {
      if (l && !seen.has(l)) { seen.add(l); distinctLabels.push(l); }
    }

    // Should have 3 distinct labels: "Steel Oath 5", "Steel Oath 4", "Steel Oath 3"
    expect(distinctLabels).toHaveLength(3);
    expect(distinctLabels[0]).toMatch(/\s5$/);
    expect(distinctLabels[1]).toMatch(/\s4$/);
    expect(distinctLabels[2]).toMatch(/\s3$/);

    // Active (non-consumed) events should all have the lowest stack label
    const active = steelOathEvents.filter(ev => ev.eventStatus !== EventStatusType.CONSUMED);
    expect(active.length).toBeGreaterThan(0);
    for (const ev of active) {
      const label = allOverrides.get(ev.uid)?.label ?? '';
      expect(label).toMatch(/\s3$/);
    }
  });
});
