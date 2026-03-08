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
    [EnemyStatType.HP]: 166,
    [EnemyStatType.ATK]: 26,
  },
  20: {
    [EnemyStatType.HP]: 1192,
    [EnemyStatType.ATK]: 124,
  },
  40: {
    [EnemyStatType.HP]: 7544,
    [EnemyStatType.ATK]: 386,
  },
  60: {
    [EnemyStatType.HP]: 29700,
    [EnemyStatType.ATK]: 958,
  },
  80: {
    [EnemyStatType.HP]: 71443,
    [EnemyStatType.ATK]: 1442,
  },
  90: {
    [EnemyStatType.HP]: 110060,
    [EnemyStatType.ATK]: 1652,
  },
};

export class IndigenousPincerbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.INDIGENOUS_PINCERBEAST,
      name: "Indigenous Pincerbeast",
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
