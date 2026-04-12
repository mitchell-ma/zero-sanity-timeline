# Estella — Skill & Status Coverage

4-star Guard | Cryo | Polearm

Reconcile status: **VERIFIED**. All skills, talents (except T2 Laziness —
blocked on DSL), and potentials (except P3 Delayed Work — spatial
mechanics) have `dataStatus: VERIFIED`.

## Skills

### Basic Attack: Audio Noise
- 4 segments, Physical DMG (fixed from HEAT)
- Seg 3: 2 hits `[0.15+0.20]`
- Seg 4: RECOVER SKILL_POINT, DEAL STAGGER 17
- Finisher: Physical DMG `[4.0 → 9.0]`
- Dive: Physical DMG `[0.80 → 1.80]`
- BA variants do **not** produce Shatter on solidified enemies. Endfield
  consumes Solidification only when a physical status (LIFT / KNOCK_DOWN /
  CRUSH / BREACH) or VULNERABLE infliction is applied to the enemy — raw
  physical damage does not trigger the consumption. Confirmed against
  in-game behavior. See integration tests E1–E3 for the negative
  assertions.

### Battle Skill: Onomatopoeia (100 SP, 1.5s)
- Single segment, frame at offset 0.7s:
  - DEAL STAGGER 10
  - APPLY CRYO INFLICTION 1 stack to ENEMY
  - DEAL CRYO DAMAGE
    `VARY_BY SKILL_LEVEL [1.56 → 3.50] × VARY_BY POTENTIAL [1,1,1,1.4,1.4,1.4]`
    (P3 Delayed Work damage component baked in)
- Conditional clause (gated on `THIS OPERATOR HAVE STATUS COMMISERATION_TALENT`):
  - RETURN SKILL_POINT `VARY_BY TALENT_LEVEL [0, 7.5, 15]`
    (zero-indexed: L0 = 0 SP, L1 = 7.5 SP, L2 = 15 SP)
  - CONSUME COMMISERATION_TALENT 1 stack

### Combo Skill: Distortion
- Trigger: enemy suffers Solidification (6s activation window)
- Animation segment: 0.5s with `TIME_STOP`
- Top-level clause (unconditional, always fires on cast): `RECOVER
  ULTIMATE_ENERGY 10`
- Active segment, frame at offset 0.13s — three clauses under
  `clauseType: ALL`:
  - Unconditional: DEAL STAGGER 10, APPLY PHYSICAL LIFT
    (`isForced: 1`)
  - Path A — `ENEMY HAVE SOLIDIFICATION` is **negated**:
    DEAL PHYSICAL DAMAGE `[1.60 → 3.60]` × THIS OPERATOR ATTACK
  - Path B — `ENEMY HAVE SOLIDIFICATION`:
    DEAL PHYSICAL DAMAGE `[2.80 → 6.30]` × THIS OPERATOR ATTACK,
    APPLY PHYSICAL_SUSCEPTIBILITY `[10% → 15%]` for
    `6 + VARY_BY POTENTIAL [0,3,3,3,3,3]` seconds (P1 Habitual Delay
    +3s baked in)
- Paths A and B are **mutually exclusive** — Distortion always deals
  exactly one damage hit per cast. This is important for crit
  calculation and combat-sheet row counting: on a solidified enemy the
  skill produces ONE bigger hit (280% → 630%), not a 160% hit plus a
  120% addon.
- Cooldown: `VARY_BY SKILL_LEVEL [18×11, 17]` — L1-L11: 18s, L12: 17s
- Drives Commiseration via the forced LIFT consuming Solidification →
  Shatter → talent fires.

### Ultimate: Tremolo (energy `VARY_BY POTENTIAL [70, 70, 63, 63, 63, 63]`)
- Animation segment: `TIME_STOP`
- Active segment, frame:
  - DEAL STAGGER `[15×9, 20×3]`
  - DEAL PHYSICAL DAMAGE `[4.89 → 11.00]` × THIS OPERATOR ATTACK
- Conditional clause — `IF ENEMY HAVE PHYSICAL_SUSCEPTIBILITY`:
  APPLY LIFT (`isForced: 1`)
- The conditional Lift only fires when something else (Estella's CS or
  another op) has staged Physical Susceptibility on the target. So the
  ULT alone does not naturally produce Shatter — it needs CS first.

## Statuses (`statuses/` — none yet; talent-derived statuses live with their talents)

| ID | Type | Owner | Effect |
|---|---|---|---|
| `COMMISERATION_TALENT` | TALENT | Estella | Self-applied on Shatter (gated `HAVE TALENT_LEVEL ≥ 1`). Limit 1, RESET, permanent duration. Consumed by Estella's own Onomatopoeia BS for SP return. |
| `SURVIVAL_IS_A_WIN_P5` | POTENTIAL | Estella | Self-applied on `APPLY SOLIDIFICATION to ENEMY` at potential 5. Active segment 1s with frame `RECOVER ULTIMATE_ENERGY 5`, then 1s `IMMEDIATE_COOLDOWN` segment (`REAL_TIME`). Limit 1, RESET, total span 2s — enforces the 1s effect cadence. |

## Talents

