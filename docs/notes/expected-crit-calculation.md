# Expected Critical Hit Calculation

## Overview

In EXPECTED mode, the damage calculator needs to compute the probability of critical hits at each damage frame to accurately model crit-dependent gear and weapon statuses. A single crit event triggers all on-crit statuses simultaneously, so all statuses share one effective crit rate `E(T)` per operator per frame.

CHANCE is the generalization of crit — any probability-gated effect. Crit is `CHANCE(critRate)` applied to `PERFORM CRITICAL_HIT` triggers. In EXPECTED mode, `chanceMultiplier` already scales effect values by probability in the effect executor. The crit expectation model extends this to handle recursive feedback (stacks → crit rate → more stacks).

Only `CritMode.EXPECTED` uses the probability model. ALWAYS/NEVER/SIMULATION remain deterministic.

## Key Concepts

- **E(T)** = expected crit rate at frame T (one number per operator, used for crit multiplier in damage formula)
- **P[s, T]** = probability of being at stack count s at frame T (per status, from crit model)
- **E[stacks]** = expected stack count = `Σ s × P[s]` (per status, for weighting stat bonus contributions)
- **expectedUptime** = `1 - P[0]` = probability the status has any stacks (per status)

These are different outputs of the same model:
- E(T) → `1 + E(T) × critDmg` in the damage formula
- P tables → expected stat deltas (weighted bonuses) and uptime for display
- E(T) is computed FROM P tables of feedback statuses

## View-Layer Fields

**`EventFrameMarker.expectedCritRate?: number`** — E(T), set by the damage table builder on damage frames in EXPECTED mode. Used for the crit multiplier in the damage formula.

**`TimelineEvent.expectedUptime?: number`** — P(event active), 0.0-1.0. Set on CHANCE-gated events via `chanceMultiplier` in the effect executor. Omitted for deterministic events (implicitly 1.0). The combat timeline does NOT use this — it visualizes based on `isCrit` values.

**`DamageSubComponents.critSnapshot?: CritFrameSnapshot`** — full model snapshot for breakdown display in the info pane.

## Recursive Relation

The effective crit rate `E(T)` at frame T depends on the stack distributions of feedback statuses (statuses whose effects modify crit rate), which themselves depend on `E(T-1)`:

```
E_total(T) = baseCritRate + sum over feedback statuses of [P(status at bonus threshold, T) × bonusCritRate]
```

All stack distributions update using `E_total(T-1)`, then `E_total(T)` is recomputed from the updated distributions.

## Stack Distribution: `P(S, T)`

For each crit-triggered status, `P(S, T)` is the probability of being at stack count S at damage frame T.

General transition (before accounting for expiry):
```
P(S, T) = P(S, T-1) × (1 - E(T-1))       // was at S, didn't crit
         + P(S-1, T-1) × E(T-1)            // was at S-1, did crit
```

