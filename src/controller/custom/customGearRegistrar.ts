/**
 * Registers/deregisters custom gear sets into the runtime registries.
 */
import { GearCategory, GearSetType, TriggerConditionType } from '../../consts/enums';
import { GEAR_SET_EFFECTS } from '../../consts/gearSetEffects';
import type { GearSetEffectsEntry, GearSetEffect, GearEffectBuff } from '../../consts/gearSetEffects';
import { GEARS } from '../../utils/loadoutRegistry';
import type { GearRegistryEntry } from '../../utils/loadoutRegistry';
import { DataDrivenGear } from '../../model/gears/dataDrivenGear';
import type { CustomGearSet, CustomGearPiece } from '../../model/custom/customGearTypes';
import { interactionToTriggerCondition, mapTargetToLegacy } from './bridgeUtils';

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

  // Register set effects
  if (gearSet.setEffect) {
    const effects: GearSetEffect[] = [];
    if (gearSet.setEffect.effects) {
      for (let i = 0; i < gearSet.setEffect.effects.length; i++) {
        const effect = gearSet.setEffect.effects[i];
        const triggers = effect.triggers
          .map(interactionToTriggerCondition)
          .filter((t): t is TriggerConditionType => t !== null);
        if (triggers.length === 0) continue;

        effects.push({
          label: effect.label,
          gearSetEffectType: `CUSTOM_${gearSet.id}_${i}` as any,
          triggers,
          target: mapTargetToLegacy(effect.target),
          durationSeconds: effect.durationSeconds,
          maxStacks: effect.maxStacks,
          cooldownSeconds: effect.cooldownSeconds ?? 0,
          buffs: effect.buffs.map((b): GearEffectBuff => ({
            stat: b.stat as any,
            value: b.value,
            perStack: b.perStack,
          })),
          note: effect.note,
        });
      }
    }

    const entry: GearSetEffectsEntry = {
      gearSetType: customGearSetType,
      label: gearSet.setName,
      passiveStats: gearSet.setEffect.passiveStats ?? {},
      effects,
    };
    GEAR_SET_EFFECTS.push(entry);
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
}
