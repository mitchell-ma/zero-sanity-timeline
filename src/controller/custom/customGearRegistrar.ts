/**
 * Registers/deregisters custom gear sets into the runtime registries.
 */
import { GearSetType, UnitType } from '../../consts/enums';
import { GEAR_SET_EFFECTS } from '../../consts/gearSetEffects';
import type { CustomGearSet } from '../../model/custom/customGearTypes';
import { VerbType } from '../../dsl/semantics';
import { registerCustomGearEffectDefs, deregisterCustomGearEffectDefs, registerCustomGearPiece as registerPieceInController, deregisterCustomGearPiece as deregisterPieceFromController } from '../gameDataStore';

// ── Registration ────────────────────────────────────────────────────────────

export function registerCustomGearSet(gearSet: CustomGearSet): void {
  const customGearSetType = `CUSTOM_${gearSet.id}` as unknown as GearSetType;

  // Register each piece in gearPiecesController
  for (const piece of gearSet.pieces) {
    registerPieceInController({ properties: { id: `${gearSet.id}_${piece.gearCategory}`, name: piece.name, type: piece.gearCategory as string, gearSet: customGearSetType as string }, clause: [] }, gearSet.icon);
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

  // Remove pieces from gearPiecesController
  for (const piece of gearSet.pieces) {
    deregisterPieceFromController(`${gearSet.id}_${piece.gearCategory}`);
  }

  // Remove set effects
  const effectIdx = GEAR_SET_EFFECTS.findIndex((e) => (e.gearSetType as string) === customGearSetType);
  if (effectIdx >= 0) GEAR_SET_EFFECTS.splice(effectIdx, 1);
  deregisterCustomGearEffectDefs(customGearSetType);
}

/** Convert a custom gear set's effects to DSL StatusEventDef format. */
function buildDslDefsFromCustomGearSet(gearSet: CustomGearSet, gearSetType: string): Record<string, unknown>[] {
  if (!gearSet.setEffect?.effects) return [];
  const defs: Record<string, unknown>[] = [];
  const originId = gearSetType;

  for (const effect of gearSet.setEffect.effects) {
    if (effect.triggers.length === 0) continue;

    const targetMap: Record<string, string> = { self: 'OPERATOR', team: 'OPERATOR', enemy: 'ENEMY' };
    const determinerMap: Record<string, string> = { self: 'THIS', team: 'OTHER' };
    const target = targetMap[effect.target] ?? 'OPERATOR';
    const targetDeterminer = determinerMap[effect.target];
    const statusId = `${originId}_${effect.label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

    defs.push({
      name: statusId,
      type: 'GEAR_SET_STATUS',
      originId,
      target,
      ...(targetDeterminer ? { targetDeterminer } : {}),
      label: effect.label,
      stack: {
        max: { P0: effect.maxStacks },
        instances: effect.maxStacks,
        verb: effect.maxStacks > 1 ? 'NONE' : 'RESET',
      },
      onTriggerClause: effect.triggers.map((t) => ({ conditions: [t] })),
      clause: [],
      buffs: effect.buffs,
      properties: { duration: { value: { verb: VerbType.IS, value: effect.durationSeconds }, unit: UnitType.SECOND } },
      ...(effect.cooldownSeconds ? { cooldownSeconds: effect.cooldownSeconds } : {}),
    });
  }

  return defs;
}
