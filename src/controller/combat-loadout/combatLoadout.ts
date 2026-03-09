import { TimelineEvent, Operator } from '../../consts/viewTypes';
import { TriggerConditionType } from '../../consts/enums';
import { WeaponRegistryEntry } from '../../utils/loadoutRegistry';
import { TRIGGER_CAPABILITIES, TriggerCapability } from '../../consts/triggerCapabilities';
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

  setOperator(slotIndex: number, operatorId: string | null): void {
    // Clean up old wiring
    const old = this.slots[slotIndex];
    if (old) {
      unsubscribeAllSubscribers(old.publisher);
      disconnectAllPublishers(old.subscriber);
    }

    if (!operatorId) {
      this.slots[slotIndex] = null;
    } else {
      const capability = TRIGGER_CAPABILITIES[operatorId];
      if (!capability) {
        this.slots[slotIndex] = null;
      } else {
        const publisher = new SlotPublisher();
        const subscriber = new SlotSubscriber();
        this.slots[slotIndex] = { operatorId, capability, publisher, subscriber };
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

    // For each slot that has a combo requirement, find all slots that publish that trigger
    for (let subIdx = 0; subIdx < NUM_SLOTS; subIdx++) {
      const subSlot = this.slots[subIdx];
      if (!subSlot) continue;

      const requiredTrigger = subSlot.capability.comboRequires;
      const key = triggerKey(requiredTrigger);

      for (let pubIdx = 0; pubIdx < NUM_SLOTS; pubIdx++) {
        if (pubIdx === subIdx) continue;
        const pubSlot = this.slots[pubIdx];
        if (!pubSlot) continue;

        // Check if this publisher publishes the required trigger
        for (const triggers of Object.values(pubSlot.capability.publishesTriggers)) {
          if (triggers && triggers.includes(requiredTrigger)) {
            pubsubSubscribe(key, pubSlot.publisher, subSlot.subscriber);
            break;
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

    // For each event, determine what triggers it produces
    for (const event of events) {
      const slotIndex = slotIdToIndex.get(event.ownerId);
      if (slotIndex === undefined) continue;

      const pubSlot = this.slots[slotIndex];
      if (!pubSlot) continue;

      const publishedTriggers = pubSlot.capability.publishesTriggers[event.columnId];
      if (!publishedTriggers || publishedTriggers.length === 0) continue;

      // Window starts at end of active duration
      const triggerFrame = event.startFrame + event.activationDuration;

      // For each published trigger, find all slots whose combo requires it
      for (const trigger of publishedTriggers) {
        for (let subIdx = 0; subIdx < NUM_SLOTS; subIdx++) {
          const subSlot = this.slots[subIdx];
          if (!subSlot) continue;
          if (subSlot.capability.comboRequires !== trigger) continue;

          const slotId = this.slotIds[subIdx];
          if (!slotId) continue;

          const window: ActivationWindow = {
            startFrame: triggerFrame,
            endFrame: triggerFrame + subSlot.capability.comboWindowFrames,
            sourceEventId: event.id,
          };

          if (!newWindows.has(slotId)) {
            newWindows.set(slotId, []);
          }
          newWindows.get(slotId)!.push(window);
        }
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
