import { TimeInteractionType } from "../../consts/enums";
import { NounType } from "../../dsl/semantics";
import type { DslTarget } from "../../dsl/semantics";
import { CombatSkillEvent } from "./combatSkillEvent";

export class UltimateEvent extends CombatSkillEvent {
  /** Duration of the animation phase in seconds. */
  animationDuration: number;

  /** What interaction applies during the animation time. */
  animationTimeInteraction: TimeInteractionType;

  constructor(params: {
    name: string;
    target: DslTarget;
    sourceOperator: string;
    duration: number;
    cooldownSeconds: number;
    animationDuration: number;
    animationTimeInteraction: TimeInteractionType;
  }) {
    super({
      combatSkillType: NounType.ULTIMATE,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      cooldownSeconds: params.cooldownSeconds,
    });
    this.animationDuration = params.animationDuration;
    this.animationTimeInteraction = params.animationTimeInteraction;
  }
}
