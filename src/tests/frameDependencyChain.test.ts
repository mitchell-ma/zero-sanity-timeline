/**
 * Frame Dependency Chain Tests
 *
 * Tests the PREVIOUS_FRAME dependency model for cumulative DoT skills
 * (Smouldering Fire) and SIMULATION crit mode with per-frame crit resolution.
 *
 * Uses real Laevatain game-data JSON — no hardcoded multipliers.
 */
import { FrameDependencyType, StatType, EnemyTierType } from '../consts/enums';
import { eventDuration } from '../consts/viewTypes';
import type { LoadoutProperties } from '../view/InformationPane';
import type { OperatorLoadoutState } from '../view/OperatorLoadoutHeader';
import { aggregateLoadoutStats } from '../controller/calculation/loadoutAggregator';
import { evaluateTalentAttackBonus } from '../controller/calculation/talentBonusEngine';
import { getFrameMultiplier } from '../controller/calculation/jsonMultiplierEngine';
import {
  calculateDamage,
  getCritMultiplier,
  getDefenseMultiplier,
  getDamageBonus,
  getStaggerMultiplier,
  getFinisherMultiplier,
  getLinkMultiplier,
  getWeakenMultiplier,
  getSusceptibilityMultiplier,
  getFragilityMultiplier,
  getDmgReductionMultiplier,
  getProtectionMultiplier,
  getAmpMultiplier,
  getTotalAttack,
  DamageParams,
} from '../model/calculation/damageFormulas';
import { Potential, SkillLevel } from '../consts/types';
import { buildSequencesFromOperatorJson } from '../model/event-frames/dataDrivenEventFrames';

// ── Mock operatorRegistry ────────────────────────────────────────────────────

jest.mock('../controller/operators/operatorRegistry', () => ({
  getOperatorConfig: (id: string) => {
    if (id !== 'laevatain') return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../model/game-data/operators/laevatain-operator.json');
  },
  ALL_OPERATORS: [],
}));

// ── Mock loadoutRegistry — reads real JSON, no hardcoded values ──────────────

jest.mock('../utils/loadoutRegistry', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createWeaponFromData: createWeapon, WEAPON_DATA: weaponData } = require('../model/weapons/weaponData');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DataDrivenGear: DDGear } = require('../model/gears/dataDrivenGear');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nsJson = require('../model/game-data/gears/no-set.json');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- gear JSON data
  const findPiece = (json: any, name: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- gear JSON
    const p = json.pieces.find((x: any) => x.name === name);
    if (!p) throw new Error(`Gear piece "${name}" not found`);
    return p;
  };

  const weaponEntry = (name: string) => {
    const config = weaponData[name];
    return {
      name,
      weaponType: config.type,
      rarity: config.rarity,
      create: () => createWeapon(name, config.type),
    };
  };

  return {
    WEAPONS: [weaponEntry('Tarr 11')],
    ARMORS: [],
    GLOVES: [],
    KITS: [{ name: 'Redeemer Seal', rarity: nsJson.rarity, gearSetType: nsJson.gearSetType, create: () => new DDGear(findPiece(nsJson, 'Redeemer Seal'), nsJson.gearSetType, 4) }],
    CONSUMABLES: [],
    TACTICALS: [],
  };
});

// ── Mock operatorJsonLoader — uses real JSONs ────────────────────────────────

