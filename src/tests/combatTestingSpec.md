# Combat Simulation Testing Specification

## Test Organization

- **Unit tests** (`src/tests/unit/`): Test individual controllers, functions, and operator data in isolation with mocks. Verify frame data, segment structure, DSL verb handling, damage formulas, etc.
- **Integration tests** (`src/tests/integration/`): Test the full user flow through `useApp` — add events via `handleAddEvent`, verify results via `allProcessedEvents` and view controllers. These use `@jest-environment jsdom` and `renderHook` to exercise the real pipeline end-to-end.

## Goals

Validate that the controller layer correctly models operator interactions, status derivation, and chain effects. Unit tests operate on controller logic only — no UI, no visual assertions. Integration tests verify the full pipeline from user action to processed output. The data-driven operator JSONs define **what** effects occur and **where** in the event-segment-frame hierarchy they occur; tests verify that the engine processes these correctly.

Frame timing offsets (e.g. 0.73s, 2.067s) are intentionally NOT asserted — they are volatile and may change with game patches. Tests assert **position** (first frame, last frame, segment N) and **effect type** (apply status, forced reaction, infliction, absorption).

## Damage Test Rules

**NEVER change expected damage values in damage calculation tests.** Expected values are observed from the actual game and are the source of truth. If a test fails because our calculated value doesn't match the expected value, the bug is in our code (formulas, stat aggregation, data parsing, rounding) — not in the expected value. Investigate and fix the calculation pipeline instead.

## Scope

- Status derivation engine (`statusDerivationEngine.ts`)
- Melting flame controller (`meltingFlameController.ts`)
- Arts reaction controller (`artsReactionController.ts`)
- Status query service (`statusQueryService.ts`)
- Event frame data (`dataDrivenEventFrames.ts`)
- Column builder derived columns (`columnBuilder.ts`)
- Skill point timeline / SP return (`skillPointTimeline.ts`)

## Test Structure

Tests simulate a timeline by constructing `TimelineEvent[]` arrays and passing them through the derivation engine, then asserting on the output. No DOM, no React, no view layer.

## Key Architectural Principles

### APPLY STATUS is a frame-level effect

Status application (`APPLY STATUS`) is always a **frame-level effect** — it occurs on a specific frame within a segment within an event. It is NOT an event-level trigger. The only mechanism tied to event-level is SP (cost on cast, return on end).

### CONSUME STATUS is a frame-level effect

Stack consumption (`CONSUME STATUS`) is a **frame-level effect**. When the empowered battle skill's additional attack fires, it consumes all Melting Flame stacks via a `consumeStatus` marker on the frame data, processed by `consumeOperatorStatuses`. Similarly, Endministrator's battle skill and ultimate consume Originium Crystals via frame-level `CONSUME STATUS` effects.

### `toObjectType` supports operator IDs

The `toObjectType` field in frame effects supports:
- `THIS_OPERATOR` — the caster
- `ENEMY` — the enemy
- `ALL_OPERATORS` — all team members
- **Any operator ID** (e.g. `LAEVATAIN`, `ANTAL`) — resolved to the slot ID at runtime via `operatorSlotMap` in the derivation engine

This is necessary because some statuses target a specific operator regardless of who triggers the effect. For example, any operator's Final Strike can grant Melting Flame to Laevatain via the Scorching Heart talent — the `toObjectType` must be `LAEVATAIN` so the engine knows to route the status to Laevatain's slot even when a different operator's frame is the source.

**Implementation status**: ✅ `resolveEntityId()` accepts `operatorSlotMap`, `FrameApplyStatus.targetOperatorId` stores the raw operator ID, DSL parser populates it for non-standard targets.

## Exploration Strategy

When testing an operator, follow this process:

1. **Read the skill descriptions** from the operator JSON and wiki. Every sentence in a skill description implies a testable interaction.
2. **Map each description sentence to a frame-level effect**. If the description says "grants 1 stack of Melting Flame," there must be an `APPLY STATUS MELTING_FLAME` on a specific frame. If it says "consumes all stacks," there must be a `CONSUME STATUS`.
3. **Verify the operator config JSON matches the description**. Flag discrepancies — the config may be wrong.
4. **Identify implicit interactions** not stated in descriptions but implied by the mechanic (e.g. stack cap overflow, threshold re-triggering after consumption, cross-operator triggers).
5. **Test edge cases**: zero stacks, max stacks, overflow, rapid re-application, consumption without stacks, etc.
6. **Validate resource interactions**: SP cost, SP return, cooldowns, ultimate energy, and how potentials modify them.

---

## Laevatain

### Skill Description → Interaction Mapping

Source: `laevatain.json` descriptions and endfield.wiki.gg.

