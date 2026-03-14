import {
  CombatResourceType,
  CombatSkillType,
  ComparisonType,
  DurationUnit,
  ElementType,
  EventOriginType,
  EventType,
  OperatorType,
  RequirementStateType,
  StackInteractionType,
  StatusInteractionType,
  StatusType,
  TargetType,
  TriggerConditionType,
} from "../../consts/enums";
import type { RequirementType } from "../../consts/types";
import { StatType } from "../enums";
import { Duration, Event } from "./event";

// ── Spec Sub-Types ────────────────────────────────────────────────────────────

/** A trigger condition that causes a status to be created. */
export interface TriggerCondition {
  source: { targetType: TargetType };
  action: {
    interactionType: TriggerConditionType;
    combatSkillType?: CombatSkillType;
    statusType?: StatusType;
    threshold?: number;
  };
}

/** Counter configuration for tracking occurrences of a condition over time. */
export interface ActivationCounter {
  comparison: ComparisonType;
  threshold: number;
  /** If true, counter resets when met (can re-trigger). If false, activates once only. */
  resetOnMet: boolean;
}

/** A state assertion that must hold for an activation to be available. */
export interface ActivationCondition {
  subjectType: TargetType;
  requirementType: RequirementType;
  requirementStateType: RequirementStateType;
  threshold?: number;
  /** If present, tracks occurrences and activates when counter threshold is met. */
  counter?: ActivationCounter;
}

/** Defines how a status can be externally modified. */
export interface StatusInteractionEntry {
  type: 'CONSUMABLE' | 'RESETTABLE' | 'ABSORBABLE';
  condition: TriggerCondition;
  stacks?: number;
}

/** An outgoing effect produced by a status (e.g. at stack threshold). */
export interface StatusInteraction {
  interactionType: StatusInteractionType;
  statusType?: StatusType;
  stacks?: number;
  statusLevel?: number;
  isForced?: boolean;
  targetType?: TargetType;
}

/** A stat modifier applied by a status. */
export interface StatModifier {
  statType: StatType | string;
  value: number[];
}

/** Full stack configuration for a status. */
export interface StackConfig {
  interactionType: StackInteractionType;
  max: number;
  instances: number;
  thresholdEffects: Record<number, StatusInteraction[]>;
}

/** Trigger configuration — what causes this status to be created. */
export interface TriggerConfig {
  conditions: TriggerCondition[][];
  instancesRequired: number;
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

  /** Trigger configuration — what causes this status to be created. */
  readonly trigger: TriggerConfig;

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
    stack?: Partial<StackConfig> & { max: number };
    trigger?: TriggerConfig;
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

    this.stack = {
      interactionType: params.stack?.interactionType ?? StackInteractionType.NONE,
      max: params.stack?.max ?? 1,
      instances: params.stack?.instances ?? 1,
      thresholdEffects: params.stack?.thresholdEffects ?? {},
    };

    this.trigger = params.trigger ?? { conditions: [], instancesRequired: 1 };
    this.interactionTypes = params.interactionTypes ?? [];
    this.stats = params.stats ?? [];
    this.stacks = params.stacks ?? 0;

    if (this.stacks > this.stack.max && this.stack.max > 0) {
      throw new RangeError(
        `stacks (${this.stacks}) cannot exceed stack.max (${this.stack.max})`,
      );
    }
  }
}
