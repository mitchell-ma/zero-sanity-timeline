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
    [StatType.BASE_HP]: 831,
    [StatType.BASE_ATTACK]: 39,
  },
  20: {
    [StatType.BASE_HP]: 5961,
    [StatType.BASE_ATTACK]: 186,
  },
  40: {
    [StatType.BASE_HP]: 37721,
    [StatType.BASE_ATTACK]: 579,
  },
  60: {
    [StatType.BASE_HP]: 148502,
    [StatType.BASE_ATTACK]: 1437,
  },
  80: {
    [StatType.BASE_HP]: 357214,
    [StatType.BASE_ATTACK]: 2163,
  },
  90: {
    [StatType.BASE_HP]: 550298,
    [StatType.BASE_ATTACK]: 2478,
  },
};

export class QuillbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.QUILLBEAST,
      name: "Quillbeast",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.ELECTRIC_RESISTANCE]: 0.8,
        [StatType.STAGGER_HP]: 200,
        [StatType.STAGGER_RECOVERY]: 7,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [StatType.FINISHER_SP_GAIN]: 35,
        [StatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
