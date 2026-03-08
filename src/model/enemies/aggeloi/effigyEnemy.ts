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
    [EnemyStatType.ATK]: 66,
  },
  20: {
    [EnemyStatType.HP]: 8942,
    [EnemyStatType.ATK]: 310,
  },
  40: {
    [EnemyStatType.HP]: 56582,
    [EnemyStatType.ATK]: 965,
  },
  60: {
    [EnemyStatType.HP]: 222753,
    [EnemyStatType.ATK]: 2395,
  },
  80: {
    [EnemyStatType.HP]: 535821,
    [EnemyStatType.ATK]: 3604,
  },
  90: {
    [EnemyStatType.HP]: 825447,
    [EnemyStatType.ATK]: 4130,
  },
};

export class EffigyEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.EFFIGY,
      name: "Effigy",
      tier: EnemyTierType.ELITE,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 340,
        [EnemyStatType.STAGGER_RECOVERY]: 9,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [EnemyStatType.FINISHER_SP_GAIN]: 50,
        [EnemyStatType.ATTACK_RANGE]: 12,
        [EnemyStatType.WEIGHT]: 2,
      },
      ...params,
    });
  }
}
