---
name: game-data-parsing
description: Parse gamedata.json into skills.json frame data for Arknights Endfield operators. Use when adding new operator frame data, parsing attack segments, skill ticks, anomalies/inflictions, and variant (enhanced/empowered) forms.
---

This skill guides parsing of raw game data (`gamedata.json`) into structured skill frame data (`skills.json`) for the timeline calculator.

## Files
- `src/model/game-data/gamedata.json` — Raw game data extracted from Arknights: Endfield
- `src/model/game-data/skills.json` — Parsed skill/attack data for our operators, derived from gamedata.json

## Top-level structure of gamedata.json
- `characterRoster` — Array of operator objects
- `enemyDatabase` — Enemy data
- `weaponDatabase` — Weapon data
- `equipmentDatabase` — Gear/equipment data

## Character keys → skills.json mapping

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

## Terminology mapping
- gamedata `skill_*` = Battle Skill (`CombatSkillType.BATTLE_SKILL`)
- gamedata `link_*` = Combo Skill (`CombatSkillType.COMBO_SKILL`)
- gamedata `ultimate_*` = Ultimate (`CombatSkillType.ULTIMATE`)
- gamedata `attack_segments` = Basic Attack (`CombatSkillType.BASIC_ATTACK`)
- gamedata `execution_*` = Finisher (not yet modeled)

## Anomalies / inflictions in gamedata

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

### Anomaly type → skills.json mapping
| gamedata `type` | skills.json `APPLY_ARTS_INFLICTION` key | Element |
|---|---|---|
| `blaze_attach` | `HEAT` | Heat Infliction |
| `cold_attach` | `CRYO` | Cryo Infliction |
| `emag_attach` | `ELECTRIC` | Electric Infliction |
| `nature_attach` | `NATURE` | Nature Infliction |

### Anomaly type → non-infliction effects (not parsed as APPLY_ARTS_INFLICTION)
| gamedata `type` | Meaning |
|---|---|
| `magma_0` | StatusLevel 1 Combustion (forced arts reaction, bypasses infliction stacks) |
| `magma_1` – `magma_3` | Intermediate Melting Flame effects (stack-dependent) |
| `magma_4` | Melting Flame / Scorching Heart absorption (absorbs Heat infliction → Melting Flame stacks) |
| `blaze_burst` / `burning` | Combustion arts reaction |

## skills.json tick format

Each tick in skills.json has:
```json
{
  "OFFSET_SECONDS": 0.3,
  "SKILL_POINT_RECOVERY": 0,
  "STAGGER": 0,
  "APPLY_ARTS_INFLICTION": {
    "<ELEMENT>": {
      "STACKS": 1
    }
  },
  "APPLY_FORCED_REACTION": {
    "REACTION": "COMBUSTION",
    "STATUS_LEVEL": 1
  },
  "ABSORB_ARTS_INFLICTION": {
    "<ELEMENT>": {
      "STACKS": 4,
      "CONVERSION": {
        "EXCHANGE": "MELTING_FLAME",
        "RATIO": "1:1"
      }
    }
  }
}
```

Fields:
- `OFFSET_SECONDS` — When the hit lands (seconds from skill start)
- `SKILL_POINT_RECOVERY` — SP gained on hit
- `STAGGER` — Stagger damage dealt
- `APPLY_ARTS_INFLICTION` — (optional) Element infliction with stack count
- `APPLY_FORCED_REACTION` — (optional) Forced arts reaction bypassing infliction stacks
- `ABSORB_ARTS_INFLICTION` — (optional) Absorbs infliction from enemies, with conversion info

## Variants in gamedata

`variants[]` contains enhanced/empowered forms of skills. Each variant has:
- `name` — Chinese name (强化 = Empowered, 大招内 = Enhanced/during ult)
- `type` — `"attack"` (basic attack variant) or `"skill"` (battle skill variant)
- `attackSegments[]` — Same structure as `attack_segments` (with `physicalAnomaly` and `damageTicks`)
- `duration`, `damageTicks[]`, `allowedTypes[]`

Naming convention: **Enhanced** = during ultimate, **Empowered** = from status effects (e.g. Melting Flame stacks).

