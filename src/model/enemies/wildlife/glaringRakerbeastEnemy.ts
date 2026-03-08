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
    [EnemyStatType.HP]: 1869,
    [EnemyStatType.ATK]: 72,
  },
  20: {
    [EnemyStatType.HP]: 13413,
    [EnemyStatType.ATK]: 341,
  },
  40: {
    [EnemyStatType.HP]: 84872,
    [EnemyStatType.ATK]: 1061,
  },
  60: {
    [EnemyStatType.HP]: 334130,
    [EnemyStatType.ATK]: 2635,
  },
  80: {
    [EnemyStatType.HP]: 803731,
    [EnemyStatType.ATK]: 3965,
  },
  90: {
    [EnemyStatType.HP]: 1238171,
    [EnemyStatType.ATK]: 4543,
  },
};

export class GlaringRakerbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.GLARING_RAKERBEAST,
      name: "Glaring Rakerbeast",
      tier: EnemyTierType.ELITE,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.CRYO_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 320,
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
