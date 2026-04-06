# Lifeng — Skill & Status Coverage

6-star Guard | Physical | Polearm

## Skills

### Basic Attack: Ruination
- 4 segments, Physical DMG
- Seg 1: 2 hits [0.12 → 0.275] each (sum 24% → 55%)
- Seg 2: 1 hit [0.29 → 0.65]
- Seg 3: 1 hit [0.35 → 0.79]
- Seg 4: 2 hits [0.24 → 0.55] each — wiki says 68%→152% total but End-Axis has 48%→110% (possible missing Warfarin merge)
- Finisher: Physical DMG [4.0 → 9.0]
- Dive: Physical DMG [0.80 → 1.80]
- Last frame has `frameTypes: ["FINAL_STRIKE"]` for combo activation window

### Battle Skill: Turbid Avatar (2.23s, 100 SP)
- Frame 1 (@0.23s): DEAL PHYSICAL DAMAGE [0.38 → 0.86]
- Frame 2 (@0.67s): DEAL PHYSICAL DAMAGE [0.38 → 0.86]
- Frame 3 (@1.8s):
  - DEAL STAGGER 10
  - APPLY KNOCK_DOWN to ENEMY (not forced — requires Vulnerable)
  - DEAL PHYSICAL DAMAGE [1.19 → 2.68]
  - IF ENEMY HAVE VULNERABLE INFLICTION LESS_THAN_EQUAL VARY_BY POTENTIAL [0,2,2,2,2,2]: APPLY PHYSICAL_SUSCEPTIBILITY [ADD(VARY_BY SL, VARY_BY POT +0.05)] duration 12s

### Combo Skill: Aspect of Wrath
- Trigger: CONTROLLED OPERATOR PERFORM FINAL_STRIKE + ENEMY HAVE PHYSICAL_SUSCEPTIBILITY or BREACH
- Animation: 0.5s TIME_STOP
- Frame 1 (@0.13s): DEAL PHYSICAL DAMAGE [0.47 → 1.05]
- Frame 2 (@1.1s): DEAL STAGGER 10, DEAL PHYSICAL DAMAGE [1.67 → 3.75], APPLY LINK TO TEAM (20s)
- Cooldown: VARY_BY SKILL_LEVEL [16×11, 15]

### Ultimate: Heart of the Unmoving (90 energy)
- Animation: 1.867s TIME_STOP
- Seg 2 "Sequence 1" (2.2s, @2.13s): DEAL STAGGER 5, APPLY KNOCK_DOWN, DEAL PHYSICAL DAMAGE [1.78 → 4.00] (atk_scale1)
- Seg 3 "Sequence 2" (2.03s, @1.93s): DEAL STAGGER 5, APPLY KNOCK_DOWN, DEAL PHYSICAL DAMAGE [1.78 → 4.00] (atk_scale2)
- Seg 4 "Vajra Impact" (conditional: MULT(STACKS of LINK of EVENT, 2.03s), @1.93s):
  - Duration = 0 when no LINK consumed, 2.03s when LINK consumed
  - DEAL STAGGER 5, DEAL PHYSICAL DAMAGE [2.67 → 6.00] (atk_scale3)
  - Uses STACKS of LINK of EVENT ValueNode for runtime conditional duration

## Statuses

| ID | Type | Target | Effect |
|----|------|--------|--------|
| ILLUMINATION_TALENT | TALENT_STATUS | OPERATOR | ATK bonus = MULT(ADD(TL [0.001, 0.0015], POT [0,0,0,0.0005,0.0005,0.0005]), ADD(WILL, INTELLECT)) |
| SUBDUER_OF_EVIL_TALENT | TALENT | — | Trigger: THIS OPERATOR APPLY PHYSICAL KNOCK_DOWN → DEAL PHYSICAL DAMAGE [0.5, 1.0] ATK |
| SUBDUER_OF_EVIL_P5 | POTENTIAL_STATUS | ENEMY | Physical DMG 250% ATK + 5 stagger, 2s active + 13s COOLDOWN cycle |
| SUBDUER_OF_EVIL_P5_TALENT | TALENT | — | Trigger: APPLY KNOCK_DOWN + HAVE POTENTIAL >= 5 → APPLY SUBDUER_OF_EVIL_P5 TO ENEMY |
| LINK | SKILL_STATUS | TEAM | 20s, max 4 stacks REFRESH, consumed by BS/ULT at EVENT_START |

## Potentials

| P | Name | Effect | Implementation |
|---|------|--------|----------------|
| P1 | Breaking the Obsession | BS Susceptibility +5%, triggers on ≤2 Vulnerable | Baked: VARY_BY POTENTIAL on condition threshold + susceptibility value |
| P2 | Self Refinement | All attributes +15 | Loadout aggregator |
| P3 | Spiritual Cultivation | Illumination +0.05% per INT/WILL | Baked: VARY_BY POTENTIAL in T1 formula |
| P4 | Brief Instant | UE cost -15% | Baked: VARY_BY POTENTIAL on UE cost (90 × 0.85 = 76.5) |
| P5 | Unremitting | Every 15s, next Subduer of Evil +250% ATK + 5 stagger | SUBDUER_OF_EVIL_P5_TALENT + SUBDUER_OF_EVIL_P5 status, gated HAVE POTENTIAL >= 5 |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Skirmisher (passive) | AGI +10/+15/+15/+20 | |
| Illumination | ATK +0.10% per INT+WILL | ATK +0.15% per INT+WILL |
| Subduer of Evil | Knock Down → 50% ATK Phys DMG | 100% ATK Phys DMG |

## E2E Test Coverage (25 tests)

- A1-A3: Core skill placement (BS, CS freeform, ULT)
- B1-B2: Knock Down Vulnerable gate (single BS no KD, double BS KD)
- C1-C2: LINK 20s duration, cooldown 16s/15s
- D1-D2: UE cost P0=90 / P4=76-77, LINK exists after combo
- E1-E2: View layer (BS + all skills in presentation)
- F1-F4: Subduer of Evil (KD trigger, negative no KD, P5 on ENEMY with Physical, P5 negative at P0)
- G1-G2: Vajra Impact (without LINK: 0 duration, with LINK: real duration + consumed)
- H1-H2: ULT Knock Down not forced (first hit Vulnerable, second hit KD; BS+ULT KD)
- I1-I2: P1 susceptibility threshold (P1 with 1-2 Vulnerable, P0 blocks at 1 Vulnerable)
- K1-K4: Combo activation (BS+susceptibility, Lifeng controlled BA, Akekuri controlled negative, Akekuri controlled BA)

## Known Issues
- Basic attack seg 4 multiplier sum (48%) doesn't match wiki (68%) — possible Warfarin merge issue with multi-hit segment
