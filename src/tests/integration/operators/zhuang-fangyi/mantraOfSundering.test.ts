/**
 * @jest-environment jsdom
 */

/**
 * Zhuang Fangyi — Mantra of Sundering Integration Tests
 *
 * Verifies the Thunder Strike gating in the combat sheet: the number of
 * DEAL DAMAGE frames that reach the combat sheet must match the number of
 * active Sunderblade stacks when the battle skill fires.
 *
 * Frame layout (see battle-skill-mantra-of-sundering.json):
 *   Frame 0 @ 0.00s  — APPLY SUNDERBLADE, stacks = MIN(3, 1 + STATUS_LEVEL of ELECTRIFICATION of ENEMY)
 *   Frame 1 @ 0.50s  — gated by THIS OPERATOR HAVE STATUS SUNDERBLADE >= 2
 *   Frame 2 @ 0.65s  — gated by ... >= 3
 *   Frame 3 @ 0.80s  — gated by ... >= 4
 *   ...
 *   Frame 8 @ 1.55s  — gated by ... >= 9
 *   Frame 9 @ 1.70s  — unconditional final strike (6× multiplier)
 *
 * Each test pre-populates Sunderblade stacks via freeform, casts the battle
 * skill, then filters combat-sheet rows to the BS event and counts them.
 * Expected rows = clamp(preExisting + 1, 1, 9) — the "+1" is the APPLY at
 * frame 0 (with no Electrification active, APPLY contributes 1 stack).
 *
 * Guarded frames whose Sunderblade gate fails must be absent from the combat
 * sheet — not rendered as "-" placeholder rows.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { OPERATOR_STATUS_COLUMN_ID } from '../../../../model/channels';
import { findColumn, buildContextMenu } from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';
import { buildDamageTableRows } from '../../../../controller/calculation/damageTableBuilder';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../../../view/InformationPane';
import type { MiniTimeline } from '../../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const ZF_JSON = require('../../../../model/game-data/operators/zhuang-fangyi/zhuang-fangyi.json');
const ZF_ID: string = ZF_JSON.id;
const BS_JSON = require('../../../../model/game-data/operators/zhuang-fangyi/skills/battle-skill-mantra-of-sundering.json');
const BS_ID: string = BS_JSON.properties.id;
const SUNDERBLADE_ID: string = require(
  '../../../../model/game-data/operators/zhuang-fangyi/statuses/status-sunderblade.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ZF = 'slot-0';

/** Frame offset (from BS startFrame) where the final unconditional Thunder Strike fires. */
const FINAL_STRIKE_OFFSET_FRAMES = Math.round(1.7 * FPS);

beforeEach(() => { localStorage.clear(); });

// ── Setup helpers ────────────────────────────────────────────────────────────

function setupZhuangFangyi() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ZF, ZF_ID); });
  return view;
}

function findOperatorStatusColumn(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === SLOT_ZF &&
      c.columnId === OPERATOR_STATUS_COLUMN_ID,
  );
}

