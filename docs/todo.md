# TODO

## Unify physical status onto the generic APPLY STATUS path

Physical status (LIFT / KNOCK_DOWN / CRUSH / BREACH) is handled by bespoke methods (`applyPhysicalStatus` / `applyLiftOrKnockDown` / `applyCrush` / `applyBreach` in `eventInterpretorController.ts`) rather than going through `doApply`'s shared `applyEventFromCtx` helper used by INFLICTION / REACTION / STATUS. Consequences: every freeform-editability improvement (uid reuse via `freeformUidFor`, wrapper-duration inheritance for segment resize, creationInteractionMode propagation) has had to be re-implemented on the physical path, and future work will re-introduce the same class of bug.

Most of the bespoke mechanics already have DSL shapes:
- Stack consumption + damage scaling with consumed stacks — `{verb: IS, object: STACKS, objectQualifier: CONSUMED}` (see `feedback_consumed_stacks_pattern`); multipliers become `VARY_BY STACKS_CONSUMED`.
- Stats-scaled damage — already in REACTION/STATUS via the shared damage calc.
- Variable duration by consumed stacks (Breach) — `properties.duration: VARY_BY STACKS_CONSUMED`.
- `isForced` — already in APPLY `with`, plumbed through the generic path.

Sharp edges to handle:
- [ ] **Conditional non-creation.** "No Vulnerable active AND not forced → skip creating Crush/Breach, add 1 Vulnerable instead." Cleanest shape: onTriggerClause on the wrapper that fires different APPLY effects based on `HAVE VULNERABLE`.
- [ ] **Solidification → Shatter side-effect.** Move `tryConsumeSolidification` to an onTriggerClause listening for `APPLY PHYSICAL_STATUS` → `CONSUME SOLIDIFICATION` → `APPLY REACTION SHATTER`. Same shape arts reactions already use.
- [ ] **"Always +1 Vulnerable on Lift/Knock Down"** — trivial separate APPLY clause on the wrapper.

Plan:
- [ ] Confirm/add `STACKS_CONSUMED` VARY_BY axis support for CONSUME-triggered effects.
- [ ] Author `status-lift.json` / `status-knock-down.json` / `status-crush.json` / `status-breach.json` as real configs. Wrapper columns load via the existing `buildStatusMicroColumn` path.
- [ ] Prototype BREACH first (simpler than CRUSH; exercises duration-scaling) to confirm the generic path carries it.
- [ ] Delete `applyPhysicalStatus` / `applyLiftOrKnockDown` / `applyCrush` / `applyBreach` and the `AdjectiveType.PHYSICAL` shortcut at `eventInterpretorController.ts:1202`.
- [ ] Move Solidification → Shatter side-effect to an onTriggerClause.
- [ ] Keep the existing E2E tests in `src/tests/integration/freeform/freeformPhysicalStatusEditable.test.ts` as the regression harness — they should continue to pass without modification.

**Risk:** bespoke methods may predate the DSL being expressive enough. Check git history before committing; the conditional-non-creation case is the one to prototype first — if it expresses cleanly, the rest follows.

## Fervent Morale stack cap still displays III in the live UI (Pog P5)

E2E tests (`src/tests/integration/operators/pogranichnik/ferventMorale.test.ts`
D5/D6) pass: engine stamps `ev.maxStacks = 5` at apply time and the presentation
controller reads it back, producing labels I–V. But the live browser UI still
caps the visible labels at III for a user with Pog at P5 (same flow as D6: ult
+ combos). The test-vs-UI discrepancy means either (a) the view path the canvas
actually renders differs from what `computeTimelinePresentation` exercises in
the test, or (b) a stale/parallel cache is shadowing `ev.maxStacks`. Dev-server
restart did not resolve it per the user. Next steps:

- Instrument the live canvas to log `presentation.label` for Fervent Morale
  events and confirm whether the stamp (`ev.maxStacks`) reaches the render, or
  gets lost in serialization/URL decode/deserialize.
