---
name: gear-wiki-sync
description: Sync gear data from the Arknights Endfield wiki. Use when the user says "check for new gear", "sync gear from wiki", "update gear from wiki", "new gear released", or wants to compare codebase gear against the wiki. Fetches gear set pages from endfield.wiki.gg, identifies new or stub gear, and adds full implementations.
---

# Gear Wiki Sync Procedure

Sync gear sets from https://endfield.wiki.gg/wiki/Category:Gear into the codebase. This skill handles discovering new gear sets, filling in stub gear pieces, and adding full stat/effect implementations.

## Step 1: Fetch the wiki gear category

Fetch the category page to get the list of all gear sets:
```
WebFetch https://endfield.wiki.gg/wiki/Category:Gear
```

Each gear set has its own wiki page at `https://endfield.wiki.gg/wiki/{Set_Name}` (e.g., `https://endfield.wiki.gg/wiki/Hot_Work`).

## Step 2: Compare against existing gear sets

Current gear sets in the codebase (from `GearEffectType` enum in `src/consts/enums.ts`):
- AIC_HEAVY, AIC_LIGHT (2-star)
- ARMORED_MSGR, ROVING_MSGR, MORDVOLT_INSULATION, MORDVOLT_RESISTANT (3-star)
- ABURREY_LEGACY, CATASTROPHE (4-star)
- HOT_WORK, BONEKRUSHA, PULSER_LABS, ETERNAL_XIRANITE, AETHERTECH, MI_SECURITY, SWORDMANCER, FRONTIERS, TYPE_50_YINGLUNG, TIDE_SURGE, LYNX (5-star)
- Also: Redeemer (no set effect, uses NONE)

Cross-reference wiki gear sets against this list. Flag:
1. **New sets** — not in `GearEffectType` enum at all
2. **Stub pieces** — registered in `loadoutRegistry.ts` using `createGenericGear()` instead of a concrete class

## Step 3: Fetch individual gear set pages

For each new or stub gear set, fetch its wiki page:
```
WebFetch https://endfield.wiki.gg/wiki/{Set_Name}
```

Extract from each page:
- **Set effect** (3-piece bonus): description, passive stats, trigger condition, duration, stacks, cooldown
- **Pieces**: name, slot (Armor/Gloves/Kit), stats at all 4 ranks (R1-R4)
- **Variants**: MOD, T1, T2, T3 variants of each piece

### Stat extraction rules
- Percentage stats on wiki → store as decimals (e.g., 19.2% → 0.192)
- Main attributes: STRENGTH, AGILITY, INTELLIGENCE (INT), WILLPOWER (WILL)
- Damage stats: ATK, PHYSICAL_DAMAGE_BONUS, ARTS_DAMAGE_BONUS, HEAT_DAMAGE_BONUS, etc.
- Other: CRIT_RATE, ARTS_INTENSITY, STAGGER_DAMAGE_BONUS, HP_BONUS, etc.
- Check `StatType` enum in `src/consts/enums.ts` for all valid stat keys

### 5-star attribute ranges by rank (R1→R4) — use to verify wiki data
- Armor primary: 87 → 95 → 104 → 113
- Armor secondary: 58 → 63 → 69 → 75
- Gloves primary: 65 → 71 → 78 → 84
- Gloves secondary: 43 → 47 → 51 → 55
- Kit primary (2-stat): 32 → 35 → 38 → 41
- Kit secondary (2-stat): 21 → 23 → 25 → 27
- Kit primary (1-stat): 41 → 45 → 49 → 53
- Kit primary (1-stat, single attr): 43 → 47 → 51 → 55

## Step 4: Implement new gear sets

For each new gear set, follow this checklist:

### 4a. Add GearEffectType enum (if new set)
File: `src/consts/enums.ts`
```typescript
export enum GearEffectType {
  // ... existing entries
  NEW_SET_NAME = "NEW_SET_NAME",
}
```

### 4b. Create gear effect class (if new set with set bonus)
File: `src/model/gears/gearEffects.ts`
```typescript
export class NewSetEffect extends GearEffect {
  constructor() {
    super({
      gearEffectType: GearEffectType.NEW_SET_NAME,
      description: 'Paste the 3-piece set effect description from wiki',
      passiveStats: { [StatType.SOME_STAT]: value }, // passive portion
      triggerCondition: TriggerConditionType.SOME_TRIGGER, // if triggered
      durationSeconds: 10, // if timed
      isStackable: false,
      // maxStacks, cooldownSeconds as needed
    });
  }
}
```

