import { CombatSkillType, OperatorType, TargetType } from "../../consts/enums";
import { CombatSkillEvent } from "./combatSkillEvent";

export class BasicSkillEvent extends CombatSkillEvent {
  skillPointCost: number;

  constructor(params: {
    name: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: number;
    cooldownSeconds: number;
    skillPointCost?: number;
  }) {
    super({
      combatSkillType: CombatSkillType.BATTLE_SKILL,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      cooldownSeconds: params.cooldownSeconds,
    });
    this.skillPointCost = params.skillPointCost ?? 100;
  }
}
