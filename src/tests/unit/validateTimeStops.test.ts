/**
 * validateTimeStops Tests
 *
 * Validates that time-stop overlap warnings are only raised for
 * player-input skill columns (basic, battle, combo), not for
 * derived status/infliction/reaction events that legitimately
 * start at the same frame as a time-stop.
 */

import { TimelineEvent } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import { validateTimeStops, TimeStopRegion } from '../../controller/timeline/eventValidator';
import { INFLICTION_COLUMNS, REACTION_COLUMNS } from '../../model/channels';

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

const MELTING_FLAME_ID = 'MELTING_FLAME';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
  return {
    id: overrides.name ?? 'TEST',
    name: 'TEST',
    ownerEntityId: 'op-1',
    segments: [{ properties: { duration: 60 } }],
    ...overrides,
  };
}

function makeUltTimeStop(startFrame: number, durationFrames: number): TimeStopRegion {
  return { startFrame, durationFrames, ownerEntityId: 'op-1', sourceColumnId: NounType.ULTIMATE };
}

function makeComboTimeStop(startFrame: number, durationFrames: number): TimeStopRegion {
  return { startFrame, durationFrames, ownerEntityId: 'op-1', sourceColumnId: NounType.COMBO };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('validateTimeStops', () => {
  describe('warns for skill events during ultimate time-stop', () => {
    const stops = [makeUltTimeStop(100, 30)];

    it('warns for basic attack inside ult time-stop', () => {
      const events = [makeEvent({ uid: 'e1', columnId: NounType.BASIC_ATTACK, startFrame: 100 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(true);
    });

    it('warns for battle skill inside ult time-stop', () => {
      const events = [makeEvent({ uid: 'e1', columnId: NounType.BATTLE, startFrame: 110 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(true);
    });

    it('warns for combo skill inside ult time-stop', () => {
      const events = [makeEvent({ uid: 'e1', columnId: NounType.COMBO, startFrame: 115 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(true);
    });
  });

  describe('warns for skill events during combo time-stop', () => {
    const stops = [makeComboTimeStop(200, 20)];

    it('warns for basic attack inside combo time-stop', () => {
      const events = [makeEvent({ uid: 'e1', columnId: NounType.BASIC_ATTACK, startFrame: 200 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(true);
    });

    it('warns for battle skill inside combo time-stop', () => {
      const events = [makeEvent({ uid: 'e1', columnId: NounType.BATTLE, startFrame: 210 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(true);
    });
  });

  describe('does NOT warn for status/infliction/reaction events at time-stop start', () => {
    const stops = [makeUltTimeStop(100, 30)];

    it('allows infliction at time-stop start', () => {
      const events = [makeEvent({ uid: 'e1', columnId: INFLICTION_COLUMNS.HEAT, startFrame: 100, ownerEntityId: 'enemy' })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });

    it('allows reaction at time-stop start', () => {
      const events = [makeEvent({ uid: 'e1', columnId: REACTION_COLUMNS.COMBUSTION, startFrame: 100, ownerEntityId: 'enemy' })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });

    it('allows operator status at time-stop start', () => {
      const events = [makeEvent({ uid: 'e1', columnId: MELTING_FLAME_ID, startFrame: 100 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });

    it('allows infliction mid time-stop', () => {
      const events = [makeEvent({ uid: 'e1', columnId: INFLICTION_COLUMNS.CRYO, startFrame: 115, ownerEntityId: 'enemy' })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });
  });

  describe('does NOT warn for events outside time-stop', () => {
    const stops = [makeUltTimeStop(100, 30)];

    it('allows basic attack after time-stop ends', () => {
      const events = [makeEvent({ uid: 'e1', columnId: NounType.BASIC_ATTACK, startFrame: 130 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });

    it('allows battle skill before time-stop starts', () => {
      const events = [makeEvent({ uid: 'e1', columnId: NounType.BATTLE, startFrame: 99 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });
  });
});
