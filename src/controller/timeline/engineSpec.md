# Engine Specification

Architecture of the event processing engine. Describes how raw user-placed events become fully resolved timeline state.

---

## Invariant: No Bulk Pre/Post Processing

**Never add passes that iterate all events before or after the queue to transform them in bulk.** All event processing happens inline — per-event during registration, per-frame during queue processing, or as chain-of-action traces from a specific cause to its effects.

A chain-of-action search is fine. Some frames need to resolve to the source frame responsible for the chain that caused them. Tracing causality through events is expected; bulk-transforming all events is not.

Specifically prohibited:
- `.map()` / `.filter()` over all registered events to transform them
- Post-queue passes that iterate the full event array to mutate events
- Hardcoded behavior maps — all behaviors must come from operator/weapon/gear configs

---

## Pipeline

`processCombatSimulation` is the pipeline entry point. All controller/interpreter instances are per-invocation (created fresh each run). The pipeline is a pure derivation: raw events + loadout context in → processed events out.

```
processCombatSimulation(rawEvents, loadoutContext...)
  1. InputEventController.classifyEvents(rawEvents)     → { inputEvents (sorted by startFrame), derivedEvents }
  2. new DerivedEventController(triggerAssociations)      → state
  2b. state.seedControlledOperator(firstOccupiedSlotId)  → seeds CONTROL for first operator (full timeline)
  3. state.registerEvents(inputEvents)                    → inline: extension, frame positions, combo triggers, CONTROL clamping, validation
  4. SkillPointController.deriveSPRecoveryEvents(...)     → SP recovery events → state.registerEvents
  5. runEventQueue(state, derivedEvents, ...)             → builds TriggerIndex, seeds talent + derived + triggers, runs EventInterpretorController
  6. state.getProcessedEvents()                           → final output (reactions merged)
```

### Components

| Component | File | Lifecycle | Role |
|-----------|------|-----------|------|
| `InputEventController` | `inputEventController.ts` | Stateless functions | `classifyEvents`: splits raw events into input (operator skills) and derived (freeform inflictions/reactions), sorts input events by `startFrame`. Also provides event creation/validation for the view layer. |
| `DerivedEventController` | `derivedEventController.ts` | Per-invocation | Single source of truth. Inline registration (extension, frame positions, combo triggers, validation). Domain methods for creation/consumption. `addEvent` for queue-created events. |
| `EventQueueController` | `eventQueueController.ts` | Stateless function | `runEventQueue`: builds TriggerIndex, seeds priority queue from frame markers + derived events + triggers + talents, runs EventInterpretorController loop, registers output. |
| `TriggerIndex` | `triggerIndex.ts` | Per-invocation | Config-driven index mapping observable verbs to trigger defs. Built from operator/weapon/gear JSON. Used by EventInterpretorController for reactive trigger evaluation. |
| `EventInterpretorController` | `eventInterpretorController.ts` | Per-invocation | DSL interpreter + queue frame handler. Routes effects through DerivedEventController domain methods. Reactive trigger evaluation via TriggerIndex after each DEC mutation. |
| `CombatLoadoutController` | `combatLoadoutController.ts` | Persistent (React) | Manages operator/weapon/gear selection. Provides loadout context to the pipeline. |
| `SkillPointController` | `skillPointController.ts` | Persistent (React) | SP resource timeline. `deriveSPRecoveryEvents` derives SP events; `sync` post-processes after pipeline. |
| `StaggerController` | `staggerController.ts` | Persistent (React) | Stagger resource timeline. `sync` post-processes after pipeline. |
| `EventsQueryService` | `eventsQueryService.ts` | Per-invocation | Read-only query interface backed by DerivedEventController for damage calculation. |

### Supporting Utilities

