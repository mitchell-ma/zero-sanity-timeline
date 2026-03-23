---
name: update-game-data
description: Fetch and parse game data from external sources (Warfarin API, End-Axis gamedata.json, endfield.wiki.gg) into the codebase. Use when adding new operators, updating frame data, syncing gear from wiki, or looking up operator/gear reference data.
---

# Update Game Data

This skill covers all external data fetching and parsing for the Arknights: Endfield timeline calculator.

---

# Part 1: Operator Data Parsing

Parse operator data from two remote sources into per-operator files under `game-data/operators/` (base config) and `game-data/operator-skills/` (skill data).

## Data Sources

| Source | URL | Provides |
|---|---|---|
| **Warfarin API** | `https://api.warfarin.wiki/v1/en/operators/<slug>` | Operator info, stats, potentials, levels, skill descriptions, **skill multipliers** (per-level atk_scale from `skillPatchTable`), **ultimate active duration** (from `blackboard.duration`) |
| **End-Axis gamedata.json** | `https://raw.githubusercontent.com/Lieyuan621/Endaxis/main/public/gamedata.json` | Skill frame timing data, attack segments, anomalies, variants |
| **Endfield Wiki** | `https://endfield.wiki.gg/wiki/<Operator_Name>` | Skill descriptions, talent details, skill mechanics, **operator images** (banner/splash art, icon) — useful for cross-referencing and verifying data from the other two sources |

All sources are fetched live — we do not use offline copies. When investigating discrepancies or adding new operators, cross-reference all three sources to ensure accuracy.

## Operator Images

Operator banner (splash art) and icon images can be retrieved from the Endfield Wiki:

| Image | URL pattern | Output path | Format |
|---|---|---|---|
| **Banner** | `https://endfield.wiki.gg/images/<Operator_Name>_Banner.png` | `src/assets/operators/<Name>_Banner.webp` | Convert PNG → WebP |
| **Icon** | `https://endfield.wiki.gg/images/<Operator_Name>_icon.png` | `src/assets/operators/<Name>_icon.png` | PNG (keep as-is) |

### Workflow
1. Download the splash art PNG from the wiki
2. Convert to WebP (use `sharp` or similar): `sharp(input).webp({ quality: 80 }).toFile(output)`
3. Download the icon PNG and copy directly to assets
4. Naming convention: `<Name>_Banner.webp` and `<Name>_icon.png` (PascalCase operator name)

## Output

- `src/model/game-data/operators/<slug>-operator.json` — Per-operator base config (stats, potentials, talents — no skills)
- `src/model/game-data/operator-skills/<slug>-skills.json` — Per-operator skill data (frame timing, multipliers, segments)

## Parsers

| Parser | Location | Source | What it produces |
|---|---|---|---|
| `parseWarfarinOperator.ts` | `src/model/utils/parsers/` | Warfarin API | Operator info, stats, potentials, allLevels, skill descriptions, skill multipliers |
| `parseEndAxisGameData.ts` | `src/model/utils/parsers/` | End-Axis GitHub | Skill frame timing data (segments, frames, resource/status interactions) |
| `parseGameData.ts` | `src/model/utils/parsers/` | Orchestrator | Runs both parsers, merges frame timing with multipliers into per-operator files |

### Usage

```bash
# Parse a single operator (both sources)
npx tsx src/model/utils/parsers/parseGameData.ts laevatain

# Parse all operators
npx tsx src/model/utils/parsers/parseGameData.ts --all

# Parse only Warfarin data for an operator
npx tsx src/model/utils/parsers/parseWarfarinOperator.ts laevatain

# Parse only End-Axis game data skills for an operator
npx tsx src/model/utils/parsers/parseEndAxisGameData.ts laevatain
```

## Pipeline

```
Warfarin API ──→ parseWarfarinOperator.ts ──→ operator info (stats, potentials, levels, skill descriptions)
                                           ──→ skill multipliers (per-level atk_scale from skillPatchTable)
                                           ──→ timing overrides (ultimateActiveDuration from blackboard.duration)
                                                      ↓
End-Axis GitHub ──→ parseEndAxisGameData.ts ──→ skill frame timing (segments, frames, resource/status interactions)
                                                      ↓
                              parseGameData.ts (orchestrator) ──→ merge multipliers into frames
                                                              ──→ operators/<slug>-operator.json (base config)
                                                              ──→ operator-skills/<slug>-skills.json (skill data)
```

## Skill Timing Overrides

Top-level timing fields in operator JSON (`ultimateActiveDuration`, `ultimateCooldownDuration`, `battleSkillActivationDuration`, `comboSkillActivationDuration`) control the timeline event durations, overriding values derived from the skills JSON.

### Auto-extracted from Warfarin (by parser)

| Field | Source | Notes |
|---|---|---|
| `ultimateActiveDuration` | `ultimate_skill.blackboard.duration` | Active phase duration in seconds. Only present for ultimates with a sustained buff/transformation phase. |

### Manual only (NOT auto-extracted)

| Field | Why manual |
|---|---|
| `ultimateCooldownDuration` | Warfarin's `ultimate_skill.coolDown` is **ambiguous** — it represents either a real post-ult cooldown (e.g., Laevatain 10s) or an energy recharge lockout (e.g., Antal, Yvonne, Ardelia where cooldown should be 0). The Warfarin data has no field to distinguish these cases. Must be verified in-game. Set to `0` or omit for energy-gated ults with no real cooldown. |
| `battleSkillActivationDuration` | Not available from Warfarin. `normal_skill.blackboard.duration` is the skill's *effect* duration (e.g., Focus 60s), not the cast/activation time. Sourced from End-Axis `skill_duration` or manual measurement. |
| `comboSkillActivationDuration` | Not available from Warfarin. Sourced from End-Axis `link_duration` or manual measurement. |
| `basicAttackDefaultDuration` | Not available from any external source. Must be manually measured. |

## Skill ID Convention

Skill IDs are **unprefixed** — they match the `CombatSkillType` enum values directly:
- `"id": "FLAMING_CINDERS"` (not `"LAEVATAIN_FLAMING_CINDERS"`)
- `"id": "SMOULDERING_FIRE_ENHANCED"` (not `"LAEVATAIN_SMOULDERING_FIRE_ENHANCED"`)

Each skill category with an `id` also has an `originId` pointing to the operator's camelCase ID:
```json
"BASIC_ATTACK": { "id": "FLAMING_CINDERS", "originId": "laevatain", ... }
```

Potential `skillParameterModifier.skillType` values also use unprefixed IDs.

## Output Format (per-operator JSON)

See `src/model/game-data/operatorDataSpec.md` for the full schema. Key structures:

- **Duration**: `{ "value": 2.2, "unit": "SECOND" }` (`UnitType` enum)
- **Resource interactions**: `{ "resourceType": "SKILL_POINT", "interactionType": "RECOVER", "value": 20, "target": "SELF" }`
- **Status interactions**: `{ "interactionType": "APPLY", "statusType": "HEAT", "stacks": 1, "target": "ENEMY" }`
- **Animation**: `{ "duration": { ... }, "timeInteractionType": "TIME_STOP" }`
- **Event component type**: `SEGMENT` or `FRAME` (`EventComponentType` enum)
- **Data sources**: `["END_AXIS"]` or `["WARFARIN"]` or `["SELF"]` (`DataSourceType` enum)

## gamedata.json Structure

### Top-level keys
- `characterRoster` — Array of operator objects
- `enemyDatabase` — Enemy data
- `weaponDatabase` — Weapon data
- `equipmentDatabase` — Gear/equipment data

### Character keys → operator JSON mapping

Each character in `characterRoster` has:

