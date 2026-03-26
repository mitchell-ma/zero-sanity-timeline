/**
 * EventInterpretorController Tests
 *
 * Validates the DSL interpreter with canDo/do verb dispatch:
 * - APPLY INFLICTION, STATUS, REACTION
 * - CONSUME INFLICTION, STATUS, REACTION
 * - ALL compound with FOR AT_MOST (absorption pattern)
 * - ANY first-match predicate evaluation
 * - Validation against VERB_OBJECTS
 * - Resource/display verbs are no-ops
 */

import { TimelineEvent, eventDuration } from '../../consts/viewTypes';
import { ElementType, EventStatusType, PhysicalStatusType } from '../../consts/enums';
import { INFLICTION_COLUMNS, PHYSICAL_INFLICTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID } from '../../model/channels';
import { DerivedEventController } from '../../controller/timeline/derivedEventController';
import { EventInterpretorController } from '../../controller/timeline/eventInterpretorController';
import type { InterpretContext } from '../../controller/timeline/eventInterpretorController';
import { VerbType, AdjectiveType, CardinalityConstraintType, NounType, ObjectType } from '../../dsl/semantics';
import type { Effect } from '../../dsl/semantics';

// ── Mock require.context before importing modules that use it ────────────

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeInterpretor() {
  const ctrl = new DerivedEventController();
  return new EventInterpretorController(ctrl, []);
}

function makeCtx(interp: EventInterpretorController, overrides?: Partial<InterpretContext>): InterpretContext {
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
    uid: `infliction-${columnId}-${startFrame}`,
    id: columnId,
    name: columnId,
    ownerId: ENEMY_OWNER_ID,
    columnId,
    startFrame,
    segments: [{ properties: { duration: duration } }],
  };
}

function makeStatusEvent(columnId: string, ownerId: string, startFrame: number, duration = 2400): TimelineEvent {
  const statusName = columnId.toUpperCase().replace(/-/g, '_');
  return {
    uid: `status-${columnId}-${startFrame}`,
    id: statusName,
    name: statusName,
    ownerId,
    columnId,
    startFrame,
    segments: [{ properties: { duration: duration } }],
  };
}

// ── APPLY tests ──────────────────────────────────────────────────────────

