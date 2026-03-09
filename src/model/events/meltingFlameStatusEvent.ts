import { ElementType, OperatorType, TargetType } from "../../consts/enums";
import { StatusEvent } from "./statusEvent";

export class MeltingFlameStatusEvent extends StatusEvent {
  static readonly MAX_STACKS = 4;

  readonly element: ElementType;

  constructor(params: {
    sourceOperator: OperatorType;
    duration: number;
    stacks?: number;
    element?: ElementType;
  }) {
    super({
      name: "Melting Flame",
      target: TargetType.SELF,
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      maxStacks: MeltingFlameStatusEvent.MAX_STACKS,
      stacks: params.stacks,
    });
    this.element = params.element ?? ElementType.HEAT;
  }
}
