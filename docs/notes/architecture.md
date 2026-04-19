# Architecture

## Data Flow

```
JSON Configs (skills, statuses, talents, weapon/gear effects)
  ↓ require.context auto-discovery
ConfigController / operatorJsonLoader
  ↓ typed configs + trigger associations
columnBuilder.buildColumns(slots, enemy, visibleSkills)
  ↓ Column[] (timeline structure)
useApp() — master hook
  ↓ raw events from user actions
inputEventController.createEvent() — validation + creation
  ↓ TimelineEvent[] (segments-first)
processEventQueue() [eventQueueController.ts]
  ├─ DerivedEventController — registers events, discovers time-stops
  ├─ Priority queue — chronological frame processing
  ├─ EventInterpretor — DSL verb dispatch → DEC domain methods
  └─ DEC.cacheFramePositions() + validateAll()
  ↓ processed TimelineEvent[]
Views (CombatPlanner, EventBlock, CombatSheet, EventPane)
  └─ render segments as-is
```

## Layers

| Layer | Files | Responsibility |
|-------|-------|---------------|
| **Config** | `configController.ts`, `operatorJsonLoader.ts`, `weaponGearEffectLoader.ts` | JSON deserialization, typed config access, trigger associations, validation |
| **Columns** | `columnBuilder.ts` | Build timeline structure from operator/enemy/visibility state |
| **Input** | `inputEventController.ts` | Event CRUD, overlap checks, animation/combo/enhance window validation |
| **Engine** | `eventQueueController.ts`, `eventInterpretor.ts`, `derivedEventController.ts` | Priority queue processing, DSL interpretation, world state management |
| **Calculation** | `damageTableBuilder.ts`, `calculationController.ts`, `eventsQueryService.ts` | Frame-by-frame damage evaluation, susceptibility/reaction queries |
| **View** | `CombatPlanner.tsx`, `EventBlock.tsx`, `EventPane.tsx`, `CombatSheet.tsx` | Render pre-computed segments, user interaction |

## Type Hierarchy

### Event → Segment → Frame

```
TimelineEvent
  ├─ id, name, ownerId, columnId, startFrame
  └─ segments: EventSegmentData[]          ← required
       ├─ metadata?: { segmentType?, dataSources? }
       ├─ properties: { duration, offset?, name?, timeDependency? }
       ├─ frames?: EventFrameMarker[]
       ├─ clause?: ClausePredicate[]
       └─ unknown?: Record<string, unknown>
```

- **Event**: One cast of a skill. Has a start frame and required segments array.
- **Segment**: A phase within an event. Has a duration, an optional segment type (ANIMATION, STASIS, COOLDOWN, IMMEDIATE_COOLDOWN), and zero or more frames. A segment's active-window/no-UE-gain semantics are authored as an `IGNORE ULTIMATE_ENERGY` clause effect — there is no `ACTIVE` segment type.
- **Frame**: A single damage tick within a segment. Has an offset from segment start, damage multiplier, and optional effects (inflictions, status applications, reactions, clause predicates).

### Segment Properties

| Field | Location | Purpose |
|-------|----------|---------|
| `duration` | `properties.duration` | Duration in frames |
| `offset` | `properties.offset` | Explicit offset from event start (defaults to end of previous segment) |
| `name` | `properties.name` | Display label ("1", "2", "Cooldown", "Corrosion II") |
| `timeDependency` | `properties.timeDependency` | GAME_TIME (affected by time-stop) or REAL_TIME (unaffected) |
| `segmentType` | `metadata.segmentType` | Phase type: ANIMATION, STASIS, COOLDOWN, IMMEDIATE_COOLDOWN (post-animation active windows are untyped) |
| `dataSources` | `metadata.dataSources` | Origin of this data (e.g. END_AXIS) |

Unknown/domain-specific fields (e.g. susceptibility, statusLabel) go in the `unknown` catch-all.

### Helpers

| Function | Purpose |
|----------|---------|
| `eventDuration(ev)` | Total duration from segments (`computeSegmentsSpan`) |
| `eventEndFrame(ev)` | `startFrame + eventDuration(ev)` |
| `setEventDuration(ev, duration)` | Mutate segment durations (single-seg: direct set, multi-seg: trim) |
| `durationSegment(duration)` | Create `[{ properties: { duration } }]` |
| `getAnimationDuration(ev)` | Duration of the ANIMATION segment, or 0 |

## Event Processing Pipeline

### processEventQueue() — Single Entry Point

```
Raw TimelineEvents[]
  ↓
DerivedEventController.registerEvents(raw)
  ├─ Combo chaining (truncate overlapping combo animations)
  ├─ Time-stop discovery (register stop regions)
  └─ Auto-build reaction segments for freeform reactions
  ↓
DerivedEventController.extendAll()
  └─ Extend game-time durations by foreign time-stops
  ↓
buildProcessFrameEntries() — single init loop over all event frames:
  └─ One PROCESS_FRAME entry per actionable frame marker
     Also: freeform events, originium crystals, cryo consumption
  ↓
PriorityQueue runs chronologically (frame, segmentTime, eventTime)
  └─ EventInterpretor.processQueueFrame(entry)
      └─ PROCESS_FRAME handler processes all effects inline (applies → consumes)
         Routes through DerivedEventController domain methods
  ↓
DerivedEventController.cacheFramePositions()
DerivedEventController.validateAll()
  ↓
Processed TimelineEvents[]
```

