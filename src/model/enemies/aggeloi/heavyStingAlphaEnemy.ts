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
    [EnemyStatType.HP]: 1094,
    [EnemyStatType.ATK]: 59,
  },
  20: {
    [EnemyStatType.HP]: 7849,
    [EnemyStatType.ATK]: 279,
  },
  40: {
    [EnemyStatType.HP]: 49666,
    [EnemyStatType.ATK]: 868,
  },
  60: {
    [EnemyStatType.HP]: 195528,
    [EnemyStatType.ATK]: 2156,
  },
  80: {
    [EnemyStatType.HP]: 470332,
    [EnemyStatType.ATK]: 3244,
  },
  90: {
    [EnemyStatType.HP]: 724559,
    [EnemyStatType.ATK]: 3717,
  },
};

export class HeavyStingAlphaEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HEAVY_STING_ALPHA,
      name: "Heavy Sting α",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 180,
        [EnemyStatType.STAGGER_RECOVERY]: 7.5,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [EnemyStatType.FINISHER_SP_GAIN]: 35,
        [EnemyStatType.ATTACK_RANGE]: 7,
        [EnemyStatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
