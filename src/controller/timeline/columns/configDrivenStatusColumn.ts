/**
 * ConfigDrivenStatusColumn — stacking behavior driven by JSON config.
 *
 * Handles all operator/weapon/gear/generic statuses: MELTING_FLAME, FOCUS, LINK,
 * SHIELD, SUSCEPTIBILITY, etc. Stacking mode (NONE/RESET/MERGE/REFRESH) and
 * limits come from the status JSON config via getStatusStackingMode/getStatusStackLimit.
 */

import { EventStatusType, StackInteractionType } from '../../../consts/enums';
import { eventDuration, setEventDuration } from '../../../consts/viewTypes';
import { allocDerivedEvent } from '../objectPool';
import { genEventUid } from '../inputEventController';
import { getStatusStackLimit } from '../derivedEventController';
import { getStatusStackingMode } from '../eventPresentationController';
import type { EventColumn, ColumnHost, EventSource, AddOptions, ConsumeOptions } from './eventColumn';

export class ConfigDrivenStatusColumn implements EventColumn {
  readonly columnId: string;
  private host: ColumnHost;
  private stackingMode: string;
  private maxStacks: number | undefined;

  constructor(columnId: string, host: ColumnHost) {
    this.columnId = columnId;
    this.host = host;
    this.stackingMode = getStatusStackingMode(columnId) ?? StackInteractionType.NONE;
    this.maxStacks = getStatusStackLimit(columnId);
  }

  add(ownerId: string, frame: number, durationFrames: number,
    source: EventSource, options?: AddOptions): boolean {

    const statusId = options?.statusId ?? this.columnId;
    const mode = options?.stackingMode ?? this.stackingMode;
    const limit = options?.maxStacks ?? this.maxStacks;

    // MERGE: subsume all active instances
    if (mode === StackInteractionType.MERGE) {
      const active = this.host.activeEventsIn(this.columnId, ownerId, frame);
      for (const act of active) {
        setEventDuration(act, frame - act.startFrame);
        act.eventStatus = EventStatusType.CONSUMED;
        act.eventStatusOwnerId = source.ownerId;
        act.eventStatusSkillName = source.skillName;
      }
    }

    // Enforce stack limit
    if (limit != null) {
      const activeCount = this.host.activeCount(this.columnId, ownerId, frame);
      if (activeCount >= limit) {
        if (mode === StackInteractionType.RESET) {
          this.resetOldest(ownerId, frame, source);
        } else if (!mode || mode === StackInteractionType.NONE) {
          return false;
        }
        // REFRESH/other modes: allow through (view layer caps labels)
      }
    }

    const ev = allocDerivedEvent();
    ev.uid = options?.uid ?? `${statusId.toLowerCase()}-${genEventUid()}`;
    ev.id = statusId;
    ev.name = statusId;
    ev.ownerId = ownerId;
    ev.columnId = this.columnId;
    ev.startFrame = frame;
    ev.segments = [{ properties: { duration: durationFrames } }];
    ev.sourceOwnerId = source.ownerId;
    ev.sourceSkillName = source.skillName;
    if (options?.event) Object.assign(ev, options.event);


    this.host.pushEvent(ev, durationFrames);

    // Record stack position at creation time (don't overwrite if caller set it explicitly)
    if (ev.stacks == null) ev.stacks = this.host.activeCount(this.columnId, ownerId, frame);
    return true;
  }

  consume(ownerId: string, frame: number, source: EventSource,
    options?: ConsumeOptions): number {

    if (options?.restack) {
      return this.consumeWithRestack(ownerId, frame, options.count ?? 1, source);
    }

    if (options?.count != null) {
      return this.consumeOldestN(ownerId, frame, options.count, source);
    }

    // Default: clamp all active
    const active = this.host.activeEventsIn(this.columnId, ownerId, frame);
    for (const ev of active) {
      setEventDuration(ev, frame - ev.startFrame);
      ev.eventStatus = EventStatusType.CONSUMED;
      ev.eventStatusOwnerId = source.ownerId;
      ev.eventStatusSkillName = source.skillName;
    }
    return active.length;
  }

  canAdd(ownerId: string, frame: number): boolean {
    if (this.maxStacks == null) return true;
    const mode = this.stackingMode;
    if (mode === StackInteractionType.RESET || mode === StackInteractionType.MERGE) return true;
    return this.host.activeCount(this.columnId, ownerId, frame) < this.maxStacks;
  }

  canConsume(ownerId: string, frame: number): boolean {
    return this.host.activeCount(this.columnId, ownerId, frame) > 0;
  }

  // ── Private ────────────────────────────────────────────────────────────

  private resetOldest(ownerId: string, frame: number, source: EventSource) {
    const active = this.host.activeEventsIn(this.columnId, ownerId, frame)
      .sort((a, b) => a.startFrame - b.startFrame);
    if (active.length > 0) {
      const oldest = active[0];
      setEventDuration(oldest, frame - oldest.startFrame);
      oldest.eventStatus = EventStatusType.REFRESHED;
      oldest.eventStatusOwnerId = source.ownerId;
      oldest.eventStatusSkillName = source.skillName;
    }
  }

  private consumeOldestN(ownerId: string, frame: number, count: number, source: EventSource) {
    const allActive = this.host.activeEventsIn(this.columnId, ownerId, frame)
      .sort((a, b) => a.startFrame - b.startFrame);
    const toConsume = allActive.slice(0, count);
    for (const ev of toConsume) {
      setEventDuration(ev, frame - ev.startFrame);
      ev.eventStatus = EventStatusType.CONSUMED;
      ev.eventStatusOwnerId = source.ownerId;
      ev.eventStatusSkillName = source.skillName;
    }
    return toConsume.length;
  }

  /**
   * Consume N oldest with restacking — clamps ALL active, re-creates remaining
   * events to produce a visual stack-count split (e.g. Steel Oath V → IV → III).
   */
  private consumeWithRestack(ownerId: string, frame: number, count: number, source: EventSource) {
    const allActive = this.host.activeEventsIn(this.columnId, ownerId, frame)
      .sort((a, b) => a.startFrame - b.startFrame);
    if (allActive.length === 0) return 0;

    const consumed = Math.min(count, allActive.length);
    const remaining = allActive.length - consumed;

    let maxRemainingDuration = 0;
    const templateEvent = allActive[0];
    for (const ev of allActive) {
      const evEnd = ev.startFrame + eventDuration(ev);
      const rem = evEnd - frame;
      if (rem > maxRemainingDuration) maxRemainingDuration = rem;
    }

    for (const ev of allActive) {
      setEventDuration(ev, frame - ev.startFrame);
      ev.eventStatus = EventStatusType.CONSUMED;
      ev.eventStatusOwnerId = source.ownerId;
      ev.eventStatusSkillName = source.skillName;
      ev.stacks = allActive.length;
    }

    if (remaining > 0 && maxRemainingDuration > 0) {
      for (let i = 0; i < remaining; i++) {
        const ev = allocDerivedEvent();
        ev.uid = `${templateEvent.id.toLowerCase()}-${genEventUid()}`;
        ev.id = templateEvent.id;
        ev.name = templateEvent.id;
        ev.ownerId = ownerId;
        ev.columnId = this.columnId;
        ev.startFrame = frame;
        ev.segments = [{ properties: { duration: maxRemainingDuration } }];
        ev.sourceOwnerId = templateEvent.sourceOwnerId;
        ev.sourceSkillName = templateEvent.sourceSkillName;
        ev.stacks = remaining;
        this.host.pushEvent(ev, maxRemainingDuration);
      }
    }

    return consumed;
  }
}
