import { DurationUnit, ElementType, EventOriginType, GearSetEffectType, OperatorType, StackInteractionType, StatusType, TargetType, TriggerConditionType } from "../../consts/enums";
import { GearEffectBuff, GearEffectTarget, GearSetEffect } from "../../consts/gearSetEffects";
import { StatusEvent, TriggerCondition } from "./statusEvent";

const TARGET_MAP: Record<GearEffectTarget, TargetType> = {
  wielder: TargetType.SELF,
  team: TargetType.TEAM,
  enemy: TargetType.ENEMY,
};

/**
 * Status event for gear set conditional (triggered) effects.
 *
 * Mirrors the weapon skill pattern: gear sets have a permanent stat portion
 * (handled by GearEffect.passiveStats) and a conditional triggered portion
 * that creates this status event on the timeline.
 */
export class GearSetStatusEvent extends StatusEvent {
  readonly gearSetEffectType: GearSetEffectType;
  readonly cooldownSeconds: number;
  readonly buffs: readonly GearEffectBuff[];

  constructor(params: {
    gearSetEffectType: GearSetEffectType;
    effect: GearSetEffect;
    sourceOperator: OperatorType;
    stacks?: number;
  }) {
    const { gearSetEffectType, effect, sourceOperator, stacks } = params;
    const target = TARGET_MAP[effect.target];

    // Build trigger conditions from the config's TriggerConditionType[] (implicit OR).
    const triggerConditions: TriggerCondition[][] = effect.triggers.map((t) => [{
      source: { targetType: target === TargetType.ENEMY ? TargetType.SELF : target },
      action: { interactionType: t },
    }]);

    super({
      statusType: StatusType.GEAR_BUFF,
      eventOrigin: EventOriginType.GEAR_EFFECT,
      name: effect.label,
      target,
      sourceOperator,
      element: ElementType.NONE,
      duration: { value: effect.durationSeconds, unit: DurationUnit.SECOND },
      isNamedEvent: true,
      isForceApplied: false,
      stack: {
        interactionType: effect.maxStacks > 1 ? StackInteractionType.REFRESH : StackInteractionType.NONE,
        max: effect.maxStacks,
        instances: effect.maxStacks,
        thresholdEffects: {},
      },
      // TODO: migrate TriggerCondition[][] → Clause (Predicate[])
      triggerClause: [],
      interactionTypes: [],
      stats: effect.buffs.map((b) => ({
        statType: b.stat,
        value: Array(effect.maxStacks).fill(
          b.perStack ? b.value : b.value,
        ).map((v, i) => b.perStack ? v * (i + 1) : v),
      })),
      stacks,
    });

    this.gearSetEffectType = gearSetEffectType;
    this.cooldownSeconds = effect.cooldownSeconds;
    this.buffs = effect.buffs;
  }
}
