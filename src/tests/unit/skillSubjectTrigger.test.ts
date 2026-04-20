/**
 * SKILL subject narrowing for CONSUME / APPLY triggers.
 *
 * "BATTLE SKILL of THIS OPERATOR CONSUME ARTS REACTION STATUS from ENEMY"
 * should match only consume events whose causal source is a battle-skill
 * event belonging to the operator. A basic-attack-caused consume should not
 * match a BATTLE-subject narrow.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { EdgeKind, EventStatusType } from '../../consts/enums';
import { NounType, VerbType } from '../../dsl/semantics';
import { FPS } from '../../utils/timeline';
import { findClauseTriggerMatches } from '../../controller/timeline/triggerMatch';
import { CausalityGraph } from '../../controller/timeline/causalityGraph';
import { ENEMY_ID, REACTION_COLUMNS } from '../../model/channels';

jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

const SLOT_A = 'slot-1';
const SLOT_B = 'slot-2';

function makeEvent(o: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
  return { id: o.id ?? '', name: '', ownerEntityId: SLOT_A, segments: [{ properties: { duration: 0 } }], ...o };
}

describe('SKILL subject narrows CONSUME by source skill category', () => {
  const reactionCol = REACTION_COLUMNS.CORROSION;
  const clause = [{
    conditions: [
      {
        subject: NounType.SKILL,
        subjectDeterminer: 'THIS',
        subjectId: NounType.BATTLE,
        of: { object: NounType.OPERATOR, determiner: 'THIS' },
        verb: VerbType.CONSUME,
        object: NounType.STATUS,
        objectId: NounType.REACTION,
        objectQualifier: 'CORROSION',
        from: NounType.ENEMY,
      },
    ],
  }];

  function buildScenario(sourceColumnId: string) {
    const consumedReaction = makeEvent({
      uid: 'reaction-1', ownerEntityId: ENEMY_ID,
      columnId: reactionCol, startFrame: 300,
      eventStatus: EventStatusType.CONSUMED,
      segments: [{ properties: { duration: 2 * FPS } }],
    });
    const skillEvent = makeEvent({
      uid: 'skill-1', ownerEntityId: SLOT_A,
      columnId: sourceColumnId, startFrame: 280,
      segments: [{ properties: { duration: 3 * FPS } }],
    });
    const events = [skillEvent, consumedReaction];
    const causality = new CausalityGraph();
    causality.link(consumedReaction.uid, [skillEvent.uid], EdgeKind.TRANSITION);
    return { events, causality };
  }

  test('matches when battle skill caused the consume', () => {
    const { events, causality } = buildScenario(NounType.BATTLE);
    const matches = findClauseTriggerMatches(clause, events, SLOT_A, undefined, undefined, causality);
    expect(matches.length).toBe(1);
  });

  test('does NOT match when basic attack caused the consume', () => {
    const { events, causality } = buildScenario(NounType.BASIC_ATTACK);
    const matches = findClauseTriggerMatches(clause, events, SLOT_A, undefined, undefined, causality);
    expect(matches.length).toBe(0);
  });

  test('does NOT match when ultimate caused the consume', () => {
    const { events, causality } = buildScenario(NounType.ULTIMATE);
    const matches = findClauseTriggerMatches(clause, events, SLOT_A, undefined, undefined, causality);
    expect(matches.length).toBe(0);
  });

  test('does NOT match when battle skill belongs to a different operator (of THIS OPERATOR fails)', () => {
    const consumedReaction = makeEvent({
      uid: 'reaction-1', ownerEntityId: ENEMY_ID,
      columnId: reactionCol, startFrame: 300,
      eventStatus: EventStatusType.CONSUMED,
      segments: [{ properties: { duration: 2 * FPS } }],
    });
    const otherOpSkill = makeEvent({
      uid: 'skill-1', ownerEntityId: SLOT_B,
      columnId: NounType.BATTLE, startFrame: 280,
      segments: [{ properties: { duration: 3 * FPS } }],
    });
    const events = [otherOpSkill, consumedReaction];
    const causality = new CausalityGraph();
    causality.link(consumedReaction.uid, [otherOpSkill.uid], EdgeKind.TRANSITION);
    const matches = findClauseTriggerMatches(clause, events, SLOT_A, undefined, undefined, causality);
    expect(matches.length).toBe(0);
  });

  test('does NOT match without a causality graph', () => {
    const { events } = buildScenario(NounType.BATTLE);
    const matches = findClauseTriggerMatches(clause, events, SLOT_A, undefined, undefined, undefined);
    expect(matches.length).toBe(0);
  });

  test('matches without subjectId narrow (any skill category)', () => {
    const clauseNoId = [{
      conditions: [
        {
          subject: NounType.SKILL,
          of: { object: NounType.OPERATOR, determiner: 'THIS' },
          verb: VerbType.CONSUME,
          object: NounType.STATUS,
          objectId: NounType.REACTION,
          objectQualifier: 'CORROSION',
          from: NounType.ENEMY,
        },
      ],
    }];
    const { events, causality } = buildScenario(NounType.BASIC_ATTACK);
    const matches = findClauseTriggerMatches(clauseNoId, events, SLOT_A, undefined, undefined, causality);
    expect(matches.length).toBe(1);
  });
});

describe('SKILL subject narrows APPLY by source skill category', () => {
  const reactionCol = REACTION_COLUMNS.CORROSION;
  const clause = [{
    conditions: [
      {
        subject: NounType.SKILL,
        subjectDeterminer: 'THIS',
        subjectId: NounType.BATTLE,
        of: { object: NounType.OPERATOR, determiner: 'THIS' },
        verb: VerbType.APPLY,
        object: NounType.STATUS,
        objectId: NounType.REACTION,
        objectQualifier: 'CORROSION',
        to: NounType.ENEMY,
      },
    ],
  }];

  test('matches when battle skill caused the apply (CREATION edge)', () => {
    const applied = makeEvent({
      uid: 'reaction-1', ownerEntityId: ENEMY_ID,
      columnId: reactionCol, startFrame: 300,
      segments: [{ properties: { duration: 10 * FPS } }],
    });
    const battleSkill = makeEvent({
      uid: 'bs-1', ownerEntityId: SLOT_A,
      columnId: NounType.BATTLE, startFrame: 280,
      segments: [{ properties: { duration: 3 * FPS } }],
    });
    const causality = new CausalityGraph();
    causality.link(applied.uid, [battleSkill.uid], EdgeKind.CREATION);
    const matches = findClauseTriggerMatches(clause, [battleSkill, applied], SLOT_A, undefined, undefined, causality);
    expect(matches.length).toBe(1);
  });

  test('does NOT match when basic attack caused the apply', () => {
    const applied = makeEvent({
      uid: 'reaction-1', ownerEntityId: ENEMY_ID,
      columnId: reactionCol, startFrame: 300,
      segments: [{ properties: { duration: 10 * FPS } }],
    });
    const basicAttack = makeEvent({
      uid: 'ba-1', ownerEntityId: SLOT_A,
      columnId: NounType.BASIC_ATTACK, startFrame: 280,
      segments: [{ properties: { duration: 3 * FPS } }],
    });
    const causality = new CausalityGraph();
    causality.link(applied.uid, [basicAttack.uid], EdgeKind.CREATION);
    const matches = findClauseTriggerMatches(clause, [basicAttack, applied], SLOT_A, undefined, undefined, causality);
    expect(matches.length).toBe(0);
  });
});
