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
    [StatType.BASE_HP]: 138,
    [StatType.BASE_ATTACK]: 33,
  },
  20: {
    [StatType.BASE_HP]: 994,
    [StatType.BASE_ATTACK]: 155,
  },
  40: {
    [StatType.BASE_HP]: 6287,
    [StatType.BASE_ATTACK]: 482,
  },
  60: {
    [StatType.BASE_HP]: 24750,
    [StatType.BASE_ATTACK]: 1198,
  },
  80: {
    [StatType.BASE_HP]: 59536,
    [StatType.BASE_ATTACK]: 1802,
  },
  90: {
    [StatType.BASE_HP]: 91716,
    [StatType.BASE_ATTACK]: 2065,
  },
};

export class RamEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.RAM,
      name: "Ram",
      tier: EnemyTierType.COMMON,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.ATTACK_RANGE]: 2.1,
      },
      ...params,
    });
  }
}
