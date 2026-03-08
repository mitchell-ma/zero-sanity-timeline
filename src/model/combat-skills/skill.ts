import { ElementType, OperatorType } from "../enums";
import { Potential, SkillLevel } from "../operators/baseOperator";

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
}
