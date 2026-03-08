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
    [EnemyStatType.HP]: 734,
    [EnemyStatType.ATK]: 49,
  },
  20: {
    [EnemyStatType.HP]: 5266,
    [EnemyStatType.ATK]: 233,
  },
  40: {
    [EnemyStatType.HP]: 33320,
    [EnemyStatType.ATK]: 723,
  },
  60: {
    [EnemyStatType.HP]: 131177,
    [EnemyStatType.ATK]: 1796,
  },
  80: {
    [EnemyStatType.HP]: 315539,
    [EnemyStatType.ATK]: 2703,
  },
  90: {
    [EnemyStatType.HP]: 486097,
    [EnemyStatType.ATK]: 3097,
  },
};

export class HeavyStingEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HEAVY_STING,
      name: "Heavy Sting",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.CRYO_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 140,
        [EnemyStatType.STAGGER_RECOVERY]: 7,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [EnemyStatType.FINISHER_SP_GAIN]: 35,
        [EnemyStatType.ATTACK_RANGE]: 7,
        [EnemyStatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