| gamedata key | operator JSON mapping | Notes |
|---|---|---|
| `id` | Operator key (`OperatorType` enum) | e.g. `"LAEVATAIN"` |
| `attack_segments[]` | `skills.BASIC_ATTACK.segments[]` | Array of basic attack sequences |
| `attack_segments[].duration` | `segment.duration` | Duration struct |
| `attack_segments[].damage_ticks[]` | `segment.frames[]` | Frame objects |
| `attack_segments[].damage_ticks[].offset` | `frame.offset` | Duration struct |
| `attack_segments[].damage_ticks[].sp` | `resourceInteractions[SKILL_POINT/RECOVER]` | SP recovered on hit |
| `attack_segments[].damage_ticks[].stagger` | `resourceInteractions[STAGGER/RECOVER]` | Stagger dealt |
| `skill_duration` | `skills.BATTLE_SKILL.duration` | Duration struct |
| `skill_spCost` | `resourceInteractions[SKILL_POINT/CONSUME]` | SP cost to activate |
| `skill_gaugeGain` | `resourceInteractions[ULTIMATE_ENERGY/RECOVER/SELF]` | Gauge gained |
| `skill_teamGaugeGain` | `resourceInteractions[ULTIMATE_ENERGY/RECOVER/TEAM]` | Team gauge gained |
| `skill_damage_ticks[]` | `skills.BATTLE_SKILL.frames[]` | Same frame format |
| `link_duration` | `skills.COMBO_SKILL.duration` | Duration struct |
| `link_cooldown` | `resourceInteractions[COOLDOWN/CONSUME]` | Cooldown |
| `link_gaugeGain` | `resourceInteractions[ULTIMATE_ENERGY/RECOVER/SELF]` | Gauge gained |
| `link_damage_ticks[]` | `skills.COMBO_SKILL.frames[]` | Same frame format |
| *(not in gamedata)* | `skills.COMBO_SKILL.animation` | Time-stop — must be manually measured |
| `ultimate_duration` | `skills.ULTIMATE.duration` | Duration struct |
| `ultimate_animationTime` | `skills.ULTIMATE.animation.duration` | Time-stop animation |
| `ultimate_gaugeMax` | `resourceInteractions[ULTIMATE_ENERGY/CONSUME]` | Energy cost |
| `ultimate_damage_ticks[]` | `skills.ULTIMATE.frames[]` | Same frame format |
| `execution_duration` | Not yet parsed | Finisher animation |

### Terminology mapping
- gamedata `skill_*` = Battle Skill (`CombatSkillType.BATTLE_SKILL`)
- gamedata `link_*` = Combo Skill (`CombatSkillType.COMBO_SKILL`)
- gamedata `ultimate_*` = Ultimate (`CombatSkillType.ULTIMATE`)
- gamedata `attack_segments` = Basic Attack (`CombatSkillType.BASIC_ATTACK`)
- gamedata `execution_*` = Finisher (not yet modeled)

## Anomalies / Inflictions

Anomalies represent status inflictions applied by damage ticks. They appear on:
- `attack_segments[].anomalies` or `attack_segments[].physicalAnomaly` — per-segment inflictions
- `skill_anomalies` / `link_anomalies` / `ultimate_anomalies` — per-skill inflictions

Each anomaly entry has:

| gamedata key | Meaning |
|---|---|
| `type` | Infliction type (see mapping below) |
| `stacks` | Number of stacks applied |
| `duration` | Duration override (0 = default) |
| `offset` | Time offset in seconds |
| `_id` | Links to `boundEffects` array on damage ticks |

### Anomaly type → statusInteraction mapping

| gamedata `type` | `statusType` | `interactionType` | Notes |
|---|---|---|---|
| `blaze_attach` | `HEAT` | `APPLY` | Heat infliction |
| `cold_attach` | `CRYO` | `APPLY` | Cryo infliction |
| `emag_attach` | `ELECTRIC` | `APPLY` | Electric infliction |
| `nature_attach` | `NATURE` | `APPLY` | Nature infliction |
| `magma_0` | `COMBUSTION` | `APPLY` | Forced reaction (`isForced: true`, `statusLevel: 1`) |
| `magma_1` – `magma_3` | `MELTING_FLAME` | `APPLY` | Intermediate Melting Flame effects |
| `magma_4` | `HEAT` | `ABSORB` | Absorbs Heat infliction → Melting Flame stacks (with `conversion`) |
| `blaze_burst` / `burning` | `COMBUSTION` | `APPLY` | Combustion arts reaction |
| `corrosion` | `CORROSION` | `APPLY` | Forced corrosion (`isForced: true`) |

## Variants

`variants[]` contains enhanced/empowered forms of skills. Each variant has:
- `name` — Chinese name (强化 = Empowered, 大招内 = Enhanced/during ult)
- `type` — `"attack"` (basic attack variant) or `"skill"` (battle skill variant)
- `attackSegments[]` — Same structure as `attack_segments` (with `physicalAnomaly` and `damageTicks`)
- `duration`, `damageTicks[]`, `allowedTypes[]`

### Variant → skill category mapping

| Variant `type` | Variant `name` contains | operator JSON category |
|---|---|---|
| `attack` | 大招内 (during ult) | `ENHANCED_BASIC_ATTACK` |
| `attack` | 强化 (empowered) | `EMPOWERED_BASIC_ATTACK` |
| `skill` | 大招内 (during ult) | `ENHANCED_BATTLE_SKILL` |
| `skill` | 强化 (empowered) | `EMPOWERED_BATTLE_SKILL` |
| `skill` | both | `ENHANCED_EMPOWERED_BATTLE_SKILL` |

Naming convention: **Enhanced** = during ultimate (大招内), **Empowered** = from status effects like Melting Flame stacks (强化).

### Detecting empowered variants from skill descriptions

When a skill description mentions a conditional "additional attack" (e.g., "If the enemy has active Electrification, consume the Electrification to unleash an additional attack"), this implies an **empowered variant** even if End-Axis doesn't have a variant entry for it. In Warfarin data, the additional attack's multiplier is typically bundled into the base skill's `blackboard` as a separate `atk_scale` variant key (e.g., `atk_scale2`).

**How to identify:**
1. Check the Warfarin skill description for phrases like "additional attack", "unleash an extra", "trigger an additional"
2. Cross-reference with the Endfield Wiki (`https://endfield.wiki.gg/wiki/<Operator_Name>`) for skill mechanic details
3. Look for `atk_scale2` or other variant keys in the Warfarin `blackboard` that don't correspond to sequential hits

**How to handle:**
- The base `BATTLE_SKILL` should only contain multipliers for the base hits (e.g., `atk_scale` for the 2 slashes)
- The `EMPOWERED_BATTLE_SKILL` should contain multipliers for all hits including the additional attack (base hits use `atk_scale`, additional attack uses `atk_scale2` renamed to `atk_scale`)
- Non-scale keys like `atb` (SP recovery) on the additional attack frame should be reflected in `resourceInteractions`
- Add `statusInteractions` on the additional attack frame if the skill consumes a status (e.g., `CONSUME` + `ELECTRIFICATION`)

**Known operators with description-implied empowered battle skills:**
| Operator | Skill | Condition | Additional Attack |
|---|---|---|---|
| Arclight | Tempestuous Arc | Enemy has Electrification | Consume Electrification → Electric DMG + SP recovery |

## Ultimates with Delayed Hits

Some ultimates have damage ticks with `offset > duration`. These represent delayed effects that occur after the main animation ends.

### Detection
After parsing ultimate ticks, check if any frame has `offset.value > duration.value`. If so, split into segments.

### Splitting into segments
1. **Main segment**: Frames where `offset.value <= duration.value`. Uses original duration.
2. **Delayed segment**: Frames where `offset.value > duration.value`. Re-offset each frame by subtracting the main duration. Duration = max re-offset + 0.1s buffer.

### Known delayed segments
| Operator | Ultimate Name | Delayed Segment Name |
|---|---|---|
| Lifeng | Heart of the Unmoving | Vajra Impact |
| Arclight | Exploding Blitz | Explosion |

## Combo Skill Time Stop

Combo skills have a time-stop phase. This is **not sourced from gamedata.json** — it must be manually measured.

Default for new operators:
```json
"animation": {
  "duration": { "value": 0.5, "unit": "SECOND" },
  "timeInteractionType": "TIME_STOP"
}
```

With `dataSources: ["SELF"]` when measured, omitted or empty when using defaults.

## Data Source Rules

| `DataSourceType` value | Meaning | Trust level |
|---|---|---|
| `END_AXIS` | Parsed from End-Axis gamedata.json | Secondary |
| `WARFARIN` | Parsed from Warfarin API | Secondary |
| `SELF` | Manually measured/verified | **Authoritative** — always takes precedence |

### Rules
- When parsing from gamedata.json, set `dataSources: ["END_AXIS"]`
- When parsing from Warfarin API, set `dataSources: ["WARFARIN"]`
- `SELF` data lives in `skillOverrides` — the parser **never touches** this field
- When manually correcting a value, add it to `skillOverrides` with `dataSources: ["SELF"]`

## Skill Overrides

Manually verified data is stored separately from parsed data using the `skillOverrides` top-level field in operator JSON files. This keeps the base data (from END_AXIS/WARFARIN) always up-to-date while preserving manual corrections.

