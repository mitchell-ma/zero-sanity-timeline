import { TimelineEvent } from '../../consts/viewTypes';
import { StaggerBreak } from '../timeline/staggerTimeline';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';

/**
 * Stateless query service for status multipliers at any given frame.
 *
 * Constructed with processed timeline events + stagger breaks, provides
 * O(n) lookups (pre-filtered by status type) for the damage table builder.
 */
export class StatusQueryService {
  private susceptibilityEvents: TimelineEvent[];
  private linkEvents: TimelineEvent[];
  private artsAmpEvents: TimelineEvent[];
  private fragilityEvents: TimelineEvent[];
  private staggerBreaks: readonly StaggerBreak[];

  constructor(events: TimelineEvent[], staggerBreaks: readonly StaggerBreak[]) {
    this.susceptibilityEvents = events.filter(e => e.columnId === 'SUSCEPTIBILITY' && e.ownerId === 'enemy');
    this.linkEvents = events.filter(e => e.columnId === 'LINK');
    this.artsAmpEvents = events.filter(e => e.columnId === 'ARTS_AMP');
    this.fragilityEvents = events.filter(e => e.columnId === 'FRAGILITY');
    this.staggerBreaks = staggerBreaks;
  }

  private isActive(ev: TimelineEvent, frame: number): boolean {
    return ev.startFrame <= frame && frame < ev.startFrame + ev.activationDuration;
  }

  isStaggered(frame: number): boolean {
    return this.staggerBreaks.some(b => frame >= b.startFrame && frame < b.endFrame);
  }

  getSusceptibilityBonus(frame: number, element: string): number {
    let sum = 0;
    for (const ev of this.susceptibilityEvents) {
      if (this.isActive(ev, frame) && ev.susceptibility?.[element]) {
        // Susceptibility stored as percentage (e.g. 0.15 for 15%), use directly as bonus
        sum += ev.susceptibility[element];
      }
    }
    return sum;
  }

  isLinkActive(frame: number): boolean {
    return this.linkEvents.some(ev => this.isActive(ev, frame));
  }

  isArtsAmpActive(frame: number): boolean {
    return this.artsAmpEvents.some(ev => this.isActive(ev, frame));
  }

  getFragilityBonus(frame: number): number {
    // TODO: extract numeric bonus from fragility events when data is available
    return 0;
  }
}
