---
name: add-integration-test
description: Write integration tests that exercise the full pipeline through useApp — simulating user actions (context menu, drag, edit), verifying controller intermediary state, and asserting view-layer column/event structure.
---

# Integration Test — Skill Guide

Integration tests exercise the **full user pipeline** through `useApp`. They simulate what a user does (right-clicking columns to open context menus, selecting menu items to add events, dragging events) and verify three layers:
1. **Context menu** — the menu items the user sees (enabled/disabled, labels, reasons)
2. **Controller** — intermediary pipeline state (processed events, resource graphs, SP tracking, stagger breaks)
3. **View** — column structure, event presentation data, and derived column state that drives rendering

## Test Organization & Running

### Directory structure

```
src/tests/integration/
  helpers.ts                          # Shared helpers (findColumn, buildContextMenu, getMenuPayload)
  mechanics/                          # Cross-operator mechanic tests (SP, stagger, time-stop, etc.)
    spConsumption.test.ts
    vulnerableStacking.test.ts
    liftDurationExtension.test.ts
    ...
  operators/                          # Per-operator test suites
    chen-qianyu/
      slashingEdge.test.ts            # Talent: Slashing Edge from BS
      slashingEdgeAllSkills.test.ts   # Talent: Slashing Edge from combo/ult/mixed
      comboSkillTrigger.test.ts       # Combo trigger conditions + cooldown
      ultimateBladeGale.test.ts       # Ultimate mechanics
      basicAttackVariants.test.ts     # BA variant availability
      potentialEffects.test.ts        # P3/P4/P5 modifiers
      lift.test.ts                    # Vulnerable → Lift
      freeformInflictionTalent.test.ts# Negative: freeform doesn't trigger talent
    laevatain/
      ...
  freeform/                           # Freeform-mode specific tests
    ...
```

- **`mechanics/`** — Tests for cross-operator mechanics (SP consumption, stagger breaks, time-stop, status stacking). These test engine behavior that applies to all operators.
- **`operators/<op>/`** — Tests specific to an operator's kit (talents, skills, potentials, interactions). One file per logical feature, not one mega-file.
- **`freeform/`** — Tests for freeform-mode specific behavior.

### Running tests

```bash
# Run all integration tests
npx jest src/tests/integration/

# Run all tests for a specific operator
npx jest src/tests/integration/operators/chen-qianyu/

# Run a single test file
npx jest src/tests/integration/operators/chen-qianyu/slashingEdge.test.ts

# Run tests matching a describe/it name
npx jest --testPathPattern="chen-qianyu" -t "combo window"
```

After writing tests, always run them to verify they pass before finishing. Fix any failures — if a test fails because the engine doesn't support a mechanic yet, mark the test with `it.skip` and add a comment explaining what's missing.

### File naming convention

Test files are named after the **feature being tested**, not the test type:
- `slashingEdge.test.ts` — not `talentTest.test.ts`
- `comboSkillTrigger.test.ts` — not `comboTest.test.ts`
- `potentialEffects.test.ts` — not `p3p4p5.test.ts`

## File Setup

**Location:** `src/tests/integration/<feature>.test.ts`

**Required header** (enables DOM for React rendering):
```typescript
/**
 * @jest-environment jsdom
 */
```

**Imports:**
```typescript
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../app/useApp';
import { buildColumnContextMenu, ColumnContextMenuContext } from '../../controller/timeline/contextMenuController';
import { SKILL_COLUMNS, OPERATOR_COLUMNS, INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID, USER_ID } from '../../model/channels';
import { ColumnType, EventStatusType, InteractionModeType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
import type { MiniTimeline, ContextMenuItem } from '../../consts/viewTypes';
```

## Core Pattern — Context Menu Driven

Tests must simulate the user's actual interaction flow: right-click on a column to build the context menu, verify the menu items, then execute the add action from the menu payload.

