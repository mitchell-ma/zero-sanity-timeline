/**
 * InflictionColumn — deque stacking, cross-element reaction trigger,
 * co-active duration extension, arts burst flag.
 *
 * Config-driven: stack limit and isArts come from the status JSON config.
 * Cross-element reaction mapping still uses INFLICTION_TO_REACTION.
 */

import { EventCategoryType, EventStatusType } from '../../../consts/enums';
import { eventDuration, setEventDuration } from '../../../consts/viewTypes';
import { ENEMY_OWNER_ID, INFLICTION_TO_REACTION } from '../../../model/channels';
import { getStatusById } from '../../gameDataStore';
import { allocDerivedEvent } from '../objectPool';
import { genEventUid } from '../inputEventController';
import type { EventColumn, ColumnHost, EventSource, AddOptions, ConsumeOptions } from './eventColumn';

export class InflictionColumn implements EventColumn {
  readonly columnId: string;
  private host: ColumnHost;
  private isArts: boolean;
  private maxStacks: number;

  constructor(columnId: string, host: ColumnHost) {
    this.columnId = columnId;
    this.host = host;
    const config = getStatusById(columnId);
    this.isArts = config?.eventCategoryType === EventCategoryType.INFLICTION;
    this.maxStacks = (config?.stacks?.limit as { value?: number } | undefined)?.value ?? 4;
  }

  add(ownerId: string, frame: number, durationFrames: number,
    source: EventSource, options?: AddOptions): boolean {

    // ── Cross-element reaction (arts inflictions only) ──────────────────
    if (this.isArts) {
      const otherActive = this.collectCrossElementActive(ownerId, frame);
      if (otherActive.length > 0) {
        const reactionColumnId = INFLICTION_TO_REACTION[this.columnId];
        if (reactionColumnId) {
          for (const consumed of otherActive) {
            setEventDuration(consumed, frame - consumed.startFrame);
            consumed.eventStatus = EventStatusType.CONSUMED;
            consumed.eventStatusOwnerId = source.ownerId;
            consumed.eventStatusSkillName = source.skillName;
          }
          // Read reaction duration from JSON config via the resolved durationSeconds getter
          const reactionConfig = getStatusById(reactionColumnId);
          const reactionDurSec = reactionConfig?.durationSeconds ?? 20;
          const reactionDurFrames = Math.round(reactionDurSec * 120);
          this.host.applyToColumn(reactionColumnId, ENEMY_OWNER_ID, frame, reactionDurFrames, source, {
            uid: `${options?.uid ?? this.columnId}-reaction`,
            stacks: otherActive.length,
          });
          // Emit a consumed copy of the incoming infliction for freeform state tracking
          const consumed = allocDerivedEvent();
          consumed.uid = options?.uid ?? `${this.columnId}-${genEventUid()}`;
          consumed.id = this.columnId;
          consumed.name = this.columnId;
          consumed.ownerId = ownerId;
          consumed.columnId = this.columnId;
          consumed.startFrame = frame;
          consumed.segments = [{ properties: { duration: 0 } }];
          consumed.sourceOwnerId = source.ownerId;
          consumed.sourceSkillName = source.skillName;
          consumed.eventStatus = EventStatusType.CONSUMED;
          consumed.eventStatusOwnerId = source.ownerId;
          consumed.eventStatusSkillName = source.skillName;
          this.host.pushToOutput(consumed);
          return true;
        }
      }
    }

    // ── Deque stacking: evict oldest at cap ──────────────────────────────
    const active = this.host.activeEventsIn(this.columnId, ownerId, frame);
    const isArtsBurst = this.isArts && active.length > 0;

    if (active.length >= this.maxStacks) {
      const oldest = active[0];
      setEventDuration(oldest, frame - oldest.startFrame);
      oldest.eventStatus = EventStatusType.CONSUMED;
      oldest.eventStatusOwnerId = source.ownerId;
      oldest.eventStatusSkillName = source.skillName;
    }

    // ── Create event ─────────────────────────────────────────────────────
    const ev = allocDerivedEvent();
    ev.uid = options?.uid ?? `${this.columnId}-${genEventUid()}`;
    ev.id = this.columnId;
    ev.name = this.columnId;
    ev.ownerId = ownerId;
    ev.columnId = this.columnId;
    ev.startFrame = frame;
    ev.segments = [{ properties: { duration: durationFrames } }];
    ev.sourceOwnerId = source.ownerId;
    ev.sourceSkillName = source.skillName;
    if (isArtsBurst) ev.isArtsBurst = true;

    this.host.pushEvent(ev, durationFrames);

    // Record stack position at creation time
    const activeAfterCreation = this.host.activeEventsIn(this.columnId, ownerId, frame);
    ev.stacks = activeAfterCreation.length;

    // ── Extend co-active inflictions to match new end ────────────────────
    const newEnd = ev.startFrame + eventDuration(ev);
    for (const act of activeAfterCreation) {
      if (act.uid === ev.uid) continue;
      const actEnd = act.startFrame + eventDuration(act);
      if (newEnd > actEnd) {
        setEventDuration(act, newEnd - act.startFrame);
        act.eventStatus = EventStatusType.EXTENDED;
        act.eventStatusOwnerId = source.ownerId;
        act.eventStatusSkillName = source.skillName;
      }
    }

    return true;
  }

  consume(ownerId: string, frame: number, source: EventSource,
    options?: ConsumeOptions): number {
    const count = options?.count ?? Infinity;
    const allActive = this.host.activeEventsIn(this.columnId, ownerId, frame)
      .sort((a, b) => a.startFrame - b.startFrame);
    const toAbsorb = allActive.slice(0, count);
    for (const ev of toAbsorb) {
      setEventDuration(ev, frame - ev.startFrame);
      ev.eventStatus = EventStatusType.CONSUMED;
      ev.eventStatusOwnerId = source.ownerId;
      ev.eventStatusSkillName = source.skillName;
    }
    return toAbsorb.length;
  }

  canAdd(): boolean { return true; } // deque always accepts (evicts oldest)

  canConsume(ownerId: string, frame: number): boolean {
    return this.host.activeCount(this.columnId, ownerId, frame) > 0;
  }

  // ── Private ────────────────────────────────────────────────────────────

  private collectCrossElementActive(ownerId: string, frame: number) {
    const result: import('../../../consts/viewTypes').TimelineEvent[] = [];
    // Check all other infliction columns that map to reactions
    for (const otherCol of Object.keys(INFLICTION_TO_REACTION)) {
      if (otherCol === this.columnId) continue;
      for (const ev of this.host.activeEventsIn(otherCol, ownerId, frame)) {
        result.push(ev);
      }
    }
    return result;
  }
}
