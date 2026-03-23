# TODO

## Remove weaponSkillEffects.ts and related weapon effect infrastructure

The weapon status timeline columns have been removed from the column builder and view.
The following files/code still reference `weaponSkillEffects.ts` and can be cleaned up:

- `src/consts/weaponSkillEffects.ts` — the data registry itself
- `src/controller/custom/customWeaponRegistrar.ts`
- `src/controller/custom/builtinToCustomConverter.ts`
- `src/controller/info-pane/loadoutPaneController.ts`
- `src/model/events/weaponSkillStatusEvent.ts`
- `src/model/weapon-skills/weaponSkill.ts`
- `src/view/CombatSheet.tsx`
- `src/view/custom/ContentViewer.tsx`
- `src/controller/custom/contentCatalogController.ts`
- `TimelineSourceType.WEAPON` enum value in `src/consts/enums.ts`
- `ColumnLabel.WEAPON_BUFF` in `src/consts/timelineColumnLabels.ts`
- `StatusType.UNBRIDLED_EDGE` and related entries in enums/labels

## Migrate remaining hardcoded status functions to the effect executor

The DSL effect executor (`effectExecutor.ts`) and shared condition evaluator
(`conditionEvaluator.ts`) are in place. The following functions in `processStatus.ts`
need executor extensions before they can be migrated:

- **`deriveUnbridledEdge`** — weapon-triggered (SP recovery hits → stacking team buff).
  Needs: weapon-based trigger support, SP recovery frame scanning.
- **`consumeVulnerabilityForSusceptibility`** (Gilberta) — consume vulnerability stacks
  at ultimate cast → arts susceptibility with stack-count × per-level value computation.
  Needs: stack-count-based value derivation in executor.
- **`consumeCryoForSusceptibility`** (Last Rite) — consume cryo stacks at combo cast →
  cryo susceptibility with talent-gated per-stack value.
  Needs: same stack-count-based value derivation.
- **`applyXaihiP5AmpBoost`** (Xaihi P5) — mutate existing ARTS_AMP statusValue × 1.1.
  Needs: event mutation support (not derivation).

Once the executor supports these patterns, migrate one at a time into operator JSON
`statusEvents` and remove the hardcoded functions.

## Foreign `parameterKey` values in operator JSON potentials

These raw Warfarin API keys in `skillParameterModifier.parameterKey` need manual review
and remapping. The multiplier engine only recognizes `DAMAGE_MULTIPLIER` — all other
keys are dead data (potential modifiers silently ignored).

### `atk_scale*` → `DAMAGE_MULTIPLIER` (broken potential damage bonuses)

| Operator | Potential | parameterKey | skillType | value | modifyType |
|----------|-----------|-------------|-----------|-------|------------|
| Last Rite | P2 | `atk_scale2` | LAST_RITE_SEVER | 0.15 | UNIQUE_MULTIPLIER |
| Last Rite | P2 | `atk_scale3` | LAST_RITE_SEVER | 0.15 | UNIQUE_MULTIPLIER |
| Last Rite | P3 | `atk_scale` | LAST_RITE_SEVER | 0.03 | ADDITIVE |
| Last Rite | P3 | `atk_scale` | LAST_RITE_FINAL_VERDICT | 0.02 | ADDITIVE |
| Last Rite | P3 | `atk_scale2` | LAST_RITE_FINAL_VERDICT | 0.02 | ADDITIVE |
| Last Rite | P5 | `atk_scale` | LAST_RITE_SEVER | 0.04 | ADDITIVE |
| Chen Qianyu | P2 | `atk_scale1` | CHEN_QIANYU_WILD_HUNT | 0.03 | ADDITIVE |
| Chen Qianyu | P2 | `atk_scale2` | CHEN_QIANYU_WILD_HUNT | 0.03 | ADDITIVE |
| Chen Qianyu | P3 | `atk_scale` | CHEN_QIANYU_RENDING_GALE | 0.03 | ADDITIVE |
| Chen Qianyu | P3 | `atk_scale` | CHEN_QIANYU_WILD_HUNT | 0.04 | ADDITIVE |
| Gilberta | P5 | `atk_scale` | GILBERTA_EXPLODING_BLITZ | 0.05 | ADDITIVE |
| Avywenna | P5 | `atk_scale_lance` | AVYWENNA_THUNDERLANCE_ATK | 0.03 | ADDITIVE |
| Avywenna | P5 | `atk_scale_lance_ult` | AVYWENNA_THUNDERLANCE_ATK | 0.05 | ADDITIVE |
| Endministrator | P2 | `atk_scale` | ENDMINISTRATOR_TERMINAL_COMMAND | 0.04 | ADDITIVE |
| Endministrator | P2 | `atk_scale` | ENDMINISTRATOR_ENDSTRIKE_PROTOCOL | 0.03 | ADDITIVE |

