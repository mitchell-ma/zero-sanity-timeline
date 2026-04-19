/**
 * Pure helpers for generating loadout view permutations.
 *
 * Given a per-slot selection of view variable values, produce the cartesian
 * product of overrides plus a human-readable name for each permutation.
 */

import { ViewVariableType } from '../consts/enums';
import type { ViewSelections, ViewOverride } from './loadoutStorage';

/** Per-slot context needed to build permutations and labels. */
export interface ViewSlotContext {
  slotId: string;
  /** Display name for the operator in this slot (used in view labels). */
  operatorName: string;
  /** Whether the equipped weapon supports skill3. If false, that variable is ignored for this slot. */
  hasWeaponSkill3: boolean;
  /** Current pinned operator potential (used for default selections). */
  currentPotential: number;
  /** Current pinned weapon skill3 level (used for default selections). */
  currentSkill3Level: number;
}

export interface GeneratedView {
  name: string;
  override: ViewOverride;
}

/**
 * Cartesian product over (slot, variable) selections, restricted to values
 * permissible for the slot. Slots missing a configured selection contribute
 * no override for that variable (parent value is used).
 */
export function generateViewPermutations(
  selections: ViewSelections,
  slots: ViewSlotContext[],
): GeneratedView[] {
  const axes: { slotId: string; variable: ViewVariableType; values: number[] }[] = [];

  for (const slot of slots) {
    const slotSel = selections[slot.slotId];
    if (!slotSel) continue;
    for (const variable of [ViewVariableType.OPERATOR_POTENTIAL, ViewVariableType.WEAPON_SKILL_3_LEVEL] as const) {
      const values = slotSel[variable];
      if (!values || values.length === 0) continue;
      if (variable === ViewVariableType.WEAPON_SKILL_3_LEVEL && !slot.hasWeaponSkill3) continue;
      axes.push({ slotId: slot.slotId, variable, values });
    }
  }

  if (axes.length === 0) return [];

  // Cartesian product
  const products: { slotId: string; variable: ViewVariableType; value: number }[][] = [[]];
  for (const axis of axes) {
    const next: { slotId: string; variable: ViewVariableType; value: number }[][] = [];
    for (const partial of products) {
      for (const v of axis.values) {
        next.push([...partial, { slotId: axis.slotId, variable: axis.variable, value: v }]);
      }
    }
    products.splice(0, products.length, ...next);
  }

  // Identify which slots vary (used to build labels)
  const varyingSlotIds = new Set<string>();
  for (const axis of axes) {
    if (axis.values.length > 1) varyingSlotIds.add(axis.slotId);
  }

  return products.map((entries) => {
    const override: ViewOverride = {};
    for (const e of entries) {
      if (!override[e.slotId]) override[e.slotId] = {};
      override[e.slotId][e.variable] = e.value;
    }
    const name = formatViewName(override, slots, varyingSlotIds);
    return { name, override };
  });
}

/**
 * Build a label like `Laevatain P0R9 - Antal P5R1`. Only slots whose
 * configuration actually varies across the permutation set are included;
 * slots fixed to a single value across all permutations are omitted.
 *
 * Per-slot rendering rules:
 *  - `P{n}` — operator potential (0–5)
 *  - `R{n}` — weapon skill3 level (omitted when slot has no skill3)
 */
export function formatViewName(
  override: ViewOverride,
  slots: ViewSlotContext[],
  varyingSlotIds: ReadonlySet<string>,
): string {
  const parts: string[] = [];
  for (const slot of slots) {
    if (!varyingSlotIds.has(slot.slotId)) continue;
    const slotOverride = override[slot.slotId];
    if (!slotOverride) continue;
    const segments: string[] = [];
    const pot = slotOverride[ViewVariableType.OPERATOR_POTENTIAL];
    if (pot !== undefined) segments.push(`P${pot}`);
    const rank = slotOverride[ViewVariableType.WEAPON_SKILL_3_LEVEL];
    if (rank !== undefined && slot.hasWeaponSkill3) segments.push(`R${rank}`);
    if (segments.length === 0) continue;
    parts.push(`${slot.operatorName} ${segments.join('')}`);
  }
  return parts.join(' - ') || 'View';
}

/** Total permutation count without materialising the product (for cap checks). */
export function countViewPermutations(
  selections: ViewSelections,
  slots: ViewSlotContext[],
): number {
  let total = 1;
  let hasAxis = false;
  for (const slot of slots) {
    const slotSel = selections[slot.slotId];
    if (!slotSel) continue;
    for (const variable of [ViewVariableType.OPERATOR_POTENTIAL, ViewVariableType.WEAPON_SKILL_3_LEVEL] as const) {
      const values = slotSel[variable];
      if (!values || values.length === 0) continue;
      if (variable === ViewVariableType.WEAPON_SKILL_3_LEVEL && !slot.hasWeaponSkill3) continue;
      total *= values.length;
      hasAxis = true;
    }
  }
  return hasAxis ? total : 0;
}
