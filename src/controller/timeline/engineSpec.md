# Engine Specification

Architecture of the event processing engine. Describes how raw user-placed events become fully resolved timeline state.

---

## Invariant: No Bulk Pre/Post Processing

**Never add passes that iterate all events before or after the queue to transform them in bulk.** All event processing happens through DerivedEventController registration and the priority queue — not through batch transformation passes over the full event array.

A chain-of-action search is fine. Some frames need to resolve to the source frame responsible for the chain that caused them. Tracing causality through events is expected; bulk-transforming all events is not.

---

## Core Components

| Component | File | Role |
|-----------|------|------|
| `DerivedEventController` | `derivedEventController.ts` | Owns all derived events. Domain controllers handle creation/consumption logic. Registration, time-stop discovery, duration extension, combo chaining, validation, frame position caching. Single source of truth. |
| `EventInterpretor` | `eventInterpretor.ts` | DSL interpreter — dispatches verb+objectType to DerivedEventController domain methods. Implements canDo/do pattern for ALL loop semantics. Validates against VERB_OBJECTS grammar. |
| `EventInterpretor` | `eventInterpretor.ts` | DSL interpreter + queue frame processor. Interprets Effect trees and processes QueueFrame entries, routing both through DerivedEventController domain methods. |
| `InputEventController` | `eventQueue.ts` | Receives raw user-placed events, extracts frame markers, seeds the queue, runs the interpreter. Pipeline orchestrator. |
| `EventsQueryService` | `eventsQueryService.ts` | Read-only query interface backed by DerivedEventController. Provides domain-specific lookups (susceptibility, fragility, link, amp, corrosion) for the damage calculation layer. |
| `PriorityQueue` | `priorityQueue.ts` | Generic min-heap. Entries ordered by `(frame, priority)`. |

### DerivedEventController Domain Methods

| Method | Handles |
|--------|---------|
| `createInfliction(col, owner, frame, dur, source)` | Deque stacking (cap 4), cross-element reaction trigger, duration extension |
| `createReaction(col, owner, frame, dur, source, opts)` | Corrosion merge (max stats, extend duration), non-corrosion refresh |
| `createStatus(col, owner, frame, dur, source, opts)` | Stacking behavior (RESET clears, MERGE subsumes older), exchange cap, time-stop extension |
| `createStagger(col, owner, frame, value, source)` | Display-only / no-op for now |
| `consumeInfliction(col, owner, frame, count, source)` | Absorb oldest N active |
| `consumeReaction(col, owner, frame, source)` | Clamp active reaction |
| `consumeStatus(col, owner, frame, source)` | Clamp active in column |
| `canApply*(col, owner, frame)` | Check if apply is possible (for ALL loop canDo checks) |
| `canConsume*(col, owner, frame)` | Check if consume is possible (activeCount > 0) |

---

## Event Lifecycle

```
Raw events (user-placed, game-time durations)
    │
    ▼
DerivedEventController.registerEvents()
    ├─ Per-event combo chaining (truncate overlapping combo animations)
    └─ Per-event time-stop discovery (register stop regions)
    │
    ▼
DerivedEventController.extendAll()
    └─ Extend all durations by foreign time-stops (game-time → timeline-time)
    │
    ▼
DerivedEventController.resolveComboTriggers() / applyPotentialEffects()
    ├─ Set comboTriggerColumnId on combo events from operator trigger capabilities
    └─ Truncate combo cooldowns on ultimate cast (potential-gated)
    │
    ▼
Register SP recovery + talent events (same registration path)
    │
    ▼
Frame marker extraction (collector functions scan segments)
    └─ Each marker → QueueFrame entry in priority queue
    │
    ▼
EventInterpretor.processQueueFrame() (run loop in eventQueue.ts)
    └─ Process all QueueFrames chronologically
       Each handler reads context, evaluates conditions, mutates DerivedEventController
    │
    ▼
Combo activation window derivation (post-queue, view-layer)
    │
    ▼
DerivedEventController.cacheFramePositions() + validateAll()
    │
    ▼
DerivedEventController.getRegisteredEvents() → returned to view
    │
    ▼
EventsQueryService(derivedEventController) → damage table queries
```

---

## DerivedEventController

### Registration API

| Method | Description |
|--------|-------------|
| `registerEvents(events)` | Register events with inline combo chaining + stop discovery. |
| `extendAll()` | Extend all not-yet-extended events by foreign time-stops. |
| `applyPotentialEffects()` | Combo cooldown resets (e.g. Wulfgard P5). |
| `resolveComboTriggers(wirings)` | Set `comboTriggerColumnId` from operator trigger capabilities. |
| `cacheFramePositions()` | Compute `absoluteFrame` and `derivedOffsetFrame` on all frame markers. |
| `validateAll()` | Attach warnings to events starting inside time-stop regions. |

### Domain Controller API (used by EventInterpretor)

| Method | Description |
|--------|-------------|
| `createInfliction(col, owner, frame, dur, source, opts)` | Deque stacking (cap 4), cross-element reaction trigger, duration extension. |
| `createReaction(col, owner, frame, dur, source, opts)` | Corrosion merge (max stats, extend duration), non-corrosion refresh. |
| `createStatus(col, owner, frame, dur, source, opts)` | Stacking behavior (RESET/MERGE), exchange cap, time-stop extension. Extra event props via `opts.event`. |
| `createStagger(col, owner, frame, value, source)` | Display-only / no-op for now. |
| `consumeInfliction(col, owner, frame, count, source)` | Absorb oldest N active. |
| `consumeReaction(col, owner, frame, source)` | Clamp active reaction. |
| `consumeStatus(col, owner, frame, source)` | Clamp active in column. |
| `canApplyInfliction(col, owner, frame)` | Always true (deque evicts oldest). |
| `canApplyStatus(col, owner, frame, maxStacks?)` | Check exchange stack cap. |
| `canApplyReaction(col, owner, frame)` | Always true (reactions merge). |
| `canConsumeInfliction(col, owner, frame)` | activeCount > 0. |
| `canConsumeReaction(col, owner, frame)` | activeCount > 0. |
| `canConsumeStatus(col, owner, frame)` | activeCount > 0. |

