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
    [StatType.BASE_HP]: 3461,
    [StatType.BASE_ATTACK]: 66,
  },
  20: {
    [StatType.BASE_HP]: 24839,
    [StatType.BASE_ATTACK]: 310,
  },
  40: {
    [StatType.BASE_HP]: 157171,
    [StatType.BASE_ATTACK]: 965,
  },
  60: {
    [StatType.BASE_HP]: 618759,
    [StatType.BASE_ATTACK]: 2395,
  },
  80: {
    [StatType.BASE_HP]: 1488392,
    [StatType.BASE_ATTACK]: 3604,
  },
  90: {
    [StatType.BASE_HP]: 2292909,
    [StatType.BASE_ATTACK]: 4130,
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
        [StatType.STAGGER_HP]: 280,
        [StatType.STAGGER_RECOVERY]: 10,
        [StatType.FINISHER_ATK_MULTIPLIER]: 1.75,
        [StatType.FINISHER_SP_GAIN]: 100,
        [StatType.ATTACK_RANGE]: 12,
        [StatType.WEIGHT]: 2,
      },
      staggerNodes: 1,
      staggerNodeRecoverySeconds: 3.5,
      ...params,
    });
  }
}
