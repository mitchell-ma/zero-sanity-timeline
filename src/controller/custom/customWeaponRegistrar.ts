/**
 * Registers/deregisters custom weapons into the runtime registries
 * so they appear alongside built-in weapons in loadout dropdowns
 * and the timeline pipeline.
 */
import { registerWeaponEffects, deregisterWeaponEffects } from '../../consts/weaponSkillEffects';
import type { WeaponSkillEffect, WeaponEffectBuff } from '../../consts/weaponSkillEffects';
import { registerCustomWeaponEffectDefs, deregisterCustomWeaponEffectDefs } from '../../model/game-data/weaponGearEffectLoader';
import { WEAPON_DATA, registerCustomSkillFactory, deregisterCustomSkillFactory, createWeaponFromData as createWeaponFromDataFn } from '../../model/weapons/weaponData';
import type { WeaponConfig } from '../../model/weapons/weaponData';
import { WEAPONS } from '../../utils/loadoutRegistry';
import type { WeaponRegistryEntry } from '../../utils/loadoutRegistry';
import { CustomStatBoostSkill, CustomNamedWeaponSkill } from '../../model/weapon-skills/customWeaponSkill';
import type { CustomWeapon } from '../../model/custom/customWeaponTypes';
import { mapTargetToLegacy } from './bridgeUtils';

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
    const triggers = ne.triggers;
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

  // Register DSL status event defs for the derivation engine
  const dslDefs = buildDslDefsFromCustomWeapon(weapon);
  if (dslDefs.length > 0) {
    registerCustomWeaponEffectDefs(weapon.name, dslDefs);
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
  deregisterCustomWeaponEffectDefs(weapon.name);
}

/** Convert a custom weapon's named effects to DSL StatusEventDef format. */
function buildDslDefsFromCustomWeapon(weapon: CustomWeapon): any[] {
  const defs: any[] = [];
  const originId = weapon.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

  for (const skill of weapon.skills) {
    if (skill.type !== 'NAMED' || !skill.namedEffect) continue;
    const ne = skill.namedEffect;
    if (ne.triggers.length === 0) continue;

    const targetMap: Record<string, string> = { self: 'OPERATOR', team: 'OPERATOR', enemy: 'ENEMY' };
    const determinerMap: Record<string, string> = { self: 'THIS', team: 'OTHER' };
    const target = targetMap[ne.target] ?? 'OPERATOR';
    const targetDeterminer = determinerMap[ne.target];
    const statusName = `${originId}_${ne.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

    defs.push({
      name: statusName,
      type: 'WEAPON_EFFECT',
      originId,
      target,
      ...(targetDeterminer ? { targetDeterminer } : {}),
      label: ne.name,
      stack: {
        max: { P0: ne.maxStacks },
        instances: ne.maxStacks,
        verbType: ne.maxStacks > 1 ? 'NONE' : 'RESET',
      },
      triggerClause: ne.triggers.map((t: any) => ({ conditions: [t] })),
      clause: [],
      buffs: ne.buffs,
      properties: { duration: { value: [ne.durationSeconds], unit: 'SECOND' } },
      ...(ne.cooldownSeconds ? { cooldownSeconds: ne.cooldownSeconds } : {}),
    });
  }

  return defs;
}