### Structure

`skillOverrides` mirrors the `skills` structure but is sparse — only overridden values are present:

```json
{
  "skills": { ... },
  "skillOverrides": {
    "COMBO_SKILL": {
      "animation": {
        "duration": { "value": 0.729, "unit": "SECOND" },
        "timeInteractionType": "TIME_STOP",
        "dataSources": ["SELF"]
      }
    },
    "ULTIMATE": {
      "frames": [...],
      "dataSources": ["SELF"]
    }
  }
}
```

### Override precedence
- `skills` contains the base data from external sources (always overwritten by parsers)
- `skillOverrides` contains SELF-verified corrections (never touched by parsers)
- At read time, `skillOverrides` values take precedence over `skills` values via deep merge

### Override categories
Overrides can target any level of the skill structure:
- **Category-level properties**: `animation`, `duration`, `resourceInteractions`
- **Frame arrays**: Complete replacement of the `frames` array for a category
- **Segment arrays**: Complete replacement of `segments` for a category

### Parser behavior with overrides
When the parser runs:
1. Base `skills` are always updated with the latest source data
2. `skillOverrides` are preserved as-is (never modified)
3. New source values are compared against override values
4. If a new source value differs from an override value, a warning is logged:
   ```
   ⚠ OVERRIDE CONFLICT in ARDELIA COMBO_SKILL.animation.duration.value: source=0.5, override=0.729 — new source data may be more accurate
   ```
5. These warnings indicate the user should re-verify the override — the external source may have corrected their data

### Adding a new override
1. Identify the value to override in the `skills` structure
2. Add the corresponding entry to `skillOverrides` with the same path
3. Set `dataSources: ["SELF"]` on the override entry
4. The base `skills` value remains unchanged (it will be updated by future parser runs)

## Finding New Operators in External Sources

Operator names, IDs, and slugs vary across sources. Don't assume any source uses the same identifier. When adding a new operator, search all three sources and cross-reference:

| Source | Identifier | Gotchas |
|---|---|---|
| **Warfarin API** | URL slug (e.g., `tangtang`, `chen-qianyu`) | Usually lowercase hyphenated English name, but may differ from our enum |
| **End-Axis** | `characterRoster[].id` (e.g., `TANGTANG`, `CHENQIANYU`) | No separators, may abbreviate or transliterate differently (e.g., `POGRANICHNK` → `POGRANICHNIK`) |
| **Endfield Wiki** | Page name (e.g., `Tangtang`, `Chen_Qianyu`) | PascalCase with underscores for spaces |

### Search strategies when the operator isn't found by name

1. **Warfarin**: Try alternate slugs (hyphenated, no spaces, abbreviated). If unsure, there is no list endpoint for operators — try common transliterations.
2. **End-Axis**: Fetch `gamedata.json` and list all `characterRoster` entries (`id`, `name`, `element`, `weapon`, `rarity`). Match by known attributes like element, weapon type, rarity, or skill frame offsets.
3. **Wiki**: Search `https://endfield.wiki.gg/wiki/<Name>` with different capitalizations or check the operator list page.

### End-Axis ID mapping

The parser falls back to using the End-Axis ID as-is for unmapped operators (with a warning). Add an explicit mapping to `GAMEDATA_ID_TO_OPERATOR` in `parseEndAxisGameData.ts` if the End-Axis ID differs from our `OperatorType` enum.

## Parsing Workflow

1. Fetch gamedata.json from End-Axis GitHub raw URL
2. Find operator in `characterRoster` by `id` (falls back to using ID as-is if not in `GAMEDATA_ID_TO_OPERATOR`)
3. Extract basic attack segments from `attack_segments[]`
4. Extract battle skill from `skill_*` fields
5. Extract combo skill from `link_*` fields
6. Extract ultimate from `ultimate_*` fields
7. For each damage tick, resolve anomalies using `boundEffects` IDs → anomaly type mapping
8. Check for out-of-bounds ultimate ticks and split into delayed segments
9. Check `variants[]` for enhanced/empowered forms
10. For combo skills, add time-stop animation with default values
11. Output in the new structured format with `dataSources: ["END_AXIS"]`
12. Merge with Warfarin operator data (stats, potentials, levels, skill multipliers)
13. Merge Warfarin skill multipliers into End-Axis frames (see Multiplier Merging below)
14. Compare incoming skill values against existing `skillOverrides` — log warnings for any conflicts
15. Write base skills to `skills` (always overwritten), preserve `skillOverrides` as-is

## Skill Multipliers

Skill multiplier data is sourced from the Warfarin API `skillPatchTable`. Each skill has 12 levels of `blackboard` entries containing per-hit damage multipliers and other parameters.

### Warfarin skillPatchTable structure

Each entry in `skillPatchTable` is keyed by a Warfarin skill ID (e.g., `chr_0016_laevat_attack1`) and contains `SkillPatchDataBundle` — an array of 12 level entries:

```json
{
  "skillId": "chr_0016_laevat_attack1",
  "level": 1,
  "blackboard": [
    { "key": "atk_scale", "value": 0.16 }
  ]
}
```

### Warfarin skill ID → skill category mapping

| Suffix | Category | Index |
|--------|----------|-------|
| `attack1`..`attackN` | `BASIC_ATTACK` | segment 0..N-1 |
| `normal_skill` | `BATTLE_SKILL` | 0 |
| `normal_skill_during_ult` | `ENHANCED_BATTLE_SKILL` | 0 |
| `combo_skill` | `COMBO_SKILL` | 0 |
| `ultimate_skill` | `ULTIMATE` | 0 |
| `ult_attack1`..`ult_attackN` | `ENHANCED_BASIC_ATTACK` | segment 0..N-1 |
| `dash_attack` | `DASH_ATTACK` | 0 |
| `plunging_attack_end` | `DIVE_ATTACK` | 0 |
| `power_attack` | `FINISHER` | 0 |

### atk_scale vs display_atk_scale

- **`atk_scale`** (and variants): The **per-hit multiplier** used in damage calculation. This is the **source of truth**.
- **`display_atk_scale`**: The total shown in the in-game skill description. This is an **approximation** — it represents `sum(per_hit × hit_count)` but may have rounding discrepancies.

`display_atk_scale` is kept in the blackboard for frame count derivation but excluded from frame multiplier output. Only `atk_scale` values are stored on frames.

### Deriving hit count from multipliers

The true hit count for a skill is derived from Warfarin data using this unified procedure (implemented in `deriveHitCount()`):

1. Find `display_atk_scale` (the in-game total)
2. Identify the **base key** (`atk_scale`, or `atk_scale_1`/`atk_scale1` if no bare `atk_scale`)
3. Identify **variant keys** (all other `atk_scale_*` numbered keys)
4. Subtract variant values from display total → remainder
5. `regular_frames = round(remainder / base_value)`
6. `total_frames = regular_frames + variant_count`

```
variant_sum = sum(atk_scale_2, atk_scale_3, ...)
remainder = display_atk_scale - variant_sum
regular_frames = round(remainder / atk_scale)
total_frames = regular_frames + len(variant_keys)
```

**Edge cases:**
- Remainder < 0.5× base value → all keys are distinct hits, one frame per key
- No `display_atk_scale` → one frame per `atk_scale` key (base + all variants)
- No `atk_scale` keys at all → 1 frame

### Comparing with End-Axis frame count

After deriving the true hit count, compare with End-Axis frames:
- **Match**: Each frame has a 1:1 multiplier assignment — no interpolation needed
- **End-Axis has fewer frames**: Missing frames should be interpolated using segment timing (evenly distributed within the segment duration)
- **End-Axis has more frames**: Extra frames may represent non-damage events (status applications, resource recoveries without damage)

### Multiplier merge fallbacks

The orchestrator handles two common situations where Warfarin multiplier data can't be directly assigned:

**Fallback 1 — Category name mismatch (ENHANCED ↔ EMPOWERED):**
Warfarin and End-Axis may classify the same variant differently (e.g., Warfarin `ult_attack` → `ENHANCED_BASIC_ATTACK`, End-Axis "强化重击" → `EMPOWERED_BASIC_ATTACK`). The merger tries `CATEGORY_FALLBACKS` when the primary category isn't found:
- `ENHANCED_BASIC_ATTACK` ↔ `EMPOWERED_BASIC_ATTACK`
- `ENHANCED_BATTLE_SKILL` ↔ `EMPOWERED_BATTLE_SKILL`

