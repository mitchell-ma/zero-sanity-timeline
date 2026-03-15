/**
 * Bridge utilities for converting SVO Interactions to legacy enum types.
 * Used by custom weapon/gear/operator registrars until the legacy trigger
 * system is fully replaced by the SVO system.
 */
import { TriggerConditionType } from '../../consts/enums';
import { SubjectType, VerbType, ObjectType } from '../../consts/semantics';
import type { Interaction } from '../../consts/semantics';

/** Convert an SVO Interaction to a legacy TriggerConditionType. Returns null if no mapping exists. */
export function interactionToTriggerCondition(i: Interaction): TriggerConditionType | null {
  if (i.verbType === VerbType.PERFORM) {
    switch (i.objectType) {
      case ObjectType.BATTLE_SKILL: return TriggerConditionType.CAST_BATTLE_SKILL;
      case ObjectType.COMBO_SKILL: return TriggerConditionType.CAST_COMBO_SKILL;
      case ObjectType.ULTIMATE: return TriggerConditionType.CAST_ULTIMATE;
      case ObjectType.FINAL_STRIKE: return TriggerConditionType.FINAL_STRIKE;
      case ObjectType.CRITICAL_HIT: return TriggerConditionType.CRITICAL_HIT;
    }
  }
  if (i.verbType === VerbType.RECOVER && i.objectType === ObjectType.SKILL_POINT) {
    return TriggerConditionType.SKILL_POINT_RECOVERY_FROM_SKILL;
  }
  if (i.verbType === VerbType.APPLY) {
    switch (i.objectType) {
      case ObjectType.INFLICTION:
        if (i.objectId === 'HEAT') return TriggerConditionType.APPLY_HEAT_INFLICTION;
        if (i.objectId === 'CRYO') return TriggerConditionType.APPLY_CRYO_INFLICTION;
        if (i.objectId === 'NATURE') return TriggerConditionType.APPLY_NATURE_INFLICTION;
        if (i.objectId === 'ELECTRIC') return TriggerConditionType.APPLY_ELECTRIC_INFLICTION;
        return TriggerConditionType.APPLY_ARTS_INFLICTION;
      case ObjectType.ARTS_REACTION: return TriggerConditionType.APPLY_ARTS_INFLICTION;
      case ObjectType.STATUS:
        if (i.objectId === 'VULNERABILITY') return TriggerConditionType.APPLY_VULNERABILITY;
        return TriggerConditionType.APPLY_PHYSICAL_STATUS;
    }
  }
  if (i.verbType === VerbType.IS) {
    switch (i.objectType) {
      case ObjectType.COMBUSTED: return TriggerConditionType.COMBUSTION;
      case ObjectType.CORRODED: return TriggerConditionType.CORROSION;
      case ObjectType.ELECTRIFIED: return TriggerConditionType.ELECTRIFICATION;
      case ObjectType.SOLIDIFIED: return TriggerConditionType.SOLIDIFICATION;
    }
  }
  if (i.verbType === VerbType.OVERHEAL) return TriggerConditionType.HP_TREATMENT_EXCEEDS_MAX;
  if (i.verbType === VerbType.DEFEAT) return TriggerConditionType.DEFEAT_ENEMY;
  if (i.verbType === VerbType.CONSUME) {
    if (i.objectType === ObjectType.REACTION) return TriggerConditionType.CONSUME_ARTS_REACTION;
  }
  return null;
}

type LegacyTarget = 'wielder' | 'team' | 'enemy';

