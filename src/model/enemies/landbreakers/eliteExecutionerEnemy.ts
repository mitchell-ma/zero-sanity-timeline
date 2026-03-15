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
    [StatType.BASE_HP]: 1661,
    [StatType.BASE_ATTACK]: 105,
  },
  20: {
    [StatType.BASE_HP]: 11923,
    [StatType.BASE_ATTACK]: 496,
  },
  40: {
    [StatType.BASE_HP]: 75442,
    [StatType.BASE_ATTACK]: 1543,
  },
  60: {
    [StatType.BASE_HP]: 297005,
    [StatType.BASE_ATTACK]: 3832,
  },
  80: {
    [StatType.BASE_HP]: 714428,
    [StatType.BASE_ATTACK]: 5767,
  },
  90: {
    [StatType.BASE_HP]: 1100596,
    [StatType.BASE_ATTACK]: 6607,
  },
};

export class EliteExecutionerEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.ELITE_EXECUTIONER,
      name: "Elite Executioner",
      tier: EnemyTierType.ELITE,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 340,
        [StatType.STAGGER_RECOVERY]: 9,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [StatType.FINISHER_SP_GAIN]: 50,
        [StatType.ATTACK_RANGE]: 2.8,
        [StatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
