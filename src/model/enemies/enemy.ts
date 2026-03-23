import {
  ElementType,
  EnemyLocationType,
  StatType,
  EnemyTierType,
  EnemyType,
  RaceType,
} from "../../consts/enums";
import { lookupByLevel } from "../../utils/lookupByLevel";
import { DEFAULT_STATS } from "../../consts/stats";

/** Default baseline for all enemy stats (spreads from DEFAULT_STATS, overrides enemy-specific values). */
export const DEFAULT_ENEMY_STATS: Readonly<Record<StatType, number>> = {
  ...DEFAULT_STATS,
  [StatType.BASE_DEFENSE]: 100,
  [StatType.PHYSICAL_RESISTANCE]: 1,
  [StatType.HEAT_RESISTANCE]: 1,
  [StatType.ELECTRIC_RESISTANCE]: 1,
  [StatType.CRYO_RESISTANCE]: 1,
  [StatType.NATURE_RESISTANCE]: 1,
  [StatType.AETHER_RESISTANCE]: 1,
  [StatType.STAGGER_HP]: 60,
  [StatType.STAGGER_RECOVERY]: 6,
  [StatType.FINISHER_ATK_MULTIPLIER]: 1,
  [StatType.FINISHER_SP_GAIN]: 25,
  [StatType.ATTACK_RANGE]: 2,
  [StatType.WEIGHT]: 1,
};

export type EnemyStatsByLevel = Readonly<
  Record<number, Partial<Record<StatType, number>>>
>;

export abstract class Enemy {
  readonly enemyType: EnemyType;
  readonly name: string;
  readonly tier: EnemyTierType;
  readonly race: RaceType;
  readonly location: EnemyLocationType;
  readonly attackElement: ElementType | null;

  level: number;
  stats: Record<StatType, number>;

  readonly statsByLevel: EnemyStatsByLevel;

  constructor(params: {
    enemyType: EnemyType;
    name: string;
    level: number;
    tier: EnemyTierType;
    race: RaceType;
    location: EnemyLocationType;
    attackElement: ElementType | null;
    statsByLevel: EnemyStatsByLevel;
    baseStats?: Partial<Record<StatType, number>>;
  }) {
    const {
      enemyType,
      name,
      level,
      tier,
      race,
      location,
      attackElement,
      statsByLevel,
      baseStats = {},
    } = params;

    if (level < 1 || level > 90 || !Number.isInteger(level)) {
      throw new RangeError(
        `Enemy level must be an integer between 1 and 90, got ${level}`,
      );
    }

    this.enemyType = enemyType;
    this.name = name;
    this.level = level;
    this.tier = tier;
    this.race = race;
    this.location = location;
    this.attackElement = attackElement;
    this.statsByLevel = statsByLevel;
    this.stats = {
      ...DEFAULT_ENEMY_STATS,
      ...baseStats,
      ...lookupByLevel(statsByLevel, level),
    };
  }

  getHp(): number {
    return this.stats[StatType.BASE_HP];
  }

  getAtk(): number {
    return this.stats[StatType.BASE_ATTACK];
  }

  getDef(): number {
    return this.stats[StatType.BASE_DEFENSE];
  }

  getResistance(element: ElementType): number {
    const resistanceMap: Record<ElementType, StatType> = {
      [ElementType.NONE]: StatType.PHYSICAL_RESISTANCE,
      [ElementType.PHYSICAL]: StatType.PHYSICAL_RESISTANCE,
      [ElementType.HEAT]: StatType.HEAT_RESISTANCE,
      [ElementType.ELECTRIC]: StatType.ELECTRIC_RESISTANCE,
      [ElementType.CRYO]: StatType.CRYO_RESISTANCE,
      [ElementType.NATURE]: StatType.NATURE_RESISTANCE,
      [ElementType.ARTS]: StatType.AETHER_RESISTANCE,
    };
    return this.stats[resistanceMap[element]] ?? this.stats[StatType.AETHER_RESISTANCE];
  }
}
