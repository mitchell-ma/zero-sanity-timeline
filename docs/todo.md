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

### From 2026-03-26 batch reconciliation (18 operators)

#### Missing VARY_BY POTENTIAL (needs engine support for HP conditions)

1. **Alesh P5** — "Hitting a target below 50% HP increases the DMG Multiplier to 1.5 times the original." Needs enemy HP<50% condition on ultimate damage. Engine does not support HP threshold conditions yet.

2. **Chen Qianyu P1** — Status `status-chen-qianyu-potential1-shadowless.json` applies +20% DAMAGE_BONUS unconditionally but wiki says "to enemies below 50% HP." Same HP condition gap as Alesh P5.

3. **Ardelia P1** — Susceptibility +8% was baked in, but verify the `rateVulBase` ADD wrapper in the conditional DEAL DAMAGE clause is also applied (currently only the susceptibility arrays were wrapped).

#### Structural / Data Issues

4. **Arclight empowered battle skill** — Damage multiplier values [0.45...1.01] for the two Physical slashes were taken from the normal variant. Verify these are correct for the empowered version (wiki doesn't distinguish normal vs empowered BS multipliers for Arclight).

5. **Endministrator basic attack SEQ 3/4** — Rounding discrepancies (1-2%) vs wiki at several skill levels due to per-hit division. Per-hit values from Warfarin `atk_scale` are correct for damage calc; wiki `display_atk_scale` is a rounded sum.

6. **Arclight combo** — Total multiplier 1% over across all levels (156% vs wiki 155%). Per-hit values may need slight adjustment.

7. **Yvonne empowered basic attack** — Segment 0 has 3 frames with empty `effects: []`. These serve no purpose and should be removed or populated.

8. **Multiple operators** — Description template placeholders unresolved ({trigger_hp_ratio:0%}, {extra_scaling}, {duration-1:0%}, etc.). Cosmetic only but should be filled in.

9. **Multiple operators** — Status descriptions copied from skill descriptions instead of describing the status itself (Arclight Wildland Trekker trigger/buff, Avywenna Thunderlance).

## Engine fixes

### Disabled configs still needing real data
- **Antal**: Improviser talent + Improviser status — `isEnabled: false`

### Talents/potentials implemented
- Akekuri Cheer of Victory — SP Recovery scaling baked into combo skill frames with VARY_BY TALENT_LEVEL + INTEGER_DIV(INTELLECT, 10) ValueExpression
- Akekuri P1 Positive Feedback — ATK +10% on SP recovery, trigger on status file, gated HAVE POTENTIAL >= 1
- Akekuri P3 Committed Team Player — team ATK +10% during ult, applied from ult frame with HAVE POTENTIAL >= 3
- Akekuri P5 Tempo of Awareness — LINK +5s via VARY_BY POTENTIAL on LINK duration
- Da Pan Salty or Mild (simplified Prep Ingredients from ult)
- Last Rite Cryogenic Embrittlement (1.2x Cryo Susceptibility AMP)
- Perlica Cycle Protocol (extra combo chain on Vulnerable)
- Pogranichnik Tactical Instruction (Fervent Morale from Steel Oath)
- Ardelia Friendly Presence (simplified HP recovery on hit)
- Estella Laziness Pays Off Now (Cryo Infliction ignore + DMG reduction)
- Estella Commiseration (APPLY SHATTER → COMMISERATION, consumed on combo for SP return)

### Talents left as description-only (passive/probabilistic/spatial)
- Antal Subconscious Act (30% DMG immunity)
- Arclight Hannabit Wisdom (50% Arts Infliction ignore)
- Ardelia Mountainpeak Surfer (spatial recast)
- Snowshine SAR Professional (RETALIATE verb — no DSL equivalent)

## Integration tests — deeper mechanics (remaining)

Core integration tests (skill placement, infliction pipelines, combo triggers, ultimate energy,
talent statuses, view layer) are implemented for all 25 operators (177 new tests added 2026-03-29).
The following deeper mechanic-specific tests remain:

| Operator | Missing Tests |
|----------|--------------|
| Ember | P5 Steel Oath Empowered (shield ×1.2 + ATK +10%), Pay the Ferric Price 3-stack accumulation, Protection duration extension on hit |
| Catcher | RETURN vs RECOVER SP distinction, P1 DEF-scaling bonus damage on BS/ult hit, Weaken status from ult |
| Da Pan | Reduce & Thicken multi-stack accumulation (4 stacks), Vulnerability 4-stack combo trigger in strict mode, P5 extra Vulnerability stack |
| Lifeng | LINK consume bonus hit on ult (Vajra Impact conditional), Subduer of Evil talent chain (Knock Down → Physical DMG), Illumination ATK scaling from INT+WILL |
| Arclight | Wildland Trekker counter accumulation + buff activation, empowered battle skill variant, Tactful Approach status |
| Fluorite | 2+ infliction stack threshold combo trigger in strict mode, Slow status application, Unpredictable talent stacking |
| Gilberta | Arts Reaction combo trigger in strict mode, Gravity Field Lift extension, Messenger's Song UE gain buff |
| Alesh | Flash-frozen talent (Cryo→Solidification chain), arts reaction consume combo trigger in strict mode |
| Avywenna | Thunderlance deploy/retrieve exchange mechanic (basic attack interaction) |
| Tangtang | Waterspout/Whirlpool status application, Fam of Honor team Haste |
| Yvonne | Empowered basic attack variant, Crit Stacks accumulation (10 max), Barrage of Technology consume interaction |
| Last Rite | Cryogenic Embrittlement (1.2× Cryo Susceptibility AMP on ult), Hypothermia talent |
| Snowshine | P1 Protection blocks Arts Inflictions, P5 retaliation SP return |

### Engine blockers for some deeper tests
- `isForced: true` as raw boolean in JSON doesn't resolve through `resolveWith()` (affects forced Lift/Knock Down for Da Pan, Gilberta, Estella, Lifeng)
- Strict-mode combo triggering requires the engine to evaluate `onTriggerClause` conditions against pipeline state
- HP threshold conditions not supported (affects Alesh P5, Chen Qianyu P1, Catcher combo trigger)

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


## Rossi full reconciliation (from Warfarin + SkillData audit)

### Battle Skill — Crimson Shadow
- [ ] Duration 1.75s → 1.3s (SkillData AllowNext f38)
- [ ] Frame 1 offset 0.5→0.533s, Frame 2 offset 0.8→0.733s, Frame 3 offset 1.2→1.167s
- [ ] Frame 3 has DEAL DAMAGE but SkillData f35 ChannelingAction has hasDmg=False — should be stagger+UE only, not damage
- [ ] Frame 1+2 mults (0.255 each) are derived splits of atk_scale_1=0.85. Verify per-hit breakdown
- [ ] Frame 3 stagger=5 matches poise_1=5 ✅
- [ ] Missing: RECOVER UE (usp_1=15 on SEQ 1 complete, usp_2=10 on SEQ 2)
- [ ] Missing: SEQ 2 entirely (atk_scale_3=1.28, poise_2=10, fires at ~7.2s via projectiles)
- [ ] Missing: Bleed status (atk_scale_bleed=0.36, duration_bleed=15s)
- [ ] Empowered variant: verify diff from base (WOLVEN_AMBRAGE status)
- [ ] Dual element: SEQ 1 = Physical (no SpellInfliction), SEQ 2 = Heat (check projhit for infliction)

### Combo Skill — Moment of Blazing Shadow
- [ ] Rossi has 3 combo variants (combo_1, combo_2, combo_3) — we only model combo_1
- [ ] Seg 2 dur 0.8s vs SkillData 0.733s
- [ ] Missing DEAL DAMAGE frame (atk_scale=0.4, poise=10) — current frame only has status effects
- [ ] Missing RECOVER UE (usp=10)
- [ ] Combo 2: atk_scale=0.67, display variants for SEQ 2 (1.33/0.67), crit buff (25%, 15s)
- [ ] Combo 3: atk_scale_s/f=1.33, crit rate+dmg buff (15%/30%, 15s), per-infliction-stack bonus (80%)

### Ultimate — Razorclaw Ambuscade
- [ ] Seg 1 (Animation) dur 2.592s vs SkillData exclusive=5.167s — very different
- [ ] SkillData shows damage at 1.9s, 2.133s, 4.067s — ult has damage frames we don't model
- [ ] Warfarin: atk_scale_1=0.11 (stab per hit), atk_scale_2=1.11 (SEQ 1 slash), atk_scale_3=3.33 (SEQ 2 slash)
- [ ] display_atk_scale_1_min=1.28, display_atk_scale_1_max=2.75 — variable stab count
- [ ] Missing: DEAL STAGGER 25, crit_damage_up_to_bleed=0.6
- [ ] Seg 2 has APPLY INFLICTION at offset 5s — verify timing

### General
- [ ] Yvonne empowered BA: non-standard Warfarin IDs (ult_attack1_1 etc.), stagger 20 vs 17
