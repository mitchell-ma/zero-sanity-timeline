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
    [EnemyStatType.ATK]: 44,
  },
  20: {
    [EnemyStatType.HP]: 8942,
    [EnemyStatType.ATK]: 209,
  },
  40: {
    [EnemyStatType.HP]: 56582,
    [EnemyStatType.ATK]: 651,
  },
  60: {
    [EnemyStatType.HP]: 222753,
    [EnemyStatType.ATK]: 1617,
  },
  80: {
    [EnemyStatType.HP]: 535821,
    [EnemyStatType.ATK]: 2433,
  },
  90: {
    [EnemyStatType.HP]: 825447,
    [EnemyStatType.ATK]: 2788,
  },
};

export class ImbuedQuillbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.IMBUED_QUILLBEAST,
      name: "Imbued Quillbeast",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.ELECTRIC_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_RECOVERY]: 7,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [EnemyStatType.FINISHER_SP_GAIN]: 35,
        [EnemyStatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
