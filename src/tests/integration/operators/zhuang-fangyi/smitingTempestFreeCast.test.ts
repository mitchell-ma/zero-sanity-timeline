/**
 * @jest-environment jsdom
 */

/**
 * Zhuang Fangyi — Smiting Tempest "free cast" invariants.
 *
 * During the ultimate Smiting Tempest, the first Mantra of Sundering cast on an
 * available target neither consumes SP nor consumes Electrification; it's a
 * "free cast". The engine models this by applying a `SMITING_TEMPEST_BATTLE`
 * status on ult entry. The enhanced battle skill's segment-1 SP CONSUME and
 * its frame-0 Electrification CONSUME are both gated on
 * `NOT HAVE SMITING_TEMPEST_BATTLE`, so both CONSUMEs skip while the status is
 * present. A separate unconditional CONSUME SMITING_TEMPEST_BATTLE clause
 * clears the free-cast flag afterwards.
 *
 * Setup mirrors the shared sheet linked on the PR:
 *   - ZF loaded at slot-0, ultimate energy pre-filled
 *   - Electrification placed on the enemy at frame 0 (via freeform submenu)
 *   - Ultimate cast at frame 0 → applies SMITING_TEMPEST_BATTLE
 *   - Enhanced battle skill cast during the active ult window
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  ColumnType, ContextMenuAxisKind, EventStatusType, InteractionModeType,
} from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import {
  ENEMY_ID, ENEMY_GROUP_COLUMNS, REACTION_COLUMNS,
} from '../../../../model/channels';
import { TEAM_ID, COMMON_COLUMN_IDS } from '../../../../controller/slot/commonSlotController';
import { injectStatusLevelIntoSegments } from '../../../../controller/timeline/contextMenuController';
import {
  buildContextMenu, findColumn, setUltimateEnergyToMax,
} from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';
import type { MiniTimeline, EventSegmentData } from '../../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const ZF_ID: string = require('../../../../model/game-data/operators/zhuang-fangyi/zhuang-fangyi.json').id;
const BS_ENHANCED_ID: string = require('../../../../model/game-data/operators/zhuang-fangyi/skills/battle-skill-mantra-of-sundering-enhanced.json').properties.id;
const SMITING_TEMPEST_BATTLE_ID: string = require('../../../../model/game-data/operators/zhuang-fangyi/statuses/status-smiting-tempest-battle.json').properties.id;
const SUNDERBLADE_ID: string = require('../../../../model/game-data/operators/zhuang-fangyi/statuses/status-sunderblade.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ZF = 'slot-0';
const EBS_CAST_FRAME = 482; // ~8.03s — inside the 25s ult active window after the 2s animation.
const SP_GRAPH_KEY = `${TEAM_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;

beforeEach(() => { localStorage.clear(); });

// ── Setup helpers ────────────────────────────────────────────────────────────

function setupZfReady() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ZF, ZF_ID); });
  act(() => { setUltimateEnergyToMax(view.result.current, SLOT_ZF, 0); });
  return view;
}

function placeElectrificationOnEnemy(app: AppResult, atFrame: number) {
  const col = app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE
      && c.ownerEntityId === ENEMY_ID
      && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
  expect(col).toBeDefined();
  const items = buildContextMenu(app, col!, atFrame);
  expect(items).not.toBeNull();
  const item = items!.find(i => {
    const p = i.actionPayload as { columnId?: string } | undefined;
    return i.actionId === 'addEvent' && p?.columnId === REACTION_COLUMNS.ELECTRIFICATION;
  });
  expect(item).toBeDefined();
  expect(item!.disabled).toBeFalsy();
  const axis = item!.parameterSubmenu!.find(a => a.kind === ContextMenuAxisKind.STATUS_LEVEL);
  expect(axis).toBeDefined();
  const payload = item!.actionPayload as AddEventPayload;
  const base = payload.defaultSkill as { segments?: EventSegmentData[] };
  const segments = injectStatusLevelIntoSegments(base.segments, 1);
  const defaultSkill = segments ? { ...base, segments } : base;
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, atFrame, defaultSkill);
  });
}

function castUltimate(app: AppResult, atFrame: number) {
  const ultCol = findColumn(app, SLOT_ZF, NounType.ULTIMATE);
  expect(ultCol).toBeDefined();
  act(() => { app.handleAddEvent(SLOT_ZF, NounType.ULTIMATE, atFrame, ultCol!.defaultEvent!); });
}

function castEnhancedBattleSkill(app: AppResult, atFrame: number) {
  const bsCol = findColumn(app, SLOT_ZF, NounType.BATTLE);
  expect(bsCol).toBeDefined();
  const menu = buildContextMenu(app, bsCol!, atFrame);
  expect(menu).not.toBeNull();
  const item = menu!.find(m => {
    const p = m.actionPayload as { defaultSkill?: { id?: string } } | undefined;
    return m.actionId === 'addEvent' && p?.defaultSkill?.id === BS_ENHANCED_ID;
  });
  if (!item) {
    const probe = menu!
      .filter(m => m.actionId === 'addEvent')
      .map(m => {
        const p = m.actionPayload as { defaultSkill?: { id?: string } } | undefined;
        return `${p?.defaultSkill?.id ?? '?'}${m.disabled ? ` (disabled: ${m.disabledReason})` : ''}`;
      })
      .join(', ');
    throw new Error(`No enhanced BS variant available. Menu: ${probe}`);
  }
  const payload = item.actionPayload as AddEventPayload;
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function spAtFrame(app: AppResult, frame: number): number {
  const graph = app.resourceGraphs.get(SP_GRAPH_KEY);
  expect(graph).toBeDefined();
  const pts = graph!.points;
  expect(pts.length).toBeGreaterThan(0);
  // Resource graphs are step functions — the value at `frame` is the latest
  // point whose frame is ≤ `frame`.
  let latest = pts[0].value;
  for (const p of pts) {
    if (p.frame <= frame) latest = p.value;
    else break;
  }
  return latest;
}

function findBattleSkillEvent(app: AppResult) {
  return app.allProcessedEvents.find(
    ev => ev.ownerEntityId === SLOT_ZF && ev.columnId === NounType.BATTLE && ev.id === BS_ENHANCED_ID,
  );
}

function findSmitingTempestBattleStatus(app: AppResult) {
  return app.allProcessedEvents.find(
    ev => ev.ownerEntityId === SLOT_ZF && ev.columnId === SMITING_TEMPEST_BATTLE_ID,
  );
}

function findActiveElectrification(app: AppResult, atFrame: number) {
  return app.allProcessedEvents.find((ev) => {
    if (ev.columnId !== REACTION_COLUMNS.ELECTRIFICATION || ev.ownerEntityId !== ENEMY_ID) return false;
    if (ev.eventStatus === EventStatusType.CONSUMED) return false;
    const end = ev.startFrame + ev.segments.reduce((s, seg) => s + seg.properties.duration, 0);
    return ev.startFrame <= atFrame && atFrame < end;
  });
}

/** Count active Sunderblade stacks (sum of `stacks` across live events). */
function countActiveSunderblades(app: AppResult, atFrame: number) {
  let total = 0;
  for (const ev of app.allProcessedEvents) {
    if (ev.ownerEntityId !== SLOT_ZF || ev.columnId !== SUNDERBLADE_ID) continue;
    if (ev.eventStatus === EventStatusType.CONSUMED) continue;
    const end = ev.startFrame + ev.segments.reduce((s, seg) => s + seg.properties.duration, 0);
    if (ev.startFrame <= atFrame && atFrame < end) total += ev.stacks ?? 1;
  }
  return total;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Smiting Tempest — EBS cast during ult: free cast (no SP, no Electrification consume)', () => {
  it('routes the battle skill to MANTRA_OF_SUNDERING_ENHANCED while Smiting Tempest is active', () => {
    const view = setupZfReady();
    const app = view.result.current;
    castUltimate(app, 0);
    castEnhancedBattleSkill(view.result.current, EBS_CAST_FRAME);

    const bs = findBattleSkillEvent(view.result.current);
    expect(bs).toBeDefined();
    expect(bs!.id).toBe(BS_ENHANCED_ID);
  });

  it('does NOT consume SP — SP level is identical before and after the EBS cast frame', () => {
    const view = setupZfReady();
    const app = view.result.current;
    castUltimate(app, 0);
    castEnhancedBattleSkill(view.result.current, EBS_CAST_FRAME);

    const bs = findBattleSkillEvent(view.result.current);
    expect(bs).toBeDefined();

    // Sanity: Smiting Tempest Battle status is active at the EBS cast frame —
    // this is the gate that blocks the SP consume.
    const stBattle = findSmitingTempestBattleStatus(view.result.current);
    expect(stBattle).toBeDefined();
    expect(stBattle!.startFrame).toBeLessThanOrEqual(bs!.startFrame);

    // 1 frame before cast vs. 2 frames after the segment clause fires (the SP
    // consume, if it fired, would drop the graph by 100 at the segment entry).
    const before = spAtFrame(view.result.current, bs!.startFrame - 1);
    const after = spAtFrame(view.result.current, bs!.startFrame + 2);
    expect(after).toBe(before);
  });

  it('does NOT consume Electrification — the reaction on the enemy survives the EBS cast', () => {
    const view = setupZfReady();
    const app = view.result.current;
    act(() => { app.setInteractionMode(InteractionModeType.FREEFORM); });
    placeElectrificationOnEnemy(view.result.current, 0);
    act(() => { view.result.current.setInteractionMode(InteractionModeType.STRICT); });

    castUltimate(view.result.current, 0);
    castEnhancedBattleSkill(view.result.current, EBS_CAST_FRAME);

    const bs = findBattleSkillEvent(view.result.current);
    expect(bs).toBeDefined();

    // Post-EBS-frame: electrification event must still be present and not
    // marked CONSUMED. Checked a few frames past the cast, well after the
    // frame-0 CONSUME clause would have fired if it were ungated.
    const afterCastFrame = bs!.startFrame + Math.round(0.2 * FPS);
    const el = findActiveElectrification(view.result.current, afterCastFrame);
    expect(el).toBeDefined();
    expect(el!.eventStatus).not.toBe(EventStatusType.CONSUMED);
  });

  it('applies 3 Sunderblades on the free cast even when the enemy has NO Electrification', () => {
    const view = setupZfReady();
    const app = view.result.current;
    // Deliberately DO NOT place any Electrification on the enemy.
    castUltimate(app, 0);
    castEnhancedBattleSkill(view.result.current, EBS_CAST_FRAME);

    const bs = findBattleSkillEvent(view.result.current);
    expect(bs).toBeDefined();

    // Sanity: the enemy has no Electrification at cast time.
    expect(findActiveElectrification(view.result.current, bs!.startFrame)).toBeUndefined();

    // APPLY SUNDERBLADE uses MAX(MULT(stacks_of_SMITING_TEMPEST_BATTLE, 3),
    // MIN(3, 1 + electrification_level)). Free-cast window → left branch = 3,
    // no Electrification → right branch = 1, MAX = 3. Checked a few frames
    // after the cast so the APPLY has landed on the Sunderblade column.
    const checkFrame = bs!.startFrame + 2;
    expect(countActiveSunderblades(view.result.current, checkFrame)).toBe(3);
  });

  it('consumes SMITING_TEMPEST_BATTLE itself — free cast flag clears after the EBS', () => {
    const view = setupZfReady();
    const app = view.result.current;
    castUltimate(app, 0);
    castEnhancedBattleSkill(view.result.current, EBS_CAST_FRAME);

    const bs = findBattleSkillEvent(view.result.current);
    expect(bs).toBeDefined();

    // Earlier in the ult window the status is active; post-EBS the status
    // has been consumed, so the next EBS would consume SP + Electrification
    // normally.
    const stBattle = findSmitingTempestBattleStatus(view.result.current);
    expect(stBattle).toBeDefined();
    const preCastFrame = bs!.startFrame - 1;
    const preEnd = stBattle!.startFrame + stBattle!.segments.reduce((s, seg) => s + seg.properties.duration, 0);
    expect(stBattle!.startFrame).toBeLessThanOrEqual(preCastFrame);
    expect(preCastFrame).toBeLessThan(preEnd);
    // Post-cast the status's effective window ends at or before the EBS frame
    // (CONSUME shrinks its duration to the cast frame).
    expect(stBattle!.eventStatus).toBe(EventStatusType.CONSUMED);
    const postEnd = stBattle!.startFrame + stBattle!.segments.reduce((s, seg) => s + seg.properties.duration, 0);
    expect(postEnd).toBeLessThanOrEqual(bs!.startFrame);
  });
});
