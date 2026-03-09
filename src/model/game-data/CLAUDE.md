# game-data directory

## Files
- `gamedata.json` — Raw game data extracted from Arknights: Endfield
- `skills.json` — Parsed skill/attack data for our operators, derived from gamedata.json

## Parsing gamedata.json

### Top-level structure
- `characterRoster` — Array of operator objects
- `enemyDatabase` — Enemy data
- `weaponDatabase` — Weapon data
- `equipmentDatabase` — Gear/equipment data

### Character keys → skills.json mapping

Each character in `characterRoster` has:

| gamedata key | skills.json mapping | Notes |
|---|---|---|
| `id` | Operator key (matches `OperatorType` enum) | e.g. `"LAEVATAIN"` |
| `attack_segments[]` | `BASIC_ATTACK` | Array of basic attack sequences |
| `attack_segments[].duration` | `*_DURATION` | Sequence animation duration (seconds) |
| `attack_segments[].damage_ticks[]` | `*_TICK_N` | Damage frames within the sequence |
| `attack_segments[].damage_ticks[].offset` | `OFFSET_SECONDS` | When the hit lands (seconds from sequence start) |
| `attack_segments[].damage_ticks[].sp` | `SKILL_POINT_RECOVERY` | SP gained on hit |
| `attack_segments[].damage_ticks[].stagger` | `STAGGER` | Stagger damage dealt |
| `skill_duration` | `*_BATTLE_SKILL_DURATION` | Battle skill animation duration (seconds) |
| `skill_spCost` | `*_BATTLE_SKILL_SP_COST` | SP cost to activate |
| `skill_gaugeGain` | `*_BATTLE_SKILL_GAUGE_GAIN` | Ultimate gauge gained |
| `skill_teamGaugeGain` | `*_BATTLE_SKILL_TEAM_GAUGE_GAIN` | Team gauge gained |
| `skill_damage_ticks[]` | `*_BATTLE_SKILL_TICK_N` | Same tick format as basic attack |
| `link_duration` | `*_COMBO_SKILL_DURATION` | Combo skill animation duration (seconds) |
| `link_cooldown` | `*_COMBO_SKILL_COOLDOWN` | Combo skill cooldown (seconds) |
| `link_gaugeGain` | `*_COMBO_SKILL_GAUGE_GAIN` | Ultimate gauge gained |
| `link_damage_ticks[]` | `*_COMBO_SKILL_TICK_N` | Same tick format |
| `ultimate_duration` | `*_ULTIMATE_DURATION` | Ultimate cast/activation animation (seconds) |
| `ultimate_animationTime` | `*_ULTIMATE_ANIMATION_TIME` | Ultimate animation time (seconds) |
| `ultimate_gaugeMax` | `*_ULTIMATE_GAUGE_MAX` | Gauge required to activate |
| `ultimate_gaugeReply` | `*_ULTIMATE_GAUGE_REPLY` | Gauge refunded after use |
| `ultimate_damage_ticks[]` | `*_ULTIMATE_TICK_N` | Same tick format |
| `execution_duration` | Not yet parsed | Finisher animation duration |

### Terminology mapping
- gamedata `skill_*` = Battle Skill (`CombatSkillType.BATTLE_SKILL`)
- gamedata `link_*` = Combo Skill (`CombatSkillType.COMBO_SKILL`)
- gamedata `ultimate_*` = Ultimate (`CombatSkillType.ULTIMATE`)
- gamedata `attack_segments` = Basic Attack (`CombatSkillType.BASIC_ATTACK`)
- gamedata `execution_*` = Finisher (not yet modeled)

### Anomalies / inflictions in gamedata

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

#### Anomaly type → skills.json mapping
| gamedata `type` | skills.json `APPLY_ARTS_INFLICTION` key | Element |
|---|---|---|
| `blaze_attach` | `HEAT` | Heat Infliction |
| `cold_attach` | `CRYO` | Cryo Infliction |
| `emag_attach` | `ELECTRIC` | Electric Infliction |
| `nature_attach` | `NATURE` | Nature Infliction |

#### Anomaly type → non-infliction effects (not parsed as APPLY_ARTS_INFLICTION)
| gamedata `type` | Meaning |
|---|---|
| `magma_0` – `magma_4` | Melting Flame / Scorching Heart absorption trigger (Laevatain talent) |
| `blaze_burst` / `burning` | Combustion arts reaction |

### skills.json tick format

Each tick in skills.json has:
```json
{
  "OFFSET_SECONDS": 0.3,
  "SKILL_POINT_RECOVERY": 0,
  "STAGGER": 0,
  "APPLY_ARTS_INFLICTION": {        // optional — present when this tick applies an infliction
    "<ELEMENT>": {                   // HEAT, CRYO, ELECTRIC, or NATURE
      "STACKS": 1
    }
  },
  "ABSORB_ARTS_INFLICTION": {       // optional — present when this tick absorbs infliction from enemies
    "<ELEMENT>": {                   // HEAT, CRYO, ELECTRIC, or NATURE
      "STACKS": 4,                  // max stacks absorbed
      "CONVERSION": {
        "EXCHANGE": "MELTING_FLAME", // StatusType enum value the absorbed stacks convert into
        "RATIO": "1:1"              // conversion ratio (absorbed:converted)
      }
    }
  }
}
```

### Variants in gamedata

`variants[]` contains enhanced/empowered forms of skills. Each variant has:
- `name` — Chinese name (强化 = Empowered, 大招内 = Enhanced/during ult)
- `type` — `"attack"` (basic attack variant) or `"skill"` (battle skill variant)
- `attackSegments[]` — Same structure as `attack_segments` (with `physicalAnomaly` and `damageTicks`)
- `duration`, `damageTicks[]`, `allowedTypes[]`

Naming convention: **Enhanced** = during ultimate, **Empowered** = from status effects (e.g. Melting Flame stacks).

### Other character fields (not yet in skills.json)
- `skill_allowed_types` / `link_allowed_types` — Status types that can be active during the skill
- `exclusive_buffs` — Operator-specific buff icons (e.g. Laevatain's Melting Flame stacks)
