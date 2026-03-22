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
- Trigger: enemy becomes Vulnerable
- Animation: 0.5s TIME_STOP
- Frame (@0.07s): DEAL STAGGER 10, APPLY LIFT to ENEMY, DEAL PHYSICAL DAMAGE [1.20 → 2.70]
- Cooldown: VARY_BY SKILL_LEVEL [16×11, 15]

### Ultimate: Blade Gale
- CONSUME ULTIMATE_ENERGY VARY_BY POTENTIAL [70, 70, 70, 59.5, 59.5, 59.5]
- Animation TIME_STOP
- Frames 1-6 (@0.3, 0.47, 0.637, 0.77, 0.9, 1.04s): DEAL STAGGER 15, DEAL PHYSICAL DAMAGE [0.36 → 0.81] each
- Frame 7 (@1.8s): DEAL STAGGER 20, DEAL PHYSICAL DAMAGE [4.55 → 10.23]

## Statuses (chen-qianyu-statuses.json)

| ID | Type | Effect |
|----|------|--------|
| SLASHING_EDGE_TALENT | TALENT | Trigger: deal damage with skills → apply status |
| SLASHING_EDGE | TALENT_STATUS | ATTACK_BONUS [0.04, 0.08] by talent level, 10s, max 5 stacks |
| MOMENTUM_BREAKER_TALENT | TALENT | Trigger: interrupt enemy charge → DEAL STAGGER [5, 10] |

## Potentials

| P | Name | Effect |
|---|------|--------|
| P1 | "Shadowless" | DMG +20% vs enemies below 50% HP (IMPLEMENTED_IN_DSL) |
| P2 | Heirloom Martial Arts | AGI +15, Physical DMG +8% |
| P3 | Dual-Wielding Swordmancer | Ascending Strike, Soar to the Stars, Blade Gale: DAMAGE_MULTIPLIER_MODIFIER ×1.1 |
| P4 | Improvised Chi Xiao | Blade Gale energy cost -15% |
| P5 | Bonded with the World | Soar to the Stars CD -3s |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Skirmisher (passive) | AGI +10/+15/+15/+20 | |
| Slashing Edge | ATK +4% per skill hit, 10s, max 5 | ATK +8% |
| Momentum Breaker | Interrupt → +5 stagger | +10 stagger |