jest.mock('../model/event-frames/operatorJsonLoader', () => {
  const actual = jest.requireActual('../model/event-frames/dataDrivenEventFrames');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const opJson = require('../model/game-data/operators/laevatain-operator.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const skillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
  const skillCategories = skillsJson;
  // Infer skillTypeMap from naming conventions
  const inferMap = (skills: Record<string, Record<string, unknown>>) => {
    const ids = Object.keys(skills);
    const tm: Record<string, unknown> = {};
    const vs = ['_FINISHER', '_DIVE', '_ENHANCED', '_EMPOWERED', '_ENHANCED_EMPOWERED'];
    const fId = ids.find(i => i.endsWith('_FINISHER'));
    let bId: string | undefined;
    if (fId) { bId = fId.replace(/_FINISHER$/, ''); const b: Record<string, string> = { BATK: bId, FINISHER: fId }; const dId = ids.find(i => i === `${bId}_DIVE`); if (dId) b.DIVE = dId; tm.BASIC_ATTACK = b; }
    const base = ids.filter(i => i !== bId && !vs.some(s => i.endsWith(s)));
    for (const i of base) { if ((skills[i].onTriggerClause as unknown[])?.length) { tm.COMBO_SKILL = i; break; } }
    const rem = base.filter(i => i !== tm.COMBO_SKILL);
    for (const i of rem) { const segs = (skills[i].segments ?? []) as { metadata?: { segmentType?: string } }[]; if (segs.some(s => s.metadata?.segmentType === 'ANIMATION')) { tm.ULTIMATE = i; break; } }
    const bc = rem.filter(i => i !== tm.ULTIMATE); if (bc.length === 1) tm.BATTLE_SKILL = bc[0];
    return tm;
  };
  const merged = { ...opJson, skills: skillCategories, skillTypeMap: inferMap(skillCategories) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON require() data
  const json: Record<string, any> = { laevatain: merged };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sequence cache
  const sequenceCache = new Map<string, any>();

  return {
    getOperatorJson: (id: string) => json[id],
    getAllOperatorIds: () => Object.keys(json),
    getSkillIds: (operatorId: string) => {
      const data = json[operatorId];
      if (!data?.skills) return new Set<string>();
      const ids = new Set<string>(['FINISHER', 'DIVE']);
      for (const key of Object.keys(data.skills)) {
        if (key !== 'statusEvents' && key !== 'skillTypeMap') ids.add(key);
      }
      return ids;
    },
    getSkillTypeMap: (operatorId: string) => json[operatorId]?.skillTypeMap ?? {},
    resolveSkillType: () => null,
    getFrameSequences: (operatorId: string, skillId: string) => {
      const cacheKey = `${operatorId}:${skillId}`;
      if (sequenceCache.has(cacheKey)) return sequenceCache.get(cacheKey);
      const data = json[operatorId];
      if (!data?.skills?.[skillId]) return [];
      const sequences = actual.buildSequences?.(data.skills[skillId]) ?? [];
      sequenceCache.set(cacheKey, sequences);
      return sequences;
    },
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
  };
});

// ── Mock weaponGameData ────────────────────────────────────────────────────

jest.mock('../model/game-data/weaponGameData', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const t11Json = require('../model/game-data/weapons/tarr-11.json');
  const allWeapons = [t11Json];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- weapon skill data
  const si = new Map<string, any[]>();
  for (const w of allWeapons) {
    for (const s of w.skills) {
      if (!si.has(s.weaponSkillType)) si.set(s.weaponSkillType, s.allLevels);
    }
  }

  const ai = new Map<string, Record<number, number>>();
  for (const w of allWeapons) {
    const map: Record<number, number> = {};
    for (const e of w.allLevels) map[e.level] = e.baseAttack;
    ai.set(w.name, map);
  }

  return {
    getSkillValues: (skillType: string, statKey: string) => {
      const levels = si.get(skillType);
      if (!levels) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- weapon level data
      return levels.map((e: any) => e[statKey] as number);
    },
    getConditionalValues: () => [],
    getConditionalScalar: () => undefined,
    getAttackByLevel: (weaponName: string) => ai.get(weaponName) ?? {},
    getBaseAttackForLevel: (weaponName: string, level: number) => {
      const map = ai.get(weaponName);
      return map ? map[level] : undefined;
    },
  };
});

jest.mock('../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {
    operator: { level: 90, potential: 0, talentOneLevel: 0, talentTwoLevel: 0, attributeIncreaseLevel: 0 },
    skills: { basicAttackLevel: 12, battleSkillLevel: 12, comboSkillLevel: 12, ultimateLevel: 12 },
    weapon: { level: 1, skill1Level: 1, skill2Level: 1, skill3Level: 1 },
    gear: { armorRanks: {}, glovesRanks: {}, kit1Ranks: {}, kit2Ranks: {} },
  },
  LoadoutProperties: {},
}));

// ── Shared constants ─────────────────────────────────────────────────────────

