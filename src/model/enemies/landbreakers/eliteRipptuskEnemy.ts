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
    [StatType.BASE_HP]: 228,
    [StatType.BASE_ATTACK]: 39,
  },
  20: {
    [StatType.BASE_HP]: 1639,
    [StatType.BASE_ATTACK]: 186,
  },
  40: {
    [StatType.BASE_HP]: 10373,
    [StatType.BASE_ATTACK]: 579,
  },
  60: {
    [StatType.BASE_HP]: 40838,
    [StatType.BASE_ATTACK]: 1437,
  },
  80: {
    [StatType.BASE_HP]: 98234,
    [StatType.BASE_ATTACK]: 2163,
  },
  90: {
    [StatType.BASE_HP]: 151332,
    [StatType.BASE_ATTACK]: 2478,
  },
};

export class EliteRipptuskEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.ELITE_RIPPTUSK,
      name: "Elite Ripptusk",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 90,
        [StatType.ATTACK_RANGE]: 2.1,
      },
      ...params,
    });
  }
}
