import { TimelineSourceType, TriggerConditionType } from '../../consts/enums';
import {
  TRIGGER_CAPABILITIES,
  TriggerCapability,
} from '../../consts/triggerCapabilities';
import {
  SkillType,
  SkillDef,
  MiniTimeline,
  MicroColumn,
} from '../../consts/viewTypes';
import {
  Publisher,
  Subscriber,
  TriggerKey,
  triggerKey,
  subscribe as pubsubSubscribe,
  unsubscribe as pubsubUnsubscribe,
  unsubscribeAllSubscribers,
  disconnectAllPublishers,
} from '../pubsub';
import { Subtimeline } from '../timeline/subtimeline';
import { OperatorLoadout } from '../../model/loadout/operatorLoadout';
import { GearEffect } from '../../model/gears/gearEffects';
import { SKILL_COLUMN_ORDER } from '../../model/channels';
import { SKILL_LABELS } from '../../consts/channelLabels';

// ── Trigger scope ───────────────────────────────────────────────────────────

/**
 * Determines whether a trigger condition is fired by the operator's own skills
 * ('self'), by any team member ('team'), or both ('all').
 *
 * - TEAM_CAST_* are explicitly team-wide.
 * - Arts reaction statuses (COMBUSTION, etc.) can be applied by any operator.
 * - Everything else (CAST_*, CRITICAL_HIT, DEFEAT_ENEMY, etc.) is self-only.
 */
function getTriggerScope(
  condition: TriggerConditionType,
): 'self' | 'team' | 'all' {
  switch (condition) {
    // Explicitly team-wide
    case TriggerConditionType.TEAM_CAST_BATTLE_SKILL:
      return 'team';

    // Arts reaction statuses — any operator can apply these
    case TriggerConditionType.COMBUSTION:
    case TriggerConditionType.SOLIDIFICATION:
    case TriggerConditionType.CORROSION:
    case TriggerConditionType.ELECTRIFICATION:
      return 'all';

    // Self-only by default
    default:
      return 'self';
  }
}

// ── Config types ────────────────────────────────────────────────────────────

/** Configuration passed in when assigning an operator to this slot. */
export interface OperatorSlotConfig {
  /** Operator ID (must match a key in TRIGGER_CAPABILITIES if the operator has one). */
  id: string;
  /** Display color for column headers. */
  color: string;
  /** Skill definitions for the 4 standard skill columns. */
  skills: Record<SkillType, SkillDef>;
  /** Additional subtimeline columns beyond the 4 standard skills (e.g. Melting Flame). */
  extraColumns?: ExtraColumnDef[];
}

/** Definition for an extra (non-skill) subtimeline column. */
export interface ExtraColumnDef {
  columnId: string;
  label: string;
  color: string;
  headerVariant: MiniTimeline['headerVariant'];
  microColumns?: MicroColumn[];
  microColumnAssignment?: MiniTimeline['microColumnAssignment'];
  maxEvents?: number;
  requiresMonotonicOrder?: boolean;
  defaultEvent?: MiniTimeline['defaultEvent'];
}

// ── Listener types ──────────────────────────────────────────────────────────

/** Fired when the slot's operator, loadout, subtimelines, or columns change. */
export type SlotChangeListener = () => void;

/** Fired when this slot receives a combo trigger from a peer. */
export type TriggerReceivedListener = (key: TriggerKey, source: SlotController) => void;

/**
 * Fired when a gear effect or weapon skill's trigger condition is met.
 * `source` is null when the trigger came from this slot's own skills.
 */
export type EffectTriggerListener = (
  effect: GearEffect,
  key: TriggerKey,
  source: SlotController | null,
) => void;

// ── Internal pub/sub proxies ────────────────────────────────────────────────

class SlotPublisher implements Publisher {
  readonly subscribers = new Map<TriggerKey, Subscriber[]>();

  publish(key: TriggerKey): void {
    const subs = this.subscribers.get(key);
    if (subs) {
      for (const sub of subs) sub.onPublish(key, this);
    }
  }
}

/** Subscriber for combo skill triggers (cross-slot). */
class ComboSubscriber implements Subscriber {
  readonly publishers = new Map<TriggerKey, Publisher[]>();
  private readonly owner: SlotController;

  constructor(owner: SlotController) {
    this.owner = owner;
  }

  onPublish(key: TriggerKey, publisher: Publisher): void {
    this.owner.handleComboTrigger(key, publisher);
  }
}

/** Separate subscriber for gear/weapon effect triggers. */
class EffectSubscriber implements Subscriber {
  readonly publishers = new Map<TriggerKey, Publisher[]>();
  private readonly owner: SlotController;

  constructor(owner: SlotController) {
    this.owner = owner;
  }

