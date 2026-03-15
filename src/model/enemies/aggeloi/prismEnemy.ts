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
    [StatType.BASE_HP]: 111,
    [StatType.BASE_ATTACK]: 26,
  },
  20: {
    [StatType.BASE_HP]: 795,
    [StatType.BASE_ATTACK]: 124,
  },
  40: {
    [StatType.BASE_HP]: 5029,
    [StatType.BASE_ATTACK]: 386,
  },
  60: {
    [StatType.BASE_HP]: 19800,
    [StatType.BASE_ATTACK]: 958,
  },
  80: {
    [StatType.BASE_HP]: 47629,
    [StatType.BASE_ATTACK]: 1442,
  },
  90: {
    [StatType.BASE_HP]: 73373,
    [StatType.BASE_ATTACK]: 1652,
  },
};

export class PrismEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.PRISM,
      name: "Prism",
      tier: EnemyTierType.COMMON,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.ELECTRIC_RESISTANCE]: 0.8,
        [StatType.CRYO_RESISTANCE]: 0.8,
        [StatType.ATTACK_RANGE]: 2.1,
      },
      ...params,
    });
  }
}
