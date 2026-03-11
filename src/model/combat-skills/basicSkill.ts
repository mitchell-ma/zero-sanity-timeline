import { ElementType, OperatorType, TriggerConditionType } from "../../consts/enums";
import { Potential, SkillLevel } from "../../consts/types";
import { Skills } from "./skill";

/** Default publishesTriggers for battle skills by element type. */
const ELEMENT_TRIGGERS: Partial<Record<ElementType, TriggerConditionType[]>> = {
  [ElementType.HEAT]:     [TriggerConditionType.COMBUSTION, TriggerConditionType.APPLY_HEAT_INFLICTION],
  [ElementType.CRYO]:     [TriggerConditionType.SOLIDIFICATION, TriggerConditionType.APPLY_CRYO_INFLICTION],
  [ElementType.NATURE]:   [TriggerConditionType.CORROSION, TriggerConditionType.APPLY_NATURE_INFLICTION],
  [ElementType.ELECTRIC]: [TriggerConditionType.ELECTRIFICATION, TriggerConditionType.APPLY_ELECTRIC_INFLICTION],
  [ElementType.PHYSICAL]: [TriggerConditionType.APPLY_PHYSICAL_STATUS, TriggerConditionType.APPLY_VULNERABILITY],
};

export abstract class BasicSkill extends Skills {
  constructor(params: {
    operatorType: OperatorType;
    elementType: ElementType;
    level?: SkillLevel;
    operatorPotential?: Potential;
  }) {
    super(params);
  }

  /** Battle skills publish element-based triggers by default. */
  get publishesTriggers(): TriggerConditionType[] {
    return ELEMENT_TRIGGERS[this.elementType] ?? [];
  }

  /** SP cost from the concrete subclass's static SP_COST. */
  get skillPointCost(): number {
    return (this.constructor as any).SP_COST ?? 100;
  }
}
