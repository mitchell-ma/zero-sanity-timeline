/**
 * @jest-environment jsdom
 */

/**
 * Skill Level → Cooldown Update — Integration Test
 *
 * Verifies that changing an operator's skill level in the loadout pane
 * updates existing event segments on the timeline. Uses Ardelia's combo
 * skill, whose cooldown varies by skill level:
 *   Level 12 → 17s cooldown
 *   Level 11 → 18s cooldown
 *
 * Three-layer verification:
 *   1. Context menu: right-click column → menu item enabled → extract payload
 *   2. Controller: cooldown segment duration in allProcessedEvents
 *   3. View: event appears in computeTimelinePresentation ColumnViewModel
 */

import { renderHook, act } from '@testing-library/react';
import { NounType } from '../../../dsl/semantics';
import { useApp } from '../../../app/useApp';
import { SegmentType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { computeTimelinePresentation } from '../../../controller/timeline/eventPresentationController';
import { findColumn, getMenuPayload } from '../helpers';

const SLOT_ARDELIA = 'slot-3';

// Verified against in-game data: Ardelia combo skill cooldowns by level
// Level 12 → 17s, Level 11 → 18s (from ardelia-skills.json combo skill config)
const COMBO_CD_LEVEL_12_FRAMES = Math.round(17 * FPS);
const COMBO_CD_LEVEL_11_FRAMES = Math.round(18 * FPS);

/** Find the COOLDOWN segment's duration in frames from a processed event. */
function getCooldownDuration(events: ReturnType<typeof useApp>['allProcessedEvents'], slotId: string, columnId: string) {
  const ev = events.find(
    (e) => e.ownerId === slotId && e.columnId === columnId,
  );
  if (!ev) return undefined;
  const cdSeg = ev.segments.find(
    (s) => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
  );
  return cdSeg?.properties.duration;
}

describe('Skill Level → Cooldown Update — integration through useApp', () => {
  it('changing combo skill level updates cooldown segment duration on existing events', () => {
    const { result } = renderHook(() => useApp());

    // Combo skill requires a trigger — use freeform mode to bypass trigger validation
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // ── Context menu layer: verify add action is available ────────────
    const comboCol = findColumn(result.current, SLOT_ARDELIA, NounType.COMBO_SKILL);
    expect(comboCol).toBeDefined();

    const atFrame = 5 * FPS;
    const payload = getMenuPayload(result.current, comboCol!, atFrame);

    // Add combo skill event via context menu payload
    act(() => {
      result.current.handleAddEvent(
        payload.ownerId,
        payload.columnId,
        payload.atFrame,
        payload.defaultSkill,
      );
    });

    // ── Controller layer: verify cooldown at level 12 ────────────────
    const cdAtLevel12 = getCooldownDuration(
      result.current.allProcessedEvents, SLOT_ARDELIA, NounType.COMBO_SKILL,
    );
    expect(cdAtLevel12).toBe(COMBO_CD_LEVEL_12_FRAMES);

    // ── View layer: verify event appears in ColumnViewModel ──────────
    const vmBefore = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const colVmBefore = vmBefore.get(comboCol!.key);
    expect(colVmBefore).toBeDefined();
    const comboEventsBefore = colVmBefore!.events.filter(
      (ev) => ev.ownerId === SLOT_ARDELIA && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(comboEventsBefore.length).toBe(1);

    // ── Change combo skill level to 11 ───────────────────────────────
    const currentProps = result.current.loadoutProperties[SLOT_ARDELIA];
    act(() => {
      result.current.handleStatsChange(SLOT_ARDELIA, {
        ...currentProps,
        skills: { ...currentProps.skills, comboSkillLevel: 11 },
      });
    });

    // ── Controller layer: verify cooldown updated to level 11 ────────
    const cdAtLevel11 = getCooldownDuration(
      result.current.allProcessedEvents, SLOT_ARDELIA, NounType.COMBO_SKILL,
    );
    expect(cdAtLevel11).toBe(COMBO_CD_LEVEL_11_FRAMES);

    // ── View layer: event still present after level change ───────────
    const vmAfter = computeTimelinePresentation(
      result.current.allProcessedEvents,
      result.current.columns,
    );
    const colVmAfter = vmAfter.get(comboCol!.key);
    expect(colVmAfter).toBeDefined();
    const comboEventsAfter = colVmAfter!.events.filter(
      (ev) => ev.ownerId === SLOT_ARDELIA && ev.columnId === NounType.COMBO_SKILL,
    );
    expect(comboEventsAfter.length).toBe(1);
  });
});
