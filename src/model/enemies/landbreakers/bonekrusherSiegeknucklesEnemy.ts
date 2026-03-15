import {
  ElementType,
  EnemyLocationType,
  StatType,
  EnemyTierType,
  EnemyType,
  RaceType,
} from "../../../consts/enums";
import { Enemy } from "../enemy";

const STATS_BY_LEVEL: Readonly<
  Record<number, Partial<Record<StatType, number>>>
> = {
  1: {
    [StatType.BASE_HP]: 1246,
    [StatType.BASE_ATTACK]: 26,
  },
  20: {
    [StatType.BASE_HP]: 8942,
    [StatType.BASE_ATTACK]: 124,
  },
  40: {
    [StatType.BASE_HP]: 56582,
    [StatType.BASE_ATTACK]: 386,
  },
  60: {
    [StatType.BASE_HP]: 222753,
    [StatType.BASE_ATTACK]: 958,
  },
  80: {
    [StatType.BASE_HP]: 535821,
    [StatType.BASE_ATTACK]: 1442,
  },
  90: {
    [StatType.BASE_HP]: 825447,
    [StatType.BASE_ATTACK]: 1652,
  },
};

export class BonekrusherSiegeknucklesEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_SIEGEKNUCKLES,
      name: "Bonekrusher Siegeknuckles",
      tier: EnemyTierType.ELITE,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.PHYSICAL_RESISTANCE]: 0.8,
        [StatType.ELECTRIC_RESISTANCE]: 0.8,
        [StatType.CRYO_RESISTANCE]: 0.8,
        [StatType.NATURE_RESISTANCE]: 0.8,
        [StatType.STAGGER_HP]: 320,
        [StatType.FINISHER_SP_GAIN]: 50,
        [StatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
