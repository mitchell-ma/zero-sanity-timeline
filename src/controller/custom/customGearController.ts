/**
 * Business logic for custom gear set CRUD operations.
 */
import { GearCategory } from '../../consts/enums';
import type { CustomGearSet } from '../../model/custom/customGearTypes';
import { loadCustomGearSets, saveCustomGearSets, validateCustomGearSet } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';
import { registerCustomGearSet, deregisterCustomGearSet } from './customGearRegistrar';

let _cache: CustomGearSet[] | null = null;

function getAll(): CustomGearSet[] {
  if (!_cache) _cache = loadCustomGearSets();
  return _cache;
}

function persist(gearSets: CustomGearSet[]): void {
  _cache = gearSets;
  saveCustomGearSets(gearSets);
}

export function getCustomGearSets(): CustomGearSet[] {
  return getAll();
}

export function createCustomGearSet(gearSet: CustomGearSet): ValidationError[] {
  const all = getAll();
  const existingIds = new Set(all.map((g) => g.id));
  const errors = validateCustomGearSet(gearSet, existingIds);
  if (errors.length > 0) return errors;

  registerCustomGearSet(gearSet);
  persist([...all, gearSet]);
  return [];
}

export function updateCustomGearSet(id: string, gearSet: CustomGearSet): ValidationError[] {
  const all = getAll();
  const existing = all.find((g) => g.id === id);
  if (!existing) return [{ field: 'id', message: 'Custom gear set not found' }];

  const existingIds = new Set(all.map((g) => g.id));
  const errors = validateCustomGearSet(gearSet, existingIds, id);
  if (errors.length > 0) return errors;

  deregisterCustomGearSet(existing);
  registerCustomGearSet(gearSet);
  persist(all.map((g) => (g.id === id ? gearSet : g)));
  return [];
}

export function deleteCustomGearSet(id: string): void {
  const all = getAll();
  const existing = all.find((g) => g.id === id);
  if (!existing) return;
  deregisterCustomGearSet(existing);
  persist(all.filter((g) => g.id !== id));
}

export function duplicateCustomGearSet(id: string): CustomGearSet | null {
  const all = getAll();
  const source = all.find((g) => g.id === id);
  if (!source) return null;
  const clone: CustomGearSet = JSON.parse(JSON.stringify(source));
  clone.id = `custom-gear-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  clone.setName = `${source.setName} (Copy)`;
  for (const piece of clone.pieces) {
    piece.name = piece.name.replace(source.setName, clone.setName);
  }
  return clone;
}

export function getDefaultCustomGearSet(): CustomGearSet {
  return {
    id: `custom-gear-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    setName: '',
    rarity: 5,
    pieces: [
      { name: 'Armor', gearCategory: GearCategory.ARMOR, defense: 0, statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} } },
      { name: 'Gloves', gearCategory: GearCategory.GLOVES, defense: 0, statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} } },
      { name: 'Kit', gearCategory: GearCategory.KIT, defense: 0, statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} } },
    ],
  };
}

export function initCustomGearSets(): void {
  const gearSets = getAll();
  for (const gearSet of gearSets) {
    registerCustomGearSet(gearSet);
  }
}
