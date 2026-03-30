/**
 * Business logic for custom weapon effect CRUD operations.
 *
 * V2: Stores game data JSON (WeaponStatus[]) with a wrapper for metadata.
 * The editor still works with CustomWeaponEffect via adapters.
 */
import { ElementType } from '../../consts/enums';
import type { CustomWeaponEffect } from '../../model/custom/customWeaponEffectTypes';
import { loadGameDataArray, saveGameDataArray, STORAGE_KEYS, validateCustomWeaponEffect } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';
import { weaponEffectToFriendly, weaponEffectFromFriendly } from './gameDataAdapters';

type GameDataJson = Record<string, unknown>;

interface WeaponEffectBundle {
  _wrapId: string;
  _wrapName: string;
  weaponId?: string;
  statuses: GameDataJson[];
}

let _cache: WeaponEffectBundle[] | null = null;

function getAllBundles(): WeaponEffectBundle[] {
  if (!_cache) {
    const raw = loadGameDataArray(STORAGE_KEYS.weaponEffects);
    _cache = raw.map(entry => {
      if (entry._wrapId) return entry as unknown as WeaponEffectBundle;
      // v1 format: CustomWeaponEffect
      if (typeof entry.id === 'string' && Array.isArray(entry.statusEvents)) {
        const friendly = entry as unknown as CustomWeaponEffect;
        return {
          _wrapId: friendly.id,
          _wrapName: friendly.name,
          weaponId: friendly.weaponId,
          statuses: weaponEffectFromFriendly(friendly),
        };
      }
      return { _wrapId: '', _wrapName: '', statuses: [] };
    });
  }
  return _cache;
}

function persist(bundles: WeaponEffectBundle[]): void {
  _cache = bundles;
  saveGameDataArray(STORAGE_KEYS.weaponEffects, bundles as unknown as GameDataJson[]);
}

function bundleToFriendly(bundle: WeaponEffectBundle): CustomWeaponEffect {
  return weaponEffectToFriendly(bundle.statuses, bundle._wrapId, bundle._wrapName, bundle.weaponId);
}

function friendlyToBundle(effect: CustomWeaponEffect): WeaponEffectBundle {
  return {
    _wrapId: effect.id,
    _wrapName: effect.name,
    weaponId: effect.weaponId,
    statuses: weaponEffectFromFriendly(effect),
  };
}

export function getCustomWeaponEffects(): CustomWeaponEffect[] {
  return getAllBundles().map(bundleToFriendly);
}

export function createCustomWeaponEffect(effect: CustomWeaponEffect): ValidationError[] {
  const all = getAllBundles();
  const existingIds = new Set(all.map(b => b._wrapId));
  const errors = validateCustomWeaponEffect(effect, existingIds);
  if (errors.length > 0) return errors;
  persist([...all, friendlyToBundle(effect)]);
  return [];
}

export function updateCustomWeaponEffect(id: string, effect: CustomWeaponEffect): ValidationError[] {
  const all = getAllBundles();
  if (!all.find(b => b._wrapId === id)) return [{ field: 'id', message: 'Custom weapon effect not found' }];
  const existingIds = new Set(all.map(b => b._wrapId));
  const errors = validateCustomWeaponEffect(effect, existingIds, id);
  if (errors.length > 0) return errors;
  persist(all.map(b => (b._wrapId === id ? friendlyToBundle(effect) : b)));
  return [];
}

export function deleteCustomWeaponEffect(id: string): void {
  persist(getAllBundles().filter(b => b._wrapId !== id));
}

export function duplicateCustomWeaponEffect(id: string): CustomWeaponEffect | null {
  const source = getAllBundles().find(b => b._wrapId === id);
  if (!source) return null;
  const friendly = bundleToFriendly(source);
  friendly.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  friendly.name = `${friendly.name} (Copy)`;
  return friendly;
}

export function getDefaultCustomWeaponEffect(): CustomWeaponEffect {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    statusEvents: [{
      name: '',
      target: 'wielder',
      element: ElementType.PHYSICAL,
      isNamedEvent: false,
      durationValues: [10],
      durationUnit: 'seconds',
      stack: { interactionType: 'REPLACE', max: 1, instances: 1 },
      clause: [],
      onTriggerClause: [],
      stats: [],
    }],
  };
}
