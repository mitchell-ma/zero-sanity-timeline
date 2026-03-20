import { CombatSkillType, OperatorType, TargetType, TimeInteractionType } from "../../consts/enums";
import { EmpowerSkillTarget } from "../../consts/types";
import { CombatSkillEvent } from "./combatSkillEvent";

export class UltimateEvent extends CombatSkillEvent {
  /** Duration of the animation phase in seconds. */
  animationDuration: number;

  /** What interaction applies during the animation time. */
  animationTimeInteraction: TimeInteractionType;

  /** The skill type that this ultimate empowers (if any). */
  empowerSkillTarget: EmpowerSkillTarget | null;

  constructor(params: {
    name: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: number;
    cooldownSeconds: number;
    animationDuration: number;
    animationTimeInteraction: TimeInteractionType;
    empowerSkillTarget?: EmpowerSkillTarget;
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
    this.animationTimeInteraction = params.animationTimeInteraction;
    this.empowerSkillTarget = params.empowerSkillTarget ?? null;
  }
}
