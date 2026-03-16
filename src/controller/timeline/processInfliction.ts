import { TimelineEvent, EventFrameMarker, FrameAbsorptionMarker, SkillType } from '../../consts/viewTypes';
import { LoadoutStats, DEFAULT_LOADOUT_STATS } from '../../view/InformationPane';
import { CombatSkillsType, ElementType, EventFrameType, EventStatusType, StatusType, TargetType } from '../../consts/enums';
import { TimeStopRegion, absoluteFrame, foreignStopsFor } from './processTimeStop';
import { StatusLevel } from '../../consts/types';
import { getCorrosionBaseReduction } from '../../model/calculation/damageFormulas';
import { ENEMY_OWNER_ID, INFLICTION_COLUMN_IDS, INFLICTION_TO_REACTION, OPERATOR_COLUMNS, REACTION_COLUMN_IDS, REACTION_COLUMNS, PHYSICAL_INFLICTION_COLUMN_IDS } from '../../model/channels';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { MAX_SKILL_LEVEL_INDEX } from '../calculation/statusQueryService';

/** Maps forced reaction name → reaction columnId. */
export const FORCED_REACTION_COLUMN: Record<string, string> = {
  [StatusType.COMBUSTION]:      REACTION_COLUMNS.COMBUSTION,
  [StatusType.SOLIDIFICATION]:  REACTION_COLUMNS.SOLIDIFICATION,
  [StatusType.CORROSION]:       REACTION_COLUMNS.CORROSION,
  [StatusType.ELECTRIFICATION]: REACTION_COLUMNS.ELECTRIFICATION,
};

/** Default active duration for derived reaction events (20s at 120fps). */
export const REACTION_DURATION = 2400;

/** Forced reaction durations by type (frames at 120fps). */
export const FORCED_REACTION_DURATION: Record<string, number> = {
  [REACTION_COLUMNS.COMBUSTION]:      600,  // 5s
  [REACTION_COLUMNS.SOLIDIFICATION]:  600,  // 5s
  [REACTION_COLUMNS.CORROSION]:       600,  // 5s
  [REACTION_COLUMNS.ELECTRIFICATION]: 600,  // 5s
};

/** Default active duration for derived infliction events (20s at 120fps). */
export const INFLICTION_DURATION = 2400;


/** Breach durations by status level (frames at 120fps). */
export const BREACH_DURATION: Record<number, number> = {
  1: 1440,   // 12s
  2: 2160,   // 18s
  3: 2880,   // 24s
  4: 3600,   // 30s
};

/** Default active duration for derived physical infliction events (20s at 120fps). */
export const PHYSICAL_INFLICTION_DURATION = 2400;

/** Maps element key (from frame data) → infliction columnId. */
export const ELEMENT_TO_INFLICTION_COLUMN: Record<string, string> = {
  HEAT: 'heatInfliction',
  CRYO: 'cryoInfliction',
  NATURE: 'natureInfliction',
  ELECTRIC: 'electricInfliction',
};

/** Maps self-targeted grant status → team-level derived column. */
export const TEAM_STATUS_COLUMN: Record<string, string> = {
  [StatusType.SQUAD_BUFF]: StatusType.LINK,
};

/** P5 link extension: extra frames added to link duration when operator potential >= 5. */
export const P5_LINK_EXTENSION_FRAMES = 600; // 5s at 120fps

/** Maps absorption exchange status → columnId for generated events. */
export const EXCHANGE_STATUS_COLUMN: Record<string, string> = {
  MELTING_FLAME: 'melting-flame',
  THUNDERLANCE: 'thunderlance',
};

/** Max micro-column slots for each exchange status. */
export const EXCHANGE_STATUS_MAX_SLOTS: Record<string, number> = {
  MELTING_FLAME: 4,
  THUNDERLANCE: 4,
};

/** Duration (frames) for each exchange status. Unkeyed = effectively permanent. */
export const EXCHANGE_STATUS_DURATION: Record<string, number> = {
  THUNDERLANCE: 2400, // 20s at 120fps
};

/** Default duration for generated exchange events (effectively permanent). */
export const EXCHANGE_EVENT_DURATION = TOTAL_FRAMES * 10;

/** Source information for event status changes (consumed/refreshed). */
export interface StatusSource {
  ownerId: string;
  skillName?: string;
}

