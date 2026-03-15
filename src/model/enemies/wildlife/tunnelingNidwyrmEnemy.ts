import {
  ElementType,
  EnemyLocationType,
  StatType,
  EnemyTierType,
  EnemyType,
  RaceType,
} from "../../../consts/enums";
import { Enemy } from "../enemy";

const STATS_BY_LEVEL: Readonly<
  Record<number, Partial<Record<StatType, number>>>
> = {
  1: {
    [StatType.BASE_HP]: 692,
    [StatType.BASE_ATTACK]: 56,
  },
  20: {
    [StatType.BASE_HP]: 4968,
    [StatType.BASE_ATTACK]: 264,
  },
  40: {
    [StatType.BASE_HP]: 31434,
    [StatType.BASE_ATTACK]: 820,
  },
  60: {
    [StatType.BASE_HP]: 123752,
    [StatType.BASE_ATTACK]: 2036,
  },
  80: {
    [StatType.BASE_HP]: 297678,
    [StatType.BASE_ATTACK]: 3064,
  },
  90: {
    [StatType.BASE_HP]: 458582,
    [StatType.BASE_ATTACK]: 3510,
  },
};

export class TunnelingNidwyrmEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.TUNNELING_NIDWYRM,
      name: "Tunneling Nidwyrm",
      tier: EnemyTierType.ADVANCED,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.NATURE,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.NATURE_RESISTANCE]: 0.7,
        [StatType.STAGGER_HP]: 160,
        [StatType.STAGGER_RECOVERY]: 7,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [StatType.FINISHER_SP_GAIN]: 35,
        [StatType.ATTACK_RANGE]: 12,
        [StatType.WEIGHT]: 2,
      },
      ...params,
    });
  }
}