```typescript
describe('Feature — integration through useApp', () => {
  it('description of behavior', () => {
    const { result } = renderHook(() => useApp());

    // 1. Find column (what the user sees)
    const col = findColumn(result.current, SLOT_ID, SKILL_COLUMNS.BATTLE);
    expect(col).toBeDefined();

    // 2. Build context menu (simulates right-click on column)
    const menuItems = buildContextMenu(result.current, col!, 5 * FPS);
    expect(menuItems).not.toBeNull();

    // 3. Verify menu item is enabled (user CAN add this skill)
    const addItem = menuItems!.find(i => i.actionId === 'addEvent');
    expect(addItem).toBeDefined();
    expect(addItem!.disabled).toBeFalsy();

    // 4. Execute the menu action (user clicks "Add")
    const payload = addItem!.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: unknown };
    act(() => {
      result.current.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // 5. Verify controller state (processed events, resources, etc.)
    const events = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_ID && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(events).toHaveLength(1);

    // 6. Verify view layer (column structure reflects the new event)
    const colAfter = findColumn(result.current, SLOT_ID, SKILL_COLUMNS.BATTLE);
    // ... assert column state, micro-columns, derived columns, etc.
  });
});
```

## Helpers

### Column Lookup
```typescript
function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}
```

### Context Menu Builder

Wraps `buildColumnContextMenu` with the context from `useApp` state — simulates the user right-clicking at a specific frame on a column:

```typescript
function buildContextMenu(
  app: ReturnType<typeof useApp>,
  col: MiniTimeline,
  atFrame: number,
  relativeClickX?: number,
): ContextMenuItem[] | null {
  const ctx: ColumnContextMenuContext = {
    events: app.allProcessedEvents,
    slots: app.slots,
    resourceGraphs: app.resourceGraphs,
    alwaysAvailableComboSlots: new Set(), // populated from slot wirings if needed
    timeStopRegions: [], // populated from processed events if testing time-stop
    staggerBreaks: app.staggerBreaks,
    columnPositions: new Map(), // not needed for non-BY_COLUMN_ID columns
    interactionMode: app.interactionMode,
  };
  return buildColumnContextMenu(col, atFrame, relativeClickX, ctx);
}
```

### Menu Action Executor

Finds an `addEvent` menu item and executes it through `handleAddEvent`:

```typescript
function executeAddFromMenu(
  app: ReturnType<typeof useApp>,
  menuItems: ContextMenuItem[],
  variantLabel?: string,
) {
  const item = variantLabel
    ? menuItems.find(i => i.actionId === 'addEvent' && i.label === variantLabel)
    : menuItems.find(i => i.actionId === 'addEvent');
  expect(item).toBeDefined();
  expect(item!.disabled).toBeFalsy();
  const payload = item!.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: unknown };
  app.handleAddEvent(payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill);
}
```

## Default Slot Assignments

The app starts with 4 operators in fixed slots:
- `slot-0` — Laevatain (Striker, Sword)
- `slot-1` — Akekuri (Vanguard, Sword) — *note: default operators may change; verify via columns*
- `slot-2` — Antal (Supporter, Arts Unit)
- `slot-3` — Wulfgard (Caster, Handcannon)

Always verify slot assignments by checking `result.current.columns` rather than hardcoding assumptions.

## Adding Events via Context Menu

### Strict Mode (default)

Simulate right-click → verify menu → execute action:

```typescript
// Build menu for the column at the desired frame
const menu = buildContextMenu(result.current, col!, 5 * FPS);
expect(menu).not.toBeNull();

// Execute the add action
act(() => {
  executeAddFromMenu(result.current, menu!);
});
```

### Verifying Disabled Menu Items

When an action should be blocked (overlap, insufficient SP, etc.), verify the menu item is disabled with the correct reason:

```typescript
const menu = buildContextMenu(result.current, col!, 5 * FPS);
const addItem = menu!.find(i => i.actionId === 'addEvent');
expect(addItem!.disabled).toBe(true);
expect(addItem!.disabledReason).toMatch(/Overlaps|Insufficient|blocked/i);
```

### Variant Columns

For columns with multiple skill variants (e.g. basic attack variants), the menu contains multiple `addEvent` items:

```typescript
const menu = buildContextMenu(result.current, col!, 5 * FPS);
const variants = menu!.filter(i => i.actionId === 'addEvent');
expect(variants).toHaveLength(2);

// Add the specific variant by label
act(() => {
  executeAddFromMenu(result.current, menu!, 'Enhanced Basic Skill');
});
```

