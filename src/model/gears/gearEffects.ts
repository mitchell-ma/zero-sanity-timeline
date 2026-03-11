import {
  GearEffectType,
  StatType,
  TriggerConditionType,
} from "../../consts/enums";

export abstract class GearEffect {
  readonly gearEffectType: GearEffectType;
  readonly description: string;
  readonly passiveStats: Partial<Record<StatType, number>>;
  readonly triggerCondition: TriggerConditionType;
  readonly durationSeconds: number;
  readonly stacks: number;
  readonly maxStacks: number;
  readonly isStackable: boolean;
  readonly cooldownSeconds: number;
  readonly usesRemaining: number;

  constructor(params: {
    gearEffectType: GearEffectType;
    description: string;
    passiveStats: Partial<Record<StatType, number>>;
    triggerCondition: TriggerConditionType;
    durationSeconds: number;
    stacks?: number;
    maxStacks?: number;
    isStackable?: boolean;
    cooldownSeconds?: number;
    usesRemaining?: number;
  }) {
    this.gearEffectType = params.gearEffectType;
    this.description = params.description;
    this.passiveStats = params.passiveStats;
    this.triggerCondition = params.triggerCondition;
    this.durationSeconds = params.durationSeconds;
    this.stacks = params.stacks ?? 0;
    this.maxStacks = params.maxStacks ?? 0;
    this.isStackable = params.isStackable ?? false;
    this.cooldownSeconds = params.cooldownSeconds ?? 0;
    this.usesRemaining = params.usesRemaining ?? Infinity;
  }
}

// ── AIC Heavy ─────────────────────────────────────────────────────────────────
// HP +500. After defeating an enemy, restore 100 HP. Cooldown: 5s.
export class AicHeavy extends GearEffect {
  static readonly HP_RESTORE = 100;

  constructor() {
    super({
      gearEffectType: GearEffectType.AIC_HEAVY,
      description: 'HP +500. After defeating an enemy, restore 100 HP. CD: 5s.',
      passiveStats: { [StatType.ATTACK]: 500 },
      triggerCondition: TriggerConditionType.DEFEAT_ENEMY,
      durationSeconds: 0,
      isStackable: false,
      cooldownSeconds: 5,
    });
  }
}

// ── AIC Light ─────────────────────────────────────────────────────────────────
// HP +500. After defeating an enemy, ATK +20 for 5s.
export class AicLight extends GearEffect {
  static readonly ATK_BONUS = 20;

  constructor() {
    super({
      gearEffectType: GearEffectType.AIC_LIGHT,
      description: 'HP +500. After defeating an enemy, ATK +20 for 5s.',
      passiveStats: { [StatType.ATTACK]: 500 },
      triggerCondition: TriggerConditionType.DEFEAT_ENEMY,
      durationSeconds: 5,
      isStackable: false,
    });
  }
}

// ── Armored MSGR ──────────────────────────────────────────────────────────────
// Strength +50. When HP below 50%, 30% DMG Reduction.
export class ArmoredMsgr extends GearEffect {
  static readonly DMG_REDUCTION = 0.3;

  constructor() {
    super({
      gearEffectType: GearEffectType.ARMORED_MSGR,
      description: 'Strength +50. When HP below 50%, 30% DMG Reduction.',
      passiveStats: { [StatType.STRENGTH]: 50 },
      triggerCondition: TriggerConditionType.HP_BELOW_THRESHOLD,
      durationSeconds: 0,
      isStackable: false,
    });
  }
}

// ── Roving MSGR ───────────────────────────────────────────────────────────────
// Agility +50. When HP above 80%, Physical DMG +20%.
export class RovingMsgr extends GearEffect {
  constructor() {
    super({
      gearEffectType: GearEffectType.ROVING_MSGR,
      description: 'Agility +50. When HP above 80%, Physical DMG +20%.',
      passiveStats: { [StatType.AGILITY]: 50 },
      triggerCondition: TriggerConditionType.HP_ABOVE_THRESHOLD,
      durationSeconds: 0,
      isStackable: false,
    });
  }
}

