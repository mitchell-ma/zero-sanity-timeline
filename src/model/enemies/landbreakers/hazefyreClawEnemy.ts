import {
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
    [EnemyStatType.HP]: 249,
    [EnemyStatType.ATK]: 36,
  },
  20: {
    [EnemyStatType.HP]: 1788,
    [EnemyStatType.ATK]: 171,
  },
  40: {
    [EnemyStatType.HP]: 11316,
    [EnemyStatType.ATK]: 531,
  },
  60: {
    [EnemyStatType.HP]: 44551,
    [EnemyStatType.ATK]: 1317,
  },
  80: {
    [EnemyStatType.HP]: 107164,
    [EnemyStatType.ATK]: 1982,
  },
  90: {
    [EnemyStatType.HP]: 165089,
    [EnemyStatType.ATK]: 2271,
  },
};

export class HazefyreClawEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HAZEFYRE_CLAW,
      name: "Hazefyre Claw",
      tier: EnemyTierType.COMMON,
      race: RaceType.LANDBREAKERS,
      location: EnemyLocationType.GROUND,
      attackElement: null,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.PHYSICAL_RESISTANCE]: 0.8,
        [EnemyStatType.HEAT_RESISTANCE]: 0.8,
        [EnemyStatType.ELECTRIC_RESISTANCE]: 0.8,
        [EnemyStatType.CRYO_RESISTANCE]: 0.8,
        [EnemyStatType.NATURE_RESISTANCE]: 0.8,
        [EnemyStatType.STAGGER_HP]: 100,
        [EnemyStatType.ATTACK_RANGE]: 2.3,
      },
      ...params,
    });
  }
}
