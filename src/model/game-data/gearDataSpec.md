# Gear Data Specification

This document defines the structure and semantics of per-set gear JSON files in `game-data/gears/<set-slug>.json`.

## File Structure

Each gear set file (e.g., `gears/hot-work.json`) contains a single set object grouping all pieces:

```json
{
  "setId": "HOT_WORK",
  "setName": "Hot Work",
  "suitID": "suit_fire_natr01",
  "rarity": 5,
  "setEffect": {
    "piecesRequired": 3,
    "skillId": "passive_equipsuit_fninflict_01",
    "description": "Arts Intensity +30. After Combustion applied, gain Heat DMG +50% for 10s. After Corrosion applied, gain Nature DMG +50% for 10s. Effects cannot stack."
  },
  "pieces": [...],
  "dataSources": ["WARFARIN"]
}
```

### Set-Level Keys

| Key              | Type     | Enum/Type          | Description                                |
|------------------|----------|--------------------|--------------------------------------------|
| `setId`          | string   | `GearEffectType`   | Gear set enum value (e.g., `HOT_WORK`)     |
| `setName`        | string   | —                  | Display name                               |
| `suitID`         | string   | —                  | Warfarin API suit identifier               |
| `rarity`         | number   | —                  | Star rating (1–5)                          |
| `setEffect`      | object   | —                  | 3-piece set bonus. `null` for sets with no bonus (e.g., Redeemer) |
| `pieces`         | array    | —                  | All gear pieces in this set                |
| `dataSources`    | string[] | `DataSourceType`   | Where this data was sourced from           |

### Set Effect

| Field             | Type   | Description                                   |
|-------------------|--------|-----------------------------------------------|
| `piecesRequired`  | number | Number of pieces needed to activate (always 3) |
| `skillId`         | string | Warfarin API skill identifier                 |
| `description`     | string | Full set effect description, rich text stripped |

---

## Pieces

Each piece in the `pieces` array describes a single gear item with stats across 4 ranks:

```json
{
  "slug": "item_equip_t4_suit_fire_natr01_hand_02",
  "name": "Hot Work Gauntlets",
  "partType": "GLOVES",
  "defense": 42,
  "statsByRank": {
    "1": { "INTELLECT": 65, "STRENGTH": 43, "HEAT_DAMAGE_BONUS": 0.192, "NATURE_DAMAGE_BONUS": 0.192 },
    "2": { "INTELLECT": 71, "STRENGTH": 47, "HEAT_DAMAGE_BONUS": 0.211, "NATURE_DAMAGE_BONUS": 0.211 },
    "3": { "INTELLECT": 78, "STRENGTH": 51, "HEAT_DAMAGE_BONUS": 0.230, "NATURE_DAMAGE_BONUS": 0.230 },
    "4": { "INTELLECT": 84, "STRENGTH": 55, "HEAT_DAMAGE_BONUS": 0.249, "NATURE_DAMAGE_BONUS": 0.249 }
  }
}
```

### Piece Keys

| Key           | Type   | Enum/Type   | Description                                |
|---------------|--------|-------------|--------------------------------------------|
| `slug`        | string | —           | Warfarin API slug (unique identifier)      |
| `name`        | string | —           | Display name (e.g., "Hot Work Gauntlets")  |
| `partType`    | string | `GearType`  | `ARMOR`, `GLOVES`, or `KIT`               |
| `defense`     | number | —           | Flat defense (constant across all ranks)   |
| `statsByRank` | object | —           | Stats at each rank (1–4), keyed by `StatType` enum values |

### Stat Values

- **Primary attributes** (STRENGTH, AGILITY, INTELLECT, WILL): Flat integer values
- **Percentage stats** (damage bonuses, critical rate, etc.): Stored as decimals (e.g., 0.192 = 19.2%)
- **Arts Intensity**: Flat number (e.g., 20.7, 53.8)
- **Defense**: Flat number, constant across all ranks — stored at piece level, not in statsByRank

### 5-star attribute ranges by rank (R1 → R4)

Use these to verify parsed data:

| Piece type | Primary stat | Secondary stat |
|------------|-------------|----------------|
| Armor      | 87 → 95 → 104 → 113 | 58 → 63 → 69 → 75 |
| Gloves     | 65 → 71 → 78 → 84 | 43 → 47 → 51 → 55 |
| Kit (2-attr) | 32 → 35 → 38 → 41 | 21 → 23 → 25 → 27 |
| Kit (1-attr) | 41 → 45 → 49 → 53 | — |
| Kit (1-attr, single) | 43 → 47 → 51 → 55 | — |

---

## Warfarin API Source

### List endpoint

