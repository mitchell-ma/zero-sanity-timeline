# Alesh — Skill & Status Coverage

5-star Vanguard | Cryo | Sword

Reconcile status: RECONCILED. Reconcile plan: `.claude-temp/reconcile-plans/04-alesh.md`.
Landed as part of the CHANCE verb executor rollout — see §"CHANCE executor" below.

## Skills

### Basic Attack: Basic Rod Casting
- 5-sequence chain: BATK / DIVE / FINISHER variants
- Base physical damage per sequence; sequence 5 recovers 19 SP and deals
  17 stagger on final strike
- Finisher variant: physical damage `[4.0 → 9.0]` × ATTACK
- Dive variant: physical damage `[0.80 → 1.80]` × ATTACK

### Battle Skill: Unconventional Lure (100 SP, 1.67s)
- Damage frame at 0.9s: physical DMG `[2.0 → 4.5]` × ATTACK + 10 stagger
- Conditional on `ENEMY HAVE INFLICTION CRYO`:
  - `RECOVER SKILL_POINT` = `STACKS(CRYO) × 10 + VARY_BY POTENTIAL [0, 10, 10, 10, 10, 10]`
    (P1 Super Salty Comeback baked in as +10 SP from P1 onward)
  - `APPLY REACTION.SOLIDIFICATION` to ENEMY with `isForced: 1`
  - `CONSUME INFLICTION CRYO` from ENEMY (all stacks)
- Top-level clause: CONSUME 100 SP, RECOVER 17 UE (self) + 8.5 UE (team)

### Combo Skill: Auger Angling (VARY_BY SKILL_LEVEL cooldown [9×11, 8 at L12])
- Activation triggers (OR): `ANY OPERATOR CONSUME ARTS REACTION FROM ENEMY` or
  `ANY OPERATOR CONSUME ORIGINIUM_CRYSTAL FROM ENEMY`
- Animation segment 0.5s TIME_STOP, then 0.8s active segment, then cooldown
- Two sibling damage frames co-located at offset 0.77s in the active segment:
  - **Base frame** (unconditional):
    - RECOVER 10 SP (self)
    - DEAL 10 stagger to ENEMY
    - DEAL physical DMG `[0.33 → 0.75]` × ATTACK (base Auger Angling damage)
  - **Rare Fin frame** (CHANCE-wrapped):
    - `chance = 0.1 + min(0.3, floor(INTELLECT / 10) × VARY_BY TALENT_LEVEL [0, 0.002, 0.005])`
      — base 10% chance, +0.2% / +0.5% per 10 INT at T2 L1 / L2, cap +30%.
      The probability is **display-only** — it tells the user the in-game
      catching chance but does not drive execution. Firing is pin-driven
      (see "CHANCE executor" below).
    - Rare Fin bonus damage: physical DMG `[1.0 → 2.25]` × ATTACK
    - +10 SP (self)
    - At P3+: `APPLY STATUS MAY_THE_WILLING_BITE to TEAM` (nested inside the
      CHANCE hit branch and gated on `HAVE POTENTIAL ≥ 3`)
- Top-level clause: RECOVER UE `[10×5, 12×4, 13×2, 15]` (self)
- **Wiki timing gap**: we have no in-repo frame data for a separate Rare Fin
  offset. The skill description reads as a single strike with two outcomes
  ("opens an angling hole ... has a chance to hook a Rare Fin"), so the two
  sibling frames share offset 0.77s. If the wiki later specifies a distinct
  offset for the Rare Fin hit, adjust `frames[1].properties.offset.value`
  in `combo-skill-auger-angling.json`.

### Ultimate: One Monster Catch! (100 UE, 2.583s anim TIME_STOP)
- Energy cost: `MULT(100, VARY_BY POTENTIAL [1,1,1,1,0.85,0.85])` —
  P4 Insane Angling Set baked in as 15% cost reduction
