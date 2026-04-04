# Pogranichnik — Skill & Status Coverage

6-star Vanguard | Physical | Sword

## Skills

- Basic Attack: All-Out Offensive (5 sequences, finisher recovers 20 SP → Living Banner)
- Battle Skill: The Pulverizing Front (P1 conditional +15 SP on 2+ enemies)
- Combo Skill: Full Moon Slash (Steel Oath consumption → Harass/Decisive Assault FIRST_MATCH)
- Ultimate: Shieldguard Banner (5 Steel Oath team stacks, P4 energy cost -15%)

## Talents

- The Living Banner (T1): counter talent (NONE + unlimited stacks). Starts at 0, each SP gain creates a clamped segment with running total. Threshold at 80 (P0) / 60 (P3) → consume stacks, apply Fervent Morale.
- Tactical Instruction (T2): ANY OPERATOR CONSUME STEEL_OATH → APPLY FERVENT_MORALE on consuming operator.

## Statuses

- Steel Oath: team status, 5 stacks RESET, 30s duration. Last-stack consumption → Decisive Assault (FIRST_MATCH), else Harass.
- Steel Oath Harass: damage + 7.5-10 SP + Living Banner stacks.
- Steel Oath Decisive Assault: high damage + stagger + 30-40 SP + Living Banner stacks.
- Fervent Morale: RESET stacking, max 3 (P0) / 5 (P3). ATK + Arts Intensity buff.

## Potentials

- P1 Frontline Sweep: BS +15 SP when hitting 2+ enemies (ENEMY_HIT parameter)
- P2 Advance: +20 WILL, +10% Physical DMG
- P3 When the Banner Flutters: Living Banner threshold 80→60, FM max stacks 3→5
- P4 Shield of Talos II: Ultimate energy cost -15%
- P5 Newly Forged Blade: Combo SP recovery ×1.2

## Changes Applied

- Damage types corrected per wiki
- Combo cooldown set to VARY_BY SKILL_LEVEL (rank 12 reduction)
- Ult energy set to VARY_BY POTENTIAL
- Common baked-in properties cleaned (stagger, skillPoint, usp, etc.)
- Stale BUFF_ATTACHMENTs removed from potentials
- Living Banner: counter behavior (NONE + unlimited stacks, no presence event, stacks-aware BECOME condition, running total labels)
- Fervent Morale: P3 max stacks uses VARY_BY POTENTIAL with WHEN_THE_BANNER_FLUTTERS status multiplier
- conditionEvaluator: BECOME STACKS reads stacks field from latest active event, resolves VARY_BY with operator potential

## Status: COMPLETE

All 17 config files RECONCILED. 40 integration tests passing.
