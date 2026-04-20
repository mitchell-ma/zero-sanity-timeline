/**
 * @jest-environment jsdom
 */

/**
 * Zhuang Fangyi — Breath of Transformation: consume electric infliction,
 * apply forced ELECTRIFICATION at incremented statusLevel, recover UE per stack.
 *
 * Frame 1 (offset 0.5s) of the CS conditionally fires (when ENEMY HAVE INFLICTION ELECTRIC):
 *   APPLY  REACTION/ELECTRIFICATION TO ENEMY (isForced=1, statusLevel=ADD(1, current))
 *   RECOVER ULTIMATE_ENERGY = MULT(10, STACKS of ELECTRIC INFLICTION)
 *   CONSUME REACTION/ELECTRIFICATION (no — INFLICTION/ELECTRIC) FROM ENEMY (stacks: MAX)
 *
 * Effect order: APPLY → RECOVER → CONSUME. APPLY/RECOVER read live state
 * before CONSUME clamps the infliction.
 *
 * Verifies:
 *   - Forced ELECTRIFICATION is created with no initial-frame damage marker (forced reactions skip it).
 *   - statusLevel = 1 + current ELECTRIFICATION level, capped at 4 (engine cap from stacks.level).
 *   - Forced duration = FORCED_REACTION_DURATION[ELECTRIFICATION] (5s).
 *   - Electric inflictions get consumed.
 *   - UE recovered = 10 × pre-CS ELECTRIC infliction stacks.
 *   - No electric infliction → conditional clause skipped (no forced reaction, no UE).
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { NounType } from '../../../../dsl/semantics';
import { ColumnType, InteractionModeType, EventStatusType } from '../../../../consts/enums';
import { eventDuration, type MiniTimeline, type EventSegmentData } from '../../../../consts/viewTypes';
import { FPS } from '../../../../utils/timeline';
import {
  ENEMY_ID,
  ENEMY_GROUP_COLUMNS,
  INFLICTION_COLUMNS,
  REACTION_COLUMNS,
  FORCED_REACTION_DURATION,
  ultimateGraphKey,
} from '../../../../model/channels';
import { injectStatusLevelIntoSegments } from '../../../../controller/timeline/contextMenuController';
import { buildContextMenu, findColumn, getMenuPayload } from '../../helpers';
import type { AppResult, AddEventPayload } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ZHUANG_ID: string = require('../../../../model/game-data/operators/zhuang-fangyi/zhuang-fangyi.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ZHUANG = 'slot-0';

beforeEach(() => { localStorage.clear(); });

// ── Setup helpers ────────────────────────────────────────────────────────────

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ZHUANG, ZHUANG_ID); });
  // Freeform mode: bypasses the CS activation-window gating so we can place
  // the combo directly without staging the FINAL_STRIKE/FINISHER trigger chain.
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function placeElectricInflictions(app: AppResult, count: number, atSec = 0, durationSec = 20) {
  for (let i = 0; i < count; i++) {
    act(() => {
      app.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.ELECTRIC, atSec * FPS + i * 10,
        { name: INFLICTION_COLUMNS.ELECTRIC, segments: [{ properties: { duration: durationSec * FPS } }] },
      );
    });
  }
}

function findEnemyStatusColumn(app: AppResult): MiniTimeline | undefined {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE
      && c.ownerEntityId === ENEMY_ID
      && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
}

/** Place a freeform ELECTRIFICATION at the given time/level. Routes through the
 *  context-menu wrapper so the inner derived reaction picks up statusLevel via
 *  the wrapper APPLY's `with.statusLevel` (same flow ContextMenu.tsx uses for
 *  the picker submenu). Direct handleAddEvent w/ defaultSkill.statusLevel won't
 *  work — reactions are spawned by the inner APPLY clause, not the wrapper event. */
function placeElectrification(app: AppResult, level: 1 | 2 | 3 | 4, atSec = 0, durationSec = 20) {
  const atFrame = atSec * FPS;
  const enemyCol = findEnemyStatusColumn(app);
  expect(enemyCol).toBeDefined();
  const items = buildContextMenu(app, enemyCol!, atFrame);
  expect(items).not.toBeNull();
  const item = items!.find(
    (i) =>
      i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload | undefined)?.columnId === REACTION_COLUMNS.ELECTRIFICATION,
  );
  expect(item).toBeDefined();
  const payload = item!.actionPayload as AddEventPayload;
  const base = payload.defaultSkill as { segments?: EventSegmentData[] };
  const sized = base.segments
    ? base.segments.map((s, i) => i === 0
        ? { ...s, properties: { ...s.properties, duration: durationSec * FPS } }
        : s)
    : undefined;
  const leveled = injectStatusLevelIntoSegments(sized, level);
  const defaultSkill = { ...payload.defaultSkill, segments: leveled ?? sized };
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, atFrame, defaultSkill);
  });
}

function placeCS(app: AppResult, atSec: number) {
  const col = findColumn(app, SLOT_ZHUANG, NounType.COMBO);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atSec * FPS);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function getElectrification(app: AppResult, after = 0) {
  return app.allProcessedEvents
    .filter(ev => ev.columnId === REACTION_COLUMNS.ELECTRIFICATION
      && ev.ownerEntityId === ENEMY_ID
      && ev.startFrame >= after)
    .sort((a, b) => a.startFrame - b.startFrame);
}

function getElectricInflictions(app: AppResult) {
  return app.allProcessedEvents.filter(
    ev => ev.columnId === INFLICTION_COLUMNS.ELECTRIC && ev.ownerEntityId === ENEMY_ID,
  );
}