- Suppplied parameter `ENEMY_DEFEATED` (0–5, default 0): bonus SP = `5 × ENEMY_DEFEATED`
- Damage segment, frame at 0.417s (base):
  - RECOVER SKILL_POINT = `VARY_BY SKILL_LEVEL [20×9, 25×3] + VARY_BY ENEMY_DEFEATED [0, 5, 10, 15, 20, 25]`
  - DEAL 20 stagger
  - APPLY CRYO INFLICTION 1 stack
  - DEAL cryo DMG `[4.36 → 9.80]` × ATTACK
- Second damage frame at 0.417s (P5 low-HP bonus):
  - Gated on `THIS OPERATOR HAVE POTENTIAL ≥ 5` AND `ENEMY HAVE HP < 50%`
  - DEAL cryo DMG `MULT([4.36 → 9.80], 0.5)` × ATTACK → +50% extra damage

## Statuses

| Status | Target | Duration | Notes |
|---|---|---|---|
| `MAY_THE_WILLING_BITE` | TEAM (COMMON_OWNER_ID) | 10s | P3-gated team buff spawned from the CS CHANCE hit branch. Stacks limit 1 RESET. Clause applies `APPLY STAT ATTACK_BONUS +0.15` to ALL OPERATOR. |

## Potentials

| P | Name | Effect | Status |
|---|---|---|---|
| P1 | Super Salty Comeback | BS SP recovery +10 when CRYO consumed | Implemented: baked into BS SP recovery `VARY_BY POTENTIAL [0, 10, 10, 10, 10, 10]` |
| P2 | Calm and Tranquil | Strength +15, Intellect +15 | Implemented: loadout-level APPLY STAT clause in `potential-2-calm-and-tranquil.json` |
| P3 | May the Willing Bite | Rare Fin catch → team ATK +15% 10s | Implemented: baked into CS CHANCE hit branch as `APPLY STATUS MAY_THE_WILLING_BITE to TEAM`, gated on `HAVE POTENTIAL ≥ 3` |
| P4 | Insane Angling Set | Ult UE cost −15% | Implemented: baked into Ult cost `VARY_BY POTENTIAL [1,1,1,1,0.85,0.85]` |
| P5 | Mega Lunker Rumors | Ult DMG ×1.5 on enemies below 50% HP | Implemented: second damage frame at same offset gated on `HAVE POTENTIAL ≥ 5` AND `ENEMY HAVE HP < 50%`, dealing +50% additional damage |

## Talents

| Talent | L0 / L1 / L2 | Status |
|---|---|---|
| Forged (passive) | STR gain curve | Stat-only, handled via operator attributeIncrease |
| Flash-frozen for Freshness (T1) | UE gain 0 / 3 / 4 on crystal or solidification; +0 / +6 / +8 when Alesh himself triggered it; 3s per-trigger cooldown | Implemented: self-triggered status event spawned from `onTriggerClause`. Two trigger branches (`ANY OPERATOR APPLY SOLIDIFICATION to ENEMY` or `ANY OPERATOR APPLY ORIGINIUM_CRYSTAL to ENEMY`) both fire `APPLY EVENT` to create a self-targeted status on Alesh. The spawned event has two segments: an active 2s segment with a frame at offset 0s carrying two clauses — (1) unconditional base UE recovery `VARY_BY TALENT_LEVEL [0, 3, 4]`, and (2) a conditional bonus UE recovery `[0, 6, 8]` gated on `THIS OPERATOR IS TRIGGER OPERATOR` — followed by a 3s `IMMEDIATE_COOLDOWN` segment. The spawned event carries `triggerEntityId` stamped at creation time so its own frame clause can discriminate self-triggered vs teammate-triggered. The 3s cooldown is enforced by `configCache` deriving `cooldownFrames` from the `IMMEDIATE_COOLDOWN` segment, which `doApply`'s STATUS branch reads to reject re-spawns within the cooldown window. |
| Veteran Angler (T2) | +0.2% / +0.5% Rare Fin catch per 10 INT (max +30%) | Implemented: baked into CS CHANCE formula as `VARY_BY TALENT_LEVEL [0, 0.002, 0.005]` multiplier on `floor(INTELLECT / 10)`. Talent file is description-only. |

