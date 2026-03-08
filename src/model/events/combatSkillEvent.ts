import { CombatSkillType, EventType, OperatorType, TargetType } from "../../consts/enums";
import { Event } from "./event";

export abstract class CombatSkillEvent extends Event {
  readonly combatSkillType: CombatSkillType;

  /** Cooldown duration in seconds. */
  cooldownSeconds: number;

  constructor(params: {
    combatSkillType: CombatSkillType;
    name: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: number;
    cooldownSeconds: number;
  }) {
    super({
      eventType: EventType.COMBAT_SKILL,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: params.duration,
    });
    this.combatSkillType = params.combatSkillType;
    this.cooldownSeconds = params.cooldownSeconds;
  }
}
