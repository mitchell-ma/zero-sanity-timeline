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
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { SKILL_COLUMNS } from '../../../model/channels';
import { ColumnType, SegmentType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import type { MiniTimeline } from '../../../consts/viewTypes';

const SLOT_ARDELIA = 'slot-3';

function findColumn(app: ReturnType<typeof useApp>, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerId === slotId &&
      c.columnId === columnId,
  );
}

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

    // Verify Ardelia is in slot-3
    const comboCol = findColumn(result.current, SLOT_ARDELIA, SKILL_COLUMNS.COMBO);
    expect(comboCol).toBeDefined();

    // Default combo skill level is 12 → cooldown 17s
    const defaultSkill = comboCol!.defaultEvent!;

    // Add a combo skill event
    act(() => {
      result.current.handleAddEvent(SLOT_ARDELIA, SKILL_COLUMNS.COMBO, 5 * FPS, defaultSkill);
    });

    // Verify cooldown segment at level 12 = 17s
    const cdAtLevel12 = getCooldownDuration(
      result.current.allProcessedEvents, SLOT_ARDELIA, SKILL_COLUMNS.COMBO,
    );
    expect(cdAtLevel12).toBe(Math.round(17 * FPS));

    // Change combo skill level to 11
    const currentProps = result.current.loadoutProperties[SLOT_ARDELIA];
    act(() => {
      result.current.handleStatsChange(SLOT_ARDELIA, {
        ...currentProps,
        skills: { ...currentProps.skills, comboSkillLevel: 11 },
      });
    });

    // Verify cooldown segment updated to level 11 = 18s
    const cdAtLevel11 = getCooldownDuration(
      result.current.allProcessedEvents, SLOT_ARDELIA, SKILL_COLUMNS.COMBO,
    );
    expect(cdAtLevel11).toBe(Math.round(18 * FPS));
  });
});