### SP-related (`atb*` → `SKILL_POINT*`)

| Operator | Potential | parameterKey | skillType | value | modifyType |
|----------|-----------|-------------|-----------|-------|------------|
| Alesh | P1 | `potential_1_atb` | ALESH_UNCONVENTIONAL_LURE | 10 | ADDITIVE |
| Pogranichnik | P1 | `atb_return` | POGRANICHNIK_FRIGID_HUNT | 2 | ADDITIVE |
| Pogranichnik | P2 | `atb_gain` | POGRANICHNIK_ARCTIC_AMBUSH | 5 | ADDITIVE |
| Pogranichnik | P5 | `atb_ratio` | POGRANICHNIK_ARCTIC_AMBUSH | 0.15 | ADDITIVE |
| Snowshine | P5 | `potential_5_atb` | SNOWSHINE_AID_DELIVERY | 3 | ADDITIVE |
| Antal | P3 | `potential_3_atb` | ANTAL_EMP_TEST_SITE | 5 | ADDITIVE |
| Catcher | P5 | `potential5_atb` | CATCHER_SONIC_BLADE | 2 | ADDITIVE |
| Yvonne | P4 | `atb_return` | YVONNE_FIELD_SUPPORT | 5 | ADDITIVE |

### Stat bonuses (`atk_up`, `crit_dmg_up`, etc.)

| Operator | Potential | parameterKey | skillType | value | modifyType |
|----------|-----------|-------------|-----------|-------|------------|
| Xaihi | P1 | `atk_up` | XAIHI_WISDOM_INSIGHT | 0.03 | ADDITIVE |
| Xaihi | P3 | `atk_up` | XAIHI_WISDOM_EYE | 0.05 | ADDITIVE |
| Xaihi | P3 | `wisd_up` | XAIHI_WISDOM_EYE | 0.05 | ADDITIVE |
| Xaihi | P3 | `wisd_max` | XAIHI_WISDOM_EYE | 1 | ADDITIVE |
| Lifeng | P1 | `phy_resist_down` | LIFENG_TIDAL_SWEEP | 0.05 | ADDITIVE |
| Lifeng | P3 | `atk_up` | LIFENG_TIDAL_SWEEP | 0.05 | ADDITIVE |
| Last Rite | P1 | `atk_up` | LAST_RITE_NIGHTFALL_SLASH | 0.05 | ADDITIVE |
| Alesh | P3 | `atk_up` | ALESH_UNCONVENTIONAL_LURE | 0.05 | ADDITIVE |
| Alesh | P5 | `atk_up` | ALESH_PURIFICATION_SURGE | 0.03 | ADDITIVE |
| Yvonne | P5 | `atk_up` | YVONNE_FIELD_SUPPORT | 0.05 | ADDITIVE |
| Yvonne | P5 | `crit_dmg_up` | YVONNE_FIELD_SUPPORT | 0.15 | ADDITIVE |
| Yvonne | P5 | `crit_dmg_up` | YVONNE_WILD_BLAST | 0.1 | ADDITIVE |
| Yvonne | P5 | `atk_up` | YVONNE_WILD_BLAST | 0.03 | ADDITIVE |
| Estella | P2 | `dmg_up` | ESTELLA_WRATHFUL_FLAMES | 0.1 | ADDITIVE |
| Da Pan | P1 | `potential_1_dmg_up` | DA_PAN_CRYO_DISCHARGE | 0.04 | ADDITIVE |

