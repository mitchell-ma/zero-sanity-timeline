# EventColumn + Synthetic Clauses — Unified Pipeline Plan

## Context

The pipeline currently has two event paths: skill events go through DSL clause interpretation (step 3a), while freeform non-skill events go through a separate step 3b that manually calls `createInfliction`/`createReaction`/`createStatus`. The `classifyEvents` split exists to route events to the right path. This causes:
- Duplicated domain logic (stacking in both `registerEvents` and `create*` methods)
- A growing step 3b with per-column-type branches
- Freeform events behaving differently from strict events

The fix has two parts:
1. **Synthetic DSL clauses** on every non-skill `defaultEvent` so ALL events go through `interpret()` (step 3a). Step 3b is deleted.
2. **EventColumn objects** that encapsulate per-column stacking/consumption behavior, replacing the scattered `createInfliction`/`createReaction`/`createStatus` methods.

After this change, strict and freeform events are identical and take the same pipeline path.

## Unified pipeline flow

```
ALL raw events
  → cloneEvents() (no classify split)
  → registerEvents() (combo chaining, time-stop, CONTROL clamping — NO stacking)
  → collectFrameEntries() (all registered events)
  → priority queue
  → handleProcessFrame()
      → step 3a: filterClauses → interpret() → applyEvent()/consumeEvent()
      → (step 3b deleted)
  → reactive triggers fire
```

Every event — skill or freeform — has frame markers with DSL clauses. `interpret()` routes APPLY/CONSUME through `controller.applyEvent(columnId)` which delegates to `EventColumn.add()`.

---

## Part 1: Synthetic clauses on defaultEvents

### Shape

A synthetic frame marker with a single unconditional clause:

```typescript
frames: [{
  offsetFrame: 0,
  clauses: [{
    conditions: [],
    effects: [{
      type: 'dsl' as const,
      dslEffect: {
        verb: VerbType.APPLY,
        object: NounType.INFLICTION,
        objectQualifier: AdjectiveType.HEAT,
        to: NounType.ENEMY,
      }
    }]
  }]
}]
```

### Per-column synthetic effects

| Column category | DSL effect | Example |
|----------------|------------|---------|
| Arts infliction | `APPLY {element} INFLICTION to ENEMY` | `{ verb: APPLY, object: INFLICTION, objectQualifier: HEAT, to: ENEMY }` |
| Physical infliction | `APPLY PHYSICAL INFLICTION to ENEMY` | `{ verb: APPLY, object: INFLICTION, to: ENEMY }` |
| Arts reaction | `APPLY {reaction} REACTION to ENEMY` | `{ verb: APPLY, object: REACTION, objectQualifier: COMBUSTION, to: ENEMY }` |
| Physical status | `APPLY STATUS PHYSICAL {type} to ENEMY` | `{ verb: APPLY, object: STATUS, objectId: PHYSICAL, objectQualifier: LIFT, to: ENEMY }` |
| Enemy status | `APPLY STATUS {id} to ENEMY` | `{ verb: APPLY, object: STATUS, objectId: FOCUS, to: ENEMY }` |
| Team status | `APPLY STATUS {id} to TEAM` | `{ verb: APPLY, object: STATUS, objectId: LINK, to: TEAM }` |
| Operator status | `APPLY STATUS {id} to THIS OPERATOR` | `{ verb: APPLY, object: STATUS, objectId: MELTING_FLAME, toDeterminer: THIS, to: OPERATOR }` |

### Where to build them

In `columnBuilder.ts`, every `defaultEvent` assignment gets a `segments[0].frames` array with a single synthetic frame marker carrying the appropriate clause. Create a helper:

```typescript
function syntheticFrame(effect: Effect): EventFrameMarker {
  return {
    offsetFrame: 0,
    clauses: [{ conditions: [], effects: [{ type: 'dsl', dslEffect: effect }] }],
  };
}
```

### What this enables

- `collectFrameEntries` sees `hasFrames = true` for ALL events → no synthetic frame synthesis needed (remove that block)
- `handleProcessFrame` step 3a processes clauses → `interpret()` → `doApply` → `applyEvent(columnId)`
- Step 3b is deleted entirely
- `classifyEvents` becomes `cloneEvents` (simple clone, no split)

---

## Part 2: EventColumn architecture

### Interface

```typescript
// src/controller/timeline/columns/eventColumn.ts

interface EventColumn {
  readonly columnId: string;
  add(ownerId: string, frame: number, durationFrames: number,
      source: EventSource, options?: AddOptions): boolean;
  consume(ownerId: string, frame: number, source: EventSource,
          options?: ConsumeOptions): number;
  canAdd(ownerId: string, frame: number): boolean;
  canConsume(ownerId: string, frame: number): boolean;
}
```

### ColumnHost (implemented by DerivedEventController)

Columns are **stateless** — they hold config but no event storage. All state goes through the host:

