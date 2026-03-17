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
  getAllOperatorIds: () => [],
  getSkillIds: () => new Set(),
  getSkillTypeMap: () => ({}),
  resolveSkillType: () => null,
  getSkillJson: () => undefined,
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
const { cleanSheetData } = require('../utils/sheetStorage');
const { attachDefaultSegments } = require('../controller/appStateController');
const { EMPTY_LOADOUT } = require('../view/OperatorLoadoutHeader');
const { DEFAULT_LOADOUT_PROPERTIES } = require('../view/InformationPane');
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

  describe('segment and frame deltas', () => {
    const segmentColumn = {
      type: 'mini-timeline',
      key: 'basic',
      columnId: 'basic',
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
          { name: 'N1', durationFrames: 60, label: '1', frames: [{ offsetFrame: 20 }, { offsetFrame: 45 }] },
          { name: 'N2', durationFrames: 80, label: '2', frames: [{ offsetFrame: 30 }] },
          { name: 'N3', durationFrames: 100, label: '3', frames: [{ offsetFrame: 50 }, { offsetFrame: 75 }] },
        ],
      },
    };

    test('unedited segmented event round-trips without sg/fo fields', async () => {
      const original = makeSheetData({
        events: [{
          id: 'ev-1',
          name: 'BASIC_N1',
          ownerId: 'slot-0',
          columnId: 'basic',
          startFrame: 120,
          activationDuration: 300,
          activeDuration: 0,
          cooldownDuration: 0,
          // No segments on the raw event — unedited
        }],
      });

      const encoded = await encodeEmbed(original, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.events[0].startFrame).toBe(120);
      expect(decoded.events[0].activationDuration).toBe(300);
      // No segments stored — unedited event relies on template reattachment
      expect(decoded.events[0].segments).toBeUndefined();
    });

    test('edited segment durations round-trip', async () => {
      const original = makeSheetData({
        events: [{
          id: 'ev-1',
          name: 'BASIC_N1',
          ownerId: 'slot-0',
          columnId: 'basic',
          startFrame: 120,
          activationDuration: 320,
          activeDuration: 0,
          cooldownDuration: 0,
          segments: [
            { name: 'N1', durationFrames: 80, label: '1', frames: [{ offsetFrame: 20 }, { offsetFrame: 45 }] },
            { name: 'N2', durationFrames: 80, label: '2', frames: [{ offsetFrame: 30 }] },
            { name: 'N3', durationFrames: 100, label: '3', frames: [{ offsetFrame: 50 }, { offsetFrame: 75 }] },
          ],
        }],
      });

      const encoded = await encodeEmbed(original, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.events[0].segments).toBeDefined();
      expect(decoded.events[0].segments).toHaveLength(3);
      expect(decoded.events[0].segments[0].durationFrames).toBe(80); // edited
      expect(decoded.events[0].segments[1].durationFrames).toBe(80); // unchanged
      expect(decoded.events[0].segments[2].durationFrames).toBe(100); // unchanged
    });

    test('edited frame offsets round-trip', async () => {
      const original = makeSheetData({
        events: [{
          id: 'ev-1',
          name: 'BASIC_N1',
          ownerId: 'slot-0',
          columnId: 'basic',
          startFrame: 120,
          activationDuration: 300,
          activeDuration: 0,
          cooldownDuration: 0,
          segments: [
            { name: 'N1', durationFrames: 60, label: '1', frames: [{ offsetFrame: 25 }, { offsetFrame: 45 }] },
            { name: 'N2', durationFrames: 80, label: '2', frames: [{ offsetFrame: 30 }] },
            { name: 'N3', durationFrames: 100, label: '3', frames: [{ offsetFrame: 50 }, { offsetFrame: 80 }] },
          ],
        }],
      });

      const encoded = await encodeEmbed(original, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.events[0].segments).toBeDefined();
      // N1 frame 0: 20 → 25
      expect(decoded.events[0].segments[0].frames[0].offsetFrame).toBe(25);
      // N1 frame 1: unchanged
      expect(decoded.events[0].segments[0].frames[1].offsetFrame).toBe(45);
      // N3 frame 1: 75 → 80
      expect(decoded.events[0].segments[2].frames[1].offsetFrame).toBe(80);
    });

    test('frame offset only edit round-trips (no segment duration change)', async () => {
      // Simulate: user only changed frame offset on N2 (30 → 40), nothing else
      const original = makeSheetData({
        events: [{
          id: 'ev-1',
          name: 'BASIC_N1',
          ownerId: 'slot-0',
          columnId: 'basic',
          startFrame: 0,
          activationDuration: 300,
          activeDuration: 0,
          cooldownDuration: 0,
          segments: [
            { name: 'N1', durationFrames: 60, label: '1', frames: [{ offsetFrame: 20 }, { offsetFrame: 45 }] },
            { name: 'N2', durationFrames: 80, label: '2', frames: [{ offsetFrame: 40 }] },
            { name: 'N3', durationFrames: 100, label: '3', frames: [{ offsetFrame: 50 }, { offsetFrame: 75 }] },
          ],
        }],
      });

      const encoded = await encodeEmbed(original, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.events[0].segments).toBeDefined();
      expect(decoded.events[0].segments[1].frames[0].offsetFrame).toBe(40);
      // Everything else unchanged
      expect(decoded.events[0].segments[0].frames[0].offsetFrame).toBe(20);
      expect(decoded.events[0].segments[0].frames[1].offsetFrame).toBe(45);
      expect(decoded.events[0].segments[2].frames[0].offsetFrame).toBe(50);
      expect(decoded.events[0].segments[2].frames[1].offsetFrame).toBe(75);
      // Segment durations unchanged
      expect(decoded.events[0].segments[0].durationFrames).toBe(60);
      expect(decoded.events[0].segments[1].durationFrames).toBe(80);
      expect(decoded.events[0].segments[2].durationFrames).toBe(100);
    });

    test('edited frame offsets survive cleanSheetData + encode/decode', async () => {
      // Simulate the full production flow:
      // 1. Raw event with user-edited segments (frame offset 30→40 on N2)
      // 2. cleanSheetData (called by encodeEmbed internally)
      // 3. encode → decode
      // 4. Verify frame offset is preserved
      const rawEvent = {
        id: 'ev-1',
        name: 'BASIC_N1',
        ownerId: 'slot-0',
        columnId: 'basic',
        startFrame: 0,
        activationDuration: 300,
        activeDuration: 0,
        cooldownDuration: 0,
        segments: [
          { name: 'N1', durationFrames: 60, label: '1', frames: [{ offsetFrame: 20 }, { offsetFrame: 45 }] },
          { name: 'N2', durationFrames: 80, label: '2', frames: [{ offsetFrame: 40 }] },
          { name: 'N3', durationFrames: 100, label: '3', frames: [{ offsetFrame: 50 }, { offsetFrame: 75 }] },
        ],
      };

      // Verify cleanSheetData preserves segments
      const sheet = makeSheetData({ events: [rawEvent] });
      const cleaned = cleanSheetData(sheet);
      expect(cleaned.events[0].segments).toBeDefined();
      expect(cleaned.events[0].segments[1].frames[0].offsetFrame).toBe(40);

      // Full encode/decode round-trip
      const encoded = await encodeEmbed(sheet, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.events[0].segments).toBeDefined();
      expect(decoded.events[0].segments[1].frames[0].offsetFrame).toBe(40);
    });

    test('raw event without segments: edit via FrameOffsetField pattern then share', async () => {
      // Simulate the full production lifecycle:
      // 1. Event is added (no segments on raw event)
      // 2. User edits frame offset via FrameOffsetField (writes segments to raw event via handleUpdateEvent)
      // 3. Save to localStorage (cleanSheetData preserves segments)
      // 4. Encode for sharing
      // 5. Decode on recipient side

      // Step 1: Raw event with no segments (as created by handleAddEvent)
      const rawEvent = {
        id: 'ev-1',
        name: 'BASIC_N1',
        ownerId: 'slot-0',
        columnId: 'basic',
        startFrame: 0,
        activationDuration: 300,
        activeDuration: 0,
        cooldownDuration: 0,
        // NO segments — this is how raw events look before any edit
      };

      // Step 2: Simulate FrameOffsetField.commit() — it reads segments from the *processed* event
      // (which got them from attachDefaultSegments), modifies one frame offset, and calls
      // onUpdate(eventId, { segments: newSegments })
      const processedSegments = segmentColumn.defaultEvent.segments; // from attachDefaultSegments
      const editedSegments = processedSegments.map((s, si) => {
        if (si !== 1) return s;
        return { ...s, frames: s.frames.map((f, fi) => fi === 0 ? { ...f, offsetFrame: 45 } : f) };
      });
      // After handleUpdateEvent: merged = { ...rawEvent, segments: editedSegments }
      const afterEdit = { ...rawEvent, segments: editedSegments };

      // Step 3: cleanSheetData preserves segments
      const sheet = makeSheetData({ events: [afterEdit] });
      const cleaned = cleanSheetData(sheet);
      expect(cleaned.events[0].segments).toBeDefined();
      expect(cleaned.events[0].segments[1].frames[0].offsetFrame).toBe(45);

      // Step 4+5: Encode and decode
      const encoded = await encodeEmbed(sheet, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.events[0].segments).toBeDefined();
      expect(decoded.events[0].segments[1].frames[0].offsetFrame).toBe(45); // edited value
      expect(decoded.events[0].segments[0].frames[0].offsetFrame).toBe(20); // default value
    });

    test('combined segment duration and frame offset edits round-trip', async () => {
      const original = makeSheetData({
        events: [{
          id: 'ev-1',
          name: 'BASIC_N1',
          ownerId: 'slot-0',
          columnId: 'basic',
          startFrame: 0,
          activationDuration: 330,
          activeDuration: 0,
          cooldownDuration: 0,
          segments: [
            { name: 'N1', durationFrames: 90, label: '1', frames: [{ offsetFrame: 25 }, { offsetFrame: 55 }] },
            { name: 'N2', durationFrames: 80, label: '2', frames: [{ offsetFrame: 30 }] },
            { name: 'N3', durationFrames: 100, label: '3', frames: [{ offsetFrame: 50 }, { offsetFrame: 75 }] },
          ],
        }],
      });

      const encoded = await encodeEmbed(original, [segmentColumn]);
      const decoded = await decodeEmbed(encoded, [segmentColumn]);

      expect(decoded.events[0].segments).toBeDefined();
      // N1 duration: 60 → 90
      expect(decoded.events[0].segments[0].durationFrames).toBe(90);
      // N1 frame 0: 20 → 25
      expect(decoded.events[0].segments[0].frames[0].offsetFrame).toBe(25);
      // N1 frame 1: 45 → 55
      expect(decoded.events[0].segments[0].frames[1].offsetFrame).toBe(55);
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

describe('full state round-trip (current state → share → load → assert equal)', () => {
  // Columns simulate what columnBuilder produces for the operators
  const columns = [
    {
      type: 'mini-timeline',
      key: 'slot-0-basic',
      columnId: 'basic',
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
          { name: 'N1', durationFrames: 48, label: '1', frames: [{ offsetFrame: 15 }, { offsetFrame: 35 }] },
          { name: 'N2', durationFrames: 52, label: '2', frames: [{ offsetFrame: 20 }] },
          { name: 'N3', durationFrames: 60, label: '3', frames: [{ offsetFrame: 25 }, { offsetFrame: 45 }] },
          { name: 'N4', durationFrames: 40, label: '4', frames: [{ offsetFrame: 18 }] },
          { name: 'N5', durationFrames: 40, label: '5', frames: [{ offsetFrame: 20 }] },
        ],
      },
    },
    {
      type: 'mini-timeline',
      key: 'slot-0-battle',
      columnId: 'battle',
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
          { durationFrames: 264, frames: [
            { offsetFrame: 30 }, { offsetFrame: 45 }, { offsetFrame: 60 },
            { offsetFrame: 75 }, { offsetFrame: 90 }, { offsetFrame: 105 },
            { offsetFrame: 120 }, { offsetFrame: 135 }, { offsetFrame: 155 },
            { offsetFrame: 170 }, { offsetFrame: 185 },
          ]},
        ],
      },
    },
    {
      type: 'mini-timeline',
      key: 'slot-0-combo',
      columnId: 'combo',
      ownerId: 'slot-0',
      label: 'Combo',
      color: '#f0a040',
      headerVariant: 'skill',
      defaultEvent: {
        name: 'ERUPTION_COLUMN',
        defaultActivationDuration: 92,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        animationDuration: 60,
        timeInteraction: 'TIME_STOP',
        gaugeGain: 15,
        teamGaugeGain: 5,
      },
    },
    {
      type: 'mini-timeline',
      key: 'slot-0-ultimate',
      columnId: 'ultimate',
      ownerId: 'slot-0',
      label: 'Ultimate',
      color: '#f0a040',
      headerVariant: 'skill',
      defaultEvent: {
        name: 'SQUAD_ON_ME',
        defaultActivationDuration: 180,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        animationDuration: 120,
        timeInteraction: 'TIME_STOP',
      },
    },
  ];

  test('full app state survives encode → decode → attachDefaultSegments', async () => {
    // ── Build "current app state" ───────────────────────────────────────
    // This represents what buildSheetData() returns: raw events with
    // user-edited segments, resource config overrides, loadout properties, etc.
    const currentState = makeSheetData({
      events: [
        // Basic attack with truncated segments (N1–N3 only) and edited frame offset
        {
          id: 'ev-1',
          name: 'SWORD_OF_ASPIRATION',
          ownerId: 'slot-0',
          columnId: 'basic',
          startFrame: 0,
          activationDuration: 160,
          activeDuration: 0,
          cooldownDuration: 0,
          segments: [
            { name: 'N1', durationFrames: 48, label: '1', frames: [{ offsetFrame: 18 }, { offsetFrame: 35 }] },
            { name: 'N2', durationFrames: 52, label: '2', frames: [{ offsetFrame: 20 }] },
            { name: 'N3', durationFrames: 60, label: '3', frames: [{ offsetFrame: 25 }, { offsetFrame: 45 }] },
          ],
        },
        // Battle skill with edited frame offset and SP cost
        {
          id: 'ev-2',
          name: 'SMOULDERING_FIRE',
          ownerId: 'slot-0',
          columnId: 'battle',
          startFrame: 240,
          activationDuration: 264,
          activeDuration: 0,
          cooldownDuration: 0,
          skillPointCost: 100,
          segments: [
            { durationFrames: 264, frames: [
              { offsetFrame: 33 }, { offsetFrame: 45 }, { offsetFrame: 60 },
              { offsetFrame: 75 }, { offsetFrame: 90 }, { offsetFrame: 105 },
              { offsetFrame: 120 }, { offsetFrame: 135 }, { offsetFrame: 155 },
              { offsetFrame: 170 }, { offsetFrame: 185 },
            ]},
          ],
        },
        // Combo skill (no segments, has animation + time interaction)
        {
          id: 'ev-3',
          name: 'ERUPTION_COLUMN',
          ownerId: 'slot-0',
          columnId: 'combo',
          startFrame: 600,
          activationDuration: 92,
          activeDuration: 0,
          cooldownDuration: 0,
          animationDuration: 60,
          timeInteraction: 'TIME_STOP',
        },
        // Unedited basic attack (no segments on raw event)
        {
          id: 'ev-4',
          name: 'SWORD_OF_ASPIRATION',
          ownerId: 'slot-0',
          columnId: 'basic',
          startFrame: 720,
          activationDuration: 240,
          activeDuration: 0,
          cooldownDuration: 0,
        },
      ],
      loadouts: {
        'slot-0': { ...EMPTY_LOADOUT, weaponName: 'FORGEBORN_SCATHE', armorName: 'TIDE_FALL' },
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
        'slot-0-ultimate': { startValue: 200, max: 6000, regenPerSecond: 0 },
      },
    });

    // ── Step 1: Encode (simulates SHARE button click) ───────────────────
    const encoded = await encodeEmbed(currentState, columns);

    // ── Step 2: Decode with empty columns (simulates mount-time decode) ─
    const decodedRaw = await decodeEmbed(encoded, []);

    // ── Step 3: attachDefaultSegments with real columns ─────────────────
    // (simulates what validEvents memo does after columns recompute)
    const resolved = attachDefaultSegments(decodedRaw.events, columns);

    // ── Assertions: event positions and names ───────────────────────────
    expect(resolved).toHaveLength(4);
    expect(resolved[0].name).toBe('SWORD_OF_ASPIRATION');
    expect(resolved[0].startFrame).toBe(0);
    expect(resolved[1].name).toBe('SMOULDERING_FIRE');
    expect(resolved[1].startFrame).toBe(240);
    expect(resolved[2].name).toBe('ERUPTION_COLUMN');
    expect(resolved[2].startFrame).toBe(600);
    expect(resolved[3].name).toBe('SWORD_OF_ASPIRATION');
    expect(resolved[3].startFrame).toBe(720);

    // ── Assertions: edited basic attack segments (truncated N1–N3) ──────
    expect(resolved[0].segments).toHaveLength(3);
    expect(resolved[0].segments[0].durationFrames).toBe(48);
    expect(resolved[0].segments[0].frames[0].offsetFrame).toBe(18); // edited from 15
    expect(resolved[0].segments[0].frames[1].offsetFrame).toBe(35); // unchanged
    expect(resolved[0].segments[1].frames[0].offsetFrame).toBe(20); // unchanged
    expect(resolved[0].segments[2].frames[0].offsetFrame).toBe(25); // unchanged
    expect(resolved[0].segments[2].frames[1].offsetFrame).toBe(45); // unchanged

    // ── Assertions: edited battle skill frame offset ────────────────────
    expect(resolved[1].segments).toHaveLength(1);
    expect(resolved[1].segments[0].frames[0].offsetFrame).toBe(33); // edited from 30
    expect(resolved[1].segments[0].frames[1].offsetFrame).toBe(45); // unchanged
    // skillPointCost reattached from column definition
    expect(resolved[1].skillPointCost).toBe(100);

    // ── Assertions: combo skill properties ──────────────────────────────
    expect(resolved[2].animationDuration).toBe(60);
    expect(resolved[2].timeInteraction).toBe('TIME_STOP');
    // gaugeGain/teamGaugeGain reattached from column definition
    expect(resolved[2].gaugeGain).toBe(15);
    expect(resolved[2].teamGaugeGain).toBe(5);

    // ── Assertions: unedited basic attack gets full default segments ────
    expect(resolved[3].segments).toHaveLength(5);
    expect(resolved[3].segments[0].frames[0].offsetFrame).toBe(15); // default
    expect(resolved[3].gaugeGain).toBe(5); // reattached

    // ── Assertions: resource configs ────────────────────────────────────
    expect(decodedRaw.resourceConfigs).toBeDefined();
    expect(decodedRaw.resourceConfigs['common-skillPoints']).toEqual({
      startValue: 500, max: 1000, regenPerSecond: 10,
    });
    expect(decodedRaw.resourceConfigs['slot-0-ultimate']).toEqual({
      startValue: 200, max: 6000, regenPerSecond: 0,
    });

    // ── Assertions: loadout properties ──────────────────────────────────
    expect(decodedRaw.loadoutProperties['slot-0'].operator.potential).toBe(3);
    expect(decodedRaw.loadoutProperties['slot-0'].skills.battleSkillLevel).toBe(10);

    // ── Assertions: equipment ───────────────────────────────────────────
    expect(decodedRaw.loadouts['slot-0'].weaponName).toBe('FORGEBORN_SCATHE');
    expect(decodedRaw.loadouts['slot-0'].armorName).toBe('TIDE_FALL');

    // ── Assertions: operator and enemy IDs ──────────────────────────────
    expect(decodedRaw.operatorIds).toEqual(['laevatain', 'akekuri', 'antal', 'ardelia']);
    expect(decodedRaw.enemyId).toBe('training_dummy');
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
