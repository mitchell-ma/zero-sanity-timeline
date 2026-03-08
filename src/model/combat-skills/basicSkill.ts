import { ElementType, OperatorType } from "../../consts/enums";
import { Potential, SkillLevel } from "../../consts/types";
import { Skills } from "./skill";

export abstract class BasicSkill extends Skills {
  constructor(params: {
    operatorType: OperatorType;
    elementType: ElementType;
    level?: SkillLevel;
    operatorPotential?: Potential;
  }) {
    super(params);
  }
}
