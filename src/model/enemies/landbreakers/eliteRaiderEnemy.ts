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
    [StatType.BASE_HP]: 291,
    [StatType.BASE_ATTACK]: 49,
  },
  20: {
    [StatType.BASE_HP]: 2086,
    [StatType.BASE_ATTACK]: 233,
  },
  40: {
    [StatType.BASE_HP]: 13202,
    [StatType.BASE_ATTACK]: 723,
  },
  60: {
    [StatType.BASE_HP]: 51976,
    [StatType.BASE_ATTACK]: 1796,
  },
  80: {
    [StatType.BASE_HP]: 125025,
    [StatType.BASE_ATTACK]: 2703,
  },
  90: {
    [StatType.BASE_HP]: 192604,
    [StatType.BASE_ATTACK]: 3097,
  },
};

export class EliteRaiderEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.ELITE_RAIDER,
      name: "Elite Raider",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 110,
        [StatType.ATTACK_RANGE]: 2.3,
      },
      ...params,
    });
  }
}
