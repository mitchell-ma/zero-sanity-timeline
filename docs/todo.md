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

## Sheet statistics

Add aggregate statistics for sheets, including:
- Stagger uptime (% of timeline where enemy is staggered)
- Buff uptime (per-buff active duration / total duration)
- Other relevant combat uptime metrics
