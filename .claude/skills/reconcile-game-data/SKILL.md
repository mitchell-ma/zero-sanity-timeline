---
name: reconcile-game-data
description: Reconcile weapon, weapon skill, and weapon status configs — verify effects, conditions, multipliers, and cross-references all match. Use when auditing data integrity, after bulk updates, or when something looks wrong. Also reconciles operator skill/talent/potential/status DSL against wiki descriptions.
---

# Reconcile Game Data

Cross-reference and validate consistency across weapon configs, weapon skills, weapon statuses, and operator configs.

## When to use

- After bulk JSON updates (e.g. DSL migration, value imports from wiki)
- When a weapon effect doesn't seem to be working correctly
- When adding new weapons/operators to verify all layers are consistent
- Periodic audit to catch drift between configs
- **Operator reconciliation**: verify skill/talent/potential/status DSL against wiki descriptions

## Data status protection

Every JSON file under `src/model/game-data/` has a `metadata.dataStatus` field (enum: `RECONCILED`, `PARTIALLY_VERIFIED`, `VERIFIED`). See `DataStatus` in `src/consts/enums.ts`.

**VERIFIED files MUST NOT be modified by the reconciler.** These files have been manually audited against in-game data and wiki sources. Any automated reconciliation pass must skip files where `metadata.dataStatus === "VERIFIED"`.

- **Before writing any JSON file**, read its `metadata.dataStatus`. If it is `VERIFIED`, do NOT write to it — log it as skipped and move on.
- **Report VERIFIED mismatches as INFO, not auto-fix.** If a VERIFIED file appears inconsistent with wiki or other sources, report the discrepancy to the user but do NOT modify the file. The user will decide whether to update it manually.
- **New files default to `RECONCILED`.** When generating skeleton configs for new operators, set `metadata.dataStatus` to `RECONCILED`.
- **Only the user can promote to `VERIFIED`.** Never change a file's `dataStatus` to `VERIFIED` or `PARTIALLY_VERIFIED` unless the user explicitly requests it.

## What to check

### 1. Weapon → Weapon Skill cross-reference

**Files:**
- `src/model/game-data/weapons/weapon-pieces/<weapon>.json` — `skills[]` array of 3 skill IDs
- `src/model/game-data/weapons/weapon-skills/generic-skills.json` — keyed by skill ID
- `src/model/game-data/weapons/weapon-skills/<weapon>-skills.json` — named skill

**Checks:**
- Every weapon's `skills[0]` and `skills[1]` exist as keys in `generic-skills.json`
- Every weapon's `skills[2]` (named skill) has a matching `weapons/weapon-skills/<weapon>-skills.json`
- Named skill's `metadata.originId` matches the weapon's `weaponId`
- No orphan weapon-skill files without a matching weapon

### 2. Weapon Skill → Weapon Status cross-reference

**Files:**
- `src/model/game-data/weapons/weapon-skills/<weapon>-skills.json` — `onTriggerClause[].effects[].objectId`
- `src/model/game-data/weapons/weapon-statuses/<weapon>-statuses.json` — `properties.id`

**Checks:**
- Every `APPLY STATUS` effect in `onTriggerClause` references a status ID that exists in `weapons/weapon-statuses/<weapon>-statuses.json`
- Every weapon status has a matching trigger in the corresponding weapon skill's `onTriggerClause`
- `metadata.originId` matches between skill and status files for the same weapon
- No orphan status files without a matching weapon skill trigger

### 3. Multiplier/value consistency

**Checks:**
- Named skill passive effects (clause with no conditions) have `multiplier` or `value` with `VARY_BY SKILL_LEVEL` and exactly 9 rank values
- Weapon status effects have `value` with `VARY_BY SKILL_LEVEL` and exactly 9 rank values
- Generic skills have `value` with `VARY_BY SKILL_LEVEL` and exactly 9 rank values
- All `values` arrays contain only numbers (no nulls, no strings)
- Duration `values` arrays are non-empty

### 4. DSL structure conformance

**Checks:**
- All `with` blocks in effects only contain allowed keys (`value`, `multiplier`, `modifier`)
- All `WithValue` objects have `verb` (string) and `values` (number array)
- No legacy keys: `valueMin`, `valueMax`, `value` (scalar on WithValue), `allLevels`, `weaponSkillType`, `skillSlot`, `skillCategory`, `target`, `targetDeterminer` (on properties — should be `to`/`toDeterminer`)
- Duration objects have `verb`, `values`, `unit`
- StatusLevel limit objects have `verb`, `values`
- Effects with `to: "ENEMY"` do NOT have `toDeterminer`
- All metadata has `originId` and `dataSources`

### 5. Wiki verification (optional, on request)

**Source:** `https://endfield.wiki.gg/wiki/<Weapon_Name>`

**Checks:**
- Passive stat values at rank 1 and rank 9 match wiki
- Conditional buff values at rank 1 and rank 9 match wiki
- Duration matches wiki
- Trigger condition matches wiki description
- Max stacks matches wiki

## Procedure

1. **Read all weapon JSONs** — build a map of weaponId → skill IDs
2. **Read all weapon-skill JSONs** — build maps of generic skills and named skills
3. **Read all weapon-status JSONs** — build a map of originId → status entries
4. **Filter by dataStatus** — skip all files where `metadata.dataStatus === "VERIFIED"`. Log skipped files as INFO.
5. **Run structural checks** (sections 1-4 above) on non-VERIFIED files only
6. **Report findings** — group by severity:
   - **ERROR**: Missing cross-references, broken links, wrong types
   - **WARNING**: Inconsistent values, missing optional fields, legacy keys
   - **INFO**: Statistics (counts, coverage), VERIFIED files skipped
7. **Discuss** any discrepancies with the user before making changes

## Output format

```
=== Reconciliation Report ===

ERRORS (must fix):
  [weapon-id] description of error

WARNINGS (should fix):
  [weapon-id] description of warning

INFO:
  Weapons: N total, N with named skills, N with statuses
  Generic skills: N
  Named skills: N
  Statuses: N
  Cross-reference coverage: N/N weapons fully linked
```

## Operator Reconciliation

When invoked with an operator name, perform a full audit of the operator's JSON configs against the wiki.

### 7b. Reference operators — learn the DSL patterns first

