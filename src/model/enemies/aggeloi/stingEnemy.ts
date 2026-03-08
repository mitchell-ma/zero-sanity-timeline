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
    [EnemyStatType.HP]: 138,
    [EnemyStatType.ATK]: 26,
  },
  20: {
    [EnemyStatType.HP]: 994,
    [EnemyStatType.ATK]: 124,
  },
  40: {
    [EnemyStatType.HP]: 6287,
    [EnemyStatType.ATK]: 386,
  },
  60: {
    [EnemyStatType.HP]: 24750,
    [EnemyStatType.ATK]: 958,
  },
  80: {
    [EnemyStatType.HP]: 59536,
    [EnemyStatType.ATK]: 1442,
  },
  90: {
    [EnemyStatType.HP]: 91716,
    [EnemyStatType.ATK]: 1652,
  },
};

export class StingEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.STING,
      name: "Sting",
      tier: EnemyTierType.COMMON,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
