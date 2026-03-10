import { TimelineEvent, FrameAbsorptionMarker } from '../consts/viewTypes';
import { StatusType, TargetType } from '../consts/enums';
import { INFLICTION_COLUMN_IDS, INFLICTION_TO_REACTION, REACTION_COLUMN_IDS, PHYSICAL_INFLICTION_COLUMN_IDS } from '../model/channels';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import { TOTAL_FRAMES } from './timeline';

/** Maps forced reaction name → reaction columnId. */
const FORCED_REACTION_COLUMN: Record<string, string> = {
  COMBUSTION: 'combustion',
  SOLIDIFICATION: 'solidification',
  CORROSION: 'corrosion',
  ELECTRIFICATION: 'electrification',
};

/** Default active duration for derived reaction events (20s at 120fps). */
const REACTION_DURATION = 2400;

/** Forced reaction durations by type (frames at 120fps). */
const FORCED_REACTION_DURATION: Record<string, number> = {
  combustion: 600,        // 5s
  solidification: 600,    // 5s
  corrosion: 600,         // 5s
  electrification: 600,   // 5s
};

/** Default active duration for derived infliction events (20s at 120fps). */
const INFLICTION_DURATION = 2400;

/** Number of micro-column slots for infliction stacking. */
const INFLICTION_SLOTS = 4;

/** Breach durations by status level (frames at 120fps). */
const BREACH_DURATION: Record<number, number> = {
  1: 1440,   // 12s
  2: 2160,   // 18s
  3: 2880,   // 24s
  4: 3600,   // 30s
};

/** Default active duration for derived physical infliction events (20s at 120fps). */
const PHYSICAL_INFLICTION_DURATION = 2400;

/** Maps element key (from frame data) → infliction columnId. */
const ELEMENT_TO_INFLICTION_COLUMN: Record<string, string> = {
  HEAT: 'heatInfliction',
  CRYO: 'cryoInfliction',
  NATURE: 'natureInfliction',
  ELECTRIC: 'electricInfliction',
};

/** Maps self-targeted grant status → team-level derived column. */
const TEAM_STATUS_COLUMN: Record<string, string> = {
  [StatusType.SQUAD_BUFF]: StatusType.LINK,
};

/** P5 link extension: extra frames added to link duration when operator potential >= 5. */
const P5_LINK_EXTENSION_FRAMES = 600; // 5s at 120fps

/** Source information for event status changes (consumed/refreshed). */
interface StatusSource {
  ownerId: string;
  skillName?: string;
}

/**
 * Processes raw timeline events into renderable events.
 *
 * 1. Derives infliction events from operator frames with applyArtsInfliction.
 * 2. Derives arts reaction events from cross-element infliction overlaps.
 *    The triggering (incoming) infliction is removed; the consumed inflictions
 *    are clamped at the reaction frame.
 * 3. Same-element infliction refresh: slots 0–2 get durations extended to the
 *    newest stack's end time. Slot 3 shows sequential bars.
 */
export function processInflictionEvents(rawEvents: TimelineEvent[]): TimelineEvent[] {
  const withDerivedInflictions = deriveFrameInflictions(rawEvents);
  const withConsumedOperatorStatuses = consumeOperatorStatuses(withDerivedInflictions);
  const withConsumedTeam = consumeTeamStatuses(withConsumedOperatorStatuses);
  const withAbsorptions = applyAbsorptions(withConsumedTeam);
  const withReactions = deriveReactions(withAbsorptions);
  const mergedReactions = mergeReactions(withReactions);
  const withPhysicalRefresh = applyPhysicalInflictionRefresh(mergedReactions);
  return applySameElementRefresh(withPhysicalRefresh);
}

/** Skill column IDs that consume team statuses (Link) when cast. */
const CONSUMING_COLUMNS = new Set(['battle', 'combo', 'ultimate']);

/**
 * Consumes team status events (e.g. Link) when a battle/combo/ultimate skill is cast.
 * The first skill cast after Link is granted clamps the Link event at that frame.
 */
