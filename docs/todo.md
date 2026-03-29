# TODO

## Remove weaponSkillEffects.ts and related weapon effect infrastructure

The weapon status timeline columns have been removed from the column builder and view.
The following files/code still reference `weaponSkillEffects.ts` and can be cleaned up:

- `src/controller/custom/customWeaponRegistrar.ts`
- `src/controller/custom/builtinToCustomConverter.ts`
- `src/model/weapon-skills/weaponSkill.ts`
- `TimelineSourceType.WEAPON` enum value in `src/consts/enums.ts`
- `ColumnLabel.WEAPON_BUFF` in `src/consts/timelineColumnLabels.ts`
- `StatusType.UNBRIDLED_EDGE` and related entries in enums/labels

## Share link could be Huffman encoded

The share/export URL codec could potentially use Huffman encoding to reduce link length,
since certain values (operator IDs, skill types, common frame counts) appear with known
frequency distributions.

## Multiplier entry keys in skill frame data

The `multipliers` arrays in skill frame data use raw game keys (`atk_scale`, `atk_scale_2`,
`poise`, `duration`, etc.) These should be flattened to codebase terms. The multiplier engine
(`jsonMultiplierEngine.ts`) hardcodes `'atk_scale'` and `'atk_scale_2'` — both the engine
and the JSON data need to be updated together.

Proposed mapping:
- `atk_scale` → `DAMAGE_MULTIPLIER`
- `atk_scale_2` → `DAMAGE_MULTIPLIER_INCREMENT`
- `poise` → `STAGGER`
- `duration` → `DURATION`
- `atb` → `SKILL_POINT`

## Wire up `damageFactorType` on TimelineEvent

`damageFactorType` exists on `TimelineEvent` but is never written. `getIntellectScaledDamageBonus()` and `getIgnoredResistance()` in `eventsQueryService.ts` filter by it, so they currently return 0. Need to:

1. **Set `damageFactorType` during clause resolution** — `resolveClauseEffectsFromClauses` in `statusTriggerCollector.ts` handles `APPLY DAMAGE_BONUS` and `IGNORE RESISTANCE` but doesn't set `ev.damageFactorType`
2. **Fix TALENT_LEVEL TODO** — `statusTriggerCollector.ts` hardcodes `const talentLevel = 1 // TODO`, should use `ctx.loadoutProperties?.operator.talentOneLevel ?? 1`
3. **Remove `getScorchingHeartIgnoredResistance`** from damageFormulas.ts — values already in the JSON config, just need `damageFactorType` wired up

## Resolve talent level and p3TeamShare from DSL

`minTalentLevel` and `p3TeamShare` were removed from status JSON configs during the DSL refactor.
The engine currently uses dummy talent level values (`1`) where it previously resolved from
`def.minTalentLevel`. These features need to be re-implemented through the DSL:

- **Talent level gating**: statuses that only activate at a certain talent level need a DSL
  condition (e.g. `TALENT_LEVEL >= 2`) instead of the old `minTalentLevel` field.
- **P3 team sharing**: statuses that share to team at P3+ need a DSL mechanism for creating
  shared copies with reduced duration, replacing the old `p3TeamShare.durationMultiplier` field.

Search for `TODO: resolve talent level from DSL` in `statusDerivationEngine.ts` for all affected sites.

## Sheet statistics

Add aggregate statistics for sheets, including:
- Stagger uptime (% of timeline where enemy is staggered)
- Buff uptime (per-buff active duration / total duration)
- Other relevant combat uptime metrics

## Populate HP/DEF-related gear set effects, operator talents, and weapon skills

Several gear set effects, operator talents, and weapon skills that involve HP or DEF
are stubs or missing clause data. These need to be populated from wiki/Warfarin sources.

### Gear set effects — missing HP passive clause

These sets have "HP +X" as part of their 3-piece bonus but no FLAT_HP clause in the JSON:

| Gear Set | Missing Effect |
|----------|---------------|
| AIC Heavy | FLAT_HP +500; also missing "restore 100 HP on enemy defeat (5s CD)" trigger |
| AIC Light | FLAT_HP +500 (trigger clause for ATK on defeat exists, but HP passive missing) |
| Eternal Xiranite | FLAT_HP +1000 (trigger clause for SKILL_DAMAGE_BONUS exists, but HP passive missing) |

### Gear set effects — stubs (no clauses at all)

These sets have HP-threshold conditions but are metadata-only with zero clauses:

| Gear Set | Wiki 3-piece Effect |
|----------|-------------------|
| Armored MSGR | STR +50; when HP < 50% → 30% DMG Reduction |
| Roving MSGR | AGI +50; when HP > 80% → Physical DMG +20% |
| Mordvolt Insulation | INT +50; when HP > 80% → Arts DMG +20% |
| Mordvolt Resistant | WILL +50; when HP < 50% → Treatment Effect +30% |