| Slot | Name | Implementation |
|---|---|---|
| Talent 1 (max=2) | Commiseration | `talent-commiseration-talent.json` — `onTriggerClause` listens for `THIS OPERATOR APPLY SHATTER REACTION` AND `THIS OPERATOR HAVE TALENT_LEVEL ≥ 1`, applies `COMMISERATION_TALENT` to self. The actual SP return on next BS lives inside `battle-skill-onomatopoeia.json`'s second clause (`VARY_BY TALENT_LEVEL [0, 7.5, 15]`). The talent file carries `properties.maxLevel = 2`. |
| Talent 2 (max=2) | Laziness Pays Off Now | **Description-only — BLOCKED.** Needs `IGNORE INFLICTION` and elemental `MITIGATE / DAMAGE_TAKEN_REDUCTION` DSL primitives. Tracked in `docs/todo.md` under "DSL: IGNORE INFLICTION and elemental MITIGATE/DAMAGE_TAKEN_REDUCTION". |
| Passive (Stalwart) | WILL +10/+15/+15/+20 | Stat-only attribute increase, handled by operator stats. |

## Potentials

| P | Name | Implementation |
|---|---|---|
| P1 | Habitual Delay | Implemented: baked into `combo-skill-distortion.json` susceptibility duration as `VARY_BY POTENTIAL [0,3,3,3,3,3]` ADD 3s. |
| P2 | Lowered Expectations | Implemented: baked into `ultimate-tremolo.json` energy cost `MULT 70 × VARY_BY POTENTIAL [1,1,0.9,0.9,0.9,0.9]` → 70 → 63 from P2 onward. |
| P3 | Delayed Work | **Partial.** Damage component baked into `battle-skill-onomatopoeia.json` damage as `VARY_BY POTENTIAL [1,1,1,1.4,1.4,1.4]`. The "+50% range" and "+ first-enemy-hit bonus" portions are spatial / targeting mechanics — tracked in `docs/todo.md` under "Spatial mechanics". |
| P4 | Life Over Mission | Implemented: APPLY STAT WILL/STR clause. |
| P5 | Survival is a Win | Implemented as `SURVIVAL_IS_A_WIN_P5` self-status. `onTriggerClause` fires on `THIS OPERATOR APPLY SOLIDIFICATION REACTION to ENEMY`. The 1s effect cadence is enforced by the `IMMEDIATE_COOLDOWN` segment (1s `REAL_TIME`), giving a 2s total span. Single stack, RESET interaction. |

## Integration tests

`src/tests/integration/operators/estella/skills.test.ts` — 28 E2E tests
across:

- A. Core skill placement (BS / CS / ULT / BA)
- B. BS Cryo Infliction
- C. Combo Solidification trigger gate (freeform vs strict)
- D. Ultimate energy cost at P0/P2/P5
- E. Talent-derived Commiseration and ULT conditional LIFT:
  - E1–E3: negative — BA variants on solidified enemy produce zero
    Commiseration (raw physical damage doesn't shatter Solidification).
  - E4: positive (E2E via context menu) — CS forced LIFT → Shatter →
    Commiseration. Verifies event in allProcessedEvents, micro-column
    in status column, and view model inclusion.
  - E5: negative — ULT in isolation doesn't trigger Commiseration
    (conditional LIFT needs pre-existing Physical Susceptibility).
  - E6: positive — ULT with freeform PHYSICAL_SUSCEPTIBILITY on enemy
    applies forced LIFT (Tremolo conditional clause verified).
- G. Commiseration BS-only consumption — Estella's own Onomatopoeia
  consumes the status and routes the SP return through the resource
  graph; another operator's BS does not. Includes G4 which asserts the
  exact +15 SP delta at the BS frame at default talent level 2.
- H. Survival Is A Win P5 E2E via BS-triggered Solidification:
  - H1: Estella BS + freeform Electric → Solidification on enemy.
  - H2: P5 fires at potential 5 AND Commiseration does NOT fire (no
    Shatter in this setup — only Solidification from cross-element).
  - H3: P5 does NOT fire at potential < 5.
- F. View layer — BS / CS / ULT visible in computed timeline
  presentation, BS event has nonzero duration.

## Engine fixes from this reconcile

- `handleEngineTrigger`: resolves and passes `talentLevel` into condCtx
  for `onTriggerClause` haveConditions, so `HAVE TALENT_LEVEL >= N`
  gates evaluate correctly (was defaulting to 0).
- `doApply` INFLICTION path: after `applyEventFromCtx`, fires reactive
  triggers for any cross-element reaction created by
  `inflictionColumn.add()` as a side effect. Without this, talents
  watching `THIS OPERATOR APPLY SOLIDIFICATION` (P5) were never
  notified because the reaction was created inside the column, not by
  the interpretor's effect dispatch.
- `checkReactiveTriggers`: qualifier filter for category-matched triggers
  — when a trigger registers under `APPLY:REACTION` but its condition
  specifies `objectQualifier: SHATTER`, only fire if the actual event
  column matches SHATTER (not SOLIDIFICATION or other reactions).
- `resolveColumnIds`: `tryFlattenQualifiedStatusId` resolves
  `(SUSCEPTIBILITY, PHYSICAL)` → `PHYSICAL_SUSCEPTIBILITY` for the
  columnId fallback path in `eventMatchesStatusPredicate`.

## Known TODOs (not Estella-specific)

- T2 Laziness Pays Off Now — DSL gap (IGNORE INFLICTION + elemental
  MITIGATE), tracked in `docs/todo.md`. Shared with Snowshine P1,
  Arclight T2, Antal/Fluorite pre-existing notes.
- P3 Delayed Work range/first-enemy-hit — spatial mechanic gap, tracked
  in `docs/todo.md`.
