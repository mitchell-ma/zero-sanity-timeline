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
    [EnemyStatType.HP]: 138,
    [EnemyStatType.ATK]: 33,
  },
  20: {
    [EnemyStatType.HP]: 994,
    [EnemyStatType.ATK]: 155,
  },
  40: {
    [EnemyStatType.HP]: 6287,
    [EnemyStatType.ATK]: 482,
  },
  60: {
    [EnemyStatType.HP]: 24750,
    [EnemyStatType.ATK]: 1198,
  },
  80: {
    [EnemyStatType.HP]: 59536,
    [EnemyStatType.ATK]: 1802,
  },
  90: {
    [EnemyStatType.HP]: 91716,
    [EnemyStatType.ATK]: 2065,
  },
};

export class RamEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.RAM,
      name: "Ram",
      tier: EnemyTierType.COMMON,
      race: RaceType.AGGELOI,
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
