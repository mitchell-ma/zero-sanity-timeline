---
name: gear-data
description: Reference data for Arknights Endfield gear sets and implementation guide. Use when adding new gear pieces, creating gear models, updating the registry, or looking up gear stats, set effects, and piece variants.
---

Use this reference when working with gear data — adding new gear sets, creating gear models, updating the loadout registry, or implementing gear set effects.

# Gear System Architecture

## File Structure
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

## Base Gear Class Pattern
```typescript
// gear.ts
abstract class Gear {
  abstract readonly gearType: GearType;       // ARMOR | GLOVES | KIT
  abstract readonly gearEffectType: GearEffectType;
  rank: number = 4;                           // 1-4
  abstract readonly statsByRank: Record<number, Partial<Record<StatType, number>>>;

  getStats(): Partial<Record<StatType, number>>       // lookup by rank
  getStatsPerLine(ranks: Record<string, number>): ... // per-stat-line ranks
  getStatKeys(): StatType[]                           // from rank 1
}
```

## Concrete Gear Piece Pattern (Example: Hot Work)
```typescript
// hotWork.ts
export class HotWorkExoskeleton extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.HOT_WORK,
      rank,
      statsByRank: {
        1: { [StatType.STRENGTH]: 87, [StatType.AGILITY]: 58, [StatType.HEAT_DAMAGE_BONUS]: 0.115, [StatType.NATURE_DAMAGE_BONUS]: 0.115 },
        2: { [StatType.STRENGTH]: 95, [StatType.AGILITY]: 63, [StatType.HEAT_DAMAGE_BONUS]: 0.127, [StatType.NATURE_DAMAGE_BONUS]: 0.127 },
        3: { [StatType.STRENGTH]: 104, [StatType.AGILITY]: 69, [StatType.HEAT_DAMAGE_BONUS]: 0.138, [StatType.NATURE_DAMAGE_BONUS]: 0.138 },
        4: { [StatType.STRENGTH]: 113, [StatType.AGILITY]: 75, [StatType.HEAT_DAMAGE_BONUS]: 0.149, [StatType.NATURE_DAMAGE_BONUS]: 0.149 },
      },
    });
  }
}
```

Key: percentage stats stored as decimals (19.2% = 0.192).

## Registry Pattern
```typescript
// loadoutRegistry.ts
// Full implementation with stats:
{ name: 'Hot Work Exoskeleton', icon: hot_work_exo_icon, gearType: GearType.ARMOR, create: () => new HotWorkExoskeleton() }

// Generic stub (no stats yet):
const gg = (type: GearType, effect: GearEffectType) => ({
  gearType: type, create: () => new GenericGear(type, effect)
});
```

Registry exports: `ARMORS`, `GLOVES`, `KITS` (filtered from `GEARS`).

## Gear Effect Pattern
```typescript
// gearEffects.ts
abstract class GearEffect {
  abstract readonly gearEffectType: GearEffectType;
  abstract readonly description: string;
  passiveStats: Partial<Record<StatType, number>> = {};
  triggerCondition?: TriggerConditionType;
  durationSeconds?: number;
  stacks?: number;
  maxStacks?: number;
  cooldownSeconds?: number;
}

// Example:
export class HotWorkEffect extends GearEffect {
  readonly gearEffectType = GearEffectType.HOT_WORK;
  readonly description = 'Arts Intensity +30. After Combustion: Heat DMG +50% 10s. After Corrosion: Nature DMG +50% 10s.';
  passiveStats = { [StatType.ARTS_INTENSITY]: 30 };
}
```

## Gear Set Effects (Timeline) Pattern
```typescript
// gearSetEffects.ts — only for sets with triggered/timed effects
{
  gearEffectType: GearEffectType.HOT_WORK,
  effects: [{
    label: 'Hot Work (Heat)',
    triggers: [TriggerConditionType.COMBUSTION],
    target: 'wielder',
    durationSeconds: 10,
    maxStacks: 1,
    buffs: [{ stat: StatType.HEAT_DAMAGE_BONUS, value: 0.50 }]
  }]
}
```

## Set Activation
- **3-piece threshold**: Count gear pieces with same `GearEffectType` across 4 slots (armor, gloves, kit1, kit2)
- If count >= 3, activate set bonus (passive stats + triggered effects)
- Handled in `loadoutAggregator.ts`

