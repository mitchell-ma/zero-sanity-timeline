/**
 * Business logic for custom weapon CRUD operations.
 *
 * V2: Stores weapon bundles as { weapon: GameDataJson, statuses: GameDataJson[] }.
 * The editor still works with CustomWeapon via adapters.
 */
import { WeaponType } from '../../consts/enums';
import type { CustomWeapon } from '../../model/custom/customWeaponTypes';
import { loadGameDataArray, saveGameDataArray, STORAGE_KEYS, validateCustomWeapon } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';
import { registerCustomWeaponJson, deregisterCustomWeaponJson } from './customWeaponRegistrar';
import { weaponToFriendly, weaponFromFriendly, weaponNamedEffectsToStatuses } from './gameDataAdapters';

type GameDataJson = Record<string, unknown>;

interface WeaponBundle {
  weapon: GameDataJson;
  statuses: GameDataJson[];
}

let _cache: WeaponBundle[] | null = null;

function getAllBundles(): WeaponBundle[] {
  if (!_cache) {
    const raw = loadGameDataArray(STORAGE_KEYS.weapons);
    // Each entry is a bundle { weapon, statuses }
    _cache = raw.map(entry => ({
      weapon: (entry.weapon ?? entry) as GameDataJson,
      statuses: (entry.statuses ?? []) as GameDataJson[],
    }));
  }
  return _cache;
}

function persist(bundles: WeaponBundle[]): void {
  _cache = bundles;
  saveGameDataArray(STORAGE_KEYS.weapons, bundles as unknown as GameDataJson[]);
}

/** Convert a bundle to a friendly CustomWeapon. */
function bundleToFriendly(bundle: WeaponBundle): CustomWeapon {
  return weaponToFriendly(bundle.weapon, [], bundle.statuses);
}

/** Convert a CustomWeapon to a storage bundle. */
function friendlyToBundle(weapon: CustomWeapon): WeaponBundle {
  return {
    weapon: weaponFromFriendly(weapon),
    statuses: weaponNamedEffectsToStatuses(weapon),
  };
}

/** Get weapon ID from a bundle. */
function bundleId(bundle: WeaponBundle): string {
  const props = (bundle.weapon.properties ?? {}) as GameDataJson;
  return (props.id ?? '') as string;
}

/** Get all custom weapons as friendly types. */
export function getCustomWeapons(): CustomWeapon[] {
  return getAllBundles().map(bundleToFriendly);
}

/** Create and register a new custom weapon. Returns validation errors if any. */
export function createCustomWeapon(weapon: CustomWeapon): ValidationError[] {
  const all = getAllBundles();
  const existingIds = new Set(all.map(b => bundleId(b)));
  const errors = validateCustomWeapon(weapon, existingIds);
  if (errors.length > 0) return errors;

  const bundle = friendlyToBundle(weapon);
  registerCustomWeaponJson(bundle.weapon, bundle.statuses);
  persist([...all, bundle]);
  return [];
}

/** Update an existing custom weapon. Deregisters old, re-registers new. */
export function updateCustomWeapon(id: string, weapon: CustomWeapon): ValidationError[] {
  const all = getAllBundles();
  const existingBundle = all.find(b => bundleId(b) === id || bundleToFriendly(b).id === id);
  if (!existingBundle) return [{ field: 'id', message: 'Custom weapon not found' }];

  const existingIds = new Set(all.map(b => bundleId(b)));
  const errors = validateCustomWeapon(weapon, existingIds, id);
  if (errors.length > 0) return errors;

  deregisterCustomWeaponJson(existingBundle.weapon);
  const newBundle = friendlyToBundle(weapon);
  registerCustomWeaponJson(newBundle.weapon, newBundle.statuses);
  persist(all.map(b => (b === existingBundle ? newBundle : b)));
  return [];
}

/** Delete a custom weapon. */
export function deleteCustomWeapon(id: string): void {
  const all = getAllBundles();
  const existing = all.find(b => bundleId(b) === id || bundleToFriendly(b).id === id);
  if (!existing) return;
  deregisterCustomWeaponJson(existing.weapon);
  persist(all.filter(b => b !== existing));
}

/** Duplicate a custom weapon with a new id and name. */
export function duplicateCustomWeapon(id: string): CustomWeapon | null {
  const all = getAllBundles();
  const source = all.find(b => bundleId(b) === id || bundleToFriendly(b).id === id);
  if (!source) return null;
  const friendly = bundleToFriendly(source);
  friendly.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  friendly.name = `${friendly.name} (Copy)`;
  return friendly;
}

/** Generate a blank custom weapon template. */
export function getDefaultCustomWeapon(): CustomWeapon {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    weaponType: WeaponType.SWORD,
    weaponRarity: 5,
    baseAtk: { lv1: 42, lv90: 411 },
    skills: [
      { type: 'STAT_BOOST', label: 'Skill 1', statBoost: { stat: 'ATTACK_BONUS', values: [0, 0, 0, 0, 0, 0, 0, 0, 0] } },
      { type: 'STAT_BOOST', label: 'Skill 2', statBoost: { stat: 'ATTACK_BONUS', values: [0, 0, 0, 0, 0, 0, 0, 0, 0] } },
      { type: 'STAT_BOOST', label: 'Skill 3', statBoost: { stat: 'ATTACK_BONUS', values: [0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    ],
  };
}

/** Initialize: load all custom weapons from storage and register them. */
export function initCustomWeapons(): void {
  for (const bundle of getAllBundles()) {
    registerCustomWeaponJson(bundle.weapon, bundle.statuses);
  }
}
