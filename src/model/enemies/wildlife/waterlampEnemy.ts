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
    [EnemyStatType.HP]: 111,
    [EnemyStatType.ATK]: 26,
  },
  20: {
    [EnemyStatType.HP]: 795,
    [EnemyStatType.ATK]: 124,
  },
  40: {
    [EnemyStatType.HP]: 5029,
    [EnemyStatType.ATK]: 386,
  },
  60: {
    [EnemyStatType.HP]: 19800,
    [EnemyStatType.ATK]: 958,
  },
  80: {
    [EnemyStatType.HP]: 47629,
    [EnemyStatType.ATK]: 1442,
  },
  90: {
    [EnemyStatType.HP]: 73373,
    [EnemyStatType.ATK]: 1652,
  },
};

export class WaterlampEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.WATERLAMP,
      name: "Waterlamp",
      tier: EnemyTierType.COMMON,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.NATURE,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.ELECTRIC_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 80,
        [EnemyStatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
