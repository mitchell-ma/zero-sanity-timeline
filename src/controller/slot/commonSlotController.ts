import { TimelineSourceType } from '../../consts/enums';
import { ColumnLabel } from '../../consts/timelineColumnLabels';
import { MiniTimeline } from '../../consts/viewTypes';
import { Subtimeline } from '../timeline/subtimeline';
import { SkillPointController } from './skillPointController';
import { StaggerController } from './staggerController';
import { UltimateEnergyController } from '../timeline/ultimateEnergyController';

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
 * Delegates to:
 * - SkillPointController: SP resource timeline, cost/return sync, insufficiency zones
 * - StaggerController: stagger resource timeline, config, frailty event generation
 * - Team Status subtimeline: statuses that apply to all four operators
 */
export class CommonSlotController {
  readonly ownerId = COMMON_OWNER_ID;

  readonly skillPoints: SkillPointController;
  readonly stagger: StaggerController;
  readonly ultimateEnergy: UltimateEnergyController;

  private readonly teamStatusSubtimeline: Subtimeline;
  private readonly changeListeners = new Set<CommonSlotChangeListener>();

  constructor() {
    this.skillPoints = new SkillPointController();
    this.stagger = new StaggerController();
    this.ultimateEnergy = new UltimateEnergyController();
    this.skillPoints.setUltimateEnergyController(this.ultimateEnergy);
    this.teamStatusSubtimeline = new Subtimeline(COMMON_OWNER_ID, COMMON_COLUMN_IDS.TEAM_STATUS);
  }

  // ── Subtimeline access ──────────────────────────────────────────────────

  getSubtimeline(columnId: string): Subtimeline | undefined {
    switch (columnId) {
      case COMMON_COLUMN_IDS.SKILL_POINTS: return this.skillPoints.getSubtimeline();
      case COMMON_COLUMN_IDS.STAGGER: return this.stagger.getSubtimeline();
      case COMMON_COLUMN_IDS.TEAM_STATUS: return this.teamStatusSubtimeline;
      default: return undefined;
    }
  }

  getSubtimelines(): ReadonlyMap<string, Subtimeline> {
    const map = new Map<string, Subtimeline>();
    map.set(COMMON_COLUMN_IDS.SKILL_POINTS, this.skillPoints.getSubtimeline());
    map.set(COMMON_COLUMN_IDS.STAGGER, this.stagger.getSubtimeline());
    map.set(COMMON_COLUMN_IDS.TEAM_STATUS, this.teamStatusSubtimeline);
    return map;
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
    this.skillPoints.clear();
    this.stagger.clear();
    this.ultimateEnergy.clear();
    this.teamStatusSubtimeline.clear();
    this.notifyChange();
  }

  destroy(): void {
    this.skillPoints.destroy();
    this.stagger.destroy();
    this.changeListeners.clear();
  }
}
