/**
 * @jest-environment jsdom
 */

/**
 * Freeform Fragility Damage — E2E
 *
 * Verifies that element-qualified FRAGILITY status events (e.g. Rossi's
 * Razor Clawmark applies PHYSICAL_FRAGILITY + HEAT_FRAGILITY) actually flow
 * through to the damage calc. Mirror of freeformSusceptibilityDamage — places
 * HEAT_FRAGILITY on enemy, edits its value to 10%, fires Akekuri HEAT BS,
 * asserts 1.1× damage multiplier.
 *
 * Pre-fix state: `eventsQueryService.getFragilityBonus` only covered Breach,
 * Electrification, weapon, and talent fragility — generic element-qualified
 * FRAGILITY events were silently dropped by the damage formula.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { buildMultiplierEntries } from '../../../controller/info-pane/damageBreakdownController';
import { ENEMY_ID, ENEMY_GROUP_COLUMNS } from '../../../model/channels';
import { findColumn, getMenuPayload, buildContextMenu } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const HEAT_FRAGILITY_ID: string = require(
  '../../../model/game-data/generic/statuses/status-heat-fragility.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_AKEKURI = 'slot-1';
const BS_START_FRAME = 1 * FPS;
const FRAG_VALUE = 0.10;

beforeEach(() => { localStorage.clear(); });

function placeBattleSkill(app: AppResult) {
  const bsCol = findColumn(app, SLOT_AKEKURI, NounType.BATTLE);
  expect(bsCol).toBeDefined();
  const payload = getMenuPayload(app, bsCol!, BS_START_FRAME);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function placeHeatFragility(app: AppResult) {
  const enemyStatusCol = findColumn(app, ENEMY_ID, ENEMY_GROUP_COLUMNS.ENEMY_STATUS);
  expect(enemyStatusCol).toBeDefined();
  const menuItems = buildContextMenu(app, enemyStatusCol!, 0, 0.5);
  expect(menuItems).not.toBeNull();
  const item = menuItems!.find(
    i => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.defaultSkill?.id === HEAT_FRAGILITY_ID,
  );
  if (item) {
    const payload = item.actionPayload as AddEventPayload;
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  } else {
    // Fallback direct place — for first-run when the column isn't yet materialised.
    app.handleAddEvent(ENEMY_ID, HEAT_FRAGILITY_ID, 0, {
      name: HEAT_FRAGILITY_ID, id: HEAT_FRAGILITY_ID,
      segments: [{ properties: { duration: 10 * FPS } }],
    });
  }
}

function findFragilityUid(app: AppResult): string {
  const ev = app.allProcessedEvents.find(
    e => e.id === HEAT_FRAGILITY_ID && e.ownerEntityId === ENEMY_ID,
  );
  expect(ev).toBeDefined();
  return ev!.uid;
}

function getBsDamageRows(app: AppResult) {
  const calc = runCalculation(
    app.allProcessedEvents, app.columns, app.slots, app.enemy,
    app.loadoutProperties, app.loadouts, app.staggerBreaks, CritMode.NEVER, app.overrides,
  );
  return calc.rows.filter(
    r => r.damage != null && r.damage > 0
      && r.ownerEntityId === SLOT_AKEKURI && r.columnId === NounType.BATTLE,
  );
}

describe('Freeform HEAT_FRAGILITY — Akekuri BS damage E2E', () => {
  it('place fragility via context menu, edit to 10% via info pane, verify 1.1× damage', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Baseline damage — no fragility placed yet.
    act(() => { placeBattleSkill(result.current); });
    const baseRows = getBsDamageRows(result.current);
    expect(baseRows.length).toBeGreaterThan(0);

    // Place HEAT_FRAGILITY on enemy (generic status defaults to statusValue 0).
    act(() => { placeHeatFragility(result.current); });
    const zeroRows = getBsDamageRows(result.current);
    for (let i = 0; i < baseRows.length; i++) {
      expect(zeroRows[i].damage).toBeCloseTo(baseRows[i].damage!, 2);
    }

    // Edit statusValue to 10% via handleUpdateEvent.
    const uid = findFragilityUid(result.current);
    act(() => {
      result.current.handleUpdateEvent(uid, { statusValue: FRAG_VALUE });
    });

    const fragRows = getBsDamageRows(result.current);
    expect(fragRows).toHaveLength(baseRows.length);
    for (let i = 0; i < baseRows.length; i++) {
      const ratio = fragRows[i].damage! / baseRows[i].damage!;
      expect(ratio).toBeCloseTo(1 + FRAG_VALUE, 4);
    }

    // Breakdown info pane must also show the applied STAT — an E2E check
    // that the Fragility row in buildMultiplierEntries carries a non-identity
    // value AND a HEAT sub-entry with a source attribution pointing back to
    // the freeform HEAT_FRAGILITY event (Heat Fragility label).
    const entries = buildMultiplierEntries(fragRows[0].params!);
    const fragEntry = entries.find(e => e.label === 'Fragility');
    expect(fragEntry).toBeDefined();
    expect(fragEntry!.value).toBeCloseTo(1 + FRAG_VALUE, 4);
    const heatSub = fragEntry!.subEntries?.find(s => s.label.toLowerCase() === 'heat');
    expect(heatSub).toBeDefined();
    expect(heatSub!.source).toBe('Active element');
    const heatFragSrc = heatSub!.subEntries?.find(ss => ss.label.toUpperCase().includes('FRAGILITY'));
    expect(heatFragSrc).toBeDefined();
    expect(heatFragSrc!.value).toBeCloseTo(FRAG_VALUE, 4);
  });
});