**Before reconciling any operator**, read the configs of the reference operators to learn how wiki descriptions map to DSL structures. These operators have been fully reconciled and audited:

**Reference operators:** `laevatain`, `gilberta`, `pogranichnik`, `wulfgard`, `antal`

**Step 1: Read reference configs to learn patterns.** For each DSL construct you need to verify or produce, find the matching example in the reference operators:

| DSL Pattern | Reference File | What to learn |
|---|---|---|
| Combo activationWindow (arts infliction trigger) | `wulfgard/skills/combo-skill-frag-grenade-beta.json` | `activationWindow.onTriggerClause`: ANY OPERATOR APPLY INFLICTION ARTS TO ENEMY |
| Combo activationWindow (multi-condition OR) | `antal/skills/combo-skill-emp-test-site.json` | Multiple clause entries = OR; conditions within one entry = AND |
| Combo activationWindow (stagger state trigger) | `akekuri/skills/combo-skill-flash-and-dash.json` | IS NODE_STAGGERED / IS FULL_STAGGERED |
| Combo activationWindow (maxSkills chaining) | `rossi/skills/combo-skill-moment-of-blazing-shadow.json` | `activationWindow.properties.maxSkills: 2` — allows two combo skills per window |
| SP RETURN (conditional refund) | `wulfgard/skills/battle-skill-thermite-tracers-empowered.json` | verb: "RETURN" + VARY_BY POTENTIAL ADD |
| VARY_BY POTENTIAL (ult energy cost) | `laevatain/skills/ultimate-twilight.json` | CONSUME ULTIMATE_ENERGY with 6-entry POTENTIAL array |
| VARY_BY POTENTIAL (damage MULT) | `wulfgard/skills/combo-skill-frag-grenade-beta.json` | operation: "MULT", left: VARY_BY SKILL_LEVEL, right: VARY_BY POTENTIAL |
| VARY_BY POTENTIAL (cooldown ADD) | `akekuri/skills/combo-skill-flash-and-dash.json` | operation: "ADD" on cooldown duration |
| VARY_BY TALENT_LEVEL | `gilberta/talents/talent-messenger-s-song-talent.json` | Talent-level scaling on effects |
| ValueExpression (stack-based) | `gilberta/statuses/status-anomalous-gravity-field.json` | Enemy stacks in ValueStat, ADD/MULT/MIN composition |
| Description-only potential | `laevatain/potentials/potential-4-ice-cream-furnace.json` | properties + metadata only, no clause |
| APPLY SUSCEPTIBILITY | `gilberta/statuses/status-anomalous-gravity-field.json` | objectQualifier + object: SUSCEPTIBILITY, value+unit wrapper |
| APPLY INFLICTION | `wulfgard/skills/battle-skill-thermite-tracers-empowered.json` | object: INFLICTION, objectQualifier: element |
| APPLY physical status | `pogranichnik/skills/combo-skill-full-moon-slash.json` | object: STATUS, objectId: PHYSICAL, objectQualifier: LIFT/BREACH/etc |
| Talent with passive clause | `gilberta/talents/talent-messenger-s-song-talent.json` | clause directly on talent file |
| Talent with trigger | `wulfgard/talents/talent-1-scorching-fangs-minor.json` | onTriggerClause on talent |
| Status with self-referential trigger | `laevatain/statuses/` | onTriggerClause watching own stacks |
| DEAL STAGGER | `pogranichnik/skills/ultimate-shieldguard-banner.json` | verb: DEAL, object: STAGGER, to: ENEMY |
| Healing (RECOVER HP) | `gilberta/talents/talent-late-reply-talent.json` | healBase + stat scaling ValueExpression |
| FIRST_MATCH clauseType | `wulfgard/skills/battle-skill-thermite-tracers-empowered.json` | Mutually exclusive conditional paths |

**Step 2: Map wiki descriptions to DSL by analogy.** When translating a new operator's wiki text:
1. Find the closest wiki description among the reference operators
2. Read how that reference operator's JSON models it
3. Apply the same structural pattern to the new operator's JSON

**Common mistakes caught by this process:**
- Using bare nouns like `"object": "SOLIDIFICATION"` instead of qualifier+noun `"objectQualifier": "SOLIDIFICATION", "object": "REACTION"`
- Using `"object": "PHYSICAL_SUSCEPTIBILITY"` instead of `"objectQualifier": "PHYSICAL", "object": "SUSCEPTIBILITY"`
- Using `"object": "CRYO", "objectType": "INFLICTION"` instead of `"object": "INFLICTION", "objectQualifier": "CRYO"`
- Using `{ "verb": "ADD", "value": [...] }` instead of `{ "operation": "ADD", "left": {...}, "right": {...} }`
- Using `"verb": "CAST"` instead of `"verb": "PERFORM"`
- Using `"multiplier"` instead of `"value"` in DEAL DAMAGE with blocks
- Missing `"to": "ENEMY"` on DEAL STAGGER effects
- Using `"originId": "SOME_STATUS_ID"` instead of the operator's ID on status metadata

### 8. Operator ID conventions

**Potential IDs:** `<OPERATOR>_P<N>_<POTENTIAL_NAME>` (e.g. `WULFGARD_P5_NATURAL_PREDATOR`)
**Talent IDs:** `<OPERATOR>_TALENT<N>_<TALENT_NAME>` (e.g. `WULFGARD_TALENT1_SCORCHING_FANGS`)
**Minor variants:** append `_MINOR` (e.g. `WULFGARD_TALENT1_SCORCHING_FANGS_MINOR`)

**File naming:**
- Potentials: `potential-<N>-<kebab-name>.json` (e.g. `potential-5-natural-predator.json`)
- Talents: `talent-<N>-<kebab-name>.json` (e.g. `talent-1-scorching-fangs.json`)
- Statuses: `status-<kebab-name>.json`

**Checks:**
- All potential/talent/status IDs follow the naming convention
- File names match the kebab-case of the ID
- `metadata.originId` is the operator's uppercase ID (e.g. `WULFGARD`)
- All `eventType` fields are `"STATUS"` (not `"POTENTIAL_EVENT"`)

### 9. VARY_BY POTENTIAL arrays

