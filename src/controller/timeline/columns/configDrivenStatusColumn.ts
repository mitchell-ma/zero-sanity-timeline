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
import { genEventUid, derivedEventUid } from '../inputEventController';
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

  add(ownerEntityId: string, frame: number, durationFrames: number,
    source: EventSource, options?: AddOptions): boolean {

    const statusId = options?.statusId ?? this.columnId;
    const mode = options?.stackingMode ?? this.stackingMode;
    const limit = options?.maxStacks ?? this.maxStacks;

    // MERGE: subsume all active instances
    if (mode === StackInteractionType.MERGE) {
      const active = this.host.activeEventsIn(this.columnId, ownerEntityId, frame);
      for (const act of active) {
        setEventDuration(act, frame - act.startFrame);
        act.eventStatus = EventStatusType.CONSUMED;
        act.eventStatusEntityId = source.ownerEntityId;
        act.eventStatusSkillName = source.skillName;
      }
    }

    // Enforce stack limit
    if (limit != null) {
      const activeCount = this.host.activeCount(this.columnId, ownerEntityId, frame);
      if (activeCount >= limit) {
        if (mode === StackInteractionType.RESET) {
          this.resetOldest(ownerEntityId, frame, source);
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
    ev.ownerEntityId = ownerEntityId;
    ev.columnId = this.columnId;
    ev.startFrame = frame;
    ev.segments = [{ properties: { duration: durationFrames } }];
    ev.sourceEntityId = source.ownerEntityId;
    ev.sourceSkillName = source.skillName;
    ev.ownerSlotId = source.slotId ?? source.ownerEntityId;
    ev.ownerOperatorId = source.operatorId ?? source.ownerEntityId;
    if (options?.event) Object.assign(ev, options.event);


    this.host.pushEvent(ev);

    // stacks field is stack VALUE (how many stacks this event represents), not position.
    // Position labels are derived in the view from event ordering.
    // Only set if not already provided by the caller (e.g. accumulator with stacks = SP amount).
    return true;
  }

  consume(ownerEntityId: string, frame: number, source: EventSource,
    options?: ConsumeOptions): number {

    if (options?.restack) {
      return this.consumeWithRestack(ownerEntityId, frame, options.count ?? 1, source);
    }

    if (options?.count != null) {
      return this.consumeOldestN(ownerEntityId, frame, options.count, source);
    }

    // Default: clamp all active
    const active = this.host.activeEventsIn(this.columnId, ownerEntityId, frame);
    for (const ev of active) {
      setEventDuration(ev, frame - ev.startFrame);
      ev.eventStatus = EventStatusType.CONSUMED;
      ev.eventStatusEntityId = source.ownerEntityId;
      ev.eventStatusSkillName = source.skillName;
    }
    return active.length;
  }

  canAdd(ownerEntityId: string, frame: number): boolean {
    if (this.maxStacks == null) return true;
    const mode = this.stackingMode;
    if (mode === StackInteractionType.RESET || mode === StackInteractionType.MERGE) return true;
    return this.host.activeCount(this.columnId, ownerEntityId, frame) < this.maxStacks;
  }

  canConsume(ownerEntityId: string, frame: number): boolean {
    return this.host.activeCount(this.columnId, ownerEntityId, frame) > 0;
  }

  // ── Private ────────────────────────────────────────────────────────────

  private resetOldest(ownerEntityId: string, frame: number, source: EventSource) {
    const active = this.host.activeEventsIn(this.columnId, ownerEntityId, frame)
      .sort((a, b) => a.startFrame - b.startFrame);
    if (active.length > 0) {
      const oldest = active[0];
      setEventDuration(oldest, frame - oldest.startFrame);
      oldest.eventStatus = EventStatusType.REFRESHED;
      oldest.eventStatusEntityId = source.ownerEntityId;
      oldest.eventStatusSkillName = source.skillName;
    }
  }

  private consumeOldestN(ownerEntityId: string, frame: number, count: number, source: EventSource) {
    const allActive = this.host.activeEventsIn(this.columnId, ownerEntityId, frame)
      .sort((a, b) => a.startFrame - b.startFrame);
    let stacksConsumed = 0;
    for (const ev of allActive) {
      if (stacksConsumed >= count) break;
      setEventDuration(ev, frame - ev.startFrame);
      ev.eventStatus = EventStatusType.CONSUMED;
      ev.eventStatusEntityId = source.ownerEntityId;
      ev.eventStatusSkillName = source.skillName;
      stacksConsumed += ev.stacks ?? 1;
    }
    return stacksConsumed;
  }

  /**
   * Consume N oldest with restacking — clamps ALL active, re-creates remaining
   * events to produce a visual stack-count split (e.g. Steel Oath V → IV → III).
   */
  /**
   * Consume N oldest with restacking — clamps ALL active, re-creates remaining
   * events to produce a visual stack-count split (e.g. Steel Oath V → IV → III).
   */
  private consumeWithRestack(ownerEntityId: string, frame: number, count: number, source: EventSource) {
    const allActive = this.host.activeEventsIn(this.columnId, ownerEntityId, frame)
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
      ev.eventStatusEntityId = source.ownerEntityId;
      ev.eventStatusSkillName = source.skillName;
      ev.stacks = allActive.length;
    }

    if (remaining > 0 && maxRemainingDuration > 0) {
      for (let i = 0; i < remaining; i++) {
        const ev = allocDerivedEvent();
        ev.uid = derivedEventUid(this.columnId, templateEvent.sourceEntityId ?? ownerEntityId, frame, `restack-${i}`);
        ev.id = templateEvent.id;
        ev.name = templateEvent.id;
        ev.ownerEntityId = ownerEntityId;
        ev.columnId = this.columnId;
        ev.startFrame = frame;
        ev.segments = [{ properties: { duration: maxRemainingDuration } }];
        ev.sourceEntityId = templateEvent.sourceEntityId;
        ev.sourceSkillName = templateEvent.sourceSkillName;
        ev.ownerSlotId = templateEvent.ownerSlotId ?? source.slotId ?? source.ownerEntityId;
        ev.ownerOperatorId = templateEvent.ownerOperatorId ?? source.operatorId ?? source.ownerEntityId;
        ev.stacks = remaining;
        this.host.pushEvent(ev);
      }
    }

    return consumed;
  }
}
