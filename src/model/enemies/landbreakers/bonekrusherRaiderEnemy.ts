import {
  ElementType,
  EnemyLocationType,
  EnemyStatType,
  EnemyTierType,
  EnemyType,
  RaceType,
} from "../../../consts/enums";
import { Enemy } from "../enemy";

const STATS_BY_LEVEL: Readonly<
  Record<number, Partial<Record<EnemyStatType, number>>>
> = {
  1: {
    [EnemyStatType.HP]: 194,
    [EnemyStatType.ATK]: 36,
  },
  20: {
    [EnemyStatType.HP]: 1391,
    [EnemyStatType.ATK]: 171,
  },
  40: {
    [EnemyStatType.HP]: 8802,
    [EnemyStatType.ATK]: 531,
  },
  60: {
    [EnemyStatType.HP]: 34651,
    [EnemyStatType.ATK]: 1317,
  },
  80: {
    [EnemyStatType.HP]: 83350,
    [EnemyStatType.ATK]: 1982,
  },
  90: {
    [EnemyStatType.HP]: 128403,
    [EnemyStatType.ATK]: 2271,
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
        [EnemyStatType.STAGGER_HP]: 80,
        [EnemyStatType.ATTACK_RANGE]: 2.3,
      },
      ...params,
    });
  }
}
