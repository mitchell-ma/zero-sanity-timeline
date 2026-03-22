# Weapon Data Specification

This document defines the structure and semantics of per-weapon JSON files in `game-data/weapons/<slug>.json`.

## File Structure

Each weapon file (e.g., `weapons/never-rest.json`) contains a single weapon object:

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
  "skills": [...],
  "dataSources": ["WARFARIN"]
}
```

### Weapon Keys

| Key              | Type     | Enum/Type        | Description                        |
|------------------|----------|------------------|------------------------------------|
| `weaponId`       | string   | `WeaponType`     | Per-weapon enum value (e.g., `NEVER_REST`) |
| `name`           | string   | —                | Display name — formatted from `weaponId` enum string |
| `weaponType`     | string   | `WeaponType`     | Weapon category: SWORD, GREAT_SWORD, POLEARM, HANDCANNON, ARTS_UNIT |
| `weaponRarity`   | number   | —                | Star rating (3–6)                  |
| `allLevels`      | array    | —                | 90 entries with `level` and `baseAttack` |
| `skills`         | array    | —                | Ordered skill array (slots 1-3)    |

---

## Weapon Skills

Skills come in two categories: **stat boosts** and **named skills**.

### Stat Boost Skills

```json
{
  "weaponSkillType": "WILL_BOOST_L",
  "name": "Will Boost [L]",
  "description": "Will +",
  "skillSlot": 1,
  "skillCategory": "STAT_BOOST",
  "allLevels": [
    { "level": 1, "WILL": 20 },
    { "level": 9, "WILL": 156 }
  ]
}
```

Stats are flattened directly onto the level entry (no `blackboard` wrapper). Keys are `StatType` enum values mapped from API blackboard keys.

### Named Skills

```json
{
  "weaponSkillType": "NEVER_REST_FLOW_REINCARNATION",
  "name": "Flow: Reincarnation",
  "description": "Physical DMG Dealt +{phy_dmg_up:0.0%}. After the wielder's skill recovers SP, the wielder gains Physical DMG Dealt +{phy_dmg_up2:0.0%} while other operators in the team gain Physical DMG Dealt +{phy_dmg_up3:0.0%} for {duration:0}s. Max stacks for effects of the same name: {max_stack:0}.",
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
    }
  ]
}
```

Named skill level entries split stats into **permanent** (at level root) and **conditional** (in `conditionalStats[]`):

- **Permanent stats**: Stats that are always active. Mapped to `StatType` keys at the level root.
- **Conditional stats**: Stats triggered by a condition. Each entry has:
  - `triggerConditions`: Array of `TriggerConditionType` enum values
  - `triggerSources`: Array of `DslTarget` objects — who receives the buff (e.g., `[{ determiner: "THIS", noun: "OPERATOR" }]`, `[{ determiner: "THIS", noun: "OPERATOR" }, { determiner: "ALL_OTHER", noun: "OPERATOR" }]`)
  - `duration`: Duration struct `{ value, unit: "SECOND" }`
  - `maxStacks`: Optional max stacks for the effect
  - Stat key-value pairs (raw API keys or mapped `StatType` keys)

The description retains `{variable:format}` placeholders for runtime string interpolation (e.g., `{phy_dmg_up:0.0%}` → "16.0%").

| Field             | Type   | Description                                              |
|-------------------|--------|----------------------------------------------------------|
| `weaponSkillType` | string | `WeaponSkillType` enum value — the primary identifier    |
| `name`            | string | Display name (e.g., "Will Boost [L]")                    |
| `description`     | string | Skill description with `{var:format}` placeholders       |
| `skillSlot`       | number | 1, 2, or 3 — position in the weapon's skill list         |
| `skillCategory`   | string | `"STAT_BOOST"` for generic stat skills, `"NAMED"` for weapon-specific skills |
| `allLevels`       | array  | 9 entries, one per skill level                           |

### WeaponSkillType naming convention

Named weapon skills use a **weapon-prefixed** `WeaponSkillType` enum value: `<WEAPON_NAME>_<SKILL_NAME>`. For example:
- `NEVER_REST_FLOW_REINCARNATION` (Never Rest → Flow: Reincarnation)
- `FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL` (Forgeborn Scathe → Twilight: Blazing Wail)

Shared skills (same implementation appearing on multiple weapons) get one enum value per weapon:
- `CONTINGENT_MEASURE_SUPPRESSION_EMERGENCY_BOOST`
- `INDUSTRY_0_1_SUPPRESSION_EMERGENCY_BOOST`
- `HOWLING_GUARD_SUPPRESSION_EMERGENCY_BOOST`

Stat boost skills use generic names without a weapon prefix (e.g., `ATTACK_BOOST_L`, `WILL_BOOST_M`).

---

## Enum Reference

| Enum                     | Location                      |
|--------------------------|-------------------------------|
| `WeaponType`             | `src/consts/enums.ts`         |
| `WeaponSkillType`        | `src/consts/enums.ts`         |
| `StatType`               | `src/model/enums/stats.ts`    |
| `TriggerConditionType`   | `src/consts/enums.ts`         |
| `DslTarget`              | `src/dsl/semantics.ts`        |
| `DataSourceType`         | `src/consts/enums.ts`         |

## Data Sources

See [Operator Data Specification](./operatorDataSpec.md#data-sources) for `dataSources` semantics.

## Parsing

- **Weapon data**: Parsed from Warfarin API via `src/model/utils/parsers/parseWarfarinWeapons.ts`
- See SKILL.md Part 1b for full parsing workflow and API structure
