# Phase 8 — Progress Notes (session: 2026-04-08)

Reference: [`docs/notes/phase-8-plan.md`](./phase-8-plan.md)

## Status: Phase 8 RESOLVED (step 8 pinned, only 7g blocked)

Every step gated on full jest suite + tsc + eslint on touched files.
Baseline held green at every commit. Current baseline:
**163 suites / 2113 tests** (+1 suite / +7 invariant tests after step 8).

| Step | Commit | Description | Status |
| --- | --- | --- | --- |
| 1 | `c4d1a29e` | Decompose `DEC.registerEvents` into named pure helpers | ✅ |
| 2 | `20e24b70` | Extract createSkillEvent helpers into free functions (+10 unit tests) | ✅ |
| 3 | `31b93637` | Add `DEC.createSkillEvent` single-event entrypoint | ✅ |
| 4 | `0aaca74e` | Move priority queue ownership into DEC | ✅ |
| 5 | `4b2e60ca` | Reactive time-stop re-positioning (shift only; raw seeding deferred to 7h) | ⚠️ minimal |
| 6a | `6c778deb` | `DEC.openComboWindow` reactive entrypoint, pass 3 routes through it | ✅ |
| 6b | `7399b9d0` | Delete post-queue batch `deriveComboActivationWindows` call | ✅ |
| 6c | `9152d736` | Delete post-queue re-derive + thread controlled-slot resolver | ✅ |
| 6d | `dbd6f1be` | Fold `clampMultiSkill` + `clampComboWindowsToEventEnd` into pass 3 tail | ✅ |
| 6e | `b74d2648` | Delete dead `deriveComboActivationWindows` + `replaceComboWindows` | ✅ |
| 6f | `f58725a9` | Delete orphan `resolveComboTriggerColumns` + 19 tests (→ 162 / 2106) | ✅ |
| 7a | `eddf579c` | Scaffold `parser/` module, move `collectFrameEntries` → `flattenEvents.ts` | ✅ |
| 7b | `ac681dbc` | Move `cloneAndSplitEvents` + segment clone cache → `parser/cloneAndSplit.ts` | ✅ |
| 7c | `5054e816` | Talent selection → `parser/selectNewTalents.ts` | ✅ |
| 7d | `c1efaca8` | Controlled-operator seed factory → `parser/buildControlSeed.ts` | ✅ |
| 7e-prep+7e | `4db445f9` | Per-segment raw store, idempotent `extendSingleEvent`, retroactive re-extension, per-event ingress via `createSkillEvent` | ✅ |
| 7f | `ffea8f0e` | Delete `registerEvents`, `seedControlledOperator`, `extendedIds`, `markExtended` | ✅ |
| 7g | — | Delete post-queue UID / `creationInteractionMode` restoration loops | ⏸️ blocked on cloneAndSplit rewrite (attempt 2026-04-08 confirmed) |
| 7.5 | `4c0517a3` | `duplicateTriggerSource` chain-of-action uid ref | ✅ |
| 7h | `e78ffbba` | Per-event queue frame emission from `createSkillEvent` | ✅ (fold deferred) |
| 8 | `bc95f125` | Invariant pin test + engineSpec rewrite | ✅ |

## Session 2026-04-08 (continuation) — 7c through 7f

Landed in one session following the original 7c–7h roadmap. Key
architectural shift: `createSkillEvent` is now the **sole event ingress
path** into `DerivedEventController`. Control seed, user-placed input
events, enemy actions, talent events, and queue-event re-registration
all route through it one event at a time. The batch `registerEvents`
method is deleted entirely.

### 7c — Talent selection (5054e816)
Pure plumbing. `runEventQueue`'s inline talent dedupe filter moved into
`parser/selectNewTalents.ts` as a pure selector. Caller still invokes
`createSkillEvent` per returned talent (after 7f). No behavior change.

### 7d — Controlled-operator seed factory (c1efaca8)
Extract the synthetic CONTROL event construction from
`DEC.seedControlledOperator` into `parser/buildControlSeed.ts`. DEC
method became a thin wrapper; then deleted entirely in 7f. The
caller in `processCombatSimulation` now builds the seed via
`buildControlSeed` and calls `createSkillEvent`.

### 7e-prep + 7e — Per-segment raw store, per-event ingress (4db445f9)

This is the load-bearing commit of the session. 7e as originally
attempted (route user-placed events through `createSkillEvent` per
event) broke 10 time-stop integration tests because pass 2's
`extendSingleEvent` walked `this.stops` accumulated so far — with
per-event ingress, event A's segments were extended before event B
contributed its stop, and there was no mechanism to retroactively
re-extend A. `rawDurations` stores only per-event totals, not
per-segment, so a new store was required.

**New field:** `private rawSegmentDurations = new Map<string, number[]>()`.

**`_pushToStorage` rewrite:** deep-clones segments (and frame markers)
into DEC-owned copies, then captures the raw per-segment durations into
`rawSegmentDurations`. Queue events (already tracked by `rawDurations`
from `pushEvent` mid-drain) are **excluded** from the new store, so
`extendSingleEvent` no-ops on them — preserves pre-existing
`pushEvent` extension + consumption-truncation semantics. Returns the
owned event so callers reference the cloned copy, not the raw input.

**`extendSingleEvent` rewrite:** reads raw durations from
`rawSegmentDurations` and mutates `seg.properties.duration` in place.
**Idempotent** — always starts from raw, so re-running on the same
event with a changed stops list correctly produces extended-from-raw.
Returns `ev` (self) instead of cloning a new event.

**`extendedIds` deleted:** the guard that prevented double-extension
is no longer needed. Pass 2 simply calls `extendSingleEvent` every
time.

