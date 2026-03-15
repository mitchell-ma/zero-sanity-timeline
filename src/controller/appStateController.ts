/**
 * Pure business logic for app-level state transitions.
 * No React dependencies — these are pure functions that compute next state.
 */

import { Operator, TimelineEvent, ResourceConfig, Enemy, MiniTimeline } from '../consts/viewTypes';
import { OperatorLoadoutState } from '../view/OperatorLoadoutHeader';
import { LoadoutStats, getDefaultLoadoutStats } from '../view/InformationPane';
import { ALL_OPERATORS, getUltimateEnergyCostForPotential } from './operators/operatorRegistry';
import { getModelEnemy } from './calculation/enemyRegistry';
import { BossEnemy } from '../model/enemies/bossEnemy';
import { StatType } from '../consts/enums';
import { DEFAULT_STATS } from '../consts/stats';
import { WEAPONS, ARMORS, GLOVES, KITS } from '../utils/loadoutRegistry';
import { CombatLoadout } from './combat-loadout';
import { filterEventsOnOperatorChange } from './timeline/eventController';
import { GearSetType } from '../consts/enums';
import type { Slot } from './timeline/columnBuilder';

// ── Shared state shape ───────────────────────────────────────────────────────

export type EnemyStats = {
  level: number;
  staggerStartValue: number;
  staggerNodes: number;
  staggerNodeRecoverySeconds: number;
} & Record<StatType, number>;

export const DEFAULT_ENEMY_LEVEL = 90;

export function getDefaultEnemyStats(enemyId: string, level: number = DEFAULT_ENEMY_LEVEL): EnemyStats {
  const model = getModelEnemy(enemyId, level);
  if (!model) {
    return {
      ...DEFAULT_STATS,
      level,
      [StatType.BASE_DEFENSE]: 100,
      [StatType.PHYSICAL_RESISTANCE]: 1,
      [StatType.HEAT_RESISTANCE]: 1,
      [StatType.ELECTRIC_RESISTANCE]: 1,
      [StatType.CRYO_RESISTANCE]: 1,
      [StatType.NATURE_RESISTANCE]: 1,
      [StatType.STAGGER_HP]: 60,
      [StatType.STAGGER_RECOVERY]: 6,
      staggerStartValue: 0,
      staggerNodes: 0,
      staggerNodeRecoverySeconds: 0,
    };
  }
  return {
    ...DEFAULT_STATS,
    ...model.stats,
    level,
    staggerStartValue: 0,
    staggerNodes: model instanceof BossEnemy ? model.staggerNodes : 0,
    staggerNodeRecoverySeconds: model instanceof BossEnemy ? model.staggerNodeRecoverySeconds : 0,
  };
}

export interface UndoableState {
  events: TimelineEvent[];
  operators: (Operator | null)[];
  enemy: Enemy;
  enemyStats: EnemyStats;
  loadouts: Record<string, OperatorLoadoutState>;
  loadoutStats: Record<string, LoadoutStats>;
  resourceConfigs: Record<string, ResourceConfig>;
}

// ── Operator swap ────────────────────────────────────────────────────────────

/**
 * Compute the next UndoableState when an operator is swapped into a slot.
 * Handles: operator array update, event pruning, weapon compatibility, stats reset.
 */
