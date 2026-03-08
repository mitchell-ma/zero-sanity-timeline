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
    [EnemyStatType.ATK]: 39,
  },
  20: {
    [EnemyStatType.HP]: 5961,
    [EnemyStatType.ATK]: 186,
  },
  40: {
    [EnemyStatType.HP]: 37721,
    [EnemyStatType.ATK]: 579,
  },
  60: {
    [EnemyStatType.HP]: 148502,
    [EnemyStatType.ATK]: 1437,
  },
  80: {
    [EnemyStatType.HP]: 357214,
    [EnemyStatType.ATK]: 2163,
  },
  90: {
    [EnemyStatType.HP]: 550298,
    [EnemyStatType.ATK]: 2478,
  },
};

export class QuillbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.QUILLBEAST,
      name: "Quillbeast",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.ELECTRIC_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 200,
        [EnemyStatType.STAGGER_RECOVERY]: 7,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [EnemyStatType.FINISHER_SP_GAIN]: 35,
        [EnemyStatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
