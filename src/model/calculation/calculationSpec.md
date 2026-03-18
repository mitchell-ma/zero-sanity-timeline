# Calculation Specification

Defines the formulas and rounding rules used for stat aggregation and damage calculation. All values flow at full precision through the model and controller layers. Rounding only occurs where the game engine is known to truncate, or at the view layer for display.

---

## Rounding Rules

| Context | Rule | Rationale |
|---------|------|-----------|
| Frame counts (seconds → frames) | `Math.round(seconds * 120)` | Frames are integers by definition |
| Number of stacks, uses, enemies | Integer context — round as appropriate | Discrete counts |
| Stat values (ATK, INT, STR, etc.) | **No rounding** — full precision | Preserve accuracy through the pipeline |
| Effective attributes for ATK formula | `Math.floor(raw)` | Game floors individual attributes before ATK bonus — verified: game shows INT 720 from 720.985 |
| Effective ATK | Round up if fractional ≥ 0.7, else floor | Experimentally determined — see Rounding Experiments below |
| Weapon base ATK interpolation | **No rounding** — full precision | Intermediate value |
| Operator base stats from JSON | **No rounding** — use raw values | JSON contains exact game-extracted values |
| Display in view layer | `.toFixed(2)` for stats, percentages | View-only formatting |

---

## Stat Aggregation

Stats are aggregated from multiple sources in order. Each source adds to the running total with full precision. Sources are tracked for UI breakdown display.

### Sources (in application order)

1. **Operator base stats** — from `allLevels[level].attributes` in operator JSON. Raw values, no rounding.
2. **Potential stat bonuses** — cumulative from P1 through current potential level.
3. **Attribute increase** — from the operator's attribute increase talent. Cumulative values: `[0, 10, 25, 40, 60]` for levels 0–4.
4. **Weapon skill stat boosts** — from weapon skill level tables (e.g. `INTELLECT_BOOST_L` at level 9 = +156 INTELLECT).
5. **Weapon passive stats** — from named weapon skills' always-active stats (e.g. `HEAT_DAMAGE_BONUS`).
6. **Weapon secondary attribute bonus** — some weapon skills grant percentage bonus to the operator's secondary attribute.
7. **Gear piece stats** — from each equipped gear piece at its configured rank (1–4). Uses `allLevels[rank]` from gear JSON.
8. **Gear set passive stats** — active when 3+ pieces share the same `gearSetType`.
9. **Consumable (food) stats** — flat stat additions from equipped food.
10. **Tactical stats** — flat stat additions from equipped tactical item.

### Stat Record

All stats are stored in a single `Record<StatType, number>` with full precision. No intermediate rounding.

---

## Attack Calculation

```
BaseATK = OperatorBaseATK + WeaponBaseATK
ATKBonus = BaseATK × ATK_BONUS%
BasicTotal = BaseATK + ATKBonus + FlatBonuses
```

### Attribute Bonus

Individual effective attributes are **floored** before computing the ATK bonus. This is a verified game mechanic — the game displays floored values (e.g. INT 720 from raw 720.985).

```
EffectiveMainAttr = floor(RawMainAttr × (1 + MainAttr_BONUS%))
EffectiveSecAttr  = floor(RawSecAttr  × (1 + SecAttr_BONUS%))

MainAttrBonus = 0.005 × EffectiveMainAttr
SecAttrBonus  = 0.002 × EffectiveSecAttr
AttributeBonus = 1 + MainAttrBonus + SecAttrBonus
```

### Effective Attack

Effective ATK is rounded using a threshold: if the fractional part ≥ 0.7, round up; otherwise floor. This was experimentally determined (see Rounding Experiments below).

```
RawEffATK = BasicTotal × AttributeBonus
EffectiveATK = (frac(RawEffATK) >= 0.7) ? ceil(RawEffATK) : floor(RawEffATK)
```

### Verified Example: Laevatain (maxed)

Loadout: Lv90, P5, all skills Lv12, Forgeborn Scathe Lv90 (skills Lv9), Tide Fall Light Armor R4, Hot Work Gauntlets R4, Redeemer Seal R4 ×2.

