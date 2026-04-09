# Pipeline Unification Plan

Streamline the event pipeline into a single linear flow with one parser, one interpreter, one DEC, and one queue dispatch surface:

    DSL JSON → Parser → Interpreter → DEC → downstream controllers (SP, UE, HP, Stagger, Query)

Entry point: `processCombatSimulation()` in `src/controller/timeline/eventQueueController.ts:405`.

---

## Verified current state (read from source on 2026-04-07)

### Pipeline stages (`eventQueueController.ts:405–567`)
1. `resetPools()` + `clearStatusDefCache()` (`:438–439`)
2. HP tracker init (`:442–446`)
3. Resource controller clear (`spController.clearPending`, `ueController.clear`) (`:449–450`)
4. `StatAccumulator.init` (`:453–455`)
5. `cloneAndSplitEvents(rawEvents)` → `{ inputEvents, derivedEvents }` (`:458`)
6. `DerivedEventController.reset` + `seedControlledOperator` + `registerEvents(inputEvents)` (`:464–470`)
7. Enemy action events registered (`:474–475`)
8. `SkillPointController.deriveSPRecoveryEvents` → re-`registerEvents(spEvents)` (`:478–480`)
9. `precomputeDamageByFrame` for HP threshold predicates (`:485–488`)
10. `resolveControlledOperator` (`:491–493`)
11. `runEventQueue` (`:499–501`) — builds TriggerIndex, registers talent events, **interprets passive talent APPLY STAT clauses inline** (`:307–326`), seeds queue via `collectFrameEntries`, drains queue
12. Post-queue combo window fixup (`clampComboWindowsToEventEnd`, re-derive) (`:508–516`)
13. `spController.finalize` + `ueController.finalize` (using stat accumulator efficiency) + `hpController.finalize` + `shieldController.finalize` (`:519–539`)
14. `getProcessedEvents()` + creationInteractionMode/uid restoration (`:543–564`)

**There is no app-layer second pass.** Stagger frailty re-feeding (mentioned in earlier inventories) does not exist in this file. Good.

### `interpret()` verb dispatch (`eventInterpretorController.ts:640–671`)
Mutating: `ALL, ANY, APPLY, CONSUME, RESET, REDUCE, RECOVER, RETURN (alias of RECOVER), EXTEND, DEAL`.
**No-op `return true`:** `REFRESH, HIT, DEFEAT, PERFORM, IGNORE, OVERHEAL, EXPERIENCE, MERGE` (`:662–666`).
**`NOOP_VERBS` set used by `validateVerbObject`:** `DEAL, HIT, DEFEAT, PERFORM, IGNORE, OVERHEAL, EXPERIENCE, MERGE, RESET` (`:167–171`). DEAL and RESET are listed as no-op-for-validation but actually mutate via `doDeal`/`doReset` — i.e. the set is mis-named, it's a "skip object validation" set.

### Inline `interpret()` call sites that bypass the queue
| # | Site | File:line | Hook |
|---|---|---|---|
| 1 | Talent passive APPLY STAT loop | `eventQueueController.ts:316` | seed-time |
| 2 | Skill `onEntryClause` | `eventInterpretorController.ts:1916` | EVENT_START (already a queue hook, but interprets inline within the handler) |
| 3 | Skill `onExitClause` | `:1971` | EVENT_END |
| 4 | Segment `onEntryClause`/`onExitClause` | `:2017` | SEGMENT_START/END |
| 5 | Frame marker clauses | `:2489` | PROCESS_FRAME (frame markers) |
| 6 | Status `onEntryClause` (creation) | `:2344` | inline in `processNewStatusEvent` |
| 7 | Status `clause` (passive APPLY STAT) | `:2377` | inline in `processNewStatusEvent` |
| 8 | Status frame markers offset 0 | `:2489` (inside `processNewStatusEvent`) | inline |
| 9 | Status frame markers offset > 0 | queued (`pendingExitFrames`, `:2459`) | PROCESS_FRAME |
| 10 | `STATUS_EXIT` clauses (`onExitClause`) | queued + `handleStatusExit` `:2563` | STATUS_EXIT |
| 11 | Reactive triggers / `onTriggerClause` | `:3045` (`handleEngineTrigger`) | ENGINE_TRIGGER |
| 12 | `interpretEffects` from predicates | `:1474, :1513` | predicate body |

Sites 2–8 already run inside `processQueueFrame` *handlers*, but each handler inlines its own clause-eval loop instead of going through one shared dispatch.

### Suspected double UE-gain bug (concrete)
Two UE ingress paths exist today:
- **Path A — DEC frame-marker scan.** `derivedEventController.ts:notifyResourceControllers` (`:328–465`) iterates every registered event and pushes `f.ultimateEnergyGain` (re-resolved via `ultimateEnergyGainNode` for VARY_BY) into `ueController.addUltimateEnergyGain`:
  - Combo events (`:357–372`)
  - Battle events (`:375–388`)
  - Ultimate events (`:391–410`)
  - **Derived status events with `sourceOwnerId !== ownerId`** (`:416–451`) — fans frame UE to the source operator, multiplied by `stacks`.
- **Path B — Interpreter `RECOVER ULTIMATE_ENERGY` clause.** `eventInterpretorController.ts:doRecover :1363–1369` calls `controller.recordUltimateEnergyGain` → same `ueController.addUltimateEnergyGain`.

Both paths terminate at the same `ueController.addUltimateEnergyGain` sink with no dedupe. They are *intended* to be disjoint (Path A reads frame-marker numeric fields; Path B reads clause `RECOVER ULTIMATE_ENERGY`). They will silently double-count whenever a derived status event carries **both**:
- a numeric `ultimateEnergyGain` on its frame markers, and
- a `RECOVER ULTIMATE_ENERGY` clause on the same frame (or on its `clause`/`onEntryClause`).

The SP unification (`recordSkillPointRecovery` in `doRecover :1356`) already split SP cleanly: DEC only handles the *event-level cost* and *recovery-event registration*, never frame-marker SP. UE has not been done.

### Distributed config parsing
- `getStatusConfig` cache (`eventInterpretorController.ts:212–242`)
- `getStatusDef` cache (`:246–261`) — `clearStatusDefCache` called per pipeline run (`:439`)
- `triggerIndex.ts` walks the same defs and re-normalizes them
- Three sub-stores: `getAllOperatorStatuses`, `getAllWeaponStatuses`, `getAllGearStatuses` — merged at every cache build

### Synthetic frame infrastructure already exists
- `QueueFrame.hookType?: FrameHookType` (`eventQueueTypes.ts:147`)
- `FrameHookType.{EVENT_START, EVENT_END, SEGMENT_START, SEGMENT_END}` exist; `ON_FRAME` / `ON_TRIGGER` / `STATUS_*` do not
- `collectFrameEntries` (`eventQueueController.ts:62–229`) already seeds `EVENT_START`, `SEGMENT_START`, `SEGMENT_END`, `EVENT_END`, frame markers, and `COMBO_RESOLVE` per event
- Status events seed their own offset>0 frames + `EVENT_END` + `STATUS_EXIT` from `processNewStatusEvent` (`eventInterpretorController.ts:2439–2533`) — this is the inline-bypass path the refactor must collapse

### Other smells observed
- `DEAL` is in both `NOOP_VERBS` (validation skip) and the live dispatch (`doDeal`) — confusing.
- `RESET STACKS` is commented `// handled by effectExecutor` — `effectExecutor.ts` is otherwise unused (719 lines, orphan).
- Hardcoded `STAT_TO_STATE_ADJECTIVE` (`:162–165`): `SLOW → SLOWED`, `STAGGER_FRAILTY → STAGGERED`. Mirrored as `ADJECTIVE_TO_STAT` in `conditionEvaluator.ts`.
- `getStatusDef` is called twice per status creation: once for `onEntryClause`, once for `clause` (`:2320, :2351`). Cache is hot, but the lookups are still duplicated.

---

## Architectural Invariants (must hold after refactor)

0. **Layering: DEC is the sole mutation surface; interpret() is the sole DEC caller.** Two rules, no exceptions:
   - **Only DEC mutates anything** — event storage *and* sibling controllers (`hpController`, `spController`, `ueController`, `shieldController`, `statAccumulator`). The interpreter never imports a sibling controller directly. The only import the interpreter holds is `DerivedEventController`.
   - **Only `interpret()` calls DEC mutation methods.** No other caller writes to DEC. User-placed skill events arrive as synthetic `APPLY SKILL` clauses produced by the parser; the queue dispatches them; `interpret()` calls a DEC mutation method. There is no `DEC.registerEvents(inputEvents)` step, no `notifyResourceControllers`, no distinction between "registered" and "queue-created" events — every event and every sibling-controller write in the system originated from an `interpret()` call.
   - `TriggerIndex` is held by the interpreter (because triggers are verb-keyed). Reactive checks happen *after* `interpret()` returns from a DEC call: mutate via DEC, then consult the index, then enqueue `ON_TRIGGER` frames. DEC stays storage-pure and knows nothing about triggers.
1. **Zero NO-OP verbs in `interpret()`.** Every dispatched verb must mutate DEC, a resource controller, or the stat accumulator. The `return true` block at `eventInterpretorController.ts:662–666` and the `NOOP_VERBS` set at `:167–171` must be deleted. `DEAL` exits `NOOP_VERBS` because it does mutate.
2. **One uniform clause-dispatch path: queue + `hookType`.** Every clause source — `onEntryClause`, `onExitClause`, status `clause`, frame-marker `clauses`, status frame markers (any offset), `onTriggerClause`, talent passive `clause` — is enqueued as a `QueueFrame` with a `hookType`, and `processQueueFrame` is the only place that calls `interpret()`. No clause-loop code in `processNewStatusEvent`, `EVENT_START`/`EVENT_END` handlers, segment handlers, or `runEventQueue`'s talent loop.
3. **Resource gains have exactly one ingress.** SP and UE are written **only** by `interpret() → doRecover()`. DEC's `notifyResourceControllers` is deleted; the work that legitimately needs to happen at registration time (battle skill SP cost, perfect-dodge SP, ultimate `addConsume`/`addNoGainWindow`, IGNORE flag) is either parsed into clauses or moved to a focused `registerSkillEventCost` method that explicitly does *not* read `frame.ultimateEnergyGain`.
4. **Grammar/value resolution lives in the parser.** `IS`-constant unwrap, `VARY_BY` resolution, qualified status-ID composition (`CRYO + FRAGILITY → CRYO_FRAGILITY`), and `FIRST_MATCH`/`ALL` clause filtering happen at parse time. Interpreter receives fully-resolved numeric values, fully-qualified IDs, pre-filtered clause lists.
5. **Single status def cache.** One cache, built once at app startup, consumed by interpreter, DEC, TriggerIndex. No `_statusConfigCache` + `_statusDefCache` duplication; no per-pipeline `clearStatusDefCache`.
6. **Single column-ID resolver.** One file, three call sites (interpreter, conditionEvaluator, triggerIndex) — all import it.

---

## Plan

### Phase 0 — ParsedValueStore + clause-only effects (absorbs original Phase 3)
**Goal:** every effect on a frame exists as a DSL clause and only as a DSL clause. Parser-resolvable numeric values (constants, VARY_BY TL/POT/suppliedParameters) are resolved ONCE at parse time into a new `ParsedValueStore`. Everyone — view layer, interpreter, DEC — reads values through a unified `findValue` API that consults the `OverrideStore` (per-event user edits, existing) and `ParsedValueStore` (parser-resolved, new). No cached numeric fields on view-layer types. No runtime re-resolution of parser-resolvable ValueNodes.

**Architecture:**

**Two stores, clean layering:**
1. **`ParsedValueStore` (NEW)** — built at parse time. Key: lexical position `(skillId, segmentIndex, frameIndex, effectIndex, field)`. Holds pre-resolved numeric values from evaluating ValueNodes against the current loadout snapshot. Runtime-dependent nodes (STACKS, CURRENT_HP_%, etc.) are NOT written — parser skips them.
2. **`OverrideStore` (EXISTS, `consts/overrideTypes.ts`)** — per-event, keyed by `${id}:${ownerId}:${columnId}:${startFrame}`. Already has `jsonOverrides: Record<path, number>` for user edits. Continues to be the user-edit layer; no schema changes.

**Unified read API:** `findValue(eventKey, lexicalKey, field) → number | undefined`
1. If `OverrideStore[eventKey].jsonOverrides` has a path matching this field → return override (user edit wins).
2. Else if `ParsedValueStore[lexicalKey]` has the resolved value → return it.
3. Else the field is runtime-dependent → caller falls back to the interpreter's existing ValueNode resolution with full `EvaluationContext`.

**Callers (all identical):**
- View: `EventPane`, `DamageBreakdownPane`, `UnifiedCustomizer` call `findValue` when rendering a numeric display. Zero cached numeric fields on `EventSegmentFrame`.
- Interpreter: `doRecover`/`doDeal`/`doApply` call `findValue(ctx.currentEvent, clauseKey, field)` instead of `resolveValueNode(ef.with.value, ctx)`. Runtime ValueNode resolution path remains for keys not in the store.
- DEC: never calls `findValue` directly — receives already-resolved numbers from `interpret()`.

**Parser responsibilities:**
- Walk each JSON config once.
- For each clause effect with a ValueNode, attempt resolution against the loadout. If parser-resolvable, write to `ParsedValueStore`.
- Push clause onto `clauseEffects` in canonical DSL form, tagged with its lexical key. Never strip a clause. Never store a numeric value on the frame class.

**Audit of parser branches in `dataDrivenEventFrames.ts:264–358` (must all be fixed in Phase 0):**

| # | Branch | Line | Current behavior | Fix |
|---|--------|------|------------------|-----|
| 1 | `RECOVER ULTIMATE_ENERGY` | :273–278 | Silent strip → `_ultimateEnergyGain` number, clause dropped, DEC scans and writes via parallel path | Push dsl, write resolved value to `ParsedValueStore`, delete raw field, delete DEC scan blocks at `:368, :384, :406, :444` |
| 2 | `RECOVER SKILL_POINT` | :272 | Dual write → `_skillPointRecovery` + dsl. Fallback exists at `skillPointController.ts:222–235` | Push dsl only, write to store, delete raw field, delete fallback, fix `basicAttackController.ts:33, 75` to emit clause instead of mutating raw field |
| 3 | `DEAL STAGGER` | :327–330 | Extracts `_stagger` + pushes non-dsl `{ type: 'applyStagger' }` | Push dsl (`DEAL STAGGER`), write to store, delete raw field, delete `applyStagger` variant from `FrameClauseEffect` type |
| 4 | `DEAL DAMAGE` | :310–326 | Extracts `FrameDealDamage` struct + pushes non-dsl `{ type: 'dealDamage' }` | Push dsl (`DEAL DAMAGE`), write multipliers/mainStat to store, delete `FrameDealDamage` struct, rewrite `damageTableBuilder` / `frameCalculator` / `calculationController` / `damageFormulas` to read clauses + `findValue` directly. **Higher-risk migration.** |

