import { TimelineEvent, FrameAbsorptionMarker } from '../consts/viewTypes';
import { LoadoutStats, DEFAULT_LOADOUT_STATS } from '../view/InformationPane';
import { CombatSkillsType, StatusType, TargetType } from '../consts/enums';
import { INFLICTION_COLUMN_IDS, INFLICTION_TO_REACTION, REACTION_COLUMN_IDS, PHYSICAL_INFLICTION_COLUMN_IDS } from '../model/channels';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import { TOTAL_FRAMES, absoluteGameFrame } from './timeline';

// ── Potential-based effects ──────────────────────────────────────────────────

/** Map of ultimate skill names → combo cooldown reset at potential threshold. */
const ULTIMATE_RESETS_COMBO: Record<string, number> = {
  [CombatSkillsType.WOLVEN_FURY]: 5, // Wulfgard P5: Natural Predator
};

/**
 * Applies potential-gated effects that modify operator events:
 * - Combo cooldown reset on ultimate cast (e.g. Wulfgard P5)
 */
function applyPotentialEffects(events: TimelineEvent[]): TimelineEvent[] {
  const ultimates = events.filter(
    (ev) => ev.columnId === 'ultimate' && ULTIMATE_RESETS_COMBO[ev.name] != null
      && (ev.operatorPotential ?? 0) >= ULTIMATE_RESETS_COMBO[ev.name],
  );
  if (ultimates.length === 0) return events;

  const modified = new Map<string, TimelineEvent>();
  for (const ult of ultimates) {
    const ultFrame = ult.startFrame;
    for (const ev of events) {
      if (ev.ownerId !== ult.ownerId || ev.columnId !== 'combo') continue;
      const activeEnd = ev.startFrame + ev.activationDuration + ev.activeDuration;
      const cooldownEnd = activeEnd + ev.cooldownDuration;
      // If the combo is in its cooldown phase when the ultimate is cast, reset it
      if (ultFrame >= activeEnd && ultFrame < cooldownEnd) {
        modified.set(ev.id, {
          ...ev,
          cooldownDuration: Math.max(0, ultFrame - activeEnd),
        });
      }
    }
  }

  if (modified.size === 0) return events;
  return events.map((ev) => modified.get(ev.id) ?? ev);
}


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
export function processInflictionEvents(rawEvents: TimelineEvent[], loadoutStats?: Record<string, LoadoutStats>): TimelineEvent[] {
  const withPotentialEffects = applyPotentialEffects(rawEvents);
  const withDerivedInflictions = deriveFrameInflictions(withPotentialEffects, loadoutStats);
  // Refresh same-element stacks BEFORE absorptions/reactions so that
  // overlapping stacks get their durations extended using the original
  // infliction duration. Later steps (absorption, reaction) can then
  // clamp the already-extended events as needed.
  const withSameElementRefresh = applySameElementRefresh(withDerivedInflictions);
  const withPhysicalRefresh = applyPhysicalInflictionRefresh(withSameElementRefresh);
  const withConsumedOperatorStatuses = consumeOperatorStatuses(withPhysicalRefresh);
  const withConsumedTeam = consumeTeamStatuses(withConsumedOperatorStatuses);
  const withAbsorptions = applyAbsorptions(withConsumedTeam);
  const withReactions = deriveReactions(withAbsorptions);
  const withMergedReactions = mergeReactions(withReactions);
  const withScorchingFangs = deriveScorchingFangs(withMergedReactions, loadoutStats);
  const withSpReturnGaugeReduction = applySpReturnGaugeReduction(withScorchingFangs);
  return withSpReturnGaugeReduction;
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
              absoluteFrame: absoluteGameFrame(event.startFrame, cumulativeOffset + frame.offsetFrame, event.animationDuration),
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
/** Resolves per-level susceptibility array to a scalar using the source operator's skill level. */
function resolveSusceptibility(
  raw: Record<string, readonly number[]>,
  sourceColumnId: string,
  sourceOwnerId: string,
  loadoutStats?: Record<string, LoadoutStats>,
): Record<string, number> {
  const stats = loadoutStats?.[sourceOwnerId] ?? DEFAULT_LOADOUT_STATS;
  let skillLevel: number;
  switch (sourceColumnId) {
    case 'combo': skillLevel = stats.comboSkillLevel; break;
    case 'ultimate': skillLevel = stats.ultimateLevel; break;
    default: skillLevel = stats.battleSkillLevel; break;
  }
  const idx = Math.max(0, Math.min(skillLevel - 1, 11)); // 1-indexed level → 0-indexed array
  const resolved: Record<string, number> = {};
  for (const [element, table] of Object.entries(raw)) {
    resolved[element] = table[Math.min(idx, table.length - 1)];
  }
  return resolved;
}

function deriveFrameInflictions(events: TimelineEvent[], loadoutStats?: Record<string, LoadoutStats>): TimelineEvent[] {
  const derived: TimelineEvent[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === 'enemy') continue;

    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absoluteFrame = absoluteGameFrame(event.startFrame, cumulativeOffset + frame.offsetFrame, event.animationDuration);

          if (frame.applyArtsInfliction) {
            const columnId = ELEMENT_TO_INFLICTION_COLUMN[frame.applyArtsInfliction.element];
            // Skip if this combo event's trigger column already handles this element
            // (the comboTriggerColumnId loop below generates those)
            if (columnId && columnId !== event.comboTriggerColumnId) {
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
              // Enemy-targeted status (e.g. Focus → Susceptibility column)
              derived.push({
                id: `${event.id}-status-${si}-${fi}`,
                name: frame.applyStatus.eventName ?? frame.applyStatus.status,
                ownerId: 'enemy',
                columnId: frame.applyStatus.status,
                startFrame: absoluteFrame,
                activationDuration: frame.applyStatus.durationFrames,
                activeDuration: 0,
                cooldownDuration: 0,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                ...(frame.applyStatus.susceptibility && {
                  susceptibility: resolveSusceptibility(frame.applyStatus.susceptibility, event.columnId, event.ownerId, loadoutStats),
                }),
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
          const absoluteFrame = absoluteGameFrame(event.startFrame, cumulativeOffset + frame.offsetFrame, event.animationDuration);
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

  // Perfect dodge dash events → SP recovery (7.5 SP)
  for (const event of events) {
    if (event.columnId === 'dash' && event.isPerfectDodge) {
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
              absoluteFrame: absoluteGameFrame(event.startFrame, cumulativeOffset + frame.offsetFrame, event.animationDuration),
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
              absoluteFrame: absoluteGameFrame(event.startFrame, cumulativeOffset + frame.offsetFrame, event.animationDuration),
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
      const clampedActiveDur = Math.min(ev.activeDuration, remAfterActive);
      const remAfterActiveDur = remAfterActive - clampedActiveDur;
      const clampedCooldown = Math.min(ev.cooldownDuration, remAfterActiveDur);
      result.push({
        ...ev,
        activationDuration: clampedActive,
        activeDuration: clampedActiveDur,
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
    // Skip inflictions already consumed by absorption — they shouldn't trigger reactions
    if (incoming.eventStatus === 'consumed') continue;

    // Find active inflictions of a DIFFERENT element at incoming's start frame
    const activeOther: TimelineEvent[] = [];
    for (let j = 0; j < i; j++) {
      const prev = inflictions[j];
      if (removedIds.has(prev.id)) continue;
      if (prev.columnId === incoming.columnId) continue;
      // Skip inflictions already consumed by absorption — they shouldn't trigger reactions
      if (prev.eventStatus === 'consumed') continue;

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
      const clampedActiveDur = Math.min(ev.activeDuration, remAfterActive);
      const remAfterActiveDur = remAfterActive - clampedActiveDur;
      const clampedCooldown = Math.min(ev.cooldownDuration, remAfterActiveDur);
      result.push({
        ...ev,
        activationDuration: clampedActive,
        activeDuration: clampedActiveDur,
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
 * refresh logic as arts inflictions.
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
          eventStatus: 'extended' as const,
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
 * Processes same-element infliction stacking:
 * Each event's activationDuration is extended to the latest end frame
 * reachable through a chain of overlapping subsequent same-element stacks.
 * This models the game mechanic where applying a new infliction refreshes
 * the timer on all existing stacks of the same element.
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
          eventStatus: 'extended' as const,
          eventStatusOwnerId: next.sourceOwnerId,
          eventStatusSkillName: next.sourceSkillName,
        });
      }
    }
  });

  if (processedMap.size === 0) return events;
  return events.map((ev) => processedMap.get(ev.id) ?? ev);
}

// ── Scorching Fangs (Wulfgard talent) ────────────────────────────────────────

/** Wulfgard's battle skill CombatSkillsType values. */
const WULFGARD_BATTLE_SKILLS = new Set([
  CombatSkillsType.THERMITE_TRACERS,
]);

/** Wulfgard's unique skill names for slot identification. */
const WULFGARD_SKILLS = new Set([
  CombatSkillsType.RAPID_FIRE_AKIMBO,
  CombatSkillsType.THERMITE_TRACERS,
  CombatSkillsType.FRAG_GRENADE_BETA,
  CombatSkillsType.WOLVEN_FURY,
]);

/** Scorching Fangs base duration: 15s at 120fps. */
const SCORCHING_FANGS_DURATION = 1800;

/**
 * Derives Scorching Fangs buff events from Combustion reaction events.
 * Wulfgard gains Scorching Fangs when Combustion is applied to the enemy.
 * P3+: Battle skill refreshes Scorching Fangs and shares it with teammates at 50%.
 */
function deriveScorchingFangs(events: TimelineEvent[], loadoutStats?: Record<string, LoadoutStats>): TimelineEvent[] {
  // Find Wulfgard's slot by scanning for his unique skill names
  let wulfgardOwnerId: string | null = null;
  let wulfgardPotential = 0;
  for (const ev of events) {
    if (WULFGARD_SKILLS.has(ev.name as CombatSkillsType)) {
      wulfgardOwnerId = ev.ownerId;
      wulfgardPotential = ev.operatorPotential ?? 0;
      break;
    }
  }
  if (!wulfgardOwnerId) return events;

  // Collect combustion reaction events on enemy
  const combustionEvents = events.filter(
    (ev) => ev.columnId === 'combustion' && ev.ownerId === 'enemy',
  );
  if (combustionEvents.length === 0) return events;

  // Collect all operator slot IDs
  const operatorSlots = new Set<string>();
  for (const ev of events) {
    if (ev.ownerId !== 'enemy' && ev.ownerId !== COMMON_OWNER_ID) {
      operatorSlots.add(ev.ownerId);
    }
  }

  const hasP3 = wulfgardPotential >= 3;
  const derived: TimelineEvent[] = [];
  const clamped = new Map<string, TimelineEvent>();

  // Track active Scorching Fangs per slot for P3 refresh
  type ActiveFang = { id: string; startFrame: number; endFrame: number };
  const activeFangs = new Map<string, ActiveFang[]>();

  // Sort combustion events by start frame
  const sortedCombustions = [...combustionEvents].sort((a, b) => a.startFrame - b.startFrame);

  // Collect Wulfgard's battle skill cast frames for P3 refresh
  const battleSkillFrames: number[] = [];
  if (hasP3) {
    for (const ev of events) {
      if (ev.ownerId === wulfgardOwnerId && WULFGARD_BATTLE_SKILLS.has(ev.name as CombatSkillsType)) {
        battleSkillFrames.push(ev.startFrame);
      }
    }
    battleSkillFrames.sort((a, b) => a - b);
  }

  let idCounter = 0;
  const makeFangId = (owner: string) => `sf-${owner}-${idCounter++}`;

  // Create initial Scorching Fangs from combustion events
  for (const combustion of sortedCombustions) {
    const frame = combustion.startFrame;
    const fangId = makeFangId(wulfgardOwnerId);
    const fangEvent: TimelineEvent = {
      id: fangId,
      name: StatusType.SCORCHING_FANGS,
      ownerId: wulfgardOwnerId,
      columnId: StatusType.SCORCHING_FANGS,
      startFrame: frame,
      activationDuration: SCORCHING_FANGS_DURATION,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: combustion.sourceOwnerId,
      sourceSkillName: combustion.sourceSkillName,
    };
    derived.push(fangEvent);

    // Track for P3 refresh
    const wulfFangs = activeFangs.get(wulfgardOwnerId) ?? [];
    wulfFangs.push({ id: fangId, startFrame: frame, endFrame: frame + SCORCHING_FANGS_DURATION });
    activeFangs.set(wulfgardOwnerId, wulfFangs);
  }

  // P3: Refresh on battle skill and share with team
  if (hasP3) {
    for (const bsFrame of battleSkillFrames) {
      // Check if any Scorching Fangs is active on Wulfgard at this frame
      const wulfFangs = activeFangs.get(wulfgardOwnerId) ?? [];
      const activeFang = wulfFangs.find(
        (f) => bsFrame >= f.startFrame && bsFrame < f.endFrame,
      );
      if (!activeFang) continue;

      // Clamp existing Wulfgard fangs at this frame
      for (const f of wulfFangs) {
        if (bsFrame >= f.startFrame && bsFrame < f.endFrame) {
          const existing = derived.find((ev) => ev.id === f.id);
          if (existing) {
            clamped.set(f.id, {
              ...existing,
              activationDuration: bsFrame - f.startFrame,
              eventStatus: 'refreshed' as const,
              eventStatusOwnerId: wulfgardOwnerId,
              eventStatusSkillName: CombatSkillsType.THERMITE_TRACERS,
            });
          }
          f.endFrame = bsFrame;
        }
      }

      // Create refreshed Scorching Fangs for Wulfgard
      const refreshedId = makeFangId(wulfgardOwnerId);
      derived.push({
        id: refreshedId,
        name: StatusType.SCORCHING_FANGS,
        ownerId: wulfgardOwnerId,
        columnId: StatusType.SCORCHING_FANGS,
        startFrame: bsFrame,
        activationDuration: SCORCHING_FANGS_DURATION,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: wulfgardOwnerId,
        sourceSkillName: CombatSkillsType.THERMITE_TRACERS,
      });
      wulfFangs.push({ id: refreshedId, startFrame: bsFrame, endFrame: bsFrame + SCORCHING_FANGS_DURATION });

      // Share with other operators at 50% duration
      const sharedDuration = Math.floor(SCORCHING_FANGS_DURATION * 0.5);
      for (const slotId of Array.from(operatorSlots)) {
        if (slotId === wulfgardOwnerId) continue;
        // Clamp any existing shared fangs on this slot
        const slotFangs = activeFangs.get(slotId) ?? [];
        for (const f of slotFangs) {
          if (bsFrame >= f.startFrame && bsFrame < f.endFrame) {
            const existing = derived.find((ev) => ev.id === f.id);
            if (existing) {
              clamped.set(f.id, {
                ...existing,
                activationDuration: bsFrame - f.startFrame,
                eventStatus: 'refreshed' as const,
                eventStatusOwnerId: wulfgardOwnerId,
                eventStatusSkillName: CombatSkillsType.THERMITE_TRACERS,
              });
            }
            f.endFrame = bsFrame;
          }
        }

        const sharedId = makeFangId(slotId);
        derived.push({
          id: sharedId,
          name: StatusType.SCORCHING_FANGS,
          ownerId: slotId,
          columnId: StatusType.SCORCHING_FANGS,
          startFrame: bsFrame,
          activationDuration: sharedDuration,
          activeDuration: 0,
          cooldownDuration: 0,
          sourceOwnerId: wulfgardOwnerId,
          sourceSkillName: CombatSkillsType.THERMITE_TRACERS,
        });
        slotFangs.push({ id: sharedId, startFrame: bsFrame, endFrame: bsFrame + sharedDuration });
        activeFangs.set(slotId, slotFangs);
      }
    }
  }

  if (derived.length === 0) return events;

  // Apply clamping to derived events
  const finalDerived = derived.map((ev) => clamped.get(ev.id) ?? ev);
  return [...events, ...finalDerived];
}

// ── SP Return → Gauge Gain Reduction ─────────────────────────────────────────

/**
 * For battle skill events whose frame data includes SKILL_POINT_RECOVERY,
 * reduces gaugeGain and teamGaugeGain proportionally.
 *
 * ratio = (spCost - totalSpReturn) / spCost
 *
 * Affects: Last Rite (30 SP), Snowshine (30 SP), Catcher (30 SP).
 */
function applySpReturnGaugeReduction(events: TimelineEvent[]): TimelineEvent[] {
  const modified = new Map<string, TimelineEvent>();

  for (const ev of events) {
    if (ev.columnId !== 'battle') continue;
    if (!ev.segments) continue;

    // Sum up all SP recovery from frame data
    let totalSpReturn = 0;
    for (const seg of ev.segments) {
      if (!seg.frames) continue;
      for (const frame of seg.frames) {
        if (frame.skillPointRecovery && frame.skillPointRecovery > 0) {
          totalSpReturn += frame.skillPointRecovery;
        }
      }
    }

    if (totalSpReturn <= 0) continue;

    const spCost = ev.skillPointCost ?? 100;
    if (spCost <= 0) continue;

    const ratio = Math.max(0, (spCost - totalSpReturn) / spCost);

    const updates: Partial<TimelineEvent> = {};
    if (ev.gaugeGain != null) {
      updates.gaugeGain = ev.gaugeGain * ratio;
    }
    if (ev.teamGaugeGain != null) {
      updates.teamGaugeGain = ev.teamGaugeGain * ratio;
    }
    if (ev.gaugeGainByEnemies != null) {
      const reduced: Record<number, number> = {};
      for (const [k, v] of Object.entries(ev.gaugeGainByEnemies)) {
        reduced[Number(k)] = v * ratio;
      }
      updates.gaugeGainByEnemies = reduced;
    }

    if (Object.keys(updates).length > 0) {
      modified.set(ev.id, { ...ev, ...updates });
    }
  }

  if (modified.size === 0) return events;
  return events.map((ev) => modified.get(ev.id) ?? ev);
}
