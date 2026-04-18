/**
 * @jest-environment jsdom
 *
 * Sheet round-trip — serialize a non-trivial scenario, re-import, verify
 * calc output is identical.
 *
 * Covers the full serialize → JSON → validate → applySheetData → pipeline
 * path, which is what `handleImport` / `handleSelectLoadout` exercise in
 * real use. We drive the round-trip inside a single renderHook instance by:
 *   1. Setting up scenario A in the active loadout (Loadout 1).
 *   2. Capturing calcBefore and buildSheetData().
 *   3. Serializing via JSON.stringify → cleanSheetData → JSON.parse →
 *      validateSheetData (exact path file export+import takes).
 *   4. Creating Loadout 2 (switches active; triggers auto-save of Loadout 1).
 *   5. Overwriting Loadout 1's storage with the parsed sheet data.
 *   6. Selecting Loadout 1 → triggers applySheetData + resetCombatState.
 *   7. Capturing calcAfter, asserting it matches calcBefore row-for-row.
 *
 * Notes on scope:
 *   - Damage values are compared ±1e-6 (pure float determinism expected since
 *     the engine is deterministic).
 *   - `uid` and `sourceFrameKey` are synthesized per-run so we strip them
 *     from `allProcessedEvents` structure comparison (same strategy as
 *     `pipelineRerunDeterminism.test.ts`).
 *   - Trigger-capability / per-operator JSON overrides are NOT persisted on
 *     the sheet (they live in the operator JSON data); this test pins that
 *     user-visible calc output round-trips cleanly.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { cleanSheetData, validateSheetData } from '../../../utils/sheetStorage';
import { saveLoadoutData } from '../../../utils/loadoutStorage';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';
import { gearLoadout } from '../gears/helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_0 = 'slot-0';
const SLOT_1 = 'slot-1';

const MORDVOLT_ARMOR_ID = 'MORDVOLT_INSULATION_VEST_T1';
const MORDVOLT_GLOVES_ID = 'MORDVOLT_INSULATION_GLOVES_T1';
const MORDVOLT_KIT_ID = 'MORDVOLT_INSULATION_BATTERY_T1';

const HOT_WORK_ARMOR_ID = 'HOT_WORK_EXO_RIG';
const HOT_WORK_GLOVES_ID = 'HOT_WORK_GAUNTLETS_T1';
const HOT_WORK_KIT_ID = 'HOT_WORK_POWER_BANK';

beforeEach(() => { localStorage.clear(); });

function placeSkill(app: AppResult, slot: string, columnId: string, atFrame: number) {
  const col = findColumn(app, slot, columnId);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function calc(app: AppResult, mode: CritMode = CritMode.EXPECTED) {
  return runCalculation(
    app.allProcessedEvents,
    app.columns,
    app.slots,
    app.enemy,
    app.loadoutProperties,
    app.loadouts,
    app.staggerBreaks,
    mode,
    app.overrides,
  );
}

/** Strip per-run identifiers so structural comparison is meaningful. */
function structuralEvents(app: AppResult): string {
  return JSON.stringify(app.allProcessedEvents)
    .replace(/"uid":"[^"]*"/g, '"uid":"<stripped>"')
    .replace(/"sourceFrameKey":"[^"]*"/g, '"sourceFrameKey":"<stripped>"');
}

function setupScenario(view: ReturnType<typeof renderHook<AppResult, unknown>>) {
  const app = () => view.result.current;

  // slot-0 Wulfgard + Mordvolt Insulation
  act(() => { app().handleSwapOperator(SLOT_0, WULFGARD_ID); });
  act(() => {
    app().handleLoadoutChange(SLOT_0, gearLoadout(MORDVOLT_ARMOR_ID, MORDVOLT_GLOVES_ID, MORDVOLT_KIT_ID));
  });

  // slot-1 Laevatain + Hot Work
  act(() => { app().handleSwapOperator(SLOT_1, LAEVATAIN_ID); });
  act(() => {
    app().handleLoadoutChange(SLOT_1, gearLoadout(HOT_WORK_ARMOR_ID, HOT_WORK_GLOVES_ID, HOT_WORK_KIT_ID));
  });

  // Place a few events that exercise triggers and damage frames.
  placeSkill(app(), SLOT_0, NounType.BATTLE, 1 * FPS);      // → Mordvolt buff fires
  placeSkill(app(), SLOT_0, NounType.BASIC_ATTACK, 4 * FPS); // → more damage frames
  placeSkill(app(), SLOT_1, NounType.BATTLE, 6 * FPS);      // → Laevatain damage frames
}

