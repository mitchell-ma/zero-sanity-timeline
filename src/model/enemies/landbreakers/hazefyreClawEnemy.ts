import {
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
    [StatType.BASE_HP]: 249,
    [StatType.BASE_ATTACK]: 36,
  },
  20: {
    [StatType.BASE_HP]: 1788,
    [StatType.BASE_ATTACK]: 171,
  },
  40: {
    [StatType.BASE_HP]: 11316,
    [StatType.BASE_ATTACK]: 531,
  },
  60: {
    [StatType.BASE_HP]: 44551,
    [StatType.BASE_ATTACK]: 1317,
  },
  80: {
    [StatType.BASE_HP]: 107164,
    [StatType.BASE_ATTACK]: 1982,
  },
  90: {
    [StatType.BASE_HP]: 165089,
    [StatType.BASE_ATTACK]: 2271,
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
        [StatType.PHYSICAL_RESISTANCE]: 0.8,
        [StatType.HEAT_RESISTANCE]: 0.8,
        [StatType.ELECTRIC_RESISTANCE]: 0.8,
        [StatType.CRYO_RESISTANCE]: 0.8,
        [StatType.NATURE_RESISTANCE]: 0.8,
        [StatType.STAGGER_HP]: 100,
        [StatType.ATTACK_RANGE]: 2.3,
      },
      ...params,
    });
  }
}
