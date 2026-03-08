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
    [EnemyStatType.HP]: 166,
    [EnemyStatType.ATK]: 33,
  },
  20: {
    [EnemyStatType.HP]: 1192,
    [EnemyStatType.ATK]: 155,
  },
  40: {
    [EnemyStatType.HP]: 7544,
    [EnemyStatType.ATK]: 482,
  },
  60: {
    [EnemyStatType.HP]: 29700,
    [EnemyStatType.ATK]: 1198,
  },
  80: {
    [EnemyStatType.HP]: 71443,
    [EnemyStatType.ATK]: 1802,
  },
  90: {
    [EnemyStatType.HP]: 110060,
    [EnemyStatType.ATK]: 2065,
  },
};

export class BonekrusherInfiltratorEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_INFILTRATOR,
      name: "Bonekrusher Infiltrator",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.STAGGER_HP]: 80,
        [EnemyStatType.ATTACK_RANGE]: 2.3,
      },
      ...params,
    });
  }
}
