---
name: refactor-config
description: Change the shape of game-data JSON configs (operator-skills, operator-statuses, weapon/gear effects). Reviews architecture invariants, updates deserializers, propagates changes through the engine pipeline, and verifies all tests pass.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Agent
argument-hint: <description of the config shape change>
---

# Refactor Config Workflow

Changing game-data JSON config shape for: $ARGUMENTS

## Step 1: Review Architecture & Invariants

Read these files first:

```
docs/notes/architecture.md          — type hierarchy, data flow, invariants
src/controller/timeline/engineSpec.md — engine processing rules
src/model/game-data/operatorDataSpec.md — JSON config schema
CLAUDE.md                            — project rules
```

List which invariants the proposed change touches and whether each is preserved, modified, or violated. Do NOT proceed if any invariant is violated without user approval.

Key invariants for config changes:
- **Models are source of truth** — all domain knowledge lives in model/consts
- **No magic strings** — column IDs use enums, status names use consts
- **Damage calc values immutable** — expected test values verified against in-game
- **Segments required** — EventSegmentData uses `{ metadata, properties, frames, clause, unknown }`
- **Never mock game-data configs in tests** — tests use real JSON via operatorJsonLoader

## Step 2: Identify Affected JSON Configs

List every JSON file whose shape is changing:

```bash
# Example: find all skills JSONs
ls src/model/game-data/operator-skills/*-skills.json
ls src/model/game-data/operator-statuses/*-statuses.json
ls src/model/game-data/weapons/weapon-statuses/*-statuses.json
ls src/model/game-data/gears/gear-effects/*.json
```

For each, show the OLD shape vs NEW shape (full raw JSON, never abbreviated).

## Step 3: Trace the Deserialization Chain

The JSON flows through these layers — identify which need changes:

### Config Loading (JSON → raw objects)
```
src/model/event-frames/operatorJsonLoader.ts    — loads operator/skill/status/talent JSONs
src/model/game-data/weaponGearEffectLoader.ts   — loads weapon/gear effect JSONs
src/model/game-data/statusConfigValidator.ts    — validates status configs at load time
```

### Config Typing (raw objects → typed configs)
```
src/controller/configController.ts              — OperatorConfig, SkillConfig, StatusEventConfig
src/model/event-frames/dataDrivenEventFrames.ts — JsonSegment, JsonFrame → SkillEventSequence
src/model/event-frames/skillEventFrame.ts       — FrameApplyStatus, FrameClausePredicate, etc.
```

### Column Building (typed configs → Column[])
```
src/controller/timeline/columnBuilder.ts        — reads skill configs → builds MiniTimeline columns
src/controller/operators/operatorRegistry.ts    — reads skill timings → builds SkillDef/Operator
```

### Engine Pipeline (events created from configs)
```
src/controller/timeline/eventQueueController.ts — buildProcessFrameEntries (single init loop)
src/controller/timeline/eventInterpretor.ts     — DSL verb dispatch, physical status logic
src/controller/timeline/derivedEventController.ts — createInfliction, createReaction, createStatus
src/controller/timeline/statusDerivationEngine.ts — status event evaluation, trigger matching
src/controller/timeline/effectExecutor.ts       — DSL effect execution
src/controller/timeline/conditionEvaluator.ts   — clause condition evaluation
```

### View Layer (displays config-derived data)
```
src/view/info-pane/EventPane.tsx                — frame/segment display
src/view/EventBlock.tsx                         — segment rendering
src/view/custom/UnifiedCustomizer.tsx           — custom operator/skill editing
```

For each file, note whether it needs changes and what specifically changes.

## Step 4: Update the Spec

Before writing implementation code, update these specs to reflect the target state:
- `src/model/game-data/operatorDataSpec.md` — if JSON schema changes
- `docs/notes/architecture.md` — if type hierarchy or invariants change

Get user approval on spec changes before proceeding.

## Step 5: Update JSON Configs

Modify the actual JSON files to the new shape. Show full raw JSON (never abbreviated).

## Step 6: Update Deserializers

Work top-down through the deserialization chain:

1. **Validators** (`statusConfigValidator.ts`) — update validation rules for new shape
2. **Loaders** (`operatorJsonLoader.ts`, `weaponGearEffectLoader.ts`) — update parsing
3. **Frame builders** (`dataDrivenEventFrames.ts`) — update JsonSegment/JsonFrame interfaces and parsing
4. **Config controller** (`configController.ts`) — update typed config construction
5. **Operator registry** (`operatorRegistry.ts`) — update SkillDef/Operator building

After each file, run `npx tsc --noEmit` to catch type errors early.

## Step 7: Update Engine Pipeline

Propagate changes through event processing:

1. **Column builder** — update column construction from new config shape
2. **Event queue controller** — update frame collection functions
3. **Event interpretor** — update DSL handlers if verb/object shapes changed
4. **Status derivation engine** — update trigger matching and status evaluation
5. **Effect executor** — update if effect shapes changed
6. **Condition evaluator** — update if condition shapes changed

## Step 8: Update Views

Update any view components that display config-derived data directly.

## Step 9: Verify

```bash
npx tsc --noEmit          # 0 errors
npx eslint src/           # 0 warnings
npx jest --no-cache       # all tests pass
```

Confirm:
- Damage calc test expected values are UNCHANGED
- No mock game-data configs in tests (tests use real JSON)
- All column IDs use enum values, not string literals
- Spec files match implemented state
