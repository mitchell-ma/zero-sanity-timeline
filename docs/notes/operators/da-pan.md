# Da Pan — Skill & Status Coverage

5-star Striker | Physical | Great Sword

## Skills

### Basic Attack: ROLLING CUT!
- 4 segments, Physical DMG
- Seg 3: 2 hits (split multiplier)
- Seg 4: RECOVER SKILL_POINT 21, DEAL STAGGER 20
- Finisher: Physical DMG [4.0 → 9.0]
- Dive: Physical DMG [0.80 → 1.80]

### Battle Skill: FLIP DA WOK! (2.17s, 100 SP)
- Frame 1 (@0.27s): DEAL PHYSICAL DAMAGE [0.18 → 0.41]
- Frame 2 (@1.43s): DEAL STAGGER 10, APPLY LIFT STATUS (duration 1.8s), DEAL PHYSICAL DAMAGE [1.15 → 2.59]

### Combo Skill: MORE SPICE!
- Trigger: THIS OPERATOR APPLY STATUS VULNERABILITY (4 stacks)
- Animation: 0.5s TIME_STOP
- Frame (@1.26s): DEAL STAGGER 15, DEAL PHYSICAL DAMAGE [2.89 → 6.50], APPLY CRUSH STATUS (ADDITIONAL_DAMAGE_MULTIPLIER [1.1×8, 1.15×3, 1.2])
- Cooldown: VARY_BY SKILL_LEVEL [20×11, 19]

### Ultimate: CHOP 'N DUNK!
- CONSUME ULTIMATE_ENERGY VARY_BY POTENTIAL [90, 90, 90, 76.5, 76.5, 76.5]
- Animation: 1.4s TIME_STOP
- Frame 1 (@0s): APPLY LIFT to ENEMY (isForced)
- Frames 2-7 (@0.3, 0.4, 0.5, 0.6, 0.7, 0.8s): DEAL PHYSICAL DAMAGE [0.22 → 0.50] each (6 aerial hits)
- Frame 8 (@1.27s): APPLY KNOCK_DOWN to ENEMY (isForced), DEAL PHYSICAL DAMAGE [1.78 → 4.00]

## Statuses (da-pan-statuses.json)

| ID | Type | Effect |
|----|------|--------|
| REDUCE_AND_THICKEN_TALENT | TALENT (self-applying) | Trigger: consume Vulnerability → self-apply (PHYSICAL_DAMAGE_BONUS [0.04, 0.06] by talent level, 10s, max 4 stacks, RESET) |
| PREP_INGREDIENTS | TALENT_STATUS | Duration VARY_BY POTENTIAL [20, 20, 30×4], max stacks VARY_BY POTENTIAL [1, 1, 2×4] |
| FINE_COOKING_POTENTIAL | POTENTIAL | Trigger: defeat enemy → apply status |
| FINE_COOKING | POTENTIAL_STATUS | PHYSICAL_DAMAGE_BONUS +30%, 15s, max 1 stack |

## Potentials

| P | Name | Effect |
|---|------|--------|
| P1 | Fine Cooking | Ult: defeating enemy → +30% Physical DMG 15s |
| P2 | Harmonized Flavors | Prep Ingredients: +10s duration, +1 max stack |
| P3 | Model Employee | STR +15, Physical DMG +8% |
| P4 | Special Blend | Ultimate energy cost -15% |
| P5 | Fire it Up | Battle skill: single enemy → +1 Vulnerability stack (45s CD) |

## Talents

| Talent | E1 | E2 | E3 |
|--------|----|----|-----|
| Forged (passive) | STR +10/+15/+15/+20 | | |
| Reduce and Thicken | +4% Phys DMG per Vulnerability consumed, 10s, max 4 | +6% | |
| Salty or Mild | | Max 1 Prep Ingredients, 20s, combo -40% CD | Max 2 stacks |
