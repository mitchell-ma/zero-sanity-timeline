/**
 * @jest-environment jsdom
 */
/**
 * Tests for the embed codec (share URL encoding/decoding).
 *
 * Validates: round-trip fidelity, delta encoding, sanitization of malicious input,
 * size limits, and unknown ID handling.
 */

// @ts-nocheck
import { ColumnType, LoadoutNodeType } from '../../consts/enums';
import { NounType } from '../../dsl/semantics';
import { ultimateGraphKey } from '../../model/channels';
// Polyfill browser APIs not available in Node test environment
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill CompressionStream/DecompressionStream using zlib
const zlib = require('zlib');

function mockStream(transform) {
  const chunks = [];
  let resolveData;
  const dataPromise = new Promise((r) => { resolveData = r; });
  return {
    writable: {
      getWriter: () => ({
        write: (chunk) => { chunks.push(Buffer.from(chunk)); },
        close: () => { resolveData(transform(Buffer.concat(chunks))); },
      }),
    },
    readable: {
      getReader: () => {
        let done = false;
        return {
          read: async () => {
            if (done) return { done: true, value: undefined };
            done = true;
            const result = await dataPromise;
            return { done: false, value: new Uint8Array(result) };
          },
        };
      },
    },
  };
}

class MockCompressionStream {
  constructor() { Object.assign(this, mockStream((buf) => zlib.deflateRawSync(buf))); }
}

class MockDecompressionStream {
  constructor() { Object.assign(this, mockStream((buf) => zlib.inflateRawSync(buf))); }
}

global.CompressionStream = MockCompressionStream;
global.DecompressionStream = MockDecompressionStream;

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [],
  getConditionalValues: () => [],
  getConditionalScalar: () => undefined,
  getAttackByLevel: () => ({}),
}));

jest.mock('../../controller/operators/operatorRegistry', () => ({
  ALL_OPERATORS: [
    { id: 'LAEVATAIN', name: 'Laevatain', rarity: 6, maxTalentOneLevel: 3, maxTalentTwoLevel: 3 },
    { id: 'AKEKURI', name: 'Akekuri', rarity: 6, maxTalentOneLevel: 3, maxTalentTwoLevel: 3 },
    { id: 'ANTAL', name: 'Antal', rarity: 6, maxTalentOneLevel: 3, maxTalentTwoLevel: 3 },
    { id: 'ARDELIA', name: 'Ardelia', rarity: 6, maxTalentOneLevel: 3, maxTalentTwoLevel: 3 },
  ],
  operatorWarnings: () => [],
}));

jest.mock('../../utils/loadoutRegistry', () => ({
  OPERATORS: [],
  WEAPONS: [],
  WEAPON_REGISTRY: {},
  GEAR_SETS: [],
  CONSUMABLES: [],
  TACTICALS: [],
}));

jest.mock('../../utils/enemies', () => ({
  ALL_ENEMIES: [
    { id: 'training_dummy', name: 'Training Dummy' },
  ],
  DEFAULT_ENEMY: { id: 'training_dummy', name: 'Training Dummy' },
}));