| Description | Expected Interaction | Status |
|-------------|---------------------|--------|
| "Hitting the enemy grants 1 stack of Melting Flame" (Battle Skill) | BATTLE_SKILL frame 1: `APPLY STATUS MELTING_FLAME to LAEVATAIN` | ✅ Implemented + tested (A1) |
| "max 4 stacks" (Melting Flame) | Stack cap enforced in derivation engine | ✅ Implemented + tested (A3-A5) |
| "consume all stacks and perform 1 additional attack" (Empowered Battle Skill) | EMPOWERED_BATTLE_SKILL last frame: `CONSUME STATUS MELTING_FLAME` | ✅ Implemented + tested (B2.1-B2.5) |
| "additional attack deals Heat DMG and forcibly trigger temporary Combustion" | EMPOWERED_BATTLE_SKILL last frame: `APPLY FORCED COMBUSTION` | ✅ Tested (C1) |
| "Battle skill effects are enhanced while ultimate is active" | ENHANCED_BATTLE_SKILL variant exists | ✅ Tested (E2) |
| "COMBO TRIGGER: When an enemy suffers Combustion or Corrosion" (Seethe) | Trigger clause: ENEMY IS COMBUSTED or ENEMY IS CORRODED | ✅ Tested (D1) |
| "Laevatain gains 1 stack of Melting Flame" (Seethe on hit) | COMBO_SKILL frame: `APPLY STATUS MELTING_FLAME to LAEVATAIN` | ✅ Implemented + tested (A1b) |
| "further gains Ultimate Energy per enemy hit" (Seethe) | Conditional gauge gain by enemy count | ✅ Present in JSON effects |
| "BATK sequence 3 also applies Heat Infliction" (Enhanced basic during ult) | EMPOWERED_BASIC_ATTACK segment 3: `APPLY INFLICTION HEAT` | ✅ Tested (E4) |
| "Final Strikes absorb nearby Heat Inflictions → Melting Flame" (Scorching Heart T1) | TALENT type in `operator-talents/laevatain-talents.json`: PERFORM_ALL { ABSORB HEAT, APPLY MELTING_FLAME } | ✅ Implemented + tested (I1-I10) |
| "At 4 stacks, ignores enemy Heat Resistance" (Scorching Heart T1) | Threshold clause: 4 MF → SCORCHING_HEART_EFFECT on operator (self-buff) | ✅ Implemented + tested (B1-B6) |
| "Below 40% HP, gains Protection and restores HP" (Re-Ignition T2) | Not modeled — HP-based triggers out of scope for timeline sim | N/A |
| P1: "+20 SP to both skill types" | SP Return (ADDITIVE) on SMOULDERING_FIRE + ENHANCED variant | ✅ Tested (F1) |
| P1: "damage multiplier ×1.2" | UNIQUE_MULTIPLIER on SMOULDERING_FIRE + ENHANCED variant | ✅ Tested (F2) |
| P3: "Combustion DMG ×1.5" | REACTION_MULTIPLIER in talentEffects | ✅ Tested (F3) |
| P3: "Smouldering Fire duration ×1.5, extra scaling ×1.5" | MULTIPLICATIVE on DURATION, UNIQUE_MULTIPLIER on EXTRA_SCALING | ✅ Present in JSON |
| P4: "Twilight cost ×0.85" | SKILL_COST modifier | ✅ Tested (F4) |
| P5: "Proof of Existence buff + ×1.2 damage on enhanced basic" | BUFF_ATTACHMENT + UNIQUE_MULTIPLIER | ✅ Tested (F5, F6) |

### Melting Flame Sources

All three sources feed the **same 4-stack pool**:

| Source | Location | Effect | Status |
|--------|----------|--------|--------|
| Battle skill | Frame 1 | `APPLY STATUS MELTING_FLAME to LAEVATAIN` | ✅ JSON + trigger clause + tested |
| Combo skill (Seethe) | Last frame | `APPLY STATUS MELTING_FLAME to LAEVATAIN` | ✅ JSON + trigger clause + frame data tested |
| Any operator's Final Strike | Last segment, last frame (Scorching Heart talent) | `ABSORB HEAT INFLICTION from ENEMY` → `APPLY STATUS MELTING_FLAME to LAEVATAIN` | ⬜ Not yet implemented |

### Known Gaps

1. **Scorching Heart absorption not in frame data**: The Final Strike absorption mechanic (`ABSORB HEAT INFLICTION` → `APPLY STATUS MELTING_FLAME to LAEVATAIN`) only exists in the End-Axis raw parser mapping (`magma_4`), not in the DSL override frames. Needs frame-level implementation for each operator's basic attack Final Strike when Laevatain is on the team. Engine supports operator ID resolution (`operatorSlotMap`), but cross-operator frame scanning is not yet wired.
2. **Frame-effect-driven derivation**: The engine currently derives statuses via `triggerClause` (event-level). The correct long-term architecture is frame-effect-driven: scan `APPLY STATUS`, `CONSUME STATUS`, and `ABSORB INFLICTION` from event frames directly. Currently the engine uses trigger clauses + consume clauses as a pragmatic bridge.
3. **Combo skill MF via derivation engine end-to-end**: Frame data and trigger clause are in place, but no test places a combo event in the timeline and verifies MF derivation through the engine (only frame-data-level test exists).

