---
name: reconcile-game-data
description: Reconcile weapon, weapon skill, and weapon status configs — verify effects, conditions, multipliers, and cross-references all match. Use when auditing data integrity, after bulk updates, or when something looks wrong.
---

# Reconcile Game Data

Cross-reference and validate consistency across weapon configs, weapon skills, and weapon statuses.

## When to use

- After bulk JSON updates (e.g. DSL migration, value imports from wiki)
- When a weapon effect doesn't seem to be working correctly
- When adding new weapons to verify all three layers are consistent
- Periodic audit to catch drift between configs

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
4. **Run structural checks** (sections 1-4 above)
5. **Report findings** — group by severity:
   - **ERROR**: Missing cross-references, broken links, wrong types
   - **WARNING**: Inconsistent values, missing optional fields, legacy keys
   - **INFO**: Statistics (counts, coverage)
6. **Discuss** any discrepancies with the user before making changes

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

## File locations

| Config | Path | Format |
|--------|------|--------|
| Weapons | `src/model/game-data/weapons/weapon-pieces/*.json` | `{ skills: [id, id, id], properties, metadata, clause }` |
| Generic skills | `src/model/game-data/weapons/weapon-skills/generic-skills.json` | `{ [skillId]: { clause, properties, metadata } }` |
| Named skills | `src/model/game-data/weapons/weapon-skills/<weapon>-skills.json` | `{ clause, onTriggerClause, properties, metadata }` |
| Weapon statuses | `src/model/game-data/weapons/weapon-statuses/<weapon>-statuses.json` | `[{ clause, properties, metadata }]` |
| Weapon controller | `src/model/game-data/weaponsController.ts` | `Weapon` class, `validateWeapon()` |
| Skill controller | `src/model/game-data/weaponSkillsController.ts` | `WeaponSkill` class, `validateWeaponSkill()` |
| Status controller | `src/model/game-data/weaponStatusesController.ts` | `WeaponStatus` class, `validateWeaponStatus()` |
