# Endministrator — Skill & Status Coverage

6-star Guard | Physical | Sword

## Skills

### Basic Attack: Destructive Sequence
- 5 segments, Physical DMG
- Seg 3: 2 hits (split multiplier)
- Seg 4: 4 hits [0.09 → 0.19] each (1-2% rounding vs wiki display totals — per-hit values are correct for calc)
- Seg 5: RECOVER SKILL_POINT 20, DEAL STAGGER 18, PERFORM FINAL_STRIKE
- Finisher: Physical DMG [4.0 → 9.0]
- Dive: Physical DMG [0.80 → 1.80]

### Battle Skill: Constructive Sequence (0.8s, 100 SP)
- Frame (@0.37s):
  - IF ENEMY HAVE REALSPACE_STASIS_TALENT: RETURN SKILL_POINT (VARY_BY POTENTIAL [0, 50, 50, 50, 50, 50]) — P1+ returns 50 SP
  - DEAL STAGGER 10
  - DEAL PHYSICAL DAMAGE [1.56 → 3.50]
  - APPLY CRUSH STATUS to ENEMY
- CRUSH triggers REALSPACE_STASIS_TALENT onTriggerClause → crystal shatter + Essence Disintegration

### Combo Skill: Sealing Sequence
- Trigger: ANY_OTHER OPERATOR PERFORM COMBO_SKILL (another operator's combo)
- Animation: 0.5s TIME_STOP
- Frame (@0.27s):
  - DEAL STAGGER 10
  - DEAL PHYSICAL DAMAGE [0.45 → 1.00]
  - APPLY REALSPACE_STASIS_TALENT STATUS to ENEMY, duration [4×9, 4.5×2, 5]
- Cooldown: VARY_BY SKILL_LEVEL [16×11, 15]
- RECOVER ULTIMATE_ENERGY 10

### Ultimate: Bombardment Sequence
- CONSUME ULTIMATE_ENERGY 80
- Animation: 1.467s TIME_STOP
- Frame (@0.203s):
  - DEAL STAGGER 25
  - DEAL PHYSICAL DAMAGE [3.56 → 8.00]
  - IF ENEMY HAVE REALSPACE_STASIS_TALENT: CONSUME REALSPACE_STASIS_TALENT; DEAL PHYSICAL DAMAGE [2.67 → 6.00]

## Statuses

| ID | Type | Target | Effect |
|----|------|--------|--------|
| REALSPACE_STASIS_TALENT | TALENT | ENEMY | Originium Crystals: APPLY PHYSICAL FRAGILITY [0.10, 0.20] by talent level. onTriggerClause: physical status/vulnerability → CONSUME + APPLY SHATTER |
| ORIGINIUM_CRYSTALS_SHATTER | SKILL_STATUS | ENEMY | 2s duration, frame at 0s: DEAL PHYSICAL DAMAGE [1.78 → 4.00] |
| ESSENCE_DISINTEGRATION_TALENT | TALENT | OPERATOR | Trigger: CONSUME REALSPACE_STASIS_TALENT → APPLY ESSENCE_DISINTEGRATION (P1 self only, P2+ self + team) |
| ESSENCE_DISINTEGRATION | STATUS | THIS OPERATOR | ATK +15%/+30% by talent level, 15s, limit 1 RESET |
| ESSENCE_DISINTEGRATION_MINOR | POTENTIAL_STATUS | ALL_OTHER OPERATOR | ATK +7.5%/+15% by talent level, 15s, limit 1 RESET (P2 team share) |

## Potentials

| P | Name | Effect | Implementation |
|---|------|--------|----------------|
| P1 | Final Awakening | BS consuming crystals returns 50 SP | RETURN SP VARY_BY POTENTIAL on BS frame |
| P2 | Reflection of Authority | ATK buff shared to allies at 50% | Talent trigger P2 branch: APPLY ESSENCE_DISINTEGRATION_MINOR to ALL_OTHER |
| P3 | ??? | Combo DAMAGE_MULTIPLIER_MODIFIER ×1.3 | Placeholder |
| P4 | ??? | HP +10%, Aether RES -10%, AGI +25 | Placeholder |
| P5 | ??? | Combo CD -2s | Placeholder |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Skirmisher (passive) | AGI +10/+15/+15/+20 | |
| Essence Disintegration | ATK +15%, 15s on crystal consume | ATK +30% |
| Realspace Stasis | Enemies with crystals: Phys DMG Taken +10% | +20% |

## Key Mechanics
- Originium Crystal (REALSPACE_STASIS_TALENT): attached by combo skill, limit 1 RESET
- Crystal shatter: triggered reactively when ANY operator applies VULNERABLE/LIFT/CRUSH/KNOCK_DOWN/BREACH to enemy with crystals
  - CONSUME crystals → talent trigger fires → ESSENCE_DISINTEGRATION (+ MINOR at P2+)
  - APPLY ORIGINIUM_CRYSTALS_SHATTER → 2s enemy status with Physical DMG [1.78 → 4.00]
- BS applies CRUSH → triggers crystal shatter via REALSPACE_STASIS_TALENT onTriggerClause (no explicit CONSUME needed)
- Ultimate directly CONSUME crystals + deals bonus DMG (no shatter status — bonus DMG baked into ult frame)
- Combo activation: ANY_OTHER OPERATOR PERFORM COMBO_SKILL (DeterminerType.ANY_OTHER added to engine)

## Engine Changes (this session)
- `DeterminerType.ANY_OTHER` — matches any operator except self, for combo triggers
- `matchInteraction` / `resolveOwnerFilter` — support ANY_OTHER wildcard
- VULNERABLE fallback trigger — physical status that doesn't fully trigger fires APPLY VULNERABLE reactive trigger
- CONSUME THIS EVENT cascade — tracks consumed status ID via `lastConsumedParentStatusId` for reactive trigger dispatch
- Clause dedup includes `clauseIndex` — multiple onTriggerClause entries on same def no longer dedup each other
- `ALL_OTHER` loop in `doApply` — applies status to each teammate slot individually, excluding self
