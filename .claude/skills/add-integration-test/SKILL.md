---
name: add-integration-test
description: Write integration tests that exercise the full pipeline through useApp — adding events via handleAddEvent (strict or freeform mode) and verifying results through allProcessedEvents and view controllers.
---

# Integration Test — Skill Guide

Integration tests exercise the **full user pipeline** through `useApp`. They simulate what a user does (adding events on the timeline) and verify what the user sees (processed events, resource graphs, column state).

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
import { SKILL_COLUMNS, OPERATOR_COLUMNS, INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_OWNER_ID, USER_ID } from '../../model/channels';
import { EventStatusType, InteractionModeType } from '../../consts/enums';
import { FPS } from '../../utils/timeline';
import type { MiniTimeline } from '../../consts/viewTypes';
```

## Core Pattern

```typescript
describe('Feature — integration through useApp', () => {
  it('description of behavior', () => {
    const { result } = renderHook(() => useApp());

    // 1. Find column to get defaultEvent template
    const col = findColumn(result.current, SLOT_ID, SKILL_COLUMNS.BATTLE);
    const defaultSkill = col!.defaultEvent!;

    // 2. Add event(s) via handleAddEvent
    act(() => {
      result.current.handleAddEvent(SLOT_ID, SKILL_COLUMNS.BATTLE, 5 * FPS, defaultSkill);
    });

    // 3. Verify via allProcessedEvents
    const events = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_ID && ev.columnId === SKILL_COLUMNS.BATTLE,
    );
    expect(events).toHaveLength(1);
  });
});
```

## Column Lookup Helper

Every test should use this helper to find columns and their defaultEvent templates:

```typescript
function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === 'mini-timeline' &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}
```

## Default Slot Assignments

The app starts with 4 operators in fixed slots:
- `slot-0` — Laevatain (Striker, Sword)
- `slot-1` — Akekuri (Vanguard, Sword) — *note: default operators may change; verify via columns*
- `slot-2` — Antal (Supporter, Arts Unit)
- `slot-3` — Wulfgard (Caster, Handcannon)

Always verify slot assignments by checking `result.current.columns` rather than hardcoding assumptions.

## Adding Events

### Strict Mode (default)
Use `handleAddEvent` with the column's `defaultEvent` template. The pipeline validates placement (overlap, SP, stack limits):

```typescript
act(() => {
  result.current.handleAddEvent(slotId, columnId, frameOffset, defaultSkill);
});
```

### Freeform Mode
Switch to freeform mode to bypass validation and place arbitrary events (e.g. enemy inflictions):

```typescript
act(() => {
  result.current.setInteractionMode(InteractionModeType.FREEFORM);
});

act(() => {
  result.current.handleAddEvent(
    ENEMY_OWNER_ID,
    INFLICTION_COLUMNS.HEAT,
    1 * FPS,
    {
      name: INFLICTION_COLUMNS.HEAT,
      segments: [{ properties: { duration: 20 * FPS } }],
      sourceOwnerId: USER_ID,
    },
  );
});
```

**Important:** Freeform events on the enemy use `sourceOwnerId: USER_ID` to mark them as user-created.

## handleAddEvent Signature

```typescript
handleAddEvent(
  ownerId: string,      // Slot ID ('slot-0') or ENEMY_OWNER_ID
  columnId: string,     // SKILL_COLUMNS.BATTLE, INFLICTION_COLUMNS.HEAT, etc.
  atFrame: number,      // Frame offset (use N * FPS for seconds)
  defaultSkill: {       // Event configuration (usually from column.defaultEvent)
    name?: string;
    segments?: EventSegmentData[];
    skillPointCost?: number;
    sourceOwnerId?: string;
    sourceSkillName?: string;
    // ... other fields
  }
)
```

## Verifying Results

### Processed Events
```typescript
const processed = result.current.allProcessedEvents;
const statusEvents = processed.filter(ev => ev.columnId === someColumnId && ev.ownerId === slotId);
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
- `susceptibility` — `Record<string, number>` of element susceptibilities
- `statusValue` — resolved damage bonus or resistance ignore value
- `skillPointCost` — SP cost

### SP Consumption
```typescript
const consumption = result.current.spConsumptionHistory.find(r => r.eventUid === ev.uid);
expect(consumption!.naturalConsumed + consumption!.returnedConsumed).toBe(expectedCost);
```

### SP Insufficiency Zones
```typescript
const zones = result.current.spInsufficiencyZones.get(`${slotId}:${SKILL_COLUMNS.BATTLE}`);
```

### Resource Graphs
```typescript
const graphs = result.current.resourceGraphs; // Map<string, { points, min, max, wasted? }>
```

## Event Placement Mode Scenarios

Tests should cover three categories of event placement to ensure the full pipeline handles all interaction modes correctly:

1. **Strict-mode only** — All events placed via `handleAddEvent` with `defaultEvent` templates in the default strict interaction mode. Tests validation rules (overlap, SP, stack limits) and derived event generation from validated placements.

2. **Freeform-mode only** — All events placed after switching to `InteractionModeType.FREEFORM`. Tests that user-created arbitrary events (e.g. manually placed enemy inflictions, statuses at arbitrary frames) are processed correctly through the pipeline without validation gates.

3. **Mixed strict + freeform** — Some events placed in strict mode (e.g. operator skills) and others in freeform mode (e.g. enemy inflictions, manual status placements). Tests that derived events, triggers, and interactions work correctly when strict-validated and freeform events coexist on the timeline. This is the most common real-world usage pattern.

Each test file should have scenarios covering **all three** categories. The same interactions should be verified with strict-only, freeform-only, and mixed placement to ensure consistent behavior regardless of how events were placed.

Additionally, include **freeform-exclusive** scenarios that test placements impossible in strict mode (e.g. overlapping events, events placed during SP insufficiency, manually placed enemy statuses with arbitrary timing). These verify that the pipeline handles edge cases that only freeform users can create.

## Rules

1. **Never mock game-data configs.** Integration tests use the real JSON data via `operatorJsonLoader`. Mock `require.context` if needed, but load actual JSON files.
2. **Column IDs must use enum values or exported constants.** Never write `'battle'`, `'heat'`, etc. as string literals. Use `SKILL_COLUMNS.BATTLE`, `INFLICTION_COLUMNS.HEAT`, `OPERATOR_COLUMNS.MELTING_FLAME`.
3. **Frame timing offsets are volatile.** Don't assert exact frame offsets from game data (they change with patches). Assert position (first/last frame, segment index) and effect type instead.
4. **Expected damage values are sacred.** Never change expected values in damage calc tests — they come from in-game verification.
5. **Wrap all state mutations in `act()`.** Every call to `handleAddEvent`, `setInteractionMode`, etc. must be inside `act(() => { ... })`.
6. **Use FPS for frame conversion.** `5 * FPS` = 5 seconds. `FPS` is 120.

## Reference Files

- `src/tests/integration/laevatainSkills.test.ts` — Full example: strict + freeform events, status derivation verification
- `src/tests/integration/spConsumption.test.ts` — SP cost tracking through pipeline
- `src/tests/integration/controlledOperator.test.ts` — Controlled operator switching
- `src/tests/combatTestingSpec.md` — Test philosophy and architectural rules
- `src/app/useApp.ts` — All exposed APIs
- `src/consts/viewTypes.ts` — `TimelineEvent`, `MiniTimeline`, `EventSegmentData` types
- `src/model/channels/index.ts` — All column ID constants
