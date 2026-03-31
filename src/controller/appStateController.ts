/**
 * Pure business logic for app-level state transitions.
 * No React dependencies — these are pure functions that compute next state.
 */

import { Operator, TimelineEvent, ResourceConfig, Enemy, MiniTimeline } from '../consts/viewTypes';
import type { OverrideStore } from '../consts/overrideTypes';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../view/OperatorLoadoutHeader';
import { LoadoutProperties, getDefaultLoadoutProperties } from '../view/InformationPane';
import { ALL_OPERATORS, getUltimateEnergyCost, getUltimateEnergyCostForPotential } from './operators/operatorRegistry';
import { getModelEnemy } from './calculation/enemyRegistry';
import { BossEnemy } from '../model/enemies/bossEnemy';
import { ColumnType, StatType, GearSetType } from '../consts/enums';
import { DEFAULT_STATS } from '../consts/stats';
import { getGearPiece } from './gameDataStore';
import { filterEventsOnOperatorChange } from './timeline/inputEventController';
import GENERAL_MECHANICS from '../model/game-data/generalMechanics.json';
import type { Slot } from './timeline/columnBuilder';
import { NounType } from '../dsl/semantics';
import { SKILL_COLUMN_ORDER, ultimateGraphKey } from '../model/channels';

const SKILL_COLUMN_SET: ReadonlySet<string> = new Set(SKILL_COLUMN_ORDER);

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

export interface CombatState {
  events: TimelineEvent[];
  operators: (Operator | null)[];
  enemy: Enemy;
  enemyStats: EnemyStats;
  loadouts: Record<string, OperatorLoadoutState>;
  loadoutProperties: Record<string, LoadoutProperties>;
  resourceConfigs: Record<string, ResourceConfig>;
  overrides: OverrideStore;
}

// ── Operator swap ────────────────────────────────────────────────────────────

/**
 * Compute the next CombatState when an operator is swapped into a slot.
 * Handles: operator array update, event pruning, weapon compatibility, stats reset.
 */
export function swapOperator(
  prev: CombatState,
  slotId: string,
  newOperatorId: string | null,
  slotIds: string[],
): CombatState {
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

  // Reset loadout to empty when operator changes
  let nextLoadouts = { ...prev.loadouts, [slotId]: EMPTY_LOADOUT };
  // When operators swap slots, also reset the swapped slot's loadout
  if (existingIdx >= 0 && existingIdx !== slotIndex) {
    const swappedSlotId = slotIds[existingIdx];
    nextLoadouts = { ...nextLoadouts, [swappedSlotId]: EMPTY_LOADOUT };
  }

  // Reset loadout properties to rarity-appropriate defaults
  let nextLoadoutProperties = prev.loadoutProperties;
  if (newOp) {
    nextLoadoutProperties = { ...prev.loadoutProperties, [slotId]: getDefaultLoadoutProperties(newOp) };
  }
  // Also reset swapped slot's loadout properties
  if (existingIdx >= 0 && existingIdx !== slotIndex) {
    const swappedOp = prev.operators[slotIndex];
    const swappedSlotId = slotIds[existingIdx];
    if (swappedOp) {
      nextLoadoutProperties = { ...nextLoadoutProperties, [swappedSlotId]: getDefaultLoadoutProperties(swappedOp) };
    }
  }

  return {
    ...prev,
    events: nextEvents,
    operators: nextOperators,
    loadouts: nextLoadouts,
    loadoutProperties: nextLoadoutProperties,
  };
}

// ── Stats change with potential ──────────────────────────────────────────────

/**
 * Compute the next CombatState when loadout stats change.
 * Handles: potential-dependent ultimate energy cost update.
 */
