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
    [StatType.BASE_HP]: 1094,
    [StatType.BASE_ATTACK]: 59,
  },
  20: {
    [StatType.BASE_HP]: 7849,
    [StatType.BASE_ATTACK]: 279,
  },
  40: {
    [StatType.BASE_HP]: 49666,
    [StatType.BASE_ATTACK]: 868,
  },
  60: {
    [StatType.BASE_HP]: 195528,
    [StatType.BASE_ATTACK]: 2156,
  },
  80: {
    [StatType.BASE_HP]: 470332,
    [StatType.BASE_ATTACK]: 3244,
  },
  90: {
    [StatType.BASE_HP]: 724559,
    [StatType.BASE_ATTACK]: 3717,
  },
};

export class HeavyStingAlphaEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HEAVY_STING_ALPHA,
      name: "Heavy Sting α",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.PHYSICAL_RESISTANCE]: 0.8,
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.NATURE_RESISTANCE]: 0.8,
        [StatType.STAGGER_HP]: 180,
        [StatType.STAGGER_RECOVERY]: 7.5,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [StatType.FINISHER_SP_GAIN]: 35,
        [StatType.ATTACK_RANGE]: 7,
        [StatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
