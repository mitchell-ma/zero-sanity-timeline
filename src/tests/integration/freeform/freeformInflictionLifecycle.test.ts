/**
 * @jest-environment jsdom
 */

/**
 * Freeform infliction lifecycle — integration tests.
 *
 * Pins the invariants that the freeform-placed infliction path must satisfy
 * before and after unifying with the natural (skill-triggered) infliction
 * path at the APPLY-clause PROCESS_FRAME. Any regression in these tests
 * during the refactor means the merge is missing a behavior.
 *
 * Primary invariant: a freeform infliction's lifecycle (end frame, talent
 * consume timing) matches the CRYO infliction it applies — i.e. a single
 * EVENT_END scheduled at the time-stop-extended end frame, not duplicated
 * at the raw unextended end.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { ColumnType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_ID, ENEMY_GROUP_COLUMNS } from '../../../model/channels';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../helpers';
import type { AppResult } from '../helpers';
import type { MiniTimeline } from '../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const FREEZING_POINT_TALENT_ID: string =
  require('../../../model/game-data/operators/yvonne/talents/talent-freezing-point-talent.json').properties.id;
const YVONNE_ID: string = require('../../../model/game-data/operators/yvonne/yvonne.json').id;
const AKEKURI_ID: string = require('../../../model/game-data/operators/akekuri/akekuri.json').id;
const ARDELIA_ID: string = require('../../../model/game-data/operators/ardelia/ardelia.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_YVONNE = 'slot-0';
const SLOT_ARDELIA = 'slot-3';

beforeEach(() => { localStorage.clear(); });

function setupTeam() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator('slot-0', YVONNE_ID); });
  act(() => { view.result.current.handleSwapOperator('slot-1', AKEKURI_ID); });
  act(() => { view.result.current.handleSwapOperator(SLOT_ARDELIA, ARDELIA_ID); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  // Enable Yvonne T2 so FREEZING_POINT_TALENT fires on CRYO apply
  act(() => {
    const props = view.result.current.loadoutProperties[SLOT_YVONNE];
    view.result.current.handleStatsChange(SLOT_YVONNE, {
      ...props, operator: { ...props.operator, talentTwoLevel: 2 },
    });
  });
  return view;
}

function totalDur(ev: { segments: { properties: { duration: number } }[] }) {
  return ev.segments.reduce((s, x) => s + x.properties.duration, 0);
}

function findEnemyStatusColumn(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === ENEMY_ID &&
      c.columnId === ENEMY_GROUP_COLUMNS.ENEMY_STATUS,
  );
}

/**
 * Place a freeform infliction via the context-menu path so its raw event
 * carries the synthesized APPLY-clause frame that the real UI produces.
 * This is essential: placing via a hand-built `{name, segments}` without
 * frames masks the EVENT_END-duplication bug (`hasFrames = false` sends
 * flatten down a different branch).
 */
function placeFreeformInflictionViaMenu(
  app: AppResult,
  variantLabel: string,
  columnId: string,
  atFrame: number,
  durationFrames?: number,
) {
  const enemyCol = findEnemyStatusColumn(app);
  expect(enemyCol).toBeDefined();
  const payload = getMenuPayload(app, enemyCol!, atFrame, variantLabel);
  // Rewrite the defaultSkill duration so the test controls it precisely,
  // while preserving the synthesized APPLY-clause frame attached by the
  // column's defaultEvent.
  const defaultSkill = { ...(payload.defaultSkill as Record<string, unknown>) };
  if (durationFrames != null) {
    const src = defaultSkill.segments as { properties: { duration: number }; frames?: unknown[] }[] | undefined;
    if (src && src.length > 0) {
      defaultSkill.segments = src.map((s, i) => i === 0
        ? { ...s, properties: { ...s.properties, duration: durationFrames } }
        : s);
    } else {
      defaultSkill.segments = [{ properties: { duration: durationFrames } }];
    }
  }
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, columnId, atFrame, defaultSkill);
  });
}

function placeFreeformCryo(app: AppResult, atFrame: number, durationFrames?: number) {
  placeFreeformInflictionViaMenu(app, 'Cryo', INFLICTION_COLUMNS.CRYO, atFrame, durationFrames);
}

function placeFreeformHeat(app: AppResult, atFrame: number, durationFrames?: number) {
  placeFreeformInflictionViaMenu(app, 'Heat', INFLICTION_COLUMNS.HEAT, atFrame, durationFrames);
}

function placeFreeformCorrosion(app: AppResult, atFrame: number) {
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, REACTION_COLUMNS.CORROSION, atFrame,
      { name: REACTION_COLUMNS.CORROSION, segments: [{ properties: { duration: 7 * FPS } }] },
    );
  });
}

