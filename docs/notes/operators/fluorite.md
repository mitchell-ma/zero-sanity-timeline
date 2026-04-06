# Fluorite — Skill & Status Coverage

4-star Caster | Nature | Handcannon

## Skills (batch reviewed)

- Basic Attack: Signature Gun Kata
- Battle Skill: Tiny Surprise
- Combo Skill: Free Giveaway
- Ultimate: Apex Prankster

## Changes Applied

- Damage types corrected per wiki
- Combo cooldown set to VARY_BY SKILL_LEVEL (rank 12 reduction)
- Ult energy set to VARY_BY POTENTIAL
- Common baked-in properties cleaned (stagger, skillPoint, usp, etc.)
- Stale BUFF_ATTACHMENTs removed from potentials
- BS restructured: inline effects moved to IMPROVISED_EXPLOSIVE status, BS frame now only APPLY STATUS
- IMPROVISED_EXPLOSIVE status created: SLOW at segment start (P3 extends 3→6s), explosion at 2.97s with damage/stagger/infliction
- CS restructured: FIRST_MATCH → ALL + TRIGGER INFLICTION (Antal pattern), P5 REDUCE COOLDOWN baked in
- ULT frame 1: detonation conditional added (CONSUME IMPROVISED_EXPLOSIVE, +30% damage, SLOW, stagger, infliction)
- ULT stagger corrected: 5 per sequence (20 total) instead of 20 on last frame only
- T1: Perlica-style onTriggerClause added (ENEMY RECEIVE STATUS SLOW) for timeline visibility

## Remaining Work

- T2 (Unpredictable) chance probability gate — deferred, implement with Antal immunity