// ── Mordvolt Insulation ───────────────────────────────────────────────────────
// Intellect +50. When HP above 80%, Arts DMG +20%.
export class MordvoltInsulation extends GearEffect {
  constructor() {
    super({
      gearEffectType: GearEffectType.MORDVOLT_INSULATION,
      description: 'Intellect +50. When HP above 80%, Arts DMG +20%.',
      passiveStats: { [StatType.INTELLECT]: 50 },
      triggerCondition: TriggerConditionType.HP_ABOVE_THRESHOLD,
      durationSeconds: 0,
      isStackable: false,
    });
  }
}

// ── Mordvolt Resistant ────────────────────────────────────────────────────────
// Will +50. When HP below 50%, Treatment Effect +30%.
export class MordvoltResistant extends GearEffect {
  constructor() {
    super({
      gearEffectType: GearEffectType.MORDVOLT_RESISTANT,
      description: 'Will +50. When HP below 50%, Treatment Effect +30%.',
      passiveStats: { [StatType.WILL]: 50 },
      triggerCondition: TriggerConditionType.HP_BELOW_THRESHOLD,
      durationSeconds: 0,
      isStackable: false,
    });
  }
}

// ── Aburrey's Legacy ──────────────────────────────────────────────────────────
// Skill DMG +24%. On battle/combo/ultimate cast, ATK +5% for 15s.
// Each skill type gives a unique non-self-stacking buff.
export class AburreyLegacy extends GearEffect {
  static readonly ATK_BONUS_PER_STACK = 0.05;

  constructor() {
    super({
      gearEffectType: GearEffectType.ABURREY_LEGACY,
      description: 'Skill DMG +24%. On battle/combo/ultimate cast, ATK +5% for 15s.',
      passiveStats: {},
      triggerCondition: TriggerConditionType.CAST_BATTLE_SKILL,
      durationSeconds: 15,
      maxStacks: 3,
      isStackable: true,
    });
  }
}

// ── Catastrophe ───────────────────────────────────────────────────────────────
// Ultimate Gain Efficiency +20%. On battle skill cast, +50 SP. Once per battle.
export class Catastrophe extends GearEffect {
  static readonly SP_RETURN = 50;

  constructor() {
    super({
      gearEffectType: GearEffectType.CATASTROPHE,
      description: 'Ult Gain Eff +20%. On battle skill cast, +50 SP. Once per battle.',
      passiveStats: { [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.2 },
      triggerCondition: TriggerConditionType.CAST_BATTLE_SKILL,
      durationSeconds: 0,
      isStackable: false,
      usesRemaining: 1,
    });
  }
}

// ── Swordmancer ───────────────────────────────────────────────────────────────
// Stagger Efficiency +20%. After applying Physical Status, deal 250% ATK Physical
// DMG + 10 Stagger. Cooldown: 15s.
export class Swordmancer extends GearEffect {
  static readonly DMG_MULTIPLIER = 2.5;
  static readonly STAGGER = 10;

  constructor() {
    super({
      gearEffectType: GearEffectType.SWORDMANCER,
      description: 'Stagger Eff +20%. After applying Physical Status, deal 250% ATK Physical DMG + 10 Stagger. CD: 15s.',
      passiveStats: { [StatType.STAGGER_EFFICIENCY_BONUS]: 0.2 },
      triggerCondition: TriggerConditionType.APPLY_PHYSICAL_STATUS,
      durationSeconds: 0,
      isStackable: false,
      cooldownSeconds: 15,
    });
  }
}

// ── LYNX ──────────────────────────────────────────────────────────────────────
// Treatment Efficiency +20%. After HP treatment, target gains 15% DMG Reduction
// for 10s (30% if treatment exceeds max HP). Effects do not stack.
export class Lynx extends GearEffect {
  static readonly DMG_REDUCTION = 0.15;
  static readonly DMG_REDUCTION_OVERHEAL = 0.3;