**Retroactive re-extension in `_maybeRegisterStop`:** when a new stop
`[S, E]` is registered, walk `registeredEvents` that are tracked in
`rawSegmentDurations` and overlap `[S, E]`; re-run `extendSingleEvent`
and `computeFramePositions` on each. Idempotent extension makes this
safe to run any number of times.

**isCrit write-back loop:** previously, non-time-stop events shared
frame references with raw state (they were only cloned when extension
was needed). MANUAL-mode `isCrit` writes during interpretation leaked
back to raw state via those shared references, which is how isCrit
persisted across pipeline re-runs. Clone-on-`_pushToStorage` breaks
that path — raw state no longer receives the writes. A new
`processCombatSimulation`-trailing loop syncs `isCrit` from the
processed (cloned) events back to their raw-state siblings by
matching on uid + segment index + frame index. The
`critModeToggle.test.ts` "isCrit is NOT modified by NEVER/ALWAYS/
EXPECTED modes (persistent data)" test is the canary for this.

**Crit pin loop fix:** the post-drain crit pin loop at
`runEventQueue` used to iterate `state.output` and write isCrit on
pre-clone references. After `registerEvents(queueEvents)` now routes
through `_pushToStorage`, the writes need to land on the cloned
copies in `registeredEvents`. Loop now builds a uid → cloned-event
map and writes through it.

**Per-event ingress:** `createSkillEvent` gained
`opts.checkCooldown` (defaulting to true; user-placed ingress passes
`false` to preserve the "allowed to overlap with warning" semantics
for freely-placed events). `processCombatSimulation` now loops
`createSkillEvent` for the control seed, input events, and enemy
action events.

### 7f — Delete dead ingress paths (ffea8f0e)

With per-event ingress in place and `extendSingleEvent` idempotent,
the batch `registerEvents` method became pure overhead. Inlined its
three passes into `createSkillEvent` and deleted the public method.

- **`createSkillEvent` body** now contains: uid dedup check → pass 1
  (chain combo predecessor, build reaction segments, clamp prior
  control events, `_maybeRegisterStop`, `_pushToStorage`) → pass 2
  (`extendSingleEvent`, `computeFramePositions`,
  `validateTimeStopStart`, `notifyResourceControllers`) → pass 3
  (`resolveComboTriggersInline` if slot wirings exist). All three
  run per event.
- **`seedControlledOperator` deleted.** Parser `buildControlSeed` +
  `createSkillEvent` at the call site handles it.
- **`extendedIds`, `markExtended`, the `markExtended(queueEvents)`
  call at `runEventQueue:139`, and the `extendedIds.add(newWindow.uid)`
  call in `_applyComboWindow` all deleted.** Combo window events
  bypass `_pushToStorage` (pushed directly into `registeredEvents`),
  so they were never entered into `rawSegmentDurations` and
  `extendSingleEvent` no-ops on them by construction.
- **Talent seeding** changed from `state.registerEvents(newTalents)`
  to a `createSkillEvent` loop.
- **Queue-event re-registration** (`state.registerEvents(queueEvents)`
  at the end of `runEventQueue`) changed to a `createSkillEvent` loop.
- **Two unit tests** (`staggerFrailty.test.ts`,
  `corrosionSegments.test.ts`) updated to call `createSkillEvent`
  directly instead of `registerEvents`.

### Pass 3 cadence (design decision)

When discussing step 7 with the user, the question came up: with
per-event ingress, what's the trigger point for pass 3
(`resolveComboTriggersInline`)? Three options considered:
  (a) once at end of ingress drain via a `POST_INGRESS` priority,
  (b) per-`createSkillEvent`,
  (c) on demand.

User pointed out that frames already drain chronologically by
`frame → priority`, so each `createSkillEvent` can emit its own
combo windows reactively at its own frame via `openComboWindow`
(which already merges on insert). **No priority tier needed. Pass 3
runs per-`createSkillEvent`.** Implemented in 7f.

Cost: N² window re-emission (each `createSkillEvent` wipes all
COMBO_WINDOW events and re-emits from the full registered list).
Acceptable because N is small (hundreds at worst) and correctness
trumps micro-performance here. If it becomes a hotspot, the
optimization is to make combo window emission incremental (open
windows reactively on trigger match rather than re-scan-all on
every ingress).

## Session 2026-04-08 (continuation, part 2) — 7.5, 7h, step 8

### 7.5 — duplicateTriggerSource uid ref (4c0517a3)

Previously the handler read `event.comboTriggerColumnId` — a denormalized
string set on combo events by `_applyComboWindowToCombos`. It mapped the
column id to an element/status and synthesized an APPLY INFLICTION /
APPLY STATUS effect.

Replaced with a direct event-to-event uid ref:
- `TriggerMatch.sourceEventUid` set in `makeMatch` from `ev.uid`
- `TimelineEvent.triggerEventUid` propagated through `openComboWindow` →
  `_applyComboWindowToCombos` onto the affected combo events
- `resolveComboTriggersInline` clears `triggerEventUid` alongside
  `comboTriggerColumnId` on rebuild
- The handler looks up the source event from `getAllEvents()` via the
  uid and reads `sourceEvent.columnId` live

The column-id fallback is retained for transition — some manually-
flagged battle-skill frames in tests set `duplicateTriggerSource: true`
on events that never pass through a combo window, so their
`triggerEventUid` is never populated. Temporarily forcing the uid path
only (no fallback) fails 8 tests across laevatainInteractions and
antalInteractions. The full removal is a follow-up once every
duplicateTriggerSource path sets a uid ref.

### 7h — Per-event queue frame emission (e78ffbba)

