/**
 * Type definitions for user-created custom weapons.
 * See docs/customizationSpec.md § 2.
 */
import { WeaponType, ElementType } from '../../consts/enums';
import type { Interaction } from '../../consts/semantics';
import type { StatType } from '../enums';

/** A user-created custom weapon. */
export interface CustomWeapon {
  id: string;
  name: string;
  weaponType: WeaponType;
  weaponRarity: 3 | 4 | 5 | 6;
  icon?: string;
  baseAtk: { lv1: number; lv90: number };
  skills: CustomWeaponSkillDef[];
}

/** A weapon skill — either a passive stat boost or a triggered named effect. */
export interface CustomWeaponSkillDef {
  type: 'STAT_BOOST' | 'NAMED';
  label: string;
  statBoost?: {
    stat: StatType | string;
    values: number[];
  };
  namedEffect?: CustomWeaponNamedEffect;
}

/** A triggered named weapon skill effect. */
export interface CustomWeaponNamedEffect {
  name: string;
  description?: string;
  triggers: Interaction[];
  target: string;
  element?: ElementType;
  durationSeconds: number;
  maxStacks: number;
  cooldownSeconds?: number;
  buffs: CustomWeaponBuff[];
  passiveStats?: { stat: StatType | string; values: number[] }[];
  note?: string;
}

/** A buff applied by a named weapon skill effect, scaling by skill level 1-9. */
export interface CustomWeaponBuff {
  stat: StatType | string;
  valueMin: number;
  valueMax: number;
  perStack: boolean;
}

/** Max skill count by rarity. */
export function maxSkillsForRarity(rarity: number): number {
  if (rarity <= 3) return 2;
  return 3;
}
