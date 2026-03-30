/**
 * Business logic for custom operator talent CRUD operations.
 *
 * V2: Stores game data JSON (OperatorStatus[] per talent) with a wrapper for metadata.
 * The editor still works with CustomOperatorTalent via adapters.
 */
import { ElementType } from '../../consts/enums';
import type { CustomOperatorTalent } from '../../model/custom/customOperatorTalentTypes';
import { loadGameDataArray, saveGameDataArray, STORAGE_KEYS, validateCustomOperatorTalent } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';
import { operatorTalentToFriendly, operatorTalentFromFriendly } from './gameDataAdapters';

type GameDataJson = Record<string, unknown>;

interface TalentBundle {
  _wrapId: string;
  _wrapName: string;
  operatorId?: string;
  slot: number;
  maxLevel: number;
  statuses: GameDataJson[];
}

let _cache: TalentBundle[] | null = null;

function getAllBundles(): TalentBundle[] {
  if (!_cache) {
    const raw = loadGameDataArray(STORAGE_KEYS.operatorTalents);
    _cache = raw.map(entry => {
      if (entry._wrapId) return entry as unknown as TalentBundle;
      // v1 format: CustomOperatorTalent
      if (typeof entry.id === 'string' && Array.isArray(entry.statusEvents)) {
        const friendly = entry as unknown as CustomOperatorTalent;
        return {
          _wrapId: friendly.id,
          _wrapName: friendly.name,
          operatorId: friendly.operatorId,
          slot: friendly.slot,
          maxLevel: friendly.maxLevel,
          statuses: operatorTalentFromFriendly(friendly),
        };
      }
      return { _wrapId: '', _wrapName: '', slot: 1, maxLevel: 3, statuses: [] };
    });
  }
  return _cache;
}

function persist(bundles: TalentBundle[]): void {
  _cache = bundles;
  saveGameDataArray(STORAGE_KEYS.operatorTalents, bundles as unknown as GameDataJson[]);
}

function bundleToFriendly(bundle: TalentBundle): CustomOperatorTalent {
  return operatorTalentToFriendly(
    bundle.statuses, bundle._wrapId, bundle._wrapName,
    bundle.slot, bundle.maxLevel, bundle.operatorId,
  );
}

function friendlyToBundle(talent: CustomOperatorTalent): TalentBundle {
  return {
    _wrapId: talent.id,
    _wrapName: talent.name,
    operatorId: talent.operatorId,
    slot: talent.slot,
    maxLevel: talent.maxLevel,
    statuses: operatorTalentFromFriendly(talent),
  };
}

export function getCustomOperatorTalents(): CustomOperatorTalent[] {
  return getAllBundles().map(bundleToFriendly);
}

export function createCustomOperatorTalent(talent: CustomOperatorTalent): ValidationError[] {
  const all = getAllBundles();
  const existingIds = new Set(all.map(b => b._wrapId));
  const errors = validateCustomOperatorTalent(talent, existingIds);
  if (errors.length > 0) return errors;
  persist([...all, friendlyToBundle(talent)]);
  return [];
}

export function updateCustomOperatorTalent(id: string, talent: CustomOperatorTalent): ValidationError[] {
  const all = getAllBundles();
  if (!all.find(b => b._wrapId === id)) return [{ field: 'id', message: 'Custom operator talent not found' }];
  const existingIds = new Set(all.map(b => b._wrapId));
  const errors = validateCustomOperatorTalent(talent, existingIds, id);
  if (errors.length > 0) return errors;
  persist(all.map(b => (b._wrapId === id ? friendlyToBundle(talent) : b)));
  return [];
}

export function deleteCustomOperatorTalent(id: string): void {
  persist(getAllBundles().filter(b => b._wrapId !== id));
}

export function duplicateCustomOperatorTalent(id: string): CustomOperatorTalent | null {
  const source = getAllBundles().find(b => b._wrapId === id);
  if (!source) return null;
  const friendly = bundleToFriendly(source);
  friendly.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  friendly.name = `${friendly.name} (Copy)`;
  return friendly;
}

export function getTalentsForOperator(operatorId: string): CustomOperatorTalent[] {
  return getAllBundles().filter(b => b.operatorId === operatorId).map(bundleToFriendly);
}

export function linkTalentToOperator(talentId: string, operatorId: string | undefined): void {
  const all = getAllBundles();
  if (!all.find(b => b._wrapId === talentId)) return;
  persist(all.map(b => (b._wrapId === talentId ? { ...b, operatorId } : b)));
}

export function getDefaultCustomOperatorTalent(): CustomOperatorTalent {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    slot: 1,
    maxLevel: 3,
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
