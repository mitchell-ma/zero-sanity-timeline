/**
 * CombatStateController — single source of truth for all combat input state.
 *
 * Stateless facade: methods take CombatState + args, return new CombatState.
 * Composes pure functions from appStateController.ts and overrideController.ts.
 * Instantiated once via useRef; useHistory snapshots the CombatState it produces.
 */

import type { TimelineEvent, Column } from '../consts/viewTypes';
import { CritMode } from '../consts/enums';
import type { CombatState } from './appStateController';
import {
  swapOperator as appSwapOperator,
  updatePropertiesWithPotential as appUpdateProperties,
  findEventDefaults,
} from './appStateController';
import {
  validateMove,
  validateBatchMoveDelta,
  validateUpdate,
} from './timeline/inputEventController';
import { ComboSkillEventController } from './timeline/comboSkillEventController';
import {
  setSegmentDuration,
  setFrameOffset,
  deleteSegment,
  deleteFrame,
  undeleteSegment,
  undeleteFrame,
  clearAllOverrides,
  clearSegmentOverrides,
  clearFrameOverrides,
  migrateOverrideKey,
  setPropertyOverride,
  persistUnpinnedCrits,
  setCritPin,
  clearAllCritPins as clearAllCritPinsFromStore,
} from './overrideController';
import type { LoadoutProperties } from '../view/InformationPane';

// ── Runtime crit mode (read by view layer, set by useApp) ────────────

let _runtimeCritMode = CritMode.NEVER;
let _critModeGeneration = 0;

/** Get the current crit mode for visual presentation. */
export function getRuntimeCritMode(): CritMode { return _runtimeCritMode; }

/** Generation counter — incremented on each crit mode change, used by EventBlock memo. */
export function getCritModeGeneration(): number { return _critModeGeneration; }

/** Set the current crit mode (called by useApp when user toggles). */
export function setRuntimeCritMode(mode: CritMode) {
  if (mode !== _runtimeCritMode) _critModeGeneration++;
  _runtimeCritMode = mode;
}

// ── Context types for methods that need runtime state ────────────────

export interface MoveContext {
  isStrict: boolean;
  processed: readonly TimelineEvent[] | null;
  overlapExemptIds?: Set<string>;
}

// ── Controller ──────────────────────────────────────────────────────

export class CombatStateController {

  // ── Override methods (delegate to overrideController.ts) ─────────

  resizeSegment(
    state: CombatState,
    target: TimelineEvent,
    updates: { segmentIndex: number; newDuration: number }[],
  ): CombatState {
    let overrides = state.overrides;
    for (const { segmentIndex, newDuration } of updates) {
      overrides = setSegmentDuration(overrides, target, segmentIndex, Math.max(1, newDuration));
    }
    return overrides === state.overrides ? state : { ...state, overrides };
  }

  moveFrame(
    state: CombatState,
    target: TimelineEvent,
    segIdx: number,
    frameIdx: number,
    newOffsetFrame: number,
  ): CombatState {
    return { ...state, overrides: setFrameOffset(state.overrides, target, segIdx, frameIdx, newOffsetFrame) };
  }

  removeSegment(state: CombatState, target: TimelineEvent, segIdx: number): CombatState {
    return { ...state, overrides: deleteSegment(state.overrides, target, segIdx) };
  }

  removeFrame(state: CombatState, target: TimelineEvent, segIdx: number, frameIdx: number): CombatState {
    return { ...state, overrides: deleteFrame(state.overrides, target, segIdx, frameIdx) };
  }

  removeFrames(state: CombatState, frames: { target: TimelineEvent; segmentIndex: number; frameIndex: number }[]): CombatState {
    let overrides = state.overrides;
    for (const { target, segmentIndex, frameIndex } of frames) {
      overrides = deleteFrame(overrides, target, segmentIndex, frameIndex);
    }
    return overrides === state.overrides ? state : { ...state, overrides };
  }

  setCritPins(state: CombatState, frames: { target: TimelineEvent; segmentIndex: number; frameIndex: number }[], value: boolean): CombatState {
    let overrides = state.overrides;
    for (const { target, segmentIndex, frameIndex } of frames) {
      overrides = setCritPin(overrides, target, segmentIndex, frameIndex, value);
    }
    return overrides === state.overrides ? state : { ...state, overrides };
  }

  clearAllCritPins(state: CombatState): CombatState {
    const overrides = clearAllCritPinsFromStore(state.overrides);
    return overrides === state.overrides ? state : { ...state, overrides };
  }

  addSegmentBack(state: CombatState, target: TimelineEvent, segIdx: number): CombatState {
    return { ...state, overrides: undeleteSegment(state.overrides, target, segIdx) };
  }

