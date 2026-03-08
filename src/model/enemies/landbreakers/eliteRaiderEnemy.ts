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
    [EnemyStatType.HP]: 291,
    [EnemyStatType.ATK]: 49,
  },
  20: {
    [EnemyStatType.HP]: 2086,
    [EnemyStatType.ATK]: 233,
  },
  40: {
    [EnemyStatType.HP]: 13202,
    [EnemyStatType.ATK]: 723,
  },
  60: {
    [EnemyStatType.HP]: 51976,
    [EnemyStatType.ATK]: 1796,
  },
  80: {
    [EnemyStatType.HP]: 125025,
    [EnemyStatType.ATK]: 2703,
  },
  90: {
    [EnemyStatType.HP]: 192604,
    [EnemyStatType.ATK]: 3097,
  },
};

export class EliteRaiderEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.ELITE_RAIDER,
      name: "Elite Raider",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.STAGGER_HP]: 110,
        [EnemyStatType.ATTACK_RANGE]: 2.3,
      },
      ...params,
    });
  }
}
