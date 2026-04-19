/**
 * StaggerController — owns the stagger resource timeline, subtimeline, and all
 * sync/query logic for enemy stagger tracking.
 *
 * Configures stagger parameters from enemy stats, extracts stagger damage from
 * processed skill segments, feeds events into the underlying StaggerTimeline,
 * and generates frailty events for node crossings and full stagger breaks.
 */
import { StatType, SegmentType } from '../../consts/enums';
import { NounType } from '../../dsl/semantics';
import { TimelineEvent, getAnimationDuration, durationSegment } from '../../consts/viewTypes';
import { ENEMY_ID, NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID } from '../../model/channels';
import { Subtimeline } from '../timeline/subtimeline';
import { StaggerTimeline, StaggerBreak } from '../timeline/staggerTimeline';
import { ResourceGraphListener, ResourcePoint } from '../timeline/resourceTimeline';
import { collectTimeStopRanges } from '../timeline/processTimeStop';
import { FPS } from '../../utils/timeline';
import { TEAM_ID, COMMON_COLUMN_IDS } from './commonSlotController';
import { findStaggerInClauses } from '../timeline/clauseQueries';
import type { LoadoutProperties } from '../../view/InformationPane';
import { buildContextForSkillColumn, DEFAULT_VALUE_CONTEXT, type ValueResolutionContext, type TalentSlot } from '../calculation/valueResolver';
import { getOperatorBase } from '../../model/game-data/operatorsStore';

export type { StaggerBreak };

/**
 * Build a ValueResolutionContext for a stagger-emitting event so VARY_BY
 * nodes inside DEAL STAGGER clauses resolve against the source operator's
 * loadout. Talent slot is inferred from the event's columnId matching the
 * operator's talent one/two IDs (e.g. MOMENTUM_BREAKER_TALENT → slot two).
 */
function buildStaggerCtx(
  ev: TimelineEvent,
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotOperatorMap?: Record<string, string>,
): ValueResolutionContext {
  const slotId = ev.sourceEntityId;
  const props = slotId && loadoutProperties ? loadoutProperties[slotId] : undefined;
  if (!props) return DEFAULT_VALUE_CONTEXT;
  const operatorId = slotOperatorMap?.[slotId!];
  let talentSlot: TalentSlot | undefined;
  if (operatorId) {
    const base = getOperatorBase(operatorId);
    if (base?.talents?.two?.id && ev.columnId === base.talents.two.id) talentSlot = 'two';
    else if (base?.talents?.one?.id && ev.columnId === base.talents.one.id) talentSlot = 'one';
  }
  return buildContextForSkillColumn(props, ev.columnId, undefined, talentSlot);
}

export interface StaggerEnemyStats {
  staggerNodes: number;
  staggerNodeRecoverySeconds: number;
  staggerStartValue?: number;
  [StatType.STAGGER_HP]: number;
  [StatType.STAGGER_RECOVERY]: number;
}

export class StaggerController {
  private readonly subtimeline: Subtimeline;
  private readonly timeline: StaggerTimeline;

  /** Cached frailty events from the last sync. */
  frailtyEvents: TimelineEvent[] = [];

  /** Cached stagger breaks from the last sync. */
  breaks: readonly StaggerBreak[] = [];

  constructor() {
    this.subtimeline = new Subtimeline(TEAM_ID, COMMON_COLUMN_IDS.STAGGER);
    this.timeline = new StaggerTimeline(this.subtimeline);
  }

  // ── Delegated resource properties ───────────────────────────────────────

  get min() { return this.timeline.min; }
  get max() { return this.timeline.max; }

  getSubtimeline(): Subtimeline { return this.subtimeline; }
  getGraph(): ReadonlyArray<ResourcePoint> { return this.timeline.getGraph(); }
  onGraphChange(listener: ResourceGraphListener): () => void { return this.timeline.onGraphChange(listener); }
  getNodeThresholds(): number[] { return this.timeline.getNodeThresholds(); }

  // ── Event sync ─────────────────────────────────────────────────────────

  /**
   * Configure the stagger timeline and sync stagger damage events from
   * processed skill events.
   *
   * Extracts time-stops and stagger frame data from segments, configures
   * max/nodes/break from enemy stats, feeds events into the stagger
   * subtimeline, and generates frailty events for node crossings and
   * full breaks.
   */
  sync(
    processedEvents: ReadonlyArray<TimelineEvent>,
    enemyStats: StaggerEnemyStats,
    loadoutProperties?: Record<string, LoadoutProperties>,
    slotOperatorMap?: Record<string, string>,
  ): void {
    // Extract and apply time-stops from processed events
    this.timeline.setTimeStops(collectTimeStopRanges(processedEvents));

    // Configure stagger timeline from enemy stats
    this.timeline.setNodeCount(enemyStats.staggerNodes);
    this.timeline.setBreakDuration(Math.round(enemyStats[StatType.STAGGER_RECOVERY] * FPS));
    this.timeline.updateConfig({
      max: enemyStats[StatType.STAGGER_HP],
      startValue: enemyStats.staggerStartValue ?? 0,
    });

    // Extract stagger damage events from skill segments
    const staggerEvents: TimelineEvent[] = [];
    for (const ev of processedEvents) {
      const animOffset = (ev.columnId === NounType.COMBO || ev.columnId === NounType.ULTIMATE)
        ? getAnimationDuration(ev) : 0;
      let segOffset = 0;
      // Build a resolution context once per event so VARY_BY TALENT_LEVEL /
      // SKILL_LEVEL / POTENTIAL stagger values resolve against the source
      // operator's loadout (e.g. Chen's Momentum Breaker talent).
      const ctx = buildStaggerCtx(ev, loadoutProperties, slotOperatorMap);
      for (const seg of ev.segments) {
        // Skip ANIMATION segments — their offset is already in animOffset
        if (seg.properties.segmentTypes?.includes(SegmentType.ANIMATION)) continue;
        if (seg.frames) {
          for (const f of seg.frames) {
            const stagger = findStaggerInClauses(f.clause, ctx);
            if (stagger && stagger > 0) {
              const frame = f.absoluteFrame ?? (ev.startFrame + animOffset + segOffset + f.offsetFrame);
              staggerEvents.push({
                uid: `${ev.uid}-stagger-${frame}`,
                id: 'stagger',
                name: 'stagger',
                ownerEntityId: ev.ownerEntityId,
                columnId: COMMON_COLUMN_IDS.STAGGER,
                startFrame: frame,
                segments: durationSegment(stagger),
              });
            }
          }
        }
        segOffset += seg.properties.duration;
      }
    }

    this.subtimeline.setEvents(staggerEvents.sort((a, b) => a.startFrame - b.startFrame));

    // Generate frailty events and cache breaks
    const nodeRecoveryFrames = Math.round((enemyStats.staggerNodeRecoverySeconds ?? 0) * FPS);
    this.frailtyEvents = this.timeline.generateFrailtyEvents(
      nodeRecoveryFrames,
      NODE_STAGGER_COLUMN_ID,
      FULL_STAGGER_COLUMN_ID,
      ENEMY_ID,
      'stagger-frailty',
    );
    this.breaks = this.timeline.getBreaks();
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  clear(): void {
    this.subtimeline.clear();
  }

  destroy(): void {
    this.timeline.destroy();
  }
}