### Freeform Mode

Switch to freeform mode, then use the same context menu flow:

```typescript
act(() => {
  result.current.setInteractionMode(InteractionModeType.FREEFORM);
});

// In freeform, derived columns become addable
const derivedCol = findColumn(result.current, ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT);
const menu = buildContextMenu(result.current, derivedCol!, 1 * FPS);
expect(menu).not.toBeNull();

act(() => {
  executeAddFromMenu(result.current, menu!);
});
```

**Important:** Freeform events on the enemy use `sourceOwnerId: USER_ID` to mark them as user-created.

## Verifying Results — Three Layers

### Layer 1: Context Menu State

Verify what the user would see in the right-click menu at any point during the test:

```typescript
// After adding an event, verify the same spot now shows overlap
const menuAfter = buildContextMenu(result.current, col!, 5 * FPS);
const addItemAfter = menuAfter!.find(i => i.actionId === 'addEvent');
expect(addItemAfter!.disabled).toBe(true);
expect(addItemAfter!.disabledReason).toBeDefined();
```

### Layer 2: Controller / Pipeline State

Verify intermediary values computed by the controller pipeline:

```typescript
// Processed events
const processed = result.current.allProcessedEvents;
const statusEvents = processed.filter(ev => ev.columnId === someColumnId && ev.ownerId === slotId);
expect(statusEvents).toHaveLength(1);
expect(statusEvents[0].eventStatus).toBe(EventStatusType.CONSUMED);

// SP consumption history
const consumption = result.current.spConsumptionHistory.find(r => r.eventUid === ev.uid);
expect(consumption!.naturalConsumed + consumption!.returnedConsumed).toBe(expectedCost);

// SP insufficiency zones
const zones = result.current.spInsufficiencyZones.get(`${slotId}:${SKILL_COLUMNS.BATTLE}`);
expect(zones).toHaveLength(0); // no insufficiency

// Resource graphs
const graphs = result.current.resourceGraphs;
const spGraph = graphs.get(`${slotId}:sp`);
expect(spGraph).toBeDefined();

// Stagger breaks
const breaks = result.current.staggerBreaks;
```

**Key fields on TimelineEvent:**
- `uid` — unique ID
- `id`, `name` — skill/status ID (e.g. `CombatSkillType.SMOULDERING_FIRE`)
- `ownerId` — slot ID or ENEMY_OWNER_ID
- `columnId` — column ID (use enum constants, never string literals)
- `startFrame` — placement frame
- `segments` — segment array with `properties.duration`, `frames`, `unknown` (susceptibility, healValue, etc.)
- `eventStatus` — `EventStatusType.CONSUMED`, `REFRESHED`, etc.
- `sourceOwnerId`, `sourceSkillName` — what triggered this derived event
- `comboTriggerColumnId` — which infliction/status column triggered a combo
- `susceptibility` — `Record<string, number>` of element susceptibilities
- `statusValue` — resolved damage bonus or resistance ignore value
- `skillPointCost` — SP cost

### Layer 3: View Layer — Column Structure

Verify the column definitions that drive rendering. These are the props that view components receive:

```typescript
// Column exists and has expected structure
const col = findColumn(result.current, slotId, expectedColumnId);
expect(col).toBeDefined();
expect(col!.label).toBe(expectedLabel);
expect(col!.derived).toBe(true); // or false

// Derived columns appear after adding triggering events
const derivedCol = findColumn(result.current, ENEMY_OWNER_ID, INFLICTION_COLUMNS.HEAT);
expect(derivedCol).toBeDefined();
expect(derivedCol!.derived).toBe(true);

// Micro-column structure
expect(col!.microColumns).toHaveLength(2);
expect(col!.microColumnAssignment).toBe(MicroColumnAssignment.BY_ORDER);

// Event variants and their availability
expect(col!.eventVariants).toBeDefined();
const variant = col!.eventVariants!.find(v => v.id === expectedVariantId);
expect(variant).toBeDefined();
expect(variant!.disabled).toBeFalsy();

// Column defaultEvent template
expect(col!.defaultEvent).toBeDefined();
expect(col!.defaultEvent!.name).toBe(expectedSkillId);

// noAdd / maxEvents constraints
expect(col!.noAdd).toBeFalsy();
expect(col!.maxEvents).toBe(3);
```

