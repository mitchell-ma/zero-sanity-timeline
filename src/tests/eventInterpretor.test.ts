/**
 * EventInterpretor Tests
 *
 * Validates the DSL interpreter with canDo/do verb dispatch:
 * - APPLY INFLICTION, STATUS, REACTION
 * - CONSUME INFLICTION, STATUS, REACTION
 * - ALL compound with FOR AT_MOST (absorption pattern)
 * - ANY first-match predicate evaluation
 * - Validation against VERB_OBJECTS
 * - Resource/display verbs are no-ops
 */

// ── Mock require.context before importing modules that use it ────────────

jest.mock('../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => null,
  getSkillIds: () => new Set(),
  getAllOperatorIds: () => [],
  getSkillTypeMap: () => ({}),
  getExchangeStatusConfig: () => ({}),
  getExchangeStatusIds: () => new Set(),
}));
jest.mock('../model/game-data/weaponGearEffectLoader', () => ({
  getWeaponEffectDefs: () => [],
  getGearEffectDefs: () => [],
}));
jest.mock('../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// eslint-disable-next-line import/first
import { TimelineEvent } from '../consts/viewTypes';
// eslint-disable-next-line import/first
import { EventStatusType } from '../consts/enums';
// eslint-disable-next-line import/first
import { INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID } from '../model/channels';
// eslint-disable-next-line import/first
import { DerivedEventController } from '../controller/timeline/derivedEventController';
// eslint-disable-next-line import/first
import { EventInterpretor } from '../controller/timeline/eventInterpretor';
// eslint-disable-next-line import/first
import type { InterpretContext } from '../controller/timeline/eventInterpretor';
// eslint-disable-next-line import/first
import { VerbType, AdjectiveType, CardinalityConstraintType, NounType, ObjectType, WithValueVerb } from '../consts/semantics';
// eslint-disable-next-line import/first
import type { Effect } from '../consts/semantics';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeInterpretor() {
  const ctrl = new DerivedEventController();
  return new EventInterpretor(ctrl, []);
}

function makeCtx(interp: EventInterpretor, overrides?: Partial<InterpretContext>): InterpretContext {
  return {
    frame: 100,
    sourceOwnerId: 'op-1',
    sourceSkillName: 'TEST_SKILL',
    allEvents: () => [...interp.controller.getRegisteredEvents(), ...interp.controller.output],
    ...overrides,
  };
}

function makeInflictionEvent(columnId: string, startFrame: number, duration = 120): TimelineEvent {
  return {
    id: `infliction-${columnId}-${startFrame}`,
    name: columnId,
    ownerId: ENEMY_OWNER_ID,
    columnId,
    startFrame,
    activationDuration: duration,
    activeDuration: 0,
    cooldownDuration: 0,
  };
}

function makeStatusEvent(columnId: string, ownerId: string, startFrame: number, duration = 2400): TimelineEvent {
  return {
    id: `status-${columnId}-${startFrame}`,
    name: columnId.toUpperCase().replace(/-/g, '_'),
    ownerId,
    columnId,
    startFrame,
    activationDuration: duration,
    activeDuration: 0,
    cooldownDuration: 0,
  };
}

// ── APPLY tests ──────────────────────────────────────────────────────────

describe('EventInterpretor: APPLY', () => {
  test('APPLY HEAT INFLICTION creates infliction event', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const effect: Effect = {
      verb: VerbType.APPLY,
      object: ObjectType.INFLICTION,
      adjective: AdjectiveType.HEAT,
      toObject: NounType.ENEMY,
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(true);
    expect(interp.controller.output.length).toBe(1);
    expect(interp.controller.output[0].columnId).toBe(INFLICTION_COLUMNS.HEAT);
    expect(interp.controller.output[0].ownerId).toBe(ENEMY_OWNER_ID);
    expect(interp.controller.output[0].startFrame).toBe(100);
  });

  test('APPLY STATUS creates status event', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const effect: Effect = {
      verb: VerbType.APPLY,
      object: ObjectType.STATUS,
      objectId: 'FOCUS',
      toObject: NounType.OPERATOR,
      with: {
        duration: { verb: 'IS' as WithValueVerb, value: 10 },
      },
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(true);
    expect(interp.controller.output.length).toBe(1);
    expect(interp.controller.output[0].columnId).toBe('focus');
    expect(interp.controller.output[0].ownerId).toBe('op-1');
    expect(interp.controller.output[0].activationDuration).toBe(1200);
  });

  test('APPLY COMBUSTION REACTION creates reaction event', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const effect: Effect = {
      verb: VerbType.APPLY,
      object: ObjectType.REACTION,
      adjective: AdjectiveType.COMBUSTION,
      toObject: NounType.ENEMY,
      with: {
        statusLevel: { verb: 'IS' as WithValueVerb, value: 2 },
      },
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(true);
    expect(interp.controller.output.length).toBe(1);
    expect(interp.controller.output[0].columnId).toBe(REACTION_COLUMNS.COMBUSTION);
    expect(interp.controller.output[0].statusLevel).toBe(2);
  });

  test('APPLY with invalid object returns false', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const effect: Effect = {
      verb: VerbType.APPLY,
      object: ObjectType.DAMAGE,
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(false);
    consoleSpy.mockRestore();
  });
});

// ── CONSUME tests ────────────────────────────────────────────────────────

describe('EventInterpretor: CONSUME', () => {
  test('CONSUME HEAT INFLICTION consumes oldest infliction', () => {
    const interp = makeInterpretor();
    // Pre-populate with heat inflictions
    const infliction = makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 50, 200);
    interp.controller.addEvent(infliction);

    const ctx = makeCtx(interp);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const effect: Effect = {
      verb: VerbType.CONSUME,
      object: ObjectType.INFLICTION,
      adjective: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
      with: {
        stacks: { verb: 'IS' as WithValueVerb, value: 1 },
      },
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(true);
    expect(infliction.eventStatus).toBe(EventStatusType.CONSUMED);
    consoleSpy.mockRestore();
  });

  test('CONSUME INFLICTION fails when none active', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const effect: Effect = {
      verb: VerbType.CONSUME,
      object: ObjectType.INFLICTION,
      adjective: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
      with: {
        stacks: { verb: 'IS' as WithValueVerb, value: 1 },
      },
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(false);
    consoleSpy.mockRestore();
  });

  test('CONSUME STATUS clamps active status', () => {
    const interp = makeInterpretor();
    const status = makeStatusEvent('melting-flame', 'op-1', 50, 2400);
    interp.controller.addEvent(status);

    const ctx = makeCtx(interp);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const effect: Effect = {
      verb: VerbType.CONSUME,
      object: ObjectType.STATUS,
      objectId: 'MELTING_FLAME',
      fromObject: NounType.OPERATOR,
      with: {
        stacks: { verb: 'IS' as WithValueVerb, value: 1 },
      },
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(true);
    expect(status.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(status.activationDuration).toBe(50); // 100 - 50
    consoleSpy.mockRestore();
  });

  test('CONSUME defaults cardinality to 1 with warning', () => {
    const interp = makeInterpretor();
    const infliction = makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 50, 200);
    interp.controller.addEvent(infliction);

    const ctx = makeCtx(interp);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const effect: Effect = {
      verb: VerbType.CONSUME,
      object: ObjectType.INFLICTION,
      adjective: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
      // No with.stacks — should warn
    };

    interp.interpret(effect, ctx);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('implicit cardinality'),
    );
    consoleSpy.mockRestore();
  });
});

// ── ALL compound tests ───────────────────────────────────────────────────

describe('EventInterpretor: ALL', () => {
  test('ALL FOR AT_MOST 4: CONSUME + APPLY (absorption pattern)', () => {
    const interp = makeInterpretor();
    // Pre-populate with 2 heat inflictions
    interp.controller.addEvent(makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 50, 200));
    interp.controller.addEvent(makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 60, 200));

    const ctx = makeCtx(interp);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const effect: Effect = {
      verb: VerbType.ALL,
      for: {
        cardinalityConstraint: CardinalityConstraintType.AT_MOST,
        cardinality: 4,
      },
      predicates: [{
        conditions: [],
        effects: [
          {
            verb: VerbType.CONSUME,
            object: ObjectType.INFLICTION,
            adjective: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
            with: { stacks: { verb: 'IS' as WithValueVerb, value: 1 } },
          },
          {
            verb: VerbType.APPLY,
            object: ObjectType.STATUS,
            objectId: 'MELTING_FLAME',
            toObject: NounType.OPERATOR,
          },
        ],
      }],
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(true);

    // Should consume 2 inflictions and create 2 statuses
    const consumed = interp.controller.output.filter(ev =>
      ev.columnId === INFLICTION_COLUMNS.HEAT && ev.eventStatus === EventStatusType.CONSUMED
    );
    expect(consumed.length).toBe(2);

    // The 2 MF statuses created
    const mfStatuses = interp.controller.output.filter(ev =>
      ev.columnId === 'melting-flame'
    );
    expect(mfStatuses.length).toBe(2);
    consoleSpy.mockRestore();
  });

  test('ALL without FOR executes once', () => {
    const interp = makeInterpretor();
    interp.controller.addEvent(makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 50, 200));
    interp.controller.addEvent(makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 60, 200));

    const ctx = makeCtx(interp);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const effect: Effect = {
      verb: VerbType.ALL,
      // No for → single iteration
      predicates: [{
        conditions: [],
        effects: [
          {
            verb: VerbType.CONSUME,
            object: ObjectType.INFLICTION,
            adjective: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
            with: { stacks: { verb: 'IS' as WithValueVerb, value: 1 } },
          },
        ],
      }],
    };

    interp.interpret(effect, ctx);

    // Only 1 consumed (single iteration)
    const consumed = interp.controller.output.filter(ev =>
      ev.columnId === INFLICTION_COLUMNS.HEAT && ev.eventStatus === EventStatusType.CONSUMED
    );
    expect(consumed.length).toBe(1);
    consoleSpy.mockRestore();
  });

  test('ALL stops when canDo returns false', () => {
    const interp = makeInterpretor();
    // Only 1 infliction — ALL FOR AT_MOST 4 should stop after 1 iteration
    interp.controller.addEvent(makeInflictionEvent(INFLICTION_COLUMNS.HEAT, 50, 200));

    const ctx = makeCtx(interp);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const effect: Effect = {
      verb: VerbType.ALL,
      for: {
        cardinalityConstraint: CardinalityConstraintType.AT_MOST,
        cardinality: 4,
      },
      predicates: [{
        conditions: [],
        effects: [
          {
            verb: VerbType.CONSUME,
            object: ObjectType.INFLICTION,
            adjective: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
            with: { stacks: { verb: 'IS' as WithValueVerb, value: 1 } },
          },
          {
            verb: VerbType.APPLY,
            object: ObjectType.STATUS,
            objectId: 'MELTING_FLAME',
            toObject: NounType.OPERATOR,
          },
        ],
      }],
    };

    interp.interpret(effect, ctx);

    const mfStatuses = interp.controller.output.filter(ev => ev.columnId === 'melting-flame');
    expect(mfStatuses.length).toBe(1); // Only 1, not 4
    consoleSpy.mockRestore();
  });
});

