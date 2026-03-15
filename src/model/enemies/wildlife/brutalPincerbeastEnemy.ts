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
    [StatType.BASE_HP]: 277,
    [StatType.BASE_ATTACK]: 30,
  },
  20: {
    [StatType.BASE_HP]: 1987,
    [StatType.BASE_ATTACK]: 140,
  },
  40: {
    [StatType.BASE_HP]: 12574,
    [StatType.BASE_ATTACK]: 434,
  },
  60: {
    [StatType.BASE_HP]: 49501,
    [StatType.BASE_ATTACK]: 1078,
  },
  80: {
    [StatType.BASE_HP]: 119071,
    [StatType.BASE_ATTACK]: 1622,
  },
  90: {
    [StatType.BASE_HP]: 183433,
    [StatType.BASE_ATTACK]: 1858,
  },
};

export class BrutalPincerbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BRUTAL_PINCERBEAST,
      name: "Brutal Pincerbeast",
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
