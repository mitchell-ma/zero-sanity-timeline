import { ElementType, OperatorType, StatusType } from "../../consts/enums";
import { ArtsReactionStatusEvent } from "./artsReactionStatusEvent";

export class CorrosionStatusEvent extends ArtsReactionStatusEvent {
  static readonly DURATION_SECONDS = 15;
  static readonly MAX_STACKS = 1;

  constructor(params: {
    sourceOperator: OperatorType;
    duration: number;
    stacks?: number;
  }) {
    super({
      statusType: StatusType.CORROSION,
      element: ElementType.NATURE,
      name: "Corrosion",
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      maxStacks: CorrosionStatusEvent.MAX_STACKS,
      stacks: params.stacks,
    });
  }
}