| Stat | Value | Source Breakdown |
|------|-------|------------------|
| Operator Base ATK | 318 | From lv90 JSON |
| Weapon Base ATK | 510 | Forgeborn Scathe lv90 |
| **Base ATK** | **828** | 318 + 510 |
| ATK_BONUS% | 39.00% | Weapon Skill 2 (ATTACK_BOOST_L lv9) |
| ATK Bonus (flat) | 322.92 | 828 × 0.39 |
| **Basic Total** | **1150.92** | 828 + 322.92 |

| Attribute | Raw Total | Sources | Floored |
|-----------|-----------|---------|---------|
| INTELLECT (main) | 720.985 | Op(177.985) + P2(20) + AttrInc(60) + WpnSkill(156) + Gear(113+84+55+55) | 720 |
| STRENGTH (sec) | 251.374 | Op(121.374) + Gear(75+55) | 251 |
| AGILITY | 99.973 | Op(99.973) | — |
| WILL | 89.814 | Op(89.814) | — |

| ATK Component | Value |
|---------------|-------|
| ATK bonus from Intellect | 0.005 × 720 = 360.0% |
| ATK bonus from Strength | 0.002 × 251 = 50.2% |
| **Total Attribute Bonus** | **410.2%** |
| Raw Effective ATK | 1150.92 × 5.102 = 5871.994 |
| **Effective ATK** | **5872** (frac 0.994 ≥ 0.7 → ceil) |

Game shows: ATK 5872, Intellect 720, Strength 251. ✓

---

## Damage Formula

```
Damage = EffectiveATK
       × SkillMultiplier
       × MultiplierGroup
       × (1 - Resistance)
       × (1 + Fragility)
       × Susceptibility
       × (1 - Weaken)
       × (1 - DmgReduction)
       × (1 - Protection)
       × AmpBonus
       × LinkBonus
       × StaggerBonus
```

### Multiplier Group (additive within)

```
MultiplierGroup = 1 + ElementDMG% + SkillTypeDMG% + SkillDMG% + ArtsDMG% + StaggerDMG%
```

Where:
- `ElementDMG%` — e.g. `HEAT_DAMAGE_BONUS`
- `SkillTypeDMG%` — e.g. `BASIC_ATTACK_DAMAGE_BONUS`, `BATTLE_SKILL_DAMAGE_BONUS`
- `SkillDMG%` — generic `SKILL_DAMAGE_BONUS`
- `ArtsDMG%` — `ARTS_DAMAGE_BONUS`
- `StaggerDMG%` — `STAGGER_DAMAGE_BONUS` (only when target is staggered)

### Resistance

```
Resistance = max(0, EnemyResistance - ResistanceReduction)
```

Where `ResistanceReduction` comes from Corrosion, Scorching Heart, etc.

### Fragility

```
Fragility = ArtsFragility + PhysicalFragility
```

Additive. Sources: Electrification (arts), Breach (physical+arts).

### Susceptibility

```
Susceptibility = 1 + ElementSusceptibility
```

From Focus, gear effects, etc. Element-specific.

### Stagger Bonus

```
StaggerBonus = 1 + StaggerDMG%   (when enemy is staggered)
StaggerBonus = 1                  (otherwise)
```

### Link Bonus

```
LinkBonus = 1 + LinkValue   (when Link status is active)
LinkBonus = 1               (otherwise)
```

### Amp Bonus

```
AmpBonus = 1 + AmpValue   (when Arts Amp is active)
AmpBonus = 1              (otherwise)
```

---

## Arts Reactions

### Trigger

Arts reactions trigger when an incoming infliction of element B finds active inflictions of a different element A on the enemy. The reaction type is determined by the **incoming** element:

| Incoming Element | Reaction |
|------------------|----------|
| Heat | Combustion |
| Cryo | Solidification |
| Nature | Corrosion |
| Electric | Electrification |

### Status Level

