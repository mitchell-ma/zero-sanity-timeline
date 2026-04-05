import {
  ElementType,
  EventOriginType,
  EventType,
  StackInteractionType,
  StatusType,
} from "../../consts/enums";
import { THRESHOLD_MAX, PotentialType } from "../../dsl/semantics";
import type { Clause, DslTarget, Effect, Interaction } from "../../dsl/semantics";
import { StatType } from "../enums";
import { Duration, Event } from "./event";

// ── Spec Sub-Types ────────────────────────────────────────────────────────────

/** A trigger condition that causes a status to be created. */
export interface TriggerCondition {
  source: { target: DslTarget };
  action: {
    interactionType: Interaction;
    combatSkillType?: string;
    statusType?: StatusType;
    threshold?: number;
  };
}

/** Defines how a status can be externally modified. */
export interface StatusInteractionEntry {
  type: 'CONSUMABLE' | 'RESETTABLE' | 'ABSORBABLE';
  condition: TriggerCondition;
  stacks?: number;
}

/** A stat modifier applied by a status. */
export interface StatModifier {
  statType: StatType | string;
  value: number[];
}

// Re-export THRESHOLD_MAX from semantics for backward compat
export { THRESHOLD_MAX } from "../../dsl/semantics";

/** Threshold key: a numeric stack count, or 'MAX' to fire at the potential-resolved max. */
export type ThresholdKey = number | typeof THRESHOLD_MAX;

/** Stacking behavior configuration. */
export interface Stacks {
  interactionType: StackInteractionType;
  /** Maximum stack count, keyed by PotentialType. */
  limit: Record<PotentialType, number>;
  /** Effects applied when stack count reaches a threshold.
   *  Key is the stack count (or 'MAX' for the potential-resolved max).
   *  Values are Effect[] applied unconditionally at that threshold. */
  thresholdEffects: Partial<Record<ThresholdKey, Effect[]>>;
}

/**
 * Resolves the max stack count for a given potential level.
 */
export function resolveMaxStacks(limit: Record<PotentialType, number>, potential: PotentialType): number {
  return limit[potential];
}

// ── Abstract StatusEvent ──────────────────────────────────────────────────────

/**
 * Abstract base for status events on the timeline — represents any status effect,
 * buff, debuff, infliction, or reaction. Concrete subclasses provide type-specific
 * configuration.
 *
 * See src/model/eventSpec.md for the full specification.
 */
export abstract class StatusEvent extends Event implements Stacks {
  readonly statusType: StatusType;
  readonly element: ElementType;
  readonly isForced: boolean;

  /** Stacking interaction type. */
  readonly interactionType: StackInteractionType;
  /** Maximum stack count, keyed by PotentialType. */
  readonly limit: Record<PotentialType, number>;
  /** Effects applied when stack count reaches a threshold. */
  readonly thresholdEffects: Partial<Record<ThresholdKey, Effect[]>>;

  /** Trigger clause — predicates that determine when this status is created. */
  readonly onTriggerClause: Clause;

  /** How this status can be externally modified (consumed, reset, absorbed). */
  readonly interactionTypes: StatusInteractionEntry[];

  /** Stat modifiers applied for the duration of this status. */
  readonly stats: StatModifier[];

  stacks: number;

  constructor(params: {
    statusType: StatusType;
    eventOrigin: EventOriginType;
    name: string;
    target: DslTarget;
    sourceOperator: string;
    element: ElementType;
    duration: Duration;
    isForced?: boolean;
    stacks?: {
      interactionType?: StackInteractionType;
      limit: number | number[] | Record<PotentialType, number>;
      thresholdEffects?: Partial<Record<ThresholdKey, Effect[]>>;
    };
    onTriggerClause?: Clause;
    interactionTypes?: StatusInteractionEntry[];
    stats?: StatModifier[];
    count?: number;
  }) {
    super({
      eventType: EventType.STATUS,
      eventOrigin: params.eventOrigin,
      name: params.name,
      target: params.target,
      sourceOperator: params.sourceOperator,
      duration: params.duration,
    });
    this.statusType = params.statusType;
    this.element = params.element;
    this.isForced = params.isForced ?? false;

    const rawLimit = params.stacks?.limit ?? 1;
    let limitRecord: Record<PotentialType, number>;
    if (typeof rawLimit === 'number') {
      limitRecord = Object.fromEntries(
        Object.values(PotentialType).map((p) => [p, rawLimit])
      ) as Record<PotentialType, number>;
    } else if (Array.isArray(rawLimit)) {
      const potentials = Object.values(PotentialType);
      limitRecord = Object.fromEntries(
        potentials.map((p, i) => [p, rawLimit[Math.min(i, rawLimit.length - 1)]])
      ) as Record<PotentialType, number>;
    } else {
      limitRecord = rawLimit;
    }

    this.interactionType = params.stacks?.interactionType ?? StackInteractionType.NONE;
    this.limit = limitRecord;
    this.thresholdEffects = params.stacks?.thresholdEffects ?? {};

    this.onTriggerClause = params.onTriggerClause ?? [];
    this.interactionTypes = params.interactionTypes ?? [];
    this.stats = params.stats ?? [];
    this.stacks = params.count ?? 0;

    const highestLimit = Math.max(...Object.values(this.limit));
    if (this.stacks > highestLimit && highestLimit > 0) {
      throw new RangeError(
        `stacks (${this.stacks}) cannot exceed limit (${highestLimit})`,
      );
    }
  }
}