The real content of 7h: registered skill events now emit their own
PROCESS_FRAME / SEGMENT_START/END / EVENT_START/END / COMBO_RESOLVE
queue entries at the end of `createSkillEvent` pass 2, using the
current stops set.

Subsequent stops discovered by later createSkillEvent calls:
- retroactively re-extend earlier events' segment durations via
  `_maybeRegisterStop` → `extendSingleEvent` (step 7e-prep)
- reactively shift earlier events' already-inserted queue entries via
  `_maybeRegisterStop` → `_shiftQueueForNewStop` (step 5)

The bulk `flattenEvents` call in `runEventQueue` now only runs for
`derivedEvents` (freeform inflictions/reactions/statuses from
`cloneAndSplitEvents`), which never pass through `createSkillEvent` —
the interpretor creates their actual event via `applyEvent` when
their PROCESS_FRAME hook fires.

`createSkillEvent` gained `opts.emitQueueFrames` (default true).
Post-drain queue-event re-registration passes `false`: those events
have already been fully interpreted during the drain, so re-emitting
their frames would cause duplicate interpret work and potential
double-effects.

**What's deferred on 7h:** folding `extendSingleEvent` into
`computeFramePositions`. Cosmetic module-boundary shuffle (the former
is a DEC-private method reading `rawSegmentDurations`, the latter is a
free function under `createSkillEvent/`). No behavior payoff — the
`extendedIds` guard was the real win and it's already gone.

### Step 8 — Invariant pin + engineSpec rewrite (bc95f125)

New `src/tests/unit/pipelineInvariants.test.ts` walks all .ts/.tsx
files under src/ (excluding tests) and fails if any forbidden Phase 8
pattern reappears:

1. `registerEvents(` — DEC batch ingress
2. `seedControlledOperator` — pre-queue seeding
3. `extendedIds` / `markExtended` — double-extension guard
4. `cloneAndSplitEvents` as external API (allowed inside parser module)
5. `deriveComboActivationWindows` — batch combo derive
6. `resolveComboTriggerColumns` — orphan pure function
7. `_statusConfigCache` / `clearStatusDefCache` — legacy caches

Block + line comments are stripped before matching so stale JSDoc
references don't trigger false positives.

`engineSpec.md` rewritten:
- Pipeline box reflects single createSkillEvent ingress
- DerivedEventController section replaces "Two Paths" with the four
  passes of createSkillEvent (discover / position / combo / emit)
- Event Lifecycle diagram updated
- Time-Stop Handling rewritten around retroactive re-extension +
  reactive queue shift + idempotent extension
- CONTROLLED determiner resolver thread updated
- New "Chain-of-Action Refs" section documenting `triggerEventUid`

Also cleaned up stale JSDoc in `derivedEventController.ts`,
`parser/buildControlSeed.ts`, `parser/selectNewTalents.ts`, and
`configCache.ts` that referenced deleted methods.

## Deferred items

### 7g — Post-queue restoration loops — BLOCKED

The `creationInteractionMode` / UID restoration loop at
`processCombatSimulation:358–377` exists because `cloneAndSplitEvents`
classifies user-placed freeform events on derived columns as
"derived", and the engine recreates them mid-queue with a new uid,
losing `creationInteractionMode`. The loop matches by
`ownerId+columnId+startFrame` and restores both fields.

Deleting the loop requires rewriting the parser path so freeform
derived events retain their original uid end-to-end. That's a
dedicated cloneAndSplit refactor, not a Phase 8 cleanup task.

The new **isCrit write-back loop** added in 7e-prep is a similar
post-queue restoration — it exists because clone-on-`_pushToStorage`
breaks the raw-state mutation leak that previously made MANUAL pins
persist across runs. It's structurally correct today but carries
the same "real fix needs parser-level identity preservation" smell.

### 7h — Fold + raw queue seeding — DEFERRED

**Fold `extendSingleEvent` into `computeFramePositions`:** turns
out to be more intrusive than the plan implied. `computeFramePositions`
is a free function in `src/controller/timeline/createSkillEvent/`
while `extendSingleEvent` is a DEC-private method reading
`rawSegmentDurations`. A true fold requires either threading the raw
store through the free function's signature or relocating
`rawSegmentDurations` out of DEC. Both are cosmetic module-boundary
shuffles with no behavior payoff. The `extendedIds` guard was the
real Phase 8 win here, and it's already deleted.

**Raw queue seeding:** substantial architectural change. Currently
`flattenEventsToQueueFrames` runs post-ingress with the fully
populated `stops` list and emits queue frames at extended positions.
The plan wants raw seeding + reactive shift via
`_shiftQueueForNewStop`. For raw seeding to be correct, queue-frame
emission has to move from `flattenEvents` into `createSkillEvent`
itself, so that (a) event A's queue frames are emitted at raw
positions during its own `createSkillEvent` call, and (b) when
event B's stop lands later, the existing `_shiftQueueForNewStop`
path (already present from step 5) reactively shifts A's queued
frames. This is a standalone ~1 day refactor. Deferred.

## Things to remember for next session (step 7g/7h/8 resumption)

1. **`createSkillEvent` is the sole ingress path.** Don't add new
   callers of anything that bypasses it (no new direct
   `registeredEvents.push`, no new `addEvent`/`pushEvent`-path
   events outside the queue drain). The invariant test in step 8
   should codify this.

2. **`rawSegmentDurations` is populated only for skill events** (the
   ones that enter via `createSkillEvent`). Queue events created
   mid-drain via `pushEvent` use the older single-total `rawDurations`
   map. `extendSingleEvent` no-ops on events absent from
   `rawSegmentDurations`, which is intentional.

