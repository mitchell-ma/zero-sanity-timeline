/**
 * @jest-environment jsdom
 *
 * E2E — MI Security dual-scope stacking.
 *
 * Exercises the full pipeline through `useApp`:
 *   • loadout mutation via `handleLoadoutChange` (controller flow)
 *   • BA placement via the context-menu flow (`getMenuPayload`)
 *   • view-layer stack-label verification via `computeStatusViewOverrides`
 *
 * Regression scope: the gear-set trigger-source previously shared its `id`
 * with the GearStat it applies (both `"MI_SECURITY"`). The self-apply
 * lifecycle gate in `handleEngineTrigger` queried active events by the
 * trigger-source's id, found the GearStat instance, and dropped every APPLY
 * after the first. Symptom (reported via shared loadout URL): the MI Security
 * chip rendered as a single long "MI Security I" banner instead of stacking
 * I → V across the BA's crit frames.
 *
 * Fix: split the id namespace. `eventCategoryType: GEAR, id: MI_SECURITY` for
 * the trigger-source; `eventCategoryType: GEAR_STAT, id: MI_SECURITY_STAT`
 * for the applied status. Self-apply gate no longer finds a spurious match.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { CritMode } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { computeStatusViewOverrides } from '../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const ROSSI_ID: string = require('../../../model/game-data/operators/rossi/rossi.json').id;
const MI_SECURITY_STAT_ID: string = require('../../../model/game-data/gears/mi-security/statuses/status-mi-security.json').properties.id;
const MI_SECURITY_GEAR_ID: string = require('../../../model/game-data/gears/mi-security/mi-security.json').properties.id;
const MI_SECURITY_STAT_LABEL: string = require('../../../model/game-data/gears/mi-security/statuses/status-mi-security.json').properties.name;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT = 'slot-0';

beforeEach(() => { localStorage.clear(); });

function setupRossi(kit2: string | null) {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT, ROSSI_ID); });
  // Force ALWAYS so every damage frame fires PERFORM CRITICAL_HIT and the
  // trigger dispatches an APPLY — deterministic coverage of the stacking path.
  act(() => { view.result.current.setCritMode(CritMode.ALWAYS); });
  act(() => {
    view.result.current.handleLoadoutChange(SLOT, {
      weaponId: 'LUPINE_SCARLET',
      armorId: 'MI_SECURITY_ARMOR_T1',
      glovesId: 'MI_SECURITY_GLOVES_T1',
      kit1Id: 'MI_SECURITY_SCOPE_T1',
      kit2Id: kit2,
      consumableId: null,
      tacticalId: null,
    });
  });
  return view;
}

function placeBA(app: AppResult, atFrame: number) {
  const baCol = findColumn(app, SLOT, NounType.BASIC_ATTACK);
  expect(baCol).toBeDefined();
  // Context-menu flow: user right-clicks the BA column and picks Add.
  const p = getMenuPayload(app, baCol!, atFrame);
  act(() => { app.handleAddEvent(p.ownerEntityId, p.columnId, p.atFrame, p.defaultSkill); });
}

function miStatEvents(app: AppResult) {
  return app.allProcessedEvents
    .filter(ev => ev.columnId === MI_SECURITY_STAT_ID && ev.ownerEntityId === SLOT)
    .sort((a, b) => a.startFrame - b.startFrame);
}

function miStatLabels(app: AppResult): string[] {
  const overrides = computeStatusViewOverrides(app.allProcessedEvents, app.columns);
  return miStatEvents(app).map(ev => overrides.get(ev.uid)?.label ?? '');
}

describe('MI Security dual-scope stacking — E2E', () => {
  describe('id namespace (regression against the self-apply gate collision)', () => {
    it('gear trigger-source id stays "MI_SECURITY"', () => {
      expect(MI_SECURITY_GEAR_ID).toBe('MI_SECURITY');
    });

    it('gear status id is suffixed with _STAT to avoid collision', () => {
      expect(MI_SECURITY_STAT_ID).toBe('MI_SECURITY_STAT');
      expect(MI_SECURITY_STAT_ID).not.toBe(MI_SECURITY_GEAR_ID);
    });
  });

  describe('single scope (kit1 only) — baseline the stacking engine works', () => {
    it('produces ≥2 distinct MI_SECURITY_STAT events with I / II label progression', () => {
      const { result } = setupRossi(null);
      placeBA(result.current, 1 * FPS);

      const events = miStatEvents(result.current);
      expect(events.length).toBeGreaterThanOrEqual(2);
      const distinctFrames = new Set(events.map(e => e.startFrame));
      expect(distinctFrames.size).toBe(events.length);

      const labels = miStatLabels(result.current);
      expect(labels[0]).toBe(`${MI_SECURITY_STAT_LABEL} I`);
      expect(labels[1]).toBe(`${MI_SECURITY_STAT_LABEL} II`);
    });
  });

  describe('dual scope (kit1 + kit2 both MI_SECURITY_SCOPE_T1) — the user-reported case', () => {
    it('each BA crit frame creates a distinct GearStat event', () => {
      const { result } = setupRossi('MI_SECURITY_SCOPE_T1');
      placeBA(result.current, 1 * FPS);

      const events = miStatEvents(result.current);
      // Pre-fix: exactly 1 event here because the self-apply gate dropped
      // every subsequent APPLY. Post-fix: multiple events, one per crit frame.
      expect(events.length).toBeGreaterThanOrEqual(2);

      // Distinct start frames (stack-label logic uses startFrame as the key;
      // collapsed-to-same-frame events would all label as "I" and fail the
      // next assertion too).
      const distinctFrames = new Set(events.map(e => e.startFrame));
      expect(distinctFrames.size).toBe(events.length);

      // Each GearStat event has 1 stack-value (per-event semantics), not a
      // pre-computed running total.
      for (const ev of events) {
        expect(ev.stacks ?? 1).toBe(1);
      }

      // Source attribution: applied by the BA skill on this slot.
      for (const ev of events) {
        expect(ev.sourceEntityId).toBe(ROSSI_ID);
        expect(ev.sourceSkillName).toBe('SEETHING_WOLFBLOOD_BATK');
      }
    });

    it('view layer: stack labels progress I → II → … (not stuck at "MI Security I")', () => {
      const { result } = setupRossi('MI_SECURITY_SCOPE_T1');
      placeBA(result.current, 1 * FPS);

      const labels = miStatLabels(result.current);
      expect(labels.length).toBeGreaterThanOrEqual(2);
      expect(labels[0]).toBe(`${MI_SECURITY_STAT_LABEL} I`);
      expect(labels[1]).toBe(`${MI_SECURITY_STAT_LABEL} II`);
      // Pre-fix: every label in this array was "MI Security I".
      const uniqueLabels = new Set(labels);
      expect(uniqueLabels.size).toBeGreaterThanOrEqual(2);
    });

    it('view layer: label caps at V even if more than 5 crit frames fire', () => {
      const { result } = setupRossi('MI_SECURITY_SCOPE_T1');
      placeBA(result.current, 1 * FPS);

      const labels = miStatLabels(result.current);
      // The GearStat has stacks.limit=5. Seething Wolfblood BA fires well
      // over 5 crit frames in ALWAYS mode, so the label must reach V — and
      // must never exceed it.
      expect(labels.length).toBeGreaterThanOrEqual(5);
      expect(labels).toContain(`${MI_SECURITY_STAT_LABEL} V`);
      for (const label of labels) {
        expect(label).not.toMatch(/\bVI$/);
        expect(label).not.toMatch(/\bVII$/);
      }
    });

    it('view layer: events land on the GearStat column (visible in the status micro-column)', () => {
      const { result } = setupRossi('MI_SECURITY_SCOPE_T1');
      placeBA(result.current, 1 * FPS);

      // Every overridden event must be the GearStat — not mis-routed to
      // another operator-status column.
      const events = miStatEvents(result.current);
      for (const ev of events) {
        expect(ev.columnId).toBe(MI_SECURITY_STAT_ID);
        expect(ev.name).toBe(MI_SECURITY_STAT_ID);
        expect(ev.ownerEntityId).toBe(SLOT);
      }
    });
  });
});
