/**
 * Converts built-in game data to CustomWeapon / CustomGearSet / CustomOperator
 * for the "Clone as Custom" feature.
 *
 * Uses serialize() on the built-in entities + the gameDataAdapters toFriendly()
 * functions to produce editor-compatible types.
 */
import { GearSetType, ElementType, WeaponType } from '../../consts/enums';
import { getWeapon, resolveWeaponId, getGearSetEffect, getWeaponStatuses, getGearStatuses, getGearPiecesBySet } from '../gameDataStore';
import { ALL_OPERATORS } from '../operators/operatorRegistry';
import { getOperatorBase, getComboTriggerInfo } from '../gameDataStore';
import { SubjectType, VerbType, ObjectType, DeterminerType } from '../../dsl/semantics';
import type { Predicate } from '../../dsl/semantics';
import { OperatorClassType } from '../../model/enums/operators';
import type { CustomWeapon } from '../../model/custom/customWeaponTypes';
import type { CustomGearSet } from '../../model/custom/customGearTypes';
import type { CustomOperator } from '../../model/custom/customOperatorTypes';
import { weaponToFriendly, gearSetToFriendly, operatorToFriendly } from './gameDataAdapters';

/** Convert a built-in weapon to CustomWeapon format. */
export function weaponToCustomWeapon(weaponName: string): CustomWeapon | null {
  const weaponId = resolveWeaponId(weaponName);
  const config = weaponId ? getWeapon(weaponId) : undefined;
  if (!config) return null;

  const weaponJson = config.serialize();
  const statusObjs = getWeaponStatuses(weaponId!) ?? [];
  const statusJsons = statusObjs.map(s => s.serialize());

  const friendly = weaponToFriendly(weaponJson, [], statusJsons);
  friendly.id = `clone_${weaponName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  friendly.name = `${weaponName} (Clone)`;
  return friendly;
}

/** Convert a built-in gear set to CustomGearSet format. */
export function gearSetToCustomGearSet(gearSetType: GearSetType): CustomGearSet | null {
  const gearPieces = getGearPiecesBySet(gearSetType as string);
  if (gearPieces.length === 0) return null;

  const setEffect = getGearSetEffect(gearSetType);
  const setEffectJson = setEffect?.serialize() ?? undefined;
  const pieceJsons = gearPieces.map(p => p.serialize());
  const gearStatuses = getGearStatuses(gearSetType as string) ?? [];
  const statusJsons = gearStatuses.map(s => s.serialize());

  const friendly = gearSetToFriendly(setEffectJson, pieceJsons, statusJsons, gearSetType as string);
  friendly.id = `clone_${gearSetType.toLowerCase()}_${Date.now()}`;
  friendly.setName = `${friendly.setName} (Clone)`;
  return friendly;
}

/** Convert a built-in operator to CustomOperator format. */
export function operatorToCustomOperator(operatorId: string): CustomOperator | null {
  const op = ALL_OPERATORS.find((o) => o.id === operatorId);
  if (!op) return null;

  // Try to use serialize() + adapter if we have the base data
  const base = getOperatorBase(operatorId);
  if (base) {
    const friendly = operatorToFriendly(base.serialize());
    friendly.id = `clone_${operatorId}_${Date.now()}`;
    friendly.name = `${op.name} (Clone)`;
    friendly.baseOperatorId = operatorId;

    // Populate combo trigger from game data
    const info = getComboTriggerInfo(operatorId);
    if (info) {
      friendly.combo = {
        onTriggerClause: info.onTriggerClause as Predicate[],
        description: info.description ?? '',
        windowFrames: info.windowFrames ?? 720,
      };
    }
    return friendly;
  }

  // Fallback for operators without base data
  const info = getComboTriggerInfo(operatorId);
  const placeholderStats: Partial<Record<string, number>> = { BASE_HP: 800, BASE_ATTACK: 100, BASE_DEFENSE: 0 };
  const onTriggerClause: Predicate[] = info
    ? (info.onTriggerClause as Predicate[])
    : [{ conditions: [{ subjectDeterminer: DeterminerType.THIS, subject: SubjectType.OPERATOR, verb: VerbType.PERFORM, object: ObjectType.BATTLE }], effects: [] }];

  return {
    id: `clone_${operatorId}_${Date.now()}`,
    name: `${op.name} (Clone)`,
    operatorClassType: op.role.toUpperCase().replace(/\s+/g, '_') as OperatorClassType,
    elementType: op.element as ElementType,
    weaponTypes: op.weaponTypes as WeaponType[],
    operatorRarity: (op.rarity as 4 | 5 | 6) || 6,
    baseOperatorId: operatorId,
    mainAttributeType: '',
    baseStats: { lv1: { ...placeholderStats }, lv90: { ...placeholderStats } },
    potentials: [],
    combo: {
      onTriggerClause,
      description: info?.description ?? '',
      windowFrames: info?.windowFrames ?? 720,
    },
  };
}
