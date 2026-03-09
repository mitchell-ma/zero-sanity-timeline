import { ElementType, OperatorType, StatusType } from "../../consts/enums";
import { ArtsReactionStatusEvent } from "./artsReactionStatusEvent";

export class CombustionStatusEvent extends ArtsReactionStatusEvent {
  static readonly DURATION_SECONDS = 10;
  static readonly MAX_STACKS = 1;

  constructor(params: {
    sourceOperator: OperatorType;
    duration: number;
    stacks?: number;
  }) {
    super({
      statusType: StatusType.COMBUSTION,
      element: ElementType.HEAT,
      name: "Combustion",
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      maxStacks: CombustionStatusEvent.MAX_STACKS,
      stacks: params.stacks,
    });
  }
}
