import { ElementType, OperatorType } from "../enums";
import { Potential, SkillLevel } from "../operators/baseOperator";
import { Skills } from "./skill";

export abstract class ComboSkill extends Skills {
  constructor(params: {
    operatorType: OperatorType;
    elementType: ElementType;
    level?: SkillLevel;
    operatorPotential?: Potential;
  }) {
    super(params);
  }
}
