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
    [EnemyStatType.HP]: 235,
    [EnemyStatType.ATK]: 59,
  },
  20: {
    [EnemyStatType.HP]: 1689,
    [EnemyStatType.ATK]: 279,
  },
  40: {
    [EnemyStatType.HP]: 10688,
    [EnemyStatType.ATK]: 868,
  },
  60: {
    [EnemyStatType.HP]: 42076,
    [EnemyStatType.ATK]: 2156,
  },
  80: {
    [EnemyStatType.HP]: 101211,
    [EnemyStatType.ATK]: 3244,
  },
  90: {
    [EnemyStatType.HP]: 155918,
    [EnemyStatType.ATK]: 3717,
  },
};

export class MarbleAppendageEnemy extends BossEnemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.MARBLE_APPENDAGE,
      name: "Marble Appendage",
      tier: EnemyTierType.BOSS,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.STAGGER_HP]: 0,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [EnemyStatType.FINISHER_SP_GAIN]: 100,
        [EnemyStatType.ATTACK_RANGE]: 12,
        [EnemyStatType.WEIGHT]: 2,
      },
      staggerNodes: 0,
      staggerNodeRecoverySeconds: 0,
      ...params,
    });
  }
}
