/**
 * Verb handler registry — game scenario tests.
 *
 * Tests real weapon/gear effects that use non-PERFORM trigger verbs.
 * Each test validates a real game mechanic end-to-end through the
 * status derivation engine using actual JSON configs.
 */
import { EventFrameType, PhysicalStatusType, UnitType } from '../../consts/enums';
import { VerbType } from '../../dsl/semantics';
import { TimelineEvent, eventDuration } from '../../consts/viewTypes';
import { ENEMY_OWNER_ID, SKILL_COLUMNS, INFLICTION_COLUMNS, REACTION_COLUMNS } from '../../model/channels';
import { FPS } from '../../utils/timeline';
import { processCombatSimulation } from '../../controller/timeline/eventQueueController';
import { findClauseTriggerMatches } from '../../controller/timeline/triggerMatch';
import {
  registerCustomWeaponEffectDefs, deregisterCustomWeaponEffectDefs,
  registerCustomGearEffectDefs, deregisterCustomGearEffectDefs,
} from '../../model/game-data/weaponGearEffectLoader';

// ── Load real JSON configs ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const opusJson = require('../../model/game-data/weapons/weapon-effects/opus-the-living-effects.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const formerFineryJson = require('../../model/game-data/weapons/weapon-effects/former-finery-effects.json');
// Gear statuses are stored as plain arrays (new format) — wrap with gearSetType for test API
const aicLightJson = { gearSetType: 'aic-light', statusEvents: require('../../model/game-data/gears/gear-statuses/aic-light-statuses.json') };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const khravenggerJson = require('../../model/game-data/weapons/weapon-effects/khravengger-effects.json');
const swordmancerJson = { gearSetType: 'swordmancer', statusEvents: require('../../model/game-data/gears/gear-statuses/swordmancer-statuses.json') };

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../model/event-frames/operatorJsonLoader', () => ({
  getOperatorJson: () => undefined,
  getAllOperatorIds: () => [],
  getSkillIds: () => new Set<string>(),
  getSkillTypeMap: () => ({}),
  resolveSkillType: () => null,
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

jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const SLOT = 'slot-0';

function makeEvent(overrides: Partial<TimelineEvent> & { uid: string; columnId: string; startFrame: number }): TimelineEvent {
  return { id: overrides.name ?? '', name: '', ownerId: SLOT, segments: [{ properties: { duration: 0 } }], ...overrides };
}

function derive(events: TimelineEvent[], slotWeapons?: Record<string, string>, slotGearSets?: Record<string, string>) {
  return processCombatSimulation(events, undefined, slotWeapons, undefined, undefined, slotGearSets);
}

function derivedEvents(result: TimelineEvent[], inputEvents: TimelineEvent[]) {
  const inputIds = new Set(inputEvents.map(e => e.uid));
  return result.filter(ev => !inputIds.has(ev.uid));
}

// ── Opus: The Living — APPLY REACTION ────────────────────────────────────────
// "Road Home for All Life": when wielder triggers an arts reaction, gain ATK buff.
// Max 2 stacks, each lasting 20s, independent stacking (NONE).

