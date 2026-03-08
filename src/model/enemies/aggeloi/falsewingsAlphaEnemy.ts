import {
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
    [EnemyStatType.HP]: 166,
    [EnemyStatType.ATK]: 30,
  },
  20: {
    [EnemyStatType.HP]: 1192,
    [EnemyStatType.ATK]: 140,
  },
  40: {
    [EnemyStatType.HP]: 7544,
    [EnemyStatType.ATK]: 434,
  },
  60: {
    [EnemyStatType.HP]: 29700,
    [EnemyStatType.ATK]: 1078,
  },
  80: {
    [EnemyStatType.HP]: 71443,
    [EnemyStatType.ATK]: 1622,
  },
  90: {
    [EnemyStatType.HP]: 110060,
    [EnemyStatType.ATK]: 1858,
  },
};

export class FalsewingsAlphaEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.FALSEWINGS_ALPHA,
      name: "Falsewings α",
      tier: EnemyTierType.COMMON,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: null,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
