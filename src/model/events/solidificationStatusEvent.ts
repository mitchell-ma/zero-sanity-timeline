import { ElementType, OperatorType, StatusType } from "../../consts/enums";
import { ArtsReactionStatusEvent } from "./artsReactionStatusEvent";

export class SolidificationStatusEvent extends ArtsReactionStatusEvent {
  static readonly MAX_STACKS = 1;

  constructor(params: {
    sourceOperator: OperatorType;
    duration: number;
    stacks?: number;
  }) {
    super({
      statusType: StatusType.SOLIDIFICATION,
      element: ElementType.CRYO,
      name: "Solidification",
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      maxStacks: SolidificationStatusEvent.MAX_STACKS,
      stacks: params.stacks,
    });
  }
}