  constructor() {
    super({
      gearEffectType: GearEffectType.LYNX,
      description: 'Treatment Eff +20%. After HP treatment, target gains 15% DMG Red for 10s.',
      passiveStats: { [StatType.TREATMENT_BONUS]: 0.2 },
      triggerCondition: TriggerConditionType.HP_TREATMENT,
      durationSeconds: 10,
      isStackable: false,
    });
  }
}

// ── Æthertech ─────────────────────────────────────────────────────────────────
// ATK +8%. After applying Vulnerability, Physical DMG +8% for 15s (max 4 stacks).
// At 4 stacks of Vulnerability, additional Physical DMG +16% for 10s (no stack).
export class Aethertech extends GearEffect {
  static readonly PHYS_DMG_BONUS_PER_STACK = 0.08;
  static readonly BONUS_PHYS_DMG_AT_MAX = 0.16;
  static readonly BONUS_DURATION_SECONDS = 10;

  constructor() {
    super({
      gearEffectType: GearEffectType.AETHERTECH,
      description: 'ATK +8%. After applying Vulnerability, Physical DMG +8% for 15s (max 4 stacks).',
      passiveStats: { [StatType.ATTACK_BONUS]: 0.08 },
      triggerCondition: TriggerConditionType.APPLY_VULNERABILITY,
      durationSeconds: 15,
      maxStacks: 4,
      isStackable: true,
    });
  }
}

// ── Bonekrusha ────────────────────────────────────────────────────────────────
// ATK +15%. On combo skill cast, next battle skill DMG +30%. Max 2 stacks.
export class Bonekrusha extends GearEffect {
  static readonly BATTLE_SKILL_DMG_BONUS_PER_STACK = 0.3;

  constructor() {
    super({
      gearEffectType: GearEffectType.BONEKRUSHA,
      description: 'ATK +15%. On combo skill cast, next battle skill DMG +30%. Max 2 stacks.',
      passiveStats: { [StatType.ATTACK_BONUS]: 0.15 },
      triggerCondition: TriggerConditionType.CAST_COMBO_SKILL,
      durationSeconds: 0,
      maxStacks: 2,
      isStackable: true,
    });
  }
}

// ── Pulser Labs ───────────────────────────────────────────────────────────────
// Arts Intensity +30. After applying Electrification → Electric DMG +50% for 10s.
// After applying Solidification → Cryo DMG +50% for 10s. Effects do not stack.
export class PulserLabs extends GearEffect {
  static readonly ELECTRIC_DMG_BONUS = 0.5;
  static readonly CRYO_DMG_BONUS = 0.5;

  constructor() {
    super({
      gearEffectType: GearEffectType.PULSER_LABS,
      description: 'Arts Intensity +30. After Electrification, Elec DMG +50% for 10s. After Solidification, Cryo DMG +50% for 10s.',
      passiveStats: { [StatType.ARTS_INTENSITY]: 30 },
      triggerCondition: TriggerConditionType.ELECTRIFICATION,
      durationSeconds: 10,
      isStackable: false,
    });
  }
}

// ── Frontiers ─────────────────────────────────────────────────────────────────
// Combo Skill CD Reduction +15%. After SP recovery from skill, team DMG +16%
// for 15s. Does not stack.
export class Frontiers extends GearEffect {
  static readonly TEAM_DMG_BONUS = 0.16;

  constructor() {
    super({
      gearEffectType: GearEffectType.FRONTIERS,
      description: 'Combo CD Red +15%. After SP recovery from skill, team DMG +16% for 15s.',
      passiveStats: { [StatType.COMBO_SKILL_COOLDOWN_REDUCTION]: 0.15 },
      triggerCondition: TriggerConditionType.SKILL_POINT_RECOVERY_FROM_SKILL,
      durationSeconds: 15,
      isStackable: false,
    });
  }
}

// ── Hot Work ──────────────────────────────────────────────────────────────────
// Arts Intensity +30. After applying Combustion → Heat DMG +50% for 10s.
// After applying Corrosion → Nature DMG +50% for 10s. Effects do not stack.
export class HotWork extends GearEffect {
  static readonly HEAT_DMG_BONUS = 0.5;
  static readonly NATURE_DMG_BONUS = 0.5;

