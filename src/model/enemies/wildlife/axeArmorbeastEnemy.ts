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
    [StatType.BASE_ATTACK]: 66,
  },
  20: {
    [StatType.BASE_HP]: 9936,
    [StatType.BASE_ATTACK]: 310,
  },
  40: {
    [StatType.BASE_HP]: 62869,
    [StatType.BASE_ATTACK]: 965,
  },
  60: {
    [StatType.BASE_HP]: 247504,
    [StatType.BASE_ATTACK]: 2395,
  },
  80: {
    [StatType.BASE_HP]: 595357,
    [StatType.BASE_ATTACK]: 3604,
  },
  90: {
    [StatType.BASE_HP]: 917164,
    [StatType.BASE_ATTACK]: 4130,
  },
};

export class AxeArmorbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.AXE_ARMORBEAST,
      name: "Axe Armorbeast",
      tier: EnemyTierType.ELITE,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 280,
        [StatType.STAGGER_RECOVERY]: 9,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [StatType.FINISHER_SP_GAIN]: 50,
        [StatType.ATTACK_RANGE]: 7,
        [StatType.WEIGHT]: 2,
      },
      ...params,
    });
  }
}
