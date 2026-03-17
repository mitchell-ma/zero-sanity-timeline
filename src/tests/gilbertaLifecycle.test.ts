/**
 * Gilberta — Lifecycle Clause Integration Tests
 *
 * Tests the ANOMALOUS_GRAVITY_FIELD status lifecycle:
 * - onActivationClause: if enemy has Lift at activation → extend Lift until field ends
 * - reactiveTriggerClause: each time enemy receives Lift during field → extend Lift
 * - No Lift → no extension
 * - Lift already longer than field → no change
 */

// ── Mock setup ──────────────────────────────────────────────────────────

jest.mock('../model/event-frames/operatorJsonLoader', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockSkillsJson = require('../model/game-data/operator-skills/gilberta-skills.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockTalentJson = require('../model/game-data/operator-talents/gilberta-talents.json');
  const { statusEvents: skStatusEvents, skillTypeMap: skTypeMap } = mockSkillsJson;
  const mergedStatusEvents = [...(skStatusEvents ?? []), ...(mockTalentJson.statusEvents ?? [])];
  const mockJson = { skillTypeMap: skTypeMap, statusEvents: mergedStatusEvents };

  return {
    // @ts-ignore — babel can't parse TS annotations in jest.mock factories
    getOperatorJson: (id) => id === 'gilberta' ? mockJson : undefined,
    getAllOperatorIds: () => ['gilberta'],
    getSkillIds: () => new Set(['BEAM_COHESION_ARTS', 'GRAVITY_MODE', 'MATRIX_DISPLACEMENT', 'GRAVITY_FIELD']),
    getSkillTypeMap: () => skTypeMap ?? {},
  };
});
jest.mock('../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));
jest.mock('../view/OperatorLoadoutHeader', () => ({
  EMPTY_LOADOUT: {},
}));
jest.mock('../controller/calculation/loadoutAggregator', () => ({
  aggregateLoadoutStats: () => null,
}));

// eslint-disable-next-line import/first
import { TimelineEvent, Operator } from '../consts/viewTypes';
// eslint-disable-next-line import/first
import { EventStatusType } from '../consts/enums';
// eslint-disable-next-line import/first
import { deriveStatusesFromEngine } from '../controller/timeline/statusDerivationEngine';
// eslint-disable-next-line import/first
import { resolveMessengersSongBonuses } from '../controller/timeline/ultimateEnergyController';

// ── Helpers ──────────────────────────────────────────────────────────────

const SLOT_ID = 'slot1';
const ENEMY = 'enemy';

function makeEvent(overrides: Partial<TimelineEvent> & { id: string; columnId: string; ownerId: string }): TimelineEvent {
  return {
    name: 'TEST',
    startFrame: 0,
    activationDuration: 2400,
    activeDuration: 0,
    cooldownDuration: 0,
    ...overrides,
  };
}

/** Anomalous Gravity Field status on enemy (as created by ultimate frame effects). Duration = 5s = 600 frames. */
function gravityFieldEvent(startFrame: number): TimelineEvent {
  return makeEvent({
    id: `agf-${startFrame}`,
    name: 'ANOMALOUS_GRAVITY_FIELD',
    columnId: 'anomalous-gravity-field',
    ownerId: ENEMY,
    startFrame,
    activationDuration: 600,
    sourceOwnerId: SLOT_ID,
    sourceSkillName: 'GRAVITY_FIELD',
  });
}

/** Lift status on enemy. */
function liftEvent(startFrame: number, duration = 360): TimelineEvent {
  return makeEvent({
    id: `lift-${startFrame}`,
    name: 'LIFT',
    columnId: 'lift',
    ownerId: ENEMY,
    startFrame,
    activationDuration: duration,
  });
}

/** A Gilberta skill event so the engine can find her slot. */
function gilbertaSkillEvent(startFrame: number): TimelineEvent {
  return makeEvent({
    id: `gskill-${startFrame}`,
    name: 'GRAVITY_MODE',
    columnId: 'battle',
    ownerId: SLOT_ID,
    startFrame,
    activationDuration: 120,
  });
}

function filterByName(events: TimelineEvent[], name: string) {
  return events.filter(ev => ev.name === name);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Gilberta — Anomalous Gravity Field lifecycle', () => {
  describe('onActivationClause', () => {
    test('extends Lift to field end when Lift is active at activation', () => {
      // Lift starts at frame 0, duration 360 (3s) → ends at 360
      // Gravity Field starts at frame 100, duration 600 → ends at 700
      // onActivationClause should extend Lift to 700 (duration: 700 - 0 = 700)
      const events: TimelineEvent[] = [
        gilbertaSkillEvent(0),
        liftEvent(0, 360),
        gravityFieldEvent(100),
      ];

      const result = deriveStatusesFromEngine(events);
      const lifts = filterByName(result, 'LIFT');

      expect(lifts.length).toBe(1);
      expect(lifts[0].activationDuration).toBe(700);
      expect(lifts[0].eventStatus).toBe(EventStatusType.EXTENDED);
    });

    test('does not extend when no Lift is active at activation', () => {
      // No Lift event in timeline
      const events: TimelineEvent[] = [
        gilbertaSkillEvent(0),
        gravityFieldEvent(100),
      ];

      const result = deriveStatusesFromEngine(events);
      const lifts = filterByName(result, 'LIFT');
      expect(lifts.length).toBe(0);
    });

    test('does not shorten Lift that is already longer than field', () => {
      // Lift starts at frame 0, duration 2400 (20s) → ends at 2400
      // Gravity Field starts at frame 100, ends at 700
      // Lift already extends past field → no change
      const events: TimelineEvent[] = [
        gilbertaSkillEvent(0),
        liftEvent(0, 2400),
        gravityFieldEvent(100),
      ];

      const result = deriveStatusesFromEngine(events);
      const lifts = filterByName(result, 'LIFT');

      expect(lifts.length).toBe(1);
      expect(lifts[0].activationDuration).toBe(2400); // unchanged
      expect(lifts[0].eventStatus).toBeUndefined();
    });
  });

  describe('reactiveTriggerClause', () => {
    test('extends Lift received during field lifetime', () => {
      // Gravity Field at frame 0, duration 600 → active [0, 600)
      // Lift arrives at frame 200, duration 240 (2s) → would end at 440
      // reactiveTriggerClause should extend Lift to 600 (duration: 600 - 200 = 400)
      const events: TimelineEvent[] = [
        gilbertaSkillEvent(0),
        gravityFieldEvent(0),
        liftEvent(200, 240),
      ];

      const result = deriveStatusesFromEngine(events);
      const lifts = filterByName(result, 'LIFT');

      expect(lifts.length).toBe(1);
      expect(lifts[0].activationDuration).toBe(400);
      expect(lifts[0].eventStatus).toBe(EventStatusType.EXTENDED);
    });

    test('does not extend Lift received after field expires', () => {
      // Gravity Field at frame 0, duration 600 → active [0, 600)
      // Lift arrives at frame 700 (after field ends)
      const events: TimelineEvent[] = [
        gilbertaSkillEvent(0),
        gravityFieldEvent(0),
        liftEvent(700, 240),
      ];

      const result = deriveStatusesFromEngine(events);
      const lifts = filterByName(result, 'LIFT');

      expect(lifts.length).toBe(1);
      expect(lifts[0].activationDuration).toBe(240); // unchanged
      expect(lifts[0].eventStatus).toBeUndefined();
    });

    test('extends multiple Lifts received during field lifetime', () => {
      // Gravity Field at frame 0, duration 600 → active [0, 600)
      // Lift 1 at frame 100, duration 120 → would end at 220
      // Lift 2 at frame 300, duration 120 → would end at 420
      // Both should be extended to field end (600)
      const events: TimelineEvent[] = [
        gilbertaSkillEvent(0),
        gravityFieldEvent(0),
        liftEvent(100, 120),
        liftEvent(300, 120),
      ];

      const result = deriveStatusesFromEngine(events);
      const lifts = filterByName(result, 'LIFT').sort((a, b) => a.startFrame - b.startFrame);

      expect(lifts.length).toBe(2);
      expect(lifts[0].activationDuration).toBe(500); // 600 - 100
      expect(lifts[0].eventStatus).toBe(EventStatusType.EXTENDED);
      expect(lifts[1].activationDuration).toBe(300); // 600 - 300
      expect(lifts[1].eventStatus).toBe(EventStatusType.EXTENDED);
    });
  });

  describe('combined onActivation + reactive', () => {
    test('Lift present at activation is extended, then second Lift during lifetime is also extended', () => {
      // Lift already active at frame 0, duration 120
      // Gravity Field at frame 0, duration 600
      // Second Lift at frame 300, duration 120
      // Both should be extended to 600
      const events: TimelineEvent[] = [
        gilbertaSkillEvent(0),
        liftEvent(0, 120),
        gravityFieldEvent(0),
        liftEvent(300, 120),
      ];

      const result = deriveStatusesFromEngine(events);
      const lifts = filterByName(result, 'LIFT').sort((a, b) => a.startFrame - b.startFrame);

      expect(lifts.length).toBe(2);
      // First Lift: extended by onActivationClause from 120 → 600
      expect(lifts[0].activationDuration).toBe(600);
      expect(lifts[0].eventStatus).toBe(EventStatusType.EXTENDED);
      // Second Lift: extended by reactiveTriggerClause from 120 → 300 (600 - 300)
      expect(lifts[1].activationDuration).toBe(300);
      expect(lifts[1].eventStatus).toBe(EventStatusType.EXTENDED);
    });
  });

  describe('MESSENGERS_SONG talent', () => {
    test('talent presence event is created at frame 0 for all operators', () => {
      const events: TimelineEvent[] = [gilbertaSkillEvent(0)];
      const result = deriveStatusesFromEngine(events);
      const msEvents = filterByName(result, 'MESSENGERS_SONG');

      expect(msEvents.length).toBe(1);
      expect(msEvents[0].startFrame).toBe(0);
      // Target is ALL_OPERATORS → ownerId should be the common owner
      expect(msEvents[0].ownerId).toBe('common');
      // Permanent duration (-1 → TOTAL_FRAMES = 108000)
      expect(msEvents[0].activationDuration).toBe(108000);
    });

    test('talent is not duplicated when called twice', () => {
      const events: TimelineEvent[] = [gilbertaSkillEvent(0)];
      const result1 = deriveStatusesFromEngine(events);
      // Run again with the result (simulating re-processing)
      const result2 = deriveStatusesFromEngine(result1);
      const msEvents = filterByName(result2, 'MESSENGERS_SONG');
      expect(msEvents.length).toBe(1);
    });
  });

  describe('ANOMALOUS_GRAVITY_FIELD is not engine-created', () => {
    test('field is not passively created at frame 0', () => {
      const events: TimelineEvent[] = [gilbertaSkillEvent(0)];
      const result = deriveStatusesFromEngine(events);
      const agfEvents = filterByName(result, 'ANOMALOUS_GRAVITY_FIELD');
      expect(agfEvents.length).toBe(0);
    });

    test('frame-created field is preserved', () => {
      const events: TimelineEvent[] = [
        gilbertaSkillEvent(0),
        gravityFieldEvent(100),
      ];
      const result = deriveStatusesFromEngine(events);
      const agfEvents = filterByName(result, 'ANOMALOUS_GRAVITY_FIELD');
      expect(agfEvents.length).toBe(1);
      expect(agfEvents[0].id).toBe('agf-100');
    });
  });
});

