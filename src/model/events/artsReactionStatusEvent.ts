import { ElementType, OperatorType, StatusType, TargetType } from "../../consts/enums";
import { StatusEvent } from "./statusEvent";

/**
 * Abstract base for arts-reaction status events applied to an enemy.
 * Each concrete subclass corresponds to one of the four arts reactions
 * (Combustion, Solidification, Corrosion, Electrification).
 */
export abstract class ArtsReactionStatusEvent extends StatusEvent {
  readonly statusType: StatusType;
  readonly element: ElementType;

  constructor(params: {
    statusType: StatusType;
    element: ElementType;
    name: string;
    sourceOperator: OperatorType;
    duration: number;
    maxStacks: number;
    stacks?: number;
  }) {
    super({
      name: params.name,
      target: TargetType.ENEMY,
      sourceOperator: params.sourceOperator,
      duration: params.duration,
      maxStacks: params.maxStacks,
      stacks: params.stacks,
    });
    this.statusType = params.statusType;
    this.element = params.element;
  }
}