## Adding a New Gear Set — Checklist
1. Add `GearEffectType` enum value in `enums.ts` (if not already present)
2. Create concrete gear classes in `src/model/gears/[setName].ts`
3. Add `GearEffect` subclass in `gearEffects.ts` with passive stats + description
4. Register pieces in `loadoutRegistry.ts` (with icons or as stubs)
5. Add factory to `GEAR_EFFECT_FACTORIES` in `loadoutAggregator.ts`
6. If set has triggered/timed effects, add entry to `gearSetEffects.ts`

---

# Gear Set Data (Extracted from Codebase — 2026-03-10)

179 total gear classes. Format: `ClassName` (Slot) — R1/R2/R3/R4 stats. "STUB" = empty stats (GenericGear placeholder).

## Gear Sets by Rarity

### 5-star (Gold)
| Set Name | Effect Type | File |
|----------|------------|------|
| Hot Work | HOT_WORK | hotWork.ts |
| Bonekrusha | BONEKRUSHA | bonekrusha.ts |
| Pulser Labs | PULSER_LABS | pulserLabs.ts |
| Eternal Xiranite | ETERNAL_XIRANITE | eternalXiranite.ts |
| Aethertech | AETHERTECH | aethertech.ts |
| MI Security | MI_SECURITY | miSecurity.ts |
| Swordmancer | SWORDMANCER | swordmancer.ts |
| Frontiers | FRONTIERS | frontiers.ts |
| Type 50 Yinglung | TYPE_50_YINGLUNG | type50Yinglung.ts |
| Tide Surge | TIDE_SURGE | tideSurge.ts |
| LYNX | LYNX | lynx.ts |
| Redeemer | NONE (generic) | redeemer.ts |

### 4-star (Purple)
| Set Name | Effect Type | File |
|----------|------------|------|
| Aburrey's Legacy | ABURREY_LEGACY | aburreyLegacy.ts |
| Catastrophe | CATASTROPHE | catastrophe.ts |

### 3-star (Blue)
| Set Name | Effect Type | File |
|----------|------------|------|
| Armored MSGR | ARMORED_MSGR | armoredMsgr.ts |
| Roving MSGR | ROVING_MSGR | rovingMsgr.ts |
| Mordvolt Insulation | MORDVOLT_INSULATION | mordvoltInsulation.ts |
| Mordvolt Resistant | MORDVOLT_RESISTANT | mordvoltResistant.ts |

### 2-star (Green)
| Set Name | Effect Type | File |
|----------|------------|------|
| AIC Heavy | AIC_HEAVY | aic.ts |
| AIC Light | AIC_LIGHT | aic.ts |

## Set Effects (from wiki — 2026-03-10)

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
| AIC Heavy | Max HP +500. After kill: ATK +20 5s (max 5 stacks) |
| AIC Light | Max HP +500. After kill: ATK +20 5s (max 5 stacks) |
| Armored MSGR | Physical DMG +30%. After Final Strike: ATK +20% 10s |
| Roving MSGR | Physical DMG +15%. After Final Strike: recover 15 SP |
| Mordvolt Insulation | Electric RES +30%. When hit by Electric: Electric DMG +20% 10s |
| Mordvolt Resistant | Electric RES +30%. DMG +20% vs Electrified enemies |
| Aburrey's Legacy | Max 3 unique non-self-stacking buffs. Each unique buff: ATK +5% |
| Catastrophe | Below 30% HP: DMG Reduction +15% |

## Detailed Gear Stats — Fully Implemented (All 4 Ranks)

### Hot Work (HOT_WORK) — hotWork.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Exoskeleton | ARMOR | STR=87 AGI=58 Heat+Nature=11.5% | STR=95 AGI=63 13.8% | STR=104 AGI=69 13.8% | STR=113 AGI=75 14.9% |
| Gauntlets | GLOVES | INT=65 STR=43 Heat+Nature=19.2% | INT=71 STR=47 21.1% | INT=78 STR=51 23.0% | INT=84 STR=55 24.9% |
| Gauntlets T1 | GLOVES | WILL=65 INT=43 Heat+Nature=19.2% | WILL=71 INT=47 21.1% | WILL=78 INT=51 23.0% | WILL=84 INT=55 24.9% |
| Power Bank | KIT | STR=32 AGI=21 ArtsInt=41.4 | STR=35 AGI=23 45.5 | STR=38 AGI=25 49.7 | STR=41 AGI=27 53.8 |
| Power Cartridge | KIT | WILL=32 INT=21 ArtsInt=41.4 | WILL=35 INT=23 45.5 | WILL=38 INT=25 49.7 | WILL=41 INT=27 53.8 |
| Pyrometer | KIT | INT=41 ArtsInt=41.4 | INT=45 45.5 | INT=49 49.7 | INT=53 53.8 |

