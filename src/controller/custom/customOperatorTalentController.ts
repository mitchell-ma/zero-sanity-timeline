/**
 * Business logic for custom operator talent CRUD operations.
 */
import { ElementType } from '../../consts/enums';
import type { CustomOperatorTalent } from '../../model/custom/customOperatorTalentTypes';
import { loadCustomOperatorTalents, saveCustomOperatorTalents, validateCustomOperatorTalent } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';

let _cache: CustomOperatorTalent[] | null = null;

function getAll(): CustomOperatorTalent[] {
  if (!_cache) _cache = loadCustomOperatorTalents();
  return _cache;
}

function persist(talents: CustomOperatorTalent[]): void {
  _cache = talents;
  saveCustomOperatorTalents(talents);
}

/** Get all custom operator talents. */
export function getCustomOperatorTalents(): CustomOperatorTalent[] {
  return getAll();
}

/** Create a new custom operator talent. Returns validation errors if any. */
export function createCustomOperatorTalent(talent: CustomOperatorTalent): ValidationError[] {
  const all = getAll();
  const existingIds = new Set(all.map((t) => t.id));
  const errors = validateCustomOperatorTalent(talent, existingIds);
  if (errors.length > 0) return errors;
  persist([...all, talent]);
  return [];
}

/** Update an existing custom operator talent. */
export function updateCustomOperatorTalent(id: string, talent: CustomOperatorTalent): ValidationError[] {
  const all = getAll();
  if (!all.find((t) => t.id === id)) return [{ field: 'id', message: 'Custom operator talent not found' }];
  const existingIds = new Set(all.map((t) => t.id));
  const errors = validateCustomOperatorTalent(talent, existingIds, id);
  if (errors.length > 0) return errors;
  persist(all.map((t) => (t.id === id ? talent : t)));
  return [];
}

/** Delete a custom operator talent. */
export function deleteCustomOperatorTalent(id: string): void {
  const all = getAll();
  persist(all.filter((t) => t.id !== id));
}

/** Duplicate a custom operator talent with a new id and name. */
export function duplicateCustomOperatorTalent(id: string): CustomOperatorTalent | null {
  const all = getAll();
  const source = all.find((t) => t.id === id);
  if (!source) return null;
  const clone: CustomOperatorTalent = JSON.parse(JSON.stringify(source));
  clone.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  clone.name = `${source.name} (Copy)`;
  return clone;
}

/** Generate a blank custom operator talent template. */
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
