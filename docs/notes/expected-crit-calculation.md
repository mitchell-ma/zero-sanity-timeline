# Expected Critical Hit Calculation

## Overview

The damage calculator supports five crit modes that control how critical hits affect both the timeline visualization and damage calculation. A crit expectation model computes probability distributions for crit-dependent gear/weapon statuses (MI Security, Lupine Scarlet, Artzy Tyrannical).

CHANCE is the generalization of crit — any probability-gated effect. Crit is `CHANCE(critRate)` applied to `PERFORM CRITICAL_HIT` triggers.

## Crit Modes

```
CritMode.NEVER      — No crits. Crit multiplier = 1.0. Crit-triggered buffs contribute 0.
CritMode.ALWAYS     — All frames crit. Crit multiplier = 1 + critDmg. Buffs build 1 stack per frame.
CritMode.EXPECTED   — Probability-weighted. Crit multiplier = 1 + E(T) × critDmg. Uses Markov model.
CritMode.RANDOM     — Random rolls. isCrit written to frames, persisted to overrides.
CritMode.MANUAL     — User-pinned. isCrit sourced from override store pins.
```

## Key Design Rules

### `isCrit` is persistent data
`frame.isCrit` is NEVER overwritten by NEVER/ALWAYS/EXPECTED modes. It is only modified by:
- RANDOM mode: random rolls during pipeline processing
- MANUAL mode: pin reads from override store
- User actions: `handleSetCritPins`, `handleRandomizeCrit`

### Crit mode is a view/calculation concern
The crit mode affects:
- **Visual presentation**: `EventBlock.isFrameVisualCrit()` reads `getRuntimeCritMode()` to decide whether to show crit diamonds. ALWAYS/EXPECTED show all damage frames as crit. NEVER shows none. RANDOM/MANUAL show based on `isCrit`.
- **Damage calculation**: `getFrameExpectation(mode)` returns 0/1/E(T) for the crit multiplier formula.
- **Trigger emission**: `effectiveCrit` in the event interpretor determines whether `PERFORM CRITICAL_HIT` fires.
- **Stat contributions**: The crit model provides `expectedStatDeltas` (weighted) for EXPECTED, `fullStatValues` scaled by mode for other modes.

### Runtime crit mode lives in combatStateController
```
getRuntimeCritMode()     — read by EventBlock during render
getCritModeGeneration()  — generation counter for memo invalidation
setRuntimeCritMode(mode) — called by useApp when user toggles
```
No prop drilling — EventBlock reads the mode directly from the controller. A `critModeGeneration` number flows through `buildEventBlockProps` for React.memo invalidation.

## Key Concepts

- **E(T)** = expected crit rate at frame T (one number per operator, used for crit multiplier)
- **P[s, T]** = probability of being at stack count s at frame T (per status, from crit model)
- **E[stacks]** = expected stack count = `Σ s × P[s]` (per status, for weighting stat bonus contributions)
- **expectedUptime** = `1 - P[0]` = probability the status has any stacks (per status)

## Unified Expectation: `getFrameExpectation(critMode, snapshot?, frameCrit?, baseCritRate?)`

All crit-dependent values go through one function:
```
effectiveValue = baseValue × getFrameExpectation(critMode)

NEVER:      0           → zero crit contribution
ALWAYS:     1           → full crit contribution
EXPECTED:   E(T)        → probability-weighted (from crit model, fallback to baseCritRate)
RANDOM:     0 | 1       → binary from isCrit roll
MANUAL:     0 | 1       → binary from user pin
```

The crit multiplier: `1 + critDamage × getFrameExpectation(critMode)`.

## Crit Model Architecture

### Stack accumulation per mode
The model is stepped for ALL modes via `overrideE`:
- ALWAYS: `overrideE = 1.0` → every frame crits → stacks build 1 per frame
- NEVER: `overrideE = 0.0` → no crits → stacks stay at 0
- EXPECTED: `overrideE = undefined` → model uses feedback-computed E(T)
- RANDOM/MANUAL: `overrideE = frame.isCrit ? 1.0 : 0.0`

This means in ALWAYS mode, frame 1 has 1 MI Security stack (5% ATK), frame 5 has 5 stacks (25% ATK). Stacks build up correctly, not instant max.

### Recursive Relation (EXPECTED mode)

```
E_total(T) = baseCritRate + Σ feedback statuses [P(status at threshold, T) × bonusCritRate]
```

All stack distributions update using `E_total(T-1)`, then `E_total(T)` is recomputed.

### Stack Distribution: `P(S, T)`