export function swapOperator(
  prev: UndoableState,
  slotId: string,
  newOperatorId: string | null,
  slotIds: string[],
): UndoableState {
  const slotIndex = slotIds.indexOf(slotId);
  if (slotIndex < 0) return prev;

  const newOp = newOperatorId
    ? ALL_OPERATORS.find((op) => op.id === newOperatorId) ?? null
    : null;

  // Update operators array
  let nextOperators: (Operator | null)[];
  if (newOperatorId === null) {
    nextOperators = [...prev.operators];
    nextOperators[slotIndex] = null;
  } else if (!newOp) {
    return prev;
  } else {
    nextOperators = [...prev.operators];
    const existingIdx = nextOperators.findIndex((op) => op?.id === newOperatorId);
    if (existingIdx >= 0 && existingIdx !== slotIndex) {
      nextOperators[existingIdx] = nextOperators[slotIndex];
    }
    nextOperators[slotIndex] = newOp;
  }

  // Remove events for slots whose operator changed
  let nextEvents = filterEventsOnOperatorChange(
    prev.events, slotId, prev.operators[slotIndex], newOp,
  );
  // When operators swap slots, also remove the swapped slot's events
  const existingIdx = prev.operators.findIndex((op) => op?.id === newOperatorId);
  if (existingIdx >= 0 && existingIdx !== slotIndex) {
    const swappedSlotId = slotIds[existingIdx];
    nextEvents = filterEventsOnOperatorChange(
      nextEvents, swappedSlotId, prev.operators[existingIdx], prev.operators[slotIndex],
    );
  }

  // Clear weapon if incompatible with new operator
  let nextLoadouts = prev.loadouts;
  const current = prev.loadouts[slotId];
  if (current.weaponName !== null) {
    if (!newOp) {
      nextLoadouts = { ...prev.loadouts, [slotId]: { ...current, weaponName: null } };
    } else {
      const equippedWeapon = WEAPONS.find((w) => w.name === current.weaponName);
      if (equippedWeapon && !CombatLoadout.isWeaponCompatible(newOp, equippedWeapon)) {
        nextLoadouts = { ...prev.loadouts, [slotId]: { ...current, weaponName: null } };
      }
    }
  }

  // Reset loadout stats to rarity-appropriate defaults
  let nextLoadoutStats = prev.loadoutStats;
  if (newOp) {
    nextLoadoutStats = { ...prev.loadoutStats, [slotId]: getDefaultLoadoutStats(newOp) };
  }

  return {
    ...prev,
    events: nextEvents,
    operators: nextOperators,
    loadouts: nextLoadouts,
    loadoutStats: nextLoadoutStats,
  };
}

// ── Stats change with potential ──────────────────────────────────────────────

/**
 * Compute the next UndoableState when loadout stats change.
 * Handles: potential-dependent ultimate energy cost update.
 */
export function updateStatsWithPotential(
  prev: UndoableState,
  slotId: string,
  stats: LoadoutStats,
  slotIds: string[],
): UndoableState {
  const prevStats = prev.loadoutStats[slotId];
  let nextResourceConfigs = prev.resourceConfigs;

  if (prevStats && prevStats.potential !== stats.potential) {
    const slotIdx = slotIds.indexOf(slotId);
    const op = slotIdx >= 0 ? prev.operators[slotIdx] : null;
    if (op) {
      const newCost = getUltimateEnergyCostForPotential(
        op.id, stats.potential as 0 | 1 | 2 | 3 | 4 | 5,
      );
      if (newCost != null) {
        const ultKey = `${slotId}-ultimate`;
        const existing = prev.resourceConfigs[ultKey];
        if (existing && existing.max !== newCost) {
          nextResourceConfigs = { ...prev.resourceConfigs, [ultKey]: { ...existing, max: newCost } };
        } else if (!existing && newCost !== op.ultimateEnergyCost) {
          nextResourceConfigs = {
            ...prev.resourceConfigs,
            [ultKey]: { startValue: 0, max: newCost, regenPerSecond: 0 },
          };
        }
      }
    }
  }

  return {
    ...prev,
    loadoutStats: { ...prev.loadoutStats, [slotId]: stats },
    resourceConfigs: nextResourceConfigs,
  };
}

// ── Slot computation ─────────────────────────────────────────────────────────

/**
 * Build the slot descriptor array from app state.
 * Handles: gear set detection (3+ matching pieces).
 */
