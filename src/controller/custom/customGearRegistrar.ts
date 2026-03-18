/**
 * Registers/deregisters custom gear sets into the runtime registries.
 */
import { GearSetType } from '../../consts/enums';
import { GEAR_SET_EFFECTS } from '../../consts/gearSetEffects';
import { GEARS } from '../../utils/loadoutRegistry';
import type { GearRegistryEntry } from '../../utils/loadoutRegistry';
import { DataDrivenGear } from '../../model/gears/dataDrivenGear';
import type { CustomGearSet } from '../../model/custom/customGearTypes';
import { registerCustomGearEffectDefs, deregisterCustomGearEffectDefs } from '../../model/game-data/weaponGearEffectLoader';

// ── Registration ────────────────────────────────────────────────────────────

export function registerCustomGearSet(gearSet: CustomGearSet): void {
  const customGearSetType = `CUSTOM_${gearSet.id}` as unknown as GearSetType;

  // Register each piece into GEARS registry
  for (const piece of gearSet.pieces) {
    const entry: GearRegistryEntry = {
      name: piece.name,
      icon: gearSet.icon,
      rarity: gearSet.rarity,
      gearCategory: piece.gearCategory,
      gearSetType: customGearSetType,
      create: () => new DataDrivenGear(
        { name: piece.name, gearCategory: piece.gearCategory as string, defense: piece.defense, allLevels: piece.statsByRank as any },
        customGearSetType as any,
      ),
    };
    GEARS.push(entry);
  }

  // Register passive stats for loadout aggregation
  if (gearSet.setEffect) {
    GEAR_SET_EFFECTS.push({
      gearSetType: customGearSetType,
      label: gearSet.setName,
      passiveStats: gearSet.setEffect.passiveStats ?? {},
      effects: [],
    });

    // Register DSL status event defs for the derivation engine
    const dslDefs = buildDslDefsFromCustomGearSet(gearSet, customGearSetType);
    if (dslDefs.length > 0) {
      registerCustomGearEffectDefs(customGearSetType, dslDefs);
    }
  }
}

export function deregisterCustomGearSet(gearSet: CustomGearSet): void {
  const customGearSetType = `CUSTOM_${gearSet.id}`;

  // Remove pieces from GEARS
  for (const piece of gearSet.pieces) {
    const idx = GEARS.findIndex((g) => g.name === piece.name && (g.gearSetType as string) === customGearSetType);
    if (idx >= 0) GEARS.splice(idx, 1);
  }

  // Remove set effects
  const effectIdx = GEAR_SET_EFFECTS.findIndex((e) => (e.gearSetType as string) === customGearSetType);
  if (effectIdx >= 0) GEAR_SET_EFFECTS.splice(effectIdx, 1);
  deregisterCustomGearEffectDefs(customGearSetType);
}

/** Convert a custom gear set's effects to DSL StatusEventDef format. */
function buildDslDefsFromCustomGearSet(gearSet: CustomGearSet, gearSetType: string): any[] {
  if (!gearSet.setEffect?.effects) return [];
  const defs: any[] = [];
  const originId = gearSetType;

  for (const effect of gearSet.setEffect.effects) {
    if (effect.triggers.length === 0) continue;

    const targetMap: Record<string, string> = { self: 'OPERATOR', team: 'OPERATOR', enemy: 'ENEMY' };
    const determinerMap: Record<string, string> = { self: 'THIS', team: 'OTHER' };
    const target = targetMap[effect.target] ?? 'OPERATOR';
    const targetDeterminer = determinerMap[effect.target];
    const statusName = `${originId}_${effect.label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

    defs.push({
      name: statusName,
      type: 'GEAR_EFFECT',
      originId,
      target,
      ...(targetDeterminer ? { targetDeterminer } : {}),
      label: effect.label,
      stack: {
        max: { P0: effect.maxStacks },
        instances: effect.maxStacks,
        verbType: effect.maxStacks > 1 ? 'NONE' : 'RESET',
      },
      triggerClause: effect.triggers.map((t: any) => ({ conditions: [t] })),
      clause: [],
      buffs: effect.buffs,
      properties: { duration: { value: [effect.durationSeconds], unit: 'SECOND' } },
      ...(effect.cooldownSeconds ? { cooldownSeconds: effect.cooldownSeconds } : {}),
    });
  }

  return defs;
}