### DerivedEventController — World State Owner

Domain methods (all operate on individual events, no batch processing):
- `createInfliction()` — deque stacking (cap 4), cross-element reaction trigger
- `createReaction()` — corrosion merge (max stats, extend duration), non-corrosion refresh
- `createStatus()` — stacking behavior (RESET, MERGE), exchange cap, time-stop extension
- `consumeInfliction()` — absorb oldest N active
- `consumeReaction()` — clamp active reaction
- `consumeStatus()` — clamp active in column

### EventInterpretor — DSL Dispatch

Routes DSL verbs to DEC methods:
- `APPLY INFLICTION/STATUS/REACTION/PHYSICAL_STATUS/STAGGER`
- `APPLY STAT` — `with.value` (additive via `applyStatDelta`) or `with.multiplier` (multiplicative via `applyStatMultiplier`)
- `CONSUME INFLICTION/REACTION/STATUS`
- `IGNORE ULTIMATE_ENERGY` — detected on status clauses by `notifyResourceControllers` → marks slot as `ignoreExternalGain`
- `REFRESH` — reset active events in column
- `EXTEND` — extend duration (by frames or UNTIL END)
- `ALL/ANY` — compound predicates with condition evaluation

### Frame Dependency

Frames can declare `dependencyTypes`:
- **PREVIOUS_FRAME** — Cumulative DoT: frame's total = own damage + previous frame's resolved total. Each frame has independent crit roll. Only differs under SIMULATION crit mode.

## Config System

### ConfigController (facade over loaders)

```
configController.ts
  ├─ getOperatorConfig(id) → OperatorConfig
  │   ├─ skills: Record<string, SkillConfig>
  │   ├─ statusEvents: StatusEventConfig[]
  │   └─ skillTypeMap: Record<string, string>
  ├─ getTriggerAssociations(operatorId) → TriggerAssociation[]
  └─ getAllTriggerAssociations() → TriggerAssociation[]
```

### JSON Config Sources

| Config | Directory | Key |
|--------|-----------|-----|
| Operator base | `game-data/operators/*-operator.json` | Stats, potentials, metadata |
| Skills | `game-data/operator-skills/*-skills.json` | Frame timing, multipliers, segments, clause DSL |
| Statuses | `game-data/operator-statuses/*-statuses.json` | Status events with onTriggerClause |
| Talents | `game-data/operator-talent-statuses/*-talent-statuses.json` | Talent-derived status events |
| Weapon effects | `game-data/weapons/weapon-statuses/*-statuses.json` | Weapon passive effects |
| Gear effects | `game-data/gears/gear-effects/*.json` | Gear set bonuses |

### Metadata ID Types

Three distinct ID types link elements together:

| Field | Purpose |
|-------|---------|
| `originId` | Canonical link to a parent element based on the game's hierarchy. Immutable. |
| `associationId` | Links custom elements for context menu discovery. |
| `sourceId` | Identifies the source of the event on each chain-of-action layer at runtime. |

All related configs chain through `metadata.originId`:
- Status `originId` → skill ID (the skill that creates it)
- Skill `originId` → operator ID (the operator that owns the skill)

TriggerAssociations collect all `onTriggerClause` entries across operators, weapons, and gear effects for reactive effect firing.

## Column Structure

```
buildColumns(slots, enemy, visibleSkills) → Column[]
  ├─ Per-operator skill columns (basic, battle, combo, ultimate)
  │   └─ With segments from SkillDef.defaultSegments + JSON frame data
  ├─ Per-operator status columns (exchange statuses, operator buffs)
  ├─ Enemy status columns (inflictions, reactions, physical statuses)
  ├─ Team columns (Link, coordinated buffs)
  └─ Resource columns (SP, Ultimate energy, Stagger)
```

Each `MiniTimeline` column carries:
- `defaultEvent` with `segments` (template for new events)
- `eventVariants` for skills with enhanced/empowered versions
- `microColumns` for infliction sub-columns (by element)

## Invariants

1. **Segments required** — All TimelineEvents must have a `segments` array. No legacy `activationDuration`/`activeDuration`/`cooldownDuration` fields.
2. **No batch processing** — All event transformations happen through DerivedEventController + priority queue, never bulk iteration passes.
3. **Column IDs are enums** — Use `SKILL_COLUMNS.BASIC`, `REACTION_COLUMNS.COMBUSTION`, etc. Never string literals.
4. **Models are source of truth** — Domain logic (valid combinations, allowable values, visibility rules) lives in model/consts, never in views or controllers.
5. **Time-stop extension** — Game-time durations extended by foreign time-stops; ANIMATION and REAL_TIME segments are never extended.
6. **Combo chaining** — Overlapping combo animations truncated at the newer combo's start frame.
7. **Stacking semantics** — RESET clears column, MERGE subsumes older, deque evicts oldest at cap.
8. **Damage calc values immutable** — Expected values in operator damage calculation tests are verified against in-game results and must never be changed.
