# Operator Data Specification

This document defines the structure and semantics of per-operator JSON files in `game-data/operators/<slug>/`.

## Localization — strings live in locale bundles, NOT on game-data JSON

As of the locale migration, **no game-data JSON (operator base, skill, talent, status, potential) carries `name` or `description` fields**. The validator (`validationUtils.ts::checkIdAndName`) rejects them. User-facing strings live in per-operator bundles under `src/locales/game-data/<locale>/operators/<slug>.json` keyed by the dotted `LocaleKey` format:

```
op.<OPERATOR_ID>.event.name
op.<OPERATOR_ID>.skill.<SKILL_ID>.event.{name,description}
op.<OPERATOR_ID>.skill.<SKILL_ID>.segment.<i>.name
op.<OPERATOR_ID>.talent.<TALENT_ID>.event.{name,description}
op.<OPERATOR_ID>.status.<STATUS_ID>.event.{name,description}
op.<OPERATOR_ID>.potential.<level>.event.{name,description}
```

Each locale entry is `{ "text": "…", "dataStatus": "RECONCILED" | "VERIFIED" }`. The Warfarin reconciler preserves `VERIFIED` entries on re-ingest; new extractions default to `RECONCILED`.

**`descriptionParams`** is a numeric-keyed object on the potential / skill / talent's `properties` that feeds the `{param:format}` tokens in the locale template (one set of values serves every locale). See the Potentials / Skills / Talents sections below for details; schema and extraction rules in `CLAUDE.md` under "Localization (i18n)".

Historical examples in this document may still show `"name": "…"` / `"description": "…"` on JSON — those references are obsolete; the current shape has them stripped.

## File Structure

Each operator directory (e.g. `operators/laevatain/`) holds:
- `<slug>.json` — operator base (stats, potentials summary, talents, metadata)
- `potentials/potential-<N>-*.json` — per-level potential files
- `skills/*.json` — per-skill files (basic attacks, battle, combo, ultimate)
- `talents/talent-*.json`
- `statuses/*.json`

Operator base file:

```json
{
  "id": "LAEVATAIN",
  "operatorRarity": 6,
  "operatorClassType": "STRIKER",
  "elementType": "HEAT",
  "weaponTypes": ["SWORD"],
  "mainAttributeType": "INTELLECT",
  "secondaryAttributeType": "STRENGTH",
  "talents": {...},
  "statsByLevel": [...],
  "metadata": { "originId": "game", "dataSources": ["WARFARIN"] }
}
```

No `name`, no inline `potentials` (runtime hydrates from per-file), no parser-intermediate fields (`skillMultipliers`, `skillIds`, `allLevels`, `weaponType` singular, `dataSources`). All string keys and values use their corresponding enum type strings where applicable.

### Operator Information Keys

| Key                      | Type     | Description                                    |
|--------------------------|----------|------------------------------------------------|
| `id`                     | string   | Unique operator identifier (UPPER_CASE)        |
| `operatorRarity`         | number   | Star rating (4–6)                              |
| `operatorClassType`      | string   | GUARD, CASTER, STRIKER, SUPPORTER, VANGUARD    |
| `elementType`            | string   | HEAT, CRYO, NATURE, ELECTRIC, PHYSICAL         |
| `weaponTypes`            | string[] | Array of weapon types (e.g. ["SWORD"])         |
| `mainAttributeType`      | string   | Primary scaling stat (StatType)                |
| `secondaryAttributeType` | string   | Secondary scaling stat (StatType)              |
| `metadata`               | object   | `{ originId: "game", dataSources?: string[] }` |

**Display name** (`"Laevatain"`, `"Da Pan"`) lives in the locale bundle at `op.<id>.event.name` — never on this file.

---

## Potentials

One file per potential under `operators/<slug>/potentials/potential-<N>-<kebab-name>.json`:

```json
{
  "properties": {
    "id": "DA_PAN_POTENTIAL_3",
    "level": 3,
    "descriptionParams": { "Str": 15, "PhysicalDamageIncrease": 0.08 },
    "eventType": "POTENTIAL_EVENT",
    "eventCategoryType": "POTENTIAL"
  },
  "metadata": { "originId": "DA_PAN", "dataStatus": "RECONCILED" }
}
```

| Key                  | Description                                                                                  |
|----------------------|----------------------------------------------------------------------------------------------|
| `id`                 | Canonical potential ID (e.g. `DA_PAN_POTENTIAL_3`).                                          |
| `level`              | P-number (1–5). Must match the filename's `potential-<N>-*.json` — validated on every load.  |
| `descriptionParams`  | Numeric blackboard values referenced by `{param:format}` tokens in the locale template. Optional — only present when the locale description has tokens.   |

Name + description live in the locale bundle: `op.<OPERATOR_ID>.potential.<level>.event.{name,description}`.

### descriptionParams extraction

`descriptionParams` are harvested from the Warfarin API's `potentialTalentEffectTable[effectId].dataList[]` (via the parser's `buildPotentialDescriptionParams`):

| Source field in Warfarin         | Key written to `descriptionParams` |
|----------------------------------|-------------------------------------|
| `attrModifier.attrType` (int)    | `WarfarinAttributeType` enum name (e.g. `Str`, `PhysicalDamageIncrease`). |
| `attachBuff.blackboard[].key`    | Verbatim key.                       |
| `attachSkill.blackboard[].key`   | Verbatim key.                       |
| `skillBbModifier.bbKey`          | Both full key and `potential_N_` / `talent_N_`-stripped short form. |
| `skillParamModifier.paramType=1` | `costValue` (UE cost fraction).     |
| `skillParamModifier.paramType=2` | `coolDown` (seconds delta).         |

Each key also gets three pre-computed expression variants — `1-X`, `-X`, `X-1` — so Warfarin-style tokens like `{1-costValue:0%}`, `{-coolDown:0}`, `{duration-1:0%}` interpolate without `t()` needing an expression parser.

### Potential Effects

Each effect has a `potentialEffectType` (`PotentialEffectType` enum) that determines its shape:

#### SKILL_PARAMETER

Modifies a skill's tunable parameter.

```json
{
  "potentialEffectType": "SKILL_PARAMETER",
  "skillParameterModifier": {
    "skillType": "LAEVATAIN_SMOULDERING_FIRE",
    "parameterKey": "SKILL_POINT",
    "value": 20,
    "parameterModifyType": "ADDITIVE"
  }
}
```

