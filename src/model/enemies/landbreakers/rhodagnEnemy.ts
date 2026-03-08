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
    [EnemyStatType.HP]: 3461,
    [EnemyStatType.ATK]: 66,
  },
  20: {
    [EnemyStatType.HP]: 24839,
    [EnemyStatType.ATK]: 310,
  },
  40: {
    [EnemyStatType.HP]: 157171,
    [EnemyStatType.ATK]: 965,
  },
  60: {
    [EnemyStatType.HP]: 618759,
    [EnemyStatType.ATK]: 2395,
  },
  80: {
    [EnemyStatType.HP]: 1488392,
    [EnemyStatType.ATK]: 3604,
  },
  90: {
    [EnemyStatType.HP]: 2292909,
    [EnemyStatType.ATK]: 4130,
  },
};

export class RhodagnEnemy extends BossEnemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.RHODAGN_THE_BONEKRUSHING_FIST,
      name: "Rhodagn the Bonekrushing Fist",
      tier: EnemyTierType.BOSS,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.STAGGER_HP]: 280,
        [EnemyStatType.STAGGER_RECOVERY]: 10,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.75,
        [EnemyStatType.FINISHER_SP_GAIN]: 100,
        [EnemyStatType.ATTACK_RANGE]: 12,
        [EnemyStatType.WEIGHT]: 2,
      },
      staggerNodes: 4,
      staggerNodeRecoverySeconds: 10,
      ...params,
    });
  }
}
