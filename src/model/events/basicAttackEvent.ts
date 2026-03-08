import {
  BasicAttackType,
  CombatSkillType,
  OperatorType,
  TargetType,
} from "../enums";
import { CombatSkillEvent } from "./combatSkillEvent";

export class BasicAttackEvent extends CombatSkillEvent {
  readonly basicAttackType: BasicAttackType;

  constructor(params: {
    basicAttackType: BasicAttackType;
    name: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: number;
    cooldownSeconds: number;
  }) {
    super({
      combatSkillType: CombatSkillType.BASIC_ATTACK,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      cooldownSeconds: params.cooldownSeconds,
    });
    this.basicAttackType = params.basicAttackType;
  }
}
