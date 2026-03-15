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
    [StatType.BASE_ATTACK]: 30,
  },
  20: {
    [StatType.BASE_HP]: 1490,
    [StatType.BASE_ATTACK]: 140,
  },
  40: {
    [StatType.BASE_HP]: 9430,
    [StatType.BASE_ATTACK]: 434,
  },
  60: {
    [StatType.BASE_HP]: 37126,
    [StatType.BASE_ATTACK]: 1078,
  },
  80: {
    [StatType.BASE_HP]: 89303,
    [StatType.BASE_ATTACK]: 1622,
  },
  90: {
    [StatType.BASE_HP]: 137575,
    [StatType.BASE_ATTACK]: 1858,
  },
};

export class HedronDeltaEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HEDRON_DELTA,
      name: "Hedron δ",
      tier: EnemyTierType.COMMON,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.CRYO,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.ELECTRIC_RESISTANCE]: 0.8,
        [StatType.CRYO_RESISTANCE]: 0.8,
        [StatType.STAGGER_HP]: 90,
        [StatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
