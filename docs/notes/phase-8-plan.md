# Phase 8 — Delete `registerEvents`: Focused Implementation Plan

**Goal:** every event in the system is produced as `QueueFrame[]` by the parser, drained through the queue, and applied via `interpret() → DEC.create*`. There is no batch ingress, no `registerEvents`, no `cloneAndSplitEvents`, no post-queue rehydration step. The pipeline is parser → queue → interpret → DEC, no other path.

**Scope warning:** this is a multi-session refactor. Roughly 30+ files touched, 10+ functions deleted, queue ownership moves between modules, time-stop semantics shift from batch to reactive. Each sub-step below is its own commit, gated by the full integration suite. **Do not skip the per-step verification.**

---

## Pre-flight (do before touching code)

1. **Snapshot baseline.** Run `npx jest` and record the test count + any flaky tests. Run a complex sheet through the dev server (Avywenna + Lifeng + Estella P5), export `processedEvents` JSON, save to `.claude-temp/phase-8-baseline.json`. This is the comparison reference for steps 4–8.
2. **Audit operator-ordering dependencies.** Grep every operator JSON for `comboTriggerColumnId`, `onTriggerClause` with combo triggers, and `REDUCE COOLDOWN`. List operators where intra-frame ordering is load-bearing — these are the ones to test first after each commit. Known sensitive: Avywenna (pierce chains), Estella (commiseration), Gilberta (cascading), Fluorite (P5 CD reduction + combo), Lifeng (vajra runtime conditional segments).
3. **Read the data flow diagram once more.** `parser → queue → interpret → DEC`. Understand the four boundaries before changing them. If anything in the current code surprises you, stop and write it down before editing.

---

## Step-by-step implementation

Each step is a single commit with green tests. Do not advance until the previous step's checklist passes.

### Step 1 — Decompose `DEC.registerEvents` into named pure helpers (no behavior change)

**Why first:** `registerEvents` is currently a 200-line method that does combo chaining, reaction segments, time-stop discovery, time-stop extension, frame position computation, combo trigger resolution, and validation, all interleaved. Phase 8 needs each of these as a callable step, but renaming alone is safer than restructuring.

**Files touched:** `derivedEventController.ts` only.

**Deliverables:**
- New private methods on DEC, each pure (input → output, no hidden mutation):
  - `_chainComboPredecessor(ev)` — finds prior combo on same owner, truncates its CD segment
  - `_clampPriorControlEvents(ev)` — shortens earlier CONTROL events to end at `ev.startFrame`
  - `_buildReactionSegments(ev)` — materializes corrosion/combustion segments from raw duration
  - `_computeFramePositions(ev)` — extends segment offsets and frame markers using current stops
  - `_resolveComboTriggerColumn(ev)` — sets `ev.comboTriggerColumnId` from open combo windows
  - `_validateSiblingOverlap(ev)` — attaches warnings if ev overlaps a sibling
  - `_pushToStorage(ev)` — appends to `registeredEvents` and column index
  - `_maybeRegisterStop(ev)` — already exists, leave as-is
- `registerEvents` becomes a thin orchestrator that calls the above in order. Behavior must be byte-identical.

**Verification:**
- `npx tsc --noEmit` clean
- `npx jest` — must equal baseline test count, zero changes
- Diff `.claude-temp/phase-8-baseline.json` against a fresh export — must be byte-identical

**Commit message:** "Phase 8 step 1: decompose DEC.registerEvents into named pure helpers"

---

### Step 2 — Move helpers out of the DEC class into free functions

**Why:** the steps need to be callable individually from the new `createSkillEvent` orchestrator. Free functions are easier to test in isolation and don't require the DEC `this` context.

**Files touched:** new directory `src/controller/timeline/createSkillEvent/` containing one file per step:
- `chainComboPredecessor.ts`
- `clampPriorControlEvents.ts`
- `buildReactionSegments.ts`
- `computeFramePositions.ts`
- `resolveComboTriggerColumn.ts`
- `validateSiblingOverlap.ts`
- `index.ts` (re-exports + the orchestrator)

Each function takes its dependencies explicitly (`stops`, `comboWindows`, `registeredEvents`, etc.) — no DEC reference.

