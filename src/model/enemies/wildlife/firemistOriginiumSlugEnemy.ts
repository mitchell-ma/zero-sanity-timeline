import {
  ElementType,
  EnemyLocationType,
  EnemyStatType,
  EnemyTierType,
  EnemyType,
  RaceType,
} from "../../../consts/enums";
import { Enemy } from "../enemy";

const STATS_BY_LEVEL: Readonly<
  Record<number, Partial<Record<EnemyStatType, number>>>
> = {
  1: {
    [EnemyStatType.HP]: 180,
    [EnemyStatType.ATK]: 26,
  },
  20: {
    [EnemyStatType.HP]: 1292,
    [EnemyStatType.ATK]: 124,
  },
  40: {
    [EnemyStatType.HP]: 8173,
    [EnemyStatType.ATK]: 386,
  },
  60: {
    [EnemyStatType.HP]: 32175,
    [EnemyStatType.ATK]: 958,
  },
  80: {
    [EnemyStatType.HP]: 77396,
    [EnemyStatType.ATK]: 1442,
  },
  90: {
    [EnemyStatType.HP]: 119231,
    [EnemyStatType.ATK]: 1652,
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
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 80,
        [EnemyStatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