  constructor() {
    super({
      gearEffectType: GearEffectType.HOT_WORK,
      description: 'Arts Intensity +30. After Combustion, Heat DMG +50% for 10s. After Corrosion, Nature DMG +50% for 10s.',
      passiveStats: { [StatType.ARTS_INTENSITY]: 30 },
      triggerCondition: TriggerConditionType.COMBUSTION,
      durationSeconds: 10,
      isStackable: false,
    });
  }
}

// ── MI Security ───────────────────────────────────────────────────────────────
// Crit Rate +5%. After crit hit, ATK +5% for 5s (max 5 stacks).
// At max stacks, additional Crit Rate +5% (no stack).
export class MiSecurity extends GearEffect {
  static readonly ATK_BONUS_PER_STACK = 0.05;
  static readonly BONUS_CRIT_RATE_AT_MAX = 0.05;

  constructor() {
    super({
      gearEffectType: GearEffectType.MI_SECURITY,
      description: 'Crit Rate +5%. After crit hit, ATK +5% for 5s (max 5 stacks). At max, Crit Rate +5%.',
      passiveStats: { [StatType.CRITICAL_RATE]: 0.05 },
      triggerCondition: TriggerConditionType.CRITICAL_HIT,
      durationSeconds: 5,
      maxStacks: 5,
      isStackable: true,
    });
  }
}

// ── Type 50 Yinglung ──────────────────────────────────────────────────────────
// ATK +15%. When any operator casts battle skill, next combo skill DMG +20%.
// Max 3 stacks.
export class Type50Yinglung extends GearEffect {
  static readonly COMBO_SKILL_DMG_BONUS_PER_STACK = 0.2;

  constructor() {
    super({
      gearEffectType: GearEffectType.TYPE_50_YINGLUNG,
      description: 'ATK +15%. When any op casts battle skill, next combo skill DMG +20%. Max 3 stacks.',
      passiveStats: { [StatType.ATTACK_BONUS]: 0.15 },
      triggerCondition: TriggerConditionType.TEAM_CAST_BATTLE_SKILL,
      durationSeconds: 0,
      maxStacks: 3,
      isStackable: true,
    });
  }
}

// ── Tide Surge ────────────────────────────────────────────────────────────────
// Skill DMG +20%. After applying 2+ stacks of Arts Infliction, Arts DMG +35%
// for 15s. Does not stack.
export class TideSurge extends GearEffect {
  static readonly ARTS_DMG_BONUS = 0.35;

  constructor() {
    super({
      gearEffectType: GearEffectType.TIDE_SURGE,
      description: 'Skill DMG +20%. After applying 2+ Arts Infliction stacks, Arts DMG +35% for 15s.',
      passiveStats: { [StatType.SKILL_DAMAGE_BONUS]: 0.20 },
      triggerCondition: TriggerConditionType.APPLY_ARTS_INFLICTION_2_STACKS,
      durationSeconds: 15,
      isStackable: false,
    });
  }
}

// ── Eternal Xiranite ──────────────────────────────────────────────────────────
// HP +1000. After applying Amp/Protected/Susceptibility/Weakened, other teammates
// gain DMG +16% for 15s. Does not stack.
export class EternalXiranite extends GearEffect {
  static readonly TEAM_DMG_BONUS = 0.16;

  constructor() {
    super({
      gearEffectType: GearEffectType.ETERNAL_XIRANITE,
      description: 'HP +1000. After applying Amp/Protected/Susceptibility/Weakened, team DMG +16% for 15s.',
      passiveStats: {},
      triggerCondition: TriggerConditionType.APPLY_BUFF,
      durationSeconds: 15,
      isStackable: false,
    });
  }
}
