/**
 * @jest-environment jsdom
 */

/**
 * Lone Barge — Suppression: Streaming Blitz integration test.
 *
 * Full-pipeline E2E for the new `subject: SKILL` DSL narrow. Lone Barge's
 * primary trigger fires when the wielder's **battle skill** consumes an arts
 * reaction — not basic attacks, not ultimates, not "any operator action that
 * happens while a reaction exists". The JSON was migrated from the looser
 * "THIS OPERATOR CONSUME STATUS REACTION" form to the causal
 * "BATTLE SKILL of THIS OPERATOR CONSUME ARTS REACTION STATUS from ENEMY"
 * form; this test validates both the engine end-to-end and the DSL migration.
 *
 * Setup: Zhuang Fangyi + Lone Barge. Zhuang's Mantra of Sundering (battle
 * skill) consumes Electrification on enemy. Lone Barge's onTriggerClause
 * matches → applies `LONE_BARGE_SUPPRESSION_STREAMING_BLITZ` on the wielder.
 *
 * Three-layer verification:
 *   1. Config: trigger JSON uses the new SKILL-subject grammar.
 *   2. Controller: trigger fires (status appears) on BS-caused consume only.
 *   3. View: status is visible on the operator status column.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType, AdjectiveType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { ColumnType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import {
  ENEMY_ID, ENEMY_GROUP_COLUMNS, REACTION_COLUMNS, OPERATOR_STATUS_COLUMN_ID,
} from '../../../model/channels';
import { injectStatusLevelIntoSegments } from '../../../controller/timeline/contextMenuController';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { buildContextMenu, findColumn, getMenuPayload, setUltimateEnergyToMax } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';
import type { MiniTimeline, EventSegmentData } from '../../../consts/viewTypes';
import { StatType } from '../../../model/enums/stats';
import { aggregateLoadoutStats } from '../../../controller/calculation/loadoutAggregator';

/* eslint-disable @typescript-eslint/no-require-imports */
const ZHUANG_ID: string = require('../../../model/game-data/operators/zhuang-fangyi/zhuang-fangyi.json').id;
const WEAPON_ID: string = require('../../../model/game-data/weapons/lone-barge/lone-barge.json').properties.id;
const LONE_BARGE_SKILL = require('../../../model/game-data/weapons/lone-barge/skills/skill-suppression-streaming-blitz.json');
const STREAMING_BLITZ_ID: string = require(
  '../../../model/game-data/weapons/lone-barge/statuses/status-lone-barge-streaming-blitz.json',
).properties.id;
const STREAMING_BLITZ_ULT_ID: string = require(
  '../../../model/game-data/weapons/lone-barge/statuses/status-lone-barge-streaming-blitz-ult.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ZF = 'slot-0';

beforeEach(() => { localStorage.clear(); });

// ── Setup helpers ────────────────────────────────────────────────────────────

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ZF, ZHUANG_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT_ZF, {
      weaponId: WEAPON_ID,
      armorId: null,
      glovesId: null,
      kit1Id: null,
      kit2Id: null,
      consumableId: null,
      tacticalId: null,
    });
  });
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

function findOperatorStatusColumn(app: AppResult): MiniTimeline | undefined {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE
      && c.ownerEntityId === SLOT_ZF
      && c.columnId === OPERATOR_STATUS_COLUMN_ID,
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

function placeBasicAttack(app: AppResult, atSec: number) {
  const col = findColumn(app, SLOT_ZF, NounType.BASIC_ATTACK);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atSec * FPS);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function findBlitzStacks(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.ownerEntityId === SLOT_ZF && ev.name === STREAMING_BLITZ_ID,
  );
}

