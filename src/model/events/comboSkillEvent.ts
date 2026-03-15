import {
  CombatSkillType,
  OperatorType,
  TargetType,
} from "../../consts/enums";
import type { Interaction } from "../../consts/semantics";
import { CombatSkillEvent } from "./combatSkillEvent";

export class ComboSkillEvent extends CombatSkillEvent {
  readonly triggerConditions: Set<Interaction>;

  constructor(params: {
    name: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: number;
    cooldownSeconds: number;
    triggerConditions: Set<Interaction>;
  }) {
    super({
      combatSkillType: CombatSkillType.COMBO_SKILL,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      cooldownSeconds: params.cooldownSeconds,
    });
    this.triggerConditions = params.triggerConditions;
  }
}
