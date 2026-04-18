/**
 * @jest-environment jsdom
 */

/**
 * Freeform vs Strict Mode Parity — E2E Integration Test
 *
 * The engine is mode-agnostic: STRICT gates which placements the menu
 * allows, but once placed the pipeline output (processed events + damage
 * rows) should be indistinguishable between modes. This test pins that
 * invariant by running a deterministic scenario under both
 * InteractionModeType.STRICT (default) and InteractionModeType.FREEFORM
 * and asserting byte-for-byte equality after stripping mode-marker fields.
 *
 * Scenario A: place two battle skills on Laevatain at 3s and 10s
 *   (spacing chosen so SP gates and cooldowns pass in STRICT without
 *   needing freeform-only placements).
 *
 * Scenario B: freeform-triggered reactive flow — pre-place a freeform
 *   Combustion on the enemy via handleAddEvent (the same API in both
 *   modes), then place a battle skill. Verify the derived events,
 *   damage rows, and gear-trigger status events all match across modes.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { ENEMY_ID, REACTION_COLUMNS } from '../../../model/channels';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { setNextEventUid, resetDerivedEventUids } from '../../../controller/timeline/inputEventController';

/* eslint-disable @typescript-eslint/no-require-imports */
const LAEVATAIN_ID: string =
  require('../../../model/game-data/operators/laevatain/laevatain.json').id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

/**
 * Reset module-level uid counters before each `renderHook` so the generated
 * uids come out identically across runs. If the test harness doesn't expose
 * `resetDerivedUidSeq`, we fall back to a string-replace at compare time —
 * see `strip()` below.
 */
function resetUidCounters() {
  try { setNextEventUid(1); } catch { /* ignore */ }
  try { resetDerivedEventUids(); } catch { /* ignore */ }
}

/** Remove mode-dependent and uid-dependent fields from a serialized snapshot. */
function strip(json: string): string {
  return json
    // uids are generated incrementally and may differ across renderHook runs
    .replace(/"uid":"[^"]*"/g, '"uid":"-"')
    // creationInteractionMode is set per-placement and differs intentionally
    .replace(/"creationInteractionMode":"[A-Z_]+"/g, '"creationInteractionMode":"-"')
    // triggerEventUid references another uid — strip alongside
    .replace(/"triggerEventUid":"[^"]*"/g, '"triggerEventUid":"-"')
    // sourceDamageFrameId embeds "<eventUid>:si:fi" — strip the uid portion
    .replace(/"sourceDamageFrameId":"[^"]*"/g, '"sourceDamageFrameId":"-"')
    // sourceFrameKey embeds the user-placed event uid (ev-<n>-<uuid>:si:fi)
    .replace(/"sourceFrameKey":"[^"]*"/g, '"sourceFrameKey":"-"')
    // Any embedded "ev-<counter>-<uuid>" reference that may appear in other fields
    .replace(/ev-\d+-[0-9a-f-]{36}/g, 'ev-N-UUID');
}

/** Serialize allProcessedEvents deterministically (sort by key then stringify). */
function snapshotEvents(app: AppResult): string {
  const sorted = [...app.allProcessedEvents].sort((a, b) => {
    if (a.startFrame !== b.startFrame) return a.startFrame - b.startFrame;
    if (a.ownerEntityId !== b.ownerEntityId) return a.ownerEntityId.localeCompare(b.ownerEntityId);
    if (a.columnId !== b.columnId) return a.columnId.localeCompare(b.columnId);
    return a.id.localeCompare(b.id);
  });
  return strip(JSON.stringify(sorted));
}

/** Run calc() and capture only mode-invariant fields. */
function snapshotDamage(app: AppResult): string {
  const calc = runCalculation(
    app.allProcessedEvents, app.columns, app.slots, app.enemy,
    app.loadoutProperties, app.loadouts, app.staggerBreaks,
    CritMode.EXPECTED, app.overrides,
  );
  const rows = calc.rows
    .map(r => ({
      frame: r.absoluteFrame,
      damage: r.damage,
      col: r.columnId,
      owner: r.ownerEntityId,
      mul: r.multiplier,
      skill: r.skillName,
      el: r.element,
    }))
    .sort((a, b) => {
      if (a.frame !== b.frame) return a.frame - b.frame;
      if (a.owner !== b.owner) return a.owner.localeCompare(b.owner);
      return a.col.localeCompare(b.col);
    });
  return strip(JSON.stringify(rows));
}