### Bonekrusha (BONEKRUSHA) — bonekrusha.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Heavy Armor | ARMOR | AGI=87 INT=58 UltDMG=12.3% | AGI=95 INT=63 13.6% | AGI=104 INT=69 14.8% | AGI=113 INT=75 16.0% |
| Heavy Armor T1 | ARMOR | AGI=87 STR=58 ComboDMG=20.7% | AGI=95 STR=63 22.8% | AGI=104 STR=69 24.8% | AGI=113 STR=75 26.9% |
| Poncho | ARMOR | WILL=87 STR=58 ComboDMG=20.7% | WILL=95 STR=63 22.8% | WILL=104 STR=69 24.8% | WILL=113 STR=75 26.9% |
| Poncho Mod/T1 | ARMOR | STUB |
| Figurine | KIT | WILL=32 AGI=21 BattleDMG=41.4% | WILL=35 AGI=23 45.5% | WILL=38 AGI=25 49.7% | WILL=41 AGI=27 53.8% |
| Mask | KIT | AGI=32 STR=21 StaggerDMG=41.4% | AGI=35 STR=23 45.5% | AGI=38 STR=25 49.7% | AGI=41 STR=27 53.8% |
| Wristband/Mod | GLOVES | STUB |

### Pulser Labs (PULSER_LABS) — pulserLabs.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Disruptor Suit | ARMOR | INT=87 WILL=58 ArtsInt=20.7 | INT=95 WILL=63 22.8 | INT=104 WILL=69 24.8 | INT=113 WILL=75 26.9 |
| Gloves | GLOVES | WILL=65 INT=43 Cryo+Elec=19.2% | WILL=71 INT=47 21.1% | WILL=78 INT=51 23.0% | WILL=84 INT=55 24.9% |
| Calibrator | KIT | INT=41 ArtsInt=41.4 | INT=45 45.5 | INT=49 49.7 | INT=53 53.8 |
| Invasion Core | KIT | STUB |
| Probe | KIT | STUB |

### Eternal Xiranite (ETERNAL_XIRANITE) — eternalXiranite.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Armor | ARMOR | WILL=87 INT=58 ArtsInt=20.7 | WILL=95 INT=63 22.8 | WILL=104 INT=69 24.8 | WILL=113 INT=75 26.9 |
| Gloves | GLOVES | INT=65 STR=43 UltGain=20.5% | INT=71 STR=47 22.6% | INT=78 STR=51 24.6% | INT=84 STR=55 26.7% |
| Gloves T1 | GLOVES | INT=65 WILL=43 UltGain=20.5% | INT=71 WILL=47 22.6% | INT=78 WILL=51 24.6% | INT=84 WILL=55 26.7% |
| Auxiliary Arm | KIT | WILL=32 INT=21 UltGain=24.6% | WILL=35 INT=23 27.1% | WILL=38 INT=25 29.6% | WILL=41 INT=27 32.0% |
| Power Core | KIT | INT=32 STR=21 UltGain=24.6% | INT=35 STR=23 27.1% | INT=38 STR=25 29.6% | INT=41 STR=27 32.0% |
| Power Core T1 | KIT | INT=32 WILL=21 TreatBonus=20.7% | INT=35 WILL=23 22.8% | INT=38 WILL=25 24.8% | INT=41 WILL=27 26.9% |

### Aethertech (AETHERTECH) — aethertech.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Plating | ARMOR | STR=87 WILL=58 StaggerDMG=20.7% | STR=95 WILL=63 22.8% | STR=104 WILL=69 24.8% | STR=113 WILL=75 26.9% |
| Gloves | GLOVES | AGI=65 STR=43 ArtsInt=34.5 | AGI=71 STR=47 38.0 | AGI=78 STR=51 41.4 | AGI=84 STR=55 44.9 |
| Analysis Band | KIT | STR=32 WILL=21 PhysDMG=23.0% | STR=35 WILL=23 25.3% | STR=38 WILL=25 27.6% | STR=41 WILL=27 29.9% |
| Stabilizer | KIT | AGI=32 STR=21 ArtsInt=41.4 | AGI=35 STR=23 45.5 | AGI=38 STR=25 49.7 | AGI=41 STR=27 53.8 |
| Visor | KIT | STUB |
| Watch | KIT | STUB |

