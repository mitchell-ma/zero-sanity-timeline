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
    [StatType.BASE_ATTACK]: 44,
  },
  20: {
    [StatType.BASE_HP]: 8942,
    [StatType.BASE_ATTACK]: 209,
  },
  40: {
    [StatType.BASE_HP]: 56582,
    [StatType.BASE_ATTACK]: 651,
  },
  60: {
    [StatType.BASE_HP]: 222753,
    [StatType.BASE_ATTACK]: 1617,
  },
  80: {
    [StatType.BASE_HP]: 535821,
    [StatType.BASE_ATTACK]: 2433,
  },
  90: {
    [StatType.BASE_HP]: 825447,
    [StatType.BASE_ATTACK]: 2788,
  },
};

export class ImbuedQuillbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.IMBUED_QUILLBEAST,
      name: "Imbued Quillbeast",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.ELECTRIC_RESISTANCE]: 0.8,
        [StatType.STAGGER_RECOVERY]: 7,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [StatType.FINISHER_SP_GAIN]: 35,
        [StatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