function addYvonneUlt(app: AppResult, atFrame: number) {
  act(() => { setUltimateEnergyToMax(app, SLOT_YVONNE, 0); });
  const col = findColumn(app, SLOT_YVONNE, NounType.ULTIMATE);
  const payload = getMenuPayload(app, col!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function findFirstCryo(app: AppResult) {
  return app.allProcessedEvents.find(
    ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
  );
}

function findFirstFp(app: AppResult) {
  return app.allProcessedEvents.find(
    ev => ev.ownerEntityId === SLOT_YVONNE && ev.id === FREEZING_POINT_TALENT_ID,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Regression: freeform CRYO + overlapping time-stop → FP aligned with CRYO
//    This directly exercises the duplicate-EVENT_END bug.
// ─────────────────────────────────────────────────────────────────────────────

describe('A. Freeform CRYO + time-stop → Freezing Point alignment', () => {
  it('CRYO placed first then Yvonne ult: FP end frame matches CRYO extended end', () => {
    const view = setupTeam();
    const app = view.result.current;

    placeFreeformCryo(app, 0, 60);
    addYvonneUlt(app, 30);

    const cryo = findFirstCryo(view.result.current);
    const fp = findFirstFp(view.result.current);
    expect(cryo).toBeDefined();
    expect(fp).toBeDefined();

    const cryoEnd = cryo!.startFrame + totalDur(cryo!);
    const fpEnd = fp!.startFrame + totalDur(fp!);
    expect(Math.abs(fpEnd - cryoEnd)).toBeLessThanOrEqual(1);
    expect(totalDur(cryo!)).toBeGreaterThan(60); // extended by the stop
  });

  it('Yvonne ult placed first then CRYO during stop: FP end frame matches CRYO extended end', () => {
    const view = setupTeam();
    const app = view.result.current;

    addYvonneUlt(app, 0);
    placeFreeformCryo(app, 30, 120);

    const cryo = findFirstCryo(view.result.current);
    const fp = findFirstFp(view.result.current);
    expect(cryo).toBeDefined();
    expect(fp).toBeDefined();

    const cryoEnd = cryo!.startFrame + totalDur(cryo!);
    const fpEnd = fp!.startFrame + totalDur(fp!);
    expect(Math.abs(fpEnd - cryoEnd)).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Baseline: no stops → CRYO and FP match raw exactly
// ─────────────────────────────────────────────────────────────────────────────

describe('B. Freeform CRYO, no stops → FP matches raw', () => {
  it('no time-stop: FP and CRYO have identical duration and start frame', () => {
    const view = setupTeam();
    const app = view.result.current;

    placeFreeformCryo(app, 0, 120);

    const cryo = findFirstCryo(view.result.current);
    const fp = findFirstFp(view.result.current);
    expect(cryo).toBeDefined();
    expect(fp).toBeDefined();

    expect(totalDur(cryo!)).toBe(120);
    expect(totalDur(fp!)).toBe(120);
    expect(fp!.startFrame).toBe(cryo!.startFrame);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Freeform CORROSION multi-segment layout (engine-built tiers)
// ─────────────────────────────────────────────────────────────────────────────

describe('C. Freeform CORROSION segment layout', () => {
  it('freeform CORROSION is represented as a multi-segment event on the reaction column', () => {
    const view = setupTeam();
    const app = view.result.current;

    placeFreeformCorrosion(app, 60);

    const corrosion = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.CORROSION,
    );
    expect(corrosion).toBeDefined();
    // `buildCorrosionSegments` produces one segment per tier (typically 7).
    expect(corrosion!.segments.length).toBeGreaterThanOrEqual(2);
    // Total duration should match the reaction config's duration (or the user-placed value).
    expect(totalDur(corrosion!)).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Cross-element reaction from two freeform inflictions
// ─────────────────────────────────────────────────────────────────────────────

describe('D. Cross-element reaction from freeform inflictions', () => {
  it('freeform HEAT then freeform CRYO produces SOLIDIFICATION reaction (CRYO is the triggering infliction)', () => {
    const view = setupTeam();
    const app = view.result.current;

    placeFreeformHeat(app, 0, 20 * FPS);
    placeFreeformCryo(app, 60, 20 * FPS);

    const reaction = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.SOLIDIFICATION,
    );
    expect(reaction).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Drag — applied event tracks the raw wrapper
// ─────────────────────────────────────────────────────────────────────────────

describe('E. Freeform infliction drag', () => {
  it('applied CRYO event moves when the freeform wrapper is dragged', () => {
    const view = setupTeam();
    const app = view.result.current;

    placeFreeformCryo(app, 0, 180);

    const cryoBefore = findFirstCryo(view.result.current);
    expect(cryoBefore).toBeDefined();
    const uid = cryoBefore!.uid;

    act(() => { view.result.current.handleMoveEvent(uid, 120); });

    const cryoAfter = findFirstCryo(view.result.current);
    expect(cryoAfter).toBeDefined();
    expect(cryoAfter!.startFrame).toBe(120);
    expect(totalDur(cryoAfter!)).toBe(180);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Stacking: two freeform CRYOs co-active extend to the later stack's end
// ─────────────────────────────────────────────────────────────────────────────

describe('F. Freeform CRYO stacking', () => {
  it('a second freeform CRYO applied while the first is active extends the first to match', () => {
    const view = setupTeam();
    const app = view.result.current;

    placeFreeformCryo(app, 0, 120);
    placeFreeformCryo(app, 60, 120);

    const cryos = view.result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    );
    expect(cryos.length).toBe(2);

    // Both events should have end frames aligned with the later stack's end (frame 180).
    const ends = cryos.map(ev => ev.startFrame + totalDur(ev));
    expect(Math.max(...ends)).toBe(180);
    // Co-active extension: first stack should have been pushed out to 180.
    const first = cryos.find(ev => ev.startFrame === 0)!;
    expect(first.startFrame + totalDur(first)).toBe(180);
  });
});