**Key fields on MiniTimeline (column):**
- `key` — unique column key
- `ownerId` — slot ID or ENEMY_OWNER_ID
- `columnId` — logical column ID (use enum constants)
- `label` — display name
- `derived` — whether column is computed (read-only in strict mode)
- `noAdd` — whether "Add" is suppressed
- `maxEvents` — stack limit
- `microColumns` — sub-column definitions
- `microColumnAssignment` — `DYNAMIC_SPLIT`, `BY_COLUMN_ID`, or `BY_ORDER`
- `eventVariants` — selectable variants with disable state
- `defaultEvent` — skill template for event creation
- `requiresMonotonicOrder` — ordering constraint

### Verifying Events Render in Columns (ColumnViewModel)

`computeTimelinePresentation` is the function that maps processed events into columns and computes micro-column positions — it produces the exact data that `EventBlock` components render from. Use it to verify events actually appear in the correct columns:

```typescript
import { computeTimelinePresentation } from '../../controller/timeline/eventPresentationController';

// Build the view model (same computation the view layer uses)
const viewModels = computeTimelinePresentation(
  result.current.allProcessedEvents,
  result.current.columns,
);

// Find the view model for a specific column
const statusCol = findColumn(result.current, slotId, 'operator-status');
const statusViewModel = viewModels.get(statusCol!.key);
expect(statusViewModel).toBeDefined();

// Verify events appear in the column (these are what EventBlock renders)
const vmEvents = statusViewModel!.events.filter(ev => ev.columnId === expectedColumnId);
expect(vmEvents).toHaveLength(expectedCount);

// Verify micro-column positions are assigned (drives EventBlock horizontal placement)
for (const ev of vmEvents) {
  expect(statusViewModel!.microPositions.has(ev.uid)).toBe(true);
}

// Verify status view overrides (stack labels like "I", "II", "III", "IV")
const override = statusViewModel!.statusOverrides.get(ev.uid);
expect(override?.label).toContain('III');
```

**Key fields on ColumnViewModel:**
- `events` — the events that render as EventBlocks in this column (filtered, sorted, truncated)
- `microPositions` — `Map<eventUid, MicroPosition>` — fractional x-position within the column for each event
- `statusOverrides` — `Map<eventUid, StatusViewOverride>` — stack labels (roman numerals), visual truncation durations
- `overlapLanes` — `Map<eventUid, OverlapLane>` — lane assignments for non-micro columns with overlapping events

**Import:**
```typescript
import { computeTimelinePresentation } from '../../controller/timeline/eventPresentationController';
import type { ColumnViewModel } from '../../controller/timeline/eventPresentationController';
```

### Verifying Column Visibility Changes

Some columns only appear after certain events are placed. Operator skill columns appear when operators are assigned; operator status micro-columns appear when talents/potentials produce statuses.

**Important:** Enemy inflictions, reactions, physical statuses, stagger, and debuffs are NOT separate columns. They are all micro-columns within one unified column: `ENEMY_GROUP_COLUMNS.ENEMY_STATUS`. You cannot `findColumn` by `INFLICTION_COLUMNS.HEAT` or `REACTION_COLUMNS.COMBUSTION` on the enemy — use the unified column and filter events by `columnId`:

```typescript
import { ENEMY_GROUP_COLUMNS } from '../../model/channels';

// Find the unified enemy status column
const enemyStatusCol = app.columns.find(
  (c): c is MiniTimeline =>
    c.type === ColumnType.MINI_TIMELINE &&
    c.ownerId === ENEMY_OWNER_ID &&
    c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
);
expect(enemyStatusCol).toBeDefined();

// Verify specific reaction/infliction events within the unified VM
const viewModels = computeTimelinePresentation(
  result.current.allProcessedEvents,
  result.current.columns,
);
const enemyVM = viewModels.get(enemyStatusCol!.key);
const consumedCombustion = enemyVM!.events.filter(
  ev => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.eventStatus === EventStatusType.CONSUMED,
);
```

## Event Placement Mode Scenarios

Tests should cover three categories of event placement to ensure the full pipeline handles all interaction modes correctly:

