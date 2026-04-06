# Perlica — Skill & Status Coverage

5-star Caster | Electric | Arts Unit

## Skills (batch reviewed)

- Basic Attack: Protocol α: Breach
- Battle Skill: Protocol ω: Strike
- Combo Skill: Instant Protocol: Chain
- Ultimate: Protocol ε: 70.41K

## Talents

### T1 — Obliteration Protocol
- Triggers via `BECOME STAGGERED` / `BECOME NOT STAGGERED` (stat-based transition)
- Uses `STAGGER_FRAILTY` stat on enemy as a counter — incremented by each stagger source (node/full), decremented on expiry
- Trigger fires on 0→positive transition (BECOME STAGGERED), consumed on positive→0 transition (BECOME NOT STAGGERED)
- Overlapping staggers produce a single talent instance spanning the full window
- Applies `STAGGER_DAMAGE_BONUS` (+20%/+30% by talent level) while active
- Duration is trigger-managed (`APPLY EVENT` / `CONSUME EVENT`), not presence-based

### T2 — Cycle Protocol
- Description-only talent (no trigger, no clause, no segments)
- Describes combo chain bonus vs Vulnerable enemies — effect baked into skill frames
- Does NOT appear on the timeline

## Changes Applied

- Damage types corrected per wiki
- Combo cooldown set to VARY_BY SKILL_LEVEL (rank 12 reduction)
- Ult energy set to VARY_BY POTENTIAL
- Common baked-in properties cleaned (stagger, skillPoint, usp, etc.)
- Stale BUFF_ATTACHMENTs removed from potentials
- T1 migrated from BECOME NODE_STAGGERED/FULL_STAGGERED to stat-based BECOME STAGGERED
- T2 converted to description-only (removed unused onTriggerClause)
