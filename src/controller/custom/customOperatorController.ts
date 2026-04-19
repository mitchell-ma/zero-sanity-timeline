/**
 * Business logic for custom operator CRUD operations.
 *
 * V2: Stores game data JSON (same format as built-in operators).
 * The editor still works with CustomOperator via adapters.
 */
import { WeaponType, ElementType } from '../../consts/enums';
import { OperatorClassType } from '../../model/enums/operators';
import { SubjectType, VerbType, ObjectType } from '../../dsl/semantics';
import type { CustomOperator } from '../../model/custom/customOperatorTypes';
import { loadGameDataArray, saveGameDataArray, STORAGE_KEYS, validateCustomOperator } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';
import { registerCustomOperatorJson, deregisterCustomOperatorJson } from './customOperatorRegistrar';
import { operatorToFriendly, operatorFromFriendly } from './gameDataAdapters';
import { removeAllLinksForOperator } from './customSkillLinkController';

type GameDataJson = Record<string, unknown>;

let _cache: GameDataJson[] | null = null;

function getAllJsons(): GameDataJson[] {
  if (!_cache) _cache = loadGameDataArray(STORAGE_KEYS.operators);
  return _cache;
}

function persist(jsons: GameDataJson[]): void {
  _cache = jsons;
  saveGameDataArray(STORAGE_KEYS.operators, jsons);
}

function jsonId(json: GameDataJson): string {
  return (json.id ?? '') as string;
}

export function getCustomOperators(): CustomOperator[] {
  return getAllJsons().map(j => operatorToFriendly(j));
}

export function createCustomOperator(operator: CustomOperator): ValidationError[] {
  const all = getAllJsons();
  const existingIds = new Set(all.map(j => jsonId(j)));
  const errors = validateCustomOperator(operator, existingIds);
  if (errors.length > 0) return errors;

  const json = operatorFromFriendly(operator);
  registerCustomOperatorJson(json);
  persist([...all, json]);
  return [];
}

export function updateCustomOperator(id: string, operator: CustomOperator): ValidationError[] {
  const all = getAllJsons();
  const existingJson = all.find(j => jsonId(j) === id || jsonId(j) === id.toUpperCase());
  if (!existingJson) return [{ field: 'id', message: 'Custom operator not found' }];

  const existingIds = new Set(all.map(j => jsonId(j)));
  const errors = validateCustomOperator(operator, existingIds, id);
  if (errors.length > 0) return errors;

  deregisterCustomOperatorJson(existingJson);
  const newJson = operatorFromFriendly(operator);
  registerCustomOperatorJson(newJson);
  persist(all.map(j => (j === existingJson ? newJson : j)));
  return [];
}

export function deleteCustomOperator(id: string): void {
  const all = getAllJsons();
  const existing = all.find(j => jsonId(j) === id || jsonId(j) === id.toUpperCase());
  if (!existing) return;
  deregisterCustomOperatorJson(existing);
  persist(all.filter(j => j !== existing));
  removeAllLinksForOperator(id);
}

export function duplicateCustomOperator(id: string): CustomOperator | null {
  const all = getAllJsons();
  const source = all.find(j => jsonId(j) === id || jsonId(j) === id.toUpperCase());
  if (!source) return null;
  const friendly = operatorToFriendly(source);
  friendly.id = `custom-op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  friendly.name = `${friendly.name} (Copy)`;
  return friendly;
}

export function getDefaultCustomOperator(): CustomOperator {
  return {
    id: `custom-op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    operatorClassType: OperatorClassType.STRIKER,
    elementType: ElementType.HEAT,
    weaponTypes: [WeaponType.SWORD],
    operatorRarity: 6,
    mainAttributeType: 'STRENGTH',
    baseStats: {
      lv1: {
        BASE_HP: 500,
        BASE_ATTACK: 30,
        BASE_DEFENSE: 0,
        STRENGTH: 10,
        AGILITY: 10,
        INTELLECT: 10,
        WILL: 10,
        WEIGHT: 1,
        CRITICAL_RATE: 0.05,
        CRITICAL_DAMAGE: 0.5,
        ATTACK_RANGE: 5,
      },
      lv90: {
        BASE_HP: 5000,
        BASE_ATTACK: 500,
        BASE_DEFENSE: 0,
        STRENGTH: 50,
        AGILITY: 50,
        INTELLECT: 50,
        WILL: 50,
        WEIGHT: 1,
        CRITICAL_RATE: 0.05,
        CRITICAL_DAMAGE: 0.5,
        ATTACK_RANGE: 5,
      },
    },
    potentials: [],
    combo: {
      onTriggerClause: [{
        conditions: [{
          subject: SubjectType.ENEMY,
          verb: VerbType.IS,
          object: ObjectType.COMBUSTED,
        }],
        effects: [],
      }],
      description: 'Available when enemy is Combusted',
    },
  };
}

export function initCustomOperators(): void {
  for (const json of getAllJsons()) {
    registerCustomOperatorJson(json);
  }
}
