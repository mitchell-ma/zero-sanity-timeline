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
    [EnemyStatType.HP]: 208,
    [EnemyStatType.ATK]: 36,
  },
  20: {
    [EnemyStatType.HP]: 1490,
    [EnemyStatType.ATK]: 171,
  },
  40: {
    [EnemyStatType.HP]: 9430,
    [EnemyStatType.ATK]: 531,
  },
  60: {
    [EnemyStatType.HP]: 37126,
    [EnemyStatType.ATK]: 1317,
  },
  80: {
    [EnemyStatType.HP]: 89303,
    [EnemyStatType.ATK]: 1982,
  },
  90: {
    [EnemyStatType.HP]: 137575,
    [EnemyStatType.ATK]: 2271,
  },
};

export class StingAlphaEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.STING_ALPHA,
      name: "Sting α",
      tier: EnemyTierType.COMMON,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.STAGGER_HP]: 90,
        [EnemyStatType.ATTACK_RANGE]: 6,
      },
      ...params,
    });
  }
}
