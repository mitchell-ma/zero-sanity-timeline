/**
 * @jest-environment jsdom
 */

/**
 * Zhuang Fangyi — Ult DISABLE gates the FINISHER variant
 *
 * Verifies that casting Smiting Tempest (ultimate) suppresses the Jolting Arts
 * FINISHER basic-attack variant in the same way the production context menu
 * does — by passing `v.id` (= `NounType.FINISHER`, the generic category) to
 * `checkVariantAvailability`, which then matches against the ult's
 * `DISABLE SKILL BASIC_ATTACK qualifier=FINISHER` effect.
 *
 * Note on naming convention (columnBuilder.ts:592-594): the FINISHER variant's
 * `v.id` is `NounType.FINISHER` (generic), while the BATK variant's `v.id` is
 * the operator-specific skill ID. The DISABLE qualifier must match `v.id`,
 * which is why the FINISHER qualifier stays generic ("FINISHER") even though
 * the BATK qualifier is operator-specific ("JOLTING_ARTS_BATK_ENHANCED").
 *
 * The DISABLE is active from the start of segment 2 (after the 2s animation
 * segment) for the remaining 25s of the ultimate window. Because
 * `hasDisableAtFrame` consults clauses independently of stagger state, the
 * DISABLE suppresses the finisher even when a frailty would otherwise allow it.
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { ColumnType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { checkVariantAvailability } from '../../../../controller/timeline/eventValidator';
import {
  findColumn,
  buildContextMenu,
  setUltimateEnergyToMax,
  getMenuPayload,
} from '../../helpers';
import type { AppResult } from '../../helpers';
import type { MiniTimeline, ContextMenuItem } from '../../../../consts/viewTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const ZF_ID: string = require('../../../../model/game-data/operators/zhuang-fangyi/zhuang-fangyi.json').id;
const FINISHER_ID: string = require(
  '../../../../model/game-data/operators/zhuang-fangyi/skills/basic-attack-finisher-jolting-arts.json',
).properties.id;
const ENHANCED_BATK_ID: string = require(
  '../../../../model/game-data/operators/zhuang-fangyi/skills/basic-attack-batk-jolting-arts-enhanced.json',
).properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_ZF = 'slot-0';
/** Frame inside the ult active window (after the 2s TIME_STOP animation). */
const FRAME_IN_ULT_ACTIVE = 3 * FPS;

beforeEach(() => { localStorage.clear(); });

function setup() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_ZF, ZF_ID); });
  return view;
}

function castUltimate(app: AppResult, atFrame: number) {
  act(() => { setUltimateEnergyToMax(app, SLOT_ZF, 0); });
  const ultCol = findColumn(app, SLOT_ZF, NounType.ULTIMATE);
  const payload = getMenuPayload(app, ultCol!, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
}

function batkColumn(app: AppResult) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === SLOT_ZF &&
      c.columnId === NounType.BASIC_ATTACK,
  );
}

function findFinisherMenuItem(menu: ContextMenuItem[]) {
  // The FINISHER variant's defaultSkill.id is now operator-specific
  // (JOLTING_ARTS_FINISHER); identify by the `category` marker instead.
  return menu.find(
    (item) =>
      item.actionId === 'addEvent' &&
      (item.actionPayload as { defaultSkill?: { category?: string } })?.defaultSkill?.category === NounType.FINISHER,
  );
}

function finisherAvailability(app: AppResult, atFrame: number) {
  // Match the production context-menu lookup: it passes `v.id`, which for
  // FINISHER is now the operator-specific skill id (JOLTING_ARTS_FINISHER).
  return checkVariantAvailability(
    FINISHER_ID, SLOT_ZF, [...app.allProcessedEvents], atFrame, NounType.BASIC_ATTACK, app.slots,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Zhuang ult DISABLE suppresses the FINISHER variant', () => {
  it('no ult: checkVariantAvailability does NOT flag FINISHER as disabled (no active DISABLE clause)', () => {
    const { result } = setup();

    // checkVariantAvailability only consults ENABLE/DISABLE clauses. Without an
    // ult, no DISABLE clause targets the finisher, so the function returns
    // not-disabled — the context menu's "outsideBreak" block is a separate layer.
    const r = finisherAvailability(result.current, FRAME_IN_ULT_ACTIVE);
    expect(r.disabled).toBe(false);
  });

  it('ult active: checkVariantAvailability flags FINISHER as disabled (DISABLE clause wins)', () => {
    const { result } = setup();
    castUltimate(result.current, 0);

    const r = finisherAvailability(result.current, FRAME_IN_ULT_ACTIVE);
    expect(r.disabled).toBe(true);
    // Reason points at the DISABLE clause specifically (e.g. "JOLTING_ARTS_FINISHER
    // disabled during this window") — proves the block is the ult's DSL effect, not
    // a stagger-frailty gate, so it would apply even when a frailty is also active
    // at the same frame.
    expect(r.reason).toMatch(new RegExp(FINISHER_ID));
  });

  it('ult active: context menu shows the FINISHER item as disabled', () => {
    const { result } = setup();
    castUltimate(result.current, 0);

    const menu = buildContextMenu(result.current, batkColumn(result.current)!, FRAME_IN_ULT_ACTIVE);
    expect(menu).not.toBeNull();
    const finisherItem = findFinisherMenuItem(menu!);
    expect(finisherItem).toBeDefined();
    expect(finisherItem!.disabled).toBe(true);
  });

  it('ult active: the DISABLE is scoped to the finisher — ENHANCED BATK remains enabled', () => {
    const { result } = setup();
    castUltimate(result.current, 0);

    // Confirms the ult's objectQualifier targets the finisher specifically,
    // not the whole BATK column. If the DISABLE were over-broad (e.g. matching
    // the generic category instead of the operator-specific id), this test
    // would also fail alongside the finisher test.
    const enhanced = checkVariantAvailability(
      ENHANCED_BATK_ID, SLOT_ZF, [...result.current.allProcessedEvents], FRAME_IN_ULT_ACTIVE,
      NounType.BASIC_ATTACK, result.current.slots,
    );
    expect(enhanced.disabled).toBe(false);

    const finisher = finisherAvailability(result.current, FRAME_IN_ULT_ACTIVE);
    expect(finisher.disabled).toBe(true);
  });

  it('ult active at segment-1 boundary: DISABLE fires at the start of the active segment (frame 240)', () => {
    const { result } = setup();
    castUltimate(result.current, 0);

    // Just before the active segment (still in 2s animation): DISABLE not yet fired.
    const beforeActive = finisherAvailability(result.current, 2 * FPS - 1);
    expect(beforeActive.disabled).toBe(false);

    // At the start of the active segment: DISABLE is live.
    const atActive = finisherAvailability(result.current, 2 * FPS);
    expect(atActive.disabled).toBe(true);
  });

  it('after ult ends (27s later): DISABLE clears and FINISHER is no longer suppressed', () => {
    const { result } = setup();
    castUltimate(result.current, 0);

    // 2s animation + 25s active = 27s total; check one full second after expiry.
    const afterUlt = finisherAvailability(result.current, 28 * FPS);
    expect(afterUlt.disabled).toBe(false);
  });
});
