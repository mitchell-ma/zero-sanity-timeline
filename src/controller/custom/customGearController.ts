/**
 * Business logic for custom gear set CRUD operations.
 *
 * V2: Stores gear set bundles as { setEffect, pieces, statuses }.
 * The editor still works with CustomGearSet via adapters.
 */
import { GearCategory } from '../../consts/enums';
import type { CustomGearSet } from '../../model/custom/customGearTypes';
import { loadGameDataArray, saveGameDataArray, STORAGE_KEYS, validateCustomGearSet } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';
import { registerCustomGearSetJson, deregisterCustomGearSetJson } from './customGearRegistrar';
import {
  gearSetToFriendly,
  gearPiecesFromFriendly,
  gearSetEffectFromFriendly,
  gearSetStatusesFromFriendly,
} from './gameDataAdapters';

type GameDataJson = Record<string, unknown>;

interface GearSetBundle {
  setEffect: GameDataJson | null;
  pieces: GameDataJson[];
  statuses: GameDataJson[];
}

let _cache: GearSetBundle[] | null = null;

function getAllBundles(): GearSetBundle[] {
  if (!_cache) {
    const raw = loadGameDataArray(STORAGE_KEYS.gearSets);
    _cache = raw.map(entry => ({
      setEffect: (entry.setEffect ?? null) as GameDataJson | null,
      pieces: (entry.pieces ?? []) as GameDataJson[],
      statuses: (entry.statuses ?? []) as GameDataJson[],
    }));
  }
  return _cache;
}

function persist(bundles: GearSetBundle[]): void {
  _cache = bundles;
  saveGameDataArray(STORAGE_KEYS.gearSets, bundles as unknown as GameDataJson[]);
}

function bundleToFriendly(bundle: GearSetBundle): CustomGearSet {
  const setProps = bundle.setEffect ? (bundle.setEffect.properties ?? {}) as GameDataJson : {};
  const gearSetId = (setProps.id ?? '') as string;
  return gearSetToFriendly(bundle.setEffect ?? undefined, bundle.pieces, bundle.statuses, gearSetId);
}

function friendlyToBundle(gearSet: CustomGearSet): GearSetBundle {
  return {
    setEffect: gearSetEffectFromFriendly(gearSet),
    pieces: gearPiecesFromFriendly(gearSet),
    statuses: gearSetStatusesFromFriendly(gearSet),
  };
}

function bundleId(bundle: GearSetBundle): string {
  if (!bundle.setEffect) return '';
  const props = (bundle.setEffect.properties ?? {}) as GameDataJson;
  return (props.id ?? '') as string;
}

export function getCustomGearSets(): CustomGearSet[] {
  return getAllBundles().map(bundleToFriendly);
}

export function createCustomGearSet(gearSet: CustomGearSet): ValidationError[] {
  const all = getAllBundles();
  const existingIds = new Set(all.map(b => bundleId(b)));
  const errors = validateCustomGearSet(gearSet, existingIds);
  if (errors.length > 0) return errors;

  const bundle = friendlyToBundle(gearSet);
  registerCustomGearSetJson(bundle.setEffect, bundle.pieces, bundle.statuses);
  persist([...all, bundle]);
  return [];
}

export function updateCustomGearSet(id: string, gearSet: CustomGearSet): ValidationError[] {
  const all = getAllBundles();
  const existing = all.find(b => bundleId(b) === id || bundleToFriendly(b).id === id);
  if (!existing) return [{ field: 'id', message: 'Custom gear set not found' }];

  const existingIds = new Set(all.map(b => bundleId(b)));
  const errors = validateCustomGearSet(gearSet, existingIds, id);
  if (errors.length > 0) return errors;

  deregisterCustomGearSetJson(existing.setEffect, existing.pieces);
  const newBundle = friendlyToBundle(gearSet);
  registerCustomGearSetJson(newBundle.setEffect, newBundle.pieces, newBundle.statuses);
  persist(all.map(b => (b === existing ? newBundle : b)));
  return [];
}

export function deleteCustomGearSet(id: string): void {
  const all = getAllBundles();
  const existing = all.find(b => bundleId(b) === id || bundleToFriendly(b).id === id);
  if (!existing) return;
  deregisterCustomGearSetJson(existing.setEffect, existing.pieces);
  persist(all.filter(b => b !== existing));
}

export function duplicateCustomGearSet(id: string): CustomGearSet | null {
  const all = getAllBundles();
  const source = all.find(b => bundleId(b) === id || bundleToFriendly(b).id === id);
  if (!source) return null;
  const friendly = bundleToFriendly(source);
  friendly.id = `custom-gear-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  friendly.setName = `${friendly.setName} (Copy)`;
  for (const piece of friendly.pieces) {
    piece.name = piece.name.replace(friendly.setName.replace(' (Copy)', ''), friendly.setName);
  }
  return friendly;
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
  for (const bundle of getAllBundles()) {
    registerCustomGearSetJson(bundle.setEffect, bundle.pieces, bundle.statuses);
  }
}
