# Gilberta — Skill & Status Coverage

6-star Supporter | Nature | Arts Unit

## Skills

### Basic Attack: Arcane Staff: Beam Cohesion Arts
- 4 segments, Nature DMG (fixed from PHYSICAL)
- Seg 2: 2 hits, Seg 3: 3 hits, Seg 4: 3 hits
- Seg 4: RECOVER SKILL_POINT, DEAL STAGGER 16
- Finisher: Nature DMG [4.0 → 9.0]
- Dive: Nature DMG [0.80 → 1.80]

### Battle Skill: Arcane Staff: Gravity Mode (100 SP)
- Frames 0-3 (pull ticks @0.97, 1.53, 2.067, 2.6s): DEAL NATURE DAMAGE [0.2425 → 0.5475] each (total pull = [0.97 → 2.19])
- Frame 4 (explosion @3.6s): DEAL NATURE DAMAGE [0.58 → 1.30], DEAL STAGGER 10, APPLY NATURE INFLICTION

### Combo Skill: Arcane Staff: Matrix Displacement
- Trigger: Arts Reaction applied to enemy
- Animation: 0.5s TIME_STOP
- Frame: DEAL STAGGER 5, DEAL NATURE DAMAGE [1.40 → 3.15], APPLY LIFT
- Cooldown: VARY_BY SKILL_LEVEL [20×11, 19]

### Ultimate: Arcane Staff: Gravity Field (energy VARY_BY POTENTIAL [90, 90, 90, 76.5, 76.5, 76.5])
- Animation TIME_STOP
- Frame: DEAL STAGGER 20, APPLY NATURE INFLICTION, DEAL NATURE DAMAGE [3.33 → 7.50], APPLY SLOW (80%, 5s), APPLY ARTS_SUSCEPTIBILITY ([18%→30%] + [1.8%→3%] per Vulnerability stack, 5s)

## Statuses (gilberta-statuses.json)

| ID | Type | Effect |
|----|------|--------|
| MESSENGERS_SONG | TALENT_STATUS | All Guards/Casters/Supporters: Ultimate Energy Gain +[4%, 7%], passive |
| LATE_REPLY_TALENT | TALENT | Trigger: hit 2+ enemies with combo/battle skill final → heal controlled operator [72+INT×0.6, 108+INT×0.9] |

## Potentials

| P | Name | Effect |
|---|------|--------|
| P1 | Above the Clouds | Gravity Mode radius +20% |
| P2 | Wind Walker | Ult: double Arts Susceptibility per Vulnerability, treat as +1 stack (max 4) |
| P3 | Quick, Gentle Steps | Messenger's Song +5% ult gain efficiency |
| P4 | Dances with Clouds | Ult energy -15% |
| P5 | Special Mail | Combo CD -2s, DAMAGE_MULTIPLIER_MODIFIER ×1.3 |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Stalwart (passive) | WILL +10/+15/+15/+20 | |
| Messenger's Song | Guards/Casters/Supporters: ult gain +4% | +7% |
| Late Reply | Hit 2+ enemies → heal [72+INT×0.6] | [108+INT×0.9] |
