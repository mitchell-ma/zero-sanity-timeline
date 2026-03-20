/**
 * Gilberta — Lifecycle Clause Integration Tests
 *
 * Tests the ANOMALOUS_GRAVITY_FIELD status lifecycle:
 * - onEntryClause: if enemy has Lift at activation → extend Lift until field ends
 * - onTriggerClause: each time enemy receives Lift during field → extend Lift
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

  // Normalize talent status entries (same as operatorJsonLoader.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON status normalization
  const normalizeStatusEntry = (raw: Record<string, any>): Record<string, any> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON data
    const props = (raw.properties ?? {}) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON data
    const sl = (props.statusLevel ?? {}) as Record<string, any>;
    let resolvedLimit: unknown;
    const limit = sl.limit;
    if (limit) {
      if (limit.verb === 'IS') {
        const v = limit.value;
        resolvedLimit = { P0: v, P1: v, P2: v, P3: v, P4: v, P5: v };
      } else if (limit.verb === 'BASED_ON' && Array.isArray(limit.value)) {
        const arr = limit.value;
        resolvedLimit = { P0: arr[0], P1: arr[1], P2: arr[2], P3: arr[3], P4: arr[4], P5: arr[5] };
      } else {
        resolvedLimit = limit.value ?? limit;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON normalization
    const out: Record<string, any> = {
      id: props.id,
      ...(props.name ? { name: props.name } : {}),
      ...(props.type ? { type: props.type } : {}),
      ...(props.element || raw.element ? { element: props.element ?? raw.element } : {}),
      ...(props.isForced ? { isForced: props.isForced } : {}),
      target: 'OPERATOR',
      targetDeterminer: 'THIS',
      statusLevel: {
        limit: resolvedLimit ?? { P0: 1, P1: 1, P2: 1, P3: 1, P4: 1, P5: 1 },
        statusLevelInteractionType: sl.statusLevelInteractionType ?? 'NONE',
      },
      onTriggerClause: raw.onTriggerClause ?? [],
      originId: raw.originId,
      ...(raw.clause ? { clause: raw.clause } : {}),
      ...(raw.stats ? { stats: raw.stats } : {}),
    };
    if (props.duration) {
      const dv = props.duration.value;
      out.properties = { duration: { value: Array.isArray(dv) ? dv : [dv], unit: props.duration.unit } };
    }
    return out;
  };

  const normalizedTalentStatuses = (mockTalentJson.statusEvents ?? []).map(// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON data
  (s: Record<string, any>) => normalizeStatusEntry(s));
  const mergedStatusEvents = [...(skStatusEvents ?? []), ...normalizedTalentStatuses];
  const mockJson = { skillTypeMap: skTypeMap, statusEvents: mergedStatusEvents };

  return {
    // @ts-ignore — babel can't parse TS annotations in jest.mock factories
    getOperatorJson: (id) => id === 'gilberta' ? mockJson : undefined,
    getAllOperatorIds: () => ['gilberta'],
    getSkillIds: () => new Set(['BEAM_COHESION_ARTS', 'GRAVITY_MODE', 'MATRIX_DISPLACEMENT', 'GRAVITY_FIELD']),
    getSkillTypeMap: () => skTypeMap ?? {},
    getExchangeStatusConfig: () => ({}),
    getExchangeStatusIds: () => new Set(),
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
import { Operator } from '../consts/viewTypes';
// eslint-disable-next-line import/first
import type { LoadoutProperties } from '../view/InformationPane';
// eslint-disable-next-line import/first
import { resolveMessengersSongBonuses } from '../controller/timeline/ultimateEnergyController';

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
      skills: {} as Operator['skills'], ultimateEnergyCost: 100,
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
  } as LoadoutProperties;

  const propsLevel2 = {
    operator: { potential: 0, talentOneLevel: 2, talentTwoLevel: 0, attributeIncreaseLevel: 0 },
    skills: { battleSkillLevel: 12 },
  } as LoadoutProperties;

  test('applies 4% bonus to Guard/Caster at talent level 1', () => {
    const operators = [gilberta, guard, caster, striker];
    const loadoutProps: Record<string, LoadoutProperties> = {
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
    const loadoutProps: Record<string, LoadoutProperties> = {
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
    const loadoutProps: Record<string, LoadoutProperties> = {
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
    const loadoutProps: Record<string, LoadoutProperties> = {
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
    const loadoutProps: Record<string, LoadoutProperties> = {
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
    const loadoutProps: Record<string, LoadoutProperties> = {
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
    } as LoadoutProperties;
    const p3L2 = {
      operator: { potential: 3, talentOneLevel: 2, talentTwoLevel: 0, attributeIncreaseLevel: 0 },
      skills: { battleSkillLevel: 12 },
    } as LoadoutProperties;

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
    } as LoadoutProperties;

    const bonuses = resolveMessengersSongBonuses(operators, ALL_SLOTS, {
      [GILBERTA_SLOT]: p5Props, [GUARD_SLOT]: defaultProps,
      [CASTER_SLOT]: defaultProps, [STRIKER_SLOT]: defaultProps,
    });
    expect(bonuses[GUARD_SLOT]).toBeCloseTo(0.12);
  });
});