function maxUEFrom(app: AppResult, fromFrame: number): number {
  const graph = app.resourceGraphs.get(ultimateGraphKey(SLOT_ZHUANG));
  if (!graph) return 0;
  const post = graph.points.filter(p => p.frame >= fromFrame);
  return post.length === 0 ? 0 : Math.max(...post.map(p => p.value));
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Single electric infliction → forced ELECTRIFICATION + UE
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. CS with 1 electric infliction stack', () => {
  it('A1: applies forced ELECTRIFICATION at L1 (no prior reaction)', () => {
    const { result } = setup();
    placeElectricInflictions(result.current, 1, 0);
    placeCS(result.current, 5);

    const csFrame = 5 * FPS;
    const created = getElectrification(result.current, csFrame).find(ev => ev.isForced);
    expect(created).toBeDefined();
    expect(created!.statusLevel).toBe(1);
  });

  it('A2: forced ELECTRIFICATION has no initial-frame damage marker', () => {
    const { result } = setup();
    placeElectricInflictions(result.current, 1, 0);
    placeCS(result.current, 5);

    const csFrame = 5 * FPS;
    const created = getElectrification(result.current, csFrame).find(ev => ev.isForced);
    expect(created).toBeDefined();
    // Forced reactions skip the offset-0 "initial hit" frame the non-forced
    // reaction segment builder emits. Either no segment frames at all, or no
    // frame at offset 0.
    const seg = created!.segments[0];
    const initialFrame = seg.frames?.find(f => f.offsetFrame === 0);
    expect(initialFrame).toBeUndefined();
  });

  it('A3: forced ELECTRIFICATION duration = FORCED_REACTION_DURATION (5s)', () => {
    const { result } = setup();
    placeElectricInflictions(result.current, 1, 0);
    placeCS(result.current, 5);

    const csFrame = 5 * FPS;
    const created = getElectrification(result.current, csFrame).find(ev => ev.isForced);
    expect(created).toBeDefined();
    expect(eventDuration(created!)).toBe(FORCED_REACTION_DURATION[REACTION_COLUMNS.ELECTRIFICATION]);
  });

  it('A4: electric infliction is consumed', () => {
    const { result } = setup();
    placeElectricInflictions(result.current, 1, 0);
    placeCS(result.current, 5);
    const consumed = getElectricInflictions(result.current).filter(ev => ev.eventStatus === EventStatusType.CONSUMED);
    expect(consumed.length).toBeGreaterThanOrEqual(1);
  });

  it('A5: UE recovered = 10 (10 × 1 stack)', () => {
    const { result } = setup();
    placeElectricInflictions(result.current, 1, 0);
    placeCS(result.current, 5);
    expect(maxUEFrom(result.current, 5 * FPS)).toBeGreaterThanOrEqual(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. statusLevel increment: ADD(1, current ELECTRIFICATION level)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. statusLevel increments existing ELECTRIFICATION', () => {
  it('B1: pre-existing ELECTRIFICATION L2 + CS → forced ELECTRIFICATION at L3', () => {
    const { result } = setup();
    placeElectrification(result.current, 2, 0);
    placeElectricInflictions(result.current, 1, 1);
    placeCS(result.current, 5);

    const csFrame = 5 * FPS;
    const forced = getElectrification(result.current, csFrame).find(ev => ev.isForced);
    expect(forced).toBeDefined();
    expect(forced!.statusLevel).toBe(3);
  });

  it('B2: pre-existing ELECTRIFICATION L3 + CS → forced ELECTRIFICATION at L4', () => {
    const { result } = setup();
    placeElectrification(result.current, 3, 0);
    placeElectricInflictions(result.current, 1, 1);
    placeCS(result.current, 5);

    const csFrame = 5 * FPS;
    const forced = getElectrification(result.current, csFrame).find(ev => ev.isForced);
    expect(forced).toBeDefined();
    expect(forced!.statusLevel).toBe(4);
  });

  it('B3: pre-existing ELECTRIFICATION L4 + CS → forced ELECTRIFICATION CAPS at L4 (engine cap)', () => {
    const { result } = setup();
    placeElectrification(result.current, 4, 0);
    placeElectricInflictions(result.current, 1, 1);
    placeCS(result.current, 5);

    const csFrame = 5 * FPS;
    const forced = getElectrification(result.current, csFrame).find(ev => ev.isForced);
    expect(forced).toBeDefined();
    // ADD(1, 4) = 5, but stacks.level cap = 4, engine clamps in doApply.
    expect(forced!.statusLevel).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. UE recovery scales with electric infliction stacks
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. UE recovery scales with electric infliction stacks', () => {
  it('C1: 3 stacks → UE recovered ≥ 30', () => {
    const { result } = setup();
    placeElectricInflictions(result.current, 3, 0);
    placeCS(result.current, 5);
    expect(maxUEFrom(result.current, 5 * FPS)).toBeGreaterThanOrEqual(30);
  });

  it('C2: 4 stacks → UE recovered ≥ 40', () => {
    const { result } = setup();
    placeElectricInflictions(result.current, 4, 0);
    placeCS(result.current, 5);
    expect(maxUEFrom(result.current, 5 * FPS)).toBeGreaterThanOrEqual(40);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Conditional clause skipped when no electric infliction
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Conditional clause is skipped without electric infliction', () => {
  it('D1: no electric infliction → no forced ELECTRIFICATION, no UE recovered', () => {
    const { result } = setup();
    placeCS(result.current, 5);

    const csFrame = 5 * FPS;
    expect(getElectrification(result.current, csFrame)).toHaveLength(0);
    expect(maxUEFrom(result.current, csFrame)).toBe(0);
  });
});
