# Snowshine — Skill & Status Coverage

5-star Defender | Cryo | Great Sword

## Skills

### Basic Attack: Hypothermic Assault
- 3 segments, Physical DMG (fixed from CRYO)
- Seg 3: 2 frames, RECOVER SKILL_POINT, DEAL STAGGER 23
- Finisher: Physical DMG [4.0 → 9.0]
- Dive: Physical DMG [0.80 → 1.80]

### Battle Skill: Saturated Defense (4.5s, 100 SP)
- Frame (@3.57s):
  - RECOVER SKILL_POINT 30
  - DEAL STAGGER 20
  - APPLY PROTECTION STATUS (0.9) to THIS OPERATOR
  - APPLY CRYO INFLICTION (1 stack) to ENEMY
  - DEAL CRYO DAMAGE [2.0 → 4.5]
- Note: Retaliation on enemy attack during shield raise

### Combo Skill: Polar Rescue (healing, no damage)
- Trigger: controlled operator attacked below 60% HP
- Healing skill (initial + continuous treatment)
- Cooldown: VARY_BY SKILL_LEVEL [25×8, 24×3, 23] — L1-L8: 25s, L9-L11: 24s, L12: 23s (per endfield.wiki.gg)

### Ultimate: Frigid Snowfield (80 energy)
- Animation: 1.983s TIME_STOP
- Frame (@0.087s):
  - DEAL STAGGER [15×9, 20×3]
  - DEAL CRYO DAMAGE [2.0 → 4.5]
  - APPLY SNOW_ZONE STATUS (5s, 0.5s interval, DOT [0.29 → 0.65], applies Solidification)

## Statuses (snowshine-statuses.json)

| ID | Type | Effect |
|----|------|--------|
| POLAR_SURVIVAL | TALENT_STATUS | Treatment Effect +[15%, 25%] for targets below [45%, 55%] HP |
| SAR_PROFESSIONAL_TALENT | TALENT | Trigger: retaliate enemy → RECOVER ULTIMATE_ENERGY [6, 10] |

## Potentials

| P | Name | Effect |
|---|------|--------|
| P1 | Cold Shelter | Protection blocks Arts Inflictions |
| P2 | Storm Region | Ult effect radius +20% |
| P3 | Polar Survival Guide | Ult Solidification duration +2s |
| P4 | Tundra Aegis | DEF +20, WILL +20 |
| P5 | Cold Disaster Specialist | Retaliation returns 10 SP |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Forged (passive) | STR +10/+15/+15/+20 | |
| Polar Survival | Treatment +15% below 45% HP | +25% below 55% HP |
| SAR Professional | Retaliation → +6 ult energy | +10 ult energy |