describe('EventInterpretorController: APPLY', () => {
  test('APPLY HEAT INFLICTION creates infliction event', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const effect: Effect = {
      verb: VerbType.APPLY,
      object: ObjectType.INFLICTION,
      objectQualifier: AdjectiveType.HEAT,
      to: NounType.ENEMY,
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
      to: NounType.OPERATOR,
      with: {
        duration: { verb: VerbType.IS, value: 10 },
      },
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(true);
    expect(interp.controller.output.length).toBe(1);
    expect(interp.controller.output[0].columnId).toBe('focus');
    expect(interp.controller.output[0].ownerId).toBe('op-1');
    expect(eventDuration(interp.controller.output[0])).toBe(1200);
  });

  test('APPLY COMBUSTION REACTION creates reaction event', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const effect: Effect = {
      verb: VerbType.APPLY,
      object: ObjectType.REACTION,
      objectQualifier: AdjectiveType.COMBUSTION,
      to: NounType.ENEMY,
      with: {
        stacks: { verb: VerbType.IS, value: 2 },
      },
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(true);
    expect(interp.controller.output.length).toBe(1);
    expect(interp.controller.output[0].columnId).toBe(REACTION_COLUMNS.COMBUSTION);
    expect(interp.controller.output[0].stacks).toBe(2);
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

describe('EventInterpretorController: CONSUME', () => {
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
      objectQualifier: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
      with: {
        stacks: { verb: VerbType.IS, value: 1 },
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
      objectQualifier: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
      with: {
        stacks: { verb: VerbType.IS, value: 1 },
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
        stacks: { verb: VerbType.IS, value: 1 },
      },
    };

    const result = interp.interpret(effect, ctx);
    expect(result).toBe(true);
    expect(status.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(eventDuration(status)).toBe(50); // 100 - 50
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
      objectQualifier: AdjectiveType.HEAT,
      fromObject: NounType.ENEMY,
      // No with.stacks — should warn
    };

    interp.interpret(effect, ctx);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing with.stacks'),
      expect.any(String),
      expect.any(String),
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });
});

// ── ALL compound tests ───────────────────────────────────────────────────

describe('EventInterpretorController: ALL', () => {
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
        value: { verb: VerbType.IS, value: 4 },
      },
      predicates: [{
        conditions: [],
        effects: [
          {
            verb: VerbType.CONSUME,
            object: ObjectType.INFLICTION,
            objectQualifier: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
            with: { stacks: { verb: VerbType.IS, value: 1 } },
          },
          {
            verb: VerbType.APPLY,
            object: ObjectType.STATUS,
            objectId: 'MELTING_FLAME',
            to: NounType.OPERATOR,
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
            objectQualifier: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
            with: { stacks: { verb: VerbType.IS, value: 1 } },
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
        value: { verb: VerbType.IS, value: 4 },
      },
      predicates: [{
        conditions: [],
        effects: [
          {
            verb: VerbType.CONSUME,
            object: ObjectType.INFLICTION,
            objectQualifier: AdjectiveType.HEAT,
            fromObject: NounType.ENEMY,
            with: { stacks: { verb: VerbType.IS, value: 1 } },
          },
          {
            verb: VerbType.APPLY,
            object: ObjectType.STATUS,
            objectId: 'MELTING_FLAME',
            to: NounType.OPERATOR,
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

describe('EventInterpretorController: ANY', () => {
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
            to: NounType.OPERATOR,
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
            to: NounType.OPERATOR,
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
            to: NounType.OPERATOR,
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

describe('EventInterpretorController: Validation', () => {
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

describe('EventInterpretorController: Resource verbs', () => {
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

describe('EventInterpretorController: interpretEffects', () => {
  test('executes multiple effects sequentially', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const effects: Effect[] = [
      {
        verb: VerbType.APPLY,
        object: ObjectType.INFLICTION,
        objectQualifier: AdjectiveType.HEAT,
        to: NounType.ENEMY,
      },
      {
        verb: VerbType.APPLY,
        object: ObjectType.INFLICTION,
        objectQualifier: AdjectiveType.HEAT,
        to: NounType.ENEMY,
      },
    ];

    const result = interp.interpretEffects(effects, ctx);
    expect(result).toBe(true);
    expect(interp.controller.output.length).toBe(2);
    expect(interp.controller.output[0].columnId).toBe(INFLICTION_COLUMNS.HEAT);
    expect(interp.controller.output[1].columnId).toBe(INFLICTION_COLUMNS.HEAT);
  });
});

// ── APPLY LIFT STATUS (PHYSICAL) tests ──────────────────────────────────────

describe('EventInterpretorController: APPLY LIFT STATUS (PHYSICAL)', () => {
  const liftEffect: Effect = {
    verb: VerbType.APPLY,
    object: ObjectType.STATUS, objectId: 'PHYSICAL',
    objectQualifier: AdjectiveType.LIFT,
    to: NounType.ENEMY,
  };

  test('no Vulnerable → adds Vulnerable only, no Lift status', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const result = interp.interpret(liftEffect, ctx);
    expect(result).toBe(true);

    // Should create 1 Vulnerable infliction, no Lift status
    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    const liftEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT,
    );
    expect(vulnEvents.length).toBe(1);
    expect(liftEvents.length).toBe(0);
  });

  test('Vulnerable active → adds Vulnerable + creates Lift status', () => {
    const interp = makeInterpretor();

    // Pre-seed a Vulnerable infliction on the enemy
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    const result = interp.interpret(liftEffect, ctx);
    expect(result).toBe(true);

    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    const liftEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT,
    );

    // 1 pre-seeded Vulnerable + 1 new Vulnerable from Lift
    expect(vulnEvents.length).toBe(2);
    // Lift status created
    expect(liftEvents.length).toBe(1);
    expect(liftEvents[0].ownerId).toBe(ENEMY_OWNER_ID);
    expect(eventDuration(liftEvents[0])).toBe(120); // 1 second
    expect(liftEvents[0].name).toBe(PhysicalStatusType.LIFT);
  });

  test('Lift status has 1 segment with damage frame at offset 0', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(liftEffect, ctx);

    const liftEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT,
    );
    expect(liftEvents.length).toBe(1);

    const segments = liftEvents[0].segments;
    expect(segments).toBeDefined();
    expect(segments!.length).toBe(1);
    expect(segments![0].properties.duration).toBe(120);
    expect(segments![0].properties.name).toBe('Lift');
    expect(segments![0].frames!.length).toBe(1);
    expect(segments![0].frames![0].offsetFrame).toBe(0);
    expect(segments![0].frames![0].damageElement).toBe(ElementType.PHYSICAL);
    expect(segments![0].frames![0].damageMultiplier).toBe(1.2);
  });

  test('forced Lift → Vulnerable + Lift status even without existing Vulnerable', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const forcedLift: Effect = {
      ...liftEffect,
      with: { isForced: { verb: VerbType.IS, value: 1 } },
    };

    const result = interp.interpret(forcedLift, ctx);
    expect(result).toBe(true);

    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    const liftEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT,
    );

    expect(vulnEvents.length).toBe(1);
    expect(liftEvents.length).toBe(1);
  });

  test('second Lift resets previous (RESET stacking)', () => {
    const interp = makeInterpretor();

    // Pre-seed Vulnerable
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    // First Lift at frame 100
    const ctx1 = makeCtx(interp, { frame: 100 });
    interp.interpret(liftEffect, ctx1);

    // Second Lift at frame 160 (within first Lift's duration)
    const ctx2 = makeCtx(interp, { frame: 160 });
    interp.interpret(liftEffect, ctx2);

    const liftEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.LIFT,
    );

    // Both Lift events created, first one should be REFRESHED
    expect(liftEvents.length).toBe(2);
    const first = liftEvents[0];
    const second = liftEvents[1];
    expect(first.eventStatus).toBe(EventStatusType.REFRESHED);
    expect(second.startFrame).toBe(160);
    expect(eventDuration(second)).toBe(120);
  });

  test('Lift always adds Vulnerable even when triggering status', () => {
    const interp = makeInterpretor();

    // Pre-seed 1 Vulnerable
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(liftEffect, ctx);

    // Count all Vulnerable events (pre-seeded + new from Lift)
    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vulnEvents.length).toBe(2);
  });
});

// ── APPLY KNOCK_DOWN STATUS (PHYSICAL) tests ────────────────────────────────

describe('EventInterpretorController: APPLY KNOCK_DOWN STATUS (PHYSICAL)', () => {
  const knockDownEffect: Effect = {
    verb: VerbType.APPLY,
    object: ObjectType.STATUS, objectId: 'PHYSICAL',
    objectQualifier: AdjectiveType.KNOCK_DOWN,
    to: NounType.ENEMY,
  };

  test('no Vulnerable → adds Vulnerable only, no Knock Down status', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    interp.interpret(knockDownEffect, ctx);

    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    const kdEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    expect(vulnEvents.length).toBe(1);
    expect(kdEvents.length).toBe(0);
  });

  test('Vulnerable active → adds Vulnerable + creates Knock Down status', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(knockDownEffect, ctx);

    const kdEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    expect(kdEvents.length).toBe(1);
    expect(eventDuration(kdEvents[0])).toBe(120);
    expect(kdEvents[0].name).toBe(PhysicalStatusType.KNOCK_DOWN);
    expect(kdEvents[0].segments![0].properties.name).toBe('Knock Down');
    expect(kdEvents[0].segments![0].frames![0].damageMultiplier).toBe(1.2);
  });

  test('forced Knock Down bypasses Vulnerable check', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const forced: Effect = {
      ...knockDownEffect,
      with: { isForced: { verb: VerbType.IS, value: 1 } },
    };

    interp.interpret(forced, ctx);

    const kdEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    expect(kdEvents.length).toBe(1);
  });

  test('Knock Down has 1 segment with physical damage frame at offset 0', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(knockDownEffect, ctx);

    const kdEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    const segments = kdEvents[0].segments;
    expect(segments).toBeDefined();
    expect(segments!.length).toBe(1);
    expect(segments![0].properties.duration).toBe(120);
    expect(segments![0].frames!.length).toBe(1);
    expect(segments![0].frames![0].offsetFrame).toBe(0);
    expect(segments![0].frames![0].damageElement).toBe(ElementType.PHYSICAL);
    expect(segments![0].frames![0].damageMultiplier).toBe(1.2);
  });

  test('second Knock Down resets previous (RESET stacking)', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx1 = makeCtx(interp, { frame: 100 });
    interp.interpret(knockDownEffect, ctx1);

    const ctx2 = makeCtx(interp, { frame: 160 });
    interp.interpret(knockDownEffect, ctx2);

    const kdEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    expect(kdEvents.length).toBe(2);
    expect(kdEvents[0].eventStatus).toBe(EventStatusType.REFRESHED);
    expect(kdEvents[1].startFrame).toBe(160);
    expect(eventDuration(kdEvents[1])).toBe(120);
  });

  test('always adds Vulnerable even when status triggers', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(knockDownEffect, ctx);

    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vulnEvents.length).toBe(2);
  });

  test('forced Knock Down also adds Vulnerable', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    const forced: Effect = {
      ...knockDownEffect,
      with: { isForced: { verb: VerbType.IS, value: 1 } },
    };

    interp.interpret(forced, ctx);

    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    const kdEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN,
    );
    expect(vulnEvents.length).toBe(1);
    expect(kdEvents.length).toBe(1);
  });
});