## Other character fields (not yet in skills.json)
- `skill_allowed_types` / `link_allowed_types` — Status types that can be active during the skill
- `exclusive_buffs` — Operator-specific buff icons (e.g. Laevatain's Melting Flame stacks)

## Ultimates with delayed hits (out-of-bounds ticks)

Some ultimates have damage ticks with `OFFSET_SECONDS > *_ULTIMATE_DURATION`. These represent delayed effects (explosions, impacts) that occur after the main activation animation ends.

### Detection
After parsing ultimate ticks, check if any tick has `OFFSET_SECONDS > DURATION`. If so, the ultimate needs to be split into multiple sequences.

### Splitting into sequences
1. **Main sequence**: Ticks where `OFFSET_SECONDS <= DURATION`. Uses original `DURATION`.
2. **Delayed sequence**: Ticks where `OFFSET_SECONDS > DURATION`. Re-offset each tick by subtracting the main duration. Duration = max re-offset + 0.1s buffer.

### Naming delayed sequences
Cross-reference the operator's ultimate description from the wiki to name the delayed segment:

| Operator | Ultimate Name | Delayed Segment Name | Description |
|---|---|---|---|
| Lifeng | Heart of the Unmoving | Vajra Impact | Delayed Vajra slam after main activation |
| Arclight | Exploding Blitz | Explosion | Delayed explosion after forward dash |

### Event frame file pattern
```ts
const OP_ULT = OP.ULTIMATE.OPERATOR_ULTIMATE;
const OP_ULT_DUR = OP_ULT.OPERATOR_ULTIMATE_DURATION;

/** Main activation — ticks within duration */
class OperatorUltimateMainSequence extends SkillEventSequence {
  constructor() {
    super();
    this._durationSeconds = OP_ULT_DUR;
    for (let i = 1; i <= ticks; i++) {
      const tick = OP_ULT[`OPERATOR_ULTIMATE_TICK_${i}`];
      if (tick && tick.OFFSET_SECONDS <= OP_ULT_DUR) frames.push(new OperatorSkillEventFrame(tick));
    }
  }
}

/** Delayed hit — ticks beyond duration, re-offset */
class OperatorDelayedSequence extends SkillEventSequence {
  constructor() {
    super();
    for (let i = 1; i <= ticks; i++) {
      const tick = OP_ULT[`OPERATOR_ULTIMATE_TICK_${i}`];
      if (tick && tick.OFFSET_SECONDS > OP_ULT_DUR) {
        delayedTicks.push({ tick, offset: tick.OFFSET_SECONDS - OP_ULT_DUR });
      }
    }
    this._durationSeconds = maxOffset + 0.1;
    this._frames = delayedTicks.map(d => new OperatorSkillEventFrame({ ...d.tick, OFFSET_SECONDS: d.offset }));
  }
}

export const OPERATOR_ULTIMATE_SEQUENCE = new OperatorUltimateMainSequence();
export const OPERATOR_DELAYED_SEQUENCE = new OperatorDelayedSequence();
```

### columnBuilder registration
Multi-sequence ultimates use the `{ sequences, labels }` format in `ULTIMATE_FRAME_SEQUENCES`:
```ts
lifeng: { sequences: [LIFENG_ULTIMATE_SEQUENCE, LIFENG_VAJRA_IMPACT_SEQUENCE], labels: ['Heart of the Unmoving', 'Vajra Impact'] },
arclight: { sequences: [ARCLIGHT_ULTIMATE_SEQUENCE, ARCLIGHT_EXPLOSION_SEQUENCE], labels: ['Exploding Blitz', 'Explosion'] },
```

Single-sequence ultimates remain as plain `SkillEventSequence`:
```ts
endministrator: ENDMINISTRATOR_ULTIMATE_SEQUENCE,
```

## Parsing workflow

1. Find operator in `characterRoster` by `id`
2. Extract basic attack sequences from `attack_segments[]`
3. Extract battle skill from `skill_*` fields
4. Extract combo skill from `link_*` fields
5. Extract ultimate from `ultimate_*` fields
6. For each damage tick, map anomalies using the type mapping above
7. Check for out-of-bounds ultimate ticks (`OFFSET_SECONDS > DURATION`) and split into delayed sequences if found; name using wiki descriptions
8. Check `variants[]` for enhanced/empowered forms
9. Output to skills.json following the tick format above
