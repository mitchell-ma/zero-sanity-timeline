# Avywenna — Skill & Status Coverage

5-star Striker | Electric | Polearm

## Skills

### Basic Attack: Thunderlance: Blitz
- 5 segments, Physical DMG
- Seg 5 (Final Strike): 17 stagger, PERFORM FINAL_STRIKE
- Dive: Physical DMG [0.80 → 1.80]
- Finisher: Physical DMG [4.0 → 9.0]

### Battle Skill: Thunderlance: Interdiction (1.13s, 100 SP)
- Frame @0.6s:
  - DEAL STAGGER 5
  - DEAL ELECTRIC DAMAGE MULT(VARY_BY SL [0.67→1.5], VARY_BY POT [1,1,1,1,1,1.15])
  - IF HAVE THUNDERLANCE: DEAL ELECTRIC DAMAGE [0.75→1.68] per lance × P5 1.15, STAGGER 5, CONSUME, RECOVER UE ADD(TL [0,3,4], POT [0,2,2,2,2,2])
  - IF HAVE THUNDERLANCE_EX: DEAL ELECTRIC DAMAGE [1.92→4.32] per EX × P5 1.15, STAGGER 10, APPLY ELECTRIC INFLICTION, CONSUME, RECOVER UE

### Combo Skill: Thunderlance: Strike
- Trigger: CONTROLLED OPERATOR PERFORM FINAL_STRIKE + ENEMY HAVE ELECTRIC INFLICTION or IS ELECTRIFIED
- Animation: 0.5s TIME_STOP
- Frame @0s: DEAL STAGGER 10, DEAL ELECTRIC DAMAGE [1.69→3.80], APPLY THUNDERLANCE (3 stacks)
- Cooldown: VARY_BY SL [13×11, 12]

### Ultimate: Thunderlance: Final Shock (100 energy)
- Animation: 1.53s TIME_STOP
- Frame @0.17s:
  - DEAL STAGGER VARY_BY SL [15×9, 20×3]
  - DEAL ELECTRIC DAMAGE [4.22→9.50]
  - APPLY THUNDERLANCE_EX (1 stack)
  - APPLY ELECTRIC SUSCEPTIBILITY VARY_BY TL [0, 0.06, 0.10] 10s (T2 baked)

## Statuses

| ID | Type | Target | Effect |
|----|------|--------|--------|
| THUNDERLANCE | SKILL_STATUS | OPERATOR (THIS) | Max 4 stacks, NONE interaction, duration ADD(30, VARY_BY POT [0,0,20,20,20,20])s |
| THUNDERLANCE_EX | SKILL_STATUS | OPERATOR (THIS) | Max 1 stack, NONE interaction, same duration formula |

## Potentials

| P | Name | Effect | Implementation |
|---|------|--------|----------------|
| P1 | Doubling Down | T1 UE gain +2 per lance hit | Baked: ADD(VARY_BY TL, VARY_BY POT [0,2,2,2,2,2]) on BS UE recovery |
| P2 | Pole of Menace | Thunderlance/EX duration +20s | Baked: VARY_BY POTENTIAL in status duration |
| P3 | Hard Negotiator | Will +15, Electric DMG +8% | Loadout aggregator |
| P4 | Very Experienced | UE cost -15% | Baked: VARY_BY POTENTIAL on UE cost (100 × 0.85 = 85) |
| P5 | Carrot and Sharp Stick | Returning lances on Electric Susceptible enemy → 1.15× DMG | Baked: VARY_BY POTENTIAL on BS damage. Condition (Electric Susceptible) not modeled |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Stalwart (passive) | Will +10/+15/+15/+20 | |
| Expedited Delivery | +3 UE per lance hit | +4 UE per lance hit |
| Tactful Approach | Ult +6% Electric Susceptibility 10s | +10% Electric Susceptibility 10s |

## E2E Test Coverage (16 tests)

- A1-A3: Core skill placement (BS, CS freeform, ULT)
- B1: Battle skill correct ID + view
- C1: Combo cooldown 12s at L12
- D1-D2: UE cost P0=100 / P4=85, animation segment
- E1: Thunderlance status registered (OPERATOR target)
- F1-F2: View layer (BS + CS in presentation)
- G1: Combo deploys THUNDERLANCE (3 stacks on operator)
- H1: Ult deploys THUNDERLANCE_EX (1 stack on operator)
- I1: BS consumes THUNDERLANCE from combo
- I2: BS without lances (negative)
- J1: BS retrieval with THUNDERLANCE_EX applies Electric Infliction
- K1 (skipped): T2 susceptibility — VARY_BY TL [0,0.06,0.10] resolves to 0 at default TL0

## Remaining Work

- P5 conditional: 1.15× only on Electric Susceptible enemies (condition not modeled, flat multiplier)
- T2 susceptibility test: needs non-zero talent level to verify
