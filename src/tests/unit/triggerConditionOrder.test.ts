/**
 * Order-agnostic condition evaluation in findClauseTriggerMatches.
 *
 * Verifies that conditions can appear in any order within a trigger clause
 * and produce identical results. The first scannable condition drives event
 * scanning; remaining conditions are checked as secondary predicates.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { NounType, VerbType, DeterminerType } from '../../dsl/semantics';
import { ENEMY_ID } from '../../model/channels';
import { FPS } from '../../utils/timeline';
import { findClauseTriggerMatches } from '../../controller/timeline/triggerMatch';
import type { Predicate } from '../../controller/timeline/triggerMatch';

jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const SLOT_OP = 'slot-0';
const STATUS_COL = 'MY_STATUS';

function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
  return { id: overrides.name ?? '', name: '', ownerEntityId: SLOT_OP, segments: [{ properties: { duration: 2 * FPS } }], ...overrides };
}

// ── A. Observable + HAVE order independence ─────────────────────────────────

describe('A. Observable + HAVE condition order independence', () => {
  // Scenario: DEAL DAMAGE + HAVE STATUS MY_STATUS
  // Both orderings should produce the same matches.

  const dealCond: Predicate = {
    subjectDeterminer: DeterminerType.THIS,
    subject: NounType.OPERATOR,
    verb: VerbType.DEAL,
    object: NounType.DAMAGE,
  };
  const haveCond: Predicate = {
    subjectDeterminer: DeterminerType.THIS,
    subject: NounType.OPERATOR,
    verb: VerbType.HAVE,
    object: NounType.STATUS,
    objectId: STATUS_COL,
  };

  const events: TimelineEvent[] = [
    // Operator deals damage at frame 600
    makeEvent({
      uid: 'skill-0', ownerEntityId: SLOT_OP,
      columnId: NounType.BASIC_ATTACK, startFrame: 600,
      segments: [{ properties: { duration: 2 * FPS }, frames: [{ offsetFrame: FPS }] }],
    }),
    // Operator has status active from frame 0
    makeEvent({
      uid: 'status-0', ownerEntityId: SLOT_OP,
      columnId: STATUS_COL, startFrame: 0,
      segments: [{ properties: { duration: 10 * FPS } }],
    }),
  ];

  test('DEAL first, HAVE second → matches', () => {
    const clause = [{ conditions: [dealCond, haveCond] }];
    const matches = findClauseTriggerMatches(clause, events, SLOT_OP);
    expect(matches.length).toBe(1);
  });

  test('HAVE first, DEAL second → same matches', () => {
    const clause = [{ conditions: [haveCond, dealCond] }];
    const matches = findClauseTriggerMatches(clause, events, SLOT_OP);
    expect(matches.length).toBe(1);
  });

  test('both orderings produce the same frame', () => {
    const m1 = findClauseTriggerMatches([{ conditions: [dealCond, haveCond] }], events, SLOT_OP);
    const m2 = findClauseTriggerMatches([{ conditions: [haveCond, dealCond] }], events, SLOT_OP);
    expect(m1[0].frame).toBe(m2[0].frame);
  });
});

// ── B. HAVE-only clauses (no observable condition) ──────────────────────────

describe('B. HAVE-only clauses use HAVE handler as driver', () => {
  const haveStatus: Predicate = {
    subject: NounType.ENEMY,
    verb: VerbType.HAVE,
    object: NounType.STATUS,
    objectId: 'VULNERABLE',
  };
  const haveInfliction: Predicate = {
    subject: NounType.ENEMY,
    verb: VerbType.HAVE,
    object: NounType.STATUS,
    objectId: NounType.INFLICTION,
    objectQualifier: 'CRYO',
  };

  test('two HAVE conditions both evaluated — both must pass', () => {
    const events: TimelineEvent[] = [
      // Enemy has VULNERABLE
      makeEvent({
        uid: 'vuln-0', ownerEntityId: ENEMY_ID,
        columnId: 'VULNERABLE', startFrame: 0,
        segments: [{ properties: { duration: 5 * FPS } }],
      }),
      // Enemy has CRYO infliction
      makeEvent({
        uid: 'cryo-0', ownerEntityId: ENEMY_ID,
        columnId: 'CRYO_INFLICTION', startFrame: 0,
        segments: [{ properties: { duration: 5 * FPS } }],
      }),
    ];
    const clause = [{ conditions: [haveStatus, haveInfliction] }];
    const matches = findClauseTriggerMatches(clause, events, SLOT_OP);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('one HAVE condition fails → no match', () => {
    const events: TimelineEvent[] = [
      // Enemy has VULNERABLE but NOT CRYO
      makeEvent({
        uid: 'vuln-0', ownerEntityId: ENEMY_ID,
        columnId: 'VULNERABLE', startFrame: 0,
        segments: [{ properties: { duration: 5 * FPS } }],
      }),
    ];
    const clause = [{ conditions: [haveStatus, haveInfliction] }];
    const matches = findClauseTriggerMatches(clause, events, SLOT_OP);
    expect(matches.length).toBe(0);
  });

  test('order reversed → same result', () => {
    const events: TimelineEvent[] = [
      makeEvent({
        uid: 'vuln-0', ownerEntityId: ENEMY_ID,
        columnId: 'VULNERABLE', startFrame: 0,
        segments: [{ properties: { duration: 5 * FPS } }],
      }),
      makeEvent({
        uid: 'cryo-0', ownerEntityId: ENEMY_ID,
        columnId: 'CRYO_INFLICTION', startFrame: 0,
        segments: [{ properties: { duration: 5 * FPS } }],
      }),
    ];
    const m1 = findClauseTriggerMatches([{ conditions: [haveStatus, haveInfliction] }], events, SLOT_OP);
    const m2 = findClauseTriggerMatches([{ conditions: [haveInfliction, haveStatus] }], events, SLOT_OP);
    expect(m1.length).toBe(m2.length);
  });
});

// ── C. Engine-context conditions are skipped at scan time ───────────────────

describe('C. Engine-context conditions skipped at scan time', () => {
  // HAVE TALENT_LEVEL needs engine context → skipped by findClauseTriggerMatches.
  // The observable condition still drives scanning; the HAVE TALENT_LEVEL is
  // assumed true (deferred to handleEngineTrigger).

  const performCond: Predicate = {
    subjectDeterminer: DeterminerType.THIS,
    subject: NounType.OPERATOR,
    verb: VerbType.PERFORM,
    object: NounType.SKILL,
    objectId: NounType.BASIC_ATTACK,
  };
  const haveTalentLevel: Predicate = {
    subjectDeterminer: DeterminerType.THIS,
    subject: NounType.OPERATOR,
    verb: VerbType.HAVE,
    object: NounType.TALENT_LEVEL,
    value: { verb: VerbType.IS, value: 1 },
  };

  const events: TimelineEvent[] = [
    makeEvent({
      uid: 'ba-0', ownerEntityId: SLOT_OP,
      columnId: NounType.BASIC_ATTACK, startFrame: 120,
      segments: [{ properties: { duration: 2 * FPS }, frames: [{ offsetFrame: 0 }] }],
    }),
  ];

  test('PERFORM + HAVE TALENT_LEVEL → matches (TALENT_LEVEL skipped)', () => {
    const clause = [{ conditions: [performCond, haveTalentLevel] }];
    const matches = findClauseTriggerMatches(clause, events, SLOT_OP);
    expect(matches.length).toBe(1);
  });

  test('HAVE TALENT_LEVEL + PERFORM → same result (order-agnostic)', () => {
    const clause = [{ conditions: [haveTalentLevel, performCond] }];
    const matches = findClauseTriggerMatches(clause, events, SLOT_OP);
    expect(matches.length).toBe(1);
  });

  test('HAVE TALENT_LEVEL alone → no match (no scannable driver)', () => {
    const clause = [{ conditions: [haveTalentLevel] }];
    const matches = findClauseTriggerMatches(clause, events, SLOT_OP);
    expect(matches.length).toBe(0);
  });
});

// ── D. IS with state adjective as driver ────────────────────────────────────

describe('D. IS with state adjective drives scanning', () => {
  // IS ELECTRIFIED has a STATE_TO_COLUMN mapping → evaluable at scan time.

  const isElectrified: Predicate = {
    subject: NounType.ENEMY,
    verb: VerbType.IS,
    object: 'ELECTRIFIED',
  };

  test('IS ELECTRIFIED alone produces matches when reaction exists', () => {
    const events: TimelineEvent[] = [
      makeEvent({
        uid: 'elec-0', ownerEntityId: ENEMY_ID,
        columnId: 'ELECTRIFICATION', startFrame: 120,
        segments: [{ properties: { duration: 5 * FPS } }],
      }),
    ];
    const clause = [{ conditions: [isElectrified] }];
    const matches = findClauseTriggerMatches(clause, events, SLOT_OP);
    expect(matches.length).toBe(1);
  });
});

// ── E. STACKS as subject drives scanning ────────────────────────────────────

describe('E. STACKS subject condition drives scanning', () => {
  const stacksCondition: Predicate = {
    subject: NounType.STACKS,
    of: {
      object: NounType.STATUS,
      objectId: NounType.INFLICTION,
      objectQualifier: 'CRYO',
      of: { object: NounType.ENEMY },
    },
    verb: VerbType.IS,
    cardinalityConstraint: 'GREATER_THAN_EQUAL',
    value: { verb: VerbType.IS, value: 2 },
  };

  test('IS STACKS >= 2 with 2 inflictions → matches', () => {
    const events: TimelineEvent[] = [
      makeEvent({
        uid: 'cryo-1', ownerEntityId: ENEMY_ID,
        columnId: 'CRYO_INFLICTION', startFrame: 120,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
      makeEvent({
        uid: 'cryo-2', ownerEntityId: ENEMY_ID,
        columnId: 'CRYO_INFLICTION', startFrame: 240,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
    ];
    const clause = [{ conditions: [stacksCondition] }];
    const matches = findClauseTriggerMatches(clause, events, SLOT_OP);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('IS STACKS >= 2 with 1 infliction → no match', () => {
    const events: TimelineEvent[] = [
      makeEvent({
        uid: 'cryo-1', ownerEntityId: ENEMY_ID,
        columnId: 'CRYO_INFLICTION', startFrame: 120,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
    ];
    const clause = [{ conditions: [stacksCondition] }];
    const matches = findClauseTriggerMatches(clause, events, SLOT_OP);
    expect(matches.length).toBe(0);
  });
});
