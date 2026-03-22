# Ember — Skill & Status Coverage

6-star Defender | Heat | Great Sword

## Skills

### Basic Attack: Sword Art of Assault
- 4 segments, Physical DMG
- Seg 4: RECOVER SKILL_POINT 28, DEAL STAGGER 25
- Finisher: Physical DMG [4.0 → 9.0]
- Dive: Physical DMG [0.80 → 1.80]

### Battle Skill: Forward March (1.7s, 100 SP)
- Frame 1 (@0.33s): DEAL HEAT DAMAGE [0.32 → 0.73]
- Frame 2 (@1.27s): DEAL STAGGER 10, APPLY KNOCK_DOWN, DEAL HEAT DAMAGE [1.41 → 3.17]
- Conditional clause: IF THIS OPERATOR IS HIT → DEAL STAGGER 10 (additional)

### Combo Skill: Frontline Support
- Trigger: ENEMY PERFORM NORMAL_ATTACK
- Animation: 0.5s TIME_STOP
- Frame (@0.37s): DEAL STAGGER 10, APPLY KNOCK_DOWN, DEAL PHYSICAL DAMAGE [1.02 → 2.30]
- Cooldown: VARY_BY SKILL_LEVEL [19×11, 18]

### Ultimate: Re-Ignited Oath
- CONSUME ULTIMATE_ENERGY 100
- Animation: 1.63s TIME_STOP
- Frame (@0.04s):
  - DEAL HEAT DAMAGE [2.89 → 6.50]
  - DEAL STAGGER 25
  - APPLY THE_STEEL_OATH STATUS to ALL OPERATOR (shield), HP_MULTIPLIER [0.18 → 0.25], duration 10s
  - IF P5: APPLY THE_STEEL_OATH_EMPOWERED STATUS to THIS OPERATOR, HP_MULTIPLIER [0.18 → 0.25], HP_MULTIPLIER_MODIFIER 1.2

## Statuses (ember-statuses.json)

| ID | Type | Effect |
|----|------|--------|
| INFLAMED_FOR_THE_ASSAULT_TALENT | TALENT | Trigger: cast Forward March or Frontline Support → apply status |
| INFLAMED_FOR_THE_ASSAULT | TALENT_STATUS | PROTECTION [0.3, 0.5] by talent level, max 1 stack |
| PAY_THE_FERRIC_PRICE_TALENT | TALENT | Trigger: enemy deals damage to this operator → apply status |
| PAY_THE_FERRIC_PRICE | TALENT_STATUS | ATTACK_BONUS [0.06, 0.09] by talent level, 7s, max 3 stacks |
| THE_STEEL_OATH | SKILL_STATUS | Shield, 10s, max 1 stack |
| THE_STEEL_OATH_EMPOWERED | POTENTIAL_STATUS | Shield + ATK +10%, 10s, max 1 stack |

## Potentials

| P | Name | Effect |
|---|------|--------|
| P1 | Nomadic Fort | Talent 1: +20% protection, +1.5s on hit |
| P2 | Steel-Hardened Veteran | STR +20, WILL +20 |
| P3 | Indomitable Front | Combo: heal lowest HP teammate at 50% |
| P4 | Undying Embers | Ultimate energy cost -15% |
| P5 | The Steel Oath | Shield ×1.2, ATK +10% while shield active |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Inflamed for the Assault | 30% Protection | 50% Protection |
| Pay the Ferric Price | ATK +6%, 7s, max 3 | ATK +9%, 7s, max 3 |
| Forged (passive) | STR +10/+15/+15/+20 | |