describe('Opus: The Living — APPLY REACTION trigger', () => {
  beforeAll(() => registerCustomWeaponEffectDefs(opusJson.weaponName, opusJson.statusEvents));
  afterAll(() => deregisterCustomWeaponEffectDefs(opusJson.weaponName));

  test('combustion reaction grants ATK buff stack', () => {
    const events = [
      makeEvent({
        uid: 'combustion-1', ownerId: ENEMY_OWNER_ID,
        columnId: REACTION_COLUMNS.COMBUSTION, startFrame: 600,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
    ];
    const result = derive(events, { [SLOT]: opusJson.weaponName });
    const buffs = derivedEvents(result, events).filter(ev => ev.id === 'OPUS_THE_LIVING_ROAD_HOME_FOR_ALL_LIFE');
    expect(buffs.length).toBe(1);
    expect(buffs[0].ownerId).toBe(SLOT);
    expect(buffs[0].startFrame).toBe(600);
    expect(eventDuration(buffs[0])).toBe(20 * FPS);
  });

  test('two reactions at different frames produce 2 stacks (max)', () => {
    const events = [
      makeEvent({
        uid: 'combustion-1', ownerId: ENEMY_OWNER_ID,
        columnId: REACTION_COLUMNS.COMBUSTION, startFrame: 600,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
      makeEvent({
        uid: 'solidification-1', ownerId: ENEMY_OWNER_ID,
        columnId: REACTION_COLUMNS.SOLIDIFICATION, startFrame: 1200,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
    ];
    const result = derive(events, { [SLOT]: opusJson.weaponName });
    const buffs = derivedEvents(result, events).filter(ev => ev.id === 'OPUS_THE_LIVING_ROAD_HOME_FOR_ALL_LIFE');
    expect(buffs.length).toBe(2);
  });

  test('third reaction while 2 stacks active does not exceed max', () => {
    const events = [
      makeEvent({
        uid: 'combustion-1', ownerId: ENEMY_OWNER_ID,
        columnId: REACTION_COLUMNS.COMBUSTION, startFrame: 600,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
      makeEvent({
        uid: 'solidification-1', ownerId: ENEMY_OWNER_ID,
        columnId: REACTION_COLUMNS.SOLIDIFICATION, startFrame: 700,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
      makeEvent({
        uid: 'corrosion-1', ownerId: ENEMY_OWNER_ID,
        columnId: REACTION_COLUMNS.CORROSION, startFrame: 800,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
    ];
    const result = derive(events, { [SLOT]: opusJson.weaponName });
    const buffs = derivedEvents(result, events).filter(ev => ev.id === 'OPUS_THE_LIVING_ROAD_HOME_FOR_ALL_LIFE');
    expect(buffs.length).toBe(2);
  });

  test('no buff without reaction events', () => {
    const events = [
      makeEvent({ uid: 'basic-1', ownerId: SLOT, columnId: SKILL_COLUMNS.BASIC, startFrame: 0, segments: [{ properties: { duration: 300 } }] }),
    ];
    const result = derive(events, { [SLOT]: opusJson.weaponName });
    const buffs = derivedEvents(result, events).filter(ev => ev.id === 'OPUS_THE_LIVING_ROAD_HOME_FOR_ALL_LIFE');
    expect(buffs.length).toBe(0);
  });
});

// ── Khravengger — APPLY CRYO INFLICTION ──────────────────────────────────────
// "Bonechilling": when wielder applies cryo infliction, gain Cryo DMG buff.
// 1 stack, RESET, 15s duration. Element-specific — must NOT trigger on heat.

describe('Khravengger — APPLY CRYO INFLICTION trigger', () => {
  beforeAll(() => registerCustomWeaponEffectDefs(khravenggerJson.weaponName, khravenggerJson.statusEvents));
  afterAll(() => deregisterCustomWeaponEffectDefs(khravenggerJson.weaponName));

  test('cryo infliction on enemy triggers Bonechilling buff', () => {
    const events = [
      makeEvent({
        uid: 'cryo-1', ownerId: ENEMY_OWNER_ID,
        columnId: INFLICTION_COLUMNS.CRYO, startFrame: 300,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
    ];
    const result = derive(events, { [SLOT]: khravenggerJson.weaponName });
    const buffs = derivedEvents(result, events).filter(ev => ev.id === 'KHRAVENGGER_BONECHILLING');
    expect(buffs.length).toBe(1);
    expect(buffs[0].startFrame).toBe(300);
  });

  test('heat infliction does NOT trigger Bonechilling (element mismatch)', () => {
    const events = [
      makeEvent({
        uid: 'heat-1', ownerId: ENEMY_OWNER_ID,
        columnId: INFLICTION_COLUMNS.HEAT, startFrame: 300,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
    ];
    const result = derive(events, { [SLOT]: khravenggerJson.weaponName });
    const buffs = derivedEvents(result, events).filter(ev => ev.id === 'KHRAVENGGER_BONECHILLING');
    expect(buffs.length).toBe(0);
  });

  test('cryo infliction after first buff expires triggers a new one', () => {
    const events = [
      makeEvent({
        uid: 'cryo-1', ownerId: ENEMY_OWNER_ID,
        columnId: INFLICTION_COLUMNS.CRYO, startFrame: 300,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
      // 15s (1800 frames) after first trigger — buff has expired
      makeEvent({
        uid: 'cryo-2', ownerId: ENEMY_OWNER_ID,
        columnId: INFLICTION_COLUMNS.CRYO, startFrame: 2200,
        segments: [{ properties: { duration: 10 * FPS } }],
      }),
    ];
    const result = derive(events, { [SLOT]: khravenggerJson.weaponName });
    const buffs = derivedEvents(result, events).filter(ev => ev.id === 'KHRAVENGGER_BONECHILLING');
    expect(buffs.length).toBe(2);
    expect(buffs[0].startFrame).toBe(300);
    expect(buffs[1].startFrame).toBe(2200);
  });
});

// ── Swordmancer — APPLY STATUS (generic) ─────────────────────────────────────
// When wielder applies any status, deal 250% ATK Physical DMG to enemy.
// 14s cooldown, targets enemy.

describe('Swordmancer — APPLY STATUS trigger', () => {
  beforeAll(() => registerCustomGearEffectDefs(swordmancerJson.gearSetType, swordmancerJson.statusEvents));
  afterAll(() => deregisterCustomGearEffectDefs(swordmancerJson.gearSetType));

  test('applying a status triggers Swordmancer effect on enemy', () => {
    const events = [
      makeEvent({
        uid: 'breach-1', ownerId: ENEMY_OWNER_ID,
        columnId: PhysicalStatusType.BREACH, startFrame: 500,
        segments: [{ properties: { duration: 5 * FPS } }],
      }),
    ];
    const result = derive(events, undefined, { [SLOT]: swordmancerJson.gearSetType });
    const effects = derivedEvents(result, events).filter(ev => ev.id === 'SWORDMANCER');
    expect(effects.length).toBe(1);
    // No target specified in JSON → defaults to operator (self-buff)
    expect(effects[0].ownerId).toBe(SLOT);
  });

  test('14s cooldown prevents rapid re-triggers', () => {
    const events = [
      makeEvent({
        uid: 'breach-1', ownerId: ENEMY_OWNER_ID,
        columnId: PhysicalStatusType.BREACH, startFrame: 500,
        segments: [{ properties: { duration: 5 * FPS } }],
      }),
      makeEvent({
        uid: 'breach-2', ownerId: ENEMY_OWNER_ID,
        columnId: PhysicalStatusType.BREACH, startFrame: 600,
        segments: [{ properties: { duration: 5 * FPS } }],
      }),
      makeEvent({
        uid: 'breach-3', ownerId: ENEMY_OWNER_ID,
        columnId: PhysicalStatusType.BREACH, startFrame: 2500,
        segments: [{ properties: { duration: 5 * FPS } }],
      }),
    ];
    const result = derive(events, undefined, { [SLOT]: swordmancerJson.gearSetType });
    const effects = derivedEvents(result, events).filter(ev => ev.id === 'SWORDMANCER');
    // First at 500, second at 600 blocked by CD (14s = 1680 frames), third at 2500 allowed (500+1680 < 2500)
    expect(effects.length).toBe(2);
    expect(effects[0].startFrame).toBe(500);
    expect(effects[1].startFrame).toBe(2500);
  });
});

// ── Former Finery — ENEMY HIT OPERATOR ───────────────────────────────────────
// "Mincing Therapy": when operator is hit, gain Treatment Efficiency buff.
// 15s duration, 15s CD. Periodic trigger assumed in planner.

describe('Former Finery — ENEMY HIT OPERATOR trigger', () => {
  beforeAll(() => registerCustomWeaponEffectDefs(formerFineryJson.weaponName, formerFineryJson.statusEvents));
  afterAll(() => deregisterCustomWeaponEffectDefs(formerFineryJson.weaponName));

  test('first proc at frame 0, self-buff on operator', () => {
    const result = derive([], { [SLOT]: formerFineryJson.weaponName });
    const buffs = result.filter(ev => ev.id === 'FORMER_FINERY_MINCING_THERAPY');
    expect(buffs.length).toBeGreaterThan(0);
    expect(buffs[0].startFrame).toBe(0);
    expect(buffs[0].ownerId).toBe(SLOT);
    expect(eventDuration(buffs[0])).toBe(15 * FPS);
  });

  test('15s cooldown spaces procs correctly', () => {
    const result = derive([], { [SLOT]: formerFineryJson.weaponName });
    const buffs = result.filter(ev => ev.id === 'FORMER_FINERY_MINCING_THERAPY');
    expect(buffs.length).toBeGreaterThanOrEqual(2);
    const gap = buffs[1].startFrame - buffs[0].startFrame;
    expect(gap).toBeGreaterThanOrEqual(15 * FPS);
  });
});

// ── AIC Light — OPERATOR DEFEAT ENEMY ────────────────────────────────────────
// When wielder defeats an enemy, gain +20 Base ATK for 5s.
// Periodic trigger assumed in planner.

describe('AIC Light — OPERATOR DEFEAT ENEMY trigger', () => {
  beforeAll(() => registerCustomGearEffectDefs(aicLightJson.gearSetType, aicLightJson.statusEvents));
  afterAll(() => deregisterCustomGearEffectDefs(aicLightJson.gearSetType));

  test('generates periodic ATK buffs on operator', () => {
    const result = derive([], undefined, { [SLOT]: aicLightJson.gearSetType });
    const buffs = result.filter(ev => ev.id === 'AIC_LIGHT');
    expect(buffs.length).toBeGreaterThan(0);
    expect(buffs[0].ownerId).toBe(SLOT);
    expect(eventDuration(buffs[0])).toBe(5 * FPS);
  });

  test('RESET interaction: new proc clamps previous buff', () => {
    const result = derive([], undefined, { [SLOT]: aicLightJson.gearSetType });
    const buffs = result.filter(ev => ev.id === 'AIC_LIGHT');
    expect(buffs.length).toBeGreaterThanOrEqual(2);
    // With 5s duration and no cooldown, each proc should clamp the previous
    expect(eventDuration(buffs[0])).toBeLessThanOrEqual(buffs[1].startFrame - buffs[0].startFrame);
  });
});

// ── Target filtering — APPLY CRYO INFLICTION TO target ───────────────────────
// Verifies that the TO preposition correctly filters by event owner:
//   - No TO (wildcard): matches enemy-owned cryo infliction ✓
//   - TO ENEMY: matches enemy-owned cryo infliction ✓
//   - TO OPERATOR: does NOT match enemy-owned cryo infliction ✗

describe('APPLY CRYO INFLICTION — target filtering', () => {
  const WEAPON_NAME = '__test_target_filter';
  const STATUS_ID = 'TARGET_FILTER_BUFF';

  function makeTriggerDef(toTarget?: string, toDeterminer?: string) {
    const condition: Record<string, unknown> = {
      subjectDeterminer: 'ANY', subject: 'OPERATOR',
      verb: 'APPLY', object: 'INFLICTION', element: 'CRYO',
    };
    if (toTarget) {
      condition.to = toTarget;
      if (toDeterminer) condition.toDeterminer = toDeterminer;
    }
    return [{
      properties: {
        id: STATUS_ID,
        name: 'Target Filter Buff',
        stacks: { limit: { verb: VerbType.IS, value: 1 }, interactionType: 'RESET' },
        duration: { value: { verb: VerbType.IS, value: 10 }, unit: UnitType.SECOND },
      },
      metadata: { originId: 'TEST' },
      onTriggerClause: [{ conditions: [condition] }],
    }];
  }

  const cryoOnEnemy = [
    makeEvent({
      uid: 'cryo-1', ownerId: ENEMY_OWNER_ID,
      columnId: INFLICTION_COLUMNS.CRYO, startFrame: 300,
      segments: [{ properties: { duration: 10 * FPS } }],
    }),
  ];

  afterEach(() => deregisterCustomWeaponEffectDefs(WEAPON_NAME));

  test('no TO (wildcard) — matches enemy-owned cryo infliction', () => {
    registerCustomWeaponEffectDefs(WEAPON_NAME, makeTriggerDef());
    const result = derive(cryoOnEnemy, { [SLOT]: WEAPON_NAME });
    const buffs = derivedEvents(result, cryoOnEnemy).filter(ev => ev.id === STATUS_ID);
    expect(buffs.length).toBe(1);
  });

  test('TO ENEMY — matches enemy-owned cryo infliction', () => {
    registerCustomWeaponEffectDefs(WEAPON_NAME, makeTriggerDef('ENEMY'));
    const result = derive(cryoOnEnemy, { [SLOT]: WEAPON_NAME });
    const buffs = derivedEvents(result, cryoOnEnemy).filter(ev => ev.id === STATUS_ID);
    expect(buffs.length).toBe(1);
  });

  test('TO ANY OPERATOR — does NOT match enemy-owned cryo infliction', () => {
    registerCustomWeaponEffectDefs(WEAPON_NAME, makeTriggerDef('OPERATOR', 'ANY'));
    const result = derive(cryoOnEnemy, { [SLOT]: WEAPON_NAME });
    const buffs = derivedEvents(result, cryoOnEnemy).filter(ev => ev.id === STATUS_ID);
    expect(buffs.length).toBe(0);
  });

  test('TO THIS OPERATOR — does NOT match enemy-owned cryo infliction', () => {
    registerCustomWeaponEffectDefs(WEAPON_NAME, makeTriggerDef('OPERATOR', 'THIS'));
    const result = derive(cryoOnEnemy, { [SLOT]: WEAPON_NAME });
    const buffs = derivedEvents(result, cryoOnEnemy).filter(ev => ev.id === STATUS_ID);
    expect(buffs.length).toBe(0);
  });
});

// ── PERFORM FINISHER / DIVE_ATTACK triggers ──────────────────────────────────
// Verifies that the verb handler registry correctly matches finisher and dive
// attack events via PERFORM FINISHER / PERFORM DIVE_ATTACK trigger conditions.

describe('PERFORM FINISHER / DIVE_ATTACK triggers', () => {

  function makeTriggerClause(object: string, determiner = 'THIS') {
    return [{
      conditions: [{
        subjectDeterminer: determiner, subject: 'OPERATOR',
        verb: 'PERFORM', object,
      }],
    }];
  }

  test('finisher event triggers PERFORM FINISHER match', () => {
    const events = [
      makeEvent({
        uid: 'fin-1', ownerId: SLOT,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 600,
        name: 'FINISHER',
                segments: [{ properties: { duration: Math.round(1.5 * FPS), name: 'Finisher' }, frames: [{ offsetFrame: Math.round(1.5 * FPS), skillPointRecovery: 0, stagger: 0, frameTypes: [EventFrameType.FINISHER] }] }],
      }),
    ];
    const matches = findClauseTriggerMatches(makeTriggerClause('FINISHER'), events, SLOT);
    expect(matches.length).toBe(1);
    expect(matches[0].frame).toBe(600 + Math.round(1.5 * FPS));
  });

  test('dive event triggers PERFORM DIVE_ATTACK match', () => {
    const events = [
      makeEvent({
        uid: 'dive-1', ownerId: SLOT,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 300,
        name: 'DIVE',
                segments: [{ properties: { duration: Math.round(1 * FPS), name: 'Dive' }, frames: [{ offsetFrame: Math.round(1 * FPS), skillPointRecovery: 0, stagger: 0, frameTypes: [EventFrameType.DIVE] }] }],
      }),
    ];
    const matches = findClauseTriggerMatches(makeTriggerClause('DIVE_ATTACK'), events, SLOT);
    expect(matches.length).toBe(1);
    expect(matches[0].frame).toBe(300 + Math.round(1 * FPS));
  });

  test('normal basic attack does NOT match PERFORM FINISHER or DIVE_ATTACK', () => {
    const events = [
      makeEvent({
        uid: 'basic-1', ownerId: SLOT,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 0,
        name: 'FLAMING_CINDERS',
        segments: [{ properties: { duration: 300 } }],
      }),
    ];
    const finMatches = findClauseTriggerMatches(makeTriggerClause('FINISHER'), events, SLOT);
    const diveMatches = findClauseTriggerMatches(makeTriggerClause('DIVE_ATTACK'), events, SLOT);
    expect(finMatches.length).toBe(0);
    expect(diveMatches.length).toBe(0);
  });

  test('finisher does NOT match PERFORM DIVE_ATTACK', () => {
    const events = [
      makeEvent({
        uid: 'fin-1', ownerId: SLOT,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 600,
        name: 'FINISHER',
                segments: [{ properties: { duration: Math.round(1.5 * FPS), name: 'Finisher' }, frames: [{ offsetFrame: Math.round(1.5 * FPS), skillPointRecovery: 0, stagger: 0, frameTypes: [EventFrameType.FINISHER] }] }],
      }),
    ];
    const diveMatches = findClauseTriggerMatches(makeTriggerClause('DIVE_ATTACK'), events, SLOT);
    expect(diveMatches.length).toBe(0);
  });

  test('dive does NOT match PERFORM FINISHER', () => {
    const events = [
      makeEvent({
        uid: 'dive-1', ownerId: SLOT,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 300,
        name: 'DIVE',
                segments: [{ properties: { duration: Math.round(1 * FPS), name: 'Dive' }, frames: [{ offsetFrame: Math.round(1 * FPS), skillPointRecovery: 0, stagger: 0, frameTypes: [EventFrameType.DIVE] }] }],
      }),
    ];
    const finMatches = findClauseTriggerMatches(makeTriggerClause('FINISHER'), events, SLOT);
    expect(finMatches.length).toBe(0);
  });

  test('different operator slot does NOT match THIS PERFORM FINISHER', () => {
    const otherSlot = 'slot-1';
    const events = [
      makeEvent({
        uid: 'fin-other', ownerId: otherSlot,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 600,
        name: 'FINISHER',
                segments: [{ properties: { duration: Math.round(1.5 * FPS), name: 'Finisher' }, frames: [{ offsetFrame: Math.round(1.5 * FPS), skillPointRecovery: 0, stagger: 0, frameTypes: [EventFrameType.FINISHER] }] }],
      }),
    ];
    const matches = findClauseTriggerMatches(makeTriggerClause('FINISHER', 'THIS'), events, SLOT);
    expect(matches.length).toBe(0);
  });

  test('ANY operator matches finisher from different slot', () => {
    const otherSlot = 'slot-1';
    const events = [
      makeEvent({
        uid: 'fin-other', ownerId: otherSlot,
        columnId: SKILL_COLUMNS.BASIC, startFrame: 600,
        name: 'FINISHER',
                segments: [{ properties: { duration: Math.round(1.5 * FPS), name: 'Finisher' }, frames: [{ offsetFrame: Math.round(1.5 * FPS), skillPointRecovery: 0, stagger: 0, frameTypes: [EventFrameType.FINISHER] }] }],
      }),
    ];
    const matches = findClauseTriggerMatches(makeTriggerClause('FINISHER', 'ANY'), events, SLOT);
    expect(matches.length).toBe(1);
  });
});
