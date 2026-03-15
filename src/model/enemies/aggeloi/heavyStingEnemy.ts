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
    [StatType.BASE_HP]: 734,
    [StatType.BASE_ATTACK]: 49,
  },
  20: {
    [StatType.BASE_HP]: 5266,
    [StatType.BASE_ATTACK]: 233,
  },
  40: {
    [StatType.BASE_HP]: 33320,
    [StatType.BASE_ATTACK]: 723,
  },
  60: {
    [StatType.BASE_HP]: 131177,
    [StatType.BASE_ATTACK]: 1796,
  },
  80: {
    [StatType.BASE_HP]: 315539,
    [StatType.BASE_ATTACK]: 2703,
  },
  90: {
    [StatType.BASE_HP]: 486097,
    [StatType.BASE_ATTACK]: 3097,
  },
};

export class HeavyStingEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HEAVY_STING,
      name: "Heavy Sting",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.PHYSICAL_RESISTANCE]: 0.8,
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.CRYO_RESISTANCE]: 0.8,
        [StatType.NATURE_RESISTANCE]: 0.8,
        [StatType.STAGGER_HP]: 140,
        [StatType.STAGGER_RECOVERY]: 7,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [StatType.FINISHER_SP_GAIN]: 35,
        [StatType.ATTACK_RANGE]: 7,
        [StatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