Potential-indexed arrays must have exactly 6 entries (P0-P5). The discount/change must start at the correct index matching the wiki's potential number.

**Checks:**
- All `VARY_BY POTENTIAL` arrays have exactly 6 entries
- The index where the value changes matches the wiki potential number
- Common exceptions: most operators have ult energy cost reduction at P4, but some (Perlica, Xaihi, Antal, Estella) have it at P2 — verify against wiki

### 10. Skill frame DSL vs wiki description

For each skill (basic, battle, combo, ultimate, empowered variants):

**Checks:**
- Frame effects match the wiki description (damage, stagger, infliction, reaction, status application)
- CONSUME effects are on the correct frame (e.g. reaction consumption should be on the frame that fires the bonus shot, not an earlier frame)
- SP costs/returns use the correct verb: `RECOVER` for natural SP gain, `RETURN` for conditional refund — match the in-game description
- `activationClause` conditions use proper DSL: `ENEMY HAVE REACTION COMBUSTION` not `ENEMY IS COMBUSTED`
- Combo `onTriggerClause` conditions match wiki trigger description (e.g. `ANY OPERATOR APPLY INFLICTION ARTS TO ENEMY`)
- All effects use enum constants, never string literals
- `ValueExpression` uses `{ operation: "ADD", left: ..., right: ... }` not `{ verb: "ADD", value: [...] }`

### 11. Talent/potential trigger ownership and status file placement

**Status files go in `statuses/` or `talents/` directories** — the `operatorStatusesStore` only scans `statuses/` and `talents/` via `require.context`. Files in `potentials/` are NOT loaded by the status/trigger engine.

**Self-referential triggers (status watches its own state):**
- `onTriggerClause` + `clause` belong on the status file in `statuses/`
- The potential file is description-only

**Talent-originated triggers:**
- `onTriggerClause` + `clause` belong on the talent file in `talents/`
- No separate status file needed if the talent IS the status

