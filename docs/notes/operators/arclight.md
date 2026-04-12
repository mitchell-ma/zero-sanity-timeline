# Arclight — Skill & Status Coverage

5-star Vanguard | Electric | Sword

## Skills

- Basic Attack: Seek and Hunt
- Battle Skill: Tempestuous Arc (base + Empowered variant when enemy has Electrification)
- Combo Skill: Peal of Thunder
- Ultimate: Exploding Blitz

## Wildland Trekker Counter Pipeline (wired)

1. Tempestuous Arc's conditional third frame fires when the enemy has Electrification
   (`ENEMY HAVE STATUS REACTION ELECTRIFICATION`). It consumes the Electrification,
   deals Electric DMG, recovers SP, and `APPLY STATUS WILDLAND_TREKKER_TALENT` to
   Arclight with stacks +1.
2. The Wildland Trekker T1 talent itself is the counter — no separate trigger status.
   `stacks.interactionType: NONE` accumulates, and its `onTriggerClause` fires when
   `EVENT STACKS BECOME GREATER_THAN_EQUAL` the P-dependent threshold (3 at P0–P4,
   2 at P5, VARY_BY POTENTIAL `[3,3,3,3,3,2]`).
3. On threshold hit: `CONSUME THIS EVENT` (drops stacks back to 0) + `APPLY STATUS
   WILDLAND_TREKKER_BUFF to: TEAM`.
4. `WILDLAND_TREKKER_BUFF` lives on the team column (`to: TEAM`) and fans out
   `APPLY ELECTRIC DAMAGE_BONUS` to each operator (`toDeterminer: ALL`). Per-Intellect
   scaling with P3+ improvement is handled via `VARY_BY [POTENTIAL, INTELLECT]`.

This follows Pogranichnik's Living Banner counter-talent pattern — the talent def
carries both the stacks limit and the trigger clause, so there's no orphan "trigger
status" file alongside it.

## Changes Applied

- Fixed vanilla BS second slash multiplier (was mistakenly set to the Electric additional-attack
  values; now matches the first slash at 0.45–1.01 per level).
- Empowered BS activation condition switched from `WILDLAND_TREKKER_TRIGGER = MAX` (wrong
  semantic) to `ENEMY HAS STATUS ELECTRIFICATION`.
- Empowered BS 3rd frame now applies `WILDLAND_TREKKER_TRIGGER` directly — removed the
  redundant `onTriggerClause` from the trigger status.
- Trigger / buff status targeting migrated from legacy `target`/`targetDeterminer` to
  canonical `to`/`toDeterminer`.
- Buff status now sits on `TEAM` column with inner stat fan-out via `toDeterminer: ALL`.
- Deleted misfiled `status-tactful-approach.json` — this status belongs to Avywenna,
  not Arclight (Arclight has no Tactful Approach talent; see
  `src/model/game-data/operators/avywenna/talents/talent-tactful-approach-talent.json`).

## Remaining Work

- **Ultimate Exploding Blitz** — current segments only cover stagger + damage at the
  2.03s frame and a stagger-only DELAYED segment. Per the wiki description the ult should
  also: (a) apply Electric Infliction to enemies in the dash path at the first frame,
  (b) deal Electric DMG on the delayed explosion frame, and (c) consume Electric
  Infliction → forcibly apply Electrification when one is already present. These effects
  are not yet in the JSON. The damage frame also still uses an End-Axis–style
  `damageMultiplierIncrement + value` shape that should be collapsed.
- **Hannabit Wisdom (T2)** — description-only; requires CHANCE + IGNORE INFLICTION DSL
  support. Blocked, left RECONCILED.
- **Integration test coverage** — existing `skills.test.ts` is smoke-style. Still missing
  the E2E scenarios in `.claude-temp/reconcile-plans/05-arclight.md`: trigger-counter
  accumulation across 3 BS casts, P5 threshold=2, buff fan-out Intellect scaling,
  buff refresh/non-stack behavior, and the ult Electrification chain once the ult is
  reworked.
- **dataStatus flip** — all Arclight files remain RECONCILED pending the ult rework and
  awaiting user sign-off per the never-flip-verified rule.
