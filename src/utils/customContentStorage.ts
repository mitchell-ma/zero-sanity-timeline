/**
 * Persistence for user-created custom content (weapons, gears, operators).
 * Follows the pattern from sheetStorage.ts — JSON in localStorage.
 */
import type { CustomWeapon } from '../model/custom/customWeaponTypes';
import { maxSkillsForRarity } from '../model/custom/customWeaponTypes';
import type { CustomGearSet } from '../model/custom/customGearTypes';
import type { CustomOperator } from '../model/custom/customOperatorTypes';
import { WEAPON_DATA } from '../model/weapons/weaponData';
import { GearCategory } from '../consts/enums';

const CUSTOM_WEAPONS_KEY = 'zst-custom-weapons';
const CUSTOM_GEARS_KEY = 'zst-custom-gear-sets';
const CUSTOM_OPERATORS_KEY = 'zst-custom-operators';
const CUSTOM_SKILLS_KEY = 'zst_custom_skills';

/** Remove all custom content from localStorage. */
export function clearAllCustomContent(): void {
  try {
    localStorage.removeItem(CUSTOM_WEAPONS_KEY);
    localStorage.removeItem(CUSTOM_GEARS_KEY);
    localStorage.removeItem(CUSTOM_OPERATORS_KEY);
    localStorage.removeItem(CUSTOM_SKILLS_KEY);
  } catch { /* ignore */ }
}

// ── Global ID uniqueness ──────────────────────────────────────────────────────

/**
 * Collect all IDs currently in use across all custom content types.
 * Returns a Map of id → content type label for conflict reporting.
 */
export function getAllCustomIds(): Map<string, string> {
  const ids = new Map<string, string>();

  const addItems = (key: string, label: string, idExtractor: (item: any) => string) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        const id = idExtractor(item);
        if (id) ids.set(id, label);
      }
    } catch { /* ignore */ }
  };

  addItems(CUSTOM_WEAPONS_KEY, 'weapon', (w) => w.id);
  addItems(CUSTOM_GEARS_KEY, 'gear set', (g) => g.id);
  addItems(CUSTOM_OPERATORS_KEY, 'operator', (o) => o.id);
  addItems(CUSTOM_SKILLS_KEY, 'skill', (s) => s.id);

  return ids;
}

/**
 * Check if an ID is globally unique across all custom content.
 * `excludeId` is the item's own current ID (for edit mode — don't flag self).
 * Returns the conflicting content type label, or null if unique.
 */
export function checkIdConflict(id: string, excludeId?: string): string | null {
  if (!id) return null;
  if (id === excludeId) return null;
  const allIds = getAllCustomIds();
  if (allIds.has(id) && id !== excludeId) return allIds.get(id)!;
  return null;
}

// ── Weapons ──────────────────────────────────────────────────────────────────

