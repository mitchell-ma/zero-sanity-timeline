import {
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
    [EnemyStatType.HP]: 2077,
    [EnemyStatType.ATK]: 33,
  },
  20: {
    [EnemyStatType.HP]: 14903,
    [EnemyStatType.ATK]: 155,
  },
  40: {
    [EnemyStatType.HP]: 94303,
    [EnemyStatType.ATK]: 482,
  },
  60: {
    [EnemyStatType.HP]: 371256,
    [EnemyStatType.ATK]: 1198,
  },
  80: {
    [EnemyStatType.HP]: 893035,
    [EnemyStatType.ATK]: 1802,
  },
  90: {
    [EnemyStatType.HP]: 1375745,
    [EnemyStatType.ATK]: 2065,
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
        [EnemyStatType.STAGGER_HP]: 200,
        [EnemyStatType.STAGGER_RECOVERY]: 24,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.75,
        [EnemyStatType.FINISHER_SP_GAIN]: 100,
        [EnemyStatType.ATTACK_RANGE]: 12,
        [EnemyStatType.WEIGHT]: 2,
      },
      staggerNodes: 4,
      staggerNodeRecoverySeconds: 24,
      ...params,
    });
  }
}
