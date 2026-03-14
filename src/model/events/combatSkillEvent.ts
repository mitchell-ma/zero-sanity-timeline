import { CombatSkillType, DurationUnit, EventOriginType, EventType, OperatorType, TargetType } from "../../consts/enums";
import { Duration, Event } from "./event";
import { ActivationCondition } from "./statusEvent";

export abstract class CombatSkillEvent extends Event {
  readonly combatSkillType: CombatSkillType;

  /** Cooldown duration in seconds. */
  cooldownSeconds: number;

  /** Activation conditions: OR of ANDs. Empty means no preconditions. */
  readonly activationConditions: ActivationCondition[][];

  constructor(params: {
    combatSkillType: CombatSkillType;
    eventOrigin?: EventOriginType;
    name?: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: number;
    cooldownSeconds: number;
    activationConditions?: ActivationCondition[][];
  }) {
    super({
      eventType: EventType.COMBAT_SKILL,
      eventOrigin: params.eventOrigin ?? EventOriginType.OPERATOR,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: { value: params.duration, unit: DurationUnit.SECOND },
    });
    this.combatSkillType = params.combatSkillType;
    this.cooldownSeconds = params.cooldownSeconds;
    this.activationConditions = params.activationConditions ?? [];
  }
}