### MI Security (MI_SECURITY) — miSecurity.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Armor | ARMOR | AGI=87 STR=58 ArtsInt=20.7 | AGI=95 STR=63 22.8 | AGI=104 STR=69 24.8 | AGI=113 STR=75 26.9 |
| Overalls | ARMOR | INT=87 AGI=58 BasicAtkDMG=13.8% | INT=95 AGI=63 15.2% | INT=104 AGI=69 16.6% | INT=113 AGI=75 17.9% |
| Gloves | GLOVES | AGI=65 STR=43 BattleDMG=34.5% | AGI=71 STR=47 38.0% | AGI=78 STR=51 41.4% | AGI=84 STR=55 44.9% |
| Hands PPE | GLOVES | INT=65 AGI=43 BasicAtkDMG=23.0% | INT=71 AGI=47 25.3% | INT=78 AGI=51 27.6% | INT=84 AGI=55 29.9% |
| Armband | KIT | STR=32 WILL=21 Cryo+Elec=23.0% | STR=35 WILL=23 25.3% | STR=38 WILL=25 27.6% | STR=41 WILL=27 29.9% |
| Push Knife | KIT | WILL=32 INT=21 Heat+Nature=23.0% | WILL=35 INT=23 25.3% | WILL=38 INT=25 27.6% | WILL=41 INT=27 29.9% |
| Scope | KIT | AGI=32 STR=21 BattleDMG=41.4% | AGI=35 STR=23 45.5% | AGI=38 STR=25 49.7% | AGI=41 STR=27 53.8% |
| Toolkit | KIT | INT=32 AGI=21 CritRate=10.3% | INT=35 AGI=23 11.4% | INT=38 AGI=25 12.4% | INT=41 AGI=27 13.5% |
| Armor Mod, Overalls Mod/T1/T2, Gloves Mod, Hands PPE Mod/T1, Push Knife Mod/T1, Scope Mod, Toolkit Mod, Visor/Mod | — | STUB |

### Swordmancer (SWORDMANCER) — swordmancer.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Heavy Armor | ARMOR | AGI=87 STR=58 ArtsInt=20.7 | AGI=95 STR=63 22.8 | AGI=104 STR=69 24.8 | AGI=113 STR=75 26.9 |
| Tac Fists | GLOVES | AGI=65 STR=43 UltDMG=43.1% | AGI=71 STR=47 47.4% | AGI=78 STR=51 51.7% | AGI=84 STR=55 56.1% |
| Flint | KIT | AGI=32 STR=21 PhysDMG=23.0% | AGI=35 STR=23 25.3% | AGI=38 STR=25 27.6% | AGI=41 STR=27 29.9% |
| TAC Gauntlets | GLOVES | STR=65/71/78/84 WILL=43/47/51/55 PhysDMG=19.2%/21.1%/23.0%/24.9% | (wiki-confirmed, codebase STUB) |
| Light Armor, Micro Filter, Nav Beacon | — | STUB |

### Frontiers (FRONTIERS) — frontiers.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Armor | ARMOR | STR=87 INT=58 UltDMG=25.9% | STR=95 INT=63 28.5% | STR=104 INT=69 31.1% | STR=113 INT=75 33.6% |
| Armor T1 | ARMOR | STR=87 AGI=58 BattleDMG=20.7% | STR=95 AGI=63 22.8% | STR=104 AGI=69 24.8% | STR=113 AGI=75 26.9% |
| Armor T2 | ARMOR | AGI=87 INT=58 BattleDMG=20.7% | AGI=95 INT=63 22.8% | AGI=104 INT=69 24.8% | AGI=113 INT=75 26.9% |
| Blight Res Gloves | GLOVES | AGI=65 INT=43 BattleDMG=34.5% | AGI=71 INT=47 38.0% | AGI=78 INT=51 41.4% | AGI=84 INT=55 44.9% |
| Comm | KIT | STR=32 AGI=21 ComboDMG=41.4% | STR=35 AGI=23 45.5% | STR=38 AGI=25 49.7% | STR=41 AGI=27 53.8% |
| Comm T1 | KIT | STR=32 INT=21 Cryo+Elec=23.0% | STR=35 INT=23 25.3% | STR=38 INT=25 27.6% | STR=41 INT=27 29.9% |
| Extra O2 Tube | KIT | AGI=32 INT=21 | AGI=35 INT=23 | AGI=38 INT=25 | AGI=41 INT=27 |
| Armor Mod/T3, Blight Res Mod, Fiber Gloves/Mod, Analyzer/Mod, Comm Mod, O2 Tether/Mod | — | STUB |

