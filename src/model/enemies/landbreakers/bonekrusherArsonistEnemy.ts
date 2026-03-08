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
    [EnemyStatType.HP]: 831,
    [EnemyStatType.ATK]: 49,
  },
  20: {
    [EnemyStatType.HP]: 5961,
    [EnemyStatType.ATK]: 233,
  },
  40: {
    [EnemyStatType.HP]: 37721,
    [EnemyStatType.ATK]: 723,
  },
  60: {
    [EnemyStatType.HP]: 148502,
    [EnemyStatType.ATK]: 1796,
  },
  80: {
    [EnemyStatType.HP]: 357214,
    [EnemyStatType.ATK]: 2703,
  },
  90: {
    [EnemyStatType.HP]: 550298,
    [EnemyStatType.ATK]: 3097,
  },
};

export class BonekrusherArsonistEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_ARSONIST,
      name: "Bonekrusher Arsonist",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.HEAT,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.HEAT_RESISTANCE]: 0.5,
        [EnemyStatType.STAGGER_HP]: 170,
        [EnemyStatType.STAGGER_RECOVERY]: 7,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [EnemyStatType.FINISHER_SP_GAIN]: 35,
        [EnemyStatType.ATTACK_RANGE]: 7,
        [EnemyStatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
