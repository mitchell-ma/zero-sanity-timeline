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
    [EnemyStatType.HP]: 692,
    [EnemyStatType.ATK]: 56,
  },
  20: {
    [EnemyStatType.HP]: 4968,
    [EnemyStatType.ATK]: 264,
  },
  40: {
    [EnemyStatType.HP]: 31434,
    [EnemyStatType.ATK]: 820,
  },
  60: {
    [EnemyStatType.HP]: 123752,
    [EnemyStatType.ATK]: 2036,
  },
  80: {
    [EnemyStatType.HP]: 297678,
    [EnemyStatType.ATK]: 3064,
  },
  90: {
    [EnemyStatType.HP]: 458582,
    [EnemyStatType.ATK]: 3510,
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
        [EnemyStatType.NATURE_RESISTANCE]: 0.7,
        [EnemyStatType.STAGGER_HP]: 160,
        [EnemyStatType.STAGGER_RECOVERY]: 7,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [EnemyStatType.FINISHER_SP_GAIN]: 35,
        [EnemyStatType.ATTACK_RANGE]: 12,
        [EnemyStatType.WEIGHT]: 2,
      },
      ...params,
    });
  }
}
