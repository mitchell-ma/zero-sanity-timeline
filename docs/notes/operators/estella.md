# Estella — Skill & Status Coverage

4-star Guard | Cryo | Polearm

## Skills

### Basic Attack: Audio Noise
- 4 segments, Physical DMG (fixed from HEAT)
- Seg 3: 2 hits [0.15+0.20]
- Seg 4: RECOVER SKILL_POINT, DEAL STAGGER 17
- Finisher: Physical DMG [4.0 → 9.0]
- Dive: Physical DMG [0.80 → 1.80]

### Battle Skill: Onomatopoeia (100 SP)
- Frame: DEAL STAGGER 10, APPLY CRYO INFLICTION (1 stack), DEAL CRYO DAMAGE [1.56 → 3.50]

### Combo Skill: Distortion
- Trigger: enemy suffers Solidification
- Animation: 0.5s TIME_STOP
- IF ENEMY NOT_HAVE SOLIDIFICATION: DEAL STAGGER 10, APPLY LIFT, DEAL PHYSICAL DAMAGE [1.60 → 3.60]
- IF ENEMY HAVE SOLIDIFICATION: DEAL STAGGER 10, APPLY LIFT, DEAL PHYSICAL DAMAGE [2.80 → 6.30], APPLY PHYSICAL_SUSCEPTIBILITY [10%→15%] 6s
- Note: Mutually exclusive paths — each is a single hit instance for crit calculation
- Cooldown: VARY_BY SKILL_LEVEL [18×11, 17]

### Ultimate: Tremolo (energy VARY_BY POTENTIAL [70, 63×5])
- Animation TIME_STOP
- Frame: DEAL STAGGER [15×9, 20×3], DEAL PHYSICAL DAMAGE [4.89 → 11.00]
- IF ENEMY HAVE PHYSICAL_SUSCEPTIBILITY: APPLY LIFT (isForced)

## Statuses (estella-statuses.json)

| ID | Type | Effect |
|----|------|--------|
| COMMISERATION_TALENT | TALENT | Trigger: Shatter → apply status |
| COMMISERATION | TALENT_STATUS | Next Onomatopoeia returns SP [7.5, 15], max 1, consumed on cast |

## Potentials

| P | Name | Effect |
|---|------|--------|
| P1 | Habitual Delay | Distortion: Susceptibility duration +3s |
| P2 | Lowered Expectations | Ult energy -10% |
| P3 | Delayed Work | Onomatopoeia: range +50%, DMG +40% to first enemy |
| P4 | Life Over Mission | WILL +10, STR +10 |
| P5 | Survival is a Win | After Solidification → +5 ult energy (1s CD) (IMPLEMENTED_IN_DSL) |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Stalwart (passive) | WILL +10/+15/+15/+20 | |
| Commiseration | Shatter → next battle skill returns 7.5 SP | 15 SP |
| Laziness Pays Off Now | | Ignore Cryo Infliction, -10%/-20% Cryo DMG taken |
