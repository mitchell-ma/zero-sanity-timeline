/**
 * Business logic for custom gear effect CRUD operations.
 */
import { ElementType } from '../../consts/enums';
import type { CustomGearEffect } from '../../model/custom/customGearEffectTypes';
import { loadCustomGearEffects, saveCustomGearEffects, validateCustomGearEffect } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';

let _cache: CustomGearEffect[] | null = null;

function getAll(): CustomGearEffect[] {
  if (!_cache) _cache = loadCustomGearEffects();
  return _cache;
}

function persist(effects: CustomGearEffect[]): void {
  _cache = effects;
  saveCustomGearEffects(effects);
}

/** Get all custom gear effects. */
export function getCustomGearEffects(): CustomGearEffect[] {
  return getAll();
}

/** Create a new custom gear effect. Returns validation errors if any. */
export function createCustomGearEffect(effect: CustomGearEffect): ValidationError[] {
  const all = getAll();
  const existingIds = new Set(all.map((e) => e.id));
  const errors = validateCustomGearEffect(effect, existingIds);
  if (errors.length > 0) return errors;
  persist([...all, effect]);
  return [];
}

/** Update an existing custom gear effect. */
export function updateCustomGearEffect(id: string, effect: CustomGearEffect): ValidationError[] {
  const all = getAll();
  if (!all.find((e) => e.id === id)) return [{ field: 'id', message: 'Custom gear effect not found' }];
  const existingIds = new Set(all.map((e) => e.id));
  const errors = validateCustomGearEffect(effect, existingIds, id);
  if (errors.length > 0) return errors;
  persist(all.map((e) => (e.id === id ? effect : e)));
  return [];
}

/** Delete a custom gear effect. */
export function deleteCustomGearEffect(id: string): void {
  const all = getAll();
  persist(all.filter((e) => e.id !== id));
}

/** Duplicate a custom gear effect with a new id and name. */
export function duplicateCustomGearEffect(id: string): CustomGearEffect | null {
  const all = getAll();
  const source = all.find((e) => e.id === id);
  if (!source) return null;
  const clone: CustomGearEffect = JSON.parse(JSON.stringify(source));
  clone.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  clone.name = `${source.name} (Copy)`;
  return clone;
}

/** Generate a blank custom gear effect template. */
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