/** Place a single Sunderblade stack via freeform context menu on the operator-status column. */
function placeSunderblade(app: AppResult, atFrame: number) {
  const statusCol = findOperatorStatusColumn(app);
  expect(statusCol).toBeDefined();

  const menuItems = buildContextMenu(app, statusCol!, atFrame);
  expect(menuItems).not.toBeNull();

  const item = menuItems!.find(
    (i) =>
      i.actionId === 'addEvent' &&
      (i.actionPayload as AddEventPayload)?.columnId === SUNDERBLADE_ID,
  );
  expect(item).toBeDefined();
  expect(item!.disabled).toBeFalsy();
  const payload = item!.actionPayload as AddEventPayload;
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

/** Place N Sunderblade stacks at 0.1s intervals starting at `startSec`. */
function preApplySunderblades(result: { current: AppResult }, count: number, startSec: number) {
  if (count <= 0) return;
  act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  for (let i = 0; i < count; i++) {
    act(() => { placeSunderblade(result.current, Math.round((startSec + i * 0.1) * FPS)); });
  }
  act(() => { result.current.setInteractionMode(InteractionModeType.STRICT); });
}

function placeBattleSkill(app: AppResult, atFrame: number) {
  const bsCol = findColumn(app, SLOT_ZF, NounType.BATTLE);
  expect(bsCol).toBeDefined();
  app.handleAddEvent(SLOT_ZF, NounType.BATTLE, atFrame, bsCol!.defaultEvent!);
}

function findBattleSkillEvent(app: AppResult) {
  return app.allProcessedEvents.find(
    (ev) => ev.ownerEntityId === SLOT_ZF && ev.columnId === NounType.BATTLE && ev.id === BS_ID,
  );
}

function getBattleSkillDamageRows(app: AppResult, bsEventUid: string) {
  const loadoutStats: Record<string, typeof DEFAULT_LOADOUT_PROPERTIES> = {};
  for (const slot of app.slots) loadoutStats[slot.slotId] = DEFAULT_LOADOUT_PROPERTIES;
  const rows = buildDamageTableRows(
    app.allProcessedEvents, app.columns, app.slots, app.enemy, loadoutStats,
  );
  return rows.filter((r) => r.eventUid === bsEventUid);
}

function countActiveSunderblades(app: AppResult, atFrame: number) {
  return app.allProcessedEvents.filter(
    (ev) =>
      ev.ownerEntityId === SLOT_ZF &&
      ev.columnId === SUNDERBLADE_ID &&
      ev.startFrame <= atFrame &&
      ev.startFrame + ev.segments.reduce((s, seg) => s + seg.properties.duration, 0) > atFrame,
  ).length;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Mantra of Sundering — Sunderblade → damage-row count', () => {
  /**
   * Each row: `{ preExisting, expectedRows }` where `expectedRows` = the
   * number of DEAL DAMAGE frames that should survive gating (= the number of
   * active Sunderblade stacks the BS sees when its Thunder Strike frames fire,
   * capped at 9 since the gate array is [>=2..>=9]+final = 9 frames).
   */
  const CASES: Array<{ preExisting: number; expectedRows: number; description: string }> = [
    { preExisting: 0, expectedRows: 1, description: '1 active Sunderblade → final strike only' },
    { preExisting: 1, expectedRows: 2, description: '2 active → frame 1 gate passes + final' },
    { preExisting: 2, expectedRows: 3, description: '3 active → frames 1-2 gates pass + final' },
    { preExisting: 5, expectedRows: 6, description: '6 active → frames 1-5 gates pass + final' },
    { preExisting: 8, expectedRows: 9, description: '9 active (all gates pass) + final' },
  ];

  for (const { preExisting, expectedRows, description } of CASES) {
    it(`pre-existing ${preExisting} Sunderblades: ${description} → ${expectedRows} damage rows`, () => {
      const view = setupZhuangFangyi();
      const { result } = view;

      // Pre-apply Sunderblade stacks through the freeform context menu.
      preApplySunderblades(result, preExisting, 1);

      // Cast the battle skill; its frame-0 APPLY contributes 1 more stack
      // (STATUS_LEVEL of ELECTRIFICATION of ENEMY = 0 → MIN(3, 1+0) = 1).
      const bsStartSec = preExisting + 2; // always after all pre-applied events
      act(() => { placeBattleSkill(result.current, bsStartSec * FPS); });

      const bs = findBattleSkillEvent(result.current);
      expect(bs).toBeDefined();

      // Sanity: active Sunderblade count at the BS's first Thunder Strike frame
      // matches preExisting + 1 (the APPLY's contribution).
      const firstStrikeFrame = bs!.startFrame + Math.round(0.5 * FPS);
      expect(countActiveSunderblades(result.current, firstStrikeFrame)).toBe(preExisting + 1);

      const rows = getBattleSkillDamageRows(result.current, bs!.uid);
      expect(rows).toHaveLength(expectedRows);
    });
  }
});

describe('Mantra of Sundering — guarded frames never render as placeholder rows', () => {
  it('no pre-applied Sunderblades: combat sheet shows only real damage rows, never "-"', () => {
    const view = setupZhuangFangyi();
    const { result } = view;

    act(() => { placeBattleSkill(result.current, 5 * FPS); });

    const bs = findBattleSkillEvent(result.current);
    const rows = getBattleSkillDamageRows(result.current, bs!.uid);

    // With 1 active Sunderblade, only the final unconditional frame survives.
    expect(rows).toHaveLength(1);
    // No null-damage placeholder rows — every surviving row carries real damage.
    for (const row of rows) {
      expect(row.damage).not.toBeNull();
      expect(row.damage).toBeGreaterThan(0);
    }
    // The surviving row must be the final strike at offset 1.7s.
    expect(rows[0].absoluteFrame).toBe(bs!.startFrame + FINAL_STRIKE_OFFSET_FRAMES);
  });
});