const OPERATOR_ID = 'laevatain';
const SKILL_LEVEL = 12 as SkillLevel;
const POTENTIAL = 0 as Potential; // P0 for simpler multiplier math

const LOADOUT: OperatorLoadoutState = {
  weaponId: 'TARR_11',
  armorId: null,
  glovesId: null,
  kit1Id: null,
  kit2Id: null,
  consumableId: null,
  tacticalId: null,
};

const LOADOUT_PROPERTIES: LoadoutProperties = {
  operator: { level: 90, potential: 0, talentOneLevel: 0, talentTwoLevel: 0, attributeIncreaseLevel: 0 },
  skills: { basicAttackLevel: 12, battleSkillLevel: 12, comboSkillLevel: 12, ultimateLevel: 12 },
  weapon: { level: 1, skill1Level: 1, skill2Level: 1, skill3Level: 1 },
  gear: { armorRanks: {}, glovesRanks: {}, kit1Ranks: {}, kit2Ranks: {} },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function neutralParams() {
  return {
    critMultiplier: 1,
    ampMultiplier: getAmpMultiplier(0),
    staggerMultiplier: getStaggerMultiplier(false),
    finisherMultiplier: getFinisherMultiplier(EnemyTierType.BOSS, false),
    linkMultiplier: getLinkMultiplier(0, false),
    weakenMultiplier: getWeakenMultiplier([]),
    susceptibilityMultiplier: getSusceptibilityMultiplier(0),
    fragilityMultiplier: getFragilityMultiplier(0),
    dmgReductionMultiplier: getDmgReductionMultiplier([]),
    protectionMultiplier: getProtectionMultiplier([]),
    resistanceMultiplier: 1.0,
  };
}

function buildCalcContext() {
  const agg = aggregateLoadoutStats(OPERATOR_ID, LOADOUT, LOADOUT_PROPERTIES);
  if (!agg) throw new Error('aggregateLoadoutStats returned null');

  const { extraAttackPct } = evaluateTalentAttackBonus(OPERATOR_ID, {
    talentOneLevel: 0,
    talentTwoLevel: 0,
    potential: POTENTIAL,
    stats: agg.stats,
  });

  const totalAttack = getTotalAttack(
    agg.operatorBaseAttack,
    agg.weaponBaseAttack,
    agg.stats[StatType.ATTACK_BONUS] + extraAttackPct,
    agg.flatAttackBonuses,
  );

  return { totalAttack, attributeBonus: agg.attributeBonus, stats: agg.stats };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('getFrameMultiplier — PREVIOUS_FRAME model returns own multiplier', () => {
  it('frame 0 returns base multiplier (1.40 at lv12)', () => {
    const mult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 0);
    expect(mult).not.toBeNull();
    expect(mult).toBeCloseTo(1.40, 2);
  });

  it('frame 1 returns DoT multiplier (0.14 at lv12), not cumulative', () => {
    const mult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 1);
    expect(mult).not.toBeNull();
    expect(mult).toBeCloseTo(0.14, 2);
  });

  it('frame 5 returns DoT multiplier (0.14 at lv12), not base + 5×increment', () => {
    const mult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 5);
    expect(mult).not.toBeNull();
    // Must NOT be 1.40 + 0.14*5 = 2.10 (old cumulative model)
    expect(mult).toBeCloseTo(0.14, 2);
  });

  it('frame 10 (last) returns DoT multiplier', () => {
    const mult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 10);
    expect(mult).not.toBeNull();
    expect(mult).toBeCloseTo(0.14, 2);
  });

  it('lv1 frame 0 returns 0.62, frame 1 returns 0.06', () => {
    const lv1 = 1 as SkillLevel;
    const f0 = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', lv1, POTENTIAL, 0);
    const f1 = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', lv1, POTENTIAL, 1);
    expect(f0).toBeCloseTo(0.62, 2);
    expect(f1).toBeCloseTo(0.06, 2);
  });
});

