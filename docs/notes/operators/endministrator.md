# Endministrator — Skill & Status Coverage

6-star Guard | Physical | Sword

## Skills

### Basic Attack: Destructive Sequence
- 5 segments, Physical DMG (fixed from NATURE)
- Seg 3: 2 hits (split multiplier)
- Seg 4: 4 hits [0.09 → 0.19] each
- Seg 5: RECOVER SKILL_POINT 20, DEAL STAGGER 18
- Finisher: Physical DMG [4.0 → 9.0]
- Dive: Physical DMG [0.80 → 1.80]

### Battle Skill: Constructive Sequence (0.8s, 100 SP)
- Frame (@0.37s):
  - DEAL STAGGER 10
  - DEAL PHYSICAL DAMAGE [1.56 → 3.50]
  - APPLY CRUSH STATUS to ENEMY
  - IF ENEMY HAVE ORIGINIUM_CRYSTAL: CONSUME ORIGINIUM_CRYSTAL

### Combo Skill: Sealing Sequence
- Trigger: THIS OPERATOR PERFORM COMBO_SKILL (another operator's combo)
- Animation: 0.5s TIME_STOP
- Frame (@0.27s):
  - DEAL STAGGER 10
  - DEAL PHYSICAL DAMAGE [0.45 → 1.00]
  - APPLY ORIGINIUM_CRYSTAL STATUS to ENEMY, duration [4×9, 4.5×2, 5], SHATTER_DAMAGE_MULTIPLIER [1.78 → 4.00]
- Cooldown: VARY_BY SKILL_LEVEL [16×11, 15]

### Ultimate: Bombardment Sequence
- CONSUME ULTIMATE_ENERGY 80
- Animation: 1.467s TIME_STOP
- Frame (@0.203s):
  - DEAL STAGGER 25
  - DEAL PHYSICAL DAMAGE [3.56 → 8.00]
  - IF ENEMY HAVE ORIGINIUM_CRYSTAL: CONSUME ORIGINIUM_CRYSTAL; DEAL PHYSICAL DAMAGE [2.67 → 6.00]

## Statuses (endministrator-statuses.json)

| ID | Type | Effect |
|----|------|--------|
| ORIGINIUM_CRYSTAL | SKILL_STATUS | Attached to enemy, max 4 stacks |
| ESSENCE_DISINTEGRATION_TALENT | TALENT | Trigger: consume Originium Crystal → apply status |
| ESSENCE_DISINTEGRATION | TALENT_STATUS | ATTACK_BONUS [0.15, 0.30] by talent level, 15s, max 1 stack |
| REALSPACE_STASIS | TALENT_STATUS | Enemies with crystals: PHYSICAL_DAMAGE_TAKEN_BONUS [0.10, 0.20] by talent level, passive (duration -1) |

## Potentials

| P | Name | Effect |
|---|------|--------|
| P1 | Final Awakening | Battle skill consuming crystals returns 50 SP |
| P2 | Reflection of Authority | ATK buff shared to allies at 50% |
| P3 | ??? | Combo DAMAGE_MULTIPLIER_MODIFIER ×1.3 |
| P4 | ??? | HP +10%, Aether RES -10%, AGI +25 |
| P5 | ??? | Combo CD -2s |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Skirmisher (passive) | AGI +10/+15/+15/+20 | |
| Essence Disintegration | ATK +15%, 15s on crystal consume | ATK +30% |
| Realspace Stasis | Enemies with crystals: Phys DMG Taken +10% | +20% |

## Key Mechanics
- Originium Crystal: attached by combo skill, consumed by battle skill or ultimate for bonus damage
- Crystal shatter damage is separate from base skill damage (conditional clause)
- Realspace Stasis is a passive debuff on crystallized enemies (no trigger, duration -1)
