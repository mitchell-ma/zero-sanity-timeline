/**
 * TRIGGER determiner resolution in secondary conditions.
 *
 * Verifies that when a primary trigger condition uses ANY OPERATOR,
 * secondary conditions using TRIGGER OPERATOR resolve to the operator
 * that matched the primary — not the status owner.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { SKILL_COLUMNS } from '../../model/channels';
import { FPS } from '../../utils/timeline';
import { findClauseTriggerMatches } from '../../controller/timeline/triggerMatch';

jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_OWNER = 'slot-0';
const SLOT_A = 'slot-1';
const SLOT_B = 'slot-2';
const STATUS_COLUMN = 'AMP';

function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
  return { id: overrides.name ?? '', name: '', ownerId: STATUS_OWNER, segments: [{ properties: { duration: 0 } }], ...overrides };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('TRIGGER determiner resolves to the ANY operator that matched primary', () => {
  // Clause: ANY OPERATOR DEAL DAMAGE AND TRIGGER OPERATOR HAVE AMP STATUS
  // DEAL is priority 30, HAVE is priority 70 → DEAL is primary, HAVE is secondary.
  // The secondary should check for status on the operator that dealt damage,
  // not on the status owner (slot-0).
  const clause = [{
    conditions: [
      { subjectDeterminer: 'ANY', subject: 'OPERATOR', verb: 'DEAL', object: 'DAMAGE' },
      { subjectDeterminer: 'TRIGGER', subject: 'OPERATOR', verb: 'HAVE', object: 'STATUS', objectId: 'AMP' },
    ],
  }];

  test('matches when the dealing operator has the status', () => {
    const events = [
      // SLOT_A deals damage at frame 600
      makeEvent({
        uid: 'skill-a', ownerId: SLOT_A,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 600,
        segments: [{ properties: { duration: 2 * FPS }, frames: [{ offsetFrame: FPS }] }],
      }),
      // SLOT_A has AMP status active at frame 600
      makeEvent({
        uid: 'amp-a', ownerId: SLOT_A,
        columnId: STATUS_COLUMN, startFrame: 0,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
    ];
    const matches = findClauseTriggerMatches(clause, events, STATUS_OWNER);
    expect(matches.length).toBe(1);
    expect(matches[0].sourceOwnerId).toBe(SLOT_A);
  });

  test('does NOT match when a different operator has the status', () => {
    const events = [
      // SLOT_A deals damage at frame 600
      makeEvent({
        uid: 'skill-a', ownerId: SLOT_A,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 600,
        segments: [{ properties: { duration: 2 * FPS }, frames: [{ offsetFrame: FPS }] }],
      }),
      // SLOT_B has AMP status (not SLOT_A)
      makeEvent({
        uid: 'amp-b', ownerId: SLOT_B,
        columnId: STATUS_COLUMN, startFrame: 0,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
    ];
    const matches = findClauseTriggerMatches(clause, events, STATUS_OWNER);
    expect(matches.length).toBe(0);
  });

  test('matches only the operator that has the status when multiple deal damage', () => {
    const events = [
      // SLOT_A deals damage
      makeEvent({
        uid: 'skill-a', ownerId: SLOT_A,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 600,
        segments: [{ properties: { duration: 2 * FPS }, frames: [{ offsetFrame: FPS }] }],
      }),
      // SLOT_B deals damage
      makeEvent({
        uid: 'skill-b', ownerId: SLOT_B,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 900,
        segments: [{ properties: { duration: 2 * FPS }, frames: [{ offsetFrame: FPS }] }],
      }),
      // Only SLOT_B has AMP status
      makeEvent({
        uid: 'amp-b', ownerId: SLOT_B,
        columnId: STATUS_COLUMN, startFrame: 0,
        segments: [{ properties: { duration: 60 * FPS } }],
      }),
    ];
    const matches = findClauseTriggerMatches(clause, events, STATUS_OWNER);
    expect(matches.length).toBe(1);
    expect(matches[0].sourceOwnerId).toBe(SLOT_B);
  });

  test('does NOT match when status owner has the status but is not the dealer', () => {
    const events = [
      // SLOT_A deals damage
      makeEvent({
        uid: 'skill-a', ownerId: SLOT_A,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 600,
        segments: [{ properties: { duration: 2 * FPS }, frames: [{ offsetFrame: FPS }] }],
      }),
      // STATUS_OWNER (slot-0) has AMP — but slot-0 is not dealing damage
      makeEvent({
        uid: 'amp-owner', ownerId: STATUS_OWNER,
        columnId: STATUS_COLUMN, startFrame: 0,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
    ];
    const matches = findClauseTriggerMatches(clause, events, STATUS_OWNER);
    // Without TRIGGER support, this would incorrectly match because
    // TRIGGER would fall back to sourceOwnerId (STATUS_OWNER) which has the status.
    expect(matches.length).toBe(0);
  });
});
