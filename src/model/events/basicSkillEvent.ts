import { CombatSkillType } from "../../consts/enums";
import type { DslTarget } from "../../dsl/semantics";
import { CombatSkillEvent } from "./combatSkillEvent";

export class BasicSkillEvent extends CombatSkillEvent {
  skillPointCost: number;

  constructor(params: {
    name: string;
    target: DslTarget;
    sourceOperator: string;
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
