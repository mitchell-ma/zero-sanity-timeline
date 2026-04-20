# Zhuang Fangyi — Skill & Status Coverage

6-star Striker | Electric | Arts Unit | Main stat WILL, secondary INTELLECT

Kit orbits around **Sunderblades**: Mantra of Sundering consumes the target's
Electrification to spawn up to 3 Sunderblades per cast, then fires a per-blade
Thunder Strike chain whose final strike is 6× damage. The ultimate transforms
her into the Empyrean of Truth, swapping in enhanced BA/BS/CS variants and
guaranteeing a free, full-conversion first cast of Mantra.

## Skills

### Basic Attack: Jolting Arts
- BATK: 5 sequences, Electric DMG. Final Strike: 18 Stagger + PERFORM FINAL_STRIKE.
- Dive: mid-air Electric DMG.
- Finisher: near a staggered enemy — large Electric DMG + SP recovery.
- Enhanced variants (BATK only) swap in during Smiting Tempest; Finisher is
  DISABLED for the ult duration (see `ultDisablesFinisher.test.ts`).

### Battle Skill: Mantra of Sundering (2s, 100 SP)
- **Frame @0s** (seed): SNAPSHOT + CONSUME(MAX) ELECTRIFICATION from ENEMY;
  APPLY SUNDERBLADE to OPERATOR with stacks = `MIN(3, 1 + snapshot_level(ELECTRIFICATION))`;
  DEAL 15 Stagger. P3 conditional (potential ≥3 AND Electrification level ≥1 consumed):
  `RETURN 10 SP`.
- **Frames @0.5s–1.55s** (Thunder Strike chain, 8 frames): each gated on
  `SUNDERBLADE stacks ≥ N` (N = 2..9), so the chain length matches the number
  of blades actually held. Per strike:
  - DEAL ELECTRIC DAMAGE
    `MULT((SL_base + snapshot_elec_level × SL_scale) × P1_potential_mult, ATK)`
  - RECOVER 6 UE
  - APPLY FORCE_OF_NATURE_T1 with value = `ADD(TL_amp_base, N × TL_per_strike)`
- **Frame @1.7s** (final strike, unconditional): same damage expression but
  **×6**. Final APPLY FORCE_OF_NATURE_T1 scales its per-strike bump by the
  actual **SUNDERBLADE stack count** on the operator (not the index), so the
  last amp bump reflects how many blades landed.
- CONSUME 100 SP at segment end (not frame-0) — keeps UE-from-SP accounting in
  the normal path.
- **SL multipliers**: `[0.20, 0.22, 0.24, 0.26, 0.28, 0.30, 0.32, 0.34, 0.36, 0.39, 0.42, 0.45]`
- **P1 per-hit potential multiplier**: `VARY_BY POT [1, 1.15, 1.15, 1.15, 1.15, 1.15]` (baked)

### Battle Skill Enhanced: Mantra of Sundering Enhanced
- Same chain shape as the regular variant with higher DMG multipliers and an
  **APPLY ELECTRIC INFLICTION to ENEMY** on the final strike.
- Swapped in during Smiting Tempest (ult). The first cast during the ult is a
  **free, full-conversion cast** — no SP or Electrification consumed, guaranteed
  3 Sunderblades (see `smitingTempestFreeCast.test.ts`).

### Combo Skill: Breath of Transformation
- **Trigger**: CONTROLLED OPERATOR PERFORM FINAL_STRIKE or FINISHER + ENEMY HAVE
  ELECTRIC INFLICTION. 6s activation window, max 1 skill per activation.
- Animation: 0.5s TIME_STOP.
- Frame @0.5s (unconditional): DEAL 10 Stagger + DEAL ELECTRIC DAMAGE
  `VARY_BY SL [1.6→3.6] × ATK`.
- Frame @0.5s conditional (ENEMY HAVE ELECTRIC INFLICTION):
  - Force-APPLY ELECTRIFICATION to ENEMY with statusLevel `ADD(1, current_level)`
    (raises existing Electrification by +1).
  - RECOVER UE `MULT(10, stacks of ELECTRIC INFLICTION of ENEMY)`.
  - CONSUME ELECTRIC INFLICTION MAX from ENEMY.