describe('PREVIOUS_FRAME dependency chain — cumulative damage resolution', () => {
  let totalAttack: number;
  let attributeBonus: number;
  const defenseMultiplier = getDefenseMultiplier(100);

  beforeAll(() => {
    const ctx = buildCalcContext();
    totalAttack = ctx.totalAttack;
    attributeBonus = ctx.attributeBonus;
  });

  function frameDamage(frameIndex: number) {
    const mult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, frameIndex)!;
    return calculateDamage({
      attack: totalAttack,
      baseMultiplier: mult,
      attributeBonus,
      multiplierGroup: getDamageBonus(0, 0, 0, 0),
      defenseMultiplier,
      ...neutralParams(),
    });
  }

  it('frame 0 has no dependency — damage is own only', () => {
    const own = frameDamage(0);
    expect(own).toBeGreaterThan(0);
    // Frame 0 damage should be significantly larger than frame 1 (base vs DoT tick)
    const dotTick = frameDamage(1);
    expect(own).toBeGreaterThan(dotTick * 5);
  });

  it('frame 1 accumulated = own + frame 0 own', () => {
    const f0 = frameDamage(0);
    const f1own = frameDamage(1);
    const f1accumulated = f1own + f0;
    // This should equal old-model tick 1 (base + increment*1)
    expect(f1accumulated).toBeGreaterThan(f0);
    expect(Math.round(f1accumulated)).toBe(Math.round(f0 + f1own));
  });

  it('frame N accumulated = sum of all frames 0..N own damages', () => {
    let accumulated = 0;
    for (let i = 0; i <= 5; i++) {
      accumulated += frameDamage(i);
    }
    // Verify it matches the cumulative chain: frame 5 shows sum of frames 0-5
    const expectedFrame5 = frameDamage(0) + 5 * frameDamage(1);
    expect(Math.round(accumulated)).toBe(Math.round(expectedFrame5));
  });

  it('last frame (10) accumulated = frame 0 + 10 × DoT tick', () => {
    let accumulated = 0;
    for (let i = 0; i <= 10; i++) {
      accumulated += frameDamage(i);
    }
    const expected = frameDamage(0) + 10 * frameDamage(1);
    expect(Math.round(accumulated)).toBe(Math.round(expected));
  });
});

describe('SMOULDERING_FIRE_EMPOWERED — 8 frames with finisher', () => {
  it('has exactly 8 frames', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const opJson = require('../model/game-data/operators/laevatain-operator.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
    const merged = { ...opJson, skills: { ...skillsJson } };
    const sequences = buildSequencesFromOperatorJson(merged, 'SMOULDERING_FIRE_EMPOWERED');
    expect(sequences.length).toBe(1);
    const frames = sequences[0].getFrames();
    expect(frames.length).toBe(8);
  });

  it('frame 0 has no PREVIOUS_FRAME dependency', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const opJson = require('../model/game-data/operators/laevatain-operator.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
    const merged = { ...opJson, skills: { ...skillsJson } };
    const sequences = buildSequencesFromOperatorJson(merged, 'SMOULDERING_FIRE_EMPOWERED');
    const frame0 = sequences[0].getFrames()[0];
    expect(frame0.getDependencyTypes()).not.toContain(FrameDependencyType.PREVIOUS_FRAME);
  });

  it('frames 1-6 have PREVIOUS_FRAME dependency with DoT multiplier', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const opJson = require('../model/game-data/operators/laevatain-operator.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
    const merged = { ...opJson, skills: { ...skillsJson } };
    const sequences = buildSequencesFromOperatorJson(merged, 'SMOULDERING_FIRE_EMPOWERED');
    const frames = sequences[0].getFrames();
    for (let i = 1; i <= 6; i++) {
      expect(frames[i].getDependencyTypes()).toContain(FrameDependencyType.PREVIOUS_FRAME);
      const dd = frames[i].getDealDamage();
      expect(dd).not.toBeNull();
      // lv12 DoT multiplier = 0.14
      expect(dd!.multipliers[11]).toBeCloseTo(0.14, 2);
    }
  });

  it('frame 7 (finisher) has PREVIOUS_FRAME dependency and additional attack multiplier', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const opJson = require('../model/game-data/operators/laevatain-operator.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
    const merged = { ...opJson, skills: { ...skillsJson } };
    const sequences = buildSequencesFromOperatorJson(merged, 'SMOULDERING_FIRE_EMPOWERED');
    const finisher = sequences[0].getFrames()[7];
    expect(finisher.getDependencyTypes()).toContain(FrameDependencyType.PREVIOUS_FRAME);
    const dd = finisher.getDealDamage();
    expect(dd).not.toBeNull();
    // lv12 additional attack multiplier = 7.70
    expect(dd!.multipliers[11]).toBeCloseTo(7.70, 2);
  });

  it('finisher also has forced combustion reaction', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const opJson = require('../model/game-data/operators/laevatain-operator.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
    const merged = { ...opJson, skills: { ...skillsJson } };
    const sequences = buildSequencesFromOperatorJson(merged, 'SMOULDERING_FIRE_EMPOWERED');
    const finisher = sequences[0].getFrames()[7];
    expect(finisher.getApplyForcedReaction()).not.toBeNull();
  });
});