```
P(S, T) = P(S, T-1) × (1 - E(T-1))       // was at S, didn't crit
         + P(S-1, T-1) × E(T-1)            // was at S-1, did crit
```

Each status's probability array is sized `0..cap` from its JSON config.

## Stacking Mechanism Types

| interactionType | Has lifecycle trigger? | Model Type | Probability Model | Example |
|----------------|----------------------|------------|-------------------|---------|
| NONE / REFRESH | No | SharedTimer | Markov chain | MI Security |
| RESET          | No | FIFO | Poisson binomial | Artzy Tyrannical |
| Any            | Yes (BECOME STACKS → buff → onExit CONSUME) | Lifecycle | Markov chain | Lupine Scarlet |

### Type 1: Lifecycle Cycle (Lupine Scarlet)
Permanent stacks → threshold triggers timed buff → buff expires → consume all → restart.
State: `(stacks, buff_trigger_frame | null)`.

### Type 2: Shared Timer (MI Security)
Finite duration, all stacks share one timer that refreshes on each crit.
State: `(stacks, last_crit_frame)`.

### Type 3: FIFO / Independent Per-Stack Timers (Artzy Tyrannical)
Each stack has its own duration. Active stacks = Poisson binomial over crits in sliding window.
Stateless — computed from E(T) history.

## Two-Layer Architecture

**Layer 1 (Core)**: Feedback statuses that contribute to crit rate (MI Security). Computed first.
**Layer 2 (Dependent)**: Non-feedback statuses (Lupine Scarlet, Artzy). Consume E(T) from Layer 1.

## Output Per Frame: CritFrameSnapshot

```
expectedCritRate: number                         // E_total(T)
critSources: CritSource[]                        // what contributes to E_total(T)
statusDistributions: Map<statusId, number[]>     // per-status P(stacks) array
expectedStatDeltas: Partial<Record<StatType, number>>  // weighted stat bonuses
fullStatValues: Partial<Record<StatType, number>>      // max-stacks stat values (for ALWAYS)
```

## View-Layer Fields

**`EventFrameMarker.expectedCritRate?: number`** — E(T), set by damage builder on damage frames in EXPECTED mode.

**`TimelineEvent.expectedUptime?: number`** — P(event active), set on CHANCE-gated events via `chanceMultiplier`.

**`DamageSubComponents.critSnapshot?`** — full model snapshot for breakdown display.

## Generic Discovery

All participating statuses discovered from config at runtime:
1. Query `triggerIndex.lookup('PERFORM:CRITICAL_HIT')` for operator's slot
2. Each entry's trigger effect gives status ID → load status config
3. Classify by interactionType + lifecycle detection → assign model type
4. Classify as feedback (has `APPLY STAT CRITICAL_RATE` effect) vs dependent

## Implementation Files

- **Model**: `src/controller/calculation/critExpectationModel.ts` — three model types + orchestrator + discovery + `getFrameExpectation`/`getStatusExpectation`
- **Runtime state**: `src/controller/combatStateController.ts` — `getRuntimeCritMode`, `setRuntimeCritMode`, `getCritModeGeneration`
- **Calculation**: `src/controller/calculation/damageTableBuilder.ts` — builds models, steps per frame with `overrideE`, uses `getFrameExpectation` for crit multiplier
- **Display**: `src/controller/info-pane/damageBreakdownController.ts` — renders crit sources with probabilities
- **View types**: `src/consts/viewTypes.ts` — `expectedCritRate` on frames, `expectedUptime` on events
- **Pipeline**: `src/controller/timeline/eventQueueController.ts` — exposes TriggerIndex, crit pin application
- **Event interpretor**: `src/controller/timeline/eventInterpretorController.ts` — crit resolution, trigger emission per mode
- **CHANCE**: `src/controller/timeline/effectExecutor.ts` — sets `expectedUptime` on CHANCE-gated events
- **Visual**: `src/view/EventBlock.tsx` — `isFrameVisualCrit()` reads `getRuntimeCritMode()`
- **App bar**: `src/view/AppBar.tsx` — crit mode toggle button
- **Tests**: `src/tests/unit/critExpectationModel.test.ts` (29), `src/tests/unit/critExpectationEdgeCases.test.ts` (34), `src/tests/integration/mechanics/critModeToggle.test.ts` (8), `src/tests/integration/mechanics/critModeDamage.test.ts` (3), `src/tests/integration/mechanics/critModeRossiMiSecurity.test.ts` (6), `src/tests/integration/mechanics/critModeStackAccumulation.test.ts` (10)