3. **`_pushToStorage` returns the cloned owned event.** Callers must
   use the returned reference, not the input `ev`. `createSkillEvent`
   now does this correctly; any future caller must follow suit.

4. **The isCrit write-back loop is load-bearing** for
   `critModeToggle.test.ts`. Touching `_pushToStorage`'s clone
   behavior or the frame-marker shape will likely require updating
   this loop in lockstep.

5. **Per-event pass 3 means N² window re-emission.** If a test
   suddenly gets slow after a combo-related change, this is the
   first place to look. The reactive `openComboWindow` path is
   already idempotent; the batch wipe+re-emit inside
   `resolveComboTriggersInline` is what wastes work.

6. **`validateAll()` post-pass still exists.** It's a per-group
   sibling-overlap annotation, read-only. Harmless but technically
   violates "no post-passes". Could be inlined per-event inside
   `createSkillEvent` if strictly needed for the step 8 invariant
   test.

## Step-by-step notes

### Step 1 — Decompose (c4d1a29e)

Straightforward mechanical extraction. `registerEvents` pass 1 became a
thin loop calling:
- `_chainComboPredecessor` (wraps prior `handleComboChaining` with guard)
- `_buildReactionSegments`
- `_clampPriorControlEvents`
- `_maybeRegisterStop` (renamed from `maybeRegisterStop`, 5 callsites)
- `_pushToStorage`

Pass 2 (extension → `computeFramePositions` → `validateTimeStopStart` →
`notifyResourceControllers`) and pass 3 (`resolveComboTriggersInline`)
preserved as-is.

No behavior change.

### Step 2 — Free functions (20e24b70)

New directory `src/controller/timeline/createSkillEvent/` with one file per
helper:
- `chainComboPredecessor.ts` (exports `ComboStopEntry` type)
- `buildReactionSegments.ts`
- `clampPriorControlEvents.ts`
- `computeFramePositions.ts`
- `segmentUtils.ts` (holds `setAnimationSegmentDuration` — moved out of the
  DEC file)
- `index.ts` re-exports

Each helper takes its dependencies (`stops`, `comboStops`, `registeredEvents`,
etc.) as explicit parameters — no `this` reference, no globals. This is the
prerequisite for step 7, where the parser runs these helpers outside the DEC
class context.

DEC still holds the state; it passes it into the helpers at call time:

```typescript
ev = chainComboPredecessor(ev, {
  comboStops: this.comboStops,
  registeredEvents: this.registeredEvents,
  stops: this.stops,
});
```

Added unit tests in `src/tests/unit/createSkillEvent/createSkillEventHelpers.test.ts`
covering the four helpers (10 tests, all passing).

**Deviation from plan:** Plan step 2 shows `registerEvents` as a per-event
single loop calling all helpers in sequence, including
`resolveComboTriggerColumn` per-event. That would be a behavior change — the
current `resolveComboTriggersInline` is a batch post-pass that depends on the
full registered-events list. Per-event resolution would see incomplete merged
windows. Kept the 3-pass structure; pass 3 still runs the batch resolver.
This can flatten in step 6.

### Step 3 — createSkillEvent bridge (31b93637)

Added `DEC.createSkillEvent(ev: TimelineEvent): TimelineEvent | null`.

Currently a thin wrapper around `registerEvents([ev])` that returns the
registered event or `null` on cooldown rejection. Batch time-stop discovery
semantics are preserved — stop reordering is still the old per-batch model.

Also added `_checkCooldown(ev)` helper: returns true if any existing event on
the same owner + column has a `COOLDOWN` segment active at `ev.startFrame`.
Will be exercised in step 7 when reactive combo-trigger events route through
`createSkillEvent`.

No current caller of `createSkillEvent` — it's a dormant public surface.

### Step 4 — Queue ownership (0aaca74e)

Moved the priority queue from a module-level singleton in
`eventQueueController.ts` (`_queue` + `getQueue()`) into a `DEC` field.

```typescript
class DerivedEventController {
  private queue = new PriorityQueue<QueueFrame>(
    (a, b) => a.frame !== b.frame ? a.frame - b.frame : a.priority - b.priority,
  );
  popNextFrame(): QueueFrame | undefined { ... }
  insertQueueFrames(entries: readonly QueueFrame[]) { ... }
  get queueSize(): number { ... }
}
```

`runEventQueue` now calls `state.popNextFrame()` / `state.insertQueueFrames(…)`
instead of touching the singleton. Module-level `_queue` and `getQueue()`
deleted. Queue is cleared in `DEC.reset()`.

This was prep for step 5's reactive shift — the shift needs access to the
queue from inside DEC, which requires DEC to own it.

### Step 5 — Reactive time-stop shift (4b2e60ca)

**⚠️ Deviated from plan — shipped the minimal form.**

**What the plan asked for:**
1. Reactive shift in `_maybeRegisterStop`.
2. Switch initial queue seeding to raw (unextended) frame positions.
3. Delete the `extendedIds` guard.
4. Fold `extendSingleEvent` into `computeFramePositions`.

**What I shipped:**
1. ✅ Reactive shift in `_maybeRegisterStop`.
2. ❌ Deferred to step 7.
3. ❌ Deferred to step 7.
4. ❌ Deferred to step 7.

**Reasoning:** items 2–4 are a semantic flip of how frame positions flow
through the system. They only *need* to be correct in step 7, when the parser
emits events one at a time. Today, `registerEvents` still runs as a batch
pre-pass before the drain begins, so:
- When the pre-pass discovers input-event stops, the queue is empty → the
  reactive shift loop is a literal no-op, and batch behavior is preserved.
