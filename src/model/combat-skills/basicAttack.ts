import { BasicAttackType, ElementType, OperatorType } from "../enums";
import { Potential, SkillLevel } from "../operators/baseOperator";
import { Skills } from "./skill";

export abstract class BasicAttack extends Skills {
  readonly basicAttackType: BasicAttackType;

  constructor(params: {
    operatorType: OperatorType;
    elementType: ElementType;
    basicAttackType: BasicAttackType;
    level?: SkillLevel;
    operatorPotential?: Potential;
  }) {
    super({
      operatorType: params.operatorType,
      elementType: params.elementType,
      level: params.level,
      operatorPotential: params.operatorPotential,
    });
    this.basicAttackType = params.basicAttackType;
  }

  abstract getBasicAttackSequenceMultiplier(
    sequence: BasicAttackType,
    level: SkillLevel,
    operatorPotential: Potential,
  ): number;

  abstract getFinisherAttackMultiplier(
    level: SkillLevel,
    operatorPotential: Potential,
  ): number;

  abstract getDiveAttackMultiplier(
    level: SkillLevel,
    operatorPotential: Potential,
  ): number;
}
