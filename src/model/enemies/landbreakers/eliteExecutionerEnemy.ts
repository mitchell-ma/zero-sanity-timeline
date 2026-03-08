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
    [EnemyStatType.HP]: 1661,
    [EnemyStatType.ATK]: 105,
  },
  20: {
    [EnemyStatType.HP]: 11923,
    [EnemyStatType.ATK]: 496,
  },
  40: {
    [EnemyStatType.HP]: 75442,
    [EnemyStatType.ATK]: 1543,
  },
  60: {
    [EnemyStatType.HP]: 297005,
    [EnemyStatType.ATK]: 3832,
  },
  80: {
    [EnemyStatType.HP]: 714428,
    [EnemyStatType.ATK]: 5767,
  },
  90: {
    [EnemyStatType.HP]: 1100596,
    [EnemyStatType.ATK]: 6607,
  },
};

export class EliteExecutionerEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.ELITE_EXECUTIONER,
      name: "Elite Executioner",
      tier: EnemyTierType.ELITE,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.STAGGER_HP]: 340,
        [EnemyStatType.STAGGER_RECOVERY]: 9,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [EnemyStatType.FINISHER_SP_GAIN]: 50,
        [EnemyStatType.ATTACK_RANGE]: 2.8,
        [EnemyStatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
