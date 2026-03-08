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
    [EnemyStatType.HP]: 415,
    [EnemyStatType.ATK]: 49,
  },
  20: {
    [EnemyStatType.HP]: 2981,
    [EnemyStatType.ATK]: 233,
  },
  40: {
    [EnemyStatType.HP]: 18861,
    [EnemyStatType.ATK]: 723,
  },
  60: {
    [EnemyStatType.HP]: 74251,
    [EnemyStatType.ATK]: 1796,
  },
  80: {
    [EnemyStatType.HP]: 178607,
    [EnemyStatType.ATK]: 2703,
  },
  90: {
    [EnemyStatType.HP]: 275149,
    [EnemyStatType.ATK]: 3097,
  },
};

export class SentinelEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.SENTINEL,
      name: "Sentinel",
      tier: EnemyTierType.ELITE,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_RECOVERY]: 9,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [EnemyStatType.FINISHER_SP_GAIN]: 50,
        [EnemyStatType.ATTACK_RANGE]: 7,
        [EnemyStatType.WEIGHT]: 2,
      },
      ...params,
    });
  }
}
