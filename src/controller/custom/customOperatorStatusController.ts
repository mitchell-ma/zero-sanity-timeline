/**
 * Business logic for custom operator status CRUD operations.
 */
import { ElementType } from '../../consts/enums';
import type { CustomOperatorStatus } from '../../model/custom/customOperatorStatusTypes';
import { loadCustomOperatorStatuses, saveCustomOperatorStatuses, validateCustomOperatorStatus } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';

let _cache: CustomOperatorStatus[] | null = null;

function getAll(): CustomOperatorStatus[] {
  if (!_cache) _cache = loadCustomOperatorStatuses();
  return _cache;
}

function persist(statuses: CustomOperatorStatus[]): void {
  _cache = statuses;
  saveCustomOperatorStatuses(statuses);
}

/** Get all custom operator statuses. */
export function getCustomOperatorStatuses(): CustomOperatorStatus[] {
  return getAll();
}

/** Create a new custom operator status. Returns validation errors if any. */
export function createCustomOperatorStatus(status: CustomOperatorStatus): ValidationError[] {
  const all = getAll();
  const existingIds = new Set(all.map((s) => s.id));
  const errors = validateCustomOperatorStatus(status, existingIds);
  if (errors.length > 0) return errors;
  persist([...all, status]);
  return [];
}

/** Update an existing custom operator status. */
export function updateCustomOperatorStatus(id: string, status: CustomOperatorStatus): ValidationError[] {
  const all = getAll();
  if (!all.find((s) => s.id === id)) return [{ field: 'id', message: 'Custom operator status not found' }];
  const existingIds = new Set(all.map((s) => s.id));
  const errors = validateCustomOperatorStatus(status, existingIds, id);
  if (errors.length > 0) return errors;
  persist(all.map((s) => (s.id === id ? status : s)));
  return [];
}

/** Delete a custom operator status. */
export function deleteCustomOperatorStatus(id: string): void {
  const all = getAll();
  persist(all.filter((s) => s.id !== id));
}

/** Duplicate a custom operator status with a new id and name. */
export function duplicateCustomOperatorStatus(id: string): CustomOperatorStatus | null {
  const all = getAll();
  const source = all.find((s) => s.id === id);
  if (!source) return null;
  const clone: CustomOperatorStatus = JSON.parse(JSON.stringify(source));
  clone.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  clone.name = `${source.name} (Copy)`;
  return clone;
}

/** Generate a blank custom operator status template. */
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
