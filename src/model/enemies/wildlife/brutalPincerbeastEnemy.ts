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
    [EnemyStatType.HP]: 277,
    [EnemyStatType.ATK]: 30,
  },
  20: {
    [EnemyStatType.HP]: 1987,
    [EnemyStatType.ATK]: 140,
  },
  40: {
    [EnemyStatType.HP]: 12574,
    [EnemyStatType.ATK]: 434,
  },
  60: {
    [EnemyStatType.HP]: 49501,
    [EnemyStatType.ATK]: 1078,
  },
  80: {
    [EnemyStatType.HP]: 119071,
    [EnemyStatType.ATK]: 1622,
  },
  90: {
    [EnemyStatType.HP]: 183433,
    [EnemyStatType.ATK]: 1858,
  },
};

export class BrutalPincerbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BRUTAL_PINCERBEAST,
      name: "Brutal Pincerbeast",
      tier: EnemyTierType.COMMON,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