Boundary: `P(0, T) = P(0, T-1) × (1 - E(T-1))` (can't go below 0)
Cap: `P(cap, T) = P(cap, T-1) + P(cap-1, T-1) × E(T-1)` (crits at cap stay at cap)

Each status's probability array is sized `0..cap` where `cap` = `stacks.limit` from its JSON config. No global max — Lupine Scarlet gets `P[0..16]`, MI Security gets `P[0..5]`, Artzy gets `P[0..3]`. No probability mass exists above cap.

Expiry and lifecycle mechanics modify these transitions per stacking type.

## Stacking Mechanism Types

Classification is driven by the status JSON config fields: `interactionType`, `duration`, and presence of lifecycle triggers (`onTriggerClause` with `BECOME STACKS`, `onExitClause` with `CONSUME`).

| interactionType | Has lifecycle trigger? | Model Type | Probability Model | Example |
|----------------|----------------------|------------|-------------------|---------|
| NONE / REFRESH | No | Type 2: Shared timer | Markov chain | MI Security |
| RESET          | No | Type 3: FIFO | Poisson binomial | Artzy Tyrannical |
| Any            | Yes (BECOME STACKS → buff → onExit CONSUME) | Type 1: Lifecycle | Markov chain | Lupine Scarlet |

### Type 1: Lifecycle Cycle (Markov Chain)

**Config pattern**: Status has permanent duration (99999). A separate status def has `onTriggerClause` with `BECOME STACKS` at the cap threshold, which spawns a timed buff. The timed buff has `onExitClause` that CONSUMEs all stacks of the original status.

**Example**: Lupine Scarlet Wolven Blood (cap 16, permanent) → Wolven Blood Max Stacks (20s buff) → on expiry, consume all Wolven Blood stacks → restart cycle.

**State**: `(stacks, buff_trigger_frame_index | null)`
- `stacks 0..cap-1, buff_trigger = null`: ramping phase
- `stacks = cap, buff_trigger = frame X`: buff active, counting down
- When `T - X >= buff_duration`: stacks reset to 0, `buff_trigger = null`

**Transitions**:
1. Check buff expiry: states with `buff_trigger = X` where `T - X >= buff_duration` → stacks = 0, null
2. Ramping states: on crit (prob E(T-1)) → stacks + 1. If reaches cap → set buff_trigger = T
3. Buff-active states: crits don't add stacks (already at cap), no transition

**State space**: `(cap + 1) × (damage_frames_in_buff_window + 1)`. Lupine Scarlet: 17 × ~60 ≈ 1,020

### Type 2: Shared Timer with Refresh (Markov Chain)

**Config pattern**: Finite duration, `interactionType: NONE` or `REFRESH`. Each crit adds a stack and resets the single shared timer. When the timer expires, ALL stacks are removed at once.

**Example**: MI Security (cap 5, duration 5s). Each crit adds a stack and refreshes the 5s timer. At 5 stacks, grants additional +5% crit rate (feedback).

**State**: `(stacks, last_crit_damage_frame_index)`

**Transitions**:
1. Expiry: states where `T - T_last_crit > duration` → stacks = 0
2. On crit (prob E(T-1)): `stacks' = min(stacks + 1, cap)`, `last_crit' = T`
3. On no crit (prob 1-E(T-1)): state unchanged, but T advances toward expiry

**State space**: `(cap + 1) × (damage_frames_in_duration_window + 1)`. MI Security: 6 × ~15 ≈ 90

### Type 3: Independent Per-Stack Timers / FIFO (Poisson Binomial)

**Config pattern**: Finite duration, `interactionType: RESET`. Each crit creates a new stack with its own independent timer. Stacks expire individually. At cap, oldest replaced.

**Example**: Artzy Tyrannical Exaggeration (cap 3, duration 30s per stack).

**Key insight**: Active stacks at T = number of crits within the sliding duration window. Each past frame X contributed a crit with probability `E(X)`. These are independent Bernoulli trials → Poisson binomial distribution.

**Computation**: DP in O(n × cap) per frame. No Markov state needed.

**State space**: None (stateless — computed from E(T) history + sliding window)

## Two-Layer Architecture

### Layer 1: Core Chain (feedback statuses)

Statuses whose effects include `APPLY STAT CRITICAL_RATE` at any threshold. Computed first because they contribute to `E_total(T)`.

### Layer 2: Dependent Models (non-feedback statuses)

All other crit-triggered statuses. Consume `E_total(T)` from Layer 1 but don't influence it.

### Processing Order per Damage Frame T

```
1. Take E_total(T-1)
2. Update all feedback status distributions using E_total(T-1)     [Layer 1]
3. Compute E_total(T) = baseCritRate + feedback contributions
4. Update all dependent status distributions using E_total(T-1)    [Layer 2]
5. Collect expected stat deltas from all distributions
6. Record CritFrameSnapshot for breakdown display
```

## Output Per Frame: CritFrameSnapshot

```
expectedCritRate: number               // E_total(T)
critSources: CritSource[]              // what contributes to E_total(T)
statusDistributions: Map<statusId, number[]>  // per-status P(stacks) array
expectedStatDeltas: Record<StatType, number>  // weighted stat bonuses from all statuses
```

## Stat Integration

### Unified Expectation: `getFrameExpectation(critMode, snapshot, frameCrit)`

All crit-dependent values go through one function:
```
effectiveValue = baseValue × getFrameExpectation(critMode)

NEVER:      0       → zero crit contribution
ALWAYS:     1       → full crit contribution  
EXPECTED:   E(T)    → probability-weighted (from crit model)
SIMULATION: 0 | 1   → binary from isCrit roll
```

The crit multiplier itself: `1 + critDamage × getFrameExpectation(critMode)`.

### Timeline Rendering Per Crit Mode

In EXPECTED mode, the event engine fires `PERFORM CRITICAL_HIT` on every damage frame (same as ALWAYS). All crit-triggered status events exist on the timeline for visualization. But the damage calculation uses weighted values from the crit model, not the full values from the timeline events.

`opData.stats` comes from loadout aggregation (operator + weapon + gear passives), NOT from timeline-derived status events. So crit model's `expectedStatDeltas` are purely additive — no need to subtract full values.

### Stat Delta Application

After stepping the crit model, the damage table builder adds `expectedStatDeltas` to the relevant buckets:
- `ATTACK_BONUS` → recompute total attack with adjusted ATK%
- Element DMG bonuses (`PHYSICAL_DAMAGE_BONUS`, `HEAT_DAMAGE_BONUS`, etc.) → added to element sub-component
- Skill type/generic DMG bonuses → added to respective sub-components
- `CRITICAL_RATE` → already handled by E(T) in the crit multiplier

### Testing: Clamping Between Modes

For any frame: `damage(NEVER) ≤ damage(EXPECTED) ≤ damage(ALWAYS)`.

Additional properties:
- E(T) ∈ [baseCritRate, baseCritRate + maxFeedbackBonus]
- Expected stat deltas ∈ [0, maxStacks × bonusPerStack]
- As baseCritRate → 1.0, EXPECTED values → ALWAYS values

## Generic Discovery

All participating statuses discovered from config at runtime:
1. Query `triggerIndex.lookup('PERFORM:CRITICAL_HIT')` for operator's slot
2. Each entry's trigger effect gives status ID → load status config
3. Classify by interactionType + lifecycle detection → assign model type
4. Classify as feedback (has `APPLY STAT CRITICAL_RATE` effect) vs dependent

## Implementation Files

- **Model**: `src/controller/calculation/critExpectationModel.ts` — three model types + orchestrator + generic discovery
- **Integration**: `src/controller/calculation/damageTableBuilder.ts` — builds models, steps per frame, uses E(T) for crit multiplier
- **Display**: `src/controller/info-pane/damageBreakdownController.ts` — renders crit sources with probabilities
- **View types**: `src/consts/viewTypes.ts` — `expectedCritRate` on frames, `expectedUptime` on events
- **Pipeline**: `src/controller/timeline/eventQueueController.ts` — exposes TriggerIndex for discovery
- **CHANCE**: `src/controller/timeline/effectExecutor.ts` — sets `expectedUptime` on CHANCE-gated events
- **Event engine**: `src/controller/timeline/eventInterpretorController.ts` — EXPECTED mode fires CRITICAL_HIT like ALWAYS
- **Tests**: `src/tests/unit/critExpectationModel.test.ts` (29 tests), `src/tests/unit/critExpectationEdgeCases.test.ts` (18 tests)