## CHANCE executor

Alesh is the first operator to exercise the CHANCE verb end-to-end. CHANCE is
**pin-driven, not expectation-weighted** — the probability ValueNode in the
wrapper's `with.value` is display-only, and execution is determined by the
per-frame `isChance` pin.

- **Schema**: CHANCE wraps child `effects` (hit branch) and `elseEffects` (miss
  branch). The probability in `with.value` is a full ValueNode tree — Alesh's
  CS uses `ADD(IS 0.1, MIN(IS 0.3, MULT(INTEGER_DIV(STAT INTELLECT, 10), VARY_BY TALENT_LEVEL [0, 0.002, 0.005])))`
  for display purposes ("Rare Fin: 12%" at L1 / 100 INT). It does not drive
  execution.
- **Executor** (`eventInterpretorController.doChance`): reads the frame's
  `isChance` pin and fires the hit or miss branch per mode:
  - `ALWAYS` — hit branch only
  - `NEVER` — miss branch only (or nothing when `elseEffects` is absent)
  - `MANUAL` / `EXPECTED` — per-frame `isChance` pin drives the outcome;
    unpinned frames default to MISS
- **Damage path**: `findDealDamageInClauses` in `clauseQueries.ts` descends
  into CHANCE / ALL / ANY wrappers and marks the returned `DealDamageInfo`
  with `insideChance: true` when the DEAL DAMAGE was found nested in a
  CHANCE. The damage builder gates row emission on `shouldFireChance` — if
  the pin resolves to miss, the row is skipped entirely (no damage, no
  diluted multiplier).
- **Frame pin**: `FrameOverride.isChance` — settable via the frame context
  menu ("Set Chance Hit / Set Chance Miss"), which only appears on frames
  whose clauses contain a CHANCE compound (`hasChanceClause`).
  `useApp.handleSetChancePins` is the public API.
- **Resource side-effects**: RECOVER SP / UE / APPLY STATUS inside a CHANCE
  hit branch fire at full strength when the branch fires, and not at all
  when it doesn't. There is no probability-weighted fractional scaling —
  CHANCE is binary.

## Integration tests

`src/tests/integration/operators/alesh/skills.test.ts` — 15 scenarios:

- **A1–A3**: core skill placement (BS, CS via freeform, Ult)
- **B1**: BS event carries `UNCONVENTIONAL_LURE` name
- **C1**: combo cooldown 8s at L12 (per VARY_BY SKILL_LEVEL)
- **D1**: Ult UE cost 100 at P0, 85 at P4
- **D2**: Ult applies cryo infliction to enemy
- **E1–E2**: view-layer presentation for BS + Ult
- **F1**: BS against clean enemy leaves no solidification / no SP bonus
- **F2**: BS against enemy with cryo infliction consumes the stacks, applies
  forced solidification, and records the consume via `EventStatusType.CONSUMED`
- **G1**: CS damage frame carries a CHANCE compound after parse (validates
  `dataDrivenEventFrames` preserves CHANCE and `hasChanceClause` descends into it)
- **H1**: Ult carries the `ENEMY_DEFEATED` supplied parameter in its metadata
- **H2**: Ult has two damage frames at offset 0.417s — base + P5 HP-gated bonus
- **I1**: `handleSetChancePins` writes `isChance: true` into the override store
  at `segments[si].frames[fi]`

## Known TODOs

- **Wiki-verified Rare Fin offset** — we have no in-repo frame-data source
  for a dedicated Rare Fin timing. The split currently colocates the base
  and Rare Fin hits at offset 0.77s based on the "one strike, two outcomes"
  reading of the in-game description. If the wiki lists a distinct offset
  for the bonus hit, update `combo-skill-auger-angling.json` frame[1]'s
  offset.
- **elseEffects for CS** — not authored; the CHANCE miss branch is implicit
  (no effects fire on miss). `Effect.elseEffects` is wired through the
  interpretor (per-mode policy from `shouldFireChance`) and ready to use
  if future design calls for explicit miss-branch behavior.