### Engine Bugs Fixed

1. **Max stack cap** — `deriveStatusEvents()` now counts active events at each trigger frame and skips if at `stack.max`.
2. **HAVE predicate cardinality** — `checkPredicate()` and `findTriggerMatches()` now enforce `cardinalityConstraint` (EXACTLY, GREATER_THAN_EQUAL) on HAVE STATUS predicates instead of boolean "exists?" check.
3. **Dedup broadened** — Dedup check uses columnId only (ignoring ownerEntityId) and excludes CONSUMED events, preventing double-derivation while allowing post-consumption re-accumulation.
4. **Threshold target resolution** — `evaluateThresholdClauses()` resolves target owner from the target status def's own `target` field (e.g. SCORCHING_HEART_EFFECT → THIS_OPERATOR) instead of the clause's `toObjectType`.
5. **Consumption** — All status consumption uses frame-level `consumeStatus` markers processed by `consumeOperatorStatuses`. No engine-level consume logic.

### JSON Data Changes Applied

1. Battle skill MF: `toObjectType` changed from `THIS_OPERATOR` to `LAEVATAIN`
2. Combo skill MF: Added `APPLY STATUS MELTING_FLAME to LAEVATAIN` on combo skill frame (via override)
3. Combo skill trigger: Added second `triggerClause` for `COMBO_SKILL` on MELTING_FLAME status
4. SCORCHING_HEART → extracted to `operator-talents/laevatain-talents.json` as type TALENT. Owns absorption exchange (FINAL_STRIKE + HEAT INFLICTION → PERFORM_ALL { ABSORB, APPLY MF }).
5. SCORCHING_HEART_EFFECT: Renamed from SCORCHING_HEART in skills JSON. Target changed from ENEMY to THIS_OPERATOR (self-buff). Applied via MELTING_FLAME's threshold clause.
5. EMPOWERED_BATTLE_SKILL: Added `CONSUME STATUS MELTING_FLAME` on last frame
6. MELTING_FLAME: Consumption via empowered battle skill's frame-level `consumeStatus` marker
7. ORIGINIUM_CRYSTAL: Consumption via frame-level `CONSUME STATUS` on battle skill and ultimate frames

---

### A. Melting Flame Stacking ✅

| # | Test | Status |
|---|------|--------|
| A1 | Battle skill frame 1: `APPLY STATUS MELTING_FLAME to LAEVATAIN` (targetOperatorId) | ✅ |
| A1b | Combo skill frame: `APPLY STATUS MELTING_FLAME to LAEVATAIN` (targetOperatorId) | ✅ |
| A2 | Single battle skill → 1 MF event | ✅ |
| A3 | 4 battle skills → exactly 4 MF events | ✅ |
| A4 | 5th battle skill at max → consumes all 4 (empowered), no new MF | ✅ |
| A5 | Never more than 4 active MF at any frame (20 battle skills) | ✅ |
| A6 | MF indefinite duration (108000 frames) | ✅ |

### B. Scorching Heart Threshold ✅

| # | Test | Status |
|---|------|--------|
| B1 | 3 MF stacks → no Scorching Heart | ✅ |
| B2 | 4 MF stacks → exactly 1 SH on enemy | ✅ |
| B3 | 10 battle skills → SH triggers once per accumulation cycle (2 cycles) | ✅ |
| B4 | SH duration: 20s (2400 frames) | ✅ |
| B5 | 4 battle skills only → exactly 1 SH, no re-trigger without consumption | ✅ |
| B6 | Heat Res Ignore stats: [10, 15, 20] by talent level | ✅ |

### B2. Melting Flame Consumption ✅

| # | Test | Status |
|---|------|--------|
| B2.1 | EMPOWERED_BATTLE_SKILL last frame: CONSUME STATUS MELTING_FLAME | ✅ |
| B2.2 | Battle skill at max stacks clamps all 4 MF durations | ✅ |
| B2.3 | Post-consumption: new battle skills create fresh MF events | ✅ |
| B2.4 | Consume-reaccumulate cycle → second SH (RESET clamps first) | ✅ |
| B2.5 | Multiple cycles: 3 cycles → 3 Scorching Hearts | ✅ |

### C. Empowered Battle Skill & Combustion ✅

