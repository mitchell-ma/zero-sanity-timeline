/**
 * @jest-environment jsdom
 */

/**
 * Ardelia — Mr. Dolly Shadow ACTION skill
 *
 * Mr. Dolly Shadow is an ACTION-type skill that appears as a variant on the
 * operator INPUT (ACTION) column alongside Dash and Dodge. Single segment with
 * one frame at offset 0 — RECOVER HP to CONTROLLED OPERATOR with healBase and
 * willAdditive that VARY_BY TALENT_LEVEL.
 *
 * Verification layers:
 *   Context menu: INPUT column shows Mr. Dolly Shadow as an addEvent variant
 *   Controller: allProcessedEvents contains the placed action event
 *   View: computeTimelinePresentation shows the event in the INPUT column
 */

import { renderHook, act } from '@testing-library/react';
import { NounType, VerbType, DeterminerType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { OPERATOR_COLUMNS } from '../../../../model/channels';
import { FPS } from '../../../../utils/timeline';
import type { MiniTimeline } from '../../../../consts/viewTypes';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, buildContextMenu } from '../../helpers';
import { getOperatorSkill } from '../../../../controller/gameDataStore';

/* eslint-disable @typescript-eslint/no-require-imports */
const ARDELIA_ID: string = require('../../../../model/game-data/operators/ardelia/ardelia.json').id;
const DOLLY_SHADOW_ID: string = require('../../../../model/game-data/operators/ardelia/skills/action-mr-dolly-shadow.json').properties.id;
const DOLLY_SHADOW_NAME: string = require('../../../../model/game-data/operators/ardelia/skills/action-mr-dolly-shadow.json').properties.name;
/* eslint-enable @typescript-eslint/no-require-imports */

// Ardelia is slot-3 in default layout
const SLOT_ARDELIA = 'slot-3';

beforeEach(() => {
  localStorage.clear();
});

describe('Ardelia — Mr. Dolly Shadow ACTION', () => {
  it('INPUT column shows Mr. Dolly Shadow as a context menu variant', () => {
    const { result } = renderHook(() => useApp());

    const inputCol = findColumn(result.current, SLOT_ARDELIA, OPERATOR_COLUMNS.INPUT);
    expect(inputCol).toBeDefined();

    // Mr. Dolly Shadow should be in eventVariants
    const dollyVariant = inputCol!.eventVariants?.find(v => v.id === DOLLY_SHADOW_ID);
    expect(dollyVariant).toBeDefined();

    // Context menu should show it as an addable option
    const menuItems = buildContextMenu(result.current, inputCol!, 2 * FPS);
    expect(menuItems).not.toBeNull();

    const dollyMenuItem = menuItems!.find(
      i => i.actionId === 'addEvent' && i.label === DOLLY_SHADOW_NAME,
    );
    expect(dollyMenuItem).toBeDefined();
    expect(dollyMenuItem!.disabled).toBeFalsy();
  });

  it('placed Mr. Dolly Shadow event has RECOVER HP targeting CONTROLLED OPERATOR', () => {
    const { result } = renderHook(() => useApp());

    const inputCol = findColumn(result.current, SLOT_ARDELIA, OPERATOR_COLUMNS.INPUT);
    expect(inputCol).toBeDefined();

    // Add via context menu — select the Dolly Shadow variant
    const menuItems = buildContextMenu(result.current, inputCol!, 3 * FPS);
    const dollyItem = menuItems!.find(
      i => i.actionId === 'addEvent' && i.label === DOLLY_SHADOW_NAME,
    );
    expect(dollyItem).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = dollyItem!.actionPayload as any;
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // ── Controller layer: event exists in processed events ──────────────
    const actionEvents = result.current.allProcessedEvents.filter(
      ev => ev.ownerId === SLOT_ARDELIA && ev.columnId === OPERATOR_COLUMNS.INPUT && ev.name === DOLLY_SHADOW_ID,
    );
    expect(actionEvents).toHaveLength(1);

    const ev = actionEvents[0];
    expect(ev.startFrame).toBe(3 * FPS);
    expect(ev.segments).toHaveLength(1);

    // ── Verify heal clause from game data source ────────────────────────
    const skillDef = getOperatorSkill(ARDELIA_ID, DOLLY_SHADOW_ID);
    expect(skillDef).toBeDefined();

    const jsonSegments = skillDef!.segments as { frames?: { clause?: { effects: Record<string, unknown>[] }[] }[] }[];
    const jsonFrame = jsonSegments[0]?.frames?.[0];
    expect(jsonFrame).toBeDefined();

    const jsonEffect = jsonFrame!.clause!.flatMap(c => c.effects).find(
      (e: Record<string, unknown>) => e.verb === VerbType.RECOVER && e.object === NounType.HP,
    ) as Record<string, unknown> | undefined;
    expect(jsonEffect).toBeDefined();
    expect(jsonEffect!.toDeterminer).toBe(DeterminerType.CONTROLLED);
    expect(jsonEffect!.to).toBe(NounType.OPERATOR);

    const withBlock = jsonEffect!.with as Record<string, { value: number[] }>;
    expect(withBlock.healBase.value).toEqual([45, 63, 90]);
    expect(withBlock.willAdditive.value).toEqual([0.38, 0.53, 0.75]);

    // ── View layer: event appears in INPUT column ───────────────────────
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns as MiniTimeline[],
    );
    const inputVM = viewModels.get(inputCol!.key);
    expect(inputVM).toBeDefined();
    expect(inputVM!.events.filter(e => e.name === DOLLY_SHADOW_ID)).toHaveLength(1);
  });
});
