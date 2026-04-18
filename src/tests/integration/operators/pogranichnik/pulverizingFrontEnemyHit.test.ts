/**
 * @jest-environment jsdom
 */

/**
 * Pogranichnik — The Pulverizing Front ENEMY_HIT supplied parameter E2E
 *
 * JSON: `battle-skill-the-pulverizing-front.json` defines
 *   suppliedParameters.VARY_BY.ENEMY_HIT { lowerRange: 1, upperRange: 2, default: 1 }
 * The frame at offset 1.27s carries a clause:
 *   IF THIS OPERATOR HAVE POTENTIAL >= 1
 *     RETURN SKILL_POINT  VARY_BY ENEMY_HIT [0, 15]
 *
 * Verifies the full view → controller → engine → SP timeline round-trip:
 *   1. The BS context menu exposes a parameterSubmenu for ENEMY_HIT (×1, ×2).
 *   2. Placing with ENEMY_HIT=1 at P1 emits NO SP_RETURN event (value=0).
 *   3. Placing with ENEMY_HIT=2 at P1 emits exactly one SP_RETURN event with
 *      amount=15 at the frame offset.
 *   4. At P0, ENEMY_HIT=2 still emits NO SP_RETURN (potential condition fails).
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { InteractionModeType } from '../../../../consts/enums';
import { useApp } from '../../../../app/useApp';
import { FPS } from '../../../../utils/timeline';
import { TEAM_ID, COMMON_COLUMN_IDS } from '../../../../controller/slot/commonSlotController';
import { findColumn, buildContextMenu } from '../../helpers';
import type { AddEventPayload } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const POGRANICHNIK_ID: string = require('../../../../model/game-data/operators/pogranichnik/pogranichnik.json').id;
const BS_JSON = require('../../../../model/game-data/operators/pogranichnik/skills/battle-skill-the-pulverizing-front.json');
const BS_ID: string = BS_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_POG = 'slot-3';
const PLACE_FRAME = 5 * FPS;

beforeEach(() => { localStorage.clear(); });

function setupPog(potential: number) {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_POG, POGRANICHNIK_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    const props = view.result.current.loadoutProperties[SLOT_POG];
    view.result.current.handleStatsChange(SLOT_POG, { ...props, operator: { ...props.operator, potential } });
  });
  return view;
}

/** Find the Pulverizing Front menu item from the BATTLE context menu. */
function findBsItem(app: ReturnType<typeof useApp>, atFrame: number) {
  const col = findColumn(app, SLOT_POG, NounType.BATTLE);
  expect(col).toBeDefined();
  const items = buildContextMenu(app, col!, atFrame);
  expect(items).not.toBeNull();
  return items!.find(
    (i) => i.actionId === 'addEvent'
      && (i.actionPayload as AddEventPayload)?.defaultSkill?.id === BS_ID,
  );
}

/** Place Pulverizing Front with a specific ENEMY_HIT override. Mirrors the view:
 *  user picks an option in the parameterSubmenu, then clicks the main row. */
function placeWithEnemyHit(app: ReturnType<typeof useApp>, enemyHit: number) {
  const item = findBsItem(app, PLACE_FRAME);
  expect(item).toBeDefined();
  const payload = item!.actionPayload as AddEventPayload;
  const skill = {
    ...payload.defaultSkill,
    parameterValues: { ...(payload.defaultSkill.parameterValues ?? {}), ENEMY_HIT: enemyHit },
  };
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, skill);
  });
}

const SP_GRAPH_KEY = `${TEAM_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;

/** Sum of SP added to the RETURNED pool across the whole timeline.
 *  graph.points = natural + returned; graph.naturalPoints = natural only.
 *  At the final graph point (frame = TOTAL_FRAMES, both pools fully regen'd
 *  to their respective caps), `total − natural` equals the RETURN SP amount
 *  produced by the pipeline — isolated cleanly from regen and cost. */
function getReturnedSpTotal(app: ReturnType<typeof useApp>): number {
  const graph = app.resourceGraphs.get(SP_GRAPH_KEY);
  if (!graph) throw new Error(`No SP graph at key ${SP_GRAPH_KEY}`);
  const pts = graph.points;
  const nats = graph.naturalPoints ?? [];
  const lastTotal = pts[pts.length - 1]?.value ?? 0;
  const lastNat = nats[nats.length - 1]?.value ?? lastTotal;
  return Math.max(0, lastTotal - lastNat);
}

describe('Pogranichnik — The Pulverizing Front ENEMY_HIT', () => {

  it('context menu exposes parameterSubmenu ENEMY_HIT (×1, ×2)', () => {
    const { result } = setupPog(1);
    const item = findBsItem(result.current, PLACE_FRAME);
    expect(item).toBeDefined();
    expect(item!.inlineButtons).toBeUndefined();
    expect(item!.parameterSubmenu).toBeDefined();
    expect(item!.parameterSubmenu!).toHaveLength(1);
    const axis = item!.parameterSubmenu![0];
    expect(axis.paramId).toBe('ENEMY_HIT');
    expect(axis.options.map((o) => o.label)).toEqual(['\u00d71', '\u00d72']);
    expect(axis.options.find((o) => o.isDefault)?.value).toBe(1);
  });

  it('P1 + ENEMY_HIT=1 → VARY_BY index 0 = 0 SP returned', () => {
    const { result } = setupPog(1);
    placeWithEnemyHit(result.current, 1);
    expect(getReturnedSpTotal(result.current)).toBeCloseTo(0, 5);
  });

  it('P1 + ENEMY_HIT=2 → VARY_BY index 1 = 15 SP returned', () => {
    const { result } = setupPog(1);
    placeWithEnemyHit(result.current, 2);
    expect(getReturnedSpTotal(result.current)).toBeCloseTo(15, 5);
  });

  it('P0 + ENEMY_HIT=2 → potential condition fails, no SP returned', () => {
    const { result } = setupPog(0);
    placeWithEnemyHit(result.current, 2);
    expect(getReturnedSpTotal(result.current)).toBeCloseTo(0, 5);
  });
});