- Audit every event-copy path (`allocDerivedEvent`, pool reset, URL encode/
  decode in `embedCodec.ts`, undo/redo history cloning) for whether
  `maxStacks` survives — the field was added recently and codec paths may not
  yet carry it across (encode/decode cycle likely drops it, which would
  explain URL-loaded timelines falling back to `resolveMaxPossibleLimit` at
  best, or to the stale cache's 3 at worst).
- Verify `statusStackCache` in `eventPresentationController.ts:69` is reset
  on hot reload; if not, switch to a non-module-scoped cache keyed off
  `getAllOperatorStatuses()` identity.
- Once the live path is reproduced in a failing test, tighten D6 to catch it.

## StackInteractionType: restore original semantics (code drift)

`StackInteractionType` is an **at-cap-behavior-only** enum. The original
and still-intended meaning:
- `NONE` → at cap, **drop the newest apply**.
- `RESET` → at cap, **clamp the oldest and accept the newest**.
- `MERGE` → the newest apply subsumes all currently-active instances.

Multi-stack dispatch (what happens when one APPLY carries `stacks = N > 1`)
is a **separate concern** and must NOT be inferred from `interactionType`.
The engine always dispatches N events per N stacks; visual grouping into
an accumulator display (Steel Oath V → IV → III, SP totals) is a **view**
concern, gated by whether the event has internal frames at non-zero
offsets.

The fix is primarily in **engine** (dispatch) and **view** (grouping).
A small data correction is also needed: statuses currently using
`RESET + 99999` as a workaround to force N-event dispatch should be
flipped to `NONE` (their true at-cap intent) once the engine stops
conflating `RESET` with dispatch.

### Drift

`eventInterpretorController.ts:1417` currently does:
```ts
const isAccumulatorApply = cfg?.stackingMode === StackInteractionType.NONE
  && typeof sv === 'number' && sv > 1;
const stackCount = isAccumulatorApply ? 1 : (sv > 1 ? sv : 1);
const applyStacks = isAccumulatorApply ? sv : undefined;
```

This overloads `NONE` to also mean "collapse N stacks into one event with
`ev.stacks=N`", and implicitly overloads `RESET` to mean "dispatch N
separate events." Both overloads are wrong. `interactionType` governs
at-cap behavior only.

Symptom: Tangtang's Waterspout needs N distinct events per BS (1 +
whirlpool count). True at-cap intent is `NONE` with no practical cap,
but the JSON is forced to `RESET + limit: 99999` because that's the
only combination that makes the engine dispatch N events today. Once
the engine stops conflating `RESET` with dispatch, Waterspout goes
back to `NONE`.

### Fix plan

**Model (engine): always dispatch N events per N stacks.**

In `eventInterpretorController.ts` (around line 1415-1419):
- Delete the `isAccumulatorApply` branch entirely.
- `stackCount = (typeof sv === 'number' && sv > 1) ? sv : 1`.
- `applyStacks = undefined` in all normal cases. Events created by the
  APPLY loop carry `stacks = 1` each.
- Keep the `stackCount > 1` uid suffix so per-stack events have unique
  uids (already present: `${si}`).

Aggregator-caller paths that today pass `applyStacks` deliberately (SP
recovery emitting a single event with `stacks = <SP amount>`, etc.) are
unchanged — they don't go through this APPLY-stacks branch. Verify by
grep: any caller of `applyEventFromCtx` that sets `event.stacks` directly
is fine.

**View: collapse same-frame/same-duration stacks into an accumulator
block when the event has no internal non-zero-offset frames.**

Grouping rule (to be implemented in the view / event presentation layer):
- Candidate group key: `(columnId, ownerEntityId, startFrame, duration, id)`.
- Group members: all events matching the key.
- If ANY member has an internal frame with `offset > 0` (e.g. Waterspout's
  1s / 2s / 3s damage ticks), **do not group** — render each event as a
  separate block so each tick timeline is visible.
- Otherwise (all internal frames at offset 0, or no frames), render one
  block with a stack-count label (Steel Oath V, Thunderlance ×3, etc.).
- Selection, drag, and edit must still target individual underlying
  events (group is purely visual).

Ownership of the grouping logic: `eventPresentationController` is the
right layer — it already collates processed events for view consumption
and knows the frame structure.

**Ancillary engine clean-up (no behavior change intended):**

- `eventPresentationController.ts:174` — `isIndependentReset` uses
  `statusInfo?.instances <= 1 && RESET` as a proxy for "accumulator."
  Once dispatch is 1-event-per-stack unconditionally, revisit whether
  this heuristic is still needed; it's likely dead.
- `gameDataAdapters.ts:488,725` — `maxStacks > 1 ? NONE : RESET`
  heuristic for custom statuses. Remove; pick `interactionType` based
  on actual at-cap intent (custom UI picker).
- `configDrivenStatusColumn.ts:47-58` — at-cap handling already matches
  the original semantic (`RESET` → clamp oldest, `NONE` → drop). Leave,
  add a pinning test.
