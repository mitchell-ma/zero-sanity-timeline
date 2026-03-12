import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import { DEFAULT_STATS } from "../../consts/stats";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { BasicAttack } from "../combat-skills/basicAttack";
import { BasicSkill } from "../combat-skills/basicSkill";
import { ComboSkill } from "../combat-skills/comboSkill";
import { Ultimate } from "../combat-skills/ultimate";

export interface BaseStats {
  lv1: Partial<Record<StatType, number>>;
  lv90: Partial<Record<StatType, number>>;
}

export function interpolateStats(baseStats: BaseStats, level: number): Partial<Record<StatType, number>> {
  const t = (level - 1) / 89;
  const result: Partial<Record<StatType, number>> = {};
  const allKeys = Array.from(new Set([
    ...Object.keys(baseStats.lv1),
    ...Object.keys(baseStats.lv90),
  ]));
  for (const key of allKeys) {
    const v1 = (baseStats.lv1 as any)[key] ?? 0;
    const v90 = (baseStats.lv90 as any)[key] ?? 0;
    result[key as StatType] = Math.round(v1 + (v90 - v1) * t);
  }
  return result;
}

/** Attribute increase values by level (0–4). Shared across all operators. */
export const ATTRIBUTE_INCREASE_VALUES: readonly number[] = [0, 10, 15, 15, 20];

export abstract class Operator {
  readonly name: string;
  readonly element: ElementType;
  readonly operatorClass: OperatorClassType;
  readonly weaponTypes: WeaponType[];
  readonly operatorRarity: OperatorRarity;
  readonly mainAttributeType: StatType;
  readonly secondaryAttributeType: StatType;
  readonly maxTalentOneLevel: number;
  readonly maxTalentTwoLevel: number;
  readonly talentOneName: string;
  readonly talentTwoName: string;
  readonly attributeIncreaseName: string;
  readonly attributeIncreaseAttribute: StatType;
  readonly maxAttributeIncreaseLevel: number;

  abstract readonly basicAttack: BasicAttack;
  abstract readonly battleSkill: BasicSkill;
  abstract readonly comboSkill: ComboSkill;
  abstract readonly ultimate: Ultimate;

  level: number;
  potential: Potential;
  talentOneLevel: number;
  talentTwoLevel: number;

  basicAttackLevel: SkillLevel;
  battleSkillLevel: SkillLevel;
  comboSkillLevel: SkillLevel;
  ultimateLevel: SkillLevel;

  /** All operator stats — attributes and combat stats — in a single map. */
  stats: Record<StatType, number>;

  readonly baseStats: BaseStats;

  constructor(params: {
    name: string;
    level: number;
    element: ElementType;
    operatorClass: OperatorClassType;
    weaponTypes: WeaponType[];
    operatorRarity: OperatorRarity;
    mainAttributeType: StatType;
    secondaryAttributeType: StatType;
    baseStats: BaseStats;
    maxTalentOneLevel: number;
    maxTalentTwoLevel: number;
    talentOneName: string;
    talentTwoName: string;
    attributeIncreaseName: string;
    attributeIncreaseAttribute: StatType;
    maxAttributeIncreaseLevel?: number;
    potential?: Potential;
    talentOneLevel?: number;
    talentTwoLevel?: number;
    basicAttackLevel?: SkillLevel;
    battleSkillLevel?: SkillLevel;
    comboSkillLevel?: SkillLevel;
    ultimateLevel?: SkillLevel;
  }) {
    const {
      name,
      level,
      element,
      operatorClass,
      weaponTypes,
      operatorRarity,
      mainAttributeType,
      secondaryAttributeType,
      baseStats,
      maxTalentOneLevel,
      maxTalentTwoLevel,
      talentOneName,
      talentTwoName,
      attributeIncreaseName,
      attributeIncreaseAttribute,
      maxAttributeIncreaseLevel = 4,
      potential = 0,
      talentOneLevel = 0,
      talentTwoLevel = 0,
      basicAttackLevel = 1,
      battleSkillLevel = 1,
      comboSkillLevel = 1,
      ultimateLevel = 1,
    } = params;

    if (level < 1 || level > 90 || !Number.isInteger(level)) {
      throw new RangeError(
        `Operator level must be an integer between 1 and 90, got ${level}`,
      );
    }

    if (
      talentOneLevel < 0 ||
      talentOneLevel > 3 ||
      !Number.isInteger(talentOneLevel)
    ) {
      throw new RangeError(`talentOneLevel must be 0–3, got ${talentOneLevel}`);
    }
    if (
      talentTwoLevel < 0 ||
      talentTwoLevel > 3 ||
      !Number.isInteger(talentTwoLevel)
    ) {
      throw new RangeError(`talentTwoLevel must be 0–3, got ${talentTwoLevel}`);
    }

    this.name = name;
    this.level = level;
    this.element = element;
    this.operatorClass = operatorClass;
    this.weaponTypes = weaponTypes;
    this.operatorRarity = operatorRarity;
    this.mainAttributeType = mainAttributeType;
    this.secondaryAttributeType = secondaryAttributeType;
    this.maxTalentOneLevel = maxTalentOneLevel;
    this.maxTalentTwoLevel = maxTalentTwoLevel;
    this.talentOneName = talentOneName;
    this.talentTwoName = talentTwoName;
    this.attributeIncreaseName = attributeIncreaseName;
    this.attributeIncreaseAttribute = attributeIncreaseAttribute;
    this.maxAttributeIncreaseLevel = maxAttributeIncreaseLevel;
    this.potential = potential;
    this.talentOneLevel = talentOneLevel;
    this.talentTwoLevel = talentTwoLevel;
    this.basicAttackLevel = basicAttackLevel;
    this.battleSkillLevel = battleSkillLevel;
    this.comboSkillLevel = comboSkillLevel;
    this.ultimateLevel = ultimateLevel;
    this.baseStats = baseStats;
    this.stats = {
      ...DEFAULT_STATS,
      [StatType.CRITICAL_RATE]: 0.05,
      [StatType.CRITICAL_DAMAGE]: 0.5,
      ...interpolateStats(baseStats, level),
    };
  }

