/**
 * Business logic for custom operator status CRUD operations.
 *
 * V2: Stores game data JSON (OperatorStatus format) with a wrapper for id/name/operatorId.
 * The editor still works with CustomOperatorStatus via adapters.
 */
import { ElementType } from '../../consts/enums';
import type { CustomOperatorStatus } from '../../model/custom/customOperatorStatusTypes';
import { loadGameDataArray, saveGameDataArray, STORAGE_KEYS, validateCustomOperatorStatus } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';
import { operatorStatusToFriendly, operatorStatusFromFriendly } from './gameDataAdapters';

type GameDataJson = Record<string, unknown>;

interface StatusBundle {
  _wrapId: string;
  _wrapName: string;
  operatorId?: string;
  status: GameDataJson;
}

let _cache: StatusBundle[] | null = null;

function getAllBundles(): StatusBundle[] {
  if (!_cache) {
    const raw = loadGameDataArray(STORAGE_KEYS.operatorStatuses);
    _cache = raw.map(entry => {
      if (entry._wrapId) return entry as unknown as StatusBundle;
      // v1 format: CustomOperatorStatus
      if (typeof entry.id === 'string' && entry.statusEvent) {
        const friendly = entry as unknown as CustomOperatorStatus;
        return {
          _wrapId: friendly.id,
          _wrapName: friendly.name,
          operatorId: friendly.operatorId,
          status: operatorStatusFromFriendly(friendly),
        };
      }
      // Already game data JSON
      const props = (entry.properties ?? {}) as GameDataJson;
      return {
        _wrapId: (props.id ?? '') as string,
        _wrapName: (props.name ?? '') as string,
        status: entry,
      };
    });
  }
  return _cache;
}

function persist(bundles: StatusBundle[]): void {
  _cache = bundles;
  saveGameDataArray(STORAGE_KEYS.operatorStatuses, bundles as unknown as GameDataJson[]);
}

function bundleToFriendly(bundle: StatusBundle): CustomOperatorStatus {
  const friendly = operatorStatusToFriendly(bundle.status, bundle._wrapId);
  friendly.name = bundle._wrapName || friendly.name;
  friendly.operatorId = bundle.operatorId;
  return friendly;
}

function friendlyToBundle(status: CustomOperatorStatus): StatusBundle {
  return {
    _wrapId: status.id,
    _wrapName: status.name,
    operatorId: status.operatorId,
    status: operatorStatusFromFriendly(status),
  };
}

export function getCustomOperatorStatuses(): CustomOperatorStatus[] {
  return getAllBundles().map(bundleToFriendly);
}

export function createCustomOperatorStatus(status: CustomOperatorStatus): ValidationError[] {
  const all = getAllBundles();
  const existingIds = new Set(all.map(b => b._wrapId));
  const errors = validateCustomOperatorStatus(status, existingIds);
  if (errors.length > 0) return errors;
  persist([...all, friendlyToBundle(status)]);
  return [];
}

export function updateCustomOperatorStatus(id: string, status: CustomOperatorStatus): ValidationError[] {
  const all = getAllBundles();
  if (!all.find(b => b._wrapId === id)) return [{ field: 'id', message: 'Custom operator status not found' }];
  const existingIds = new Set(all.map(b => b._wrapId));
  const errors = validateCustomOperatorStatus(status, existingIds, id);
  if (errors.length > 0) return errors;
  persist(all.map(b => (b._wrapId === id ? friendlyToBundle(status) : b)));
  return [];
}

export function deleteCustomOperatorStatus(id: string): void {
  persist(getAllBundles().filter(b => b._wrapId !== id));
}

export function duplicateCustomOperatorStatus(id: string): CustomOperatorStatus | null {
  const source = getAllBundles().find(b => b._wrapId === id);
  if (!source) return null;
  const friendly = bundleToFriendly(source);
  friendly.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  friendly.name = `${friendly.name} (Copy)`;
  return friendly;
}

export function getStatusesForOperator(operatorId: string): CustomOperatorStatus[] {
  return getAllBundles().filter(b => b.operatorId === operatorId).map(bundleToFriendly);
}

export function linkStatusToOperator(statusId: string, operatorId: string | undefined): void {
  const all = getAllBundles();
  if (!all.find(b => b._wrapId === statusId)) return;
  persist(all.map(b => (b._wrapId === statusId ? { ...b, operatorId } : b)));
}

export function getDefaultCustomOperatorStatus(): CustomOperatorStatus {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    statusEvent: {
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
    },
  };
}
