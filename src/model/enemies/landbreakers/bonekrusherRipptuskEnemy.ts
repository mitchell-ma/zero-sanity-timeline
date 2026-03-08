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
    [EnemyStatType.HP]: 152,
    [EnemyStatType.ATK]: 30,
  },
  20: {
    [EnemyStatType.HP]: 1093,
    [EnemyStatType.ATK]: 140,
  },
  40: {
    [EnemyStatType.HP]: 6916,
    [EnemyStatType.ATK]: 434,
  },
  60: {
    [EnemyStatType.HP]: 27225,
    [EnemyStatType.ATK]: 1078,
  },
  80: {
    [EnemyStatType.HP]: 65489,
    [EnemyStatType.ATK]: 1622,
  },
  90: {
    [EnemyStatType.HP]: 100888,
    [EnemyStatType.ATK]: 1858,
  },
};

export class BonekrusherRipptuskEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_RIPPTUSK,
      name: "Bonekrusher Ripptusk",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.ATTACK_RANGE]: 2.1,
      },
      ...params,
    });
  }
}
