/**
 * Phase 1 chainRef backfill invariant pins.
 *
 * Every event that enters DEC storage must have `ownerSlotId` and
 * `ownerOperatorId` populated by the time it's observable in
 * `getProcessedEvents()`. Phase 2 will populate these at real ingress
 * sites; Phase 1's `_backfillOwnerIds` in `_ingest` is the safety net
 * that makes readers in Phase 3 safe to trust without null-checking.
 */

import { DerivedEventController } from '../../controller/timeline/derivedEventController';
import { TimelineEvent } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';

function mkSkillEvent(uid: string, ownerId: string, sourceOwnerId?: string): TimelineEvent {
  return {
    uid,
    id: 'TEST',
    name: 'TEST',
    ownerId,
    columnId: NounType.BATTLE,
    startFrame: 0,
    segments: [{ properties: { duration: 60 } }],
    sourceOwnerId,
    sourceSkillName: 'TEST',
  } as TimelineEvent;
}

describe('DEC — Phase 1 chainRef backfill', () => {
  let dec: DerivedEventController;

  beforeEach(() => {
    dec = new DerivedEventController();
  });

  test('ownerId is a known slot → fields pulled from slotOperatorMap', () => {
    dec.reset(undefined, undefined, undefined, undefined, undefined,
      { 'slot-pogranichnik': 'POGRANICHNIK' });
    dec.createSkillEvent(mkSkillEvent('e1', 'slot-pogranichnik'), { checkCooldown: false });

    const ev = dec.getProcessedEvents().find(e => e.uid === 'e1')!;
    expect(ev.ownerSlotId).toBe('slot-pogranichnik');
    expect(ev.ownerOperatorId).toBe('POGRANICHNIK');
  });

  test('sourceOwnerId is a known slot → backfilled from it when ownerId is not', () => {
    dec.reset(undefined, undefined, undefined, undefined, undefined,
      { 'slot-foo': 'FOO_OP' });
    const ev = mkSkillEvent('e1', 'enemy', 'slot-foo');
    dec.createSkillEvent(ev, { checkCooldown: false });

    const out = dec.getProcessedEvents().find(e => e.uid === 'e1')!;
    expect(out.ownerSlotId).toBe('slot-foo');
    expect(out.ownerOperatorId).toBe('FOO_OP');
  });

  test('sourceOwnerId is an operator id → reverse-lookup finds the slot', () => {
    dec.reset(undefined, undefined, undefined, undefined, undefined,
      { 'slot-bar': 'BAR_OP' });
    const ev = mkSkillEvent('e1', 'enemy', 'BAR_OP');
    dec.createSkillEvent(ev, { checkCooldown: false });

    const out = dec.getProcessedEvents().find(e => e.uid === 'e1')!;
    expect(out.ownerSlotId).toBe('slot-bar');
    expect(out.ownerOperatorId).toBe('BAR_OP');
  });

  test('no slot map match → falls back to ownerId for both fields', () => {
    dec.reset();
    dec.createSkillEvent(mkSkillEvent('e1', 'enemy'), { checkCooldown: false });

    const out = dec.getProcessedEvents().find(e => e.uid === 'e1')!;
    expect(out.ownerSlotId).toBe('enemy');
    expect(out.ownerOperatorId).toBe('enemy');
  });

  test('pre-populated fields are not overwritten by backfill', () => {
    dec.reset(undefined, undefined, undefined, undefined, undefined,
      { 'slot-foo': 'FOO_OP' });
    const ev = mkSkillEvent('e1', 'slot-foo');
    ev.ownerSlotId = 'explicit-slot';
    ev.ownerOperatorId = 'EXPLICIT_OP';
    dec.createSkillEvent(ev, { checkCooldown: false });

    const out = dec.getProcessedEvents().find(e => e.uid === 'e1')!;
    expect(out.ownerSlotId).toBe('explicit-slot');
    expect(out.ownerOperatorId).toBe('EXPLICIT_OP');
  });

  test('INVARIANT: every event in allEvents has both owner fields populated', () => {
    dec.reset(undefined, undefined, undefined, undefined, undefined,
      { 'slot-a': 'OP_A', 'slot-b': 'OP_B' });
    dec.createSkillEvent(mkSkillEvent('e1', 'slot-a'), { checkCooldown: false });
    dec.createSkillEvent(mkSkillEvent('e2', 'slot-b'), { checkCooldown: false });
    dec.createSkillEvent(mkSkillEvent('e3', 'enemy', 'OP_A'), { checkCooldown: false });
    dec.createSkillEvent(mkSkillEvent('e4', 'common'), { checkCooldown: false });

    for (const ev of dec.getProcessedEvents()) {
      expect(ev.ownerSlotId).toBeDefined();
      expect(ev.ownerOperatorId).toBeDefined();
    }
  });

  test('causality graph is cleared on reset()', () => {
    dec.reset();
    dec.getCausality().link('child', ['parent']);
    expect(dec.getCausality().size()).toBe(1);
    dec.reset();
    expect(dec.getCausality().size()).toBe(0);
  });
});
