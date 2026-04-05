import {
} from "../../consts/enums";
import { NounType } from "../../dsl/semantics";
import type { DslTarget } from "../../dsl/semantics";
import type { Interaction } from "../../dsl/semantics";
import { CombatSkillEvent } from "./combatSkillEvent";

export class ComboSkillEvent extends CombatSkillEvent {
  readonly triggerConditions: Set<Interaction>;

  constructor(params: {
    name: string;
    target: DslTarget;
    sourceOperator: string;
    duration: number;
    cooldownSeconds: number;
    triggerConditions: Set<Interaction>;
  }) {
    super({
      combatSkillType: NounType.COMBO,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      cooldownSeconds: params.cooldownSeconds,
    });
    this.triggerConditions = params.triggerConditions;
  }
}
