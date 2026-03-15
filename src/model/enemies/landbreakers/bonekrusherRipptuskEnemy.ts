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
    [StatType.BASE_HP]: 152,
    [StatType.BASE_ATTACK]: 30,
  },
  20: {
    [StatType.BASE_HP]: 1093,
    [StatType.BASE_ATTACK]: 140,
  },
  40: {
    [StatType.BASE_HP]: 6916,
    [StatType.BASE_ATTACK]: 434,
  },
  60: {
    [StatType.BASE_HP]: 27225,
    [StatType.BASE_ATTACK]: 1078,
  },
  80: {
    [StatType.BASE_HP]: 65489,
    [StatType.BASE_ATTACK]: 1622,
  },
  90: {
    [StatType.BASE_HP]: 100888,
    [StatType.BASE_ATTACK]: 1858,
  },
};

export class BonekrusherRipptuskEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_RIPPTUSK,
      name: "Bonekrusher Ripptusk",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
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
