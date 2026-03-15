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
    [StatType.BASE_ATTACK]: 66,
  },
  20: {
    [StatType.BASE_HP]: 8942,
    [StatType.BASE_ATTACK]: 310,
  },
  40: {
    [StatType.BASE_HP]: 56582,
    [StatType.BASE_ATTACK]: 965,
  },
  60: {
    [StatType.BASE_HP]: 222753,
    [StatType.BASE_ATTACK]: 2395,
  },
  80: {
    [StatType.BASE_HP]: 535821,
    [StatType.BASE_ATTACK]: 3604,
  },
  90: {
    [StatType.BASE_HP]: 825447,
    [StatType.BASE_ATTACK]: 4130,
  },
};

export class EffigyEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.EFFIGY,
      name: "Effigy",
      tier: EnemyTierType.ELITE,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.PHYSICAL_RESISTANCE]: 0.8,
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.NATURE_RESISTANCE]: 0.8,
        [StatType.STAGGER_HP]: 340,
        [StatType.STAGGER_RECOVERY]: 9,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [StatType.FINISHER_SP_GAIN]: 50,
        [StatType.ATTACK_RANGE]: 12,
        [StatType.WEIGHT]: 2,
      },
      ...params,
    });
  }
}
