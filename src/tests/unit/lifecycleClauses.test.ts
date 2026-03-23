/**
 * Lifecycle Clauses + Grammar Extensions — Unit Tests
 *
 * Tests:
 * - EXTEND UNTIL END: target shorter than parent → extended; target longer → no-op
 * - RECEIVE condition: fires when matching event starts at frame
 * - Empty onTriggerClause: statuses are NOT created as passive at frame 0
 */

import { evaluateInteraction } from '../../controller/timeline/conditionEvaluator';
import type { ConditionContext } from '../../controller/timeline/conditionEvaluator';
import { VerbType, NounType } from '../../dsl/semantics';
import type { Interaction } from '../../dsl/semantics';
import type { TimelineEvent } from '../../consts/viewTypes';
import { PhysicalStatusType } from '../../consts/enums';

// ── Mocks ──────────────────────────────────────────────────────────────

jest.mock('../../model/event-frames/operatorJsonLoader', () => {
  const { VerbType: MockVerbType } = jest.requireActual('../../dsl/semantics');
  const { UnitType: MockUnitType } = jest.requireActual('../../consts/enums');
  const statusEvents = [
    {
      name: 'FOCUS',
      target: 'ENEMY',
      stack: { max: { P0: 1 }, instances: 1, verb: 'NONE' },
      onTriggerClause: [],
      properties: { duration: { value: { verb: MockVerbType.IS, value: 60 }, unit: MockUnitType.SECOND } },
    },
    {
      name: 'FOCUS_EMPOWERED',
      target: 'ENEMY',
      stack: { max: { P0: 1 }, instances: 1, verb: 'NONE' },
      onTriggerClause: [],
      properties: { duration: { value: { verb: MockVerbType.IS, value: 60 }, unit: MockUnitType.SECOND } },
    },
  ];
  const mockJson = { statusEvents, skillTypeMap: {} };
  return {
    getOperatorJson: (id: string) => id === 'antal' ? mockJson : undefined,
    getAllOperatorIds: () => ['antal'],
    getSkillIds: () => new Set(['EXCHANGE_CURRENT', 'SPECIFIED_RESEARCH_SUBJECT']),
    getSkillTypeMap: () => ({}),
    getExchangeStatusConfig: () => ({}),
    getExchangeStatusIds: () => new Set(),
  };
});
jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; ownerId: string }): TimelineEvent {
  return {
    id: overrides.name ?? 'TEST',
    name: 'TEST',
    startFrame: 0,
    segments: [{ properties: { duration: 2400 } }],
    ...overrides,
  };
}


function makeCondCtx(overrides: Partial<ConditionContext> = {}): ConditionContext {
  return {
    events: [],
    frame: 100,
    sourceOwnerId: 'slot1',
    ...overrides,
  };
}

// ── EXTEND UNTIL END ─────────────────────────────────────────────────────

// EXTEND UNTIL END was removed — verb is a no-op in both executor and interpretor.

// ── RECEIVE condition ────────────────────────────────────────────────────

describe('RECEIVE condition', () => {
  test('fires when matching event starts at exactly the current frame', () => {
    const liftEvent = makeEvent({
      uid: 'lift-1',
      name: 'LIFT',
      columnId: PhysicalStatusType.LIFT,
      ownerId: 'enemy',
      startFrame: 100,
      segments: [{ properties: { duration: 600 } }],
    });

    const cond: Interaction = {
      subject: NounType.ENEMY,
      verb: VerbType.RECEIVE,
      object: NounType.STATUS,
      objectId: 'LIFT',
    };

    const ctx = makeCondCtx({ events: [liftEvent], frame: 100 });
    expect(evaluateInteraction(cond, ctx)).toBe(true);
  });

  test('does not fire when event started before current frame', () => {
    const liftEvent = makeEvent({
      uid: 'lift-1',
      name: 'LIFT',
      columnId: PhysicalStatusType.LIFT,
      ownerId: 'enemy',
      startFrame: 50,
      segments: [{ properties: { duration: 600 } }],
    });

    const cond: Interaction = {
      subject: NounType.ENEMY,
      verb: VerbType.RECEIVE,
      object: NounType.STATUS,
      objectId: 'LIFT',
    };

    const ctx = makeCondCtx({ events: [liftEvent], frame: 100 });
    expect(evaluateInteraction(cond, ctx)).toBe(false);
  });

  test('does not fire when no matching events exist', () => {
    const cond: Interaction = {
      subject: NounType.ENEMY,
      verb: VerbType.RECEIVE,
      object: NounType.STATUS,
      objectId: 'LIFT',
    };

    const ctx = makeCondCtx({ events: [], frame: 100 });
    expect(evaluateInteraction(cond, ctx)).toBe(false);
  });

  test('fires for each matching event at the same frame', () => {
    const lift1 = makeEvent({
      uid: 'lift-1',
      name: 'LIFT',
      columnId: PhysicalStatusType.LIFT,
      ownerId: 'enemy',
      startFrame: 100,
      segments: [{ properties: { duration: 600 } }],
    });
    const lift2 = makeEvent({
      uid: 'lift-2',
      name: 'LIFT',
      columnId: PhysicalStatusType.LIFT,
      ownerId: 'enemy',
      startFrame: 100,
      segments: [{ properties: { duration: 300 } }],
    });

    const cond: Interaction = {
      subject: NounType.ENEMY,
      verb: VerbType.RECEIVE,
      object: NounType.STATUS,
      objectId: 'LIFT',
    };

    const ctx = makeCondCtx({ events: [lift1, lift2], frame: 100 });
    expect(evaluateInteraction(cond, ctx)).toBe(true);
  });

  test('does not match wrong objectId', () => {
    const breachEvent = makeEvent({
      uid: 'breach-1',
      name: 'BREACH',
      columnId: PhysicalStatusType.BREACH,
      ownerId: 'enemy',
      startFrame: 100,
      segments: [{ properties: { duration: 600 } }],
    });

    const cond: Interaction = {
      subject: NounType.ENEMY,
      verb: VerbType.RECEIVE,
      object: NounType.STATUS,
      objectId: 'LIFT',
    };

    const ctx = makeCondCtx({ events: [breachEvent], frame: 100 });
    expect(evaluateInteraction(cond, ctx)).toBe(false);
  });
});

