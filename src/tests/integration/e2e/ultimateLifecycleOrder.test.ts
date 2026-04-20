/**
 * @jest-environment jsdom
 */

/**
 * Ultimate Lifecycle Order — E2E Integration Test
 *
 * Drives a multi-segment ultimate (Laevatain "Twilight") through the full
 * pipeline and asserts the clause-hook firing order. Exercises:
 *   - segments[0] ANIMATION (2.433s, TIME_STOP)
 *     • CONSUME ULTIMATE_ENERGY → operator's UE graph drops post-placement
 *     • ENABLE FLAMING_CINDERS_BATK_ENHANCED + DISABLE FLAMING_CINDERS_BATK
 *   - segments[1] ACTIVE (15s)
 *     • Sustains ENABLE/DISABLE state through the active window
 *   - onTriggerClause on equipped Forgeborn Scathe (PERFORM SKILL ULTIMATE)
 *     fires APPLY STATUS FORGEBORN_SCATHE_BLAZING_WAIL — proves the ult's
 *     PERFORM presence event propagated through the trigger index.
 *
 * Ultimate phase order: animation-clause → active-clause. Both segments'
 * effects should visibly take hold post-placement, with status-apply
 * events (weapon onTriggerClause) showing monotonically increasing
 * startFrames relative to the ult placement frame.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { FPS } from '../../../utils/timeline';
import { SegmentType } from '../../../consts/enums';
import { ultimateGraphKey } from '../../../model/channels';
import {
  hasEnableClauseAtFrame,
  checkVariantAvailability,
} from '../../../controller/timeline/eventValidator';
import {
  findColumn,
  getMenuPayload,
  setUltimateEnergyToMax,
} from '../helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_OPERATOR_ID: string =
  require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const WEAPON_ID: string =
  require('../../../model/game-data/weapons/forgeborn-scathe/forgeborn-scathe.json').properties.id;
const WEAPON_STATUS_ID: string =
  require('../../../model/game-data/weapons/forgeborn-scathe/statuses/status-forgeborn-scathe-blazing-wail.json').properties.id;
const TWILIGHT_JSON = require('../../../model/game-data/operators/laevatain/skills/ultimate-twilight.json');
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';
const SLOT_INDEX = 0;

// Variant IDs targeted by Twilight's ENABLE/DISABLE clauses.
const ENHANCED_BATK_ID = 'FLAMING_CINDERS_BATK_ENHANCED';
const BASE_BATK_ID = 'FLAMING_CINDERS_BATK';

// Durations taken from the JSON (seconds → frames).
const ANIMATION_DURATION_FRAMES = Math.round(2.433 * FPS);
const ACTIVE_DURATION_FRAMES = 15 * FPS;

beforeEach(() => { localStorage.clear(); });

function equipForgebornScathe(app: AppResult) {
  act(() => {
    app.handleLoadoutChange(SLOT, {
      weaponId: WEAPON_ID,
      armorId: null,
      glovesId: null,
      kit1Id: null,
      kit2Id: null,
      consumableId: null,
      tacticalId: null,
    });
  });
}

function placeUltimate(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.ULTIMATE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame);
  act(() => {
    app.handleAddEvent(
      payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

describe('Ultimate lifecycle order — Laevatain Twilight', () => {
  it('places exactly one ult event with >= 2 segments matching the JSON durations', () => {
    const { result } = renderHook(() => useApp());
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    const placementFrame = 1 * FPS;
    placeUltimate(result.current, placementFrame);

    const ults = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    );
    expect(ults).toHaveLength(1);

    const ult = ults[0];
    // Per the JSON, Twilight has ANIMATION + ACTIVE. Cooldown/trailing segments
    // may be appended by the column builder — assert >= 2, and that the first
    // two segments match the JSON durations exactly.
    expect(ult.segments.length).toBeGreaterThanOrEqual(2);

    const animSeg = ult.segments.find(s =>
      s.properties.segmentTypes?.includes(SegmentType.ANIMATION),
    );
    expect(animSeg).toBeDefined();
    expect(animSeg!.properties.duration).toBe(ANIMATION_DURATION_FRAMES);

    // Post-animation active window — no longer typed (ACTIVE was retired in
    // favor of the IGNORE ULTIMATE_ENERGY DSL). It's the second segment
    // chronologically, so pick by position instead of by segmentType.
    const activeSeg = ult.segments[1];
    expect(activeSeg).toBeDefined();
    expect(activeSeg.properties.duration).toBe(ACTIVE_DURATION_FRAMES);
  });

  it('animation-segment CONSUME ULTIMATE_ENERGY drops the operator\'s UE graph below max after placement', () => {
    const { result } = renderHook(() => useApp());
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    const placementFrame = 1 * FPS;
    placeUltimate(result.current, placementFrame);

    const postGraph = result.current.resourceGraphs.get(ultimateGraphKey(SLOT));
    expect(postGraph).toBeDefined();
    // The CONSUME ULTIMATE_ENERGY effect in segments[0].clause must produce a
    // graph point strictly below max somewhere in the series after placement.
    const maxVal = postGraph!.max;
    const hasDropBelowMax = postGraph!.points.some(p => p.value < maxVal);
    expect(hasDropBelowMax).toBe(true);
  });

  it('active clause ENABLEs the enhanced BATK and DISABLEs the base BATK for the post-animation ult window', () => {
    const { result } = renderHook(() => useApp());
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    const placementFrame = 1 * FPS;
    placeUltimate(result.current, placementFrame);

    const ev = result.current.allProcessedEvents.find(
      x => x.ownerEntityId === SLOT && x.columnId === NounType.ULTIMATE,
    );
    expect(ev).toBeDefined();

    const animFrame = placementFrame + 10;                          // inside ANIMATION
    const activeFrame = placementFrame + ANIMATION_DURATION_FRAMES + 60; // inside ACTIVE
    const postFrame = placementFrame + ANIMATION_DURATION_FRAMES + ACTIVE_DURATION_FRAMES + 120; // past the ult

    // ENABLE/DISABLE effects live on the active (post-animation) segment —
    // hasEnableClauseAtFrame strictly checks the clause of the segment
    // covering the given frame, so the animation window returns false.
    expect(
      hasEnableClauseAtFrame(
        result.current.allProcessedEvents, SLOT, ENHANCED_BATK_ID, animFrame,
      ),
    ).toBe(false);
    expect(
      hasEnableClauseAtFrame(
        result.current.allProcessedEvents, SLOT, ENHANCED_BATK_ID, activeFrame,
      ),
    ).toBe(true);
    // After the ult's active window ends, ENABLE is no longer active
    expect(
      hasEnableClauseAtFrame(
        result.current.allProcessedEvents, SLOT, ENHANCED_BATK_ID, postFrame,
      ),
    ).toBe(false);

    // checkVariantAvailability is ENABLE-gated — the enhanced variant is
    // available only while an ENABLE clause covers the current frame. ENABLE
    // lives on segments[1], so the variant is unavailable during animation
    // and available during the active window.
    const enhancedDuringAnim = checkVariantAvailability(
      ENHANCED_BATK_ID, SLOT, result.current.allProcessedEvents, animFrame,
      NounType.BASIC_ATTACK, result.current.slots,
    );
    expect(enhancedDuringAnim.disabled).toBe(true);

    const enhancedDuringActive = checkVariantAvailability(
      ENHANCED_BATK_ID, SLOT, result.current.allProcessedEvents, activeFrame,
      NounType.BASIC_ATTACK, result.current.slots,
    );
    expect(enhancedDuringActive.disabled).toBeFalsy();

    // Base BATK is blocked during the active window (DISABLE on segments[1]).
    const baseDuringActive = checkVariantAvailability(
      BASE_BATK_ID, SLOT, result.current.allProcessedEvents, activeFrame,
      NounType.BASIC_ATTACK, result.current.slots,
    );
    expect(baseDuringActive.disabled).toBe(true);
  });

  it('weapon onTriggerClause fires on ult performance — applies FORGEBORN_SCATHE_BLAZING_WAIL', () => {
    const { result } = renderHook(() => useApp());
    equipForgebornScathe(result.current);
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    // No weapon status before ult
    const pre = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === WEAPON_STATUS_ID,
    );
    expect(pre).toHaveLength(0);

    const placementFrame = 1 * FPS;
    placeUltimate(result.current, placementFrame);

    const weaponStatus = result.current.allProcessedEvents.filter(
      ev => ev.ownerEntityId === SLOT && ev.columnId === WEAPON_STATUS_ID,
    );
    expect(weaponStatus).toHaveLength(1);
    expect(weaponStatus[0].sourceEntityId).toBe(LAEVATAIN_OPERATOR_ID);
    // The weapon status is a side-effect of the ult placement — its startFrame
    // must be at or after the ult's placement frame.
    expect(weaponStatus[0].startFrame).toBeGreaterThanOrEqual(placementFrame);
  });

  it('ult placement and all side-effect events on the slot are in monotonically increasing startFrame order', () => {
    const { result } = renderHook(() => useApp());
    equipForgebornScathe(result.current);
    act(() => { setUltimateEnergyToMax(result.current, SLOT, SLOT_INDEX); });

    const placementFrame = 1 * FPS;
    placeUltimate(result.current, placementFrame);

    // Collect: the ult itself, the weapon onTrigger status, and any operator-status
    // column events that share this ult as the source.
    const ultUid = result.current.allProcessedEvents.find(
      ev => ev.ownerEntityId === SLOT && ev.columnId === NounType.ULTIMATE,
    )?.uid;
    expect(ultUid).toBeDefined();

    const relevant = result.current.allProcessedEvents
      .filter(ev =>
        ev.ownerEntityId === SLOT && (
          ev.uid === ultUid
          || ev.columnId === WEAPON_STATUS_ID
        ),
      )
      .sort((a, b) => a.startFrame - b.startFrame);

    expect(relevant.length).toBeGreaterThanOrEqual(2); // ult + weapon status

    // Ult must be first (its segments host all clauses); all derived status
    // applications must start at or after the ult frame.
    expect(relevant[0].columnId).toBe(NounType.ULTIMATE);
    for (let i = 1; i < relevant.length; i++) {
      expect(relevant[i].startFrame).toBeGreaterThanOrEqual(relevant[i - 1].startFrame);
    }
  });

  it('JSON structure invariant: Twilight has exactly 2 segments with the expected clause verbs', () => {
    // Pin the JSON structure so a config change accidentally dropping a
    // segment or clause effect is loudly surfaced.
    const segments = TWILIGHT_JSON.segments as { properties: Record<string, unknown>; clause?: unknown[] }[];
    expect(segments).toHaveLength(2);

    const segTypes0 = segments[0].properties.segmentTypes as string[];
    expect(segTypes0).toContain(SegmentType.ANIMATION);
    // segments[1] is the post-animation active window — no segmentType now,
    // its no-gain behavior comes from segments[0]'s IGNORE ULTIMATE_ENERGY
    // clause (authored on the animation segment).
    expect(segments[1].properties.segmentTypes).toBeUndefined();

    // Animation clause carries CONSUME ULTIMATE_ENERGY; ENABLE/DISABLE effects
    // live on the active segment (segments[1]) and run for its full duration.
    const animClause = segments[0].clause as {
      effects?: { verb: string; object?: string; objectQualifier?: string }[];
    }[];
    const animEffects = animClause.flatMap(c => c.effects ?? []);
    expect(
      animEffects.some(e => e.verb === VerbType.CONSUME && e.object === NounType.ULTIMATE_ENERGY),
    ).toBe(true);

    // Active clause must sustain ENABLE(enhanced) + DISABLE(base)
    const activeClause = segments[1].clause as {
      effects?: { verb: string; objectQualifier?: string }[];
    }[];
    const activeEffects = activeClause.flatMap(c => c.effects ?? []);
    expect(
      activeEffects.some(e => e.verb === VerbType.ENABLE && e.objectQualifier === ENHANCED_BATK_ID),
    ).toBe(true);
    expect(
      activeEffects.some(e => e.verb === VerbType.DISABLE && e.objectQualifier === BASE_BATK_ID),
    ).toBe(true);
  });
});