- `skillType`: Prefixed with operator type (e.g., `LAEVATAIN_SMOULDERING_FIRE`)
- `parameterKey`: `SKILL_POINT`, `DAMAGE_MULTIPLIER`, `DURATION`, `EXTRA_SCALING`
- `parameterModifyType` (`ParameterModifyType`): `ADDITIVE`, `MULTIPLICATIVE`, `UNIQUE_MULTIPLIER`

#### SKILL_COST

Modifies a skill's cost parameter.

```json
{
  "potentialEffectType": "SKILL_COST",
  "skillParameterModifier": {
    "skillType": "LAEVATAIN_SMOULDERING_FIRE",
    "parameterKey": "SKILL_POINT",
    "value": -10,
    "parameterModifyType": "ADDITIVE"
  }
}
```

#### STAT_MODIFIER

Flat stat bonus applied to the operator.

```json
{
  "potentialEffectType": "STAT_MODIFIER",
  "statModifier": {
    "statType": "INTELLECT",
    "value": 20
  }
}
```

- `statType`: `StatType` enum value

#### BUFF_ATTACHMENT

Attaches or modifies a buff (status effect).

```json
{
  "potentialEffectType": "BUFF_ATTACHMENT",
  "buffAttachment": {
    "statusType": "LAEVATAIN_POTENTIAL5_PROOF_OF_EXISTENCE",
    "parameters": [
      {
        "parameterKey": "value",
        "value": 1.15,
        "parameterModifyType": "UNIQUE_MULTIPLIER"
      }
    ]
  }
}
```

- `statusType`: `StatusType` enum value (prefixed with `OPERATORTYPE_POTENTIALN_NAME`)

---

## Stats by Level

```json
"statsByLevel": [
  {
    "level": 1,
    "operatorPromotionStage": 0,
    "attributes": {
      "STRENGTH": 13.608,
      "AGILITY": 9.587,
      "INTELLECT": 22.268,
      "WILL": 9.072,
      "BASE_HP": 500,
      "BASE_ATTACK": 30,
      "BASE_DEFENSE": 0,
      "WEIGHT": 1,
      "CRITICAL_RATE": 0.05,
      "ATTACK_RANGE": 5
    }
  }
]
```

- 100 entries (levels 1–90 across promotion stages 0–4)
- `attributes` keyed by `StatType` enum values
- `operatorPromotionStage`: `OperatorPromotionStage` type (0–4)

---

## Skills

Skills live in a separate file (`operator-skills/<slug>-skills.json`), keyed by skill ID.

```json
{
  "FLAMING_CINDERS": {...},
  "FLAMING_CINDERS_FINISHER": {...},
  "FLAMING_CINDERS_DIVE": {...},
  "FLAMING_CINDERS_ENHANCED": {...},
  "SMOULDERING_FIRE": {...},
  "SEETHE": {...},
  "TWILIGHT": {...}
}
```

Skill categories are inferred from naming conventions:
- **BASIC_ATTACK**: The skill that has `_FINISHER` and `_DIVE` variants
- **COMBO_SKILL**: The skill with an `activationWindow` (or legacy top-level `onTriggerClause`)
- **ULTIMATE**: The skill with `ANIMATION` segment type
- **BATTLE_SKILL**: The remaining base skill

Variant suffixes: `_ENHANCED` (during ultimate), `_EMPOWERED` (from status stacks), `_ENHANCED_EMPOWERED` (both).

### Enhancement Types

Variant skills (enhanced, empowered, or both) carry an `enhancementTypes` array indicating which enhancement conditions apply:

```json
"enhancementTypes": ["EMPOWERED"]
```

| Value | Meaning |
|-------|---------|
| `NORMAL` | Base skill (no enhancement) |
| `EMPOWERED` | Requires operator-specific status at max stacks (e.g., Melting Flame, Crit Stacks) |
| `ENHANCED` | Available during ultimate active phase |

A skill can have multiple enhancement types (e.g., `["ENHANCED", "EMPOWERED"]` for skills that require both ultimate active and max status stacks). Base skills do not need this field — absence implies `NORMAL`.

### Activation Window (Combo Skills)

Combo skills define their activation window as an embedded Event structure:

```json
"activationWindow": {
  "properties": {
    "maxSkills": 2
  },
  "onTriggerClause": [
    {
      "conditions": [
        { "subject": "ENEMY", "verb": "HAVE", "object": "STATUS", "objectId": "VULNERABLE" },
        { "subject": "ENEMY", "verb": "HAVE", "object": "STATUS", "objectId": "INFLICTION", "objectQualifier": "ARTS" }
      ]
    }
  ],
  "segments": [
    {
      "properties": {
        "duration": { "value": 6, "unit": "SECOND" }
      }
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `properties.maxSkills` | number | Maximum combo skills allowed within one activation window (default 1) |
| `onTriggerClause` | array | Conditions that open the activation window (OR of ANDs) |
| `segments` | array | Window duration as a segment structure |

- `maxSkills > 1` enables combo chaining — multiple combo skills can overlap within the same window (cooldown overlap is bypassed for siblings in the same window).
- The `onTriggerClause` moved from the combo skill's top level into `activationWindow`.
- The window duration replaced the legacy `windowFrames` property.
- The activation window is not created while any combo skill variant for the operator is on cooldown.

### Event / Segment / Frame Hierarchy

A skill is abstracted as an **event**. Every event follows a three-level hierarchy:

```
Event (skill activation — e.g., one use of Battle Skill)
  └─ Segment (sequence/phase — e.g., one attack in a combo chain)
       └─ Frame (individual hit/tick — a single point in time where damage, resources, or statuses interact)
