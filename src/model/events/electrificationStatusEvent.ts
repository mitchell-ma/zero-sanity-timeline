import { ElementType, OperatorType, StatusType } from "../../consts/enums";
import { ArtsReactionStatusEvent } from "./artsReactionStatusEvent";

export class ElectrificationStatusEvent extends ArtsReactionStatusEvent {
  static readonly MAX_STACKS = 1;

  constructor(params: {
    sourceOperator: OperatorType;
    duration: number;
    stacks?: number;
  }) {
    super({
      statusType: StatusType.ELECTRIFICATION,
      element: ElementType.ELECTRIC,
      name: "Electrification",
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      maxStacks: ElectrificationStatusEvent.MAX_STACKS,
      stacks: params.stacks,
    });
  }
}
