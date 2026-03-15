/**
 * Controller for custom skill CRUD operations.
 */
import type { CustomSkill } from '../../model/custom/customSkillTypes';
import { checkIdConflict } from '../../utils/customContentStorage';
import { removeAllLinksForSkill } from './customSkillLinkController';

const STORAGE_KEY = 'zst_custom_skills';

function loadAll(): CustomSkill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAll(skills: CustomSkill[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
}

let cache: CustomSkill[] | null = null;

function getAll(): CustomSkill[] {
  if (!cache) cache = loadAll();
  return cache;
}

export function getCustomSkills(): CustomSkill[] {
  return getAll();
}

export interface ValidationError {
  field: string;
  message: string;
}

function validate(skill: CustomSkill, existingIds: Set<string>, isNew: boolean, originalId?: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!skill.id.trim()) {
    errors.push({ field: 'id', message: 'ID is required' });
  } else {
    const excludeId = originalId ?? (isNew ? undefined : (existingIds.has(skill.id) ? skill.id : undefined));
    const conflict = checkIdConflict(skill.id, excludeId);
    if (conflict) {
      errors.push({ field: 'id', message: `ID "${skill.id}" is already used by a custom ${conflict}` });
    }
  }
  if (!skill.name.trim()) errors.push({ field: 'name', message: 'Name is required' });
  if (skill.durationSeconds <= 0) errors.push({ field: 'durationSeconds', message: 'Duration must be positive' });
  return errors;
}

export function createCustomSkill(skill: CustomSkill): ValidationError[] {
  const all = getAll();
  const errors = validate(skill, new Set(all.map((s) => s.id)), true);
  if (errors.length > 0) return errors;
  all.push(skill);
  saveAll(all);
  cache = all;
  return [];
}

export function updateCustomSkill(id: string, skill: CustomSkill): ValidationError[] {
  const all = getAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx < 0) return [{ field: 'id', message: 'Skill not found' }];
  const existingIds = new Set(all.map((s) => s.id));
  const errors = validate(skill, existingIds, false, id);
  if (errors.length > 0) return errors;
  all[idx] = skill;
  saveAll(all);
  cache = all;
  return [];
}

export function deleteCustomSkill(id: string): void {
  const all = getAll().filter((s) => s.id !== id);
  saveAll(all);
  cache = all;
  removeAllLinksForSkill(id);
}

export function duplicateCustomSkill(id: string): CustomSkill | null {
  const src = getAll().find((s) => s.id === id);
  if (!src) return null;
  // Duplicate starts with no associations (it's a fresh skill)
  return { ...JSON.parse(JSON.stringify(src)), id: `${src.id}_copy_${Date.now()}`, name: `${src.name} (Copy)`, associationIds: [] };
}

/**
 * Update a skill's associationIds using a transform function.
 * Called by the link controller to keep skill-side associations in sync.
 */
export function updateSkillAssociations(skillId: string, transform: (ids: string[]) => string[]): void {
  const all = getAll();
  const idx = all.findIndex((s) => s.id === skillId);
  if (idx < 0) return;
  all[idx] = { ...all[idx], associationIds: transform(all[idx].associationIds ?? []) };
  saveAll(all);
  cache = all;
}

export function getDefaultCustomSkill(): CustomSkill {
  return {
    id: `skill_${Date.now()}`,
    name: '',
    combatSkillType: 'BASIC_ATTACK' as any,
    durationSeconds: 1,
  };
}