- `critExpectationModel.ts:290` (RESET → FIFO model): stays correct.

**Data: correct the workaround entries.**

Statuses currently configured with `RESET + limit: 99999` purely to force
N-event dispatch (not because any clamp is intended) should flip to
`NONE` with no practical cap. At-cap behavior never fires in either
case; the change just makes the JSON express true intent once the
engine stops tying `RESET` to dispatch.

Known candidates:
- `WATERSPOUT` (`status-waterspout.json`) → `NONE`.
- `WATERSPOUT_ULT` (`status-waterspout-ult.json`) → check, likely `NONE`.
- `WHIRLPOOL` (`status-whirlpool.json`) → check.
- Other `RESET + 99999` statuses surfaced by
  `grep 'interactionType": "RESET"' + limit=99999`: audit each and
  flip to `NONE` where the cap is cosmetic.

Already-correct shapes (no change):
- Steel Oath: `NONE` + 5 cap → at-cap drops new; APPLY stacks=5 produces
  5 underlying events; no internal non-zero offsets → view groups into
  "V → IV → III" accumulator block. ✓
- Thunderlance / Melting Flame / SP counters: similar grouping path; all
  land as accumulator blocks via the view rule. ✓
- `RESET` with a real cap (e.g. `limit: 1` on weapon buffs): unchanged —
  those genuinely mean "newest replaces oldest at cap."

### Tests

- Unit (`configDrivenStatusColumn`): NONE at cap drops, RESET at cap
  clamps oldest, MERGE subsumes all. Pin with fixtures.
- Unit (`eventInterpretorController`): APPLY stacks=N always produces
  N events with `stacks=1`, regardless of `interactionType`.
- Unit (view grouping): given N same-key events, group iff no internal
  frame has offset > 0; otherwise render individually.
- Integration (Tangtang BS): spawns `1 + whirlpool.stacks` distinct
  Waterspout blocks; each shows its own CRYO damage tick schedule.
- Integration (Pogranichnik Steel Oath): ultimate produces 5 underlying
  events, view shows one block labeled V; after consume-with-restack,
  V → IV → III display unchanged.
- Integration: existing SP recovery, Thunderlance, Melting Flame display
  tests keep passing (view grouping picks them up automatically).

### Ordering

Single commit:
1. Delete `isAccumulatorApply` branch in `eventInterpretorController`.
2. Add view grouping logic in `eventPresentationController` (or the
   view-side presentation pass), keyed on internal-frame offsets.
3. Flip the `RESET + 99999` workaround statuses to `NONE`.
4. Update affected tests.

Landing engine-only without the view change will visually blow up Steel
Oath / SP / Thunderlance (5 separate blocks instead of one). Landing
engine-only without the JSON fix will leave Waterspout silently broken
(RESET now means "clamp oldest" — but the cap is 99999, so still a
no-op in practice — confirming these can ship in any order as long as
engine + view ship together). Must ship together.

## Freezing Point talent ends one time-stop short of its source infliction (FIXED 2026-04-14)

**Bug:** freeform CRYO infliction placements caused Yvonne's Freezing Point
talent to end at the raw (unextended) CRYO end frame instead of the
time-stop-extended end. The BECOME-NOT trigger fired twice — once at raw
end (wrongly), once at extended end — consuming FP prematurely.

**Root cause:** `flattenEventsToQueueFrames` emitted a duplicate `EVENT_END`
queue frame at the raw unextended end of non-skill wrapper events. The
original guard meant to skip this required `!hasFrames`, but freeform
wrappers carry a synthesized APPLY-clause frame from
`buildStatusMicroColumn`, so the guard never triggered. The wrapper's
raw-end `EVENT_END` fired first, BECOME-NOT routed through FP's CONSUME
condition and clamped FP before the applied event's own `EVENT_END` fired
at the extended end.

**Full refactor (completed alongside the fix):** the freeform and natural
(skill-triggered) infliction/reaction/status paths now share a single
codepath from the APPLY-clause PROCESS_FRAME onward. Freeform wrappers
emit only their clause-carrying PROCESS_FRAME; `doApply → applyEvent →
runStatusCreationLifecycle` owns the entire applied-event lifecycle.

Key changes:
- `flattenEventsToQueueFrames`: split into `emitSkillLifecycle` (full
  EVENT_START / SEGMENT / EVENT_END lifecycle) and `emitNonSkillFrames`
  (clause-carrying PROCESS_FRAMEs only). Non-skill wrappers never emit
  lifecycle hooks — the applied event owns them.
