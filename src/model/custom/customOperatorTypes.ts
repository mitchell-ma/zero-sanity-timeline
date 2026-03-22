/**
 * Type definitions for user-created custom operators.
 * See docs/customizationSpec.md § 1.
 */
import { WeaponType, ElementType, CombatSkillType, TimeInteractionType } from '../../consts/enums';
import type { Clause, Predicate } from '../../dsl/semantics';
import type { StatType } from '../enums';
import type { OperatorClassType } from '../enums/operators';
import type { CustomResourceInteraction, CustomSegmentDef } from './customStatusEventTypes';

// Re-export shared types for backward compatibility
export type { CustomStatusEventDef, CustomResourceInteraction, CustomSegmentDef, CustomFrameDef } from './customStatusEventTypes';

/** A user-created custom operator. */
export interface CustomOperator {
  id: string;
  name: string;
  operatorClassType: OperatorClassType;
  elementType: ElementType;
  weaponTypes: WeaponType[];
  operatorRarity: 4 | 5 | 6;
  splashArt?: string;
  mainAttributeType: StatType | string;
  secondaryAttributeType?: StatType | string;
  baseStats: {
    lv1: Partial<Record<StatType | string, number>>;
    lv90: Partial<Record<StatType | string, number>>;
  };
  potentials: CustomPotentialEntry[];
  /** All combat skills — grouped by combatSkillType in the UI. */
  skills: CustomCombatSkillDef[];
  combo: {
    onTriggerClause: Predicate[];
    description: string;
    windowFrames?: number;
  };
  statusEvents?: import('./customStatusEventTypes').CustomStatusEventDef[];
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
}

/** A potential entry. */
export interface CustomPotentialEntry {
  level: 1 | 2 | 3 | 4 | 5;
  type: string;
  description: string;
  statModifiers?: Partial<Record<StatType | string, number>>;
}
