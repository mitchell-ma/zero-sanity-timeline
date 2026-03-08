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
    [EnemyStatType.HP]: 152,
    [EnemyStatType.ATK]: 26,
  },
  20: {
    [EnemyStatType.HP]: 1093,
    [EnemyStatType.ATK]: 124,
  },
  40: {
    [EnemyStatType.HP]: 6916,
    [EnemyStatType.ATK]: 386,
  },
  60: {
    [EnemyStatType.HP]: 27225,
    [EnemyStatType.ATK]: 958,
  },
  80: {
    [EnemyStatType.HP]: 65489,
    [EnemyStatType.ATK]: 1442,
  },
  90: {
    [EnemyStatType.HP]: 100888,
    [EnemyStatType.ATK]: 1652,
  },
};

export class AcidOriginiumSlugEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.ACID_ORIGINIUM_SLUG,
      name: "Acid Originium Slug",
      tier: EnemyTierType.COMMON,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.NATURE,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
