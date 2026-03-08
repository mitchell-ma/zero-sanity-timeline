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
    [EnemyStatType.HP]: 1800,
    [EnemyStatType.ATK]: 72,
  },
  20: {
    [EnemyStatType.HP]: 12916,
    [EnemyStatType.ATK]: 341,
  },
  40: {
    [EnemyStatType.HP]: 81729,
    [EnemyStatType.ATK]: 1061,
  },
  60: {
    [EnemyStatType.HP]: 321755,
    [EnemyStatType.ATK]: 2635,
  },
  80: {
    [EnemyStatType.HP]: 773964,
    [EnemyStatType.ATK]: 3965,
  },
  90: {
    [EnemyStatType.HP]: 1192313,
    [EnemyStatType.ATK]: 4543,
  },
};

export class HazefyreAxeArmorbeastEnemy extends Enemy {
  constructor(params: { level: number }) {
    super({
      enemyType: EnemyType.HAZEFYRE_AXE_ARMORBEAST,
      name: "Hazefyre Axe Armorbeast",
      tier: EnemyTierType.ELITE,
      race: RaceType.WILDLIFE,
      location: EnemyLocationType.GROUND,
      attackElement: ElementType.PHYSICAL,
      statsByLevel: STATS_BY_LEVEL,
      baseStats: {
        [EnemyStatType.STAGGER_HP]: 320,
        [EnemyStatType.STAGGER_RECOVERY]: 9,
        [EnemyStatType.FINISHER_ATK_MULTIPLIER]: 1.5,
        [EnemyStatType.FINISHER_SP_GAIN]: 50,
        [EnemyStatType.ATTACK_RANGE]: 7,
        [EnemyStatType.WEIGHT]: 2,
      },
      ...params,
    });
  }
}
