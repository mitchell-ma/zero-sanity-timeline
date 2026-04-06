# Last Rite — Skill & Status Coverage

6-star Striker | Cryo | Great Sword

## Skills (batch reviewed)

- Basic Attack: Dance of Rime (BATK, Finisher, Dive variants)
- Battle Skill: Esoteric Legacy of Seš'qa
- Combo Skill: Winter's Devourer
- Ultimate: Vigil Services

## Changes Applied

### Phase 1 — JSON Config Fixes
- Created Hypothermic Perfusion status (mirage attack on Final Strike trigger)
- BS applies Hypothermic Perfusion status instead of dealing damage directly
- CS activation window: ENEMY IS SOLIDIFIED → STACKS of CRYO INFLICTION STATUS of ENEMY >= 3
- CS first frame: added CONSUME STATUS INFLICTION CRYO from ENEMY
- T1 Hypothermia: fixed ARTS_INFLICTION → object:STATUS objectId:INFLICTION objectQualifier:ARTS
- T2 Cryogenic Embrittlement: added VARY_BY TALENT_LEVEL [1.2, 1.5], moved to ult frame-level APPLY STAT

### Phase 2 — Engine Extensions
- FINAL_STRIKE_DAMAGE_BONUS stat (stats.ts + damageFormulas.ts + damageTableBuilder.ts + semantics.ts)
- UE source restriction: selfOnlyUltimateEnergy on operator JSON, wired through ultimateEnergyController
- P2 stat bonuses: STR +20, Cryo DMG +10% encoded on potential-2 JSON

### Phase 3 — DSL Migration
- SUSCEPTIBILITY/AMP/FRAGILITY object→objectId migration (13 JSON files)
- Element-specific susceptibility StatTypes (CRYO_SUSCEPTIBILITY etc.)
- T1 value: MULT(IS STACKS of CRYO INFLICTION STATUS of ENEMY, VARY_BY TALENT_LEVEL [0.02, 0.04])

### Cross-cutting
- NounType.SKILL_LEVEL, NounType.STATUS_LEVEL added to DSL grammar
- String literal cleanups across controllers (SKILL_LEVEL, STATUS_LEVEL, VARY_BY, INTELLECT)
- 50 weapon/gear JSONs: multiplier→value key standardization
- StatAccumulator.applyStatMultiplier + engine with.multiplier support
- 26 integration tests

## Remaining Work
- Finisher SP recovery not encoded in finisher JSON frame
- Mirage additional attack mechanic (Hypothermic Perfusion trigger creates mirage — status file exists but engine doesn't process it yet)
- VIGIL_SERVICES permanent status file (UE source restriction is wired via operator JSON flag, but no timeline presence event)
- P1 potential description placeholders unresolved