- `handleProcessFrame` section 3b (freeform creation fallback) deleted.
- `buildStatusMicroColumn`: every freeform-placeable non-skill column
  ships an APPLY clause in its defaultEvent. Abstract `SUSCEPTIBILITY`
  removed from the menu (only element-specific variants remain).
  Physical statuses default to `isForced: 1` in the APPLY clause so
  freeform placements bypass the Vulnerable gate.
- `applyCrush` / `applyBreach` accept `isForced` and proceed to create
  the status (with 1 default stack) when no Vulnerable is active.
- `InterpretContext.sourceEvent` added so `doApply`'s generic
  qualified-status path can thread runtime-user-edited `susceptibility`
  from a qualified-susceptibility / FOCUS wrapper onto the applied event.
- `attachDefaultSegments` normalizes non-skill events that arrive
  without a frame (URL imports, session restores, programmatic adds).
- Test fixtures updated via shared `_freeformEventHelpers.ts` helper.

Regression tests: `src/tests/integration/freeform/freeformInflictionLifecycle.test.ts`
(7 E2E tests). Invariant tests in `src/tests/unit/columnBuilder.test.ts`.

**Follow-up (not done):** InfoPane "Time-stop adjusted" still hides the
adjusted duration for derived events because `event === processedEvent`
for them. For those, either expose DEC's `rawSegmentDurations` to the
view or back-compute raw via `contractByTimeStops(processedDur, stops)`
and always show both lines.

## TriggerIndex: order-agnostic conditions (DONE)

Completed. `TriggerDefEntry` now stores a flat `conditions: Predicate[]` array.
All observable conditions produce index keys (multi-key registration with dedup).
`findClauseTriggerMatches` uses `needsEngineContext()` to route conditions to the
right evaluator. `handleEngineTrigger` evaluates state conditions (HAVE, IS, BECOME)
with full context; event-presence verbs are skipped (already validated by index).

## DSL: IGNORE INFLICTION + elemental MITIGATE

CHANCE is implemented (used by Alesh combo skill). Two primitives remain:

### IGNORE STATUS INFLICTION

Extend `case VerbType.IGNORE` in `eventInterpretorController.ts` to handle
`object: STATUS, objectId: INFLICTION, objectQualifier: <element>`. Register a per-slot
passive flag; check it at the `APPLY STATUS INFLICTION → OPERATOR` site and drop the
application. Route through CHANCE when the effect wraps IGNORE in a probability gate.

### Elemental MITIGATE / DAMAGE_TAKEN_REDUCTION

Incoming damage reduction scoped to an element. Either a new verb or a per-element stat
(`StatType.HEAT_DAMAGE_TAKEN_REDUCTION`). Plugs into the damage formula layer.

### Blocked operators

| Operator / effect | Needs IGNORE INFL | Needs MITIGATE | Other |
|---|---|---|---|
| Arclight T2 (Hannabit Wisdom) — 50% Arts Infliction ignore | ✓ (ARTS) + CHANCE | | |
| Estella T2 (Laziness Pays Off Now) — Cryo infliction ignore + Cryo −10/−20% | ✓ (CRYO) | ✓ (CRYO) | |
| Snowshine P1 (Cold Shelter) — Arts infliction ignore on operators with Protection | ✓ (ARTS) | | enemy→operator infliction flow needed |
| Fluorite T2 (Unpredictable) — chance Arts DMG immunity | ✓ (ARTS) | | |
| Antal Subconscious Act — 30% Physical DMG immunity | ✓ (PHYSICAL) | | |

## Spatial mechanics (radius / area buffs)

The engine has no spatial model — operators and enemies are abstract slots, not positioned
entities. Several effects depend on real spatial radii, range, or first-enemy-hit:

- Snowshine P2 (Storm Region) — Ult effect radius +20%
- Snowshine P3 (Polar Survival Guide) — partial: the duration component is baked into the
  SNOW_ZONE status, but any radius bonus on the spatial Snow Zone effect is not modelled
- Estella P3 (Delayed Work) — partial: battle skill Onomatopoeia damage multiplier is baked
  via `VARY_BY POTENTIAL`, but the "+50% range" and "first enemy hit bonus damage" portions
  of the potential are not modelled
- Ardelia T1 (Friendly Presence) — see "Unimplemented mechanics — Ardelia T1" below
- Antal / others (pre-existing notes if applicable)

## VARY_BY TALENT_LEVEL arrays needing wiki data