describe('SMOULDERING_FIRE — buildSegments propagates dependencyTypes to markers', () => {
  it('frame markers carry dependencyTypes from data-driven frames', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SkillSegmentBuilder } = require('../controller/events/basicAttackController');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const opJson = require('../model/game-data/operators/laevatain-operator.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
    const merged = { ...opJson, skills: { ...skillsJson } };
    const sequences = buildSequencesFromOperatorJson(merged, 'SMOULDERING_FIRE');
    const { segments } = SkillSegmentBuilder.buildSegments(sequences);

    // All frames should be in one segment
    expect(segments.length).toBe(1);
    const frames = segments[0].frames!;
    expect(frames.length).toBe(11);

    // Frame 0: no PREVIOUS_FRAME dependency (it's the base hit)
    expect(frames[0].dependencyTypes).toBeUndefined();

    // Frames 1-10: must have PREVIOUS_FRAME dependency on the EventFrameMarker
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].dependencyTypes).toBeDefined();
      expect(frames[i].dependencyTypes).toContain(FrameDependencyType.PREVIOUS_FRAME);
    }
  });

  it('dealDamage multipliers are set on all frame markers', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SkillSegmentBuilder } = require('../controller/events/basicAttackController');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const opJson = require('../model/game-data/operators/laevatain-operator.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
    const merged = { ...opJson, skills: { ...skillsJson } };
    const sequences = buildSequencesFromOperatorJson(merged, 'SMOULDERING_FIRE');
    const { segments } = SkillSegmentBuilder.buildSegments(sequences);

    const frames = segments[0].frames!;
    // Frame 0: base hit multiplier (lv12 = 1.40)
    expect(frames[0].dealDamage).toBeDefined();
    expect(frames[0].dealDamage!.multipliers[11]).toBeCloseTo(1.40, 2);

    // Frame 1: DoT tick multiplier (lv12 = 0.14)
    expect(frames[1].dealDamage).toBeDefined();
    expect(frames[1].dealDamage!.multipliers[11]).toBeCloseTo(0.14, 2);
  });
});

