# Operator Data Specification

This document defines the structure and semantics of per-operator JSON files in `game-data/operators/<slug>.json`.

## File Structure

Each operator file (e.g., `operators/laevatain.json`) contains a single operator object:

```json
{
  "operatorType": "LAEVATAIN",
  "name": "Laevatain",
  "operatorRarity": 6,
  "operatorClassType": "STRIKER",
  "elementType": "HEAT",
  "weaponType": "SWORD",
  "mainAttributeType": "INTELLECT",
  "secondaryAttributeType": "STRENGTH",
  "potentials": [...],
  "allLevels": [...],
  "skills": {...},
  "skillOverrides": {...}
}
```

The top-level key is the `OperatorType` enum value. All string keys and values use their corresponding enum type strings where applicable.

### Operator Information Keys

Keyed by `OperatorInformationType` enum values:

| Key                    | Type   | Enum                 | Description                        |
|------------------------|--------|----------------------|------------------------------------|
| `operatorType`         | string | `OperatorType`       | Unique operator identifier         |
| `name`                 | string | —                    | Display name                       |
| `operatorRarity`       | number | —                    | Star rating (1–6)                  |
| `operatorClassType`    | string | `OperatorClassType`  | GUARD, CASTER, STRIKER, etc.       |
| `elementType`          | string | `ElementType`        | HEAT, CRYO, NATURE, ELECTRIC, PHYSICAL |
| `weaponType`           | string | `WeaponType`         | SWORD, GREAT_SWORD, POLEARM, etc.  |
| `mainAttributeType`    | string | `StatType`           | Primary scaling stat               |
| `secondaryAttributeType` | string | `StatType`         | Secondary scaling stat             |

---

## Potentials

```json
"potentials": [
  {
    "level": 1,
    "name": "Potential Name",
    "effects": [...]
  }
]
```

