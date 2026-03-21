---
name: refactor
description: Review architecture invariants and specs before implementing structural changes. Use when refactoring, restructuring, or making changes that cross layer boundaries.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Agent
argument-hint: <description of the refactor>
---

# Refactor Workflow

Before implementing any structural change described in $ARGUMENTS, follow this workflow.

## Step 1: Review Current Invariants

Read the architecture spec and engine spec:

```
docs/notes/architecture.md    — data flow, type hierarchy, layer responsibilities, invariants
src/controller/timeline/engineSpec.md — event engine architecture and processing rules
CLAUDE.md                     — project rules and naming conventions
```

List each invariant that the proposed change touches. For each one, state whether it will be:
- **Preserved** — the change respects this invariant as-is
- **Modified** — the invariant needs updating (explain the new rule)
- **Violated** — the change conflicts (stop and discuss with user)

Do NOT proceed if any invariant is violated without user approval.

## Step 2: Identify Affected Layers

Determine which layers the change crosses:

| Layer | Files |
|-------|-------|
| Config | `configController.ts`, `operatorJsonLoader.ts`, `weaponGearEffectLoader.ts` |
| Columns | `columnBuilder.ts` |
| Input | `inputEventController.ts` |
| Engine | `eventQueueController.ts`, `eventInterpretor.ts`, `derivedEventController.ts` |
| Calculation | `damageTableBuilder.ts`, `calculationController.ts`, `eventsQueryService.ts` |
| View | `CombatPlanner.tsx`, `EventBlock.tsx`, `EventPane.tsx`, `CombatSheet.tsx` |
| Types | `viewTypes.ts`, `enums.ts`, `semantics.ts` |

For each affected layer, list the specific files and functions that need changes.

## Step 3: Scope the Change

Run these to understand the blast radius:

```bash
# Count references to types/functions being changed
npx grep -rn "PATTERN" src/ --include="*.ts" --include="*.tsx" | wc -l

# Check test coverage
npx jest --listTests | grep -i RELEVANT_TEST
```

Present:
- Number of files affected
- Number of references to change
- Which tests cover the affected code
- Whether damage calc test expected values could be affected (if yes, STOP — those values are immutable)

## Step 4: Update Specs First

Before writing any implementation code, update the relevant spec files to reflect the target state:

1. If invariants change → update `docs/notes/architecture.md` Invariants section
2. If engine processing changes → update `src/controller/timeline/engineSpec.md`
3. If type shapes change → update `docs/notes/architecture.md` Type Hierarchy section
4. If CLAUDE.md rules need updating → update `CLAUDE.md`

Commit spec changes with the user's approval before proceeding to implementation.

## Step 5: Implement

Only after steps 1-4 are complete:

1. Change types first (compile errors guide the rest)
2. Fix errors layer by layer (types → engine → controllers → views)
3. After each layer, run:
   ```bash
   npx tsc --noEmit
   npx jest --no-cache
   npx eslint src/
   ```
4. Never change damage calc test expected values
5. Use enum values for column IDs, never string literals
6. Domain logic stays in model/consts, never in views or controllers

## Step 6: Verify

Final checks:
```bash
npx tsc --noEmit          # 0 errors
npx eslint src/           # 0 warnings
npx jest --no-cache       # all tests pass
```

Confirm the spec files match the implemented state.
