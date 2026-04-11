# Snowshine — Skill & Status Coverage

5-star Defender | Cryo | Great Sword

Reconcile status: VERIFIED (commit `f7090022`). Reconcile commits
`c155c871` → `8a8b8b3f`. Plan `02-snowshine.md` deleted.

## Skills

### Basic Attack: Hypothermic Assault
- 3 segments, Physical DMG (fixed from CRYO)
- Seg 3: 2 frames, RECOVER SKILL_POINT, DEAL STAGGER 23
- Finisher: Physical DMG `[4.0 → 9.0]`
- Dive: Physical DMG `[0.80 → 1.80]`

### Battle Skill: Saturated Defense (4.5s, 100 SP)
- Single segment "Block window", duration 4.5s
- Frame at offset 0:
  - APPLY `PROTECTION` to ALL OPERATOR with `with.value = 0.9` and
    `with.duration = 4.5s` (overrides the generic 5s default so the
    Protection status drops with the shield).
  - RETURN 30 SP
  - APPLY `SATURATED_DEFENSE_RETALIATION` to THIS OPERATOR (4.5s
    on-trigger marker)

The retaliation is no longer a scheduled offset-3.57s frame on the BS.
It's now a two-stage status chain (see Statuses below):
1. `SATURATED_DEFENSE_RETALIATION` sits on Snowshine for the 4.5s
   block window. Its `onTriggerClause` listens for
   `ENEMY DEAL DAMAGE to THIS OPERATOR` and spawns a burst.
2. `SATURATED_DEFENSE_RETALIATION_BURST` is the per-hit event with the
   damage frame.

