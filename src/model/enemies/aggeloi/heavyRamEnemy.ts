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
    [EnemyStatType.ATK]: 66,
  },
  20: {
    [EnemyStatType.HP]: 5961,
    [EnemyStatType.ATK]: 310,
  },
  40: {
    [EnemyStatType.HP]: 37721,
    [EnemyStatType.ATK]: 965,
  },
  60: {
    [EnemyStatType.HP]: 148502,
    [EnemyStatType.ATK]: 2395,
  },
  80: {
    [EnemyStatType.HP]: 357214,
    [EnemyStatType.ATK]: 3604,
  },
  90: {
    [EnemyStatType.HP]: 550298,
    [EnemyStatType.ATK]: 4130,
  },
};

export class HeavyRamEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HEAVY_RAM,
      name: "Heavy Ram",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 160,
        [EnemyStatType.STAGGER_RECOVERY]: 7,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [EnemyStatType.FINISHER_SP_GAIN]: 35,
        [EnemyStatType.ATTACK_RANGE]: 3.2,
        [EnemyStatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