| # | Test | Status |
|---|------|--------|
| C1 | Empowered BS last frame: APPLY FORCED COMBUSTION (statusLevel 1) | ✅ |
| C2 | Normal BS: no forced Combustion on any frame | ✅ |
| C3 | Raw BS frame has MELTING_FLAME infliction (End-Axis data) | ✅ |
| C4 | Combustion duration: 5s (from multiplier data) | ✅ |

### D. Combo Skill (Seethe) Triggers ✅

| # | Test | Status |
|---|------|--------|
| D1 | Trigger clause (activationWindow.onTriggerClause): ENEMY IS COMBUSTED or ENEMY IS CORRODED | ✅ |
| D2 | Activation window duration: 6s (from activationWindow.segments), maxSkills: 1 | ✅ |
| D5 | Stagger recovery: 10 on first frame | ✅ |

### E. Ultimate & Enhanced Variants ✅

| # | Test | Status |
|---|------|--------|
| E1 | EMPOWERED_BASIC_ATTACK: 4 segments | ✅ |
| E2 | ENHANCED_BATTLE_SKILL exists with correct ID | ✅ |
| E3 | ENHANCED_EMPOWERED_BATTLE_SKILL exists | ✅ |
| E4 | Enhanced basic segment 3: APPLY INFLICTION HEAT | ✅ |
| E5 | Normal basic: no Heat infliction | ✅ |
| E6 | Ultimate active duration: 15s | ✅ |
| E7 | Ultimate energy cost: 300 | ✅ |

### F. Potentials ✅

| # | Test | Status |
|---|------|--------|
| F1 | P1: +20 SP Return (ADDITIVE) on both Smouldering Fire variants | ✅ |
| F2 | P1: ×1.2 UNIQUE_MULTIPLIER on Smouldering Fire + Enhanced | ✅ |
| F3 | P3: ×1.5 Combustion REACTION_MULTIPLIER | ✅ |
| F4 | P4: ×0.85 Twilight energy cost | ✅ |
| F5 | P5: BUFF_ATTACHMENT Proof of Existence | ✅ |
| F6 | P5: ×1.2 UNIQUE_MULTIPLIER on Flaming Cinders Enhanced | ✅ |

### G. Chain Interactions ✅

| # | Test | Status |
|---|------|--------|
| G1 | 4× BS → 4 MF → SH on enemy (source tracked) | ✅ |
| G2 | SH starts at same frame as 4th MF crossing | ✅ |
| G3 | Threshold clause structure verified | ✅ |
| G4 | Empowered BS → Combustion → Seethe trigger chain | ✅ |
| G5 | Cross-operator Corrosion satisfies Seethe | ✅ |
| G6 | SH RESET interaction verified | ✅ |
| G7 | MF max 4 across all potentials | ✅ |
| G8 | MF NONE interaction type | ✅ |
| G9 | SH target is ENEMY | ✅ |

### H. Scorching Heart — Absorption (Part 1) ⬜

Any operator's Final Strike absorbs Heat Infliction from enemy → converts to MF on Laevatain. Blocked on cross-operator frame scanning.

| # | Test | Status |
|---|------|--------|
| H1 | Laevatain Final Strike with Heat Infliction → MF | ⬜ |
| H2 | Teammate Final Strike with Heat Infliction → MF on Laevatain | ⬜ |
| H3 | Final Strike without Heat Infliction → no MF | ⬜ |
| H4 | Absorption gated by talent level | ⬜ |
| H5 | Absorption 1:1 exchange | ⬜ |

### I. Skill Costs, Cooldowns & Resources ⬜

| # | Test | Status |
|---|------|--------|
| I1 | Battle skill SP cost: 100 | ⬜ |
| I2 | Combo skill cooldown: 10s (1200 frames) | ⬜ |
| I3 | Combo skill no SP cost | ⬜ |
| I4 | Ultimate energy cost: 300 | ⬜ |
| I5 | Ultimate active duration: 15s | ⬜ |
| I6 | Ultimate cooldown: 10s | ⬜ |
| I7 | Enhanced BS duration: 1.1s | ⬜ |
| I8 | Empowered BS duration: 3.9s | ⬜ |
| I9 | P1 SP Return net cost: 100 - 20 = 80 | ⬜ |
| I10 | P4 ultimate cost: 300 × 0.85 = 255 | ⬜ |
| I11 | Cooldown prevents Seethe overlap | ⬜ |

### J. Chain Interactions ⬜

| # | Test | Status |
|---|------|--------|
| J1 | Full MF → SH → Heat Res Ignore queryable | ⬜ |
| J2 | Empowered BS → Combustion → Seethe trigger | ⬜ |
| J3 | Consume-reaccumulate full cycle with SH refresh | ⬜ |
| J4 | Mixed MF sources (BS + Seethe + absorption) = 4 → SH | ⬜ |
| J5 | Full rotation end-to-end | ⬜ |
| J6 | Cooldown blocks Seethe re-trigger | ⬜ |
