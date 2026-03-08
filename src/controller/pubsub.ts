import { TriggerConditionType } from "../consts/enums";

/**
 * A canonical string key derived from a sorted tuple of trigger conditions.
 * Branded to prevent accidental use of arbitrary strings.
 */
export type TriggerKey = string & { readonly __brand: unique symbol };

/** Create a TriggerKey from one or more trigger conditions, sorted alphabetically. */
export function triggerKey(
  ...conditions: TriggerConditionType[]
): TriggerKey {
  return [...conditions].sort().join("|") as TriggerKey;
}

/** Parse a TriggerKey back into its constituent trigger conditions. */
export function parseTriggerKey(key: TriggerKey): TriggerConditionType[] {
  return key.split("|") as TriggerConditionType[];
}

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface Publisher {
  /** Mapping from trigger key → subscribers listening for that trigger. */
  readonly subscribers: Map<TriggerKey, Subscriber[]>;

  /** Notify all subscribers registered under the given trigger key. */
  publish(key: TriggerKey): void;
}

export interface Subscriber {
  /** Mapping from trigger key → publishers this subscriber is listening to. */
  readonly publishers: Map<TriggerKey, Publisher[]>;

  /** Called when a publisher fires the given trigger key. */
  onPublish(key: TriggerKey, publisher: Publisher): void;
}

// ── Subscription management ─────────────────────────────────────────────────

/** Register a bidirectional subscription between a publisher and subscriber. */
export function subscribe(
  key: TriggerKey,
  publisher: Publisher,
  subscriber: Subscriber,
): void {
  const subs = publisher.subscribers.get(key);
  if (subs) {
    if (!subs.includes(subscriber)) subs.push(subscriber);
  } else {
    publisher.subscribers.set(key, [subscriber]);
  }

  const pubs = subscriber.publishers.get(key);
  if (pubs) {
    if (!pubs.includes(publisher)) pubs.push(publisher);
  } else {
    subscriber.publishers.set(key, [publisher]);
  }
}

/** Remove a bidirectional subscription between a publisher and subscriber. */
export function unsubscribe(
  key: TriggerKey,
  publisher: Publisher,
  subscriber: Subscriber,
): void {
  const subs = publisher.subscribers.get(key);
  if (subs) {
    const idx = subs.indexOf(subscriber);
    if (idx !== -1) subs.splice(idx, 1);
    if (subs.length === 0) publisher.subscribers.delete(key);
  }

  const pubs = subscriber.publishers.get(key);
  if (pubs) {
    const idx = pubs.indexOf(publisher);
    if (idx !== -1) pubs.splice(idx, 1);
    if (pubs.length === 0) subscriber.publishers.delete(key);
  }
}

/**
 * Remove all subscribers from a publisher, cleaning up both sides.
 * Call when an event is removed or its operator loadout changes.
 */
export function unsubscribeAllSubscribers(publisher: Publisher): void {
  publisher.subscribers.forEach((subs, key) => {
    subs.forEach((sub) => {
      const pubs = sub.publishers.get(key);
      if (pubs) {
        const idx = pubs.indexOf(publisher);
        if (idx !== -1) pubs.splice(idx, 1);
        if (pubs.length === 0) sub.publishers.delete(key);
      }
    });
  });
  publisher.subscribers.clear();
}

/**
 * Disconnect a subscriber from all its publishers, cleaning up both sides.
 * Call when an event is removed or its operator loadout changes.
 */
export function disconnectAllPublishers(subscriber: Subscriber): void {
  subscriber.publishers.forEach((pubs, key) => {
    pubs.forEach((pub) => {
      const subs = pub.subscribers.get(key);
      if (subs) {
        const idx = subs.indexOf(subscriber);
        if (idx !== -1) subs.splice(idx, 1);
        if (subs.length === 0) pub.subscribers.delete(key);
      }
    });
  });
  subscriber.publishers.clear();
}
