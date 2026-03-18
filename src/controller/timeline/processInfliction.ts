import { TimelineEvent, EventFrameMarker, EventSegmentData, FrameAbsorptionMarker, SkillType } from '../../consts/viewTypes';
import { LoadoutProperties, DEFAULT_LOADOUT_PROPERTIES } from '../../view/InformationPane';
import { CombatSkillsType, ElementType, EventFrameType, EventStatusType, StatusType, TargetType } from '../../consts/enums';
import { TimeStopRegion, absoluteFrame, foreignStopsFor } from './processTimeStop';
import { StatusLevel } from '../../consts/types';
import { getCorrosionBaseReduction, getCorrosionReductionMultiplier } from '../../model/calculation/damageFormulas';
import { ENEMY_OWNER_ID, INFLICTION_COLUMN_IDS, INFLICTION_TO_REACTION, OPERATOR_COLUMNS, REACTION_COLUMN_IDS, REACTION_COLUMNS, PHYSICAL_INFLICTION_COLUMN_IDS } from '../../model/channels';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
import { evaluateConditions } from './conditionEvaluator';
import type { Interaction } from '../../consts/semantics';

/** Maximum 0-based index for skill level arrays (12 levels → index 0–11). */
const MAX_SKILL_LEVEL_INDEX = 11;

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

