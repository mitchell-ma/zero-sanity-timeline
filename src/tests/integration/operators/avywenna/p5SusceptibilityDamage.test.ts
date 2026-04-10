/**
 * @jest-environment jsdom
 */

/**
 * Avywenna P5 Carrot and Sharp Stick — Electric Susceptibility damage E2E
 *
 * P5 potential adds a 1.15× multiplier on Thunderlance / BS damage whenever an
 * Electric Susceptibility event is present on the enemy. Presence alone counts —
 * a 0%-value susceptibility event still enables the bonus.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../../app/useApp';
import { NounType, AdjectiveType, flattenQualifiedId } from '../../../../dsl/semantics';
import { CritMode, ElementType, InteractionModeType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { runCalculation } from '../../../../controller/calculation/calculationController';
import { ENEMY_ID } from '../../../../model/channels';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../../helpers';
import type { AppResult } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const AVYWENNA_ID: string = require(
  '../../../../model/game-data/operators/avywenna/avywenna.json',
).id;
const THUNDERLANCE_PIERCE_ID: string = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance-pierce.json',
).properties.id;
const THUNDERLANCE_EX_PIERCE_ID: string = require(
  '../../../../model/game-data/operators/avywenna/statuses/status-thunderlance-ex-pierce.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';
const ELECTRIC_SUSC_ID = flattenQualifiedId(AdjectiveType.ELECTRIC, NounType.SUSCEPTIBILITY);

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => {
    view.result.current.handleSwapOperator(SLOT, AVYWENNA_ID);
    view.result.current.setInteractionMode(InteractionModeType.FREEFORM);
  });
  return view;
}

function placeBs(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.BATTLE);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function placeCombo(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.COMBO);
  const payload = getMenuPayload(app, col!, atFrame);
  app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
}

function placeElectricSusceptibility(app: AppResult, atFrame: number, durationFrames = 30 * FPS) {
  app.handleAddEvent(ENEMY_ID, ELECTRIC_SUSC_ID, atFrame, {
    name: ELECTRIC_SUSC_ID, id: ELECTRIC_SUSC_ID,
    segments: [{ properties: { duration: durationFrames } }],
  });
}

function setSusceptibility(app: AppResult, value: number) {
  const ev = app.allProcessedEvents.find(e => e.id === ELECTRIC_SUSC_ID && e.ownerEntityId === ENEMY_ID);
  expect(ev).toBeDefined();
  app.handleUpdateEvent(ev!.uid, { susceptibility: { [ElementType.ELECTRIC]: value } });
}

function getBsDamageRows(app: AppResult, startFrame: number, endFrame: number) {
  const calc = runCalculation(
    app.allProcessedEvents, app.columns, app.slots, app.enemy,
    app.loadoutProperties, app.loadouts, app.staggerBreaks, CritMode.NEVER, app.overrides,
  );
  return calc.rows.filter(
    r => r.damage != null && r.damage > 0
      && r.element === ElementType.ELECTRIC
      && r.absoluteFrame >= startFrame && r.absoluteFrame < endFrame,
  );
}

function totalDamage(rows: { damage: number | null }[]) {
  return rows.reduce((sum, r) => sum + (r.damage ?? 0), 0);
}

describe('Avywenna P5 — BS damage gated on Electric Susceptibility', () => {
  it('1) BS at 0s deals LESS damage than BS at 5s with a 0%-value Electric Susceptibility present', () => {
    const { result } = setup();
    act(() => { placeBs(result.current, 1 * FPS); });
    act(() => { placeElectricSusceptibility(result.current, 6 * FPS); });
    act(() => { setSusceptibility(result.current, 0); });
    act(() => { placeBs(result.current, 6 * FPS); });

    const bs1 = totalDamage(getBsDamageRows(result.current, 1 * FPS, 6 * FPS));
    const bs2 = totalDamage(getBsDamageRows(result.current, 6 * FPS, 60 * FPS));
    expect(bs1).toBeGreaterThan(0);
    expect(bs2).toBeGreaterThan(bs1);
  });

  it('4) THUNDERLANCE_PIERCE status produces non-zero damage rows on the combat sheet', () => {
    const { result } = setup();
    act(() => { placeCombo(result.current, 1 * FPS); });
    act(() => { placeBs(result.current, 4 * FPS); });

    const calc = runCalculation(
      result.current.allProcessedEvents, result.current.columns, result.current.slots, result.current.enemy,
      result.current.loadoutProperties, result.current.loadouts, result.current.staggerBreaks, CritMode.NEVER, result.current.overrides,
    );
    const pierceRows = calc.rows.filter(
      r => r.eventUid.includes(THUNDERLANCE_PIERCE_ID),
    );
    expect(pierceRows.length).toBeGreaterThan(0);
    const pierceDamage = pierceRows.reduce((sum, r) => sum + (r.damage ?? 0), 0);
    expect(pierceDamage).toBeGreaterThan(0);
  });

  it('6) THUNDERLANCE_PIERCE deals LESS damage without any Electric Susceptibility than with a 0%-value one', () => {
    // Baseline: combo + BS, no susceptibility event at all.
    const a = setup();
    act(() => { placeCombo(a.result.current, 1 * FPS); });
    act(() => { placeBs(a.result.current, 4 * FPS); });
    const calcA = runCalculation(
      a.result.current.allProcessedEvents, a.result.current.columns, a.result.current.slots, a.result.current.enemy,
      a.result.current.loadoutProperties, a.result.current.loadouts, a.result.current.staggerBreaks, CritMode.NEVER, a.result.current.overrides,
    );
    const pierceDmgNoSusc = calcA.rows
      .filter(r => r.eventUid.includes(THUNDERLANCE_PIERCE_ID))
      .reduce((sum, r) => sum + (r.damage ?? 0), 0);
    expect(pierceDmgNoSusc).toBeGreaterThan(0);

    // With a freeform 0% Electric Susceptibility event present during pierce.
    const b = setup();
    act(() => { placeElectricSusceptibility(b.result.current, 0); });
    act(() => { setSusceptibility(b.result.current, 0); });
    act(() => { placeCombo(b.result.current, 1 * FPS); });
    act(() => { placeBs(b.result.current, 4 * FPS); });
    const calcB = runCalculation(
      b.result.current.allProcessedEvents, b.result.current.columns, b.result.current.slots, b.result.current.enemy,
      b.result.current.loadoutProperties, b.result.current.loadouts, b.result.current.staggerBreaks, CritMode.NEVER, b.result.current.overrides,
    );
    const pierceDmgWithSusc = calcB.rows
      .filter(r => r.eventUid.includes(THUNDERLANCE_PIERCE_ID))
      .reduce((sum, r) => sum + (r.damage ?? 0), 0);
    expect(pierceDmgWithSusc).toBeGreaterThan(pierceDmgNoSusc);
  });

  it('7) THUNDERLANCE_EX_PIERCE benefits from Electric Susceptibility (ult self-applies susc)', () => {
    // EX pierce only fires inside the ult, which itself applies ELECTRIC_SUSCEPTIBILITY
    // to the enemy — so the pot bonus is always active on EX pierce. Verify EX pierce
    // damage reflects the 1.15× bonus by comparing against the P5 formula.
    const { result } = setup();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    const ultCol = findColumn(result.current, SLOT, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 1 * FPS);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });
    act(() => { placeBs(result.current, 5 * FPS); });

    const calc = runCalculation(
      result.current.allProcessedEvents, result.current.columns, result.current.slots, result.current.enemy,
      result.current.loadoutProperties, result.current.loadouts, result.current.staggerBreaks, CritMode.NEVER, result.current.overrides,
    );
    const exRows = calc.rows.filter(r => r.eventUid.includes(THUNDERLANCE_EX_PIERCE_ID));
    expect(exRows.length).toBeGreaterThan(0);
    // Every EX pierce row's multiplier must include the P5 × susceptibility bonus
    // (base × 1.15), so no row may have multiplier ≤ base at skill level 12 (4.32).
    for (const row of exRows) {
      expect(row.multiplier).toBeGreaterThan(4.32);
    }
  });

  it('5) THUNDERLANCE_EX_PIERCE status produces non-zero damage rows on the combat sheet', () => {
    const { result } = setup();
    act(() => { setUltimateEnergyToMax(result.current, SLOT, 0); });
    const ultCol = findColumn(result.current, SLOT, NounType.ULTIMATE);
    const ultPayload = getMenuPayload(result.current, ultCol!, 1 * FPS);
    act(() => { result.current.handleAddEvent(ultPayload.ownerEntityId, ultPayload.columnId, ultPayload.atFrame, ultPayload.defaultSkill); });
    act(() => { placeBs(result.current, 5 * FPS); });

    const calc = runCalculation(
      result.current.allProcessedEvents, result.current.columns, result.current.slots, result.current.enemy,
      result.current.loadoutProperties, result.current.loadouts, result.current.staggerBreaks, CritMode.NEVER, result.current.overrides,
    );
    const pierceRows = calc.rows.filter(
      r => r.eventUid.includes(THUNDERLANCE_EX_PIERCE_ID),
    );
    expect(pierceRows.length).toBeGreaterThan(0);
    const pierceDamage = pierceRows.reduce((sum, r) => sum + (r.damage ?? 0), 0);
    expect(pierceDamage).toBeGreaterThan(0);
  });

});
