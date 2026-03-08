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
    [EnemyStatType.HP]: 194,
    [EnemyStatType.ATK]: 33,
  },
  20: {
    [EnemyStatType.HP]: 1391,
    [EnemyStatType.ATK]: 155,
  },
  40: {
    [EnemyStatType.HP]: 8802,
    [EnemyStatType.ATK]: 482,
  },
  60: {
    [EnemyStatType.HP]: 34651,
    [EnemyStatType.ATK]: 1198,
  },
  80: {
    [EnemyStatType.HP]: 83350,
    [EnemyStatType.ATK]: 1802,
  },
  90: {
    [EnemyStatType.HP]: 128403,
    [EnemyStatType.ATK]: 2065,
  },
};

export class HazefyreTuskbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HAZEFYRE_TUSKBEAST,
      name: "Hazefyre Tuskbeast",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.ELECTRIC_RESISTANCE]: 0.8,
        [EnemyStatType.CRYO_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 80,
        [EnemyStatType.ATTACK_RANGE]: 2.1,
      },
      ...params,
    });
  }
}
