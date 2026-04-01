# Akekuri — Skill & Status Coverage

4-star Vanguard | Heat | Sword

## Skills

### Basic Attack: Sword of Aspiration
- 4 segments, Physical DMG
- Seg 1: 1 hit, Seg 2: 2 hits, Seg 3: 1 hit, Seg 4: 3 hits (final)
- Final strike: RECOVER SKILL_POINT

### Battle Skill: Burst of Passion (100 SP)
- DEAL HEAT DAMAGE [1.42 → 3.20], DEAL STAGGER 10
- APPLY HEAT INFLICTION ×1

### Combo Skill: Flash and Dash
- Trigger: Enemy NODE_STAGGERED or FULL_STAGGERED
- Window: 6s, maxSkills: 1
- Animation: 0.488s TIME_STOP
- 2 frames: each DEAL PHYSICAL DAMAGE [0.80 → 1.80], DEAL STAGGER 5, RECOVER SKILL_POINT 7.5 × (1 + talent bonus)
- SP recovery scaled by Talent 1: MIN(VARY_BY TL [0, 0.50, 0.75], INTEGER_DIV(INTELLECT, 10) × VARY_BY TL [0, 0.01, 0.015])
- RECOVER ULTIMATE_ENERGY 10
- Cooldown: VARY_BY SKILL_LEVEL [15×11, 9]

### Ultimate: SQUAD! ON ME! (energy VARY_BY POTENTIAL [120, 120, 120, 120, 108, 108])
- Animation: 1.683s TIME_STOP
- Active: 3.425s
- Frame 0: APPLY LINK TO TEAM (duration: 3.425s + VARY_BY POTENTIAL [0, 0, 0, 0, 0, 5])
- Frame 0: APPLY AKEKURI_P3_COMMITTED_TEAM_PLAYER TO TEAM (gated P >= 3, 3.425s)
- 3 flares @0.856s, 1.713s, 2.569s: RECOVER SKILL_POINT VARY_BY SKILL_LEVEL [19.33 → 26.67]

## Statuses

| ID | Type | Effect |
|----|------|--------|
| AKEKURI_P1_POSITIVE_FEEDBACK | POTENTIAL_STATUS | ATK +10%, 10s, 5 stacks REFRESH. Trigger: THIS OPERATOR RECOVER SKILL_POINT + HAVE POTENTIAL >= 1 |
| AKEKURI_P3_COMMITTED_TEAM_PLAYER | POTENTIAL_STATUS | ATK +10% to TEAM, 3.425s. Applied from ult frame, gated P >= 3 |

## Potentials

| P | Name | Effect | Implementation |
|---|------|--------|----------------|
| P1 | Positive Feedback | On SP recovery → ATK +10%, 10s, 5 stacks | onTriggerClause on status file |
| P2 | Passionate Idealist | Agility +10, Intellect +10 | Baked in operator potential stats |
| P3 | Committed Team Player | Ult: team ATK +10% | Status applied from ult frame with HAVE POTENTIAL >= 3 |
| P4 | Super Perfect Status | Ult energy -10% | VARY_BY POTENTIAL on ult CONSUME ULTIMATE_ENERGY |
| P5 | Tempo of Awareness | LINK persists 5s after ult ends | VARY_BY POTENTIAL on LINK duration ADD |

## Talents

| Talent | E1 | E2 |
|--------|----|----|
| Cheer of Victory | Combo SP Recovery +1% per 10 INT (max 50%) | +1.5% per 10 INT (max 75%) |
| Staying in the Zone | Ult active → gains LINK | — |

## Implementation Notes

- Talent 1 (Cheer of Victory) is description-only; effect baked into combo skill frames as VARY_BY TALENT_LEVEL on SP recovery value
- Talent 2 (Staying in the Zone) is description-only; LINK applied from ult frame
- P1 trigger (RECOVER SKILL_POINT → APPLY POSITIVE_FEEDBACK) lives on `statuses/status-positive-feedback.json` (not potentials — status engine only scans statuses/ and talents/)
- P3 status lives on `statuses/status-committed-team-player.json`, applied from ult frame clause
- RECOVER SKILL_POINT effects on skill frames route through DSL interpret path to fire reactive triggers (needed for P1)
