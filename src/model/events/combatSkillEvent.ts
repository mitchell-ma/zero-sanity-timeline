import { CombatSkillType, DurationUnit, EventOriginType, EventType, OperatorType, TargetType } from "../../consts/enums";
import type { Clause } from "../../consts/semantics";
import { Event } from "./event";

export abstract class CombatSkillEvent extends Event {
  readonly combatSkillType: CombatSkillType;

  /** Cooldown duration in seconds. */
  cooldownSeconds: number;

  constructor(params: {
    combatSkillType: CombatSkillType;
    eventOrigin?: EventOriginType;
    name?: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: number;
    cooldownSeconds: number;
    clause?: Clause;
  }) {
    super({
      eventType: EventType.COMBAT_SKILL,
      eventOrigin: params.eventOrigin ?? EventOriginType.OPERATOR,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: { value: params.duration, unit: DurationUnit.SECOND },
      clause: params.clause,
    });
    this.combatSkillType = params.combatSkillType;
    this.cooldownSeconds = params.cooldownSeconds;
  }
}