Talent-level arrays must be zero-indexed with length = `maxLevel + 1`
(per `feedback_talent_levels_zero_indexed.md`). The shape audit
`src/tests/unit/talentLevelArrayShape.test.ts` enforces this, but the
following files have arrays whose missing L0 / Lmax entries can't be
inferred from existing data — they need a wiki lookup before being fixed
and added back to the audit. They are currently in the test's
`KNOWN_AMBIGUOUS` skip list.

- `laevatain/statuses/status-scorching-heart.json` — Heat Resistance ignore
  values, current `[10, 15, 20]` (length 3); Scorching Heart talent
  `maxLevel=3` so we need a 4-entry `[L0, L1, L2, L3]` array. Wiki
  needed: confirm L0/L1/L2/L3 ignore values.
- `yvonne/statuses/status-barrage-of-technology.json` — Final Strike basic
  attack DAMAGE_BONUS, current `[0, 0.5]` (length 2). Barrage of
  Technology talent `maxLevel=2` so we need a 3-entry `[0, L1, L2]`
  array. Wiki needed: L2 damage bonus value.
- `ardelia/talents/talent-friendly-presence-talent.json` — RECOVER HP base
  currently `[63, 63, 63]` (length 3, all identical). Friendly Presence
  `maxLevel=3` so we need a 4-entry zero-indexed array, OR refactor to
  a constant `IS 63` gated by a `HAVE TALENT_LEVEL >= 1` condition.
- `ardelia/skills/action-mr-dolly-shadow.json` — `healBase=[45, 63, 90]`
  and `willAdditive=[0.38, 0.53, 0.75]` (length 3). Friendly Presence
  `maxLevel=3` so each needs a 4-entry array. Wiki needed: L0/L1/L2/L3
  values for both fields.

## Remove weaponSkillEffects.ts and related weapon effect infrastructure

The weapon status timeline columns have been removed from the column builder and view.
The following files/code still reference `weaponSkillEffects.ts` and can be cleaned up:

- `src/controller/custom/customWeaponRegistrar.ts`
- `src/controller/custom/builtinToCustomConverter.ts`
- `src/model/weapon-skills/weaponSkill.ts`
- `TimelineSourceType.WEAPON` enum value in `src/consts/enums.ts`
- `ColumnLabel.WEAPON_BUFF` in `src/consts/timelineColumnLabels.ts`
- `StatusType.UNBRIDLED_EDGE` and related entries in enums/labels

## Share link could be Huffman encoded

The share/export URL codec could potentially use Huffman encoding to reduce link length,
since certain values (operator IDs, skill types, common frame counts) appear with known
frequency distributions.

## Multiplier entry keys in skill frame data

The `multipliers` arrays in skill frame data use raw game keys (`atk_scale`, `atk_scale_2`,
`poise`, `duration`, etc.) These should be flattened to codebase terms. The multiplier engine
(`jsonMultiplierEngine.ts`) hardcodes `'atk_scale'` and `'atk_scale_2'` — both the engine
and the JSON data need to be updated together.

Proposed mapping:
- `atk_scale` → `DAMAGE_MULTIPLIER`
- `atk_scale_2` → `DAMAGE_MULTIPLIER_INCREMENT`
- `poise` → `STAGGER`
- `duration` → `DURATION`
- `atb` → `SKILL_POINT`

## Re-express Laevatain/Last-Rite multi-hit damage after bad-key cleanup

The End-Axis import keys `damageMultiplierIncrement`, `poiseExtra`, and `count` were
stripped from the corpus (store validator rejects them; see `validationUtils.ts::warnInvalidWithKeys`).
The numeric data they carried was not migrated, so the following files now model their
skills as single-hit with no extra stagger — which is less accurate than the intended
multi-hit behavior:

- `operators/last-rite/skills/combo-skill-winters-devourer.json`
- `operators/laevatain/skills/battle-skill-smouldering-fire.json`
- `operators/laevatain/skills/battle-skill-smouldering-fire-empowered.json`
- `operators/laevatain/skills/battle-skill-smouldering-fire-enhanced.json`
- `operators/laevatain/skills/battle-skill-smouldering-fire-enhanced-empowered.json`

Re-express each as proper per-hit frames (or per-hit predicates) using authoritative
per-level values from Warfarin's `skillPatchTable.<skill_id>.SkillPatchDataBundle[].blackboard`
(`atk_scale`, `atk_scale_2`, `poise`, etc.) or the upstream `.claude-secrets/SkillData/`
End-Axis blobs. The extra stagger that lived in `poiseExtra` becomes a separate
`DEAL STAGGER` effect per hit; the `count` becomes explicit frame repetition.

