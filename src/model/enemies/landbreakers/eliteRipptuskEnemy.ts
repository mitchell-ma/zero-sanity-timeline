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
    [EnemyStatType.HP]: 228,
    [EnemyStatType.ATK]: 39,
  },
  20: {
    [EnemyStatType.HP]: 1639,
    [EnemyStatType.ATK]: 186,
  },
  40: {
    [EnemyStatType.HP]: 10373,
    [EnemyStatType.ATK]: 579,
  },
  60: {
    [EnemyStatType.HP]: 40838,
    [EnemyStatType.ATK]: 1437,
  },
  80: {
    [EnemyStatType.HP]: 98234,
    [EnemyStatType.ATK]: 2163,
  },
  90: {
    [EnemyStatType.HP]: 151332,
    [EnemyStatType.ATK]: 2478,
  },
};

export class EliteRipptuskEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.ELITE_RIPPTUSK,
      name: "Elite Ripptusk",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.STAGGER_HP]: 90,
        [EnemyStatType.ATTACK_RANGE]: 2.1,
      },
      ...params,
    });
  }
}
