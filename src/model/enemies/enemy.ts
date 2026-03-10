import {
  ElementType,
  EnemyLocationType,
  EnemyStatType,
  EnemyTierType,
  EnemyType,
  RaceType,
} from "../../consts/enums";
import { lookupByLevel } from "../../utils/lookupByLevel";

/** Default baseline for all enemy stats. */
export const DEFAULT_ENEMY_STATS: Readonly<Record<EnemyStatType, number>> = {
  [EnemyStatType.HP]: 0,
  [EnemyStatType.ATK]: 0,
  [EnemyStatType.DEF]: 100,
  [EnemyStatType.PHYSICAL_RESISTANCE]: 1,
  [EnemyStatType.HEAT_RESISTANCE]: 1,
  [EnemyStatType.ELECTRIC_RESISTANCE]: 1,
  [EnemyStatType.CRYO_RESISTANCE]: 1,
  [EnemyStatType.NATURE_RESISTANCE]: 1,
  [EnemyStatType.AETHER_RESISTANCE]: 1,
  [EnemyStatType.STAGGER_HP]: 60,
  [EnemyStatType.STAGGER_RECOVERY]: 6,
  [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1,
  [EnemyStatType.FINISHER_SP_GAIN]: 25,
  [EnemyStatType.ATTACK_RANGE]: 2,
  [EnemyStatType.WEIGHT]: 1,
};

export type EnemyStatsByLevel = Readonly<
  Record<number, Partial<Record<EnemyStatType, number>>>
>;

export abstract class Enemy {
  readonly enemyType: EnemyType;
  readonly name: string;
  readonly tier: EnemyTierType;
  readonly race: RaceType;
  readonly location: EnemyLocationType;
  readonly attackElement: ElementType | null;

  level: number;
  stats: Record<EnemyStatType, number>;

  protected readonly statsByLevel: EnemyStatsByLevel;

  constructor(params: {
    enemyType: EnemyType;
    name: string;
    level: number;
    tier: EnemyTierType;
    race: RaceType;
    location: EnemyLocationType;
    attackElement: ElementType | null;
    statsByLevel: EnemyStatsByLevel;
    baseStats?: Partial<Record<EnemyStatType, number>>;
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
    return this.stats[EnemyStatType.HP];
  }

  getAtk(): number {
    return this.stats[EnemyStatType.ATK];
  }

  getDef(): number {
    return this.stats[EnemyStatType.DEF];
  }

  getResistance(element: ElementType): number {
    const resistanceMap: Record<ElementType, EnemyStatType> = {
      [ElementType.NONE]: EnemyStatType.PHYSICAL_RESISTANCE,
      [ElementType.PHYSICAL]: EnemyStatType.PHYSICAL_RESISTANCE,
      [ElementType.HEAT]: EnemyStatType.HEAT_RESISTANCE,
      [ElementType.ELECTRIC]: EnemyStatType.ELECTRIC_RESISTANCE,
      [ElementType.CRYO]: EnemyStatType.CRYO_RESISTANCE,
      [ElementType.NATURE]: EnemyStatType.NATURE_RESISTANCE,
    };
    return this.stats[resistanceMap[element]] ?? this.stats[EnemyStatType.AETHER_RESISTANCE];
  }
}
