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
    [StatType.BASE_HP]: 415,
    [StatType.BASE_ATTACK]: 49,
  },
  20: {
    [StatType.BASE_HP]: 2981,
    [StatType.BASE_ATTACK]: 233,
  },
  40: {
    [StatType.BASE_HP]: 18861,
    [StatType.BASE_ATTACK]: 723,
  },
  60: {
    [StatType.BASE_HP]: 74251,
    [StatType.BASE_ATTACK]: 1796,
  },
  80: {
    [StatType.BASE_HP]: 178607,
    [StatType.BASE_ATTACK]: 2703,
  },
  90: {
    [StatType.BASE_HP]: 275149,
    [StatType.BASE_ATTACK]: 3097,
  },
};

export class SentinelEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.SENTINEL,
      name: "Sentinel",
      tier: EnemyTierType.ELITE,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.PHYSICAL_RESISTANCE]: 0.8,
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.NATURE_RESISTANCE]: 0.8,
        [StatType.STAGGER_RECOVERY]: 9,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [StatType.FINISHER_SP_GAIN]: 50,
        [StatType.ATTACK_RANGE]: 7,
        [StatType.WEIGHT]: 2,
      },
      ...params,
    });
  }
}
