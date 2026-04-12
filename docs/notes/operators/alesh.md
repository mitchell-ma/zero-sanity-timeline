# Alesh — Skill & Status Coverage

5-star Vanguard | Cryo | Sword

Reconcile status: RECONCILED.

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
  - `RECOVER SKILL_POINT` = `STACKS(CRYO) × 10 + VARY_BY SKILL_LEVEL [0×9, 5, 5, 5] + VARY_BY POTENTIAL [0, 10, 10, 10, 10, 10]`
    (per-wiki: 10 SP per stack at L1-9, 15 at L10-12; P1 adds +10 flat)
  - `APPLY REACTION.SOLIDIFICATION` to ENEMY with `isForced: 1`
  - `CONSUME INFLICTION CRYO` from ENEMY with `stacks: MAX`
- Top-level clause: CONSUME 100 SP, RECOVER 17 UE (self) + 8.5 UE (team)

### Combo Skill: Auger Angling (VARY_BY SKILL_LEVEL cooldown [9×11, 8 at L12])
- Activation triggers (OR): `ANY OPERATOR CONSUME REACTION from ENEMY` or
  `ANY OPERATOR CONSUME ORIGINIUM_CRYSTAL from ENEMY`
- Animation segment 0.5s TIME_STOP, then 0.8s active segment, then cooldown
- Two sibling damage frames co-located at offset 0.77s in the active segment:
  - **Base frame** (unconditional):
    - RECOVER 10 SP (self)
    - DEAL 10 stagger to ENEMY
    - DEAL physical DMG `[0.33 → 0.75]` × ATTACK (base Auger Angling damage)
  - **Rare Fin frame** (CHANCE-wrapped):
    - `chance = 0.1 + min(0.3, floor(INTELLECT / 10) × VARY_BY TALENT_LEVEL [0, 0.002, 0.005])`
      — base 10% chance, +0.2% / +0.5% per 10 INT at T2 L1 / L2, cap +30%.
      The probability is **display-only** — execution is pin-driven
      (see "CHANCE executor" below).
    - Rare Fin bonus damage: physical DMG `[1.0 → 2.25]` × ATTACK
    - +10 SP (self)
    - At P3+: `APPLY STATUS MAY_THE_WILLING_BITE to TEAM` (nested inside the
      CHANCE hit branch and gated on `HAVE POTENTIAL ≥ 3`)
- Top-level clause: RECOVER UE `[10×5, 12×4, 13×2, 15]` (self)

### Ultimate: One Monster Catch! (100 UE, 2.583s anim TIME_STOP)
- Energy cost: `MULT(100, VARY_BY POTENTIAL [1,1,1,1,0.85,0.85])` —
  P4 Insane Angling Set baked in as 15% cost reduction
- Supplied parameter `ENEMY_DEFEATED` (0–5, default 0): bonus SP = `5 × ENEMY_DEFEATED`
- Damage segment, two sibling frames at 0.417s:
  - **Base frame** (unconditional):
    - RECOVER SKILL_POINT = `VARY_BY SKILL_LEVEL [20×9, 25×3] + VARY_BY ENEMY_DEFEATED [0, 5, 10, 15, 20, 25]`
    - DEAL 20 stagger
    - APPLY CRYO INFLICTION 1 stack
    - DEAL cryo DMG `[4.36 → 9.80]` × ATTACK
  - **P5 low-HP bonus frame** (conditional):
    - Gated on `THIS OPERATOR HAVE POTENTIAL ≥ 5` AND `ENEMY HAVE HP < 50%`
    - DEAL cryo DMG `MULT([4.36 → 9.80], 0.5)` × ATTACK → +50% extra damage

## Statuses

| Status | Target | Duration | Notes |
|---|---|---|---|
| `MAY_THE_WILLING_BITE` | TEAM (COMMON_OWNER_ID) | 10s | P3-gated team buff spawned from the CS CHANCE hit branch. Stacks limit 1 RESET. Clause applies `APPLY STAT ATTACK_BONUS +0.15` to ALL OPERATOR. |

## Potentials

| P | Name | Effect | Status |
|---|---|---|---|
| P1 | Super Salty Comeback | BS SP recovery +10 when CRYO consumed | Baked into BS SP recovery `VARY_BY POTENTIAL [0, 10, 10, 10, 10, 10]` |
| P2 | Calm and Tranquil | Strength +15, Intellect +15 | Loadout-level `APPLY STAT` clause |
| P3 | May the Willing Bite | Rare Fin catch → team ATK +15% 10s | Baked into CS CHANCE hit branch as `APPLY STATUS MAY_THE_WILLING_BITE to TEAM`, gated on `HAVE POTENTIAL ≥ 3` |
| P4 | Insane Angling Set | Ult UE cost −15% | Baked into Ult cost `VARY_BY POTENTIAL [1,1,1,1,0.85,0.85]` |
| P5 | Mega Lunker Rumors | Ult DMG ×1.5 on enemies below 50% HP | Second damage frame at same offset, gated on `HAVE POTENTIAL ≥ 5` AND `ENEMY HAVE HP < 50%` |