// ── ANY compound tests ───────────────────────────────────────────────────

describe('EventInterpretor: ANY', () => {
  test('ANY executes first matching predicate', () => {
    const interp = makeInterpretor();
    // No heat inflictions active → first predicate fails
    // Add a cryo infliction → second predicate matches
    interp.controller.addEvent(makeInflictionEvent(INFLICTION_COLUMNS.CRYO, 50, 200));

    const ctx = makeCtx(interp);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const effect: Effect = {
      verb: VerbType.ANY,
      predicates: [
        {
          conditions: [{
            subject: NounType.ENEMY,
            verb: VerbType.HAVE,
            object: ObjectType.INFLICTION,
            element: 'HEAT',
          }],
          effects: [{
            verb: VerbType.APPLY,
            object: ObjectType.STATUS,
            objectId: 'HEAT_STATUS',
            toObject: NounType.OPERATOR,
          }],
        },
        {
          conditions: [{
            subject: NounType.ENEMY,
            verb: VerbType.HAVE,
            object: ObjectType.INFLICTION,
            element: 'CRYO',
          }],
          effects: [{
            verb: VerbType.APPLY,
            object: ObjectType.STATUS,
            objectId: 'CRYO_STATUS',
            toObject: NounType.OPERATOR,
          }],
        },
      ],
    };

    interp.interpret(effect, ctx);

    const statuses = interp.controller.output.filter(ev => ev.columnId === 'cryo-status');
    expect(statuses.length).toBe(1);
    // No heat status should be created
    const heatStatuses = interp.controller.output.filter(ev => ev.columnId === 'heat-status');
    expect(heatStatuses.length).toBe(0);
    consoleSpy.mockRestore();
  });

  test('ANY returns false when no predicates match', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const effect: Effect = {
      verb: VerbType.ANY,
      predicates: [
        {
          conditions: [{
            subject: NounType.ENEMY,
            verb: VerbType.HAVE,
            object: ObjectType.INFLICTION,
            element: 'HEAT',
          }],
          effects: [{
            verb: VerbType.APPLY,
            object: ObjectType.STATUS,
            objectId: 'HEAT_STATUS',
            toObject: NounType.OPERATOR,
          }],
        },
      ],
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(false);
    expect(interp.controller.output.length).toBe(0);
  });
});

