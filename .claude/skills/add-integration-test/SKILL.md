---
name: add-integration-test
description: Write integration tests that exercise the full pipeline through useApp — simulating user actions (context menu, drag, edit), verifying controller intermediary state, and asserting view-layer column/event structure.
---

# Integration Test — Skill Guide

Integration tests exercise the **full user pipeline** through `useApp`, verifying three layers:
1. **Context menu** — enabled/disabled items, labels, reasons
2. **Controller** — processed events, resource graphs, SP tracking, stagger breaks
3. **View** — column structure via `computeTimelinePresentation`, micro-column positions, status overrides

## Directory & Running

```
src/tests/integration/
  helpers.ts              # Shared: findColumn, buildContextMenu, getMenuPayload
  mechanics/              # Cross-operator mechanics (SP, stagger, time-stop)
  operators/<op>/         # Per-operator, one file per feature (e.g. slashingEdge.test.ts)
  freeform/               # Freeform-mode specific tests
```

```bash
npx jest src/tests/integration/operators/chen-qianyu/slashingEdge.test.ts
```

Run tests after writing. If a test fails because the engine doesn't support a mechanic, use `it.skip` with a comment.

## File Setup

```typescript
/** @jest-environment jsdom */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { SKILL_COLUMNS, REACTION_COLUMNS, INFLICTION_COLUMNS, ENEMY_OWNER_ID, ENEMY_GROUP_COLUMNS, OPERATOR_STATUS_COLUMN_ID } from '../../model/channels';
import { ColumnType, EventStatusType, InteractionModeType } from '../../consts/enums';
import { NounType, VerbType, AdjectiveType } from '../../dsl/semantics';
import { FPS } from '../../utils/timeline';
import { computeTimelinePresentation } from '../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu, getMenuPayload } from '../../helpers';
import type { MiniTimeline } from '../../consts/viewTypes';
```

## Core Pattern — Context Menu Driven

All event placement must go through the context menu flow:

```typescript
// 1. Find column → 2. Build menu → 3. Verify enabled → 4. Execute → 5. Verify controller → 6. Verify view
const col = findColumn(result.current, SLOT_ID, SKILL_COLUMNS.BATTLE);
const menu = buildContextMenu(result.current, col!, 5 * FPS);
const addItem = menu!.find(i => i.actionId === 'addEvent');
expect(addItem!.disabled).toBeFalsy();
const payload = addItem!.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: unknown };
act(() => { result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill); });
```

### Freeform mode

```typescript
act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
// Derived columns (inflictions, reactions) become addable via context menu
```

### Placing enemy statuses for conditional tests

When a test needs a prerequisite status (Solidification, infliction stacks, etc.), place it through freeform context menu on `ENEMY_GROUP_COLUMNS.ENEMY_STATUS`, then verify in both layers before testing the conditional:

```typescript
act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });
const enemyCol = app.columns.find(
  (c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE
    && c.ownerId === ENEMY_OWNER_ID && c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
);
const menu = buildContextMenu(result.current, enemyCol!, targetFrame);
// Find and execute the specific status add item, then verify controller + view layers
```

## Verification Requirements

### Controller layer (`allProcessedEvents`)

Key fields: `uid`, `id`/`name`, `ownerId`, `columnId`, `startFrame`, `segments` (duration), `eventStatus`, `stacks`, `statusValue`, `sourceOwnerId`, `sourceSkillName`, `skillPointCost`.

### View layer (`computeTimelinePresentation`)

```typescript
const viewModels = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
const vm = viewModels.get(col!.key);
// vm.events, vm.microPositions, vm.statusOverrides, vm.overlapLanes
```

**Enemy statuses** are micro-columns within `ENEMY_GROUP_COLUMNS.ENEMY_STATUS` — filter `vm.events` by `columnId`.

### Status columns use `matchColumnIds`

```typescript
function findMatchingColumn(app: AppResult, ownerId: string, matchId: string) {
  return app.columns.find((c): c is MiniTimeline =>
    c.type === ColumnType.MINI_TIMELINE && c.ownerId === ownerId
    && (c.columnId === matchId || (c.matchColumnIds?.includes(matchId) ?? false)));
}
```

## Game Data — Use Real Values

```typescript
import { getSkillTypeMap, getBattleSkillSpCost, getUltimateEnergyCost, getFrameSequences,
  getEnabledStatusEvents, getComboTriggerInfo } from '../../controller/gameDataStore';
```

