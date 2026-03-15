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
    [StatType.BASE_HP]: 180,
    [StatType.BASE_ATTACK]: 26,
  },
  20: {
    [StatType.BASE_HP]: 1292,
    [StatType.BASE_ATTACK]: 124,
  },
  40: {
    [StatType.BASE_HP]: 8173,
    [StatType.BASE_ATTACK]: 386,
  },
  60: {
    [StatType.BASE_HP]: 32175,
    [StatType.BASE_ATTACK]: 958,
  },
  80: {
    [StatType.BASE_HP]: 77396,
    [StatType.BASE_ATTACK]: 1442,
  },
  90: {
    [StatType.BASE_HP]: 119231,
    [StatType.BASE_ATTACK]: 1652,
  },
};

export class FiremistOriginiumSlugEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.FIREMIST_ORIGINIUM_SLUG,
      name: "Firemist Originium Slug",
      tier: EnemyTierType.COMMON,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.NATURE,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.PHYSICAL_RESISTANCE]: 0.8,
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.NATURE_RESISTANCE]: 0.8,
        [StatType.STAGGER_HP]: 80,
        [StatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