### Duration modifiers

| Operator | Potential | parameterKey | skillType | value | modifyType |
|----------|-----------|-------------|-----------|-------|------------|
| Alesh | P3 | `Duration` | ALESH_PURIFICATION_SURGE | 2 | ADDITIVE |
| Endministrator | P2 | `DURATION` | ENDMINISTRATOR_TERMINAL_COMMAND | 5 | ADDITIVE |
| Endministrator | P2 | `DURATION` | ENDMINISTRATOR_ENDSTRIKE_PROTOCOL | 3 | ADDITIVE |
| Fluorite | P2 | `duration_potential` | FLUORITE_ENERGY_BURST | 2 | ADDITIVE |
| Da Pan | P1 | `potential_1_duration` | DA_PAN_CRYO_DISCHARGE | 2 | ADDITIVE |
| Snowshine | P2 | `extra_duration` | SNOWSHINE_AID_DELIVERY | 2 | ADDITIVE |
| Catcher | P2 | `potential3_duration` | CATCHER_SONIC_BLADE | 2 | ADDITIVE |
| Ardelia | P2 | `potential3_duration` | ARDELIA_FREEZING_VOLLEY | 2 | ADDITIVE |
| Ardelia | P5 | `potential5_duration` | ARDELIA_FREEZING_VOLLEY | 2 | ADDITIVE |
| Akekuri | P5 | `potential_5_duration` | AKEKURI_SCARLET_FLASH | 2 | ADDITIVE |

### Stagger / poise

| Operator | Potential | parameterKey | skillType | value | modifyType |
|----------|-----------|-------------|-----------|-------|------------|
| Last Rite | P1 | `poise` | LAST_RITE_NIGHTFALL_SLASH | 30 | ADDITIVE |

### Other / operator-specific

