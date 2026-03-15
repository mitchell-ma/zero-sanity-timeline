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

export class BonekrusherBallistaEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_BALLISTA,
      name: "Bonekrusher Ballista",
      tier: EnemyTierType.ELITE,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 320,
        [StatType.STAGGER_RECOVERY]: 9,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [StatType.FINISHER_SP_GAIN]: 50,
        [StatType.ATTACK_RANGE]: 12,
        [StatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