// ── APPLY CRUSH STATUS (PHYSICAL) tests ─────────────────────────────────────

describe('EventInterpretorController: APPLY CRUSH STATUS (PHYSICAL)', () => {
  const crushEffect: Effect = {
    verb: VerbType.APPLY,
    object: ObjectType.STATUS, objectId: 'PHYSICAL',
    objectQualifier: AdjectiveType.CRUSH,
    to: NounType.ENEMY,
  };

  test('no Vulnerable → adds Vulnerable only, no Crush status', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    interp.interpret(crushEffect, ctx);

    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    const crushEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.CRUSH,
    );
    expect(vulnEvents.length).toBe(1);
    expect(crushEvents.length).toBe(0);
  });

  test('1 Vulnerable → consumes it, creates Crush with 300% multiplier', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(crushEffect, ctx);

    // Vulnerable consumed
    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vulnEvents[0].eventStatus).toBe(EventStatusType.CONSUMED);

    // Crush created with 300% multiplier
    const crushEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.CRUSH,
    );
    expect(crushEvents.length).toBe(1);
    expect(crushEvents[0].segments![0].frames![0].damageMultiplier).toBe(3.0);
    expect(crushEvents[0].stacks).toBe(1);
  });

  test('2 Vulnerable → consumes all, creates Crush with 450% multiplier', () => {
    const interp = makeInterpretor();
    for (let i = 0; i < 2; i++) {
      interp.controller.createInfliction(
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50 + i, 2400,
        { ownerId: 'op-1', skillName: 'SETUP' },
      );
    }

    const ctx = makeCtx(interp);
    interp.interpret(crushEffect, ctx);

    const crushEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.CRUSH,
    );
    expect(crushEvents.length).toBe(1);
    expect(crushEvents[0].segments![0].frames![0].damageMultiplier).toBe(4.5);
    expect(crushEvents[0].stacks).toBe(2);
  });

  test('3 Vulnerable → consumes all, creates Crush with 600% multiplier', () => {
    const interp = makeInterpretor();
    for (let i = 0; i < 3; i++) {
      interp.controller.createInfliction(
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50 + i, 2400,
        { ownerId: 'op-1', skillName: 'SETUP' },
      );
    }

    const ctx = makeCtx(interp);
    interp.interpret(crushEffect, ctx);

    const crushEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.CRUSH,
    );
    expect(crushEvents.length).toBe(1);
    expect(crushEvents[0].segments![0].frames![0].damageMultiplier).toBe(6.0);
    expect(crushEvents[0].stacks).toBe(3);
  });

  test('4 Vulnerable → consumes all, creates Crush with 750% multiplier', () => {
    const interp = makeInterpretor();
    for (let i = 0; i < 4; i++) {
      interp.controller.createInfliction(
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50 + i, 2400,
        { ownerId: 'op-1', skillName: 'SETUP' },
      );
    }

    const ctx = makeCtx(interp);
    interp.interpret(crushEffect, ctx);

    const crushEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.CRUSH,
    );
    expect(crushEvents.length).toBe(1);
    expect(crushEvents[0].segments![0].frames![0].damageMultiplier).toBe(7.5);
    expect(crushEvents[0].stacks).toBe(4);
  });

  test('Crush does not add Vulnerable when consuming', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(crushEffect, ctx);

    // Only the pre-seeded Vulnerable (now consumed), no new ones added
    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    expect(vulnEvents.length).toBe(1);
    expect(vulnEvents[0].eventStatus).toBe(EventStatusType.CONSUMED);
  });

  test('Crush has 1 segment with physical damage frame at offset 0', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(crushEffect, ctx);

    const crushEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.CRUSH,
    );
    const segments = crushEvents[0].segments;
    expect(segments!.length).toBe(1);
    expect(segments![0].properties.duration).toBe(120);
    expect(segments![0].properties.name).toBe('Crush');
    expect(segments![0].frames!.length).toBe(1);
    expect(segments![0].frames![0].offsetFrame).toBe(0);
    expect(segments![0].frames![0].damageElement).toBe(ElementType.PHYSICAL);
  });

  test('Crush has no stagger value', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(crushEffect, ctx);

    const crushEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.CRUSH,
    );
    expect(crushEvents[0].segments![0].frames![0].staggerValue).toBeUndefined();
  });
});