```typescript
interface ColumnHost {
  activeEventsIn(columnId: string, ownerId: string, frame: number): TimelineEvent[];
  activeCount(columnId: string, ownerId: string, frame: number): number;
  extendDuration(startFrame: number, rawDuration: number): number;
  trackRawDuration(uid: string, rawDuration: number): void;
  pushEvent(columnId: string, ownerId: string, event: TimelineEvent): void;
  pushToOutput(event: TimelineEvent): void;
  applyToColumn(columnId: string, ...): void;   // cross-column delegation
  consumeFromColumn(columnId: string, ...): number;
}
```

### Implementations

| Class | Columns | Key behavior |
|-------|---------|-------------|
| `InflictionColumn` | heat/cryo/nature/electric/vulnerable | Deque cap 4, FIFO eviction, cross-element → `host.applyToColumn(reactionCol)`, co-active duration extension, arts burst flag |
| `ReactionColumn` | combustion/solidification/corrosion/electrification/shatter | Corrosion merge (max stats, duration, reduction floor); others refresh |
| `PhysicalStatusColumn` | lift/knock_down/crush/breach | RESET limit 1 |
| `ConfigDrivenStatusColumn` | everything else | Stacking mode + limit from JSON config via `getStatusStackingMode`/`getStatusStackLimit` |

### ColumnRegistry

Lazy-creates columns on first access using existing column ID sets (`INFLICTION_COLUMN_IDS`, `REACTION_COLUMN_IDS`, `PHYSICAL_STATUS_COLUMN_IDS`). Unknown IDs fall through to `ConfigDrivenStatusColumn`.

### DerivedEventController changes

- Implements `ColumnHost`
- Adds `ColumnRegistry` field, initialized in `reset()`
- New public API: `applyEvent(columnId, ownerId, frame, dur, source, opts)` and `consumeEvent(columnId, ownerId, frame, source, opts)`
- Old `createInfliction`/`createReaction`/`createStatus` become deprecated thin wrappers → then deleted
- `registerEvents` stacking block (lines 204-234) deleted — stacking now handled by `interpret()` → `applyEvent()` → column `add()`
- `addEvent()` refactored into `ColumnHost.pushEvent()` (extend + track + push to stacks/output + register stop)

### EventInterpretorController changes

- `doApply` calls `controller.applyEvent(columnId, ...)` for all object types
- `doConsume` calls `controller.consumeEvent(columnId, ...)` for all object types
- `canDo` delegates to `registry.get(columnId).canAdd()`/`.canConsume()`
- Step 3b deleted
- `reactiveTriggersForEffect` unchanged (still fires after every `interpret()` call)

---

## Files to create

| File | Contents |
|------|----------|
| `src/controller/timeline/columns/eventColumn.ts` | `EventColumn`, `ColumnHost`, `AddOptions`, `ConsumeOptions` interfaces |
| `src/controller/timeline/columns/inflictionColumn.ts` | `InflictionColumn` — extracted from `createInfliction` |
| `src/controller/timeline/columns/reactionColumn.ts` | `ReactionColumn` — extracted from `createReaction` |
| `src/controller/timeline/columns/physicalStatusColumn.ts` | `PhysicalStatusColumn` — RESET limit 1 |
| `src/controller/timeline/columns/configDrivenStatusColumn.ts` | `ConfigDrivenStatusColumn` — from JSON config |
| `src/controller/timeline/columns/columnRegistry.ts` | `ColumnRegistry` — lazy factory |

## Files to modify

| File | Changes |
|------|---------|
| `columnBuilder.ts` | Add synthetic DSL clauses to all non-skill `defaultEvent` frame markers via `syntheticFrame()` helper |
| `derivedEventController.ts` | Implement `ColumnHost`. Add `ColumnRegistry`. Replace `create*/consume*` bodies with column delegation. Remove `registerEvents` stacking block. Refactor `addEvent` → `pushEvent`. |
| `eventInterpretorController.ts` | `doApply`/`doConsume`/`canDo` use `applyEvent`/`consumeEvent`. Delete step 3b. |
| `eventQueueController.ts` | Remove `derivedEvents` param. `classifyEvents` → `cloneEvents`. Remove synthetic frame synthesis in `collectFrameEntries`. |
| `inputEventController.ts` | `classifyEvents` → `cloneEvents` returning flat `TimelineEvent[]` |

---

## Migration phases

1. **Add column infrastructure** — new files + `ColumnHost` on DEC + registry. Zero behavior change. All tests pass.
2. **Route create*/consume* through columns** — extract method bodies into column implementations. Old methods become thin wrappers. All tests pass.
3. **Synthetic clauses on defaultEvents** — `columnBuilder` adds frames with DSL clauses to all non-skill defaultEvents. Remove synthetic frame synthesis from `collectFrameEntries`. All tests pass (events now have real frame markers).
4. **Unified applyEvent/consumeEvent** — interpreter uses new API. Step 3b deleted. `classifyEvents` → `cloneEvents`. `registerEvents` stacking block deleted. All tests pass.
5. **Remove deprecated wrappers** — delete `createInfliction`/`createReaction`/`createStatus`/`consumeInfliction`/etc.

## Verification

- `npx jest --no-coverage` after each phase — no regressions
- `npx tsc --noEmit` on changed files — no type errors
- `npx eslint` on changed files — no warnings
- Manual: place freeform MF, inflictions, reactions, combustion, corrosion, Focus, Link in the app — identical behavior to before