/** Resolves per-level susceptibility array to a scalar using the source operator's skill level. */
export function resolveSusceptibility(
  raw: Partial<Record<ElementType, readonly number[]>>,
  sourceColumnId: string,
  sourceOwnerId: string,
  loadoutStats?: Record<string, LoadoutStats>,
): Partial<Record<ElementType, number>> {
  const stats = loadoutStats?.[sourceOwnerId] ?? DEFAULT_LOADOUT_STATS;
  const skillType = sourceColumnId as SkillType;
  let skillLevel: number;
  switch (skillType) {
    case 'combo': skillLevel = stats.comboSkillLevel; break;
    case 'ultimate': skillLevel = stats.ultimateLevel; break;
    default: skillLevel = stats.battleSkillLevel; break;
  }
  const idx = Math.max(0, Math.min(skillLevel - 1, MAX_SKILL_LEVEL_INDEX));
  const resolved: Partial<Record<ElementType, number>> = {};
  for (const [element, table] of Object.entries(raw)) {
    // Normalize key to uppercase to match ElementType enum values
    const normalizedKey = element.toUpperCase() as ElementType;
    resolved[normalizedKey] = table[Math.min(idx, table.length - 1)];
  }
  return resolved;
}

/**
 * Scans sequenced operator events for frames with `applyArtsInfliction` markers
 * and generates corresponding enemy infliction events at the correct absolute frame.
 */