| Utility | File | Role |
|---------|------|------|
| `processTimeStop` | `processTimeStop.ts` | Pure functions for time-stop math. |
| `triggerMatch` | `triggerMatch.ts` | Trigger clause matching: verb handler registry. |
| `statusTriggerCollector` | `statusTriggerCollector.ts` | Queue-seeding: collects trigger contexts from operator/weapon/gear configs. |
| `processComboSkill` | `processComboSkill.ts` | Combo domain: activation window derivation (from `activationWindow` embedded Event in combo skill JSON), final strike frame computation. Windows carry `maxSkills` for chaining. |
| `processInfliction` | `processInfliction.ts` | Infliction/reaction domain: reaction merging, segment builders. |
| `ConfigController` | `configController.ts` | Config deserialization and caching. |

---

## DerivedEventController

### Two Paths for Events

Events enter DEC through two paths with different time-stop handling:

**Path A: `registerEvents(events)` — input events, SP recovery, talents**
- These are registered into `registeredEvents` with full inline processing:
  - Pass 1: combo chaining, reaction segments, stop discovery
  - Pass 2: time-stop extension (`extendSingleEvent`), frame positions (`computeFramePositions`), validation (`validateTimeStopStart`)
  - Pass 3: combo trigger resolution
- Events arrive fully adjusted — durations extended, frame positions computed.

**Path B: `addEvent(ev)` — queue-created events (inflictions, reactions, statuses)**
- Created by EventInterpretorController during queue processing.
- Duration extended by time-stops inline (`extendDuration`).
- Stored in `stacks` (for active queries) and `output` (for final output).
- NOT in `registeredEvents` — no combo chaining, no frame position computation at this point.
- After the queue completes, `state.registerEvents(queueEvents)` runs Pass 2 on them (frame positions, validation). Extension is skipped via `extendedIds` guard since `addEvent` already extended them.

### Domain Controller API (used by EventInterpretorController)

| Method | Handles |
|--------|---------|
| `createInfliction(col, owner, frame, dur, source)` | Deque stacking (cap 4), cross-element reaction trigger, duration extension |
| `createReaction(col, owner, frame, dur, source, opts)` | Corrosion merge (max stats, extend duration), non-corrosion refresh |
| `createStatus(col, owner, frame, dur, source, opts)` | Stacking behavior (RESET/MERGE), exchange cap, time-stop extension |
| `createStagger(col, owner, frame, value, source)` | Display-only / no-op for now |
| `consumeInfliction(col, owner, frame, count, source)` | Absorb oldest N active |
| `consumeReaction(col, owner, frame, source)` | Clamp active reaction |
| `consumeStatus(col, owner, frame, source)` | Clamp active in column |
| `resetCooldown(eventId, resetFrame)` | Truncate a skill event's cooldown segment at the given frame |
| `canApply*(col, owner, frame)` | Check if apply is possible (for ALL loop canDo checks) |
| `canConsume*(col, owner, frame)` | Check if consume is possible (activeCount > 0) |

### Query API

| Method | Description |
|--------|-------------|
| `getRegisteredEvents()` | All events in `registeredEvents` (input + SP + talent + post-queue registered). |
| `getProcessedEvents()` | `registeredEvents` with reactions merged + reaction frames attached. Final view output. |
| `getStops()` | Discovered time-stop regions. |
| `activeCount(col, owner, frame)` | Count active events at frame (queries both `stacks` and `registeredEvents`). |
| `getActiveEvents(col, owner, frame)` | Get active events at frame. |

---

## Event Lifecycle

