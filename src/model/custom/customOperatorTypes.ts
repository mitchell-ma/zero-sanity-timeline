/**
 * Type definitions for user-created custom operators.
 * See docs/customizationSpec.md § 1.
 */
import { WeaponType, ElementType, CombatSkillType, TimeInteractionType } from '../../consts/enums';
import type { Clause, Interaction, Predicate } from '../../consts/semantics';
import type { StatType } from '../enums';
import type { OperatorClassType } from '../enums/operators';

/** A user-created custom operator. */
export interface CustomOperator {
  id: string;
  name: string;
  operatorClassType: OperatorClassType;
  elementType: ElementType;
  weaponType: WeaponType;
  operatorRarity: 4 | 5 | 6;
  splashArt?: string;
  mainAttributeType: StatType | string;
  secondaryAttributeType?: StatType | string;
  baseStats: {
    lv1: Partial<Record<StatType | string, number>>;
    lv90: Partial<Record<StatType | string, number>>;
  };
  potentials: CustomPotentialEntry[];
  skills?: {
    basicAttack: CustomCombatSkillDef;
    battleSkill: CustomCombatSkillDef;
    comboSkill: CustomCombatSkillDef;
    ultimate: CustomCombatSkillDef;
  };
  combo: {
    triggerClause: Predicate[];
    description: string;
    windowFrames?: number;
  };
  statusEvents?: CustomStatusEventDef[];
}

/** A custom combat skill definition. */
export interface CustomCombatSkillDef {
  name: string;
  combatSkillType: CombatSkillType;
  element?: ElementType;
  durationSeconds: number;
  cooldownSeconds?: number;
  animationSeconds?: number;
  timeInteractionType?: TimeInteractionType;
  resourceInteractions?: CustomResourceInteraction[];
  clause?: Clause;
  segments?: CustomSegmentDef[];
  multipliers?: { label: string; values: number[] }[];
  publishesTriggers?: Interaction[];
}

/** A resource interaction within a skill or frame. */
export interface CustomResourceInteraction {
  resourceType: string;
  verbType: string;
  value: number;
  target?: string;
}

/** A segment within a skill. */
export interface CustomSegmentDef {
  name?: string;
  durationSeconds: number;
  stats?: { statType: StatType | string; value: number[] }[];
  frames?: CustomFrameDef[];
}

/** A frame within a segment. */
export interface CustomFrameDef {
  offsetSeconds: number;
  damage?: {
    elementType: ElementType;
    multiplier: number[];
    damageType: string;
  };
  resourceInteractions?: CustomResourceInteraction[];
  statusInteractions?: Interaction[];
}

/** A potential entry. */
export interface CustomPotentialEntry {
  level: 1 | 2 | 3 | 4 | 5;
  type: string;
  description: string;
  statModifiers?: Partial<Record<StatType | string, number>>;
}

/** A custom status event definition (full StatusEvent DSL). */
export interface CustomStatusEventDef {
  name: string;
  target: string;
  element: ElementType;
  isNamedEvent: boolean;
  durationValues: number[];
  durationUnit: string;
  stack: {
    interactionType: string;
    max: number | number[];
    instances: number;
  };
  clause?: Clause;
  triggerClause: Clause;
  stats: { statType: StatType | string; value: number[] }[];
  segments?: CustomSegmentDef[];
}
