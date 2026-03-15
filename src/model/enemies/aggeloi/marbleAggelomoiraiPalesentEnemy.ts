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
    [StatType.BASE_HP]: 4430,
    [StatType.BASE_ATTACK]: 78,
  },
  20: {
    [StatType.BASE_HP]: 31794,
    [StatType.BASE_ATTACK]: 369,
  },
  40: {
    [StatType.BASE_HP]: 201179,
    [StatType.BASE_ATTACK]: 1148,
  },
  60: {
    [StatType.BASE_HP]: 792012,
    [StatType.BASE_ATTACK]: 2850,
  },
  80: {
    [StatType.BASE_HP]: 1905141,
    [StatType.BASE_ATTACK]: 4289,
  },
  90: {
    [StatType.BASE_HP]: 2934923,
    [StatType.BASE_ATTACK]: 4914,
  },
};

export class MarbleAggelomoiraiPalesentEnemy extends BossEnemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.MARBLE_AGGELOMOIRAI_PALESENT,
      name: "Marble Aggelomoirai (Palesent)",
      tier: EnemyTierType.BOSS,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 320,
        [StatType.STAGGER_RECOVERY]: 11,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.75,
        [StatType.FINISHER_SP_GAIN]: 100,
        [StatType.ATTACK_RANGE]: 12,
        [StatType.WEIGHT]: 2,
      },
      staggerNodes: 4,
      staggerNodeRecoverySeconds: 11,
      ...params,
    });
  }
}
