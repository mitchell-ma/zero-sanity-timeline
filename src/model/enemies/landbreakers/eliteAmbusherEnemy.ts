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
    [EnemyStatType.HP]: 263,
    [EnemyStatType.ATK]: 38,
  },
  20: {
    [EnemyStatType.HP]: 1888,
    [EnemyStatType.ATK]: 178,
  },
  40: {
    [EnemyStatType.HP]: 11945,
    [EnemyStatType.ATK]: 555,
  },
  60: {
    [EnemyStatType.HP]: 47026,
    [EnemyStatType.ATK]: 1377,
  },
  80: {
    [EnemyStatType.HP]: 113118,
    [EnemyStatType.ATK]: 2073,
  },
  90: {
    [EnemyStatType.HP]: 174261,
    [EnemyStatType.ATK]: 2375,
  },
};

export class EliteAmbusherEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.ELITE_AMBUSHER,
      name: "Elite Ambusher",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.STAGGER_HP]: 110,
        [EnemyStatType.ATTACK_RANGE]: 7,
      },
      ...params,
    });
  }
}
