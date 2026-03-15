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
    [StatType.BASE_HP]: 270,
    [StatType.BASE_ATTACK]: 30,
  },
  20: {
    [StatType.BASE_HP]: 1937,
    [StatType.BASE_ATTACK]: 140,
  },
  40: {
    [StatType.BASE_HP]: 12259,
    [StatType.BASE_ATTACK]: 434,
  },
  60: {
    [StatType.BASE_HP]: 48263,
    [StatType.BASE_ATTACK]: 1078,
  },
  80: {
    [StatType.BASE_HP]: 116095,
    [StatType.BASE_ATTACK]: 1622,
  },
  90: {
    [StatType.BASE_HP]: 178847,
    [StatType.BASE_ATTACK]: 1858,
  },
};

export class BlazemistOriginiumSlugEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BLAZEMIST_ORIGINIUM_SLUG,
      name: "Blazemist Originium Slug",
      tier: EnemyTierType.COMMON,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.NATURE,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.PHYSICAL_RESISTANCE]: 0.8,
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.NATURE_RESISTANCE]: 0.8,
        [StatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