### Gear set effects — missing passive in clauses

| Gear Set | Missing |
|----------|---------|
| Lynx | Treatment Efficiency +20% passive (trigger effect for FINAL_DAMAGE_REDUCTION exists) |

### Operator talents — missing or incomplete

| Operator | Issue |
|----------|-------|
| Antal | Talent 3 "Subconscious Act" entirely missing (30% Physical DMG immunity + self-heal [27+STR×0.23] / [45+STR×0.38]) |
| Antal | Improviser status missing heal values (healBase [72, 108], strengthAdditive [0.6, 0.9]) |

### Weapon skills — description-only HP effects

| Weapon Skill | Issue |
|-------------|-------|
| Inspiring: Start of a Saga (Pathfinder's Beacon / Hypernova Auto) | HP threshold condition only in description, no clause data |

## Operator talent/skill DSL reconciliation issues

### Previously tracked (from earlier review)

1. ~~**Last Rite "Cryogenic Embrittlement"**~~ — DONE (2026-03-29): Added onTriggerClause with AMP SUSCEPTIBILITY CRYO x1.2 on PERFORM ULTIMATE.

2. ~~**Pogranichnik "Tactical Instruction"**~~ — DONE (2026-03-29): Added onTriggerClause: ANY OPERATOR CONSUME STEEL_OATH → APPLY FERVENT_MORALE.

### From 2026-03-26 batch reconciliation (18 operators)

#### Missing VARY_BY POTENTIAL (needs engine support for HP conditions)

3. **Alesh P5** — "Hitting a target below 50% HP increases the DMG Multiplier to 1.5 times the original." Needs enemy HP<50% condition on ultimate damage. Engine does not support HP threshold conditions yet.

4. **Chen Qianyu P1** — Status `status-chen-qianyu-potential1-shadowless.json` applies +20% DAMAGE_BONUS unconditionally but wiki says "to enemies below 50% HP." Same HP condition gap as Alesh P5.

5. **Ardelia P1** — Susceptibility +8% was baked in, but verify the `rateVulBase` ADD wrapper in the conditional DEAL DAMAGE clause is also applied (currently only the susceptibility arrays were wrapped).

#### Missing Talent/Status Effects

6. ~~**Da Pan "Salty or Mild"**~~ — DONE (2026-03-29): Added simplified onTriggerClause: PERFORM ULTIMATE → APPLY PREP_INGREDIENTS. Full stack-per-enemy-hit and cooldown reduction left as description-only.

#### Structural / Data Issues

7. **Arclight empowered battle skill** — Damage multiplier values [0.45...1.01] for the two Physical slashes were taken from the normal variant. Verify these are correct for the empowered version (wiki doesn't distinguish normal vs empowered BS multipliers for Arclight).

8. **Endministrator basic attack SEQ 3/4** — Rounding discrepancies (1-2%) vs wiki at several skill levels due to per-hit division.

9. **Arclight combo** — Total multiplier 1% over across all levels (156% vs wiki 155%). Per-hit values may need slight adjustment.

10. **Yvonne empowered basic attack** — Segment 0 has 3 frames with empty `effects: []`. These serve no purpose and should be removed or populated.

11. **Multiple operators** — Description template placeholders unresolved ({trigger_hp_ratio:0%}, {extra_scaling}, {duration-1:0%}, etc.). Cosmetic only but should be filled in.

12. **Multiple operators** — Status descriptions copied from skill descriptions instead of describing the status itself (Arclight Wildland Trekker trigger/buff, Endministrator Originium Crystal, Avywenna Thunderlance).

## DSL migrations completed (2026-03-29)

- Non-standard verbs migrated: CAST→PERFORM, INTERRUPT→HAVE CHARGE, RECOVER_SP→RECOVER+SKILL_POINT, RESTORE→RECOVER, HP_BELOW→HAVE HP+AT_MOST, IS_HIT→ENEMY DEAL DAMAGE, TRIGGER→APPLY SHATTER, LESS_THAN→HAVE+AT_MOST, HIT_WITH→description-only
- AT_LEAST/AT_MOST formalized: moved from ValueNode verbs to cardinalityConstraint on Interaction (~25 occurrences across 13 files)
- Non-standard `with` keys removed (~40 keys across 27 files)
- Gilberta PARAMETER conditions normalized: subjectId for param name, verb IS, cardinalityConstraint AT_LEAST

### Disabled configs still needing real data
- **Rossi**: Both talents (Nicks and Scratches, Seething Blood) + Razor Clawmark status — all `isEnabled: false` with `[0, 0]` placeholder values
- **Antal**: Improviser talent + Improviser status — `isEnabled: false`

### Talents implemented (2026-03-29)
- Akekuri Cheer of Victory (SP Recovery scaling)
- Da Pan Salty or Mild (simplified Prep Ingredients from ult)
- Last Rite Cryogenic Embrittlement (1.2x Cryo Susceptibility AMP)
- Perlica Cycle Protocol (extra combo chain on Vulnerable)
- Pogranichnik Tactical Instruction (Fervent Morale from Steel Oath)
- Ardelia Friendly Presence (simplified HP recovery on hit)
- Estella Laziness Pays Off Now (Cryo Infliction ignore + DMG reduction)
- Estella Commiseration (APPLY SHATTER → COMMISERATION, consumed on combo for SP return)
- Akekuri LINK duration now scales with P5 (+5s via VARY_BY POTENTIAL)

### Talents left as description-only (passive/probabilistic/spatial)
- Antal Subconscious Act (30% DMG immunity)
- Arclight Hannabit Wisdom (50% Arts Infliction ignore)
- Ardelia Mountainpeak Surfer (spatial recast)
- Snowshine SAR Professional (RETALIATE verb — no DSL equivalent)

## Integration test plan (423 tests across 19 operators)

Full test plans generated for all untested operators. Plans cover context menu, controller, and view layer assertions.

| Operator | Tests | Key Mechanics |
|----------|-------|---------------|
| Ember | 57 | Team shields, Protection, Steel Oath Empowered (P5) |
| Catcher | 37 | RETURN vs RECOVER SP, dual shield, DEF-scaling P1 |
| Da Pan | 40 | Lift/Knock Down, Vulnerability trigger, R&T stacking |
| Lifeng | 30 | LINK consume/bonus-hit, Subduer of Evil chain |
| Endministrator | 34 | Originium Crystal cycle, teammate combo trigger |
| Estella | 20 | Solidification trigger, Commiseration from Shatter |
| Fluorite | 20 | 2+ stack threshold combo, Slow, Unpredictable |
| Gilberta | 21 | Arts Reaction combo, Gravity Field Lift extension |
| Alesh | 16 | Cryo→Solidification, Flash-frozen talent |
| Arclight | 22 | Wildland Trekker counter, empowered activation |
| Avywenna | 21 | Thunderlance deploy/retrieve exchange |
| Snowshine | 13 | Protection to all, P5 conditional SP return |
| Perlica | 16 | Electric infliction, forced Electrification |
| Last Rite | 22 | 240 energy ult, Cryo Susceptibility |
| Tangtang | 18 | Waterspout/Whirlpool, Fam of Honor team Haste |
| Yvonne | 19 | FIRST_MATCH BS, Crit Stacks, empowered BATK |
| Rossi | 17 | Dual-element, Combustion from ult, disabled talents |

## Fix laevatainDamageCalc.test.ts — broken after gameDataController mock removal

35 tests failing in `src/tests/unit/laevatainDamageCalc.test.ts`. Two root causes:

### 1. Bare loadout ATK values inflated (1136 vs expected 943)

The old `gameDataController` mock was removed but the real `configStore`/`gameDataStore` returns
different weapon stats for Tarr 11. The old mock had a special case for `getNamedSkillPassiveStats`
that returned `ASSAULT_ARMAMENT_PREP` values as flat `BASE_ATTACK` bonuses. The real store likely
handles them differently, inflating effective ATK by ~1.205×.

All bare loadout damage values are wrong by the same ratio — the ATK calculation is the sole issue.
Need to reverify against in-game values and either fix the store's Tarr 11 handling or restore an
equivalent mock.

**Affected tests (13):** effective ATK, segments 1-5 frames, combo (Seethe), empowered additional
hit, forced combustion DOT.

### 2. `getFrameMultiplier` returns null for SMOULDERING_FIRE

`jsonMultiplierEngine.getFrameMultiplier` only supports `DAMAGE_MULTIPLIER_INCREMENT`-based ramping.
SMOULDERING_FIRE uses individual per-frame `DAMAGE_MULTIPLIER` values (1.4 base + 0.14 × 10 ticks
at level 12). The function needs a fallback to return `perFrameMultipliers[segIdx][frameIndex]` when
`perFrameScale2` is absent.

**Affected tests (22):** Smouldering Fire ticks 0-10 (full loadout), battle skill ticks 0-10 (bare loadout).

## Unimplemented mechanics — Ardelia T1

Ardelia Talent 1 (Friendly Presence): battle skill creates Shadows of Mr. Dolly that heal the controlled operator on contact. Healing formula: `[63/90 + Will × 0.53/0.75]` by talent level. If controlled operator is at max HP, heals lowest-HP teammate instead. Shadows last 10s, max 10. Ultimate copies also have 10% chance to spawn shadows. Currently description-only — needs spatial/proximity mechanics to implement.