## Talents

| Talent | L0 / L1 / L2 | Status |
|---|---|---|
| Forged (passive) | STR gain curve | Stat-only, handled via operator attributeIncrease |
| Flash-frozen for Freshness (T1) | UE gain 0 / 3 / 4 on crystal or solidification; +0 / +6 / +8 when Alesh himself triggered it; 3s cooldown | Self-triggered status event via `APPLY EVENT`. Two trigger branches (`ANY OPERATOR APPLY SOLIDIFICATION to ENEMY` / `ANY OPERATOR APPLY ORIGINIUM_CRYSTAL to ENEMY`). Spawned event has active 2s segment with UE recovery at offset 0 (base clause + conditional bonus gated on `THIS OPERATOR IS TRIGGER OPERATOR`) + 3s `IMMEDIATE_COOLDOWN` segment. Cooldown enforced via `configCache` deriving `cooldownFrames` from the segment. |
| Veteran Angler (T2) | +0.2% / +0.5% Rare Fin catch per 10 INT (max +30%) | Baked into CS CHANCE formula as `VARY_BY TALENT_LEVEL [0, 0.002, 0.005]`. Talent file is description-only. |

## CHANCE executor

CHANCE is **pin-driven, not expectation-weighted**. The probability ValueNode
in `with.value` is display-only; execution is determined by the per-frame
`isChance` pin.

- **Executor** (`eventInterpretorController.doChance`): reads `isChance` pin
  via `shouldFireChance(critMode, pin)` and fires the hit or miss branch:
  `ALWAYS` → hit, `NEVER` → miss, `MANUAL/EXPECTED` → pin or default miss
- **Damage path**: `findDealDamageInClauses` descends into CHANCE wrappers and
  marks `insideChance: true`. The damage builder gates row emission on
  `shouldFireChance` — miss skips the row entirely.
- **Frame pin**: `FrameOverride.isChance` via context menu "Set Chance Hit / Miss",
  only shown on CHANCE-bearing frames (`hasChanceClause`).

## Integration tests

`src/tests/integration/operators/alesh/skills.test.ts` — 23 scenarios:

- **A1–A3**: core skill placement (BS, CS via freeform, Ult)
- **B1**: BS event carries correct skill name
- **C1**: combo cooldown 8s at L12
- **D1**: Ult UE cost P0=100, P4=85
- **D2**: Ult applies cryo infliction
- **E1–E2**: view-layer presentation for BS + Ult
- **F1**: BS against clean enemy — no solidification, no SP bonus
- **F2**: BS against cryo-laden enemy — consumes infliction, applies forced
  solidification, records CONSUMED status
- **G1**: CS damage segment has 2 sibling frames at same offset — base
  (unconditional) + rare fin (CHANCE-wrapped, `insideChance: true`)
- **H1**: Ult carries `ENEMY_DEFEATED` supplied parameter
- **H2**: Ult has 2 damage frames at offset 0.417s — base + P5 HP-gated bonus
- **J1**: BS + cryo → T1 self-trigger event spawns on Alesh with
  `triggerEntityId = slot-0`, total span 3s (2s active + 3s cooldown overlapping)
- **J2**: T1 has active + IMMEDIATE_COOLDOWN segments, frame at offset 0 with
  base + `THIS OPERATOR IS TRIGGER OPERATOR` conditional clauses
- **J3**: BS fired twice within 3s cooldown → only 1 T1 event (cooldown gate)
- **J4**: BS fired twice 7s apart → 2 T1 events (past cooldown)
- **K1**: Applied-but-not-consumed reaction does NOT open combo window (negative)
- **K2**: Activation window config validation — CONSUME REACTION + CONSUME
  ORIGINIUM_CRYSTAL trigger conditions
- **K3**: E2E — Wulfgard EBS consumes combustion → Alesh combo window opens
  at consumption frame with 6s duration
- **K4**: E2E — Endmin originium crystal consumed via Vulnerable → Alesh combo
  window opens
- **I1**: `handleSetChancePins` writes `isChance` pin into override store

## Known TODOs

- **Wiki-verified Rare Fin offset** — colocated at 0.77s by assumption. If the
  wiki lists a distinct offset, update `combo-skill-auger-angling.json` frame[1].
