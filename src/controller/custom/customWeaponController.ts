/**
 * Business logic for custom weapon CRUD operations.
 */
import { WeaponType } from '../../consts/enums';
import type { CustomWeapon } from '../../model/custom/customWeaponTypes';
import { loadCustomWeapons, saveCustomWeapons, validateCustomWeapon } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';
import { registerCustomWeapon, deregisterCustomWeapon } from './customWeaponRegistrar';

let _cache: CustomWeapon[] | null = null;

function getAll(): CustomWeapon[] {
  if (!_cache) _cache = loadCustomWeapons();
  return _cache;
}

function persist(weapons: CustomWeapon[]): void {
  _cache = weapons;
  saveCustomWeapons(weapons);
}

/** Get all custom weapons. */
export function getCustomWeapons(): CustomWeapon[] {
  return getAll();
}

/** Create and register a new custom weapon. Returns validation errors if any. */
export function createCustomWeapon(weapon: CustomWeapon): ValidationError[] {
  const all = getAll();
  const existingIds = new Set(all.map((w) => w.id));
  const errors = validateCustomWeapon(weapon, existingIds);
  if (errors.length > 0) return errors;

  registerCustomWeapon(weapon);
  persist([...all, weapon]);
  return [];
}

/** Update an existing custom weapon. Deregisters old, re-registers new. */
export function updateCustomWeapon(id: string, weapon: CustomWeapon): ValidationError[] {
  const all = getAll();
  const existing = all.find((w) => w.id === id);
  if (!existing) return [{ field: 'id', message: 'Custom weapon not found' }];

  const existingIds = new Set(all.map((w) => w.id));
  const errors = validateCustomWeapon(weapon, existingIds, id);
  if (errors.length > 0) return errors;

  deregisterCustomWeapon(existing);
  registerCustomWeapon(weapon);
  persist(all.map((w) => (w.id === id ? weapon : w)));
  return [];
}

/** Delete a custom weapon. */
export function deleteCustomWeapon(id: string): void {
  const all = getAll();
  const existing = all.find((w) => w.id === id);
  if (!existing) return;
  deregisterCustomWeapon(existing);
  persist(all.filter((w) => w.id !== id));
}

/** Duplicate a custom weapon with a new id and name. */
export function duplicateCustomWeapon(id: string): CustomWeapon | null {
  const all = getAll();
  const source = all.find((w) => w.id === id);
  if (!source) return null;
  const clone: CustomWeapon = JSON.parse(JSON.stringify(source));
  clone.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  clone.name = `${source.name} (Copy)`;
  return clone;
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
  const weapons = getAll();
  for (const weapon of weapons) {
    registerCustomWeapon(weapon);
  }
}
