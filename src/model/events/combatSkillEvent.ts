import { UnitType, EventOriginType, EventType } from "../../consts/enums";
import type { Clause, DslTarget } from "../../dsl/semantics";
import { Event } from "./event";

export abstract class CombatSkillEvent extends Event {
  readonly combatSkillType: string;

  /** Cooldown duration in seconds. */
  cooldownSeconds: number;

  constructor(params: {
    combatSkillType: string;
    eventOrigin?: EventOriginType;
    name?: string;
    target: DslTarget;
    sourceOperator: string;
    duration: number;
    cooldownSeconds: number;
    clause?: Clause;
  }) {
    super({
      eventType: EventType.SKILL,
      eventOrigin: params.eventOrigin ?? EventOriginType.OPERATOR,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: { value: params.duration, unit: UnitType.SECOND },
      clause: params.clause,
    });
    this.combatSkillType = params.combatSkillType;
    this.cooldownSeconds = params.cooldownSeconds;
  }
}
