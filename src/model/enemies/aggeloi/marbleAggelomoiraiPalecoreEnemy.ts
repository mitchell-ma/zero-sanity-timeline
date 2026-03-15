import {
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
    [StatType.BASE_HP]: 2077,
    [StatType.BASE_ATTACK]: 33,
  },
  20: {
    [StatType.BASE_HP]: 14903,
    [StatType.BASE_ATTACK]: 155,
  },
  40: {
    [StatType.BASE_HP]: 94303,
    [StatType.BASE_ATTACK]: 482,
  },
  60: {
    [StatType.BASE_HP]: 371256,
    [StatType.BASE_ATTACK]: 1198,
  },
  80: {
    [StatType.BASE_HP]: 893035,
    [StatType.BASE_ATTACK]: 1802,
  },
  90: {
    [StatType.BASE_HP]: 1375745,
    [StatType.BASE_ATTACK]: 2065,
  },
};

export class MarbleAggelomoiraiPalecoreEnemy extends BossEnemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.MARBLE_AGGELOMOIRAI_PALECORE,
      name: "Marble Aggelomoirai (Palecore)",
      tier: EnemyTierType.BOSS,
      race: RaceType.AGGELOI,
      location: EnemyLocationType.GROUND,
      attackElement: null,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 200,
        [StatType.STAGGER_RECOVERY]: 24,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.75,
        [StatType.FINISHER_SP_GAIN]: 100,
        [StatType.ATTACK_RANGE]: 12,
        [StatType.WEIGHT]: 2,
      },
      staggerNodes: 4,
      staggerNodeRecoverySeconds: 24,
      ...params,
    });
  }
}
