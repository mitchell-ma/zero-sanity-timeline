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
    [EnemyStatType.ATK]: 28,
  },
  20: {
    [EnemyStatType.HP]: 1292,
    [EnemyStatType.ATK]: 132,
  },
  40: {
    [EnemyStatType.HP]: 8173,
    [EnemyStatType.ATK]: 410,
  },
  60: {
    [EnemyStatType.HP]: 32175,
    [EnemyStatType.ATK]: 1018,
  },
  80: {
    [EnemyStatType.HP]: 77396,
    [EnemyStatType.ATK]: 1532,
  },
  90: {
    [EnemyStatType.HP]: 119231,
    [EnemyStatType.ATK]: 1755,
  },
};

export class GroveArcherEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.GROVE_ARCHER,
      name: "Grove Archer",
      tier: EnemyTierType.COMMON,
      race: RaceType.CANGZEI_PIRATES,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.STAGGER_HP]: 80,
        [EnemyStatType.ATTACK_RANGE]: 7,
      },
      ...params,
    });
  }
}
