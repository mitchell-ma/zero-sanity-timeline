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
    [EnemyStatType.HP]: 4430,
    [EnemyStatType.ATK]: 78,
  },
  20: {
    [EnemyStatType.HP]: 31794,
    [EnemyStatType.ATK]: 369,
  },
  40: {
    [EnemyStatType.HP]: 201179,
    [EnemyStatType.ATK]: 1148,
  },
  60: {
    [EnemyStatType.HP]: 792012,
    [EnemyStatType.ATK]: 2850,
  },
  80: {
    [EnemyStatType.HP]: 1905141,
    [EnemyStatType.ATK]: 4289,
  },
  90: {
    [EnemyStatType.HP]: 2934923,
    [EnemyStatType.ATK]: 4914,
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
        [EnemyStatType.STAGGER_HP]: 320,
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
