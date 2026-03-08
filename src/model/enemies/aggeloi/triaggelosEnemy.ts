import {
  ElementType,
  EnemyLocationType,
  EnemyStatType,
  EnemyTierType,
  EnemyType,
  RaceType,
} from "../../../consts/enums";
import { BossEnemy } from "../bossEnemy";

const STATS_BY_LEVEL: Readonly<
  Record<number, Partial<Record<EnemyStatType, number>>>
> = {
  1: {
    [EnemyStatType.HP]: 1385,
    [EnemyStatType.ATK]: 66,
  },
  20: {
    [EnemyStatType.HP]: 9936,
    [EnemyStatType.ATK]: 310,
  },
  40: {
    [EnemyStatType.HP]: 62869,
    [EnemyStatType.ATK]: 965,
  },
  60: {
    [EnemyStatType.HP]: 247504,
    [EnemyStatType.ATK]: 2395,
  },
  80: {
    [EnemyStatType.HP]: 595357,
    [EnemyStatType.ATK]: 3604,
  },
  90: {
    [EnemyStatType.HP]: 917164,
    [EnemyStatType.ATK]: 4130,
  },
};

export class TriaggelosEnemy extends BossEnemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.TRIAGGELOS,
      name: "Triaggelos",
      tier: EnemyTierType.BOSS,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 280,
        [EnemyStatType.STAGGER_RECOVERY]: 11,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.75,
        [EnemyStatType.FINISHER_SP_GAIN]: 100,
        [EnemyStatType.ATTACK_RANGE]: 12,
        [EnemyStatType.WEIGHT]: 2,
      },
      staggerNodes: 4,
      staggerNodeRecoverySeconds: 11,
      ...params,
    });
  }
}