**Deliverables:**
- All 6 helpers extracted into free functions with explicit signatures
- DEC holds the state (`stops`, `comboWindows`, `registeredEvents`) and passes it into the helpers when calling them
- `registerEvents` becomes:
  ```typescript
  registerEvents(events) {
    for (const ev of events) {
      chainComboPredecessor(ev, this.registeredEvents);
      clampPriorControlEvents(ev, this.registeredEvents);
      buildReactionSegments(ev);
      computeFramePositions(ev, this.stops);
      resolveComboTriggerColumn(ev, this.comboWindows);
      validateSiblingOverlap(ev, this.registeredEvents);
      this._pushToStorage(ev);
      this._maybeRegisterStop(ev);
    }
  }
  ```
- Add unit tests for each helper in `src/tests/unit/createSkillEvent/`. Each test takes a hand-built event + state, asserts the helper's effect.

**Verification:**
- `npx tsc --noEmit` clean
- `npx jest` — baseline + new unit tests pass, zero integration changes
- Diff `.claude-temp/phase-8-baseline.json` — byte-identical

**Commit message:** "Phase 8 step 2: extract createSkillEvent helpers into free functions"

---

### Step 3 — Add `DEC.createSkillEvent(ev)` as a single-event entrypoint (still calling registerEvents under the hood)

**Why:** establishes the new public surface without yet rerouting callers. A bridge.

**Deliverables:**
- New method `DEC.createSkillEvent(ev: TimelineEvent): TimelineEvent | null` that calls the same orchestrator as `registerEvents` but for a single event. Returns the registered event or `null` if cooldown rejected the creation.
- `_checkCooldown(ev)` helper added — checks if an existing event on the same owner+column has an active CD segment at `ev.startFrame`. Used by `createSkillEvent` to silently reject reactive creations.
- `registerEvents` rewritten to call `createSkillEvent` in a loop (back-compat wrapper).

**Verification:**
- `npx tsc --noEmit` clean
- `npx jest` — baseline passes
- Diff `.claude-temp/phase-8-baseline.json` — byte-identical

**Commit message:** "Phase 8 step 3: add DEC.createSkillEvent single-event entrypoint"

---

### Step 4 — Move the queue from `eventQueueController` into DEC

**Why:** Phase 8's "time-stop reactive" model requires the queue to be re-positionable when a new stop is registered, which means DEC needs to own the queue. Today the queue lives as a singleton in `eventQueueController.ts`.

**Files touched:** `eventQueueController.ts`, `derivedEventController.ts`, `eventQueueTypes.ts` (no schema changes, just ownership move).

**Deliverables:**
- `DEC` gains a private `queue: PriorityQueue<QueueFrame>` field, initialized in `reset()`.
- `DEC.popNextFrame(): QueueFrame | undefined` — extracts the next entry.
- `DEC.insertQueueFrames(entries: QueueFrame[])` — inserts new entries (used by interpret handlers when they generate cascade work).
- `DEC.queueSize: number` getter.
- `eventQueueController.runEventQueue` switches from its local `queue` singleton to `state.popNextFrame()` / `state.insertQueueFrames()`.
- The legacy module-level `getQueue()` helper is deleted.

**Verification:**
- `npx tsc --noEmit` clean
- `npx jest` — baseline passes
- Diff `.claude-temp/phase-8-baseline.json` — byte-identical

**Commit message:** "Phase 8 step 4: move priority queue ownership into DEC"

---

### Step 5 — Reactive time-stop re-positioning

**Why:** today, time-stops are discovered during `registerEvents` (a batch pre-pass), so all queue entries can be seeded with already-extended frame positions. After Phase 8, events arrive one at a time; a stop registered mid-drain must shift queue entries that come after it. This is the highest-risk step in Phase 8.

**Files touched:** `derivedEventController.ts`, `eventQueueController.ts`, `processTimeStop.ts`.

**Deliverables:**
- New `DEC._maybeRegisterStop(ev)` (already exists) is extended: when a new stop `[S, E]` is registered, walk the queue. For every entry whose parent event's active range overlaps `[S, E]` AND whose current frame position is strictly greater than `S`, shift the entry's frame by `E - S`. Re-heapify.
- Initial queue seeding switches to **raw (unextended) frame positions**. Parser produces `QueueFrame[]` with `frame = event.startFrame + cumulativeSegmentOffset + rawFrameOffset`. No batch extension at seed time.
- The `extendedIds` guard is deleted from DEC. By construction, `createSkillEvent` is called exactly once per event in the new model, so there is no double-extension risk.
- `extendSingleEvent` is folded into `computeFramePositions`.

**Verification:**
- `npx tsc --noEmit` clean
- `npx jest` — baseline passes. **Critical: re-run Avywenna, Akekuri (time-dilation operators), and Estella tests three times each.**
- Manual smoke test: load dev server, place an Akekuri ultimate (time-stop), verify the timeline animation pauses correctly during the stop, verify subsequent events shift.
- Diff `.claude-temp/phase-8-baseline.json` — must be byte-identical

