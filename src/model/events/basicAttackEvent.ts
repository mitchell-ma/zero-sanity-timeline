import {
  BasicAttackType,
  CombatSkillType,
} from "../../consts/enums";
import type { DslTarget } from "../../dsl/semantics";
import { CombatSkillEvent } from "./combatSkillEvent";

export class BasicAttackEvent extends CombatSkillEvent {
  readonly basicAttackType: BasicAttackType;

  constructor(params: {
    basicAttackType: BasicAttackType;
    name: string;
    target: DslTarget;
    sourceOperator: string;
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