  onPublish(key: TriggerKey, publisher: Publisher): void {
    this.owner.handleEffectTrigger(key, publisher);
  }
}

// ── SlotController ──────────────────────────────────────────────────────────

export class SlotController {
  readonly slotId: string;

  // Operator state
  private config: OperatorSlotConfig | null = null;
  private capability: TriggerCapability | null = null;

  // Loadout state
  private loadout: OperatorLoadout | null = null;
  private gearEffects: GearEffect[] = [];

  // Subtimelines
  private readonly subtimelines = new Map<string, Subtimeline>();

  // Pub/sub — separate subscribers for combo vs effect triggers
  private readonly publisher: SlotPublisher;
  private readonly comboSubscriber: ComboSubscriber;
  private readonly effectSubscriber: EffectSubscriber;

  // Peers
  private readonly peers = new Set<SlotController>();

  // Listeners
  private readonly changeListeners = new Set<SlotChangeListener>();
  private readonly comboTriggerListeners = new Set<TriggerReceivedListener>();
  private readonly effectTriggerListeners = new Set<EffectTriggerListener>();

  constructor(slotId: string) {
    this.slotId = slotId;
    this.publisher = new SlotPublisher();
    this.comboSubscriber = new ComboSubscriber(this);
    this.effectSubscriber = new EffectSubscriber(this);
  }

  // ── Operator lifecycle ──────────────────────────────────────────────────

  /**
   * Set or clear the operator for this slot.
   *
   * Tears down all existing pub/sub wiring, subtimelines, and loadout,
   * then rebuilds from the new config. Peers are automatically re-wired.
   */
  setOperator(config: OperatorSlotConfig | null): void {
    // 1. Tear down everything (operator + loadout)
    this.teardown();

    // 2. Apply new config
    this.config = config;
    this.capability = config
      ? (TRIGGER_CAPABILITIES[config.id] ?? null)
      : null;

    // 3. Build subtimelines for new operator
    if (config) {
      for (const skillType of SKILL_COLUMN_ORDER) {
        this.subtimelines.set(
          skillType,
          new Subtimeline(this.slotId, skillType),
        );
      }
      if (config.extraColumns) {
        for (const ch of config.extraColumns) {
          this.subtimelines.set(
            ch.columnId,
            new Subtimeline(this.slotId, ch.columnId),
          );
        }
      }
    }

    // 4. Re-wire combo pub/sub with all peers
    this.wireAllPeers();

    // 5. Notify
    this.notifyChange();
  }

  // ── Loadout lifecycle ─────────────────────────────────────────────────

  /**
   * Set or clear the operator's loadout and its reactive gear effects.
   *
   * Tears down only effect-related subscriptions, then re-wires gear effect
   * triggers. Combo wiring is unaffected.
   *
   * @param loadout  The full operator loadout (weapon, gears, consumables).
   * @param gearEffects  The active gear set effects from equipped gears.
   *                     Caller extracts these from gear types — the controller
   *                     subscribes to each effect's triggerCondition.
   */
  setLoadout(
    loadout: OperatorLoadout | null,
    gearEffects?: GearEffect[],
  ): void {
    // 1. Tear down old effect subscriptions only
    this.teardownEffects();

    // 2. Apply new loadout
    this.loadout = loadout;
    this.gearEffects = gearEffects ?? [];

    // 3. Wire gear effect triggers
    this.wireGearEffects();

    // 4. Notify
    this.notifyChange();
  }

  // ── Peer management ─────────────────────────────────────────────────────

  /**
   * Register a bidirectional peer relationship.
   * Both controllers are added to each other's peer sets and pub/sub is wired.
   */
  addPeer(peer: SlotController): void {
    if (peer === this || this.peers.has(peer)) return;
    this.peers.add(peer);
    peer.peers.add(this);
    this.wirePair(this, peer);
    this.wirePair(peer, this);
    // Wire gear effects for the new peer relationship
    this.wireGearEffectsForPeer(peer);
    peer.wireGearEffectsForPeer(this);
  }

