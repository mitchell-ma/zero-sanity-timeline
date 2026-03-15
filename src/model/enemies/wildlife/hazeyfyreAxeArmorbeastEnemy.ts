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
    [StatType.BASE_HP]: 1800,
    [StatType.BASE_ATTACK]: 72,
  },
  20: {
    [StatType.BASE_HP]: 12916,
    [StatType.BASE_ATTACK]: 341,
  },
  40: {
    [StatType.BASE_HP]: 81729,
    [StatType.BASE_ATTACK]: 1061,
  },
  60: {
    [StatType.BASE_HP]: 321755,
    [StatType.BASE_ATTACK]: 2635,
  },
  80: {
    [StatType.BASE_HP]: 773964,
    [StatType.BASE_ATTACK]: 3965,
  },
  90: {
    [StatType.BASE_HP]: 1192313,
    [StatType.BASE_ATTACK]: 4543,
  },
};

export class HazefyreAxeArmorbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HAZEFYRE_AXE_ARMORBEAST,
      name: "Hazefyre Axe Armorbeast",
      tier: EnemyTierType.ELITE,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 320,
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
