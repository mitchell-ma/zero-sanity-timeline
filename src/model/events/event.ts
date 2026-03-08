import { EventType, OperatorType, TargetType } from "../../consts/enums";

export abstract class Event {
  readonly eventType: EventType;
  readonly name: string;
  readonly target: TargetType;
  readonly sourceOperator: OperatorType;

  /** Duration in frames. */
  duration: number;

  constructor(params: {
    eventType: EventType;
    name: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: number;
  }) {
    this.eventType = params.eventType;
    this.name = params.name;
    this.target = params.target;
    this.sourceOperator = params.sourceOperator;
    this.duration = params.duration;
  }
}
