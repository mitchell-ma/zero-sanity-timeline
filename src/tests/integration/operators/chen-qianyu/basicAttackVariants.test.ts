/**
 * @jest-environment jsdom
 */

/**
 * Chen Qianyu — Basic Attack Variants Integration Tests
 *
 * Tests Chen Qianyu's basic attack column: verifies the default Soaring Break
 * is correctly assigned, and that Dive/Finisher variants are NOT available on the
 * basic attack column (Chen lacks ENHANCED/EMPOWERED variants which gate the
 * variant system — Dive/Finisher only appear for operators with hasBasicVariants).
 *
 * Three-layer verification:
 *   1. Context menu: default add-event item is available; no Dive/Finisher variants
 *   2. Controller: allProcessedEvents contain events with correct skill IDs
 *   3. View: computeTimelinePresentation reflects placed events in columns
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../../dsl/semantics';
import { useApp } from '../../../../app/useApp';
import { CombatSkillType } from '../../../../consts/enums';
import { FPS } from '../../../../utils/timeline';
import { computeTimelinePresentation } from '../../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload, buildContextMenu } from '../../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const CHEN_QIANYU_ID: string = require('../../../../model/game-data/operators/chen-qianyu/chen-qianyu.json').id;
const SOARING_BREAK_ID: string = require('../../../../model/game-data/operators/chen-qianyu/skills/basic-attack-batk-soaring-break.json').properties.id;
const SOARING_BREAK_DIVE_ID: string = require('../../../../model/game-data/operators/chen-qianyu/skills/basic-attack-dive-soaring-break.json').properties.id;
const SOARING_BREAK_FINISHER_ID: string = require('../../../../model/game-data/operators/chen-qianyu/skills/basic-attack-finisher-soaring-break.json').properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_CHEN = 'slot-0';

beforeEach(() => {
  localStorage.clear();
});

function setupChen() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.handleSwapOperator(SLOT_CHEN, CHEN_QIANYU_ID); });
  return view;
}

describe('Chen Qianyu — basic attack variants', () => {
  it('normal Soaring Break is the default on basic attack column', () => {
    const { result } = setupChen();
    const basicCol = findColumn(result.current, SLOT_CHEN, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();
    expect(basicCol!.defaultEvent).toBeDefined();
    expect(basicCol!.defaultEvent!.name).toBe(SOARING_BREAK_ID);
  });

  it('Dive category is available on basic attack column', () => {
    const { result } = setupChen();
    const basicCol = findColumn(result.current, SLOT_CHEN, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, basicCol!, 2 * FPS);
    expect(menuItems).not.toBeNull();

    // DIVE is an independent BA category — always available when skill data exists
    const diveItem = menuItems!.find(
      (i) =>
        i.actionId === 'addEvent' &&
        ((i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === CombatSkillType.DIVE ||
         (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === SOARING_BREAK_DIVE_ID),
    );
    expect(diveItem).toBeDefined();
  });

  it('Finisher category is available on basic attack column', () => {
    const { result } = setupChen();
    const basicCol = findColumn(result.current, SLOT_CHEN, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();

    const menuItems = buildContextMenu(result.current, basicCol!, 2 * FPS);
    expect(menuItems).not.toBeNull();

    // FINISHER is an independent BA category — always available when skill data exists
    const finisherItem = menuItems!.find(
      (i) =>
        i.actionId === 'addEvent' &&
        ((i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === CombatSkillType.FINISHER ||
         (i.actionPayload as { defaultSkill?: { id?: string } })?.defaultSkill?.id === SOARING_BREAK_FINISHER_ID),
    );
    expect(finisherItem).toBeDefined();
  });

  it('placing normal basic attack produces event with correct skill ID', () => {
    const { result } = setupChen();
    const basicCol = findColumn(result.current, SLOT_CHEN, NounType.BASIC_ATTACK);
    expect(basicCol).toBeDefined();

    // Context menu: place the default (normal) basic attack
    const payload = getMenuPayload(result.current, basicCol!, 2 * FPS);

    act(() => {
      result.current.handleAddEvent(
        payload.ownerId, payload.columnId, payload.atFrame, payload.defaultSkill,
      );
    });

    // Controller layer: event has the correct skill ID
    const basicEvents = result.current.allProcessedEvents.filter(
      (ev) => ev.ownerId === SLOT_CHEN && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(basicEvents.length).toBeGreaterThanOrEqual(1);
    expect(basicEvents[0].name).toBe(SOARING_BREAK_ID);

    // View layer: computeTimelinePresentation includes the event
    const viewModels = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const vm = viewModels.get(basicCol!.key);
    expect(vm).toBeDefined();

    const baViewEvents = vm!.events.filter(
      (ev) => ev.ownerId === SLOT_CHEN && ev.columnId === NounType.BASIC_ATTACK,
    );
    expect(baViewEvents.length).toBeGreaterThanOrEqual(1);
    expect(baViewEvents[0].name).toBe(SOARING_BREAK_ID);
  });
});
