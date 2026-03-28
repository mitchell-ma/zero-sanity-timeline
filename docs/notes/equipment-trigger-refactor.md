# Equipment Trigger Source Refactor

## Context

Weapon skills and gear set effects are **trigger sources** — they watch for events and apply statuses. Currently, `getWeaponEffectDefs()` and `getGearEffectDefs()` in `configStore.ts` stitch trigger CONDITIONS from the skill/effect JSON onto the STATUS defs, discarding the EFFECTS. This means `triggerEffects` is always `undefined` when the trigger fires — nothing happens.

Operator talents (e.g., Scorching Heart → Melting Flame) handle this correctly: the talent is a standalone trigger source with full `onTriggerClause` (conditions + effects), and the target status is a separate def looked up via `getStatusDef()`. All equipment should follow this pattern.

### Self-referential vs non-self-referential

Some defs are **self-referential** — their `onTriggerClause` applies their own status ID (e.g., Chen Qianyu P1 Shadowless: `id: "CHEN_QIANYU_POTENTIAL1_SHADOWLESS"` → applies `objectId: "CHEN_QIANYU_POTENTIAL1_SHADOWLESS"`). These are valid as-is — the trigger and payload are the same entity.

Most equipment triggers are **non-self-referential** — the trigger source (weapon skill / gear set effect) applies a *different* status (e.g., Brutality: Lands of Yore skill → applies `ANCIENT_CANAL_LANDS_OF_YORE` status). These must be two separate defs: the skill as a trigger source, the status as a payload looked up by `getStatusDef()`.

The current stitching conflates these by grafting the skill's conditions onto the status, but dropping the effects — so neither entity works correctly.

## Plan

### Phase 1: New configStore functions

**File: `src/controller/configStore.ts`**

**1a. `getWeaponTriggerDefs(weaponName): StatusEventDef[]`**
- Load weapon skill via `getNamedWeaponSkill(originId)`
- Return a talent-shaped def with `eventCategoryType: TALENT`, full `onTriggerClause` (conditions + effects)
- If the skill also has passive `clause` effects (e.g., Arts Intensity), include them as the def's `clause`

**1b. `getGearTriggerDefs(gearSetType): StatusEventDef[]`**
- Load gear set effect via `GEAR_EFFECT_INDEX[gearSetType]`
- Same pattern: return talent-shaped def with full `onTriggerClause`

**1c. `getConsumablePassiveDef(consumableId): StatusEventDef | undefined`**
- Load via `getConsumable(consumableId)`
- Return talent-shaped def with `clause` (stat buffs), `properties` (duration), `eventCategoryType: TALENT`

**1d. `getTacticalTriggerDef(tacticalId): StatusEventDef | undefined`**
- Load via `getTactical(tacticalId)`
- Return talent-shaped def with full `onTriggerClause` (conditions + effects)

**1e. Remove stitching from `getWeaponEffectDefs` and `getGearEffectDefs`**
- Delete the for-loop that grafts conditions onto status defs (lines 601-609 weapons, 619-629 gear)
- These functions continue to return status-only defs for view-layer consumers (columnBuilder, customizer, loadoutPane, calculationController)

**1f. Export new functions via `gameDataStore.ts`**

### Phase 2: Update TriggerIndex.build()

**File: `src/controller/timeline/triggerIndex.ts`**

**2a. Replace weapon/gear processing blocks:**
- Instead of `getWeaponEffectDefs(weaponName).map(normalizeEquipDef)` → call `getWeaponTriggerDefs(weaponName)` (already StatusEventDef shape, no normalizeEquipDef needed)
- Same for gear: `getGearTriggerDefs(gearSetType)`
- Remove status-def processing for weapons/gear — they have no triggers, exist only as `getStatusDef()` lookup targets

**2b. Add consumable processing:**
```
if (slotConsumables) {
  for [slotId, consumableId] of entries:
    def = getConsumablePassiveDef(consumableId)
    if def: processDefsForSlot(slotId, opId, [def], true, ...)
```

**2c. Add tactical processing:**
```
if (slotTacticals) {
  for [slotId, tacticalId] of entries:
    def = getTacticalTriggerDef(tacticalId)
    if def: processDefsForSlot(slotId, opId, [def], true, ...)
```

**2d. Expand `build()` signature:** add `slotConsumables` and `slotTacticals` params

### Phase 3: Wire up loadout data

**File: `src/controller/combat-loadout/combatLoadoutController.ts`**
- Build `slotConsumables` and `slotTacticals` maps in `syncSlots()` from slot loadout state
- Pass to `TriggerIndex.build()`

**File: `src/controller/timeline/columnBuilder.ts`**
- Add `consumableId?: string` to `Slot` interface if needed (already has `tacticalId`)

### Phase 4: Update statusTriggerCollector (legacy path)

**File: `src/controller/timeline/statusTriggerCollector.ts`**
- Lines 1078, 1086, 1293, 1300 call `getWeaponEffectDefs`/`getGearEffectDefs`
- Update to use new trigger def functions, or add TODO if this collector is being phased out

### Phase 5: Tactical usage limits (can be deferred)

- Add `maxUses?: number` to `TriggerDefEntry`
- Track usage counter in eventInterpretorController
- Existing `tacticalEventGenerator.ts` can coexist for display events

## Key invariants

- `getStatusDef()` already finds weapon/gear statuses (line 226 of eventInterpretorController: `[...getAllOperatorStatuses(), ...getAllWeaponStatuses(), ...getAllGearStatuses()]`) — no changes needed
- `processDefsForSlot` already handles talent-shaped defs correctly — trigger sources just need `eventCategoryType: TALENT` + `onTriggerClause` with full effects
- View-layer consumers (`getWeaponEffectDefs`/`getGearEffectDefs`) are unaffected — they only need status defs for display

## Consumers of getWeaponEffectDefs/getGearEffectDefs (unaffected)

| Consumer | Purpose | Needs triggers? |
|----------|---------|----------------|
| `columnBuilder.ts:254-255` | Build status columns | No — needs status id/name/duration |
| `UnifiedCustomizer.tsx:2183,2399` | Display/edit defs | No — shows status properties |
| `calculationController.ts:231` | Stat aggregation | No — reads clause effects |
| `contentCatalogController.ts:160,173` | List available effects | No — catalog display |
| `loadoutPaneController.ts:138` | Show equipped effects | No — display only |
| `builtinToCustomConverter.ts:32,96` | Convert to custom defs | Maybe — check if trigger display needed |

## Files to modify

1. `src/controller/configStore.ts` — new functions, remove stitching
2. `src/controller/gameDataStore.ts` — exports
3. `src/controller/timeline/triggerIndex.ts` — new processing blocks
4. `src/controller/combat-loadout/combatLoadoutController.ts` — pass consumable/tactical data
5. `src/controller/timeline/columnBuilder.ts` — Slot interface (consumableId)
6. `src/controller/timeline/statusTriggerCollector.ts` — update legacy path

## Verification

1. `npx tsc --noEmit` — type-check changed files
2. `npx jest --testPathPattern="triggerIndex|columnBuilder|effectExecutor"` — existing unit tests pass
3. Integration test: equip a weapon with triggers (e.g., Ancient Canal / Brutality: Lands of Yore), verify the trigger fires and creates the weapon status event on the timeline
4. Verify view-layer still displays weapon/gear effect info correctly (no regressions in loadout pane, customizer)