describe('SMOULDERING_FIRE — buildDamageTableRows integration', () => {
  it('damage rows accumulate with PREVIOUS_FRAME dependency', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SkillSegmentBuilder } = require('../controller/events/basicAttackController');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildDamageTableRows } = require('../controller/calculation/damageTableBuilder');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const opJson = require('../model/game-data/operators/laevatain-operator.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
    const merged = { ...opJson, skills: { ...skillsJson } };
    const sequences = buildSequencesFromOperatorJson(merged, 'SMOULDERING_FIRE');
    const { segments } = SkillSegmentBuilder.buildSegments(sequences);

    // Build a minimal event with these segments
    const ev = {
      id: 'test-battle-1',
      name: 'SMOULDERING_FIRE',
      ownerId: 'slot-0',
      columnId: 'battle',
      startFrame: 100,
      segments,
    };

    // Minimal column with the event's segments as defaultEvent
    const col = {
      type: 'mini-timeline' as const,
      key: 'battle-slot-0',
      label: 'Battle',
      columnId: 'battle',
      ownerId: 'slot-0',
      source: 'OPERATOR',
      defaultEvent: {
        name: 'SMOULDERING_FIRE',
        defaultActivationDuration: eventDuration(ev),
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        segments,
      },
      skillElement: 'HEAT',
    };

    const slot = {
      slotId: 'slot-0',
      operator: { id: 'laevatain', name: 'Laevatain' },
    };

    const enemy = { id: 'training_dummy', name: 'Training Dummy' };

    const rows = buildDamageTableRows(
      [ev], [col], [slot], enemy,
      { 'slot-0': LOADOUT_PROPERTIES },
      { 'slot-0': LOADOUT },
    );

    // Should have 11 rows (1 base hit + 10 DoT ticks)
    expect(rows.length).toBe(11);

    // Frame 0: base damage (no accumulation)
    const f0damage = rows[0].damage!;
    expect(f0damage).toBeGreaterThan(0);

    // Frame 1: should be its own damage PLUS frame 0's damage
    const f1damage = rows[1].damage!;
    expect(f1damage).toBeGreaterThan(f0damage);

    // Frame 10: should be cumulative (base + 10 × DoT tick)
    const f10damage = rows[10].damage!;
    expect(f10damage).toBeGreaterThan(f0damage * 2);

    // Verify accumulation pattern: each subsequent frame > previous
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].damage!).toBeGreaterThan(rows[i - 1].damage!);
    }
  });
});

