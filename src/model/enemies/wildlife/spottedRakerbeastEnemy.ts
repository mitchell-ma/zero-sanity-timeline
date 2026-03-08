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
    [EnemyStatType.HP]: 1108,
    [EnemyStatType.ATK]: 66,
  },
  20: {
    [EnemyStatType.HP]: 7948,
    [EnemyStatType.ATK]: 310,
  },
  40: {
    [EnemyStatType.HP]: 50295,
    [EnemyStatType.ATK]: 965,
  },
  60: {
    [EnemyStatType.HP]: 198003,
    [EnemyStatType.ATK]: 2395,
  },
  80: {
    [EnemyStatType.HP]: 476285,
    [EnemyStatType.ATK]: 3604,
  },
  90: {
    [EnemyStatType.HP]: 733731,
    [EnemyStatType.ATK]: 4130,
  },
};

export class SpottedRakerbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.SPOTTED_RAKERBEAST,
      name: "Spotted Rakerbeast",
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