### 4c. Create concrete gear piece file
File: `src/model/gears/newSetName.ts` (camelCase)
```typescript
import { Gear } from './gear';
import { GearType, GearEffectType, StatType } from '../../consts/enums';
import { GearRank } from '../../consts/types';

export class NewSetArmor extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.NEW_SET_NAME,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 87, [StatType.AGILITY]: 58, [StatType.SOME_BONUS]: 0.115 },
        2: { [StatType.STRENGTH]: 95, [StatType.AGILITY]: 63, [StatType.SOME_BONUS]: 0.127 },
        3: { [StatType.STRENGTH]: 104, [StatType.AGILITY]: 69, [StatType.SOME_BONUS]: 0.138 },
        4: { [StatType.STRENGTH]: 113, [StatType.AGILITY]: 75, [StatType.SOME_BONUS]: 0.149 },
      },
    });
  }
}
// Repeat for each piece variant (Gloves, Kit, MOD, T1, etc.)
```

### 4d. Register in loadout registry
File: `src/utils/loadoutRegistry.ts`

1. Import gear classes at the top
2. Import icon (or use a placeholder — check `src/assets/gears/` for existing icons)
3. Add entries to `GEARS_RAW` in alphabetical order within the correct section (Armor/Gloves/Kit)
4. Add rarity to `GEAR_RARITY` if 5-star (value: 1) or 4-star (value: 2)

```typescript
{ name: "New Set Armor", icon: nsArmor, gearType: A, create: () => new NewSetArmor() },
```

### 4e. Add gear effect factory (if new set)
File: `src/controller/calculation/loadoutAggregator.ts`
Add to `GEAR_EFFECT_FACTORIES`:
```typescript
[GearEffectType.NEW_SET_NAME]: () => new NewSetEffect(),
```

### 4f. Add gear set effects for timeline (if triggered/timed)
File: `src/consts/gearSetEffects.ts`
```typescript
{
  gearEffectType: GearEffectType.NEW_SET_NAME,
  effects: [{
    label: 'Effect Name',
    triggers: [TriggerConditionType.SOME_TRIGGER],
    target: 'wielder',
    durationSeconds: 10,
    maxStacks: 1,
    buffs: [{ stat: StatType.SOME_STAT, value: 0.50 }],
  }],
}
```

## Step 5: Fill in stub gear pieces

For existing sets where pieces use `createGenericGear()`, replace with concrete classes:

1. Check wiki page for the piece's stats at all 4 ranks
2. Create the concrete class in the set's file
3. Update the registry entry's `create` function

## Step 6: Update the gear-data skill

After adding new gear, update `.claude/skills/gear-data/SKILL.md` with:
- New set entries in the set tables
- New piece stat tables
- Updated piece counts

## Step 7: Verify

Run `npx tsc --noEmit` to verify no type errors were introduced.

## Notes
- Icons: download from wiki if available, save as `src/assets/gears/Set_Name_Piece.webp` (snake_case). If icons aren't available, use a placeholder from the same rarity tier.
- GenericGear stubs are acceptable as a first pass — they can be filled in later when wiki stats are confirmed.
- The wiki may use different names for stats. Common mappings:
  - "ATK" → StatType.ATK or StatType.ATK_BONUS (check if flat or %)
  - "Physical DMG" → StatType.PHYSICAL_DAMAGE_BONUS
  - "Arts DMG" → StatType.ARTS_DAMAGE_BONUS
  - "Skill DMG" → StatType.SKILL_DAMAGE_BONUS
  - "Stagger Efficiency" → StatType.STAGGER_EFFICIENCY
  - "HP Treatment Efficiency" → StatType.TREATMENT_BONUS
  - "DMG Reduction" → StatType.DAMAGE_REDUCTION
  - "Ultimate DMG" → StatType.ULTIMATE_DAMAGE_BONUS
  - "Battle Skill DMG" → StatType.BATTLE_SKILL_DAMAGE_BONUS
  - "Combo Skill DMG" → StatType.COMBO_SKILL_DAMAGE_BONUS
  - "Basic ATK DMG" → StatType.BASIC_ATTACK_DAMAGE_BONUS
  - "Ultimate Energy Recovery" → StatType.ULTIMATE_ENERGY_GAIN