function findBlitzUlt(app: AppResult) {
  return app.allProcessedEvents.filter(
    (ev) => ev.ownerEntityId === SLOT_ZF && ev.name === STREAMING_BLITZ_ULT_ID,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Config validation — the DSL uses SKILL subject with ARTS REACTION narrow
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Lone Barge config uses the SKILL-subject DSL', () => {
  it('A1: first onTriggerClause condition is "SKILL BATTLE of THIS OPERATOR CONSUME ARTS REACTION from ENEMY"', () => {
    const clause = LONE_BARGE_SKILL.onTriggerClause[0];
    const cond = clause.conditions[0];
    expect(cond.subject).toBe(NounType.SKILL);
    expect(cond.subjectDeterminer).toBe('THIS');
    expect(cond.subjectId).toBe(NounType.BATTLE);
    expect(cond.of).toEqual({ object: NounType.OPERATOR, determiner: 'THIS' });
    expect(cond.verb).toBe(VerbType.CONSUME);
    expect(cond.object).toBe(NounType.STATUS);
    expect(cond.objectId).toBe(NounType.REACTION);
    expect(cond.objectQualifier).toBe(AdjectiveType.ARTS);
    expect(cond.from).toBe(NounType.ENEMY);
  });

  it('A2: first clause effect applies LONE_BARGE_SUPPRESSION_STREAMING_BLITZ to the wielder', () => {
    const effect = LONE_BARGE_SKILL.onTriggerClause[0].effects[0];
    expect(effect.verb).toBe(VerbType.APPLY);
    expect(effect.object).toBe(NounType.STATUS);
    expect(effect.objectId).toBe(STREAMING_BLITZ_ID);
    expect(effect.to).toBe(NounType.OPERATOR);
    expect(effect.toDeterminer).toBe('THIS');
  });

  it('A3: second onTriggerClause still uses PERFORM ULTIMATE (unchanged)', () => {
    const clause = LONE_BARGE_SKILL.onTriggerClause[1];
    const cond = clause.conditions[0];
    expect(cond.subject).toBe(NounType.OPERATOR);
    expect(cond.verb).toBe(VerbType.PERFORM);
    expect(cond.objectId).toBe(NounType.ULTIMATE);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Positive — BS consumes arts reaction → Streaming Blitz applies
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Battle skill consumes arts reaction → Streaming Blitz fires', () => {
  it('B1: Mantra of Sundering consuming Electrification applies Streaming Blitz on the wielder', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBattleSkill(view.result.current, 2);

    // Controller layer: the Streaming Blitz status was applied on Zhuang's slot.
    const stacks = findBlitzStacks(view.result.current);
    expect(stacks.length).toBeGreaterThanOrEqual(1);
    expect(stacks[0].startFrame).toBeGreaterThanOrEqual(2 * FPS);
    expect(stacks[0].ownerEntityId).toBe(SLOT_ZF);
    expect(stacks[0].sourceEntityId).toBeDefined();
  });

  it('B2: the applied Streaming Blitz is visible in the operator status column view model', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBattleSkill(view.result.current, 2);

    const vms = computeTimelinePresentation(
      view.result.current.allProcessedEvents,
      view.result.current.columns,
    );
    const statusCol = findOperatorStatusColumn(view.result.current);
    expect(statusCol).toBeDefined();
    const vm = vms.get(statusCol!.key);
    expect(vm).toBeDefined();
    const applied = vm!.events.filter(ev => ev.name === STREAMING_BLITZ_ID);
    expect(applied.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Negative — trigger must NOT fire when the consume isn't BS-caused
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Non-BS actions do not fire Streaming Blitz', () => {
  it('C1: baseline — no BS placed, no consume, no Streaming Blitz', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    // No BS. No consume occurs.
    expect(findBlitzStacks(view.result.current)).toHaveLength(0);
  });

  it('C2: BS placed but no reaction to consume → no Streaming Blitz', () => {
    const view = setup();
    placeBattleSkill(view.result.current, 1);
    // No Electrification, so the BS's consume clause finds nothing.
    expect(findBlitzStacks(view.result.current)).toHaveLength(0);
  });

  it('C3: a basic attack placed with a reaction present does NOT fire the trigger', () => {
    const view = setup();
    placeElectrification(view.result.current, 2, 1);
    placeBasicAttack(view.result.current, 2);
    // Zhuang's BA (Jolting Arts) does not consume the reaction. The Lone
    // Barge trigger must see zero BS-caused consumes and stay idle.
    expect(findBlitzStacks(view.result.current)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Regression — the second (PERFORM ULTIMATE) clause still fires
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. PERFORM ULTIMATE clause still fires (regression)', () => {
  it('D1: casting the ultimate applies Streaming Blitz (Ultimate) on the wielder', () => {
    const view = setup();
    // Seed Zhuang's UE to max so the ult is castable.
    act(() => { setUltimateEnergyToMax(view.result.current, SLOT_ZF, 0); });
    const ultCol = findColumn(view.result.current, SLOT_ZF, NounType.ULTIMATE);
    expect(ultCol).toBeDefined();
    const payload = getMenuPayload(view.result.current, ultCol!, 2 * FPS);
    act(() => {
      view.result.current.handleAddEvent(
        payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });
    const ultStatuses = findBlitzUlt(view.result.current);
    expect(ultStatuses.length).toBeGreaterThanOrEqual(1);
    // And the arts-reaction trigger should NOT have fired (no BS consume happened).
    expect(findBlitzStacks(view.result.current)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Rank resolution — VARY_BY RANK uses the loadout weapon skill rank
// ═══════════════════════════════════════════════════════════════════════════════

// VARY_BY RANK array on LONE_BARGE_SUPPRESSION_STREAMING_BLITZ_STAT (passive).
const PASSIVE_ELEC_BY_RANK = [0.16, 0.192, 0.224, 0.256, 0.288, 0.32, 0.352, 0.384, 0.448];

describe('E. VARY_BY RANK resolves against the loadout weapon skill rank', () => {
  it('E1: Lone Barge passive Electric DMG Bonus at skill3Level=8 → rank-8 entry', () => {
    const view = setup();
    const props = view.result.current.loadoutProperties[SLOT_ZF];
    act(() => {
      view.result.current.handleStatsChange(SLOT_ZF, {
        ...props,
        weapon: { ...props.weapon, skill3Level: 8 },
      });
    });
    const loadout = view.result.current.loadouts[SLOT_ZF];
    const stats = view.result.current.loadoutProperties[SLOT_ZF];
    const agg = aggregateLoadoutStats(ZHUANG_ID, loadout, stats);
    expect(agg).not.toBeNull();
    const electricBonus = agg!.stats[StatType.ELECTRIC_DAMAGE_BONUS] ?? 0;
    expect(electricBonus).toBeCloseTo(PASSIVE_ELEC_BY_RANK[7], 5);
  });

  it('E2: Lone Barge passive at skill3Level=5 → rank-5 entry (not clamped to max)', () => {
    const view = setup();
    const props = view.result.current.loadoutProperties[SLOT_ZF];
    act(() => {
      view.result.current.handleStatsChange(SLOT_ZF, {
        ...props,
        weapon: { ...props.weapon, skill3Level: 5 },
      });
    });
    const loadout = view.result.current.loadouts[SLOT_ZF];
    const stats = view.result.current.loadoutProperties[SLOT_ZF];
    const agg = aggregateLoadoutStats(ZHUANG_ID, loadout, stats);
    const electricBonus = agg!.stats[StatType.ELECTRIC_DAMAGE_BONUS] ?? 0;
    expect(electricBonus).toBeCloseTo(PASSIVE_ELEC_BY_RANK[4], 5);
  });
});
