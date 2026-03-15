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
    [StatType.BASE_HP]: 1246,
    [StatType.BASE_ATTACK]: 72,
  },
  20: {
    [StatType.BASE_HP]: 8942,
    [StatType.BASE_ATTACK]: 341,
  },
  40: {
    [StatType.BASE_HP]: 56582,
    [StatType.BASE_ATTACK]: 1061,
  },
  60: {
    [StatType.BASE_HP]: 222753,
    [StatType.BASE_ATTACK]: 2635,
  },
  80: {
    [StatType.BASE_HP]: 535821,
    [StatType.BASE_ATTACK]: 3965,
  },
  90: {
    [StatType.BASE_HP]: 825447,
    [StatType.BASE_ATTACK]: 4543,
  },
};

export class HeavyRamAlphaEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HEAVY_RAM_ALPHA,
      name: "Heavy Ram α",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.PHYSICAL_RESISTANCE]: 0.8,
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.NATURE_RESISTANCE]: 0.8,
        [StatType.STAGGER_HP]: 200,
        [StatType.STAGGER_RECOVERY]: 7.5,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [StatType.FINISHER_SP_GAIN]: 35,
        [StatType.ATTACK_RANGE]: 3.2,
        [StatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