## Wire up `damageFactorType` on TimelineEvent

`damageFactorType` exists on `TimelineEvent` but is never written. `getIntellectScaledDamageBonus()` and `getIgnoredResistance()` in `eventsQueryService.ts` filter by it, so they currently return 0. Need to:

1. **Set `damageFactorType` during clause resolution** — `resolveClauseEffectsFromClauses` in `statusTriggerCollector.ts` handles `APPLY DAMAGE_BONUS` and `IGNORE RESISTANCE` but doesn't set `ev.damageFactorType`
2. **Fix TALENT_LEVEL TODO** — `statusTriggerCollector.ts` hardcodes `const talentLevel = 1 // TODO`, should use `ctx.loadoutProperties?.operator.talentOneLevel ?? 1`
3. **Remove `getScorchingHeartIgnoredResistance`** from damageFormulas.ts — values already in the JSON config, just need `damageFactorType` wired up

## Resolve talent level and p3TeamShare from DSL

`minTalentLevel` and `p3TeamShare` were removed from status JSON configs during the DSL refactor.
The engine currently uses dummy talent level values (`1`) where it previously resolved from
`def.minTalentLevel`. These features need to be re-implemented through the DSL:

- **Talent level gating**: statuses that only activate at a certain talent level need a DSL
  condition (e.g. `TALENT_LEVEL >= 2`) instead of the old `minTalentLevel` field.
- **P3 team sharing**: statuses that share to team at P3+ need a DSL mechanism for creating
  shared copies with reduced duration, replacing the old `p3TeamShare.durationMultiplier` field.

Search for `TODO: resolve talent level from DSL` in `statusDerivationEngine.ts` for all affected sites.

## Sheet statistics

Add aggregate statistics for sheets, including:
- Stagger uptime (% of timeline where enemy is staggered)
- Buff uptime (per-buff active duration / total duration)
- Other relevant combat uptime metrics

## Populate HP/DEF-related gear set effects, operator talents, and weapon skills

Several gear set effects, operator talents, and weapon skills that involve HP or DEF
are stubs or missing clause data. These need to be populated from wiki/Warfarin sources.

### Gear set effects — missing HP passive clause

These sets have "HP +X" as part of their 3-piece bonus but no FLAT_HP clause in the JSON:

| Gear Set | Missing Effect |
|----------|---------------|
| AIC Heavy | FLAT_HP +500; also missing "restore 100 HP on enemy defeat (5s CD)" trigger |
| AIC Light | FLAT_HP +500 (trigger clause for ATK on defeat exists, but HP passive missing) |
| Eternal Xiranite | FLAT_HP +1000 (trigger clause for SKILL_DAMAGE_BONUS exists, but HP passive missing) |

### Gear set effects — stubs (no clauses at all)

These sets have HP-threshold conditions but are metadata-only with zero clauses:

| Gear Set | Wiki 3-piece Effect |
|----------|-------------------|
| Armored MSGR | STR +50; when HP < 50% → 30% DMG Reduction |
| Roving MSGR | AGI +50; when HP > 80% → Physical DMG +20% |
| Mordvolt Insulation | INT +50; when HP > 80% → Arts DMG +20% |
| Mordvolt Resistant | WILL +50; when HP < 50% → Treatment Effect +30% |

### Gear set effects — missing passive in clauses

| Gear Set | Missing |
|----------|---------|
| Lynx | Treatment Efficiency +20% passive (trigger effect for FINAL_DAMAGE_REDUCTION exists) |

### Operator talents — missing or incomplete

| Operator | Issue |
|----------|-------|
| Antal | Talent 3 "Subconscious Act" entirely missing (30% Physical DMG immunity + self-heal [27+STR×0.23] / [45+STR×0.38]) |
| Antal | Improviser status missing heal values (healBase [72, 108], strengthAdditive [0.6, 0.9]) |

### Weapon skills — description-only HP effects

