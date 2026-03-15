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
    [StatType.BASE_ATTACK]: 26,
  },
  20: {
    [StatType.BASE_HP]: 1192,
    [StatType.BASE_ATTACK]: 124,
  },
  40: {
    [StatType.BASE_HP]: 7544,
    [StatType.BASE_ATTACK]: 386,
  },
  60: {
    [StatType.BASE_HP]: 29700,
    [StatType.BASE_ATTACK]: 958,
  },
  80: {
    [StatType.BASE_HP]: 71443,
    [StatType.BASE_ATTACK]: 1442,
  },
  90: {
    [StatType.BASE_HP]: 110060,
    [StatType.BASE_ATTACK]: 1652,
  },
};

export class IndigenousPincerbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.INDIGENOUS_PINCERBEAST,
      name: "Indigenous Pincerbeast",
      tier: EnemyTierType.COMMON,
      race: RaceType.WILDLIFE,
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
