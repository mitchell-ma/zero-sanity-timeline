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
    [EnemyStatType.HP]: 291,
    [EnemyStatType.ATK]: 30,
  },
  20: {
    [EnemyStatType.HP]: 2086,
    [EnemyStatType.ATK]: 140,
  },
  40: {
    [EnemyStatType.HP]: 13202,
    [EnemyStatType.ATK]: 434,
  },
  60: {
    [EnemyStatType.HP]: 51976,
    [EnemyStatType.ATK]: 1078,
  },
  80: {
    [EnemyStatType.HP]: 125025,
    [EnemyStatType.ATK]: 1622,
  },
  90: {
    [EnemyStatType.HP]: 192604,
    [EnemyStatType.ATK]: 1858,
  },
};

export class MudflowDeltaEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.MUDFLOW_DELTA,
      name: "Mudflow δ",
      tier: EnemyTierType.COMMON,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.CRYO,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.ELECTRIC_RESISTANCE]: 0.8,
        [EnemyStatType.CRYO_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 90,
        [EnemyStatType.ATTACK_RANGE]: 2.1,
      },
      ...params,
    });
  }
}
