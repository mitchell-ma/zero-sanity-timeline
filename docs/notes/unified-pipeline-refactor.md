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

10 failures across 5 suites (out of 66 suites, 1074 total tests). All 10 are **pre-existing** from the committed code.

### Resolved Categories

#### 1. Kebab-case column ID conflicts — RESOLVED
Another agent completed the kebab→SCREAMING_CASE migration in `columnBuilder.ts`, `triggerMatch.ts`, `conditionEvaluator.ts`, `statusTriggerCollector.ts`, `eventsQueryService.ts`, `eventPresentationController.ts`, `derivedEventController.ts`, and `channels/index.ts`.

#### 3. Operator status events not going through create* — RESOLVED
Added `else` clause in step 3b for operator-owned status events (MF, Scorching Heart, Focus, etc.). Also filtered `collectFrameEntries` to only process skill events from `registeredEvents` (plus all derived events), preventing engine-derived statuses from being duplicated through step 3b.

#### 4. Combo trigger resolution — RESOLVED (was mostly kebab-case issue)

#### 5. Reactive trigger seeding — RESOLVED (was mostly kebab-case issue)

#### RESET stacking + stack labels — RESOLVED
Added `stackingMode` passthrough in step 3b for enemy/common/operator status events. Fixed `createStatus` to only reject at capacity for NONE mode (REFRESH and other modes allow through, view layer caps labels).

### Remaining Pre-existing Failures (10 tests)

#### Susceptibility regression (7 failures)
Ardelia susceptibility tests show 0 events. Pre-existing from committed code.
- `susceptibilityStatus.test.ts` — 4 failures
- `fullKit.test.ts` — 3 failures (E1, E2, G2)

#### Combo mirrored infliction (3 failures)
Pre-existing from committed code.
- `comboTriggerResolution.test.ts` D6: Antal self-infliction triggers own combo window
- `antalInteractions.test.ts` H7: Full combo mirror scenario
- `laevatainInteractions.test.ts` K1: Scorching Heart absorbs mirrored heat

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

1. Fix the 10 remaining pre-existing test failures (susceptibility + combo mirrored infliction)
2. Verify the full app works end-to-end (not just tests)
3. Remove `handleFrameEffect` and `handleInflictionCreate` legacy handlers once all events go through `handleProcessFrame` step 3b
4. Consider removing `classifyEvents` entirely if all events can go through one path
5. Clean up unused imports and dead code
