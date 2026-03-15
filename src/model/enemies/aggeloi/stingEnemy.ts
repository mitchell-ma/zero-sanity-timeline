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
    [StatType.BASE_ATTACK]: 26,
  },
  20: {
    [StatType.BASE_HP]: 994,
    [StatType.BASE_ATTACK]: 124,
  },
  40: {
    [StatType.BASE_HP]: 6287,
    [StatType.BASE_ATTACK]: 386,
  },
  60: {
    [StatType.BASE_HP]: 24750,
    [StatType.BASE_ATTACK]: 958,
  },
  80: {
    [StatType.BASE_HP]: 59536,
    [StatType.BASE_ATTACK]: 1442,
  },
  90: {
    [StatType.BASE_HP]: 91716,
    [StatType.BASE_ATTACK]: 1652,
  },
};

export class StingEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.STING,
      name: "Sting",
      tier: EnemyTierType.COMMON,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
