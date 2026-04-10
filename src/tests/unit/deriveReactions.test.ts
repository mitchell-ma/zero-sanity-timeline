/**
 * Tests for deriveReactions — arts reaction derivation from infliction events.
 *
 * Reactions are cross-element: when an incoming infliction finds active
 * inflictions of a DIFFERENT element, a reaction is triggered.
 *
 * Reaction type is determined by the incoming element's mapping:
 *   Heat → Combustion, Cryo → Solidification, Nature → Corrosion, Electric → Electrification
 *
 * Status level = min(active other-element infliction count, 2).
 * All inflictions (incoming + active same/other element) are consumed.
 */

import { deriveReactions } from '../../controller/timeline/deriveReactions';
import type { TimelineEvent } from '../../consts/viewTypes';
import { INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_ID } from '../../model/channels';
import { EventStatusType } from '../../consts/enums';

const FPS = 120;

/** Create a minimal infliction event on the enemy timeline. */
function infliction(
  uid: string,
  columnId: string,
  startFrame: number,
  durationSeconds: number = 10,
  opts?: Partial<TimelineEvent>,
): TimelineEvent {
  return {
    uid,
    id: columnId,
    name: columnId,
    ownerEntityId: ENEMY_ID,
    columnId,
    startFrame,
    segments: [{ properties: { duration: Math.round(durationSeconds * FPS) } }],
    sourceEntityId: 'slot-0',
    ...opts,
  };
}

/** Find generated reaction events in the result. */
function findReactions(events: TimelineEvent[]): TimelineEvent[] {
  return events.filter((ev) => ev.uid.endsWith('-reaction'));
}

/** Find events that were consumed (clamped to 0 or near-0 duration). */
function findConsumed(events: TimelineEvent[]): TimelineEvent[] {
  return events.filter((ev) => ev.eventStatus === EventStatusType.CONSUMED);
}

