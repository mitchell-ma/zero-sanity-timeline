/**
 * Derive a view loadout's SheetData from its parent + per-slot overrides.
 *
 * A LOADOUT_VIEW is not stored as its own `SheetData` blob — it's a thin
 * override on top of its parent LOADOUT. To resolve a view to something
 * simulable, load the parent sheet and apply the view's pinned values.
 *
 * Overrides currently pin operator potential and weapon skill-3 level. When
 * potential changes, the per-slot ultimate-energy `resourceConfigs.max` is
 * also recomputed since UE cost is potential-dependent.
 *
 * Shared between the combat view (loadout-switch flow) and the statistics
 * page (source resolution). Keep pure — no React, no module-scoped caches.
 */

import type { SheetData } from './sheetStorage';
import type { ViewOverride } from './loadoutStorage';
import { ViewVariableType } from '../consts/enums';
import { NounType } from '../dsl/semantics';
import {
  getUltimateEnergyCost,
  getUltimateEnergyCostForPotential,
} from '../controller/operators/operatorRegistry';
import { SLOT_IDS, INITIAL_LOADOUT_PROPERTIES } from '../app/sheetDefaults';

export function applyViewOverride(parent: SheetData, override: ViewOverride): SheetData {
  const nextLoadoutProperties = { ...parent.loadoutProperties };
  const nextResourceConfigs = { ...(parent.resourceConfigs ?? {}) };

  for (const [slotId, slotOverride] of Object.entries(override)) {
    const baseProps = nextLoadoutProperties[slotId] ?? INITIAL_LOADOUT_PROPERTIES[slotId];
    if (!baseProps) continue;
    const operatorPotential = slotOverride[ViewVariableType.OPERATOR_POTENTIAL];
    const weaponSkill3Level = slotOverride[ViewVariableType.WEAPON_SKILL_3_LEVEL];
    nextLoadoutProperties[slotId] = {
      ...baseProps,
      operator: {
        ...baseProps.operator,
        ...(operatorPotential !== undefined ? { potential: operatorPotential } : {}),
      },
      weapon: {
        ...baseProps.weapon,
        ...(weaponSkill3Level !== undefined ? { skill3Level: weaponSkill3Level } : {}),
      },
    };

    if (operatorPotential !== undefined) {
      const slotIdx = SLOT_IDS.indexOf(slotId);
      const opId = slotIdx >= 0 ? parent.operatorIds[slotIdx] : null;
      if (opId) {
        const newCost =
          getUltimateEnergyCostForPotential(opId, operatorPotential as 0 | 1 | 2 | 3 | 4 | 5)
          ?? getUltimateEnergyCost(opId);
        if (newCost > 0) {
          const ultKey = `${slotId}-${NounType.ULTIMATE}`;
          const existing = nextResourceConfigs[ultKey];
          nextResourceConfigs[ultKey] = existing
            ? { ...existing, max: newCost, startValue: Math.min(existing.startValue, newCost) }
            : { startValue: newCost, max: newCost, regenPerSecond: 0 };
        }
      }
    }
  }

  return { ...parent, loadoutProperties: nextLoadoutProperties, resourceConfigs: nextResourceConfigs };
}
