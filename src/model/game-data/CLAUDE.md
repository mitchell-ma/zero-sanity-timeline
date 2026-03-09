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

### Other character fields (not yet in skills.json)
- `skill_anomalies` / `link_anomalies` / `ultimate_anomalies` — Status inflictions triggered by skills
- `skill_allowed_types` / `link_allowed_types` — Status types that can be active during the skill
- `exclusive_buffs` — Operator-specific buff icons (e.g. Laevatain's Melting Flame stacks)
- `variants` — Skill variants (e.g. enhanced/empowered forms)
