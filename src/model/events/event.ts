import { DurationUnit, EventOriginType, EventType, OperatorType, TargetType } from "../../consts/enums";

/** Duration with explicit unit. */
export interface Duration {
  value: number;
  unit: DurationUnit;
}

export abstract class Event {
  readonly eventType: EventType;
  readonly eventOrigin: EventOriginType;
  readonly name: string;
  readonly target: TargetType;
  readonly sourceOperator: OperatorType;
  duration: Duration;

  constructor(params: {
    eventType: EventType;
    eventOrigin: EventOriginType;
    name?: string;
    target: TargetType;
    sourceOperator: OperatorType;
    duration: Duration;
  }) {
    this.eventType = params.eventType;
    this.eventOrigin = params.eventOrigin;
    this.name = params.name ?? "";
    this.target = params.target;
    this.sourceOperator = params.sourceOperator;
    this.duration = params.duration;
  }
}
