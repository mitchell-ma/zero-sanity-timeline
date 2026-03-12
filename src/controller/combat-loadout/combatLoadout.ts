import { TimelineEvent, Operator } from '../../consts/viewTypes';
import { TriggerConditionType, TRIGGER_CONDITION_PARENTS } from '../../consts/enums';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { WeaponRegistryEntry } from '../../utils/loadoutRegistry';
import { TriggerCapability } from '../../consts/triggerCapabilities';
import { CommonSlotController } from '../slot/commonSlotController';
import { collectTimeStopRegions, extendByTimeStops, getFinalStrikeTriggerFrame, TimeStopRegion } from '../timeline/processInflictions';

export interface ActivationWindow {
  startFrame: number;
  endFrame: number;
  sourceEventId: string;
  /** The trigger condition type that caused this window (e.g. COMBUSTION, APPLY_HEAT_INFLICTION). */
  triggerType?: TriggerConditionType;
}

/** key = slotId, value = sorted activation windows for that slot's combo */
export type WindowsMap = Map<string, ActivationWindow[]>;
export type CombatLoadoutListener = (windows: WindowsMap) => void;

const NUM_SLOTS = 4;

interface SlotWiring {
  operatorId: string;
  capability: TriggerCapability;
}

/**
 * Maps derived enemy event columnIds to the trigger conditions they represent.
 * Used to generate combo windows from derived events at their actual frame timing.
 */
const ENEMY_COLUMN_TO_TRIGGERS: Record<string, TriggerConditionType[]> = {
  heatInfliction:     [TriggerConditionType.APPLY_HEAT_INFLICTION],
  cryoInfliction:     [TriggerConditionType.APPLY_CRYO_INFLICTION],
  natureInfliction:   [TriggerConditionType.APPLY_NATURE_INFLICTION],
  electricInfliction: [TriggerConditionType.APPLY_ELECTRIC_INFLICTION],
  combustion:         [TriggerConditionType.COMBUSTION],
  solidification:     [TriggerConditionType.SOLIDIFICATION],
  corrosion:          [TriggerConditionType.CORROSION],
  electrification:    [TriggerConditionType.ELECTRIFICATION],
  vulnerableInfliction: [TriggerConditionType.APPLY_VULNERABILITY],
  breach:             [TriggerConditionType.APPLY_PHYSICAL_STATUS],
};

/**
 * Trigger conditions that are always satisfiable (not dependent on team skill
 * publications).  Operators whose combo requires one of these get a full-timeline
 * activation window regardless of team composition.
 */
export const ALWAYS_AVAILABLE_TRIGGERS = new Set<TriggerConditionType>([
  TriggerConditionType.OPERATOR_ATTACKED,
  TriggerConditionType.HP_BELOW_THRESHOLD,
  TriggerConditionType.HP_ABOVE_THRESHOLD,
  TriggerConditionType.ULTIMATE_ENERGY_BELOW_THRESHOLD,
]);

/** Set of trigger condition types that are produced by derived enemy events. */
const DERIVED_TRIGGER_TYPES = new Set<TriggerConditionType>();
for (const triggers of Object.values(ENEMY_COLUMN_TO_TRIGGERS)) {
  for (const t of triggers) {
    DERIVED_TRIGGER_TYPES.add(t);
    // Also mark parent types as derived-sourced
    const parent = TRIGGER_CONDITION_PARENTS[t];
    if (parent) DERIVED_TRIGGER_TYPES.add(parent);
  }
}

export class CombatLoadout {
  /**
   * Check if a weapon is compatible with an operator.
   * Returns true if the operator can equip the weapon, false otherwise.
   * Returns true if operator or weapon is null (no constraint to violate).
   */
  static isWeaponCompatible(
    operator: Operator | null,
    weapon: WeaponRegistryEntry | null | undefined,
  ): boolean {
    if (!operator || !weapon) return true;
    return operator.weaponTypes.includes(weapon.weaponType);
  }

  private slots: (SlotWiring | null)[] = Array(NUM_SLOTS).fill(null);
  private slotIds: string[] = [];
  private cachedEvents: TimelineEvent[] = [];
  private cachedWindows: WindowsMap = new Map();
  private listeners: Set<CombatLoadoutListener> = new Set();

  // ── Common (global) slot ────────────────────────────────────────────────
  readonly commonSlot = new CommonSlotController();

  setSlotIds(ids: string[]): void {
    this.slotIds = ids;
  }

  setOperator(slotIndex: number, operator: Operator | null): void {
    if (!operator) {
      this.slots[slotIndex] = null;
    } else {
      const capability = operator.triggerCapability;
      this.slots[slotIndex] = capability
        ? { operatorId: operator.id, capability }
        : null;
    }

    // Recompute from cached events
    this.recomputeWindows(this.cachedEvents);
  }

