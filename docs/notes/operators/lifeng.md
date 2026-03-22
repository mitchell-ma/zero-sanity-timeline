# Lifeng — Skill & Status Coverage

6-star Guard | Physical | Polearm

## Skills

### Basic Attack: Ruination
- 4 segments, Physical DMG
- Seg 1: 2 hits [0.12 → 0.275] each (sum 24% → 55%)
- Seg 2: 1 hit [0.29 → 0.65]
- Seg 3: 1 hit [0.35 → 0.79]
- Seg 4: 2 hits [0.24 → 0.55] each — wiki says 68%→152% total but End-Axis has 48%→110% (possible missing Warfarin merge)
- Finisher: Physical DMG [4.0 → 9.0]
- Dive: Physical DMG [0.80 → 1.80]

### Battle Skill: Turbid Avatar (2.23s, 100 SP)
- Frame 1 (@0.23s): DEAL PHYSICAL DAMAGE [0.38 → 0.86]
- Frame 2 (@0.67s): DEAL PHYSICAL DAMAGE [0.38 → 0.86]
- Frame 3 (@1.8s):
  - DEAL STAGGER 10
  - APPLY KNOCK_DOWN to ENEMY
  - DEAL PHYSICAL DAMAGE [1.19 → 2.68]
  - IF ENEMY NOT_HAVE VULNERABILITY: APPLY PHYSICAL_SUSCEPTIBILITY STATUS [0.05 → 0.12], duration 12s

### Combo Skill: Aspect of Wrath
- Trigger: controlled operator performs Final Strike on enemy with Physical Susceptibility or Breach
- Animation: 0.5s TIME_STOP
- Frame 1 (@0.13s): DEAL PHYSICAL DAMAGE [0.47 → 1.05], APPLY LINK STATUS (20s)
- Frame 2 (@1.1s): DEAL STAGGER 10, DEAL PHYSICAL DAMAGE [1.67 → 3.75]
- Cooldown: VARY_BY SKILL_LEVEL [16×11, 15]

### Ultimate: Heart of the Unmoving (90 energy)
- Animation: 1.867s TIME_STOP
- Seg 2 (@2.13s): DEAL STAGGER 5, APPLY KNOCK_DOWN (isForced), DEAL PHYSICAL DAMAGE [1.78 → 4.00]
- Seg 3 "Vajra Impact" (@1.93s):
  - DEAL STAGGER 5, APPLY KNOCK_DOWN (isForced), DEAL PHYSICAL DAMAGE [1.78 → 4.00]
  - IF THIS OPERATOR HAVE LINK: CONSUME LINK; DEAL STAGGER 5; DEAL PHYSICAL DAMAGE [2.67 → 6.00]

## Statuses (lifeng-statuses.json)

| ID | Type | Effect |
|----|------|--------|
| ILLUMINATION | TALENT_STATUS | ATK bonus scaling from INT+WILL, [0.1%, 0.15%] per point by talent level |
| SUBDUER_OF_EVIL_TALENT | TALENT | Trigger: apply Knock Down → deal Physical DMG [50%, 100%] ATK |
| LINK | SKILL_STATUS | Buff from combo, 20s, max 1 stack, consumed by ult for bonus hit |

## Potentials

| P | Name | Effect |
|---|------|--------|
| P1 | Breaking the Obsession | Battle skill: Susceptibility +5%, triggers on enemies with ≤2 Vulnerability |
| P2 | Self Refinement | All attributes +15 |
| P3 | Spiritual Cultivation | Illumination: +0.05% ATK per INT/WILL point |
| P4 | Brief Instant | Ultimate energy cost -15% |
| P5 | Unremitting | Subduer of Evil: every 15s, next trigger +250% ATK Physical DMG +5 stagger |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Skirmisher (passive) | AGI +10/+15/+15/+20 | |
| Illumination | ATK +0.10% per INT+WILL | ATK +0.15% per INT+WILL |
| Subduer of Evil | Knock Down → 50% ATK Phys DMG | 100% ATK Phys DMG |

## Known Issues
- Basic attack seg 4 multiplier sum (48%) doesn't match wiki (68%) — possible Warfarin merge issue with multi-hit segment
