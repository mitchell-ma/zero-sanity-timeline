import { TimelineSourceType } from '../../consts/enums';
import { ColumnLabel } from '../../consts/timelineColumnLabels';
import { MiniTimeline } from '../../consts/viewTypes';
import { Subtimeline } from '../timeline/subtimeline';
import { SkillPointTimeline } from '../timeline/skillPointTimeline';
import { StaggerTimeline } from '../timeline/staggerTimeline';

// ── Column IDs ───────────────────────────────────────────────────────────────

export const COMMON_OWNER_ID = 'common';

export const COMMON_COLUMN_IDS = {
  SKILL_POINTS: 'skill-points',
  STAGGER: 'stagger',
  TEAM_STATUS: 'team-status',
} as const;

// ── Listener type ────────────────────────────────────────────────────────────

export type CommonSlotChangeListener = () => void;

// ── CommonSlotController ─────────────────────────────────────────────────────

/**
 * Controller for global team resources that aren't owned by a single operator.
 *
 * Manages subtimelines for:
 * - Skill Points: resource timeline (0–300, 8 SP/s regen) with line graph
 * - Team Status: statuses that apply to all four operators
 */
export class CommonSlotController {
  readonly ownerId = COMMON_OWNER_ID;

  readonly skillPoints: SkillPointTimeline;
  readonly stagger: StaggerTimeline;

  private readonly subtimelines = new Map<string, Subtimeline>();
  private readonly changeListeners = new Set<CommonSlotChangeListener>();

  constructor() {
    const spSubtimeline = new Subtimeline(COMMON_OWNER_ID, COMMON_COLUMN_IDS.SKILL_POINTS);
    this.subtimelines.set(COMMON_COLUMN_IDS.SKILL_POINTS, spSubtimeline);
    this.skillPoints = new SkillPointTimeline(spSubtimeline);

    const staggerSubtimeline = new Subtimeline(COMMON_OWNER_ID, COMMON_COLUMN_IDS.STAGGER);
    this.subtimelines.set(COMMON_COLUMN_IDS.STAGGER, staggerSubtimeline);
    this.stagger = new StaggerTimeline(staggerSubtimeline);

    this.subtimelines.set(
      COMMON_COLUMN_IDS.TEAM_STATUS,
      new Subtimeline(COMMON_OWNER_ID, COMMON_COLUMN_IDS.TEAM_STATUS),
    );
  }

  // ── Subtimeline access ──────────────────────────────────────────────────

  getSubtimeline(columnId: string): Subtimeline | undefined {
    return this.subtimelines.get(columnId);
  }

  getSubtimelines(): ReadonlyMap<string, Subtimeline> {
    return this.subtimelines;
  }

  // ── Column generation ───────────────────────────────────────────────────

  getColumns(): MiniTimeline[] {
    return [
      {
        key: `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`,
        type: 'mini-timeline',
        source: TimelineSourceType.COMMON,
        ownerId: COMMON_OWNER_ID,
        columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
        label: ColumnLabel.SKILL_POINTS,
        color: '#ccaa33',
        headerVariant: 'skill',
      },
      {
        key: `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.TEAM_STATUS}`,
        type: 'mini-timeline',
        source: TimelineSourceType.COMMON,
        ownerId: COMMON_OWNER_ID,
        columnId: COMMON_COLUMN_IDS.TEAM_STATUS,
        label: ColumnLabel.TEAM_STATUS,
        color: '#66aa88',
        headerVariant: 'skill',
      },
    ];
  }

  // ── Listeners ───────────────────────────────────────────────────────────

  onChange(listener: CommonSlotChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => { this.changeListeners.delete(listener); };
  }

  private notifyChange(): void {
    this.changeListeners.forEach((cb) => cb());
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  clear(): void {
    this.subtimelines.forEach((st) => st.clear());
    this.notifyChange();
  }

  destroy(): void {
    this.skillPoints.destroy();
    this.stagger.destroy();
    this.changeListeners.clear();
  }
}