**Commit message:** "Phase 8 step 5: reactive time-stop re-positioning, delete extendedIds guard"

---

### Step 6 — Make combo windows reactive

**Why:** today combo windows are derived in a post-pass (`deriveComboActivationWindows` + `clampComboWindowsToEventEnd` + re-derive) at `eventQueueController.ts:503-516`. The plan wants windows opened reactively when a triggering event fires, with merging at insertion time.

**Files touched:** `derivedEventController.ts`, `eventInterpretorController.ts` (the `ON_TRIGGER` handler), `eventQueueController.ts` (delete the post-pass), `processComboSkill.ts`.

**Deliverables:**
- `DEC.openComboWindow(slotId, startFrame, endFrame, sourceColumnId)` — checks the target combo's CD at the trigger frame using current state. If CD blocks, silently drops. Otherwise appends to `comboWindows`, merging overlap with existing entries on the same slot.
- The `ON_TRIGGER` handler for combo trigger clauses calls `DEC.openComboWindow` instead of the current inline path.
- Combo window display markers are generated lazily in the view layer from `DEC.comboWindows`. Choose between (a) view-layer projection, (b) `createSkillEvent` emitting `COMBO_WINDOW_COLUMN_ID` events from `openComboWindow`. Pick (b) for consistency with the rest of the pipeline.
- Delete `deriveComboActivationWindows` function entirely.
- Delete `resolveComboTriggersInline` / `resolveComboTriggerColumns` (replaced by `createSkillEvent` step `_resolveComboTriggerColumn`).
- Delete the post-queue clamp/re-derive at `eventQueueController.ts:503-516`.
- Delete `clampMultiSkillComboCooldowns` post-queue call.
- **Add intra-frame priority**: `REDUCE COOLDOWN` effects fire at a lower priority number than combo-trigger `ON_TRIGGER` evaluations at the same frame, so Fluorite P5's CD reduction is applied before its combo trigger checks the CD. New priority constant `REDUCE_COOLDOWN` between `PROCESS_FRAME` (5) and `ENGINE_TRIGGER` (22).

**Verification:**
- `npx tsc --noEmit` clean
- `npx jest` — baseline passes. **Critical: re-run every combo-using operator (Wulfgard, Antal, Estella, Fluorite P5, Akekuri).**
- Diff `.claude-temp/phase-8-baseline.json` — byte-identical

**Commit message:** "Phase 8 step 6: reactive combo windows, delete post-queue derive"

---

### Step 7 — Parser flattens user-placed skill events into `QueueFrame[]`

**Why:** the final piece. After this step, `cloneAndSplitEvents` has nothing to do — every event source has been migrated to parser → QueueFrame[].

**Files touched:** new `src/controller/timeline/parser/` directory, `eventQueueController.ts`, `derivedEventController.ts`.

**Deliverables:**
- New parser module that takes raw events + loadout context and emits `QueueFrame[]`:
  - User skill placement → `EVENT_START` (synthetic `APPLY SKILL` clause) + N `SEGMENT_START/END` + M `ON_FRAME` + `EVENT_END`
  - Freeform infliction → `EVENT_START` (`APPLY INFLICTION` clause)
  - Status def → `STATUS_ENTRY` + per-frame `ON_FRAME` + `STATUS_EXIT`
  - Talent passive → `TALENT_SEED` at frame 0
  - Controlled-operator seed → `APPLY CONTROL` clause at frame 0
- `interpret()` gains `doApplySkill` / `doApplyControl` handlers that call `DEC.createSkillEvent` / DEC's control event method.
- `eventQueueController.processCombatSimulation` becomes:
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
- Delete `cloneAndSplitEvents`.
- Delete `DEC.registerEvents` and `DEC.addEvent` (the latter migrates into `createSkillEvent`).
- Delete `markExtended` / `validateAll` post-passes.
- Delete `seedControlledOperator` (becomes a parser-emitted clause).
- Delete the post-queue UID restoration loop.
- Delete the post-queue `creationInteractionMode` restoration.

**Verification:**
- `npx tsc --noEmit` clean
- **`npx jest` — full integration suite. This is the riskiest step. Expect to spend hours fixing per-operator edge cases.**
- Diff `.claude-temp/phase-8-baseline.json` — must be byte-identical
- Manual smoke: load dev server, load 3-4 different sheets, walk through them, compare visually with screenshots from baseline

