/**
 * @jest-environment jsdom
 *
 * Cross-operator rotation E2E — exercises multiple engine systems in a single
 * rotation so any single-system regression surfaces as a downstream breakage.
 *
 * Scenario (condensed to patterns that are known to work individually in the
 * existing per-operator / per-gear integration suites):
 *   slot-0: Wulfgard + Mordvolt Insulation  (HP-gated Arts DMG buff)
 *   slot-1: Laevatain + Hot Work             (reaction-triggered element buffs)
 *   slot-2: Akekuri                          (team UE gain, HEAT BS)
 *   slot-3: Yvonne (talentTwoLevel=2)        (Freezing Point CRIT DMG talent)
 *
 * Timeline:
 *   1s — Wulfgard BS (HEAT)              → Mordvolt Insulation buff fires on slot-0
 *   3s — freeform COMBUSTION on enemy, sourced by Laevatain
 *                                          → Hot Work (Heat) buff fires on slot-1
 *   4s — Laevatain BS (HEAT)             → damage frames with active buffs
 *   5s — Akekuri BS (HEAT)               → team-wide damage frame
 *   8s — freeform SOLIDIFICATION on enemy, sourced by Yvonne
 *                                          → Freezing Point talent fires on slot-3
 *
 * The test runs one calc() at the end and asserts a handful of per-slot
 * invariants plus an "every damage row is finite" guard. Any single-system
 * regression (gear STAT ingestion, talent trigger dispatch, reaction
 * derivation, damage calc finiteness) should surface here.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, InteractionModeType } from '../../../consts/enums';
import { ENEMY_ID, REACTION_COLUMNS } from '../../../model/channels';
import { FPS } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';
import { gearLoadout } from '../gears/helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const AKEKURI_ID: string = require('../../../model/game-data/operators/akekuri/akekuri.json').id;
const YVONNE_ID: string = require('../../../model/game-data/operators/yvonne/yvonne.json').id;

const MORDVOLT_BUFF = require('../../../model/game-data/gears/mordvolt-insulation/statuses/status-mordvolt-insulation.json').properties;
const HOT_WORK_HEAT_BUFF = require('../../../model/game-data/gears/hot-work/statuses/status-hot-work-heat.json').properties;

const FREEZING_POINT_JSON = require('../../../model/game-data/operators/yvonne/talents/talent-freezing-point-talent.json');
const FREEZING_POINT_ID: string = FREEZING_POINT_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_0 = 'slot-0';
const SLOT_1 = 'slot-1';
const SLOT_2 = 'slot-2';
const SLOT_3 = 'slot-3';

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
  return payload;
}

function placeFreeformOnEnemy(app: AppResult, columnId: string, atFrame: number, sourceEntityId: string) {
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, columnId, atFrame,
      {
        name: columnId,
        segments: [{ properties: { duration: 20 * FPS } }],
        sourceEntityId,
      },
    );
  });
}

function eventsOnColumn(app: AppResult, ownerId: string, columnId: string) {
  return app.allProcessedEvents
    .filter(ev => ev.ownerEntityId === ownerId && ev.columnId === columnId)
    .sort((a, b) => a.startFrame - b.startFrame);
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

function setupTeam() {
  const view = renderHook(() => useApp());
  const app = () => view.result.current;

  // Populate slots — slot-0 Wulfgard, slot-1 Laevatain, slot-2 Akekuri, slot-3 Yvonne
  act(() => { app().handleSwapOperator(SLOT_0, WULFGARD_ID); });
  act(() => { app().handleSwapOperator(SLOT_1, LAEVATAIN_ID); });
  act(() => { app().handleSwapOperator(SLOT_2, AKEKURI_ID); });
  act(() => { app().handleSwapOperator(SLOT_3, YVONNE_ID); });

  // Equip operator-specific gear sets
  act(() => {
    app().handleLoadoutChange(SLOT_0, gearLoadout(MORDVOLT_ARMOR_ID, MORDVOLT_GLOVES_ID, MORDVOLT_KIT_ID));
  });
  act(() => {
    app().handleLoadoutChange(SLOT_1, gearLoadout(HOT_WORK_ARMOR_ID, HOT_WORK_GLOVES_ID, HOT_WORK_KIT_ID));
  });

  // Yvonne: ensure talentTwoLevel >= 2 so Freezing Point grants a CRIT DMG bonus.
  // (Default getDefaultLoadoutProperties sets it to maxTalentTwoLevel, but we
  // pin it explicitly to keep the test stable across data changes.)
  const yvonneProps = app().loadoutProperties[SLOT_3];
  act(() => {
    app().handleStatsChange(SLOT_3, {
      ...yvonneProps,
      operator: { ...yvonneProps.operator, talentTwoLevel: 2 },
    });
  });

  // Freeform mode — needed to place CRYO / SOLIDIFICATION events on the enemy.
  act(() => { app().setInteractionMode(InteractionModeType.FREEFORM); });

  return view;
}

describe('Cross-operator rotation — multi-system E2E', () => {
  it('chained rotation produces expected buff, reaction, and talent lifecycles', () => {
    const { result } = setupTeam();
    const app = () => result.current;

    // ── Timeline ────────────────────────────────────────────────────────────
    //  t=1s — Wulfgard BS (HEAT). Default HP is full → Mordvolt HP-gate (>=80%)
    //          fires → MORDVOLT_INSULATION buff event appears on slot-0.
    placeSkill(app(), SLOT_0, NounType.BATTLE, 1 * FPS);

    //  t=3s — freeform Combustion reaction on enemy sourced by Laevatain.
    //          Hot Work gear `onTriggerClause` checks for "operator APPLY
    //          REACTION COMBUSTION", so the reaction event itself is what
    //          drives HOT_WORK_HEAT. (Placing a raw HEAT infliction + HEAT BS
    //          would not trigger the reaction-APPLY condition.)
    placeFreeformOnEnemy(app(), REACTION_COLUMNS.COMBUSTION, 3 * FPS, LAEVATAIN_ID);

    //  t=4s — Laevatain BS (HEAT). Damage frames land while Hot Work (Heat)
    //          buff is active on slot-1.
    placeSkill(app(), SLOT_1, NounType.BATTLE, 4 * FPS);

    //  t=5s — Akekuri BS (HEAT). Separate slot; verifies team-wide damage calc
    //          finiteness when multiple HEAT skills chain.
    placeSkill(app(), SLOT_2, NounType.BATTLE, 5 * FPS);

    //  t=8s — freeform SOLIDIFICATION on enemy sourced by Yvonne. This fires
    //          the FREEZING_POINT_TALENT onTriggerClause (T2 = +0.4 CRIT DMG).
    placeFreeformOnEnemy(app(), REACTION_COLUMNS.SOLIDIFICATION, 8 * FPS, YVONNE_ID);

    // ── Calc once ───────────────────────────────────────────────────────────
    const c = calc(app(), CritMode.EXPECTED);

    // ── Assertions ──────────────────────────────────────────────────────────

    // 1) Wulfgard's Mordvolt Insulation buff fired on slot-0.
    const mordvoltBuffs = eventsOnColumn(app(), SLOT_0, MORDVOLT_BUFF.id);
    expect(mordvoltBuffs.length).toBeGreaterThanOrEqual(1);

    // 2) Laevatain's Hot Work (Heat) buff fired on slot-1. Placing a HEAT BS
    //    at 4s on top of a freeform CRYO yields a Combustion reaction which
    //    drives Hot Work. The Hot Work test verifies the same trigger path in
    //    isolation; here we just assert the buff landed on the correct slot.
    const hotWorkBuffs = eventsOnColumn(app(), SLOT_1, HOT_WORK_HEAT_BUFF.id);
    expect(hotWorkBuffs.length).toBeGreaterThanOrEqual(1);

    // 3) Yvonne's Freezing Point talent event materialized on slot-3 in
    //    response to the CRYO/SOLIDIFICATION placements.
    const freezingPointEvents = app().allProcessedEvents.filter(
      ev => ev.id === FREEZING_POINT_ID && ev.ownerEntityId === SLOT_3,
    );
    expect(freezingPointEvents.length).toBeGreaterThanOrEqual(1);

    // 4) Wulfgard's 1s BS damage row exists and includes a Mordvolt
    //    contribution under ARTS_DAMAGE_BONUS by display name (not id).
    const wulfgardRow = c.rows
      .filter(r => r.damage != null && r.damage > 0 && r.params?.sub && r.ownerEntityId === SLOT_0)
      .sort((a, b) => a.absoluteFrame - b.absoluteFrame)[0];
    expect(wulfgardRow).toBeDefined();

    const wulfgardStatSources = wulfgardRow!.params!.sub!.statSources;
    // Walk every stat's source list — the Mordvolt display name must appear
    // somewhere as a contributing source. We intentionally don't pin the
    // exact stat key (engine may move it between ARTS_DAMAGE_BONUS and
    // ELEMENT_DAMAGE_BONUS variants) — just that it lands by display name.
    const mordvoltLabelSeen = Object.values(wulfgardStatSources ?? {}).some(sources =>
      (sources ?? []).some(s => s.source.toLowerCase().includes(MORDVOLT_BUFF.name.toLowerCase())),
    );
    expect(mordvoltLabelSeen).toBe(true);

    // 5) Every damage row has finite, non-NaN damage and populated params.
    const allDamageRows = c.rows.filter(r => r.damage != null && r.damage > 0);
    expect(allDamageRows.length).toBeGreaterThan(0);
    for (const row of allDamageRows) {
      expect(Number.isFinite(row.damage!)).toBe(true);
      expect(Number.isNaN(row.damage!)).toBe(false);
      // params is populated on damage rows
      expect(row.params).toBeDefined();
    }

    // 6) Each populated slot produced at least one damage row — no slot's
    //    pipeline silently zeroed out.
    const slotsWithDamage = new Set(allDamageRows.map(r => r.ownerEntityId));
    expect(slotsWithDamage.has(SLOT_0)).toBe(true);
    expect(slotsWithDamage.has(SLOT_1)).toBe(true);
    expect(slotsWithDamage.has(SLOT_2)).toBe(true);

    // 7) Mordvolt buff's sourceEntityId matches Wulfgard's operator id, not
    //    the slot id (source = triggering entity, owner = whose timeline).
    expect(mordvoltBuffs[0].sourceEntityId).toBe(WULFGARD_ID);
    expect(mordvoltBuffs[0].ownerEntityId).toBe(SLOT_0);

    // 8) Hot Work (Heat) buff's sourceEntityId matches Laevatain.
    expect(hotWorkBuffs[0].sourceEntityId).toBe(LAEVATAIN_ID);
    expect(hotWorkBuffs[0].ownerEntityId).toBe(SLOT_1);

    // 9) Freezing Point talent event belongs to Yvonne's slot.
    expect(freezingPointEvents[0].ownerEntityId).toBe(SLOT_3);

    // 10) Aggregated stats for slot-3 Yvonne have a valid (non-NaN) HP entry —
    //     sanity that the aggregated-stats build didn't silently fail for a
    //     slot that only participates through freeform inflictions.
    const yvonneAggregated = c.aggregatedStats[SLOT_3];
    expect(yvonneAggregated).toBeDefined();
    for (const v of Object.values(yvonneAggregated.stats)) {
      expect(Number.isNaN(v ?? 0)).toBe(false);
    }
  });
});
