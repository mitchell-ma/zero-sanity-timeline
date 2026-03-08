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
    [EnemyStatType.ATK]: 26,
  },
  20: {
    [EnemyStatType.HP]: 8942,
    [EnemyStatType.ATK]: 124,
  },
  40: {
    [EnemyStatType.HP]: 56582,
    [EnemyStatType.ATK]: 386,
  },
  60: {
    [EnemyStatType.HP]: 222753,
    [EnemyStatType.ATK]: 958,
  },
  80: {
    [EnemyStatType.HP]: 535821,
    [EnemyStatType.ATK]: 1442,
  },
  90: {
    [EnemyStatType.HP]: 825447,
    [EnemyStatType.ATK]: 1652,
  },
};

export class BonekrusherSiegeknucklesEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_SIEGEKNUCKLES,
      name: "Bonekrusher Siegeknuckles",
      tier: EnemyTierType.ELITE,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.ELECTRIC_RESISTANCE]: 0.8,
        [EnemyStatType.CRYO_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 320,
        [EnemyStatType.FINISHER_SP_GAIN]: 50,
        [EnemyStatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
