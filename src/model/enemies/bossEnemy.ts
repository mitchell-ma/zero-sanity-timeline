import {
  ElementType,
  EnemyLocationType,
  EnemyStatType,
  EnemyTierType,
  EnemyType,
  RaceType,
} from "../../consts/enums";
import { Enemy, EnemyStatsByLevel } from "./enemy";

export abstract class BossEnemy extends Enemy {
  readonly staggerNodes: number;
  readonly staggerNodeRecoverySeconds: number;

  constructor(params: {
    enemyType: EnemyType;
    name: string;
    level: number;
    tier: EnemyTierType;
    race: RaceType;
    location: EnemyLocationType;
    attackElement: ElementType | null;
    statsByLevel: EnemyStatsByLevel;
    baseStats?: Partial<Record<EnemyStatType, number>>;
    staggerNodes: number;
    staggerNodeRecoverySeconds: number;
  }) {
    super(params);
    this.staggerNodes = params.staggerNodes;
    this.staggerNodeRecoverySeconds = params.staggerNodeRecoverySeconds;
  }
}