### Combo Skill: Polar Rescue (healing, no damage)
- Trigger predicates (BOTH must hold — AND'd in one conditions array):
  - `ENEMY DEAL DAMAGE to CONTROLLED OPERATOR`
  - `CONTROLLED OPERATOR HAVE HP <= 0.6`
- Animation segment 0.5s TIME_STOP, then 3s active segment, then
  cooldown
- Active segment frame at offset 0: APPLY `SNOWFIELD_SAR_ASSISTANCE` to
  ALL OPERATOR (per-operator instances, not a TEAM event)
- Cooldown: `VARY_BY SKILL_LEVEL [25×8, 24×3, 23]` — L1-L8: 25s,
  L9-L11: 24s, L12: 23s (per endfield.wiki.gg)
- Recover 10 UE on cast (top-level clause)

### Ultimate: Frigid Snowfield (80 energy, no UE-cost reduction at any potential)
- Animation: 1.983s TIME_STOP
- Active segment, frame at offset 0.087s:
  - DEAL STAGGER `[15×9, 20×3]`
  - DEAL CRYO DAMAGE `[2.0 → 4.5]` × ATTACK
  - APPLY `SNOW_ZONE` to ENEMY with `with.duration = 5s` (always 5s;
    P3 affects the Solidification, not the zone)

## Statuses

Created/touched in this reconcile (all under
`src/model/game-data/operators/snowshine/statuses/`):

| Status | Target | Duration | Notes |
|---|---|---|---|
| `SATURATED_DEFENSE_RETALIATION` | Snowshine (THIS OPERATOR) | 4.5s | Wrapper status. `onTriggerClause` fires on `ENEMY DEAL DAMAGE to THIS OPERATOR` and applies the burst. No segments / frames — pure marker. |
| `SATURATED_DEFENSE_RETALIATION_BURST` | Snowshine (THIS OPERATOR) | 2s | Per-hit retaliation event. Single segment with frame at offset 0: DEAL CRYO DAMAGE `[2.0 → 4.5]` × SOURCE OPERATOR ATTACK, APPLY CRYO INFLICTION 1 stack, DEAL STAGGER 20, RECOVER ULTIMATE_ENERGY `VARY_BY TALENT_LEVEL [0, 6, 10]` (T2 SAR Professional baked in). Conditional on `SOURCE OPERATOR HAVE POTENTIAL ≥ 5`: RETURN SKILL_POINT 10 (P5 Cold Disaster Specialist baked in). |
| `SNOWFIELD_SAR_ASSISTANCE` | ALL OPERATOR | 3s | Heal status applied by Polar Rescue. 4 frames at offsets 0/1/2/3s, each `RECOVER HP` with composed `value = (healBase + willAdditive × WILL) × (1 + T1_bonus)` ValueNode. Healing values match wiki: L1 base/will-coefficient = 96/0.22 (instant) and 24/0.06 (tick); L12 = 216/0.5 and 54/0.13. T1 Polar Survival multiplier baked in via `VARY_BY TALENT_LEVEL [0, 0.15, 0.25]`. |
| `SNOW_ZONE` | ENEMY | 5s (static) | Created by the ult. One segment with 11 frames: offset 0 applies forced Solidification (`isForced: true`, `with.duration = 5 + VARY_BY POTENTIAL [0,0,0,2,2,2]` → P3+ extends the solidification to 7s without affecting the zone itself). Offsets 0.5/1.0/.../5.0 are 10 DoT ticks, each DEAL CRYO DAMAGE `VARY_BY SKILL_LEVEL [0.29 → 0.65]` × SOURCE OPERATOR ATTACK. |

## Potentials

| P | Name | Effect | Status |
|---|---|---|---|
| P1 | Cold Shelter | Protection blocks Arts Inflictions on protected allies | Description-only — needs IGNORE INFLICTION + enemy→operator infliction DSL (TODO) |
| P2 | Storm Region | Ult effect radius +20% | Description-only — spatial mechanic (TODO) |
| P3 | Polar Survival Guide | Ult Solidification duration +2s | Implemented: baked into `SNOW_ZONE`'s frame 0 forced-Solidification `with.duration = 5 + VARY_BY POTENTIAL [0,0,0,2,2,2]`. Affects the Solidification only, not the Snow Zone itself. |
| P4 | Tundra Aegis | BASE_DEFENSE +20, WILL +20 | Implemented: APPLY STAT BASE_DEFENSE/WILL clause |
| P5 | Cold Disaster Specialist | Retaliation returns 10 SP | Implemented: conditional clause inside `SATURATED_DEFENSE_RETALIATION_BURST`'s frame, gated on `SOURCE OPERATOR HAVE POTENTIAL ≥ 5` |

## Talents

| Talent | E1 / E2 | Status |
|---|---|---|
| Forged (passive) | STR +10/+15/+15/+20 | Stat-only attribute increase, handled by operator stats |
| Polar Survival (T1) | Treatment values +15% / +25% | Implemented: baked into `SNOWFIELD_SAR_ASSISTANCE` heal frames as the outer MULT factor `(1 + VARY_BY TALENT_LEVEL [0, 0.15, 0.25])`. Talent file is description-only. |
| SAR Professional (T2) | Retaliation → +6 / +10 Ultimate Energy | Implemented: baked into `SATURATED_DEFENSE_RETALIATION_BURST`'s frame as `RECOVER ULTIMATE_ENERGY VARY_BY TALENT_LEVEL [0, 6, 10]`. Talent file is description-only. The placeholder `RETALIATE` verb that the original config used is gone — replaced by the on-trigger chain. |

## Integration tests

`src/tests/integration/operators/snowshine/skills.test.ts` — 25 E2E
tests covering:

- A. Core skill placement (BS, CS via freeform, ULT)
- B. BS Protection-status duration (4.5s, scoped to shield)
- C. BS retaliation chain — single hit, multi-hit, outside-window
  negative, P0/P5 sanity, combat-sheet attribution
- D. CS SAR Assistance applied to all 4 operator slots, 4 frames at
  offsets 0/1/2/3s, T1 baked-in scaling structural check
- E. Snow Zone — duration stays 5s at all potentials, P3 extends only
  the Solidification (5s → 7s), 11 frames at correct offsets, every
  frame carries `damageElement === CRYO`, DoT ticks produce 10 combat
  sheet damage rows attributed to ULTIMATE
- F. View layer — retaliation marker on Snowshine status column,
  SAR Assistance on every operator, Snow Zone on enemy column

## Known TODOs (not Snowshine-specific)

- P1 Cold Shelter — DSL gap, tracked in `docs/todo.md` IGNORE INFLICTION
  section
- P2 Storm Region — spatial mechanic, tracked in `docs/todo.md` Spatial
  mechanics section
- P5 SP-return delta — engine doesn't yet expose resource-graph deltas
  for assertion in tests; the burst-spawn count is verified instead