### Type 50 Yinglung (TYPE_50_YINGLUNG) — type50Yinglung.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Heavy Armor | ARMOR | STR=87 WILL=58 PhysDMG=11.5% | STR=95 WILL=63 12.7% | STR=104 WILL=69 13.8% | STR=113 WILL=75 14.9% |
| Light Armor | ARMOR | WILL=87 STR=58 SkillDMG=13.8% | WILL=95 STR=63 15.2% | WILL=104 STR=69 16.6% | WILL=113 STR=75 17.9% |
| Gloves | GLOVES | AGI=65 INT=43 ComboDMG=34.5% | AGI=71 INT=47 38.0% | AGI=78 INT=51 41.4% | AGI=84 INT=55 44.9% |
| Knife | KIT | WILL=32 AGI=21 ComboDMG=41.4% | WILL=35 AGI=23 45.5% | WILL=38 AGI=25 49.7% | WILL=41 AGI=27 53.8% |
| Radar | KIT | STR=32 WILL=21 PhysDMG=23.0% | STR=35 WILL=23 25.3% | STR=38 WILL=25 27.6% | STR=41 WILL=27 29.9% |
| Gloves T1, Knife T1 | — | STUB |

### Tide Surge (TIDE_SURGE) — tideSurge.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Light Armor | ARMOR | INT=87 STR=58 UltGain=12.3% | INT=95 STR=63 13.6% | INT=104 STR=69 14.8% | INT=113 STR=75 16.0% |
| Gauntlets | GLOVES | STR=65 WILL=43 Cryo+Elec=19.2% | STR=71 WILL=47 21.1% | STR=78 WILL=51 23.0% | STR=84 WILL=55 24.9% |

### LYNX (LYNX) — lynx.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Cuirass | ARMOR | WILL=87 INT=58 TreatBonus=10.3% | WILL=95 INT=63 11.4% | WILL=104 INT=69 12.4% | WILL=113 INT=75 13.5% |
| Heavy Armor | ARMOR | STR=87/95/104/113 WILL=58/63/69/75 TreatBonus=10.3%/11.4%/12.4%/13.5% | (wiki-confirmed, codebase STUB) |
| Gauntlets | GLOVES | WILL=65 STR=43 TreatBonus=17.2% | WILL=71 STR=47 19.0% | WILL=78 STR=51 20.7% | WILL=84 STR=55 22.4% |
| Gloves | GLOVES | STR=65/71/78/84 WILL=43/47/51/55 UltGain=20.5%/22.6%/24.6%/26.7% | (wiki-confirmed, codebase STUB) |
| Aegis Injector | KIT | WILL=41/45/49/53 TreatBonus=20.7%/22.8%/24.8%/26.9% | (wiki-confirmed, codebase STUB) |
| Connector | KIT | STR=32 WILL=21 DMGReduction=17.1% | STR=35 WILL=23 18.5% | STR=38 WILL=25 19.9% | STR=41 WILL=27 21.2% |
| Slab | KIT | WILL=32/35/38/41 INT=21/23/25/27 MainAttrBonus=20.7%/22.8%/24.8%/26.9% | (wiki-confirmed, codebase STUB) |
| Cuirass Mod, Gloves Mod, Aegis Injector Mod, Connector Mod/T1, Slab Mod | — | STUB |

### Redeemer (NONE — no set bonus) — redeemer.ts
| Piece | Slot | R1 | R2 | R3 | R4 |
|-------|------|----|----|----|-----|
| Seal | KIT | INT=43 UltGain=25.7% | INT=47 28.3% | INT=51 30.9% | INT=55 33.4% |
| Seal T1 | KIT | WILL=43 CritRate=10.8% | WILL=47 11.9% | WILL=51 13.0% | WILL=55 14.0% |
| Tag | KIT | STR=43 DMGReduction=17.8% | STR=47 19.2% | STR=51 20.6% | STR=55 21.9% |
| Tag T1 | KIT | AGI=43 ComboDMG=43.2% | AGI=47 47.5% | AGI=51 51.8% | AGI=55 56.2% |

## Partially Implemented (Rank 1 Only)

