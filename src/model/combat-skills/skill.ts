import { ElementType, OperatorType, TriggerConditionType } from "../../consts/enums";
import { Potential, SkillLevel } from "../../consts/types";

export abstract class Skills {
  readonly operatorType: OperatorType;
  readonly elementType: ElementType;

  level: SkillLevel;
  operatorPotential: Potential;

  constructor(params: {
    operatorType: OperatorType;
    elementType: ElementType;
    level?: SkillLevel;
    operatorPotential?: Potential;
  }) {
    this.operatorType = params.operatorType;
    this.elementType = params.elementType;
    this.level = params.level ?? 12;
    this.operatorPotential = params.operatorPotential ?? 0;
  }

  /** Skill name from the concrete class's static SKILL_NAME. */
  get skillName(): string {
    return (this.constructor as any).SKILL_NAME ?? '';
  }

  /** Trigger conditions this skill publishes. Override in subclasses. */
  get publishesTriggers(): TriggerConditionType[] {
    return [];
  }
}