function consumeTeamStatuses(events: TimelineEvent[]): TimelineEvent[] {
  // Collect team status events (Link, etc.) and consuming skill events
  const teamStatuses = events.filter(
    (ev) => ev.ownerId === COMMON_OWNER_ID && Object.values(TEAM_STATUS_COLUMN).includes(ev.columnId),
  );
  if (teamStatuses.length === 0) return events;

  const skillCasts = events
    .filter((ev) => ev.ownerId !== 'enemy' && ev.ownerId !== COMMON_OWNER_ID && CONSUMING_COLUMNS.has(ev.columnId))
    .sort((a, b) => a.startFrame - b.startFrame);

  if (skillCasts.length === 0) return events;

  const clampMap = new Map<string, { frame: number; source: StatusSource }>();

  for (const status of teamStatuses) {
    const statusEnd = status.startFrame + status.activationDuration;
    // Find the first skill cast strictly after the status starts
    for (const cast of skillCasts) {
      if (cast.startFrame <= status.startFrame) continue;
      if (cast.startFrame >= statusEnd) break;
      clampMap.set(status.id, {
        frame: cast.startFrame,
        source: { ownerId: cast.ownerId, skillName: cast.name },
      });
      break;
    }
  }

  if (clampMap.size === 0) return events;

  return events.map((ev) => {
    const clamp = clampMap.get(ev.id);
    if (!clamp) return ev;
    const clamped = Math.max(0, clamp.frame - ev.startFrame);
    return {
      ...ev,
      activationDuration: clamped,
      eventStatus: 'consumed' as const,
      eventStatusOwnerId: clamp.source.ownerId,
      eventStatusSkillName: clamp.source.skillName,
    };
  });
}

/**
 * Consumes operator exchange-status events (e.g. Thunderlance) when a frame has
 * `consumeStatus`. All active events of the matching status owned by the same
 * operator are clamped at the consumption frame.
 */
