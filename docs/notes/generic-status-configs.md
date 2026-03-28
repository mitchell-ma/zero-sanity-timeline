# Generic Status Configs for Built-in Reactions, Inflictions, and Physical Statuses

## Overview

Extracted all built-in combat mechanics (inflictions, arts reactions, physical statuses) into JSON configs at `src/model/game-data/generic/statuses/`. These were previously hardcoded across `src/model/combat-statuses/*.ts` and `src/model/channels/index.ts`. The configs are data-only — the engine still reads from the hardcoded constants and classes. An integration pass is needed to wire the engine to consume these configs instead.

## Files Created

```
src/model/game-data/generic/statuses/
  status-heat-infliction.json
  status-cryo-infliction.json
  status-nature-infliction.json
  status-electric-infliction.json
  status-vulnerable.json
  status-combustion.json
  status-solidification.json
  status-corrosion.json
  status-electrification.json
  status-shatter.json
  status-lift.json
  status-knock-down.json
  status-crush.json
  status-breach.json
  (status-link.json and status-susceptibility.json already existed)
```

## Enum Fix: SHATTER

`SHATTER` was moved from `PhysicalStatusType` to `ArtsReactionType` in `src/consts/enums.ts`. Shatter is an arts reaction (triggered by consuming Solidification), not a physical status. The `STATUS_DAMAGE_FACTOR` map and `getPhysicalStatusBaseMultiplier()` in `damageFormulas.ts` were updated accordingly.

## Schema: stacks.level (new field)

A `level` field was added to the `stacks` object to distinguish **status level** (power tier set at creation) from **stack count** (accumulating instances).

- **Stack count** (`stacks.limit`): How many independent instances can coexist. Inflictions accumulate 1→4. Reactions and physical statuses are always 1 (only one instance at a time).
- **Status level** (`stacks.level`): Max power tier, determined by consumed stacks at creation time. Indexes into VARY_BY tables for damage/duration. Only relevant when `interactionType` is MERGE or when the status has level-dependent scaling.

### Interaction types

| interactionType | Behavior | Used by |
|---|---|---|
| REFRESH | Keep existing stacks, reset their duration on new application | Inflictions, Vulnerable |
| RESET | Replace the existing instance entirely with the new one | Lift, Knock Down, Crush, Shatter |
| MERGE | 1 stack, level-based: inherit the better stats (max level, extend duration if longer) | Combustion, Solidification, Corrosion, Electrification, Breach |

### Status breakdown

| Status | Category | limit | level | interactionType | Duration |
|---|---|---|---|---|---|
| Heat/Cryo/Nature/Electric Infliction | INFLICTION | 4 | — | REFRESH | 20s |
| Vulnerable | PHYSICAL_INFLICTION | 4 | — | REFRESH | 20s |
| Combustion | REACTION | 1 | 4 | MERGE | 10s |
| Solidification | REACTION | 1 | 4 | MERGE | 6/7/8/9s by level |
| Corrosion | REACTION | 1 | 4 | MERGE | 15s |
| Electrification | REACTION | 1 | 4 | MERGE | 12/18/24/30s by level |
| Shatter | REACTION | 1 | 4 | RESET | 2s |
| Lift | PHYSICAL_STATUS | 1 | — | RESET | 1s |
| Knock Down | PHYSICAL_STATUS | 1 | — | RESET | 1s |
| Crush | PHYSICAL_STATUS | 1 | 4 | RESET | 1s |
| Breach | PHYSICAL_STATUS | 1 | 4 | MERGE | 12/18/24/30s by level |

## Integration TODO

The engine currently reads durations, stack limits, and interaction behavior from:
- `src/model/channels/index.ts` — `REACTION_DURATION`, `INFLICTION_DURATION`, `BREACH_DURATION`, `SHATTER_DURATION`, `PHYSICAL_INFLICTION_DURATION`, `MAX_INFLICTION_STACKS`
- `src/model/combat-statuses/*.ts` — `Combustion`, `Solidification`, `Corrosion`, `Electrification`, `Lift`, `Breach` classes with hardcoded duration/damage tables
- `src/controller/timeline/eventInterpretorController.ts` — hardcoded physical status logic (Lift/KnockDown consume 1 Vulnerable, Crush/Breach consume all)

To complete the migration:
1. Load generic status configs alongside operator/weapon/gear statuses in a generic status store
2. Wire `getStatusConfig()` in eventInterpretorController to resolve generic statuses
3. Replace hardcoded duration constants with config lookups
4. Replace hardcoded `MAX_INFLICTION_STACKS` with config-driven stack limits
5. The `stacks.level` field needs to be understood by the value resolver so `VARY_BY STATUS_LEVEL` can index into level-dependent tables
