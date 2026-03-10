import { TimelineEvent, Operator } from '../../consts/viewTypes';
import { TriggerConditionType, TRIGGER_CONDITION_PARENTS } from '../../consts/enums';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { WeaponRegistryEntry } from '../../utils/loadoutRegistry';
import { TriggerCapability } from '../../consts/triggerCapabilities';
import {
  Publisher,
  Subscriber,
  TriggerKey,
  triggerKey,
  subscribe as pubsubSubscribe,
  unsubscribeAllSubscribers,
  disconnectAllPublishers,
} from '../pubsub';
import { CommonSlotController } from '../slot/commonSlotController';

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

/** Lightweight Publisher proxy for a slot's skills. */
class SlotPublisher implements Publisher {
  readonly subscribers = new Map<TriggerKey, Subscriber[]>();

  publish(key: TriggerKey): void {
    const subs = this.subscribers.get(key);
    if (subs) {
      for (const sub of subs) {
        sub.onPublish(key, this);
      }
    }
  }
}

/** Lightweight Subscriber proxy for a slot's combo skill. */
class SlotSubscriber implements Subscriber {
  readonly publishers = new Map<TriggerKey, Publisher[]>();

  onPublish(_key: TriggerKey, _publisher: Publisher): void {
    // No-op — window computation is batch-based, not event-driven
  }
}

interface SlotWiring {
  operatorId: string;
  capability: TriggerCapability;
  publisher: SlotPublisher;
  subscriber: SlotSubscriber;
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
    // Clean up old wiring
    const old = this.slots[slotIndex];
    if (old) {
      unsubscribeAllSubscribers(old.publisher);
      disconnectAllPublishers(old.subscriber);
    }

    if (!operator) {
      this.slots[slotIndex] = null;
    } else {
      const capability = operator.triggerCapability;
      if (!capability) {
        this.slots[slotIndex] = null;
      } else {
        const publisher = new SlotPublisher();
        const subscriber = new SlotSubscriber();
        this.slots[slotIndex] = { operatorId: operator.id, capability, publisher, subscriber };
      }
    }

    // Re-wire all pubsub relationships
    this.wireSubscriptions();

    // Recompute from cached events
    this.recomputeWindows(this.cachedEvents);
  }

  /** Re-wire all pubsub subscriptions between slots. */
  private wireSubscriptions(): void {
    // Clear all existing subscriptions first
    for (const slot of this.slots) {
      if (slot) {
        unsubscribeAllSubscribers(slot.publisher);
        disconnectAllPublishers(slot.subscriber);
      }
    }

    // For each slot that has combo requirements, find all slots that publish matching triggers
    for (let subIdx = 0; subIdx < NUM_SLOTS; subIdx++) {
      const subSlot = this.slots[subIdx];
      if (!subSlot) continue;

      const allPublished = new Set<TriggerConditionType>();
      for (let pubIdx = 0; pubIdx < NUM_SLOTS; pubIdx++) {
        if (pubIdx === subIdx) continue;
        const pubSlot = this.slots[pubIdx];
        if (!pubSlot) continue;

        for (const triggers of Object.values(pubSlot.capability.publishesTriggers)) {
          if (triggers) triggers.forEach((t) => allPublished.add(t));
        }
      }

      for (const required of subSlot.capability.comboRequires) {
        // Check if any published trigger matches (directly or via parent)
        let anyMatch = false;
        allPublished.forEach((t) => {
          if (t === required || TRIGGER_CONDITION_PARENTS[t] === required) anyMatch = true;
        });
        if (!anyMatch) continue;
        const key = triggerKey(required);
        for (let pubIdx = 0; pubIdx < NUM_SLOTS; pubIdx++) {
          if (pubIdx === subIdx) continue;
          const pubSlot = this.slots[pubIdx];
          if (!pubSlot) continue;
          const publishes = pubSlot.capability.publishesTriggers;
          const hasTrigger = Object.keys(publishes).some((k) => {
            const triggers = publishes[k];
            if (!triggers) return false;
            return triggers.includes(required) ||
              triggers.some((t) => TRIGGER_CONDITION_PARENTS[t] === required);
          });
          if (hasTrigger) {
            pubsubSubscribe(key, pubSlot.publisher, subSlot.subscriber);
          }
        }
      }
    }
  }

  recomputeWindows(events: TimelineEvent[]): void {
    this.cachedEvents = events;

    const newWindows: WindowsMap = new Map();

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
      const finalStrikeTriggerFrame = getFinalStrikeTriggerFrame(event) ?? defaultTriggerFrame;

      for (const trigger of publishedTriggers) {
        // Skip triggers that are sourced from derived enemy events
        if (DERIVED_TRIGGER_TYPES.has(trigger)) continue;

        this.addWindowsForTrigger(trigger, event, events, newWindows, slotIdToIndex,
          trigger === TriggerConditionType.FINAL_STRIKE ? finalStrikeTriggerFrame : defaultTriggerFrame);
      }
    }

    // For derived enemy events, use their startFrame as the trigger frame
    for (const event of events) {
      if (event.ownerId !== 'enemy') continue;

      const triggers = ENEMY_COLUMN_TO_TRIGGERS[event.columnId];
      if (!triggers) continue;

      const triggerFrame = event.startFrame;

      for (const trigger of triggers) {
        this.addWindowsForTrigger(trigger, event, events, newWindows, slotIdToIndex, triggerFrame);
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

      const window: ActivationWindow = {
        startFrame: triggerFrame,
        endFrame: triggerFrame + subSlot.capability.comboWindowFrames,
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
    if (!columnIds.includes(ev.columnId)) continue;
    const totalDuration = ev.segments
      ? ev.segments.reduce((sum, s) => sum + s.durationFrames, 0)
      : ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
    if (frame >= ev.startFrame && frame < ev.startFrame + totalDuration) {
      return true;
    }
  }
  return false;
}

/**
 * For a sequenced event, compute the frame at which the final strike's first
 * hit lands.  Returns null if the event has no segments or fewer than 2.
 */
function getFinalStrikeTriggerFrame(event: TimelineEvent): number | null {
  const segs = event.segments;
  if (!segs || segs.length < 2) return null;

  // Sum durations of all segments before the last one
  let offsetFrames = 0;
  for (let i = 0; i < segs.length - 1; i++) {
    offsetFrames += segs[i].durationFrames;
  }

  const lastSeg = segs[segs.length - 1];
  // Use the last hit of the final strike segment (the actual finishing blow)
  const frames = lastSeg.frames;
  const lastHitOffset = frames && frames.length > 0
    ? frames[frames.length - 1].offsetFrame
    : 0;

  return event.startFrame + offsetFrames + lastHitOffset;
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
