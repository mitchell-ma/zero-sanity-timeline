import { CombatSkillType, OperatorType, TargetType } from "../../consts/enums";
import { EmpowerSkillTarget } from "../../consts/types";
import { CombatSkillEvent } from "./combatSkillEvent";

export class UltimateEvent extends CombatSkillEvent {
  /** Duration of the ultimate's animation in frames. */
  animationDuration: number;

  /** The skill type that this ultimate empowers. */
  empowerSkillTarget: EmpowerSkillTarget;

  constructor(params: {
    name: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: number;
    cooldownSeconds: number;
    animationDuration: number;
    empowerSkillTarget: EmpowerSkillTarget;
  }) {
    super({
      combatSkillType: CombatSkillType.ULTIMATE,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      cooldownSeconds: params.cooldownSeconds,
    });
    this.animationDuration = params.animationDuration;
    this.empowerSkillTarget = params.empowerSkillTarget;
  }
}
