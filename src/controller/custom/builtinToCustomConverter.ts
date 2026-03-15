/**
 * Converts built-in game data to CustomWeapon / CustomGearSet format
 * for the "Clone as Custom" feature.
 */
import { WeaponType, GearSetType, GearCategory, CombatSkillType, ElementType } from '../../consts/enums';
import { WEAPON_DATA } from '../../model/weapons/weaponData';
import { WEAPONS, GEARS } from '../../utils/loadoutRegistry';
import { WEAPON_SKILL_EFFECTS } from '../../consts/weaponSkillEffects';
import { GEAR_SET_EFFECTS } from '../../consts/gearSetEffects';
import { ALL_OPERATORS } from '../operators/operatorRegistry';
import { triggerConditionToInteraction, legacyTargetToObjectType } from './bridgeUtils';
import { OperatorClassType } from '../../model/enums/operators';
import type { CustomWeapon, CustomWeaponSkillDef } from '../../model/custom/customWeaponTypes';
import type { CustomGearSet, CustomGearPiece, CustomGearSetEffect } from '../../model/custom/customGearTypes';
import type { CustomOperator, CustomCombatSkillDef } from '../../model/custom/customOperatorTypes';
import type { SkillType, SkillDef } from '../../consts/viewTypes';

/** Convert a built-in weapon to CustomWeapon format. */
export function weaponToCustomWeapon(weaponName: string): CustomWeapon | null {
  const config = WEAPON_DATA[weaponName];
  const entry = WEAPONS.find((w) => w.name === weaponName);
  if (!config || !entry) return null;

  const skills: CustomWeaponSkillDef[] = [];

  // Skill 1 & 2 are stat boosts; skill 3 is the named effect
  const skillTypes = [config.skill1, config.skill2];
  if (config.skill3) skillTypes.push(config.skill3);

  // Check for triggered effects from the effects registry
  const effectsEntry = WEAPON_SKILL_EFFECTS.find((e) => e.weaponName === weaponName);

  for (const skillType of skillTypes) {
    // Check if this skill has a named effect entry
    const matchedEffect = effectsEntry?.effects.find((e) => e.skillKey === skillType);

    if (matchedEffect) {
      skills.push({
        type: 'NAMED',
        label: matchedEffect.label,
        namedEffect: {
          name: matchedEffect.label,
          description: matchedEffect.description,
          triggers: matchedEffect.triggers.map(triggerConditionToInteraction),
          target: legacyTargetToObjectType(matchedEffect.target === 'wielder' ? 'wielder' : matchedEffect.target === 'team' ? 'team' : 'enemy').toString(),
          durationSeconds: matchedEffect.durationSeconds,
          maxStacks: matchedEffect.maxStacks,
          cooldownSeconds: matchedEffect.cooldownSeconds,
          buffs: matchedEffect.buffs.map((b) => ({
            stat: b.stat,
            valueMin: b.valueMin,
            valueMax: b.valueMax,
            perStack: b.perStack ?? false,
          })),
          note: matchedEffect.note,
        },
      });
    } else {
      // Treat as stat boost with placeholder label
      skills.push({
        type: 'STAT_BOOST',
        label: skillType.replace(/_/g, ' '),
        statBoost: { stat: skillType, values: [] },
      });
    }
  }

  return {
    id: `clone_${weaponName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
    name: `${weaponName} (Clone)`,
    weaponType: config.type,
    weaponRarity: config.rarity as 3 | 4 | 5 | 6,
    baseAtk: { lv1: config.baseAtk.lv1, lv90: config.baseAtk.lv90 },
    skills,
  };
}

/** Convert a built-in gear set to CustomGearSet format. */
export function gearSetToCustomGearSet(gearSetType: GearSetType): CustomGearSet | null {
  const gearEntries = GEARS.filter((g) => g.gearSetType === gearSetType);
  if (gearEntries.length === 0) return null;

  const effectsEntry = GEAR_SET_EFFECTS.find((e) => e.gearSetType === gearSetType);

  const pieces: CustomGearPiece[] = gearEntries.slice(0, 3).map((g) => ({
    name: g.name,
    gearCategory: g.gearCategory,
    defense: 0,
    statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
  }));

  let setEffect: CustomGearSetEffect | undefined;
  if (effectsEntry) {
    setEffect = {
      passiveStats: effectsEntry.passiveStats as Record<string, number>,
      effects: effectsEntry.effects.map((e) => ({
        label: e.label,
        triggers: e.triggers.map(triggerConditionToInteraction),
        target: legacyTargetToObjectType(e.target === 'wielder' ? 'wielder' : e.target === 'team' ? 'team' : 'enemy').toString(),
        durationSeconds: e.durationSeconds,
        maxStacks: e.maxStacks,
        cooldownSeconds: e.cooldownSeconds,
        buffs: e.buffs.map((b) => ({
          stat: b.stat,
          value: b.value,
          perStack: b.perStack ?? false,
        })),
        note: e.note,
      })),
    };
  }

  return {
    id: `clone_${gearSetType.toLowerCase()}_${Date.now()}`,
    setName: `${effectsEntry?.label ?? gearSetType} (Clone)`,
    rarity: (gearEntries[0].rarity as 4 | 5 | 6) || 5,
    pieces,
    setEffect,
  };
}

const SKILL_TYPE_MAP: Record<SkillType, CombatSkillType> = {
  basic: CombatSkillType.BASIC_ATTACK,
  battle: CombatSkillType.BATTLE_SKILL,
  combo: CombatSkillType.COMBO_SKILL,
  ultimate: CombatSkillType.ULTIMATE,
};

function skillDefToCustomSkill(skillType: SkillType, skill: SkillDef): CustomCombatSkillDef {
  // Use total duration (activation + active) and ensure positive for validation
  const totalFrames = skill.defaultActivationDuration + skill.defaultActiveDuration;
  const def: CustomCombatSkillDef = {
    name: skill.name,
    combatSkillType: SKILL_TYPE_MAP[skillType],
    durationSeconds: Math.max(totalFrames / 120, 0.1),
    cooldownSeconds: skill.defaultCooldownDuration > 0 ? skill.defaultCooldownDuration / 120 : undefined,
    animationSeconds: skill.animationDuration ? skill.animationDuration / 120 : undefined,
    resourceInteractions: [],
  };
  if (skill.element) def.element = skill.element as ElementType;
  if (skill.skillPointCost) {
    def.resourceInteractions = [{ resourceType: 'SKILL_POINT', verbType: 'EXPEND', value: skill.skillPointCost }];
  }
  if (skill.publishesTriggers && skill.publishesTriggers.length > 0) {
    def.publishesTriggers = skill.publishesTriggers.map(triggerConditionToInteraction);
  }
  return def;
}

/** Convert a built-in operator to CustomOperator format. */
export function operatorToCustomOperator(operatorId: string): CustomOperator | null {
  const op = ALL_OPERATORS.find((o) => o.id === operatorId);
  if (!op) return null;

  const comboRequires = op.triggerCapability?.comboRequires ?? [];

  // Provide placeholder BASE_ATTACK so validation passes
  const placeholderStats: Partial<Record<string, number>> = { BASE_ATTACK: 100 };

  // Ensure at least one combo requires condition
  const comboInteractions = comboRequires.length > 0
    ? comboRequires.map(triggerConditionToInteraction)
    : [{ subjectType: 'THIS_OPERATOR' as any, verbType: 'PERFORM' as any, objectType: 'BATTLE_SKILL' as any }];

  return {
    id: `clone_${operatorId}_${Date.now()}`,
    name: `${op.name} (Clone)`,
    operatorClassType: op.role.toUpperCase().replace(/\s+/g, '_') as OperatorClassType,
    elementType: op.element as ElementType,
    weaponType: op.weaponTypes[0] as WeaponType,
    operatorRarity: (op.rarity as 4 | 5 | 6) || 6,
    displayColor: op.color,
    mainAttributeType: '',
    baseStats: { lv1: { ...placeholderStats }, lv90: { ...placeholderStats } },
    potentials: [],
    skills: {
      basicAttack: skillDefToCustomSkill('basic', op.skills.basic),
      battleSkill: skillDefToCustomSkill('battle', op.skills.battle),
      comboSkill: skillDefToCustomSkill('combo', op.skills.combo),
      ultimate: skillDefToCustomSkill('ultimate', op.skills.ultimate),
    },
    combo: {
      requires: comboInteractions,
      description: op.triggerCapability?.comboDescription ?? '',
      windowFrames: op.triggerCapability?.comboWindowFrames ?? 720,
    },
  };
}
