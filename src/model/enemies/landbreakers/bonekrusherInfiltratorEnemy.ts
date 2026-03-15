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
    [StatType.BASE_HP]: 166,
    [StatType.BASE_ATTACK]: 33,
  },
  20: {
    [StatType.BASE_HP]: 1192,
    [StatType.BASE_ATTACK]: 155,
  },
  40: {
    [StatType.BASE_HP]: 7544,
    [StatType.BASE_ATTACK]: 482,
  },
  60: {
    [StatType.BASE_HP]: 29700,
    [StatType.BASE_ATTACK]: 1198,
  },
  80: {
    [StatType.BASE_HP]: 71443,
    [StatType.BASE_ATTACK]: 1802,
  },
  90: {
    [StatType.BASE_HP]: 110060,
    [StatType.BASE_ATTACK]: 2065,
  },
};

export class BonekrusherInfiltratorEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_INFILTRATOR,
      name: "Bonekrusher Infiltrator",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
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
