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
    [StatType.BASE_HP]: 208,
    [StatType.BASE_ATTACK]: 36,
  },
  20: {
    [StatType.BASE_HP]: 1490,
    [StatType.BASE_ATTACK]: 171,
  },
  40: {
    [StatType.BASE_HP]: 9430,
    [StatType.BASE_ATTACK]: 531,
  },
  60: {
    [StatType.BASE_HP]: 37126,
    [StatType.BASE_ATTACK]: 1317,
  },
  80: {
    [StatType.BASE_HP]: 89303,
    [StatType.BASE_ATTACK]: 1982,
  },
  90: {
    [StatType.BASE_HP]: 137575,
    [StatType.BASE_ATTACK]: 2271,
  },
};

export class StingAlphaEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.STING_ALPHA,
      name: "Sting α",
      tier: EnemyTierType.COMMON,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 90,
        [StatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
