/**
 * Registers/deregisters custom weapons into the runtime registries
 * so they appear alongside built-in weapons in loadout dropdowns
 * and the timeline pipeline.
 */
import { TriggerConditionType } from '../../consts/enums';
import { registerWeaponEffects, deregisterWeaponEffects } from '../../consts/weaponSkillEffects';
import type { WeaponSkillEffect, WeaponEffectBuff } from '../../consts/weaponSkillEffects';
import { WEAPON_DATA, registerCustomSkillFactory, deregisterCustomSkillFactory, createWeaponFromData as createWeaponFromDataFn } from '../../model/weapons/weaponData';
import type { WeaponConfig } from '../../model/weapons/weaponData';
import { WEAPONS } from '../../utils/loadoutRegistry';
import type { WeaponRegistryEntry } from '../../utils/loadoutRegistry';
import { CustomStatBoostSkill, CustomNamedWeaponSkill } from '../../model/weapon-skills/customWeaponSkill';
import type { CustomWeapon } from '../../model/custom/customWeaponTypes';
import { interactionToTriggerCondition, mapTargetToLegacy } from './bridgeUtils';

function customSkillKey(weaponId: string, index: number): string {
  return `CUSTOM_${weaponId}_SKILL_${index}`;
}

export function registerCustomWeapon(weapon: CustomWeapon): void {
  const skillKeys: string[] = [];

  for (let i = 0; i < weapon.skills.length; i++) {
    const skill = weapon.skills[i];
    const key = customSkillKey(weapon.id, i);
    skillKeys.push(key);

    if (skill.type === 'STAT_BOOST' && skill.statBoost) {
      const { stat, values } = skill.statBoost;
      registerCustomSkillFactory(key, (level) => new CustomStatBoostSkill(key, level, stat, values));
    } else if (skill.type === 'NAMED' && skill.namedEffect) {
      const effect = skill.namedEffect;
      registerCustomSkillFactory(key, (level) => new CustomNamedWeaponSkill(key, level, effect));
    }
  }

  const config: WeaponConfig = {
    type: weapon.weaponType,
    rarity: weapon.weaponRarity as 3 | 4 | 5 | 6,
    baseAtk: weapon.baseAtk,
    skill1: skillKeys[0] as any,
    skill2: skillKeys[1] as any,
    ...(skillKeys[2] ? { skill3: skillKeys[2] as any } : {}),
  };
  WEAPON_DATA[weapon.name] = config;

  const entry: WeaponRegistryEntry = {
    name: weapon.name,
    icon: weapon.icon,
    rarity: weapon.weaponRarity,
    weaponType: weapon.weaponType,
    create: () => createWeaponFromDataFn(weapon.name, weapon.weaponType),
  };
  WEAPONS.push(entry);

  const effects: WeaponSkillEffect[] = [];
  for (let i = 0; i < weapon.skills.length; i++) {
    const skill = weapon.skills[i];
    if (skill.type !== 'NAMED' || !skill.namedEffect) continue;
    const ne = skill.namedEffect;
    const triggers = ne.triggers
      .map(interactionToTriggerCondition)
      .filter((t): t is TriggerConditionType => t !== null);
    if (triggers.length === 0) continue;

    effects.push({
      label: ne.name,
      description: ne.description,
      skillKey: customSkillKey(weapon.id, i),
      triggers,
      target: mapTargetToLegacy(ne.target),
      durationSeconds: ne.durationSeconds,
      maxStacks: ne.maxStacks,
      cooldownSeconds: ne.cooldownSeconds ?? 0,
      buffs: ne.buffs.map((b): WeaponEffectBuff => ({
        stat: b.stat as any,
        valueMin: b.valueMin,
        valueMax: b.valueMax,
        perStack: b.perStack,
      })),
      note: ne.note,
    });
  }

  if (effects.length > 0) {
    registerWeaponEffects({ weaponName: weapon.name, effects });
  }
}

export function deregisterCustomWeapon(weapon: CustomWeapon): void {
  for (let i = 0; i < weapon.skills.length; i++) {
    deregisterCustomSkillFactory(customSkillKey(weapon.id, i));
  }
  delete WEAPON_DATA[weapon.name];
  const wIdx = WEAPONS.findIndex((w) => w.name === weapon.name);
  if (wIdx >= 0) WEAPONS.splice(wIdx, 1);
  deregisterWeaponEffects(weapon.name);
}
