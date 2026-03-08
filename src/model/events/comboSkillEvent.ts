import {
  CombatSkillType,
  OperatorType,
  TargetType,
  TriggerConditionType,
} from "../enums";
import { CombatSkillEvent } from "./combatSkillEvent";

export class ComboSkillEvent extends CombatSkillEvent {
  readonly triggerConditions: Set<TriggerConditionType>;

  constructor(params: {
    name: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: number;
    cooldownSeconds: number;
    triggerConditions: Set<TriggerConditionType>;
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
