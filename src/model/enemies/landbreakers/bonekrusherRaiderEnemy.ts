import {
  ElementType,
  EnemyLocationType,
  StatType,
  EnemyTierType,
  EnemyType,
  RaceType,
} from "../../../consts/enums";
import { Enemy } from "../enemy";

const STATS_BY_LEVEL: Readonly<
  Record<number, Partial<Record<StatType, number>>>
> = {
  1: {
    [StatType.BASE_HP]: 194,
    [StatType.BASE_ATTACK]: 36,
  },
  20: {
    [StatType.BASE_HP]: 1391,
    [StatType.BASE_ATTACK]: 171,
  },
  40: {
    [StatType.BASE_HP]: 8802,
    [StatType.BASE_ATTACK]: 531,
  },
  60: {
    [StatType.BASE_HP]: 34651,
    [StatType.BASE_ATTACK]: 1317,
  },
  80: {
    [StatType.BASE_HP]: 83350,
    [StatType.BASE_ATTACK]: 1982,
  },
  90: {
    [StatType.BASE_HP]: 128403,
    [StatType.BASE_ATTACK]: 2271,
  },
};

export class BonekrusherRaiderEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.BONEKRUSHER_RAIDER,
      name: "Bonekrusher Raider",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [StatType.STAGGER_HP]: 80,
        [StatType.ATTACK_RANGE]: 2.3,
      },
      ...params,
    });
  }
}