- Queue-created events that are themselves time-stops (rare) now correctly
  shift queue entries that come after them — new, strictly additive
  behavior.

Absorbing the seeding flip + `extendedIds` removal now would mean doing it
without any caller exercising the new path — pure risk with no payoff until
step 7. Will fold them into step 7 where the parser pipeline is the test
bed.

**Implementation details:**

`PriorityQueue` gained two helpers for in-place mutation:
```typescript
toArray(): readonly T[]  // direct heap access
reheapify()              // bottom-up re-heapify after external mutations
```

The shift in `DEC._shiftQueueForNewStop`:
- Walks the heap array
- Skips entries with `frame <= startFrame`
- Skips entries belonging to the stop's own event (`sourceEvent.uid`)
- Shifts the rest by `durationFrames`
- Re-heapifies if anything moved

**Verification gap:** the plan asks for manual smoke tests of Akekuri
ultimate + Avywenna + Estella under step 5 to catch ordering regressions.
The user confirmed jest is the verification standard ("we use e2e test for
verification") and the full suite is green, but a real queue-created
time-stop scenario is probably only exercised by specific integration tests
— worth a closer look if anything regresses in steps 6–7.

## Pre-existing bug surfaced during smoke testing

**Freeform combustion shows as two blocks (0s + 10s).** Filed in
`docs/todo.md`. Summary:

- Placing a single freeform combustion at frame 0 via context menu produces
  **11 events** in `allProcessedEvents`: the user's freeform event + 10
  derived combustion events at frames 120, 240, ..., 1200 (one per DoT tick).
- All 10 derived events share the **same UID** `d-COMBUSTION-enemy-0`,
  because `derivedEventUid(COMBUSTION, enemy, ctx.frame)` is called with
  `ctx.frame === 0` for every tick. React's reconciler keeps one (the last,
  at frame 1200 = 10s), so visually you see the freeform at 0s plus one
  derived at 10s.
- Confirmed to reproduce on `da86dcaf^` (the commit before Phase 8 began),
  so **this is not a regression from my work**.

Two bugs stacked — per-tick event creation that shouldn't happen, *and* a
UID collision even if it did. Fix is outside Phase 8 scope; see `todo.md`.

### Step 6a — openComboWindow (6c778deb)