- Cooldown: `VARY_BY SL [18×11, 17]s`.

### Combo Skill Enhanced: Breath of Transformation Enhanced
- Same effect graph as regular CS (unconditional + conditional clauses share
  shapes verbatim — see `zhuangFangyiEnhancedComboSkill.test.ts`).
- DMG multipliers scaled 1.5×: `[2.4, 2.64, 2.88, 3.12, 3.36, 3.6, 3.84, 4.08, 4.32, 4.62, 4.98, 5.4]`.
- Cooldown = `MULT(0.25, base_cd)` → effective `[4.5×11, 4.25]s`. Structured
  expression, not flattened — the `MULT(0.25, …)` shape is pinned by tests.
- Swapped in during Smiting Tempest.

### Ultimate: Smiting Tempest (240 UE → 204 at P4+)
- Activation: THIS OPERATOR IS CONTROLLED (can only be cast while in control).
- CONSUME ULTIMATE_ENERGY = `MULT(240, VARY_BY POT [1,1,1,1,0.85,0.85])`.
- 2s animation TIME_STOP.
- 25s Empyrean of Truth segment:
  - IGNORE ULTIMATE_ENERGY on THIS OPERATOR (no UE gain during the ult).
  - ENABLE JOLTING_ARTS_BATK_ENHANCED / MANTRA_OF_SUNDERING_ENHANCED /
    BREATH_OF_TRANSFORMATION_ENHANCED; DISABLE their regular counterparts
    plus JOLTING_ARTS_FINISHER.
  - Frame @0s: APPLY SMITING_TEMPEST_BATTLE (25s).
  - P5 conditional (potential ≥5): APPLY STORM_OF_TRANSFORMATION_P5 (25s)
    for the Electric RES pierce effect.

## Statuses

| ID | Type | Target | Effect |
|----|------|--------|--------|
| SUNDERBLADE | SKILL_STATUS | OPERATOR (THIS) | Max 9 stacks, RESET interaction. Duration `ADD(36, VARY_BY POT [0,0,0,10,10,10])`s. Consumed one-per-strike by Mantra of Sundering. |
| SMITING_TEMPEST_BATTLE | SKILL_STATUS | OPERATOR (THIS) | Max 1 stack, RESET. 25s. Marker for the ult's active window. |
| FORCE_OF_NATURE_T1 | TALENT status | OPERATOR (THIS) | 5s, max 1 stack RESET. APPLY ELECTRIC AMP — value seeded at BS cast then bumped per Thunder Strike hit (see Talents). |
| STORM_OF_TRANSFORMATION_P5 | POTENTIAL status | OPERATOR (THIS) | Applied only at P5 during the ult — vehicle for the 15 Electric RES pierce. |

## Potentials

| P | Name | Effect | Implementation |
|---|------|--------|----------------|
| P1 | Four Symbols of Harmony | BS DMG ×1.15; first BS cast creates +1 Sunderblade (exceeds per-cast limit) | `VARY_BY POT [1, 1.15×5]` on every per-strike and final-strike damage. Separate onTriggerClause fires on BS + EVENT OCCURRENCE = 1 + P≥1 → applies a 2s status whose frame-0 APPLYs 1 extra SUNDERBLADE stack. |
| P2 | Acuity of Fine Details | Will +20, BS DMG +15% | Loadout aggregator (flat stat + damage category boost). |
| P3 | Sense and Response | BS RETURN 10 SP on Electric consume; Sunderblade duration +10s | Conditional `RETURN 10 SP` on Mantra frame-0 gated on P≥3 + consumed Electrification level ≥1. Sunderblade duration `VARY_BY POT [0,0,0,10,10,10]` baked. |
| P4 | Absolute Composure | Ult UE cost −15% | `VARY_BY POT [1,1,1,1,0.85,0.85]` on the ult's CONSUME ULTIMATE_ENERGY (240 × 0.85 = 204). |
| P5 | Storm of Transformation | Ult ignores 15 Electric RES | Conditional APPLY STORM_OF_TRANSFORMATION_P5 at ult frame 0. The pierce itself lives on the status; the ult simply gates + applies it. |

