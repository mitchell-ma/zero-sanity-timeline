import { TimelineEvent, Operator } from '../../consts/viewTypes';
import type { Slot } from '../timeline/columnBuilder';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { getWeapon } from '../gameDataController';
import { CommonSlotController } from '../slot/commonSlotController';
import { collectTimeStopRegions, extendByTimeStops } from '../timeline/processTimeStop';
import { findClauseTriggerMatches, isClauseAlwaysAvailable } from '../timeline/triggerMatch';
import { getComboTriggerClause, getComboTriggerInfo } from '../../model/event-frames/operatorJsonLoader';

export interface ActivationWindow {
  startFrame: number;
  endFrame: number;
  sourceEventId: string;
}

/** key = slotId, value = sorted activation windows for that slot's combo */
export type WindowsMap = Map<string, ActivationWindow[]>;
export type CombatLoadoutListener = (windows: WindowsMap) => void;

const NUM_SLOTS = 4;

interface SlotWiring {
  operatorId: string;
}


export class CombatLoadoutController {
  /**
   * Check if a weapon is compatible with an operator.
   * Returns true if the operator can equip the weapon, false otherwise.
   * Returns true if operator or weapon is null (no constraint to violate).
   */
  static isWeaponCompatible(
    operator: Operator | null,
    weaponId: string | null | undefined,
  ): boolean {
    if (!operator || !weaponId) return true;
    const weapon = getWeapon(weaponId);
    if (!weapon) return true;
    return operator.weaponTypes.includes(weapon.type);
  }

  private slots: (SlotWiring | null)[] = Array(NUM_SLOTS).fill(null);
  private slotIds: string[] = [];
  private cachedSlots: Slot[] = [];
  private spCosts: Map<string, number> = new Map();
  private cachedEvents: TimelineEvent[] = [];
  private cachedWindows: WindowsMap = new Map();
  private listeners: Set<CombatLoadoutListener> = new Set();

  // ── Common (global) slot ────────────────────────────────────────────────
  readonly commonSlot = new CommonSlotController();

  setSlotIds(ids: string[]): void {
    this.slotIds = ids;
  }

  /**
   * Sync the full slot array into the combat context.
   * Rebuilds operator wiring, SP costs, and recomputes combo windows.
   */
  syncSlots(slots: Slot[]): void {
    this.cachedSlots = slots;
    this.spCosts.clear();
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const op = slot.operator;
      if (!op) {
        this.slots[i] = null;
      } else {
        this.slots[i] = getComboTriggerClause(op.id)
          ? { operatorId: op.id }
          : null;
        this.spCosts.set(slot.slotId, op.skills.battle.skillPointCost ?? 100);
      }
    }
    this.recomputeWindows(this.cachedEvents);
  }

  // ── SP queries ─────────────────────────────────────────────────────────

  hasSufficientSP(ownerId: string, frame: number): boolean {
    const cost = this.spCosts.get(ownerId) ?? 100;
    return this.commonSlot.skillPoints.valueAt(frame) >= cost;
  }

  getSpCost(ownerId: string): number {
    return this.spCosts.get(ownerId) ?? 100;
  }

  // ── Slot queries ───────────────────────────────────────────────────────

  getSlots(): readonly Slot[] {
    return this.cachedSlots;
  }

  recomputeWindows(events: TimelineEvent[]): void {
    this.cachedEvents = events;

    const newWindows: WindowsMap = new Map();
    const stops = collectTimeStopRegions(events);

    for (let i = 0; i < NUM_SLOTS; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      const slotId = this.slotIds[i];
      if (!slotId) continue;

      const clause = getComboTriggerClause(slot.operatorId);
      if (!clause?.length) continue;
      const info = getComboTriggerInfo(slot.operatorId);

      // Check if trigger is always-available (no event-based conditions needed)
      if (info && isClauseAlwaysAvailable(clause)) {
        const fullWindow: ActivationWindow = {
          startFrame: 0,
          endFrame: TOTAL_FRAMES,
          sourceEventId: '__always_available__',
        };
        if (!newWindows.has(slotId)) newWindows.set(slotId, []);
        newWindows.get(slotId)!.push(fullWindow);
        continue;
      }

      const baseDuration = info?.windowFrames ?? 720;
      const matches = findClauseTriggerMatches(clause, events, slotId);
      for (const match of matches) {
        const extendedDuration = extendByTimeStops(match.frame, baseDuration, stops);
        const window: ActivationWindow = {
          startFrame: match.frame,
          endFrame: match.frame + extendedDuration,
          sourceEventId: `trigger-${slotId}-${match.frame}`,
        };
        if (!newWindows.has(slotId)) newWindows.set(slotId, []);
        newWindows.get(slotId)!.push(window);
      }
    }

    // Sort and merge overlapping windows per slot
    newWindows.forEach((windows, slotId) => {
      windows.sort((a: ActivationWindow, b: ActivationWindow) => a.startFrame - b.startFrame);
      const merged = mergeWindows(windows);
      newWindows.set(slotId, merged);
    });

    // Only notify if windows actually changed
    if (!windowsEqual(this.cachedWindows, newWindows)) {
      this.cachedWindows = newWindows;
      this.notify(newWindows);
    }
  }

  subscribe(listener: CombatLoadoutListener): () => void {
    this.listeners.add(listener);
    // Immediately send current state
    listener(this.cachedWindows);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(windows: WindowsMap): void {
    this.listeners.forEach((listener) => listener(windows));
  }
}

function mergeWindows(sorted: ActivationWindow[]): ActivationWindow[] {
  if (sorted.length === 0) return [];

  const result: ActivationWindow[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];

    if (curr.startFrame <= prev.endFrame) {
      // Overlapping — extend
      prev.endFrame = Math.max(prev.endFrame, curr.endFrame);
    } else {
      result.push({ ...curr });
    }
  }

  return result;
}

function windowsEqual(a: WindowsMap, b: WindowsMap): boolean {
  if (a.size !== b.size) return false;
  let equal = true;
  a.forEach((aWindows, key) => {
    if (!equal) return;
    const bWindows = b.get(key);
    if (!bWindows || aWindows.length !== bWindows.length) { equal = false; return; }
    for (let i = 0; i < aWindows.length; i++) {
      if (aWindows[i].startFrame !== bWindows[i].startFrame ||
          aWindows[i].endFrame !== bWindows[i].endFrame ||
          aWindows[i].sourceEventId !== bWindows[i].sourceEventId) {
        equal = false;
        return;
      }
    }
  });
  return equal;
}