  addFrameBack(state: CombatState, target: TimelineEvent, segIdx: number, frameIdx: number): CombatState {
    return { ...state, overrides: undeleteFrame(state.overrides, target, segIdx, frameIdx) };
  }

  resetSegmentOverrides(state: CombatState, target: TimelineEvent): CombatState {
    return { ...state, overrides: clearSegmentOverrides(state.overrides, target) };
  }

  resetFrameOverrides(state: CombatState, target: TimelineEvent): CombatState {
    return { ...state, overrides: clearFrameOverrides(state.overrides, target) };
  }

  setPropertyOverride(state: CombatState, target: TimelineEvent, key: string, value: unknown): CombatState {
    return { ...state, overrides: setPropertyOverride(state.overrides, target, key, value) };
  }

  // ── Cross-cutting methods (atomic event + override mutations) ───

  removeEvent(state: CombatState, id: string, validEvents: readonly TimelineEvent[]): CombatState {
    const target = validEvents.find((ev) => ev.uid === id);
    const overrides = target ? clearAllOverrides(state.overrides, target) : state.overrides;
    const events = state.events.filter((ev) => ev.uid !== id);
    return events === state.events && overrides === state.overrides
      ? state
      : { ...state, events, overrides };
  }

  removeEvents(state: CombatState, ids: string[], validEvents: readonly TimelineEvent[]): CombatState {
    const idSet = new Set(ids);
    let overrides = state.overrides;
    for (const id of ids) {
      const target = validEvents.find((ev) => ev.uid === id);
      if (target) overrides = clearAllOverrides(overrides, target);
    }
    const events = state.events.filter((ev) => !idSet.has(ev.uid));
    return { ...state, events, overrides };
  }

  resetEvent(
    state: CombatState,
    target: TimelineEvent,
    columns: Column[],
  ): CombatState {
    const overrides = clearAllOverrides(state.overrides, target);
    const defaults = findEventDefaults(target, columns);
    if (!defaults) return { ...state, overrides };
    const events = state.events.map((ev) => (ev.uid === target.uid ? {
      ...ev,
      ...(defaults.segments ? { segments: defaults.segments } : {}),
      ...(defaults.skillPointCost !== undefined ? { skillPointCost: defaults.skillPointCost } : {}),
    } : ev));
    return { ...state, events, overrides };
  }

  resetEvents(
    state: CombatState,
    targets: TimelineEvent[],
    columns: Column[],
  ): CombatState {
    let overrides = state.overrides;
    for (const t of targets) overrides = clearAllOverrides(overrides, t);
    const idSet = new Set(targets.map((t) => t.uid));
    const events = state.events.map((ev) => {
      if (!idSet.has(ev.uid)) return ev;
      const defaults = findEventDefaults(ev, columns);
      if (!defaults) return ev;
      return {
        ...ev,
        ...(defaults.segments ? { segments: defaults.segments } : {}),
        ...(defaults.skillPointCost !== undefined ? { skillPointCost: defaults.skillPointCost } : {}),
      };
    });
    return { ...state, events, overrides };
  }

  moveEvent(
    state: CombatState,
    id: string,
    newStartFrame: number,
    ctx: MoveContext,
    validEvents: readonly TimelineEvent[],
  ): CombatState {
    let target = state.events.find((ev) => ev.uid === id);
    if (!target && !ctx.isStrict) {
      const sourceId = id.endsWith('-reaction') ? id.slice(0, -'-reaction'.length) : undefined;
      if (sourceId) target = state.events.find((ev) => ev.uid === sourceId);
    }
    if (!target) return state;

    const isRedirected = target.uid !== id;
    let adjustedFrame = newStartFrame;
    if (isRedirected && ctx.processed) {
      const reaction = ctx.processed.find((ev) => ev.uid === id);
      if (reaction) adjustedFrame = target.startFrame + (newStartFrame - reaction.startFrame);
    }

    const exemptIds = ctx.isStrict ? ctx.overlapExemptIds : new Set([target.uid]);
    const clamped = validateMove(state.events, target, adjustedFrame, (ctx.processed ?? null) as TimelineEvent[] | null, exemptIds);
    if (clamped === target.startFrame) return state;

    // Migrate override key atomically with startFrame change
    const preMoveEvent = validEvents.find((ev) => ev.uid === target!.uid);
    let overrides = state.overrides;
    if (preMoveEvent) {
      overrides = migrateOverrideKey(overrides, preMoveEvent, { ...preMoveEvent, startFrame: clamped });
    }

    const targetId = target.uid;
    const triggerCol = ComboSkillEventController.resolveComboTriggerColumnId(target, clamped, (ctx.processed ?? null) as TimelineEvent[] | null);
    const events = state.events.map((ev) => (ev.uid === targetId
      ? { ...ev, startFrame: clamped, ...(triggerCol !== undefined ? { comboTriggerColumnId: triggerCol } : {}) }
      : ev));

    return { ...state, events, overrides };
  }