export function computeSlots(
  slotIds: string[],
  operators: (Operator | null)[],
  loadouts: Record<string, OperatorLoadoutState>,
  loadoutStats: Record<string, LoadoutStats>,
): Slot[] {
  const allGear = [...ARMORS, ...GLOVES, ...KITS];
  return slotIds.map((slotId, i) => {
    const op = operators[i] ?? null;
    const lo = loadouts[slotId];
    let gearSetType: GearSetType | undefined;
    if (lo) {
      const gearNames = [lo.armorName, lo.glovesName, lo.kit1Name, lo.kit2Name];
      const counts = new Map<string, number>();
      for (const name of gearNames) {
        if (!name) continue;
        const entry = allGear.find((g) => g.name === name);
        if (!entry) continue;
        const et = entry.gearSetType;
        counts.set(et, (counts.get(et) ?? 0) + 1);
      }
      counts.forEach((count, et) => {
        if (count >= 3) gearSetType = et as GearSetType;
      });
    }
    return {
      slotId,
      operator: op,
      potential: loadoutStats[slotId]?.potential,
      weaponName: lo?.weaponName ?? undefined,
      tacticalName: lo?.tacticalName ?? undefined,
      gearSetType,
      comboSkillLevel: loadoutStats[slotId]?.comboSkillLevel,
    };
  });
}

// ── Default resource config ──────────────────────────────────────────────────

/**
 * Compute the default ResourceConfig for a column key (SP or ultimate).
 */
export function computeDefaultResourceConfig(
  operators: (Operator | null)[],
  loadoutStats: Record<string, LoadoutStats>,
  slotIds: string[],
  colKey: string,
  spKey: string,
  staggerKey?: string,
  staggerMax?: number,
): ResourceConfig {
  if (colKey === spKey) {
    return { startValue: 200, max: 300, regenPerSecond: 8 };
  }
  if (staggerKey && colKey === staggerKey) {
    return { startValue: 0, max: staggerMax ?? 60, regenPerSecond: 0 };
  }
  // Ultimate columns: slot-X-ultimate
  const slotId = colKey.replace(/-ultimate$/, '');
  const slotIdx = slotIds.indexOf(slotId);
  const op = slotIdx >= 0 ? operators[slotIdx] : null;
  if (!op) return { startValue: 0, max: 300, regenPerSecond: 0 };
  const stats = loadoutStats[slotId];
  const potential = stats?.potential ?? 5;
  const cost =
    getUltimateEnergyCostForPotential(op.id, potential as 0 | 1 | 2 | 3 | 4 | 5) ??
    op.ultimateEnergyCost;
  return { startValue: 0, max: cost, regenPerSecond: 0 };
}

// ── Event default lookup ─────────────────────────────────────────────────────

/**
 * Find the default durations/segments for an event from its column definition.
 */
export function findEventDefaults(
  ev: TimelineEvent,
  columns: (MiniTimeline | { type: 'placeholder' })[],
): {
  name?: string;
  defaultActivationDuration: number;
  defaultActiveDuration: number;
  defaultCooldownDuration: number;
  segments?: import('../consts/viewTypes').EventSegmentData[];
  animationDuration?: number;
  skillPointCost?: number;
} | null {
  const col = (columns as MiniTimeline[]).find(
    (c) =>
      c.type === 'mini-timeline' &&
      c.ownerId === ev.ownerId &&
      (c.columnId === ev.columnId || (c.matchColumnIds?.includes(ev.columnId) ?? false)),
  );
  if (!col) return null;
  const variant = col.eventVariants?.find((v) => v.name === ev.name);
  if (variant) return variant;
  return col.defaultEvent ?? null;
}

/**
 * Attach default segments from column definitions to events that don't have them.
 * Used after loading events from storage (segments are not persisted).
 */
export function attachDefaultSegments(
  events: TimelineEvent[],
  columns: (MiniTimeline | { type: 'placeholder' })[],
): TimelineEvent[] {
  return events.map((ev) => {
    if (ev.segments) return ev;
    const defaults = findEventDefaults(ev, columns);
    if (!defaults?.segments) return ev;
    return { ...ev, segments: defaults.segments };
  });
}
