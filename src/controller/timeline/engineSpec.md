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

`processCombatSimulation` is the pipeline entry point. The pipeline is a pure derivation: raw events + loadout context in → processed events out.

**Single ingress contract (Phase 8):** every event enters `DerivedEventController` through `createSkillEvent(ev)`. There is no batch `registerEvents`, no `seedControlledOperator`, no `extendedIds` guard, no `markExtended`. Per-event ingress runs combo chaining, reaction segmentation, stop discovery (with retroactive re-extension of earlier events), idempotent time-stop extension, frame position computation, validation, combo-window re-resolution, and queue-frame emission — all for a single event.

```
processCombatSimulation(rawEvents, loadoutContext...)
  1. parser/cloneAndSplitEvents(rawEvents)         → { inputEvents (sorted by startFrame), derivedEvents }
  2. DerivedEventController.reset(...)             → state
  3. Control seed:  parser/buildControlSeed(slot)  → state.createSkillEvent(seed, { checkCooldown: false })
  4. For each inputEvent:                             state.createSkillEvent(ev, { checkCooldown: false })
  5. For each enemy action event:                     state.createSkillEvent(ev, { checkCooldown: false })
  6. runEventQueue(state, derivedEvents, ...)
       ├─ builds TriggerIndex
       ├─ parser/selectNewTalents → createSkillEvent loop
       ├─ Interprets passive talent APPLY STAT clauses inline
       ├─ Bulk flattenEventsToQueueFrames(derivedEvents, stops) → queue
       └─ Drain loop: state.popNextFrame → interpretor.processQueueFrame → state.insertQueueFrames
  7. Re-register queue events: createSkillEvent(ev, { emitQueueFrames: false })
  8. state.getProcessedEvents()                    → final output (reactions merged)
  9. StaggerController.sync → frailty events → re-run if any
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
| `SkillPointController` | `skillPointController.ts` | Persistent (React) | SP resource timeline. Receives SP costs/recoveries incrementally during the queue via `addCost`/`addRecovery`; `finalize` computes insufficiency zones after the queue drains. |
| `StaggerController` | `staggerController.ts` | Persistent (React) | Stagger resource timeline. `sync` post-processes after pipeline. Generates frailty events (node/full stagger) with `STAGGER_FRAILTY` stat clauses. Frailty events are fed back into a second pipeline pass so `BECOME STAGGERED` triggers fire. |
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

### Single Ingress: `createSkillEvent`

All skill / input / talent / enemy action events enter DEC via `createSkillEvent`. It runs three passes per event:

- **Pass 1 — discovery:** `chainComboPredecessor` (truncates prior combo CD on the same owner), `buildReactionSegments` (materializes corrosion/combustion segments from raw duration), `clampPriorControlEvents` (shortens earlier CONTROL events to end at `ev.startFrame`), `_maybeRegisterStop` (time-stop registration; also retroactively re-extends overlapping prior events and reactively shifts queued frames), `_pushToStorage` (deep-clones segments/frames into DEC-owned copies, captures per-segment raw durations in `rawSegmentDurations`, appends to `allEvents`).
- **Pass 2 — positioning:** `extendSingleEvent` (idempotent — reads raw from `rawSegmentDurations`, writes extended to `seg.properties.duration` in place), `computeFramePositions` (sets `absoluteFrame` / `derivedOffsetFrame` on frame markers), `validateTimeStopStart`, `registerSpRecoveryEvent` (structural SP recovery event metadata only — all other resource notifications fire from EVENT_START in the interpreter).
- **Pass 3 — reactive combo resolution:** `resolveComboTriggersInline` wipes all COMBO_WINDOW events, clears combo events' `comboTriggerColumnId`/`triggerEventUid`, and re-emits windows via `openComboWindow` for the current trigger-match set. Runs every createSkillEvent call; kept correct by reactive merge-on-insert in `openComboWindow`.
- **Pass 4 — queue frame emission:** `flattenEventsToQueueFrames([ev], this.stops)` emits queue entries. Skipped via `opts.emitQueueFrames: false` for the post-drain re-registration of queue events.
  - **Skill events** (`BASIC_ATTACK`, `BATTLE`, `COMBO`, `ULTIMATE`): emit full lifecycle — `EVENT_START`, per-segment `SEGMENT_START` / per-frame `ON_FRAME` / `SEGMENT_END`, `EVENT_END`, and (for combos without a resolved trigger column) `COMBO_RESOLVE`.
  - **Non-skill wrappers** (freeform inflictions / reactions / physical statuses / statuses): emit **only** the `PROCESS_FRAME` queue entries that carry the wrapper's APPLY clause. The wrapper has no lifecycle of its own — the applied event created by `doApply → applyEvent` owns lifecycle via `runStatusCreationLifecycle`. Emitting skill-style `EVENT_START` / `SEGMENT_*` / `EVENT_END` for the wrapper would duplicate the applied event's hooks.

### Queue-created events: `addEvent` / `pushEvent`

Created by `EventInterpretorController` during the queue drain (reactions, inflictions, statuses from `APPLY` clauses). Appended to the single `allEvents` list (via `createQueueEvent`) alongside input skill events and indexed into `stacks` for active-frame queries. Duration extended inline via `extendDuration` using current stops; tracked in the single-total `rawDurations` map. `reExtendQueueEvents` re-applies extension when a new stop lands mid-drain. These events are **excluded from `rawSegmentDurations`** so the per-segment extension path no-ops on them.

**Single source of truth.** There is no separate "input" vs. "output" array. `DEC.allEvents` holds every event in the pipeline — skill inputs seeded at the start, talent/control seeds registered before the drain, and queue-derived events pushed during the drain. `EventInterpretorController` does **not** hold a parallel snapshot; its `getAllEvents()` delegates to `controller.getAllEvents()`. Any condition evaluation (`BECOME STACKS`, `HAVE STATUS`, cooldown scans, etc.) must read through that single list — wrapping it in a second merged array risks double-counting every event.

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
| `getAllEvents()` | Returns `this.allEvents` by reference — the single source of truth for every event in the pipeline (input skills, seeded talents, and queue-derived statuses/inflictions/reactions). `EventInterpretorController.getAllEvents()` is a thin delegate to this. |
| `getProcessedEvents()` | `allEvents` with reactions merged + reaction frames attached. Final view output. |
| `getStops()` | Discovered time-stop regions. |
| `activeCount(col, owner, frame)` | Count active events at frame (queries both `stacks` and `allEvents`). |
| `getActiveEvents(col, owner, frame)` | Get active events at frame. |

---

## Event Lifecycle

```
processCombatSimulation(rawEvents, loadoutContext)
    │
    ├─ 1. parser/cloneAndSplitEvents → { inputEvents, derivedEvents }
    │
    ├─ 2. control seed + inputEvents + enemy action events
    │      → loop state.createSkillEvent(ev, { checkCooldown: false })
    │         per event: pass 1 (discover/chain/clamp/stop/clone-push)
    │                    pass 2 (extend/positions/validate/notify)
    │                    pass 3 (resolveComboTriggersInline)
    │                    pass 4 (emit own queue frames into DEC queue)
    │
    ├─ 3. runEventQueue(state, derivedEvents)
    │      ├─ build TriggerIndex
    │      ├─ talent seeding via createSkillEvent loop
    │      ├─ interpret passive talent APPLY STAT clauses inline
    │      ├─ bulk flattenEvents(derivedEvents) → queue
    │      │    (registered events' queue frames already emitted in step 2)
    │      ├─ drain loop: popNextFrame → processQueueFrame → insertQueueFrames
    │      │    Queue-created events (statuses/inflictions/reactions) via addEvent/pushEvent
    │      └─ re-register queue events via createSkillEvent(..., { emitQueueFrames: false })
    │
    └─ 4. state.getProcessedEvents()
           └─ mergeReactions + attachReactionFrames → returned to view
    │
    ▼
Post-pipeline (app layer):
    SkillPointController.sync → SP resource timeline
    StaggerController.sync → stagger timeline + frailty events
      If frailty exists → re-run pipeline
    EventsQueryService(controller) → damage queries
```

---

## DSL Grammar Invariants

**`INFLICTION` / `REACTION` are `objectId` values only.** They are never valid as `object` or `subject`. The canonical shape for an infliction effect is
`{object: STATUS, objectId: INFLICTION, objectQualifier: <ELEMENT|VULNERABLE>}`;
for a reaction it's `{object: STATUS, objectId: REACTION, objectQualifier: <COMBUSTION|SOLIDIFICATION|…>}`.
`validationUtils.ts::warnInvalidInflictionReactionPosition` (shared by
`validateEffect` and `validateInteraction`) rejects the legacy `{object: INFLICTION}` form. A data-invariant unit test (`tests/unit/dataGrammarInvariants.test.ts`) sweeps every JSON under `src/model/game-data/` to keep the migration from drifting.

**Clauses live inside `segments[i].clause` — no root-level `clause`.** Operator / weapon / gear status defs have zero top-level `clause`. The loader validators (`operatorStatusesStore.validateOperatorStatus`, etc.) reject any such JSON. `resolveClauseEffects` reads `segments[0].clause` only.

**Per-bucket clause evaluation mode.** Instead of a single root-level `clauseType`, each clause bucket has its own evaluation-mode field:

| Bucket | Field | Default |
|--------|-------|---------|
| `onTriggerClause` | `onTriggerClauseType` | `ALL` (every matching clause fires) |
| `onEntryClause`   | `onEntryClauseType`   | `ALL` |
| `onExitClause`    | `onExitClauseType`    | `ALL` |

Set the field to `"FIRST_MATCH"` when clauses are a base + refinement pattern (e.g. Endministrator's Essence Disintegration: base `CONSUME CRYSTAL` clause + `P>=2` gated refinement clause that also fires a team-buff). Without `FIRST_MATCH`, both clauses fire and the RESET stack limit clamps the earlier application to zero duration. Segment-level `clauseType` still exists for `segments[i].clauseType`; the per-bucket fields are additional at the def root.

**Status event `sourceSkillId` holds IDs, not display names.** The field was renamed from `sourceSkillName` across the engine and persisted event shape. The status-source label surfaced in `params.sub.statSources` (and downstream in `buildMultiplierEntries`) resolves the display name at the `pushStatSource` call via `getStatusDef(parentStatusId).properties.name` — the ID never leaks into the breakdown.

---

## Status Clause Effects — Per-Status, Not Per-Stack

Status `clause` effects describe the **status's total contribution**, not a per-stack delta. `MULT(0.03, STACKS)` means the status contributes `0.03 × currentStackCount` in total — evaluated once against the current stack count, not accumulated per event instance.

**Dispatch path:** All clause effects (unconditional and HAVE-gated) are registered in the TriggerIndex's `lifecycleIndex`. When a status is applied or stacked, `checkReactiveTriggers` queues an `ENGINE_TRIGGER` which `handleLifecycleTrigger` processes. There is no inline clause dispatch in `runStatusCreationLifecycle`.

**Replace-semantics:** Each lifecycle fire reverses the previous total contribution and applies the new total. This means the status always has exactly one net contribution in the stat accumulator, regardless of how many stacks or lifecycle fires occurred.

**One evaluation per entity:** For NONE-stacking statuses with multiple independent events on the same slot, the lifecycle evaluates once per `ownerEntityId` (not per event instance). The clause describes the status's aggregate effect — individual events are implementation details of the stacking model.

**Multi-target statuses:** For ALL/ALL\_OTHER operator-targeted statuses (e.g. SF Minor on each teammate), the lifecycle finds one representative instance per entity and processes each independently.

---

## Queue Ordering and Inline Dispatch

The queue is a stable min-heap ordered by `frame`. Equal-frame entries pop in insertion order (FIFO). There is no priority system — ordering within a frame is determined by the user's event creation order, which naturally preserves causal dependencies (the combo is placed after the BS that triggers it).

**Inline dispatch:** When `processQueueFrame` returns same-frame entries (reactive triggers from `checkReactiveTriggers`), they are processed inline as part of the same causal chain — not re-inserted into the queue. This ensures effects and their triggered consequences resolve in FIFO order within a single frame. Only future-frame entries (EVENT_END, deferred segment frames, onExitClause) return to the queue.

**Queue entry types:**

| Type | Description |
|------|-------------|
| `PROCESS_FRAME` | Frame marker processing — DSL clause interpretation, freeform event creation, reactive trigger evaluation. |
| `PROCESS_FRAME` + `ON_TRIGGER` | Engine trigger — evaluates HAVE/IS conditions, dispatches trigger effects. Produced as reactive trigger results and processed inline (same frame). |
| `COMBO_RESOLVE` | Deferred combo trigger resolution. Pre-queued by `flattenEvents` at `combo.startFrame`. Fires in insertion order after BS frame markers because the combo event is registered after the BS events. |
| `STATUS_EXIT` | Status exit clause effects. Fires at the status's end frame. |

---

## Stat-Based State Triggers

Some state conditions are tracked via the stat accumulator rather than column-based events.
These use a counter pattern: the stat is incremented when a source is applied, decremented when it expires.
Triggers fire on the 0→positive transition (BECOME) and positive→0 transition (BECOME NOT).

| Adjective | StatType | Trigger Verb | Example |
|-----------|----------|-------------|---------|
| `SLOWED` | `SLOW` | `BECOME` / `BECOME_NOT` | Fluorite T1 — DMG bonus vs slowed |
| `STAGGERED` | `STAGGER_FRAILTY` | `BECOME` / `BECOME_NOT` | Perlica T1 — DMG bonus during stagger |

**Firing rules:**
- `BECOME <adj>`: fired from the `APPLY STAT` handler when `statBefore <= 0` (transition from inactive to active)
- `BECOME_NOT <adj>`: fired from EVENT_END and CONSUME handlers when the status def has a clause that applies the tracked stat

**Implementation:** Both mappings are defined in `STAT_TO_STATE_ADJECTIVE` (eventInterpretorController.ts) and `ADJECTIVE_TO_STAT` (conditionEvaluator.ts). Adding a new stat-based state requires entries in both maps.

**Condition evaluation:** Both `IS <adj>` and `BECOME <adj>` check the stat accumulator for existence (stat > 0). The difference is semantic — `IS` checks current state, `BECOME` checks state for transition triggers. Both use the shared `ADJECTIVE_TO_STAT` map.

**Freeform status wrapper → applied event (unified path):** Every freeform-placeable non-skill column ships an APPLY clause in its `defaultEvent.segments[0].frames[0].clauses[0]`, produced by `buildStatusMicroColumn`. When the user places such an event, the wrapper enters `state.events` with the APPLY-clause frame attached (via `attachDefaultSegments`). At pipeline runtime, `flattenEventsToQueueFrames` emits one `PROCESS_FRAME` per clause frame (no `EVENT_START` / `SEGMENT_*` / `EVENT_END`). The frame dispatches via `interpret → doApply`, which calls `applyEvent` to create the applied (visible) event with `options.uid = wrapper.uid`. `runStatusCreationLifecycle` then owns the applied event's lifecycle — schedules `EVENT_END`, dispatches `onEntryClause` / `onExitClause`, emits offset>0 segment frames via `pendingExitFrames`.

Skill-triggered applications (e.g. a battle skill's APPLY clause) reach the same `doApply → applyEvent → runStatusCreationLifecycle` path via the skill event's own PROCESS_FRAME dispatch. One codepath from the APPLY-clause frame inward.

**Wrapper duration injection:** Freeform wrappers propagate their remaining segment duration to the applied child via `injectWrapperDuration` in `handleProcessFrame`. The helper rewrites the clause's APPLY effect to include `with.duration = parentSegEnd - absFrame`, so the applied event inherits the wrapper's (possibly user-resized) span without a special `inheritDuration` flag on the effect itself. Non-freeform (skill-originated) APPLY clauses don't go through the injector — they use their configured duration.

**Runtime-user-edited fields (`susceptibility`):** Qualified-susceptibility and FOCUS wrappers carry a per-element `susceptibility` record the user edits via info pane `jsonOverrides`. At dispatch, `handleProcessFrame` sets `ctx.sourceEvent = wrapper`. `doApply`'s generic qualified-status path copies `ctx.sourceEvent.susceptibility` onto the applied event's `eventProps.susceptibility` when the applied columnId matches the wrapper's. That's the single exception threaded through `InterpretContext` — everything else is carried by the static DSL clause.

**Physical-status freeform placement:** Physical statuses (LIFT / KNOCK_DOWN / CRUSH / BREACH) default to `isForced: { verb: IS, value: 1 }` in their APPLY clause, which `applyPhysicalStatus` reads to bypass the Vulnerable-stack gate. The user can edit the clause to unset isForced via override if they want gated behavior.

**Stagger frailty two-pass pipeline:** Stagger frailty events are generated post-pipeline by `StaggerController.sync()`.
If frailty events exist, the pipeline re-runs with them included so `BECOME STAGGERED` triggers fire.
The stagger status defs (`status-stagger-node.json`, `status-stagger-full.json`) contain `APPLY STAT STAGGER_FRAILTY` clauses.

---

## APPLY STAT — value vs multiplier

`APPLY STAT` supports two `with` keys with distinct semantics:

| Key | Operation | Engine method | Example |
|-----|-----------|---------------|---------|
| `value` | **Additive** — summed into the stat bucket | `statAccumulator.applyStatDelta()` | `APPLY STAT STRENGTH with value IS 20` → STR += 20 |
| `multiplier` | **Multiplicative** — scales the current aggregate | `statAccumulator.applyStatMultiplier()` | `APPLY STAT SUSCEPTIBILITY CRYO with multiplier VARY_BY TALENT_LEVEL [1.2, 1.5]` → susceptibility ×= 1.2 |

Most stat effects use `value`. Only effects that scale existing accumulated values use `multiplier` (currently only Last Rite T2 Cryogenic Embrittlement on ultimate frames).

**IGNORE ULTIMATE_ENERGY:** Status clauses with `IGNORE ULTIMATE_ENERGY` are detected by `interpret()` in the interpreter during `runStatusCreationLifecycle`. When found on a talent/status event, the UE controller marks that slot as `ignoreExternalGain` via `DEC.setIgnoreExternalGain()` — the operator only receives UE from their own skills (e.g. Last Rite's VIGIL_SERVICES_ULTIMATE_ENERGY_LOCKOUT status).

---

## Time-Stop Handling

Time-stop handling is **retroactive and reactive** — events arrive through `createSkillEvent` one at a time, which means a new stop can land on earlier events' queue frames and segment extensions after they've already been processed. Two mechanisms keep state consistent:

### Idempotent per-segment extension
- `_pushToStorage` captures each segment's **raw** duration in `rawSegmentDurations` when the event is first ingressed.
- `extendSingleEvent` is idempotent: it reads raw from `rawSegmentDurations`, walks foreign stops, and **writes extended durations in place** on the event's cloned segments. Safe to call any number of times.
- The `extendedIds` double-extension guard is **deleted** — no longer needed by construction.

### Retroactive re-extension on stop discovery
- When `_maybeRegisterStop` registers a new stop `[S, E]`, it walks `allEvents` for entries tracked in `rawSegmentDurations` whose active range overlaps `[S, E]`, and re-runs `extendSingleEvent` + `computeFramePositions` on each. Mutates in place; no object identity change.

### Reactive queue-entry shift
- `_maybeRegisterStop` also calls `_shiftQueueForNewStop(S, E, ownStopEventUid)`, which walks the DEC-owned priority queue and shifts every entry whose `frame > S` (excluding the stop event's own entries) by `E - S` frames. Re-heapifies. Keeps already-inserted queue frames aligned with the new extended timeline.

### Combo chaining
- When a combo's time-stop overlaps an existing combo on the same owner, `chainComboPredecessor` truncates the earlier combo's CD segment at the newer's `startFrame`. Per-event during pass 1.

### Queue-created events (addEvent / pushEvent)
- Queue events (reactions/inflictions/statuses) bypass `rawSegmentDurations`. Their duration is extended inline at creation time via `extendDuration` + the single-total `rawDurations` map. `reExtendQueueEvents` handles mid-drain stop registration for them.

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
| `getWeaknessEffects(frame)` | Active weakness fractions |
| `getDmgReductionEffects(frame)` | Active damage reduction fractions |
| `getProtectionEffects(frame)` | Active protection fractions |
| `is*Active(frame)` | Boolean status checks (stagger, cryo, solidification, link, amp) |
| `get*Sources(frame, element)` | Itemized multiplier sources for damage breakdown |

---

## Runtime Conditional Segment Durations

Segments can have durations that depend on runtime event state via `STACKS of <STATUS> of EVENT` in a ValueExpression. This enables conditional segments like Lifeng's Vajra Impact (only appears when LINK is consumed).

### DSL Pattern

```json
"duration": {
  "value": {
    "operation": "MULT",
    "left": { "verb": "IS", "object": "STACKS", "of": { "object": "EVENT", "objectId": "LINK" } },
    "right": { "verb": "IS", "value": 2.03 }
  },
  "unit": "SECOND"
}
```

`STACKS of LINK of EVENT` resolves to the consumed LINK stack count on the current event (0 if no LINK consumed → segment duration = 0).

### Resolution Flow

1. **Event creation** (column builder): `resolveValueNode` has no `getEventStacks` callback → `STACKS of EVENT` returns 0 → duration = 0.
2. **Segment preservation**: `dataDrivenEventFrames.ts` detects `hasRuntimeConditionalDuration()` and preserves the segment + its frames despite 0 duration.
3. **Frame preservation**: `BasicAttackController.buildSegments` skips the `inBound` frame filter for runtime-conditional segments.
4. **Runtime re-resolution**: At `EVENT_START` in the interpretor, after `consumeLink()`, segment durations with `operation` ValueNodes are re-resolved with `getEventStacks` wired to `getLinkStacks(eventUid)`.
5. **View gating**: `EventRenderer.ts` (canvas) and `EventBlock.tsx` (React) skip frame rendering for segments with `duration === 0`.

### Value Resolution Context

`ValueResolutionContext.getEventStacks(statusId)` — returns consumed stack count for a status on the current event. Only available during EVENT_START re-resolution. `isValueStatus` routes to `getEventStacks` when `of.object === "EVENT"`.

---

## CONTROLLED Determiner in Combo Activation

Combo trigger conditions with `subjectDeterminer: "CONTROLLED"` require the performing operator to be the controlled operator at the trigger frame.

### Implementation

`triggerMatch.ts` → `resolveOwnerFilter` accepts `controlledSlotId` as either a static string or a `(frame: number) => string` function. For CONTROLLED determiners, `matchesOwner(ownerEntityId, atFrame)` resolves the controlled slot at the candidate frame and checks ownership.

`getControlledSlotAtFrame` is threaded from `eventQueueController.ts` → `DEC.setControlledSlotResolver` → `resolveComboTriggersInline` → `findClauseTriggerMatches` → `VerbHandlerContext.controlledSlotId`.

## Causality DAG (CausalityGraph)

Side-car bidirectional DAG on DEC tracking all causal relationships between events. Two edge kinds:

- **`EdgeKind.CREATION`** — "A caused B to exist." Reactions link their source inflictions as parents; Shatter links trigger + solidification (multi-parent A+B→C). `rootOf(uid)` walks CREATION edges to the chain root. `primaryParentOf(uid)` returns the first CREATION parent.
- **`EdgeKind.TRANSITION`** — "A modified B's lifecycle." When a column consumes/refreshes/clamps an event, the consuming event is linked as a TRANSITION parent. `lastTransitionSource(uid)` returns the most recent TRANSITION parent. Used by EventPane to display "consumed by X's skill."

### API

- `link(child, parents, kind)` — add typed edges (both parent→child and child→parent for bidirectionality)
- `parentsOf(uid, kind?)` / `childrenOf(uid, kind?)` — optional kind filter
- `primaryParentOf(uid)` — first CREATION parent
- `rootOf(uid)` — walks CREATION edges to chain root (cycle-guarded)
- `ancestorsOf(uid)` — BFS upward across all edge kinds
- `descendantsOf(uid)` — BFS downward across all edge kinds
- `lastTransitionSource(uid)` — most recent TRANSITION parent

### Invariants

- The engine is **slot-free**. All identity fields use entity ids (operator id, `ENEMY_ID`, `TEAM_ID`). Slot ↔ entity mapping happens only at the loadout boundary via `loadoutController`/`slotOperatorMap`.
- **`ownerEntityId`** = who has the event on their timeline. **`sourceEntityId`** = who created/triggered it. These are distinct — enemy-owned inflictions have `ownerEntityId = ENEMY_ID` but `sourceEntityId = <operator-id>`.
- Every event entering DEC via `_ingest` must have `ownerEntityId` populated by the caller. There is no backfill safety net.

## Chain-of-Action Refs (Phase 8 step 7.5)

`TriggerMatch.sourceEventUid` and `TimelineEvent.triggerEventUid` carry the uid of the source event that caused a trigger to fire. Set by `makeMatch` in `triggerMatch.ts` from `ev.uid`; propagated through `openComboWindow` → `_applyComboWindowToCombos` onto combo events.

The `duplicateTriggerSource` handler (interpretor §3b) uses this uid to look up the live source event via `getAllEvents()` and read `columnId`/`id` directly, instead of consulting the denormalized `comboTriggerColumnId` string. A transitional fallback to `comboTriggerColumnId` is retained for the cases where uid propagation hasn't been wired through yet (some manually-flagged battle-skill frames in tests).

---

## isForced ValueNode Convention

`with.isForced` in effect configs MUST be a ValueNode (`{"verb":"IS","value":1}`), not a raw boolean. The store validator (`validationUtils.ts` → `warnRawBooleanIsForced`) rejects raw booleans at load time. `resolveWith()` resolves the ValueNode to 1 (forced) or 0 (not forced).
