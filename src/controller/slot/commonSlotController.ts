import { TimelineSourceType } from '../../consts/enums';
import { ColumnLabel } from '../../consts/timelineColumnLabels';
import { TimelineEvent, MiniTimeline } from '../../consts/viewTypes';
import { SKILL_COLUMNS } from '../../model/channels';
import { Subtimeline } from '../timeline/subtimeline';
import { SkillPointTimeline, ResourceZone } from '../timeline/skillPointTimeline';
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

  /** Per-slot SP insufficiency zones, keyed by `slotId:battle`. */
  spInsufficiencyZones: Map<string, ResourceZone[]> = new Map();

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

  // ── SP event sync ──────────────────────────────────────────────────────

  /**
   * Build SP cost and return events from processed battle skill events,
   * merge with derived SP recovery events, and feed them to the SP subtimeline.
   * Then compute per-slot insufficiency zones for battle skill columns.
   *
   * SP cost comes from each battle skill event's `skillPointCost` field
   * (sourced from the CONSUME SKILL_POINT effect in the skills JSON).
   * SP returns come from frame-level `skillPointRecovery` on segments.
   *
   * @param slotSpCosts Map of slotId → SP cost threshold for that slot's battle skill.
   *                    Used to compute per-slot insufficiency zones after graph update.
   */
  syncSkillPointEvents(
    processedEvents: ReadonlyArray<TimelineEvent>,
    slotSpCosts?: ReadonlyMap<string, number>,
  ): void {
    const spSubtimeline = this.subtimelines.get(COMMON_COLUMN_IDS.SKILL_POINTS);
    if (!spSubtimeline) return;

    // Collect derived SP recovery events (from processInflictions)
    const spRecovery = processedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === COMMON_COLUMN_IDS.SKILL_POINTS,
    );

    const battleCosts: TimelineEvent[] = [];
    const spReturns: TimelineEvent[] = [];

    for (const ev of processedEvents) {
      if (ev.columnId !== SKILL_COLUMNS.BATTLE || !ev.skillPointCost) continue;

      // Cost event: activationDuration = SP cost amount
      battleCosts.push({
        id: `${ev.id}-sp`,
        name: 'sp-cost',
        ownerId: COMMON_OWNER_ID,
        columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
        startFrame: ev.startFrame,
        activationDuration: ev.skillPointCost,
        activeDuration: 0,
        cooldownDuration: 0,
      } as TimelineEvent);

      // Return events from frame-level skillPointRecovery
      if (ev.segments) {
        const animOffset = ev.animationDuration ?? 0;
        let segOffset = 0;
        for (const seg of ev.segments) {
          if (seg.frames) {
            for (const f of seg.frames) {
              if (f.skillPointRecovery && f.skillPointRecovery > 0) {
                const frame = f.absoluteFrame ?? (ev.startFrame + animOffset + segOffset + f.offsetFrame);
                spReturns.push({
                  id: `${ev.id}-sp-return-${frame}`,
                  name: 'sp-return',
                  ownerId: COMMON_OWNER_ID,
                  columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
                  startFrame: frame,
                  activationDuration: f.skillPointRecovery,
                  activeDuration: 0,
                  cooldownDuration: 0,
                } as TimelineEvent);
              }
            }
          }
          segOffset += seg.durationFrames;
        }
      }
    }

    const allSpEvents = [...spRecovery, ...battleCosts, ...spReturns]
      .sort((a, b) => a.startFrame - b.startFrame || (a.name === 'sp-cost' ? -1 : 1));
    spSubtimeline.setEvents(allSpEvents);

    // Compute per-slot SP insufficiency zones for battle skill columns
    this.spInsufficiencyZones = new Map();
    if (slotSpCosts) {
      slotSpCosts.forEach((cost, slotId) => {
        const zones = this.skillPoints.insufficiencyZones(cost);
        if (zones.length > 0) {
          this.spInsufficiencyZones.set(`${slotId}:${SKILL_COLUMNS.BATTLE}`, zones);
        }
      });
    }
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
