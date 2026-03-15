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
    [StatType.BASE_HP]: 1385,
    [StatType.BASE_ATTACK]: 59,
  },
  20: {
    [StatType.BASE_HP]: 9936,
    [StatType.BASE_ATTACK]: 279,
  },
  40: {
    [StatType.BASE_HP]: 62869,
    [StatType.BASE_ATTACK]: 868,
  },
  60: {
    [StatType.BASE_HP]: 247504,
    [StatType.BASE_ATTACK]: 2156,
  },
  80: {
    [StatType.BASE_HP]: 595357,
    [StatType.BASE_ATTACK]: 3244,
  },
  90: {
    [StatType.BASE_HP]: 917164,
    [StatType.BASE_ATTACK]: 3717,
  },
};

export class WalkingChrysopolisEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.WALKING_CHRYSOPOLIS,
      name: "Walking Chrysopolis",
      tier: EnemyTierType.ALPHA,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.PHYSICAL_RESISTANCE]: 0.8,
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.CRYO_RESISTANCE]: 0.8,
        [StatType.NATURE_RESISTANCE]: 0.8,
        [StatType.STAGGER_HP]: 320,
        [StatType.STAGGER_RECOVERY]: 9,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [StatType.FINISHER_SP_GAIN]: 50,
        [StatType.ATTACK_RANGE]: 2.8,
        [StatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