```
StatusLevel = min(ActiveOtherElementInflictionCount, 2)
```

Capped at 2 for auto-derived reactions. Higher levels may come from forced reactions or special abilities.

### Consumption

When a reaction triggers:
1. The **incoming** infliction is removed entirely.
2. **All active other-element** inflictions are consumed (clamped at the reaction frame).
3. **All active same-element** inflictions (of the incoming type) are also consumed.

### Verified Examples

| Scenario | Result |
|----------|--------|
| 1 Heat + 1 Nature (incoming) | Corrosion Lv.1 |
| 2 Heat + 1 Nature (incoming) | Corrosion Lv.2 |
| 4 Heat + 1 Nature (incoming) | Corrosion Lv.2 (capped) |

---

## Defense

```
Defense = sum(GearPiece.defense for each equipped piece)
FinalDMGReduction = Defense / (Defense + 240)
```

### Verified Example

Defense = 56 + 42 + 21 + 21 = 140
FinalDMGReduction = 140 / (140 + 240) = 36.8% (game shows 58.3% — formula may differ at higher levels)

---

## Weapon Base ATK Interpolation

```
WeaponATK(level) = lv1 + (lv90 - lv1) × (level - 1) / 89
```

No rounding. If `attackByLevel` table exists in weapon JSON, use exact lookup instead.

---

## Operator Base Stat Interpolation

For operators using `baseStats` (lv1/lv90 tables, no `allLevels`):

```
Stat(level) = lv1 + (lv90 - lv1) × (level - 1) / 89
```

No rounding. For operators with `allLevels` JSON, use exact values from the level entry.

---

## Rounding Experiments

Experiments to determine the game's rounding behavior on effective ATK, using Laevatain damage tests with game-observed expected values as ground truth.

### Data Points

| Loadout | Raw effATK | Fractional | Game value | Rule |
|---------|-----------|------------|------------|------|
| Full (Forgeborn Scathe, full gear) | 5871.994 | 0.994 | 5872 | ceil |
| Bare (Tarr 11 lv1, no gear) | 943.697 | 0.697 | 943 | floor |

### Experiments Tried

| Rounding method | Full loadout (37 tests) | Bare loadout (19 tests) | Notes |
|----------------|------------------------|------------------------|-------|
| No rounding (full precision) | ✗ All overshoot by +2 to +8 | ✗ All overshoot | effATK too high |
| `Math.floor(effATK)` | ✗ All undershoot by -1 to -2 | Not tested independently | effATK=5871, game=5872 |
| `Math.round(effATK)` | ✓ (rounds 5871.99→5872) | ✗ (rounds 943.70→944, game=943) | |
| `Math.trunc(effATK)` | ✗ Same as floor for positive | ✗ Same as floor | |
| Ceil if frac ≥ 0.7, else floor | **✓ All 37 pass** | ✗ effATK=944 (943.697→ceil, but game=943) | 0.697 < 0.7 → floor ✓ |
| Ceil if frac ≥ 0.9, else floor | **✓ All 37 pass** | ✗ Same bare failures | Threshold doesn't matter in 0.70–0.99 range |
| Floor attrs with 0.7 rule | ✗ INT 720.985→721, game=720 | ✗ | Attrs must be floored, not rounded |

### Conclusions

1. **Individual attributes are floored** — game displays INT 720 from raw 720.985, STR 251 from 251.374. The 0.7 rounding rule does NOT apply to individual attributes.
2. **Effective ATK uses a threshold-based rounding** — fractional 0.994 rounds up, fractional 0.697 floors down. The exact threshold is between 0.697 and 0.994. Currently using 0.7 as the threshold (any value in 0.70–0.99 produces identical results with current test data).
3. **More data points needed** — only two loadouts tested. Additional loadouts with fractional parts between 0.70 and 0.99 would narrow the threshold further.
4. **Bare loadout tests still fail** — the 19 bare loadout failures are consistently -1 off with effATK=943 (correct). The issue may be in how the multiplier engine resolves bare loadout skill multipliers, not in the rounding.
