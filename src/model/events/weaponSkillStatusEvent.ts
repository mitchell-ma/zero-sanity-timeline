import {
  DurationUnit,
  ElementType,
  EventOriginType,
  OperatorType,
  StackInteractionType,
  StatType,
  StatusType,
  TargetType,
  WeaponSkillType,
} from "../../consts/enums";
import type { Interaction } from "../../consts/semantics";
import { WeaponEffectBuff } from "../../consts/weaponSkillEffects";
import { StatusEvent } from "./statusEvent";

/**
 * A status event on the timeline produced by a named weapon skill.
 *
 * This is the timeline event instance — it represents an active buff/debuff
 * at a specific point in time. The weapon skill configuration that produces
 * these events lives on the WeaponSkill (equipment config layer).
 *
 * isNamedEvent = true — these appear as named events on the timeline.
 */
export class WeaponSkillStatusEvent extends StatusEvent {
  readonly weaponSkillType: WeaponSkillType;

  constructor(params: {
    weaponSkillType: WeaponSkillType;
    name: string;
    sourceOperator: OperatorType;
    target: TargetType;
    element?: ElementType;
    durationSeconds: number;
    maxStacks: number;
    triggers?: Interaction[];
    cooldownSeconds?: number;
    buffs?: readonly WeaponEffectBuff[];
    stats: Partial<Record<StatType | string, number>>;
  }) {
    const { weaponSkillType, target, stats } = params;

    super({
      statusType: weaponSkillType as unknown as StatusType,
      eventOrigin: EventOriginType.WEAPON,
      name: params.name,
      target,
      sourceOperator: params.sourceOperator,
      element: params.element ?? ElementType.NONE,
      duration: { value: params.durationSeconds, unit: DurationUnit.SECOND },
      isNamedEvent: true,
      isForceApplied: false,
      stack: {
        interactionType: params.maxStacks > 1 ? StackInteractionType.REFRESH : StackInteractionType.NONE,
        max: params.maxStacks,
        instances: params.maxStacks,
        thresholdEffects: {},
      },
      // TODO: migrate Interaction[] → Clause (Predicate[])
      triggerClause: [],
      interactionTypes: [],
      stats: Object.entries(stats)
        .filter((entry): entry is [string, number] => entry[1] !== undefined)
        .map(([statType, value]) => ({
          statType,
          value: [value],
        })),
    });

    this.weaponSkillType = weaponSkillType;
  }
}