const { encodeEmbed, decodeEmbed, buildShareUrl, getEmbedParams } = require('../../utils/embedCodec');
const { cleanSheetData } = require('../../utils/sheetStorage');
// Override applicator used when materializing overrides onto events
// const { applyEventOverrides } = require('../../controller/timeline/overrideApplicator');
const { EMPTY_LOADOUT } = require('../../view/OperatorLoadoutHeader');
const { DEFAULT_LOADOUT_PROPERTIES } = require('../../view/InformationPane');
const { uniqueName } = require('../../utils/loadoutStorage');
const { eventDuration } = require('../../consts/viewTypes');

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSheetData(overrides) {
  return {
    version: 2,
    operatorIds: ['LAEVATAIN', 'AKEKURI', 'ANTAL', 'ARDELIA'],
    enemyId: 'training_dummy',
    events: [],
    loadouts: {
      'slot-0': { ...EMPTY_LOADOUT },
      'slot-1': { ...EMPTY_LOADOUT },
      'slot-2': { ...EMPTY_LOADOUT },
      'slot-3': { ...EMPTY_LOADOUT },
    },
    loadoutProperties: {
      'slot-0': { ...DEFAULT_LOADOUT_PROPERTIES },
      'slot-1': { ...DEFAULT_LOADOUT_PROPERTIES },
      'slot-2': { ...DEFAULT_LOADOUT_PROPERTIES },
      'slot-3': { ...DEFAULT_LOADOUT_PROPERTIES },
    },
    visibleSkills: {
      'slot-0': { basic: true, battle: true, combo: true, ultimate: true },
      'slot-1': { basic: true, battle: true, combo: true, ultimate: true },
      'slot-2': { basic: true, battle: true, combo: true, ultimate: true },
      'slot-3': { basic: true, battle: true, combo: true, ultimate: true },
    },
    nextEventId: 1,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('embedCodec', () => {
  describe('round-trip', () => {
    test('empty sheet round-trips correctly', async () => {
      const original = makeSheetData();
      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.operatorIds).toEqual(original.operatorIds);
      expect(decoded.enemyId).toBe(original.enemyId);
      expect(decoded.events).toEqual([]);
    });

    test('sheet with events round-trips', async () => {
      const original = makeSheetData({
        events: [
          {
            id: 'ev-1',
            name: 'FLAMING_CINDERS',
            ownerId: 'slot-0',
            columnId: NounType.BATTLE_SKILL,
            startFrame: 360,
            segments: [{ properties: { duration: 188 } }],
          },
          {
            id: 'ev-2',
            name: 'ERUPTION_COLUMN',
            ownerId: 'slot-3',
            columnId: NounType.COMBO_SKILL,
            startFrame: 720,
                        segments: [{ properties: { segmentTypes: ['ANIMATION'], duration: 60, timeDependency: 'REAL_TIME' } }],
          },
        ],
        nextEventId: 3,
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.events).toHaveLength(2);
      expect(decoded.events[0].name).toBe('FLAMING_CINDERS');
      expect(decoded.events[0].startFrame).toBe(360);
      expect(eventDuration(decoded.events[0])).toBe(188);
      expect(decoded.events[1].name).toBe('ERUPTION_COLUMN');
      expect(decoded.events[1].ownerId).toBe('slot-3');
      const animSeg = decoded.events[1].segments?.find(s => s.properties.segmentTypes?.includes('ANIMATION'));
      expect(animSeg?.properties.duration).toBe(60);
    });

    test('loadout stats deltas round-trip', async () => {
      const original = makeSheetData({
        loadoutProperties: {
          'slot-0': {
            ...DEFAULT_LOADOUT_PROPERTIES,
            operator: { ...DEFAULT_LOADOUT_PROPERTIES.operator, potential: 3 },
            skills: { ...DEFAULT_LOADOUT_PROPERTIES.skills, comboSkillLevel: 8 },
          },
          'slot-1': { ...DEFAULT_LOADOUT_PROPERTIES },
          'slot-2': { ...DEFAULT_LOADOUT_PROPERTIES },
          'slot-3': { ...DEFAULT_LOADOUT_PROPERTIES },
        },
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.loadoutProperties['slot-0'].operator.potential).toBe(3);
      expect(decoded.loadoutProperties['slot-0'].skills.comboSkillLevel).toBe(8);
      expect(decoded.loadoutProperties['slot-0'].operator.level).toBe(DEFAULT_LOADOUT_PROPERTIES.operator.level);
      expect(decoded.loadoutProperties['slot-1'].operator.potential).toBe(DEFAULT_LOADOUT_PROPERTIES.operator.potential);
    });

    test('equipment round-trips', async () => {
      const original = makeSheetData({
        loadouts: {
          'slot-0': { ...EMPTY_LOADOUT, weaponId: 'FORGEBORN_SCATHE', armorId: 'TIDE_FALL' },
          'slot-1': { ...EMPTY_LOADOUT },
          'slot-2': { ...EMPTY_LOADOUT },
          'slot-3': { ...EMPTY_LOADOUT },
        },
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.loadouts['slot-0'].weaponId).toBe('FORGEBORN_SCATHE');
      expect(decoded.loadouts['slot-0'].armorId).toBe('TIDE_FALL');
      expect(decoded.loadouts['slot-0'].glovesId).toBeNull();
    });
  });

  describe('delta encoding', () => {
    test('default stats produce compact output', async () => {
      const original = makeSheetData();
      const encoded = await encodeEmbed(original, []);
      expect(encoded.length).toBeLessThan(500);
    });

    test('events with template-matching durations produce smaller output', async () => {
      const mockColumn = {
        type: ColumnType.MINI_TIMELINE,
        key: NounType.BATTLE_SKILL,
        columnId: NounType.BATTLE_SKILL,
        label: 'Battle',
        color: '#fff',
        ownerId: 'slot-0',
        defaultEvent: {
          name: 'FLAMING_CINDERS',
          defaultActivationDuration: 188,
          defaultActiveDuration: 0,
          defaultCooldownDuration: 0,
        },
      };

      const original = makeSheetData({
        events: [{
          id: 'ev-1',
          name: 'FLAMING_CINDERS',
          ownerId: 'slot-0',
          columnId: NounType.BATTLE_SKILL,
          startFrame: 360,
          segments: [{ properties: { duration: 188 } }],
        }],
      });

      const encodedWithTemplate = await encodeEmbed(original, [mockColumn]);
      const encodedWithout = await encodeEmbed(original, []);

      expect(encodedWithTemplate.length).toBeLessThanOrEqual(encodedWithout.length);
    });
  });

  describe('sanitization', () => {
    test('rejects oversized input', async () => {
      const huge = 'A'.repeat(20000);
      await expect(decodeEmbed(huge, [])).rejects.toThrow('too large');
    });

    test('unknown operator IDs become null', async () => {
      const original = makeSheetData({
        operatorIds: ['LAEVATAIN', 'FAKE_OPERATOR', null, 'AKEKURI'],
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.operatorIds[0]).toBe('LAEVATAIN');
      expect(decoded.operatorIds[1]).toBeNull();
      expect(decoded.operatorIds[2]).toBeNull();
      expect(decoded.operatorIds[3]).toBe('AKEKURI');
    });

    test('event frames are clamped to valid range', async () => {
      const original = makeSheetData({
        events: [{
          id: 'ev-1',
          name: 'FLAMING_CINDERS',
          ownerId: 'slot-0',
          columnId: NounType.BATTLE_SKILL,
          startFrame: 99999,
          segments: [{ properties: { duration: -50 } }],
        }],
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.events[0].startFrame).toBeLessThanOrEqual(14400);
      expect(eventDuration(decoded.events[0])).toBeGreaterThanOrEqual(0);
    });

    test('control characters are stripped from strings', async () => {
      const original = makeSheetData({
        loadouts: {
          'slot-0': { ...EMPTY_LOADOUT, weaponId: 'WEAPON\x00\x01\x02NAME' },
          'slot-1': { ...EMPTY_LOADOUT },
          'slot-2': { ...EMPTY_LOADOUT },
          'slot-3': { ...EMPTY_LOADOUT },
        },
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.loadouts['slot-0'].weaponId).toBe('WEAPONNAME');
    });

    test('invalid base64 throws', async () => {
      await expect(decodeEmbed('!!!invalid!!!', [])).rejects.toThrow();
    });
  });

  describe('segment and frame deltas', () => {
    const segmentColumn = {
      type: ColumnType.MINI_TIMELINE,
      key: NounType.BASIC_ATTACK,
      columnId: NounType.BASIC_ATTACK,
      label: 'Basic',
      color: '#fff',
      ownerId: 'slot-0',
      headerVariant: 'skill',
      defaultEvent: {
        name: 'BASIC_N1',
        defaultActivationDuration: 300,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        segments: [
          { properties: { duration: 60, name: '1' }, frames: [{ offsetFrame: 20 }, { offsetFrame: 45 }] },
          { properties: { duration: 80, name: '2' }, frames: [{ offsetFrame: 30 }] },
          { properties: { duration: 100, name: '3' }, frames: [{ offsetFrame: 50 }, { offsetFrame: 75 }] },
        ],
      },
    };

    test('unedited segmented event round-trips without sg/fo fields', async () => {
      const original = makeSheetData({
        events: [{
          id: 'ev-1',
          name: 'BASIC_N1',
          ownerId: 'slot-0',
          columnId: NounType.BASIC_ATTACK,
          startFrame: 120,
          segments: [{ properties: { duration: 300 } }],
          // No segments on the raw event — unedited
        }],
      });

      const encoded = await encodeEmbed(original, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.events[0].startFrame).toBe(120);
      expect(eventDuration(decoded.events[0])).toBe(300);
      // No edited segments stored — unedited event has a plain duration segment
      expect(decoded.events[0].segments).toHaveLength(1);
    });

    test('edited segment durations round-trip via overrides', async () => {
      const key = 'BASIC_N1:slot-0:BASIC_ATTACK:120';
      const original = makeSheetData({
        events: [{
          id: 'BASIC_N1', uid: 'ev-1', name: 'BASIC_N1', ownerId: 'slot-0',
          columnId: NounType.BASIC_ATTACK, startFrame: 120,
          segments: [{ properties: { duration: 300 } }],
        }],
        overrides: {
          [key]: { segments: { 0: { duration: 80 } } },
        },
      });

      const encoded = await encodeEmbed(original, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.overrides).toBeDefined();
      expect(decoded.overrides[key]?.segments?.[0]?.duration).toBe(80);
    });

    test('edited frame offsets round-trip via overrides', async () => {
      const key = 'BASIC_N1:slot-0:BASIC_ATTACK:120';
      const original = makeSheetData({
        events: [{
          id: 'BASIC_N1', uid: 'ev-1', name: 'BASIC_N1', ownerId: 'slot-0',
          columnId: NounType.BASIC_ATTACK, startFrame: 120,
          segments: [{ properties: { duration: 300 } }],
        }],
        overrides: {
          [key]: {
            segments: {
              0: { frames: { 0: { offsetFrame: 25 }, 1: { offsetFrame: 45 } } },
              2: { frames: { 1: { offsetFrame: 80 } } },
            },
          },
        },
      });

      const encoded = await encodeEmbed(original, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.overrides).toBeDefined();
      expect(decoded.overrides[key]?.segments?.[0]?.frames?.[0]?.offsetFrame).toBe(25);
      expect(decoded.overrides[key]?.segments?.[0]?.frames?.[1]?.offsetFrame).toBe(45);
      expect(decoded.overrides[key]?.segments?.[2]?.frames?.[1]?.offsetFrame).toBe(80);
    });

    test('frame offset only edit round-trips via overrides', async () => {
      const key = 'BASIC_N1:slot-0:BASIC_ATTACK:0';
      const original = makeSheetData({
        events: [{
          id: 'BASIC_N1', uid: 'ev-1', name: 'BASIC_N1', ownerId: 'slot-0',
          columnId: NounType.BASIC_ATTACK, startFrame: 0,
          segments: [{ properties: { duration: 300 } }],
        }],
        overrides: {
          [key]: { segments: { 1: { frames: { 0: { offsetFrame: 40 } } } } },
        },
      });

      const encoded = await encodeEmbed(original, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.overrides).toBeDefined();
      expect(decoded.overrides[key]?.segments?.[1]?.frames?.[0]?.offsetFrame).toBe(40);
    });

    test('overrides survive cleanSheetData + encode/decode', async () => {
      const key = 'BASIC_N1:slot-0:BASIC_ATTACK:0';
      const sheet = makeSheetData({
        events: [{
          id: 'BASIC_N1', uid: 'ev-1', name: 'BASIC_N1', ownerId: 'slot-0',
          columnId: NounType.BASIC_ATTACK, startFrame: 0,
          segments: [{ properties: { duration: 300 } }],
        }],
        overrides: {
          [key]: { segments: { 1: { frames: { 0: { offsetFrame: 40 } } } } },
        },
      });

      const cleaned = cleanSheetData(sheet);
      expect(cleaned.overrides).toBeDefined();

      const encoded = await encodeEmbed(sheet, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.overrides).toBeDefined();
      expect(decoded.overrides[key]?.segments?.[1]?.frames?.[0]?.offsetFrame).toBe(40);
    });

    test('override store round-trips frame edits via OverrideStore pattern', async () => {
      const key = 'BASIC_N1:slot-0:BASIC_ATTACK:0';
      const original = makeSheetData({
        events: [{
          id: 'BASIC_N1', uid: 'ev-1', name: 'BASIC_N1', ownerId: 'slot-0',
          columnId: NounType.BASIC_ATTACK, startFrame: 0,
          segments: [{ properties: { duration: 300 } }],
        }],
        overrides: {
          [key]: { segments: { 1: { frames: { 0: { offsetFrame: 45 } } } } },
        },
      });

      const encoded = await encodeEmbed(original, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.overrides).toBeDefined();
      expect(decoded.overrides[key]?.segments?.[1]?.frames?.[0]?.offsetFrame).toBe(45);
    });

    test('combined segment duration and frame offset overrides round-trip', async () => {
      const key = 'BASIC_N1:slot-0:BASIC_ATTACK:0';
      const original = makeSheetData({
        events: [{
          id: 'BASIC_N1', uid: 'ev-1', name: 'BASIC_N1', ownerId: 'slot-0',
          columnId: NounType.BASIC_ATTACK, startFrame: 0,
          segments: [{ properties: { duration: 300 } }],
        }],
        overrides: {
          [key]: {
            segments: {
              0: { duration: 90, frames: { 0: { offsetFrame: 25 }, 1: { offsetFrame: 55 } } },
            },
          },
        },
      });

      const encoded = await encodeEmbed(original, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.overrides).toBeDefined();
      expect(decoded.overrides[key]?.segments?.[0]?.duration).toBe(90);
      expect(decoded.overrides[key]?.segments?.[0]?.frames?.[0]?.offsetFrame).toBe(25);
      expect(decoded.overrides[key]?.segments?.[0]?.frames?.[1]?.offsetFrame).toBe(55);
    });
  });

  describe('visible skills', () => {
    test('decoded sheets have all skills visible', async () => {
      const original = makeSheetData();
      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      for (const slotId of ['slot-0', 'slot-1', 'slot-2', 'slot-3']) {
        expect(decoded.visibleSkills[slotId][NounType.BASIC_ATTACK]).toBe(true);
        expect(decoded.visibleSkills[slotId][NounType.BATTLE_SKILL]).toBe(true);
        expect(decoded.visibleSkills[slotId][NounType.COMBO_SKILL]).toBe(true);
        expect(decoded.visibleSkills[slotId][NounType.ULTIMATE]).toBe(true);
      }
    });
  });

  describe('share URL with loadout name', () => {
    let savedLocation;
    let savedHistory;

    beforeEach(() => {
      savedLocation = window.location;
      savedHistory = window.history;
      // Override location and history for URL tests
      Object.defineProperty(window, 'location', {
        writable: true,
        value: {
          origin: 'https://example.com',
          pathname: '/app/',
          search: '',
        },
      });
      Object.defineProperty(window, 'history', {
        writable: true,
        value: { replaceState: jest.fn() },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { writable: true, value: savedLocation });
      Object.defineProperty(window, 'history', { writable: true, value: savedHistory });
    });

    test('buildShareUrl includes loadout name as n= param', async () => {
      const sheet = makeSheetData();
      const url = await buildShareUrl(sheet, [], 'My Build');
      expect(url).toContain('&n=My%20Build');
      expect(url).toMatch(/^https:\/\/example\.com\/app\/\?d=.+&n=My%20Build$/);
    });

    test('buildShareUrl truncates name to 32 chars', async () => {
      const sheet = makeSheetData();
      const longName = 'A'.repeat(50);
      const url = await buildShareUrl(sheet, [], longName);
      const parsed = new URLSearchParams(url.split('?')[1]);
      expect(parsed.get('n').length).toBe(32);
    });

    test('getEmbedParams extracts data and name', () => {
      window.location.search = '?d=somedata&n=Cool%20Rotation';
      const result = getEmbedParams();
      expect(result).toEqual({ data: 'somedata', name: 'Cool Rotation' });
    });

    test('getEmbedParams defaults name to Shared Loadout when n= missing', () => {
      window.location.search = '?d=somedata';
      const result = getEmbedParams();
      expect(result).toEqual({ data: 'somedata', name: 'Shared Loadout' });
    });

    test('getEmbedParams returns null when d= missing', () => {
      window.location.search = '?n=SomeName';
      const result = getEmbedParams();
      expect(result).toBeNull();
    });
  });
});

describe('full state round-trip (current state → share → load → assert equal)', () => {
  // Columns simulate what columnBuilder produces for the operators
  const columns = [
    {
      type: ColumnType.MINI_TIMELINE,
      key: 'slot-0-basic',
      columnId: NounType.BASIC_ATTACK,
      ownerId: 'slot-0',
      label: 'Basic',
      color: '#f0a040',
      headerVariant: 'skill',
      defaultEvent: {
        name: 'SWORD_OF_ASPIRATION',
        defaultActivationDuration: 240,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        skillPointCost: undefined,
        gaugeGain: 5,
        segments: [
          { properties: { duration: 48, name: '1' }, frames: [{ offsetFrame: 15 }, { offsetFrame: 35 }] },
          { properties: { duration: 52, name: '2' }, frames: [{ offsetFrame: 20 }] },
          { properties: { duration: 60, name: '3' }, frames: [{ offsetFrame: 25 }, { offsetFrame: 45 }] },
          { properties: { duration: 40, name: '4' }, frames: [{ offsetFrame: 18 }] },
          { properties: { duration: 40, name: '5' }, frames: [{ offsetFrame: 20 }] },
        ],
      },
    },
    {
      type: ColumnType.MINI_TIMELINE,
      key: 'slot-0-battle',
      columnId: NounType.BATTLE_SKILL,
      ownerId: 'slot-0',
      label: 'Battle',
      color: '#f0a040',
      headerVariant: 'skill',
      defaultEvent: {
        name: 'SMOULDERING_FIRE',
        defaultActivationDuration: 264,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        skillPointCost: 100,
        gaugeGain: 10,
        segments: [
          { properties: { duration: 264 }, frames: [
            { offsetFrame: 30 }, { offsetFrame: 45 }, { offsetFrame: 60 },
            { offsetFrame: 75 }, { offsetFrame: 90 }, { offsetFrame: 105 },
            { offsetFrame: 120 }, { offsetFrame: 135 }, { offsetFrame: 155 },
            { offsetFrame: 170 }, { offsetFrame: 185 },
          ]},
        ],
      },
    },
    {
      type: ColumnType.MINI_TIMELINE,
      key: 'slot-0-combo',
      columnId: NounType.COMBO_SKILL,
      ownerId: 'slot-0',
      label: 'Combo',
      color: '#f0a040',
      headerVariant: 'skill',
      defaultEvent: {
        name: 'ERUPTION_COLUMN',
        defaultActivationDuration: 92,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        segments: [{ properties: { segmentTypes: ['ANIMATION'], duration: 60, timeDependency: 'REAL_TIME' } }],
        timeInteraction: 'TIME_STOP',
        gaugeGain: 15,
        teamGaugeGain: 5,
      },
    },
    {
      type: ColumnType.MINI_TIMELINE,
      key: ultimateGraphKey('slot-0'),
      columnId: NounType.ULTIMATE,
      ownerId: 'slot-0',
      label: 'Ultimate',
      color: '#f0a040',
      headerVariant: 'skill',
      defaultEvent: {
        name: 'SQUAD_ON_ME',
        defaultActivationDuration: 180,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        segments: [{ properties: { segmentTypes: ['ANIMATION'], duration: 120, timeDependency: 'REAL_TIME' } }],
        timeInteraction: 'TIME_STOP',
      },
    },
  ];

  test('full app state survives encode → decode with overrides', async () => {
    // ── Build "current app state" ───────────────────────────────────────
    const baKey = 'SWORD_OF_ASPIRATION:slot-0:BASIC_ATTACK:0';
    const bsKey = 'SMOULDERING_FIRE:slot-0:BATTLE_SKILL:240';
    const currentState = makeSheetData({
      events: [
        // Basic attack (raw, unedited segments — overrides stored separately)
        {
          id: 'SWORD_OF_ASPIRATION', uid: 'ev-1', name: 'SWORD_OF_ASPIRATION', ownerId: 'slot-0',
          columnId: NounType.BASIC_ATTACK, startFrame: 0,
          segments: [{ properties: { duration: 300 } }],
        },
        // Battle skill with SP cost
        {
          id: 'SMOULDERING_FIRE', uid: 'ev-2', name: 'SMOULDERING_FIRE', ownerId: 'slot-0',
          columnId: NounType.BATTLE_SKILL, startFrame: 240,
          skillPointCost: 100,
          segments: [{ properties: { duration: 264 } }],
        },
        // Combo skill (has animation + time interaction)
        {
          id: 'ERUPTION_COLUMN', uid: 'ev-3', name: 'ERUPTION_COLUMN', ownerId: 'slot-0',
          columnId: NounType.COMBO_SKILL, startFrame: 600,
          segments: [{ properties: { segmentTypes: ['ANIMATION'], duration: 60, timeDependency: 'REAL_TIME' } }],
          timeInteraction: 'TIME_STOP',
        },
        // Unedited basic attack
        {
          id: 'SWORD_OF_ASPIRATION', uid: 'ev-4', name: 'SWORD_OF_ASPIRATION', ownerId: 'slot-0',
          columnId: NounType.BASIC_ATTACK, startFrame: 720,
          segments: [{ properties: { duration: 240 } }],
        },
      ],
      overrides: {
        [baKey]: {
          segments: {
            0: { duration: 48, frames: { 0: { offsetFrame: 18 } } },
            1: { duration: 52 },
            2: { duration: 60 },
          },
        },
        [bsKey]: {
          segments: { 0: { frames: { 0: { offsetFrame: 33 } } } },
        },
      },
      loadouts: {
        'slot-0': { ...EMPTY_LOADOUT, weaponId: 'FORGEBORN_SCATHE', armorId: 'TIDE_FALL' },
        'slot-1': { ...EMPTY_LOADOUT },
        'slot-2': { ...EMPTY_LOADOUT },
        'slot-3': { ...EMPTY_LOADOUT },
      },
      loadoutProperties: {
        'slot-0': {
          ...DEFAULT_LOADOUT_PROPERTIES,
          operator: { ...DEFAULT_LOADOUT_PROPERTIES.operator, potential: 3 },
          skills: { ...DEFAULT_LOADOUT_PROPERTIES.skills, battleSkillLevel: 10 },
        },
        'slot-1': { ...DEFAULT_LOADOUT_PROPERTIES },
        'slot-2': { ...DEFAULT_LOADOUT_PROPERTIES },
        'slot-3': { ...DEFAULT_LOADOUT_PROPERTIES },
      },
      resourceConfigs: {
        'common-skillPoints': { startValue: 500, max: 1000, regenPerSecond: 10 },
        [ultimateGraphKey('slot-0')]: { startValue: 200, max: 6000, regenPerSecond: 0 },
      },
    });

    // ── Step 1: Encode (simulates SHARE button click) ───────────────────
    const encoded = await encodeEmbed(currentState, columns);

    // ── Step 2: Decode (simulates mount-time decode) ────────────────────
    const decoded = await decodeEmbed(encoded, []);

    // ── Assertions: event positions and names ───────────────────────────
    expect(decoded.events).toHaveLength(4);
    expect(decoded.events[0].name).toBe('SWORD_OF_ASPIRATION');
    expect(decoded.events[0].startFrame).toBe(0);
    expect(decoded.events[1].name).toBe('SMOULDERING_FIRE');
    expect(decoded.events[1].startFrame).toBe(240);
    expect(decoded.events[2].name).toBe('ERUPTION_COLUMN');
    expect(decoded.events[2].startFrame).toBe(600);
    expect(decoded.events[3].name).toBe('SWORD_OF_ASPIRATION');
    expect(decoded.events[3].startFrame).toBe(720);

    // ── Assertions: overrides round-tripped ─────────────────────────────
    expect(decoded.overrides).toBeDefined();
    expect(decoded.overrides[baKey]?.segments?.[0]?.duration).toBe(48);
    expect(decoded.overrides[baKey]?.segments?.[0]?.frames?.[0]?.offsetFrame).toBe(18);
    expect(decoded.overrides[baKey]?.segments?.[1]?.duration).toBe(52);
    expect(decoded.overrides[baKey]?.segments?.[2]?.duration).toBe(60);
    expect(decoded.overrides[bsKey]?.segments?.[0]?.frames?.[0]?.offsetFrame).toBe(33);

    // ── Assertions: combo skill properties ──────────────────────────────
    const comboAnimSeg = decoded.events[2].segments?.find(s => s.properties.segmentTypes?.includes('ANIMATION'));
    expect(comboAnimSeg?.properties.duration).toBe(60);
    expect(decoded.events[2].timeInteraction).toBe('TIME_STOP');

    // ── Assertions: resource configs ────────────────────────────────────
    expect(decoded.resourceConfigs).toBeDefined();
    expect(decoded.resourceConfigs['common-skillPoints']).toEqual({
      startValue: 500, max: 1000, regenPerSecond: 10,
    });
    expect(decoded.resourceConfigs[ultimateGraphKey('slot-0')]).toEqual({
      startValue: 200, max: 6000, regenPerSecond: 0,
    });

    // ── Assertions: loadout properties ──────────────────────────────────
    expect(decoded.loadoutProperties['slot-0'].operator.potential).toBe(3);
    expect(decoded.loadoutProperties['slot-0'].skills.battleSkillLevel).toBe(10);

    // ── Assertions: equipment ───────────────────────────────────────────
    expect(decoded.loadouts['slot-0'].weaponId).toBe('FORGEBORN_SCATHE');
    expect(decoded.loadouts['slot-0'].armorId).toBe('TIDE_FALL');

    // ── Assertions: operator and enemy IDs ──────────────────────────────
    expect(decoded.operatorIds).toEqual(['LAEVATAIN', 'AKEKURI', 'ANTAL', 'ARDELIA']);
    expect(decoded.enemyId).toBe('training_dummy');
  });
});

describe('uniqueName (loadout deduplication)', () => {
  function makeTree(names) {
    return {
      nodes: names.map((name, i) => ({
        id: `id-${i}`,
        type: LoadoutNodeType.LOADOUT,
        name,
        parentId: null,
        order: i,
      })),
    };
  }

  test('returns base name when no duplicates', () => {
    const tree = makeTree(['Loadout 1', 'Loadout 2']);
    expect(uniqueName(tree, 'My Build', null)).toBe('My Build');
  });

  test('appends 2 when base name exists', () => {
    const tree = makeTree(['My Build', 'Loadout 1']);
    expect(uniqueName(tree, 'My Build', null)).toBe('My Build 2');
  });

  test('increments past existing numbered duplicates', () => {
    const tree = makeTree(['My Build', 'My Build 2', 'My Build 3']);
    expect(uniqueName(tree, 'My Build', null)).toBe('My Build 4');
  });

  test('handles empty tree', () => {
    const tree = makeTree([]);
    expect(uniqueName(tree, 'Shared Loadout', null)).toBe('Shared Loadout');
  });
});
