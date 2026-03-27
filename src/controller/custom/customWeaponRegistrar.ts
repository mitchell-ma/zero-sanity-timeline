/**
 * Registers/deregisters custom weapons into the runtime registries
 * so they appear alongside built-in weapons in loadout dropdowns
 * and the timeline pipeline.
 */
import { registerCustomWeaponEffectDefs, deregisterCustomWeaponEffectDefs, registerCustomWeapon as registerInController, deregisterCustomWeapon as deregisterFromController } from '../gameDataStore';
import type { CustomWeapon } from '../../model/custom/customWeaponTypes';
import { UnitType } from '../../consts/enums';
import { VerbType } from '../../dsl/semantics';

export function registerCustomWeapon(weapon: CustomWeapon): void {
  // Register in weaponsController
  registerInController({ skills: [], properties: { id: weapon.id, name: weapon.name, type: weapon.weaponType as string, rarity: weapon.weaponRarity }, metadata: { originId: weapon.id } }, weapon.icon);

  // Register DSL status event defs for the derivation engine
  const dslDefs = buildDslDefsFromCustomWeapon(weapon);
  if (dslDefs.length > 0) {
    registerCustomWeaponEffectDefs(weapon.name, dslDefs);
  }
}

export function deregisterCustomWeapon(weapon: CustomWeapon): void {
  deregisterCustomWeaponEffectDefs(weapon.name);
  deregisterFromController(weapon.id);
}

/** Convert a custom weapon's named effects to DSL StatusEventDef format. */
function buildDslDefsFromCustomWeapon(weapon: CustomWeapon): Record<string, unknown>[] {
  const defs: Record<string, unknown>[] = [];
  const originId = weapon.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

  for (const skill of weapon.skills) {
    if (skill.type !== 'NAMED' || !skill.namedEffect) continue;
    const ne = skill.namedEffect;
    if (ne.triggers.length === 0) continue;

    const targetMap: Record<string, string> = { self: 'OPERATOR', team: 'OPERATOR', enemy: 'ENEMY' };
    const determinerMap: Record<string, string> = { self: 'THIS', team: 'OTHER' };
    const target = targetMap[ne.target] ?? 'OPERATOR';
    const targetDeterminer = determinerMap[ne.target];
    const statusId = `${originId}_${ne.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

    defs.push({
      name: statusId,
      type: 'WEAPON_EFFECT',
      originId,
      target,
      ...(targetDeterminer ? { targetDeterminer } : {}),
      label: ne.name,
      stack: {
        max: { P0: ne.maxStacks },
        instances: ne.maxStacks,
        verb: ne.maxStacks > 1 ? 'NONE' : 'RESET',
      },
      onTriggerClause: ne.triggers.map((t) => ({ conditions: [t] })),
      clause: [],
      buffs: ne.buffs,
      properties: { duration: { value: { verb: VerbType.IS, value: ne.durationSeconds }, unit: UnitType.SECOND } },
      ...(ne.cooldownSeconds ? { cooldownSeconds: ne.cooldownSeconds } : {}),
    });
  }

  return defs;
}
