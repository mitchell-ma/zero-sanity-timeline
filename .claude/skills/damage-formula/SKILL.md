---
name: damage-formula
description: Arknights Endfield damage calculation reference. Use when implementing damage formulas, verifying calculation logic, or working with damage multipliers, defense, resistance, reactions, stagger, susceptibility, amplification, or any combat math.
---

# Arknights: Endfield Damage Calculation Reference

Sources: endfield.wiki.gg/wiki/Damage_calculation (authoritative), "Endfield Base Damage Documentation" by 666bj (translated by sten), dated 04/03/2026 (supplementary, may be outdated).

---

## Master Formula

```
Total Damage = Base Attack
  × Critical Hit
  × Damage Bonus
  × Damage Reduction
  × Amplification
  × Weakness
  × Sanctuary
  × Susceptibility
  × Fragility
  × Defense
  × Stagger Frailty
  × Resistance
  × Link
  × Special Multiplier
  × Non-Controlled Operator Damage Reduction
```

All multipliers are independent and multiply together.

---

## 1. Base Attack

```
Base Attack = Damage Multiplier × Attack Power
```

```
Attack Power = [(Operator Base ATK + Weapon Base ATK) × (1 + Percentage Bonus) + Fixed Value Bonus] × (1 + Attribute Bonus)
```

```
Attribute Bonus = Primary Attribute × 0.005 + Secondary Attribute × 0.002
```

- Only integer portion of attributes is used.
- Some equipment provides non-integer ATK values (displayed rounded down).
- Some skills add a flat base damage boost: `Base Damage = Operator ATK × Multiplier% + FlatValue`
- Note: Some damage multipliers on operator profiles are inaccurate (display values, not actual parameters).

---

## 2. Critical Hit

```
Critical Damage = 1 + CritDMG%,  when crit occurs
Critical Damage = 1,              when no crit
```

```
Expected Crit = 1 + CritRate × CritDMG
```

- Operators: base 5% crit rate, 50% crit damage.
- Enemies: base 0% crit rate, 50% crit damage.

---

## 3. Damage Bonus

```
Damage Bonus = 1 + Elemental DMG Bonus + Skill DMG Bonus + Stagger DMG Bonus + Other DMG Bonuses
```

- Additive stacking within this multiplier.
- Elemental types: Physical, Heat, Electric, Cryo, Nature, AEther.
- Skill types: Normal Attack, Battle Skill, Combo Skill, Finisher.
- "All Skill Damage Boost" — wiki does not explicitly specify which skill types it covers. May or may not include normal attacks.
- Plunge attacks and Final Strikes benefit from Normal Attack damage bonuses.
- Stagger DMG Bonus = "Damage Bonus Against Staggered Targets" (distinct from Stagger Frailty).

---

## 4. Damage Reduction

```
Damage Reduction = ∏(1 - Damage Type Reduction)
```

- **Multiplicative** stacking.
- Includes: All Damage Reduction, AEther DMG Reduction, Physical DMG Reduction, etc.
- Example: Two 12.6% reductions → actual = 1 - (1-0.126)×(1-0.126) = 23.0%, not 25.2%.
- Some enemies have type-specific reductions (e.g., Tidewalker Statue: 50% reduced non-Combustion, 30% increased Combustion).

---

## 5. Amplification

```
Amplification = 1 + Σ Amplification Effects
```

- **Additive** stacking.
- Element-specific damage output boost for the caster.
- Sources: Xaihi ultimate, Antal battle skill and ultimate.
- Distinct from Damage Bonus.

---

## 6. Weakness

```
Weakness = ∏(1 - Weakness Effect)
```

- **Multiplicative** stacking.
- Reduces target's damage output.
- Very rare — currently only Catcher's ultimate provides this.

---

## 7. Sanctuary (Protection)

```
Sanctuary = 1 - max(Sanctuary Effect)
```

