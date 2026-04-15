# Chen Qianyu — Skill & Status Coverage

5-star Guard | Physical | Sword

## Skills

### Basic Attack: Soaring Break
- 5 segments, Physical DMG (fixed from NATURE)
- Seg 1: 2 hits [0.10 → 0.23] each
- Seg 2: 1 hit [0.24 → 0.54]
- Seg 3: 2 hits [0.13 → 0.30] each
- Seg 4: 2 hits [0.15 → 0.34] each
- Seg 5: RECOVER SKILL_POINT, DEAL STAGGER, 1 hit [0.40 → 0.90]
- Finisher: Physical DMG [4.0 → 9.0]
- Dive: Physical DMG [0.80 → 1.80]

### Battle Skill: Ascending Strike (0.83s, 100 SP)
- Frame (@0.43s):
  - DEAL STAGGER 10
  - APPLY LIFT STATUS to ENEMY, duration VARY_BY SKILL_LEVEL [1→2.5]
  - DEAL PHYSICAL DAMAGE [1.69 → 3.80]

### Combo Skill: Soar to the Stars
- Trigger: enemy BECOME VULNERABLE
- Animation: 0.5s TIME_STOP
- Frame (@0.07s): DEAL STAGGER 10, APPLY LIFT to ENEMY, DEAL PHYSICAL DAMAGE [1.20 → 2.70]
- Cooldown: VARY_BY SKILL_LEVEL [16×11, 15]
- Recovers 10 ULTIMATE_ENERGY

### Ultimate: Blade Gale
- CONSUME ULTIMATE_ENERGY VARY_BY POTENTIAL [70, 70, 70, 59.5, 59.5, 59.5]
- Animation TIME_STOP 1.63s
- Frames 1-6 (@0.3, 0.47, 0.637, 0.77, 0.9, 1.04s): DEAL STAGGER 15, DEAL PHYSICAL DAMAGE [0.36 → 0.81] each
- Frame 7 (@1.8s): DEAL STAGGER 20, DEAL PHYSICAL DAMAGE [4.55 → 10.23]
- Note: Wiki says only first and final frames deal stagger, but JSON has stagger on all 7 frames

## Statuses

| ID | Type | Effect |
|----|------|--------|
| SLASHING_EDGE | TALENT (STATUS) | Trigger: PERFORM BS/COMBO/ULT → APPLY THIS EVENT; self: ATTACK_BONUS [0.04, 0.08] by talent level, 10s, max 5 stacks, RESET |
| MOMENTUM_BREAKER_TALENT | TALENT | Trigger: INTERRUPT ENEMY_CHARGE → DEAL STAGGER [5, 10] |

## Potentials

| P | Name | Effect | Status |
|---|------|--------|--------|
| P1 | Shadowless | DMG +20% vs enemies <50% HP | Merged potential+status (id SHADOWLESS_P1, DAMAGE_BONUS +0.2, self-triggers APPLY THIS EVENT on ENEMY HP ≤ 50%) |
| P2 | Heirloom Martial Arts | AGI +15, Physical DMG +8% | |
| P3 | Dual-Wielding Swordmancer | BS, Combo, Ult: DAMAGE ×1.1 | VARY_BY POTENTIAL [1,1,1,1.1,1.1,1.1] |
| P4 | Improvised Chi Xiao | Blade Gale energy cost ×0.85 | VARY_BY POTENTIAL [1,1,1,1,0.85,0.85] |
| P5 | Bonded with the World | Combo CD -3s | Modifier: SUBTRACT 3s when HAVE POTENTIAL GREATER_THAN_EQUAL 5 |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Skirmisher (passive) | AGI +10/+15/+15/+20 | |
| Slashing Edge | ATK +4% per skill hit, 10s, max 5 | ATK +8% |
| Momentum Breaker | Interrupt → +5 stagger | +10 stagger |

## Test Coverage

| Test File | Mechanics Covered |
|-----------|-------------------|
| `slashingEdge.test.ts` | ✓ Slashing Edge from BS (1 stack, 5-stack cap, RESET, labels) |
| `slashingEdgeAllSkills.test.ts` | ✓ Slashing Edge from combo, ultimate, mixed rotation, duration RESET |
| `lift.test.ts` | ✓ Vulnerable → Lift from 2nd BS |
| `comboSkillTrigger.test.ts` | ✓ Combo freeform placement, Lift+Vuln from combo, BS+combo interaction, cooldown block/expire |
| `ultimateBladeGale.test.ts` | ✓ Ultimate availability, TIME_STOP segment, 7 damage frames, energy cost from game data |
| `basicAttackVariants.test.ts` | ✓ Normal BA default, Dive/Finisher not in BA column (frame data only), event placement |
| `potentialEffects.test.ts` | ✓ P4 energy cost reduction (70→59.5), P5 cooldown (modifier not yet resolved), P3 pipeline |
| `freeformInflictionTalent.test.ts` | ✓ Freeform infliction does NOT trigger Slashing Edge (verb filtering) |

## TODOs

- **Combo trigger (BECOME VULNERABLE):** Fixed — `VULNERABILITY` → `VULNERABLE` alias added to `statusIdToColumnId()` in `triggerMatch.ts`. Combo windows now generate correctly from BS's Lift application.
- Momentum Breaker talent: INTERRUPT ENEMY_CHARGE trigger not modelable — engine has no enemy charge mechanic
- P1 Shadowless: onTrigger with ENEMY HP threshold — needs engine support for HP-based conditional status activation
- P2 stat bonuses (AGI +15, Physical DMG +8%): not directly testable via integration tests (stat application)
- Dive/Finisher BA variants: exist as frame data but not surfaced in BA column. May need engine support for conditional variant availability (mid-air, near staggered enemy)
- Wiki/JSON discrepancy: wiki says only first and final ult strikes deal stagger, JSON has stagger on all 7 frames — verify in-game
- Lift duration scaling by skill level (1s→2.5s): covered partially in lift.test.ts at default level, not tested across levels