| Weapon Skill | Issue |
|-------------|-------|
| Inspiring: Start of a Saga (Pathfinder's Beacon / Hypernova Auto) | HP threshold condition only in description, no clause data |

## Operator talent/skill DSL reconciliation issues

### From 2026-03-26 batch reconciliation (18 operators)

#### Missing VARY_BY POTENTIAL (needs engine support for HP conditions)

1. **Alesh P5** — "Hitting a target below 50% HP increases the DMG Multiplier to 1.5 times the original." Needs enemy HP<50% condition on ultimate damage. Engine does not support HP threshold conditions yet.

2. **Chen Qianyu P1** — Status `status-chen-qianyu-potential1-shadowless.json` applies +20% DAMAGE_BONUS unconditionally but wiki says "to enemies below 50% HP." Same HP condition gap as Alesh P5.

3. **Ardelia P1** — Susceptibility +8% was baked in, but verify the `rateVulBase` ADD wrapper in the conditional DEAL DAMAGE clause is also applied (currently only the susceptibility arrays were wrapped).

#### Structural / Data Issues

4. **Endministrator basic attack SEQ 3/4** — Rounding discrepancies (1-2%) vs wiki at several skill levels due to per-hit division. Per-hit values from Warfarin `atk_scale` are correct for damage calc; wiki `display_atk_scale` is a rounded sum.

5. **Arclight combo** — Total multiplier 1% over across all levels (156% vs wiki 155%). Per-hit values may need slight adjustment.

7. **Yvonne empowered basic attack** — Segment 0 has 3 frames with empty `effects: []`. These serve no purpose and should be removed or populated.

8. **Multiple operators** — Description template placeholders unresolved ({trigger_hp_ratio:0%}, {extra_scaling}, {duration-1:0%}, etc.). Cosmetic only but should be filled in.

9. **Multiple operators** — Status descriptions copied from skill descriptions instead of describing the status itself (Avywenna Thunderlance).

## Engine fixes

### Migrate combo activation window derivation from batch to reactive
`processComboSkill.ts` → `deriveComboActivationWindows` is a batch pre-scan that iterates all events after the queue. This violates the "no batch processing" rule. Combo windows should be created reactively by the interpretor when trigger signals (PERFORM FINAL_STRIKE, APPLY INFLICTION, etc.) fire during queue processing. Requires handling: window merging, time-stop extension, multi-operator triggers, cooldown overlap, post-CD-reset re-derivation.

### Disabled configs still needing real data
- **Antal**: Improviser talent + Improviser status — `isEnabled: false`

### Talents/potentials implemented
- Akekuri Cheer of Victory — SP Recovery scaling baked into combo skill frames with VARY_BY TALENT_LEVEL + INTEGER_DIV(INTELLECT, 10) ValueExpression
- Akekuri P1 Positive Feedback — ATK +10% on SP recovery, trigger on status file, gated HAVE POTENTIAL >= 1
- Akekuri P3 Committed Team Player — team ATK +10% during ult, applied from ult frame with HAVE POTENTIAL >= 3
- Akekuri P5 Tempo of Awareness — LINK +5s via VARY_BY POTENTIAL on LINK duration
- Da Pan Salty or Mild (simplified Prep Ingredients from ult)
- Last Rite Cryogenic Embrittlement (1.2x Cryo Susceptibility AMP)
- Perlica Cycle Protocol (extra combo chain on Vulnerable)
- Pogranichnik Tactical Instruction (Fervent Morale from Steel Oath)
- Ardelia Friendly Presence (simplified HP recovery on hit)
- Estella Laziness Pays Off Now (Cryo Infliction ignore + DMG reduction)

### Talents left as description-only (passive/probabilistic/spatial)
- Antal Subconscious Act (30% DMG immunity)
- Arclight Hannabit Wisdom (50% Arts Infliction ignore)
- Ardelia Mountainpeak Surfer (spatial recast)

## Integration tests — deeper mechanics (remaining)

Core integration tests (skill placement, infliction pipelines, combo triggers, ultimate energy,
talent statuses, view layer) are implemented for all 25 operators (177 new tests added 2026-03-29).
The following deeper mechanic-specific tests remain:

| Operator | Missing Tests |
|----------|--------------|
| Ember | P5 Steel Oath Empowered (shield ×1.2 + ATK +10%), Pay the Ferric Price 3-stack accumulation, Protection duration extension on hit |
| Catcher | RETURN vs RECOVER SP distinction, P1 DEF-scaling bonus damage on BS/ult hit, Weaken status from ult |
| Da Pan | Reduce & Thicken multi-stack accumulation (4 stacks), Vulnerability 4-stack combo trigger in strict mode, P5 extra Vulnerability stack |
| Arclight | Multi-cast counter accumulation (3 BS → team buff) blocked on test fixture for N fresh Electrifications. P5 threshold=2, buff Intellect scaling, buff refresh/non-stack. Single-cast BS + ult branch tests DONE (G1–H3). |
| Fluorite | T2 (Unpredictable) chance probability gate + Antal immunity — implement together |
| Gilberta | Arts Reaction combo trigger in strict mode, Gravity Field Lift extension, Messenger's Song UE gain buff |
| Alesh | Flash-frozen talent (Cryo→Solidification chain), arts reaction consume combo trigger in strict mode |
| Avywenna | P5 conditional 1.15× damage on Electric Susceptible (HAVE STATUS condition not yet modeled in trigger pipeline) |
| Tangtang | Waterspout/Whirlpool status application, Fam of Honor team Haste |
| Yvonne | Empowered basic attack variant, Crit Stacks accumulation (10 max), Barrage of Technology consume interaction |
| Last Rite | MITIGATE DAMAGE during ult (damage immunity), Cryogenic Embrittlement E2E (frame-level susceptibility stat resolution) |

### Engine blockers for some deeper tests
- Strict-mode combo triggering requires the engine to evaluate `onTriggerClause` conditions against pipeline state
- HP threshold conditions not supported (affects Alesh P5, Chen Qianyu P1, Catcher combo trigger)

## Unimplemented mechanics — Ardelia T1

Ardelia Talent 1 (Friendly Presence): battle skill creates Shadows of Mr. Dolly that heal the controlled operator on contact. Healing formula: `[63/90 + Will × 0.53/0.75]` by talent level. If controlled operator is at max HP, heals lowest-HP teammate instead. Shadows last 10s, max 10. Ultimate copies also have 10% chance to spawn shadows. Currently description-only — needs spatial/proximity mechanics to implement.


## Rossi full reconciliation (from Warfarin + SkillData audit)

### Battle Skill — Crimson Shadow
- [ ] Duration 1.75s → 1.3s (SkillData AllowNext f38)
- [ ] Frame 1 offset 0.5→0.533s, Frame 2 offset 0.8→0.733s, Frame 3 offset 1.2→1.167s
- [ ] Frame 3 has DEAL DAMAGE but SkillData f35 ChannelingAction has hasDmg=False — should be stagger+UE only, not damage
- [ ] Frame 1+2 mults (0.255 each) are derived splits of atk_scale_1=0.85. Verify per-hit breakdown
- [ ] Frame 3 stagger=5 matches poise_1=5 ✅
- [ ] Missing: RECOVER UE (usp_1=15 on SEQ 1 complete, usp_2=10 on SEQ 2)
- [ ] Missing: SEQ 2 entirely (atk_scale_3=1.28, poise_2=10, fires at ~7.2s via projectiles)
- [ ] Missing: Bleed status (atk_scale_bleed=0.36, duration_bleed=15s)
- [ ] Empowered variant: verify diff from base (WOLVEN_AMBRAGE status)
- [ ] Dual element: SEQ 1 = Physical (no SpellInfliction), SEQ 2 = Heat (check projhit for infliction)

### Combo Skill — Moment of Blazing Shadow
- [ ] Rossi has 3 combo variants (combo_1, combo_2, combo_3) — we only model combo_1
- [ ] Seg 2 dur 0.8s vs SkillData 0.733s
- [ ] Missing DEAL DAMAGE frame (atk_scale=0.4, poise=10) — current frame only has status effects
- [ ] Missing RECOVER UE (usp=10)
- [ ] Combo 2: atk_scale=0.67, display variants for SEQ 2 (1.33/0.67), crit buff (25%, 15s)
- [ ] Combo 3: atk_scale_s/f=1.33, crit rate+dmg buff (15%/30%, 15s), per-infliction-stack bonus (80%)

### Ultimate — Razorclaw Ambuscade
- [ ] Seg 1 (Animation) dur 2.592s vs SkillData exclusive=5.167s — very different
- [ ] SkillData shows damage at 1.9s, 2.133s, 4.067s — ult has damage frames we don't model
- [ ] Warfarin: atk_scale_1=0.11 (stab per hit), atk_scale_2=1.11 (SEQ 1 slash), atk_scale_3=3.33 (SEQ 2 slash)
- [ ] display_atk_scale_1_min=1.28, display_atk_scale_1_max=2.75 — variable stab count
- [ ] Missing: DEAL STAGGER 25, crit_damage_up_to_bleed=0.6
- [ ] Seg 2 has APPLY INFLICTION at offset 5s — verify timing

### General
- [ ] Yvonne empowered BA: non-standard Warfarin IDs (ult_attack1_1 etc.), stagger 20 vs 17
