import { ElementType, OperatorType } from "../../consts/enums";
import { Potential, SkillLevel } from "../../consts/types";
import { Skills } from "./skill";

export abstract class Ultimate extends Skills {
  ultimateEnergyCost: number;

  /** Duration in frames. */
  duration: number;

  constructor(params: {
    operatorType: OperatorType;
    elementType: ElementType;
    level?: SkillLevel;
    operatorPotential?: Potential;
    ultimateEnergyCost: number;
    duration: number;
  }) {
    super({
      operatorType: params.operatorType,
      elementType: params.elementType,
      level: params.level,
      operatorPotential: params.operatorPotential,
    });
    this.ultimateEnergyCost = params.ultimateEnergyCost;
    this.duration = params.duration;
  }

  abstract getUltimateEnergyCost(
    level: SkillLevel,
    operatorPotential: Potential,
  ): number;

  abstract getDuration(level: SkillLevel, operatorPotential: Potential): number;
}
