/**
 * Business logic for custom gear effect CRUD operations.
 *
 * V2: Stores game data JSON (GearStatus[]) with a wrapper for metadata.
 * The editor still works with CustomGearEffect via adapters.
 */
import { ElementType } from '../../consts/enums';
import type { CustomGearEffect } from '../../model/custom/customGearEffectTypes';
import { loadGameDataArray, saveGameDataArray, STORAGE_KEYS, validateCustomGearEffect } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';
import { gearEffectToFriendly, gearEffectFromFriendly } from './gameDataAdapters';

type GameDataJson = Record<string, unknown>;

interface GearEffectBundle {
  _wrapId: string;
  _wrapName: string;
  gearSetId?: string;
  passiveStats?: Record<string, number>;
  statuses: GameDataJson[];
}

let _cache: GearEffectBundle[] | null = null;

function getAllBundles(): GearEffectBundle[] {
  if (!_cache) {
    const raw = loadGameDataArray(STORAGE_KEYS.gearEffects);
    _cache = raw.map(entry => {
      if (entry._wrapId) return entry as unknown as GearEffectBundle;
      // v1 format: CustomGearEffect
      if (typeof entry.id === 'string' && Array.isArray(entry.statusEvents)) {
        const friendly = entry as unknown as CustomGearEffect;
        return {
          _wrapId: friendly.id,
          _wrapName: friendly.name,
          gearSetId: friendly.gearSetId,
          passiveStats: friendly.passiveStats as Record<string, number> | undefined,
          statuses: gearEffectFromFriendly(friendly),
        };
      }
      return { _wrapId: '', _wrapName: '', statuses: [] };
    });
  }
  return _cache;
}

function persist(bundles: GearEffectBundle[]): void {
  _cache = bundles;
  saveGameDataArray(STORAGE_KEYS.gearEffects, bundles as unknown as GameDataJson[]);
}

function bundleToFriendly(bundle: GearEffectBundle): CustomGearEffect {
  const friendly = gearEffectToFriendly(bundle.statuses, bundle._wrapId, bundle._wrapName, bundle.gearSetId);
  friendly.passiveStats = bundle.passiveStats;
  return friendly;
}

function friendlyToBundle(effect: CustomGearEffect): GearEffectBundle {
  return {
    _wrapId: effect.id,
    _wrapName: effect.name,
    gearSetId: effect.gearSetId,
    passiveStats: effect.passiveStats as Record<string, number> | undefined,
    statuses: gearEffectFromFriendly(effect),
  };
}

export function getCustomGearEffects(): CustomGearEffect[] {
  return getAllBundles().map(bundleToFriendly);
}

export function createCustomGearEffect(effect: CustomGearEffect): ValidationError[] {
  const all = getAllBundles();
  const existingIds = new Set(all.map(b => b._wrapId));
  const errors = validateCustomGearEffect(effect, existingIds);
  if (errors.length > 0) return errors;
  persist([...all, friendlyToBundle(effect)]);
  return [];
}

export function updateCustomGearEffect(id: string, effect: CustomGearEffect): ValidationError[] {
  const all = getAllBundles();
  if (!all.find(b => b._wrapId === id)) return [{ field: 'id', message: 'Custom gear effect not found' }];
  const existingIds = new Set(all.map(b => b._wrapId));
  const errors = validateCustomGearEffect(effect, existingIds, id);
  if (errors.length > 0) return errors;
  persist(all.map(b => (b._wrapId === id ? friendlyToBundle(effect) : b)));
  return [];
}

export function deleteCustomGearEffect(id: string): void {
  persist(getAllBundles().filter(b => b._wrapId !== id));
}

export function duplicateCustomGearEffect(id: string): CustomGearEffect | null {
  const source = getAllBundles().find(b => b._wrapId === id);
  if (!source) return null;
  const friendly = bundleToFriendly(source);
  friendly.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  friendly.name = `${friendly.name} (Copy)`;
  return friendly;
}

export function getDefaultCustomGearEffect(): CustomGearEffect {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    passiveStats: {},
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