1. **Strict-mode only** — All events placed via context menu in the default strict interaction mode. Tests validation rules (overlap, SP, stack limits) and derived event generation from validated placements. Verify context menu disabled states for blocked actions.

2. **Freeform-mode only** — All events placed after switching to `InteractionModeType.FREEFORM`. Tests that user-created arbitrary events are processed correctly. Verify that derived columns become addable in freeform mode.

3. **Mixed strict + freeform** — Some events placed in strict mode (e.g. operator skills) and others in freeform mode (e.g. enemy inflictions). Verify that derived events, triggers, and interactions work correctly when strict-validated and freeform events coexist.

Additionally, include **freeform-exclusive** scenarios that test placements impossible in strict mode (e.g. overlapping events, events placed during SP insufficiency). These verify that the pipeline handles edge cases that only freeform users can create.

## Using Real Game Data from gameDataStore

Integration tests must use real game data from `gameDataStore` for assertions — never hardcode expected skill IDs, frame counts, SP costs, or status names. Import accessor functions and verify against the actual data:

```typescript
import {
  getOperatorSkills, getSkillTimings, getBattleSkillSpCost,
  getSkillTypeMap, getOperatorStatuses, getComboTriggerInfo,
  getAllSkillLabels, getUltimateEnergyCost, getFrameSequences,
  getEnabledStatusEvents, getTeamStatusIds,
} from '../../controller/gameDataStore';
```

### Verifying Skill Identity

Use `getSkillTypeMap` to resolve which skill ID maps to which combat skill type, rather than hardcoding:

```typescript
const skillMap = getSkillTypeMap('LAEVATAIN');
// skillMap = { BATTLE_SKILL: 'SMOULDERING_FIRE', ULTIMATE: 'FLAMING_CINDERS', ... }

const events = result.current.allProcessedEvents.filter(
  ev => ev.name === skillMap.BATTLE_SKILL && ev.ownerId === SLOT_LAEVATAIN,
);
expect(events).toHaveLength(1);
```

### Verifying Timing & Cost Data

Use `getSkillTimings`, `getBattleSkillSpCost`, `getUltimateEnergyCost` to assert against real values:

```typescript
const spCost = getBattleSkillSpCost('ANTAL');
expect(spCost).toBeDefined();

const consumption = result.current.spConsumptionHistory.find(r => r.eventUid === ev.uid);
expect(consumption!.naturalConsumed + consumption!.returnedConsumed).toBe(spCost!);
```

### Verifying Status Derivation

Use `getOperatorStatuses` and `getEnabledStatusEvents` to know what statuses an operator should produce:

```typescript
const statuses = getEnabledStatusEvents('LAEVATAIN');
const mfStatus = statuses.find(s => s.id === expectedStatusId);
expect(mfStatus).toBeDefined();

// Then verify the processed event matches
const statusEvent = result.current.allProcessedEvents.find(
  ev => ev.columnId === expectedColumnId && ev.sourceOwnerId === SLOT_LAEVATAIN,
);
expect(statusEvent).toBeDefined();
```

### Verifying Combo Triggers

Use `getComboTriggerInfo` to verify combo activation windows. Trigger conditions and window duration are read from the `activationWindow` embedded Event structure in the combo skill JSON. `maxSkills` controls how many combo skills can be placed within one window (default 1, e.g. Rossi = 2 for chaining):

```typescript
const comboInfo = getComboTriggerInfo('ROSSI');
expect(comboInfo).toBeDefined();
expect(comboInfo!.maxSkills).toBe(2);        // chaining: 2 combos per window
expect(comboInfo!.windowFrames).toBe(720);   // 6s window
expect(comboInfo!.skillId).toBe('MOMENT_OF_BLAZING_SHADOW');
```

### Verifying Frame Sequences

Use `getFrameSequences` to verify segment structure without hardcoding frame counts:

```typescript
const sequences = getFrameSequences('LAEVATAIN', 'SMOULDERING_FIRE');
expect(sequences.length).toBeGreaterThan(0);

// Verify processed event segments match the expected sequence count
const ev = result.current.allProcessedEvents.find(/* ... */);
expect(ev!.segments).toHaveLength(sequences[0].ticks.length);
```

