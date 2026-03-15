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
    [StatType.BASE_HP]: 263,
    [StatType.BASE_ATTACK]: 38,
  },
  20: {
    [StatType.BASE_HP]: 1888,
    [StatType.BASE_ATTACK]: 178,
  },
  40: {
    [StatType.BASE_HP]: 11945,
    [StatType.BASE_ATTACK]: 555,
  },
  60: {
    [StatType.BASE_HP]: 47026,
    [StatType.BASE_ATTACK]: 1377,
  },
  80: {
    [StatType.BASE_HP]: 113118,
    [StatType.BASE_ATTACK]: 2073,
  },
  90: {
    [StatType.BASE_HP]: 174261,
    [StatType.BASE_ATTACK]: 2375,
  },
};

export class EliteAmbusherEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.ELITE_AMBUSHER,
      name: "Elite Ambusher",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 110,
        [StatType.ATTACK_RANGE]: 7,
      },
      ...params,
    });
  }
}
