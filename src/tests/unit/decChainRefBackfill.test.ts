/**
 * DEC invariant pins: every event has ownerEntityId, and causality graph lifecycle.
 *
 * Replaces the Phase 1 backfill tests (ownerSlotId/ownerOperatorId) that were
 * deleted in 4d-3. The engine is now slot-free — ownerEntityId is the single owner
 * identity field on TimelineEvent.
 */

import { DerivedEventController } from '../../controller/timeline/derivedEventController';
import { TimelineEvent } from '../../consts/viewTypes';
import { EdgeKind } from '../../consts/enums';
import { NounType } from '../../dsl/semantics';

function mkSkillEvent(uid: string, ownerEntityId: string, sourceEntityId?: string): TimelineEvent {
  return {
    uid,
    id: 'TEST',
    name: 'TEST',
    ownerEntityId,
    columnId: NounType.BATTLE,
    startFrame: 0,
    segments: [{ properties: { duration: 60 } }],
    sourceEntityId,
    sourceSkillId: 'TEST',
  } as TimelineEvent;
}

describe('DEC — owner identity invariants', () => {
  let dec: DerivedEventController;

  beforeEach(() => {
    dec = new DerivedEventController();
  });

  test('every event in allEvents has ownerEntityId populated', () => {
    dec.reset(undefined, undefined, undefined, undefined, undefined,
      { 'slot-a': 'OP_A', 'slot-b': 'OP_B' });
    dec.createSkillEvent(mkSkillEvent('e1', 'slot-a'), { checkCooldown: false });
    dec.createSkillEvent(mkSkillEvent('e2', 'slot-b'), { checkCooldown: false });
    dec.createSkillEvent(mkSkillEvent('e3', 'enemy', 'OP_A'), { checkCooldown: false });
    dec.createSkillEvent(mkSkillEvent('e4', 'common'), { checkCooldown: false });

    for (const ev of dec.getProcessedEvents()) {
      expect(ev.ownerEntityId).toBeDefined();
      expect(ev.ownerEntityId).not.toBe('');
    }
  });

  test('sourceEntityId is preserved through ingestion', () => {
    dec.reset(undefined, undefined, undefined, undefined, undefined,
      { 'slot-foo': 'FOO_OP' });
    const ev = mkSkillEvent('e1', 'enemy', 'FOO_OP');
    dec.createSkillEvent(ev, { checkCooldown: false });

    const out = dec.getProcessedEvents().find(e => e.uid === 'e1')!;
    expect(out.ownerEntityId).toBe('enemy');
    expect(out.sourceEntityId).toBe('FOO_OP');
  });

  test('causality graph is cleared on reset()', () => {
    dec.reset();
    dec.getCausality().link('child', ['parent'], EdgeKind.CREATION);
    expect(dec.getCausality().size()).toBe(1);
    dec.reset();
    expect(dec.getCausality().size()).toBe(0);
  });
});
