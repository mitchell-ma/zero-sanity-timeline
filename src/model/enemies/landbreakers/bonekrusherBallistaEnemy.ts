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

export class BonekrusherBallistaEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_BALLISTA,
      name: "Bonekrusher Ballista",
      tier: EnemyTierType.ELITE,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.STAGGER_HP]: 320,
        [EnemyStatType.STAGGER_RECOVERY]: 9,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [EnemyStatType.FINISHER_SP_GAIN]: 50,
        [EnemyStatType.ATTACK_RANGE]: 12,
        [EnemyStatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
