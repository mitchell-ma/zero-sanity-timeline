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
    [EnemyStatType.HP]: 270,
    [EnemyStatType.ATK]: 30,
  },
  20: {
    [EnemyStatType.HP]: 1937,
    [EnemyStatType.ATK]: 140,
  },
  40: {
    [EnemyStatType.HP]: 12259,
    [EnemyStatType.ATK]: 434,
  },
  60: {
    [EnemyStatType.HP]: 48263,
    [EnemyStatType.ATK]: 1078,
  },
  80: {
    [EnemyStatType.HP]: 116095,
    [EnemyStatType.ATK]: 1622,
  },
  90: {
    [EnemyStatType.HP]: 178847,
    [EnemyStatType.ATK]: 1858,
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
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
