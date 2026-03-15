/**
 * Tests for the embed codec (share URL encoding/decoding).
 *
 * Validates: round-trip fidelity, delta encoding, sanitization of malicious input,
 * size limits, and unknown ID handling.
 */

// @ts-nocheck
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

// Mock operatorJsonLoader to avoid require.context
jest.mock('../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => undefined,
  getFrameSequences: () => [],
  getSegmentLabels: () => undefined,
  getSkillTimings: () => undefined,
  getUltimateEnergyCost: () => 0,
  getSkillGaugeGains: () => undefined,
  getBattleSkillSpCost: () => undefined,
  getSkillCategoryData: () => undefined,
  getBasicAttackDurations: () => undefined,
}));

jest.mock('../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [],
  getConditionalValues: () => [],
  getConditionalScalar: () => undefined,
  getAttackByLevel: () => ({}),
}));

jest.mock('../controller/operators/operatorRegistry', () => ({
  ALL_OPERATORS: [
    { id: 'laevatain', name: 'Laevatain', rarity: 6, maxTalentOneLevel: 3, maxTalentTwoLevel: 3 },
    { id: 'akekuri', name: 'Akekuri', rarity: 6, maxTalentOneLevel: 3, maxTalentTwoLevel: 3 },
    { id: 'antal', name: 'Antal', rarity: 6, maxTalentOneLevel: 3, maxTalentTwoLevel: 3 },
    { id: 'ardelia', name: 'Ardelia', rarity: 6, maxTalentOneLevel: 3, maxTalentTwoLevel: 3 },
  ],
  operatorWarnings: () => [],
}));

jest.mock('../utils/loadoutRegistry', () => ({
  OPERATORS: [],
  WEAPONS: [],
  WEAPON_REGISTRY: {},
  GEAR_SETS: [],
  CONSUMABLES: [],
  TACTICALS: [],
}));

jest.mock('../utils/enemies', () => ({
  ALL_ENEMIES: [
    { id: 'training_dummy', name: 'Training Dummy' },
  ],
  DEFAULT_ENEMY: { id: 'training_dummy', name: 'Training Dummy' },
}));