// ── Validation tests ─────────────────────────────────────────────────────

describe('EventInterpretor: Validation', () => {
  test('invalid verb+object logs warning and returns false', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const effect: Effect = {
      verb: VerbType.APPLY,
      object: ObjectType.DAMAGE, // APPLY cannot target DAMAGE
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid verb+object'),
    );
    consoleSpy.mockRestore();
  });
});

// ── Resource verb no-op tests ────────────────────────────────────────────

describe('EventInterpretor: Resource verbs', () => {
  test.each([
    VerbType.RECOVER,
    VerbType.DEAL,
    VerbType.HIT,
    VerbType.DEFEAT,
    VerbType.PERFORM,
  ])('%s returns true without mutations', (verb) => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const effect: Effect = { verb: verb };
    const result = interp.interpret(effect, ctx);
    expect(result).toBe(true);
    expect(interp.controller.output.length).toBe(0);
  });
});

// ── interpretEffects tests ───────────────────────────────────────────────

describe('EventInterpretor: interpretEffects', () => {
  test('executes multiple effects sequentially', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const effects: Effect[] = [
      {
        verb: VerbType.APPLY,
        object: ObjectType.INFLICTION,
        adjective: AdjectiveType.HEAT,
        toObject: NounType.ENEMY,
      },
      {
        verb: VerbType.APPLY,
        object: ObjectType.INFLICTION,
        adjective: AdjectiveType.HEAT,
        toObject: NounType.ENEMY,
      },
    ];

    const result = interp.interpretEffects(effects, ctx);
    expect(result).toBe(true);
    expect(interp.controller.output.length).toBe(2);
    expect(interp.controller.output[0].columnId).toBe(INFLICTION_COLUMNS.HEAT);
    expect(interp.controller.output[1].columnId).toBe(INFLICTION_COLUMNS.HEAT);
  });
});