```
GET https://api.warfarin.wiki/v1/en/gear?version=1.1
```

Returns `meta` + `data[]` (165 items). Each item has:

```json
{
  "slug": "item_equip_t4_suit_fire_natr01_hand_02",
  "id": "item_equip_t4_suit_fire_natr01_hand_02",
  "name": "Hot Work Gauntlets",
  "iconId": "item_equip_t4_suit_fire_natr01_hand_02",
  "rarity": 5,
  "minWearLv": 70,
  "partType": 1,
  "suitID": "suit_fire_natr01",
  "displayBaseAttrModifier": {
    "attrType": 3,
    "attrValue": 42
  },
  "displayAttrModifiers": [
    {
      "attrIndex": 1,
      "attrType": 41,
      "attrValue": 65,
      "compositeAttr": "",
      "enhancedAttrValues": [71, 78, 84],
      "modifierType": 5
    }
  ]
}
```

> **Note:** The `version` query parameter should be updated when new game versions release.

### Detail endpoint

```
GET https://api.warfarin.wiki/v1/en/gear/<slug>
```

Returns expanded data including:
- `data.equipSuitTable` — set name, suit ID, 3-piece skill ID
- `data.skillPatchTable` — set effect skill description and parameters
- `refs.attributeMetaTable` — maps attrType numbers to attribute names

Only needed for set effect descriptions (list endpoint has all piece stats).

### partType → GearType mapping

| API `partType` | `GearType` enum |
|----------------|-----------------|
| `0`            | `ARMOR`         |
| `1`            | `GLOVES`        |
| `2`            | `KIT`           |

### displayBaseAttrModifier

Always `attrType: 3` (Defense). The `attrValue` is the flat defense number.

### displayAttrModifiers

Array of stat modifiers. Each entry provides base value + enhanced values for ranks 2-4:

- `attrValue` = Rank 1 value
- `enhancedAttrValues` = `[rank2, rank3, rank4]` values
- `attrType` = numeric stat identifier (see mapping table below)
- `compositeAttr` = non-empty string when `attrType` is `0` (composite stat)

### attrType → StatType mapping

The Warfarin API uses numeric attribute type IDs shared across operators, weapons, and gear. The complete mapping is in `src/model/utils/parsers/warfarin.ts` — the `WarfarinAttributeType` enum and `WARFARIN_TO_STAT` mapping.

#### Gear-specific overrides

For attrTypes 1 (MaxHp) and 2 (Atk), the `modifierType` field determines flat vs percentage:

| `attrType` | `modifierType` | `StatType`       | Example                   |
|------------|----------------|------------------|---------------------------|
| 1          | 6              | `HP_BONUS`       | 0.147 = 14.7%             |
| 1          | 5 or 7         | `FLAT_HP`        | 46.3 flat HP              |
| 2          | 6              | `ATTACK_BONUS`   | 0.10 = 10%                |
| 2          | 5 or 7         | `BASE_ATTACK`    | 11.7 flat ATK             |

All other attrTypes use the standard `WARFARIN_TO_STAT` mapping from `warfarin.ts`.

#### Composite attributes (attrType = 0)

When `attrType` is `0`, the `compositeAttr` string determines the stat(s):

| `compositeAttr`                | `StatType`(s)                                      | Notes                          |
|--------------------------------|----------------------------------------------------|--------------------------------|
| `FireAndNaturalDamageIncrease` | `HEAT_DAMAGE_BONUS` + `NATURE_DAMAGE_BONUS`        | Same value applied to both     |
| `CrystAndPulseDamageIncrease`  | `CRYO_DAMAGE_BONUS` + `ELECTRIC_DAMAGE_BONUS`      | Same value applied to both     |
| `AllSkillDamageIncrease`       | `SKILL_DAMAGE_BONUS`                               | Single stat                    |
| `SpellDamageIncrease`          | `ARTS_DAMAGE_BONUS`                                | Single stat                    |
| `AllDamageTakenScalar`         | `FINAL_DAMAGE_REDUCTION`                           | Convert: `1 - attrValue`      |
| `Main`                         | `PRIMARY_ATTRIBUTE_BONUS`                          | Resolves to operator's main attribute at runtime |
| `Sub`                          | `SECONDARY_ATTRIBUTE_BONUS`                        | Resolves to operator's secondary attribute at runtime |

### suitID → GearEffectType mapping