const { encodeEmbed, decodeEmbed, buildShareUrl, getEmbedParams } = require('../utils/embedCodec');
const { EMPTY_LOADOUT } = require('../view/OperatorLoadoutHeader');
const { DEFAULT_LOADOUT_STATS } = require('../view/InformationPane');
const { uniqueName } = require('../utils/loadoutStorage');

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSheetData(overrides) {
  return {
    version: 2,
    operatorIds: ['laevatain', 'akekuri', 'antal', 'ardelia'],
    enemyId: 'training_dummy',
    events: [],
    loadouts: {
      'slot-0': { ...EMPTY_LOADOUT },
      'slot-1': { ...EMPTY_LOADOUT },
      'slot-2': { ...EMPTY_LOADOUT },
      'slot-3': { ...EMPTY_LOADOUT },
    },
    loadoutStats: {
      'slot-0': { ...DEFAULT_LOADOUT_STATS },
      'slot-1': { ...DEFAULT_LOADOUT_STATS },
      'slot-2': { ...DEFAULT_LOADOUT_STATS },
      'slot-3': { ...DEFAULT_LOADOUT_STATS },
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
            columnId: 'battle',
            startFrame: 360,
            activationDuration: 188,
            activeDuration: 0,
            cooldownDuration: 0,
          },
          {
            id: 'ev-2',
            name: 'ERUPTION_COLUMN',
            ownerId: 'slot-3',
            columnId: 'combo',
            startFrame: 720,
            activationDuration: 92,
            activeDuration: 0,
            cooldownDuration: 0,
            animationDuration: 60,
          },
        ],
        nextEventId: 3,
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.events).toHaveLength(2);
      expect(decoded.events[0].name).toBe('FLAMING_CINDERS');
      expect(decoded.events[0].startFrame).toBe(360);
      expect(decoded.events[0].activationDuration).toBe(188);
      expect(decoded.events[1].name).toBe('ERUPTION_COLUMN');
      expect(decoded.events[1].ownerId).toBe('slot-3');
      expect(decoded.events[1].animationDuration).toBe(60);
    });

    test('loadout stats deltas round-trip', async () => {
      const original = makeSheetData({
        loadoutStats: {
          'slot-0': { ...DEFAULT_LOADOUT_STATS, potential: 3, comboSkillLevel: 8 },
          'slot-1': { ...DEFAULT_LOADOUT_STATS },
          'slot-2': { ...DEFAULT_LOADOUT_STATS },
          'slot-3': { ...DEFAULT_LOADOUT_STATS },
        },
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.loadoutStats['slot-0'].potential).toBe(3);
      expect(decoded.loadoutStats['slot-0'].comboSkillLevel).toBe(8);
      expect(decoded.loadoutStats['slot-0'].operatorLevel).toBe(DEFAULT_LOADOUT_STATS.operatorLevel);
      expect(decoded.loadoutStats['slot-1'].potential).toBe(DEFAULT_LOADOUT_STATS.potential);
    });

    test('equipment round-trips', async () => {
      const original = makeSheetData({
        loadouts: {
          'slot-0': { ...EMPTY_LOADOUT, weaponName: 'FORGEBORN_SCATHE', armorName: 'TIDE_FALL' },
          'slot-1': { ...EMPTY_LOADOUT },
          'slot-2': { ...EMPTY_LOADOUT },
          'slot-3': { ...EMPTY_LOADOUT },
        },
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.loadouts['slot-0'].weaponName).toBe('FORGEBORN_SCATHE');
      expect(decoded.loadouts['slot-0'].armorName).toBe('TIDE_FALL');
      expect(decoded.loadouts['slot-0'].glovesName).toBeNull();
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
        type: 'mini-timeline',
        key: 'battle',
        columnId: 'battle',
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
          columnId: 'battle',
          startFrame: 360,
          activationDuration: 188,
          activeDuration: 0,
          cooldownDuration: 0,
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
        operatorIds: ['laevatain', 'FAKE_OPERATOR', null, 'akekuri'],
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.operatorIds[0]).toBe('laevatain');
      expect(decoded.operatorIds[1]).toBeNull();
      expect(decoded.operatorIds[2]).toBeNull();
      expect(decoded.operatorIds[3]).toBe('akekuri');
    });

    test('event frames are clamped to valid range', async () => {
      const original = makeSheetData({
        events: [{
          id: 'ev-1',
          name: 'FLAMING_CINDERS',
          ownerId: 'slot-0',
          columnId: 'battle',
          startFrame: 99999,
          activationDuration: -50,
          activeDuration: 0,
          cooldownDuration: 0,
        }],
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.events[0].startFrame).toBeLessThanOrEqual(14400);
      expect(decoded.events[0].activationDuration).toBeGreaterThanOrEqual(0);
    });

    test('control characters are stripped from strings', async () => {
      const original = makeSheetData({
        loadouts: {
          'slot-0': { ...EMPTY_LOADOUT, weaponName: 'WEAPON\x00\x01\x02NAME' },
          'slot-1': { ...EMPTY_LOADOUT },
          'slot-2': { ...EMPTY_LOADOUT },
          'slot-3': { ...EMPTY_LOADOUT },
        },
      });

      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      expect(decoded.loadouts['slot-0'].weaponName).toBe('WEAPONNAME');
    });

    test('invalid base64 throws', async () => {
      await expect(decodeEmbed('!!!invalid!!!', [])).rejects.toThrow();
    });
  });

  describe('visible skills', () => {
    test('decoded sheets have all skills visible', async () => {
      const original = makeSheetData();
      const encoded = await encodeEmbed(original, []);
      const decoded = await decodeEmbed(encoded, []);

      for (const slotId of ['slot-0', 'slot-1', 'slot-2', 'slot-3']) {
        expect(decoded.visibleSkills[slotId].basic).toBe(true);
        expect(decoded.visibleSkills[slotId].battle).toBe(true);
        expect(decoded.visibleSkills[slotId].combo).toBe(true);
        expect(decoded.visibleSkills[slotId].ultimate).toBe(true);
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

describe('uniqueName (loadout deduplication)', () => {
  function makeTree(names) {
    return {
      nodes: names.map((name, i) => ({
        id: `id-${i}`,
        type: 'loadout',
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