function consumeOperatorStatuses(events: TimelineEvent[]): TimelineEvent[] {
  // Collect consume-status points from frame markers
  type ConsumePoint = { absoluteFrame: number; ownerId: string; status: string; source: StatusSource };
  const consumePoints: ConsumePoint[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === 'enemy' || event.ownerId === COMMON_OWNER_ID) continue;

    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          if (frame.consumeStatus) {
            consumePoints.push({
              absoluteFrame: event.startFrame + cumulativeOffset + frame.offsetFrame,
              ownerId: event.ownerId,
              status: frame.consumeStatus,
              source: { ownerId: event.ownerId, skillName: event.name },
            });
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  if (consumePoints.length === 0) return events;

  consumePoints.sort((a, b) => a.absoluteFrame - b.absoluteFrame);

  const clampMap = new Map<string, { frame: number; source: StatusSource }>();

  for (const cp of consumePoints) {
    const exchangeColumnId = EXCHANGE_STATUS_COLUMN[cp.status];
    if (!exchangeColumnId) continue;

    // Find all active exchange status events of this type owned by the same operator
    for (const ev of events) {
      if (ev.ownerId !== cp.ownerId || ev.columnId !== exchangeColumnId) continue;
      if (clampMap.has(ev.id)) continue; // already clamped

      const endFrame = ev.startFrame + ev.activationDuration;
      if (ev.startFrame <= cp.absoluteFrame && endFrame > cp.absoluteFrame) {
        clampMap.set(ev.id, { frame: cp.absoluteFrame, source: cp.source });
      }
    }
  }

  if (clampMap.size === 0) return events;

  return events.map((ev) => {
    const clamp = clampMap.get(ev.id);
    if (!clamp) return ev;
    const clamped = Math.max(0, clamp.frame - ev.startFrame);
    return {
      ...ev,
      activationDuration: clamped,
      eventStatus: 'consumed' as const,
      eventStatusOwnerId: clamp.source.ownerId,
      eventStatusSkillName: clamp.source.skillName,
    };
  });
}

/**
 * Scans sequenced operator events for frames with `applyArtsInfliction` markers
 * and generates corresponding enemy infliction events at the correct absolute frame.
 */
function deriveFrameInflictions(events: TimelineEvent[]): TimelineEvent[] {
  const derived: TimelineEvent[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === 'enemy') continue;

    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absoluteFrame = event.startFrame + cumulativeOffset + frame.offsetFrame;

          if (frame.applyArtsInfliction) {
            const columnId = ELEMENT_TO_INFLICTION_COLUMN[frame.applyArtsInfliction.element];
            if (columnId) {
              derived.push({
                id: `${event.id}-inflict-${si}-${fi}`,
                name: columnId,
                ownerId: 'enemy',
                columnId,
                startFrame: absoluteFrame,
                activationDuration: INFLICTION_DURATION,
                activeDuration: 0,
                cooldownDuration: 0,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
              });
            }
          }

          // Status applied by this frame (self or enemy target)
          if (frame.applyStatus) {
            if (frame.applyStatus.target === TargetType.SELF) {
              // Self-targeted status (e.g. Melting Flame, Thunderlance)
              const grantColumnId = EXCHANGE_STATUS_COLUMN[frame.applyStatus.status];
              if (grantColumnId) {
                const statusDuration = EXCHANGE_STATUS_DURATION[frame.applyStatus.status] ?? EXCHANGE_EVENT_DURATION;
                for (let s = 0; s < frame.applyStatus.stacks; s++) {
                  derived.push({
                    id: `${event.id}-status-${si}-${fi}-${s}`,
                    name: frame.applyStatus.status,
                    ownerId: event.ownerId,
                    columnId: grantColumnId,
                    startFrame: absoluteFrame,
                    activationDuration: statusDuration,
                    activeDuration: 0,
                    cooldownDuration: 0,
                    sourceOwnerId: event.ownerId,
                    sourceSkillName: event.name,
                  });
                }
              }
              // Team status (e.g. Squad Buff → Link)
              const teamColumnId = TEAM_STATUS_COLUMN[frame.applyStatus.status];
              if (teamColumnId) {
                // Link duration = remaining ultimate active phase from grant frame
                const ultActiveEnd = event.startFrame + event.activationDuration + event.activeDuration;
                let linkDuration = Math.max(0, ultActiveEnd - absoluteFrame);
                // P5: extend link buff duration beyond ultimate active phase
                if ((event.operatorPotential ?? 0) >= 5) {
                  linkDuration += P5_LINK_EXTENSION_FRAMES;
                }
                derived.push({
                  id: `${event.id}-team-status-${si}-${fi}`,
                  name: 'Squad Buff (Link)',
                  ownerId: COMMON_OWNER_ID,
                  columnId: teamColumnId,
                  startFrame: absoluteFrame,
                  activationDuration: linkDuration,
                  activeDuration: 0,
                  cooldownDuration: 0,
                  sourceOwnerId: event.ownerId,
                  sourceSkillName: event.name,
                });
              }
            } else if (frame.applyStatus.target === TargetType.ENEMY) {
              // Enemy-targeted status (e.g. Focus)
              derived.push({
                id: `${event.id}-status-${si}-${fi}`,
                name: frame.applyStatus.status,
                ownerId: 'enemy',
                columnId: frame.applyStatus.status,
                startFrame: absoluteFrame,
                activationDuration: frame.applyStatus.durationFrames,
                activeDuration: 0,
                cooldownDuration: 0,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                ...(frame.applyStatus.susceptibility && { susceptibility: frame.applyStatus.susceptibility }),
              });
            }
          }

          // Forced reactions bypass infliction stacks entirely
          if (frame.applyForcedReaction) {
            const reactionColumnId = FORCED_REACTION_COLUMN[frame.applyForcedReaction.reaction];
            if (reactionColumnId) {
              derived.push({
                id: `${event.id}-forced-${si}-${fi}`,
                name: reactionColumnId,
                ownerId: 'enemy',
                columnId: reactionColumnId,
                startFrame: absoluteFrame,
                activationDuration: frame.applyForcedReaction.durationFrames ?? FORCED_REACTION_DURATION[reactionColumnId] ?? REACTION_DURATION,
                activeDuration: 0,
                cooldownDuration: 0,
                statusLevel: frame.applyForcedReaction.statusLevel,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                forcedReaction: true,
              });
            }
          }

          // SP recovery from frames → team SP resource timeline
          if ((frame.skillPointRecovery ?? 0) > 0) {
            derived.push({
              id: `${event.id}-sp-${si}-${fi}`,
              name: 'sp-recovery',
              ownerId: COMMON_OWNER_ID,
              columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
              startFrame: absoluteFrame,
              // Negative activationDuration = negative cost = SP gain in ResourceTimeline
              activationDuration: -(frame.skillPointRecovery!),
              activeDuration: 0,
              cooldownDuration: 0,
              sourceOwnerId: event.ownerId,
              sourceSkillName: event.name,
            });
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  // Combo events with comboTriggerColumnId: generate derived infliction/status
  // matching the trigger source at each tick frame
  for (const event of events) {
    if (!event.comboTriggerColumnId || !event.segments) continue;

    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absoluteFrame = event.startFrame + cumulativeOffset + frame.offsetFrame;
          const triggerCol = event.comboTriggerColumnId;

          if (INFLICTION_COLUMN_IDS.has(triggerCol)) {
            // Arts infliction: generate infliction event
            derived.push({
              id: `${event.id}-combo-inflict-${si}-${fi}`,
              name: triggerCol,
              ownerId: 'enemy',
              columnId: triggerCol,
              startFrame: absoluteFrame,
              activationDuration: INFLICTION_DURATION,
              activeDuration: 0,
              cooldownDuration: 0,
              sourceOwnerId: event.ownerId,
              sourceSkillName: event.name,
            });
          } else if (PHYSICAL_INFLICTION_COLUMN_IDS.has(triggerCol)) {
            // Physical status: generate physical infliction event
            derived.push({
              id: `${event.id}-combo-phys-${si}-${fi}`,
              name: triggerCol,
              ownerId: 'enemy',
              columnId: triggerCol,
              startFrame: absoluteFrame,
              activationDuration: PHYSICAL_INFLICTION_DURATION,
              activeDuration: 0,
              cooldownDuration: 0,
              sourceOwnerId: event.ownerId,
              sourceSkillName: event.name,
            });
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  if (derived.length === 0) return events;
  return [...events, ...derived];
}

/** Maps absorption exchange status → columnId for generated events. */
const EXCHANGE_STATUS_COLUMN: Record<string, string> = {
  MELTING_FLAME: 'melting-flame',
  THUNDERLANCE: 'thunderlance',
};

/** Max micro-column slots for each exchange status. */
const EXCHANGE_STATUS_MAX_SLOTS: Record<string, number> = {
  MELTING_FLAME: 4,
  THUNDERLANCE: 4,
};

/** Duration (frames) for each exchange status. Unkeyed = effectively permanent. */
const EXCHANGE_STATUS_DURATION: Record<string, number> = {
  THUNDERLANCE: 2400, // 20s at 120fps
};

/** Default duration for generated exchange events (effectively permanent). */
const EXCHANGE_EVENT_DURATION = TOTAL_FRAMES * 10;

/**
 * Processes absorption frames: consumes enemy infliction stacks and generates
 * exchange status events (e.g. Melting Flame) on the absorbing operator.
 *
 * For each absorption marker found on operator events:
 * 1. Count active infliction events of the matching element on the enemy
 * 2. Count active exchange status events on the operator
 * 3. Consume min(active inflictions, available slots, marker max stacks)
 * 4. Clamp consumed inflictions at the absorption frame
 * 5. Generate new exchange status events
 */
function applyAbsorptions(events: TimelineEvent[]): TimelineEvent[] {
  // Collect all absorption points: { absoluteFrame, ownerId, marker }
  type AbsorptionPoint = {
    absoluteFrame: number;
    ownerId: string;
    marker: FrameAbsorptionMarker;
    eventId: string;
    eventName: string;
    segmentIndex: number;
    frameIndex: number;
  };

  type ConsumptionPoint = {
    absoluteFrame: number;
    element: string;
    stacks: number;
    source: StatusSource;
  };

  const absorptions: AbsorptionPoint[] = [];
  const consumptions: ConsumptionPoint[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === 'enemy') continue;

    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          if (frame.absorbArtsInfliction) {
            absorptions.push({
              absoluteFrame: event.startFrame + cumulativeOffset + frame.offsetFrame,
              ownerId: event.ownerId,
              marker: frame.absorbArtsInfliction,
              eventId: event.id,
              eventName: event.name,
              segmentIndex: si,
              frameIndex: fi,
            });
          }
          if (frame.consumeArtsInfliction) {
            consumptions.push({
              absoluteFrame: event.startFrame + cumulativeOffset + frame.offsetFrame,
              element: frame.consumeArtsInfliction.element,
              stacks: frame.consumeArtsInfliction.stacks,
              source: { ownerId: event.ownerId, skillName: event.name },
            });
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  if (absorptions.length === 0 && consumptions.length === 0) return events;

  // Sort absorptions chronologically
  absorptions.sort((a, b) => a.absoluteFrame - b.absoluteFrame);

  // Track modifications: clamped inflictions and removed inflictions
  const clampMap = new Map<string, { frame: number; source: StatusSource }>(); // infliction id → clamp info
  const removedIds = new Set<string>();
  const generated: TimelineEvent[] = [];

  for (const absorption of absorptions) {
    const { absoluteFrame, ownerId, marker } = absorption;
    const inflictionColumnId = ELEMENT_TO_INFLICTION_COLUMN[marker.element];
    const exchangeColumnId = EXCHANGE_STATUS_COLUMN[marker.exchangeStatus];
    const maxSlots = EXCHANGE_STATUS_MAX_SLOTS[marker.exchangeStatus] ?? 4;

    if (!inflictionColumnId || !exchangeColumnId) continue;

    // Find active enemy infliction events of the matching element at this frame
    const activeInflictions: TimelineEvent[] = [];
    for (const ev of events) {
      if (ev.ownerId !== 'enemy' || ev.columnId !== inflictionColumnId) continue;
      if (removedIds.has(ev.id)) continue;

      const clamp = clampMap.get(ev.id);
      const endFrame = clamp !== undefined
        ? clamp.frame
        : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;

      if (ev.startFrame <= absoluteFrame && endFrame > absoluteFrame) {
        activeInflictions.push(ev);
      }
    }

    if (activeInflictions.length === 0) continue;

    // Count active exchange status events for this operator at this frame
    let activeExchangeCount = 0;
    for (const ev of [...events, ...generated]) {
      if (ev.ownerId !== ownerId || ev.columnId !== exchangeColumnId) continue;
      if (removedIds.has(ev.id)) continue;

      const clamp = clampMap.get(ev.id);
      const endFrame = clamp !== undefined
        ? clamp.frame
        : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;

      if (ev.startFrame <= absoluteFrame && endFrame > absoluteFrame) {
        activeExchangeCount++;
      }
    }

    const availableSlots = maxSlots - activeExchangeCount;
    if (availableSlots <= 0) continue;

    const stacksToConsume = Math.min(activeInflictions.length, availableSlots, marker.stacks);
    if (stacksToConsume <= 0) continue;

    // Sort active inflictions by startFrame (consume oldest first)
    activeInflictions.sort((a, b) => a.startFrame - b.startFrame);

    // Consume inflictions: clamp them at the absorption frame
    const absSource: StatusSource = { ownerId: absorption.ownerId, skillName: absorption.eventName };
    for (let i = 0; i < stacksToConsume; i++) {
      const consumed = activeInflictions[i];
      clampMap.set(consumed.id, { frame: absoluteFrame, source: absSource });
    }

    // Generate exchange status events
    for (let i = 0; i < stacksToConsume; i++) {
      generated.push({
        id: `${absorption.eventId}-absorb-${absorption.segmentIndex}-${absorption.frameIndex}-${i}`,
        name: marker.exchangeStatus,
        ownerId,
        columnId: exchangeColumnId,
        startFrame: absoluteFrame,
        activationDuration: EXCHANGE_EVENT_DURATION,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: ownerId,
        sourceSkillName: absorption.eventName,
      });
    }
  }

  // Process consumptions: clamp inflictions without generating exchange events
  consumptions.sort((a, b) => a.absoluteFrame - b.absoluteFrame);
  for (const consumption of consumptions) {
    const inflictionColumnId = ELEMENT_TO_INFLICTION_COLUMN[consumption.element];
    if (!inflictionColumnId) continue;

    const activeInflictions: TimelineEvent[] = [];
    for (const ev of events) {
      if (ev.ownerId !== 'enemy' || ev.columnId !== inflictionColumnId) continue;
      if (removedIds.has(ev.id)) continue;
      const clamp = clampMap.get(ev.id);
      const endFrame = clamp !== undefined
        ? clamp.frame
        : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      if (ev.startFrame <= consumption.absoluteFrame && endFrame > consumption.absoluteFrame) {
        activeInflictions.push(ev);
      }
    }

    if (activeInflictions.length === 0) continue;
    activeInflictions.sort((a, b) => a.startFrame - b.startFrame);
    const toConsume = Math.min(activeInflictions.length, consumption.stacks);
    for (let i = 0; i < toConsume; i++) {
      clampMap.set(activeInflictions[i].id, { frame: consumption.absoluteFrame, source: consumption.source });
    }
  }

  if (clampMap.size === 0 && generated.length === 0) return events;

  // Build output: clamp consumed inflictions, append generated events
  const result: TimelineEvent[] = [];
  for (const ev of events) {
    if (removedIds.has(ev.id)) continue;

    const clamp = clampMap.get(ev.id);
    if (clamp !== undefined) {
      const available = Math.max(0, clamp.frame - ev.startFrame);
      const clampedActive = Math.min(ev.activationDuration, available);
      const remAfterActive = available - clampedActive;
      const clampedLinger = Math.min(ev.activeDuration, remAfterActive);
      const remAfterLinger = remAfterActive - clampedLinger;
      const clampedCooldown = Math.min(ev.cooldownDuration, remAfterLinger);
      result.push({
        ...ev,
        activationDuration: clampedActive,
        activeDuration: clampedLinger,
        cooldownDuration: clampedCooldown,
        eventStatus: 'consumed',
        eventStatusOwnerId: clamp.source.ownerId,
        eventStatusSkillName: clamp.source.skillName,
      });
    } else {
      result.push(ev);
    }
  }

  return [...result, ...generated];
}

/**
 * Detects cross-element infliction overlaps and derives reaction events.
 *
 * When an infliction of element B arrives while element A is still active:
 * - A reaction event (typed by B) is generated at B's start frame
 * - The triggering B infliction is removed from output
 * - All active A inflictions are clamped at the reaction frame
 */
function deriveReactions(events: TimelineEvent[]): TimelineEvent[] {
  // Collect all enemy infliction events, sorted by start frame
  const inflictions = events
    .filter((ev) => ev.ownerId === 'enemy' && INFLICTION_COLUMN_IDS.has(ev.columnId))
    .sort((a, b) => a.startFrame - b.startFrame);

  if (inflictions.length === 0) return events;

  // Track which infliction IDs are consumed (triggering infliction removed,
  // consumed inflictions clamped)
  const removedIds = new Set<string>();
  const clampMap = new Map<string, { frame: number; source: StatusSource }>();
  const generatedReactions: TimelineEvent[] = [];

  // Walk through inflictions in chronological order
  for (let i = 0; i < inflictions.length; i++) {
    const incoming = inflictions[i];
    if (removedIds.has(incoming.id)) continue;

    // Find active inflictions of a DIFFERENT element at incoming's start frame
    const activeOther: TimelineEvent[] = [];
    for (let j = 0; j < i; j++) {
      const prev = inflictions[j];
      if (removedIds.has(prev.id)) continue;
      if (prev.columnId === incoming.columnId) continue;

      // Use clamped end if already clamped by a prior reaction
      const clamp = clampMap.get(prev.id);
      const endFrame = clamp !== undefined
        ? clamp.frame
        : prev.startFrame + prev.activationDuration + prev.activeDuration + prev.cooldownDuration;

      if (endFrame > incoming.startFrame) {
        activeOther.push(prev);
      }
    }

    if (activeOther.length > 0) {
      // Generate reaction event
      const reactionColumnId = INFLICTION_TO_REACTION[incoming.columnId];
      generatedReactions.push({
        id: `${incoming.id}-reaction`,
        name: reactionColumnId,
        ownerId: 'enemy',
        columnId: reactionColumnId,
        startFrame: incoming.startFrame,
        activationDuration: REACTION_DURATION,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: incoming.sourceOwnerId,
        sourceSkillName: incoming.sourceSkillName,
      });

      // Remove the triggering infliction
      removedIds.add(incoming.id);

      // Clamp all active other-element inflictions at the reaction frame
      const reactionSource: StatusSource = { ownerId: incoming.sourceOwnerId ?? 'enemy', skillName: incoming.sourceSkillName };
      for (const consumed of activeOther) {
        clampMap.set(consumed.id, { frame: incoming.startFrame, source: reactionSource });
      }
    }
  }

  if (removedIds.size === 0 && generatedReactions.length === 0) return events;

  // Build output: filter removed, clamp consumed, append generated reactions
  const result: TimelineEvent[] = [];
  for (const ev of events) {
    if (removedIds.has(ev.id)) continue;

    const clamp = clampMap.get(ev.id);
    if (clamp !== undefined) {
      const available = Math.max(0, clamp.frame - ev.startFrame);
      const clampedActive = Math.min(ev.activationDuration, available);
      const remAfterActive = available - clampedActive;
      const clampedLinger = Math.min(ev.activeDuration, remAfterActive);
      const remAfterLinger = remAfterActive - clampedLinger;
      const clampedCooldown = Math.min(ev.cooldownDuration, remAfterLinger);
      result.push({
        ...ev,
        activationDuration: clampedActive,
        activeDuration: clampedLinger,
        cooldownDuration: clampedCooldown,
        eventStatus: 'consumed',
        eventStatusOwnerId: clamp.source.ownerId,
        eventStatusSkillName: clamp.source.skillName,
      });
    } else {
      result.push(ev);
    }
  }

  return [...result, ...generatedReactions];
}

/**
 * Clamps overlapping same-type arts reaction events when the newer one
 * would outlast the older. If the older event has a longer duration, both
 * are kept as-is and allowed to overlap visually.
 */
function mergeReactions(events: TimelineEvent[]): TimelineEvent[] {
  const reactionsByType = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === 'enemy' && REACTION_COLUMN_IDS.has(ev.columnId)) {
      const group = reactionsByType.get(ev.columnId) ?? [];
      group.push(ev);
      reactionsByType.set(ev.columnId, group);
    }
  }

  if (reactionsByType.size === 0) return events;

  const clampMap = new Map<string, { duration: number; source: StatusSource }>();

  reactionsByType.forEach((group) => {
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const currentEnd = current.startFrame + (clampMap.get(current.id)?.duration ?? current.activationDuration);
      const next = sorted[i + 1];
      const nextEnd = next.startFrame + next.activationDuration;

      // Only clamp if the newer event outlasts the older one (refresh)
      if (next.startFrame < currentEnd && nextEnd >= currentEnd) {
        clampMap.set(current.id, {
          duration: Math.max(0, next.startFrame - current.startFrame),
          source: { ownerId: next.sourceOwnerId ?? 'enemy', skillName: next.sourceSkillName },
        });
      }
    }
  });

  if (clampMap.size === 0) return events;

  return events.map((ev) => {
    const clamp = clampMap.get(ev.id);
    return clamp !== undefined ? {
      ...ev,
      activationDuration: clamp.duration,
      eventStatus: 'refreshed' as const,
      eventStatusOwnerId: clamp.source.ownerId,
      eventStatusSkillName: clamp.source.skillName,
    } : ev;
  });
}

/**
 * Processes physical infliction (Vulnerable) stacking with the same
 * slot refresh/clamp logic as arts inflictions.
 */
function applyPhysicalInflictionRefresh(events: TimelineEvent[]): TimelineEvent[] {
  const physInflictionsByColumn = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === 'enemy' && PHYSICAL_INFLICTION_COLUMN_IDS.has(ev.columnId)) {
      const group = physInflictionsByColumn.get(ev.columnId) ?? [];
      group.push(ev);
      physInflictionsByColumn.set(ev.columnId, group);
    }
  }

  if (physInflictionsByColumn.size === 0) return events;

  const processedMap = new Map<string, TimelineEvent>();

  physInflictionsByColumn.forEach((group) => {
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);
    const lastSlot = INFLICTION_SLOTS - 1;

    const extendedActive: number[] = sorted.map((ev) => ev.activationDuration);
    for (let i = sorted.length - 2; i >= 0; i--) {
      const ev = sorted[i];
      let maxEnd = ev.startFrame + extendedActive[i];
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].startFrame > maxEnd) break;
        const jEnd = sorted[j].startFrame + extendedActive[j];
        if (jEnd > maxEnd) maxEnd = jEnd;
      }
      extendedActive[i] = maxEnd - ev.startFrame;
    }

    const slotEndFrames = new Array(INFLICTION_SLOTS).fill(-1);
    const slotAssignment: number[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      const endFrame = ev.startFrame + extendedActive[i];
      let assigned = -1;
      for (let s = 0; s < INFLICTION_SLOTS; s++) {
        if (slotEndFrames[s] <= ev.startFrame) {
          assigned = s;
          break;
        }
      }
      if (assigned < 0) assigned = lastSlot;
      slotEndFrames[assigned] = endFrame;
      slotAssignment.push(assigned);
    }

    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      const slot = slotAssignment[i];

      if (slot < lastSlot) {
        if (extendedActive[i] !== ev.activationDuration) {
          processedMap.set(ev.id, { ...ev, activationDuration: extendedActive[i] });
        }
      }
    }

    const lastSlotIndices: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (slotAssignment[i] === lastSlot) lastSlotIndices.push(i);
    }

    for (let k = 0; k < lastSlotIndices.length - 1; k++) {
      const idx = lastSlotIndices[k];
      const nextIdx = lastSlotIndices[k + 1];
      const ev = sorted[idx];
      const nextEv = sorted[nextIdx];
      const nextStart = nextEv.startFrame;
      const totalDur = ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      const originalEnd = ev.startFrame + totalDur;

      if (nextStart < originalEnd) {
        const available = Math.max(0, nextStart - ev.startFrame);
        const clampedActive = Math.min(ev.activationDuration, available);
        const remAfterActive = available - clampedActive;
        const clampedLinger = Math.min(ev.activeDuration, remAfterActive);
        const remAfterLinger = remAfterActive - clampedLinger;
        const clampedCooldown = Math.min(ev.cooldownDuration, remAfterLinger);

        processedMap.set(ev.id, {
          ...(processedMap.get(ev.id) ?? ev),
          activationDuration: clampedActive,
          activeDuration: clampedLinger,
          cooldownDuration: clampedCooldown,
          eventStatus: 'refreshed' as const,
          eventStatusOwnerId: nextEv.sourceOwnerId,
          eventStatusSkillName: nextEv.sourceSkillName,
        });
      }
    }
  });

  if (processedMap.size === 0) return events;
  return events.map((ev) => processedMap.get(ev.id) ?? ev);
}