- Only the **strongest** effect applies (not additive, not multiplicative — max only).
- Reduces all damage taken, type-independent.
- Sources: Snowshine battle skill, Catcher battle skill (90% Protection value).
- Cannot achieve complete immunity.

---

## 8. Susceptibility

```
Susceptibility = 1 + Σ Susceptibility Effects
```

- **Additive** stacking.
- Increases damage taken from specific elements.
- Sources:
  - Antal battle skill
  - Ardelia battle skill (Physical + Arts Susceptibility, 12-20% by rank)
  - Gilberta ultimate (Arts Susceptibility scaling with Vulnerability stacks)
  - Lifeng battle skill (Physical Susceptibility)
  - Estella combo skill
  - Last Rite talent [Hypothermia] (Cryo Susceptibility = consumed stacks × 2%/4%)
- Susceptibility amplification (e.g., Last Rite's Cycle Protocol) only buffs its specific type.

---

## 9. Fragility (Increased DMG Taken)

```
Fragility = 1 + Σ Fragility Effects
```

- **Additive** stacking.
- "Increased damage taken" or "take damage dealt +X%" — NOT labeled as Susceptibility.
- Sources:
  - Electrification (Arts Fragility from arts reaction)
  - Breach (Physical Fragility from physical reaction)
  - Xaihi talent [Execute Process] (Cryo Fragility, 7%/10%)
  - Endministrator talent [Realspace Stasis] (Physical Fragility, 10%/20%)

---

## 10. Defense

```
Defense Multiplier = 100 / (DEF + 100),    when DEF ≥ 0
Defense Multiplier = 2 - 0.99^(-DEF),      when DEF < 0
```

- Operators: base DEF = 0.
- Enemies: base DEF = 100 (does not scale with level). Default effective = 0.5 (50% reduction).
- Operator DEF comes from equipment primary stats.
- True damage ignores defense (multiplier = 1).

```
Operator's Damage Reduction from DEF = DEF / (DEF + 100)
```

### Non-integer DEF from equipment

| Equip Level | Type   | Displayed | Actual |
|-------------|--------|-----------|--------|
| Lvl 28      | Armor  | 22        | 22.4   |
| Lvl 28      | Glove  | 16        | 16.8   |
| Lvl 28      | Kit    | 8         | 8.4    |
| Lvl 36      | Armor  | 28        | 28.8   |
| Lvl 36      | Glove  | 21        | 21.6   |
| Lvl 36      | Kit    | 10        | 10.8   |

---

## 11. Stagger Frailty

```
Stagger Frailty = 1.3,  when target is staggered
Stagger Frailty = 1,    when target is not staggered or has no stagger parameter
```

- All enemies currently have a Stagger Frailty Coefficient of 1.3 (30%).
- Distinct from "Stagger Damage Bonus" in section 3.

### Finisher Multiplier (first attack after stagger)

| Enemy Tier    | Multiplier |
|---------------|------------|
| Common        | 1.0        |
| Advanced      | 1.25       |
| Elite / Alpha | 1.5        |
| Boss          | 1.75       |

---

## 12. Resistance

```
Resistance Multiplier = 1 - Resistance/100 + Ignored Resistance/100
```

### Operator Resistance (from attributes)

```
Physical Resistance = 100 - 100 / (0.001 × Agility + 1)
Arts Resistance     = 100 - 100 / (0.001 × Intellect + 1)
```

- Only integer portion of Agility/Intellect used.
- Minimum resistance multiplier = 0.1 (operators cannot become fully immune).

### Enemy Resistance Tiers

| Tier | Resistance Points |
|------|-------------------|
| D    | 0                 |
| C    | 20 (sometimes 30) |
| B    | 50                |

- AEther resistance defaults to 0.
- Corrosion (arts reaction) reduces enemy Arts Resistance.
- Laevatain talent [Scorching Heart] ignores Heat Resistance — can go negative (e.g., 0 resistance + 20 ignored = effectively -20, dealing 20% MORE damage). Stacks with Corrosion.

---

## 13. Link Multiplier

```
Link Damage Boost = 1 + Link Bonus
```

| Stacks | Battle Skill Boost | Ultimate Boost |
|--------|-------------------|----------------|
| 1      | 30%               | 20%            |
| 2      | 45%               | 30%            |
| 3      | 60%               | 40%            |
| 4      | 75%               | 50%            |

- Max 4 stacks.
- Consumed on next Battle Skill or Ultimate.
- Sources: Lifeng Link Skill talent, Akekuri ultimate (with talent [Staying in the Zone]).
- Fluorite's ultimate self-buff is NOT Link.

---

## 14. Non-Controlled Operator Damage Reduction

```
Non-Controlled Reduction = 1,      for most attacks
Non-Controlled Reduction = Coeff,  for specific powerful enemy attacks
```

- Coefficient values: 0, 0.01, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7.
- Primarily from elite/boss enemies.

---

## 15. Special Multiplier

- Catch-all for unique effects that multiply independently.
- Examples: Bonekrusher Vanguard 90% DR while shielded, Prism-connected enemies 80% DR.

---

## Arts Reaction / Physical Status Damage

These have their own base damage formulas separate from skill damage.

### Physical Status Activation

Physical statuses require **Vulnerable** (a physical infliction) as a prerequisite:

| Status      | Prerequisite | Effect |
|-------------|-------------|--------|
| **Lift**       | Enemy must already have Vulnerable | Consumes Vulnerable, applies Lift (1s RESET), deals 120% ATK Physical DMG |
| **Knock Down** | Enemy must already have Vulnerable | Consumes Vulnerable, applies Knock Down (1s RESET), deals 120% ATK Physical DMG |
| **Breach**     | None (always applies) | Applies Breach, deals 50% ATK + 50% ATK per Vulnerable stack |
| **Crush**      | None (always applies) | Applies Crush, deals 150% ATK + 150% ATK per Vulnerable stack |

**APPLY LIFT / KNOCK_DOWN always adds 1 Vulnerable stack**, regardless of whether Lift/Knock Down triggers. The status itself only triggers if Vulnerable **already existed** before the current hit (or `isForced` is set). This means:
- First APPLY LIFT on a clean enemy → only adds Vulnerable, no Lift
- Second APPLY LIFT → finds existing Vulnerable → creates Lift + adds another Vulnerable
- Rotation implication: the first skill applies Vulnerable, the second skill gets the Lift

### Physical Status Base Multipliers

| Status      | Multiplier                         |
|-------------|-------------------------------------|
| Lift        | 120% ATK                           |
| Knock Down  | 120% ATK                           |
| Crush       | 150% ATK + 150% ATK per Vuln stack |
| Breach      | 50% ATK + 50% ATK per Vuln stack   |

### Arts Reaction Base Multipliers

| Reaction        | Multiplier                             |
|-----------------|----------------------------------------|
| Arts Burst      | 160% ATK                              |
| Arts Reaction   | 80% ATK + 80% ATK per infliction stack |
| Shatter         | 120% ATK + 120% ATK per Status Level  |
| Combustion DoT  | 12% ATK + 12% ATK per Status Level    |

### Hidden Level Multipliers

```
Physical Status Hidden Multiplier = 1 + (Operator Level - 139) / 2
Arts Burst/Reaction Hidden Multiplier = 1 + (Operator Level - 119) / 6
```

Note: At the baseline levels (139 for physical, 119 for arts), the hidden multiplier equals exactly 1.0.

### Arts Intensity

```
Arts Intensity Multiplier = 1 + Arts Intensity / 100
```

---

## Damage Types

Eight damage types total:
1. Physical
2. Heat (Arts)
3. Electric (Arts)
4. Cryo (Arts)
5. Nature (Arts)
6. AEther
7. True (ignores DEF)
8. (Composite — synthesizes elemental resistances)

Arts Damage is the umbrella for Heat, Electric, Cryo, Nature subtypes.
