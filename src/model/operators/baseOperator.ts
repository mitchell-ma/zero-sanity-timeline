import { ElementType, OperatorClassType, StatType, WeaponType } from "../enums";
import { DEFAULT_STATS } from "../stats/stats";
import { lookupByLevel } from "../../utils/lookupByLevel";

type StatsByLevel = Readonly<Record<number, Partial<Record<StatType, number>>>>;

/** Valid operator rarity values. */
export type OperatorRarity = 4 | 5 | 6;

/** Talent level, ranging 0–3. */
export type TalentLevel = 0 | 1 | 2 | 3;

/** Skill level, ranging 1–12. */
export type SkillLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Potential, ranging 0–5. */
export type Potential = 0 | 1 | 2 | 3 | 4 | 5;

export abstract class BaseOperator {
  readonly name: string;
  readonly element: ElementType;
  readonly operatorClass: OperatorClassType;
  readonly weaponTypes: WeaponType[];
  readonly operatorRarity: OperatorRarity;
  readonly mainAttributeType: StatType;
  readonly secondaryAttributeType: StatType;

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

  protected readonly statsByLevel: StatsByLevel;

  constructor(params: {
    name: string;
    level: number;
    element: ElementType;
    operatorClass: OperatorClassType;
    weaponTypes: WeaponType[];
    operatorRarity: OperatorRarity;
    mainAttributeType: StatType;
    secondaryAttributeType: StatType;
    statsByLevel: StatsByLevel;
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
      statsByLevel,
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
    this.potential = potential;
    this.talentOneLevel = talentOneLevel;
    this.talentTwoLevel = talentTwoLevel;
    this.basicAttackLevel = basicAttackLevel;
    this.battleSkillLevel = battleSkillLevel;
    this.comboSkillLevel = comboSkillLevel;
    this.ultimateLevel = ultimateLevel;
    this.statsByLevel = statsByLevel;
    this.stats = {
      ...DEFAULT_STATS,
      [StatType.CRITICAL_RATE]: 0.05,
      [StatType.CRITICAL_DAMAGE]: 0.5,
      ...lookupByLevel(statsByLevel, level),
    };
  }

  getBaseAttack(): number {
    const stats = lookupByLevel(this.statsByLevel, this.level);
    return stats[StatType.ATTACK] ?? 0;
  }
}