| `suitID`             | `GearEffectType`       | Set Name             |
|----------------------|------------------------|----------------------|
| `suit_fire_natr01`   | `HOT_WORK`             | Hot Work             |
| `suit_pulse_cryst01` | `PULSER_LABS`          | Pulser Labs          |
| `suit_poise01`       | `AETHERTECH`           | Aethertech           |
| `suit_phy01`         | `SWORDMANCER`          | Swordmancer          |
| `suit_criti01`       | `MI_SECURITY`          | MI Security          |
| `suit_atb01`         | `FRONTIERS`            | Frontiers            |
| `suit_atk02`         | `TYPE_50_YINGLUNG`     | Type 50 Yinglung     |
| `suit_heal01`        | `LYNX`                 | LYNX                 |
| `suit_usp02`         | `ETERNAL_XIRANITE`     | Eternal Xiranite     |
| `suit_attri01`       | `BONEKRUSHA`           | Bonekrusha           |
| `suit_usp01`         | `CATASTROPHE`          | Catastrophe          |
| `suit_atk01`         | `ABURREY_LEGACY`       | Aburrey Legacy       |
| `suit_str01`         | `ARMORED_MSGR`         | Armored MSGR         |
| `suit_agi01`         | `ROVING_MSGR`          | Roving MSGR          |
| `suit_wisd01`        | `MORDVOLT_INSULATION`  | Mordvolt Insulation  |
| `suit_will01`        | `MORDVOLT_RESISTANT`   | Mordvolt Resistant   |
| `suit_stragi01`      | `AIC_HEAVY`            | AIC Heavy            |
| `suit_wisdwill01`    | `AIC_LIGHT`            | AIC Light            |
| `suit_burst01`       | `TIDE_SURGE`           | Tide Surge           |
| *(empty string)*     | `NONE`                 | No set (e.g., Redeemer, generic pieces) |

> **Note:** When new suitIDs appear in the API, add a corresponding `GearEffectType` enum value.

---

## Parsing Workflow

1. Fetch gear list from `https://api.warfarin.wiki/v1/en/gear?version=1.1`
2. Group items by `suitID` — each group becomes one output file
3. For each group:
   a. Look up `GearEffectType` from suitID mapping (flag unknown suitIDs)
   b. Determine `rarity` from any item in the group
   c. Map `partType` to `GearType`
   d. Extract defense from `displayBaseAttrModifier.attrValue`
   e. For each `displayAttrModifier`:
      - Map `attrType` to `StatType` (handling composites via `compositeAttr`)
      - Build rank 1 from `attrValue`, ranks 2-4 from `enhancedAttrValues`
   f. Fetch detail endpoint for one piece per set to get set effect description
4. Write per-set JSON to `game-data/gears/<set-slug>.json`
5. **Before writing**, preserve any entries with `dataSources` containing `"SELF"`

### Set effect description

Fetch the detail endpoint for any one piece in the set. The set effect is in `data.equipSuitTable` (set name, skillId) and `data.skillPatchTable` (skill description). Strip rich text tags from the description.

---

## Codebase Integration

Each output JSON corresponds to a TypeScript gear file under `src/model/gears/<setName>.ts`. The JSON `statsByRank` maps directly to the `Gear` constructor's `statsByRank` parameter:

```typescript
// From JSON:  { "1": { "INTELLECT": 65, "STRENGTH": 43 }, ... }
// To code:
export class HotWorkGauntlets extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.HOT_WORK,
      rank,
      statsByRank: {
        1: { [StatType.INTELLECT]: 65, [StatType.STRENGTH]: 43, ... },
        2: { [StatType.INTELLECT]: 71, [StatType.STRENGTH]: 47, ... },
        ...
      },
      defense: 42,
    });
  }
}
```

### Implementation checklist for new gear sets

| Step | File | Action |
|------|------|--------|
| 1 | `src/consts/enums.ts` | Add `GearEffectType` enum value |
| 2 | `src/model/gears/gearEffects.ts` | Add concrete GearEffect class |
| 3 | `src/model/gears/<setName>.ts` | Create concrete gear piece classes |
| 4 | `src/utils/loadoutRegistry.ts` | Register pieces in ARMORS, GLOVES, KITS |
| 5 | `src/controller/calculation/loadoutAggregator.ts` | Add to `GEAR_EFFECT_FACTORIES` |
| 6 | `src/consts/gearSetEffects.ts` | Add set effect entry (if triggered/timed) |

---

## Enum Reference

| Enum               | Location                      |
|--------------------|-------------------------------|
| `GearType`         | `src/consts/enums.ts`         |
| `GearEffectType`   | `src/consts/enums.ts`         |
| `StatType`         | `src/model/enums/stats.ts`    |
| `DataSourceType`   | `src/consts/enums.ts`         |

## Data Sources

See [Operator Data Specification](./operatorDataSpec.md#data-sources) for `dataSources` semantics.
