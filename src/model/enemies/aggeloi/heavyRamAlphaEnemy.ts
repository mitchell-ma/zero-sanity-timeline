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
    [EnemyStatType.HP]: 1246,
    [EnemyStatType.ATK]: 72,
  },
  20: {
    [EnemyStatType.HP]: 8942,
    [EnemyStatType.ATK]: 341,
  },
  40: {
    [EnemyStatType.HP]: 56582,
    [EnemyStatType.ATK]: 1061,
  },
  60: {
    [EnemyStatType.HP]: 222753,
    [EnemyStatType.ATK]: 2635,
  },
  80: {
    [EnemyStatType.HP]: 535821,
    [EnemyStatType.ATK]: 3965,
  },
  90: {
    [EnemyStatType.HP]: 825447,
    [EnemyStatType.ATK]: 4543,
  },
};

export class HeavyRamAlphaEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HEAVY_RAM_ALPHA,
      name: "Heavy Ram α",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 200,
        [EnemyStatType.STAGGER_RECOVERY]: 7.5,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [EnemyStatType.FINISHER_SP_GAIN]: 35,
        [EnemyStatType.ATTACK_RANGE]: 3.2,
        [EnemyStatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
