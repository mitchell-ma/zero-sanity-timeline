/**
 * Controller for custom skill CRUD operations.
 *
 * V2: Stores game data JSON (OperatorSkill format) with a wrapper for id/associations.
 * The editor still works with CustomSkill via adapters.
 */
import { NounType, AdjectiveType } from '../../dsl/semantics';
import type { CustomSkill } from '../../model/custom/customSkillTypes';
import {  } from '../../consts/enums';
import { checkIdConflict, loadGameDataArray, saveGameDataArray, STORAGE_KEYS } from '../../utils/customContentStorage';
import { removeAllLinksForSkill } from './customSkillLinkController';
import { skillToFriendly, skillFromFriendly } from './gameDataAdapters';

type GameDataJson = Record<string, unknown>;

/** V2 storage shape: game data JSON + wrapper metadata. */
interface SkillBundle {
  _wrapId: string;
  associationIds?: string[];
  skill: GameDataJson;
}

let cache: SkillBundle[] | null = null;

function getAllBundles(): SkillBundle[] {
  if (!cache) {
    const raw = loadGameDataArray(STORAGE_KEYS.skills);
    cache = raw.map(entry => {
      // Detect v1 vs v2 format
      if (entry._wrapId) {
        return entry as unknown as SkillBundle;
      }
      // v1 format: it's a CustomSkill directly
      if (typeof entry.id === 'string' && typeof entry.combatSkillType === 'string') {
        const friendly = entry as unknown as CustomSkill;
        return {
          _wrapId: friendly.id,
          associationIds: friendly.associationIds,
          skill: skillFromFriendly(friendly),
        };
      }
      // v2 game data JSON (no wrapper) — wrap it
      const props = (entry.properties ?? {}) as GameDataJson;
      return {
        _wrapId: (props.id ?? '') as string,
        skill: entry,
      };
    });
  }
  return cache;
}

function persist(bundles: SkillBundle[]): void {
  cache = bundles;
  saveGameDataArray(STORAGE_KEYS.skills, bundles as unknown as GameDataJson[]);
}

function bundleToFriendly(bundle: SkillBundle): CustomSkill {
  const friendly = skillToFriendly(bundle.skill, bundle._wrapId);
  friendly.id = bundle._wrapId;
  friendly.associationIds = bundle.associationIds;
  return friendly;
}

function friendlyToBundle(skill: CustomSkill): SkillBundle {
  return {
    _wrapId: skill.id,
    associationIds: skill.associationIds,
    skill: skillFromFriendly(skill),
  };
}

export function getCustomSkills(): CustomSkill[] {
  return getAllBundles().map(bundleToFriendly);
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
  const all = getAllBundles();
  const errors = validate(skill, new Set(all.map(b => b._wrapId)), true);
  if (errors.length > 0) return errors;
  persist([...all, friendlyToBundle(skill)]);
  return [];
}

export function updateCustomSkill(id: string, skill: CustomSkill): ValidationError[] {
  const all = getAllBundles();
  const idx = all.findIndex(b => b._wrapId === id);
  if (idx < 0) return [{ field: 'id', message: 'Skill not found' }];
  const existingIds = new Set(all.map(b => b._wrapId));
  const errors = validate(skill, existingIds, false, id);
  if (errors.length > 0) return errors;
  all[idx] = friendlyToBundle(skill);
  persist(all);
  return [];
}

export function deleteCustomSkill(id: string): void {
  persist(getAllBundles().filter(b => b._wrapId !== id));
  removeAllLinksForSkill(id);
}

export function duplicateCustomSkill(id: string): CustomSkill | null {
  const src = getAllBundles().find(b => b._wrapId === id);
  if (!src) return null;
  const friendly = bundleToFriendly(src);
  return { ...friendly, id: `${src._wrapId}_copy_${Date.now()}`, name: `${friendly.name} (Copy)`, associationIds: [] };
}

/**
 * Update a skill's associationIds using a transform function.
 * Called by the link controller to keep skill-side associations in sync.
 */
export function updateSkillAssociations(skillId: string, transform: (ids: string[]) => string[]): void {
  const all = getAllBundles();
  const idx = all.findIndex(b => b._wrapId === skillId);
  if (idx < 0) return;
  all[idx] = { ...all[idx], associationIds: transform(all[idx].associationIds ?? []) };
  persist(all);
}

export function getDefaultCustomSkill(): CustomSkill {
  return {
    id: `skill_${Date.now()}`,
    name: '',
    combatSkillType: NounType.BASIC_ATTACK,
    durationSeconds: 1,
  };
}