Load operator/skill/status IDs from JSON configs: `require('../model/game-data/operators/<op>/<op>.json').id`

## Gotchas

- **Lift/Knock Down** requires pre-existing Vulnerable. First APPLY LIFT only adds Vulnerable; second creates the Lift.
- **Template status events** at `startFrame: 0` are definitions, not instances. Filter `startFrame > 0` for triggered instances.
- **Stack labels** show total active count (all events show "V" at max), not per-event ordinals.
- **Timing matters** — place events close enough that stacks are still active at the check frame.
- **BA categories** (BATK, DIVE, FINISHER) are independent, not variants of each other.
- **Changing potential/skill level:** `handleStatsChange(SLOT, { ...DEFAULT_LOADOUT_PROPERTIES, operator: { ...DEFAULT_LOADOUT_PROPERTIES.operator, potential: N } })`

## Exhaustive TRIGGER / CONSUME / APPLY Test Scenarios

When testing any operator skill, talent, or weapon effect, **every** TRIGGER condition, CONSUME effect, and APPLY effect in its JSON config must have dedicated test coverage. Read the JSON configs and generate tests for each scenario below.

### TRIGGER (talent/weapon condition firing)

Triggers are conditions in talent/weapon JSON configs that cause effects to fire. Each trigger condition must be tested:

**Positive trigger tests** — verify the effect fires when condition is met:
```typescript
// Pattern: place prerequisite skill → verify derived status/effect appears
// Example: Wulfgard ult creates Combustion → Scorching Fangs talent triggers
placeUlt(result, 2);
const sfEvents = result.current.allProcessedEvents.filter(
  ev => ev.ownerId === SLOT && ev.name === TALENT_ID,
);
expect(sfEvents.length).toBeGreaterThanOrEqual(1);
expect(eventDuration(sfEvents[0])).toBe(expectedDuration);
```

**Negative trigger tests** — verify the effect does NOT fire from wrong conditions:
```typescript
// Pattern: place a different skill/reaction that does NOT match the trigger condition
// Example: Electrification (not Combustion) does NOT trigger Scorching Fangs
placeReaction(result, REACTION_COLUMNS.ELECTRIFICATION, 1);
const sfAfter = result.current.allProcessedEvents.filter(
  ev => ev.ownerId === SLOT && ev.name === TALENT_ID,
);
expect(sfAfter).toHaveLength(0);
```

**Required test scenarios per trigger:**
1. **Each trigger source** — if talent triggers on PERFORM BATTLE or PERFORM ULTIMATE, test BOTH separately
2. **Each trigger condition type** — CONTROLLED vs THIS vs ANY operator, with correct determiner routing
3. **Negative: wrong skill type** — e.g. basic attack does NOT trigger a PERFORM BATTLE talent
4. **Negative: wrong operator** — if trigger requires THIS OPERATOR, another slot's skill must not fire it
5. **Negative: wrong reaction/status** — if trigger requires Combustion, other reactions must not fire it
6. **Trigger timing** — verify `startFrame` of triggered effect matches the source skill's hit frame
7. **Trigger source tracking** — verify `sourceOwnerId` and `sourceSkillName` on triggered events
8. **Multi-trigger stacking** — if triggering twice, verify stack count or duration refresh behavior
9. **P3/P5 conditional triggers** — test at potential N-1 (should not fire) and N (should fire)
10. **Weapon triggers** — verify no phantom presence event at frame 0, fires only on matched condition

### CONSUME (status/infliction/reaction removal)

CONSUME effects remove or clamp active events. Each CONSUME in the JSON config must be tested:

**Standard consumption test:**
```typescript
// Pattern: place prerequisite → place consuming skill → verify clamped
// 1. Verify target exists BEFORE consuming skill
const before = result.current.allProcessedEvents.filter(
  ev => ev.columnId === TARGET_COLUMN && ev.ownerId === TARGET_OWNER,
);
expect(before).toHaveLength(1);
const beforeDuration = eventDuration(before[0]);

// 2. Place consuming skill
act(() => { result.current.handleAddEvent(...); });

// 3. Verify target clamped/consumed AFTER
const after = result.current.allProcessedEvents.filter(
  ev => ev.columnId === TARGET_COLUMN && ev.ownerId === TARGET_OWNER,
);
expect(after).toHaveLength(1);
expect(after[0].eventStatus).toBe(EventStatusType.CONSUMED);
const afterDuration = eventDuration(after[0]);
expect(afterDuration).toBeLessThan(beforeDuration);
// Verify clamped to consuming skill's hit frame
const hitFrame = consumeStartFrame + Math.round(hitOffsetSeconds * FPS);
expect(after[0].startFrame + afterDuration).toBeLessThanOrEqual(hitFrame);

// 4. View layer: verify clamped in ColumnViewModel
const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
const vm = vms.get(TARGET_COLUMN_KEY);
const vmEvents = vm!.events.filter(ev => ev.columnId === TARGET_COLUMN);
expect(vmEvents).toHaveLength(1);
const vmDuration = eventDuration(vmEvents[0]);
expect(vmDuration).toBeLessThanOrEqual(afterDuration);
```

**Required test scenarios per CONSUME:**
1. **Target present** — consume clamps duration, marks `EventStatusType.CONSUMED`
2. **Target absent** — consuming skill still places, no crash, no spurious events
3. **Stacks consumption** — if `with.stacks` specified, verify exact N stacks removed (not all)
4. **MAX stacks** — if `with.stacks: "MAX"`, verify ALL stacks consumed
5. **Partial vs full** — consume 1 of 3 stacks: 2 remain active, consumed one clamped
6. **Duration clamped to hit frame** — `startFrame + consumedDuration ≤ hitFrame` (use frame offset from skill JSON)
7. **Multiple consumers** — second consume has nothing left, should not crash
8. **FROM qualifier** — verify `CONSUME X FROM ENEMY` only targets enemy events, not operator events
9. **Conditional consume** — if CONSUME is inside a conditional clause (HAVE STATUS), test both paths
10. **Chained effects** — if CONSUME triggers a subsequent APPLY (e.g. consume Corrosion → apply Susceptibility), verify BOTH the consume AND the apply

### APPLY (status/infliction/reaction creation)

APPLY effects create derived events. Each APPLY in the JSON config must be tested:

**Standard apply test:**
```typescript
// Pattern: place source skill → verify derived event created with correct properties
act(() => { result.current.handleAddEvent(...); });

const applied = result.current.allProcessedEvents.filter(
  ev => ev.columnId === STATUS_COLUMN && ev.ownerId === TARGET_OWNER && ev.startFrame > 0,
);
expect(applied).toHaveLength(1);
expect(applied[0].startFrame).toBe(expectedHitFrame);
expect(eventDuration(applied[0])).toBe(expectedDuration);
expect(applied[0].stacks).toBe(expectedStacks);
expect(applied[0].statusValue).toBe(expectedValue);
expect(applied[0].sourceOwnerId).toBe(SOURCE_SLOT);
expect(applied[0].sourceSkillName).toBeDefined();

// View layer: verify in correct column ViewModel
const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns);
const statusCol = findColumn(result.current, TARGET_OWNER, OPERATOR_STATUS_COLUMN_ID);
const statusVM = vms.get(statusCol!.key);
const vmApplied = statusVM!.events.filter(ev => ev.name === STATUS_ID);
expect(vmApplied).toHaveLength(1);
expect(statusVM!.microPositions.has(vmApplied[0].uid)).toBe(true);
```

**Required test scenarios per APPLY:**
1. **Basic creation** — derived event exists with correct columnId, ownerId, startFrame, duration
2. **Duration from config** — verify `segments[0].properties.duration` matches JSON `with.duration` (or default 2400)
3. **Stacks** — verify `event.stacks` matches JSON `with.stacks` (default 1)
4. **Status value** — verify `event.statusValue` matches JSON `with.value` (for AMP, WEAKEN, SUSCEPTIBILITY)
5. **Source tracking** — `sourceOwnerId` = placing operator, `sourceSkillName` = skill ID
6. **Target routing** — `to: "OPERATOR"` vs `to: "ENEMY"` vs `to: "TEAM"`: verify correct `ownerId`
7. **Determiner routing** — `toDeterminer: "THIS"` only applies to self, `"ALL"` applies to all operators, `"CONTROLLED"` applies to controlled operator
8. **TEAM vs ALL** — `to: "TEAM"` creates one event on COMMON_OWNER_ID; `to: "OPERATOR", toDeterminer: "ALL"` creates separate events per operator
9. **Stacking behavior** — placing skill twice: verify stack count increases, or duration refreshes (depending on status config)
10. **View layer micro-columns** — verify `microPositions` assigns the applied status in the status column VM
11. **Conditional apply** — if APPLY is inside a conditional clause, test both paths (condition met → apply exists, condition not met → apply absent)
12. **Multi-frame apply** — if a skill has multiple frames that each APPLY, verify correct count and timing of each
13. **Element-specific inflictions** — `APPLY INFLICTION` with `objectQualifier`: verify correct element column
14. **Enhanced/Empowered variants** — if enhanced skill has different APPLY effects, test both variants