### AIC Heavy (AIC_HEAVY) — aic.ts
- Heavy Armor: ARMOR — STR=30 AGI=30 DMGReduction=3.9%
- Gauntlets: GLOVES — STR=23 WILL=23 DMGReduction=6.3%
- Alloy Plate: KIT — AGI=16 DMGReduction=7.5%
- Heavy Plate: KIT — STR=16 DMGReduction=7.5%

### AIC Light (AIC_LIGHT) — aic.ts
- Light Armor: ARMOR — INT=30 WILL=30 BattleDMG=8.1%
- Tactical Gloves: GLOVES — INT=23 AGI=23 ComboDMG=13.5%
- Ceramic Plate: KIT — WILL=16 BattleDMG=16.2%
- Light Plate: KIT — STUB

### Armored MSGR (ARMORED_MSGR) — armoredMsgr.ts
- Jacket: ARMOR — STR=44 AGI=29 HPBonus=10.5%
- Gloves: GLOVES — STR=33 WILL=22 DMGReduction=8.0%
- Flashlight: KIT — STR=21 HPBonus=21.0%
- Gyro: KIT — STR=21 ATKBonus=10.5%
- All Mod/T1/T2 variants: STUB

### Roving MSGR (ROVING_MSGR) — rovingMsgr.ts
- Jacket: ARMOR — AGI=44 INT=29 ATK=16.2
- Fists: GLOVES — AGI=33 STR=22 PhysDMG=9.7%
- Flashlight: KIT — AGI=21 ComboDMG=21.0%
- Gyro: KIT — AGI=21 ATKBonus=10.5%
- All Mod/T1/T2 variants: STUB

### Mordvolt Insulation (MORDVOLT_INSULATION) — mordvoltInsulation.ts
- Vest: ARMOR — INT=44 STR=29 ATK=16.2
- Gloves: GLOVES — INT=33 WILL=22 ArtsDMG=9.2%
- Battery: KIT — INT=21 CritRate=5.2%
- Wrench: KIT — INT=21 ATKBonus=10.5%
- All Mod/T1/T2 variants: STUB

### Mordvolt Resistant (MORDVOLT_RESISTANT) — mordvoltResistant.ts
- Vest: ARMOR — WILL=44 AGI=29 HPBonus=10.5%
- Gloves: GLOVES — WILL=33 INT=22 TreatBonus=8.8%
- Battery: KIT — WILL=21 TreatBonus=10.5%
- Wrench: KIT — WILL=21 ATKBonus=10.5%
- All Mod/T1 variants: STUB

### Aburrey's Legacy (ABURREY_LEGACY) — aburreyLegacy.ts
- Heavy Armor: ARMOR — STR=61 AGI=41 SkillDMG=9.8%
- Gauntlets: GLOVES — STR=46 WILL=30 StaggerDMG=24.5%
- Auditory Chip: KIT — STR=23 WILL=15 StaggerDMG=29.4%
- Flashlight: KIT — INT=23 STR=15 UltDMG=17.5%
- Sensor Chip: KIT — WILL=23 AGI=15 BattleDMG=29.4%
- UV Lamp: KIT — STR=23 AGI=15 SkillDMG=19.6%
- All T1/Mod variants: STUB

### Catastrophe (CATASTROPHE) — catastrophe.ts
- Heavy Armor: ARMOR — STR=61 INT=41 UltDMG=18.4%
- Gloves: GLOVES — WILL=46 INT=30 ArtsInt=24.5
- Filter: KIT — WILL=23 INT=15 ArtsInt=29.4
- Gauze Cartridge: KIT — STR=23 INT=15 UltDMG=36.8%
- Heavy Armor T1, Gauze Cartridge T1: STUB

## Stat Patterns

### 5-star attribute ranges by rank (R1→R4)
- Armor primary: 87 → 95 → 104 → 113
- Armor secondary: 58 → 63 → 69 → 75
- Gloves primary: 65 → 71 → 78 → 84
- Gloves secondary: 43 → 47 → 51 → 55
- Kit primary (2-stat): 32 → 35 → 38 → 41
- Kit secondary (2-stat): 21 → 23 → 25 → 27
- Kit primary (1-stat): 41 → 45 → 49 → 53

### 4-star attribute ranges (R1 only observed)
- Armor: 44/61, secondary 29/41
- Gloves: 33/46, secondary 22/30
- Kit: 21/23, secondary 15

### Defense values (R1 only, not in statsByRank — base class)
- 5-star Armor: ~56, Gloves: ~42
- 4-star Armor: ~40/28.8, Gloves: ~21.6, Kit: ~10.8/15
