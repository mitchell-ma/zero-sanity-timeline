/**
 * Weapon/Gear Effect Derivation Tests
 *
 * Validates that weapon and gear effects defined in DSL JSON are correctly
 * derived by the status derivation engine.
 *
 * Uses OBJ Edge of Lightness (Unbridled Edge) as the primary test case
 * since it had a prior hardcoded implementation to compare against.
 */
import { TimelineEvent } from '../consts/viewTypes';
import { FPS } from '../utils/timeline';

// Mock operatorJsonLoader — no operators needed for weapon-only tests
jest.mock('../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => undefined,
  getAllOperatorIds: () => [],
  getFrameSequences: () => [],
  getSkillIds: () => new Set(),
  getSkillTypeMap: () => ({}),
  resolveSkillType: () => null,
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
  getConditionalScalar: () => null,
  getBaseAttackForLevel: () => 0,
}));
jest.mock('../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// Mock weapon/gear effect loader with test data
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockUnbridledEdgeJson = require('../model/game-data/weapon-effects/obj-edge-of-lightness-effects.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockHotWorkJson = require('../model/game-data/gear-effects/hot-work-effects.json');

jest.mock('../model/game-data/weaponGearEffectLoader', () => ({
  getWeaponEffectDefs: (name: string) => {
    if (name === 'OBJ Edge of Lightness') return mockUnbridledEdgeJson.statusEvents;
    return [];
  },
  getGearEffectDefs: (type: string) => {
    if (type === 'HOT_WORK') return mockHotWorkJson.statusEvents;
    return [];
  },
  getAllWeaponEffectNames: () => ['OBJ Edge of Lightness'],
  getAllGearEffectTypes: () => ['HOT_WORK'],
  registerCustomWeaponEffectDefs: () => {},
  deregisterCustomWeaponEffectDefs: () => {},
  registerCustomGearEffectDefs: () => {},
  deregisterCustomGearEffectDefs: () => {},
}));

// eslint-disable-next-line import/first
import { deriveStatusesFromEngine } from '../controller/timeline/statusDerivationEngine';

const SLOT_WIELDER = 'slot1';
const SLOT_TEAMMATE = 'slot2';

let idCounter = 0;
function resetIdCounter(): void { idCounter = 0; }

/** Create a battle skill event with SP recovery frame data. */
function battleSkillWithSpRecovery(slotId: string, startFrame: number, spRecoveryFrame = 100): TimelineEvent {
  return {
    id: `bs-${idCounter++}`,
    name: 'TEST_BATTLE_SKILL',
    ownerId: slotId,
    columnId: 'battle',
    startFrame,
    activationDuration: 200,
    activeDuration: 0,
    cooldownDuration: 0,
    segments: [{
      durationFrames: 200,
      label: 'Attack',
      frames: [{
        offsetFrame: spRecoveryFrame,
        skillPointRecovery: 18,
      }],
    }],
  };
}

/** Create a combustion reaction event on the enemy. */
function combustionEvent(startFrame: number, duration = 600): TimelineEvent {
  return {
    id: `comb-${idCounter++}`,
    name: 'COMBUSTION',
    ownerId: 'enemy',
    columnId: 'combustion',
    startFrame,
    activationDuration: duration,
    activeDuration: 0,
    cooldownDuration: 0,
  };
}

describe('Weapon/Gear Effect Derivation', () => {

beforeEach(() => { resetIdCounter(); });

// ═══════════════════════════════════════════════════════════════════════════════
// A. Unbridled Edge (OBJ Edge of Lightness)
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Unbridled Edge (OBJ Edge of Lightness)', () => {
  const slotWeapons: Record<string, string | undefined> = {
    [SLOT_WIELDER]: 'OBJ Edge of Lightness',
    [SLOT_TEAMMATE]: undefined,
  };

  test('A1: Single SP recovery → 1 Unbridled Edge event on team (common)', () => {
    const events = [battleSkillWithSpRecovery(SLOT_WIELDER, 0)];
    const result = deriveStatusesFromEngine(events, undefined, undefined, slotWeapons);
    const ueEvents = result.filter(e => e.name === 'OBJ_EDGE_OF_LIGHTNESS_UNBRIDLED_EDGE');
    // Team-targeted (OTHER) → placed on COMMON_OWNER_ID (shared team column)
    expect(ueEvents.length).toBe(1);
    expect(ueEvents[0].ownerId).toBe('common');
  });

  test('A2: Unbridled Edge duration is 20 seconds', () => {
    const events = [battleSkillWithSpRecovery(SLOT_WIELDER, 0)];
    const result = deriveStatusesFromEngine(events, undefined, undefined, slotWeapons);
    const ueEvents = result.filter(e => e.name === 'OBJ_EDGE_OF_LIGHTNESS_UNBRIDLED_EDGE');
    for (const ev of ueEvents) {
      expect(ev.activationDuration).toBe(Math.round(20 * FPS));
    }
  });

  test('A3: Max 3 stacks of Unbridled Edge', () => {
    // 5 SP recovery hits — should cap at 3 active stacks
    const events = [
      battleSkillWithSpRecovery(SLOT_WIELDER, 0),
      battleSkillWithSpRecovery(SLOT_WIELDER, 300),
      battleSkillWithSpRecovery(SLOT_WIELDER, 600),
      battleSkillWithSpRecovery(SLOT_WIELDER, 900),
      battleSkillWithSpRecovery(SLOT_WIELDER, 1200),
    ];
    const result = deriveStatusesFromEngine(events, undefined, undefined, slotWeapons);
    const ueEvents = result.filter(e => e.name === 'OBJ_EDGE_OF_LIGHTNESS_UNBRIDLED_EDGE');
    // At any point, at most 3 should be active — total events may be more (due to stack cap)
    // The engine creates independent stacks; the max active check is enforced by the engine.
    // With 20s duration and hits every 2.5s, all 5 fits in the window — so 3 max applies.
    expect(ueEvents.length).toBeLessThanOrEqual(3);
  });

  test('A4: No SP recovery → no Unbridled Edge', () => {
    // Event without SP recovery frames
    const events: TimelineEvent[] = [{
      id: 'bs-0',
      name: 'TEST_BATTLE_SKILL',
      ownerId: SLOT_WIELDER,
      columnId: 'battle',
      startFrame: 0,
      activationDuration: 200,
      activeDuration: 0,
      cooldownDuration: 0,
    }];
    const result = deriveStatusesFromEngine(events, undefined, undefined, slotWeapons);
    const ueEvents = result.filter(e => e.name === 'OBJ_EDGE_OF_LIGHTNESS_UNBRIDLED_EDGE');
    expect(ueEvents.length).toBe(0);
  });

  test('A5: No weapon equipped → no derivation', () => {
    const events = [battleSkillWithSpRecovery(SLOT_WIELDER, 0)];
    const result = deriveStatusesFromEngine(events, undefined, undefined, {});
    const ueEvents = result.filter(e => e.name === 'OBJ_EDGE_OF_LIGHTNESS_UNBRIDLED_EDGE');
    expect(ueEvents.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Hot Work (Gear Set Effect)
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Hot Work (Gear Set Effect)', () => {
  const slotGearSets: Record<string, string | undefined> = {
    [SLOT_WIELDER]: 'HOT_WORK',
    [SLOT_TEAMMATE]: undefined,
  };

  test('B1: Combustion triggers Hot Work (Heat) on wielder', () => {
    const events = [combustionEvent(0)];
    const result = deriveStatusesFromEngine(events, undefined, undefined, undefined, slotGearSets);
    const hwEvents = result.filter(e => e.name === 'HOT_WORK_HEAT');
    expect(hwEvents.length).toBe(1);
    expect(hwEvents[0].ownerId).toBe(SLOT_WIELDER);
  });

  test('B2: Hot Work (Heat) duration is 10 seconds', () => {
    const events = [combustionEvent(0)];
    const result = deriveStatusesFromEngine(events, undefined, undefined, undefined, slotGearSets);
    const hwEvents = result.filter(e => e.name === 'HOT_WORK_HEAT');
    expect(hwEvents[0].activationDuration).toBe(Math.round(10 * FPS));
  });

  test('B3: No combustion → no Hot Work', () => {
    const events: TimelineEvent[] = [];
    const result = deriveStatusesFromEngine(events, undefined, undefined, undefined, slotGearSets);
    const hwEvents = result.filter(e => e.name === 'HOT_WORK_HEAT');
    expect(hwEvents.length).toBe(0);
  });

  test('B4: No gear equipped → no Hot Work', () => {
    const events = [combustionEvent(0)];
    const result = deriveStatusesFromEngine(events, undefined, undefined, undefined, {});
    const hwEvents = result.filter(e => e.name === 'HOT_WORK_HEAT');
    expect(hwEvents.length).toBe(0);
  });
});

}); // end Weapon/Gear Effect Derivation
