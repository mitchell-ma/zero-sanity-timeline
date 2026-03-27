# Unified Freeform/Strict Pipeline Refactor — Handoff Notes

## Goal

Eliminate the parallel code path for freeform events. ALL non-skill events (inflictions, reactions, statuses) should go through the same pipeline: `collectFrameEntries` → queue → `handleProcessFrame` → `create*` methods. No separate seeding loop, no duplicate stacking logic in `registerEvents`.

## What Was Done

### Architecture Changes (partially applied)

1. **`classifyEvents` in `inputEventController.ts`** — now classifies non-skill events as "derived":
   ```
   isDerived = !SKILL_COLUMN_SET.has(ev.columnId)
     && ev.columnId !== OPERATOR_COLUMNS.INPUT
     && ev.columnId !== OPERATOR_COLUMNS.CONTROLLED
   ```
   Skill events (basic/battle/combo/ultimate) and CONTROL events stay as input → `registerEvents`. Everything else is derived → passed to `collectFrameEntries` directly.

2. **`collectFrameEntries` in `eventQueueController.ts`** — removed `if (event.ownerId === ENEMY_OWNER_ID) continue` skip. Now processes ALL events. Added synthetic frame synthesis for non-skill events without frame markers:
   ```typescript
   if (!hasFrames && !SKILL_COLUMN_SET.has(event.columnId)) {
     // Creates a PROCESS_FRAME queue entry at offset 0 with a bare { offsetFrame: 0 } frameMarker
   }
   ```

3. **`handleProcessFrame` step 3b in `eventInterpretorController.ts`** — added freeform event creation. When a frame has no DSL clauses and no dealDamage, routes the event through `create*` based on column type:
   - `INFLICTION_COLUMN_IDS` or `PHYSICAL_INFLICTION_COLUMN_IDS` → `createInfliction`
   - `REACTION_COLUMN_IDS` → `createReaction`
   - `PHYSICAL_STATUS_COLUMN_IDS` → `createStatus` with RESET/1
   - Enemy or common owner → `createStatus` generic
   - Each calls `checkReactiveTriggers` after creation

4. **Removed old derived event seeding loop** in `runEventQueue` (was lines 186-234). The loop that seeded `INFLICTION_CREATE`, `FRAME_EFFECT` entries for freeform events is gone. Derived events now enter via `collectFrameEntries` alongside registered events.

5. **Removed reactive trigger seeding loop** in `runEventQueue` (was lines 240-254). This loop seeded `ENGINE_TRIGGER` entries for freeform enemy events. Now handled by `checkReactiveTriggers` in step 3b after each `create*` call.

6. **Removed duplicate stacking logic** from `registerEvents` in `derivedEventController.ts` (was lines 211-242). The old block that reimplemented RESET/MERGE/NONE stacking for freeform status events is gone.

7. **`runEventQueue` signature** — takes `derivedEvents: readonly TimelineEvent[]` parameter. Call site passes both registered + derived to `collectFrameEntries`.

8. **`processCombatSimulation`** — registers only `inputEvents` (skill events). Passes `derivedEvents` to `runEventQueue`.

### Other Changes in This Session

- **`status-susceptibility.json`** — new generic status config in `src/model/game-data/generic/statuses/`. ID: `SUSCEPTIBILITY`, target: ENEMY, stacks: limit -1 (unlimited), interaction: NONE.
- **`UNLIMITED_STACKS` / `PERMANENT_DURATION` constants** in `consts/enums.ts` — sentinels for -1 values.
- **Physical status stacking** — `getStatusStackInfo` and `getStatusStackLimit` now seed `PhysicalStatusType` values (LIFT, KNOCK_DOWN, CRUSH, BREACH, SHATTER) as RESET with limit 1.
- **`creationInteractionMode`** field added to `TimelineEvent` in `viewTypes.ts`. Set by `createEvent` from `useApp`'s `interactionModeRef`. Not yet used for classification (replaced by column-based check).
- **`defaultEvent` enrichment in `columnBuilder.ts`** — physical status defaultEvents now have damage frames (offsetFrame: 0). Infliction, reaction, and enemy status defaultEvents now have synthetic frames (`frames: [{ offsetFrame: 0 }]`). Operator status defaultEvents use `def.statusId` for `id`/`name` instead of `def.label`.
- **Ardelia susceptibility DSL** — battle skill uses `APPLY STATUS` with `objectId: SUSCEPTIBILITY`, `objectQualifier: PHYSICAL/ARTS` instead of `APPLY SUSCEPTIBILITY`.
- **Integration tests reorganized** — `tests/integration/operators/<name>/`, `tests/integration/mechanics/`, `tests/integration/freeform/`.
- **Deleted** `tests/unit/eventQueue.test.ts` and `tests/unit/verbHandlers.test.ts` (created raw events bypassing the pipeline).

