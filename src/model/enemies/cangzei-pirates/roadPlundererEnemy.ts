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
    [StatType.BASE_HP]: 194,
    [StatType.BASE_ATTACK]: 33,
  },
  20: {
    [StatType.BASE_HP]: 1391,
    [StatType.BASE_ATTACK]: 155,
  },
  40: {
    [StatType.BASE_HP]: 8802,
    [StatType.BASE_ATTACK]: 482,
  },
  60: {
    [StatType.BASE_HP]: 34651,
    [StatType.BASE_ATTACK]: 1198,
  },
  80: {
    [StatType.BASE_HP]: 83350,
    [StatType.BASE_ATTACK]: 1802,
  },
  90: {
    [StatType.BASE_HP]: 128403,
    [StatType.BASE_ATTACK]: 2065,
  },
};

export class RoadPlundererEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.ROAD_PLUNDERER,
      name: "Road Plunderer",
      tier: EnemyTierType.COMMON,
      race: RaceType.CANGZEI_PIRATES,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 80,
        [StatType.ATTACK_RANGE]: 2.3,
      },
      ...params,
    });
  }
}