export function loadCustomWeapons(): CustomWeapon[] {
  try {
    const raw = localStorage.getItem(CUSTOM_WEAPONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveCustomWeapons(weapons: CustomWeapon[]): void {
  localStorage.setItem(CUSTOM_WEAPONS_KEY, JSON.stringify(weapons));
}

export interface ValidationError {
  field: string;
  message: string;
}

export function validateCustomWeapon(
  weapon: CustomWeapon,
  existingIds: Set<string>,
  originalId?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!weapon.id.trim()) {
    errors.push({ field: 'id', message: 'ID is required' });
  } else {
    const conflict = checkIdConflict(weapon.id, originalId ?? (existingIds.has(weapon.id) ? weapon.id : undefined));
    if (conflict) {
      errors.push({ field: 'id', message: `ID "${weapon.id}" is already used by a custom ${conflict}` });
    }
  }

  if (!weapon.name.trim()) {
    errors.push({ field: 'name', message: 'Name is required' });
  }

  // Name must be unique across all weapons (built-in + custom)
  if (weapon.name in WEAPON_DATA && !existingIds.has(weapon.id)) {
    errors.push({ field: 'name', message: `Weapon name "${weapon.name}" is already in use` });
  }

  if (weapon.baseAtk.lv1 <= 0) {
    errors.push({ field: 'baseAtk.lv1', message: 'Base ATK at Lv1 must be positive' });
  }
  if (weapon.baseAtk.lv90 <= 0) {
    errors.push({ field: 'baseAtk.lv90', message: 'Base ATK at Lv90 must be positive' });
  }

  const maxSkills = maxSkillsForRarity(weapon.weaponRarity);
  if (weapon.skills.length > maxSkills) {
    errors.push({ field: 'skills', message: `${weapon.weaponRarity}★ weapons can have at most ${maxSkills} skills` });
  }

  for (let i = 0; i < weapon.skills.length; i++) {
    const skill = weapon.skills[i];
    if (!skill.label.trim()) {
      errors.push({ field: `skills[${i}].label`, message: `Skill ${i + 1} label is required` });
    }
    if (skill.type === 'STAT_BOOST' && skill.statBoost) {
      if (skill.statBoost.values.length === 0) {
        errors.push({ field: `skills[${i}].statBoost.values`, message: `Skill ${i + 1} needs at least one value` });
      }
    }
    if (skill.type === 'NAMED' && skill.namedEffect) {
      const ne = skill.namedEffect;
      if (!ne.name.trim()) {
        errors.push({ field: `skills[${i}].namedEffect.name`, message: `Skill ${i + 1} effect name is required` });
      }
      if (ne.durationSeconds <= 0) {
        errors.push({ field: `skills[${i}].namedEffect.durationSeconds`, message: `Skill ${i + 1} duration must be positive` });
      }
      if (ne.maxStacks < 1) {
        errors.push({ field: `skills[${i}].namedEffect.maxStacks`, message: `Skill ${i + 1} max stacks must be at least 1` });
      }
      for (let j = 0; j < ne.buffs.length; j++) {
        const buff = ne.buffs[j];
        if (Math.sign(buff.valueMin) !== 0 && Math.sign(buff.valueMax) !== 0 && Math.sign(buff.valueMin) !== Math.sign(buff.valueMax)) {
          errors.push({ field: `skills[${i}].namedEffect.buffs[${j}]`, message: `Buff ${j + 1} min/max must have the same sign` });
        }
      }
    }
  }

  return errors;
}

// ── Gear Sets ───────────────────────────────────────────────────────────────

export function loadCustomGearSets(): CustomGearSet[] {
  try {
    const raw = localStorage.getItem(CUSTOM_GEARS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveCustomGearSets(gearSets: CustomGearSet[]): void {
  localStorage.setItem(CUSTOM_GEARS_KEY, JSON.stringify(gearSets));
}

export function validateCustomGearSet(
  gearSet: CustomGearSet,
  existingIds: Set<string>,
  originalId?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!gearSet.id.trim()) {
    errors.push({ field: 'id', message: 'ID is required' });
  } else {
    const conflict = checkIdConflict(gearSet.id, originalId ?? (existingIds.has(gearSet.id) ? gearSet.id : undefined));
    if (conflict) {
      errors.push({ field: 'id', message: `ID "${gearSet.id}" is already used by a custom ${conflict}` });
    }
  }

  if (!gearSet.setName.trim()) {
    errors.push({ field: 'setName', message: 'Set name is required' });
  }

  if (gearSet.pieces.length !== 3) {
    errors.push({ field: 'pieces', message: 'Must have exactly 3 pieces (Armor, Gloves, Kit)' });
  }

  const categories = new Set<GearCategory>();
  for (let i = 0; i < gearSet.pieces.length; i++) {
    const piece = gearSet.pieces[i];
    if (!piece.name.trim()) {
      errors.push({ field: `pieces[${i}].name`, message: `Piece ${i + 1} name is required` });
    }
    if (categories.has(piece.gearCategory)) {
      errors.push({ field: `pieces[${i}].gearCategory`, message: `Duplicate gear category: ${piece.gearCategory}` });
    }
    categories.add(piece.gearCategory);
    if (piece.defense < 0) {
      errors.push({ field: `pieces[${i}].defense`, message: `Piece ${i + 1} defense must be non-negative` });
    }
    if (!piece.statsByRank[1] || Object.keys(piece.statsByRank[1]).length === 0) {
      errors.push({ field: `pieces[${i}].statsByRank`, message: `Piece ${i + 1} must have at least one stat at rank 1` });
    }
  }

  if (gearSet.setEffect?.effects) {
    for (let i = 0; i < gearSet.setEffect.effects.length; i++) {
      const effect = gearSet.setEffect.effects[i];
      if (!effect.label.trim()) {
        errors.push({ field: `setEffect.effects[${i}].label`, message: `Effect ${i + 1} label is required` });
      }
      if (effect.durationSeconds <= 0) {
        errors.push({ field: `setEffect.effects[${i}].durationSeconds`, message: `Effect ${i + 1} duration must be positive` });
      }
      for (let j = 0; j < effect.buffs.length; j++) {
        if (effect.buffs[j].value === 0) {
          errors.push({ field: `setEffect.effects[${i}].buffs[${j}]`, message: `Buff ${j + 1} value must be non-zero` });
        }
      }
    }
  }

  return errors;
}

// ── Operators ───────────────────────────────────────────────────────────────

export function loadCustomOperators(): CustomOperator[] {
  try {
    const raw = localStorage.getItem(CUSTOM_OPERATORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveCustomOperators(operators: CustomOperator[]): void {
  localStorage.setItem(CUSTOM_OPERATORS_KEY, JSON.stringify(operators));
}

export function validateCustomOperator(
  operator: CustomOperator,
  existingIds: Set<string>,
  originalId?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!operator.id.trim()) {
    errors.push({ field: 'id', message: 'ID is required' });
  } else {
    const conflict = checkIdConflict(operator.id, originalId ?? (existingIds.has(operator.id) ? operator.id : undefined));
    if (conflict) {
      errors.push({ field: 'id', message: `ID "${operator.id}" is already used by a custom ${conflict}` });
    }
  }

  if (!operator.name.trim()) {
    errors.push({ field: 'name', message: 'Name is required' });
  }

  const lv1 = operator.baseStats.lv1;
  const lv90 = operator.baseStats.lv90;
  if (!lv1.BASE_ATTACK && !(lv1 as any)['BASE_ATTACK']) {
    errors.push({ field: 'baseStats.lv1', message: 'BASE_ATTACK is required at Lv1' });
  }
  if (!lv90.BASE_ATTACK && !(lv90 as any)['BASE_ATTACK']) {
    errors.push({ field: 'baseStats.lv90', message: 'BASE_ATTACK is required at Lv90' });
  }

  if (operator.skills) {
    for (const key of ['basicAttack', 'battleSkill', 'comboSkill', 'ultimate'] as const) {
      const skill = operator.skills[key];
      if (!skill.name.trim()) {
        errors.push({ field: `skills.${key}.name`, message: `${key} name is required` });
      }
      if (skill.durationSeconds <= 0) {
        errors.push({ field: `skills.${key}.durationSeconds`, message: `${key} duration must be positive` });
      }
    }
  }

  if (operator.combo.triggerClause.length === 0) {
    errors.push({ field: 'combo.triggerClause', message: 'At least one combo trigger condition is required' });
  }

  return errors;
}