| Operator | Potential | parameterKey | skillType | value | modifyType |
|----------|-----------|-------------|-----------|-------|------------|
| Estella | P1 | `has_potential1` | ESTELLA_DAWN_SHIELD | 1 | UNIQUE_MULTIPLIER |
| Estella | P1 | `rate_plus` | ESTELLA_DAWN_SHIELD | 0.6 | ADDITIVE |
| Estella | P2 | `distance` | ESTELLA_WRATHFUL_FLAMES | 2 | ADDITIVE |
| Pogranichnik | P1 | `has_potential1` | POGRANICHNIK_FRIGID_HUNT | 1 | UNIQUE_MULTIPLIER |
| Pogranichnik | P3 | `max_stack_owner` | POGRANICHNIK_ARCTIC_AMBUSH | 1 | ADDITIVE |
| Avywenna | P1 | `talent0_usp` | AVYWENNA_THUNDERLANCE_ATK | varies | ADDITIVE |
| Avywenna | P2 | `potential_2` | AVYWENNA_THUNDERLANCE_ATK | varies | ADDITIVE |
| Yvonne | P1 | `has_potential1` | YVONNE_FIELD_SUPPORT | 1 | UNIQUE_MULTIPLIER |
| Yvonne | P1 | `radius` | YVONNE_FIELD_SUPPORT | 1 | ADDITIVE |
| Yvonne | P1 | `interval` | YVONNE_FIELD_SUPPORT | -0.5 | ADDITIVE |
| Yvonne | P1 | `maxcnt` | YVONNE_FIELD_SUPPORT | 3 | ADDITIVE |
| Yvonne | P1 | `usp_extra` | YVONNE_FIELD_SUPPORT | 3 | ADDITIVE |
| Yvonne | P2 | `inflict_up` | YVONNE_FIELD_SUPPORT | 1 | ADDITIVE |
| Yvonne | P2 | `status_up` | YVONNE_FIELD_SUPPORT | 1 | ADDITIVE |
| Yvonne | P4 | `has_potential2` | YVONNE_FIELD_SUPPORT | 1 | UNIQUE_MULTIPLIER |
| Yvonne | P5 | `has_potential5` | YVONNE_FIELD_SUPPORT | 1 | UNIQUE_MULTIPLIER |
| Chen Qianyu | P5 | `potential5` | CHEN_QIANYU_WILD_HUNT | 1 | UNIQUE_MULTIPLIER |
| Ardelia | P1 | `rate_vul_base` | ARDELIA_FROST_SHELL | 0.15 | ADDITIVE |
| Ardelia | P2 | `potential2` | ARDELIA_FROST_SHELL | varies | ADDITIVE |
| Ardelia | P2 | `potential3_duration` | ARDELIA_FREEZING_VOLLEY | 2 | ADDITIVE |
| Ardelia | P3 | `effect_prob` | ARDELIA_FROST_SHELL | 0.1 | ADDITIVE |
| Ardelia | P5 | `potential5_dmg_rate` | ARDELIA_FREEZING_VOLLEY | 0.1 | ADDITIVE |
| Fluorite | P1 | `probability` | FLUORITE_ENERGY_BURST | 0.05 | ADDITIVE |
| Fluorite | P2 | `potential_lv` | FLUORITE_ENERGY_BURST | 1 | ADDITIVE |
| Antal | P1 | `rate` | ANTAL_SPECIFIED_RESEARCH_SUBJECT | 0.05 | ADDITIVE |
| Antal | P3 | `potential_3` | ANTAL_SPECIFIED_RESEARCH_SUBJECT | varies | — |
| Antal | P5 | `potential_5` | ANTAL_SPECIFIED_RESEARCH_SUBJECT | varies | — |
| Antal | P5 | `delay_time` | ANTAL_EMP_TEST_SITE | -0.5 | ADDITIVE |
| Antal | P5 | `potential_5_rate` | ANTAL_SPECIFIED_RESEARCH_SUBJECT | 0.05 | ADDITIVE |
| Snowshine | P1 | `potential_1` | SNOWSHINE_AID_DELIVERY | varies | — |
| Snowshine | P2 | `potential_2` | SNOWSHINE_AID_DELIVERY | varies | — |
| Snowshine | P2 | `potential_2_range` | SNOWSHINE_AID_DELIVERY | 1 | ADDITIVE |
| Ember | P1-P5 | `potential_1/3/5`, `extrashelter/time/cure/shield/attack` | various | varies | — |
| Wulfgard | P1 | `potential_skillpower` | WULFGARD_DARK_RONDO | varies | — |
| Wulfgard | P2-P5 | `potential_2/3/5`, `teammate_percent` | various | varies | — |
| Gilberta | P1-P5 | `potential/2/2_onceadd`, `radiusadd_display`, `radius`, `add` | various | varies | — |
| Arclight | P1 | `SKILL_POINT` | ARCLIGHT_OVERCHARGE | -5 | ADDITIVE |
| Arclight | P2 | `pulse_up` | ARCLIGHT_RAILGUN_MODE | 1 | ADDITIVE |
| Arclight | P3 | `count` | ARCLIGHT_RAILGUN_MODE | 1 | ADDITIVE |
| Akekuri | P2 | `potential_3` | AKEKURI_BLADE_TECHNIQUE | varies | — |
| Akekuri | P2 | `atk` | AKEKURI_BLADE_TECHNIQUE | 0.03 | ADDITIVE |
| Perlica | P1 | `DURATION` | PERLICA_SHINING_STAR | 3 | ADDITIVE |
| Perlica | P3 | `EXTRA_SCALING` | PERLICA_SHINING_STAR | 0.1 | ADDITIVE |
| Perlica | P3 | `crit` | PERLICA_SHINING_STAR | 0.05 | ADDITIVE |