/**
 * Processes same-element infliction stacking:
 * - Extends slots 0–2 durations when later stacks refresh them
 * - Clamps slot 3 events sequentially (previous ends where next begins)
 *
 * Uses iterative refinement: extend durations first, then assign slots using
 * the extended durations so the slot assignment matches CombatPlanner's greedy
 * bin-packing on the processed output.
 */
function applySameElementRefresh(events: TimelineEvent[]): TimelineEvent[] {
  const inflictionsByColumn = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === 'enemy' && INFLICTION_COLUMN_IDS.has(ev.columnId)) {
      const group = inflictionsByColumn.get(ev.columnId) ?? [];
      group.push(ev);
      inflictionsByColumn.set(ev.columnId, group);
    }
  }

  if (inflictionsByColumn.size === 0) return events;

  const processedMap = new Map<string, TimelineEvent>();

  inflictionsByColumn.forEach((group) => {
    if (group.length <= 1) return; // nothing to refresh with a single event
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);
    const lastSlot = INFLICTION_SLOTS - 1;

    // Step 1: Compute the maximum extended duration for each event assuming
    // all events in slots 0–2 get fully extended. We extend each event's
    // activationDuration to the latest end frame reachable through a chain of
    // overlapping subsequent stacks.
    const extendedActive: number[] = sorted.map((ev) => ev.activationDuration);
    for (let i = sorted.length - 2; i >= 0; i--) {
      const ev = sorted[i];
      // Walk forward to find the latest chained end
      let maxEnd = ev.startFrame + extendedActive[i];
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].startFrame > maxEnd) break;
        const jEnd = sorted[j].startFrame + extendedActive[j];
        if (jEnd > maxEnd) maxEnd = jEnd;
      }
      extendedActive[i] = maxEnd - ev.startFrame;
    }

    // Step 2: Assign slots using extended durations (matching CombatPlanner's
    // greedy algorithm on the processed output).
    const slotEndFrames = new Array(INFLICTION_SLOTS).fill(-1);
    const slotAssignment: number[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      const endFrame = ev.startFrame + extendedActive[i];
      let assigned = -1;
      for (let s = 0; s < INFLICTION_SLOTS; s++) {
        if (slotEndFrames[s] <= ev.startFrame) {
          assigned = s;
          break;
        }
      }
      if (assigned < 0) assigned = lastSlot; // overflow to last slot
      slotEndFrames[assigned] = endFrame;
      slotAssignment.push(assigned);
    }

    // Step 3: Apply refresh to slots 0–(lastSlot-1), clamp sequential on lastSlot
    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      const slot = slotAssignment[i];

      if (slot < lastSlot) {
        // Extend duration
        if (extendedActive[i] !== ev.activationDuration) {
          processedMap.set(ev.id, { ...ev, activationDuration: extendedActive[i] });
        }
      }
    }

    // Clamp last-slot events: each ends when the next last-slot event starts
    const lastSlotIndices: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (slotAssignment[i] === lastSlot) lastSlotIndices.push(i);
    }

    for (let k = 0; k < lastSlotIndices.length - 1; k++) {
      const idx = lastSlotIndices[k];
      const nextIdx = lastSlotIndices[k + 1];
      const ev = sorted[idx];
      const nextEv = sorted[nextIdx];
      const nextStart = nextEv.startFrame;
      const totalDur = ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      const originalEnd = ev.startFrame + totalDur;

      if (nextStart < originalEnd) {
        const available = Math.max(0, nextStart - ev.startFrame);
        const clampedActive = Math.min(ev.activationDuration, available);
        const remAfterActive = available - clampedActive;
        const clampedLinger = Math.min(ev.activeDuration, remAfterActive);
        const remAfterLinger = remAfterActive - clampedLinger;
        const clampedCooldown = Math.min(ev.cooldownDuration, remAfterLinger);

        processedMap.set(ev.id, {
          ...(processedMap.get(ev.id) ?? ev),
          activationDuration: clampedActive,
          activeDuration: clampedLinger,
          cooldownDuration: clampedCooldown,
          eventStatus: 'refreshed' as const,
          eventStatusOwnerId: nextEv.sourceOwnerId,
          eventStatusSkillName: nextEv.sourceSkillName,
        });
      }
    }
  });

  if (processedMap.size === 0) return events;
  return events.map((ev) => processedMap.get(ev.id) ?? ev);
}
