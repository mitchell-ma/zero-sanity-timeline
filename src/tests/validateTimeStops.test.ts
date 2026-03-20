/**
 * validateTimeStops Tests
 *
 * Validates that time-stop overlap warnings are only raised for
 * player-input skill columns (basic, battle, combo), not for
 * derived status/infliction/reaction events that legitimately
 * start at the same frame as a time-stop.
 */

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
import { validateTimeStops, TimeStopRegion } from '../controller/timeline/eventValidator';
// eslint-disable-next-line import/first
import { SKILL_COLUMNS, INFLICTION_COLUMNS, REACTION_COLUMNS, OPERATOR_COLUMNS } from '../model/channels';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; startFrame: number }): TimelineEvent {
  return {
    name: 'TEST',
    ownerId: 'op-1',
    segments: [{ properties: { duration: 60 } }],
    ...overrides,
  };
}

function makeUltTimeStop(startFrame: number, durationFrames: number): TimeStopRegion {
  return { startFrame, durationFrames, ownerId: 'op-1', sourceColumnId: SKILL_COLUMNS.ULTIMATE };
}

function makeComboTimeStop(startFrame: number, durationFrames: number): TimeStopRegion {
  return { startFrame, durationFrames, ownerId: 'op-1', sourceColumnId: SKILL_COLUMNS.COMBO };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('validateTimeStops', () => {
  describe('warns for skill events during ultimate time-stop', () => {
    const stops = [makeUltTimeStop(100, 30)];

    it('warns for basic attack inside ult time-stop', () => {
      const events = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BASIC, startFrame: 100 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(true);
    });

    it('warns for battle skill inside ult time-stop', () => {
      const events = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 110 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(true);
    });

    it('warns for combo skill inside ult time-stop', () => {
      const events = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.COMBO, startFrame: 115 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(true);
    });
  });

  describe('warns for skill events during combo time-stop', () => {
    const stops = [makeComboTimeStop(200, 20)];

    it('warns for basic attack inside combo time-stop', () => {
      const events = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BASIC, startFrame: 200 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(true);
    });

    it('warns for battle skill inside combo time-stop', () => {
      const events = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 210 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(true);
    });
  });

  describe('does NOT warn for status/infliction/reaction events at time-stop start', () => {
    const stops = [makeUltTimeStop(100, 30)];

    it('allows infliction at time-stop start', () => {
      const events = [makeEvent({ id: 'e1', columnId: INFLICTION_COLUMNS.HEAT, startFrame: 100, ownerId: 'enemy' })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });

    it('allows reaction at time-stop start', () => {
      const events = [makeEvent({ id: 'e1', columnId: REACTION_COLUMNS.COMBUSTION, startFrame: 100, ownerId: 'enemy' })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });

    it('allows operator status at time-stop start', () => {
      const events = [makeEvent({ id: 'e1', columnId: OPERATOR_COLUMNS.MELTING_FLAME, startFrame: 100 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });

    it('allows infliction mid time-stop', () => {
      const events = [makeEvent({ id: 'e1', columnId: INFLICTION_COLUMNS.CRYO, startFrame: 115, ownerId: 'enemy' })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });
  });

  describe('does NOT warn for events outside time-stop', () => {
    const stops = [makeUltTimeStop(100, 30)];

    it('allows basic attack after time-stop ends', () => {
      const events = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BASIC, startFrame: 130 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });

    it('allows battle skill before time-stop starts', () => {
      const events = [makeEvent({ id: 'e1', columnId: SKILL_COLUMNS.BATTLE, startFrame: 99 })];
      const map = validateTimeStops(events, stops);
      expect(map.has('e1')).toBe(false);
    });
  });
});
