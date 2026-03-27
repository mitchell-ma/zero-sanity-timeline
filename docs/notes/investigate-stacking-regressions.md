# Investigation: 7 test regressions from stacking pipeline changes (2026-03-26)

## Failing tests

```
src/tests/unit/laevatainInteractions.test.ts (2 failures)
  C1: Empowered battle skill last frame applies forced Combustion
  C4: Empowered battle skill last frame applies forced Combustion reaction

src/tests/unit/ardeliaInteractions.test.ts (4 failures)
  B5: Vulnerability rate scales from 0.12 (lv1) to 0.20 (lv12)
  B6: Vulnerability duration is 30s at all skill levels
  B7: Vulnerability max rate scales from 0.36 (lv1) to 0.40 (lv12)
  B8: Damage multiplier scales from 1.42 (lv1) to 3.2 (lv12)

src/tests/integration/ardeliaComboCorrosion.test.ts (1 failure)
  combo frame 2 applies Corrosion to enemy after basic attack finisher
```

All pass on clean `main` at commit `03f9dae`. All fail after commit `8cf4081`.

## What changed

The commit modified the stacking/interaction logic in `derivedEventController.ts` and `eventInterpretorController.ts`. Key changes:

### 1. MERGE fires unconditionally (not just at capacity)

`createStatus()` in `derivedEventController.ts` now runs MERGE before the capacity check:

```ts
// MERGE: subsume all active instances into the new one (always, not just at capacity)
if (options?.stackingMode === StackInteractionType.MERGE) {
  const active = this.activeEventsIn(columnId, ownerId, frame);
  for (const act of active) { /* clamp + CONSUMED */ }
}
```

Previously MERGE only fired inside the `if (active >= maxStacks)` block. If any status involved in Laevatain/Ardelia processing uses MERGE, this could cause premature consumption.

### 2. RESET only fires at capacity

`createStatus()` now only calls `resetOldest()` when `activeCount >= maxStacks`:

```ts
if (maxStacks != null) {
  const active = this.activeCount(columnId, ownerId, frame);
  if (active >= maxStacks) {
    if (options?.stackingMode === StackInteractionType.RESET) {
      this.resetOldest(columnId, ownerId, frame, source);
    } else { return false; }
  }
}
```

Physical statuses (LIFT, KNOCK_DOWN, CRUSH, BREACH) pass `maxStacks: 1` explicitly. If `maxStacks` is undefined for any caller, the capacity check is skipped entirely and RESET never fires.

### 3. registerEvents stacking logic for freeform events

`registerEvents()` now applies stacking for freeform events using `getStatusStackingMode(ev.id)`. The lookup cache indexes by status ID, kebab-case column ID, AND display name. If a non-status event's `id` or `name` collides with a status display name in the cache, the stacking logic fires incorrectly.

Check: does `getStatusStackInfo` cache contain entries like `"Scorching Heart"`, `"Re-Ignition"`, or any name that collides with a skill/event ID used by Laevatain?

### 4. extendedIds guard for queue-derived events

`registerEvents()` skips stacking for events in `this.extendedIds` (queue-derived events). If `markExtended()` isn't called for some events, or if it's called too late, the guard fails and stacking fires on queue-derived events.

## How to debug

### Step 1: Bisect which change causes each failure

Run each failing test after reverting individual changes:

1. Revert MERGE-always to MERGE-at-capacity-only in `createStatus()` → check if Laevatain C1/C4 pass
2. Revert the `registerEvents` stacking block (remove the `getStatusStackingMode` check entirely) → check if Ardelia B5-B8 pass
3. Check if `maxStacks` is properly passed for all `createStatus()` callers that use RESET

### Step 2: Check for name collisions in status cache

```ts
// In a test, after cache is built:
const cache = getStatusStackInfo('Scorching Heart'); // should be undefined for non-status
const cache2 = getStatusStackInfo('Re-Ignition');
```

If these return non-undefined, the display name indexing is causing collisions.

### Step 3: Verify physical status maxStacks

Search for all `createStatus` calls with `stackingMode: 'RESET'` and verify each passes `maxStacks`:

```
grep -n "stackingMode.*RESET" src/controller/timeline/eventInterpretorController.ts
```

Each should have an explicit `maxStacks` value. If any relies on `getStatusStackLimit()` which returns undefined for non-operator statuses, RESET won't fire.

### Step 4: Check Ardelia's Dolly Rush vulnerability path

Ardelia B5-B8 test vulnerability rate/duration. Trace `applyPhysicalStatus` → `applyBreach` for Ardelia. The `createStatus` call for BREACH has `maxStacks: 1` — verify this is correct (BREACH can have multiple stacks from consuming multiple vulnerabilities, but only 1 active BREACH at a time).

## Files to read

- `src/controller/timeline/derivedEventController.ts` — `createStatus()` (line ~726), `registerEvents()` stacking block (line ~202)
- `src/controller/timeline/eventInterpretorController.ts` — `applyLiftOrKnockDown()`, `applyCrush()`, `applyBreach()` — all pass `maxStacks: 1`
- `src/controller/timeline/eventPresentationController.ts` — `getStatusStackInfo()` cache with display name indexing
- `src/tests/unit/laevatainInteractions.test.ts` — C1/C4 test cases
- `src/tests/unit/ardeliaInteractions.test.ts` — B5-B8 test cases
