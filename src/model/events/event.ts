import { UnitType, EventOriginType, EventType } from "../../consts/enums";
import type { Clause, DslTarget } from "../../dsl/semantics";

/** Duration with explicit unit. */
export interface Duration {
  value: number;
  unit: UnitType;
}

export abstract class Event {
  readonly eventType: EventType;
  readonly eventOrigin: EventOriginType;
  readonly name: string;
  readonly target: DslTarget;
  readonly sourceOperator: string;
  duration: Duration;
  /** Maximum number of times this event can occur. Undefined means unlimited. */
  readonly maxOccurrences?: number;
  /**
   * Clause: list of predicates, each evaluated independently.
   * Every predicate whose conditions pass has its effects applied.
   * Empty means no preconditions.
   */
  readonly clause: Clause;

  constructor(params: {
    eventType: EventType;
    eventOrigin: EventOriginType;
    name?: string;
    target: DslTarget;
    sourceOperator: string;
    duration: Duration;
    maxOccurrences?: number;
    clause?: Clause;
  }) {
    this.eventType = params.eventType;
    this.eventOrigin = params.eventOrigin;
    this.name = params.name ?? "";
    this.target = params.target;
    this.sourceOperator = params.sourceOperator;
    this.duration = params.duration;
    this.maxOccurrences = params.maxOccurrences;
    this.clause = params.clause ?? [];
  }
}
