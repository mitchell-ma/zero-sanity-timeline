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
    [StatType.BASE_HP]: 180,
    [StatType.BASE_ATTACK]: 28,
  },
  20: {
    [StatType.BASE_HP]: 1292,
    [StatType.BASE_ATTACK]: 132,
  },
  40: {
    [StatType.BASE_HP]: 8173,
    [StatType.BASE_ATTACK]: 410,
  },
  60: {
    [StatType.BASE_HP]: 32175,
    [StatType.BASE_ATTACK]: 1018,
  },
  80: {
    [StatType.BASE_HP]: 77396,
    [StatType.BASE_ATTACK]: 1532,
  },
  90: {
    [StatType.BASE_HP]: 119231,
    [StatType.BASE_ATTACK]: 1755,
  },
};

export class BonekrusherAmbusherEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_AMBUSHER,
      name: "Bonekrusher Ambusher",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 80,
        [StatType.ATTACK_RANGE]: 7,
      },
      ...params,
    });
  }
}