  recomputeWindows(events: TimelineEvent[]): void {
    this.cachedEvents = events;

    const newWindows: WindowsMap = new Map();
    const stops = collectTimeStopRegions(events);

    // Build a map: slotId → slot index for quick lookup
    const slotIdToIndex = new Map<string, number>();
    for (let i = 0; i < this.slotIds.length; i++) {
      slotIdToIndex.set(this.slotIds[i], i);
    }

    // For each operator event, determine what triggers it produces
    // (skip infliction/reaction triggers — those come from derived enemy events)
    for (const event of events) {
      const slotIndex = slotIdToIndex.get(event.ownerId);
      if (slotIndex === undefined) continue;

      const pubSlot = this.slots[slotIndex];
      if (!pubSlot) continue;

      const publishedTriggers = pubSlot.capability.publishesTriggers[event.columnId];
      if (!publishedTriggers || publishedTriggers.length === 0) continue;

      // Default: window starts at end of active duration
      const defaultTriggerFrame = event.startFrame + event.activationDuration;

      // For FINAL_STRIKE on sequenced events, start at the first hit of the last segment
      const finalStrikeTriggerFrame = getFinalStrikeTriggerFrame(event, stops) ?? defaultTriggerFrame;

      for (const trigger of publishedTriggers) {
        // Skip triggers that are sourced from derived enemy events
        if (DERIVED_TRIGGER_TYPES.has(trigger)) continue;

        this.addWindowsForTrigger(trigger, event, events, newWindows, slotIdToIndex,
          trigger === TriggerConditionType.FINAL_STRIKE ? finalStrikeTriggerFrame : defaultTriggerFrame, stops);
      }
    }

    // For derived enemy events, use their startFrame as the trigger frame
    for (const event of events) {
      if (event.ownerId !== 'enemy') continue;

      const triggers = ENEMY_COLUMN_TO_TRIGGERS[event.columnId];
      if (!triggers) continue;

      const triggerFrame = event.startFrame;

      for (const trigger of triggers) {
        this.addWindowsForTrigger(trigger, event, events, newWindows, slotIdToIndex, triggerFrame, stops);
      }
    }

    // Always-available triggers: operators whose combo requires a passive condition
    // (being hit, HP threshold, etc.) get a full-timeline activation window.
    for (let i = 0; i < NUM_SLOTS; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      const hasAlwaysAvailable = slot.capability.comboRequires.some((t) => ALWAYS_AVAILABLE_TRIGGERS.has(t));
      if (!hasAlwaysAvailable) continue;
      const slotId = this.slotIds[i];
      if (!slotId) continue;
      const fullWindow: ActivationWindow = {
        startFrame: 0,
        endFrame: TOTAL_FRAMES,
        sourceEventId: '__always_available__',
      };
      if (!newWindows.has(slotId)) {
        newWindows.set(slotId, []);
      }
      newWindows.get(slotId)!.push(fullWindow);
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

  /** Check if a trigger matches any slot's combo requirements, and add activation windows. */
  private addWindowsForTrigger(
    trigger: TriggerConditionType,
    event: TimelineEvent,
    allEvents: TimelineEvent[],
    newWindows: WindowsMap,
    slotIdToIndex: Map<string, number>,
    triggerFrame: number,
    stops: readonly TimeStopRegion[],
  ): void {
    for (let subIdx = 0; subIdx < NUM_SLOTS; subIdx++) {
      const subSlot = this.slots[subIdx];
      if (!subSlot) continue;
      const matchesTrigger = subSlot.capability.comboRequires.includes(trigger) ||
        (TRIGGER_CONDITION_PARENTS[trigger] !== undefined &&
          subSlot.capability.comboRequires.includes(TRIGGER_CONDITION_PARENTS[trigger]!));
      if (!matchesTrigger) continue;

      const slotId = this.slotIds[subIdx];
      if (!slotId) continue;

      // Skip self-trigger: don't let an operator's own derived events create
      // trigger windows for its own combo (prevents feedback loop on drag).
      if (event.sourceOwnerId === slotId) continue;

      // Check comboForbidsActiveColumns — skip if any forbidden event is active
      const forbids = subSlot.capability.comboForbidsActiveColumns;
      if (forbids && forbids.length > 0 && hasActiveEventInColumns(allEvents, forbids, triggerFrame)) {
        continue;
      }

      // Check comboRequiresActiveColumns — skip if none of the required events are active
      const requires = subSlot.capability.comboRequiresActiveColumns;
      if (requires && requires.length > 0 && !hasActiveEventInColumns(allEvents, requires, triggerFrame)) {
        continue;
      }

      const baseDuration = subSlot.capability.comboWindowFrames;
      const extendedDuration = extendByTimeStops(triggerFrame, baseDuration, stops);
      const window: ActivationWindow = {
        startFrame: triggerFrame,
        endFrame: triggerFrame + extendedDuration,
        sourceEventId: event.id,
        triggerType: trigger,
      };

      if (!newWindows.has(slotId)) {
        newWindows.set(slotId, []);
      }
      newWindows.get(slotId)!.push(window);
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

/**
 * Check if any event whose columnId is in `columnIds` is active at `frame`.
 * An event is "active" if frame falls within [startFrame, startFrame + totalDuration).
 */
function hasActiveEventInColumns(events: TimelineEvent[], columnIds: string[], frame: number): boolean {
  for (const ev of events) {
    if (!columnIds.includes(ev.columnId) && !columnIds.includes(ev.name)) continue;
    const totalDuration = ev.segments
      ? ev.segments.reduce((sum, s) => sum + s.durationFrames, 0)
      : ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
    if (frame >= ev.startFrame && frame < ev.startFrame + totalDuration) {
      return true;
    }
  }
  return false;
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