// ── APPLY BREACH STATUS (PHYSICAL) tests ────────────────────────────────────

describe('EventInterpretorController: APPLY BREACH STATUS (PHYSICAL)', () => {
  const breachEffect: Effect = {
    verb: VerbType.APPLY,
    object: ObjectType.STATUS, objectId: 'PHYSICAL',
    objectQualifier: AdjectiveType.BREACH,
    to: NounType.ENEMY,
  };

  test('no Vulnerable → adds Vulnerable only, no Breach status', () => {
    const interp = makeInterpretor();
    const ctx = makeCtx(interp);

    interp.interpret(breachEffect, ctx);

    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    const breachEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.BREACH,
    );
    expect(vulnEvents.length).toBe(1);
    expect(breachEvents.length).toBe(0);
  });

  test('1 Vulnerable → consumes, Breach with 100% multiplier and 12s duration', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(breachEffect, ctx);

    const breachEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.BREACH,
    );
    expect(breachEvents.length).toBe(1);
    expect(breachEvents[0].stacks).toBe(1);
    expect(eventDuration(breachEvents[0])).toBe(1440); // 12s
    expect(breachEvents[0].segments![0].properties.duration).toBe(1440);
    expect(breachEvents[0].segments![0].frames![0].damageMultiplier).toBe(1.0);
  });

  test('2 Vulnerable → 150% multiplier and 18s duration', () => {
    const interp = makeInterpretor();
    for (let i = 0; i < 2; i++) {
      interp.controller.createInfliction(
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50 + i, 2400,
        { ownerId: 'op-1', skillName: 'SETUP' },
      );
    }

    const ctx = makeCtx(interp);
    interp.interpret(breachEffect, ctx);

    const breachEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.BREACH,
    );
    expect(breachEvents[0].stacks).toBe(2);
    expect(eventDuration(breachEvents[0])).toBe(2160); // 18s
    expect(breachEvents[0].segments![0].frames![0].damageMultiplier).toBe(1.5);
  });

  test('3 Vulnerable → 200% multiplier and 24s duration', () => {
    const interp = makeInterpretor();
    for (let i = 0; i < 3; i++) {
      interp.controller.createInfliction(
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50 + i, 2400,
        { ownerId: 'op-1', skillName: 'SETUP' },
      );
    }

    const ctx = makeCtx(interp);
    interp.interpret(breachEffect, ctx);

    const breachEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.BREACH,
    );
    expect(breachEvents[0].stacks).toBe(3);
    expect(eventDuration(breachEvents[0])).toBe(2880); // 24s
    expect(breachEvents[0].segments![0].frames![0].damageMultiplier).toBe(2.0);
  });

  test('4 Vulnerable → 250% multiplier and 30s duration', () => {
    const interp = makeInterpretor();
    for (let i = 0; i < 4; i++) {
      interp.controller.createInfliction(
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50 + i, 2400,
        { ownerId: 'op-1', skillName: 'SETUP' },
      );
    }

    const ctx = makeCtx(interp);
    interp.interpret(breachEffect, ctx);

    const breachEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.BREACH,
    );
    expect(breachEvents[0].stacks).toBe(4);
    expect(eventDuration(breachEvents[0])).toBe(3600); // 30s
    expect(breachEvents[0].segments![0].frames![0].damageMultiplier).toBe(2.5);
  });

  test('consumes all Vulnerable, does not add new stacks', () => {
    const interp = makeInterpretor();
    for (let i = 0; i < 3; i++) {
      interp.controller.createInfliction(
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50 + i, 2400,
        { ownerId: 'op-1', skillName: 'SETUP' },
      );
    }

    const ctx = makeCtx(interp);
    interp.interpret(breachEffect, ctx);

    const vulnEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
    );
    // All 3 pre-seeded, all consumed, no new ones
    expect(vulnEvents.length).toBe(3);
    for (const v of vulnEvents) {
      expect(v.eventStatus).toBe(EventStatusType.CONSUMED);
    }
  });

  test('Breach segment has physical damage frame at offset 0', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(breachEffect, ctx);

    const breachEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.BREACH,
    );
    const seg = breachEvents[0].segments![0];
    expect(seg.properties.name).toBe('Breach');
    expect(seg.frames!.length).toBe(1);
    expect(seg.frames![0].offsetFrame).toBe(0);
    expect(seg.frames![0].damageElement).toBe(ElementType.PHYSICAL);
  });

  test('Breach has no stagger', () => {
    const interp = makeInterpretor();
    interp.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, 50, 2400,
      { ownerId: 'op-1', skillName: 'SETUP' },
    );

    const ctx = makeCtx(interp);
    interp.interpret(breachEffect, ctx);

    const breachEvents = interp.controller.output.filter(
      ev => ev.columnId === PHYSICAL_STATUS_COLUMNS.BREACH,
    );
    expect(breachEvents[0].segments![0].frames![0].staggerValue).toBeUndefined();
  });
});
