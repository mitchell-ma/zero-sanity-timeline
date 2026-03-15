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
    [StatType.BASE_ATTACK]: 66,
  },
  20: {
    [StatType.BASE_HP]: 5961,
    [StatType.BASE_ATTACK]: 310,
  },
  40: {
    [StatType.BASE_HP]: 37721,
    [StatType.BASE_ATTACK]: 965,
  },
  60: {
    [StatType.BASE_HP]: 148502,
    [StatType.BASE_ATTACK]: 2395,
  },
  80: {
    [StatType.BASE_HP]: 357214,
    [StatType.BASE_ATTACK]: 3604,
  },
  90: {
    [StatType.BASE_HP]: 550298,
    [StatType.BASE_ATTACK]: 4130,
  },
};

export class HeavyRamEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HEAVY_RAM,
      name: "Heavy Ram",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.PHYSICAL_RESISTANCE]: 0.8,
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.NATURE_RESISTANCE]: 0.8,
        [StatType.STAGGER_HP]: 160,
        [StatType.STAGGER_RECOVERY]: 7,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [StatType.FINISHER_SP_GAIN]: 35,
        [StatType.ATTACK_RANGE]: 3.2,
        [StatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