```

- **Event**: The top-level skill activation. Each skill category is one event type.
- **Segment**: A phase within an event. All skills use explicit `segments` arrays. Basic attacks have one segment per sequence in the attack chain. Ultimates and combo skills have segments for each phase (Animation, Stasis, Active window, Cooldown). Battle skills have a single segment wrapping their frames. Segments can have `clause` arrays with effects active for the segment's duration (e.g. `IGNORE ULTIMATE_ENERGY` during an ultimate's animation or active window — that clause is now the *only* way to author a no-UE-gain segment). The ANIMATION / STASIS / COOLDOWN / IMMEDIATE_COOLDOWN segment types are the only typed values; the post-animation active window is left untyped. (ACTIVE / NORMAL / INPUT_DELAY were retired.)
- **Frame**: A single hit or tick within a segment. Frames carry timing (`offset`), resource interactions (SP, stagger), status interactions (inflictions), and per-level multipliers.

Warfarin multiplier data is scoped to the **segment level** — each Warfarin skill ID (e.g., `attack1`, `attack2`, `normal_skill`) corresponds to one segment. Within a segment, `atk_scale` is the per-frame multiplier, and `display_atk_scale` is the approximate total across all frames in that segment.

### Skill Name, Description, and descriptionParams

**Skill strings are NOT on the JSON.** Each skill file's `properties` carries an `id` and optionally a `descriptionParams` object; the display name and description live in the operator's locale bundle at `op.<OPERATOR_ID>.skill.<SKILL_ID>.event.{name,description}`.

`descriptionParams` holds the Warfarin skill-patch blackboard at max level (the values displayed in tooltips), merged across the skill's Warfarin variants (`attack1..attackN` collapse into a single basic-attack file so `poise` from the final strike co-exists with `atk_scale` from earlier frames):

```json
{
  "properties": {
    "id": "SMOULDERING_FIRE",
    "descriptionParams": { "atk_scale": 0.42, "poise": 17, "duration": 15 },
    "eventType": "SKILL",
    "eventCategoryType": "BATTLE",
    "element": "HEAT"
  },
  "metadata": { "originId": "LAEVATAIN", "dataStatus": "RECONCILED" }
}
```

Tokens in the locale template (`{poise:0}`, `{atk_scale:0.0}`, `{duration:0s}`, …) interpolate against this map at load time via `operatorSkillsStore`'s constructor. Keys that the template doesn't reference are harmless; keys it references but that aren't in `descriptionParams` render as literal tokens.

Variant skill categories (ENHANCED_*, EMPOWERED_*) share the base skill's locale key; they do not carry their own name/description.

Segment names (e.g. "Animation", "Stasis", "Twilight", "Cooldown") and named frame labels live at `op.<OPERATOR_ID>.skill.<SKILL_ID>.segment.<i>.name` and `.segment.<i>.frame.<j>.name`. `operatorSkillsStore::injectSegmentNames` writes them back onto the raw segment objects at load time so downstream consumers (`allSegmentLabels`, `EventBlock`) read them via `segment.properties.name` unchanged.

### Skill Origin

Each skill includes a `metadata` object with an `originId` field pointing to the operator's camelCase ID:

```json
{
  "metadata": {
    "originId": "laevatain"
  }
}
```

### Duration

All durations use a structured format:

```json
{ "value": 2.2, "unit": "SECOND" }
```

- `unit`: `UnitType` enum — `SECOND`, `FRAME`, or `PERCENTAGE`

### Event Component Type

Segments and frames carry an `eventComponentType` field (`EventComponentType` enum):

| Value     | Description                                    |
|-----------|------------------------------------------------|
| `EVENT`   | Top-level event (a full skill activation)      |
| `SEGMENT` | A phase within an event (attack sequence, skill part) |
| `FRAME`   | A single damage/effect tick within a segment   |

### Frame Structure

A frame represents a single point in time where something happens — damage, resource recovery, status application, etc.

```json
{
  "eventComponentType": "FRAME",
  "offset": { "value": 0.73, "unit": "SECOND" },
  "resourceInteractions": [
    { "resourceType": "SKILL_POINT", "interactionType": "RECOVER", "value": 20 },
    { "resourceType": "STAGGER", "interactionType": "RECOVER", "value": 10 }
  ],
  "statusInteractions": [
    { "interactionType": "APPLY", "statusType": "HEAT", "stacks": 1, "target": "ENEMY" }
  ],
  "multipliers": [
    { "level": 1, "blackboard": { "atk_scale": 0.62, "poise": 10 } },
    { "level": 12, "blackboard": { "atk_scale": 1.4, "poise": 10 } }
  ],
  "dataSources": ["END_AXIS"]
}
```

| Field                 | Type     | Description                                      |
|-----------------------|----------|--------------------------------------------------|
| `eventComponentType`  | string   | Always `"FRAME"`                                 |
| `offset`              | Duration | When this frame occurs relative to segment start |
| `resourceInteractions`| array    | Resource gains/costs triggered by this frame     |
| `statusInteractions`  | array    | Optional. Status effects applied/absorbed/consumed |
| `multipliers`         | array    | Optional. Per-level damage multiplier data from Warfarin (see below) |
| `dataSources`         | string[] | Where this data was sourced from                 |

### Frame Multipliers

Each frame can carry per-level multiplier data sourced from the Warfarin API `skillPatchTable`. This is an array of 12 entries (skill levels 1–12), each containing a `blackboard` with the damage-relevant parameters for that frame at that level.

```json
"multipliers": [
  { "level": 1, "blackboard": { "atk_scale": 0.18, "poise": 10, "airborne_duration": 1.8 } },
  { "level": 2, "blackboard": { "atk_scale": 0.2, "poise": 10, "airborne_duration": 1.8 } },
  ...
  { "level": 12, "blackboard": { "atk_scale": 0.41, "poise": 10, "airborne_duration": 1.8 } }
]
```

#### Multiplier assignment

Multipliers are merged from Warfarin into End-Axis frames during parsing:

1. **Positional assignment** (exact match only): When the number of orderable atk_scale keys exactly matches the number of End-Axis frames, keys are sorted by hit order and assigned 1:1. On each frame, the original key is normalized to `atk_scale` so consumers always read `blackboard.atk_scale` for the per-hit multiplier.

2. **Non-positional assignment** (mismatch): When the key count does not match the frame count, the keys represent different skill phases rather than sequential hits (e.g., Laevatain's Smouldering Fire has 3 keys for 10 frames). All atk_scale keys are stored as-is on every frame, and the consumer interprets which applies based on the key name and skill mechanics.

3. **Named atk_scale keys** (`atk_scale_loop`, `atk_scale_end`, `atk_scale_boom`, `atk_scale_lance`, etc.) are never positionally assigned. These are always stored as-is on every frame.

4. **Empowered variant keys** (e.g., `atk_scale2` for an "additional attack"): When a skill description mentions a conditional additional attack, these keys belong to the `EMPOWERED_BATTLE_SKILL` variant, not the base skill. Do not positionally assign them to base skill frames. See the update-game-data skill spec for detection and handling guidance.

5. **Non-scale keys** (`poise`, `duration`, `airborne_duration`, `count`, `extra_usp`, etc.) are skill-level parameters stored on the first frame's multipliers.

#### Positional key sort order

| Priority | Pattern | Example |
|----------|---------|---------|
| 0 | `atk_scale_pre` | Pre-hit (charge-up) |
| 1 | `atk_scale` or `atk_scale1` | Main hit / first hit |
| 2+ | `atk_scale_2`, `atk_scale2`, `atk_scale_1` | Subsequent numbered hits |
| 2.5+ | `atk_scale_1ex`, `atk_scale_2ex` | Extended variants (after their base) |

#### atk_scale vs display_atk_scale

The Warfarin API provides two types of scale values:

- **`atk_scale`** (and variants): The **per-hit multiplier** — the actual value used in damage calculation for each individual hit. This is the **source of truth**.
- **`display_atk_scale`**: The total shown in the in-game skill description. This is an **approximation** — it represents `sum(per_hit × hit_count)` but may have rounding discrepancies from the source data.

`display_atk_scale` is excluded from frame multipliers. Only `atk_scale` values are stored.

The true hit count can be derived from the multiplier data:

**Single multiplier** (only `atk_scale`):
```
hit_count = round(display_atk_scale / atk_scale)
```

**Multiple variant keys** (e.g., `atk_scale` + `atk_scale_pre`):
Subtract variant values from display total, divide remainder by the regular `atk_scale`:
```
regular_hits = round((display_atk_scale - sum(variant_values)) / atk_scale)
total_hits = regular_hits + number_of_variant_keys
```

When End-Axis has fewer frames than the derived hit count, missing frames can be interpolated using the segment timing data.

#### Warfarin skill ID → skill category mapping

| Skill ID suffix | Category | Index |
|-----------------|----------|-------|
| `attack1`..`attackN` | `BASIC_ATTACK` | segment 0..N-1 |
| `normal_skill` | `BATTLE_SKILL` | 0 |
| `normal_skill_during_ult` | `ENHANCED_BATTLE_SKILL` | 0 |
| `combo_skill` | `COMBO_SKILL` | 0 |
| `ultimate_skill` | `ULTIMATE` | 0 |
| `ult_attack1`..`ult_attackN` | `ENHANCED_BASIC_ATTACK` | segment 0..N-1 |
| `dash_attack` | `DASH_ATTACK` | 0 |
| `plunging_attack_end` | `DIVE_ATTACK` | 0 |
| `power_attack` | `FINISHER` | 0 |

### Resource Interactions

Resource interactions describe how a skill produces or consumes combat resources. They appear at both the skill level (costs/gains on activation) and the frame level (per-hit effects).

```json
{
  "resourceType": "SKILL_POINT",
  "interactionType": "RECOVER",
  "value": 20,
  "target": "SELF",
  "conditions": { "enemiesHitThreshold": 2 }
}
```

| Field             | Type   | Enum                      | Description                          |
|-------------------|--------|---------------------------|--------------------------------------|
| `resourceType`    | string | `CombatResourceType`      | The resource being interacted with   |
| `interactionType` | string | `ResourceInteractionType` | The verb describing the interaction  |
| `value`           | number | —                         | Amount                               |
| `target`          | object | `DslTarget`               | Optional. Who receives the resource (`{ determiner?, noun }`) |
| `conditions`      | object | —                         | Optional. Conditions for activation  |

#### CombatResourceType

| Value            | Description                              |
|------------------|------------------------------------------|
| `SKILL_POINT`    | SP — spent to cast battle skills, recovered on hit |
| `ULTIMATE_ENERGY`| Ultimate gauge energy — spent to cast ultimate, recovered from skills |
| `STAGGER`        | Stagger damage dealt to enemies          |
| `COOLDOWN`       | Cooldown time for combo skills           |

#### ResourceInteractionType

| Value    | Description                                             |
|----------|---------------------------------------------------------|
| `CONSUME` | Spend a resource to activate (SP cost, energy cost, cooldown) |
| `RECOVER`| Acquire a resource (SP on hit, gauge gain, stagger)     |
| `RETURN` | SP return mechanic (empowered skills returning SP)      |

#### DslTarget (for resources)

Uses `DeterminerType` + `NounType` from `src/dsl/semantics.ts`:

| Example                                    | Description                           |
|--------------------------------------------|---------------------------------------|
| `{ determiner: "THIS", noun: "OPERATOR" }` | The casting operator receives it      |
| `{ determiner: "ALL", noun: "OPERATOR" }`  | All team members receive it           |
| `{ noun: "ENEMY" }`                        | The enemy receives it                 |

#### Conditions

```json
{ "enemiesHitThreshold": 2 }
```

Used for conditional gauge gains where the value depends on how many enemies are hit.

### Status Interactions

Status interactions describe how a frame applies, absorbs, or consumes statuses. They appear in the `statusInteractions` array on frames.

```json
{
  "interactionType": "APPLY",
  "statusType": "MELTING_FLAME",
  "stacks": 1,
  "target": "ENEMY",
  "isForced": true,
  "durationSeconds": 7,
  "conversion": { "statusType": "MELTING_FLAME", "ratio": "1:1" }
}
```

| Field             | Type    | Enum                    | Description                         |
|-------------------|---------|-------------------------|-------------------------------------|
| `interactionType` | string  | `StatusInteractionType` | APPLY, ABSORB, or CONSUME           |
| `statusType`      | string  | `StatusType`            | The status being interacted with    |
| `stacks`          | number  | —                       | Optional. Number of stacks          |
| `target`          | object  | `DslTarget`             | Optional. Who the status is applied to (`{ determiner?, noun }`) |
| `isForced`        | ValueNode | —                     | Optional. `{"verb":"IS","value":1}` for forced reactions. Raw booleans are rejected by the store validator. |
| `durationSeconds` | number  | —                       | Optional. Override duration         |
| `conversion`      | object  | —                       | Optional. For ABSORB — what the absorbed stacks convert into |

#### StatusInteractionType

| Value     | Description                                              |
|-----------|----------------------------------------------------------|
| `APPLY`   | Apply a status to the target (infliction, buff, forced reaction) |
| `ABSORB`  | Absorb stacks from the target, optionally converting them |
| `CONSUME` | Consume an existing status from the target               |

All statuses — elements (HEAT, CRYO, NATURE, ELECTRIC), arts reactions (COMBUSTION, SOLIDIFICATION, CORROSION, ELECTRIFICATION), buffs (MELTING_FLAME, THUNDERLANCE), and debuffs — are referenced by their `StatusType` enum value.

### Damage

Damage multipliers are stored in the `multipliers` array on each frame (see [Frame Multipliers](#frame-multipliers) above). The `atk_scale` blackboard value is the per-hit ATK multiplier used in the damage formula.

The element type of the damage is determined by the operator's `elementType` (or overridden by specific skill mechanics). The damage type (Physical vs Arts) is determined by the operator's class and weapon type.

### Animation

Skills with time-manipulating animations (ultimate cinematics, combo time stops) use an ANIMATION segment:

```json
{
  "metadata": { "eventComponentType": "SEGMENT", "segmentType": "ANIMATION" },
  "properties": {
    "name": "Animation",
    "duration": { "value": 2.07, "unit": "SECOND" },
    "timeDependency": "REAL_TIME",
    "timeInteractionType": "TIME_STOP"
  },
  "frames": []
}
```

- `segmentType`: Must be `"ANIMATION"` — identifies this as the time-stop animation phase
- `timeDependency`: `"REAL_TIME"` — animation is not affected by other time-stops
- `timeInteractionType`: `TimeInteractionType` enum — `TIME_STOP`, `TIME_DELAY`, or `NONE`

> **`animation` as a skill-level property is not allowed.** All animation timing must be expressed as an ANIMATION segment within the skill's `segments[]` array.

### Skill Category Shapes

#### BASIC_ATTACK / ENHANCED_BASIC_ATTACK

Multi-segment event — one segment per sequence in the attack chain.

```json
{
  "segments": [
    {
      "eventComponentType": "SEGMENT",
      "duration": { "value": 0.367, "unit": "SECOND" },
      "frames": [
        {
          "eventComponentType": "FRAME",
          "offset": { "value": 0.2, "unit": "SECOND" },
          "resourceInteractions": [
            { "resourceType": "SKILL_POINT", "interactionType": "RECOVER", "value": 0 },
            { "resourceType": "STAGGER", "interactionType": "RECOVER", "value": 0 }
          ]
        }
      ]
    }
  ]
}
```

#### BATTLE_SKILL / ENHANCED_BATTLE_SKILL / ENHANCED_EMPOWERED_BATTLE_SKILL (single segment)

Single-segment event — `duration` and `frames[]` at the top level represent one implicit segment.

```json
{
  "duration": { "value": 2.2, "unit": "SECOND" },
  "resourceInteractions": [
    { "resourceType": "SKILL_POINT", "interactionType": "CONSUME", "value": 100 },
    { "resourceType": "ULTIMATE_ENERGY", "interactionType": "RECOVER", "value": 6.5, "target": "SELF" },
    { "resourceType": "ULTIMATE_ENERGY", "interactionType": "RECOVER", "value": 6.5, "target": "TEAM" }
  ],
  "frames": [
    {
      "eventComponentType": "FRAME",
      "offset": { "value": 0.73, "unit": "SECOND" },
      "resourceInteractions": [...],
      "statusInteractions": [
        { "interactionType": "APPLY", "statusType": "MELTING_FLAME", "stacks": 1 }
      ]
    }
  ]
}
```

#### EMPOWERED_BATTLE_SKILL (multi-segment)

Multi-segment event — uses explicit `segments` array when a skill has multiple phases (e.g., explosion + additional attack). Resource interactions that apply to the whole event are at the top level.

```json
{
  "resourceInteractions": [
    { "resourceType": "SKILL_POINT", "interactionType": "CONSUME", "value": 100 },
    { "resourceType": "ULTIMATE_ENERGY", "interactionType": "RECOVER", "value": 6.5, "target": "SELF" },
    { "resourceType": "ULTIMATE_ENERGY", "interactionType": "RECOVER", "value": 6.5, "target": "TEAM" }
  ],
  "segments": [
    {
      "eventComponentType": "SEGMENT",
      "name": "EXPLOSION",
      "duration": { "value": 2.2, "unit": "SECOND" },
      "frames": [...]
    },
    {
      "eventComponentType": "SEGMENT",
      "name": "ADDITIONAL_ATTACK",
      "duration": { "value": 1.7, "unit": "SECOND" },
      "frames": [...]
    }
  ]
}
```

#### COMBO_SKILL

Combo skills use `segments[]` with an ANIMATION segment followed by a main segment containing the hit frames.

```json
{
  "resourceInteractions": [
    { "resourceType": "COOLDOWN", "interactionType": "CONSUME", "value": 10 },
    { "resourceType": "ULTIMATE_ENERGY", "interactionType": "RECOVER", "value": 25, "target": "SELF",
      "conditions": { "enemiesHitThreshold": 1 } },
    { "resourceType": "ULTIMATE_ENERGY", "interactionType": "RECOVER", "value": 30, "target": "SELF",
      "conditions": { "enemiesHitThreshold": 2 } }
  ],
  "segments": [
    {
      "metadata": { "eventComponentType": "SEGMENT", "segmentType": "ANIMATION" },
      "properties": {
        "name": "Animation",
        "duration": { "value": 0.566, "unit": "SECOND" },
        "timeDependency": "REAL_TIME",
        "timeInteractionType": "TIME_STOP"
      },
      "frames": []
    },
    {
      "metadata": { "eventComponentType": "SEGMENT" },
      "properties": { "duration": { "value": 0.804, "unit": "SECOND" } },
      "frames": [...]
    }
  ]
}
```

#### ULTIMATE

Ultimates use typed `segments[]` with ANIMATION / STASIS / COOLDOWN phases. The
post-animation **active window** is left *untyped*: its duration comes from the
segment's `properties.duration`, and its no-UE-gain behavior is authored via an
explicit `IGNORE ULTIMATE_ENERGY` clause effect (there is no `ACTIVE` segment
type — it was retired in favor of the DSL effect).

```json
{
  "resourceInteractions": [
    { "resourceType": "ULTIMATE_ENERGY", "interactionType": "CONSUME", "value": 300 }
  ],
  "segments": [
    {
      "metadata": { "eventComponentType": "SEGMENT", "segmentType": "ANIMATION" },
      "properties": {
        "name": "Animation",
        "duration": { "value": 2.07, "unit": "SECOND" },
        "timeDependency": "REAL_TIME",
        "timeInteractionType": "TIME_STOP"
      },
      "clause": [{
        "conditions": [],
        "effects": [{ "verb": "IGNORE", "object": "ULTIMATE_ENERGY", "toDeterminer": "THIS", "to": "OPERATOR" }]
      }],
      "frames": []
    },
    {
      "metadata": { "eventComponentType": "SEGMENT", "segmentType": "STASIS" },
      "properties": { "name": "Stasis", "duration": { "value": 0.3, "unit": "SECOND" } },
      "frames": []
    },
    {
      "metadata": { "eventComponentType": "SEGMENT" },
      "properties": { "name": "Twilight", "duration": { "value": 15, "unit": "SECOND" } },
      "clause": [{
        "conditions": [],
        "effects": [{ "verb": "IGNORE", "object": "ULTIMATE_ENERGY", "toDeterminer": "THIS", "to": "OPERATOR" }]
      }],
      "frames": []
    },
    {
      "metadata": { "eventComponentType": "SEGMENT", "segmentType": "COOLDOWN" },
      "properties": { "name": "Cooldown", "duration": { "value": 10, "unit": "SECOND" }, "timeDependency": "REAL_TIME" },
      "frames": []
    }
  ]
}
```

---

## Operator Statuses

Status definitions live in `game-data/operator-statuses/<slug>-statuses.json`. Each file is a JSON array of status event definitions for one operator. Additional status events can also appear in `operator-skills/*-skills.json` (under `statusEvents`), `operator-talents/*-talents.json` (under `statusEvents`), `weapon-effects/*-effects.json`, and `gear-effects/*-effects.json`.

### Source Chain

Statuses resolve their source through `metadata.originId`:
- `status.metadata.originId` → skill ID (e.g. `SMOULDERING_FIRE`)
- `skill.metadata.originId` → operator ID (e.g. `laevatain`)
- Derived statuses chain through other statuses: `SCORCHING_HEART_EFFECT.metadata.originId` → `MELTING_FLAME` → `SMOULDERING_FIRE` → `laevatain`

At runtime, this chain allows a status to resolve skill-level-dependent values back to the operator's equipped skill level.

### Status Event Structure

A status event has three top-level sections: `properties` (fixed identity/config), `metadata` (source chain), and clause arrays (behavior). All clause types can appear at both the status level and the segment level.

```json
{
  "properties": {
    "id": "FOCUS",
    "name": "Focus",
    "element": "ELECTRIC",
    "stacks": {
      "limit": { "verb": "IS", "value": 1 },
      "interactionType": "RESET"
    },
    "duration": { "value": 60, "unit": "SECOND" }
  },
  "metadata": {
    "originId": "SPECIFIED_RESEARCH_SUBJECT"
  },
  "onTriggerClause": [...],
  "clause": [...]
}
```

#### Top-Level Keys

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `properties` | object | Yes | Fixed identity and configuration (see below) |
| `metadata` | object | Yes | Must contain `originId` — the skill or status this derives from |
| `onTriggerClause` | array | No | Conditions that trigger status creation; entries with effects fire reactively during the status lifetime |
| `onEntryClause` | array | No | Effects that fire once when the status first becomes active |
| `clause` | array | No | Static effects active for the duration of the status |
| `onExitClause` | array | No | Effects that fire when the status expires |
| `segments` | array | No | Multi-phase statuses with per-segment properties and clauses |

No other top-level keys are allowed. Legacy keys (`originId`, `stats`, `element`, `target`, `name`, `id`, `stack`, `triggerClause`, `onActivationClause`, `reactiveTriggerClause`, etc.) must not appear at the top level.

#### Status Properties

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | ALL_CAPS identifier (e.g. `FOCUS`, `MELTING_FLAME`) |
| `name` | string | No | Human-readable display name |
| `type` | string | No | `TALENT` for talent-derived statuses |
| `element` | string | No | `ElementType` associated with this status |
| `target` | string | No | Target of the status (`OPERATOR`, `ENEMY`). Defaults to `OPERATOR` |
| `targetDeterminer` | string | No | `THIS`, `OTHER`, `ALL`, `ANY`. Defaults to `THIS` |
| `isForced` | ValueNode | No | `{"verb":"IS","value":1}` to bypass normal rules. Raw booleans rejected by validator. |
| `enhancementTypes` | string[] | No | `EnhancementType` values (e.g. `["EMPOWERED"]`) |
| `stacks` | object | Yes | Stacking configuration (see below) |
| `duration` | object | No | Duration struct (`{ value, unit }`). Use `99999` (PERMANENT_DURATION) for permanent statuses |

#### Stacks

```json
{
  "limit": { "verb": "IS", "value": 4 },
  "interactionType": "NONE"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `limit` | object | Max stacks — `{ "verb": "IS", "value": N }` for fixed, `{ "verb": "VARY_BY", "value": [...] }` for level-dependent |
| `interactionType` | string | `NONE` (drop at limit), `RESET` (FIFO eviction), `MERGE` (arts reactions), `REFRESH` (extend all durations + FIFO eviction) |

### Clause Types

Clauses define effects that are active while the status is alive. Each clause has optional conditions (predicates) and a list of effects.

**Properties are fixed** — they describe the status structure (duration, stacking). Variable effects like susceptibility and damage bonuses go in clauses because they depend on runtime state (enemy condition, skill level).

```json
{
  "clause": [
    {
      "conditions": [],
      "effects": [
        {
          "verb": "APPLY",
          "object": "SUSCEPTIBILITY",
          "adjective": "ELECTRIC",
          "toObject": "TARGET",
          "with": {
            "value": { "verb": "VARY_BY", "object": "SKILL_LEVEL", "value": [0.05, 0.06, ...] }
          }
        }
      ]
    }
  ]
}
```

#### Clause Effect Types (damage calculation bucket)

| verb | object | adjective | Description | Example |
|----------|-----------|-----------|-------------|---------|
| `APPLY` | `SUSCEPTIBILITY` | element | Adds to susceptibility multiplier bucket | Focus: ELECTRIC susceptibility |
| `APPLY` | `DAMAGE_BONUS` | element | Adds to damage bonus multiplier bucket | Wildland Trekker: ELECTRIC damage bonus |
| `IGNORE` | `RESISTANCE` | element | Ignores target resistance | Scorching Heart: HEAT resistance ignore |
| `IGNORE` | `ULTIMATE_ENERGY` | — | Blocks ultimate energy gain for target | Laevatain ult Animation segment |
| `APPLY` | `STATUS` | — | Applies a derived status | Melting Flame → Scorching Heart |
| `CONSUME` | `ALL_STACKS` | — | Consumes all active stacks | Melting Flame consumed on battle skill |
| `DEAL` | `DAMAGE` | element | Deals elemental damage with skill-level scaling | Frame: DEAL HEAT DAMAGE to TARGET |
| `DEAL` | `STAGGER` | — | Deals stagger to enemy | Frame: DEAL STAGGER to ENEMY |
| `RECOVER` | `SKILL_POINT` | — | Recovers SP | Frame: RECOVER SKILL_POINT |
| `ENABLE` | skill type | objectId (variant ID) | Enables a specific skill variant by ID | Ult: ENABLE objectId:FLAMING_CINDERS_ENHANCED BATK to THIS OPERATOR |
| `DISABLE` | skill type | objectId (variant ID) | Disables a specific skill variant by ID | Ult: DISABLE objectId:FLAMING_CINDERS BATK to THIS OPERATOR |

#### Value Resolution

Effect values use `with.value` with a `verb` indicating how to resolve:

| verb | object | Description |
|------|--------|-------------|
| `IS` | — | Fixed scalar value |
| `VARY_BY` | `SKILL_LEVEL` | Array indexed by skill level (1–12), resolved via source chain |
| `VARY_BY` | `TALENT_LEVEL` | Array indexed by talent level |
| `VARY_BY` | `INTELLECT` | Array of per-intellect scaling values |

#### Enhancement Type Adjectives

The `DISABLE` verb uses enhancement type adjectives to target specific skill variant tiers:

| Adjective | Description |
|-----------|-------------|
| `NONE` | Base skill variant (no enhancement) |
| `ENHANCED` | Enhanced variant (active during ultimate) |
| `EMPOWERED` | Empowered variant (requires max status stacks) |

Skill variants declare their enhancement type via `properties.enhancementTypes` in the skill JSON. Base skills without this field are implicitly `NORMAL`.

#### Frame Effects

Frames no longer use a separate `multipliers` array. All frame data (damage, SP recovery, stagger) is expressed as clause effects with value resolution:

```json
{
  "metadata": { "eventComponentType": "FRAME" },
  "properties": { "offset": { "value": 0.2, "unit": "SECOND" } },
  "clause": [{
    "conditions": [],
    "effects": [
      { "verb": "RECOVER", "object": "SKILL_POINT", "with": { "cardinality": { "verb": "IS", "value": 0 } } },
      { "verb": "DEAL", "object": "STAGGER", "with": { "value": { "verb": "IS", "value": 10 } }, "toObject": "ENEMY" },
      { "verb": "DEAL", "adjective": "HEAT", "object": "DAMAGE", "to": "TARGET",
        "with": { "value": { "verb": "VARY_BY", "object": "SKILL_LEVEL", "value": [0.16, 0.18, ...] } } }
    ]
  }]
}
```

### Multi-Segment Statuses

Statuses with phases use a `segments` array. Each segment has its own `properties` and `clause`:

```json
{
  "segments": [
    {
      "name": "Focus",
      "properties": { "duration": { "value": [20], "unit": "SECOND" } },
      "clause": [{ "conditions": [], "effects": [...] }]
    },
    {
      "name": "Empowered Focus",
      "properties": { "duration": { "value": [40], "unit": "SECOND" } },
      "clause": [{ "conditions": [], "effects": [...] }]
    }
  ]
}
```

---

## Skill Overrides

The `skillOverrides` field stores manually verified corrections that take precedence over parsed data. It mirrors the `skills` structure but is sparse — only overridden values are present.

```json
"skillOverrides": {
  "COMBO_SKILL": {
    "segments": [
      {
        "metadata": { "eventComponentType": "SEGMENT", "segmentType": "ANIMATION", "dataSources": ["ENDFIELD_SIMULATIONS"] },
        "properties": {
          "name": "Animation",
          "duration": { "value": 0.729, "unit": "SECOND" },
          "timeDependency": "REAL_TIME",
          "timeInteractionType": "TIME_STOP"
        },
        "frames": []
      }
    ]
  },
  "ULTIMATE": {
    "frames": [...],
    "dataSources": ["ENDFIELD_SIMULATIONS"]
  }
}
```

### Rules

- All override entries must include `dataSources: ["ENDFIELD_SIMULATIONS"]`
- Parsers always update `skills` (base data) but **never modify** `skillOverrides`
- At read time, `skillOverrides` values take precedence over `skills` via deep merge
- When new source data conflicts with an override, the parser logs a warning — the new source may be more accurate and the override should be re-verified
- Override granularity: category-level properties (`duration`), frame arrays, or segment arrays
- **`animation` is not a valid property key** — animation timing must be an ANIMATION segment

---

## Weapons

Weapon data is specified in a separate document: [Weapon Data Specification](./weaponDataSpec.md).

---

## Enum Reference

All enums used in this file are defined in the codebase:

| Enum                     | Location                      |
|--------------------------|-------------------------------|
| `OperatorType`           | `src/model/enums/operators.ts`|
| `OperatorInformationType`| `src/model/enums/operators.ts`|
| `OperatorClassType`      | `src/model/enums/operators.ts`|
| `PotentialEffectType`    | `src/model/enums/operators.ts`|
| `ParameterModifyType`    | `src/model/enums/operators.ts`|
| `ElementType`            | `src/consts/enums.ts`         |
| `WeaponType`             | `src/consts/enums.ts`         |
| `StatType`               | `src/model/enums/stats.ts`    |
| `StatusType`             | `src/consts/enums.ts`         |
| `CombatResourceType`     | `src/consts/enums.ts`         |
| `ResourceInteractionType`| `src/consts/enums.ts`         |
| `StatusInteractionType`  | `src/consts/enums.ts`         |
| `EventComponentType`     | `src/consts/enums.ts`         |
| `UnitType`               | `src/consts/enums.ts`         |
| `TimeInteractionType`    | `src/consts/enums.ts`         |
| `DslTarget`              | `src/dsl/semantics.ts`        |
| `CombatSkillType`        | `src/consts/enums.ts`         |
| `EnhancementType`        | `src/consts/enums.ts`         |
| `DataSourceType`         | `src/consts/enums.ts`         |

## DSL Grammar & Semantics

All grammar and semantic mappings live in `src/dsl/semantics.ts`. Authored JSON
conforms to three layered narrowing rules that the builder UI consumes in
order — each layer rules out combinations the prior layer permitted.

### Subject / Verb / Object layering (conditions)

Conditions have shape `{subject, verb, object[, objectId, objectQualifier]}`.
The valid slots narrow top-down:

1. **`SUBJECT_VERB_MAPPING`** (A-B) — which verbs each subject can take.
   - `OPERATOR` → `APPLY, BECOME, CONSUME, DEAL, DEFEAT, EXPERIENCE, HAVE, IS, PERFORM, RECEIVE, RECOVER`
   - `ENEMY` → `BECOME, DEAL, HAVE, HIT, IS, PERFORM, RECEIVE`
   - `EVENT` → `BECOME, HAVE, IS`
   - `STATUS` → `BECOME, HAVE, IS`
   - `TEAM` → `HAVE`
2. **`SUBJECT_VERB_OBJECT_MAPPING`** (A-B-C) — narrow the object per subject+verb.
   Examples:
   - `ENEMY IS` → state adjectives (STAGGERED, COMBUSTED, LIFTED, CRYO_INFLICTED, …)
   - `ENEMY HAVE` → resource nouns (HP, STATUS, CHARGE, STACKS)
   - `OPERATOR RECOVER` → `{HP, SKILL_POINT, ULTIMATE_ENERGY}`
   - `OPERATOR APPLY` → `{STATUS, STAT, EVENT, ARTS_BURST, PROTECTED}`
   Fallback: when a subject+verb pair isn't listed, use `VERB_OBJECTS[verb]`.
3. **`OBJECT_ID_QUALIFIERS`** — when `object` is a multi-kind container
   (currently `STATUS`), the `objectId` chooses the sub-family and narrows
   the qualifier:
   - `STATUS` + `objectId: INFLICTION` → `{HEAT, CRYO, NATURE, ELECTRIC, ARTS, VULNERABLE}`
   - `STATUS` + `objectId: REACTION` → `{COMBUSTION, SOLIDIFICATION, CORROSION, ELECTRIFICATION, SHATTER}`
   - `STATUS` + `objectId: PHYSICAL` → `{LIFT, KNOCK_DOWN, BREACH, CRUSH}`
   - `STATUS` + `objectId: SUSCEPTIBILITY` → `{HEAT, CRYO, NATURE, ELECTRIC, ARTS, PHYSICAL}`
   - `STATUS` + `objectId: <custom>` → no qualifier narrowing (free-form
     status id like `MELTING_FLAME`, `FORCE_OF_NATURE_TALENT`).

### Effect-side slots

- **`VERB_OBJECTS`** — verb-agnostic list of allowed objects per verb (fallback when no A-B-C narrowing applies).
- **`VERB_TARGET_MAPPING`** — which `to` nouns each effect verb can target. `APPLY` → `{ENEMY, OPERATOR, TEAM}`, `DEAL` → `{ENEMY, OPERATOR}`, `RECOVER/RETURN → {OPERATOR}`.
- **`VERB_PREPOSITION_MAPPING`** — which prepositions (`FROM`, `OF`, `BY`, …) each verb accepts.

### Canonical authoring shape for STATUS effects

```json
{ "verb": "APPLY",
  "object": "STATUS",
  "objectId": "INFLICTION",
  "objectQualifier": "VULNERABLE",
  "to": "ENEMY" }
```

Reads as "apply the VULNERABLE INFLICTION STATUS to the enemy". The three-part
shape (`STATUS` → `INFLICTION` → `VULNERABLE`) is mandatory for typed infliction /
reaction / susceptibility / physical-status effects. Free-form named statuses
only need `object: STATUS, objectId: <custom>` (no qualifier).

### Helpers in `semantics.ts`

- `verbsForSubject(subject)` — SUBJECT_VERB narrow
- `objectsForSubjectVerb(subject, verb)` — A-B-C narrow, falls back to `VERB_OBJECTS`
- `qualifiersForObjectId(object, objectId)` — three-level narrow
- `targetsForVerb(verb)` — allowed `to` targets

---

## Data Sources

The `dataSources` field is an array of `DataSourceType` enum values indicating where the data was sourced from. It appears at the operator level, on segments, and on frames.

```json
"dataSources": ["WARFARIN"]
"dataSources": ["END_AXIS"]
"dataSources": ["END_AXIS", "ENDFIELD_SIMULATIONS"]
```

| Value      | Description                                            |
|------------|--------------------------------------------------------|
| `END_AXIS` | Extracted from End-Axis community frame data (frame timing only) |
| `WARFARIN` | Parsed from the Warfarin API (operator info, potentials, stats, skill multipliers, skill descriptions — the primary source for most data) |
| `ENDFIELD_SIMULATIONS` | Manually measured or derived                           |

> **Note:** Most of the data in operator JSONs comes from the Warfarin API. End-Axis is used **only** for skill frame-timing data (segment durations, frame offsets, hit timing). Everything else — operator info, stats, potentials, levels, skill names/descriptions, and per-level multipliers — is sourced from Warfarin.

## Parsing

- **Operator info** (stats, potentials, levels, skill descriptions): Parsed from Warfarin API via `src/model/utils/parsers/parseWarfarinOperator.ts`
- **Skill multipliers** (per-level atk_scale, poise, duration, etc.): Parsed from Warfarin API `skillPatchTable` via `src/model/utils/parsers/parseWarfarinOperator.ts`
- **Skill frame data** (timing, resource/status interactions): Parsed from End-Axis gamedata.json via `src/model/utils/parsers/parseEndAxisGameData.ts`
- **Orchestrator**: `src/model/utils/parsers/parseGameData.ts` runs both parsers, merges frame timing (End-Axis) with multipliers (Warfarin) into per-operator files

---

## Generic Event System (Planned)

The data structure is designed to support a future generic event system where any event can be composed of arbitrary segments and frames, each interacting with other sub-timelines.

### Design Goals

- **Arbitrary composition**: An event contains N segments, each segment contains N frames
- **Frame as interaction point**: Each frame is a moment where the operator interacts with the world — dealing damage, recovering resources, applying statuses to enemies or teammates
- **Cross-timeline interaction**: A frame's status interactions can target different timelines (enemy, self, team members) via the `target` field
- **Data-driven skills**: All skill behavior defined in operator data files rather than hardcoded in combat skill classes — damage multipliers, element types, and interaction targets all live in the data

### Gaps to Fill

The following fields are specified above but not yet populated in the current data:

| Field                          | Location         | Status      | Notes |
|--------------------------------|------------------|-------------|-------|
| `target` on status interactions | StatusInteraction | Not yet populated | All current status interactions implicitly target ENEMY; needs explicit targeting for team buffs |
| `duration` on frames           | Frame            | Not yet populated | For lingering effects (DoT ticks, buff windows) that have their own duration |
| `target` on resource interactions (beyond ultimate energy) | ResourceInteraction | Partial | Currently only used for ULTIMATE_ENERGY self/team split; needed for recovering SP on teammates, etc. |
| Frame interpolation            | Frame            | Not yet implemented | When End-Axis has fewer frames than the true hit count (derived from `display_atk_scale / atk_scale`), missing frames should be interpolated using segment timing |

### Migration Path

1. Add `target` to all status interactions (defaulting to ENEMY for inflictions, OPERATOR for buffs)
2. Build generic event builder that constructs events from the data structure (abstract CombatSkill class)
3. Remove hardcoded combat skill classes in favor of data-driven construction
4. Implement frame interpolation for segments where End-Axis frame count < Warfarin-derived hit count