describe('deriveReactions', () => {
  // ── Basic cross-element reaction ────────────────────────────────────────

  it('1 heat + 1 nature = corrosion level 1', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS), // 1s later
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions).toHaveLength(1);
    expect(reactions[0].columnId).toBe(REACTION_COLUMNS.CORROSION);
    expect(reactions[0].stacks).toBe(1);
    expect(reactions[0].startFrame).toBe(FPS);
  });

  it('2 heat + 1 nature = corrosion level 2', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0),
      infliction('h2', INFLICTION_COLUMNS.HEAT, FPS * 0.5),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS), // 1s later
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions).toHaveLength(1);
    expect(reactions[0].columnId).toBe(REACTION_COLUMNS.CORROSION);
    expect(reactions[0].stacks).toBe(2);
  });

  it('4 heat + 1 nature = corrosion level 2 (capped)', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0),
      infliction('h2', INFLICTION_COLUMNS.HEAT, 10),
      infliction('h3', INFLICTION_COLUMNS.HEAT, 20),
      infliction('h4', INFLICTION_COLUMNS.HEAT, 30),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS),
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions).toHaveLength(1);
    expect(reactions[0].columnId).toBe(REACTION_COLUMNS.CORROSION);
    expect(reactions[0].stacks).toBe(2);
  });

  // ── Reaction type determined by incoming element ────────────────────────

  it('1 nature + 1 heat = combustion level 1 (reaction keyed by incoming)', () => {
    const events = [
      infliction('n1', INFLICTION_COLUMNS.NATURE, 0),
      infliction('h1', INFLICTION_COLUMNS.HEAT, FPS),
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions).toHaveLength(1);
    expect(reactions[0].columnId).toBe(REACTION_COLUMNS.COMBUSTION);
    expect(reactions[0].stacks).toBe(1);
  });

  it('1 heat + 1 electric = electrification level 1', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0),
      infliction('e1', INFLICTION_COLUMNS.ELECTRIC, FPS),
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions).toHaveLength(1);
    expect(reactions[0].columnId).toBe(REACTION_COLUMNS.ELECTRIFICATION);
    expect(reactions[0].stacks).toBe(1);
  });

  it('1 heat + 1 cryo = solidification level 1', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0),
      infliction('c1', INFLICTION_COLUMNS.CRYO, FPS),
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions).toHaveLength(1);
    expect(reactions[0].columnId).toBe(REACTION_COLUMNS.SOLIDIFICATION);
    expect(reactions[0].stacks).toBe(1);
  });

  // ── All inflictions consumed ────────────────────────────────────────────

  it('incoming infliction is removed from output', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS),
    ];

    const result = deriveReactions(events);

    // The incoming nature infliction should be removed entirely
    expect(result.find((ev) => ev.uid === 'n1')).toBeUndefined();
  });

  it('other-element inflictions are consumed (clamped)', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0, 10),
      infliction('h2', INFLICTION_COLUMNS.HEAT, 30, 10),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS),
    ];

    const result = deriveReactions(events);
    const consumed = findConsumed(result);

    // Both heat inflictions should be consumed
    const consumedIds = consumed.map((ev) => ev.uid);
    expect(consumedIds).toContain('h1');
    expect(consumedIds).toContain('h2');
  });

  it('same-element inflictions of the incoming type are also consumed', () => {
    // h1 and h2 are heat, n1 is nature (incoming trigger).
    // h1 is same-element as h2. When n1 triggers a reaction, both h1 and h2
    // should be consumed. But also any earlier same-element (nature) inflictions.
    const events = [
      infliction('n0', INFLICTION_COLUMNS.NATURE, 0, 10),  // earlier nature
      infliction('h1', INFLICTION_COLUMNS.HEAT, 30, 10),   // heat arrives, triggers combustion (reacts with n0)
    ];

    const result = deriveReactions(events);

    // h1 is incoming trigger → removed. n0 is other-element → consumed.
    expect(result.find((ev) => ev.uid === 'h1')).toBeUndefined();
    const n0 = result.find((ev) => ev.uid === 'n0');
    expect(n0?.eventStatus).toBe(EventStatusType.CONSUMED);
  });

  it('all active same-element inflictions are consumed when reaction triggers', () => {
    // 3 heat inflictions, then 1 nature triggers corrosion.
    // All 3 heats should be consumed (not just 2).
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0, 10),
      infliction('h2', INFLICTION_COLUMNS.HEAT, 10, 10),
      infliction('h3', INFLICTION_COLUMNS.HEAT, 20, 10),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS),
    ];

    const result = deriveReactions(events);

    // All 3 heats should be consumed
    const h1 = result.find((ev) => ev.uid === 'h1');
    const h2 = result.find((ev) => ev.uid === 'h2');
    const h3 = result.find((ev) => ev.uid === 'h3');
    expect(h1?.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(h2?.eventStatus).toBe(EventStatusType.CONSUMED);
    expect(h3?.eventStatus).toBe(EventStatusType.CONSUMED);

    // Nature (incoming trigger) is removed entirely
    expect(result.find((ev) => ev.uid === 'n1')).toBeUndefined();

    // One corrosion reaction generated
    const reactions = findReactions(result);
    expect(reactions).toHaveLength(1);
  });

  // ── No reaction when no cross-element inflictions ───────────────────────

  it('same-element inflictions alone do not trigger a reaction', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0),
      infliction('h2', INFLICTION_COLUMNS.HEAT, FPS),
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions).toHaveLength(0);
  });

  it('no reaction when previous infliction has expired', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0, 0.5), // lasts 0.5s = 60 frames
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS),    // arrives at 1s = 120 frames (after heat expired)
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions).toHaveLength(0);
  });

  // ── stacks tracking ───────────────────────────────────────────

  it('stacks records active other-element count (capped at 2)', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0),
      infliction('h2', INFLICTION_COLUMNS.HEAT, 10),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS),
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions[0].stacks).toBe(2); // 2 active heat consumed, incoming not counted
  });

  // ── Source attribution ──────────────────────────────────────────────────

  it('reaction inherits sourceEntityId from incoming infliction', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0, 10, { sourceEntityId: 'slot-0' }),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS, 10, { sourceEntityId: 'slot-1' }),
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions[0].sourceEntityId).toBe('slot-1');
  });

  // ── Already-consumed inflictions are skipped ────────────────────────────

  it('inflictions with CONSUMED status do not trigger reactions', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0, 10, { eventStatus: EventStatusType.CONSUMED }),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS),
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions).toHaveLength(0);
  });

  it('already-consumed other-element inflictions are not counted', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0, 10, { eventStatus: EventStatusType.CONSUMED }),
      infliction('h2', INFLICTION_COLUMNS.HEAT, 30, 10),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS),
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions).toHaveLength(1);
    expect(reactions[0].stacks).toBe(1); // only h2 counts, h1 was already consumed
  });

  // ── Multiple sequential reactions ───────────────────────────────────────

  it('two separate reactions at different times', () => {
    const events = [
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0, 5),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS, 5),       // triggers corrosion at 1s
      infliction('c1', INFLICTION_COLUMNS.CRYO, FPS * 8, 5),
      infliction('e1', INFLICTION_COLUMNS.ELECTRIC, FPS * 9, 5), // triggers electrification at 9s
    ];

    const result = deriveReactions(events);
    const reactions = findReactions(result);

    expect(reactions).toHaveLength(2);
    expect(reactions[0].columnId).toBe(REACTION_COLUMNS.CORROSION);
    expect(reactions[1].columnId).toBe(REACTION_COLUMNS.ELECTRIFICATION);
  });

  // ── Non-infliction events are passed through ────────────────────────────

  it('non-infliction events are unchanged', () => {
    const operatorEvent: TimelineEvent = {
      uid: 'op-skill',
      id: 'SMOULDERING_FIRE',
      name: 'SMOULDERING_FIRE',
      ownerEntityId: 'slot-0',
      columnId: 'battle',
      startFrame: 0,
      segments: [{ properties: { duration: 240 } }],
    };

    const events = [
      operatorEvent,
      infliction('h1', INFLICTION_COLUMNS.HEAT, 0),
      infliction('n1', INFLICTION_COLUMNS.NATURE, FPS),
    ];

    const result = deriveReactions(events);
    const opResult = result.find((ev) => ev.uid === 'op-skill');

    expect(opResult).toBeDefined();
    expect(opResult).toEqual(operatorEvent);
  });
});
