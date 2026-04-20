/**
 * SKILL subject narrowing in conditionEvaluator (segment-clause gates).
 *
 * Validates that `evaluateInteraction` with `subject: SKILL` for CONSUME and
 * APPLY resolves via the CausalityGraph to filter by source skill category.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { EdgeKind, EventStatusType } from '../../consts/enums';
import { NounType, VerbType, type Interaction } from '../../dsl/semantics';
import { FPS } from '../../utils/timeline';
import { evaluateInteraction } from '../../controller/timeline/conditionEvaluator';
import { CausalityGraph } from '../../controller/timeline/causalityGraph';
import { ENEMY_ID, REACTION_COLUMNS } from '../../model/channels';

jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

const SLOT_A = 'slot-1';

function makeEvent(o: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
  return { id: o.id ?? '', name: '', ownerEntityId: SLOT_A, segments: [{ properties: { duration: 0 } }], ...o };
}

describe('evaluateInteraction: SKILL subject CONSUME', () => {
  const reactionCol = REACTION_COLUMNS.CORROSION;
  const cond: Interaction = {
    subject: NounType.SKILL,
    subjectDeterminer: 'THIS' as never,
    subjectId: NounType.BATTLE,
    of: { object: NounType.OPERATOR, determiner: 'THIS' as never },
    verb: VerbType.CONSUME,
    object: NounType.STATUS,
    objectId: NounType.REACTION,
    objectQualifier: 'CORROSION' as never,
  };

  function scenario(sourceColumnId: string) {
    const consumed = makeEvent({
      uid: 'r-1', ownerEntityId: ENEMY_ID,
      columnId: reactionCol, startFrame: 200,
      eventStatus: EventStatusType.CONSUMED,
      segments: [{ properties: { duration: 1 * FPS } }],
    });
    const skill = makeEvent({
      uid: 's-1', columnId: sourceColumnId, startFrame: 180,
      segments: [{ properties: { duration: 2 * FPS } }],
    });
    const events = [skill, consumed];
    const causality = new CausalityGraph();
    causality.link(consumed.uid, [skill.uid], EdgeKind.TRANSITION);
    return { events, causality };
  }

  test('true when battle skill consumed the reaction', () => {
    const { events, causality } = scenario(NounType.BATTLE);
    expect(evaluateInteraction(cond, { events, frame: 500, sourceEntityId: SLOT_A, causality })).toBe(true);
  });

  test('false when basic attack consumed the reaction', () => {
    const { events, causality } = scenario(NounType.BASIC_ATTACK);
    expect(evaluateInteraction(cond, { events, frame: 500, sourceEntityId: SLOT_A, causality })).toBe(false);
  });

  test('false without causality graph', () => {
    const { events } = scenario(NounType.BATTLE);
    expect(evaluateInteraction(cond, { events, frame: 300, sourceEntityId: SLOT_A })).toBe(false);
  });

  test('false if the consume has not happened yet (ctx.frame < event.startFrame)', () => {
    const { events, causality } = scenario(NounType.BATTLE);
    // The consumed event starts at frame 200 — querying at 100 should miss.
    expect(evaluateInteraction(cond, { events, frame: 100, sourceEntityId: SLOT_A, causality })).toBe(false);
  });

  test('negated: true when no matching consume exists', () => {
    const { events, causality } = scenario(NounType.BASIC_ATTACK);
    const negated: Interaction = { ...cond, negated: true };
    expect(evaluateInteraction(negated, { events, frame: 300, sourceEntityId: SLOT_A, causality })).toBe(true);
  });
});

describe('evaluateInteraction: SKILL subject APPLY', () => {
  const reactionCol = REACTION_COLUMNS.CORROSION;
  const cond: Interaction = {
    subject: NounType.SKILL,
    subjectId: NounType.BATTLE,
    of: { object: NounType.OPERATOR, determiner: 'THIS' as never },
    verb: VerbType.APPLY,
    object: NounType.STATUS,
    objectId: NounType.REACTION,
    objectQualifier: 'CORROSION' as never,
  };

  test('true when battle skill applied the reaction (CREATION edge)', () => {
    const applied = makeEvent({
      uid: 'r-1', ownerEntityId: ENEMY_ID,
      columnId: reactionCol, startFrame: 200,
      segments: [{ properties: { duration: 5 * FPS } }],
    });
    const skill = makeEvent({
      uid: 's-1', columnId: NounType.BATTLE, startFrame: 180,
      segments: [{ properties: { duration: 2 * FPS } }],
    });
    const causality = new CausalityGraph();
    causality.link(applied.uid, [skill.uid], EdgeKind.CREATION);
    expect(evaluateInteraction(cond, {
      events: [skill, applied], frame: 300, sourceEntityId: SLOT_A, causality,
    })).toBe(true);
  });

  test('false when basic attack applied the reaction', () => {
    const applied = makeEvent({
      uid: 'r-1', ownerEntityId: ENEMY_ID,
      columnId: reactionCol, startFrame: 200,
      segments: [{ properties: { duration: 5 * FPS } }],
    });
    const skill = makeEvent({
      uid: 's-1', columnId: NounType.BASIC_ATTACK, startFrame: 180,
      segments: [{ properties: { duration: 2 * FPS } }],
    });
    const causality = new CausalityGraph();
    causality.link(applied.uid, [skill.uid], EdgeKind.CREATION);
    expect(evaluateInteraction(cond, {
      events: [skill, applied], frame: 300, sourceEntityId: SLOT_A, causality,
    })).toBe(false);
  });
});