## ContextMenuItem Structure

```typescript
interface ContextMenuItem {
  label?: string;           // Text shown in menu
  actionId?: string;        // 'addEvent', 'editResource', 'addSegment', 'addFrame'
  actionPayload?: unknown;  // Payload for the action (event creation params)
  disabled?: boolean;       // Whether menu item is clickable
  disabledReason?: string;  // Why it's disabled (shown below label)
  separator?: boolean;      // Visual separator line
  header?: boolean;         // Section header (non-clickable)
  checked?: boolean;        // Toggle indicator
  keepOpen?: boolean;       // If true, clicking doesn't close menu
}
```

## Gotchas

### Freeform vs strict mode test different things
- **Freeform** bypasses resource gates (SP, energy, combo windows) AND overlap/cooldown validation. Use it when you need to place events that strict mode would block (e.g. combo without a trigger, ult without energy).
- **Strict** enforces all validation. Use it to test that validation works (cooldown overlap blocks placement, SP insufficiency disables menu items).
- **Mixed**: place events in freeform, then switch to strict to verify validation against them. E.g. place a combo in freeform, switch to strict, verify a second combo during cooldown is disabled.

### Status columns use matchColumnIds
Status columns collect events from multiple source columns via `matchColumnIds`. Use this pattern to find them:
```typescript
function findMatchingColumn(app: AppResult, ownerId: string, matchId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === ownerId &&
      (c.columnId === matchId || (c.matchColumnIds?.includes(matchId) ?? false)),
  );
}
```

### Event timing matters for duration-based assertions
If a status has 10s duration and you place events 20s apart, earlier stacks expire before the check frame. When testing stack counts or labels at a specific frame, place events close enough that all stacks are still active at the check time.

### Stack labels show total active count
Status view override labels show the total active stack count on every event (e.g. "Slashing Edge III" means 3 active stacks). They are NOT per-event ordinals. All 5 active events at max stacks show "V". To verify stack progression (I → II → III → ...), check labels at intermediate frames as stacks are added.

### Template status events vs triggered instances
Talent and potential statuses (e.g. Scorching Fangs, Code of Restraint) appear as **template events** at `startFrame: 0` with a stable UID. These are status definitions, not triggered instances. When a trigger fires, additional events appear with `startFrame > 0`. To distinguish:
- **Triggered only:** `ev.startFrame > 0`
- **All including template:** no startFrame filter
- Template `ownerId` is always the defining operator's slot. Triggered instances on teammates have `ownerId` = the teammate's slot.

### Physical status (Lift, Knock Down) requires pre-existing Vulnerable
Lift and Knock Down check for **existing** Vulnerable stacks *before* applying a new one. The first APPLY LIFT on a clean enemy only adds Vulnerable — the Lift event is NOT created. A second APPLY LIFT (when Vulnerable already exists) creates the actual Lift status. This is correct game behavior.

**When testing Lift/Knock Down**, always place Vulnerable on the enemy first:
```typescript
// WRONG — Lift won't fire, only Vulnerable is added
const payload = getMenuPayload(result.current, bsCol!, 2 * FPS);
act(() => { result.current.handleAddEvent(...); });
// liftEvents.length === 0  ❌

// RIGHT — place Vulnerable first, then BS triggers Lift
placeVulnerableOnEnemy(result, 0);  // freeform Vulnerable on enemy
const payload = getMenuPayload(result.current, bsCol!, 2 * FPS);
act(() => { result.current.handleAddEvent(...); });
// liftEvents.length >= 1  ✅
```

The engine logic (`applyLiftOrKnockDown` in `eventInterpretorController.ts`):
1. Check `activeCount(VULNERABLE) > 0` at frame
2. Always apply 1 Vulnerable stack
3. Only create Lift/Knock Down if step 1 was true (or `isForced`)

This means rotation order matters: first skill applies Vulnerable, second skill gets the Lift.