## Ardelia combo skill cooldown should be 17s at level 12

The Eruption Column combo skill cooldown is currently not level-dependent. At skill level 12
it should be 17s (down from the base 18s).

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

## Resolve talent level and p3TeamShare from DSL

`minTalentLevel` and `p3TeamShare` were removed from status JSON configs during the DSL refactor.
The engine currently uses dummy talent level values (`1`) where it previously resolved from
`def.minTalentLevel`. These features need to be re-implemented through the DSL:

- **Talent level gating**: statuses that only activate at a certain talent level need a DSL
  condition (e.g. `TALENT_LEVEL >= 2`) instead of the old `minTalentLevel` field.
- **P3 team sharing**: statuses that share to team at P3+ need a DSL mechanism for creating
  shared copies with reduced duration, replacing the old `p3TeamShare.durationMultiplier` field.

Search for `TODO: resolve talent level from DSL` in `statusDerivationEngine.ts` for all affected sites.

## Segment name should go in properties

Status segment `name` field should be moved into `segments[].properties.name` to be consistent
with the Event/Segment/Frame DSL structure where all descriptive fields live in `properties`.

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

5 outstanding issues from the batch operator review:

1. **Akekuri "Staying in the Zone"** — talent two is `name`-only but wiki says "when ultimate is active, gains Link." This should be a TALENT trigger (THIS OPERATOR CAST ULTIMATE → APPLY LINK STATUS) or baked into the ult DSL as an APPLY LINK effect on the first frame. Currently neither exists.

2. **Avywenna "Tactful Approach"** — talent two is `name`-only but wiki says the ult applies 6%/10% Electric Susceptibility for 10s. This should be baked into the ult frame as APPLY ELECTRIC_SUSCEPTIBILITY with VARY_BY TALENT_TWO_LEVEL [0.06, 0.10], duration 10s. Need to verify the ult DSL has this effect.

3. **Last Rite "Cryogenic Embrittlement"** — talent two is `name`-only. Wiki says "ultimate hits enemies with Cryo Susceptibility: multiply Cryo Susceptibility effectiveness ×1.2/×1.5." This modifier needs to live somewhere — either as a SKILL_PARAMETER in the operator JSON or baked into the ult DSL as a conditional clause (IF ENEMY HAVE CRYO_SUSCEPTIBILITY → APPLY CRYO_SUSCEPTIBILITY_MODIFIER [1.2, 1.5]).

4. **Pogranichnik "Tactical Instruction"** — talent two is `name`-only. Wiki says "operators triggering ultimate's subsequent effects gain Fervent Morale for 5s/10s." Fervent Morale status already exists (from talent one The Living Banner). This should be baked into the ult DSL — when other operators benefit from the ult, they receive FERVENT_MORALE with duration VARY_BY TALENT_TWO_LEVEL [5, 10].

5. ~~**Antal combo CD**~~ — RESOLVED. Was flat 15s, corrected to 24s (rank 12). Follows standard 1s CD reduction at rank 12 pattern.

## ~~Expand eventPresentationController — consolidate timeline presentation logic~~ DONE

Completed. `eventPresentationController.ts` is now the single source for timeline presentation:
- `computeTimelinePresentation()` → returns `Map<string, ColumnViewModel>` with filtered/sorted/truncated events, fractional micro-column positions, and status view overrides
- `statusViewController.ts` absorbed and deleted
- `microColumnController.ts` slimmed to validation-only functions (`computeMonotonicBounds`, `isColumnFull`, `isBeforeLastEvent`)
- `DEC.validateAll()` kept in place (event annotation, not presentation)
- CombatPlanner replaced 3 useMemo calls + ~100 lines of inline logic with a single `columnViewModels` lookup