export function deriveFrameInflictions(events: TimelineEvent[], loadoutStats?: Record<string, LoadoutStats>, stops: readonly TimeStopRegion[] = []): TimelineEvent[] {
  const derived: TimelineEvent[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === ENEMY_OWNER_ID) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

          if (frame.applyArtsInfliction) {
            const columnId = ELEMENT_TO_INFLICTION_COLUMN[frame.applyArtsInfliction.element];
            // Skip if this combo event's trigger column already handles this element
            // (the comboTriggerColumnId loop below generates those)
            if (columnId && columnId !== event.comboTriggerColumnId) {
              derived.push({
                id: `${event.id}-inflict-${si}-${fi}`,
                name: columnId,
                ownerId: ENEMY_OWNER_ID,
                columnId,
                startFrame: absFrame,
                activationDuration: INFLICTION_DURATION,
                activeDuration: 0,
                cooldownDuration: 0,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
              });
            }
          }

          // Status applied by this frame (self or enemy target)
          const statusEffects = frame.applyStatuses ?? (frame.applyStatus ? [frame.applyStatus] : []);
          for (let sti = 0; sti < statusEffects.length; sti++) {
            const statusEffect = statusEffects[sti];

            // Potential gating: resolve from loadout stats via source operator's slot ID
            const pot = loadoutStats?.[event.ownerId]?.potential ?? 0;
            if (statusEffect.potentialMin != null && pot < statusEffect.potentialMin) continue;
            if (statusEffect.potentialMax != null && pot > statusEffect.potentialMax) continue;

            if (statusEffect.target === TargetType.SELF) {
              // Exchange statuses (Melting Flame, Thunderlance) are handled by
              // deriveStatusesFromEngine — skip frame-level creation to avoid
              // blocking the engine's dedup check (which would prevent final
              // strike absorption and threshold/consumption logic from running).
              const grantColumnId = EXCHANGE_STATUS_COLUMN[statusEffect.status];
              if (grantColumnId) {
                // no-op: engine handles stacking, max cap, consumption, thresholds
              }
              // Team status (e.g. Squad Buff → Link)
              const teamColumnId = TEAM_STATUS_COLUMN[statusEffect.status];
              if (teamColumnId) {
                // Link duration = remaining ultimate active phase from grant frame
                const ultActiveEnd = event.startFrame + event.activationDuration + event.activeDuration;
                let linkDuration = Math.max(0, ultActiveEnd - absFrame);
                // P5: extend link buff duration beyond ultimate active phase
                if (pot >= 5) {
                  linkDuration += P5_LINK_EXTENSION_FRAMES;
                }
                derived.push({
                  id: `${event.id}-team-status-${si}-${fi}`,
                  name: 'Squad Buff (Link)',
                  ownerId: COMMON_OWNER_ID,
                  columnId: teamColumnId,
                  startFrame: absFrame,
                  activationDuration: linkDuration,
                  activeDuration: 0,
                  cooldownDuration: 0,
                  sourceOwnerId: event.ownerId,
                  sourceSkillName: event.name,
                });
              }
            } else if (statusEffect.target === TargetType.ENEMY) {
              // RESET stacking: clamp all active instances on the same column
              if (statusEffect.stackingInteraction === 'RESET') {
                for (let di = derived.length - 1; di >= 0; di--) {
                  const prev = derived[di];
                  if (prev.columnId !== statusEffect.status || prev.ownerId !== ENEMY_OWNER_ID) continue;
                  const prevEnd = prev.startFrame + prev.activationDuration;
                  if (absFrame < prevEnd) {
                    derived[di] = {
                      ...prev,
                      activationDuration: absFrame - prev.startFrame,
                      eventStatus: EventStatusType.REFRESHED,
                      eventStatusOwnerId: event.ownerId,
                      eventStatusSkillName: event.name,
                    };
                  }
                }
              }

              // Build segments with per-segment susceptibility if present
              let segments: import('../../consts/viewTypes').EventSegmentData[] | undefined;
              let susceptibility: Partial<Record<ElementType, number>> | undefined;

              if (statusEffect.segments && statusEffect.segments.length > 0) {
                segments = statusEffect.segments.map(seg => ({
                  durationFrames: seg.durationFrames,
                  label: seg.name,
                  ...(seg.susceptibility && {
                    susceptibility: resolveSusceptibility(seg.susceptibility, event.columnId, event.ownerId, loadoutStats),
                  }),
                }));
                // Use the first segment's susceptibility as the event-level default
                const firstSeg = statusEffect.segments[0];
                if (firstSeg.susceptibility) {
                  susceptibility = resolveSusceptibility(firstSeg.susceptibility, event.columnId, event.ownerId, loadoutStats);
                }
              } else if (statusEffect.susceptibility) {
                susceptibility = resolveSusceptibility(statusEffect.susceptibility, event.columnId, event.ownerId, loadoutStats);
              }

              // Enemy-targeted status (e.g. Focus → Susceptibility column)
              derived.push({
                id: `${event.id}-status-${si}-${fi}-${sti}`,
                name: statusEffect.eventName ?? statusEffect.status,
                ownerId: ENEMY_OWNER_ID,
                columnId: statusEffect.status,
                startFrame: absFrame,
                activationDuration: statusEffect.durationFrames,
                activeDuration: 0,
                cooldownDuration: 0,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                ...(susceptibility && { susceptibility }),
                ...(segments && { segments }),
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
                ownerId: ENEMY_OWNER_ID,
                columnId: reactionColumnId,
                startFrame: absFrame,
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
              startFrame: absFrame,
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

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);
          const triggerCol = event.comboTriggerColumnId;

          if (INFLICTION_COLUMN_IDS.has(triggerCol)) {
            // Arts infliction: generate infliction event
            derived.push({
              id: `${event.id}-combo-inflict-${si}-${fi}`,
              name: triggerCol,
              ownerId: ENEMY_OWNER_ID,
              columnId: triggerCol,
              startFrame: absFrame,
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
              ownerId: ENEMY_OWNER_ID,
              columnId: triggerCol,
              startFrame: absFrame,
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

  // Endministrator: combo skill (Sealing Sequence) attaches Originium Crystals to enemy.
  // Crystals persist until consumed by battle skill (Constructive Sequence) or ultimate (Bombardment Sequence).
  for (const event of events) {
    if (event.ownerId === ENEMY_OWNER_ID) continue;
    if (event.name !== CombatSkillsType.SEALING_SEQUENCE) continue;
    // Generate a crystal event at the combo skill's start frame
    derived.push({
      id: `${event.id}-crystal`,
      name: StatusType.ORIGINIUM_CRYSTAL,
      ownerId: ENEMY_OWNER_ID,
      columnId: OPERATOR_COLUMNS.ORIGINIUM_CRYSTAL,
      startFrame: event.startFrame,
      activationDuration: EXCHANGE_EVENT_DURATION,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: event.ownerId,
      sourceSkillName: event.name,
    });
  }

  // Perfect dodge dash events → SP recovery (7.5 SP)
  for (const event of events) {
    if (event.columnId === OPERATOR_COLUMNS.DASH && event.isPerfectDodge) {
      derived.push({
        id: `${event.id}-sp-dodge`,
        name: 'sp-recovery',
        ownerId: COMMON_OWNER_ID,
        columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
        startFrame: event.startFrame,
        activationDuration: -7.5,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: event.ownerId,
        sourceSkillName: event.name,
      });
    }
  }

  if (derived.length === 0) return events;
  return [...events, ...derived];
}

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
export function applyAbsorptions(events: TimelineEvent[], stops: readonly TimeStopRegion[]): TimelineEvent[] {
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

  // Collect consumeStatus points that target exchange statuses (e.g. Smouldering Fire
  // consuming Melting Flame). These free up exchange slots BEFORE absorptions that fire
  // after the consumption frame, so we must track them within this function rather than
  // relying on the later consumeOperatorStatuses pass.
  type ExchangeConsumePoint = { absoluteFrame: number; ownerId: string; exchangeColumnId: string; source: StatusSource };
  const exchangeConsumePoints: ExchangeConsumePoint[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === ENEMY_OWNER_ID) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          if (frame.absorbArtsInfliction) {
            absorptions.push({
              absoluteFrame: absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops),
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
              absoluteFrame: absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops),
              element: frame.consumeArtsInfliction.element,
              stacks: frame.consumeArtsInfliction.stacks,
              source: { ownerId: event.ownerId, skillName: event.name },
            });
          }
          if (frame.consumeStatus) {
            const exchCol = EXCHANGE_STATUS_COLUMN[frame.consumeStatus];
            if (exchCol) {
              exchangeConsumePoints.push({
                absoluteFrame: absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops),
                ownerId: event.ownerId,
                exchangeColumnId: exchCol,
                source: { ownerId: event.ownerId, skillName: event.name },
              });
            }
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

  // Pre-compute exchange status consumption: clamp exchange events at their
  // consumption frame so that active-slot counting sees freed slots.
  exchangeConsumePoints.sort((a, b) => a.absoluteFrame - b.absoluteFrame);
  const exchangeClampMap = new Map<string, number>(); // exchange event id → clamp frame
  for (const cp of exchangeConsumePoints) {
    for (const ev of events) {
      if (ev.ownerId !== cp.ownerId || ev.columnId !== cp.exchangeColumnId) continue;
      if (exchangeClampMap.has(ev.id)) continue;
      const endFrame = ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      if (ev.startFrame <= cp.absoluteFrame && endFrame > cp.absoluteFrame) {
        exchangeClampMap.set(ev.id, cp.absoluteFrame);
      }
    }
  }

  for (const absorption of absorptions) {
    const { absoluteFrame, ownerId, marker } = absorption;
    const inflictionColumnId = ELEMENT_TO_INFLICTION_COLUMN[marker.element];
    const exchangeColumnId = EXCHANGE_STATUS_COLUMN[marker.exchangeStatus];
    const maxSlots = EXCHANGE_STATUS_MAX_SLOTS[marker.exchangeStatus] ?? 4;

    if (!inflictionColumnId || !exchangeColumnId) continue;

    // Find active enemy infliction events of the matching element at this frame.
    // Durations are already extended by applyTimeStopExtension at this point.
    const activeInflictions: TimelineEvent[] = [];
    for (const ev of events) {
      if (ev.ownerId !== ENEMY_OWNER_ID || ev.columnId !== inflictionColumnId) continue;
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

    // Count active exchange status events for this operator at this frame.
    // Use exchangeClampMap to account for exchange events consumed by skills
    // (e.g. Smouldering Fire consuming Melting Flame) that fire before this frame.
    let activeExchangeCount = 0;
    for (const ev of [...events, ...generated]) {
      if (ev.ownerId !== ownerId || ev.columnId !== exchangeColumnId) continue;
      if (removedIds.has(ev.id)) continue;

      const exchClamp = exchangeClampMap.get(ev.id);
      const inflClamp = clampMap.get(ev.id);
      const endFrame = exchClamp !== undefined
        ? exchClamp
        : inflClamp !== undefined
          ? inflClamp.frame
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

    // Generate exchange status events and check if any consumeStatus point
    // would consume them (so later absorptions see the freed slots).
    for (let i = 0; i < stacksToConsume; i++) {
      const genId = `${absorption.eventId}-absorb-${absorption.segmentIndex}-${absorption.frameIndex}-${i}`;
      const genEvent: TimelineEvent = {
        id: genId,
        name: marker.exchangeStatus,
        ownerId,
        columnId: exchangeColumnId,
        startFrame: absoluteFrame,
        activationDuration: EXCHANGE_EVENT_DURATION,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: ownerId,
        sourceSkillName: absorption.eventName,
      };
      generated.push(genEvent);

      // Check if a consumeStatus point clamps this generated event
      for (const cp of exchangeConsumePoints) {
        if (cp.ownerId !== ownerId || cp.exchangeColumnId !== exchangeColumnId) continue;
        if (exchangeClampMap.has(genId)) continue;
        const endFrame = absoluteFrame + EXCHANGE_EVENT_DURATION;
        if (absoluteFrame <= cp.absoluteFrame && endFrame > cp.absoluteFrame) {
          exchangeClampMap.set(genId, cp.absoluteFrame);
        }
      }
    }
  }

  // Process consumptions: clamp inflictions without generating exchange events
  consumptions.sort((a, b) => a.absoluteFrame - b.absoluteFrame);
  for (const consumption of consumptions) {
    const inflictionColumnId = ELEMENT_TO_INFLICTION_COLUMN[consumption.element];
    if (!inflictionColumnId) continue;

    const activeInflictions: TimelineEvent[] = [];
    for (const ev of events) {
      if (ev.ownerId !== ENEMY_OWNER_ID || ev.columnId !== inflictionColumnId) continue;
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
      const clampedActiveDur = Math.min(ev.activeDuration, remAfterActive);
      const remAfterActiveDur = remAfterActive - clampedActiveDur;
      const clampedCooldown = Math.min(ev.cooldownDuration, remAfterActiveDur);
      result.push({
        ...ev,
        activationDuration: clampedActive,
        activeDuration: clampedActiveDur,
        cooldownDuration: clampedCooldown,
        eventStatus: EventStatusType.CONSUMED,
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
export function deriveReactions(events: TimelineEvent[]): TimelineEvent[] {
  // Collect all enemy infliction events, sorted by start frame
  const inflictions = events
    .filter((ev) => ev.ownerId === ENEMY_OWNER_ID && INFLICTION_COLUMN_IDS.has(ev.columnId))
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
    // Skip inflictions already consumed by absorption — they shouldn't trigger reactions
    if (incoming.eventStatus === EventStatusType.CONSUMED) continue;

    // Find active inflictions of a DIFFERENT element at incoming's start frame
    const activeOther: TimelineEvent[] = [];
    for (let j = 0; j < i; j++) {
      const prev = inflictions[j];
      if (removedIds.has(prev.id)) continue;
      if (prev.columnId === incoming.columnId) continue;
      // Skip inflictions already consumed by absorption — they shouldn't trigger reactions
      if (prev.eventStatus === EventStatusType.CONSUMED) continue;

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
        ownerId: ENEMY_OWNER_ID,
        columnId: reactionColumnId,
        startFrame: incoming.startFrame,
        activationDuration: REACTION_DURATION,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: incoming.sourceOwnerId,
        sourceSkillName: incoming.sourceSkillName,
        inflictionStacks: activeOther.length,
      });

      // Remove the triggering infliction
      removedIds.add(incoming.id);

      // Clamp all active other-element inflictions at the reaction frame
      const reactionSource: StatusSource = { ownerId: incoming.sourceOwnerId ?? ENEMY_OWNER_ID, skillName: incoming.sourceSkillName };
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
      const clampedActiveDur = Math.min(ev.activeDuration, remAfterActive);
      const remAfterActiveDur = remAfterActive - clampedActiveDur;
      const clampedCooldown = Math.min(ev.cooldownDuration, remAfterActiveDur);
      result.push({
        ...ev,
        activationDuration: clampedActive,
        activeDuration: clampedActiveDur,
        cooldownDuration: clampedCooldown,
        eventStatus: EventStatusType.CONSUMED,
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
export function mergeReactions(events: TimelineEvent[]): TimelineEvent[] {
  const reactionsByType = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID && REACTION_COLUMN_IDS.has(ev.columnId)) {
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
          source: { ownerId: next.sourceOwnerId ?? ENEMY_OWNER_ID, skillName: next.sourceSkillName },
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
      eventStatus: EventStatusType.REFRESHED,
      eventStatusOwnerId: clamp.source.ownerId,
      eventStatusSkillName: clamp.source.skillName,
    } : ev;
  });
}

/**
 * Processes same-element infliction stacking:
 * Each event's activationDuration is extended to the latest end frame
 * reachable through a chain of overlapping subsequent same-element stacks.
 * This models the game mechanic where applying a new infliction refreshes
 * the timer on all existing stacks of the same element.
 */
export function applySameElementRefresh(events: TimelineEvent[]): TimelineEvent[] {
  const inflictionsByColumn = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID && INFLICTION_COLUMN_IDS.has(ev.columnId)) {
      const group = inflictionsByColumn.get(ev.columnId) ?? [];
      group.push(ev);
      inflictionsByColumn.set(ev.columnId, group);
    }
  }

  if (inflictionsByColumn.size === 0) return events;

  const processedMap = new Map<string, TimelineEvent>();

  inflictionsByColumn.forEach((group) => {
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);

    // Each earlier stack extends to the next stack's end time (backward pass
    // so later extensions propagate). This models the game mechanic where
    // applying a new same-element infliction refreshes all existing stacks.
    const extendedActive: number[] = sorted.map((ev) => ev.activationDuration);
    for (let i = sorted.length - 2; i >= 0; i--) {
      const nextEnd = sorted[i + 1].startFrame + extendedActive[i + 1];
      const currentEnd = sorted[i].startFrame + extendedActive[i];
      if (nextEnd > currentEnd) {
        extendedActive[i] = nextEnd - sorted[i].startFrame;
      }
    }

    // Apply extensions — mark with 'extended' status and attribute to the
    // next stack that caused the refresh.
    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      if (extendedActive[i] !== ev.activationDuration) {
        const next = sorted[i + 1];
        processedMap.set(ev.id, {
          ...ev,
          activationDuration: extendedActive[i],
          eventStatus: EventStatusType.EXTENDED,
          eventStatusOwnerId: next.sourceOwnerId,
          eventStatusSkillName: next.sourceSkillName,
        });
      }
    }
  });

  if (processedMap.size === 0) return events;
  return events.map((ev) => processedMap.get(ev.id) ?? ev);
}

/**
 * Processes physical infliction (Vulnerable) stacking with the same
 * refresh logic as arts inflictions.
 */
export function applyPhysicalInflictionRefresh(events: TimelineEvent[]): TimelineEvent[] {
  const physInflictionsByColumn = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID && PHYSICAL_INFLICTION_COLUMN_IDS.has(ev.columnId)) {
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

    const extendedActive: number[] = sorted.map((ev) => ev.activationDuration);
    for (let i = sorted.length - 2; i >= 0; i--) {
      const nextEnd = sorted[i + 1].startFrame + extendedActive[i + 1];
      const currentEnd = sorted[i].startFrame + extendedActive[i];
      if (nextEnd > currentEnd) {
        extendedActive[i] = nextEnd - sorted[i].startFrame;
      }
    }

    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      if (extendedActive[i] !== ev.activationDuration) {
        const next = sorted[i + 1];
        processedMap.set(ev.id, {
          ...ev,
          activationDuration: extendedActive[i],
          eventStatus: EventStatusType.EXTENDED,
          eventStatusOwnerId: next.sourceOwnerId,
          eventStatusSkillName: next.sourceSkillName,
        });
      }
    }
  });

  if (processedMap.size === 0) return events;
  return events.map((ev) => processedMap.get(ev.id) ?? ev);
}

// ── Reaction frame attachment ─────────────────────────────────────────────

const COMBUSTION_TICK_COUNT = 10; // 1 per second for 10 seconds

/** Maps reaction columnId → damage element. */
const REACTION_DAMAGE_ELEMENT: Record<string, ElementType> = {
  combustion:      ElementType.HEAT,
  solidification:  ElementType.CRYO,
  corrosion:       ElementType.NATURE,
  electrification: ElementType.ELECTRIC,
};

/**
 * Attach damage frame markers to arts reaction events.
 *
 * - Combustion: initial hit + DoT ticks at 1-second intervals
 * - Solidification: initial hit + shatter at end
 * - Corrosion: initial hit only (resistance reduction is a debuff)
 * - Electrification: initial hit only (fragility is a debuff)
 *
 * Forced reactions skip the initial hit frame.
 * Call before time-stop extension so frame positions get adjusted.
 */
export function attachReactionFrames(events: TimelineEvent[]): TimelineEvent[] {
  return events.map((ev) => {
    if (ev.ownerId !== ENEMY_OWNER_ID || !REACTION_COLUMN_IDS.has(ev.columnId)) return ev;
    if (ev.segments) return ev; // already has frames

    const segment = buildReactionSegment(ev);
    if (!segment) return ev;
    return { ...ev, segments: [segment] };
  });
}

/** Label lookup for reaction segments. */
const REACTION_SEGMENT_LABEL: Record<string, string> = {
  combustion:      'Combustion',
  solidification:  'Solidification',
  corrosion:       'Corrosion',
  electrification: 'Electrification',
};

function buildReactionSegment(ev: TimelineEvent): { durationFrames: number; label: string; frames: EventFrameMarker[] } | null {
  const element = REACTION_DAMAGE_ELEMENT[ev.columnId];
  if (!element) return null;

  const forced = ev.isForced || ev.forcedReaction;
  const frames: EventFrameMarker[] = [];

  // Initial reaction hit at frame 0 (skipped for forced reactions)
  if (!forced) {
    frames.push({ offsetFrame: 0, damageElement: element });
  }

  const COMBUSTION_FRAME_TYPES = [EventFrameType.GUARANTEED_HIT, EventFrameType.DAMAGE_OVER_TIME, EventFrameType.PASSIVE];
  if (ev.columnId === REACTION_COLUMNS.COMBUSTION) {
    // Initial hit also gets combustion frame types
    if (frames.length > 0) frames[0].frameTypes = COMBUSTION_FRAME_TYPES;
    // DoT ticks at 1-second intervals
    for (let i = 1; i <= COMBUSTION_TICK_COUNT; i++) {
      const tickOffset = i * FPS;
      if (tickOffset > ev.activationDuration) break;
      frames.push({ offsetFrame: tickOffset, damageElement: element, frameTypes: COMBUSTION_FRAME_TYPES });
    }
  } else if (ev.columnId === REACTION_COLUMNS.SOLIDIFICATION) {
    // Shatter at the end of the duration
    frames.push({ offsetFrame: ev.activationDuration, damageElement: element });
  } else if (ev.columnId === REACTION_COLUMNS.CORROSION) {
    // Status frames at 1-second intervals showing resistance reduction ramp
    // Base reduction (without Arts Intensity scaling) for visual reference
    const stacks = ev.inflictionStacks ?? 1;
    const statusLevel = Math.min(stacks, 4) as StatusLevel;
    const durationSeconds = Math.floor(ev.activationDuration / FPS);
    for (let i = 1; i <= durationSeconds; i++) {
      const tickOffset = i * FPS;
      if (tickOffset > ev.activationDuration) break;
      const baseReduction = getCorrosionBaseReduction(statusLevel, i);
      frames.push({
        offsetFrame: tickOffset,
        damageElement: element,
        statusLabel: `-${baseReduction.toFixed(1)} Res`,
      });
    }
  }
  // Electrification: initial hit only (no additional frames)

  return {
    durationFrames: ev.activationDuration,
    label: REACTION_SEGMENT_LABEL[ev.columnId] ?? ev.columnId,
    frames,
  };
}

// ── Susceptibility frame attachment ───────────────────────────────────────

/**
 * Attaches susceptibility frame markers to status events.
 * Now a no-op for Focus (P5 uses data-driven segments instead).
 * Retained for other status types that may need frame markers in the future.
 */
export function attachSusceptibilityFrames(
  events: TimelineEvent[],
  _loadoutStats?: Record<string, LoadoutStats>,
): TimelineEvent[] {
  return events;
}

// ── Consume reaction → apply status ────────────────────────────────────────

/**
 * Scans operator events for `consumeReaction` frame markers.
 * If a matching reaction is active on the enemy, clamps it and optionally
 * generates a susceptibility event (e.g. Dolly Rush consuming Corrosion).
 */
export function consumeReactionsForStatus(
  events: TimelineEvent[],
  loadoutStats: Record<string, LoadoutStats> | undefined,
  stops: readonly TimeStopRegion[],
): TimelineEvent[] {
  type ConsumePoint = {
    absoluteFrame: number;
    reactionColumnId: string;
    applyStatus?: { target: string; status: string; stacks: number; durationFrames: number; susceptibility?: Partial<Record<ElementType, readonly number[]>>; eventName?: string };
    sourceOwnerId: string;
    sourceSkillName: string;
    sourceColumnId: string;
  };

  const consumePoints: ConsumePoint[] = [];
  for (const event of events) {
    if (!event.segments || event.ownerId === ENEMY_OWNER_ID) continue;
    const fStops = foreignStopsFor(event, stops);
    let cumOffset = 0;
    for (const seg of event.segments) {
      if (seg.frames) {
        for (const frame of seg.frames) {
          if (frame.consumeReaction) {
            consumePoints.push({
              absoluteFrame: absoluteFrame(event.startFrame, cumOffset, frame.offsetFrame, fStops),
              reactionColumnId: frame.consumeReaction.columnId,
              applyStatus: frame.consumeReaction.applyStatus,
              sourceOwnerId: event.ownerId,
              sourceSkillName: event.name,
              sourceColumnId: event.columnId,
            });
          }
        }
      }
      cumOffset += seg.durationFrames;
    }
  }
  if (consumePoints.length === 0) return events;

  consumePoints.sort((a, b) => a.absoluteFrame - b.absoluteFrame);
  const clampMap = new Map<string, { frame: number; source: StatusSource }>();
  const generated: TimelineEvent[] = [];

  for (const cp of consumePoints) {
    let consumed: TimelineEvent | null = null;
    for (const ev of events) {
      if (ev.ownerId !== ENEMY_OWNER_ID || ev.columnId !== cp.reactionColumnId) continue;
      const clamp = clampMap.get(ev.id);
      const end = clamp ? clamp.frame : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      if (ev.startFrame <= cp.absoluteFrame && end > cp.absoluteFrame) { consumed = ev; break; }
    }
    if (!consumed) continue;

    clampMap.set(consumed.id, { frame: cp.absoluteFrame, source: { ownerId: cp.sourceOwnerId, skillName: cp.sourceSkillName } });

    if (cp.applyStatus && cp.applyStatus.target === TargetType.ENEMY) {
      let resolvedSusc = cp.applyStatus.susceptibility
        ? resolveSusceptibility(cp.applyStatus.susceptibility, cp.sourceColumnId, cp.sourceOwnerId, loadoutStats)
        : undefined;
      // Ardelia P1 — Dolly Paradise: +8% Physical and Arts Susceptibility when consuming Corrosion
      if (resolvedSusc && cp.sourceSkillName === CombatSkillsType.DOLLY_RUSH) {
        const pot = loadoutStats?.[cp.sourceOwnerId]?.potential ?? 0;
        if (pot >= 1) {
          resolvedSusc = { ...resolvedSusc };
          for (const el of Object.keys(resolvedSusc) as ElementType[]) {
            resolvedSusc[el] = (resolvedSusc[el] ?? 0) + 0.08;
          }
        }
      }
      generated.push({
        id: `${consumed.id}-consume-susc`,
        name: cp.applyStatus.eventName ?? cp.applyStatus.status,
        ownerId: ENEMY_OWNER_ID,
        columnId: cp.applyStatus.status,
        startFrame: cp.absoluteFrame,
        activationDuration: cp.applyStatus.durationFrames,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: cp.sourceOwnerId,
        sourceSkillName: cp.sourceSkillName,
        ...(resolvedSusc && { susceptibility: resolvedSusc }),
      });
    }
  }

  if (clampMap.size === 0 && generated.length === 0) return events;

  const result: TimelineEvent[] = [];
  for (const ev of events) {
    const clamp = clampMap.get(ev.id);
    if (clamp) {
      const avail = Math.max(0, clamp.frame - ev.startFrame);
      result.push({
        ...ev,
        activationDuration: Math.min(ev.activationDuration, avail),
        activeDuration: Math.min(ev.activeDuration, Math.max(0, avail - ev.activationDuration)),
        cooldownDuration: Math.min(ev.cooldownDuration, Math.max(0, avail - ev.activationDuration - ev.activeDuration)),
        eventStatus: EventStatusType.CONSUMED,
        eventStatusOwnerId: clamp.source.ownerId,
        eventStatusSkillName: clamp.source.skillName,
      });
    } else {
      result.push(ev);
    }
  }
  return [...result, ...generated];
}