### Basic attack categories (BATK, DIVE, FINISHER)
These are three **independent** BA categories, not variants of each other. Each has its own skill JSON and can independently have `_ENHANCED`/`_EMPOWERED` variants. All three appear in `eventVariants` on the `BASIC_ATTACK` column when skill data exists. BATK is the `defaultEvent`; DIVE and FINISHER are additional entries:
```typescript
const basicCol = findColumn(result.current, slotId, NounType.BASIC_ATTACK);
const dive = basicCol!.eventVariants!.find(v => v.id === BasicAttackType.DIVE);
const finisher = basicCol!.eventVariants!.find(v => v.id === BasicAttackType.FINISHER);
```

### Operator status column for talents
Talent/potential status events appear in `OPERATOR_STATUS_COLUMN_ID`. To verify in the view layer:
```typescript
import { OPERATOR_STATUS_COLUMN_ID } from '../../model/channels';

const statusCol = findColumn(result.current, slotId, OPERATOR_STATUS_COLUMN_ID);
const statusVM = viewModels.get(statusCol!.key);
const talentEvents = statusVM!.events.filter(ev => ev.name === TALENT_ID);
for (const ev of talentEvents) {
  expect(statusVM!.microPositions.has(ev.uid)).toBe(true);
}
```
For cross-operator statuses (e.g. SF Minor on teammates), the controller-level check (`allProcessedEvents` filtered by `ownerId !== SLOT_SELF`) is authoritative. Teammate status columns may not have micro-columns registered for statuses applied by other operators.

### Changing operator loadout properties (potential, skill level)
Use `handleStatsChange` with a `LoadoutProperties` object to change potential, skill levels, etc:
```typescript
import { DEFAULT_LOADOUT_PROPERTIES, type LoadoutProperties } from '../../view/InformationPane';

const stats: LoadoutProperties = {
  ...DEFAULT_LOADOUT_PROPERTIES,
  operator: { ...DEFAULT_LOADOUT_PROPERTIES.operator, potential: 3 },
};
act(() => { result.current.handleStatsChange(SLOT_ID, stats); });
```
Default for 5-star operators: P5, all skill levels 12. For 6-star: P0.

## Rules

1. **Use real game data — never mock or hardcode.** Import from `gameDataStore` (`getSkillTypeMap`, `getBattleSkillSpCost`, `getSkillTimings`, `getFrameSequences`, `getOperatorStatuses`, etc.) to get expected values. Never hardcode skill IDs, SP costs, frame counts, or status names. Since both the pipeline and the test derive from the same game data, asserting exact values from `gameDataStore` is correct — they stay in sync when configs change.
2. **Column IDs must use enum values or exported constants.** Never write `'battle'`, `'heat'`, etc. as string literals. Use `SKILL_COLUMNS.BATTLE`, `INFLICTION_COLUMNS.HEAT`, `OPERATOR_COLUMNS.MELTING_FLAME`.
3. **Wrap all state mutations in `act()`.** Every call to `handleAddEvent`, `setInteractionMode`, etc. must be inside `act(() => { ... })`.
4. **Use FPS for frame conversion.** `5 * FPS` = 5 seconds. `FPS` is 120.
5. **Always add events through context menu flow.** Use `buildColumnContextMenu` → verify menu items → extract `actionPayload` → call `handleAddEvent`. Never call `handleAddEvent` directly with manually constructed payloads — freeform events also go through the context menu (switch mode first, then right-click the derived column).
6. **Verify all three layers.** Every test must verify: (a) context menu state (enabled/disabled items), (b) controller pipeline state (processed events, resources, **event durations**), and (c) view-layer column structure via `computeTimelinePresentation` (events visible in correct columns, micro-column positions, status overrides). For status effects, always verify duration in frames (e.g. `segments.reduce((sum, s) => sum + s.properties.duration, 0)`) and confirm they appear in the view model.
7. **Expected damage values are sacred.** Integration tests may include damage calculation assertions. These expected values are verified against in-game results — if a code change causes them to fail, fix the code, not the test.
8. **Absolutely no string literals.** All IDs, column names, status names, skill names, etc. must come from enums, exported constants, or `gameDataStore`. For operator/skill/status IDs that don't have an enum, load them from the JSON config: `require('../model/game-data/operators/laevatain-operator.json').properties.id`. Never write `'LAEVATAIN'`, `'SMOULDERING_FIRE'`, `'STEEL_OATH'`, etc. as bare strings.

## Planning Operator Integration Tests