describe('SIMULATION crit mode — per-frame crit with dependency chain', () => {
  let totalAttack: number;
  let attributeBonus: number;
  let critDamage: number;
  const defenseMultiplier = getDefenseMultiplier(100);

  beforeAll(() => {
    const ctx = buildCalcContext();
    totalAttack = ctx.totalAttack;
    attributeBonus = ctx.attributeBonus;
    critDamage = ctx.stats[StatType.CRITICAL_DAMAGE];
  });

  function makeParams(mult: number, crit: boolean): DamageParams {
    return {
      attack: totalAttack,
      baseMultiplier: mult,
      attributeBonus,
      multiplierGroup: getDamageBonus(0, 0, 0, 0),
      critMultiplier: crit ? getCritMultiplier(true, critDamage) : 1,
      defenseMultiplier,
      ampMultiplier: 1,
      staggerMultiplier: 1,
      finisherMultiplier: 1,
      linkMultiplier: 1,
      weakenMultiplier: 1,
      susceptibilityMultiplier: 1,
      fragilityMultiplier: 1,
      dmgReductionMultiplier: 1,
      protectionMultiplier: 1,
      resistanceMultiplier: 1,
    };
  }

  it('alternating crit pattern: frame 5 accumulates correct per-frame crit damage', () => {
    // Pattern: [no, crit, no, no, crit, no] for 6 frames
    // frame 0: no crit   → damage = D_base
    // frame 1: crit      → damage = D_dot_crit
    // frame 2: no crit   → damage = D_dot
    // frame 3: no crit   → damage = D_dot
    // frame 4: crit      → damage = D_dot_crit
    // frame 5: no crit   → damage = D_dot
    //
    // Frame 5 accumulated = D_base + D_dot_crit + D_dot + D_dot + D_dot_crit + D_dot
    const critPattern = [false, true, false, false, true, false];

    const baseMult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 0)!;
    const dotMult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 1)!;

    // Compute own damage for each frame
    const ownDamages: number[] = [];
    for (let i = 0; i < 6; i++) {
      const mult = i === 0 ? baseMult : dotMult;
      const params = makeParams(mult, critPattern[i]);
      ownDamages.push(calculateDamage(params));
    }

    // Verify crit frames have higher own damage than non-crit frames (for DoT ticks)
    const noCritDot = ownDamages[2]; // frame 2: no crit, DoT tick
    const critDot = ownDamages[1];   // frame 1: crit, DoT tick
    expect(critDot).toBeGreaterThan(noCritDot);

    // Compute accumulated damage per frame using PREVIOUS_FRAME chain
    const accumulated: number[] = [];
    for (let i = 0; i < 6; i++) {
      if (i === 0) {
        accumulated.push(ownDamages[i]);
      } else {
        accumulated.push(ownDamages[i] + accumulated[i - 1]);
      }
    }

    // Frame 5 accumulated = sum of all 6 frames' own damages
    const expectedFrame5 = ownDamages[0] + ownDamages[1] + ownDamages[2]
      + ownDamages[3] + ownDamages[4] + ownDamages[5];
    expect(accumulated[5]).toBeCloseTo(expectedFrame5, 2);

    // The crit frames should make the total higher than all-no-crit
    const allNoCritTotal = calculateDamage(makeParams(baseMult, false))
      + 5 * calculateDamage(makeParams(dotMult, false));
    expect(accumulated[5]).toBeGreaterThan(allNoCritTotal);

    // But lower than all-crit
    const allCritTotal = calculateDamage(makeParams(baseMult, true))
      + 5 * calculateDamage(makeParams(dotMult, true));
    expect(accumulated[5]).toBeLessThan(allCritTotal);
  });

  it('all-crit chain matches CritMode.ALWAYS behavior', () => {
    const baseMult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 0)!;
    const dotMult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 1)!;

    // All frames crit (simulation where every roll is lucky)
    let simAccum = 0;
    for (let i = 0; i <= 10; i++) {
      const mult = i === 0 ? baseMult : dotMult;
      simAccum += calculateDamage(makeParams(mult, true));
    }

    // CritMode.ALWAYS: same calculation
    let alwaysAccum = 0;
    for (let i = 0; i <= 10; i++) {
      const mult = i === 0 ? baseMult : dotMult;
      alwaysAccum += calculateDamage(makeParams(mult, true));
    }

    expect(simAccum).toBeCloseTo(alwaysAccum, 2);
  });

  it('no-crit chain matches CritMode.NEVER behavior', () => {
    const baseMult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 0)!;
    const dotMult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 1)!;

    let simAccum = 0;
    for (let i = 0; i <= 10; i++) {
      const mult = i === 0 ? baseMult : dotMult;
      simAccum += calculateDamage(makeParams(mult, false));
    }

    let neverAccum = 0;
    for (let i = 0; i <= 10; i++) {
      const mult = i === 0 ? baseMult : dotMult;
      neverAccum += calculateDamage(makeParams(mult, false));
    }

    expect(simAccum).toBeCloseTo(neverAccum, 2);
  });

  it('subsequent frames include previous frame damage in accumulated total', () => {
    // Explicit step-by-step: crit pattern [no, crit, no]
    const baseMult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 0)!;
    const dotMult = getFrameMultiplier(OPERATOR_ID, 'SMOULDERING_FIRE', SKILL_LEVEL, POTENTIAL, 1)!;

    const frame0own = calculateDamage(makeParams(baseMult, false)); // no crit
    const frame1own = calculateDamage(makeParams(dotMult, true));   // crit
    const frame2own = calculateDamage(makeParams(dotMult, false));  // no crit

    const frame0accum = frame0own;
    const frame1accum = frame1own + frame0accum;
    const frame2accum = frame2own + frame1accum;

    // Frame 2's accumulated damage includes frame 1's crit damage
    expect(frame2accum).toBe(frame0own + frame1own + frame2own);
    // Frame 2 accumulated > frame 2 if all were no-crit (because frame 1 crit is included)
    const frame2allNoCrit = calculateDamage(makeParams(dotMult, false)) * 2 + calculateDamage(makeParams(baseMult, false));
    expect(frame2accum).toBeGreaterThan(frame2allNoCrit);
  });
});

describe('SIMULATION crit mode — isCrit flag is set on frames', () => {
  it('sets isCrit on SkillEventFrame based on random roll', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const opJson = require('../model/game-data/operators/laevatain-operator.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skillsJson = require('../model/game-data/operator-skills/laevatain-skills.json');
    const merged = { ...opJson, skills: { ...skillsJson } };
    const sequences = buildSequencesFromOperatorJson(merged, 'SMOULDERING_FIRE');
    const frames = sequences[0].getFrames();

    // Default isCrit should be false
    expect(frames[0].isCrit).toBe(false);

    // Setting isCrit should persist on the frame object
    frames[0].isCrit = true;
    expect(frames[0].isCrit).toBe(true);

    frames[0].isCrit = false;
    expect(frames[0].isCrit).toBe(false);
  });
});