export function updatePropertiesWithPotential(
  prev: CombatState,
  slotId: string,
  properties: LoadoutProperties,
  slotIds: string[],
): CombatState {
  const prevProperties = prev.loadoutProperties[slotId];
  let nextResourceConfigs = prev.resourceConfigs;

  if (prevProperties && prevProperties.operator.potential !== properties.operator.potential) {
    const slotIdx = slotIds.indexOf(slotId);
    const op = slotIdx >= 0 ? prev.operators[slotIdx] : null;
    if (op) {
      const newCost = getUltimateEnergyCostForPotential(
        op.id, properties.operator.potential as 0 | 1 | 2 | 3 | 4 | 5,
      );
      if (newCost != null) {
        const ultKey = ultimateGraphKey(slotId);
        const existing = prev.resourceConfigs[ultKey];
        if (existing && existing.max !== newCost) {
          nextResourceConfigs = { ...prev.resourceConfigs, [ultKey]: { ...existing, max: newCost } };
        } else if (!existing && newCost !== getUltimateEnergyCost(op.id)) {
          nextResourceConfigs = {
            ...prev.resourceConfigs,
            [ultKey]: { startValue: GENERAL_MECHANICS.ultimateEnergy.startAtMax ? newCost : 0, max: newCost, regenPerSecond: 0 },
          };
        }
      }
    }
  }

  return {
    ...prev,
    loadoutProperties: { ...prev.loadoutProperties, [slotId]: properties },
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
  loadoutProperties: Record<string, LoadoutProperties>,
): Slot[] {
  return slotIds.map((slotId, i) => {
    const op = operators[i] ?? null;
    const lo = loadouts[slotId];
    let gearSetType: GearSetType | undefined;
    if (lo) {
      const gearIds = [lo.armorId, lo.glovesId, lo.kit1Id, lo.kit2Id];
      const counts = new Map<string, number>();
      for (const id of gearIds) {
        if (!id) continue;
        const piece = getGearPiece(id);
        if (!piece) continue;
        const et = piece.gearSet;
        counts.set(et, (counts.get(et) ?? 0) + 1);
      }
      counts.forEach((count, et) => {
        if (count >= 3) gearSetType = et as GearSetType;
      });
    }
    return {
      slotId,
      operator: op,
      potential: loadoutProperties[slotId]?.operator.potential,
      weaponId: lo?.weaponId ?? undefined,
      consumableId: lo?.consumableId ?? undefined,
      tacticalId: lo?.tacticalId ?? undefined,
      gearSetType,
      comboSkillLevel: loadoutProperties[slotId]?.skills.comboSkillLevel,
      loadoutProperties: loadoutProperties[slotId],
      loadout: lo,
    };
  });
}

// ── Default resource config ──────────────────────────────────────────────────

/**
 * Compute the default ResourceConfig for a column key (SP or ultimate).
 */
export function computeDefaultResourceConfig(
  operators: (Operator | null)[],
  loadoutProperties: Record<string, LoadoutProperties>,
  slotIds: string[],
  colKey: string,
  spKey: string,
  staggerKey?: string,
  staggerMax?: number,
): ResourceConfig {
  if (colKey === spKey) {
    return {
      startValue: GENERAL_MECHANICS.skillPoints.startValue,
      max: GENERAL_MECHANICS.skillPoints.max,
      regenPerSecond: GENERAL_MECHANICS.skillPoints.regenPerSecond,
    };
  }
  if (staggerKey && colKey === staggerKey) {
    return { startValue: 0, max: staggerMax ?? 60, regenPerSecond: 0 };
  }
  // Ultimate columns: slot-X-ULTIMATE
  const slotId = colKey.replace(`-${NounType.ULTIMATE}`, '');
  const slotIdx = slotIds.indexOf(slotId);
  const op = slotIdx >= 0 ? operators[slotIdx] : null;
  if (!op) return { startValue: 0, max: GENERAL_MECHANICS.skillPoints.max, regenPerSecond: 0 };
  const props = loadoutProperties[slotId];
  const potential = props?.operator.potential ?? 5;
  const cost =
    getUltimateEnergyCostForPotential(op.id, potential as 0 | 1 | 2 | 3 | 4 | 5) ??
    getUltimateEnergyCost(op.id);
  return { startValue: GENERAL_MECHANICS.ultimateEnergy.startAtMax ? cost : 0, max: cost, regenPerSecond: 0 };
}

// ── Event default lookup ─────────────────────────────────────────────────────

/**
 * Find the default segments for an event from its column definition.
 */
export function findEventDefaults(
  ev: TimelineEvent,
  columns: (MiniTimeline | { type: ColumnType.PLACEHOLDER })[],
): {
  name?: string;
  segments?: import('../consts/viewTypes').EventSegmentData[];
  skillPointCost?: number;
} | null {
  const col = (columns as MiniTimeline[]).find(
    (c) =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === ev.ownerId &&
      (c.columnId === ev.columnId || (c.matchColumnIds?.includes(ev.columnId) ?? false)),
  );
  if (!col) return null;
  const variant = col.eventVariants?.find((v) => v.id === ev.id);
  if (variant) {
    if (ev.segmentOrigin && variant.segments) {
      return {
        ...variant,
        segments: ev.segmentOrigin.map((i) => variant.segments![i]).filter(Boolean),
      };
    }
    return variant;
  }
  // Check micro-column defaults (e.g. combustion within the enemy status column)
  if (col.microColumns) {
    const mc = col.microColumns.find((m) => m.id === ev.columnId);
    if (mc?.defaultEvent) return mc.defaultEvent;
  }
  return col.defaultEvent ?? null;
}

/** Look up stacks config from the micro-column matching an event's columnId. */
function findMicroColumnStacks(
  ev: TimelineEvent,
  columns: (MiniTimeline | { type: ColumnType.PLACEHOLDER })[],
): Record<string, unknown> | undefined {
  const col = (columns as MiniTimeline[]).find(
    (c) =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === ev.ownerId &&
      (c.columnId === ev.columnId || (c.matchColumnIds?.includes(ev.columnId) ?? false)),
  );
  if (!col?.microColumns) return undefined;
  const mc = col.microColumns.find((m) => m.id === ev.columnId);
  return mc?.defaultEvent?.stacks;
}

/**
 * Attach default segments and derivable properties from column definitions.
 * Also applies any pending segment overrides stashed by decodeEmbed (when columns
 * were not available at decode time).
 */
export function attachDefaultSegments(
  events: TimelineEvent[],
  columns: (MiniTimeline | { type: ColumnType.PLACEHOLDER })[],
): TimelineEvent[] {
  return events.map((ev) => {
    // A "placeholder" segment is a single segment with only a duration property (no name, frames, metadata)
    const isPlaceholder = ev.segments.length === 1
      && !ev.segments[0].properties.name && !ev.segments[0].frames && !ev.segments[0].metadata;

    const defaults = findEventDefaults(ev, columns);

    // Attach derivable properties from column definition if missing
    let patched = ev;
    if (defaults) {
      const props: Partial<TimelineEvent> = {};
      if (ev.skillPointCost === undefined && defaults.skillPointCost != null) props.skillPointCost = defaults.skillPointCost;
      const ext = defaults as Record<string, unknown>;
      if (ev.gaugeGain === undefined && ext.gaugeGain != null) props.gaugeGain = ext.gaugeGain as number;
      if (ev.teamGaugeGain === undefined && ext.teamGaugeGain != null) props.teamGaugeGain = ext.teamGaugeGain as number;
      if (ev.gaugeGainByEnemies === undefined && ext.gaugeGainByEnemies != null) props.gaugeGainByEnemies = ext.gaugeGainByEnemies as Record<number, number>;
      if (ev.timeInteraction === undefined && ext.timeInteraction != null) props.timeInteraction = ext.timeInteraction as string;
      if (ev.isPerfectDodge === undefined && ext.isPerfectDodge != null) props.isPerfectDodge = ext.isPerfectDodge as boolean;
      if (ev.timeStop === undefined && ext.timeStop != null) props.timeStop = ext.timeStop as number;
      if (ev.enhancementType === undefined && ext.enhancementType != null) props.enhancementType = ext.enhancementType as import('../consts/enums').EnhancementType;
      const stacks = findMicroColumnStacks(ev, columns);
      const stackLimit = (stacks?.limit as { value?: number } | undefined)?.value ?? 1;
      if (stackLimit <= 1 && ev.nonOverlappableRange === undefined) {
        const span = ev.segments.reduce((sum, s) => sum + s.properties.duration, 0);
        if (span > 0) props.nonOverlappableRange = span;
      }
      if (Object.keys(props).length > 0) patched = { ...ev, ...props };
      // Stackable events must not block sibling overlap — strip nonOverlappableRange
      if (stackLimit > 1 && patched.nonOverlappableRange !== undefined) {
        const { nonOverlappableRange: _, ...rest } = patched;
        patched = rest as TimelineEvent;
      }
    }

    if (!defaults?.segments) return patched;

    // Non-skill events (statuses, inflictions, reactions) keep their user-set segments.
    // Only skill events get segment rebuilding (COOLDOWN/ANIMATION refresh from config).
    if (!SKILL_COLUMN_SET.has(ev.columnId)) return patched;

    // Start from column defaults, refreshing typed segment durations (COOLDOWN, ANIMATION, etc.)
    // from column definitions. Preserve user-customized durations only on untyped segments.
    const segments = defaults.segments.slice().map((defSeg, i) => {
      const copy = { ...defSeg, frames: defSeg.frames?.map((f) => ({ ...f })) };
      // Preserve user-modified duration only for untyped segments (no segmentTypes)
      const isTyped = defSeg.properties.segmentTypes && defSeg.properties.segmentTypes.length > 0;
      if (!isPlaceholder && !isTyped && i < ev.segments.length && ev.segments[i].properties.duration !== undefined) {
        copy.properties = { ...copy.properties, duration: ev.segments[i].properties.duration };
      }
      // Preserve user-modified frame offsets from the raw event
      if (!isPlaceholder && copy.frames && i < ev.segments.length && ev.segments[i].frames) {
        const rawFrames = ev.segments[i].frames!;
        for (let fi = 0; fi < copy.frames.length && fi < rawFrames.length; fi++) {
          copy.frames[fi].offsetFrame = rawFrames[fi].offsetFrame;
        }
      }
      return copy;
    });

    return { ...patched, segments };
  });
}
