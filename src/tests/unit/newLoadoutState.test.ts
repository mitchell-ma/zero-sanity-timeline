/**
 * New Loadout State — Isolation Tests
 *
 * Verifies that creating a new loadout produces a completely clean state
 * with no leaked data from a previous loadout. Covers the contract between
 * serializeSheet and applySheetData for derived event overrides.
 *
 * Bug context: handleNewLoadout was not resetting overrides,
 * causing stale overrides (e.g. Node Stagger position) to leak from the
 * previous loadout into the fresh one.
 */

import { serializeSheet } from '../../utils/sheetStorage';
import { applySheetData } from '../../app/sheetDefaults';

// ── Mock require.context before importing modules that use it ────────────────

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
  ALL_ENEMIES: [{ id: 'RHODAGN', name: 'Rhodagn' }],
  DEFAULT_ENEMY: { id: 'RHODAGN', name: 'Rhodagn' },
}));

jest.mock('../../view/OperatorLoadoutHeader', () => ({
  EMPTY_LOADOUT: {},
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('New Loadout State Isolation', () => {

  test('serializeSheet without overrides omits the field', () => {
    const sheet = serializeSheet(
      [null, null, null, null],
      'RHODAGN',
      undefined,
      [],
      {},
      {},
      {},
      1,
      {},
    );
    expect(sheet.overrides).toBeUndefined();
  });

  test('serializeSheet with empty overrides omits the field', () => {
    const sheet = serializeSheet(
      [null, null, null, null],
      'RHODAGN',
      undefined,
      [],
      {},
      {},
      {},
      1,
      {},
      {},
    );
    expect(sheet.overrides).toBeUndefined();
  });

  test('serializeSheet with non-empty overrides includes them', () => {
    const overrides = { 'stagger-frailty-node-1-3360': { propertyOverrides: { startFrame: 3400 } } };
    const sheet = serializeSheet(
      [null, null, null, null],
      'RHODAGN',
      undefined,
      [],
      {},
      {},
      {},
      1,
      {},
      overrides,
    );
    expect(sheet.overrides).toEqual(overrides);
  });

  test('applySheetData returns empty overrides when field is missing', () => {
    const sheet = serializeSheet(
      [null, null, null, null],
      'RHODAGN',
      undefined,
      [],
      {},
      {},
      {},
      1,
    );
    const resolved = applySheetData(sheet);
    expect(resolved.overrides).toEqual({});
  });

  test('applySheetData returns empty overrides when field is empty', () => {
    const sheet = serializeSheet(
      [null, null, null, null],
      'RHODAGN',
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
    expect(resolved.overrides).toEqual({});
  });

  test('new loadout sheet data round-trips with no stale overrides', () => {
    // Simulate: previous loadout had a node stagger override
    const previousOverrides = {
      'stagger-frailty-node-1-3360': { propertyOverrides: { startFrame: 3400 } },
      'stagger-frailty-node-2-6720': { propertyOverrides: { startFrame: 6800 } },
    };
    const previousSheet = serializeSheet(
      ['LAEVATAIN', 'AKEKURI', 'ANTAL', 'ARDELIA'],
      'RHODAGN',
      undefined,
      [{ uid: 'e1', id: 'test', name: 'test', ownerEntityId: 'slot-0', columnId: 'battle', startFrame: 0, segments: [{ properties: { duration: 264 } }] }],
      {},
      {},
      {},
      2,
      {},
      previousOverrides,
    );
    expect(previousSheet.overrides).toEqual(previousOverrides);

    // Simulate: create new loadout (no overrides passed)
    const newSheet = serializeSheet(
      ['LAEVATAIN', 'AKEKURI', 'ANTAL', 'ARDELIA'],
      'RHODAGN',
      undefined,
      [],
      {},
      {},
      {},
      1,
    );
    // New sheet must NOT inherit previous overrides
    expect(newSheet.overrides).toBeUndefined();

    const resolved = applySheetData(newSheet);
    expect(resolved.overrides).toEqual({});
    expect(resolved.events).toEqual([]);
  });
});