## Current Test State

48 failures across 16 suites (out of 66 suites, 1074 total tests).

### Failure Categories

#### 1. Kebab-case column ID conflicts (~15-20 failures)
Another agent changed status IDs/column IDs from `MELTING_FLAME` to `melting-flame`. Tests expect uppercase. Affected:
- `columnBuilder.test.ts` — micro column IDs are kebab
- `eventInterpretor.test.ts` — `"focus"` vs `"FOCUS"`, `"melting-flame"` vs `"MELTING_FLAME"`
- `laevatainInteractions.test.ts` — same
- `statusColumnLayout.test.ts` — same
- `meltingFlameStacking.test.ts` — MF events get kebab IDs from the status config

**Root cause:** `statusIdToColumnId()` in `triggerMatch.ts` line 113 falls through to `statusId.toLowerCase().replace(/_/g, '-')`. Other agent removed the kebab-case indexing from `getStatusStackInfo` and `getStatusStackLimit`. The status configs themselves may now use kebab IDs.

#### 2. Susceptibility regression (5 failures)
All Ardelia susceptibility tests show 0 events. Both strict and freeform modes affected.

**Likely cause:** The susceptibility status is created by the battle skill's DSL during queue processing. The `APPLY STATUS` effect with `objectId: SUSCEPTIBILITY` goes through `doApply` → creates status on SUSCEPTIBILITY column with `ownerId: ENEMY_OWNER_ID`. The status should go to `output` → re-registered → appear in `getProcessedEvents()`.

**Debug path:** Check if the condition `ENEMY HAVE CORROSION REACTION` evaluates to true during the battle skill frame. Check if `activeEventsIn` can find the corrosion created by the combo skill. The corrosion is in `stacks` (from `createReaction`). Verify `activeEventsIn` scans `stacks` correctly during queue processing.

#### 3. Operator status events not going through create* (~5-8 failures)
MF, Scorching Heart, and other operator-owned statuses on non-skill columns are now classified as derived. They go through `collectFrameEntries` → synthetic frame → `handleProcessFrame` step 3b. But step 3b only handles enemy/common owner or specific column sets. Operator-owned statuses (ownerId = slot-X) fall through without creating anything.

**Fix needed:** Step 3b in `handleProcessFrame` needs an additional branch for operator-owned non-skill events that aren't in any specific column set. These should go through `createStatus` with the event's stacking config.

#### 4. Combo trigger resolution (~5 failures)
`comboTriggerResolution.test.ts` — combo triggers depend on seeing infliction events in `registeredEvents` for trigger evaluation. With inflictions now as derived events (not in `registeredEvents` during initial registration), combo trigger resolution in `registerEvents` Pass 3 can't find them.

**Fix:** Combo trigger resolution runs again during re-registration of queue output (line 224 of `registerEvents`). But the timing might be wrong — combo events are placed before inflictions exist. The re-registration pass should fix this. Verify by checking if `resolveComboTriggersInline` runs after queue output is re-registered.

#### 5. Reactive trigger seeding (2-3 failures)
Weapon/gear triggers that react to enemy events (APPLY CRYO INFLICTION → trigger Bonechilling buff) relied on the removed reactive trigger seeding loop. Now handled by `checkReactiveTriggers` in step 3b. But the target filtering logic may differ.

