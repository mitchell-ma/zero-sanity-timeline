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
    [StatType.BASE_HP]: 761,
    [StatType.BASE_ATTACK]: 49,
  },
  20: {
    [StatType.BASE_HP]: 5465,
    [StatType.BASE_ATTACK]: 233,
  },
  40: {
    [StatType.BASE_HP]: 34578,
    [StatType.BASE_ATTACK]: 723,
  },
  60: {
    [StatType.BASE_HP]: 136127,
    [StatType.BASE_ATTACK]: 1796,
  },
  80: {
    [StatType.BASE_HP]: 327446,
    [StatType.BASE_ATTACK]: 2703,
  },
  90: {
    [StatType.BASE_HP]: 504440,
    [StatType.BASE_ATTACK]: 3097,
  },
};

export class BonekrusherPyromancerEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_PYROMANCER,
      name: "Bonekrusher Pyromancer",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.HEAT,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.HEAT_RESISTANCE]: 0.5,
        [StatType.STAGGER_HP]: 160,
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
