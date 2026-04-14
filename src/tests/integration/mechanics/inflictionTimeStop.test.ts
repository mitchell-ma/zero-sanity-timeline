/**
 * @jest-environment jsdom
 */

/**
 * Infliction + time-stop interaction.
 *
 * Verifies that infliction durations are extended by overlapping foreign
 * time-stops (ults / combos / dodges), and that EVENT_END / IS_NOT triggers
 * fire only at the extended end — not at the raw unextended end.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { INFLICTION_COLUMNS, REACTION_COLUMNS, ENEMY_ID } from '../../../model/channels';
import { findColumn, getMenuPayload, setUltimateEnergyToMax } from '../../integration/helpers';
import type { AppResult } from '../../integration/helpers';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { eventEndFrame } from '../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const FREEZING_POINT_TALENT_ID: string =
  require('../../../model/game-data/operators/yvonne/talents/talent-freezing-point-talent.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setupWithOperator(opId: string) {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, opId); });
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
}

function placeCryo(app: AppResult, atFrame: number, durationSec = 20) {
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, INFLICTION_COLUMNS.CRYO, atFrame,
      { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
}

function addUlt(app: AppResult, atFrame: number) {
  act(() => { setUltimateEnergyToMax(app, SLOT, 0); });
  const col = findColumn(app, SLOT, NounType.ULTIMATE);
  const payload = getMenuPayload(app, col!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function totalDur(ev: { segments: { properties: { duration: number } }[] }) {
  return ev.segments.reduce((s, x) => s + x.properties.duration, 0);
}

function placeSolidification(app: AppResult, atFrame: number, durationSec = 20) {
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, atFrame,
      { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: durationSec * FPS } }] },
    );
  });
}

describe('Infliction + time-stop', () => {
  it('places CRYO first then Yvonne ult: CRYO segment duration is extended by overlapping time-stop', () => {
    const view = setupWithOperator('YVONNE');
    const app = view.result.current;

    // 20s CRYO infliction at frame 120 (1s)
    placeCryo(app, 1 * FPS);
    // Yvonne ult at frame 360 (3s) — animation TIME_STOP is 2.03s
    addUlt(app, 3 * FPS);

    const cryo = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    );
    expect(cryo).toBeDefined();
    const dur = totalDur(cryo!);
    // Raw = 20 * 120 = 2400 frames. Yvonne ult animation = ~2.03s = ~244 frames.
    // Extended should be 2400 + 244 = 2644 (give or take rounding).
    expect(dur).toBeGreaterThan(2400);
    expect(dur).toBeCloseTo(2644, -1);
  });

  it('places Yvonne ult first then CRYO: CRYO segment duration is extended by overlapping time-stop', () => {
    const view = setupWithOperator('YVONNE');
    const app = view.result.current;

    addUlt(app, 3 * FPS);
    // CRYO overlaps with ult animation window (3s–~5.03s)
    placeCryo(app, 2 * FPS);

    const cryo = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    );
    expect(cryo).toBeDefined();
    const dur = totalDur(cryo!);
    expect(dur).toBeGreaterThan(2400);
    expect(dur).toBeCloseTo(2644, -1);
  });

  it('CRYO + Yvonne ult: exactly one T2 end (not two) — no duplicate EVENT_END firing', () => {
    const view = setupWithOperator('YVONNE');
    const props = view.result.current.loadoutProperties[SLOT];
    act(() => {
      view.result.current.handleStatsChange(SLOT, {
        ...props, operator: { ...props.operator, talentTwoLevel: 2 },
      });
    });

    // 20s CRYO at 1s (raw end = 21s; if time-stop extends, end = 21.02..s)
    placeCryo(view.result.current, 1 * FPS, 20);
    // Ult during CRYO window (time-stop extends CRYO by ~2.03s)
    addUlt(view.result.current, 3 * FPS);

    const cryo = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    )!;
    const cryoEnd = cryo.startFrame + totalDur(cryo);

    const t2Events = view.result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.id === FREEZING_POINT_TALENT_ID,
    );
    expect(t2Events.length).toBe(1);
    const t2End = t2Events[0].startFrame + totalDur(t2Events[0]);
    // T2 end should align with CRYO's extended end (shared lifecycle via BECOME-NOT).
    // Off-by-one tolerance for engine frame rounding.
    expect(Math.abs(t2End - cryoEnd)).toBeLessThanOrEqual(1);
  });

  it('user URL scenario: Yvonne+Alesh ults overlap CRYO → CRYO extended, T2 aligned with CRYO end', () => {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator('slot-0', 'YVONNE'); });
    act(() => { view.result.current.handleSwapOperator('slot-1', 'ALESH'); });
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    const props = view.result.current.loadoutProperties['slot-0'];
    act(() => {
      view.result.current.handleStatsChange('slot-0', {
        ...props, operator: { ...props.operator, talentTwoLevel: 2 },
      });
    });

    // Yvonne ult at frame 81
    act(() => { setUltimateEnergyToMax(view.result.current, 'slot-0', 0); });
    const yvonneUltCol = findColumn(view.result.current, 'slot-0', NounType.ULTIMATE);
    const yvonneUltPayload = getMenuPayload(view.result.current, yvonneUltCol!, 81);
    act(() => {
      view.result.current.handleAddEvent(yvonneUltPayload.ownerEntityId, yvonneUltPayload.columnId, yvonneUltPayload.atFrame, yvonneUltPayload.defaultSkill);
    });

    // Freeform CRYO at frame 343, 20s duration
    act(() => {
      view.result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.CRYO, 343,
        { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 2400 } }] },
      );
    });
    // Second ult (Alesh) at frame 476 — its animation is a TIME_STOP overlapping CRYO
    act(() => { setUltimateEnergyToMax(view.result.current, 'slot-1', 0); });
    const aleshUltCol = findColumn(view.result.current, 'slot-1', NounType.ULTIMATE);
    const aleshUltPayload = getMenuPayload(view.result.current, aleshUltCol!, 476);
    act(() => {
      view.result.current.handleAddEvent(aleshUltPayload.ownerEntityId, aleshUltPayload.columnId, aleshUltPayload.atFrame, aleshUltPayload.defaultSkill);
    });

    const cryo = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    )!;
    const aleshUlt = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === 'slot-1' && ev.columnId === NounType.ULTIMATE,
    )!;
    const aleshAnimDur = aleshUlt.segments[0].properties.duration;
    const cryoDur = totalDur(cryo);
    const cryoEnd = cryo.startFrame + cryoDur;

    const t2 = view.result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === 'slot-0' && ev.id === FREEZING_POINT_TALENT_ID,
    );
    // CRYO should be extended past its raw duration by at least the overlapping
    // time-stop duration (may be extended further by downstream CRYO applications).
    expect(cryoDur).toBeGreaterThan(2400);
    expect(cryoDur).toBeGreaterThanOrEqual(2400 + aleshAnimDur);
    // T2 should align with CRYO end — the BECOME-NOT consume fires at the
    // *real* (possibly refresh-extended) end, not an earlier raw end.
    expect(t2.length).toBeGreaterThanOrEqual(1);
    const lastT2 = t2.reduce((a, b) => (a.startFrame + totalDur(a)) > (b.startFrame + totalDur(b)) ? a : b);
    const lastT2End = lastT2.startFrame + totalDur(lastT2);
    expect(Math.abs(lastT2End - cryoEnd)).toBeLessThanOrEqual(1);
  });

  it('user URL exact: Yvonne ULT + EBATK + freeform CRYO + freeform SOLIDIFICATION + slot-3 ULT — CRYO renders extended in view', () => {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator('slot-0', 'YVONNE'); });
    act(() => { view.result.current.handleSwapOperator('slot-3', 'CATCHER'); });
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Yvonne ULT at frame 81 (matches URL)
    act(() => { setUltimateEnergyToMax(view.result.current, 'slot-0', 0); });
    const yvCol = findColumn(view.result.current, 'slot-0', NounType.ULTIMATE);
    const yvPayload = getMenuPayload(view.result.current, yvCol!, 81);
    act(() => {
      view.result.current.handleAddEvent(yvPayload.ownerEntityId, yvPayload.columnId, yvPayload.atFrame, yvPayload.defaultSkill);
    });

    // Freeform CRYO at frame 343 (AFTER Yvonne anim ends at 325 — so only slot-3 ult should extend it)
    act(() => {
      view.result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.CRYO, 343,
        { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 2400 } }] },
      );
    });

    // slot-3 ult at frame 476 — overlaps CRYO active window
    act(() => { setUltimateEnergyToMax(view.result.current, 'slot-3', 0); });
    const slot3Col = findColumn(view.result.current, 'slot-3', NounType.ULTIMATE);
    const slot3Payload = getMenuPayload(view.result.current, slot3Col!, 476);
    act(() => {
      view.result.current.handleAddEvent(slot3Payload.ownerEntityId, slot3Payload.columnId, slot3Payload.atFrame, slot3Payload.defaultSkill);
    });

    // Freeform SOLIDIFICATION at frame 750 — reaction on enemy. Matches the URL scenario.
    act(() => {
      view.result.current.handleAddEvent(
        ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, 750,
        { name: REACTION_COLUMNS.SOLIDIFICATION, segments: [{ properties: { duration: 720 } }] },
      );
    });

    const cryo = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO && ev.startFrame === 343,
    )!;
    const slot3Ult = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === 'slot-3' && ev.columnId === NounType.ULTIMATE,
    )!;
    const slot3AnimDur = slot3Ult.segments[0].properties.duration;

    const cryoDur = totalDur(cryo);
    // Engine layer: CRYO extended by slot-3's animation time-stop (Yvonne's stop ended at 325 before CRYO started at 343).
    expect(cryoDur).toBeGreaterThanOrEqual(2400 + slot3AnimDur);

    // View layer: computeTimelinePresentation surfaces the extended duration.
    const viewModels = computeTimelinePresentation(
      view.result.current.allProcessedEvents,
      view.result.current.columns,
    );
    const cryoVm = Array.from(viewModels.values()).find(vm =>
      vm.events.some(e => e.uid === cryo.uid),
    );
    expect(cryoVm).toBeDefined();
    const viewCryo = cryoVm!.events.find(e => e.uid === cryo.uid)!;
    expect(totalDur(viewCryo)).toBe(cryoDur);
    expect(eventEndFrame(viewCryo)).toBe(cryo.startFrame + cryoDur);
    // If a visual override is set (stacking tile clamp), it must match the
    // extended duration — never the raw pre-extension value.
    const override = cryoVm!.statusOverrides.get(cryo.uid);
    const visualDur = override?.visualActivationDuration;
    expect(visualDur == null || visualDur === cryoDur).toBe(true);
  });

  it('view-layer: CRYO visible end (eventEndFrame + view microPosition) matches time-stop-extended end', () => {
    const view = setupWithOperator('YVONNE');

    // CRYO 20s at 1s (raw end = 21s; extended should land past 21s)
    placeCryo(view.result.current, 1 * FPS, 20);
    // Ult at 3s — animation is a TIME_STOP that overlaps CRYO
    addUlt(view.result.current, 3 * FPS);

    const cryo = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    )!;
    const ult = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    )!;
    const animDur = ult.segments[0].properties.duration;

    // ── Engine layer: raw segment duration is extended ──────────────────────
    const rawDur = 2400;
    expect(totalDur(cryo)).toBe(rawDur + animDur);
    expect(eventEndFrame(cryo)).toBe(cryo.startFrame + rawDur + animDur);

    // ── View controller layer: microPosition widthFrac reflects extended end ─
    const viewModels = computeTimelinePresentation(
      view.result.current.allProcessedEvents,
      view.result.current.columns,
    );
    // Find the column that hosts CRYO (CRYO_INFLICTION column on enemy)
    const cryoColKey = `${ENEMY_ID}${String.fromCharCode(0)}${INFLICTION_COLUMNS.CRYO}`;
    const cryoVm = Array.from(viewModels.values()).find(vm =>
      vm.events.some(e => e.uid === cryo.uid),
    );
    expect(cryoVm).toBeDefined();
    // The view's events array should carry the extended-duration segment
    const viewCryo = cryoVm!.events.find(e => e.uid === cryo.uid)!;
    expect(totalDur(viewCryo)).toBe(rawDur + animDur);
    // Ensure the column view model did not silently replace duration with raw
    expect(viewCryo.segments[0].properties.duration).toBeGreaterThan(rawDur);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    cryoColKey; // retained for debugging if lookups change
  });

  it('freeform CRYO is extended by a LATER ult time-stop (2nd operator)', () => {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator('slot-0', 'YVONNE'); });
    act(() => { view.result.current.handleSwapOperator('slot-1', 'CATCHER'); });
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Freeform CRYO at frame 343 (matches user's scenario)
    act(() => {
      view.result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.CRYO, 343,
        { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 2400 } }] },
      );
    });
    // Catcher's ult (Squad on Me) at frame 476 — animation is a TIME_STOP that overlaps the CRYO.
    act(() => { setUltimateEnergyToMax(view.result.current, 'slot-1', 0); });
    const col = findColumn(view.result.current, 'slot-1', NounType.ULTIMATE);
    const payload = getMenuPayload(view.result.current, col!, 476);
    act(() => {
      view.result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    const cryo = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    )!;
    // eslint-disable-next-line no-console
    console.log('freeform CRYO:', { start: cryo.startFrame, dur: totalDur(cryo), end: cryo.startFrame + totalDur(cryo) });

    const ult = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === 'slot-1' && ev.columnId === NounType.ULTIMATE,
    )!;
    const animDur = ult.segments[0].properties.duration;
    // eslint-disable-next-line no-console
    console.log('catcher ult:', { start: ult.startFrame, animDur });

    // CRYO should be extended by the animation time-stop duration
    const rawDur = 2400;
    const expectedDur = rawDur + animDur;
    expect(totalDur(cryo)).toBe(expectedDur);
  });

  it('drag-edited infliction is re-extended by overlapping time-stop after resize + move', () => {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator('slot-0', 'AKEKURI'); });
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Akekuri CS at frame 0 — animation is a TIME_STOP
    const csCol = findColumn(view.result.current, 'slot-0', NounType.COMBO);
    const csMenu = getMenuPayload(view.result.current, csCol!, 0);
    act(() => {
      view.result.current.handleAddEvent(csMenu.ownerEntityId, csMenu.columnId, csMenu.atFrame, csMenu.defaultSkill);
    });
    const cs = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === 'slot-0' && ev.columnId === NounType.COMBO,
    )!;
    const csAnimDur = cs.segments[0].properties.duration;

    // Place ELECTRIC infliction at frame 120 (1s) with raw 1s duration
    act(() => {
      view.result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.ELECTRIC, 1 * FPS,
        { name: INFLICTION_COLUMNS.ELECTRIC, segments: [{ properties: { duration: 1 * FPS } }] },
      );
    });

    // Resize infliction to 5s
    const infl1 = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.ELECTRIC,
    )!;
    act(() => {
      view.result.current.handleResizeSegment(infl1.uid, [{ segmentIndex: 0, newDuration: 5 * FPS }]);
    });

    // Drag infliction to frame 0 (start offset 0)
    const infl2 = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.ELECTRIC,
    )!;
    act(() => {
      view.result.current.handleMoveEvent(infl2.uid, 0);
    });

    // Infliction now overlaps the Akekuri CS time-stop; expect extended duration.
    const finalInfl = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.ELECTRIC,
    )!;
    const finalDur = totalDur(finalInfl);
    expect(finalInfl.startFrame).toBe(0);
    expect(finalDur).toBe(5 * FPS + csAnimDur);
  });

  it('drag-edited CRYO and Yvonne T2 share start/end/duration after time-stop extension', () => {
    const view = renderHook(() => useApp());
    act(() => { view.result.current.handleSwapOperator('slot-0', 'YVONNE'); });
    act(() => { view.result.current.handleSwapOperator('slot-1', 'AKEKURI'); });
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
    // Enable Yvonne T2 so FREEZING_POINT_TALENT fires on CRYO apply
    const props = view.result.current.loadoutProperties['slot-0'];
    act(() => {
      view.result.current.handleStatsChange('slot-0', {
        ...props, operator: { ...props.operator, talentTwoLevel: 2 },
      });
    });

    // Akekuri Flash-and-Dash CS at frame 0 — animation is a TIME_STOP
    const csCol = findColumn(view.result.current, 'slot-1', NounType.COMBO);
    const csPayload = getMenuPayload(view.result.current, csCol!, 0);
    act(() => {
      view.result.current.handleAddEvent(csPayload.ownerEntityId, csPayload.columnId, csPayload.atFrame, csPayload.defaultSkill);
    });

    // Freeform CRYO at frame 0 with default duration (raw 20s = 2400)
    act(() => {
      view.result.current.handleAddEvent(
        ENEMY_ID, INFLICTION_COLUMNS.CRYO, 0,
        { name: INFLICTION_COLUMNS.CRYO, segments: [{ properties: { duration: 2400 } }] },
      );
    });

    // Drag-resize the CRYO segment to 197 frames (matches user URL override)
    const cryoInitial = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    )!;
    act(() => {
      view.result.current.handleResizeSegment(cryoInitial.uid, [{ segmentIndex: 0, newDuration: 197 }]);
    });

    // Read final state
    const cs = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === 'slot-1' && ev.columnId === NounType.COMBO,
    )!;
    const csAnimDur = cs.segments[0].properties.duration;

    const cryo = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === INFLICTION_COLUMNS.CRYO,
    )!;
    const t2 = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === 'slot-0' && ev.id === FREEZING_POINT_TALENT_ID,
    )!;

    expect(cryo).toBeDefined();
    expect(t2).toBeDefined();

    // Expected: raw 197 + CS animation 59 = 256 (extended). Both CRYO and T2 must share this.
    const expectedDur = 197 + csAnimDur;
    expect(totalDur(cryo)).toBe(expectedDur);
    expect(totalDur(t2)).toBe(expectedDur);
    expect(cryo.startFrame).toBe(t2.startFrame);
    expect(cryo.startFrame + totalDur(cryo)).toBe(t2.startFrame + totalDur(t2));
  });

  it('T2 with CRYO + SOLIDIFICATION overlapping: T2 is not consumed while either status is active', () => {
    const view = setupWithOperator('YVONNE');

    // Enable T2
    const props = view.result.current.loadoutProperties[SLOT];
    act(() => {
      view.result.current.handleStatsChange(SLOT, {
        ...props, operator: { ...props.operator, talentTwoLevel: 2 },
      });
    });

    // CRYO 10s starting at 1s (ends at 11s)
    placeCryo(view.result.current, 1 * FPS, 10);
    // SOLIDIFICATION 15s starting at 3s (ends at 18s → extends past CRYO)
    placeSolidification(view.result.current, 3 * FPS, 15);
    // Ult at 5s — TIME_STOP of 2.03s; extends CRYO and SOLIDIFICATION ends
    addUlt(view.result.current, 5 * FPS);

    const t2Events = view.result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.id === FREEZING_POINT_TALENT_ID,
    );
    expect(t2Events.length).toBeGreaterThan(0);

    // The LAST active T2 should still be alive when SOLIDIFICATION ends.
    // T2's last event should NOT end before SOLIDIFICATION's extended end.
    const solid = view.result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === REACTION_COLUMNS.SOLIDIFICATION,
    );
    const solidEnd = solid!.startFrame + totalDur(solid!);

    // T2 should remain active at least until solidification ends
    const lastT2 = t2Events.reduce((latest, e) =>
      (e.startFrame + totalDur(e)) > (latest.startFrame + totalDur(latest)) ? e : latest,
    );
    const lastT2End = lastT2.startFrame + totalDur(lastT2);
    expect(lastT2End).toBeGreaterThanOrEqual(solidEnd);
  });
});
