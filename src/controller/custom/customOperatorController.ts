/**
 * Business logic for custom operator CRUD operations.
 */
import { WeaponType, ElementType, CombatSkillType, TimeInteractionType } from '../../consts/enums';
import { OperatorClassType } from '../../model/enums/operators';
import { SubjectType, VerbType, ObjectType } from '../../consts/semantics';
import type { CustomOperator } from '../../model/custom/customOperatorTypes';
import { loadCustomOperators, saveCustomOperators, validateCustomOperator } from '../../utils/customContentStorage';
import type { ValidationError } from '../../utils/customContentStorage';
import { registerCustomOperator, deregisterCustomOperator } from './customOperatorRegistrar';
import { removeAllLinksForOperator } from './customSkillLinkController';

let _cache: CustomOperator[] | null = null;

function getAll(): CustomOperator[] {
  if (!_cache) _cache = loadCustomOperators();
  return _cache;
}

function persist(operators: CustomOperator[]): void {
  _cache = operators;
  saveCustomOperators(operators);
}

export function getCustomOperators(): CustomOperator[] {
  return getAll();
}

export function createCustomOperator(operator: CustomOperator): ValidationError[] {
  const all = getAll();
  const existingIds = new Set(all.map((o) => o.id));
  const errors = validateCustomOperator(operator, existingIds);
  if (errors.length > 0) return errors;

  registerCustomOperator(operator);
  persist([...all, operator]);
  return [];
}

export function updateCustomOperator(id: string, operator: CustomOperator): ValidationError[] {
  const all = getAll();
  const existing = all.find((o) => o.id === id);
  if (!existing) return [{ field: 'id', message: 'Custom operator not found' }];

  const existingIds = new Set(all.map((o) => o.id));
  const errors = validateCustomOperator(operator, existingIds, id);
  if (errors.length > 0) return errors;

  deregisterCustomOperator(existing);
  registerCustomOperator(operator);
  persist(all.map((o) => (o.id === id ? operator : o)));
  return [];
}

export function deleteCustomOperator(id: string): void {
  const all = getAll();
  const existing = all.find((o) => o.id === id);
  if (!existing) return;
  deregisterCustomOperator(existing);
  persist(all.filter((o) => o.id !== id));
  removeAllLinksForOperator(id);
}

export function duplicateCustomOperator(id: string): CustomOperator | null {
  const all = getAll();
  const source = all.find((o) => o.id === id);
  if (!source) return null;
  const clone: CustomOperator = JSON.parse(JSON.stringify(source));
  clone.id = `custom-op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  clone.name = `${source.name} (Copy)`;
  return clone;
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
      lv1: { BASE_ATTACK: 50, BASE_HP: 800 },
      lv90: { BASE_ATTACK: 500, BASE_HP: 5000 },
    },
    potentials: [],
    skills: [
      { name: 'Basic Attack', combatSkillType: CombatSkillType.BASIC_ATTACK, durationSeconds: 3 },
      { name: 'Battle Skill', combatSkillType: CombatSkillType.BATTLE_SKILL, durationSeconds: 2,
        resourceInteractions: [{ resourceType: 'SKILL_POINT', verb: 'CONSUME', value: 100 }] },
      { name: 'Combo Skill', combatSkillType: CombatSkillType.COMBO_SKILL, durationSeconds: 2,
        cooldownSeconds: 15, animationSeconds: 1, timeInteractionType: TimeInteractionType.TIME_STOP },
      { name: 'Ultimate', combatSkillType: CombatSkillType.ULTIMATE, durationSeconds: 15,
        cooldownSeconds: 10, animationSeconds: 2, timeInteractionType: TimeInteractionType.TIME_STOP,
        resourceInteractions: [{ resourceType: 'ULTIMATE_ENERGY', verb: 'CONSUME', value: 300 }] },
    ],
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
  const operators = getAll();
  for (const operator of operators) {
    registerCustomOperator(operator);
  }
}
