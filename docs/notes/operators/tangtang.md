# Tangtang — Skill & Status Coverage

6-star Caster | Cryo | Handcannon

## Skills

- **Basic Attack**: I'LL BLOW YOUR MIND! (5 sequences + Final Strike + Dive + Finisher)
- **Battle Skill**: IMA WAVERIDAAH! (100 SP, creates Waterspout, consumes Whirlpools)
- **Combo Skill**: RIVER, TO ME! (trigger: Cryo Infliction or Arts Burst, creates Whirlpool)
- **Ultimate**: DA CHIEF SEES YOU! (90 energy, creates OLDEN STARE on enemy)

## Status Mechanic Chain

```
Combo → WHIRLPOOL (on operator, limit 2, 30s, RESET)
BS → WATERSPOUT (on enemy, RESET, 3s DoT + cryo infliction at 0s)
   → Stacks = ADD(1, STACKS of WHIRLPOOL) — 1 base + N from whirlpools
   → Consumes all WHIRLPOOLs after
   → Arts Susceptibility (scales with whirlpool count)
   → SP Return per whirlpool (RETURN, no-op in engine)

ULT → OLDEN_STARE (on enemy, limit 1, 4s, RESET)
   → 8 DoT ticks at 0.5s intervals (atk_scale_1) + rogue wave at 4s (atk_scale_2)
   → P5: ×1.15 on DoT + rogue wave

DIVE during OLDEN_STARE (T2 Riot Bringer, onTriggerClause):
   → EARLY_ROGUE_WAVE (on enemy, atk_scale_3, stagger 20, P5 ×1.15)
   → WATERSPOUT_ULT = MULT(ADD(1, STACKS of WHIRLPOOL), VARY_BY TALENT_LEVEL [0,1,1])
   → SP Return per whirlpool
   → Consumes WHIRLPOOLs + OLDEN_STARE
```

## Key DSL Patterns

- **Waterspout infliction**: Frame at offset 0s on status segment (engine processes via processNewStatusEvent)
- **Waterspout stacking**: `interactionType: RESET` with limit 99999 — each waterspout is an independent event (no accumulator, no roman numerals)
- **T2 talent gate**: `VARY_BY TALENT_LEVEL [0, 1, 1]` — 0 at T0 naturally disables
- **STACKS reads**: `IS STACKS of WHIRLPOOL STATUS of THIS OPERATOR` — ValueStatus pattern
- **Dynamic stacks skip**: Engine skips APPLY when dynamic stacks expression resolves to 0
- **Source attribution**: EARLY_ROGUE_WAVE traces to ULTIMATE (not DIVE) via parent status inheritance

## Potentials (all description-only, effects baked)

- **P1**: Combo ×1.2 DMG, -2s CD, BS +5 SP/whirlpool
- **P2**: AGI +20, Cryo DMG Bonus +10%
- **P3**: BS main shot ×1.1, arts susc +5%/spout
- **P4**: ULT energy -15% (90 → 76.5)
- **P5**: ULT ×1.15, T2 waterspout-ult +80%

## Talents

- **T1 Fam of Honor**: HASTE to all operators + SLOW to enemies near Whirlpool (description + clause)
- **T2 Riot Bringer**: Description-only. Effects baked into OLDEN_STARE onTriggerClause + WATERSPOUT_ULT status

## Data Sources

- Warfarin API: per-tick multipliers, tick count (display_atk_scale / atk_scale_1 = 8)
- SkillData: frame timing, channeling actions
- Wiki: descriptions, skill names, total display values

## Verified

All 19 JSON files marked `VERIFIED`. 76 E2E integration tests.