### Cross-cutting scenarios

These span multiple verbs and must be tested as complete chains:

1. **Trigger → Apply chain** — talent trigger fires → status applied → verify full chain
2. **Apply → Consume chain** — apply status → later skill consumes it → verify both events
3. **Conditional Consume → Apply** — if enemy has X, consume X and apply Y: test with X present (both happen) and X absent (neither happens)
4. **Stack accumulation → Consume** — apply status 3 times → consume with stacks 2 → verify 1 remains
5. **Duration refresh** — apply same status twice → verify duration extends (REFRESHED status) not duplicate
6. **Absence verification** — for EVERY test, also verify events that should NOT exist (no spurious triggers, no phantom statuses)

## Rules

1. **Real game data only.** Import from `gameDataStore`. Never hardcode skill IDs, SP costs, frame counts, or status names.
2. **No string literals.** All IDs, columns, verbs, nouns, qualifiers, event statuses — everything must use enums (`NounType`, `VerbType`, `AdjectiveType`, `EventStatusType`, etc.) or exported constants (`SKILL_COLUMNS.BATTLE`, `REACTION_COLUMNS.COMBUSTION`). Load operator/skill IDs from JSON configs via `require()`.
3. **All mutations in `act()`.** Every `handleAddEvent`, `setInteractionMode`, etc.
4. **Use `FPS` for frame math.** `5 * FPS` = 5 seconds, `FPS` = 120.
5. **Context menu flow only.** Never construct payloads manually. Freeform events also go through context menu.
6. **Verify all three layers.** Context menu state, controller pipeline, AND view model via `computeTimelinePresentation`.
7. **Exhaustive event verification.** Checking existence is NOT enough. Every assertion must verify:
   - **Count** — exact `toHaveLength(N)`, including absence (`toHaveLength(0)`)
   - **Duration** — `segments.reduce((sum, s) => sum + s.properties.duration, 0)` vs config
   - **Stacks** — `event.stacks` exact count
   - **Status value** — `event.statusValue` (damage bonus, resistance ignore)
   - **Event status** — `EventStatusType.CONSUMED`, `REFRESHED`, etc.
   - **Timing** — `event.startFrame` at expected frame
   - **Source** — `event.sourceOwnerId`, `event.sourceSkillName`
   - **Absence** — explicitly verify events that should NOT exist
8. **Expected damage values are sacred.** Verified against in-game — fix code, not tests.
9. **Statuses placed through context menu.** Freeform mode → enemy column → context menu → add. Verify in controller AND view layers before testing conditional behavior.

## Planning Tests

1. Fetch wiki page from `endfield.wiki.gg/wiki/<Operator_Name>`
2. Read all JSON configs (skills, talents, potentials, statuses)
3. Catalog interactions: per talent (trigger from each source + negative), per skill (effects, physical status, cooldown), per potential (threshold at N-1 vs N), cross-operator chains
4. Cross-reference wiki vs JSON — flag discrepancies
5. Check existing tests, prioritize uncovered mechanics
6. Update `docs/notes/operators/<op>.md` with test coverage

## Reference Files

- `src/tests/integration/helpers.ts` — `findColumn`, `buildContextMenu`, `getMenuPayload`, `setUltimateEnergyToMax`
- `src/controller/timeline/contextMenuController.ts` — `buildColumnContextMenu`
- `src/controller/timeline/eventPresentationController.ts` — `computeTimelinePresentation`, `ColumnViewModel`
- `src/tests/integration/operators/wulfgard/skills.test.ts` — Comprehensive example
- `src/tests/integration/mechanics/finalStrikeMeltingFlame.test.ts` — Three-layer verification example
