# SlotController

Per-operator-slot controller that couples an operator's loadout with its subtimelines and cross-slot pub/sub wiring.

## Responsibility

- Owns and manages `Subtimeline` instances for one operator slot
- Determines which mini-timeline columns the slot needs (4 skill channels + extras)
- Wires/unwires pub/sub with peer `SlotController`s for combo trigger flow
- Subscribes to trigger conditions from gear effects (self/team/all scope)
- Delegates incoming trigger notifications to listeners
- Guarantees cleanup on operator change, loadout change, and destroy (no leaked subscriptions)

## Lifecycle

```
constructor(slotId)
  → creates empty slot with publisher + 2 subscriber proxies (combo + effect)

setOperator(config | null)
  → teardown():
      unsubscribeAllSubscribers(publisher)       // clean pub side
      disconnectAllPublishers(comboSubscriber)    // clean combo sub side
      disconnectAllPublishers(effectSubscriber)   // clean effect sub side
      clear + delete all subtimelines
      clear loadout + gearEffects
  → if config:
      create Subtimeline per skill channel (basic/battle/combo/ultimate)
      create Subtimeline per extraChannel (e.g. melting-flame)
      use config.triggerCapability (passed in from view-layer Operator)
  → wireAllPeers()
  → notifyChange()

setLoadout(loadout | null, gearEffects?)
  → teardownEffects():
      disconnectAllPublishers(effectSubscriber)  // only effect subs, combo preserved
  → store loadout + gearEffects
  → wireGearEffects()
  → notifyChange()

destroy()
  → teardown()
  → remove self from all peers' peer sets
  → clear peers, changeListeners, comboTriggerListeners, effectTriggerListeners
```

## Pub/Sub Architecture

Two separate `Subscriber` instances per slot:

| Subscriber | Purpose | Wired by | Torn down by |
|---|---|---|---|
| `ComboSubscriber` | Cross-slot combo triggers | `setOperator` / `addPeer` | `setOperator` / `destroy` |
| `EffectSubscriber` | Gear effect trigger conditions | `setLoadout` / `addPeer` | `setLoadout` / `setOperator` / `destroy` |

This separation allows `setLoadout()` to tear down and rewire gear effect subscriptions without disturbing combo wiring.

## Peer Wiring

Peers are other `SlotController` instances (one per team slot). Relationships are **bidirectional**: `A.addPeer(B)` adds B to A and A to B.

```
wirePair(pubCtrl, subCtrl):
  if pubCtrl publishes any trigger that subCtrl.comboRequires →
    pubsubSubscribe(key, pubCtrl.publisher, subCtrl.comboSubscriber)

unwirePair(pubCtrl, subCtrl):
  pubsubUnsubscribe(key, pubCtrl.publisher, subCtrl.comboSubscriber)
```

On `setOperator`, the full teardown + rewire cycle runs. `unsubscribeAllSubscribers` and `disconnectAllPublishers` handle cleanup without needing to track individual keys — they iterate the publisher/subscriber maps internally and remove both sides of every link.

On `addPeer`, both combo and gear effect wiring happens for the new peer.

## Combo Trigger Flow

```
Peer's skill event ends
  → peer.publisher.publish(COMBUSTION)
  → this.comboSubscriber.onPublish(COMBUSTION, peer.publisher)
  → this.handleComboTrigger(key, publisher)
    → resolve publisher → peer SlotController
    → notify all comboTriggerListeners(key, sourcePeer)
```

## Gear Effect Trigger Flow

```
getTriggerScope(condition) → 'self' | 'team' | 'all'

wireGearEffects():
  for each gearEffect:
    scope = getTriggerScope(effect.triggerCondition)
    if self/all → subscribe(key, own publisher, effectSubscriber)
    if team/all → subscribe(key, each peer's publisher, effectSubscriber)

Trigger fires:
  → effectSubscriber.onPublish(key, sourcePublisher)
  → handleEffectTrigger(key, sourcePublisher):
    → source = null if own publisher, else resolve to peer
    → for each gearEffect matching this key:
        → notify effectTriggerListeners(effect, key, source)
```

### Trigger Scoping Rules

| Scope | Triggers | Example |
|---|---|---|
| `self` | Operator's own skill events | CAST_BATTLE_SKILL, CRITICAL_HIT, DEFEAT_ENEMY |
| `team` | Any team member's skill events | TEAM_CAST_BATTLE_SKILL |
| `all` | Arts reaction statuses (any source) | COMBUSTION, SOLIDIFICATION, CORROSION, ELECTRIFICATION |

## Column Generation

`getColumns()` returns `MiniTimeline[]` for the view layer:

1. **Skill columns** — one per skill type in `SKILL_CHANNEL_ORDER` order, using `config.skills[type]` for defaults
2. **Extra channels** — appended in order from `config.extraChannels`, used for operator-specific (Melting Flame) or gear-driven buff timelines

The view layer handles visibility filtering (which columns to actually render).

## Config

```typescript
interface OperatorSlotConfig {
  id: string;                              // operator ID
  color: string;                           // column header color
  skills: Record<SkillType, SkillDef>;     // 4 standard skill channels
  extraChannels?: ExtraChannelDef[];       // MF, gear buffs, etc.
}

interface ExtraChannelDef {
  channelId: string;
  label: string;
  color: string;
  headerVariant: 'skill' | 'infliction' | 'mf';
  microColumns?: MicroColumn[];
  microColumnAssignment?: 'by-order' | 'by-channel-id';
  maxEvents?: number;
  requiresMonotonicOrder?: boolean;
  defaultEvent?: { name, durations, triggerCondition };
}
```

## Listeners

| Method | Fires when |
|--------|-----------|
| `onChange(cb)` | operator/loadout set/cleared, subtimelines rebuilt |
| `onComboTrigger(cb)` | combo trigger received from a peer |
| `onEffectTrigger(cb)` | gear effect trigger condition met (self or peer) |

All return unsubscribe functions.

## Cleanup Guarantees

- `setOperator(null)` tears down all pub/sub (combo + effects), subtimelines, and loadout; peers stay connected
- `setOperator(newConfig)` tears down old, builds new, re-wires peers atomically
- `setLoadout(null)` tears down only effect subscriptions; combo wiring preserved
- `setLoadout(newLoadout, effects)` tears down old effects, wires new ones
- `removePeer(peer)` unwires both combo and effects in both directions, removes from both peer sets
- `destroy()` does full teardown + removes self from all peers + clears all listener sets
- No dangling references: `unsubscribeAllSubscribers`/`disconnectAllPublishers` clean both sides of the pub/sub graph

## Relationship to CombatLoadout

`CombatLoadout` currently manages all 4 slots centrally and computes activation windows. `SlotController` handles the per-slot concerns (subtimeline ownership, column generation, pub/sub identity, loadout-driven effect triggers). Activation window computation can migrate to `SlotController` or remain in `CombatLoadout` as a cross-slot coordinator.
