# Phase 8 — Progress Notes (session: 2026-04-08)

Reference: [`docs/notes/phase-8-plan.md`](./phase-8-plan.md)

## Status: steps 1–5 committed, step 6 substeps a–c committed, 6d–8 pending

Every step gated on full jest suite (163 suites / 2125 tests) + tsc + eslint
on touched files. Baseline held identical at every commit.

| Step | Commit | Description | Status |
| --- | --- | --- | --- |
| 1 | `c4d1a29e` | Decompose `DEC.registerEvents` into named pure helpers | ✅ as planned |
| 2 | `20e24b70` | Extract createSkillEvent helpers into free functions (+10 unit tests) | ✅ as planned |
| 3 | `31b93637` | Add `DEC.createSkillEvent` single-event entrypoint | ✅ as planned |
| 4 | `0aaca74e` | Move priority queue ownership into DEC | ✅ as planned |
| 5 | `4b2e60ca` | Reactive time-stop re-positioning | ⚠️ minimal form — see below |
| 6a | `6c778deb` | `DEC.openComboWindow` reactive entrypoint, pass 3 routes through it | ✅ |
| 6b | `7399b9d0` | Delete post-queue batch `deriveComboActivationWindows` call | ✅ |
| 6c | `9152d736` | Delete post-queue re-derive + thread controlled-slot resolver | ✅ |
| 6d+ | — | `clampComboWindowsToEventEnd` reactive integration + dead-code removal | ⏸️ pending |
| 7 | — | Parser flattens all event sources to `QueueFrame[]` | ⏸️ pending |
| 8 | — | Invariant pin + engineSpec rewrite | ⏸️ pending |

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

### Step 6d+ — Finish step 6 cleanup

- Make `clampComboWindowsToEventEnd` reactive: when `reduceCooldown`
  fires on a combo event, walk overlapping COMBO_WINDOW events on the
  same slot and clamp their segment duration. Then delete the post-queue
  `state.clampComboWindowsToEventEnd()` call.
- Move or re-implement `clampMultiSkillComboCooldowns` as a reactive
  hook inside `openComboWindow` (or a new `createSkillEvent` step for
  combo events that land inside existing windows).
- Add `REDUCE_COOLDOWN` priority between `PROCESS_FRAME` (5) and
  `ENGINE_TRIGGER` (22) so Fluorite P5's CD reduction fires before its
  combo trigger evaluation at the same frame. Requires auditing whether
  `doReduce` still works synchronously at PROCESS_FRAME time or needs
  to be split into a queue entry.
- Delete dead code: `deriveComboActivationWindows`,
  `DEC.replaceComboWindows`, `clampComboWindowsToEventEnd` post-queue
  call, possibly `DEC.clampMultiSkillComboCooldowns`.
- `resolveComboTriggerColumns` in `processComboSkill.ts` is still used
  only by `comboTriggerResolution.test.ts` — decide whether to delete
  that test (since `openComboWindow` is the new path) or rewrite it to
  exercise DEC directly.

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