  getBaseAttack(): number {
    const stats = interpolateStats(this.baseStats, this.level);
    const atk = stats[StatType.ATTACK];
    if (atk === undefined) {
      throw new Error(
        `${this.name} has no ATTACK stat at level ${this.level}`,
      );
    }
    return atk;
  }

  // ── Potential stat bonuses ──────────────────────────────────────────────────

  /**
   * Stat bonuses granted by each potential level.
   * Key = potential level (1–5), value = stat bonuses applied when potential >= key.
   * Override in subclass to define operator-specific bonuses.
   */
  get potentialStatBonuses(): Partial<Record<number, Partial<Record<StatType, number>>>> { return {}; }

  /** Returns the cumulative stat bonuses for a given potential level. */
  getPotentialStats(potential: number): Partial<Record<StatType, number>> {
    const result: Partial<Record<StatType, number>> = {};
    const bonuses = this.potentialStatBonuses;
    for (let p = 1; p <= potential; p++) {
      const b = bonuses[p];
      if (!b) continue;
      for (const [key, value] of Object.entries(b)) {
        result[key as StatType] = (result[key as StatType] ?? 0) + (value as number);
      }
    }
    return result;
  }

  /** Returns the cumulative attribute increase bonus for a given level (0–4). */
  getAttributeIncrease(level: number): number {
    let total = 0;
    for (let i = 1; i <= Math.min(level, ATTRIBUTE_INCREASE_VALUES.length - 1); i++) {
      total += ATTRIBUTE_INCREASE_VALUES[i];
    }
    return total;
  }

  // ── Combo trigger config (from talent) ──────────────────────────────────────

  /** Trigger conditions that activate this operator's combo (OR). Override in subclass. */
  get comboRequires(): TriggerConditionType[] { return []; }
  /** Human-readable combo trigger description. */
  get comboDescription(): string { return ''; }
  /** Combo activation window in frames. */
  get comboWindowFrames(): number { return 720; }
  /** Combo blocked when any of these columnIds are active. */
  get comboForbidsActiveColumns(): string[] | undefined { return undefined; }
  /** Combo requires at least one of these columnIds to be active. */
  get comboRequiresActiveColumns(): string[] | undefined { return undefined; }
  /** Enemy column keys that should be shown when this operator is on the team. */
  get derivedEnemyColumns(): string[] | undefined { return undefined; }
  /** Team column keys that should be shown when this operator is on the team. */
  get derivedTeamColumns(): string[] | undefined { return undefined; }
  /** Notes describing SP return mechanics from potentials, talents, or skills. */
  get spReturnNotes(): string[] { return []; }
}