describe('sheet round-trip', () => {
  it('serialize → parse → apply yields identical calc output', async () => {
    const view = renderHook(() => useApp());
    const app = () => view.result.current;

    // ── 1. Setup scenario ──────────────────────────────────────────────────
    setupScenario(view);

    // Capture original active loadout id — this is where we'll later re-inject
    // the parsed sheet data.
    const originalLoadoutId = app().activeLoadoutId;
    expect(originalLoadoutId).toBeTruthy();

    // ── 2. Capture calc & sheet data before round-trip ─────────────────────
    const calcBefore = calc(app(), CritMode.EXPECTED);
    const damageRowsBefore = calcBefore.rows
      .filter(r => r.damage != null && r.damage > 0)
      .map(r => ({
        absoluteFrame: r.absoluteFrame,
        ownerEntityId: r.ownerEntityId,
        damage: r.damage!,
      }))
      .sort((a, b) => a.absoluteFrame - b.absoluteFrame || a.ownerEntityId.localeCompare(b.ownerEntityId));
    expect(damageRowsBefore.length).toBeGreaterThan(0);

    const structuralBefore = structuralEvents(app());
    const sheetDataBefore = app().buildSheetData();

    // ── 3. Serialize → JSON string → parse → validate ──────────────────────
    const exportJson = JSON.stringify(cleanSheetData(sheetDataBefore));
    const parsed = JSON.parse(exportJson);
    const validated = validateSheetData(parsed);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return; // type narrow

    // Sanity: key fields round-trip.
    expect(validated.data.operatorIds).toEqual(sheetDataBefore.operatorIds);
    expect(validated.data.events.length).toBe(sheetDataBefore.events.length);
    expect(validated.data.loadouts).toEqual(sheetDataBefore.loadouts);

    // ── 4. Create Loadout 2 — triggers auto-save of Loadout 1 and switches ─
    //     active loadout. handleNewLoadout(null) is the public API for this.
    act(() => { app().handleNewLoadout(null); });
    const secondLoadoutId = app().activeLoadoutId;
    expect(secondLoadoutId).not.toBe(originalLoadoutId);

    // ── 5. Overwrite Loadout 1's saved sheet with the parsed round-tripped
    //     data. This is where the serialization round-trip actually matters:
    //     the data now living in storage is the output of JSON.stringify +
    //     validateSheetData, not the in-memory sheetDataBefore.
    saveLoadoutData(originalLoadoutId!, validated.data);

    // ── 6. Select Loadout 1 → applySheetData + resetCombatState ────────────
    act(() => { app().handleSelectLoadout(originalLoadoutId!); });
    expect(app().activeLoadoutId).toBe(originalLoadoutId);

    // ── 7. Capture calc after round-trip ───────────────────────────────────
    const calcAfter = calc(app(), CritMode.EXPECTED);
    const damageRowsAfter = calcAfter.rows
      .filter(r => r.damage != null && r.damage > 0)
      .map(r => ({
        absoluteFrame: r.absoluteFrame,
        ownerEntityId: r.ownerEntityId,
        damage: r.damage!,
      }))
      .sort((a, b) => a.absoluteFrame - b.absoluteFrame || a.ownerEntityId.localeCompare(b.ownerEntityId));

    // ── Assertions ──────────────────────────────────────────────────────────

    // Same number of damage rows.
    expect(damageRowsAfter.length).toBe(damageRowsBefore.length);

    // Row-for-row match on frame / owner / damage (with float tolerance).
    for (let i = 0; i < damageRowsBefore.length; i++) {
      const before = damageRowsBefore[i];
      const after = damageRowsAfter[i];
      expect(after.absoluteFrame).toBe(before.absoluteFrame);
      expect(after.ownerEntityId).toBe(before.ownerEntityId);
      expect(after.damage).toBeCloseTo(before.damage, 6);
    }

    // Structural comparison of allProcessedEvents (uids stripped) —
    // round-trip must not perturb the processed event stream.
    const structuralAfter = structuralEvents(app());
    expect(structuralAfter).toBe(structuralBefore);
  });

  it('sheet export contains all user-visible state (negative: empty export does NOT round-trip)', () => {
    // Complements the positive round-trip above by asserting that a missing
    // field in the export surfaces as a structural diff — this makes the
    // positive test above a meaningful signal rather than a tautology that
    // would pass even if the round-trip silently dropped all events.
    const view = renderHook(() => useApp());
    const app = () => view.result.current;

    setupScenario(view);
    const sheetDataBefore = app().buildSheetData();
    const structuralBefore = structuralEvents(app());

    // Tamper: drop all events from the export.
    const tampered = cleanSheetData({ ...sheetDataBefore, events: [] });
    const validated = validateSheetData(JSON.parse(JSON.stringify(tampered)));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const originalLoadoutId = app().activeLoadoutId!;
    act(() => { app().handleNewLoadout(null); });
    saveLoadoutData(originalLoadoutId, validated.data);
    act(() => { app().handleSelectLoadout(originalLoadoutId); });

    const structuralAfter = structuralEvents(app());
    // With events stripped, the processed event stream must diverge —
    // proving structural comparison is load-bearing.
    expect(structuralAfter).not.toBe(structuralBefore);
  });
});
