/**
 * @jest-environment jsdom
 */

/**
 * Freeform reaction statusLevel picker — integration tests.
 *
 * Verifies that the context-menu STATUS_LEVEL axis (added in the submenu
 * picker) correctly flows through the freeform reaction pipeline:
 *   context menu → pick level N → handleAddEvent → createEvent →
 *   wrapper event.statusLevel = N → doApply reads ctx.sourceEvent.statusLevel
 *   → derived reaction event carries statusLevel = N.
 *
 * Covers every selectable reaction level: I, II, III, IV.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { ColumnType, ContextMenuAxisKind, InteractionModeType } from '../../../consts/enums';
import { ENEMY_ID, ENEMY_GROUP_COLUMNS, REACTION_COLUMNS } from '../../../model/channels';
import { NounType } from '../../../dsl/semantics';
import { buildContextMenu } from '../helpers';
import { injectStatusLevelIntoSegments } from '../../../controller/timeline/contextMenuController';
import type { AppResult, AddEventPayload } from '../helpers';
import type { MiniTimeline, EventSegmentData } from '../../../consts/viewTypes';

beforeEach(() => { localStorage.clear(); });

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
 * Pick the context-menu addEvent item whose actionPayload targets a specific
 * reaction columnId — matches by payload, not by label, to stay robust to
 * locale changes.
 */
function findReactionAddItem(app: AppResult, reactionColumnId: string) {
  const col = findEnemyStatusColumn(app);
  expect(col).toBeDefined();
  const items = buildContextMenu(app, col!, 0);
  expect(items).not.toBeNull();
  const item = items!.find(i => {
    if (i.actionId !== 'addEvent') return false;
    const payload = i.actionPayload as { columnId?: string } | undefined;
    return payload?.columnId === reactionColumnId;
  });
  if (!item) {
    const available = items!
      .filter(i => i.actionId === 'addEvent')
      .map(i => (i.actionPayload as { columnId?: string } | undefined)?.columnId ?? '?')
      .join(', ');
    throw new Error(`No addEvent item for ${reactionColumnId}. Available: ${available}`);
  }
  return item;
}

type Level = 1 | 2 | 3 | 4;

/**
 * Simulate ContextMenu.tsx's submenu pick: take the addEvent payload, bake
 * the user's statusLevel into the APPLY REACTION clause in the wrapper's
 * segments (same flow as the resolver in CombatPlanner.tsx), and fire
 * handleAddEvent.
 */
function placeReactionAtLevel(app: AppResult, reactionColumnId: string, level: Level, atFrame: number) {
  const item = findReactionAddItem(app, reactionColumnId);
  expect(item.disabled).toBeFalsy();

  // The picker surfaces statusLevel via a parameterSubmenu STATUS_LEVEL axis
  // — verify it exists and offers the selected level before we simulate.
  const submenu = item.parameterSubmenu;
  expect(submenu).toBeDefined();
  const axis = submenu!.find(a => a.kind === ContextMenuAxisKind.STATUS_LEVEL);
  expect(axis).toBeDefined();
  expect(axis!.paramId).toBe(NounType.STATUS_LEVEL);
  expect(axis!.options.some(o => o.value === level)).toBe(true);

  const payload = item.actionPayload as AddEventPayload;
  const base = payload.defaultSkill as { segments?: EventSegmentData[] };
  const segments = injectStatusLevelIntoSegments(base.segments, level);
  const defaultSkill = segments ? { ...base, segments } : base;
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, atFrame, defaultSkill);
  });
}

function findReaction(app: AppResult, reactionColumnId: string) {
  return app.allProcessedEvents.find(
    ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === reactionColumnId && ev.startFrame === 0,
  );
}

describe('Freeform reaction statusLevel picker — Electrification I..IV', () => {
  const levels: Level[] = [1, 2, 3, 4];

  for (const level of levels) {
    it(`placing Electrification at level ${level} yields an event with statusLevel = ${level}`, () => {
      const view = setupFreeform();
      const app = view.result.current;

      placeReactionAtLevel(app, REACTION_COLUMNS.ELECTRIFICATION, level, 0);

      const reaction = findReaction(view.result.current, REACTION_COLUMNS.ELECTRIFICATION);
      expect(reaction).toBeDefined();
      expect(reaction!.statusLevel).toBe(level);
      expect(reaction!.columnId).toBe(REACTION_COLUMNS.ELECTRIFICATION);
      expect(reaction!.ownerEntityId).toBe(ENEMY_ID);
    });
  }
});
