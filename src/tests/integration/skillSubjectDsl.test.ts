/**
 * @jest-environment jsdom
 */

/**
 * SKILL-subject DSL — end-to-end integration.
 *
 * Exercises the full `useApp` → engine → causality pipeline to verify that the
 * new "BATTLE SKILL of THIS OPERATOR {CONSUME | APPLY} STATUS ..." narrow
 * correctly distinguishes skill categories in real event processing.
 *
 * Scenario: Zhuang Fangyi's Mantra of Sundering (battle skill) is defined in
 * production JSON to `CONSUME REACTION/ELECTRIFICATION from ENEMY` on hit. We
 * place an Electrification on the enemy via freeform, cast the BS, and assert:
 *   1. The processed timeline contains a consumed Electrification event.
 *   2. `getLastController().getCausality()` exposes a TRANSITION edge from the
 *      consumed event to a BATTLE-column source (engine-populated, not hand-built).
 *   3. `findClauseTriggerMatches` (Path 2) with SKILL subject narrows correctly:
 *      - subjectId=BATTLE matches.
 *      - subjectId=BASIC_ATTACK does NOT match.
 *   4. `evaluateInteraction` (Path 3) with SKILL subject narrows the same way.
 *   5. No match when causality is omitted — safely fails closed.
 *
 * This covers the two gaps called out in review: a real pipeline test with
 * engine-populated causality, and negative-case discrimination by skill category.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { NounType, VerbType, type Interaction } from '../../dsl/semantics';
import { ColumnType, InteractionModeType, EventStatusType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
import {
  ENEMY_ID, ENEMY_GROUP_COLUMNS, REACTION_COLUMNS,
} from '../../model/channels';
import { injectStatusLevelIntoSegments } from '../../controller/timeline/contextMenuController';
import { getLastController } from '../../controller/timeline/eventQueueController';
import {
  findClauseTriggerMatches,
  type Predicate,
} from '../../controller/timeline/triggerMatch';
import { evaluateInteraction } from '../../controller/timeline/conditionEvaluator';
import { buildContextMenu, findColumn, getMenuPayload } from './helpers';
import type { AppResult, AddEventPayload } from './helpers';
import type { MiniTimeline, EventSegmentData } from '../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const ZHUANG_ID: string = require('../../model/game-data/operators/zhuang-fangyi/zhuang-fangyi.json').id;
const BS_ID: string = require(
  '../../model/game-data/operators/zhuang-fangyi/skills/battle-skill-mantra-of-sundering.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ZF = 'slot-0';
const OTHER_SLOT = 'slot-1';

beforeEach(() => { localStorage.clear(); });

// ── Setup helpers ────────────────────────────────────────────────────────────

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ZF, ZHUANG_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function findEnemyStatusColumn(app: AppResult): MiniTimeline | undefined {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE
      && c.ownerEntityId === ENEMY_ID
      && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
}

function placeElectrification(app: AppResult, level: 1 | 2 | 3 | 4, atSec: number, durationSec = 20) {
  const atFrame = atSec * FPS;
  const col = findEnemyStatusColumn(app);
  expect(col).toBeDefined();
  const items = buildContextMenu(app, col!, atFrame);
  expect(items).not.toBeNull();
  const item = items!.find(
    (i) => i.actionId === 'addEvent'
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

function placeBattleSkill(app: AppResult, atSec: number) {
  const col = findColumn(app, SLOT_ZF, NounType.BATTLE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atSec * FPS);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

/** Build a SKILL-subject CONSUME condition for ELECTRIFICATION from ENEMY. */
function consumeClause(subjectId: string | undefined, ofDet = 'THIS'): Predicate[] {
  const cond = {
    subject: NounType.SKILL,
    subjectDeterminer: 'THIS',
    ...(subjectId != null ? { subjectId } : {}),
    of: { object: NounType.OPERATOR, determiner: ofDet },
    verb: VerbType.CONSUME,
    object: NounType.STATUS,
    objectId: NounType.REACTION,
    objectQualifier: 'ELECTRIFICATION',
    from: NounType.ENEMY,
  };
  return [cond as unknown as Predicate];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SKILL-subject DSL — full pipeline integration (Zhuang Fangyi BS → Electrification consume)', () => {
  it('engine populates TRANSITION causality edge from consumed reaction to the BS event', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBattleSkill(view.result.current, 2);

    const consumedEv = view.result.current.allProcessedEvents.find(
      ev => ev.columnId === REACTION_COLUMNS.ELECTRIFICATION
        && ev.ownerEntityId === ENEMY_ID
        && ev.eventStatus === EventStatusType.CONSUMED,
    );
    expect(consumedEv).toBeDefined();

    const causality = getLastController().getCausality();
    const srcUid = causality.lastTransitionSource(consumedEv!.uid);
    expect(srcUid).toBeDefined();

    const srcEv = view.result.current.allProcessedEvents.find(e => e.uid === srcUid);
    expect(srcEv).toBeDefined();
    expect(srcEv!.columnId).toBe(NounType.BATTLE);
    expect(srcEv!.ownerEntityId).toBe(SLOT_ZF);
    expect(srcEv!.id).toBe(BS_ID);
  });

  it('findClauseTriggerMatches (Path 2): subjectId=BATTLE matches the BS-caused consume', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBattleSkill(view.result.current, 2);

    const causality = getLastController().getCausality();
    const matches = findClauseTriggerMatches(
      [{ conditions: consumeClause(NounType.BATTLE) }],
      view.result.current.allProcessedEvents,
      SLOT_ZF,
      undefined, undefined, causality,
    );
    expect(matches.length).toBe(1);
  });

  it('findClauseTriggerMatches (Path 2): subjectId=BASIC_ATTACK rejects the BS-caused consume', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBattleSkill(view.result.current, 2);

    const causality = getLastController().getCausality();
    const matches = findClauseTriggerMatches(
      [{ conditions: consumeClause(NounType.BASIC_ATTACK) }],
      view.result.current.allProcessedEvents,
      SLOT_ZF,
      undefined, undefined, causality,
    );
    expect(matches.length).toBe(0);
  });

  it('findClauseTriggerMatches (Path 2): no subjectId narrow still matches (generic SKILL subject)', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBattleSkill(view.result.current, 2);

    const causality = getLastController().getCausality();
    const matches = findClauseTriggerMatches(
      [{ conditions: consumeClause(undefined) }],
      view.result.current.allProcessedEvents,
      SLOT_ZF,
      undefined, undefined, causality,
    );
    expect(matches.length).toBe(1);
  });

  it('findClauseTriggerMatches (Path 2): omitting causality fails closed (no false positives)', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBattleSkill(view.result.current, 2);

    const matches = findClauseTriggerMatches(
      [{ conditions: consumeClause(NounType.BATTLE) }],
      view.result.current.allProcessedEvents,
      SLOT_ZF,
      undefined, undefined, undefined,
    );
    expect(matches.length).toBe(0);
  });

  it('findClauseTriggerMatches (Path 2): of THIS OPERATOR on a different slot rejects', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBattleSkill(view.result.current, 2);

    const causality = getLastController().getCausality();
    // The BS belongs to SLOT_ZF. Querying from OTHER_SLOT with `of THIS OPERATOR`
    // means "the other slot's skill" — should not match the ZF-emitted consume.
    const matches = findClauseTriggerMatches(
      [{ conditions: consumeClause(NounType.BATTLE) }],
      view.result.current.allProcessedEvents,
      OTHER_SLOT,
      undefined, undefined, causality,
    );
    expect(matches.length).toBe(0);
  });

  it('evaluateInteraction (Path 3): subjectId=BATTLE evaluates true after the consume frame', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBattleSkill(view.result.current, 2);

    const causality = getLastController().getCausality();
    const cond: Interaction = consumeClause(NounType.BATTLE)[0] as unknown as Interaction;
    const result = evaluateInteraction(cond, {
      events: view.result.current.allProcessedEvents,
      frame: 10 * FPS, // well after the BS fires at ~2s
      sourceEntityId: SLOT_ZF,
      causality,
    });
    expect(result).toBe(true);
  });

  it('evaluateInteraction (Path 3): subjectId=BASIC_ATTACK evaluates false (BS did it)', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBattleSkill(view.result.current, 2);

    const causality = getLastController().getCausality();
    const cond: Interaction = consumeClause(NounType.BASIC_ATTACK)[0] as unknown as Interaction;
    const result = evaluateInteraction(cond, {
      events: view.result.current.allProcessedEvents,
      frame: 10 * FPS,
      sourceEntityId: SLOT_ZF,
      causality,
    });
    expect(result).toBe(false);
  });

  it('evaluateInteraction (Path 3): query at a frame before the BS fires returns false', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBattleSkill(view.result.current, 2); // BS starts at 2s

    const causality = getLastController().getCausality();
    const cond: Interaction = consumeClause(NounType.BATTLE)[0] as unknown as Interaction;
    const result = evaluateInteraction(cond, {
      events: view.result.current.allProcessedEvents,
      frame: 1 * FPS, // before BS — the consume hasn't happened yet
      sourceEntityId: SLOT_ZF,
      causality,
    });
    expect(result).toBe(false);
  });

  it('evaluateInteraction (Path 3): no consume at all → false (baseline sanity check)', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    // No BS placed — nothing consumes the electrification.

    const causality = getLastController().getCausality();
    const cond: Interaction = consumeClause(NounType.BATTLE)[0] as unknown as Interaction;
    const result = evaluateInteraction(cond, {
      events: view.result.current.allProcessedEvents,
      frame: 10 * FPS,
      sourceEntityId: SLOT_ZF,
      causality,
    });
    expect(result).toBe(false);
  });
});