**Deletions (absolute — CI-enforced):**
- `_ultimateEnergyGain`, `_ultimateEnergyGainNode`, `_skillPointRecovery`, `_stagger`, `_dealDamage` fields + getters on `DataDrivenEventFrame` / `SkillEventFrame` / subclasses
- `ultimateEnergyGain`, `skillPointRecovery`, `stagger`, `dealDamage`, `damageMultiplier`, `ultimateEnergyGainNode` fields on `EventSegmentFrame` view types (`consts/viewTypes.ts`)
- `buildUltimateEnergyValueContext` in DEC
- `skill.ultimateEnergyGain` top-level field on operator registry (replaced by `findValue` against the skill's parsed clauses)
- `FrameClauseEffect` variants `dealDamage` and `applyStagger` (collapses to `{ type: 'dsl', dslEffect }`)
- Every runtime `resolveValueNode` call for parser-resolvable fields (keeps runtime-dependent calls)

**Sub-commit breakdown (each ships in isolation, each fully honors the "no parallel paths" rule for its scope — no half-migrated states):**

**0a — `ParsedValueStore` infrastructure + UE migration**
1. Create `src/controller/timeline/parsedValueStore.ts` with the store type, `build()` walking all configs, and `findValue(eventKey, lexicalKey, field)` unified API consulting both `OverrideStore` and `ParsedValueStore`.
2. Introduce `chainRef: { sourceSlotId, sourceOperatorId, sourceEventUid }` on the interpreter context and on `QueueFrame`; migrate existing `sourceEventUid` usages to `chainRef.sourceEventUid`; populate at every derived-event creation site.
3. Parser: fix `dataDrivenEventFrames.ts:273–278` to push UE clause as dsl and write resolved value to store.
4. Delete `_ultimateEnergyGain` / `_ultimateEnergyGainNode` fields + getters on `DataDrivenEventFrame`.
5. Delete `EventSegmentFrame.ultimateEnergyGain` + `.ultimateEnergyGainNode` from `viewTypes.ts` and everywhere it's written (`skillEventFrame.ts:111`, `basicAttackController.ts:57–66`, `columnBuilder.ts` skill→marker propagation sites).
6. Rewrite the 21 UE-field consumers: view-layer displays call `findValue`; `basicAttackController` finisher logic emits clauses instead of mutating markers; context-menu/input-event user edits write to `OverrideStore.jsonOverrides` at the clause's path.
7. Delete DEC's four `addUltimateEnergyGain` blocks (`:368, :384, :406, :444`) and the `:416–451` derived-status `sourceOwnerId` routing block. Replace with chain-ref-based routing in `interpret() → doRecover`.
8. Fix the `stackCount * selfGain` bug at `:435, :445` — per-pierce events contribute one gain each, no stack multiplication.
9. Delete `buildUltimateEnergyValueContext`.
10. Regression tests: `ultimateEnergySingleIngress.test.ts` (one UE delta per gain event), verify THUNDERLANCE_PIERCE totals.
11. Run full UE-sensitive test suite (`ultimate avywenna estella gilberta lastRite`); document any expected-value drift with call-site evidence (Phase 0 exception).

**0b — SP migration + perfect-dodge-as-JSON**
1. Parser: fix SP branch at `:272` to push dsl only, write resolved value to store.
2. Delete `_skillPointRecovery` + `getSkillPointRecovery` from frame classes.
3. Delete `EventSegmentFrame.skillPointRecovery` + consumers.
4. Fix `basicAttackController.ts:33, 75` finisher SP logic to emit a clause on the final frame (not mutate marker).
5. Delete `skillPointController.ts:222–235` fallback branch ("finishers without clauses").
6. Create `src/model/game-data/generic/` directory + loader modeled on `weaponSkillsStore.ts:189–199`.
7. Create `src/model/game-data/generic/skill-perfect-dodge.json` — single segment, single frame, `RECOVER SKILL_POINT` clause with `GENERAL_MECHANICS.skillPoints.perfectDodgeRecovery` value.
8. Rewire perfect-dodge detection to emit this skill event through the normal event pipeline instead of the `derivedEventController.ts:346–351` block. Delete that block.
9. Regression test: `skillPointPerfectDodge.test.ts` — one SP delta per dodge, via the clause path.
10. Run SP-sensitive tests.

**0c — Stagger migration**
1. Parser: fix STAGGER branch at `:327–330` to push dsl only.
2. Delete `_stagger` + `getStagger`, `EventSegmentFrame.stagger`, `applyStagger` FrameClauseEffect variant.
3. Rewire every stagger consumer (`lift.ts`, `columnBuilder.ts`, `basicAttackController.ts`, etc.) to read via `findValue` or receive resolved stagger from a DSL dispatch.
4. Run stagger/frailty tests.

**0d — Damage migration (highest risk)**
1. Parser: fix DEAL branch at `:310–326` to push dsl only, write multipliers/mainStat to store.
2. Delete `FrameDealDamage` struct, `dealDamage` FrameClauseEffect variant, `_dealDamage` field + getter.
3. Delete `EventSegmentFrame.dealDamage` and `.damageMultiplier`.
4. Rewrite `damageTableBuilder`, `frameCalculator`, `calculationController`, `damageFormulas` to consume clauses + `findValue` directly. The damage calc layer remains read-only (Invariant 0 holds).
5. Full integration suite regression run. Damage calc test expected values are IMMUTABLE per `CLAUDE.md` — fix the code if anything drifts.
6. Add CI guards #18 entries: `frame\.(ultimateEnergyGain|skillPointRecovery|stagger|dealDamage|damageMultiplier|ultimateEnergyGainNode)`, `type:\s*['"](dealDamage|applyStagger)['"]`, `_ultimateEnergyGain|_skillPointRecovery|_stagger|_dealDamage`, `getUltimateEnergyGain|getSkillPointRecovery|getDealDamage`.

**Phase 0 acceptance bar (ALL must hold after sub-commit 0d lands):**

**Audit of parser branches in `dataDrivenEventFrames.ts:264–358` (must all be fixed in Phase 0):**

| # | Branch | Line | Current behavior | Fix |
|---|--------|------|------------------|-----|
| 1 | `RECOVER ULTIMATE_ENERGY` | :273–278 | Silent strip → `_ultimateEnergyGain` number, clause dropped, DEC scans and writes via parallel path | Push dsl, delete raw field, delete DEC scan blocks at `:368, :384, :406, :444` |
| 2 | `RECOVER SKILL_POINT` | :272 | Dual write → `_skillPointRecovery` + dsl. Fallback exists at `skillPointController.ts:222–235` for frames with raw field but no clause | Push dsl only, delete raw field, delete fallback, fix `basicAttackController.ts:33, 75` to emit clause instead of mutating `finalFrame.skillPointRecovery` |
| 3 | `DEAL STAGGER` | :327–330 | Extracts `_stagger` number + pushes non-dsl `{ type: 'applyStagger' }` | Push dsl (`DEAL STAGGER`), delete raw field, consumers read from dispatched clause context |
| 4 | `DEAL DAMAGE` | :310–326 | Extracts `FrameDealDamage` struct + pushes non-dsl `{ type: 'dealDamage' }`. Consumed by `damageTableBuilder`, `frameCalculator`, `calculationController` as a pre-built struct | Push dsl (`DEAL DAMAGE`), delete `FrameDealDamage` struct extraction. Damage calc layer reads the clause directly (still read-only — fine under Invariant 0 as long as nothing writes to `hpController` outside DEC). Higher-risk migration because the damage table builder currently depends on the pre-built struct shape. |

**Categories that stay unchanged:**
- `PERFORM FINAL_STRIKE/FINISHER/DIVE` (`:346–356`) — metadata tag (`frameTypes[]`), not an effect. Not a parallel path.
- `APPLY ... TRIGGER` (`:284–285`) — sets `duplicateSource` bool for combo trigger routing. Already flagged for Phase 4e; leave alone in Phase 0.

**Phase 0 acceptance bar (ALL must hold after sub-commit 0d lands):**
- Zero parser branches extract raw numeric fields from clauses. The `dataDrivenEventFrames.ts` parser's only job is to push DSL clauses onto `clauseEffects` and classify frame metadata (frame types, clause conditions). No `sp = ...`, `stagger = ...`, `ultimateEnergyGain = ...`, `dealDamage = {...}` locals survive.
- Zero non-dsl `FrameClauseEffect` variants. The `FrameClauseEffect` type collapses to `{ type: 'dsl', dslEffect: Effect }` as its only shape. `dealDamage` and `applyStagger` variants are deleted from the type and from every consumer.
- Zero raw extracted fields on frame classes. `_ultimateEnergyGain`, `_ultimateEnergyGainNode`, `_skillPointRecovery`, `_stagger`, `_dealDamage` and their getters (`getUltimateEnergyGain`, `getSkillPointRecovery`, `getDealDamage`, etc.) are deleted from `DataDrivenEventFrame`, `SkillEventFrame` (abstract), and every subclass. The view-layer projection `{ skillPointRecovery, ultimateEnergyGain, dealDamage, stagger }` on frame markers is deleted.
- Zero consumers of raw frame fields. Grep `frame\.(ultimateEnergyGain|skillPointRecovery|stagger|dealDamage|damageMultiplier|ultimateEnergyGainNode)` across `src/` returns zero hits. Grep `getUltimateEnergyGain|getSkillPointRecovery|getDealDamage` returns zero hits.
- Every effect routes through one path: `parse → clauseEffects.push(dsl) → QueueFrame → processQueueFrame → interpret() → doX() → DEC.* → sibling controller`. There is no second dispatch surface in `processQueueFrame` for non-dsl effect types.
- Damage calc layer (`damageTableBuilder`, `frameCalculator`, `calculationController`, `damageFormulas`) reads clauses directly from the frame's `clauses` structure, or reads resolved per-frame totals from `hpController`/`ueController`/etc. It does NOT read a pre-built `FrameDealDamage` struct. It still performs no writes (Invariant 0 unchanged).
- DEC has zero parallel resource-ingress blocks. `notifyResourceControllers`' four `addUltimateEnergyGain` blocks, the perfect-dodge SP block, and the `:416–451` derived-status sourceOwnerId routing block are all deleted. `ueController.addUltimateEnergyGain` and `spController.addRecovery` each have exactly one caller chain: `interpret → doRecover → DEC.recordUltimateEnergyGain / DEC.recordSkillPointRecovery → controller`.
- New CI guards appended to acceptance criterion #18:
  - `frame\.(ultimateEnergyGain|skillPointRecovery|stagger|dealDamage|damageMultiplier|ultimateEnergyGainNode)`
  - `type:\s*['"](dealDamage|applyStagger)['"]`
  - `_ultimateEnergyGain|_skillPointRecovery|_stagger|_dealDamage`
  - `getUltimateEnergyGain|getSkillPointRecovery|getDealDamage`

**Non-negotiable:** if any sub-commit (0a/0b/0c/0d) lands with one of the above still present, Phase 0 is not done. No "we'll clean up the last one in Phase 1" shortcuts. Every sub-commit makes forward progress without leaving a half-migrated state.

**Architectural commitments decided 2026-04-07:**
- **Causality chain threading via `chainRef`.** A single `chainRef: { sourceSlotId, sourceOperatorId, sourceEventUid }` object propagates from the triggering source event (e.g. Avywenna's battle skill) through every derived event to the leaf frames. This replaces the scattered `sourceEventUid` field on `EvaluationContext`/interpreter context (`conditionEvaluator.ts:69`, `eventInterpretorController.ts:285`) with a single bundled reference that also carries slot and operator identity, so downstream dispatchers don't need to re-resolve anything. When a derived-status frame emits a `RECOVER ULTIMATE_ENERGY` clause, the target operator/slot is read directly from `chainRef` at dispatch time. This replaces the `:416–451` slot-map search entirely, and removes the need for `sourceOwnerId` on `TimelineEvent` as a routing hint. Migration: audit every existing `sourceEventUid` call site and convert to `chainRef.sourceEventUid`; populate `chainRef` uniformly at every point where a derived event is created.
- **No stack multiplication on derived-status UE.** `THUNDERLANCE_PIERCE` and similar statuses are individual events per pierce — each pierce contributes its own single-gain clause. The `stackCount` multiplication at `:435, :445` is a bug. Remove it. Test expected values WILL shift; document each change with call-site evidence per `CLAUDE.md`'s Phase 0 exception.
- **Perfect-dodge SP is its own JSON config.** New generic-mechanic-skill folder at `src/model/game-data/generic/` with a matching loader (modeled on `weaponSkillsStore.ts:189–199`). First file: `skill-perfect-dodge.json` — single segment, single frame, segment-level `{ verb: RECOVER, object: SKILL_POINT, value: <perfectDodgeRecovery const> }`. Perfect-dodge detection emits this skill event through the normal pipeline instead of the hardcoded `derivedEventController.ts:346–351` branch.

**Architectural commitments decided 2026-04-07:**
- **Causality chain threading via `chainRef`.** A single `chainRef: { sourceSlotId, sourceOperatorId, sourceEventUid }` object propagates from the triggering source event (e.g. Avywenna's battle skill) through every derived event to the leaf frames. This replaces the scattered `sourceEventUid` field on `EvaluationContext`/interpreter context (`conditionEvaluator.ts:69`, `eventInterpretorController.ts:285`) with a single bundled reference that also carries slot and operator identity, so downstream dispatchers don't need to re-resolve anything. When a derived-status frame emits a `RECOVER ULTIMATE_ENERGY` clause, the target operator/slot is read directly from `chainRef` at dispatch time. This replaces the `:416–451` slot-map search entirely, and removes the need for `sourceOwnerId` on `TimelineEvent` as a routing hint. Migration: audit every existing `sourceEventUid` call site and convert to `chainRef.sourceEventUid`; populate `chainRef` uniformly at every point where a derived event is created.
- **No stack multiplication on derived-status UE.** `THUNDERLANCE_PIERCE` (and any similar status) is an individual event per pierce — each pierce event contributes its own single-gain clause. The `stackCount` multiplication at `:435, :445` is a bug: it conflates stacks-on-a-single-event with count-of-events. Remove it. If a status genuinely needs "N stacks → N×gain" semantics in the future, that's a separate DSL construct (`RECOVER UE with (STACKS * N)`), not a retro-multiplication in DEC.
- **Perfect-dodge SP is its own JSON config.** Create a new generic-mechanic skill folder at `src/model/game-data/generic/` with a matching loader (modeled on the weapon-generic loader in `weaponSkillsStore.ts:189–199`, but for mechanic-level skills, not weapon skills). First file: `src/model/game-data/generic/skill-perfect-dodge.json` — single segment, single frame, one segment-level effect `{ verb: RECOVER, object: SKILL_POINT, value: <perfectDodgeRecovery const> }`. Whatever currently sets `ev.isPerfectDodge = true` at dodge-detection time emits this skill event through the normal event pipeline instead of relying on the hardcoded `derivedEventController.ts:346–351` branch. This establishes the pattern for other generic mechanics (parry bonuses, on-defeat hooks, etc.) to follow later.

**Steps:**

1. **Reproduce the double-UE bug.** Instrument `ueController.addUltimateEnergyGain` to log call sites, run `npx jest src/tests/integration/operators/avywenna` + Estella + Last Rite, confirm two callers per gain event (interpreter path + DEC `notifyResourceControllers` path).
2. **Introduce the causality chain reference.** Add a `chainRef` (or reuse an existing lineage field if one exists — audit `QueueFrame`/`TimelineEvent` first) that threads from the user-placed source event through every downstream derived event and frame. The chain carries: source operator ID, source slot ID, source event UID. All derived events created during interpretation inherit the parent's `chainRef` unchanged.
3. **Stop the parser from dropping UE clauses.** The root cause of the double-gain bug: `dataDrivenEventFrames.ts:273–278` reads the `RECOVER ULTIMATE_ENERGY` DSL clause from the JSON and — instead of pushing it onto `clauseEffects` like the SP branch at `:272` does — extracts the numeric value into a separate `_ultimateEnergyGain` field on the parsed frame. The clause is silently stripped from the interpretation path, and DEC's `notifyResourceControllers` scan was added to compensate (creating the parallel write path). The fix: make the UE branch behave identically to the SP branch — `clauseEffects.push({ type: 'dsl', dslEffect: ef as Effect })` — and delete the `_ultimateEnergyGain` / `_ultimateEnergyGainNode` fields, getters, and constructor logic entirely. The JSON configs already express this correctly as DSL; no config migration is needed. Same treatment for `teamUltimateEnergyGain` if a similar stripping path exists — audit and fix.

   **Downstream cleanup (all files reading `ultimateEnergyGain` off a frame must change):** `derivedEventController.ts` (the four parallel-path blocks to delete anyway), `skillEventFrame.ts`, `columnBuilder.ts`, `basicAttackController.ts`, `inputEventController.ts`, `contextMenuController.ts`, `tacticalEventGenerator.ts`, `operatorRegistry.ts`, `loadoutPaneController.ts`, `EventPane.tsx`, `DamageBreakdownPane.tsx`, `UnifiedCustomizer.tsx`, `appStateController.ts`, `useApp.ts`, `ultimateEnergyController.ts`, `viewTypes.ts`, `ultimateEnergyValidation.test.ts`, `sharing.test.ts`, `skillPointController.ts`. Each consumer either (a) no longer needs the field because its value now arrives through `interpret()` + DEC, or (b) is a view-layer display that should read from `ueController`'s resolved per-frame totals instead of the raw frame field. Audit each site during implementation.
   - `ultimateEnergyGain: N` → `{ verb: RECOVER, object: ULTIMATE_ENERGY, to: OPERATOR, toDeterminer: SELF, value: <node> }`
   - `teamUltimateEnergyGain: N` → `{ verb: RECOVER, object: ULTIMATE_ENERGY, to: TEAM, value: <node> }`
   When `doRecover` dispatches these, it reads the chain reference on the frame and routes the gain to the chain's source slot — no slot-map search, no `sourceOwnerId` fallback.
4. **Promote perfect-dodge SP into a generic skill.** Create `src/model/game-data/generic/perfect-dodge-skill.json` (or appropriate location — check existing generic-skill conventions first): single segment, single frame, one effect `{ verb: RECOVER, object: SKILL_POINT, value: <perfectDodgeRecovery const> }`. Update whatever currently sets `ev.isPerfectDodge = true` to emit this skill event through the normal ingress path instead. Delete `isPerfectDodge` field if it becomes unused; if other code reads it for display, leave the field but stop using it to drive SP recovery.
5. **Cut the DEC parallel paths.** Delete:
   - Four `addUltimateEnergyGain` blocks at `derivedEventController.ts:368, :384, :406, :444`
   - Perfect-dodge `addRecovery` at `:347–351`
   - The entire `:416–451` derived-status sourceOwnerId routing block (replaced by chain reference)
   - `buildUltimateEnergyValueContext` if it has no remaining callers
   Keep: `addConsume`, `addNoGainWindow`, `setIgnoreExternalGain`, `addCost`, `addSpRecoveryEvent`, and the `addRecovery`/`addUltimateEnergyGain` methods themselves (they're now called only via `DEC.recordSkillPointRecovery` / `DEC.recordUltimateEnergyGain`).
6. **Regression tests.**
   - `src/tests/integration/mechanics/ultimateEnergySingleIngress.test.ts` — single battle skill with a derived-status UE frame, assert exactly one UE delta per gain event, snapshot UE total.
   - `src/tests/integration/mechanics/skillPointPerfectDodge.test.ts` — simulate a perfect-dodge event, assert SP recovery arrives via the synthetic skill path, assert exactly one SP delta.
   - `src/tests/integration/operators/avywenna` — verify THUNDERLANCE_PIERCE UE gain is per-event, not per-stack. Expected values WILL change if the pre-fix test was passing against the double-counted total; document each change with call-site evidence per `CLAUDE.md`'s zero-tolerance rule exception for Phase 0.
7. **Run all existing UE/SP-sensitive tests.** `npx jest --listTests | grep -iE 'ultimate|ue|avywenna|estella|gilberta|lastRite|skillPoint|sp|perfectDodge'`, run them, document any expected-value drift.

### Phase 0a execution blueprint (self-contained — start a fresh session from here)

**Premise established during planning:**
- The interpreter's `doRecover` at `eventInterpretorController.ts:1363–1369` already handles `RECOVER ULTIMATE_ENERGY` correctly via `resolveWith(effect.with?.value, ctx)` and `recordUltimateEnergyGain`. The ONLY reason UE double-gains today is that the parser at `dataDrivenEventFrames.ts:273–278` silently strips the UE clause from `clauseEffects` and extracts it into a raw `_ultimateEnergyGain` field. DEC's `notifyResourceControllers` compensates with a parallel scan. Fix = stop stripping, delete parallel scan, let the existing `doRecover` path handle it.
- `ParsedValueStore` is NOT needed for 0a — the interpreter's existing runtime `resolveWith` path handles value resolution. `ParsedValueStore` arrives in Phase 3 (absorbed into the later sub-phases or as its own phase between 0a and 0b).
- `EventFrameMarker.clauses` already exists (`viewTypes.ts:108–109`). View-layer consumers migrate to walking `marker.clauses[].effects[].dslEffect` instead of reading a cached `marker.ultimateEnergyGain`. Helper: `findUltimateEnergyGainInClauses(clauses, ctx?): number | undefined` — walks clauseEffects, finds RECOVER ULTIMATE_ENERGY dsl effects, resolves via `valueResolver.ts` if loadout context supplied, else returns undefined for VARY_BY nodes without context.
- **Sheet serialization: breaking change accepted.** No migration for old saved sheets. Users restart with fresh sheets post-0a.
- **Interpreter source routing for derived statuses.** Current `:2075–2076` sets `sourceOwnerId: this.resolveOperatorId(event.ownerId)` — for a status applied TO the enemy (THUNDERLANCE_PIERCE), that's the enemy, wrong for UE routing. Fix: when the status event has `sourceOwnerId` set (different from `ownerId`), use it as the interpret ctx source; also resolve the slot via loadoutProperties/slotOperatorMap lookup (same logic the DEC `:425–432` block currently does). This is what enables DEC block deletion.

**Concrete file list (~30 files, must all land in one coherent diff — tree compiles only after all are done):**

**Core structural changes:**
1. `src/model/event-frames/dataDrivenEventFrames.ts`
   - Parser `:273–278`: push `RECOVER ULTIMATE_ENERGY` as `{ type: 'dsl', dslEffect: ef }`, delete raw extraction
   - Delete `_ultimateEnergyGain`, `_ultimateEnergyGainNode` fields, constructor locals, constructor assignments, getters
2. `src/model/event-frames/skillEventFrame.ts`
   - Delete abstract `getUltimateEnergyGain()`
   - Delete `marker.ultimateEnergyGain` / `.ultimateEnergyGainNode` population in `toMarker`
3. `src/consts/viewTypes.ts`
   - Delete `ultimateEnergyGain`, `ultimateEnergyGainNode`, `teamUltimateEnergyGain`, `ultimateEnergyGainByEnemies` from `EventFrameMarker` (`:135–141`)
   - Delete same fields from `EventSegmentData` (`:211, 215`), `TimelineEvent` (`:388, 392`), and sheet types (`:424, 428`)
   - Delete from `SkillDef` (`:18, 22`) — combo skills expose UE via parsed clauses
4. `src/controller/timeline/derivedEventController.ts`
   - Delete four `addUltimateEnergyGain` scan blocks at `:368, :384, :406, :444`
   - Delete `:416–451` derived-status sourceOwnerId routing block
   - Delete `buildUltimateEnergyValueContext`
   - Verify `:336` `spController.addCost` call still works (may need signature change if `ultimateEnergyGainFrame` arg becomes unused)
5. `src/controller/timeline/eventInterpretorController.ts`
   - Fix ctx construction at `:2075–2076` to use `event.sourceOwnerId ?? event.ownerId` for source routing
   - Add slot lookup: map source operator ID → slot ID via `this.loadoutProperties`/`this.slotOperatorMap` (same logic as current DEC `:425–432`)

**Event construction / propagation:**
6. `src/controller/events/basicAttackController.ts` (`:21, 33, 43, 57–66, 75, 91, 93`)
   - Stop propagating UE options into markers; combo/BA UE gains are already in parsed clauses
   - Finisher UE logic (`:75, :91`) — emit a clause on the final frame instead of mutating marker
7. `src/controller/timeline/columnBuilder.ts` (`:532, 534, 644, 651, 667, 670, 673, 678, 695, 714, 782, 784, 798`)
   - Stop passing `skill.ultimateEnergyGain` / `.ultimateEnergyGainByEnemies` as `SkillSegmentBuilder.buildSegments` options
   - The parsed clauses on each frame already carry the UE effect
8. `src/controller/operators/operatorRegistry.ts` (`:152, 154`)
   - Delete `ultimateEnergyGain` / `ultimateEnergyGainByEnemies` population on the SkillDef shape
9. `src/controller/events/tacticalEventGenerator.ts` (`:47, 80, 110, 117`)
   - Tactical items that grant UE emit events with a `RECOVER ULTIMATE_ENERGY` clause on their first frame, not a raw `ultimateEnergyGains` array

**User-edit / UI paths:**
10. `src/controller/timeline/contextMenuController.ts` (`:410, 412, 446, 448`)
    - When user creates a freeform event with UE, write a clause on the first frame, not a raw field
11. `src/controller/timeline/inputEventController.ts` (`:385, 387, 422, 424, 580`)
    - Same treatment
12. `src/view/info-pane/EventPane.tsx` (`:312–338, :813`)
    - User-edit path: `ultimateEnergyGainByEnemies` selector writes an override clause
    - Display path: call `findUltimateEnergyGainInClauses(dFrame.clauses)` instead of reading `dFrame.ultimateEnergyGain`
13. `src/view/info-pane/DamageBreakdownPane.tsx` (`:70`)
    - Display via clause helper
14. `src/view/custom/UnifiedCustomizer.tsx` (`:1133–1134, 1184, 1990`)
    - Display via clause helper
15. `src/controller/info-pane/loadoutPaneController.ts` (`:541, 717, 725`)
    - Drop UE from the pane data shape OR compute from clauses
16. `src/controller/appStateController.ts` (`:363, 365`)
    - Delete `ev.ultimateEnergyGain` / `.ultimateEnergyGainByEnemies` copy-over from external sheet data
17. `src/app/useApp.ts` (line 1035 — omitted in grep, inspect on edit)

**Other:**
18. `src/controller/timeline/ultimateEnergyController.ts` — update any doc comments referencing the deleted scan path
19. `src/controller/slot/skillPointController.ts` (`:91–103`) — check `addCost` signature; `ultimateEnergyGainFrame` param may become unused
20. **New helper** `src/controller/timeline/clauseQueries.ts` (or similar):
    ```
    findUltimateEnergyGainInClauses(
      clauses: readonly FrameClausePredicate[] | undefined,
      ctx?: ValueResolutionContext,
    ): number | undefined
    ```
    Walks clauseEffects, finds RECOVER ULTIMATE_ENERGY dsl effects, returns resolved number or undefined.

**Tests:**
21. `src/tests/unit/ultimateEnergyValidation.test.ts` — rework frame fixtures to use clauses
22. `src/tests/unit/sharing.test.ts` (`:607, 631, 657`) — delete UE raw field fixtures OR rewrite to clauses
23. `src/tests/unit/laevatainInteractions.test.ts` (`:407`) — delete `getUltimateEnergyGain()` assertion or rewrite to read from clauses
24. **New** `src/tests/integration/mechanics/ultimateEnergySingleIngress.test.ts` — one UE delta per gain event, snapshot total

**DEC parallel-path grep targets (all must go):**
- `derivedEventController.ts`: `addUltimateEnergyGain` (5 call sites including `:416–451` block)
- `derivedEventController.ts`: `buildUltimateEnergyValueContext` (definition + all callers)
- `derivedEventController.ts`: any loop iterating `seg.frames` reading `f.ultimateEnergyGain`

**Acceptance grep (after 0a lands, must all return zero hits in `src/`):**
- `frame\.ultimateEnergyGain(?!By)` — direct raw field reads
- `frame\.ultimateEnergyGainNode`
- `_ultimateEnergyGain\b`
- `getUltimateEnergyGain\b`
- `addUltimateEnergyGain` outside `ueController.ts` definition and `derivedEventController.ts:recordUltimateEnergyGain` (single caller chain)

**Test suite to run green:**
```
npx tsc --noEmit
npx eslint <touched files>
npx jest --testPathPattern 'ultimateEnergy|avywenna|estella|gilberta|lastRite|laevatain|sharing'
npx jest  # full suite
```

Expected test drifts (document each in commit body):
- `avywenna` UE totals — THUNDERLANCE_PIERCE stack-multiply bug fix will reduce UE gained when multiple pierces on one event (was `gain * stacks`, now `gain` per pierce event).
- `ultimateEnergyValidation.test.ts` fixtures — need rewriting since they test raw frame fields.

**Out of scope for 0a (explicitly deferred to 0b/0c/0d or Phase 3):**
- `ParsedValueStore` introduction — Phase 3
- SP parser fix, perfect-dodge as generic JSON — 0b
- Stagger parser fix — 0c
- Damage parser fix — 0d
- `chainRef` bundled type — can defer to Phase 3 (0a uses existing scattered `sourceOwnerId`/`sourceSlotId`/`sourceEventUid` fields)
- `applyJsonOverrides` mutation refactor — deferred to whichever phase ships the ParsedValueStore + findValue unified read layer

### Phase 1 — Single config/parser pass
- New `src/controller/timeline/configCache.ts` exporting `getStatusDef`, `getStatusConfig`, `getOperatorSkillDef` from one cache built once at app startup.
- Delete `_statusConfigCache` + `_statusDefCache` from `eventInterpretorController.ts`. Delete `clearStatusDefCache` and its caller.
- `triggerIndex.ts` consumes the same cache (no second normalization pass).
- `dataDrivenEventFrames.ts:buildSequencesFromOperatorJson` reuses the same clause parser as effect clauses — frame markers become clauses with an offset.

### Phase 2 — Single column-ID resolver — RESOLVED 2026-04-08
- `src/controller/timeline/columnResolution.ts` exports `resolveColumnId` (single-column dispatch) and `resolveColumnIds` (multi-column for scanners), plus the `ELEMENT_TO_INFLICTION_COLUMN`, `INFLICTION_COLUMN_TO_ELEMENT`, and `PHYSICAL_STATUS_VALUES` constants.
- All four call sites import directly from `columnResolution`: `eventInterpretorController.ts` (`resolveColumnId as resolveEffectColumnId`), `conditionEvaluator.ts` (`resolveColumnIds`), `triggerIndex.ts` (`ELEMENT_TO_INFLICTION_COLUMN`), and `triggerMatch.ts` (`resolveColumnIds`, `ELEMENT_TO_INFLICTION_COLUMN`). The transitive re-export through `conditionEvaluator.ts` was deleted.
- Pinned with `src/tests/unit/columnResolution.test.ts` (22 tests covering single + multi resolution, legacy direct INFLICTION form, status/reaction/physical paths, fallthrough, and reverse-mapping invariants).
- Full `npx jest` passes (2230 tests, zero regressions).

### Phase 3 — Move grammar/value resolution into the parser (partial evaluation)
**Key insight:** `src/controller/calculation/valueResolver.ts` already exists and is the unified API. `ValueResolutionContext` (`:18–37`) is already split into static fields (`skillLevel, potential, talentLevel, stats, suppliedParameters, sourceContext`) and runtime callbacks (`getStatusStacks, getEnemyStatusStacks, getEventStacks, consumedStacks`). The refactor is about *who calls it when*, not about building a new API.

- Parser does **partial evaluation**: walk every ValueNode tree at load time with a context that has static fields populated and runtime callbacks `undefined`. Any subtree that resolves to a number collapses into a `ValueLiteral`. Any subtree that depends on a runtime callback survives as-is.
  - `{verb: IS, value: 5}` → literal 5
  - `VARY_BY SKILL_LEVEL` against a known loadout → literal
  - `VARY_BY STATUS LINK_STACKS` → unchanged (depends on `getStatusStacks`)
  - `STACKS of STATUS CONSUMED` → unchanged (depends on `consumedStacks`)
- Cache the partially-evaluated tree per `(opId, skillLevel, potential, talentLevel)` tuple. Invalidate on loadout change.
- Interpreter still calls `resolveValueNode(node, ctx)` exactly as today, but the `node` is now usually a literal and the `ctx` only needs runtime callbacks attached. The "parser-owned" and "DEC-owned" sides of resolution are formalized but neither needs a new API.
- Parser also resolves qualified status IDs (`CRYO + FRAGILITY → CRYO_FRAGILITY`) at load time. Delete the runtime composition in `eventInterpretorController.ts:251–261, :815–868`.
- Parser sorts/filters `FIRST_MATCH` vs `ALL` clauses at load time. Delete `filterClauses` (`:91–108`); interpreter just iterates.
- `wp.verb === IS` runtime checks (`:478`) become unreachable and are deleted.

### Phase 3b — Activate `effectExecutor.ts` (was Phase 6, moved earlier)
**Why earlier:** Phase 4 and Phase 4e collapse clause dispatch onto `effectExecutor.executeMutationSet`. If the executor isn't active yet, those phases reference a code path that doesn't exist. Activate first, then collapse onto it.

- `doApply` and `doConsume` become MutationSet builders; `effectExecutor.executeMutationSet` is the only thing that calls DEC mutation methods from `interpret()`.
- Stacking-capacity, merge, and refresh rules move into the column strategy classes (`InflictionColumn`, `ReactionColumn`, `ConfigDrivenStatusColumn`, `PhysicalStatusColumn`) so the interpreter no longer branches per noun.
- Test: full integration suite. This phase is mechanically heavy but conceptually small — every existing `doApply`/`doConsume` branch becomes one `MutationSet.add(...)` call.

### Phase 4 — Collapse all clause dispatch into the queue (synthetic frames)
**This is the highest-risk phase.** Ship in four sub-commits, each independently testable:

**4a — Add hook types and the shared dispatcher.** Add `FrameHookType.{ON_FRAME, ON_TRIGGER, STATUS_ENTRY, STATUS_PASSIVE, STATUS_EXIT, TALENT_SEED}` to `consts/enums.ts`. Implement `dispatchClauseFrame(entry, clauses)` helper that (1) builds the right `InterpretContext` from `hookType`, (2) evaluates conditions via the single condition evaluator, (3) calls `interpret()` for each effect. No call sites switched yet; lands as dead code. Test: helper unit tests.

**4b — Skill-level handlers (lowest blast radius).** Switch `EVENT_START` (`:1877–1919`), `EVENT_END` (`:1947–1974`), and `SEGMENT_START`/`SEGMENT_END` (`:1980–2021`) handlers to call `dispatchClauseFrame` instead of their inline loops. Test: full integration suite for operators with skill-level `onEntry/onExit`/segment clauses.

**4c — Status clause dispatch (the big one).** Replace `processNewStatusEvent` (`:2319–2425, :2427–2496`) entirely. The status APPLY effect now returns the new event UID; the queue handler enqueues `STATUS_ENTRY` / `STATUS_PASSIVE` / per-frame `ON_FRAME` / `STATUS_EXIT` synthetic frames for it. Delete the inline clause-eval loops, the offset-0 special case, the `pendingExitFrames` mechanism (it survives only as the return value of the create handler). Also delete the talent passive loop in `eventQueueController.ts:307–326` — talents emit `TALENT_SEED` synthetic frames at parser time. Test: full integration suite for every operator with status passives.

**4d — Reactive triggers.** `TriggerIndex` enqueues `ON_TRIGGER` `QueueFrame`s instead of inline-dispatching from `handleEngineTrigger`. The handler becomes a thin shim that builds the queue entry. Test: every operator with `onTriggerClause` (combo triggers, weapon procs, gear effects).

After 4d, `processQueueFrame` is a thin switch on `hookType`/`type` that delegates to `dispatchClauseFrame` for everything. Grep `this\.interpret(` outside `dispatchClauseFrame` and `interpretEffects` must be empty.

### Phase 4e — Eliminate the last three non-DSL effect paths
Three effect paths today bypass `interpret()` and call DEC mutation methods (or `statAccumulator.applyStatDelta`) directly. They are not "special" — their effects can be expressed exactly as parser-emitted clauses dispatched through the queue.

1. **Combo trigger source duplication** (`eventInterpretorController.ts:2027–2046`)
   - Today: when `handleProcessFrame` sees a combo event with `comboTriggerColumnId`, it directly calls `controller.applyEvent` (infliction) or `applyPhysicalStatus` to duplicate the trigger source onto the combo, then calls `checkReactiveTriggers` itself.
   - After: parser detects `comboTriggerColumnId` at load time and emits a synthetic `APPLY INFLICTION/STATUS` clause on the combo's first frame marker, dispatched via the normal `ON_FRAME` hook. `interpret()` runs it like any other clause; the post-mutation reactive trigger check happens automatically through the existing trigger index path.
   - Delete `:2027–2046`.

2. **Stat reversal scheduling** (`eventInterpretorController.ts:685–699` and `:2187`)
   - Today: when an `APPLY STAT` status fires, the interpreter records the delta in `_statReversals` and at expiry frame directly calls `statAccumulator.applyStatDelta(entityId, {stat: -value})` and `popStatSource`. This is the inverse of an `APPLY STAT` clause, hand-written.
   - After: at status creation, the parser auto-emits a synthetic `APPLY STAT with -delta` clause on the `STATUS_EXIT` hook for that status. (Or, more cleanly, `APPLY STAT` in the parser is split at parse time into a forward effect on `STATUS_ENTRY` and an inverse effect on `STATUS_EXIT`, both routed through the same dispatch.) Expiry runs through `interpret()` like every other effect.
   - Delete `_statReversals`, the inline `applyStatDelta` calls, and the `pendingExitFrames` flush logic that exists only to schedule reversals.

3. **HP threshold status application** (`eventInterpretorController.ts:712, 2264` — `maybeApplyHpThresholdStatuses`)
   - Today: polling-after-PROCESS_FRAME exists *because inline skill damage bypasses `interpret()`*. The damage layer (`EventsQueryService` + `frameCalculator`) computes damage as a read pass and updates `hpController` outside the interpreter, so the interpreter never sees the HP change and can't fire reactive triggers. `maybeApplyHpThresholdStatuses` is the workaround.
   - After: route inline skill damage through `interpret(DEAL DAMAGE TO ENEMY)`, the same way SP/UE were unified. `doDeal` calls a new `DEC.dealDamage(target, frame, value)` method; DEC owns the write to `hpController.applyDamage`. After `doDeal` returns from DEC, the interpreter consults `triggerIndex.lookupHpThresholds(oldPct, newPct)` and enqueues `ON_TRIGGER` frames for any thresholds crossed. The interpreter never imports `hpController` directly — only DEC does.
   - **`frameCalculator` and `EventsQueryService` must never write to `hpController`.** They are pure read functions. `EventsQueryService` survives as the read facade over DEC for damage formulas; `frameCalculator` computes damage values from that read. The boundary: computation is read-only, application is `DEC.dealDamage`-only.
   - HP threshold becomes a first-class reactive trigger key (`HP_BELOW:<pct>`), indexed at parser time alongside `APPLY:<statusId>` etc. No polling.
   - Delete `maybeApplyHpThresholdStatuses` and the per-frame call at `:712`. **Also delete `precomputeDamageByFrame` and the call at `eventQueueController.ts:485–488`** — it exists only because today's damage application bypasses the queue. Once `interpret(DEAL DAMAGE)` is the sole HP write path, predicates evaluated reactively at frame F automatically see HP state from every prior frame, because the queue processes frames in order. No forecast pass needed; no look-ahead predicates exist or should exist.
   - This is a bigger change than items 1 and 2 because it requires `frameCalculator`'s enemy HP writes to be re-routed through `interpret(DEAL DAMAGE TO ENEMY)`. The verb dispatch slot already exists in `doDeal :1423` (today only handles `to: OPERATOR`); this phase extends it to `to: ENEMY` and deletes the parallel write path.

After 4e, the only call sites of DEC mutation methods are inside `interpret()` / `effectExecutor.executeMutationSet`. Grep `controller\.applyEvent\|applyStatDelta` outside `interpret`/`doApply`/`doConsume`/`effectExecutor.ts` must be empty.

### Phase 5 — Eliminate NO-OP verbs from `interpret()`
For each NO-OP at `eventInterpretorController.ts:662–666`, decide its real home and delete the case:

| Verb | Real home |
|---|---|
| `REFRESH` | Either an explicit `EXTEND DURATION` mutation in DEC, or a flag on the `APPLY` clause (refresh existing instance instead of stacking). Pick whichever the actual JSON usage requires. |
| `HIT` | Trigger predicate only (`WHEN HIT`). Parser rejects it as a clause effect. |
| `DEFEAT` | Same as HIT — predicate only. |
| `PERFORM` | Same as HIT — predicate only (already used as one in `checkPerformTriggers :2569`). |
| `IGNORE` | Parsed as a status property (e.g. `ignoreExternalUltimateEnergy: true`) on the def, consumed once by `ueController.setIgnoreExternalGain` at status creation. Not a verb. |
| `OVERHEAL` | Display-only metadata on the event payload. Parser stores it on the frame; interpreter never sees it. |
| `EXPERIENCE` | Same as OVERHEAL — display metadata. |
| `MERGE` | Column stacking policy (`StackingMode.MERGE`) on the status def. Parser sets it on the column; interpreter never sees it. |

Also: remove `DEAL` and `RESET` from `NOOP_VERBS` (`:167–171`); they mutate, so they should go through normal `validateVerbObject`. Rename the set to `OBJECT_VALIDATION_EXEMPT` if anything still belongs there, otherwise delete it.

### Phase 7 — Stat-state as a first-class DSL feature
- Replace `STAT_TO_STATE_ADJECTIVE` (`:162–165`) and `ADJECTIVE_TO_STAT` (`conditionEvaluator.ts:20–23`) with one enum-keyed table in `consts/enums.ts`.
- A `StatAccumulator` watcher fires the BECOME / BECOME_NOT transition automatically. Delete the inline checks in `EVENT_END` (`:1932–1946`) and any matching post-hooks in `doApply`/`doConsume`.

### Phase 8 — Everything is a QueueFrame; delete `registerEvents` entirely — RESOLVED 2026-04-08

**Landed state.** `DerivedEventController.createSkillEvent` is the sole event ingress. Control seed, user-placed input events, enemy actions, talent events, and post-drain queue-event re-registration all route through it one event at a time. `registerEvents`, `seedControlledOperator`, `extendedIds`, `markExtended`, `deriveComboActivationWindows`, and `resolveComboTriggerColumns` are deleted. `src/tests/unit/pipelineInvariants.test.ts` pins the deletions.

Key architectural mechanisms:
- **Per-segment raw store** (`rawSegmentDurations`) populated in `_pushToStorage` after deep-cloning segments/frames. Makes `extendSingleEvent` idempotent (reads raw, writes extended in place) and unblocks retroactive re-extension.
- **Retroactive re-extension**: `_maybeRegisterStop` walks overlapping registered events and re-runs `extendSingleEvent` + `computeFramePositions` when a new stop lands. Handles the ordering case where a later user event contributes a stop that should extend earlier events' segments.
- **Reactive queue shift**: `_shiftQueueForNewStop` walks the DEC-owned priority queue and shifts entries past newly-discovered stops. Works hand-in-hand with retroactive re-extension so already-inserted queue frames stay aligned with the new extended timeline.
- **Per-event queue frame emission**: `createSkillEvent` pass 4 emits the event's own PROCESS_FRAME/SEGMENT/EVENT_END/COMBO_RESOLVE queue entries at ingress time. The bulk `flattenEvents` call in `runEventQueue` now handles only derived (freeform infliction/reaction/status) events that bypass `createSkillEvent` entirely.
- **Reactive combo resolution**: `resolveComboTriggersInline` runs per-`createSkillEvent` call; each invocation clears all COMBO_WINDOW events and re-emits via `openComboWindow` (merge-on-insert). No batch pre/post pass.
- **Chain-of-action uid refs** (step 7.5): `TriggerMatch.sourceEventUid` / `TimelineEvent.triggerEventUid` carry a direct event-to-event reference. `duplicateTriggerSource` looks up the source event live from `getAllEvents()` instead of consulting the denormalized `comboTriggerColumnId` string.

**Step 7g unblocked (32b40f02):** uid + `creationInteractionMode` now propagate through `doApply` for freeform user-placed events on derived columns. `InterpretContext` carries `sourceEventColumnId` so propagation is column-scoped — only the child event landing on the SAME column as the source reuses the parent uid (e.g. freeform MF status → MF column), while cross-column side effects (e.g. freeform IE → NATURE infliction) get fresh `derivedEventUid`s. `creationInteractionMode` propagates regardless of column match (no collision risk — it's just a "user input" tag) via `ctx.sourceCreationInteractionMode` → `eventOverrides` → column `add()` → `Object.assign`. The post-pipeline UID/`creationInteractionMode` restoration loop is **deleted**.

**isCrit write-back loop unblocked (01dc02ed):** isCrit is now a per-run display field resolved from the override store on every pipeline pass. NEVER/ALWAYS/EXPECTED modes also read explicit pins from `overrides[buildOverrideKey(event)]?.segments?.[si]?.frames?.[fi]?.isCritical` and write them to the freshly-cloned frame, so explicit MANUAL pins survive any mode switch without raw-state mutation. The post-pipeline write-back loop is **deleted**. The previous test expectation that MANUAL's per-frame `false` defaults also persist across modes was an artifact of the raw-state leak, not a real UX requirement.

**Storage unification (`85fd5f6f`).** Single source for events: `registeredEvents` is the linear list, `stacks` is the per-`(column, owner)` index. `state.output` is deleted. Queue-created events (statuses, inflictions, reactions) enter via a new `DEC.createQueueEvent(ev)` — a *separate* minimal ingress path (not `createSkillEvent` with flags). It registers stops, pushes to both `registeredEvents` and the `stacks` index, and skips everything skill-specific:
- No deep clone (queue events come from column code, not React raw state; tests and interpreter chains holding references see mutations)
- No combo chaining / reaction segments / clamp controls (skill-only)
- No `extendSingleEvent` (queue events pre-populate `rawDurations`, keeping `extendSingleEvent` a no-op for them)
- No `notifyResourceControllers` (queue events hit none of its branches; IGNORE UE flows via `interpret()` since `85912595`)
- No pass 3 (run once post-drain via `resolveCombosNow()`)
- No pass 4 queue frame emission (lifecycle handled inline)

`pushEvent` / `pushEventDirect` / `pushToOutput` / `addEvent` are thin wrappers around `createQueueEvent`. The post-drain re-registration loop in `runEventQueue` is deleted, replaced by a single `state.resolveCombosNow()` call over the full event set to pick up combo windows triggered by queue-created inflictions.

**The bug the earlier attempt missed:** `clampPriorControlEvents` used to do `registeredEvents[j] = { ...prev, segments: [...] }` — replacing the array slot with a new object. The old architecture got away with this because `_activeEventsIn` separately scanned `registeredEvents` and `stacks` (seeing both old and new views). With single-source storage, the stacks index still held the OLD reference and returned the un-truncated seed. `isControlledAt(slot-0, frameAfterSwap)` returned `true` when it should have been `false`. Fixed by mutating `prev.segments` in place via `setEventDuration`: since `_pushToStorage` deep-clones on entry, `prev` is DEC-owned and safe to mutate, and the mutation is visible through both `registeredEvents` and the `stacks` index. This single bug was behind all 17 test failures in the earlier attempt; once fixed, everything else fell into place.

**What's still deferred (not blocking):**
- **7h fold** (extendSingleEvent into computeFramePositions): cosmetic module-boundary shuffle with no behavior payoff. The `extendedIds` guard was the real win and it's deleted.

See `docs/notes/phase-8-plan.md` and `docs/notes/phase-8-progress.md` for the full sub-step history.

---

### Phase 8 — Original plan (historical reference)
**Principle:** every event — user-placed skill, freeform infliction, derived status, talent passive, combo window, controlled-operator seed — is a sequence of synthetic `QueueFrame` entries produced by the parser. There is no distinction between "input" and "derived" events; the parser is the only thing that knows where an event came from.

- Parser flattens every event source into `QueueFrame[]`:
  - User skill placement → `EVENT_START` (carries synthetic `APPLY SKILL` clause) + N `SEGMENT_START/END` + M `ON_FRAME` + `EVENT_END`
  - Freeform infliction → `EVENT_START` (`APPLY INFLICTION` clause)
  - Status def → `STATUS_ENTRY` + `STATUS_PASSIVE` + per-frame `ON_FRAME` + `STATUS_EXIT`
  - Talent passive → `TALENT_SEED` at frame 0
  - Controlled-operator seed → `APPLY CONTROL` clause at frame 0
  - SP recovery (basic-attack finisher) → `RECOVER SKILL_POINT` clause on the finisher frame, **emitted reactively during the queue** when the basic attack runs (no `deriveSPRecoveryEvents` pre-pass)
- `interpret()` gets `doApplySkill` / `doApplyControl` handlers that call DEC mutation methods (`createSkillEvent`, `createControlEvent`).
- **`DEC.createSkillEvent` is decomposed into named, individually-testable steps** so it doesn't become `registerEvents` renamed:
  0. `checkCooldown(ev)` — if there's an existing event on the same owner+column whose CD segment is active at `ev.startFrame`, reject creation (return null). Applies to user-placed events, reactively-created events (e.g. `APPLY COMBO` from a trigger clause), and combo window markers. Silent rejection — reactive effects with no effect are fine.
  1. `chainComboPredecessor(ev)` — if ev is a combo, look backward at the most recent combo on the same owner and truncate it.
  2. `clampPriorControlEvents(ev)` — if ev is a CONTROL event, retroactively shorten prior CONTROL events on other owners so they end at ev.startFrame. (Currently at `derivedEventController.ts:221–234`.)
  3. `buildReactionSegments(ev)` — if ev is a reaction event, materialize corrosion/combustion segments from raw duration.
  4. `computeFramePositions(ev)` — extend segment offsets and frame markers using DEC's current stops list (raw positions if no stops overlap this event). Pure local.
  5. `resolveComboTriggerColumn(ev)` — if ev is a combo, walk `DEC.comboWindows` for entries matching `ev.ownerId` where `ev.startFrame ∈ [w.startFrame, w.endFrame)`, set `ev.comboTriggerColumnId = match.sourceColumnId`. Forward query against already-open windows.
  6. `validateSiblingOverlap(ev)` — attach warnings if ev overlaps an existing sibling in the same column. Pure read.
  7. `pushToStorage(ev)` — append to DEC's event list and column index.
  8. `maybeRegisterStop(ev)` — if ev declares a stop region (combo/ultimate/perfect-dodge with nonzero animation), append to `DEC.stops` and **re-position affected queue entries** (see time-stop section below).
  9. `notifyTriggerIndex(ev)` — return value tells the interpreter which reactive triggers to enqueue. The interpreter calls the index itself after `createSkillEvent` returns.
  Each step is a free function under `derivedEventController/createSkillEvent/`. The "create" method is a thin orchestrator. If any step grows past 50 lines, split it again.

- **`extendSingleEvent` equivalent lives inside step 4 (`computeFramePositions`)** but without the `extendedIds` guard. Because `createSkillEvent` is called exactly once per event in the new model (no re-registration of already-processed events), there is no double-extension risk. The guard goes away by construction.
- **Time-stop discovery is mid-queue reactive, not a batch pre-pass.** The "user-placed stops only" invariant does not hold today (`processTimeStop.isTimeStopEvent` returns true for any combo/ultimate/perfect-dodge with nonzero animation, and `addEvent` calls `maybeRegisterStop` on queue-created events). Reactive combos can create stops mid-drain. Rather than forbid that, we keep reactive stop handling:
  - **Initial queue seeding uses raw (unextended) frame positions.** Parser produces `QueueFrame[]` with frame positions computed as `event.startFrame + cumulativeSegmentOffset + rawFrameOffset`. No stop extension applied at seed time.
  - **The priority queue lives on DEC.** `DEC.popNextFrame()` is the only way the interpreter advances the queue. DEC owns seed, drain, re-position, re-heapify.
  - **When `createSkillEvent` step 8 registers a new stop `[S, E]`, DEC walks its own queue.** For every queue entry whose parent event's active range overlaps `[S, E]` AND whose current frame position is strictly greater than `S`, shift the entry's frame by the portion of `[S, E]` that falls inside the entry's offset range (usually the full `E - S`). Re-heapify.
  - **Affected-entry scan is O(queue size) and re-heapify is O(n).** In practice n is small (few hundred entries) and stop registrations are rare. Not a performance concern.
  - **The shift carries all effects with it.** A frame marker's clause effects (`APPLY STAT`, `RECOVER UE`, etc.) fire at the shifted frame, seeing whatever state the stat accumulator / sibling controllers hold at that frame. Stat ordering is naturally correct because the queue still processes frames in strict monotonic order.
  - **Invariant weakens:** the pipeline is no longer a pure forward sweep through queue entries. It is **monotonic in frame** (no frame is processed before frames that came before it) but **not monotonic in queue order** (entries can be re-positioned before being processed). This is fine and must be documented.
- **Combo window markers become fully reactive, not derived post-hoc:**
  - Parser indexes each operator's combo trigger clause as `onTriggerClause` entries in the trigger index, alongside every other reactive trigger.
  - When a triggering event fires and the interpreter consults the trigger index, matching combo-trigger entries are enqueued as `ON_TRIGGER` frames.
  - The `ON_TRIGGER` handler for combo-trigger clauses calls `DEC.openComboWindow(slotId, startFrame, endFrame, sourceColumnId)`. DEC checks the target combo's CD at the trigger's frame using **current** (post-any-applied-reductions) CD state. If CD blocks, the window is silently dropped.
  - If the window is valid, DEC appends it to an internal `comboWindows` list. If it overlaps an existing window on the same slot, it extends the existing entry instead of appending — merging happens at insertion time, not as a post-pass.
  - Window *markers* as display-only derived events (`COMBO_WINDOW_COLUMN_ID`) are generated lazily in the view layer from `DEC.comboWindows`, or emitted as events through `createSkillEvent` during `openComboWindow` — TBD at implementation time, but either way they are not computed by a batch pre-pass or post-pass.
- **Intra-frame priority for CD reductions.** `REDUCE COOLDOWN` effects fire at a **lower priority number** than combo-trigger `ON_TRIGGER` evaluations at the same frame. This handles the Fluorite P5 case: when Cryo is applied at frame 200, Fluorite's P5 CD reduction fires first, then Fluorite's combo trigger clause fires second and sees the reduced CD, so the window is not incorrectly dropped. This is the only known case today where a CD reduction and a combo trigger fire at the same frame. No other operator relies on "CD reduction later in time retroactively unblocks an earlier dropped trigger."
- **Delete `deriveComboActivationWindows` as a standalone function.** Its logic moves into the `ON_TRIGGER` handler plus `DEC.openComboWindow`. Delete `resolveComboTriggersInline` / `resolveComboTriggerColumns` — replaced by the per-combo step 5 in `createSkillEvent`. Delete the post-queue re-derive at `eventQueueController.ts:503–516`.
- **Delete:**
  - `cloneAndSplitEvents`
  - `DEC.registerEvents` and `DEC.addEvent`
  - `extendedIds` guard and `markExtended`
  - Post-queue `state.registerEvents([...queueEvents])` rehydration step
  - `creationInteractionMode` / `uid` restoration (UIDs are stable parser→DEC because nothing reconstructs events)
  - `seedControlledOperator` (becomes a parser-emitted clause)
  - `SkillPointController.deriveSPRecoveryEvents` as a pre-pass (becomes reactive)
  - `validateAll` as a post-pass (per-event validation moves inside `createSkillEvent`)
  - `resolveComboTriggersInline` / `resolveComboTriggerColumns` (replaced by `createSkillEvent` step 5)
  - `deriveComboActivationWindows` as a standalone function (logic moves into `ON_TRIGGER` handler + `DEC.openComboWindow`)
  - Post-queue combo window clamp/re-derive at `eventQueueController.ts:503–516`
  - `clampMultiSkillComboCooldowns` post-queue call
- DEC's public surface shrinks to: `createSkillEvent`, `createInfliction`, `createReaction`, `createStatus`, `createStagger`, `consumeInfliction`, `consumeStatus`, …, plus read-only query methods. No batch ingress, no `notifyResourceControllers`, no `markExtended`, no `validateAll`.
- The pipeline becomes: **parser → queue → interpret → DEC**. There is no other path.

### Phase 9 — Delete every `finalize` call — RESOLVED 2026-04-08

All four sub-steps landed. `spController.finalize`, `ueController.finalize`, `hpController.finalize`, and `shieldController.finalize` are all deleted. Plus IGNORE UE timing smell fixed via `interpret()` dispatch. Plus storage unification (single `allEvents` source) landed as a follow-up.

**9a — `spController.finalize` deleted (`f50277aa`).** SP graph + stops + insufficiency zones + UE consumption notification all reactive:
- `flushSpEvents()` sorts and pushes into the subtimeline on every `addCost`/`addRecovery`, so the SP graph stays current via the existing `subtimeline.subscribe → ResourceTimeline.recompute` path
- `DEC._maybeRegisterStop` forwards stops to `spController.setTimeStops` immediately
- `insufficiencyZones` map auto-rebuilds via an `onGraphChange` listener walking `slotSpCosts`
- SP → UE consumption notification fires from the same `onGraphChange` listener; `UE.onNaturalSpConsumed` is now idempotent (clears entry on `naturalConsumed = 0`)
- `seedSlotCosts` triggers a recompute so the zones map covers every slot

**9b — `ueController.finalize` deleted (`09f31465` + `de64de3a`).** Two parts:

*9b-1+2 — latent retroactive scaling bug fix.* Previously `eventQueueController` called `updateSlotEfficiency` once per slot at the END of the pipeline, reading the final accumulated `ULTIMATE_GAIN_EFFICIENCY` and applying it as a global multiplier to every gain — scaling gains at frames 0..199 by an efficiency boost that only activated at frame 200. Fixed by capturing per-recipient `slotEfficiencies` snapshots at the moment each gain fires:
- `RawUltimateEnergyGainEvent` gains an optional `slotEfficiencies: ReadonlyMap<slotId, efficiency>` snapshot
- `DEC.recordUltimateEnergyGain` populates the snapshot from the stat accumulator at the gain frame (current state IS the state at that frame because the queue drains chronologically)
- `applyGainEfficiency` reads per-recipient from the snapshot when present
- The post-pipeline `updateSlotEfficiency` sweep is deleted

*9b-3+4 — reactive graph computation.* `_computeGraphs()` rebuilds `slotGraphs` from current state on every state change (`addUltimateEnergyGain`, `addConsume`, `addNoGainWindow`, `setBattleSkillGainFrame`, `onNaturalSpConsumed`, `setIgnoreExternalGain`). SP → UE conversion runs from `spController.addCost` pushing battle skill gain frames directly into UE via `setBattleSkillGainFrame`. SP-derived gains tagged with `spDerivedFromUid` for idempotent removal during recompute.

**IGNORE UE timing smell (`85912595`).** Followup to 9b. `IGNORE ULTIMATE_ENERGY` clauses on derived statuses (e.g. Last Rite Vigil Services lockout) used to take effect only at post-drain re-registration via `notifyResourceControllers`'s status-def lookup — long after gains had been processed. The `_computeGraphs` recompute trick papered over it. Now `VerbType.IGNORE` is a real DSL effect dispatched via `interpret()`:
- `VerbType.IGNORE` handler in `interpret()` calls `DEC.setIgnoreExternalGain` for `ULTIMATE_ENERGY`
- `runStatusCreationLifecycle` clause loop accepts `IGNORE UE` alongside `APPLY STAT`
- `runEventQueue` inline talent clause loop accepts both too — talent-typed lockouts fire at frame 0 before any gains process
- `notifyResourceControllers`' status-def lookup deleted

The flag now takes effect at the moment the status's clause is dispatched. No post-drain dependency.

**9c — `hpController.finalize` deleted (`9c60122d`).** The per-slot HP graph + heal summary now rebuild reactively from `addHeal` via a private `_rebuildSlotGraph` helper. Smaller scope than 9a/9b — HP controller has no cross-controller coupling and no global multipliers. `addHeal` calls `_rebuildSlotGraph(tick.targetSlotId)` after appending. Note: `addHeal`/`getSlotHpGraph`/`getSlotHealSummary` are currently only used by tests — production uses operator-keyed `applyHeal`/`getOperatorFlatHp`. The slot-keyed pipeline is dormant production code.

**9d — `shieldController.finalize` deleted (`7d286c99`).** Trivial — the defensive sort was unnecessary. Shield ticks arrive in frame order during the queue drain via `applyShield` calls dispatched by `interpret()`.

**Phase 9 complete.** All four `finalize()` calls are gone. Combined with the storage unification (`85fd5f6f`), `processCombatSimulation`'s post-pipeline work is exactly:

```ts
const processed = state.getProcessedEvents();
return processed;
```

Zero post-pipeline transformation. Single event ingress (`createSkillEvent` for skills, `createQueueEvent` for queue-created derived events — both writing to the same `registeredEvents` store). Every resource controller is reactive. Every field propagates through `interpret()` ctx (uid + creationInteractionMode via the 7g unblock, isCrit via the override store, slot efficiencies via the 9b snapshot, IGNORE UE via interpret() dispatch).

---

### Phase 9b — Crit pin overrides inline at frame creation
**Principle:** if state is tracked per-frame in chronological order, then at any frame F it is correct. Anything you want from it is a point query (answer inline at frame F), a graph for rendering (view-layer projection over the per-frame array), or a reactive predicate (handled by the trigger index). There is no fourth case requiring a batch post-pass. Every `finalize` is design debt.

- **`spController.finalize` → delete.** SP insufficiency markers are emitted inline at each battle skill's `EVENT_START` hook: check `getSp(frame) < cost` and tag the event right there. The "insufficiency zones" overlay becomes a view-layer projection over the per-frame SP array.
- **`ueController.finalize` → delete.** UE efficiency multipliers are applied **at the moment of `addUltimateEnergyGain`** using whatever the stat accumulator says at that frame — not as a global multiplier post-hoc. This also fixes a latent correctness bug: today, an efficiency boost that activates at frame 200 retroactively scales gains at frames < 200. Real-time application is per-frame correct. The `gainFrames` coupling between SP and UE finalize disappears because battle skills emit their `RECOVER ULTIMATE_ENERGY` clause inline at the gain frame.
- **`hpController.finalize` → delete.** HP is updated per-frame by `interpret(DEAL DAMAGE)` / `interpret(RECOVER HP)`. The graph is the per-frame array. View layer reads it directly.
- **`shieldController.finalize` → delete.** Same justification.
- **Combo window clamp / re-derive → delete.** When a combo CD reduction effect fires inside the queue, the affected windows are re-derived reactively at that frame. Or: combo windows are derived lazily in the view from the (already-correct) combo events.
- After Phase 9, there is **no post-queue work** in `processCombatSimulation`. The function ends with `getProcessedEvents()` and returns. No `*.finalize()` calls. No clamp/re-derive. No UID restoration.

### Phase 9b — Crit pin overrides inline at frame creation
- Today: post-queue loop at `eventQueueController.ts:356–369` walks output events and stamps `frame.isCrit` from the override store.
- After: `interpret()` consults the override store at the moment a frame is created (inside `effectExecutor` / `doDeal` / wherever frames are stamped). The override store is just another input the interpreter reads at frame-creation time, like `loadoutProperties`.
- Delete the post-queue loop. No post-queue mutation of frame state.

---

## Open review findings — resolved 2026-04-07

1. **Intra-frame CD reduction vs combo triggers — RESOLVED: non-issue.** All effects at the same frame are processed in their DSL ordering, and the user controls that ordering. There is no secondary priority system — the queue is chronological, and within a frame the DSL-declared order is authoritative. Phase 8 should be written against this model: no intra-frame priority layer, no lazy CD check, no trigger re-evaluation. If Fluorite P5 or similar cases need a specific intra-frame sequence, express it in the DSL order of the config.

2. **SP perfect-dodge — RESOLVED: unify now.** All resource writes go through the same pipeline. Phase 0 must promote SP perfect-dodge to a synthetic `RECOVER SKILL_POINT` clause alongside the UE fix, not defer it to Phase 8. There is no parallel write path exception.

3. **Interpreter calls ONLY DEC — RESOLVED 2026-04-08.** `EventInterpretorController` and `DerivedEventController` remain separate classes, but the interpreter's only collaborator is DEC. Every `hpController`, `shieldController`, and `statAccumulator` field is removed from `EventInterpretorController`; DEC owns those references internally. This covers both writes **and reads** — no "reads are fine" carve-out.

   **Implementation summary:** DEC gained 3 private fields (`hpController`, `shieldController`, `statAccumulator`) wired through `reset()`, plus 14 passthrough methods: writes (`applyStatDelta`, `applyStatMultiplier`, `pushStatSource`, `popStatSource`, `snapshotStatDeltas`, `applyShield`, `absorbShield`, `recoverHp`), reads (`getStat`, `getOperatorIds`, `getOperatorPercentageHp`), and presence guards (`hasStatAccumulator`, `hasHpController`, `hasShieldController`). `recoverHp` accepts negative values and routes to `hpController.applyHeal` (which already treats negative as damage). `absorbShield` returns the residual after shield absorption. `StatSource` is re-exported from DEC so the interpreter never imports `statAccumulator` even as a type.

   All 15 sibling-controller call sites in `eventInterpretorController.ts` plus the 4 predicate-callback closures (lines 2191/2194, 3009/3011 historical) were rewritten to `this.controller.<method>()`. The 3 fields and 3 type imports were deleted from the interpreter, along with the matching `InterpretorOptions` declarations. `eventQueueController.ts:runEventQueue` no longer takes `hpController`/`shieldController`/`statAccumulator` parameters since they only fed the interpreter — they're now passed straight into `state.reset()` from `processCombatSimulation`.

   Grep `(hpController|spController|ueController|shieldController|statAccumulator)` inside `eventInterpretorController.ts` returns **zero hits**. Full `npx jest` passes (2230 tests, zero regressions). Lint + tsc clean. All of the following sites in `eventInterpretorController.ts` get rewritten to `this.dec.*` calls:

   **Writes:**
   - `statAccumulator.applyStatDelta` — `:691` (stat reversal on status removal), `:1009` (stat buff application), `:2187` (per-frame delta replay)
   - `statAccumulator.popStatSource` — `:692`
   - `statAccumulator.pushStatSource` — `:2387`
   - `statAccumulator.applyStatMultiplier` — `:1002`
   - `statAccumulator.snapshotDeltas` — `:2181`
   - `shieldController.applyShield` — `:1034`
   - `shieldController.absorbDamage` — `:1443`
   - `hpController.applyHeal` — `:1419`, `:1448` (negative-heal-as-damage path)

   **Reads (also migrate to DEC):**
   - `hpController.getOperatorIds` — `:1395`
   - `hpController.getOperatorPercentageHp` — `:1401`, plus predicate-callback closures at `:2094`, `:2911`
   - `statAccumulator.getStat` — `:1008`, `:2115`, `:2117`, `:2375`, `:2380`, plus predicate-callback closures at `:2097`, `:2913`

   **DEC API additions required:**
   - Writes: `DEC.applyShield`, `DEC.absorbShield`, `DEC.recoverHp` (handles negative-heal → damage routing internally), `DEC.applyStatDelta`, `DEC.applyStatMultiplier`, `DEC.pushStatSource`, `DEC.popStatSource`, `DEC.snapshotStatDeltas`
   - Reads: `DEC.getOperatorIds`, `DEC.getOperatorPercentageHp`, `DEC.getStat` (all pure passthroughs — read-only delegation is fine on DEC)

   After Phase 4e: `EventInterpretorController` has exactly one collaborator field (`dec: DerivedEventController`). Grep `(hpController|spController|ueController|shieldController|statAccumulator)` inside `eventInterpretorController.ts` must return zero hits. Phase 4e is renamed to "**Phase 4e — Interpreter calls ONLY DEC**" and expanded accordingly.

4. **Crit pin overrides — RESOLVED: move to parse time.** Phase 9b is replaced. The parser intakes both the JSON config **and** the user's crit override store, and emits fully-resolved `isCrit` values on frames at parse time. The interpreter never consults an override store. No post-queue mutation, no second non-DEC import — the override is baked into the parsed `QueueFrame` before the queue drains. Re-parse on override change (same path as any other config edit).

5. **`effectExecutor.ts` orphan code — RESOLVED: delete it.** Phase 3b is replaced with a deletion task. The 719 lines of never-exercised code are removed outright. The central mutation surface is `DerivedEventController`, not `effectExecutor`. All references to `effectExecutor` in later phases are struck.

6. **CI guard (acceptance #18) — RESOLVED: keep as grep-based regression test.** This is not business logic — it's a regression guard that scans `src/` for forbidden patterns (`notifyResourceControllers`, `cloneAndSplitEvents`, `this.interpret(` outside allowed sites, etc.) to prevent the next refactor from silently re-introducing parallel paths. Text-regex limitations (comment false-positives, rename false-negatives) are acceptable for a guard of this kind — the goal is catching accidental regressions, not proving absence. Keep as a jest unit test reading files from disk. Do NOT promote to AST/ESLint — not worth the complexity for a guard rail.

7. **`precomputeDamageByFrame` — RESOLVED: remove entirely.** Delete `precomputeDamageByFrame`, the module-level `_damageTicks` fallback, and the `getEnemyHpPercentage` free function at `calculationController.ts:52, :182`. The damage layer stops pre-computing; all damage resolution happens per-frame through `doDeal → DEC.dealDamage`.

8. **Line range `:1877–1919` for `EVENT_START` — acknowledged.** Correct end is `:1927`. Spot-check other cited line ranges during implementation; do not trust them as authoritative deletion targets.

9. **`processNewStatusEvent` inline dispatch — RESOLVED: keep inline, this is load-bearing.** When `doApply` creates a status event inside an effect loop, the status's creation-time lifecycle (onEntryClause, top-level `clause` APPLY STAT, DISABLE/ENABLE propagation, offset-0 segment frame markers) MUST run synchronously before the outer effect loop advances to effect `i+1`. Reason: effects within a clause run sequentially via a plain `for` loop in `dispatchClauseFrame`; effect `i+1` is expected to observe whatever state effect `i` wrote. If `APPLY STATUS X` at index `i` merely enqueued X's lifecycle as a same-frame `QueueFrame`, effect `i+1` would run **before** the queue resumed — the queue only drains between entries, never mid-entry. X's stat buffs would land "too late" from the perspective of the same-clause siblings, breaking the in-game semantic "applying a status takes effect immediately for the next action in the same effect chain."

   Same-frame FIFO ordering in the queue does not solve this: it governs inter-entry order, not intra-entry order. The current effect loop is still executing — there is no hook to interleave newly-enqueued same-frame work into the middle of it.

   Concretely: offset > 0 segment frames are correctly enqueued (`pendingExitFrames` → `PROCESS_FRAME`); offset-0 segment frames and clause lifecycle run inline and recurse (if an offset-0 frame applies another status Y, Y's creation lifecycle runs inline inside X's, same rules).

   **Implications for Phase 4 (collapse all clause dispatch into the queue):** the inline path must survive as a synchronous re-entry into `dispatchClauseFrame`, not as a queue insertion. Acceptable shapes: (a) `dispatchClauseFrame` takes an optional "run these clauses now, in-process" parameter that short-circuits the queue for creation-time work; (b) a named helper `runStatusOnCreate(status, ctx)` that calls the same dispatch function with a synthetic in-process entry. What is NOT acceptable: enqueuing onEntryClause/clause/offset-0 frames as `QueueFrame`s with the expectation that same-frame FIFO will preserve ordering. It won't — same-frame FIFO is irrelevant here because the outer entry is still mid-execution.

   Naming: `processNewStatusEvent` is a misleading name ("frame" vs "status event"). Rename to `runStatusCreationLifecycle` during Phase 4 to make the purpose explicit. It is NOT a general intra-frame dispatcher — only status creation (from `doApply` + physical status derivation in `registerEvents` → to be removed in Phase 8) routes through it.

## Rollout & verification strategy

Each phase ships as its own commit, gated by the same checklist:

**Per-phase checklist (must all pass before commit):**
1. `npx tsc --noEmit` — zero new errors in files you touched.
2. `npx eslint <touched files>` — zero new warnings.
3. **Targeted tests:** the suite for the area you changed:
   - Phase 0: `npx jest ultimateEnergy spConsumption avywenna estella gilberta lastRite`
   - Phase 1: `npx jest configCache statusConfig`
   - Phase 2: `npx jest columnResolution conditionEvaluator triggerIndex`
   - Phase 3: `npx jest valueNode varyBy clauseFiltering`
   - Phase 4: `npx jest --testPathPattern 'integration/(operators|mechanics)' ` (full integration suite — this is the high-risk phase)
   - Phase 5: `npx jest --testPathPattern 'integration/operators'` (every operator with REFRESH/HIT/DEFEAT/IGNORE/MERGE in their config)
   - Phase 6: full integration suite again
   - Phase 7: `npx jest slow stagger antal estella` (stat-based states)
   - Phase 8: full integration suite
4. **Full test suite:** `npx jest` — must pass with **zero regressions**.
5. **Damage calc tests are immutable.** Per `CLAUDE.md`: "Expected values in operator damage calculation tests MUST NEVER be changed." If a damage test fails, the code is wrong — fix the code, not the test. Exception: Phase 0 may legitimately change a UE-related expected value if and only if that value was previously double-counted; document the change in the commit body with the call-site evidence.
6. **Snapshot one full timeline before/after** in `.claude-temp/`: pick a complex sheet (e.g. Avywenna + Lifeng + Estella P5), export via the sheet save path, then compare `processedEvents` JSON dumps. Any non-UE diff is a regression.
7. **Manual smoke:** load the dev server, place a battle skill + ultimate for a UE-heavy operator, verify SP/UE graphs match the previous build's screenshots.

**Cross-phase invariants checked at every commit:**
- `interpret()`'s switch statement contains zero `return true` branches with no side effect (after Phase 5).
- Grep `this.interpret(` outside `processQueueFrame` and its handlers — must be empty (after Phase 4).
- Grep `addUltimateEnergyGain` — must have exactly one caller chain (`doRecover → recordUltimateEnergyGain → addUltimateEnergyGain`) (after Phase 0).
- Grep `_statusConfigCache\|_statusDefCache\|clearStatusDefCache` — must be empty (after Phase 1).

## Acceptance criteria (final)

The refactor is complete when **all** of the following hold:

1. **Pipeline shape:** `processCombatSimulation` is a single linear function: reset → `statAccumulator.init` → `TriggerIndex.build` → parser (which includes time-stop discovery) → seed queue → drain queue → `getProcessedEvents()`. The only batch pre-passes are `TriggerIndex.build`, `statAccumulator.init`, and time-stop discovery (inside the parser, walks user-placed skill events in `startFrame` order to build the complete stops list before queue seeding). No post-queue work at all.
2. **Layering — DEC is the sole mutation surface.** DEC owns every write to event storage, `hpController`, `spController`, `ueController`, `shieldController`, and `statAccumulator`. No other code path writes to any of them. Grep `hpController\.\|spController\.\|ueController\.\|shieldController\.\|statAccumulator\.applyStatDelta` outside `derivedEventController.ts` must return zero hits (excluding tests and read-only `.get*` queries).
3. **Layering — `interpret()` is the sole DEC caller.** No code outside `interpret()` and its handlers (`doApply`, `doConsume`, `doDeal`, `doRecover`, …) calls a DEC mutation method. The interpreter never imports a sibling controller directly; its only mutation import is `DerivedEventController`. Grep proves it.
4. **Single dispatch surface:** Every clause source is dispatched through `QueueFrame` + `hookType`. The only call sites of `interpret()` are (a) inside `dispatchClauseFrame` and (b) `interpretEffects` from predicate bodies (`:1474, :1513`). The latter is an *intentional nested call* — predicate-body effects (e.g. `WHEN X THEN Y`) execute inside their parent `interpret()` call, which itself was dispatched through the queue. This is not a bypass and is the only allowed nested `interpret()` site. Grep `this\.interpret(` must show only those two places.
5. **Single ingress, no `registerEvents`:** `cloneAndSplitEvents`, `DEC.registerEvents`, `DEC.addEvent`, `extendedIds`, `markExtended`, `validateAll`, `notifyResourceControllers`, `seedControlledOperator`, `deriveSPRecoveryEvents`, `precomputeDamageByFrame`, `maybeApplyHpThresholdStatuses`, `clampComboWindowsToEventEnd`, and the post-queue UID restoration loop are all deleted. Grep proves it.
6. **No `finalize` calls:** `spController.finalize`, `ueController.finalize`, `hpController.finalize`, `shieldController.finalize` are all deleted. SP insufficiency markers are emitted inline at battle skill `EVENT_START`. UE efficiency is applied per-frame at the moment of gain. View-layer projections (SP/UE/HP/shield curves, combo windows, insufficiency overlays) read per-frame arrays directly.
7. **Resource ingress is single-path:** `ueController.addUltimateEnergyGain` and `spController.addRecovery` each have exactly one caller chain — `interpret() → doRecover() → DEC.recordSkillPointRecovery / DEC.recordUltimateEnergyGain → controller`. Same for `hpController.applyDamage` (rooted at `doDeal → DEC.dealDamage`).
8. **Interpreter purity:** `interpret()`'s switch contains zero no-op branches. Every case mutates DEC. `NOOP_VERBS` is deleted. The eight no-op verbs (`REFRESH, HIT, DEFEAT, PERFORM, IGNORE, OVERHEAL, EXPERIENCE, MERGE`) are either parser-handled, predicate-only, or display-metadata-only.
9. **Single parser cache:** One `configCache.ts` exporting `getStatusDef`/`getStatusConfig`/`getOperatorSkillDef`. No `_statusConfigCache`/`_statusDefCache` duplication. No per-run `clearStatusDefCache`.
10. **Single column resolver:** One `columnResolution.ts`. Three callers (interpreter, conditionEvaluator, triggerIndex), one source of truth.
11. **Grammar at parse time:** Interpreter never unwraps an `IS` ValueNode, never composes a qualified status ID, never filters `FIRST_MATCH/ALL`. Parser hands it fully-resolved literals where possible; runtime-callback-dependent ValueNodes survive untouched and are resolved by `interpret()` against a context with the callbacks attached.
12. **Stat-state unified:** `STAT_TO_STATE_ADJECTIVE` and `ADJECTIVE_TO_STAT` collapsed into one table; transitions fire reactively via `StatAccumulator` watcher.
13. **No non-DSL effect paths:** Combo trigger source duplication, stat reversal, and HP threshold scanning are all gone. Every effect is a parser-emitted clause dispatched through the queue. Grep `controller\.applyEvent\|applyPhysicalStatus` outside `doApply`/`doConsume`/`effectExecutor.ts` must be empty.
14. **Crit pin overrides inline:** Override store consulted at frame creation inside `interpret()`. No post-queue `frame.isCrit` mutation.
15. **`frameCalculator` and `EventsQueryService` are pure read.** They never write to `hpController` or any other controller. Grep proves it.
16. **All tests pass.** `npx jest` is green. No expected damage values changed (per `CLAUDE.md`'s zero-tolerance rule). Phase 0 is the only phase allowed to change a UE expected value, and only when accompanied by call-site evidence in the commit body.
17. **Lint & types clean** for every touched file. `engineSpec.md` rewritten to match the new pipeline shape.
18. **CI guard against regression.** A new test `src/tests/unit/pipelineInvariants.test.ts` runs at every commit and fails the build if any forbidden pattern reappears in `src/`:
    - `notifyResourceControllers`
    - `cloneAndSplitEvents`
    - `_statusConfigCache` / `_statusDefCache` / `clearStatusDefCache`
    - `\.finalize\(` on `spController|ueController|hpController|shieldController`
    - `precomputeDamageByFrame` / `maybeApplyHpThresholdStatuses`
    - `markExtended` / `extendedIds`
    - `validateAll` as a post-pass
    - `this\.interpret(` outside `dispatchClauseFrame` / `interpretEffects`
    - `hpController\.\|spController\.\|ueController\.\|shieldController\.` outside `derivedEventController.ts` (excluding `.get*` queries)
    - `applyStatDelta` outside `derivedEventController.ts`
    - `controller\.applyEvent\|applyPhysicalStatus` outside `effectExecutor.ts`
    The test reads files from disk and asserts pattern absence. Without this, nothing prevents the next refactor from re-introducing parallel paths.
19. **`frameCalculator` boundary test.** A new unit test asserts that no export from `frameCalculator.ts` or `eventsQueryService.ts` accepts a writable `hpController`/`spController`/`ueController`/`shieldController` reference. This is an architectural invariant — these layers compute, they never write.

### Final pipeline diagram (acceptance reference)

```
processCombatSimulation:
  ├─ reset pools/caches
  ├─ statAccumulator.init    (baseline static stats)
  ├─ TriggerIndex.build      (read-only index)
  ├─ parser:
  │     ├─ time-stop discovery (walk user skill events in startFrame order,
  │     │   read stop regions from config, build complete stops list)
  │     └─ flatten raw events + JSON → QueueFrame[] with extended positions
  ├─ seed queue
  ├─ drain queue:
  │     processQueueFrame
  │       └─ dispatchClauseFrame(entry, clauses)
  │            └─ interpret(effect, ctx)
  │                 ├─ DEC.<mutation>()       ← only writer
  │                 │    └─ sibling controllers (hp/sp/ue/shield/statAccum)
  │                 └─ triggerIndex.lookup(...) → enqueue ON_TRIGGER
  └─ DEC.getProcessedEvents() → return
```

No other paths exist. One ingress, one dispatcher, one writer, one read projection.

---

## Deferred items / gotchas from Phases 0a–0c (carry into 0d and beyond)

These are real items the implementation work uncovered but explicitly did NOT
fix. Each is scoped + actionable so a future session can pick it up cold.
Items marked **RESOLVED** have been closed out in a later session and are
listed for history.

### Carried over from Phase 0a (UE migration)

- **RESOLVED — `tacticalEventGenerator.ts` deleted (2026-04-08).** The
  entire file was orphan code with zero callers anywhere in `src/`. Tactical
  UE gain is already handled through the standard clause-driven path; this
  generator was a relic from an earlier architecture and never re-wired
  after the 0a migration. Deletion verified by `npx tsc --noEmit` (clean)
  and full `npx jest` (2230 tests pass). No clause synthesis migration
  needed — there was nothing to migrate.
- **RESOLVED — `getSkillUltimateEnergyGains` / `SkillUltimateEnergyGains` /
  `findConditionalUltimateEnergyGains` / `getSkillCategoryData`** were
  verified orphaned and deleted from `dataDrivenEventFrames.ts`. The matching
  re-exports in `gameDataStore.ts` and `configStore.ts` were removed too.
- **RESOLVED — `allocateEvent` UE field drift cleaned up (2026-04-08).**
  Deleted `ultimateEnergyGain?` / `teamUltimateEnergyGain?` /
  `ultimateEnergyGainByEnemies?` from `inputEventController.createEvent`'s
  `defaultSkill` parameter type and the matching conditional spreads in the
  return object. Same fields removed from the `useApp.ts` `handleAddEvent`
  helper signature. `tests/unit/sharing.test.ts` mock columns also stripped
  of the dead fields (4 references). No real readers existed — the spread
  was a no-op. Full `npx jest` passes (2230 tests).
- **`chainRef` bundled type was deferred.** Plan called for a single
  `chainRef: { sourceSlotId, sourceOperatorId, sourceEventUid }` propagated
  through every derived event. Phase 0a-i used the existing scattered
  `sourceOwnerId` / `sourceSlotId` / `sourceEventUid` fields plus a new
  `resolveRoutedSource(event)` helper (`eventInterpretorController.ts:585`)
  that walks `slotOperatorMap` reverse-mapping. This works but leaves the
  reverse-lookup as a per-frame O(slots) cost. When ParsedValueStore lands
  in Phase 3, replace `resolveRoutedSource` with a `chainRef` populated at
  every derived-event-creation site (`columns/*.ts: ev.sourceOwnerId =
  source.ownerId`).
- **RESOLVED — `'user'` placeholder leak (2026-04-08).** `handleAddEvent` in
  `src/app/useApp.ts` now resolves `sourceOwnerId` via
  `slotOperatorMapRef.current[ownerId]` before calling `createEvent`, so the
  operator id is bound at allocation time. `createEvent`'s fallback in
  `inputEventController.ts:380` was changed from `USER_ID` to `ownerId`, and
  the `USER_ID` import was dropped from that file. The `'user'` placeholder
  no longer enters the event graph at all. `resolveRoutedSource`'s defensive
  slot-map reverse lookup is now strictly belt-and-suspenders.
- **`addUltimateEnergyGain` calls in `ultimateEnergyValidation.test.ts`.**
  Tests call `ueController.addUltimateEnergyGain(...)` directly to seed the
  controller for unit-level checks. Acceptance grep allows this. If a future
  cleanup wants the *only* call site to be DEC's `recordUltimateEnergyGain`,
  rewrite these tests to drive UE through the full pipeline.

### Carried over from Phase 0b (SP migration + perfect-dodge)

- **Generic skill JSON loader infrastructure was NOT built.** Plan called for
  `src/model/game-data/generic/` directory + a `weaponSkillsStore`-style
  loader + `skill-perfect-dodge.json` config. With only one mechanic in
  scope, the loader was over-engineering, so perfect-dodge SP is wired
  inline via `attachPerfectDodgeSpClause` in `inputEventController.ts`,
  reading the value from `GENERAL_MECHANICS.skillPoints.perfectDodgeRecovery`.
  When a second generic mechanic shows up (parry bonus, on-defeat hook,
  guard-break SP, etc.), build the loader + JSON file and migrate
  perfect-dodge to load through it.
- **RESOLVED — `SkillPointController.deriveSPRecoveryEvents` stub deleted.**
  Both fallback paths (basic-attack frame scan AND perfect-dodge synth) were
  deleted in 0b. The no-op stub and its call site in `eventQueueController.ts`
  were deleted in a follow-up patch. A comment at the former call site
  documents the deletion.
- **The plan's "basic attack final-strike SP migration" turned out to be
  unnecessary.** The plan said `basicAttackController.ts:71` writes a summed
  SP to `finalFrame.skillPointRecovery` and described migrating that to a
  synthetic clause. In practice the original write was already a dead
  assignment for routing purposes — the same final-strike frame already
  carries the parsed `RECOVER SKILL_POINT` clause from JSON, so the field
  write was redundant cache. 0b just deleted it. No clause synthesis needed.
- **`templateFinalStrikeSP` / `templateFinalStrikeStagger` are still cached
  on the marker** as the source of truth for the input clamp logic that
  re-attaches/strips the SP and stagger clauses when the basic-attack chain
  is truncated. These fields are display caches, not part of the routing
  invariant — leave them for now. If a future phase wants stricter "single
  source of truth on clauses", the clamp logic needs to find/move the
  parser-emitted clause across frames instead of relying on the template
  cache.

### Carried over from Phase 0d (Damage migration)

- **RESOLVED — operator-owned `DEAL DAMAGE` subject-filter hack removed
  (2026-04-08).** `checkReactiveTriggers` now performs per-entry subject
  filtering based on the entry's own `subject` / `subjectDeterminer`,
  honoring the actor-vs-recipient asymmetry of action verbs:

  - **Action verbs (APPLY/CONSUME)**: `THIS/ANY/CONTROLLED OPERATOR`
    subjects match against the ACTOR slot (eventOwnerId). `subject=ENEMY`
    matches against the RECIPIENT slot (resolved from `effect.to` or the
    status def's `properties.target`).
  - **Non-action verbs (DEAL/PERFORM/BECOME/IS/HAVE)**: subject always
    matches against the actor/stateful entity (slotId = eventOwnerId,
    or the stat-owner entity for BECOME).

  `reactiveTriggersForEffect` now resolves an optional `targetSlotId` from
  the effect and passes both actor and target to `checkReactiveTriggers`;
  the inline entry loop picks the right one per entry. The `isOperatorDealDamage`
  skip in `dispatchClauseFrame` is deleted. The `BECOME` fire site in
  `doApply` APPLY STAT now passes `ownerId` (the stat-owner entity) instead
  of `ctx.sourceSlotId` so `BECOME <state>` subject=ENEMY triggers match
  when an enemy-side stat transitions. The `CONSUME STATUS → BECOME_NOT`
  fire site now resolves the status slot from `consumedDef.properties.target`
  (ENEMY → `ENEMY_OWNER_ID`, otherwise `eventOwnerId`).

  Tests: full `npx jest` passes (2208 tests, zero regressions). Ember PFP
  still fires from enemy actions and NOT from operator damage frames;
  Fluorite T1 BECOME/BECOME_NOT SLOWED, Perlica P3 THIS OPERATOR APPLY
  ELECTRIFICATION, and Gilberta Gravity Field BECOME LIFTED all still fire
  correctly.

- **`calculationController` and `damageTableBuilder` call
  `findDealDamageInClauses` per-frame.** This is a linear walk of the
  frame's clauses on every damage calc iteration. For an operator with
  12-frame basic attack chains × 4 operators × 120s timeline, this is
  hundreds of calls per pipeline run. Currently not measurably hot, but
  if profiling flags the damage calc loop as expensive in the future,
  the cleanest fix is to cache the resolved `DealDamageInfo` on the
  frame marker at marker-build time (`basicAttackController.toMarker`
  or in a view-layer projection). The cache would be invalidated
  whenever clauses mutate (e.g. `calculationController.ts:307`
  strip-and-attach stagger/damage writes). Leaving uncached for now —
  premature optimization otherwise.

- **`DealDamageInfo` type lives in `clauseQueries.ts`, not in
  `skillEventFrame.ts`.** This is deliberate (it's a helper output, not
  a frame cache), but it means the plan's "delete `FrameDealDamage`"
  acceptance bar is satisfied in spirit — the struct shape is gone
  from frame classes and markers, surviving only as a read-only
  reconstruction from clause queries. If a reviewer greps for
  `FrameDealDamage` specifically they'll get zero hits; `DealDamageInfo`
  is the new name for "what `findDealDamageInClauses` returns".

### Carried over from Phase 0c (Stagger migration)

- **Latent bug in `triggerMatch.ts:handleDeal` (`:554`).** The handler scans
  every frame on every event without filtering by `frame.clauses` or by
  damage element (it only filters by element when `qualifier &&
  frame.dealDamage?.element`, leaving frames with no `dealDamage` always
  matching). It works in practice because trigger conditions almost always
  have a SUBJECT filter that gates by event ownership. When 0d migrates the
  `dealDamage` field away, this scan needs a clause-aware predicate
  (`hasDealDamageClause(frame.clauses)` or similar). Audit alongside 0d.
- **`resolveObjectIdForTrigger` DEAL handling.** Fixed in 0c to return
  `NounType.DAMAGE` only when the effect's object is `DAMAGE`, otherwise
  `undefined` (no trigger key). If a future feature ever wants reactive
  triggers keyed on `DEAL STAGGER` (or `DEAL HP`, etc.), this is the spot to
  extend — and the corresponding `triggerIndex.ts` keyspace needs the new
  trigger key registered.
- **`calculationController` and `columnBuilder` runtime stagger writers**
  use a strip-and-attach pattern (`stripStaggerClauses` + push
  `buildDealStaggerClause`). This is correct but means stagger gets
  re-resolved twice if both writers fire on the same frame. In practice
  they don't overlap (calculationController only fires on physical-status
  events, columnBuilder only on operator skill variants), but the pattern
  is fragile — a future invariant should be "exactly one writer per
  frame×verb×object cell". `stripStaggerClauses` is the workaround.
- **`triggerMatch.handleRecover` SKILL_POINT branch (`:385–408`)** uses
  `hasSkillPointClause(frame.clauses)` after 0b. The handler still scans
  every frame on every event sequentially — same shape as `handleDeal`. If
  Phase 1's config cache work also produces a per-frame clause index, this
  scan can become O(triggered frames) instead of O(all frames).

### Carried over from Phase 1 (cache consolidation) + the follow-up pass

- **RESOLVED — `triggerIndex.ts:369` per-operator `s.serialize()` scan** now
  reads through `getStatusDef(id)` from the unified `configCache`. Enabled
  filter still runs per operator; the cache is consulted for each enabled
  status so serialization happens once per pipeline run, shared with the
  interpreter.
- **RESOLVED — `_statusStackLimitCache` in `derivedEventController.ts:45`**
  deleted. `getStatusStackLimit` now delegates to
  `getStatusConfig(id)?.maxStacks` through `configCache`. Lost the
  name-based fallback; no callers depended on it.
- **RESOLVED — dual `findValue` APIs.** `dataDrivenEventFrames.ts`'s local
  `findValue` / `findEffectValue` / `flattenClauseEffects` / `withValue` /
  `dslTargetToLegacy` helpers were deleted. Loader-time scalar metadata
  extractors (`getSkillTimings`, `getUltimateEnergyCost`,
  `getBattleSkillSpCost`) now parse the raw JSON clause once via
  `parseJsonClauseArray` (new in `clauseQueries.ts`) and query via
  `findFirstEffectValue`. **Subtle behavior change:** the old `withValue`
  returned `wv.value?.[0]` as a fallback when invoked without a ctx on a
  `VARY_BY` array (i.e. skill level 1); the new path resolves against
  `DEFAULT_VALUE_CONTEXT` (skill level 12). In practice only
  `VARY_BY SKILL_LEVEL` values differ; all current callers query constants
  or `VARY_BY POTENTIAL`, and tests are green.
- **RESOLVED — `SkillPointController.deriveSPRecoveryEvents` stub deleted.**
  The function and its call at `eventQueueController.ts` are gone.
  A comment at the former call site documents the deletion. SP recovery is
  now driven entirely by `RECOVER`/`RETURN SKILL_POINT` clauses routed
  through `interpret()` → `DEC.recordSkillPointRecovery`; perfect-dodge
  gets a synthetic clause at `allocateEvent` time.

### Phase 5 — RESOLVED

All NO-OP cleanup landed cleanly. `REFRESH` / `OVERHEAL` / `EXPERIENCE` /
`MERGE` deleted from the case block (zero JSON occurrences). `HIT` /
`DEFEAT` / `PERFORM` retained as defensive predicate-only fallthroughs
with comments. `IGNORE` retained as a tag verb with a comment pointing
at its real consumer (DEC's `notifyResourceControllers` flag-set path).
`NOOP_VERBS` set renamed to `SKIP_VERB_OBJECT_VALIDATION` to match its
actual purpose (skip object-vs-verb allowlist check, not "verb does
nothing" — `DEAL` and `RESET` were always in the set despite mutating).

### Phase 4e — DEFERRED IN FULL (three sub-items, all need dedicated sessions)

The plan groups three items under 4e but they're substantively distinct
and one (item 3) is multi-day work.

**Item 1 — Combo trigger source duplication — RESOLVED.** Now lives at
`handleProcessFrame :2095-2138`. When `frame.duplicateTriggerSource` is
set and `event.comboTriggerColumnId` is non-empty, the handler synthesizes
an `APPLY` effect on the runtime-resolved trigger column and routes it
through `this.interpret(synthEffect, ctx)` followed by
`reactiveTriggersForEffect`. Both branches handled:
- `INFLICTION_COLUMN_IDS` → `{verb: APPLY, object: INFLICTION, objectQualifier: <element>, to: ENEMY}`
  using the `INFLICTION_COLUMN_TO_ELEMENT` reverse map exported from
  `columnResolution.ts`.
- `PHYSICAL_STATUS_COLUMN_IDS` → `{verb: APPLY, object: STATUS, objectId: PHYSICAL, objectQualifier: <triggerCol>, to: ENEMY}`.

No direct `controller.applyEvent` / `applyPhysicalStatus` calls outside
`interpret()` for the combo duplication path. The remaining direct
`controller.applyEvent` call sites in `eventInterpretorController.ts`
are inside `doApply` and `applyPhysicalStatus` (both interpret-dispatch
chain) and the freeform event creation branch in `handleProcessFrame`
(deliberately direct since freeform events have no DSL clauses to interpret).

**Item 2 — Stat reversal scheduling — CANCELLED 2026-04-08.** Subsumed
by finding #9. The runtime delta capture in `runStatusCreationLifecycle`
plus the inverse-apply at `processQueueFrame :737-756` is part of the
same load-bearing inline status creation lifecycle and cannot be replaced
with synthetic STATUS_EXIT clauses for the same reasons Phase 4c-ii is
cancelled. The delta is runtime-determined (depends on the resolved
ValueNode value at status-creation) and the inverse-apply must observe
the same immediate-visibility semantics as the forward apply. The
mechanism stays as-is; `_statReversals` is the correct shape for it.

**Item 3 — HP threshold + damage routing through `interpret()`.** The
biggest remaining architectural change. Currently:
  - `frameCalculator` and `damageTableBuilder` compute damage values
    and call `hpController.applyDamage` directly (read-and-write
    coupling).
  - `precomputeDamageByFrame` (`calculationController.ts:66`, called
    from `eventQueueController.ts:488`) runs *before* the queue starts
    so HP-threshold predicates can read the precomputed timeline.
  - `maybeApplyHpThresholdStatuses` (`eventInterpretorController.ts:2300`)
    polls per-frame after PROCESS_FRAME to check whether any HP
    thresholds were crossed and apply the corresponding statuses.

The plan wants:
  - `doDeal` extends to handle `to: ENEMY` (currently only
    `to: OPERATOR`). Calls a new `DEC.dealDamage(target, frame, value)`
    method.
  - `DEC.dealDamage` is the sole writer to `hpController.applyDamage`.
  - `frameCalculator` / `damageTableBuilder` become read-only over the
    DEC view; they NEVER call `hpController.applyDamage`.
  - HP threshold becomes a first-class reactive trigger key
    (`HP_BELOW:<pct>`), indexed at parser time alongside
    `APPLY:<statusId>` etc.
  - `precomputeDamageByFrame` deleted — once `interpret(DEAL DAMAGE)`
    is the sole HP write path, predicates evaluated reactively at
    frame F automatically see HP state from every prior frame because
    the queue processes frames in order.
  - `maybeApplyHpThresholdStatuses` deleted — replaced by reactive
    trigger dispatch from `doDeal`'s post-mutation step.

Touches: `frameCalculator.ts`, `damageTableBuilder.ts`,
`calculationController.ts`, `hpController.ts`, `triggerIndex.ts`,
`eventQueueController.ts`, `eventInterpretorController.ts:doDeal +
:maybeApplyHpThresholdStatuses`, plus every operator JSON that has an
HP-threshold condition (audit + verify the new trigger key works).
Damage calc test expected values are immutable per `CLAUDE.md`, so any
ordering shift (e.g. crit damage now flowing through interpret instead
of being applied in a precompute pass) needs to preserve those exactly.

This is a multi-day refactor. The plan acknowledged it explicitly:
"This is a bigger change than items 1 and 2 because it requires
`frameCalculator`'s enemy HP writes to be re-routed". Defer to a
dedicated session that starts with an audit of every `hpController`
caller and a strategy for keeping damage calc test values stable.

**Phase 4e overall recommendation:** treat as three independent
mini-projects, do them in their own sessions with focused test suites,
audit each operator that depends on them. Don't squeeze any of the
three into a tail-end "while I'm here" cleanup.

### Phases 4c-ii + 4d — DEFERRED TOGETHER (queue model restructuring)

**Phase 4d — RESOLVED.** `QueueFrameType.ENGINE_TRIGGER` was already
collapsed into `PROCESS_FRAME` with `hookType: FrameHookType.ON_TRIGGER`
in a prior session. `processQueueFrame` (`eventInterpretorController.ts:745`)
dispatches via `entry.hookType === FrameHookType.ON_TRIGGER ?
this.handleEngineTrigger(entry) : this.handleProcessFrame(entry)`. The
priority constant `PRIORITY.ENGINE_TRIGGER` is keyed as a string in
`eventQueueTypes.ts` so both queue types and hook types share the
priority table side-by-side. `handleEngineTrigger` itself was *not*
inlined into `dispatchClauseFrame` — it remains a 200-line specialized
handler for HAVE deferred eval, source-event lifecycle gating, cascade
bookkeeping, etc. — but it now lives behind the unified PROCESS_FRAME
dispatch surface. Net result: one queue type, one priority table, one
entrypoint. The marginal architectural win of folding the handler into
the shared dispatcher is not worth the risk and is explicitly not
pursued (the `TriggerEffect` vs `FrameClauseEffect` shape mismatch
makes a clean fold impossible without a separate conversion layer).

**Phase 4c-ii — CANCELLED 2026-04-08 (subsumed by finding #9).** The
plan originally wanted `processNewStatusEvent` deleted and replaced
with queue-enqueued `STATUS_ENTRY` / `STATUS_PASSIVE` / `ON_FRAME`
frames. Open review finding #9 (added 2026-04-08) establishes that
this is **architecturally impossible**: the function is *load-bearing
inline dispatch*. When `doApply` creates a status inside an effect
loop, the status's onEntryClause / clause APPLY STAT / offset-0 frames
MUST run synchronously before effect `i+1` in the same clause executes.
Same-frame FIFO queue ordering does not solve this — the queue only
resumes between entries, never mid-entry, so any queued lifecycle
would land after the rest of the current effect loop. The function was
renamed to `runStatusCreationLifecycle` (2026-04-08) and its docstring
now documents the load-bearing rationale. Phase 4 acceptance criteria
that mention `processNewStatusEvent` deletion are obsolete — the
function stays, the name change makes intent explicit, and all status
clause dispatch flows through it for creation-time lifecycle.

The stat reversal scheduling code (formerly Phase 4e item 2) is also
cancelled by this finding for the same reason — the runtime delta
capture in `runStatusCreationLifecycle` and the inverse-apply in
`processQueueFrame` are part of the same load-bearing inline dispatch.
They cannot be replaced with synthetic `STATUS_EXIT` clauses because
the delta is runtime-determined (depends on resolved ValueNode) and
needs the same immediate-visibility guarantee as other inline lifecycle
work.

### Carried over from Phase 4b (skill-level lifecycle migration)

- **`dispatchClauseFrame` gained two options** (`fireReactiveTriggers`,
  `trackStatReversals`) because skill-lifecycle hooks (`EVENT_START`,
  `EVENT_END`, `SEGMENT_*`) have different semantics from `ON_FRAME`:
  they don't fire reactive triggers per-effect (the dedicated PERFORM
  trigger at `handleProcessFrame :1904` handles that), and they don't
  track frame-scoped stat reversals (skill-lifecycle stats persist for
  the whole event, not just one frame). This option split is intentional
  — phase 4c/4d will pick options per hook type. No deferrals.
- **The four migrated loops still build their own `interpretCtx` +
  `condCtx` per call site.** Phase 4a's plan wording suggested the
  dispatcher would take only `(entry, clauses)` and build contexts
  internally from `hookType`. In practice the contexts diverge enough
  between sites (supplied parameters, parent segment end, controlled
  slot, operator potential lookup etc.) that centralizing them would
  produce a larger-than-useful switch statement. Callers building their
  own contexts is simpler and keeps hook-specific concerns near the
  hook handler. Documented as an intentional design deviation from the
  plan wording, not a deferral.

### Carried over from Phase 4a (hook types + dispatcher)

- **No dedicated unit tests for `dispatchClauseFrame`.** The helper's body
  is a line-for-line extraction of the existing `handleProcessFrame`
  dispatch loop (filterClauses → per-effect interpret + reactive trigger
  fan-out, with the APPLY STAT reversal special case and the operator
  DEAL DAMAGE skip). As dead code it's exercised by nothing; as live code
  (after Phase 4b/c/d migrate call sites) it's exercised by the same
  integration tests that currently cover the inline loop. Adding a unit
  test now would duplicate coverage. Skip.
- **New `FrameHookType` values land but are unused.** `ON_FRAME`,
  `ON_TRIGGER`, `STATUS_ENTRY`, `STATUS_PASSIVE`, `STATUS_EXIT`,
  `TALENT_SEED` are declared on the enum but no `QueueFrame` carries them
  yet. Phases 4b/c/d set `qf.hookType` on the queue entries as they
  migrate; until then, live code only uses the original
  `EVENT_START` / `EVENT_END` / `SEGMENT_START` / `SEGMENT_END` values.

### Phase 3 — Parser partial evaluation — DEFERRED IN FULL

Phase 3's four sub-items are more entangled than the plan suggested:

1. **ValueNode partial evaluation.** The main architectural piece. Needs a
   new cache layer keyed by `(opId, skillLevel, potential, talentLevel)`,
   a tree walker that collapses static-only subtrees to literals at load
   time, and cache invalidation on loadout change. Several hours of work
   with uncertain payoff — it's a pure performance refactor, and
   `resolveValueNode` is not currently a measured bottleneck. The
   interpreter still calls `resolveValueNode(node, ctx)` the same way
   either way; the only change is whether `node` is already a literal. If
   profiling eventually flags value resolution as hot, revisit then.

2. **Qualified status ID composition at parse time**
   (`eventInterpretorController.ts:811`, `flattenQualifiedId`). Moves 9
   lines of runtime composition (`CRYO + FRAGILITY → CRYO_FRAGILITY`) to
   parser-time. Small cleanup, BUT the parser would need access to
   `getStatusById` at parse time to verify the composed id has a status
   def — couples the frame/clause parser to the status store loader
   order. Net architecture value: small, and the coupling risk outweighs
   the cleanup.

3. **Inline `filterClauses`** (`:92-108`). Minor perf tweak that saves one
   array allocation per frame dispatch. Not a bottleneck; the 17-line
   function is more readable as a named helper than inlined. Low value.

4. **Delete `wp.verb === IS` runtime checks** (`:388`). Only becomes
   unreachable IF piece 1 lands and collapses all `IS` literals at parse
   time. Entangled with piece 1; can't be done independently.

**Decision:** skip Phase 3 in full. The downstream phases (4 / 4e / 5)
don't strictly require partial evaluation to land first — Phase 4's
synthetic-frame dispatch is orthogonal to how values get resolved. When
profiling flags ValueNode resolution as hot OR when someone wants
loader-time type checking that requires fully-resolved literals, come
back and do piece 1. Pieces 2-4 ride on top of whatever shape the parser
ends up with.

### Carried over from Phase 2 (column-ID resolver)

- **Unit test at `src/tests/unit/columnResolution.test.ts` was NOT written.**
  The plan called for one. Every branch of `resolveColumnId` and
  `resolveColumnIds` is already exercised by the integration suite via
  operator-level tests (e.g. freezer/breach/reaction operators), so the
  unit test would be redundant. Skipped intentionally. Add one if a future
  change to the resolver needs fast-feedback verification.
- **`effectExecutor.ts:171`** still has its own `ELEMENT_TO_INFLICTION_COLUMN`
  copy. This file is the 719-line orphan (noted below in General Invariants)
  that's either being activated in Phase 3b or deleted outright. Don't
  migrate dead code; resolve the orphan status first, then clean up.

### General invariants / cleanup not blocking current phase

- **Sheet serialization breaking change accepted in 0a-ii.** Old saved
  sheets that hand-stored `ultimateEnergyGain` / `teamUltimateEnergyGain` /
  `ultimateEnergyGainByEnemies` directly on event objects silently drop
  those values on load. No migration shim was added (per the plan's
  "Sheet serialization: breaking change accepted" decision). Same applies
  to `skillPointRecovery` and `stagger` after 0b/0c. If a user reports
  lost values from an old sheet, the answer is "rebuild the sheet" — the
  raw JSON config is still the source of truth and the clause-driven
  values flow naturally.
- **RESOLVED — `FrameClauseEffect.type` union** collapsed to
  `{ type: 'dsl'; dslEffect?: Effect }` as its sole shape after Phase 0d.
  Zero non-dsl variants remain.
- **RESOLVED — `createSkillEvent` / `createQueueEvent` ingress merge (2026-04-08).**
  The two public ingress paths now share a private `_ingest(ev, {deepClone,
  captureRaw})` core in `derivedEventController.ts` that handles
  `_maybeRegisterStop`, optional deep-clone of segments, optional
  per-segment raw duration capture, and push to `allEvents` + `stacks`.
  `_pushToStorage` was deleted (folded into `_ingest`). `createQueueEvent`
  now runs `extendSingleEvent` inline after ingest so `pushEvent` callers
  observe extended durations on return (same contract as before). `pushEvent`
  simplifies to `this.createQueueEvent(event)` — no more pre-extension via
  `_extendDuration` + `setEventDuration`. `pushEventDirect` (reactions) and
  `pushToOutput` (0-duration markers) pass `captureRaw: false` since their
  segments arrive pre-built. `reExtendQueueEvents` was deleted as dead code.
  **Bonus correctness win:** pushEvent-inserted events (statuses, inflictions,
  MF events) now participate in `_maybeRegisterStop`'s retroactive
  re-extension loop via `rawSegmentDurations`, fixing a latent bug where
  these events weren't re-extended when a later stop landed. Pinned by a
  new test in `src/tests/unit/decRetroactiveTimeStop.test.ts`. 2133/2133
  tests pass with zero regressions.
- **RESOLVED — `effectExecutor.ts` orphan deleted (2026-04-08).** The
  719-line file plus its 2 test files (`effectExecutor.test.ts` 1981
  lines, `segmentedStatus.test.ts` 176 lines) were deleted outright per
  finding #5. The two stale references — a comment in
  `eventInterpretorController.ts:1292` ("RESET STACKS handled by
  effectExecutor") and a docstring line in `overrideApplicator.ts:10` —
  were also cleaned up. Test count dropped from 2230 → 2115 (115 tests
  removed, all of which exercised only the orphan). Zero regressions.

