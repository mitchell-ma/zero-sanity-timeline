import { EventType, OperatorType, TargetType } from "../../consts/enums";
import { Event } from "./event";

export abstract class StatusEvent extends Event {
  readonly maxStacks: number;
  stacks: number;

  constructor(params: {
    name: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: number;
    maxStacks: number;
    stacks?: number;
  }) {
    super({
      eventType: EventType.STATUS,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: params.duration,
    });
    this.maxStacks = params.maxStacks;
    this.stacks = params.stacks ?? 0;

    if (this.stacks > this.maxStacks) {
      throw new RangeError(
        `stacks (${this.stacks}) cannot exceed maxStacks (${this.maxStacks})`,
      );
    }
  }
}
