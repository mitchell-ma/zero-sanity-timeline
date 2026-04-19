/**
 * @jest-environment jsdom
 */

/**
 * Chen Qianyu — Momentum Breaker (T2) talent self-trigger tests.
 *
 * Trigger conditions (ANDed per clause, OR-ed across clauses):
 *   THIS OPERATOR PERFORM SKILL BATTLE|COMBO|ULTIMATE
 *   AND ENEMY HAVE CHARGE
 *
 * On trigger: CONSUME CHARGE from enemy, APPLY THIS EVENT (2s segment with
 * 0s-offset frame dealing STAGGER scaled by talent level [0, 5, 10]).
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import {
  ColumnType,
  EnemyActionType,
  InteractionModeType,
} from '../../../../consts/enums';
import { ENEMY_ACTION_LABELS } from '../../../../consts/timelineColumnLabels';
import { ENEMY_ACTION_COLUMN_ID, ENEMY_ID } from '../../../../model/channels';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { findColumn, getMenuPayload } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
const MOMENTUM_BREAKER_JSON = require('../../../../model/game-data/operators/chen-qianyu/talents/talent-momentum-breaker-talent.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const MOMENTUM_BREAKER_ID: string = MOMENTUM_BREAKER_JSON.properties.id;

const SLOT_CHEN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupChen() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  // Set talent two (Momentum Breaker) to max so the VARY_BY TALENT_LEVEL
  // resolves to a non-zero stagger payload.
  act(() => {
    const props = view.result.current.loadoutProperties[SLOT_CHEN];
    view.result.current.handleStatsChange(SLOT_CHEN, {
      ...props,
      operator: { ...props.operator, talentTwoLevel: 2 },
    });
  });
  return view;
}

function placeEnemyCharge(app: AppResult, atFrame: number) {
  const enemyCol = app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ENEMY_ID &&
      c.columnId === ENEMY_ACTION_COLUMN_ID,
  );
  expect(enemyCol).toBeDefined();
  const payload = getMenuPayload(
    app, enemyCol!, atFrame, ENEMY_ACTION_LABELS[EnemyActionType.CHARGE],
  );
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function placeSkill(app: AppResult, skillColumn: string, atFrame: number) {
  const col = findColumn(app, SLOT_CHEN, skillColumn);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function momentumBreakerEvents(app: AppResult) {
  return app.allProcessedEvents.filter(
    ev => ev.ownerEntityId === SLOT_CHEN
      && (ev.id === MOMENTUM_BREAKER_ID || ev.name === MOMENTUM_BREAKER_ID)
      && ev.startFrame > 0,
  );
}

describe('Chen Qianyu — Momentum Breaker self-triggers on BS/CS/ULT + ENEMY HAVE CHARGE', () => {
  it('battle skill + enemy CHARGE → Momentum Breaker applied to Chen (+ stagger baked in)', () => {
    const { result } = setupChen();

    // CHARGE window: frame 120 → 360 (duration 240f = 2s at 120fps)
    // Skill must fire inside that window.
    act(() => { placeEnemyCharge(result.current, 1 * FPS); });
    act(() => { placeSkill(result.current, NounType.BATTLE, 2 * FPS); });

    const events = momentumBreakerEvents(result.current);
    expect(events.length).toBeGreaterThanOrEqual(1);

    // The MB segment's 0s-offset frame deals stagger — after apply-time
    // resolution, VARY_BY TALENT_LEVEL baked to IS literal (10 at T2 max).
    const mb = events[0];
    const staggerEffects = (mb.segments ?? [])
      .flatMap(s => s.frames ?? [])
      .flatMap(f => f.clause ?? [])
      .flatMap(c => c.effects ?? [])
      .filter(dsl => dsl?.verb === VerbType.DEAL && dsl?.object === NounType.STAGGER);
    expect(staggerEffects.length).toBeGreaterThanOrEqual(1);
    const val = staggerEffects[0].with?.value as { verb?: string; value?: number } | undefined;
    expect(val?.verb).toBe(VerbType.IS);
    expect(val?.value).toBe(10);
  });

  it('combo skill + enemy CHARGE → Momentum Breaker applied to Chen', () => {
    const { result } = setupChen();

    act(() => { placeEnemyCharge(result.current, 1 * FPS); });
    act(() => { placeSkill(result.current, NounType.COMBO, 2 * FPS); });

    const events = momentumBreakerEvents(result.current);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('ultimate + enemy CHARGE → Momentum Breaker applied to Chen', () => {
    const { result } = setupChen();

    act(() => { placeEnemyCharge(result.current, 1 * FPS); });
    act(() => { placeSkill(result.current, NounType.ULTIMATE, 2 * FPS); });

    const events = momentumBreakerEvents(result.current);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('battle skill WITHOUT enemy CHARGE → Momentum Breaker NOT applied', () => {
    const { result } = setupChen();

    act(() => { placeSkill(result.current, NounType.BATTLE, 2 * FPS); });

    const events = momentumBreakerEvents(result.current);
    expect(events.length).toBe(0);
  });
});
