/**
 * @jest-environment jsdom
 */

/**
 * Control status × time-stop — Integration Tests
 *
 * Tests the full user flow through useApp:
 * 1. Control events are NOT extended by time-stops (duration stays raw)
 * 2. Control swap placed during time-stop gets a validation warning
 * 3. Control events can be dragged freely through ultimate animation zones
 * 4. Control events can be dragged past dodge events (no overlap clamping)
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { CombatSkillType, InteractionModeType } from '../../consts/enums';
import { OPERATOR_COLUMNS, SKILL_COLUMNS } from '../../model/channels';
import { eventDuration, getAnimationDuration } from '../../consts/viewTypes';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import type { MiniTimeline } from '../../consts/viewTypes';

const SLOT_0 = 'slot-0';
const SLOT_1 = 'slot-1';

function getControlEvents(app: ReturnType<typeof useApp>) {
  return app.allProcessedEvents.filter(
    (ev) => ev.id === CombatSkillType.CONTROL && ev.columnId === OPERATOR_COLUMNS.INPUT,
  );
}

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' && c.ownerId === slotId && c.columnId === columnId,
  );
}

describe('Control status × time-stop — integration through useApp', () => {
  describe('control events are NOT extended by time-stops', () => {
    it('control event duration unchanged when combo time-stop overlaps', () => {
      const { result } = renderHook(() => useApp());
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      const comboCol = findColumn(result.current, SLOT_0, SKILL_COLUMNS.COMBO);
      expect(comboCol).toBeDefined();

      // Place combo at frame 0 (creates a time-stop during its animation)
      act(() => {
        result.current.handleAddEvent(SLOT_0, SKILL_COLUMNS.COMBO, 0, comboCol!.defaultEvent!);
      });

      // Verify combo has animation duration (i.e. creates a time-stop)
      const comboEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerId === SLOT_0 && ev.columnId === SKILL_COLUMNS.COMBO,
      )!;
      const animDur = getAnimationDuration(comboEvent);
      expect(animDur).toBeGreaterThan(0);

      // Place control swap on slot-1 at frame 0 (overlaps combo time-stop)
      const swapDuration = TOTAL_FRAMES;
      act(() => {
        result.current.handleAddEvent(
          SLOT_1, OPERATOR_COLUMNS.INPUT, 0,
          { name: CombatSkillType.CONTROL, segments: [{ properties: { duration: swapDuration, name: 'Control' } }] },
        );
      });

      // The slot-1 control event should NOT be extended by the combo time-stop
      const slot1Control = getControlEvents(result.current).find(
        (ev) => ev.ownerId === SLOT_1,
      )!;
      expect(slot1Control).toBeDefined();
      // Seed was clamped to 0 duration, so slot-1 control starts at 0 with raw duration
      expect(eventDuration(slot1Control)).toBe(swapDuration);
    });

    it('control event duration unchanged when ultimate time-stop overlaps', () => {
      const { result } = renderHook(() => useApp());
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      const ultCol = findColumn(result.current, SLOT_0, SKILL_COLUMNS.ULTIMATE);
      if (!ultCol?.defaultEvent) return; // skip if no ultimate column

      // Place ultimate at 2s
      const ultFrame = 2 * FPS;
      act(() => {
        result.current.handleAddEvent(SLOT_0, SKILL_COLUMNS.ULTIMATE, ultFrame, ultCol.defaultEvent!);
      });

      const ultEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerId === SLOT_0 && ev.columnId === SKILL_COLUMNS.ULTIMATE,
      )!;
      const ultAnim = getAnimationDuration(ultEvent);
      expect(ultAnim).toBeGreaterThan(0);

      // Place control swap on slot-1 at 1s (before ult, but overlaps ult time-stop)
      const swapFrame = 1 * FPS;
      const rawDuration = TOTAL_FRAMES - swapFrame;
      act(() => {
        result.current.handleAddEvent(
          SLOT_1, OPERATOR_COLUMNS.INPUT, swapFrame,
          { name: CombatSkillType.CONTROL, segments: [{ properties: { duration: rawDuration, name: 'Control' } }] },
        );
      });

      // Control event should NOT be extended
      const slot1Control = getControlEvents(result.current).find(
        (ev) => ev.ownerId === SLOT_1,
      )!;
      expect(slot1Control).toBeDefined();
      expect(eventDuration(slot1Control)).toBe(rawDuration);
    });
  });

  describe('control swap during time-stop gets warning', () => {
    it('warns when control swap placed during combo time-stop', () => {
      const { result } = renderHook(() => useApp());
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      const comboCol = findColumn(result.current, SLOT_0, SKILL_COLUMNS.COMBO);
      expect(comboCol).toBeDefined();

      // Place combo at frame 0
      act(() => {
        result.current.handleAddEvent(SLOT_0, SKILL_COLUMNS.COMBO, 0, comboCol!.defaultEvent!);
      });

      const comboEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerId === SLOT_0 && ev.columnId === SKILL_COLUMNS.COMBO,
      )!;
      const animDur = getAnimationDuration(comboEvent);
      expect(animDur).toBeGreaterThan(0);

      // Place control swap INSIDE the combo time-stop
      const swapFrame = Math.floor(animDur / 2);
      expect(swapFrame).toBeGreaterThan(0);
      act(() => {
        result.current.handleAddEvent(
          SLOT_1, OPERATOR_COLUMNS.INPUT, swapFrame,
          { name: CombatSkillType.CONTROL, segments: [{ properties: { duration: TOTAL_FRAMES - swapFrame, name: 'Control' } }] },
        );
      });

      // The control event should have a time-stop warning
      const slot1Control = result.current.allProcessedEvents.find(
        (ev) => ev.id === CombatSkillType.CONTROL && ev.ownerId === SLOT_1,
      )!;
      expect(slot1Control).toBeDefined();
      expect(slot1Control.warnings).toBeDefined();
      expect(slot1Control.warnings!.some((w) => w.includes('Control swap'))).toBe(true);
    });
  });

  describe('control events drag freely past time-stop regions', () => {
    it('control event can be moved into ultimate animation zone', () => {
      const { result } = renderHook(() => useApp());
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      const ultCol = findColumn(result.current, SLOT_0, SKILL_COLUMNS.ULTIMATE);
      if (!ultCol?.defaultEvent) return;

      // Place ultimate at 3s
      const ultFrame = 3 * FPS;
      act(() => {
        result.current.handleAddEvent(SLOT_0, SKILL_COLUMNS.ULTIMATE, ultFrame, ultCol.defaultEvent!);
      });

      const ultEvent = result.current.allProcessedEvents.find(
        (ev) => ev.ownerId === SLOT_0 && ev.columnId === SKILL_COLUMNS.ULTIMATE,
      )!;
      const ultAnim = getAnimationDuration(ultEvent);
      expect(ultAnim).toBeGreaterThan(0);

      // Place control swap on slot-1 at 1s (before the ult)
      const initialFrame = 1 * FPS;
      act(() => {
        result.current.handleAddEvent(
          SLOT_1, OPERATOR_COLUMNS.INPUT, initialFrame,
          { name: CombatSkillType.CONTROL, segments: [{ properties: { duration: TOTAL_FRAMES - initialFrame, name: 'Control' } }] },
        );
      });

      // Find the raw control event uid
      const slot1Control = result.current.allProcessedEvents.find(
        (ev) => ev.id === CombatSkillType.CONTROL && ev.ownerId === SLOT_1
          && !ev.uid.startsWith('controlled-seed-'),
      )!;
      expect(slot1Control).toBeDefined();
      expect(slot1Control.startFrame).toBe(initialFrame);

      // Move control event INTO the ultimate animation zone
      const targetFrame = ultFrame + Math.floor(ultAnim / 2);
      const delta = targetFrame - initialFrame;
      act(() => {
        result.current.handleMoveEvents([slot1Control.uid], delta);
      });

      // Control event should be at the target frame (not clamped away)
      const movedControl = result.current.allProcessedEvents.find(
        (ev) => ev.uid === slot1Control.uid,
      )!;
      expect(movedControl).toBeDefined();
      expect(movedControl.startFrame).toBe(targetFrame);
    });

    it('control event can be moved past dodge event on same column', () => {
      const { result } = renderHook(() => useApp());
      act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      const inputCol = findColumn(result.current, SLOT_1, OPERATOR_COLUMNS.INPUT);
      expect(inputCol).toBeDefined();

      // Place a dodge on slot-1's input column at 3s
      const dodgeFrame = 3 * FPS;
      const dodgeVariant = inputCol!.eventVariants?.find((v) => v.isPerfectDodge);
      const dodgeDefault = dodgeVariant ?? inputCol!.defaultEvent!;
      act(() => {
        result.current.handleAddEvent(SLOT_1, OPERATOR_COLUMNS.INPUT, dodgeFrame, dodgeDefault);
      });

      // Place control swap on slot-1 at 1s (before the dodge)
      const initialFrame = 1 * FPS;
      act(() => {
        result.current.handleAddEvent(
          SLOT_1, OPERATOR_COLUMNS.INPUT, initialFrame,
          { name: CombatSkillType.CONTROL, segments: [{ properties: { duration: TOTAL_FRAMES - initialFrame, name: 'Control' } }] },
        );
      });

      const slot1Control = result.current.allProcessedEvents.find(
        (ev) => ev.id === CombatSkillType.CONTROL && ev.ownerId === SLOT_1
          && !ev.uid.startsWith('controlled-seed-'),
      )!;
      expect(slot1Control).toBeDefined();

      // Move control event past the dodge to 5s
      const targetFrame = 5 * FPS;
      const delta = targetFrame - initialFrame;
      act(() => {
        result.current.handleMoveEvents([slot1Control.uid], delta);
      });

      // Control event should be at 5s (not blocked by the dodge)
      const movedControl = result.current.allProcessedEvents.find(
        (ev) => ev.uid === slot1Control.uid,
      )!;
      expect(movedControl).toBeDefined();
      expect(movedControl.startFrame).toBe(targetFrame);
    });
  });
});
