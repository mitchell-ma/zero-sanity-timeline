# Arclight — Skill & Status Coverage

5-star Vanguard | Electric | Sword

## Skills

- Basic Attack: Seek and Hunt (5-seq physical)
- Battle Skill: Tempestuous Arc — 2 physical slashes + conditional 3rd frame when
  enemy has Electrification (consume + electric DMG + SP recovery with P1 baked via
  `ADD(VARY_BY SKILL_LEVEL, VARY_BY POTENTIAL [0,10,10,10,10,10])` + stagger + apply
  Wildland Trekker talent stacks)
- Combo Skill: Peal of Thunder
- Ultimate: Exploding Blitz — 2 segments: Exploding Blitz (electric damage + stagger +
  apply Electric Infliction OR consume infliction + forced Electrification) and
  Arc Explosion (electric damage + stagger). All per-level values from Warfarin.

## Wildland Trekker (T1)

The talent itself is the stacking counter (Living Banner pattern). Each BS
Electrification-consume applies +1 stack. `onTriggerClause` fires when stacks reach the
P-dependent threshold (`VARY_BY POTENTIAL [3,3,3,3,3,2]`) → consumes stacks + applies
`WILDLAND_TREKKER_BUFF` to team.

Buff value: `MULT(VARY_BY TALENT_LEVEL [0, 0.0005, 0.0008], VARY_BY POTENTIAL [1,1,1,1.3,1.3,1.3], INTELLECT)`.

## Potentials

- P1 Child of the Storm: baked into BS SP recovery as ADD + VARY_BY POTENTIAL
- P2 Speed Battler: concrete clause — APPLY STAT AGI +15, INT +15
- P3 "Hanna": baked into buff MULT expression (1.3× at P3+)
- P4 Aldertone's Teachings: baked into ult CONSUME ULTIMATE_ENERGY (MULT with 0.85 at P4+)
- P5 Servant of the Wildlands: baked into talent onTriggerClause threshold (2 at P5)

## Remaining

- **Hannabit Wisdom (T2)** — description-only, blocked on IGNORE INFLICTION engine support
- **dataStatus** — all files RECONCILED