**Commit message:** "Phase 8 step 7: parser flattens all event sources to QueueFrame[]"

---

### Step 8 — Cleanup and invariant pin

**Files touched:** `src/tests/unit/pipelineInvariants.test.ts` (new), `engineSpec.md`.

**Deliverables:**
- New regression test `pipelineInvariants.test.ts` that fails the build if any forbidden pattern reappears in `src/`:
  - `notifyResourceControllers`
  - `cloneAndSplitEvents`
  - `_statusConfigCache` / `_statusDefCache` / `clearStatusDefCache`
  - `\.finalize\(` on `spController|ueController|hpController|shieldController` (gated for after Phase 9)
  - `precomputeDamageByFrame` / `maybeApplyHpThresholdStatuses`
  - `markExtended` / `extendedIds`
  - `validateAll` as a post-pass
  - `this\.interpret(` outside `dispatchClauseFrame` / `interpretEffects` / `runStatusCreationLifecycle`
  - `controller\.applyEvent\|applyPhysicalStatus` outside `interpret()` chain
- `engineSpec.md` rewritten to match the new pipeline shape:
  - One-line pipeline: parser → queue → interpret → DEC
  - DEC's public surface: `createSkillEvent`, `createInfliction`, `createReaction`, `createStatus`, `createStagger`, `consume*`, query methods. No batch ingress.
  - Time-stop section: reactive re-positioning model
  - Combo window section: reactive `openComboWindow`
  - Stat-state section: unchanged
  - Two-pass frailty section: deleted (will be addressed in Phase 9 prep)
- Update `pipeline-unification-plan.md` Phase 8 section to "RESOLVED" with a summary.

**Verification:**
- `npx tsc --noEmit` clean
- `npx jest` — full suite passes including new invariant test
- `npx eslint src/` — no warnings on touched files

**Commit message:** "Phase 8 step 8: invariant pin + engineSpec rewrite"

---

## Risk register

- **Time-stop re-positioning (step 5).** The shift-and-reheapify is correct in theory but subtle in practice. Risk: an entry shifts past a stop boundary it shouldn't have. Mitigation: assert in `_maybeRegisterStop` that the new positions are still in monotonic frame order.
- **Combo window reactive merge (step 6).** Today's batch derive may produce subtly different windows than the reactive merge — e.g. if windows are opened in a different order due to queue dispatch order. Mitigation: byte-diff `processedEvents` JSON after every step. Any combo event with `comboTriggerColumnId` mismatch is a flag.
- **`createSkillEvent` re-entry from interpret handlers (step 7).** When a reactive `APPLY COMBO` from a trigger creates a combo event mid-drain, that event needs to register stops, open combo windows, etc. — all the same machinery as user-placed events. Risk: infinite recursion if the new event itself fires a trigger that re-enters. Mitigation: cascade depth cap (already exists for `ENGINE_TRIGGER`, extend to `createSkillEvent` chain).
- **Damage calc test stability.** The plan's hard rule: damage test expected values are immutable. Any ordering shift that changes a damage value means the code is wrong. Mitigation: run damage tests after every step, not just at the end.

## Estimated effort (do not promise these to anyone)

- Step 1: 0.5–1 day (decompose without changing behavior)
- Step 2: 1 day (extract + unit tests)
- Step 3: 0.5 day
- Step 4: 1 day (queue ownership move, lots of small touches)
- Step 5: 2–3 days (time-stop is the hard one)
- Step 6: 2 days (combo windows)
- Step 7: 3–5 days (parser + final ingress collapse, expect operator edge cases)
- Step 8: 1 day (invariant + spec)

Total: roughly 11–14 days of focused work, spread over multiple sessions. **Do not attempt to compress this.**

## What this plan does NOT cover

- **Phase 9 (delete `*.finalize()`)** is a follow-up. Each of the 4 controllers needs to be rewritten to incremental per-frame projection. That's its own focused plan.
- **Phase 9b (crit pin override inline)** is small enough to do as a stand-alone commit either before or after Phase 8. Does not block Phase 8.

## Stop conditions

If any of the following happen, **stop and reassess**:
- A damage calc test value changes (per CLAUDE.md, this means the code is wrong).
- The byte diff against `phase-8-baseline.json` shows differences that are not explainable by intentional refactor changes.
- Any of the operator-ordering audit list (Avywenna, Estella, Gilberta, Fluorite, Lifeng) regresses.
- A step takes more than 2x the estimate without converging.

In all of these, prefer reverting the step and writing down what went wrong over pushing through.
