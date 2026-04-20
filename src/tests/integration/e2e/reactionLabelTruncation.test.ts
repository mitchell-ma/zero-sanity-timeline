/**
 * @jest-environment jsdom
 *
 * Reaction label truncation — E2E
 *
 * Full pipeline from context-menu placement through view-layer truncation:
 *   context menu → handleAddEvent → reaction pipeline → resolveEventLabel
 *   → extractTrailingNumeral (EventBlock's narrow-segment fallback).
 *
 * Singular reactions (statusLevel = 1) must NOT collapse to a lone "I" when
 * their label doesn't fit the segment — the whole label should render and
 * fade via CSS mask. Stacked reactions (II–IV) still truncate to the roman
 * numeral suffix.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { ColumnType, ContextMenuAxisKind, InteractionModeType } from '../../../consts/enums';
import { ENEMY_ID, ENEMY_GROUP_COLUMNS, REACTION_COLUMNS } from '../../../model/channels';
import { NounType } from '../../../dsl/semantics';
import { resolveEventLabel } from '../../../controller/timeline/eventPresentationController';
import { injectStatusLevelIntoSegments } from '../../../controller/timeline/contextMenuController';
import { extractTrailingNumeral } from '../../../view/EventBlock';
import { buildContextMenu } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';
import type { MiniTimeline, EventSegmentData } from '../../../consts/viewTypes';

beforeEach(() => { localStorage.clear(); });

type Level = 1 | 2 | 3 | 4;

function setupFreeform() {
  const view = renderHook(() => useApp());
  act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
  return view;
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
 * Simulate right-click → pick Combustion → pick level N via the status-level
 * submenu → handleAddEvent. Mirrors freeformReactionStatusLevel.test.ts.
 */
function placeReactionAtLevel(app: AppResult, reactionColumnId: string, level: Level, atFrame: number) {
  const col = findEnemyStatusColumn(app);
  expect(col).toBeDefined();
  const items = buildContextMenu(app, col!, atFrame);
  expect(items).not.toBeNull();

  const item = items!.find(i => {
    if (i.actionId !== 'addEvent') return false;
    const payload = i.actionPayload as { columnId?: string } | undefined;
    return payload?.columnId === reactionColumnId;
  });
  expect(item).toBeDefined();

  const axis = item!.parameterSubmenu?.find(a => a.kind === ContextMenuAxisKind.STATUS_LEVEL);
  expect(axis).toBeDefined();
  expect(axis!.paramId).toBe(NounType.STATUS_LEVEL);

  const payload = item!.actionPayload as AddEventPayload;
  const base = payload.defaultSkill as { segments?: EventSegmentData[] };
  const segments = injectStatusLevelIntoSegments(base.segments, level);
  const defaultSkill = segments ? { ...base, segments } : base;
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, atFrame, defaultSkill);
  });
}

function findReaction(app: AppResult, reactionColumnId: string) {
  return app.allProcessedEvents.find(
    ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === reactionColumnId,
  );
}

describe('Reaction label truncation — E2E', () => {
  it('singular Combustion (level 1) resolves to "Combustion I" and does NOT truncate', () => {
    const view = setupFreeform();
    placeReactionAtLevel(view.result.current, REACTION_COLUMNS.COMBUSTION, 1, 0);

    const ev = findReaction(view.result.current, REACTION_COLUMNS.COMBUSTION);
    expect(ev).toBeDefined();
    expect(ev!.statusLevel).toBe(1);

    const label = resolveEventLabel(ev!);
    expect(label).toBe('Combustion I');

    // The crux: narrow-segment fallback must NOT reduce the label to just "I".
    expect(extractTrailingNumeral(label)).toBeUndefined();
  });

  it('stacked Combustion (level 2) resolves to "Combustion II" and truncates to "II"', () => {
    const view = setupFreeform();
    placeReactionAtLevel(view.result.current, REACTION_COLUMNS.COMBUSTION, 2, 0);

    const ev = findReaction(view.result.current, REACTION_COLUMNS.COMBUSTION);
    expect(ev).toBeDefined();
    expect(ev!.statusLevel).toBe(2);

    const label = resolveEventLabel(ev!);
    expect(label).toBe('Combustion II');
    expect(extractTrailingNumeral(label)).toBe('II');
  });

  it('maxed Combustion (level 4) resolves to "Combustion IV" and truncates to "IV"', () => {
    const view = setupFreeform();
    placeReactionAtLevel(view.result.current, REACTION_COLUMNS.COMBUSTION, 4, 0);

    const ev = findReaction(view.result.current, REACTION_COLUMNS.COMBUSTION);
    expect(ev).toBeDefined();
    expect(ev!.statusLevel).toBe(4);

    const label = resolveEventLabel(ev!);
    expect(label).toBe('Combustion IV');
    expect(extractTrailingNumeral(label)).toBe('IV');
  });

  it('singular Electrification (level 1) does NOT truncate — pipeline parity across reactions', () => {
    const view = setupFreeform();
    placeReactionAtLevel(view.result.current, REACTION_COLUMNS.ELECTRIFICATION, 1, 0);

    const ev = findReaction(view.result.current, REACTION_COLUMNS.ELECTRIFICATION);
    expect(ev).toBeDefined();
    expect(ev!.statusLevel).toBe(1);

    const label = resolveEventLabel(ev!);
    expect(label).toBe('Electrification I');
    expect(extractTrailingNumeral(label)).toBeUndefined();
  });
});