**Skill-frame effects (talent modifies a skill's behavior):**
- The effect belongs directly on the skill frame as a conditional clause predicate
- Use `potentialMin` or `HAVE POTENTIAL` conditions to gate potential-locked effects
- The talent/potential file is description-only

**Checks:**
- No trigger-bearing files in `potentials/` (won't be loaded by status engine)
- No `MODIFY` verb usage (does not exist in the engine)
- Description-only potentials have no `clause` or `onTriggerClause`
- Status properties use `to`/`toDeterminer` not legacy `target`/`targetDeterminer`
- Status `toDeterminer` is always `THIS` (self-reference) — distribution target is on the APPLY effect, not the status definition

### 5b. DSL value+unit pattern and stat noun hierarchy

**Value + Unit wrapper:**
When a noun has a defined UnitType in `NOUN_UNITS` (e.g. SLOW → PERCENTAGE, SUSCEPTIBILITY → PERCENTAGE), the `with.value` must use the wrapper pattern — the same structure as `duration`:
```json
"value": {
  "value": { "verb": "IS", "value": 0.8 },
  "unit": "PERCENTAGE"
}
```
NOT `{ "verb": "IS", "value": 0.8, "unit": "PERCENTAGE" }` — `unit` is never on the ValueNode itself.

**Stat noun hierarchy:**
`DAMAGE_BONUS`, `AMP`, and `SUSCEPTIBILITY` are all NounTypes AND StatTypes. They each have their own element qualifier mappings in `NOUN_QUALIFIER_MAPPING`. The conceptual hierarchy is:
```
STAT (parent concept)
├── DAMAGE_BONUS → HEAT/CRYO/NATURE/ELECTRIC/PHYSICAL/ARTS + BASIC_ATTACK/BATTLE_SKILL/COMBO_SKILL/ULTIMATE/STAGGER
├── AMP          → HEAT/CRYO/NATURE/ELECTRIC/PHYSICAL/ARTS
└── SUSCEPTIBILITY → HEAT/CRYO/NATURE/ELECTRIC/ARTS
```

`ARTS` is an umbrella qualifier covering all arts elements (HEAT/CRYO/NATURE/ELECTRIC).

In DSL effects, these are used as the `object`:
```json
{ "verb": "APPLY", "objectQualifier": "ARTS", "object": "SUSCEPTIBILITY", "to": "ENEMY" }
{ "verb": "APPLY", "objectQualifier": "ELECTRIC", "object": "AMP", "to": "TEAM" }
{ "verb": "APPLY", "objectQualifier": "HEAT", "object": "DAMAGE_BONUS", "to": "OPERATOR" }
```

**Checks:**
- All SLOW values use `{ value: { verb, value }, unit: "PERCENTAGE" }` wrapper
- All SUSCEPTIBILITY values use the same wrapper pattern
- SUSCEPTIBILITY/AMP/DAMAGE_BONUS effects have an `objectQualifier` (element or skill type)
- `ARTS` qualifier is used for all-arts-element susceptibility/amp, not individual element qualifiers

### 5c. Translating complex wiki descriptions into ValueExpressions

When a wiki description involves multiple scaling factors, conditional bonuses, or potential modifications, use `ValueExpression` trees to compose them. Never split a single computed value into multiple separate effects.

**Strategy: identify the formula components**

1. Read the base description — identify the base value and what it scales with (skill level, stacks, etc.)
2. Read all potential descriptions that modify this value — identify multipliers, additive bonuses, caps
3. Build the expression tree bottom-up: leaf nodes are lookups (VARY_BY SKILL_LEVEL, VARY_BY POTENTIAL, enemy status stacks), inner nodes are operations (ADD, MULT, MIN, MAX)

**Pattern: "increased based on stacks of X"**
```
MULT(
  per_stack_value,
  stack_count
)
```
Where `per_stack_value` is `VARY_BY SKILL_LEVEL [...]` and `stack_count` is a ValueStat resolving the enemy's current stacks.

**Pattern: "potential doubles the per-stack increase"**
```
MULT(
  MULT(
    per_stack_base,                              ← VARY_BY SKILL_LEVEL
    VARY_BY POTENTIAL [1, 1, 2, 2, 2, 2]         ← P2+ doubles
  ),
  stack_count
)
```
Bake potential multipliers into the expression tree using `VARY_BY POTENTIAL` arrays. Don't create separate effects or MODIFY clauses for potential scaling that can be expressed inline.

**Pattern: "treated as having N additional stacks (max M)"**
```
MIN(
  IS M,                                          ← cap
  ADD(
    actual_stacks,                               ← ValueStat of enemy status
    VARY_BY POTENTIAL [0, 0, N, N, N, N]          ← phantom stacks from potential
  )
)
```

**Pattern: "base value + per-stack bonus"**
```
ADD(
  VARY_BY SKILL_LEVEL [...],                     ← base value
  MULT(per_stack_value, capped_stack_count)       ← stack-scaling bonus
)
```

**Referencing enemy status stacks in ValueStat:**
```json
{
  "verb": "IS",
  "objectQualifier": "VULNERABLE",
  "objectId": "INFLICTION",
  "object": "STACKS",
  "ofDeterminer": "THIS",
  "of": "ENEMY"
}
```
The `objectQualifier`/`objectId`/`object` pattern matches status references: qualifier → status adjective, id → status category, object → what to read (STACKS).

**Worked example — Gilberta Anomalous Gravity Field Arts Susceptibility with P2 Wind Walker:**

Wiki base: "Arts Susceptibility further increased based on Vulnerability stacks"
Wiki P2: "double the per-stack increase" + "treat as +1 stack (max 4)"

```
ADD(
  VARY_BY SKILL_LEVEL [0.18×3, 0.22×3, 0.26×3, 0.30×3],     ← base susceptibility
  MULT(
    MULT(
      VARY_BY SKILL_LEVEL [0.018×3, 0.022×3, 0.026×3, 0.030×3], ← per-stack base
      VARY_BY POTENTIAL [1, 1, 2, 2, 2, 2]                       ← P2 doubles
    ),
    MIN(
      IS 4,                                                       ← stack cap
      ADD(
        VULNERABLE INFLICTION STACKS OF ENEMY,                    ← actual stacks
        VARY_BY POTENTIAL [0, 0, 1, 1, 1, 1]                      ← P2 phantom +1
      )
    )
  )
)
```

**Key rules:**
- Always use `VARY_BY POTENTIAL` with 6-entry arrays (P0-P5) to bake potential effects into the expression
- Always use `VARY_BY TALENT_LEVEL` to bake talent-gated effects — use 0 (or 1× for multipliers) at levels where the talent doesn't exist. Never use `IF HAVE TALENT_LEVEL` conditional predicates for gating.
- Use `MIN` to cap values, `MAX` for floors
- When a potential "doubles" something, use `VARY_BY POTENTIAL [1, 1, 2, ...]` as a multiplier — not a separate additive effect
- Prefer one complex ValueExpression over multiple simple effects that the engine would need to combine
- When a talent modifies a skill's behavior (e.g. "hitting 2+ enemies heals"), bake the effect directly into the skill frame using `VARY_BY TALENT_LEVEL [0, value_lv1, value_lv2]` — the 0 at level 0 naturally disables the effect before the talent is unlocked

### 5d. Baking talent effects into skill frames (healing, conditional effects)

When a talent says "skill X improved: when Y happens, do Z", bake the effect directly into the skill frame — don't keep it as a trigger on the talent file. The talent file becomes description-only.

**Strategy:**
1. Add `suppliedParameters` on the skill/frame for user-input values (e.g. `ENEMY_HIT` range 1-2)
2. Add conditional clauses on the skill frame using `VARY_BY TALENT_LEVEL [0, lv1, lv2]` — level 0 produces 0/no-op
3. Use `FIRST_MATCH` clauseType when there are mutually exclusive conditional paths
4. Make the talent file description-only

**Pattern: healing with conditional target redirect (e.g. Gilberta Late Reply)**

Wiki: "Hitting 2+ enemies heals controlled operator. If at max HP, heal lowest-HP teammate instead."

```
Frame clauseType: FIRST_MATCH

  clause[0]: unconditional
    DEAL DAMAGE, DEAL STAGGER, etc. (always fires — FIRST_MATCH skips unconditional clauses)

  clause[1]: ENEMY_HIT GREATER_THAN_EQUAL 2, CONTROLLED OPERATOR HAVE FULL HP
    RECOVER HP TO ANY OPERATOR WITH
      filter { objectQualifier: LOWEST, objectId: HP, object: STAT }
      value ADD(
        VARY_BY TALENT_LEVEL [0, 72, 108] OF THIS OPERATOR,
        MULT(VARY_BY TALENT_LEVEL [0, 0.6, 0.9], ValueStat INTELLECT OF THIS OPERATOR)
      )

  clause[2]: ENEMY_HIT GREATER_THAN_EQUAL 2, CONTROLLED OPERATOR NOT_HAVE FULL HP
    RECOVER HP TO CONTROLLED OPERATOR WITH
      value ADD(
        VARY_BY TALENT_LEVEL [0, 72, 108] OF THIS OPERATOR,
        MULT(VARY_BY TALENT_LEVEL [0, 0.6, 0.9], ValueStat INTELLECT OF THIS OPERATOR)
      )
```

**Key points:**
- `FIRST_MATCH` always executes unconditional clauses (conditions.length === 0), then stops after the first conditional match
- `VARY_BY TALENT_LEVEL` arrays have 3 entries: [level 0 (no talent), level 1, level 2]. Use 0 for level 0 to naturally disable.
- `filter` in `with` block narrows `ANY` determiner target selection (requires `DETERMINER_FILTER_SUPPORT`)
- `FULL` adjective on HP checks max HP state
- `ENEMY_HIT` references a `suppliedParameters` value the user sets when placing the event
- Heal formula uses `ValueStat` to reference operator's INTELLECT (or WILL for other operators)

**Checks:**
- [ ] Talent effects that modify skills are baked into skill frames, talent is description-only
- [ ] `suppliedParameters` declared on skills/frames that need user input (enemy count, etc.)
- [ ] Heal formulas use `VARY_BY TALENT_LEVEL` with 0 at unused levels
- [ ] Conditional target redirect uses `FIRST_MATCH` with mutually exclusive predicates

### 6. Operator status — NORMAL vs MINOR enhancement distinction

When an operator talent/potential applies a buff to **other** operators and the shared version has **weaker potency** than the self-buff, use `EnhancementType.MINOR` with a `_MINOR` suffix to distinguish it.

**Pattern:**
- `ESSENCE_DISINTEGRATION` — full ATK +30% to self → `EnhancementType.NORMAL` (default)
- `ESSENCE_DISINTEGRATION_MINOR` — reduced ATK +15% to all other → `EnhancementType.MINOR`

**Target semantics (do not conflate):**
- `"to": "OPERATOR", "toDeterminer": "ALL"` — applies separate status instances to each individual operator's status column
- `"to": "TEAM"` — applies one shared status to the team-status column (`COMMON_OWNER_ID`)
- `"to": "OPERATOR", "toDeterminer": "ALL_OTHER"` — applies to each operator except the source

**Checks:**
- `_MINOR` suffix is only for statuses with **reduced potency** compared to the self-targeted version — not all shared/team statuses are MINOR
- If the shared version has identical values to the self version, it is NOT MINOR — just a shared application of the same status
- If a trigger clause applies both a self status and a weaker shared status, the shared should use the `_MINOR` suffixed ID

### 7. Operator talent/potential → status trigger ownership

The `onTriggerClause` belongs on the **talent/potential** file when the talent/potential description says it directly applies the effect. The status file holds the status properties and passive effects (`clause`). The talent/potential is the trigger owner; the status is the effect definition.

**When `onTriggerClause` belongs on the status:**
- Self-referential triggers (e.g. BECOME STACKS EXACTLY MAX → apply a derived status). The status watches its own state transitions.

**When `onTriggerClause` belongs on the talent/potential:**
- The talent/potential description says it directly causes the effect (e.g. "After consuming Vulnerability, gain Physical DMG +4%")
- Compound triggers that involve multiple actions (e.g. ALL → CONSUME + APPLY)

**Checks:**
- No duplicate triggers: the same trigger conditions should not appear on both the talent and status files
- If a status has `onTriggerClause`, verify it's a self-referential trigger (watching its own stacks/state), not a talent-originated trigger

### 12. Potential effects baked into skills

**No `MODIFY` verb in configs.** All potential effects MUST be baked directly into the skill/talent/status they modify using `VARY_BY POTENTIAL` ValueExpressions. Potential files are description-only (properties + metadata, no clause).

**Pattern: ult energy cost reduction (e.g. P4 -15%)**
```json
"verb": "CONSUME", "object": "ULTIMATE_ENERGY",
"with": { "value": {
  "operation": "MULT",
  "left": { "verb": "IS", "value": 90 },
  "right": { "verb": "VARY_BY", "object": "POTENTIAL", "value": [1,1,1,1,0.85,0.85], "ofDeterminer": "THIS", "of": "OPERATOR" }
}}
```

**Pattern: cooldown reduction (e.g. P5 -2s)**
```json
"duration": { "value": {
  "operation": "ADD",
  "left": { "verb": "VARY_BY", "object": "SKILL_LEVEL", "value": [...], ... },
  "right": { "verb": "VARY_BY", "object": "POTENTIAL", "value": [0,0,0,0,0,-2], ... }
}, "unit": "SECOND" }
```

**Pattern: damage multiplier modifier (e.g. P5 ×1.3)**
```json
"value": {
  "operation": "MULT",
  "left": { "verb": "VARY_BY", "object": "SKILL_LEVEL", "value": [...], ... },
  "right": { "verb": "VARY_BY", "object": "POTENTIAL", "value": [1,1,1,1,1,1.3], ... }
}
```

**Migration procedure (per operator during reconciliation):**

When reconciling an operator that still has MODIFY clauses in its potentials:

1. **Read each MODIFY clause** — extract `objectId` (target skill), `parameterKey`, `value`, `parameterModifyType`
2. **Fetch the wiki** — confirm what the potential actually does and get the exact values
3. **Find the target** — locate the skill/talent/status JSON that the MODIFY targets
4. **Identify the value to modify** — find the existing `VARY_BY SKILL_LEVEL` array or literal value that the potential augments
5. **Wrap in ValueExpression** — replace the bare value with a `{ operation, left, right }` tree:
   - `MULTIPLICATIVE` → `MULT(existing_value, VARY_BY POTENTIAL [1,...,multiplier,...])`
   - `ADDITIVE` → `ADD(existing_value, VARY_BY POTENTIAL [0,...,addend,...])`
   - `UNIQUE_MULTIPLIER` (flag/override) → context-dependent: may be a conditional predicate with `HAVE POTENTIAL` condition, an additive VARY_BY, or a new clause
6. **Handle talent-targeted MODIFY** — when `objectId` is a `chr_*` talent ID, bake the effect into the talent's `clause` using VARY_BY POTENTIAL on the effect value
7. **Handle flag-type MODIFY** — `UNIQUE_MULTIPLIER` with value `1` is often just a "has this potential" flag. These become `HAVE POTENTIAL >= N` conditions on frame clause predicates (like Wulfgard P3's Hunting Hour)
8. **Strip the MODIFY clause** from the potential file — leave it description-only
9. **Verify** — run tests to confirm the skill/talent behaves the same with the baked-in values

**Common MODIFY types and their ValueExpression translations:**

| MODIFY type | Example | ValueExpression |
|---|---|---|
| `MULTIPLICATIVE` rate ×1.1 | Antal P1: OMA amp ×1.1 | `MULT(VARY_BY SKILL_LEVEL [...], VARY_BY POTENTIAL [1,1.1,...])` |
| `ADDITIVE` +N SP | Arclight P1: BS +10 SP | `ADD(existing_sp, VARY_BY POTENTIAL [0,10,...])` |
| `ADDITIVE` +N% rate | Xaihi P1: BS atk +5% | `ADD(VARY_BY SKILL_LEVEL [...], VARY_BY POTENTIAL [0,0.05,...])` |
| `MULTIPLICATIVE` dmg ×1.3 | Chen Qianyu P3: all skills ×1.1 | `MULT(VARY_BY SKILL_LEVEL [...], VARY_BY POTENTIAL [1,1,1,1.1,...])` on each frame |
| `UNIQUE_MULTIPLIER` flag=1 | Pogranichnik P1: has_potential1 | `HAVE POTENTIAL >= 1` condition on frame predicate |
| `UNIQUE_MULTIPLIER` duration=N | Catcher P3: combo +5s | `ADD(VARY_BY SKILL_LEVEL [...], VARY_BY POTENTIAL [0,0,0,5,...])` on cooldown segment |
| `ADDITIVE` talent_value | Lifeng P3: talent atk +0.05% | `ADD(VARY_BY TALENT_LEVEL [...], VARY_BY POTENTIAL [0,0,0,0.0005,...])` on talent clause |

**Checks:**
- No `"verb": "MODIFY"` anywhere in operator JSON configs (after migration)
- No `APPLY BUFF` with orphan objectIds (no matching status file)
- All potential files are description-only (properties + metadata only)
- Every potential's effect is traceable to a `VARY_BY POTENTIAL` array in the corresponding skill/talent/status

### 13. Self-referential talent/status merge

When a talent IS the status effect (passive buff, no trigger), the clause belongs on the talent file — not a separate status file.

**Test:** If the talent file has no `onTriggerClause` and no `clause` (only properties + metadata), AND a matching status file has the clause with the same effect as the talent description → merge the status clause into the talent file and delete the status file.

**Merge procedure:**
1. Copy `clause` and `clauseType` from status into talent
2. Update talent `to`/`toDeterminer` from status if scope differs (e.g. status targets ALL but talent says THIS)
3. Copy `stacks` and `duration` from status properties if present
4. Merge `dataSources` arrays (deduplicate)
5. Keep talent's `properties.id`, `name`, `eventCategoryType` (TALENT), `metadata.icon`
6. Delete the status file

**Do NOT merge when:**
- The talent has a trigger (`onTriggerClause`) that PRODUCES the status — they are separate entities
- The status has self-referential triggers (watches its own stacks/state)
- The status has a different name from the talent (e.g. "The Living Banner" talent → "Fervent Morale" status)

### 14. Thorough wiki cross-reference checklist

When reconciling an operator, systematically verify EVERY item:

**Skills:**
- [ ] Each skill has `element` on top-level properties (Nature, Heat, etc.)
- [ ] Each segment has `element` on properties
- [ ] Damage multipliers summed across frames match wiki display totals per rank
- [ ] Stagger values match wiki
- [ ] SP costs match wiki (CONSUME SKILL_POINT on battle skills)
- [ ] Cooldowns match wiki per rank (VARY_BY SKILL_LEVEL if they change at rank 12)
- [ ] Ultimate energy cost matches wiki (with P4 reduction baked in)
- [ ] Ultimate energy recovery on combo matches wiki
- [ ] Infliction stacks and elements match wiki
- [ ] Status applications match wiki (LIFT, KNOCK_DOWN, SLOW, etc.)
- [ ] Finisher has RECOVER SKILL_POINT (check Warfarin `power_attack` blackboard for `atb` value; value varies per operator)
- [ ] Combo trigger matches wiki description — use umbrella qualifiers (`ARTS REACTION`) instead of enumerating individual reactions when wiki says "any Arts Reaction"

**Talents:**
- [ ] Values match wiki per talent level (2 entries for VARY_BY TALENT_LEVEL)
- [ ] Target scope matches wiki (ALL operators, THIS operator, CONTROLLED operator, ENEMY)
- [ ] Target class filters match wiki (GUARD, CASTER, SUPPORTER, etc.)
- [ ] Trigger conditions match wiki exactly (which skills, hit thresholds, etc.)
- [ ] Healing formulas match wiki (healBase + intellectAdditive/willAdditive)

**Potentials:**
- [ ] All description-only (no clause, no onTriggerClause)
- [ ] Every effect traceable to a VARY_BY POTENTIAL in the corresponding skill/talent/status
- [ ] VARY_BY POTENTIAL arrays have exactly 6 entries
- [ ] Effect starts at correct potential index (P1=index 1, P2=index 2, etc.)

### 15. Supplied parameters (user-input runtime values)

Skills can declare `suppliedParameters` — values the user supplies when placing events (e.g. "how many enemies hit?"). The engine resolves these at runtime as `VARY_BY` dimensions.

**Structure** (on skill properties, segment properties, or frame properties):
```json
"suppliedParameters": {
  "VARY_BY": [
    {
      "id": "ENEMY_HIT",
      "name": "Enemies Hit",
      "lowerRange": 1,
      "upperRange": 2,
      "default": 1
    }
  ]
}
```

- `id`: the parameter ID, referenced by `VARY_BY` in ValueVariables and trigger conditions
- `name`: display label for the UI
- `lowerRange`/`upperRange`: valid range (inclusive)
- `default`: initial value when the event is placed

**Usage in conditions** (e.g. Late Reply talent trigger — heal fires when 2+ enemies hit):
```json
{
  "subject": "PARAMETER",
  "verb": "GREATER_THAN_EQUAL",
  "object": "ENEMY_HIT",
  "with": { "value": { "verb": "IS", "value": 2 } }
}
```

**Checks:**
- [ ] Skills with enemy-count-dependent effects have `suppliedParameters` with `ENEMY_HIT`
- [ ] Talents with hit thresholds (e.g. "hitting at least 2 enemies") reference the supplied parameter in their trigger condition
- [ ] `lowerRange`/`upperRange` match the meaningful range for the mechanic

**Statuses:**
- [ ] Only exist for non-self-referential effects (trigger-produced statuses)
- [ ] `originId` points to the skill/talent that creates them
- [ ] Duration, stacks, interactionType match wiki
- [ ] Clause effects match wiki status description

## Operator reconciliation procedure

1. **Check dataStatus** — read `metadata.dataStatus` on the operator's main JSON. If `VERIFIED`, skip all writes for this operator's files and report findings as INFO only. Proceed with read-only audit.
2. **Read all operator JSONs** — `operators/<operator>/` directory: main json, skills, talents, potentials, statuses
3. **Fetch wiki** — `https://endfield.wiki.gg/wiki/<Operator_Name>` — extract EVERY skill/talent/potential description with ALL per-rank values
3. **Map the interaction chain** — trace the complete cause→effect chain from wiki descriptions (e.g. "Heat Infliction → Combustion → Scorching Fangs → Empowered BS → Code of Restraint SP return → P3 SF refresh")
4. **Cross-reference every value** — run the checklist from section 14 above, checking each item systematically
5. **Verify IDs** — all potential/talent/status IDs follow `<OPERATOR>_P<N>_<NAME>` / `<OPERATOR>_TALENT<N>_<NAME>` convention
6. **Verify potential baking** — all potentials are description-only, effects baked into skills via VARY_BY POTENTIAL (section 12)
7. **Verify self-referential merges** — no orphan status files for passive talents (section 13)
8. **Verify trigger ownership** — triggers in correct files (`statuses/` or `talents/`, never `potentials/`)
9. **Verify activation clauses** — empowered variants have `activationClause` matching wiki conditions. No hardcoded stack-scan fallback; activation is purely data-driven.
10. **Write integration tests** — cover each link in the interaction chain (see strategy below)
11. **Report and fix** — group by severity, discuss before making changes. **Never write to VERIFIED files.**

## Integration test strategy

**Load the `add-integration-test` skill before writing any integration tests.** It contains the full guide for structure, helpers, rules, and examples.

### What to test per operator

- **Skill placement** — each skill type places correctly with expected segments/duration
- **Infliction/reaction pipeline** — skills produce correct element on enemy, forced reactions appear
- **Combo triggers** — exact trigger condition (own vs teammate infliction, specific element)
- **Empowered activation** — disabled when conditions unmet, enabled when met, irrelevant statuses don't enable
- **Talents** — trigger from correct source, correct duration/stacks/statusValue, RESET vs STACK
- **Potentials** — test at N-1 (should NOT fire) and N (should fire)
- **Cross-mechanic chains** — full rotation exercising the complete interaction chain
- **Mutual exclusivity** — normal vs empowered variant differences
- **Consume priority** — correct target consumed when multiple valid targets exist

## Operator skill skeleton generation (new operators)

When adding a new operator, use the skeleton parser to generate initial skill configs from game data dumps before manually authoring the DSL layer.

### Data sources

| Source | Location | What it provides |
|--------|----------|-----------------|
| **Warfarin API** | `https://api.warfarin.wiki/v1/en/operators/<slug>` | Per-level multiplier tables (`atk_scale` × 12 levels), hit counts (`display_atk_scale / atk_scale`), stagger (`poise`, `poise_extra`), SP recovery (`atb`), UE gain (`extra_usp`, `usp_N_display`), skill costs (`costType`/`costValue`), effect durations, MF/stack thresholds (`count`), skill labels, and descriptions |
| **SkillData dump** | `.claude-adhoc/SkillData/` | Per-frame timing: segment durations (`AllowNextSkillAction` start), damage frame offsets (`DamageAction`/`ChannelingAction`/`LaunchProjectile` trigger frames), entity spawn timing (`SpawnAbilityEntity`), infliction types (`SpellInfliction.inflictionType`), and flow control (`JumpToAction`, `FinishOwnerAction`, `CheckBuffStackNum`) |
| **endfield.wiki.gg** | `https://endfield.wiki.gg/wiki/<Operator_Name>` | Human-readable skill descriptions for DSL authoring, sanity check on values |

### Skeleton parser

**Script:** `src/model/utils/parsers/parseSkillData.py`

**Usage:**
```bash
# Fetch Warfarin data
curl -s 'https://api.warfarin.wiki/v1/en/operators/<slug>' -H 'User-Agent: Mozilla/5.0' -o /tmp/<slug>_warfarin.json

# Run parser
python3 src/model/utils/parsers/parseSkillData.py \
  --warfarin /tmp/<slug>_warfarin.json \
  --skilldata .claude-secrets/SkillData \
  --prefix <char_prefix> \
  --operator <OPERATOR_ID> \
  --element <ELEMENT> \
  [--compare src/model/game-data/operators/<slug>/skills] \
  [--output /tmp/<slug>_skeleton]
```

### What the skeleton auto-generates

| Field | Source | Accuracy |
|-------|--------|----------|
| Segment count | SkillData (1 file per BA segment) | Exact |
| Segment duration | SkillData `AllowNextSkillAction` start / 30 + 1 frame | Within 1 frame of End-Axis |
| Hit count per segment | Warfarin `display_atk_scale / atk_scale` | Exact |
| Frame offsets | SkillData `DamageAction`/`ChannelingAction`/`LaunchProjectile` trigger frames | Exact for direct hits; entity hits need spawn offset math |
| Per-level multipliers | Warfarin `atk_scale` × 12 levels | Exact |
| Segment total × ratio (MULT) | Warfarin `display_atk_scale` + computed ratio | Exact for uniform multi-hit |
| Named multiplier tiers | Warfarin `atk_scale`, `atk_scale_2`, `atk_scale_3` | Exact (each tier gets own VARY_BY) |
| DEAL STAGGER | Warfarin `poise` (base), `poise_extra` (additional attack) | Exact |
| RECOVER SKILL_POINT | Warfarin `atb` | Exact |
| CONSUME SKILL_POINT / ULTIMATE_ENERGY | Warfarin `costType` (0=UE, 1=SP) + `costValue` | Exact |
| RECOVER ULTIMATE_ENERGY | Warfarin `extra_usp` (empowered BS) | Exact |
| APPLY REACTION (type from label) | Warfarin label text detection ("Combustion", "Corrosion") + `duration` | Exact |
| CONSUME STATUS (MF threshold) | Warfarin `count` | Exact |
| UE gain per enemy count | Warfarin `usp_N_display` keys | Exact |
| Ultimate active duration | Warfarin `duration` on ultimate_skill | Exact |
| Ultimate animation duration | SkillData `exclusiveFrame` / 30 | Exact |
| Cooldown | SkillData blackboard `duration` or Warfarin `coolDown` | Exact |
| Infliction element | SkillData `SpellInfliction.inflictionType` ("Fire", "Ice", etc.) | Exact |
| Damage delivery type | SkillData action `$type` (DIRECT/CHANNELING/PROJECTILE/ENTITY) | Exact |
| Empowered additional attack clause | Warfarin `atk_scale_3` + `poise_extra` + `extra_usp` + `duration` + `count` | Full clause |

### What the skeleton surfaces as advisories

The parser logs warnings for notable actions that may affect frame counts or require manual DSL authoring:

| Advisory | Source | What it means |
|----------|--------|--------------|
| `JumpToAction → fN (skips M frames)` | SkillData | Conditional branch — may shorten entity lifetime (empowered path cuts DoT ticks) |
| `FinishOwnerAction context='ball'` | SkillData | Kills spawned entity — truncation point for empowered variant |
| `CheckBuffStackNumAdvanced (buff=X, GE N)` | SkillData | Conditional branch gating empowered activation |
| `FinishBuffAction` | SkillData | Consumes buff stacks (MF consumption) |
| `ModifyDynamicBlackboard (key=X, op=Multiply)` | SkillData | Runtime multiplier adjustment (empowered additional attack scaling) |
| `CreateBuffAction` | SkillData | Applies buff/status (MF stacks, combo buffs) |
| `Multiple multiplier tiers` | Warfarin | Frames within segment have different weights — not uniform hits |
| `atk_scale_3 present` | Warfarin | EMPOWERED variant exists with separate additional attack multiplier |
| `atk_scale ≠ atk_scale_2` | Warfarin | ENHANCED variant or multi-sequence skill with different per-hit damage |
| `Uniform N-hit segment` | Warfarin | `display_atk_scale / atk_scale` = N, all frames use same multiplier |
| `UE gain per enemy count` | Warfarin | Combo UE scaling: `usp_N_display` keys |

### What requires manual DSL authoring

After generating the skeleton, these items must be authored by hand using wiki descriptions and reference operator patterns (section 7b):

| Item | Why it's manual | Where to look |
|------|----------------|---------------|
| `APPLY STATUS` (operator statuses like MF) | SkillData `CreateBuffAction` has buff IDs but not human-readable status names | Wiki skill description |
| `PERFORM FINAL_STRIKE` | Not in any data source | Wiki BA description ("Final Strike also deals...") |
| `APPLY INFLICTION` (non-channeling) | Only channeling-embedded inflictions are auto-detected | Wiki skill description + SkillData `SpellInfliction` |
| `frameTypes` (GUARANTEED_HIT, PASSIVE, DIVE, FINISHER) | Not in either data source | Skill category + wiki description |
| `dependencyTypes` (PREVIOUS_FRAME) | Not in either data source | Entity-based skills where ticks depend on first hit |
| `segmentTypes` (ANIMATION, COOLDOWN, ACTIVE, STASIS) | Only partially derivable | Skill structure analysis |
| `activationClause` | Domain logic (e.g. "must be controlled operator") | Wiki skill description |
| `onTriggerClause` | Domain logic (e.g. "when enemy suffers Combustion") | Wiki combo/talent description |
| Mode changes (ENABLE/DISABLE BATK) | Domain logic for ultimate | Wiki ultimate description |
| `timeDependency`, `timeInteractionType` | Partially derivable (TIME_STOP for combo/ult anims) | Skill behavior |
| `windowFrames` | Not in either data source | Combo activation window |
| Empowered frame count (truncated entity) | SkillData has JumpTo + FinishOwner but requires manual flow tracing | Advisories + wiki |
| Enhancement relationships | Inferable from naming but not explicit | Wiki + SkillData file naming |
| Potential effects (VARY_BY POTENTIAL) | Warfarin has potential data but skeleton doesn't bake it | Wiki potentials + section 12 procedure |

### Workflow for new operators

1. **Obtain data dumps** — download SkillData files to `.claude-adhoc/SkillData/`, fetch Warfarin JSON
2. **Run skeleton parser** — generates initial skill JSONs with segments, frames, offsets, multipliers, stagger, SP, UE, costs, delivery metadata, and advisories
3. **Review advisories** — identify empowered variants (atk_scale_3), conditional branches (JumpToAction), entity truncation, multi-tier multipliers
4. **Fetch wiki** — read skill/talent/potential descriptions from endfield.wiki.gg
5. **Author DSL layer** — add status effects, triggers, activation clauses, mode changes, frame/segment types using wiki descriptions and reference operator patterns (section 7b)
6. **Cross-reference** — verify all multipliers, durations, costs against wiki as sanity check
7. **Bake potentials** — apply VARY_BY POTENTIAL arrays per section 12 procedure
8. **Write integration tests** — cover skill placement, trigger chains, empowered activation per the test strategy above
9. **Run reconciliation** — full audit against wiki (section 14 checklist)

## File locations

| Config | Path | Format |
|--------|------|--------|
| Weapons | `src/model/game-data/weapons/weapon-pieces/*.json` | `{ skills: [id, id, id], properties, metadata, clause }` |
| Generic skills | `src/model/game-data/weapons/weapon-skills/generic-skills.json` | `{ [skillId]: { clause, properties, metadata } }` |
| Named skills | `src/model/game-data/weapons/weapon-skills/<weapon>-skills.json` | `{ clause, onTriggerClause, properties, metadata }` |
| Weapon statuses | `src/model/game-data/weapons/weapon-statuses/<weapon>-statuses.json` | `[{ clause, properties, metadata }]` |
| Operator base | `src/model/game-data/operators/<op>/<op>.json` | `{ talents, stats, metadata }` |
| Operator skills | `src/model/game-data/operators/<op>/skills/*.json` | `{ clause, segments, properties, metadata }` |
| Operator talents | `src/model/game-data/operators/<op>/talents/*.json` | `{ onTriggerClause?, clause?, properties, metadata }` |
| Operator potentials | `src/model/game-data/operators/<op>/potentials/*.json` | `{ properties, metadata }` (description-only) |
| Operator statuses | `src/model/game-data/operators/<op>/statuses/*.json` | `{ onTriggerClause?, clause?, properties, metadata }` |
| Status store | `src/model/game-data/operatorStatusesStore.ts` | Scans `statuses/` and `talents/` only (NOT `potentials/`) |
| **Skeleton parser** | `src/model/utils/parsers/parseSkillData.py` | Combines Warfarin + SkillData into skill JSON skeletons |
| **SkillData dumps** | `.claude-secrets/SkillData/` | Game client data dump — frame timing, action types, entity timelines |
| **Warfarin API** | `https://api.warfarin.wiki/v1/en/operators/<slug>` | Per-level multipliers, costs, labels, blackboard values |
| **Wiki** | `https://endfield.wiki.gg/wiki/<Operator_Name>` | Human-readable descriptions — sanity check + DSL authoring reference |
