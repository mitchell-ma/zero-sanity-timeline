import { CombatSkillType, OperatorType, TargetType, TimeInteractionType } from "../../consts/enums";
import { EmpowerSkillTarget } from "../../consts/types";
import { CombatSkillEvent } from "./combatSkillEvent";

export class UltimateEvent extends CombatSkillEvent {
  /** Duration of the ultimate's animation in seconds. Must be <= activationDuration. */
  animationDuration: number;

  /** Duration of the activation phase in seconds (animation plays within this window). */
  activationDuration: number;

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
    activationDuration: number;
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
    this.activationDuration = params.activationDuration;
    this.animationTimeInteraction = params.animationTimeInteraction;
    this.empowerSkillTarget = params.empowerSkillTarget ?? null;
  }
}