/** Maximum concurrent stacks of the same element infliction (arts or physical). */
const MAX_INFLICTION_STACKS = 4;

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
  loadoutProperties?: Record<string, LoadoutProperties>,
): Partial<Record<ElementType, number>> {
  const stats = loadoutProperties?.[sourceOwnerId] ?? DEFAULT_LOADOUT_PROPERTIES;
  const skillType = sourceColumnId as SkillType;
  let skillLevel: number;
  switch (skillType) {
    case 'combo': skillLevel = stats.skills.comboSkillLevel; break;
    case 'ultimate': skillLevel = stats.skills.ultimateLevel; break;
    default: skillLevel = stats.skills.battleSkillLevel; break;
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
export function deriveFrameInflictions(events: TimelineEvent[], loadoutProperties?: Record<string, LoadoutProperties>, stops: readonly TimeStopRegion[] = [], skipExchangeStatuses = false, skipInflictions = false): TimelineEvent[] {
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

          // Arts inflictions — when skipInflictions is true, these are handled
          // by the event queue with deque stacking semantics.
          if (frame.applyArtsInfliction && !skipInflictions) {
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
            const pot = loadoutProperties?.[event.ownerId]?.operator.potential ?? 0;
            if (statusEffect.potentialMin != null && pot < statusEffect.potentialMin) continue;
            if (statusEffect.potentialMax != null && pot > statusEffect.potentialMax) continue;

            if (statusEffect.target === TargetType.SELF) {
              // Exchange statuses (Melting Flame, Thunderlance) — when
              // skipExchangeStatuses is true, these are handled exclusively
              // by the status derivation engine which enforces max-stack caps
              // and correct consumption/re-derivation ordering.
              const grantColumnId = EXCHANGE_STATUS_COLUMN[statusEffect.status];
              if (grantColumnId) {
                if (!skipExchangeStatuses) {
                  const exchDuration = EXCHANGE_STATUS_DURATION[statusEffect.status] ?? EXCHANGE_EVENT_DURATION;
                  derived.push({
                    id: `${event.id}-exchange-${si}-${fi}`,
                    name: statusEffect.status,
                    ownerId: event.ownerId,
                    columnId: grantColumnId,
                    startFrame: absFrame,
                    activationDuration: exchDuration,
                    activeDuration: 0,
                    cooldownDuration: 0,
                    sourceOwnerId: event.ownerId,
                    sourceSkillName: event.name,
                  });
                }
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
                    susceptibility: resolveSusceptibility(seg.susceptibility, event.columnId, event.ownerId, loadoutProperties),
                  }),
                }));
                // Use the first segment's susceptibility as the event-level default
                const firstSeg = statusEffect.segments[0];
                if (firstSeg.susceptibility) {
                  susceptibility = resolveSusceptibility(firstSeg.susceptibility, event.columnId, event.ownerId, loadoutProperties);
                }
              } else if (statusEffect.susceptibility) {
                susceptibility = resolveSusceptibility(statusEffect.susceptibility, event.columnId, event.ownerId, loadoutProperties);
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
  // matching the trigger source at each tick frame.
  // When skipInflictions is true, inflictions are handled by the event queue.
  if (!skipInflictions) {
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

  // Perfect dodge dash events → SP recovery
  for (const event of events) {
    if (event.columnId === OPERATOR_COLUMNS.DASH && event.isPerfectDodge) {
      derived.push({
        id: `${event.id}-sp-dodge`,
        name: 'sp-recovery',
        ownerId: COMMON_OWNER_ID,
        columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
        startFrame: event.startFrame,
        activationDuration: -GENERAL_MECHANICS.skillPoints.perfectDodgeRecovery,
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
 * Derive mirrored inflictions from combo events that have a resolved comboTriggerColumnId.
 * This is the same logic as the combo mirroring loop in deriveFrameInflictions, but
 * extracted so it can be run independently after a late resolveComboTriggerColumns pass.
 */
export function deriveComboMirroredInflictions(events: TimelineEvent[], stops: readonly TimeStopRegion[] = []): TimelineEvent[] {
  const derived: TimelineEvent[] = [];
  const existingIds = new Set(events.map((e) => e.id));

  for (const event of events) {
    if (!event.comboTriggerColumnId || !event.segments) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const triggerCol = event.comboTriggerColumnId;
          const inflictId = `${event.id}-combo-inflict-${si}-${fi}`;
          const physId = `${event.id}-combo-phys-${si}-${fi}`;

          // Skip if already derived in an earlier pass
          if (existingIds.has(inflictId) || existingIds.has(physId)) continue;

          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

          if (INFLICTION_COLUMN_IDS.has(triggerCol)) {
            derived.push({
              id: inflictId,
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
            derived.push({
              id: physId,
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

    const stacksToConsume = Math.min(activeInflictions.length, marker.stacks);
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
 * Merges overlapping same-type arts reaction events.
 *
 * **Corrosion** uses merge semantics: when a newer corrosion overlaps an
 * active older one, the older is clamped at the merge point and the newer
 * inherits max(statusLevel) and extends its duration if the older would
 * have lasted longer.
 *
 * **Other reactions** use refresh semantics: the older event is clamped
 * when the newer one would outlast it.
 *
 * Segment arrays are rebuilt after merge/clamp to reflect new durations.
 */
export function mergeReactions(events: TimelineEvent[]): TimelineEvent[] {
  const reactionsByType = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID && REACTION_COLUMN_IDS.has(ev.columnId)
      && !ev.eventStatus) { // Skip already-processed (refreshed/consumed) events
      const group = reactionsByType.get(ev.columnId) ?? [];
      group.push(ev);
      reactionsByType.set(ev.columnId, group);
    }
  }

  if (reactionsByType.size === 0) return events;

  const clampMap = new Map<string, { duration: number; source: StatusSource }>();
  const mergeMap = new Map<string, { activationDuration: number; statusLevel: number; inflictionStacks: number; reductionFloor?: number }>();

  reactionsByType.forEach((group, columnId) => {
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);

    if (columnId === REACTION_COLUMNS.CORROSION) {
      // Corrosion merge: newer absorbs older's stats and remaining duration
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const currentDur = mergeMap.get(current.id)?.activationDuration ?? current.activationDuration;
        const currentEnd = current.startFrame + currentDur;
        const next = sorted[i + 1];

        if (next.startFrame >= currentEnd) continue;

        clampMap.set(current.id, {
          duration: Math.max(0, next.startFrame - current.startFrame),
          source: { ownerId: next.sourceOwnerId ?? ENEMY_OWNER_ID, skillName: next.sourceSkillName },
        });

        const currentStatusLevel = mergeMap.get(current.id)?.statusLevel ?? current.statusLevel ?? 1;
        const nextStatusLevel = next.statusLevel ?? 1;
        const currentStacks = mergeMap.get(current.id)?.inflictionStacks ?? current.inflictionStacks ?? 1;
        const nextStacks = next.inflictionStacks ?? 1;

        const remainingOldDuration = currentEnd - next.startFrame;
        const newDuration = next.activationDuration;

        // Compute the old corrosion's reduction at the merge point (with arts intensity)
        const elapsedSeconds = (next.startFrame - current.startFrame) / FPS;
        const oldReductionFloor = mergeMap.get(current.id)?.reductionFloor ?? 0;
        const oldArtsIntensity = current.artsIntensity ?? 0;
        const oldBaseReduction = getCorrosionBaseReduction(
          Math.min(currentStatusLevel, 4) as StatusLevel,
          elapsedSeconds,
        ) * getCorrosionReductionMultiplier(oldArtsIntensity);
        const currentReduction = Math.max(oldReductionFloor, oldBaseReduction);

        mergeMap.set(next.id, {
          activationDuration: Math.max(remainingOldDuration, newDuration),
          statusLevel: Math.max(currentStatusLevel, nextStatusLevel),
          inflictionStacks: Math.max(currentStacks, nextStacks),
          reductionFloor: currentReduction,
        });
      }
    } else {
      // Other reactions: refresh semantics — clamp older, newer inherits max statusLevel
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const currentDur = mergeMap.get(current.id)?.activationDuration ?? current.activationDuration;
        const currentEnd = current.startFrame + currentDur;
        const next = sorted[i + 1];

        if (next.startFrame >= currentEnd) continue;

        // Clamp older event at the point the newer starts
        clampMap.set(current.id, {
          duration: Math.max(0, next.startFrame - current.startFrame),
          source: { ownerId: next.sourceOwnerId ?? ENEMY_OWNER_ID, skillName: next.sourceSkillName },
        });

        // Newer inherits max statusLevel and stacks
        const currentStatusLevel = mergeMap.get(current.id)?.statusLevel ?? current.statusLevel ?? current.inflictionStacks ?? 1;
        const nextStatusLevel = next.statusLevel ?? next.inflictionStacks ?? 1;
        const currentStacks = mergeMap.get(current.id)?.inflictionStacks ?? current.inflictionStacks ?? 1;
        const nextStacks = next.inflictionStacks ?? 1;

        mergeMap.set(next.id, {
          activationDuration: next.activationDuration,
          statusLevel: Math.max(currentStatusLevel, nextStatusLevel),
          inflictionStacks: Math.max(currentStacks, nextStacks),
        });
      }
    }
  });

  if (clampMap.size === 0 && mergeMap.size === 0) return events;

  return events.map((ev) => {
    const clamp = clampMap.get(ev.id);
    const merge = mergeMap.get(ev.id);

    if (clamp !== undefined) {
      // Truncate segments to fit the clamped duration
      const truncated = truncateSegments(ev.segments, clamp.duration);
      return {
        ...ev,
        activationDuration: clamp.duration,
        segments: truncated,
        eventStatus: EventStatusType.REFRESHED,
        eventStatusOwnerId: clamp.source.ownerId,
        eventStatusSkillName: clamp.source.skillName,
      };
    }
    if (merge !== undefined) {
      // Rebuild segments with merged stats (inherited max statusLevel/stacks)
      const merged = {
        ...ev,
        activationDuration: merge.activationDuration,
        statusLevel: merge.statusLevel,
        inflictionStacks: merge.inflictionStacks,
        reductionFloor: merge.reductionFloor,
        segments: undefined as EventSegmentData[] | undefined,
      };
      const [rebuilt] = attachReactionFrames([merged]);
      return rebuilt;
    }
    return ev;
  });
}

/** Truncate a segment array to fit within a new total duration. */
function truncateSegments(
  segments: EventSegmentData[] | undefined,
  newDuration: number,
): EventSegmentData[] | undefined {
  if (!segments || segments.length === 0) return segments;
  const result: EventSegmentData[] = [];
  let remaining = newDuration;
  for (const seg of segments) {
    if (remaining <= 0) break;
    if (seg.durationFrames <= remaining) {
      result.push(seg);
      remaining -= seg.durationFrames;
    } else {
      result.push({ ...seg, durationFrames: remaining });
      remaining = 0;
    }
  }
  return result.length > 0 ? result : undefined;
}

/**
 * Processes same-element infliction stacking using deque semantics:
 *
 * - New infliction: all active stacks are refreshed (extended to new stack's end)
 * - At cap (4): oldest active stack is evicted (clamped at new stack's start),
 *   new stack enters as the 4th
 * - Consumption: FIFO order (oldest first) — handled downstream by applyAbsorptions
 */
export function applySameElementRefresh(events: TimelineEvent[]): TimelineEvent[] {
  return applyInflictionDeque(events, INFLICTION_COLUMN_IDS);
}

/**
 * Processes physical infliction (Vulnerable) stacking with the same
 * deque semantics as arts inflictions (max 4 concurrent stacks).
 */
export function applyPhysicalInflictionRefresh(events: TimelineEvent[]): TimelineEvent[] {
  return applyInflictionDeque(events, PHYSICAL_INFLICTION_COLUMN_IDS);
}

/**
 * Shared deque-based infliction stacking logic for both arts and physical inflictions.
 */
function applyInflictionDeque(events: TimelineEvent[], columnIds: Set<string>): TimelineEvent[] {
  const inflictionsByColumn = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID && columnIds.has(ev.columnId)) {
      const group = inflictionsByColumn.get(ev.columnId) ?? [];
      group.push(ev);
      inflictionsByColumn.set(ev.columnId, group);
    }
  }

  if (inflictionsByColumn.size === 0) return events;

  const processedMap = new Map<string, TimelineEvent>();
  // Evicted stacks are clamped (not removed) — they remain in the output with shortened duration
  const clampMap = new Map<string, { frame: number; sourceOwnerId?: string; sourceSkillName?: string }>();

  inflictionsByColumn.forEach((group) => {
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);

    // Track effective durations (may be extended by later stacks)
    const extendedActive: number[] = sorted.map((ev) => ev.activationDuration);
    // Track which indices have been evicted (clamped at a specific frame)
    const evicted = new Map<number, number>(); // index → clamp frame

    for (let i = 0; i < sorted.length; i++) {
      const incoming = sorted[i];
      const incomingEnd = incoming.startFrame + incoming.activationDuration;

      // Collect active (non-evicted or evicted-but-still-running) stacks at this frame
      const activeIndices: number[] = [];
      for (let j = 0; j < i; j++) {
        const evictFrame = evicted.get(j);
        const jEnd = evictFrame !== undefined
          ? evictFrame
          : sorted[j].startFrame + extendedActive[j];
        if (jEnd > incoming.startFrame) activeIndices.push(j);
      }

      // If at cap, evict the oldest active stack (FIFO)
      if (activeIndices.length >= MAX_INFLICTION_STACKS) {
        const oldestIdx = activeIndices[0]; // earliest startFrame = front of deque
        evicted.set(oldestIdx, incoming.startFrame);
        clampMap.set(sorted[oldestIdx].id, {
          frame: incoming.startFrame,
          sourceOwnerId: incoming.sourceOwnerId,
          sourceSkillName: incoming.sourceSkillName,
        });
        activeIndices.shift();
      }

      // Refresh all remaining active stacks: extend to incoming's end if it's later
      for (const j of activeIndices) {
        if (evicted.has(j)) continue; // evicted stacks don't get refreshed
        const jEnd = sorted[j].startFrame + extendedActive[j];
        if (incomingEnd > jEnd) {
          extendedActive[j] = incomingEnd - sorted[j].startFrame;
        }
      }
    }

    // Backward pass: propagate duration extensions between non-evicted overlapping stacks
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (evicted.has(i)) continue;
      let nextIdx = -1;
      for (let j = i + 1; j < sorted.length; j++) {
        if (!evicted.has(j)) { nextIdx = j; break; }
      }
      if (nextIdx === -1) continue;
      const currentEnd = sorted[i].startFrame + extendedActive[i];
      if (sorted[nextIdx].startFrame > currentEnd) continue;
      const nextEnd = sorted[nextIdx].startFrame + extendedActive[nextIdx];
      if (nextEnd > currentEnd) {
        extendedActive[i] = nextEnd - sorted[i].startFrame;
      }
    }

    // Apply extensions and evictions
    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];

      if (evicted.has(i)) {
        // Evicted: clamp duration to eviction frame
        const evictFrame = evicted.get(i)!;
        const clampedDur = Math.max(0, evictFrame - ev.startFrame);
        if (clampedDur !== ev.activationDuration) {
          const clamp = clampMap.get(ev.id)!;
          processedMap.set(ev.id, {
            ...ev,
            activationDuration: clampedDur,
            activeDuration: 0,
            cooldownDuration: 0,
            eventStatus: EventStatusType.CONSUMED,
            eventStatusOwnerId: clamp.sourceOwnerId,
            eventStatusSkillName: clamp.sourceSkillName,
          });
        }
      } else if (extendedActive[i] !== ev.activationDuration) {
        // Extended: find next non-evicted stack for attribution
        let nextEv: TimelineEvent | undefined;
        for (let j = i + 1; j < sorted.length; j++) {
          if (!evicted.has(j)) { nextEv = sorted[j]; break; }
        }
        processedMap.set(ev.id, {
          ...ev,
          activationDuration: extendedActive[i],
          eventStatus: EventStatusType.EXTENDED,
          eventStatusOwnerId: nextEv?.sourceOwnerId,
          eventStatusSkillName: nextEv?.sourceSkillName,
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
    if (ev.segments) return ev; // already has segments

    if (ev.columnId === REACTION_COLUMNS.CORROSION) {
      const segments = buildCorrosionSegments(ev);
      if (!segments) return ev;
      return { ...ev, segments };
    }

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

export function buildReactionSegment(ev: TimelineEvent): { durationFrames: number; label: string; frames: EventFrameMarker[] } | null {
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
  }
  // Corrosion is handled separately in buildCorrosionSegments
  // Electrification: initial hit only (no additional frames)

  const baseName = REACTION_SEGMENT_LABEL[ev.columnId] ?? ev.columnId;
  const level = ev.statusLevel ?? ev.inflictionStacks ?? 1;
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][level - 1] ?? `${level}`;

  return {
    durationFrames: ev.activationDuration,
    label: `${baseName} ${roman}`,
    frames,
  };
}

/**
 * Build per-second segments for corrosion, each carrying the reduction effect.
 * Segment 1 is named "Corrosion 1", subsequent segments are "2", "3", etc.
 * Each segment contains a status frame showing the base resistance reduction.
 */
export function buildCorrosionSegments(ev: TimelineEvent): EventSegmentData[] | null {
  const element = REACTION_DAMAGE_ELEMENT[ev.columnId];
  if (!element) return null;

  const stacks = ev.inflictionStacks ?? 1;
  const statusLevel = Math.min(stacks, 4) as StatusLevel;
  const durationSeconds = Math.floor(ev.activationDuration / FPS);
  const segments: EventSegmentData[] = [];
  const floor = ev.reductionFloor ?? 0;
  const aiMultiplier = getCorrosionReductionMultiplier(ev.artsIntensity ?? 0);

  const forced = ev.isForced || ev.forcedReaction;

  for (let i = 0; i < durationSeconds; i++) {
    const segDuration = Math.min(FPS, ev.activationDuration - i * FPS);
    if (segDuration <= 0) break;

    const segIndex = i + 1;
    const scaledReduction = getCorrosionBaseReduction(statusLevel, segIndex) * aiMultiplier;
    const reduction = Math.max(floor, scaledReduction);

    // Natural corrosion: initial damage hit on first segment
    const frames = (i === 0 && !forced)
      ? [{ offsetFrame: 0, damageElement: element }]
      : undefined;

    segments.push({
      name: i === 0 ? 'Corrosion 1' : `Tick ${i}`,
      durationFrames: segDuration,
      label: i === 0 ? `Corrosion ${['I', 'II', 'III', 'IV'][statusLevel - 1]}` : undefined,
      statusLabel: `-${reduction.toFixed(1)} Res`,
      frames,
    });
  }

  // Handle any remaining frames beyond the last full second
  const remainingFrames = ev.activationDuration - durationSeconds * FPS;
  if (remainingFrames > 0) {
    const scaledReduction = getCorrosionBaseReduction(statusLevel, durationSeconds + 1) * aiMultiplier;
    const reduction = Math.max(floor, scaledReduction);
    segments.push({
      name: `Tick ${durationSeconds}`,
      durationFrames: remainingFrames,
      statusLabel: `-${reduction.toFixed(1)} Res`,
    });
  }

  return segments.length > 0 ? segments : null;
}

// ── Susceptibility frame attachment ───────────────────────────────────────

/**
 * Attaches susceptibility frame markers to status events.
 * Now a no-op for Focus (P5 uses data-driven segments instead).
 * Retained for other status types that may need frame markers in the future.
 */
export function attachSusceptibilityFrames(
  events: TimelineEvent[],
  _loadoutProperties?: Record<string, LoadoutProperties>,
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
  loadoutProperties: Record<string, LoadoutProperties> | undefined,
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
          // ── Clause-based consume (DSL v2) ──────────────────────────────
          if (frame.clauses && frame.clauses.length > 0) {
            const absF = absoluteFrame(event.startFrame, cumOffset, frame.offsetFrame, fStops);
            for (const pred of frame.clauses) {
              if (pred.conditions.length === 0) continue; // unconditional predicates don't consume
              // Check if this predicate has a consumeReaction effect
              const consumeEf = pred.effects.find(e => e.type === 'consumeReaction');
              if (!consumeEf?.consumeReaction) continue;
              // Evaluate all conditions via shared condition evaluator
              const conditionsMet = evaluateConditions(
                pred.conditions as unknown as Interaction[],
                { events, frame: absF, sourceOwnerId: event.ownerId },
              );
              if (!conditionsMet) continue;
              // Find any applyStatus effect in the same predicate
              const statusEf = pred.effects.find(e => e.type === 'applyStatus');
              const applyStatus = statusEf?.applyStatus ? {
                target: statusEf.applyStatus.target,
                status: statusEf.applyStatus.status,
                stacks: statusEf.applyStatus.stacks,
                durationFrames: statusEf.applyStatus.durationFrames,
                ...(statusEf.applyStatus.susceptibility && { susceptibility: statusEf.applyStatus.susceptibility }),
                ...(statusEf.applyStatus.eventName && { eventName: statusEf.applyStatus.eventName }),
              } : undefined;
              consumePoints.push({
                absoluteFrame: absF,
                reactionColumnId: consumeEf.consumeReaction.columnId,
                applyStatus,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                sourceColumnId: event.columnId,
              });
            }
          }
          // ── Legacy consumeReaction marker path ─────────────────────────
          else if (frame.consumeReaction) {
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
        ? resolveSusceptibility(cp.applyStatus.susceptibility, cp.sourceColumnId, cp.sourceOwnerId, loadoutProperties)
        : undefined;
      // Ardelia P1 — Dolly Paradise: +8% Physical and Arts Susceptibility when consuming Corrosion
      if (resolvedSusc && cp.sourceSkillName === CombatSkillsType.DOLLY_RUSH) {
        const pot = loadoutProperties?.[cp.sourceOwnerId]?.operator.potential ?? 0;
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
      const clamped: TimelineEvent = {
        ...ev,
        activationDuration: Math.min(ev.activationDuration, avail),
        activeDuration: Math.min(ev.activeDuration, Math.max(0, avail - ev.activationDuration)),
        cooldownDuration: Math.min(ev.cooldownDuration, Math.max(0, avail - ev.activationDuration - ev.activeDuration)),
        eventStatus: EventStatusType.CONSUMED,
        eventStatusOwnerId: clamp.source.ownerId,
        eventStatusSkillName: clamp.source.skillName,
      };
      // Clamp segments to the available duration so the view renders the correct bar length
      if (clamped.segments) {
        let remaining = avail;
        clamped.segments = clamped.segments.map((seg) => {
          const dur = Math.min(seg.durationFrames, remaining);
          remaining = Math.max(0, remaining - dur);
          return { ...seg, durationFrames: dur };
        }).filter((seg) => seg.durationFrames > 0);
      }
      result.push(clamped);
    } else {
      result.push(ev);
    }
  }
  return [...result, ...generated];
}

// ── SP recovery extraction ────────────────────────────────────────────────

/**
 * Derives SP recovery events from frame markers and perfect dodge dashes.
 * Extracted from deriveFrameInflictions — SP recovery is a pure resource
 * event with no state dependency, so it stays outside the queue.
 */
export function deriveSPRecovery(events: TimelineEvent[], stops: readonly TimeStopRegion[] = []): TimelineEvent[] {
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
          if ((frame.skillPointRecovery ?? 0) > 0) {
            derived.push({
              id: `${event.id}-sp-${si}-${fi}`,
              name: 'sp-recovery',
              ownerId: COMMON_OWNER_ID,
              columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
              startFrame: absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops),
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

  // Perfect dodge dash events → SP recovery
  for (const event of events) {
    if (event.columnId === OPERATOR_COLUMNS.DASH && event.isPerfectDodge) {
      derived.push({
        id: `${event.id}-sp-dodge`,
        name: 'sp-recovery',
        ownerId: COMMON_OWNER_ID,
        columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
        startFrame: event.startFrame,
        activationDuration: -GENERAL_MECHANICS.skillPoints.perfectDodgeRecovery,
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
