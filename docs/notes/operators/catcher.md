# Catcher — Skill & Status Coverage

4-star Defender | Physical | Great Sword

## Skills

### Basic Attack: Basic Tactics
- 4 segments, Physical DMG (fixed from CRYO)
- Seg 4: RECOVER SKILL_POINT, DEAL STAGGER 22
- Finisher: Physical DMG [4.0 → 9.0]
- Dive: Physical DMG [0.80 → 1.80]

### Battle Skill: Rigid Interdiction (100 SP)
- Frame 0 (@0s): APPLY PROTECTION (0.9) to ALL OPERATOR, RECOVER SKILL_POINT 30
- Frame 1 (@2.77s, retaliation):
  - DEAL STAGGER 20
  - APPLY VULNERABILITY (1 stack) to ENEMY
  - DEAL PHYSICAL DAMAGE [1.78 → 4.0]
  - IF P5: RECOVER SKILL_POINT 10

### Combo Skill: Timely Suppression
- Trigger: enemy charges or operator below 40% HP
- Animation: 0.5s TIME_STOP
- Frame (@0.07s): DEAL STAGGER 10, DEAL PHYSICAL DAMAGE [1.0 → 2.25], APPLY SHIELD (shieldBase + defAdditive, 10s)
- Cooldown: VARY_BY SKILL_LEVEL [35×11, 33]

### Ultimate: Textbook Assault (energy VARY_BY POTENTIAL [80, 80, 80, 72, 72, 72])
- Animation TIME_STOP
- Frame 1 (@0.23s): DEAL STAGGER 5, DEAL PHYSICAL DAMAGE [0.89 → 2.0], APPLY WEAKEN [20%→30%] 8s
- Frame 2: DEAL STAGGER 5, DEAL PHYSICAL DAMAGE [1.20 → 2.70]
- Frame 3: DEAL STAGGER 10, APPLY KNOCK_DOWN, DEAL PHYSICAL DAMAGE [1.78 → 4.0]

## Statuses (catcher-statuses.json)

| ID | Type | Effect |
|----|------|--------|
| RESILIENT_DEFENSE | TALENT_STATUS | DEF +[1.0, 1.2] per 10 WILL, passive |
| COMPREHENSIVE_MINDSET_TALENT | TALENT | Trigger: final hit → [2, 3] shockwaves at [30%, 45%] ATK Physical DMG |

## Potentials

| P | Name | Effect |
|---|------|--------|
| P1 | Multi-layered Readiness | Battle skill/ult hit → extra [300+DEF×5] Physical DMG (IMPLEMENTED_IN_DSL) |
| P2 | Bonus Spec Training | DEF +20, WILL +10 |
| P3 | Unwavering Post | Combo shield duration +5s |
| P4 | Compensated Suffering | Ult energy -10% |
| P5 | Choice Without Regrets | Retaliation returns 10 SP (baked into battle skill) |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Forged (passive) | STR +10/+15/+15/+20 | |
| Resilient Defense | DEF +1.0 per 10 WILL | DEF +1.2 per 10 WILL |
| Comprehensive Mindset | Final hit → 2 shockwaves (30% ATK) | 3 shockwaves (45% ATK) |
