/**
 * Type definitions for user-created custom gear sets.
 * See docs/customizationSpec.md § 3.
 */
import { GearCategory } from '../../consts/enums';
import type { Interaction } from '../../dsl/semantics';
import type { StatType } from '../enums';

/** A user-created custom gear set (3 pieces + optional set effect). */
export interface CustomGearSet {
  id: string;
  setName: string;
  rarity: 4 | 5 | 6;
  icon?: string;
  pieces: CustomGearPiece[];
  setEffect?: CustomGearSetEffect;
}

/** A single gear piece within a custom set. */
export interface CustomGearPiece {
  name: string;
  gearCategory: GearCategory;
  defense: number;
  statsByRank: Record<number, Partial<Record<StatType | string, number>>>;
}

/** Set effect (3-piece bonus). */
export interface CustomGearSetEffect {
  passiveStats?: Partial<Record<StatType | string, number>>;
  effects?: CustomGearEffect[];
}

/** A triggered gear effect. */
export interface CustomGearEffect {
  label: string;
  triggers: Interaction[];
  target: string;
  durationSeconds: number;
  maxStacks: number;
  cooldownSeconds?: number;
  buffs: CustomGearBuff[];
  note?: string;
}

/** A buff applied by a triggered gear effect. */
export interface CustomGearBuff {
  stat: StatType | string;
  value: number;
  perStack: boolean;
}