Before writing integration tests for an operator, **plan test scenarios** by thoroughly reviewing the operator's full kit from the wiki and game data configs. This ensures complete coverage of all interactions.

### Process

1. **Fetch the operator's wiki page** from `endfield.wiki.gg/wiki/<Operator_Name>`. Read the full descriptions for every skill, talent, and potential — not just the numbers, but the mechanical descriptions (trigger conditions, state transitions, conditional effects).

2. **Read all game-data JSON configs** for the operator:
   - `operators/<op>/skills/*.json` — all skill variants (basic attack, enhanced/dive/finisher variants, battle skill, combo skill, ultimate)
   - `operators/<op>/talents/*.json` — trigger clauses, conditions, effects
   - `operators/<op>/potentials/*.json` — stat bonuses, conditional effects, cooldown/cost modifiers, self-creating statuses
   - `operators/<op>/statuses/*.json` — status effects, stacking behavior, duration, stat applications

3. **Catalog every testable interaction**, organized by source (which skill/talent/potential produces it):
   - **Per talent:** Each trigger clause is a separate scenario. Test that the trigger fires from every listed source (e.g. if a talent triggers on PERFORM BATTLE_SKILL / COMBO_SKILL / ULTIMATE, test all three). Test that unrelated events do NOT trigger it (verb filtering, subject isolation).
   - **Per skill:** Test core effects (damage, SP cost/recovery, energy cost/recovery, stagger), physical status application (Lift, Vulnerable, Breach), time-stop segments, cooldown durations, and variant availability (enhanced/dive/finisher).
   - **Per potential:** Test conditional activations (HP thresholds, state requirements), VARY_BY POTENTIAL multipliers as full ValueExpressions (base × potential modifier, not just the modifier), cost/cooldown modifiers with their threshold conditions (e.g. HAVE POTENTIAL AT_LEAST 5).
   - **Cross-operator:** Test interactions where one operator's effects feed into another's triggers (e.g. Lift extension from gravity field, combo triggers from teammate stagger).

4. **Cross-reference wiki descriptions against JSON configs.** The wiki is the source of truth for *what should happen*; the JSON is the source of truth for *how it's configured*. Flag any discrepancies (e.g. wiki says "first and final hit deal stagger" but JSON has stagger on all frames).

5. **Check existing tests** (`src/tests/integration/operators/<op>/`) to identify what's already covered. Only plan new scenarios for uncovered interactions.

6. **Prioritize:** Core kit mechanics and talent triggers first, potential modifiers second, cross-operator interactions third.

7. **Update operator notes** after writing tests. Each operator has a notes file at `docs/notes/operators/<op>.md` documenting skill coverage, statuses, potentials, and talents. After implementing tests:
   - Mark tested mechanics (e.g. add `✓ TESTED` next to covered items)
   - Add a `## Test Coverage` section listing which test files cover which mechanics
   - Add `## TODOs` for mechanics that couldn't be tested yet (e.g. engine doesn't support INTERRUPT triggers, HP threshold conditions not modeled) so future work is tracked
   - Note any discrepancies found between wiki descriptions and JSON configs

## Reference Files

- `src/controller/timeline/contextMenuController.ts` — `buildColumnContextMenu`, `ColumnContextMenuContext`
- `src/controller/timeline/eventPresentationController.ts` — `computeTimelinePresentation`, `ColumnViewModel`, `EventPresentation`
- `src/app/useApp.ts` — All exposed APIs
- `src/consts/viewTypes.ts` — `TimelineEvent`, `MiniTimeline`, `ContextMenuItem`, `EventSegmentData` types
- `src/model/channels/index.ts` — All column ID constants (including `ENEMY_GROUP_COLUMNS`, `OPERATOR_STATUS_COLUMN_ID`)
- `src/tests/combatTestingSpec.md` — Test philosophy and architectural rules
- `src/tests/integration/mechanics/finalStrikeMeltingFlame.test.ts` — Full example: context menu flow, three-layer verification, ColumnViewModel assertion
- `src/tests/integration/operators/wulfgard/skills.test.ts` — Comprehensive example: empowered variants, reaction consumption with HAVE REACTION conditions, talent triggers, potential interactions, unified enemy status column view verification
