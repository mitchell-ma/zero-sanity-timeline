import {
  ElementType,
  EnemyLocationType,
  StatType,
  EnemyTierType,
  EnemyType,
  RaceType,
} from "../../../consts/enums";
import { BossEnemy } from "../bossEnemy";

const STATS_BY_LEVEL: Readonly<
  Record<number, Partial<Record<StatType, number>>>
> = {
  1: {
    [StatType.BASE_HP]: 235,
    [StatType.BASE_ATTACK]: 59,
  },
  20: {
    [StatType.BASE_HP]: 1689,
    [StatType.BASE_ATTACK]: 279,
  },
  40: {
    [StatType.BASE_HP]: 10688,
    [StatType.BASE_ATTACK]: 868,
  },
  60: {
    [StatType.BASE_HP]: 42076,
    [StatType.BASE_ATTACK]: 2156,
  },
  80: {
    [StatType.BASE_HP]: 101211,
    [StatType.BASE_ATTACK]: 3244,
  },
  90: {
    [StatType.BASE_HP]: 155918,
    [StatType.BASE_ATTACK]: 3717,
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
        [StatType.STAGGER_HP]: 0,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.25,
        [StatType.FINISHER_SP_GAIN]: 100,
        [StatType.ATTACK_RANGE]: 12,
        [StatType.WEIGHT]: 2,
      },
      staggerNodes: 0,
      staggerNodeRecoverySeconds: 0,
      ...params,
    });
  }
}
