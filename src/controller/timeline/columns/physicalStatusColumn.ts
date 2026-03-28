/**
 * PhysicalStatusColumn — config-driven stacking for physical statuses.
 * Reads interactionType (RESET/MERGE) and limit from JSON config.
 */

import { EventStatusType, StackInteractionType } from '../../../consts/enums';
import { setEventDuration } from '../../../consts/viewTypes';
import { getStatusById } from '../../gameDataStore';
import { allocDerivedEvent } from '../objectPool';
import { genEventUid } from '../inputEventController';
import type { EventColumn, ColumnHost, EventSource, AddOptions, ConsumeOptions } from './eventColumn';

export class PhysicalStatusColumn implements EventColumn {
  readonly columnId: string;
  private host: ColumnHost;
  private interactionType: string;
  private maxStacks: number;

  constructor(columnId: string, host: ColumnHost) {
    this.columnId = columnId;
    this.host = host;
    const config = getStatusById(columnId);
    this.interactionType = config?.stacks?.interactionType as string ?? StackInteractionType.RESET;
    this.maxStacks = (config?.stacks?.limit as { value?: number } | undefined)?.value ?? 1;
  }

  add(ownerId: string, frame: number, durationFrames: number,
    source: EventSource, options?: AddOptions): boolean {

    const active = this.host.activeEventsIn(this.columnId, ownerId, frame);
    if (active.length >= this.maxStacks) {
      if (this.interactionType === StackInteractionType.RESET) {
        const oldest = active[0];
        setEventDuration(oldest, frame - oldest.startFrame);
        oldest.eventStatus = EventStatusType.REFRESHED;
        oldest.eventStatusOwnerId = source.ownerId;
        oldest.eventStatusSkillName = source.skillName;
      } else if (this.interactionType === StackInteractionType.MERGE) {
        // MERGE: subsume all active (Breach behavior)
        for (const act of active) {
          setEventDuration(act, frame - act.startFrame);
          act.eventStatus = EventStatusType.CONSUMED;
          act.eventStatusOwnerId = source.ownerId;
          act.eventStatusSkillName = source.skillName;
        }
      }
    }

    const ev = allocDerivedEvent();
    ev.uid = options?.uid ?? `${this.columnId}-${genEventUid()}`;
    ev.id = options?.statusId ?? this.columnId;
    ev.name = options?.statusId ?? this.columnId;
    ev.ownerId = ownerId;
    ev.columnId = this.columnId;
    ev.startFrame = frame;
    ev.segments = [{ properties: { duration: durationFrames } }];
    ev.sourceOwnerId = source.ownerId;
    ev.sourceSkillName = source.skillName;
    if (options?.event) Object.assign(ev, options.event);

    this.host.pushEvent(ev, durationFrames);
    if (ev.stacks == null) ev.stacks = this.host.activeCount(this.columnId, ownerId, frame);
    return true;
  }

  consume(ownerId: string, frame: number, source: EventSource,
    _options?: ConsumeOptions): number {
    const active = this.host.activeEventsIn(this.columnId, ownerId, frame);
    for (const ev of active) {
      setEventDuration(ev, frame - ev.startFrame);
      ev.eventStatus = EventStatusType.CONSUMED;
      ev.eventStatusOwnerId = source.ownerId;
      ev.eventStatusSkillName = source.skillName;
    }
    return active.length;
  }

  canAdd(): boolean { return true; }

  canConsume(ownerId: string, frame: number): boolean {
    return this.host.activeCount(this.columnId, ownerId, frame) > 0;
  }
}