### Low-Level Mutation API (public for test setup and generic event insertion)

| Method | Description |
|--------|-------------|
| `addEvent(ev)` | Generic event insertion with time-stop extension. |
| `resetColumn(col, owner, frame, source)` | RESET stacking: clamp all active in column. |

### Query API

| Method | Description |
|--------|-------------|
| `getRegisteredEvents()` | All events (raw + derived + combo windows). |
| `getStops()` | Discovered time-stop regions. |
| `activeCount(col, owner, frame)` | Count active events at frame. |
| `getActiveEvents(col, owner, frame)` | Get active events at frame. |
| `getAllEvents()` | Registered + queue output. |

---

## Priority Queue

### QueueFrame

Single entry type for all queue operations:

```typescript
interface QueueFrame {
  frame: number;        // absolute timeline position
  priority: number;     // processing order at same frame
  type: FrameType;      // determines which handler runs
  // Event context
  columnId: string;
  ownerId: string;
  sourceOwnerId: string;
  sourceSkillName: string;
  // Type-specific payloads
  derivedEvent?: TimelineEvent;      // FRAME_EFFECT
  absorptionMarker?: {...};          // ABSORPTION_CHECK
  consumeReaction?: {...};           // CONSUME (reaction)
  cryoSusceptibility?: {...};        // CONSUME (cryo)
  engineTrigger?: EngineTriggerEntry; // ENGINE_TRIGGER
  comboResolve?: {...};              // COMBO_RESOLVE
}
```

### Priority Order

| Priority | Type | Handler |
|----------|------|---------|
| 5 | `FRAME_EFFECT` | Enemy statuses (Focus, susceptibility), forced reactions, team buffs (LINK), originium crystals |
| 10 | `INFLICTION_CREATE` | Deque stacking (cap 4) + inline cross-element reaction (e.g. Heat + Nature → Corrosion) |
| 15 | `CONSUME` | Clamp/remove active events — exchange statuses, reactions, inflictions |
| 16 | `COMBO_RESOLVE` | Deferred combo trigger resolution against live world state (runs after inflictions + reactions + consumptions so all conditions are visible) |
| 18 | `ABSORPTION_CHECK` | Consume enemy inflictions → create operator exchange statuses (Melting Flame, Thunderlance) |
| 20 | `EXCHANGE_CREATE` | Create exchange stacks from explicit triggers (with cap check) |
| 22 | `ENGINE_TRIGGER` | Evaluate HAVE conditions → create derived statuses (arts amp, etc.) |

---

## Frame Marker Extraction

Collector functions scan registered events' segments for frame markers and produce QueueFrame entries. Each collector handles one marker type:

| Collector | Scans for | Produces |
|-----------|-----------|----------|
| `collectFrameEffectEntries` | `applyStatus`, `applyForcedReaction` | FRAME_EFFECT |
| `collectInflictionEntries` | `applyArtsInfliction`, combo trigger ticks | INFLICTION_CREATE |
| `collectConsumeEntries` | `consumeStatus` | CONSUME |
| `collectFinalStrikeEntries` | Final Strike trigger frames | ABSORPTION_CHECK |
| `collectAbsorptionFrameEntries` | `absorbArtsInfliction`, `consumeArtsInfliction` | ABSORPTION_CHECK, CONSUME |
| `collectConsumeReactionEntries` | `consumeReaction`, clause-based consumption | CONSUME |
| `collectCryoConsumptionEntries` | Cryo combo events (Last Rite talent) | CONSUME |

All collectors live in `eventQueue.ts`.

---

## Time-Stop Handling

- **Discovery**: `DerivedEventController.registerEvents()` scans each event via `isTimeStopEvent()` (combos, ultimates, perfect dodges with `animationDuration > 0`).
- **Combo chaining**: When a combo's time-stop overlaps an existing combo's, the older is truncated at the newer's start frame. Handled per-event during registration.
- **Extension**: `DerivedEventController.extendAll()` extends each event's duration by foreign time-stops (stops excluding the event's own). Segmented events extend per-segment. Time-stop events' animation portions are never extended.
- **Frame positions**: `DerivedEventController.cacheFramePositions()` computes `absoluteFrame` on every frame marker, accounting for time-stop extension of frame offsets.

---

## EventsQueryService

Read-only interface backed by DerivedEventController. Pre-filters events by column at construction for O(n) per-column queries. Used by the damage calculation layer.

| Method | Returns |
|--------|---------|
| `getSusceptibilityBonus(frame, element)` | Sum of active susceptibility effects |
| `getFragilityBonus(frame, element)` | Sum of electrification/breach/weapon/talent fragility |
| `getLinkBonus(frame, skillType)` | Link damage bonus by stack count |
| `getAmpBonus(frame)` | Sum of active arts amp effects |
| `getCorrosionResistanceReduction(frame)` | Max active corrosion resistance reduction |
| `getIgnoredResistance(frame, element, attacker)` | Scorching Heart ignored resistance |
| `getWeakenEffects(frame)` | Active weaken fractions |
| `getDmgReductionEffects(frame)` | Active damage reduction fractions |
| `getProtectionEffects(frame)` | Active protection fractions |
| `is*Active(frame)` | Boolean status checks (stagger, cryo, solidification, link, amp) |
| `get*Sources(frame, element)` | Itemized multiplier sources for damage breakdown |