**Fix:** Verify `checkReactiveTriggers` in step 3b correctly seeds ENGINE_TRIGGER entries for weapon/gear triggers. The old loop had explicit target filtering (TO ENEMY, TO OPERATOR). `checkReactiveTriggers` may not have the same filtering.

## Files Modified

| File | Changes |
|------|---------|
| `src/consts/viewTypes.ts` | Added `creationInteractionMode`, imported `InteractionModeType` |
| `src/consts/enums.ts` | Added `UNLIMITED_STACKS`, `PERMANENT_DURATION` constants |
| `src/controller/timeline/inputEventController.ts` | `classifyEvents` uses `SKILL_COLUMN_SET`, `createEvent` accepts `interactionMode` param |
| `src/controller/timeline/eventQueueController.ts` | Removed enemy skip in `collectFrameEntries`, added synthetic frame synthesis, removed derived seeding loop, removed reactive trigger seeding loop, `runEventQueue` takes `derivedEvents` param |
| `src/controller/timeline/eventInterpretorController.ts` | Added step 3b in `handleProcessFrame`, added physical status branch in `handleFrameEffect`, imported `CombatSkillType`, `OPERATOR_COLUMNS`, `PHYSICAL_INFLICTION_COLUMN_IDS` |
| `src/controller/timeline/derivedEventController.ts` | Removed duplicate stacking block from `registerEvents`, removed `getStatusStackingMode` import, added `PhysicalStatusType` to `getStatusStackLimit` cache, added `clampCrossOwnerControl` (later removed by linter — needs re-adding if CONTROL goes through queue) |
| `src/controller/timeline/eventPresentationController.ts` | Added `PhysicalStatusType` to `getStatusStackInfo` cache |
| `src/controller/timeline/columnBuilder.ts` | Enriched defaultEvents with synthetic frames and damage frames, operator status uses `def.statusId` for id/name |
| `src/app/useApp.ts` | Passes `interactionModeRef.current` to `createEvent` |
| `src/model/game-data/generic/statuses/status-susceptibility.json` | New file |
| `src/model/game-data/operators/ardelia/skills/battle-skill-dolly-rush.json` | Changed APPLY SUSCEPTIBILITY → APPLY STATUS with objectId SUSCEPTIBILITY |
| `src/tests/unit/ardeliaInteractions.test.ts` | Updated finders for new DSL shape |
| `src/tests/integration/` | Reorganized into operators/mechanics/freeform subdirs |

## Key Design Decisions

1. **Non-skill events never go in `registeredEvents` before the queue.** They only exist as derived events passed directly to `collectFrameEntries`. After queue processing, `create*` output goes to `output`, then re-registered. One copy, no deduplication needed.

2. **Synthetic frames vs DSL clauses:** Events don't carry full DSL clause effects. Instead, `handleProcessFrame` step 3b detects clause-less frames on non-skill columns and routes them to the appropriate `create*` method based on column type. This avoids adding DSL clauses to every defaultEvent template.

3. **Physical statuses:** LIFT, KNOCK_DOWN, CRUSH, BREACH, SHATTER are all RESET with limit 1. Seeded into `getStatusStackInfo` and `getStatusStackLimit` caches from `PhysicalStatusType` enum.

4. **CONTROL events stay as input.** They need the cross-owner clamping logic in `registerEvents` Pass 1. They're excluded from derived classification via `ev.columnId !== OPERATOR_COLUMNS.INPUT && ev.columnId !== OPERATOR_COLUMNS.CONTROLLED`.

## What's Left

1. Fix the 48 remaining test failures (categorized above)
2. Resolve kebab-case vs uppercase ID conflicts with the other agent
3. Verify the full app works end-to-end (not just tests)
4. Remove `handleFrameEffect` and `handleInflictionCreate` legacy handlers once all events go through `handleProcessFrame` step 3b
5. Consider removing `classifyEvents` entirely if all events can go through one path
6. Clean up unused imports and dead code
