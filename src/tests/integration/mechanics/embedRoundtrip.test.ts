/**
 * @jest-environment jsdom
 */

/**
 * Embed roundtrip — verifies that buildSheetData produces valid state
 * that preserves skill columns. If skill columns disappear after
 * sharing and reloading, this test catches it.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { ColumnType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';
import type { MiniTimeline } from '../../../consts/viewTypes';

const SLOT_IDS = ['slot-0', 'slot-1', 'slot-2', 'slot-3'];
const SKILL_COLUMN_IDS = [NounType.BASIC_ATTACK, NounType.BATTLE_SKILL, NounType.COMBO_SKILL, NounType.ULTIMATE];

function getSkillColumns(app: AppResult, slotId: string) {
  return app.columns.filter(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      SKILL_COLUMN_IDS.includes(c.columnId as NounType),
  );
}

describe('Embed roundtrip — skill columns preserved', () => {
  it('default loadout has 4 skill columns per operator', () => {
    const { result } = renderHook(() => useApp());

    for (const slotId of SLOT_IDS) {
      const skillCols = getSkillColumns(result.current, slotId);
      expect(skillCols.length).toBe(4);
      const columnIds = skillCols.map(c => c.columnId);
      for (const expected of SKILL_COLUMN_IDS) {
        expect(columnIds).toContain(expected);
      }
    }
  });

  it('buildSheetData produces visibleSkills with all skill types enabled', () => {
    const { result } = renderHook(() => useApp());

    const sheetData = result.current.buildSheetData();
    expect(sheetData.visibleSkills).toBeDefined();

    for (const slotId of SLOT_IDS) {
      const slotSkills = sheetData.visibleSkills[slotId];
      expect(slotSkills).toBeDefined();
      for (const key of SKILL_COLUMN_IDS) {
        expect(slotSkills[key]).toBe(true);
      }
    }
  });

  it('after adding events, buildSheetData still has valid visibleSkills', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Add a battle skill event
    const bsCol = findColumn(result.current, 'slot-0', NounType.BATTLE_SKILL);
    expect(bsCol).toBeDefined();
    const payload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Skill columns still exist
    for (const slotId of SLOT_IDS) {
      expect(getSkillColumns(result.current, slotId).length).toBe(4);
    }

    // buildSheetData has valid visibleSkills
    const sheetData = result.current.buildSheetData();
    for (const slotId of SLOT_IDS) {
      const slotSkills = sheetData.visibleSkills[slotId];
      expect(slotSkills).toBeDefined();
      for (const key of SKILL_COLUMN_IDS) {
        expect(slotSkills[key]).toBe(true);
      }
    }
  });
});