**Fallback 2 — Empty segments (final strike with no End-Axis frames):**
When a Warfarin segment (e.g., `attack5` carrying poise/atb) maps to an End-Axis segment with 0 frames, non-scale keys (stagger, SP) are redistributed to the last non-empty segment's first frame.

**Fallback 3 — No End-Axis data (Warfarin-only operators):**
When an operator has no End-Axis frame timing data, the parser creates a skeleton `skills` structure from Warfarin multiplier data. Frame count per skill/segment is derived using `deriveHitCount()`:

**Procedure:**
1. Find `display_atk_scale` (or `atk_scale_display`, `display_atk_scale1`) — the total shown in-game
2. Identify the **base key** (`atk_scale`, or `atk_scale_1`/`atk_scale1` if no bare `atk_scale`)
3. Identify **variant keys** (all other `atk_scale_*` keys, e.g., `atk_scale_2`, `atk_scale_3`)
4. Subtract all variant values from `display_atk_scale` → remainder
5. Divide remainder by base key value → number of **regular** (repeated) frames
6. Add the number of variant keys → **total frame count**

```
variant_sum = sum(atk_scale_2, atk_scale_3, ...)
remainder = display_atk_scale - variant_sum
regular_frames = round(remainder / atk_scale)
total_frames = regular_frames + len(variant_keys)
```

**Edge cases:**
- If remainder < 0.5× base value, all keys are distinct hits (not a repeating base) → one frame per `atk_scale` key
- If no `display_atk_scale` exists → one frame per `atk_scale` key (base + all variants)
- If no `atk_scale` keys at all → 1 frame

**Skeleton structure:**
- Segmented skills (basic attacks): each `attackN` in Warfarin → one segment with derived frame count
- Flat skills (battle/combo/ultimate): derived frame count from sub-index 0
- Frame offsets default to 0 (no timing data without End-Axis)
- `dataSources: ["WARFARIN"]` on all skeleton entries

### Multiplier merging

The orchestrator (`parseGameData.ts`) merges Warfarin multipliers into End-Axis frames:

1. **Positional assignment** (exact match only): When the number of orderable atk_scale keys exactly equals the number of End-Axis frames, keys are sorted by hit order and assigned 1:1. On each frame, the original key is normalized to `atk_scale`. Example: Da Pan battle skill — 2 keys (`atk_scale_pre`, `atk_scale`) and 2 frames → positional.

2. **Non-positional assignment** (mismatch): When key count ≠ frame count, the keys represent different skill phases, not sequential hits. All atk_scale keys are stored as-is on every frame. Example: Laevatain battle skill — 3 keys (`atk_scale`, `atk_scale_2`, `atk_scale_3`) but 10 frames → stored as-is on all frames.

3. **Named keys** (`atk_scale_loop`, `atk_scale_end`, `atk_scale_boom`, etc.) are never positionally assigned. Always stored as-is on every frame.

4. **Non-scale keys** (`poise`, `duration`, `airborne_duration`, `count`, etc.) are stored on the first frame.

### All known atk_scale key variants

| Key | Meaning | Operators |
|-----|---------|-----------|
| `atk_scale` | Standard per-hit multiplier | All |
| `atk_scale_pre` | Pre-hit (charge-up) | Da Pan |
| `atk_scale_2` / `atk_scale2` | Second hit | Multiple |
| `atk_scale_3` / `atk_scale3` | Third hit | Multiple |
| `atk_scale4` | Fourth hit | Fluorite, Pogranichnik |
| `atk_scale_1` / `atk_scale1` | Explicit first hit | Multiple |
| `atk_scale_1ex` / `atk_scale_2ex` | Extended variants | Alesh |
| `atk_scale_loop` | Repeating phase hit | Snowshine, Da Pan |
| `atk_scale_end` | Final phase hit | Da Pan |
| `atk_scale_final` | Final hit | Pogranichnik |
| `atk_scale_rush` | Rush phase | Pogranichnik |
| `atk_scale_trigger` | Trigger-conditional | Endministrator, Pogranichnik |
| `atk_scale_boom` | Explosion | Ardelia, Yvonne |
| `atk_scale_tick` | DoT tick | Yvonne |
| `atk_scale_extra` | Extra conditional hit | Yvonne |
| `atk_scale_layer` | Layered/stacking | Yvonne |
| `atk_scale_plus` | Enhanced (success) | Wulfgard |
| `atk_scale_plus_fail` | Enhanced (fail) | Wulfgard |
| `atk_scale_lance` | Thunderlance hit | Avywenna |
| `atk_scale_lance_ult` | Thunderlance during ult | Avywenna |
| `atk_scale_pull` | Pull/gravity | Gilberta |
| `atk_scale_explosion` | Explosion | Gilberta |
| `atk_scale_add_1`–`4` | Additional hits | Fluorite |
| `display_atk_scale` | Display total (excluded) | Many |
| `atk_scale_display` | Display total (excluded) | Some |

## Conditional Gauge Gains

Some combo skills have gauge gains that vary by enemies hit. In gamedata.json these appear as multiple `link_gaugeGain` entries or structured gauge data. Map to:

```json
{
  "resourceType": "ULTIMATE_ENERGY",
  "interactionType": "RECOVER",
  "value": 25,
  "target": "SELF",
  "conditions": { "enemiesHitThreshold": 1 }
}
```

> **Note:** Conditional gauge gains may not be available in gamedata.json and may need to be sourced from skills.json or manually entered.

---

# Part 1b: Weapon Data Parsing

Parse weapon data from the Warfarin API into per-weapon files under `game-data/weapons/`.

## Data Source

| Source | URL | Provides |
|---|---|---|
| **Warfarin API (list)** | `https://api.warfarin.wiki/v1/en/weapons?version=1.1` | All weapon slugs, names, types, rarities |
| **Warfarin API (detail)** | `https://api.warfarin.wiki/v1/en/weapons/<slug>` | Full weapon data: base attack curve, skills |
| **Wiki (images)** | `https://endfield.wiki.gg/wiki/<Weapon_Name>` | Weapon icon/splash images |

> **Note:** The `version` query parameter on the list endpoint should be updated when new game versions release (currently `1.1`).

## Warfarin Weapon API Structure

### List endpoint (`/weapons?version=1.1`)

Returns `data[]` — array of 62 weapons with summary fields:

```json
{ "id": "wpn_sword_0016", "slug": "never-rest", "name": "Never Rest", "iconId": "wpn_sword_0016", "rarity": 6, "weaponType": 1, "weaponTags": ["attr_will", "attr_atk", "tacafter"] }
```

The `refs.weaponTypes` object maps type IDs to names.

### Warfarin weaponType → WeaponType enum mapping

| API `weaponType` | API name | `WeaponType` enum |
|---|---|---|
| `1` | Sword | `SWORD` |
| `2` | Arts Unit | `ARTS_UNIT` |
| `3` | Greatsword | `GREAT_SWORD` |
| `5` | Polearm | `POLEARM` |
| `6` | Handcannon | `HANDCANNON` |

### Detail endpoint (`/weapons/<slug>`)

Returns `data` with these sections:

| Section | Key fields |
|---|---|
| `weaponBasicTable` | `weaponId`, `engName`, `rarity`, `weaponType`, `maxLv`, `weaponDesc`, `weaponSkillList[]`, `weaponPotentialSkill` |
| `itemTable` | `name`, `iconId`, `decoDesc` (flavor text) |
| `weaponUpgradeTemplateTable.list[]` | `weaponLv`, `baseAtk` (90 entries, lv1–lv90) |
| `skillPatchTable` | Keyed by skill ID → `SkillPatchDataBundle[]` (9 levels each) |

### Skill level data (`SkillPatchDataBundle`)

Each skill level entry has:

```json
{
  "skillId": "sk_wpn_sword_0016",
  "skillName": "Flow: Reincarnation",
  "description": "Physical DMG Dealt <@ba.vup>+{phy_dmg_up:0.0%}</>...",
  "level": 1,
  "blackboard": [
    { "key": "phy_dmg_up", "value": 0.16, "valueStr": "" },
    { "key": "duration", "value": 30, "valueStr": "" },
    { "key": "max_stack", "value": 5, "valueStr": "" }
  ],
  "tagId": "tacafter",
  "coolDown": 0,
  "maxChargeTime": 1
}
```

- `blackboard[]` contains all scaling values as key-value pairs across 9 levels
- `description` uses rich text tags (same `stripRichText()` as operator skill descriptions)
- `tagId` indicates skill category (e.g., `tacafter` = triggered after condition, `attr_*` = stat boost)