Introduced `DEC.openComboWindow(wiring, triggerFrame, sourceOwnerId,
sourceSkillName, sourceColumnId, originOwnerId, triggerStacks)` as the
single reactive entrypoint for combo window emission. It replicates the
batch `deriveComboActivationWindows` semantics exactly: self-trigger skip,
CD-block check against existing combo events on the slot, time-stop
extension (excluding the slot's own combo-originated stops), overlap
merge against the latest existing COMBO_WINDOW event on the slot,
combo-event-end boundary split on merge, and first-wins application of
`comboTriggerColumnId` / `triggerStacks` on any combo events that fall
within the window.

Rewrote `resolveComboTriggersInline` (pass 3 of `registerEvents`) to
clear stale state and invoke `openComboWindow` per trigger match. At 6a
time the post-queue re-derive still wiped everything, so tests stayed
byte-equivalent — pure infrastructure install.

### Step 6b — Delete post-queue batch derive (7399b9d0)

Removed the `deriveComboActivationWindows` call at `runEventQueue`
lines 326–335, plus the `state.registerEvents([...queueEvents,
...comboWindows])` batch registration. Pass 3 of
`registerEvents(queueEvents)` at line 335 now produces the same combo
windows reactively via `openComboWindow`, since it runs
`findClauseTriggerMatches` over the full (registered + queue) event list.

`clampMultiSkillComboCooldowns` still runs after the final
`registerEvents`. The post-queue re-derive at lines 492–505 is still
alive as a safety net for CD-reduction cases.

### Step 6c — Delete post-queue re-derive (9152d736)

Removed the post-queue re-derive block (`deriveComboActivationWindows` +
`replaceComboWindows` + re-clamp) from `processCombatSimulation`. To
make pass 3 safely fully-reconstructive, two changes were needed:

1. **`resolveComboTriggersInline` now clears all existing COMBO_WINDOW
   events at the start** (in addition to clearing combo events'
   `comboTriggerColumnId` / `triggerStacks`), then re-emits from scratch
   via `openComboWindow`. This makes every `registerEvents` call rebuild
   the window set, which is needed because the final pass has new
   information (queue-created events + controlled-slot resolver).
2. **Threaded `getControlledSlotAtFrame` into DEC** via
   `setControlledSlotResolver(resolver)`. `runEventQueue` wires it in
   before the final `registerEvents(queueEvents)` so pass 3's
   `findClauseTriggerMatches` correctly filters CONTROLLED OPERATOR
   combo triggers. Without this, Avywenna's controlled-operator combo
   trigger test regressed (non-controlled Akekuri BATK was incorrectly
   opening a Avywenna window).

**Surviving fixup:** `clampComboWindowsToEventEnd` still runs post-queue
in `processCombatSimulation`. This handles the case where a combo's CD
is reduced mid-queue (e.g. Wulfgard P5 resetting combo CD on ult) and
the already-emitted window needs to be clamped to the new combo end.
Removing this regressed `wulfgard/skills.test.ts` (`clampedDur` check).
Fully reactive integration is a 6d task — likely via a
`DEC.reduceCooldown` hook that shrinks overlapping COMBO_WINDOW events.

**Dead code left in place for a later cleanup step:**
- `deriveComboActivationWindows` (still imported by
  `comboTriggerResolution.test.ts` via `resolveComboTriggerColumns`,
  sibling function in the same file)
- `DEC.replaceComboWindows` (no callers now)
- `DEC.clampMultiSkillComboCooldowns` — still called in
  `runEventQueue`; may be re-implementable as a reactive hook later

### Things surfaced during 6c implementation

- **Test failures observed after the naive 6c (pre-fix):** 10 tests
  across `avywenna/comboControlledTrigger`, `chen-qianyu/freeformInflictionTalent`,
  `rossi/comboChain`, `lifeng/skills`, `wulfgard/skills`, `ardeliaInteractions`.
  Most dropped to 0 after threading the controlled resolver; the last
  two (wulfgard clampedDur, rossi D3 maxSkills) needed
  `clampComboWindowsToEventEnd` restored.
- **The naive `resolveComboTriggersInline` from 6a only cleared combo
  events' trigger column IDs, not COMBO_WINDOW events.** That was
  sufficient at 6a (because the post-queue re-derive wiped everything
  later) but incorrect once that wipe was removed — the second pass 3
  run would merge into stale windows from the first run. 6c fixed this
  by clearing COMBO_WINDOW events at the top of each pass 3.

## Remaining steps (for next session)

### Step 6d — Fold combo window clamps into pass 3 (dbd6f1be)

Moved `clampMultiSkillComboCooldowns` + `clampComboWindowsToEventEnd`
from their post-queue call sites into the tail of
`resolveComboTriggersInline`. Both now run after every `openComboWindow`
loop in pass 3, in the same order as the former post-queue sequence:
multi-skill CD truncation first, then window duration clamping.

The final `registerEvents(queueEvents)` in `runEventQueue` triggers a
full pass 3 rebuild (COMBO_WINDOW wipe + re-emit). Any mid-queue
`reduceCooldown` effects are naturally reflected because the re-emit
uses the reduced CD state, and the tail clamp truncates windows to
current combo ends. An earlier attempt in this session added a reactive
hook inside `reduceCooldown` / `resetCooldown` directly — that approach
was discarded because pass 3's wipe erases in-place clamping anyway.

### Step 6e — Delete dead combo window code (b74d2648)

Removed `deriveComboActivationWindows` (batch window derivation) and
`DEC.replaceComboWindows` (combo window wipe-and-replace helper). Both
had zero callers after 6d.

Retained `resolveComboTriggerColumns` in `processComboSkill.ts` — still
imported by `comboTriggerResolution.test.ts` (5 test cases exercise it
directly as a pure function). The production path does not use it, but
the tests still do. Deleting function + tests together is the only
clean removal and would drop the test count from 2125. Deferred.

## Step 6 — What remains

Step 6's substantive work is complete. The combo window pipeline is now
fully reactive via `DEC.openComboWindow`. Remaining residue is minor
and optional:

- **`REDUCE_COOLDOWN` priority slot.** The original plan asked for a
  new priority between `PROCESS_FRAME` (5) and `ENGINE_TRIGGER` (22)
  so Fluorite P5's CD reduction fires before its combo trigger
  evaluation at the same frame. No test currently requires it; the
  reduce effect already runs inline during PROCESS_FRAME handling and
  the final pass 3 sees the reduced state. Add only if a same-frame
  ordering regression surfaces.
- **Orphan `resolveComboTriggerColumns` + its unit tests.** The
  function is no longer on any production code path but its test file
  still imports it. Deleting both removes ~5 test cases. Hold until
  test count invariants are relaxed or the tests are rewritten against
  `DEC.openComboWindow`.
- **`handleComboResolve` / `resolveComboTrigger` deferred path** in the
  interpretor is still alive. It still has a real purpose: ensuring a
  combo event's `comboTriggerColumnId` is set mid-queue before
  PROCESS_FRAME handlers read it (line 2087 in
  eventInterpretorController for `duplicateTriggerSource`-based
  mirrored inflictions). Routing this through `openComboWindow` would
  change the source-column resolution (base `windowFrames` vs.
  time-stop-extended). Left as-is.

### Step 7 — Parser + final ingress collapse (in progress)

**Landed so far (7a–7b)**: pure relocations. `src/controller/timeline/parser/`
is now the canonical home for event ingress transformations, with two
modules so far:

- `flattenEvents.ts` — `flattenEventsToQueueFrames(events, stops)`,
  formerly `collectFrameEntries` in eventQueueController.ts. Emits
  PROCESS_FRAME entries (EVENT_START, SEGMENT_START/END, ON_FRAME,
  EVENT_END) + COMBO_RESOLVE entries for combos without resolved
  trigger columns.
- `cloneAndSplit.ts` — `cloneAndSplitEvents(rawEvents)` +
  `resetSegmentCloneCache()` + the `_segObjCache` clone cache,
  formerly in inputEventController.ts. Splits raw events into
  `{inputEvents, derivedEvents}`, deep-cloning segments so pipeline
  mutation doesn't leak back to React raw state.
- `index.ts` — barrel re-export.

Neither relocation changed any semantics. The old callsites in
`eventQueueController.ts` and `inputEventController.ts` now import from
`./parser`. `inputEventController.ts` still re-exports both names for
backwards compat (objectPool's dynamic `require('./inputEventController')`
call depends on it).

### Step 7 — Remaining work (7c onward)

The hard part is still ahead: the architectural flip from "batch
registerEvents pre-pass, then queue drain for frame markers" to "queue
drain is the ONE ingress, user-placed skill events enter via synthetic
APPLY SKILL clauses that call `DEC.createSkillEvent` from a
`doApplySkill` interpretor handler".

Proposed sub-step ordering (each a separate commit, each must be
jest-green):

**7c — Move talent event seeding into the parser.** Currently
`runEventQueue` (lines ~253–261) pulls talents from the TriggerIndex
and calls `state.registerEvents(newTalents)`. Move this into
`parser/flattenTalents.ts` (new file) and have it emit parser-seeded
entries. Tricky: talents currently need to be REGISTERED (for
onTriggerClause presence queries), not just queue-entered. A
half-measure: keep the `registerEvents(newTalents)` call but have the
parser be the one that selects which talents are new. This is pure
plumbing. Better approach once 7e lands: talents enter via a
`TALENT_SEED` queue frame at frame 0.

**7d — Move `seedControlledOperator` into a parser-emitted clause.**
Currently `processCombatSimulation` calls `state.seedControlledOperator`
which directly builds a synthetic CONTROL event and calls
`registerEvents`. Replace with parser emission of an APPLY CONTROL
clause at frame 0. Requires a `doApplyControl` interpretor handler
(tiny — it just calls the existing seedControlledOperator internals).

**7e — The big flip: doApplySkill + synthetic APPLY_SKILL hook.**
Add a new `FrameHookType.APPLY_SKILL` (or reuse EVENT_START with a
flag). Parser emits this for user-placed skill events at a priority
that runs BEFORE PROCESS_FRAME. When drained, the interpretor calls
`DEC.createSkillEvent(sourceEvent)` which runs the existing pass
1/2/3 helpers on a single event. This means `registerEvents(inputEvents)`
in processCombatSimulation (line 460) can be removed — user-placed
events enter via the queue.
Caveats to watch:
- Pass 3 currently runs once at the end of every `registerEvents`
  call, clearing + re-emitting combo windows from scratch. In the
  reactive model, pass 3 needs to run at a different cadence —
  probably once after the final APPLY_SKILL entry fires. Could model
  as a final POST_INGRESS queue entry.
- `clampMultiSkillComboCooldowns` + `clampComboWindowsToEventEnd` are
  folded into pass 3 tail (from 6d). These currently re-run on every
  registerEvents call. Moving to once-per-pipeline changes their
  timing — verify no test regresses.
- Combo events without `comboTriggerColumnId` currently get their
  COMBO_RESOLVE queue frame seeded by the parser's flatten pass.
  Deferred-resolution path (`handleComboResolve`) still works.
  Should be unchanged.

**7f — Delete dead ingress paths.** Once 7e is in:
- Delete `DEC.registerEvents` (replaced by `createSkillEvent` loop).
- Delete `DEC.addEvent` (fold into `createSkillEvent` or into the
  ColumnHost `applyEvent` path).
- Delete `cloneAndSplitEvents` as an external API — parser consumes
  raw events directly.
- Delete `markExtended` + the `extendedIds` guard (per step 5 deferred
  list — works once ingress is single-path).
- Delete `validateAll` as a post-pass (it's already validating
  sibling overlap; convert to inline on each `createSkillEvent`).
- Delete `seedControlledOperator` method (superseded by 7d).

**7g — Delete post-queue restoration loops.** The
`creationInteractionMode` and UID restoration loops in
`processCombatSimulation` (lines ~540–553) exist because
`cloneAndSplitEvents` drops these fields on the clone. With the
parser owning ingress, these can be preserved upstream and the
post-pass can go away.

**7h — Step 5 deferred items.** Flip initial queue seeding to raw
(unextended) frame positions. Delete `extendedIds`. Fold
`extendSingleEvent` into `computeFramePositions`. These only become
safe once the parser is the single ingress (each event is created
exactly once, no double-extension risk).

### Things to remember for next session (step 7 resumption)

1. **The parser module currently has two sub-files**:
   `flattenEvents.ts`, `cloneAndSplit.ts`. Add 7c's talent emitter as
   `flattenTalents.ts` (or similar) to keep one concept per file.

2. **`inputEventController.ts` still re-exports `cloneAndSplitEvents`
   and `resetSegmentCloneCache`** for dynamic-require compat with
   `objectPool.ts:45`. Don't remove the re-export until
   `objectPool.ts` is updated to import from `./parser` directly.

3. **Step 7e is where behavior changes.** Sub-steps 7a–7d are pure
   plumbing. 7e is the one that actually routes user-placed events
   through the queue. Expect the most regressions there — all the
   combo-using operators (Wulfgard, Antal, Estella, Fluorite P5,
   Akekuri, Avywenna) are high risk, as are the time-stop operators
   (Akekuri again).

4. **Pass 3 rerun cadence.** Currently pass 3 runs on every
   `registerEvents` call and does clear+re-emit of all combo windows
   from scratch. When 7e removes the batch `registerEvents(inputEvents)`
   call, pass 3 won't run as early. Need to decide: run it once at
   end of ingress drain, or on every `createSkillEvent`, or on
   demand via a POST_INGRESS queue priority.

5. **Time-stop reactive shift from step 5** only handles stops
   discovered mid-drain. Step 5's minimal form still relies on the
   pre-queue batch registerEvents discovering stops from user-placed
   events. Once 7e removes that batch pre-pass, ALL stops must be
   discovered via the reactive shift path. This should work because
   `_maybeRegisterStop` already uses the reactive path when the
   queue is non-empty — but worth double-checking with Akekuri
   integration tests after 7e.

### Step 6 original plan — Reactive combo windows

**Plan deliverables:**
- `DEC.openComboWindow(slotId, startFrame, endFrame, sourceColumnId)` —
  check target combo's CD at trigger frame; silently drop if blocked,
  else append + merge overlap with existing windows on the same slot.
- `ON_TRIGGER` handler in `eventInterpretorController.ts` calls
  `openComboWindow` instead of the current inline path.
- Combo window display markers: emit `COMBO_WINDOW_COLUMN_ID` events from
  `openComboWindow` (plan option b, for consistency).
- **Delete** `deriveComboActivationWindows` (the batch post-pass at
  `eventQueueController.ts:503-516`).
- **Delete** `resolveComboTriggersInline` / `resolveComboTriggerColumns`
  (this is pass 3 of `registerEvents`, still alive from step 2).
- **Delete** `clampComboWindowsToEventEnd`.
- **Delete** `clampMultiSkillComboCooldowns` (the post-queue clamp call).
- Add a `REDUCE_COOLDOWN` intra-frame priority between `PROCESS_FRAME` (5)
  and `ENGINE_TRIGGER` (22) so Fluorite P5's CD reduction fires before its
  combo trigger checks the CD.

**Risk:** every combo-using operator (Wulfgard, Antal, Estella, Fluorite P5,
Akekuri). The batch-to-reactive flip changes *when* windows are computed
relative to other events at the same frame, which can subtly shift which
combo events pick up a `comboTriggerColumnId`.

**Where to start:** read `resolveComboTriggersInline` (currently in DEC),
`deriveComboActivationWindows` (in `eventQueueController.ts` or similar),
and the `ON_TRIGGER` handler in `eventInterpretorController.ts`. Understand
the current window-derivation ordering before flipping it.

### Step 7 — Parser + final ingress collapse

**The biggest step.** New `src/controller/timeline/parser/` module.

**Plan deliverables:**
- Parser emits `QueueFrame[]` from raw events:
  - User skill placement → `EVENT_START` (synthetic `APPLY SKILL` clause) +
    N `SEGMENT_START/END` + M `ON_FRAME` + `EVENT_END`
  - Freeform infliction → `EVENT_START` (`APPLY INFLICTION` clause)
  - Status def → `STATUS_ENTRY` + per-frame `ON_FRAME` + `STATUS_EXIT`
  - Talent passive → `TALENT_SEED` at frame 0
  - Controlled-operator seed → `APPLY CONTROL` clause at frame 0
- `interpret()` gains `doApplySkill` / `doApplyControl` handlers that call
  `DEC.createSkillEvent` / DEC's control-event method.
- `processCombatSimulation` becomes:
  ```typescript
  reset();
  statAccumulator.init();
  triggerIndex.build();
  const queueFrames = parser.flatten(rawEvents, loadoutContext);
  state.insertQueueFrames(queueFrames);
  while (state.queueSize > 0) {
    const entry = state.popNextFrame();
    interpretor.processQueueFrame(entry);
  }
  return state.getProcessedEvents();
  ```
- **Delete** `cloneAndSplitEvents`.
- **Delete** `DEC.registerEvents` and `DEC.addEvent`.
- **Delete** `markExtended` / `validateAll` post-passes.
- **Delete** `seedControlledOperator` (becomes parser-emitted).
- **Delete** post-queue UID restoration and `creationInteractionMode`
  restoration loops.

**This is also where the deferred step-5 items land:**
- Flip initial seeding to raw positions.
- Delete `extendedIds` guard.
- Fold `extendSingleEvent` into `computeFramePositions`.

Reasoning: once the parser is the sole ingress, each event is created
exactly once via `createSkillEvent`, which means no double-extension risk
and no need for the guard. The reactive time-stop shift from step 5 handles
all stop-discovery cases because there's no more batch pre-pass.

**Risk:** largest surface area. Plan estimates "hours of per-operator edge
cases." Expect regressions in specific integration tests — fix them one by
one rather than bulk-tweaking.

### Step 8 — Invariant pin + spec

Mechanical. New `src/tests/unit/pipelineInvariants.test.ts` that greps
forbidden patterns (`cloneAndSplitEvents`, `_statusConfigCache`, `markExtended`,
`extendedIds`, `validateAll` as post-pass, direct `this.interpret(` outside
dispatch, etc.). Rewrite `engineSpec.md` to match the new shape.

## Things to remember for next session

1. **The unit tests in `src/tests/unit/createSkillEvent/` are load-bearing.**
   They cover the extracted helpers directly. If step 7 changes the signatures
   of these helpers (e.g. `chainComboPredecessor` taking a different state
   shape), the tests need to move with them.

2. **Pass 3 of `registerEvents`** (`resolveComboTriggersInline`) is still
   alive. Step 6 deletes it. Don't forget it exists.

3. **`_checkCooldown` in `createSkillEvent`** currently only checks
   `COOLDOWN` segment overlap. Step 6's `openComboWindow` will want to reuse
   this check. The logic is in `DEC._checkCooldown` — may want to promote it
   to a free function or keep it as a DEC method that `openComboWindow`
   calls.

4. **`createSkillEvent` has no callers yet.** Step 7 wires it up. Until then
   it's a dormant API — lint might flag it if the parser doesn't ship in the
   same PR.

5. **Priority queue `toArray()` returns the internal heap by reference.**
   Callers MUST NOT sort or structurally modify it without calling
   `reheapify()` afterward. `_shiftQueueForNewStop` in DEC does mutate
   frames in place and does reheapify; any other caller needs the same
   discipline.

6. **The freeform combustion bug in `todo.md` is unrelated to Phase 8.**
   Don't get sucked into fixing it while doing step 6 or 7. Leave it alone.

7. **If step 6 or 7 breaks a specific integration test,** the first check
   is always: did the ordering of queue entries at the same frame change?
   The `comparePriority` tiebreaker is `a.priority - b.priority`, so
   rearranging how priorities get assigned can flip interleaved events.

## Verification standard

Per user instruction: **jest integration suite is the verification standard**,
not the byte-diff JSON baseline the original plan called for. The full suite
must stay green (163 suites / 2125 tests) at every step. No new test failures,
no new skips, no new todos.