Each potential has a level (1–5), a display name, and an array of effects.

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
        "parameterKey": "DAMAGE_MULTIPLIER",
        "value": 1.15,
        "parameterModifyType": "UNIQUE_MULTIPLIER"
      }
    ]
  }
}
```

- `statusType`: `StatusType` enum value (prefixed with `OPERATORTYPE_POTENTIALN_NAME`)

---

## All Levels

```json
"allLevels": [
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

Skills are organized by skill category under the `skills` key.

```json
"skills": {
  "BASIC_ATTACK": {...},
  "BATTLE_SKILL": {...},
  "COMBO_SKILL": {...},
  "ULTIMATE": {...},
  "ENHANCED_BASIC_ATTACK": {...},
  "ENHANCED_BATTLE_SKILL": {...},
  "EMPOWERED_BATTLE_SKILL": {...},
  "ENHANCED_EMPOWERED_BATTLE_SKILL": {...}
}
```

Skill category keys correspond to `CombatSkillType` enum values plus variant prefixes (`ENHANCED_`, `EMPOWERED_`). Not all operators have all categories — only `BASIC_ATTACK`, `BATTLE_SKILL`, `COMBO_SKILL`, and `ULTIMATE` are universal.

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

### Event / Segment / Frame Hierarchy

A skill is abstracted as an **event**. Every event follows a three-level hierarchy:

```
Event (skill activation — e.g., one use of Battle Skill)
  └─ Segment (sequence/phase — e.g., one attack in a combo chain)
       └─ Frame (individual hit/tick — a single point in time where damage, resources, or statuses interact)
```

- **Event**: The top-level skill activation. Each skill category is one event type.
- **Segment**: A phase within an event. Basic attacks have explicit segments (one per sequence in the attack chain). All other skills are **single-segment events by default** — their flat `duration` + `frames[]` structure is shorthand for one implicit segment containing all frames.
- **Frame**: A single hit or tick within a segment. Frames carry timing (`offset`), resource interactions (SP, stagger), status interactions (inflictions), and per-level multipliers.

Warfarin multiplier data is scoped to the **segment level** — each Warfarin skill ID (e.g., `attack1`, `attack2`, `normal_skill`) corresponds to one segment. Within a segment, `atk_scale` is the per-frame multiplier, and `display_atk_scale` is the approximate total across all frames in that segment.

### Skill Name and Description

The four main skill categories (BASIC_ATTACK, BATTLE_SKILL, COMBO_SKILL, ULTIMATE) include `name` and `description` fields sourced from the Warfarin API.

```json
{
  "name": "Smouldering Fire",
  "description": "Summons a Magma Fragment to continuously attack enemies and deal Heat DMG..."
}
```

- `name`: Display name of the skill
- `description`: Full skill description with rich text tags stripped

Variant skill categories (ENHANCED_*, EMPOWERED_*) share descriptions with their base skills and do not have separate name/description fields.

### Duration

All durations use a structured format:

```json
{ "value": 2.2, "unit": "SECOND" }
```

- `unit`: `DurationUnit` enum — `SECONDS` or `FRAMES`

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
| `target`          | string | `TargetType`              | Optional. Who receives the resource  |
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

#### TargetType (for resources)

| Value   | Description                           |
|---------|---------------------------------------|
| `SELF`  | The casting operator receives it      |
| `TEAM`  | All team members receive it           |

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
  "statusLevel": 1,
  "durationSeconds": 7,
  "conversion": { "statusType": "MELTING_FLAME", "ratio": "1:1" }
}
```

| Field             | Type    | Enum                    | Description                         |
|-------------------|---------|-------------------------|-------------------------------------|
| `interactionType` | string  | `StatusInteractionType` | APPLY, ABSORB, or CONSUME           |
| `statusType`      | string  | `StatusType`            | The status being interacted with    |
| `stacks`          | number  | —                       | Optional. Number of stacks          |
| `target`          | string  | `TargetType`            | Optional. Who the status is applied to (ENEMY, SELF, TEAM, TEAM_MEMBER) |
| `isForced`        | boolean | —                       | Optional. True for forced reactions |
| `statusLevel`     | number  | —                       | Optional. Level of the status       |
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

Skills with time-manipulating animations (ultimate cinematics, combo time stops) use:

```json
"animation": {
  "duration": { "value": 2.07, "unit": "SECOND" },
  "timeInteractionType": "TIME_STOP"
}
```

- `timeInteractionType`: `TimeInteractionType` enum — `TIME_STOP`, `TIME_DELAY`, or `NONE`

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

Single-segment combo skills use the flat format. Multi-segment (e.g., Ardelia's combo + explosion) use explicit `segments`.

```json
{
  "duration": { "value": 1.37, "unit": "SECOND" },
  "resourceInteractions": [
    { "resourceType": "COOLDOWN", "interactionType": "CONSUME", "value": 10 },
    { "resourceType": "ULTIMATE_ENERGY", "interactionType": "RECOVER", "value": 25, "target": "SELF",
      "conditions": { "enemiesHitThreshold": 1 } },
    { "resourceType": "ULTIMATE_ENERGY", "interactionType": "RECOVER", "value": 30, "target": "SELF",
      "conditions": { "enemiesHitThreshold": 2 } }
  ],
  "animation": {
    "duration": { "value": 0.566, "unit": "SECOND" },
    "timeInteractionType": "TIME_STOP"
  },
  "frames": [...]
}
```

#### ULTIMATE

```json
{
  "duration": { "value": 2.37, "unit": "SECOND" },
  "resourceInteractions": [
    { "resourceType": "ULTIMATE_ENERGY", "interactionType": "CONSUME", "value": 300 }
  ],
  "animation": {
    "duration": { "value": 2.07, "unit": "SECOND" },
    "timeInteractionType": "TIME_STOP"
  },
  "frames": []
}
```

---

## Operator Statuses

Status definitions live in `game-data/operator-statuses/<slug>-statuses.json`. Each file is a JSON array of status event definitions for one operator.

### Source Chain

Statuses resolve their source through `originId`:
- `status.originId` → skill ID (e.g. `SMOULDERING_FIRE`)
- `skill.originId` → operator ID (e.g. `laevatain`)
- Derived statuses chain through other statuses: `SCORCHING_HEART_EFFECT.originId` → `MELTING_FLAME` → `SMOULDERING_FIRE` → `laevatain`

At runtime, this chain allows a status to resolve skill-level-dependent values back to the operator's equipped skill level.

### Status Event Structure

```json
{
  "name": "FOCUS",
  "displayName": "Focus",
  "target": "ENEMY",
  "isNamedEvent": true,
  "isForceApplied": false,
  "stack": {
    "max": { "P0": 1, "P1": 1, "P2": 1, "P3": 1, "P4": 1, "P5": 1 },
    "instances": 1,
    "verbType": "RESET"
  },
  "triggerClause": [],
  "properties": {
    "duration": { "value": [60], "unit": "SECOND" }
  },
  "clause": [...],
  "originId": "SPECIFIED_RESEARCH_SUBJECT"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Status identifier (e.g. `FOCUS`, `MELTING_FLAME`) |
| `displayName` | string | Optional. Human-readable name |
| `enhancementTypes` | string[] | Optional. `EnhancementType` values (e.g. `["EMPOWERED"]`) |
| `target` | string | Who the status applies to: `ENEMY`, `THIS_OPERATOR`, `ALL_OPERATORS` |
| `element` | string | Optional. `ElementType` associated with this status |
| `isNamedEvent` | boolean | Whether this status creates named timeline events |
| `isForceApplied` | boolean | Whether application bypasses normal rules |
| `stack` | object | Stacking configuration (see below) |
| `triggerClause` | array | Conditions that trigger status application |
| `clause` | array | Effects active while the status is alive (see below) |
| `consumeClause` | array | Optional. Conditions and effects for stack consumption |
| `properties` | object | Fixed properties: `duration` (`Duration` struct) |
| `segments` | array | Optional. Multi-phase statuses with per-segment properties and clauses |
| `potentialMin` / `potentialMax` | number | Optional. Potential range this definition applies to |
| `minTalentLevel` | object | Optional. `{ talent: number, minLevel: number }` |
| `p3TeamShare` | object | Optional. Team sharing at P3+ with `{ durationMultiplier: number }` |
| `originId` | string | Source skill ID or parent status name |

### Stack Configuration

```json
{
  "max": { "P0": 4, "P1": 4, "P2": 4, "P3": 4, "P4": 4, "P5": 4 },
  "instances": 4,
  "verbType": "RESET"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `max` | Record<string, number> | Max stacks per potential level (`P0`–`P5`) |
| `instances` | number | Max concurrent status event instances |
| `verbType` | `StackInteraction` | `NONE` (independent stacks), `RESET` (refresh duration on reapply) |

### Status Clauses

Clauses define effects that are active while the status is alive. Each clause has optional conditions (predicates) and a list of effects.

**Properties are fixed** — they describe the status structure (duration, stacking). Variable effects like susceptibility and damage bonuses go in clauses because they depend on runtime state (enemy condition, skill level).

```json
{
  "clause": [
    {
      "conditions": [],
      "effects": [
        {
          "verbType": "APPLY",
          "objectType": "SUSCEPTIBILITY",
          "adjective": "ELECTRIC",
          "toObjectType": "TARGET",
          "withPreposition": {
            "value": { "verb": "BASED_ON", "object": "SKILL_LEVEL", "value": [0.05, 0.06, ...] }
          }
        }
      ]
    }
  ]
}
```

#### Clause Effect Types (damage calculation bucket)

| verbType | objectType | Description | Example |
|----------|-----------|-------------|---------|
| `APPLY` | `SUSCEPTIBILITY` | Adds to susceptibility multiplier bucket | Focus: ELECTRIC susceptibility |
| `APPLY` | `DAMAGE_BONUS` | Adds to damage bonus multiplier bucket | Wildland Trekker: ELECTRIC damage bonus |
| `IGNORE` | `RESISTANCE` | Ignores target resistance | Scorching Heart: HEAT resistance ignore |
| `APPLY` | `STATUS` | Applies a derived status | Melting Flame → Scorching Heart |
| `CONSUME` | `ALL_STACKS` | Consumes all active stacks | Melting Flame consumed on battle skill |

#### Value Resolution

Effect values use `withPreposition.value` with a `verb` indicating how to resolve:

| verb | object | Description |
|------|--------|-------------|
| `IS` | — | Fixed scalar value |
| `BASED_ON` | `SKILL_LEVEL` | Array indexed by skill level (1–12), resolved via source chain |
| `BASED_ON` | `TALENT_LEVEL` | Array indexed by talent level |
| `BASED_ON` | `INTELLECT` | Array of per-intellect scaling values |

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
```

### Rules

- All override entries must include `dataSources: ["SELF"]`
- Parsers always update `skills` (base data) but **never modify** `skillOverrides`
- At read time, `skillOverrides` values take precedence over `skills` via deep merge
- When new source data conflicts with an override, the parser logs a warning — the new source may be more accurate and the override should be re-verified
- Override granularity: category-level properties (`animation`, `duration`), frame arrays, or segment arrays

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
| `DurationUnit`           | `src/consts/enums.ts`         |
| `TimeInteractionType`    | `src/consts/enums.ts`         |
| `TargetType`             | `src/consts/enums.ts`         |
| `CombatSkillType`        | `src/consts/enums.ts`         |
| `EnhancementType`        | `src/consts/enums.ts`         |
| `DataSourceType`         | `src/consts/enums.ts`         |

## Data Sources

The `dataSources` field is an array of `DataSourceType` enum values indicating where the data was sourced from. It appears at the operator level, on segments, and on frames.

```json
"dataSources": ["WARFARIN"]
"dataSources": ["END_AXIS"]
"dataSources": ["END_AXIS", "SELF"]
```

| Value      | Description                                            |
|------------|--------------------------------------------------------|
| `END_AXIS` | Extracted from End-Axis community frame data (frame timing only) |
| `WARFARIN` | Parsed from the Warfarin API (operator info, potentials, stats, skill multipliers, skill descriptions — the primary source for most data) |
| `SELF`     | Manually measured or derived                           |

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

1. Add `target` to all status interactions (defaulting to ENEMY for inflictions, SELF for buffs)
2. Build generic event builder that constructs events from the data structure (abstract CombatSkill class)
3. Remove hardcoded combat skill classes in favor of data-driven construction
4. Implement frame interpolation for segments where End-Axis frame count < Warfarin-derived hit count