## Talents

| Talent | L1 | L2 |
|--------|----|----|
| Stalwart (attribute increase) | Will +10/+15/+15/+20 (by AI level) | |
| Force of Nature (T1) | +9% Electric Amp 5s on BS cast; +1% per Thunder Strike hit; BS recast resets the amp | +18% Electric Amp 5s on BS cast; +2% per hit |
| Ordained by Heaven (T2) | 9% DMG-immunity chance (+1% per nearby Sunderblade); on-immunity-trigger restore 9% Max HP (99s ICD) | Restore 18% Max HP on trigger |

T1 mechanics: `onTriggerClause` fires on `THIS OPERATOR PERFORM BATTLE` →
APPLY FORCE_OF_NATURE_T1 to THIS OPERATOR. The status is a 5s APPLY ELECTRIC AMP
with value `VARY_BY TL [0, 0.09, 0.18]`. Inside Mantra of Sundering, each
Thunder Strike frame re-APPLYs FORCE_OF_NATURE_T1 with the ADD-scaled value
(`base_amp + N × per_strike`), and the final strike scales by the actual
SUNDERBLADE stack count — giving a monotonically increasing amp envelope
across the chain that ends at the full "base + stacks × per_strike" value.

## Expected Stats

Pinned reference: Zhuang Fangyi L80, P0, TL2/L2, Stalwart L1 + Lone Barge L80
(skills L4/L7/L2), no gear. Values verified against the in-app operator panel:

- Operator ATK: 293 · Weapon ATK: 458 · Base ATK: 751
- ATK Boost [L] L7: +29% → totalAttack 968.79
- WILL: `166.35388 (op) + 10 (Stalwart L1) + 68 (Will Boost [L] L4) = 244.35388`
- INTELLECT: 111.90006 (operator only)
- mainAttrBonus `0.005 × floor(244.35388) = 1.22`, secAttrBonus `0.002 × 111 = 0.222`
- attributeBonus = `1 + 1.22 + 0.222 = 2.442` → effectiveAttack ≈ 2365.79
- CRITICAL_RATE 0.05, CRITICAL_DAMAGE 0.5, ELECTRIC_DAMAGE_BONUS 0.192 (from Lone Barge L2)
- effectiveHp = `4934 + 5 × floor(89) = 5379`

## Integration Test Coverage

- `mantraOfSundering.test.ts` — BS placement, Sunderblade spawn on
  Electrification consume, Thunder Strike chain gate by stack count.
- `forceOfNatureAmp.test.ts` — T1 amp seeding + per-strike increment + final
  strike scaling by stack count.
- `stormOfTransformation.test.ts` — P5 status application gated on potential ≥5.
- `breathOfTransformationControlledGate.test.ts` — CS trigger requires
  CONTROLLED operator PERFORM FINAL_STRIKE/FINISHER.
- `breathOfTransformationConsumeApply.test.ts` — CS conditional: force-APPLY
  ELECTRIFICATION with statusLevel +1, RECOVER UE per infliction stack,
  CONSUME MAX.
- `smitingTempestFreeCast.test.ts` — first BS cast during ult is free
  (no SP, guaranteed 3 Sunderblades).
- `ultDisablesFinisher.test.ts` — Finisher BATK is DISABLED during the ult.
- `potentials.test.ts` — P1 first-cast +1 Sunderblade, P3 SP RETURN gate, P4
  UE cost reduction, P5 pierce status.

Unit tests:
- `zhuangFangyiStats.test.ts` — loadout aggregator parity with in-app panel
  (see Expected Stats above).
- `zhuangFangyiEnhancedComboSkill.test.ts` — enhanced CS damage table,
  structured MULT(0.25, …) cooldown expression, effect-shape parity with
  regular CS.

## Remaining Work

_(none — kit is fully wired and reconciled against in-game values.)_