```
processCombatSimulation(rawEvents, loadoutContext)
    │
    ├─ 1. InputEventController.classifyEvents → { inputEvents, derivedEvents }
    │
    ├─ 2. DerivedEventController.registerEvents(inputEvents)
    │      ├─ Pass 1: combo chaining, reaction segments, stop discovery
    │      ├─ Pass 2: time-stop extension, frame positions, validation
    │      └─ Pass 3: combo trigger resolution
    │
    ├─ 3. SkillPointController.deriveSPRecoveryEvents → register SP events
    │      collectEngineTriggerEntries → register talent events
    │
    ├─ 4. runEventQueue(state, derivedEvents)
    │      ├─ Seed derived events (freeform inflictions/reactions) into queue
    │      ├─ Seed frame markers from registered input events
    │      ├─ Seed trigger contexts (exchange, absorption, engine)
    │      ├─ EventInterpretorController.processQueueFrame() loop
    │      │    └─ Pop entries in (frame, priority) order
    │      │       Process effects via DEC domain methods (addEvent)
    │      │       Queue-created events: duration extended inline, stored in stacks/output
    │      ├─ state.registerEvents(queueEvents + comboWindows)
    │      │    └─ Pass 2 runs: frame positions + validation (extension skipped — already done)
    │      └─ state.validateAll() — sibling overlap check
    │
    └─ 5. DerivedEventController.getProcessedEvents()
           └─ mergeReactions + attachReactionFrames → returned to view
    │
    ▼
Post-pipeline (app layer):
    SkillPointController.sync(processedEvents) → SP resource timeline
    StaggerController.sync(processedEvents) → stagger resource timeline
    EventsQueryService(controller) → damage table queries
```

---

## Priority Queue

Entries ordered by `(frame, priority)`. Lower priority fires first at the same frame.

| Priority | Type | Handler |
|----------|------|---------|
| 5 | `PROCESS_FRAME` | Unified frame processing — DSL clause interpretation for skill events, freeform event creation (inflictions, reactions, statuses) via step 3b for non-skill events. Post-hook: reactive trigger evaluation. |
| 22 | `ENGINE_TRIGGER` | Evaluate HAVE conditions + create derived statuses. Seeded from input events (PERFORM), from reactive post-hooks (APPLY/CONSUME/lifecycle), and from TriggerIndex. Fires before COMBO_RESOLVE so trigger effects (e.g. Scorching Heart infliction absorption) resolve first. |
| 25 | `COMBO_RESOLVE` | Deferred combo trigger resolution. Fires after ENGINE_TRIGGER so that trigger-consumed inflictions are gone before combo HAVE conditions are checked. |

---

## Time-Stop Handling

Time-stop adjustment happens in two places depending on the event path:

### Input events (registerEvents → Path A)
- **Discovery**: Per-event in Pass 1 via `isTimeStopEvent()` (combos, ultimates, perfect dodges with `animationDuration > 0`).
- **Combo chaining**: When a combo's time-stop overlaps an existing combo's, the older is truncated at the newer's start frame. Per-event during registration.
- **Extension**: Per-event in Pass 2. Each event's segment durations extended by foreign time-stops (game-time segments only — `REAL_TIME` segments and the stop event's own animation are never extended).
- **Frame positions**: Per-event in Pass 2. `absoluteFrame` and `derivedOffsetFrame` computed on all frame markers.

### Queue-created events (addEvent → Path B)
- **Duration extension**: Inline in `addEvent` via `extendDuration`. Duration extended by all known stops at the time of creation.
- **Frame positions**: Computed later when queue events are registered post-queue (`state.registerEvents(queueEvents)`). Pass 2 runs `computeFramePositions` on each event. Extension is skipped (already done, marked in `extendedIds`).
- **New stop discovery**: If a queue-created event is itself a time-stop, `addEvent` calls `maybeRegisterStop` + `reExtendQueueEvents` to adjust durations of previously-created queue events.

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
| `getIgnoredResistance(frame, element, attacker)` | Ignored resistance from active status effects |
| `getWeakenEffects(frame)` | Active weaken fractions |
| `getDmgReductionEffects(frame)` | Active damage reduction fractions |
| `getProtectionEffects(frame)` | Active protection fractions |
| `is*Active(frame)` | Boolean status checks (stagger, cryo, solidification, link, amp) |
| `get*Sources(frame, element)` | Itemized multiplier sources for damage breakdown |