/** Convert a legacy TriggerConditionType back to an SVO Interaction. */
export function triggerConditionToInteraction(tc: TriggerConditionType): Interaction {
  const base = { subjectType: SubjectType.THIS_OPERATOR };
  switch (tc) {
    case TriggerConditionType.CAST_BATTLE_SKILL:
      return { ...base, verbType: VerbType.PERFORM, objectType: ObjectType.BATTLE_SKILL };
    case TriggerConditionType.CAST_COMBO_SKILL:
      return { ...base, verbType: VerbType.PERFORM, objectType: ObjectType.COMBO_SKILL };
    case TriggerConditionType.CAST_ULTIMATE:
      return { ...base, verbType: VerbType.PERFORM, objectType: ObjectType.ULTIMATE };
    case TriggerConditionType.FINAL_STRIKE:
      return { ...base, verbType: VerbType.PERFORM, objectType: ObjectType.FINAL_STRIKE };
    case TriggerConditionType.CRITICAL_HIT:
      return { ...base, verbType: VerbType.PERFORM, objectType: ObjectType.CRITICAL_HIT };
    case TriggerConditionType.SKILL_POINT_RECOVERY_FROM_SKILL:
      return { ...base, verbType: VerbType.RECOVER, objectType: ObjectType.SKILL_POINT };
    case TriggerConditionType.DEFEAT_ENEMY:
      return { ...base, verbType: VerbType.DEFEAT, objectType: ObjectType.ENEMY };
    case TriggerConditionType.HP_TREATMENT_EXCEEDS_MAX:
      return { ...base, verbType: VerbType.OVERHEAL, objectType: ObjectType.HP };
    case TriggerConditionType.COMBUSTION:
      return { subjectType: SubjectType.ENEMY, verbType: VerbType.IS, objectType: ObjectType.COMBUSTED };
    case TriggerConditionType.CORROSION:
      return { subjectType: SubjectType.ENEMY, verbType: VerbType.IS, objectType: ObjectType.CORRODED };
    case TriggerConditionType.ELECTRIFICATION:
      return { subjectType: SubjectType.ENEMY, verbType: VerbType.IS, objectType: ObjectType.ELECTRIFIED };
    case TriggerConditionType.SOLIDIFICATION:
      return { subjectType: SubjectType.ENEMY, verbType: VerbType.IS, objectType: ObjectType.SOLIDIFIED };
    case TriggerConditionType.APPLY_HEAT_INFLICTION:
      return { ...base, verbType: VerbType.APPLY, objectType: ObjectType.INFLICTION, objectId: 'HEAT' };
    case TriggerConditionType.APPLY_CRYO_INFLICTION:
      return { ...base, verbType: VerbType.APPLY, objectType: ObjectType.INFLICTION, objectId: 'CRYO' };
    case TriggerConditionType.APPLY_NATURE_INFLICTION:
      return { ...base, verbType: VerbType.APPLY, objectType: ObjectType.INFLICTION, objectId: 'NATURE' };
    case TriggerConditionType.APPLY_ELECTRIC_INFLICTION:
      return { ...base, verbType: VerbType.APPLY, objectType: ObjectType.INFLICTION, objectId: 'ELECTRIC' };
    case TriggerConditionType.APPLY_ARTS_INFLICTION:
    case TriggerConditionType.APPLY_ARTS_INFLICTION_2_STACKS:
      return { ...base, verbType: VerbType.APPLY, objectType: ObjectType.INFLICTION };
    case TriggerConditionType.APPLY_VULNERABILITY:
      return { ...base, verbType: VerbType.APPLY, objectType: ObjectType.STATUS, objectId: 'VULNERABILITY' };
    case TriggerConditionType.APPLY_PHYSICAL_STATUS:
      return { ...base, verbType: VerbType.APPLY, objectType: ObjectType.STATUS };
    case TriggerConditionType.CONSUME_ARTS_REACTION:
      return { ...base, verbType: VerbType.CONSUME, objectType: ObjectType.REACTION };
    case TriggerConditionType.TEAM_CAST_BATTLE_SKILL:
      return { subjectType: SubjectType.ANY, verbType: VerbType.PERFORM, objectType: ObjectType.BATTLE_SKILL };
    case TriggerConditionType.STAGGER:
      return { subjectType: SubjectType.ENEMY, verbType: VerbType.IS, objectType: ObjectType.BREACHED };
    default:
      return { ...base, verbType: VerbType.PERFORM, objectType: ObjectType.BATTLE_SKILL };
  }
}

/** Convert legacy target to SVO ObjectType. */
export function legacyTargetToObjectType(target: LegacyTarget): ObjectType {
  switch (target) {
    case 'enemy': return ObjectType.ENEMY;
    case 'team': return ObjectType.ALL_OPERATORS;
    default: return ObjectType.THIS_OPERATOR;
  }
}

/** Convert SVO ObjectType entity to legacy target string. */
export function mapTargetToLegacy(target: string): LegacyTarget {
  switch (target) {
    case ObjectType.ENEMY: return 'enemy';
    case ObjectType.ALL_OPERATORS:
    case ObjectType.OTHER_OPERATOR:
    case ObjectType.OTHER_OPERATORS:
      return 'team';
    default: return 'wielder';
  }
}
