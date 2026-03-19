/**
 * Business logic for custom weapon effect CRUD operations.
 */
import { ElementType } from '../../consts/enums';
import type { CustomWeaponEffect } from '../../model/custom/customWeaponEffectTypes';
import { loadCustomWeaponEffects, saveCustomWeaponEffects, validateCustomWeaponEffect } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';

let _cache: CustomWeaponEffect[] | null = null;

function getAll(): CustomWeaponEffect[] {
  if (!_cache) _cache = loadCustomWeaponEffects();
  return _cache;
}

function persist(effects: CustomWeaponEffect[]): void {
  _cache = effects;
  saveCustomWeaponEffects(effects);
}

/** Get all custom weapon effects. */
export function getCustomWeaponEffects(): CustomWeaponEffect[] {
  return getAll();
}

/** Create a new custom weapon effect. Returns validation errors if any. */
export function createCustomWeaponEffect(effect: CustomWeaponEffect): ValidationError[] {
  const all = getAll();
  const existingIds = new Set(all.map((e) => e.id));
  const errors = validateCustomWeaponEffect(effect, existingIds);
  if (errors.length > 0) return errors;
  persist([...all, effect]);
  return [];
}

/** Update an existing custom weapon effect. */
export function updateCustomWeaponEffect(id: string, effect: CustomWeaponEffect): ValidationError[] {
  const all = getAll();
  if (!all.find((e) => e.id === id)) return [{ field: 'id', message: 'Custom weapon effect not found' }];
  const existingIds = new Set(all.map((e) => e.id));
  const errors = validateCustomWeaponEffect(effect, existingIds, id);
  if (errors.length > 0) return errors;
  persist(all.map((e) => (e.id === id ? effect : e)));
  return [];
}

/** Delete a custom weapon effect. */
export function deleteCustomWeaponEffect(id: string): void {
  const all = getAll();
  persist(all.filter((e) => e.id !== id));
}

/** Duplicate a custom weapon effect with a new id and name. */
export function duplicateCustomWeaponEffect(id: string): CustomWeaponEffect | null {
  const all = getAll();
  const source = all.find((e) => e.id === id);
  if (!source) return null;
  const clone: CustomWeaponEffect = JSON.parse(JSON.stringify(source));
  clone.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  clone.name = `${source.name} (Copy)`;
  return clone;
}

/** Generate a blank custom weapon effect template. */
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