### Weapon skill categories

| `tagId` prefix | Skill type | Example |
|---|---|---|
| `attr_*` | Passive stat boost | `attr_will` → Will Boost, `attr_atk` → Attack Boost |
| `tacafter` | Triggered effect (after condition) | Flow: Reincarnation |
| `tactic` | Tactical/named passive | Infliction: Vicious Purge |

Generic stat boost skills share IDs across weapons (e.g., `wpn_attr_will_high`, `wpn_sp_attr_atk_high`). Named skills have weapon-specific IDs (e.g., `sk_wpn_sword_0016`).

## Weapon JSON Structure

Each weapon is a standalone file under `game-data/weapons/<slug>.json`:

```json
{
  "weaponId": "NEVER_REST",
  "name": "Never Rest",
  "weaponType": "SWORD",
  "weaponRarity": 6,
  "allLevels": [
    { "level": 1, "baseAttack": 51 },
    ...
    { "level": 90, "baseAttack": 500 }
  ],
  "skills": [
    {
      "weaponSkillType": "WILL_BOOST_L",
      "name": "Will Boost [L]",
      "description": "Will +",
      "skillSlot": 1,
      "skillCategory": "STAT_BOOST",
      "allLevels": [
        { "level": 1, "WILL": 20 },
        ...
        { "level": 9, "WILL": 156 }
      ]
    },
    {
      "weaponSkillType": "ATTACK_BOOST_L",
      "name": "Attack Boost [L]",
      "description": "Attack +",
      "skillSlot": 2,
      "skillCategory": "STAT_BOOST",
      "allLevels": [
        { "level": 1, "ATTACK_BONUS": 0.05 },
        ...
        { "level": 9, "ATTACK_BONUS": 0.39 }
      ]
    },
    {
      "weaponSkillType": "NEVER_REST_FLOW_REINCARNATION",
      "name": "Flow: Reincarnation",
      "description": "Physical DMG Dealt +{phy_dmg_up:0.0%}. After the wielder's skill recovers SP, the wielder gains Physical DMG Dealt +{phy_dmg_up2:0.0%} while other operators in the team gain Physical DMG Dealt +{phy_dmg_up3:0.0%} for {duration:0}s. Max stacks: {max_stack:0}.",
      "skillSlot": 3,
      "skillCategory": "NAMED",
      "allLevels": [
        {
          "level": 1,
          "PHYSICAL_DAMAGE_BONUS": 0.16,
          "conditionalStats": [
            {
              "triggerConditions": ["SKILL_POINT_RECOVERY_FROM_SKILL"],
              "triggerSources": ["SELF", "OTHER_OPERATORS"],
              "duration": { "value": 30, "unit": "SECOND" },
              "maxStacks": 5,
              "phy_dmg_up2": 0.05,
              "phy_dmg_up3": 0.025
            }
          ]
        },
        ...
      ]
    }
  ],
  "dataSources": ["WARFARIN"]
}
```

### Key design decisions

- **`allLevels`**: Full 90-level base attack curve (all entries from the API)
- **`skills[]`**: Ordered array matching `weaponSkillList[]` from the API. Slot 1-2 always present; slot 3 only for rarity 4+
- **`skillCategory`**: `"STAT_BOOST"` for generic `attr_*`/`wpn_attr_*`/`wpn_sp_attr_*` skills, `"NAMED"` for weapon-specific skills
- **`weaponSkillType`**: Primary skill identifier. Maps to the `WeaponSkillType` enum. Stat boosts use generic names (`WILL_BOOST_L`). Named skills use **weapon-prefixed** names: `<WEAPON_NAME>_<SKILL_NAME>` (e.g., `NEVER_REST_FLOW_REINCARNATION`). Shared skills get one enum value per weapon
- **Stat boost levels**: Stats flattened directly onto level entries (no `blackboard` wrapper), keys mapped to `StatType` enum values
- **Named skill levels**: Split into permanent stats (at level root, mapped to `StatType`) and `conditionalStats[]` entries with `triggerCondition`, `duration` struct, optional `maxStacks`, and stat key-value pairs
- **Description**: Named skills retain `{variable:format}` placeholders for runtime string interpolation (e.g., `{phy_dmg_up:0.0%}` → "16.0%")
- **`weaponId`**: `WeaponType` enum value (e.g., `"NEVER_REST"`). `name` is the formatted display name.

### Weapon blackboard key → StatType mapping

Common blackboard keys used in stat boost skills:

| Blackboard key | StatType | Notes |
|---|---|---|
| `atk` | `ATTACK_BONUS` | Percentage (0.05 = 5%) |
| `str` | `STRENGTH` | Flat |
| `agi` | `AGILITY` | Flat |
| `will` | `WILL` | Flat |
| `wisd` / `int` | `INTELLECT` | Flat |
| `mainattr` | *(operator's main attribute)* | Flat; resolves at runtime |
| `phy_dmg_up` | `PHYSICAL_DAMAGE_BONUS` | Percentage |
| `art_dmg_up` | `ARTS_DAMAGE_BONUS` | Percentage |
| `fire_dmg_up` | `HEAT_DAMAGE_BONUS` | Percentage |
| `ice_dmg_up` | `CRYO_DAMAGE_BONUS` | Percentage |
| `thunder_dmg_up` | `ELECTRIC_DAMAGE_BONUS` | Percentage |
| `nature_dmg_up` | `NATURE_DAMAGE_BONUS` | Percentage |
| `cri_rate` | `CRITICAL_RATE` | Percentage |
| `heal_up` | `TREATMENT_BONUS` | Percentage |
| `hp` | `HP_BONUS` | Percentage |
| `usp_up` | `ULTIMATE_ENERGY_GAIN` | Percentage |
| `normal_atk_up` | `BASIC_ATTACK_DAMAGE_BONUS` | Percentage |
| `duration` | *(effect duration)* | Seconds; not a stat |
| `max_stack` | *(max stacks)* | Count; not a stat |

### conditionalStats structure

Each entry in `conditionalStats[]`:

| Field | Type | Description |
|---|---|---|
| `triggerConditions` | string[] | Array of `TriggerConditionType` enum values (e.g., `["CAST_ULTIMATE"]`) |
| `triggerSources` | string[] | Array of `TargetType` enum values — who receives the buff (e.g., `["SELF"]`, `["SELF", "OTHER_OPERATORS"]`) |
| `duration` | object | `{ value: number, unit: "SECOND" }` — how long the buff lasts |
| `maxStacks` | number | Optional. Maximum stacks for the effect |
| `<stat_key>` | number | One or more stat key-value pairs (mapped `StatType` or raw API keys) |

### Existing weapon model fields → weapon JSON mapping

| Current model field | weapon JSON field | Notes |
|---|---|---|
| `weaponType` | `weaponType` | String enum value |
| `weaponRarity` | `weaponRarity` | Number 3-6 |
| `baseAttack` | `allLevels[level].baseAttack` | Full 90-level curve |
| `weaponSkillOne.getValue()` | `skills[0].allLevels[level]` | Direct stat lookup |
| `weaponSkillTwo.getValue()` | `skills[1].allLevels[level]` | Direct stat lookup |
| `weaponSkillThree.getValue()` | `skills[2].allLevels[level]` | Only for rarity 4+ |

## Parsing Workflow

1. Fetch weapon list from `https://api.warfarin.wiki/v1/en/weapons?version=1.1`
2. For each weapon slug, fetch detail from `https://api.warfarin.wiki/v1/en/weapons/<slug>`
3. Extract `weaponBasicTable` for identity (name, rarity, type)
4. Extract `weaponUpgradeTemplateTable.list` for all 90 base attack levels
5. Map `weaponType` number to `WeaponType` enum string using the mapping table
6. For each skill in `weaponSkillList`, extract from `skillPatchTable`:
   - Skill name and description (strip rich text tags, keep `{var:format}` placeholders for named skills)
   - Resolve `weaponSkillType` from `SKILL_ID_TO_WEAPON_SKILL_TYPE` (stat boosts) or `NAMED_SKILL_ID_TO_WEAPON_SKILL_TYPE` (named skills)
   - **Stat boosts**: Flatten blackboard values directly onto level entries, map keys to `StatType`
   - **Named skills**: Analyze description to split stats into permanent (before trigger phrase) and conditional (after trigger phrase). Detect `triggerCondition` from description text patterns. Extract `duration` and `maxStacks` from blackboard.
7. Write to `game-data/weapons/<slug>.json` with `dataSources: ["WARFARIN"]`
8. **Before writing**, preserve any entries with `dataSources` containing `"SELF"`

### Adding new weapons

When a new weapon is added, update `NAMED_SKILL_ID_TO_WEAPON_SKILL_TYPE` in `parseWarfarinWeapons.ts` with the Warfarin skill ID → weapon-prefixed `WeaponSkillType` mapping. Also add the corresponding enum value in `src/consts/enums.ts`, skill class in `namedWeaponSkills.ts`, `SKILL_CONSTRUCTORS` entry in `weaponData.ts`, and `skillKey` in `weaponSkillEffects.ts`.

---

# Part 1c: Manual Operator Skill & Status Review

After parsing operator data from external sources, manually review and refine the skill DSL and status configs using the wiki as the source of truth. Follow this sequence for each operator.

## Step 1: Fetch wiki data

Fetch the operator's wiki page (`https://endfield.wiki.gg/wiki/<Operator_Name>`) and extract:
- All skill names, descriptions, damage types, multipliers per rank (1-12)
- SP costs, cooldowns, gauge gains
- Status effects applied or consumed
- Talent descriptions with exact values per elite level
- Potential descriptions with exact values

## Step 2: Review skill DSL against wiki

For each skill in `operator-skills/<slug>-skills.json`, present the DSL in human-readable form and compare against wiki data. Check:

1. **Damage types** — wiki says Physical vs Heat/Cryo/Electric/Nature. Basic attacks are often Physical even for elemental operators.
2. **Multiplier values** — wiki multipliers are **display values** that sum all per-frame multipliers together (e.g. wiki 97% for a 4-tick pull = 4 frames of ~24.25% each). End-Axis has individual frame timing data. Warfarin has both per-frame `atk_scale` and the display total `display_atk_scale`. To derive frame count: `normal_frames ≈ (display_atk_scale - sum(atk_scale_variants)) / atk_scale`. When adding multipliers to empty frames, divide the wiki total by the number of End-Axis frames — don't use the wiki total as a per-frame value.
3. **Stagger values** — match wiki stagger numbers
4. **Status effects** — APPLY KNOCK_DOWN, inflictions, etc. must match wiki descriptions
5. **Cooldowns** — combo skill cooldowns should be VARY_BY SKILL_LEVEL arrays if they change at rank 12 (check wiki). Cooldowns live in a COOLDOWN segment with `timeDependency: "REAL_TIME"`, not as CONSUME COOLDOWN effects.
6. **SP costs** — CONSUME SKILL_POINT on battle skills
7. **Conditional effects** — e.g. "if hit during cast, deal extra stagger" → separate clause with predicate

## Step 3: Clean up skill DSL

Apply these conventions across all skill entries:

| Pattern | Convention |
|---|---|
| Damage multiplier arrays | Key is `DAMAGE_MULTIPLIER` inside `with` block of DEAL DAMAGE effects |
| HP multiplier arrays | Key is `HP_MULTIPLIER` (e.g. shield based on Max HP) |
| Multiplier modifiers | Key is `DAMAGE_MULTIPLIER_MODIFIER` or `HP_MULTIPLIER_MODIFIER` (e.g. P5 ×1.2) |
| DEAL DAMAGE target | `"to": "ENEMY"` (never `"to": "TARGET"`) |
| SP recovery/consumption | Use `"value"` not `"cardinality"` in `with` block for SKILL_POINT effects |
| Empty segments | Remove segments with `duration: 0` and empty `frames[]` |
| Combo cooldowns | Separate COOLDOWN segment (not CONSUME COOLDOWN in clause), with `timeDependency: "REAL_TIME"` |
| Battle skill gauge | Do NOT include RECOVER ULTIMATE_ENERGY 6.5 effects — these are universal and handled by the engine |
| Stagger/knockdown | Separate DEAL STAGGER and APPLY KNOCK_DOWN effects (not properties inside DEAL DAMAGE `with`) |
| Heal/shield | Separate APPLY effects (not properties inside DEAL DAMAGE `with`) |
| Mutually exclusive damage paths | When wiki lists different multipliers for different conditions (e.g. 160% vs 280%), use `IF X → effects` / `IF NOT_X → effects` clauses. Do NOT use unconditional + conditional additive — the higher multiplier REPLACES the base, not adds to it. Each path is a single hit instance for crit calculation; never split one path into multiple DEAL DAMAGE effects. Add `_note` field explaining the mutual exclusivity. |
| Verb: HAVE/NOT_HAVE | Use `HAVE` (not `HAS`) for condition verbs. `NOT_HAVE` for negation. |
| APPLY LIFT/KNOCK_DOWN duration | Only supply `duration` in `with` if the wiki or data source specifies a non-default value (e.g. battle skill with level-scaling lift duration). If no duration is specified, omit it — LIFT and KNOCK_DOWN have default durations in the engine. |
| Counter-attack/retaliation frames | Frames triggered by being hit (e.g. Snowshine shield retaliation) can have arbitrary offsets from End-Axis. Users edit these after default placement. Don't add conditional predicates — the offset is the user-adjustable part. |
| Cast-time effects vs hit-time effects | When a skill has instant effects on cast (e.g. APPLY PROTECTION, RECOVER SP) plus delayed effects on hit/retaliation, split into separate frames: frame 0 at offset 0 for cast-time effects, later frame for hit effects. |
| Healing DSL | Write full heal DSL (APPLY TREATMENT with healBase + willAdditive, APPLY CONTINUOUS_TREATMENT with duration + interval + healBase + willAdditive). These are no-op in the engine currently but should be complete in configs for future implementation. |
| Potential modifying a number | When a potential just changes a numeric value on an existing effect (e.g. "retaliation returns 10 SP"), bake it into the skill frame as a conditional clause with `THIS OPERATOR HAVE POTENTIAL AT_LEAST X`. Don't create separate statuses. |

## Step 4: Create operator statuses

Create `operator-statuses/<slug>-statuses.json` for talents and potential-triggered statuses.

### Talent implementation strategy

Compare the wiki talent description against these categories to decide how to implement:

| Wiki description pattern | Implementation | Talent field | Example |
|---|---|---|---|
| "When X happens, gain Y buff for Zs" | TALENT trigger + TALENT_STATUS pair in statuses file | `id` → trigger ID | Ember "Pay the Ferric Price": on hit → ATK +6% 7s |
| "Applying X also does Y" | TALENT trigger with inline effects (no separate status needed) | `id` → trigger ID | Lifeng "Subduer of Evil": knock down → deal Physical DMG |
| Passive stat scaling (no trigger) | TALENT_STATUS only (no trigger entry) | `id` → status ID | Lifeng "Illumination": ATK +0.1% per INT+WILL |
| Modifies another talent/status's parameters | No own status — baked into the modified status via VARY_BY POTENTIAL arrays | `name` (no `id`) | Da Pan "Salty or Mild": modifies Prep Ingredients stack limits |
| Passive attribute increase | `attributeIncrease` with `attribute` field | `name` | All operators' "Forged"/"Skirmisher" |

### Potential implementation strategy

| Wiki description pattern | Implementation | Operator JSON | Example |
|---|---|---|---|
| Flat stat bonus | `STAT_MODIFIER` in potentials array | Stays as-is | Da Pan P3: STR +15, Phys DMG +8% |
| Skill multiplier modifier (×1.2, ×1.3) | `SKILL_PARAMETER` with `parameterKey: "DAMAGE_MULTIPLIER_MODIFIER"` | Stays as-is | Endmin P3: combo ×1.3 |
| Skill cost reduction (-15%) | `SKILL_COST` in potentials array | Stays as-is | Ember P4: ult energy ×0.85 |
| Skill parameter tweak (interval, extra stacks) | `SKILL_PARAMETER` with relevant key | Stays as-is | Da Pan P5: 45s interval for extra Vulnerability |
| Adds new conditional effect to a skill | Bake into skill DSL as conditional clause with `THIS OPERATOR HAVE POTENTIAL` predicate | Mark effect as `IMPLEMENTED_IN_DSL` | Ember P5: ult applies empowered shield |
| Adds new conditional effect to a talent | Bake into talent's onTriggerClause with potential-level predicates | Mark effect as `IMPLEMENTED_IN_DSL` | Endmin P2: P2+ shares ATK buff to allies |
| Modifies a skill's base behavior (consume → return SP) | Bake into skill DSL as conditional clause | Mark effect as `IMPLEMENTED_IN_DSL` | Endmin P1: crystal consume → return 50 SP |
| Creates entirely new triggered effect (periodic, on-condition) | New TALENT trigger + POTENTIAL_STATUS in statuses file | Mark effect as `IMPLEMENTED_IN_DSL` | Lifeng P5: every 15s empower next Subduer of Evil |

### Potential-branched talent triggers

When a potential modifies a talent's behavior, use multiple onTriggerClause entries with potential-level predicates instead of creating separate statuses:

```json
"onTriggerClause": [
  {
    "conditions": [
      { "subject": "...", "verb": "...", "object": "..." },
      { "subjectDeterminer": "THIS", "subject": "OPERATOR", "verb": "HAVE", "object": "POTENTIAL", "with": { "value": { "verb": "IS", "value": 1 } } }
    ],
    "effects": [{ "verb": "APPLY", "object": "STATUS", "objectId": "BUFF_SELF", ... }]
  },
  {
    "conditions": [
      { "subject": "...", "verb": "...", "object": "..." },
      { "subjectDeterminer": "THIS", "subject": "OPERATOR", "verb": "HAVE", "object": "POTENTIAL", "with": { "value": { "verb": "AT_LEAST", "value": 2 } } }
    ],
    "effects": [
      { "verb": "APPLY", "object": "STATUS", "objectId": "BUFF_SELF", ... },
      { "verb": "APPLY", "object": "STATUS", "objectId": "BUFF_SHARED", "toDeterminer": "ALL_OTHER", ... }
    ]
  }
]
```

Example: Endministrator "Essence Disintegration" — P1 applies self ATK buff, P2+ also shares half to allies.

### Team-shared buffs with weaker effects

When a potential adds a team-wide version of a self buff at reduced power, create two separate statuses — the full-power self version and a weaker shared version — and branch the trigger/skill frame based on potential level:

- `BUFF_NAME` — full-power status applied to self (e.g. ATK +15%/+30%)
- `BUFF_NAME_SHARED` — weaker status applied to ALL_OTHER operators (e.g. ATK +7.5%/+15%)

The trigger or skill frame uses potential predicates to decide which statuses to apply. At the base potential level, only the self buff is applied. At the potential that unlocks sharing, both are applied. This avoids runtime division logic — the half-power values are pre-computed in the shared status definition.

Example: Endministrator P2 "Reflection of Authority" — `ESSENCE_DISINTEGRATION` (self, full power) + `ESSENCE_DISINTEGRATION_SHARED` (ALL_OTHER, half power). The talent trigger has two clauses: P1 applies self only, P2+ applies both.

### Resolved potential/talent interaction examples

**Potential adds resource return on conditional skill path (Endministrator P1):**
Wiki: "Constructive Sequence consuming Originium Crystals returns 50 SP." The battle skill already has a crystal-consume mechanic. Solution: restructure the frame into two mutually exclusive predicates — `ENEMY HAVE ORIGINIUM_CRYSTAL` path gets CONSUME + RECOVER SKILL_POINT 50 + deal damage + crush, `ENEMY NOT_HAVE ORIGINIUM_CRYSTAL` path gets just deal damage + crush. The P1 SP return is inherent to the crystal path — no separate potential check needed since crystals only exist if Sealing Sequence was used, which is the operator's core loop.

**Potential shares self-buff to team at reduced power (Endministrator P2):**
Wiki: "When Endministrator gains ATK buff, allied operators gain half." Solution: create two statuses — `ESSENCE_DISINTEGRATION` (full power, self) and `ESSENCE_DISINTEGRATION_SHARED` (half power, ALL_OTHER). The talent trigger uses potential-branched predicates: P1 condition applies self only, P2+ condition applies both. The shared status has pre-computed half values (0.075/0.15 vs 0.15/0.30) to avoid runtime math.

**Potential adds periodic empowered proc to existing talent (Lifeng P5):**
Wiki: "Every 15 seconds, next Subduer of Evil deals additional 250% ATK Physical DMG and 5 Stagger." Solution: create `SUBDUER_OF_EVIL_P5_TALENT` trigger (conditions: THIS OPERATOR APPLY KNOCK_DOWN + status is in COOLDOWN state) and `SUBDUER_OF_EVIL_P5` POTENTIAL_STATUS with two segments — 2s active segment (frame at offset 0: DEAL PHYSICAL DAMAGE 2.5 + DEAL STAGGER 5) and 13s COOLDOWN segment (timeDependency REAL_TIME). The 2s + 13s = 15s total cycle matches wiki.

### Status types reference

| Type | When to use | Trigger needed? | Example |
|---|---|---|---|
| `TALENT` | Entry point — triggers on game event, applies a TALENT_STATUS | N/A (is the trigger) | Ember INFLAMED_FOR_THE_ASSAULT_TALENT |
| `TALENT_STATUS` | Buff/debuff produced by a talent trigger | No (applied by trigger) | Ember INFLAMED_FOR_THE_ASSAULT |
| `SKILL_STATUS` | Applied directly by skill DSL (shields, Link, crystals) | No (applied by skill) | Ember THE_STEEL_OATH, Lifeng LINK |
| `POTENTIAL_STATUS` | Empowered version of a skill/talent effect, gated by potential | No (applied by skill/talent) | Ember THE_STEEL_OATH_EMPOWERED |

### POTENTIAL_STATUS with cooldown-gated procs

For potentials that create periodic effects (e.g. "every 15s, next X does extra damage" or "once per 1s"), use a status with a single COOLDOWN segment and a top-level `clause` for the instant effects:

```json
{
  "clause": [{ "conditions": [], "effects": [{ "verb": "DEAL", ... }, { "verb": "RECOVER", ... }] }],
  "segments": [
    { "metadata": { "eventComponentType": "SEGMENT" },
      "properties": { "duration": { "value": 15, "unit": "SECOND" }, "timeDependency": "REAL_TIME" }, "frames": [] }
  ],
  "properties": { "id": "...", "type": "POTENTIAL_STATUS", ... }
}
```

The trigger uses `OFF_COOLDOWN` to check readiness:
```json
{ "subject": "OPERATOR", "verb": "HAVE", "object": "STATUS_ID", "with": { "value": { "verb": "IS", "value": "OFF_COOLDOWN" } } }
```

**Key rules:**
- Use a single regular segment (NOT `segmentType: "COOLDOWN"` — that gets different visual styling) with the full cycle duration so users can see the event label on the timeline
- Set `timeDependency: "REAL_TIME"` on these segments so they aren't affected by TIME_STOP
- Effects fire instantly via top-level `clause`, the segment only tracks the cooldown timer visually
- `OFF_COOLDOWN` means the cooldown has completed and the talent is ready (not during active/cooldown)

Examples:
- Lifeng SUBDUER_OF_EVIL_P5 — 15s cooldown, fires 250% ATK Physical DMG + 5 stagger on knock down
- Estella SURVIVAL_IS_A_WIN_P5 — 1s cooldown, recovers 5 ultimate energy on Solidification

## Step 5: Link operator JSON

In `operators/<slug>-operator.json`:

### Talent linking

| Talent has... | Use | Example |
|---|---|---|
| Own trigger + status in statuses file | `"id": "<TRIGGER_ID>"` | Ember talent one: `"id": "INFLAMED_FOR_THE_ASSAULT_TALENT"` |
| Passive status only (no trigger) in statuses file | `"id": "<STATUS_ID>"` | Lifeng talent one: `"id": "ILLUMINATION"` |
| No own status (modifies other systems) | `"name": "<Talent Name>"` | Da Pan talent two: `"name": "Salty or Mild"` |

### Potential cleanup

1. Remove stale `BUFF_ATTACHMENT` entries (old Warfarin `OPERATOR_POTENTIALX_XYZ` refs)
2. If the potential's effect is now baked into skill DSL or talent triggers, replace effects with `[{ "potentialEffectType": "IMPLEMENTED_IN_DSL" }]`
3. Rename `parameterKey: "DAMAGE_MULTIPLIER"` → `"DAMAGE_MULTIPLIER_MODIFIER"` for multiplier-modifying potentials
4. Keep `STAT_MODIFIER`, `SKILL_PARAMETER`, `SKILL_COST` entries as-is — these are consumed directly by the engine

Statuses and skills are auto-loaded by `require.context` from filename patterns (`*-statuses.json`, `*-skills.json`) — no explicit registration needed.

## Step 6: Validate

1. Verify all JSON files parse: `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"`
2. Run `npx tsc --noEmit` to check for type errors
3. Run `npx eslint src/` to check for linter warnings

---

# Part 2: Gear Data Parsing

Parse gear data from the Warfarin API into per-set files under `game-data/gears/`.

## Data Source

| Source | URL | Provides |
|---|---|---|
| **Warfarin API (list)** | `https://api.warfarin.wiki/v1/en/gear?version=1.1` | All gear pieces: stats, ranks, set membership |
| **Warfarin API (detail)** | `https://api.warfarin.wiki/v1/en/gear/<slug>` | Set effect descriptions, skill data |

> **Note:** The `version` query parameter should be updated when new game versions release (currently `1.1`).

## Output

- `src/model/game-data/gears/<set-slug>.json` — Per-set data files (see `src/model/game-data/gearDataSpec.md` for schema)

## Parser

| Parser | Location | What it produces |
|---|---|---|
| `parseWarfarinGear.ts` | `src/model/utils/parsers/` | Per-set JSON with all pieces, stats at 4 ranks, set effects |

### Usage

```bash
# Parse all gear sets
npx tsx src/model/utils/parsers/parseWarfarinGear.ts --all

# Parse a single gear set by suitID
npx tsx src/model/utils/parsers/parseWarfarinGear.ts suit_fire_natr01
```

## Pipeline

```
Warfarin API (list) ──→ group by suitID ──→ parse pieces (attrType → StatType)
                                                    ↓
Warfarin API (detail) ──→ set effect description ──→ gears/<set-slug>.json
```

## Adding New Gear Sets

When a new suitID appears in the API:

1. Add the `suitID → GearEffectType` mapping in `parseWarfarinGear.ts` (`SUIT_ID_TO_GEAR_EFFECT_TYPE`)
2. Add the `GearEffectType → slug` mapping in `parseWarfarinGear.ts` (`GEAR_EFFECT_TO_SLUG`)
3. Re-run `npx tsx src/model/utils/parsers/parseWarfarinGear.ts --all`

### Implementing parsed data into codebase

For each new gear set, follow this checklist:

| Step | File | Action |
|------|------|--------|
| 1 | `src/consts/enums.ts` | Add `GearEffectType` enum value |
| 2 | `src/model/gears/gearEffects.ts` | Add concrete GearEffect class |
| 3 | `src/model/gears/<setName>.ts` | Create concrete gear piece classes (use parsed JSON data) |
| 4 | `src/utils/loadoutRegistry.ts` | Register pieces in ARMORS, GLOVES, KITS |
| 5 | `src/controller/calculation/loadoutAggregator.ts` | Add to `GEAR_EFFECT_FACTORIES` |
| 6 | `src/consts/gearSetEffects.ts` | Add set effect entry (if triggered/timed) |

### Filling in stub gear pieces

For existing sets where pieces use `createGenericGear()`, use the parsed JSON data to replace stubs with concrete classes.

## Verify

Run `npx tsc --noEmit` to verify no type errors were introduced.

## Notes
- Icons: download from wiki if available, save as `src/assets/gears/Set_Name_Piece.webp` (snake_case)
- GenericGear stubs are acceptable as a first pass
- Full data specification: `src/model/game-data/gearDataSpec.md`

---

# Part 3: Gear Data Reference

Use this reference when working with gear data — adding new gear sets, creating gear models, updating the loadout registry, or implementing gear set effects.

## Gear System Architecture

### File Structure
```
src/model/gears/
  gear.ts              # Abstract base class
  gearEffects.ts       # Abstract GearEffect + 18 concrete effect classes
  hotWork.ts           # Example: Hot Work concrete gear pieces
  [setName].ts         # One file per gear set
src/consts/
  enums.ts             # GearType, GearEffectType enums
  gearSetEffects.ts    # Timed/triggered effects for timeline visualization
src/utils/
  loadoutRegistry.ts   # GEARS_RAW, ARMORS, GLOVES, KITS registries
src/controller/calculation/
  loadoutAggregator.ts # Gear stat aggregation + set bonus activation (3-piece)
src/controller/timeline/
  columnBuilder.ts     # Gear buff timeline columns
```

### Base Gear Class Pattern
```typescript
abstract class Gear {
  abstract readonly gearType: GearType;       // ARMOR | GLOVES | KIT
  abstract readonly gearEffectType: GearEffectType;
  rank: number = 4;                           // 1-4
  abstract readonly statsByRank: Record<number, Partial<Record<StatType, number>>>;
}
```

### Set Activation
- **3-piece threshold**: Count gear pieces with same `GearEffectType` across 4 slots (armor, gloves, kit1, kit2)
- If count >= 3, activate set bonus (passive stats + triggered effects)
- Handled in `loadoutAggregator.ts`

## Set Effects (from wiki)

| Set | 3-Piece Effect |
|-----|----------------|
| Hot Work | Arts Intensity +30. After Combustion: Heat DMG +50% 10s. After Corrosion: Nature DMG +50% 10s. Cannot stack |
| Bonekrusha | ATK +15%. Combo skill → 1 stack Bonekrushing Smash (next battle skill DMG +30%, max 2) |
| Pulser Labs | Arts Intensity +30. After Electrification: Electric DMG +50% 10s. After Solidification: Cryo DMG +50% 10s. Cannot stack |
| Eternal Xiranite | HP +1000. After applying Amp/Protected/Susceptibility/Weakened: teammates DMG +16% 15s. Cannot stack |
| Aethertech | ATK +8%. After Vulnerability: Physical DMG +8% 15s (max 4 stacks). At 4 stacks: +16% Physical DMG 10s. Cannot stack |
| MI Security | Critical Rate +5%. After crit: ATK +5% 5s (max 5 stacks). At max stacks: +5% Crit Rate. Cannot stack |
| Swordmancer | Stagger Efficiency +20%. After Physical Status: 250% ATK Physical DMG + 10 Stagger (15s CD) |
| Frontiers | Combo Skill CD -15%. After SP recovery: team DMG +16% 15s. Cannot stack |
| Type 50 Yinglung | ATK +15%. When team casts battle skill: +1 Yinglung's Edge (next combo DMG +20%, max 3 stacks) |
| Tide Surge | Skill DMG +20%. After 2+ Arts Infliction stacks: Arts DMG +35% 15s. Cannot stack |
| LYNX | HP Treatment Efficiency +20%. After treatment: target 15% DMG Reduction 10s (30% if overhealed). Cannot stack |

---

# Part 4: Operator Wiki Data Reference

Use this reference when adding new operators, building skill definitions, or verifying operator details.

## Operator Summary

| # | Operator | Rarity | Class | Weapon | Element |
|---|----------|--------|-------|--------|---------|
| 1 | Endministrator | 6-star | Guard | Sword | Physical |
| 2 | Lifeng | 6-star | Guard | Polearm | Physical |
| 3 | Chen Qianyu | 5-star | Guard | Sword | Physical |
| 4 | Estella | 4-star | Guard | Polearm | Cryo |
| 5 | Ember | 6-star | Defender | Great Sword | Heat |
| 6 | Snowshine | 5-star | Defender | Great Sword | Cryo |
| 7 | Catcher | 4-star | Defender | Great Sword | Physical |
| 8 | Gilberta | 6-star | Supporter | Arts Unit | Nature |
| 9 | Ardelia | 6-star | Supporter | Arts Unit | Nature |
| 10 | Xaihi | 5-star | Supporter | Arts Unit | Cryo |
| 11 | Perlica | 5-star | Caster | Arts Unit | Electric |
| 12 | Fluorite | 4-star | Caster | Handcannon | Nature |
| 13 | Last Rite | 6-star | Striker | Great Sword | Cryo |
| 14 | Yvonne | 6-star | Striker | Handcannon | Cryo |
| 15 | Avywenna | 5-star | Striker | Polearm | Electric |
| 16 | Da Pan | 5-star | Striker | Great Sword | Physical |
| 17 | Pogranichnik | 6-star | Vanguard | Sword | Physical |
| 18 | Alesh | 5-star | Vanguard | Sword | Cryo |
| 19 | Arclight | 5-star | Vanguard | Sword | Electric |
| 20 | Akekuri | 4-star | Vanguard | Sword | Heat |
| 21 | Tangtang | 6-star | Caster | Handcannon | Cryo |

> Full per-operator details (skills, talents, potentials, combo triggers) are in the operator-details.md file in this skill directory.
