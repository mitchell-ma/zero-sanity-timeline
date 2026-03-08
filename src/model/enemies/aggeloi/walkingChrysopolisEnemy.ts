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
    [EnemyStatType.HP]: 1385,
    [EnemyStatType.ATK]: 59,
  },
  20: {
    [EnemyStatType.HP]: 9936,
    [EnemyStatType.ATK]: 279,
  },
  40: {
    [EnemyStatType.HP]: 62869,
    [EnemyStatType.ATK]: 868,
  },
  60: {
    [EnemyStatType.HP]: 247504,
    [EnemyStatType.ATK]: 2156,
  },
  80: {
    [EnemyStatType.HP]: 595357,
    [EnemyStatType.ATK]: 3244,
  },
  90: {
    [EnemyStatType.HP]: 917164,
    [EnemyStatType.ATK]: 3717,
  },
};

export class WalkingChrysopolisEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.WALKING_CHRYSOPOLIS,
      name: "Walking Chrysopolis",
      tier: EnemyTierType.ALPHA,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.CRYO_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 320,
        [EnemyStatType.STAGGER_RECOVERY]: 9,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [EnemyStatType.FINISHER_SP_GAIN]: 50,
        [EnemyStatType.ATTACK_RANGE]: 2.8,
        [EnemyStatType.WEIGHT]: 1.5,
      },
      ...params,
    });
  }
}