  moveEvents(
    state: CombatState,
    ids: string[],
    delta: number,
    ctx: MoveContext,
    validEvents: readonly TimelineEvent[],
  ): CombatState {
    if (delta === 0) return state;

    let resolvedIds = ids;
    if (!ctx.isStrict) {
      resolvedIds = ids.map((id) => {
        if (state.events.some((ev) => ev.uid === id)) return id;
        const sourceId = id.endsWith('-reaction') ? id.slice(0, -'-reaction'.length) : undefined;
        if (sourceId && state.events.some((ev) => ev.uid === sourceId)) return sourceId;
        return id;
      });
    }
    const rawIds = resolvedIds.filter((id) => state.events.some((ev) => ev.uid === id));
    const idSet = new Set(rawIds);
    if (rawIds.length === 0) return state;

    const exemptIds = ctx.isStrict ? ctx.overlapExemptIds : idSet;
    const clampedDelta = validateBatchMoveDelta(state.events, rawIds, delta, (ctx.processed ?? null) as TimelineEvent[] | null, exemptIds);
    if (clampedDelta === 0) return state;

    // Migrate override keys atomically
    let overrides = state.overrides;
    for (const id of rawIds) {
      const pre = validEvents.find((ev) => ev.uid === id);
      if (pre) overrides = migrateOverrideKey(overrides, pre, { ...pre, startFrame: pre.startFrame + clampedDelta });
    }

    const events = state.events.map((ev) => {
      if (!idSet.has(ev.uid)) return ev;
      const newFrame = ev.startFrame + clampedDelta;
      const triggerCol = ComboSkillEventController.resolveComboTriggerColumnId(ev, newFrame, (ctx.processed ?? null) as TimelineEvent[] | null);
      return { ...ev, startFrame: newFrame, ...(triggerCol !== undefined ? { comboTriggerColumnId: triggerCol } : {}) };
    });

    return { ...state, events, overrides };
  }

  updateEvent(
    state: CombatState,
    id: string,
    updates: Partial<TimelineEvent>,
    ctx: { isStrict: boolean; processed: readonly TimelineEvent[] | null },
  ): CombatState {
    const target = state.events.find((ev) => ev.uid === id);
    if (!target) {
      // Derived event — store as property override
      // Use id directly as key since derived events don't have stable composite keys
      const overrides = { ...state.overrides, [id]: { ...state.overrides[id], propertyOverrides: { ...state.overrides[id]?.propertyOverrides, ...updates } } };
      return { ...state, overrides };
    }
    const processed = ctx.isStrict ? ctx.processed : null;
    const merged = validateUpdate(state.events, target, updates, processed);
    if (!merged) return state;
    const events = state.events.map((ev) => (ev.uid === id ? merged : ev));
    return { ...state, events };
  }

  // ── Team composition methods ────────────────────────────────────

  swapOperator(state: CombatState, slotId: string, operatorId: string | null, slotIds: string[]): CombatState {
    return appSwapOperator(state, slotId, operatorId, slotIds);
  }

  updateLoadoutProperties(state: CombatState, slotId: string, props: LoadoutProperties, slotIds: string[]): CombatState {
    return appUpdateProperties(state, slotId, props, slotIds);
  }

  setEnemy(state: CombatState, enemy: CombatState['enemy'], enemyStats: CombatState['enemyStats']): CombatState {
    return { ...state, enemy, enemyStats };
  }

  setEnemyStats(state: CombatState, enemyStats: CombatState['enemyStats']): CombatState {
    return { ...state, enemyStats };
  }

  setLoadout(state: CombatState, slotId: string, loadout: CombatState['loadouts'][string]): CombatState {
    return { ...state, loadouts: { ...state.loadouts, [slotId]: loadout } };
  }

  setResourceConfig(state: CombatState, key: string, config: CombatState['resourceConfigs'][string]): CombatState {
    return { ...state, resourceConfigs: { ...state.resourceConfigs, [key]: config } };
  }

  /** Persist SIMULATION crit results into overrides (only for unpinned frames). */
  persistCritResults(state: CombatState, resolvedCrits: Map<string, Map<number, Map<number, boolean>>>): CombatState {
    const newOverrides = persistUnpinnedCrits(state.overrides, resolvedCrits);
    return newOverrides === state.overrides ? state : { ...state, overrides: newOverrides };
  }
}