// ── Messenger's Song efficiency bonus tests ─────────────────────────────

describe("Messenger's Song — energy gain efficiency", () => {
  const GILBERTA_SLOT = 'slot1';
  const GUARD_SLOT = 'slot2';
  const CASTER_SLOT = 'slot3';
  const STRIKER_SLOT = 'slot4';
  const ALL_SLOTS = [GILBERTA_SLOT, GUARD_SLOT, CASTER_SLOT, STRIKER_SLOT];

  function makeOp(id: string, classType: string): Operator {
    return {
      id, name: id, color: '#fff', element: 'NATURE', role: classType,
      operatorClassType: classType, rarity: 6, weaponTypes: ['ARTS_UNIT'],
      weapon: '', armor: '', gloves: '', kit1: '', kit2: '', food: '', tactical: '',
      skills: {} as any, ultimateEnergyCost: 100,
      maxTalentOneLevel: 2, maxTalentTwoLevel: 0,
      talentOneName: "Messenger's Song", talentTwoName: '',
      attributeIncreaseName: '', attributeIncreaseAttribute: '', maxAttributeIncreaseLevel: 4,
    };
  }

  const gilberta = makeOp('gilberta', 'SUPPORTER');
  const guard = makeOp('guard-op', 'GUARD');
  const caster = makeOp('caster-op', 'CASTER');
  const striker = makeOp('striker-op', 'STRIKER');

  const defaultProps = {
    operator: { potential: 0, talentOneLevel: 1, talentTwoLevel: 0, attributeIncreaseLevel: 0 },
    skills: { battleSkillLevel: 12 },
  } as any;

  const propsLevel2 = {
    operator: { potential: 0, talentOneLevel: 2, talentTwoLevel: 0, attributeIncreaseLevel: 0 },
    skills: { battleSkillLevel: 12 },
  } as any;

  test('applies 4% bonus to Guard/Caster at talent level 1', () => {
    const operators = [gilberta, guard, caster, striker];
    const loadoutProps: Record<string, any> = {
      [GILBERTA_SLOT]: defaultProps,
      [GUARD_SLOT]: defaultProps,
      [CASTER_SLOT]: defaultProps,
      [STRIKER_SLOT]: defaultProps,
    };

    const bonuses = resolveMessengersSongBonuses(operators, ALL_SLOTS, loadoutProps);

    expect(bonuses[GUARD_SLOT]).toBeCloseTo(0.04);
    expect(bonuses[CASTER_SLOT]).toBeCloseTo(0.04);
  });

  test('applies 7% bonus at talent level 2', () => {
    const operators = [gilberta, guard, caster, striker];
    const loadoutProps: Record<string, any> = {
      [GILBERTA_SLOT]: propsLevel2,
      [GUARD_SLOT]: defaultProps,
      [CASTER_SLOT]: defaultProps,
      [STRIKER_SLOT]: defaultProps,
    };

    const bonuses = resolveMessengersSongBonuses(operators, ALL_SLOTS, loadoutProps);

    expect(bonuses[GUARD_SLOT]).toBeCloseTo(0.07);
    expect(bonuses[CASTER_SLOT]).toBeCloseTo(0.07);
  });

  test('does not apply to Striker (ineligible class)', () => {
    const operators = [gilberta, guard, caster, striker];
    const loadoutProps: Record<string, any> = {
      [GILBERTA_SLOT]: defaultProps,
      [GUARD_SLOT]: defaultProps,
      [CASTER_SLOT]: defaultProps,
      [STRIKER_SLOT]: defaultProps,
    };

    const bonuses = resolveMessengersSongBonuses(operators, ALL_SLOTS, loadoutProps);

    expect(bonuses[STRIKER_SLOT]).toBeUndefined();
  });

  test('does not apply to Gilberta herself', () => {
    const operators = [gilberta, guard, caster, striker];
    const loadoutProps: Record<string, any> = {
      [GILBERTA_SLOT]: defaultProps,
      [GUARD_SLOT]: defaultProps,
      [CASTER_SLOT]: defaultProps,
      [STRIKER_SLOT]: defaultProps,
    };

    const bonuses = resolveMessengersSongBonuses(operators, ALL_SLOTS, loadoutProps);

    expect(bonuses[GILBERTA_SLOT]).toBeUndefined();
  });

  test('returns empty when Gilberta is not on the team', () => {
    const operators = [guard, caster, striker, null];
    const loadoutProps: Record<string, any> = {
      [GILBERTA_SLOT]: defaultProps,
      [GUARD_SLOT]: defaultProps,
      [CASTER_SLOT]: defaultProps,
      [STRIKER_SLOT]: defaultProps,
    };

    const bonuses = resolveMessengersSongBonuses(operators, ALL_SLOTS, loadoutProps);

    expect(Object.keys(bonuses).length).toBe(0);
  });

  test('applies to Supporter class (but not Gilberta)', () => {
    const supporter = makeOp('other-supporter', 'SUPPORTER');
    const operators = [gilberta, supporter, caster, striker];
    const loadoutProps: Record<string, any> = {
      [GILBERTA_SLOT]: defaultProps,
      [GUARD_SLOT]: defaultProps,
      [CASTER_SLOT]: defaultProps,
      [STRIKER_SLOT]: defaultProps,
    };

    const bonuses = resolveMessengersSongBonuses(operators, ALL_SLOTS, loadoutProps);

    expect(bonuses[GUARD_SLOT]).toBeCloseTo(0.04); // supporter in slot2
  });

  test('P3 increases bonus: talent L1 → 9%, talent L2 → 12%', () => {
    const operators = [gilberta, guard, caster, striker];
    const p3L1 = {
      operator: { potential: 3, talentOneLevel: 1, talentTwoLevel: 0, attributeIncreaseLevel: 0 },
      skills: { battleSkillLevel: 12 },
    } as any;
    const p3L2 = {
      operator: { potential: 3, talentOneLevel: 2, talentTwoLevel: 0, attributeIncreaseLevel: 0 },
      skills: { battleSkillLevel: 12 },
    } as any;

    // P3 talent level 1
    const bonuses1 = resolveMessengersSongBonuses(operators, ALL_SLOTS, {
      [GILBERTA_SLOT]: p3L1, [GUARD_SLOT]: defaultProps,
      [CASTER_SLOT]: defaultProps, [STRIKER_SLOT]: defaultProps,
    });
    expect(bonuses1[GUARD_SLOT]).toBeCloseTo(0.09);
    expect(bonuses1[CASTER_SLOT]).toBeCloseTo(0.09);
    expect(bonuses1[STRIKER_SLOT]).toBeUndefined();

    // P3 talent level 2
    const bonuses2 = resolveMessengersSongBonuses(operators, ALL_SLOTS, {
      [GILBERTA_SLOT]: p3L2, [GUARD_SLOT]: defaultProps,
      [CASTER_SLOT]: defaultProps, [STRIKER_SLOT]: defaultProps,
    });
    expect(bonuses2[GUARD_SLOT]).toBeCloseTo(0.12);
    expect(bonuses2[CASTER_SLOT]).toBeCloseTo(0.12);
  });

  test('P5 uses P3 threshold (highest ≤ actual)', () => {
    const operators = [gilberta, guard, caster, striker];
    const p5Props = {
      operator: { potential: 5, talentOneLevel: 2, talentTwoLevel: 0, attributeIncreaseLevel: 0 },
      skills: { battleSkillLevel: 12 },
    } as any;

    const bonuses = resolveMessengersSongBonuses(operators, ALL_SLOTS, {
      [GILBERTA_SLOT]: p5Props, [GUARD_SLOT]: defaultProps,
      [CASTER_SLOT]: defaultProps, [STRIKER_SLOT]: defaultProps,
    });
    expect(bonuses[GUARD_SLOT]).toBeCloseTo(0.12);
  });
});
