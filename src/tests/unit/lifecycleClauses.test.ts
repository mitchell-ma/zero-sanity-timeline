/**
 * Lifecycle Clauses + Grammar Extensions — Unit Tests
 *
 * Tests:
 * - EXTEND UNTIL END: target shorter than parent → extended; target longer → no-op
 * - RECEIVE condition: fires when matching event starts at frame
 * - Empty onTriggerClause: statuses are NOT created as passive at frame 0
 */

// ── Mocks (must be before imports) ──────────────────────────────────────

jest.mock('../../model/event-frames/operatorJsonLoader', () => {
  const statusEvents = [
    {
      name: 'FOCUS',
      target: 'ENEMY',
      stack: { max: { P0: 1 }, instances: 1, verb: 'NONE' },
      onTriggerClause: [],
      properties: { duration: { value: { verb: VerbType.IS, value: 60 }, unit: UnitType.SECOND } },
    },
    {
      name: 'FOCUS_EMPOWERED',
      target: 'ENEMY',
      stack: { max: { P0: 1 }, instances: 1, verb: 'NONE' },
      onTriggerClause: [],
      properties: { duration: { value: { verb: VerbType.IS, value: 60 }, unit: UnitType.SECOND } },
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

// eslint-disable-next-line import/first
import { executeEffect, applyMutations } from '../../controller/timeline/effectExecutor';
// eslint-disable-next-line import/first
import type { ExecutionContext } from '../../controller/timeline/effectExecutor';
// eslint-disable-next-line import/first
import { evaluateInteraction } from '../../controller/timeline/conditionEvaluator';
// eslint-disable-next-line import/first
import type { ConditionContext } from '../../controller/timeline/conditionEvaluator';
// eslint-disable-next-line import/first
import { VerbType, DURATION_END, NounType } from '../../dsl/semantics';
// eslint-disable-next-line import/first
import type { Effect, Interaction } from '../../dsl/semantics';
// eslint-disable-next-line import/first
import { eventDuration } from '../../consts/viewTypes';
// eslint-disable-next-line import/first
import type { TimelineEvent } from '../../consts/viewTypes';
// eslint-disable-next-line import/first
import { EventStatusType, PhysicalStatusType, UnitType } from '../../consts/enums';

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

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    events: [],
    frame: 100,
    sourceOwnerId: 'slot1',
    sourceSkillName: 'TEST_SKILL',
    idCounter: 0,
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

describe('EXTEND UNTIL END', () => {
  test('extends target to parent end frame when target is shorter', () => {
    // Lift status: starts at frame 0, duration 600 (5s), ends at 600
    // Parent status: ends at frame 1200 (10s)
    // Expected: Lift extended from 600 to 1200
    const liftEvent = makeEvent({
      uid: 'lift-1',
      name: 'LIFT',
      columnId: PhysicalStatusType.LIFT,
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }],
    });

    const effect: Effect = {
      verb: VerbType.EXTEND,
      object: NounType.STATUS,
      objectId: 'LIFT',
      onObject: NounType.ENEMY,
      until: DURATION_END,
    };

    const ctx = makeCtx({
      events: [liftEvent],
      frame: 0,
      parentEventEndFrame: 1200,
    });

    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.clamped.size).toBe(1);
    const clamp = result.clamped.get('lift-1')!;
    expect(clamp.newDuration).toBe(1200); // extended to parent end
    expect(clamp.eventStatus).toBe(EventStatusType.EXTENDED);
  });

  test('does not shorten target when it is already longer than parent', () => {
    // Lift status: starts at frame 0, duration 2400 (20s), ends at 2400
    // Parent status: ends at frame 600 (5s)
    // Expected: no change (don't shorten)
    const liftEvent = makeEvent({
      uid: 'lift-1',
      name: 'LIFT',
      columnId: PhysicalStatusType.LIFT,
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 2400 } }],
    });

    const effect: Effect = {
      verb: VerbType.EXTEND,
      object: NounType.STATUS,
      objectId: 'LIFT',
      onObject: NounType.ENEMY,
      until: DURATION_END,
    };

    const ctx = makeCtx({
      events: [liftEvent],
      frame: 0,
      parentEventEndFrame: 600,
    });

    const result = executeEffect(effect, ctx);

    expect(result.failed).toBe(false);
    expect(result.clamped.size).toBe(0); // no change
  });

  test('extends mid-timeline target correctly', () => {
    // Lift starts at frame 300, duration 300 (ends at 600)
    // Parent ends at frame 1200
    // Expected: new duration = 1200 - 300 = 900
    const liftEvent = makeEvent({
      uid: 'lift-1',
      name: 'LIFT',
      columnId: PhysicalStatusType.LIFT,
      ownerId: 'enemy',
      startFrame: 300,
      segments: [{ properties: { duration: 300 } }],
    });

    const effect: Effect = {
      verb: VerbType.EXTEND,
      object: NounType.STATUS,
      objectId: 'LIFT',
      onObject: NounType.ENEMY,
      until: DURATION_END,
    };

    const ctx = makeCtx({
      events: [liftEvent],
      frame: 300,
      parentEventEndFrame: 1200,
    });

    const result = executeEffect(effect, ctx);

    expect(result.clamped.size).toBe(1);
    expect(result.clamped.get('lift-1')!.newDuration).toBe(900);
  });

  test('applyMutations correctly updates extended event', () => {
    const liftEvent = makeEvent({
      uid: 'lift-1',
      name: 'LIFT',
      columnId: PhysicalStatusType.LIFT,
      ownerId: 'enemy',
      startFrame: 0,
      segments: [{ properties: { duration: 600 } }],
    });

    const effect: Effect = {
      verb: VerbType.EXTEND,
      object: NounType.STATUS,
      objectId: 'LIFT',
      onObject: NounType.ENEMY,
      until: DURATION_END,
    };

    const ctx = makeCtx({
      events: [liftEvent],
      frame: 0,
      parentEventEndFrame: 1200,
    });

    const mutations = executeEffect(effect, ctx);
    const result = applyMutations([liftEvent], mutations);

    expect(result).toHaveLength(1);
    expect(eventDuration(result[0])).toBe(1200);
    expect(result[0].eventStatus).toBe(EventStatusType.EXTENDED);
  });
});

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

