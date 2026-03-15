import {
  CombatSkillType,
  ElementType,
  EventOriginType,
  EventType,
  OperatorType,
  StackInteractionType,
  StatusType,
  TargetType,
} from "../../consts/enums";
import { THRESHOLD_MAX, PotentialType } from "../../consts/semantics";
import type { Clause, Effect, Interaction } from "../../consts/semantics";
import { StatType } from "../enums";
import { Duration, Event } from "./event";

// ── Spec Sub-Types ────────────────────────────────────────────────────────────

/** A trigger condition that causes a status to be created. */
export interface TriggerCondition {
  source: { targetType: TargetType };
  action: {
    interactionType: Interaction;
    combatSkillType?: CombatSkillType;
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
export { THRESHOLD_MAX } from "../../consts/semantics";

/** Threshold key: a numeric stack count, or 'MAX' to fire at the potential-resolved max. */
export type ThresholdKey = number | typeof THRESHOLD_MAX;

/** Full stack configuration for a status. */
export interface StackConfig {
  interactionType: StackInteractionType;
  /** Maximum stack count, keyed by PotentialType. */
  max: Record<PotentialType, number>;
  instances: number;
  /** Effects applied when stack count reaches a threshold.
   *  Key is the stack count (or 'MAX' for the potential-resolved max).
   *  Values are Effect[] applied unconditionally at that threshold. */
  thresholdEffects: Partial<Record<ThresholdKey, Effect[]>>;
}

/**
 * Resolves the max stack count for a given potential level.
 */
export function resolveMaxStacks(max: Record<PotentialType, number>, potential: PotentialType): number {
  return max[potential];
}

// ── Abstract StatusEvent ──────────────────────────────────────────────────────

/**
 * Abstract base for status events on the timeline — represents any status effect,
 * buff, debuff, infliction, or reaction. Concrete subclasses provide type-specific
 * configuration.
 *
 * See src/model/eventSpec.md for the full specification.
 */
export abstract class StatusEvent extends Event {
  readonly statusType: StatusType;
  readonly element: ElementType;
  readonly isNamedEvent: boolean;
  readonly isForceApplied: boolean;

  /** Full stack configuration. */
  readonly stack: StackConfig;

  /** Trigger clause — predicates that determine when this status is created. */
  readonly triggerClause: Clause;

  /** How this status can be externally modified (consumed, reset, absorbed). */
  readonly interactionTypes: StatusInteractionEntry[];

  /** Stat modifiers applied for the duration of this status. */
  readonly stats: StatModifier[];

  stacks: number;

  constructor(params: {
    statusType: StatusType;
    eventOrigin: EventOriginType;
    name: string;
    target: TargetType;
    sourceOperator: OperatorType;
    element: ElementType;
    duration: Duration;
    isNamedEvent?: boolean;
    isForceApplied?: boolean;
    stack?: {
      interactionType?: StackInteractionType;
      max: number | number[] | Record<PotentialType, number>;
      instances?: number;
      thresholdEffects?: Partial<Record<ThresholdKey, Effect[]>>;
    };
    triggerClause?: Clause;
    interactionTypes?: StatusInteractionEntry[];
    stats?: StatModifier[];
    stacks?: number;
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
    this.isNamedEvent = params.isNamedEvent ?? true;
    this.isForceApplied = params.isForceApplied ?? false;

    const rawMax = params.stack?.max ?? 1;
    let maxRecord: Record<PotentialType, number>;
    if (typeof rawMax === 'number') {
      // Single number → same for all potentials
      maxRecord = Object.fromEntries(
        Object.values(PotentialType).map((p) => [p, rawMax])
      ) as Record<PotentialType, number>;
    } else if (Array.isArray(rawMax)) {
      // Array → map positionally to P0-P5
      const potentials = Object.values(PotentialType);
      maxRecord = Object.fromEntries(
        potentials.map((p, i) => [p, rawMax[Math.min(i, rawMax.length - 1)]])
      ) as Record<PotentialType, number>;
    } else {
      maxRecord = rawMax;
    }

    this.stack = {
      interactionType: params.stack?.interactionType ?? StackInteractionType.NONE,
      max: maxRecord,
      instances: params.stack?.instances ?? 1,
      thresholdEffects: params.stack?.thresholdEffects ?? {},
    };

    this.triggerClause = params.triggerClause ?? [];
    this.interactionTypes = params.interactionTypes ?? [];
    this.stats = params.stats ?? [];
    this.stacks = params.stacks ?? 0;

    const highestMax = Math.max(...Object.values(this.stack.max));
    if (this.stacks > highestMax && highestMax > 0) {
      throw new RangeError(
        `stacks (${this.stacks}) cannot exceed stack.max (${highestMax})`,
      );
    }
  }
}