  /**
   * Remove a bidirectional peer relationship.
   * Unwires pub/sub and removes from both peer sets.
   */
  removePeer(peer: SlotController): void {
    if (!this.peers.has(peer)) return;
    // Unwire combo
    this.unwirePair(this, peer);
    this.unwirePair(peer, this);
    // Unwire gear effects between the two
    this.unwireGearEffectsForPeer(peer);
    peer.unwireGearEffectsForPeer(this);
    // Remove
    this.peers.delete(peer);
    peer.peers.delete(this);
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  getOperatorId(): string | null {
    return this.config?.id ?? null;
  }

  getCapability(): TriggerCapability | null {
    return this.capability;
  }

  getLoadout(): OperatorLoadout | null {
    return this.loadout;
  }

  getGearEffects(): readonly GearEffect[] {
    return this.gearEffects;
  }

  getSubtimeline(columnId: string): Subtimeline | undefined {
    return this.subtimelines.get(columnId);
  }

  getSubtimelines(): ReadonlyMap<string, Subtimeline> {
    return this.subtimelines;
  }

  getPublisher(): Publisher {
    return this.publisher;
  }

  getComboSubscriber(): Subscriber {
    return this.comboSubscriber;
  }

  getEffectSubscriber(): Subscriber {
    return this.effectSubscriber;
  }

  /** Build the column descriptors this slot currently needs. */
  getColumns(): MiniTimeline[] {
    const cfg = this.config;
    if (!cfg) return [];

    const cols: MiniTimeline[] = [];

    // Standard skill columns
    for (const skillType of SKILL_COLUMN_ORDER) {
      const skill = cfg.skills[skillType];
      cols.push({
        key: `${this.slotId}-${skillType}`,
        type: 'mini-timeline',
        source: TimelineSourceType.OPERATOR,
        ownerId: this.slotId,
        columnId: skillType,
        label: SKILL_LABELS[skillType],
        color: cfg.color,
        headerVariant: 'skill',
        defaultEvent: {
          name: skill.name,
          defaultActiveDuration: skill.defaultActiveDuration,
          defaultLingeringDuration: skill.defaultLingeringDuration,
          defaultCooldownDuration: skill.defaultCooldownDuration,
          triggerCondition: skill.triggerCondition,
        },
      });
    }

    // Extra columns (e.g. Melting Flame, gear buff timelines)
    if (cfg.extraColumns) {
      for (const ch of cfg.extraColumns) {
        cols.push({
          key: `${this.slotId}-${ch.columnId}`,
          type: 'mini-timeline',
          source: TimelineSourceType.OPERATOR,
          ownerId: this.slotId,
          columnId: ch.columnId,
          label: ch.label,
          color: ch.color,
          headerVariant: ch.headerVariant,
          microColumns: ch.microColumns,
          microColumnAssignment: ch.microColumnAssignment,
          maxEvents: ch.maxEvents,
          requiresMonotonicOrder: ch.requiresMonotonicOrder,
          defaultEvent: ch.defaultEvent,
        });
      }
    }

    return cols;
  }

  // ── Listeners ───────────────────────────────────────────────────────────

  /** Subscribe to slot changes (operator/loadout set/cleared, subtimelines rebuilt). */
  onChange(listener: SlotChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => { this.changeListeners.delete(listener); };
  }

  /** Subscribe to combo trigger notifications from peers. */
  onComboTrigger(listener: TriggerReceivedListener): () => void {
    this.comboTriggerListeners.add(listener);
    return () => { this.comboTriggerListeners.delete(listener); };
  }

  /** Subscribe to gear/weapon effect trigger activations. */
  onEffectTrigger(listener: EffectTriggerListener): () => void {
    this.effectTriggerListeners.add(listener);
    return () => { this.effectTriggerListeners.delete(listener); };
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  /**
   * Fully destroy this controller.
   * Tears down pub/sub, clears subtimelines and loadout, removes from all peers.
   */
  destroy(): void {
    this.teardown();
    // Remove self from all peers' peer sets
    this.peers.forEach((peer) => {
      peer.peers.delete(this);
    });
    this.peers.clear();
    this.changeListeners.clear();
    this.comboTriggerListeners.clear();
    this.effectTriggerListeners.clear();
  }

  // ── Internal: trigger delegation ────────────────────────────────────────

  /**
   * Called by ComboSubscriber when a peer publishes a combo trigger.
   * @internal
   */
  handleComboTrigger(key: TriggerKey, sourcePublisher: Publisher): void {
    const sourcePeer = this.findPeerByPublisher(sourcePublisher);
    if (sourcePeer) {
      this.comboTriggerListeners.forEach((listener) => listener(key, sourcePeer!));
    }
  }

  /**
   * Called by EffectSubscriber when a gear effect's trigger condition is met.
   * Identifies which gear effects match the trigger and notifies listeners.
   * @internal
   */
  handleEffectTrigger(key: TriggerKey, sourcePublisher: Publisher): void {
    if (this.effectTriggerListeners.size === 0 || this.gearEffects.length === 0) return;

    // source is null if this came from our own publisher (self-trigger)
    const sourcePeer = sourcePublisher === this.publisher
      ? null
      : this.findPeerByPublisher(sourcePublisher);

    // Only proceed if we identified the source (or it's self)
    if (sourcePublisher !== this.publisher && !sourcePeer) return;

    // Find which gear effects match this trigger key
    for (let i = 0; i < this.gearEffects.length; i++) {
      const effect = this.gearEffects[i];
      if (triggerKey(effect.triggerCondition) === key) {
        this.effectTriggerListeners.forEach((listener) =>
          listener(effect, key, sourcePeer),
        );
      }
    }
  }

  // ── Internal: lifecycle helpers ─────────────────────────────────────────

  /** Tear down all state (operator + loadout). Does NOT clear peers or listeners. */
  private teardown(): void {
    // Disconnect combo subscriber from all publishers
    unsubscribeAllSubscribers(this.publisher);
    disconnectAllPublishers(this.comboSubscriber);

    // Disconnect effect subscriber
    disconnectAllPublishers(this.effectSubscriber);

    // Clear subtimelines
    this.subtimelines.forEach((st) => st.clear());
    this.subtimelines.clear();

    // Clear loadout
    this.loadout = null;
    this.gearEffects = [];

    this.config = null;
    this.capability = null;
  }

  /** Tear down only effect-related subscriptions. Combo wiring is preserved. */
  private teardownEffects(): void {
    disconnectAllPublishers(this.effectSubscriber);
  }

  // ── Internal: combo wiring ──────────────────────────────────────────────

  /** Wire combo pub/sub connections with all current peers. */
  private wireAllPeers(): void {
    this.peers.forEach((peer) => {
      this.wirePair(this, peer);
      this.wirePair(peer, this);
    });
  }

  /**
   * Wire a single combo pub→sub direction if the publisher publishes a trigger
   * that the subscriber's combo requires.
   */
  private wirePair(pubCtrl: SlotController, subCtrl: SlotController): void {
    const pubCap = pubCtrl.capability;
    const subCap = subCtrl.capability;
    if (!pubCap || !subCap) return;

    const required = subCap.comboRequires;
    const key = triggerKey(required);

    const triggerSets = Object.values(pubCap.publishesTriggers);
    for (let i = 0; i < triggerSets.length; i++) {
      const triggers = triggerSets[i];
      if (triggers && triggers.includes(required)) {
        pubsubSubscribe(key, pubCtrl.publisher, subCtrl.comboSubscriber);
        return;
      }
    }
  }

  /** Unwire a single combo pub→sub direction. */
  private unwirePair(pubCtrl: SlotController, subCtrl: SlotController): void {
    const subCap = subCtrl.capability;
    if (!subCap) return;
    pubsubUnsubscribe(
      triggerKey(subCap.comboRequires),
      pubCtrl.publisher,
      subCtrl.comboSubscriber,
    );
  }

  // ── Internal: gear effect wiring ────────────────────────────────────────

  /** Wire all gear effect trigger subscriptions (self + peers). */
  private wireGearEffects(): void {
    for (let i = 0; i < this.gearEffects.length; i++) {
      const effect = this.gearEffects[i];
      const condition = effect.triggerCondition;
      const scope = getTriggerScope(condition);
      const key = triggerKey(condition);

      // Self-subscribe: own publisher → own effectSubscriber
      if (scope === 'self' || scope === 'all') {
        pubsubSubscribe(key, this.publisher, this.effectSubscriber);
      }

      // Peer-subscribe: each peer's publisher → own effectSubscriber
      if (scope === 'team' || scope === 'all') {
        this.peers.forEach((peer) => {
          pubsubSubscribe(key, peer.publisher, this.effectSubscriber);
        });
      }
    }
  }

  /** Wire gear effects that need a specific peer (called when adding a peer). */
  private wireGearEffectsForPeer(peer: SlotController): void {
    for (let i = 0; i < this.gearEffects.length; i++) {
      const condition = this.gearEffects[i].triggerCondition;
      const scope = getTriggerScope(condition);

      if (scope === 'team' || scope === 'all') {
        pubsubSubscribe(
          triggerKey(condition),
          peer.publisher,
          this.effectSubscriber,
        );
      }
    }
  }

  /** Unwire gear effect subscriptions for a specific peer (called when removing a peer). */
  private unwireGearEffectsForPeer(peer: SlotController): void {
    for (let i = 0; i < this.gearEffects.length; i++) {
      const condition = this.gearEffects[i].triggerCondition;
      const scope = getTriggerScope(condition);

      if (scope === 'team' || scope === 'all') {
        pubsubUnsubscribe(
          triggerKey(condition),
          peer.publisher,
          this.effectSubscriber,
        );
      }
    }
  }

  // ── Internal: util ──────────────────────────────────────────────────────

  private findPeerByPublisher(pub: Publisher): SlotController | null {
    let found: SlotController | null = null;
    this.peers.forEach((peer) => {
      if (!found && peer.publisher === pub) found = peer;
    });
    return found;
  }

  private notifyChange(): void {
    this.changeListeners.forEach((listener) => listener());
  }
}