function placeBattleSkill(app: AppResult, atFrame: number) {
  const col = findColumn(app, SLOT, NounType.BATTLE);
  expect(col).toBeDefined();
  const payload = getMenuPayload(app, col!, atFrame);
  act(() => {
    app.handleAddEvent(
      payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill,
    );
  });
}

/** Place a freeform Combustion on the enemy. Works identically in both modes. */
function placeFreeformCombustion(app: AppResult, atFrame: number) {
  act(() => {
    app.handleAddEvent(
      ENEMY_ID, REACTION_COLUMNS.COMBUSTION, atFrame,
      {
        name: REACTION_COLUMNS.COMBUSTION,
        segments: [{ properties: { duration: 20 * FPS } }],
        sourceEntityId: LAEVATAIN_ID,
      },
    );
  });
}

/** Spin up a fresh app at the requested interaction mode. */
function makeApp(mode: InteractionModeType) {
  resetUidCounters();
  const view = renderHook(() => useApp());
  if (mode === InteractionModeType.FREEFORM) {
    act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  }
  return view;
}

describe('Freeform vs Strict mode parity — scenario A (battle skills only)', () => {
  it('produces identical allProcessedEvents snapshots in both modes', () => {
    // Default mode is STRICT; assert that assumption so the test fails loudly
    // if the default ever flips.
    const baselineView = makeApp(InteractionModeType.STRICT);
    expect(baselineView.result.current.interactionMode).toBe(InteractionModeType.STRICT);
    placeBattleSkill(baselineView.result.current, 3 * FPS);
    placeBattleSkill(baselineView.result.current, 10 * FPS);
    const strictSnap = snapshotEvents(baselineView.result.current);

    const freeformViewCase = makeApp(InteractionModeType.FREEFORM);
    placeBattleSkill(freeformViewCase.result.current, 3 * FPS);
    placeBattleSkill(freeformViewCase.result.current, 10 * FPS);
    const freeformSnap = snapshotEvents(freeformViewCase.result.current);

    expect(freeformSnap).toBe(strictSnap);
  });

  it('produces identical damage-row snapshots in both modes', () => {
    const baselineView = makeApp(InteractionModeType.STRICT);
    placeBattleSkill(baselineView.result.current, 3 * FPS);
    placeBattleSkill(baselineView.result.current, 10 * FPS);
    const strictDamage = snapshotDamage(baselineView.result.current);

    const freeformViewCase = makeApp(InteractionModeType.FREEFORM);
    placeBattleSkill(freeformViewCase.result.current, 3 * FPS);
    placeBattleSkill(freeformViewCase.result.current, 10 * FPS);
    const freeformDamage = snapshotDamage(freeformViewCase.result.current);

    expect(freeformDamage).toBe(strictDamage);
  });
});

describe('Freeform vs Strict mode parity — scenario B (freeform combustion + battle skill)', () => {
  // Freeform Combustion placement uses handleAddEvent directly — the same
  // API is valid in both modes (STRICT's menu would not offer it, but the
  // engine accepts the same call and produces the same derived state).

  it('produces identical allProcessedEvents snapshots in both modes', () => {
    const baselineView = makeApp(InteractionModeType.STRICT);
    placeFreeformCombustion(baselineView.result.current, 1 * FPS);
    placeBattleSkill(baselineView.result.current, 3 * FPS);
    const strictSnap = snapshotEvents(baselineView.result.current);

    const freeformViewCase = makeApp(InteractionModeType.FREEFORM);
    placeFreeformCombustion(freeformViewCase.result.current, 1 * FPS);
    placeBattleSkill(freeformViewCase.result.current, 3 * FPS);
    const freeformSnap = snapshotEvents(freeformViewCase.result.current);

    expect(freeformSnap).toBe(strictSnap);
  });

  it('produces identical damage-row snapshots in both modes', () => {
    const baselineView = makeApp(InteractionModeType.STRICT);
    placeFreeformCombustion(baselineView.result.current, 1 * FPS);
    placeBattleSkill(baselineView.result.current, 3 * FPS);
    const strictDamage = snapshotDamage(baselineView.result.current);

    const freeformViewCase = makeApp(InteractionModeType.FREEFORM);
    placeFreeformCombustion(freeformViewCase.result.current, 1 * FPS);
    placeBattleSkill(freeformViewCase.result.current, 3 * FPS);
    const freeformDamage = snapshotDamage(freeformViewCase.result.current);

    expect(freeformDamage).toBe(strictDamage);
  });
});
