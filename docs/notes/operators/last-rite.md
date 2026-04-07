# Last Rite — Skill & Status Coverage

6-star Striker | Cryo | Great Sword

**Status: VERIFIED** — all 17 LR JSON files marked `dataStatus: VERIFIED`.

## Skills

- Basic Attack: Dance of Rime (BATK, Finisher, Dive variants)
- Battle Skill: Esoteric Legacy of Seš'qa
- Combo Skill: Winter's Devourer
- Ultimate: Vigil Services

## Talents & Statuses

- T1 Hypothermia — self-trigger (APPLY THIS EVENT) on CONSUME ARTS INFLICTION; 2s presence event with frame at 0s applying CRYO_SUSCEPTIBILITY = `CONSUMED STACKS × VARY_BY TALENT_LEVEL [0.02, 0.04]`. NONE interaction, 1 stack limit.
- T2 Cryogenic Embrittlement — frame-level APPLY STAT SUSCEPTIBILITY CRYO with multiplier `VARY_BY TALENT_LEVEL [1.2, 1.5]` on each ult damage frame.
- Hypothermic Perfusion (parent) — applied by BS to CONTROLLED operator slot; 15s duration; onTriggerClause requires CONTROLLED OPERATOR PERFORM FINAL_STRIKE; passive +20% FINAL_STRIKE damage at SOURCE OPERATOR P1+.
- Hypothermic Perfusion (Mirage) — applied to ENEMY by parent's onTrigger; 2s segment with frame at 0s dealing CRYO DAMAGE + APPLY CRYO INFLICTION + DEAL STAGGER; all stats use SOURCE OPERATOR determiner. P5 = 1.2× damage multiplier.
- VIGIL_SERVICES_UE_LOCKOUT — permanent status preventing external UE during ult.

## Potentials

- P1: +20% FINAL_STRIKE damage from Hypothermic Perfusion passive; +5 stagger on mirage attack.
- P2: STR +20, Cryo DMG +10%.
- P3: 1.15× combo damage multiplier (baked into combo first frame).
- P4: ult cost 240 → 204 (× 0.85).
- P5: BS RETURN SKILL_POINT 30 → 35 (+5); mirage damage × 1.2; ult cost remains 204.

## Engine Extensions Built for LR

### CONTROLLED determiner trigger gating
- `checkReactiveTriggers` and `checkPerformTriggers` now properly gate on the controlled operator at the trigger frame. Non-controlled operators no longer fire `CONTROLLED OPERATOR PERFORM FINAL_STRIKE` triggers.

### CONSUME-trigger gating on actual consumption
- `reactiveTriggersForEffect` skips dispatch when verb=CONSUME and 0 stacks were consumed. Prevents spurious Hypothermia firing on no-op consumes. All `doConsume` paths (`INFLICTION`/`STATUS`/`SKILL`/`EVENT`/`STACKS`) now set `lastConsumedStacks` on success.

### CONSUMED stacks DSL pipeline
- New DSL: `{ verb: IS, object: STACKS, objectQualifier: CONSUMED, of: { ... } }` resolves to the number of stacks consumed by the triggering CONSUME effect.
- Threading path: `doConsume` → `lastConsumedStacks` → `reactiveTriggersForEffect` → `checkReactiveTriggers` → `EngineTriggerEntry.consumedStacks` → `handleEngineTrigger` → `InterpretContext.consumedStacks` → `doApply` → `TimelineEvent.consumedStacks` → `processNewStatusEvent` (inline frame at offset 0) → `buildValueContext` → `ValueResolutionContext.consumedStacks` → `resolveValueNode` (CONSUMED qualifier on STACKS).

### LR Ultimate damage fix
- Removed bogus `damageMultiplierIncrement` field from all 3 ult damage frames.
- Corrected frame 3 damage multiplier to use the actual `[3.56, 3.91, …, 8]` values (was previously incorrectly using frame 1/2's `[1.78, …, 4]`).

### Combo first frame ordering
- RECOVER UE (based on CRYO INFLICTION stacks) → DEAL DAMAGE → CONSUME CRYO INFLICTION (with `stacks: MAX`).
- All effects on first frame (offset 0.217s); UE recovery moved off the top-level clause.

## Tests

90 integration tests in `src/tests/integration/operators/last-rite/`:
- `battleSkillE2E.test.ts` — BS targeting, stacking, SP, UE, Hypothermic Perfusion trigger gating (incl. CONTROLLED gating), mirage status structure & E2E.
- `comboSkillE2E.test.ts` — combo activation window, UE gain formula, P3 damage multiplier.
- `ueLockoutAndTalents.test.ts` — UE lockout, T1 Hypothermia E2E with CONSUMED stacks (parameterized 3/4 stacks), T2 multiplier, P2/P3/P4/P5 verifications.
- `skills.test.ts` — DSL structure verification across all skills, talents, statuses.

## Remaining Work

- MITIGATE DAMAGE / damage immunity during ult animation (description-only, not modeled in engine)
- Cryogenic Embrittlement E2E test — verify the frame-level APPLY STAT SUSCEPTIBILITY CRYO multiplier (1.2× / 1.5×) actually multiplies the resolved cryo susceptibility on the enemy through the full pipeline
