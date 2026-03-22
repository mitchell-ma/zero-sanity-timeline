/**
 * New Loadout State — Isolation Tests
 *
 * Verifies that creating a new loadout produces a completely clean state
 * with no leaked data from a previous loadout. Covers the contract between
 * serializeSheet and applySheetData for derived event overrides.
 *
 * Bug context: handleNewLoadout was not resetting derivedEventOverrides,
 * causing stale overrides (e.g. Node Stagger position) to leak from the
 * previous loadout into the fresh one.
 */

import { serializeSheet } from '../../utils/sheetStorage';
import { applySheetData } from '../../app/sheetDefaults';

// ── Mock require.context before importing modules that use it ────────────────

jest.mock('../../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => null,
  getAllOperatorIds: () => [],
  getSkillIds: () => new Set(), getSkillTypeMap: () => ({}), resolveSkillType: () => null,
  getFrameSequences: () => [],
  getSegmentLabels: () => undefined,
  getSkillTimings: () => undefined,
  getUltimateEnergyCost: () => 0,
  getSkillGaugeGains: () => undefined,
  getBattleSkillSpCost: () => undefined,
  getSkillCategoryData: () => undefined,
  getBasicAttackDurations: () => undefined,
  getComboTriggerClause: () => undefined,
  getExchangeStatusConfig: () => ({}),
  getExchangeStatusIds: () => new Set(),
}));

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [],
  getConditionalValues: () => [],
  getConditionalScalar: () => null,
  getBaseAttackForLevel: () => 0,
}));

jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

jest.mock('../../controller/operators/operatorRegistry', () => ({
  ALL_OPERATORS: [],
  getOperatorConfig: () => null,
}));

jest.mock('../../utils/loadoutRegistry', () => ({
  WEAPONS: [], ARMORS: [], GLOVES: [], KITS: [],
  CONSUMABLES: [], TACTICALS: [],
}));

jest.mock('../../utils/enemies', () => ({
  ALL_ENEMIES: [{ id: 'rhodagn', name: 'Rhodagn' }],
  DEFAULT_ENEMY: { id: 'rhodagn', name: 'Rhodagn' },
}));

jest.mock('../../view/OperatorLoadoutHeader', () => ({
  EMPTY_LOADOUT: {},
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('New Loadout State Isolation', () => {

  test('serializeSheet without derivedEventOverrides omits the field', () => {
    const sheet = serializeSheet(
      [null, null, null, null],
      'rhodagn',
      undefined,
      [],
      {},
      {},
      {},
      1,
      {},
    );
    expect(sheet.derivedEventOverrides).toBeUndefined();
  });

  test('serializeSheet with empty derivedEventOverrides omits the field', () => {
    const sheet = serializeSheet(
      [null, null, null, null],
      'rhodagn',
      undefined,
      [],
      {},
      {},
      {},
      1,
      {},
      {},
    );
    expect(sheet.derivedEventOverrides).toBeUndefined();
  });

  test('serializeSheet with non-empty derivedEventOverrides includes them', () => {
    const overrides = { 'stagger-frailty-node-1-3360': { startFrame: 3400 } };
    const sheet = serializeSheet(
      [null, null, null, null],
      'rhodagn',
      undefined,
      [],
      {},
      {},
      {},
      1,
      {},
      overrides,
    );
    expect(sheet.derivedEventOverrides).toEqual(overrides);
  });

  test('applySheetData returns empty derivedEventOverrides when field is missing', () => {
    const sheet = serializeSheet(
      [null, null, null, null],
      'rhodagn',
      undefined,
      [],
      {},
      {},
      {},
      1,
    );
    const resolved = applySheetData(sheet);
    expect(resolved.derivedEventOverrides).toEqual({});
  });

  test('applySheetData returns empty derivedEventOverrides when field is empty', () => {
    const sheet = serializeSheet(
      [null, null, null, null],
      'rhodagn',
      undefined,
      [],
      {},
      {},
      {},
      1,
      {},
      {},
    );
    const resolved = applySheetData(sheet);
    expect(resolved.derivedEventOverrides).toEqual({});
  });

  test('new loadout sheet data round-trips with no stale overrides', () => {
    // Simulate: previous loadout had a node stagger override
    const previousOverrides = {
      'stagger-frailty-node-1-3360': { startFrame: 3400 },
      'stagger-frailty-node-2-6720': { startFrame: 6800 },
    };
    const previousSheet = serializeSheet(
      ['laevatain', 'akekuri', 'antal', 'ardelia'],
      'rhodagn',
      undefined,
      [{ uid: 'e1', id: 'test', name: 'test', ownerId: 'slot-0', columnId: 'battle', startFrame: 0, segments: [{ properties: { duration: 264 } }] }],
      {},
      {},
      {},
      2,
      {},
      previousOverrides,
    );
    expect(previousSheet.derivedEventOverrides).toEqual(previousOverrides);

    // Simulate: create new loadout (no overrides passed)
    const newSheet = serializeSheet(
      ['laevatain', 'akekuri', 'antal', 'ardelia'],
      'rhodagn',
      undefined,
      [],
      {},
      {},
      {},
      1,
    );
    // New sheet must NOT inherit previous overrides
    expect(newSheet.derivedEventOverrides).toBeUndefined();

    const resolved = applySheetData(newSheet);
    expect(resolved.derivedEventOverrides).toEqual({});
    expect(resolved.events).toEqual([]);
  });
});
