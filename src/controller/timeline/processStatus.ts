import { TimelineEvent } from '../../consts/viewTypes';
import { LoadoutStats } from '../../view/InformationPane';
import { CombatSkillsType, ElementType, EventStatusType, StatusType } from '../../consts/enums';
import { STATUS_LABELS } from '../../consts/channelLabels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { ENEMY_OWNER_ID, INFLICTION_COLUMNS, OPERATOR_COLUMNS, PHYSICAL_INFLICTION_COLUMNS, REACTION_COLUMNS } from '../../model/channels';
import { TimeStopRegion, absoluteFrame, foreignStopsFor, extendByTimeStops } from './processTimeStop';
import { EXCHANGE_STATUS_COLUMN, TEAM_STATUS_COLUMN, StatusSource } from './processInfliction';
import { TOTAL_FRAMES } from '../../utils/timeline';

// ── Consume team statuses ────────────────────────────────────────────────────

/** Skill column IDs that consume team statuses (Link) when cast. */
const CONSUMING_COLUMNS = new Set(['battle', 'combo', 'ultimate']);

/**
 * Consumes team status events (e.g. Link) when a battle/combo/ultimate skill is cast.
 * The first skill cast after Link is granted clamps the Link event at that frame.
 */
export function consumeTeamStatuses(events: TimelineEvent[]): TimelineEvent[] {
  // Collect team status events (Link, etc.) and consuming skill events
  const teamStatuses = events.filter(
    (ev) => ev.ownerId === COMMON_OWNER_ID && Object.values(TEAM_STATUS_COLUMN).includes(ev.columnId),
  );
  if (teamStatuses.length === 0) return events;

  const skillCasts = events
    .filter((ev) => ev.ownerId !== ENEMY_OWNER_ID && ev.ownerId !== COMMON_OWNER_ID && CONSUMING_COLUMNS.has(ev.columnId))
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
      eventStatus: EventStatusType.CONSUMED,
      eventStatusOwnerId: clamp.source.ownerId,
      eventStatusSkillName: clamp.source.skillName,
    };
  });
}

// ── Consume operator statuses ────────────────────────────────────────────────

/**
 * Consumes operator exchange-status events (e.g. Thunderlance) when a frame has
 * `consumeStatus`. All active events of the matching status owned by the same
 * operator are clamped at the consumption frame.
 */
export function consumeOperatorStatuses(events: TimelineEvent[], stops: readonly TimeStopRegion[], extendedIds?: Set<string>): TimelineEvent[] {
  // Collect consume-status points from frame markers
  type ConsumePoint = { absoluteFrame: number; ownerId: string; status: string; source: StatusSource };
  const consumePoints: ConsumePoint[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === ENEMY_OWNER_ID || event.ownerId === COMMON_OWNER_ID) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          if (frame.consumeStatus) {
            consumePoints.push({
              absoluteFrame: absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops),
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

    // Find all active exchange status events of this type owned by the same operator.
    // Use time-stop-extended duration so the active check matches real-time consume frames.
    for (const ev of events) {
      if (ev.ownerId !== cp.ownerId || ev.columnId !== exchangeColumnId) continue;
      if (clampMap.has(ev.id)) continue; // already clamped

      const fStops = foreignStopsFor(ev, stops);
      const extendedDuration = extendByTimeStops(ev.startFrame, ev.activationDuration, fStops);
      const endFrame = ev.startFrame + extendedDuration;
      if (ev.startFrame <= cp.absoluteFrame && endFrame > cp.absoluteFrame) {
        clampMap.set(ev.id, { frame: cp.absoluteFrame, source: cp.source });
      }
    }
  }

  if (clampMap.size === 0) return events;

  return events.map((ev) => {
    const clamp = clampMap.get(ev.id);
    if (!clamp) return ev;
    // Clamped duration is already real-time (consume frame is absolute).
    // Mark as extended so downstream applyTimeStopExtension doesn't double-extend.
    const clamped = Math.max(0, clamp.frame - ev.startFrame);
    extendedIds?.add(ev.id);
    return {
      ...ev,
      activationDuration: clamped,
      eventStatus: EventStatusType.CONSUMED,
      eventStatusOwnerId: clamp.source.ownerId,
      eventStatusSkillName: clamp.source.skillName,
    };
  });
}

// ── Scorching Heart (Laevatain talent — ignored Heat RES on 4 MF stacks) ────

/** Laevatain's unique skill names for slot identification. */
const LAEVATAIN_SKILLS = new Set<CombatSkillsType>([
  CombatSkillsType.FLAMING_CINDERS,
  CombatSkillsType.FLAMING_CINDERS_ENHANCED,
  CombatSkillsType.SMOULDERING_FIRE,
  CombatSkillsType.SMOULDERING_FIRE_EMPOWERED,
  CombatSkillsType.SEETHE,
  CombatSkillsType.TWILIGHT,
]);

/** Scorching Heart duration: 20s at 120fps. */
const SCORCHING_HEART_DURATION = 2400;

/** Threshold: 4 active Melting Flame stacks triggers Scorching Heart. */
const SCORCHING_HEART_THRESHOLD = 4;

/**
 * Derives Scorching Heart debuff events on the enemy when Laevatain reaches
 * 4 active Melting Flame stacks. The debuff lasts 20s and causes her attacks
 * to ignore a portion of Heat Resistance (10/15/20 by talent level).
 */
export function deriveScorchingHeart(
  events: TimelineEvent[],
  loadoutStats?: Record<string, LoadoutStats>,
): TimelineEvent[] {
  // Find Laevatain's slot
  let laevatainOwnerId: string | null = null;
  for (const ev of events) {
    if (LAEVATAIN_SKILLS.has(ev.name as CombatSkillsType)) {
      laevatainOwnerId = ev.ownerId;
      break;
    }
  }
  if (!laevatainOwnerId) return events;

  // Collect Melting Flame events for Laevatain, sorted by start frame
  const mfEvents = events
    .filter((ev) => ev.ownerId === laevatainOwnerId && ev.columnId === OPERATOR_COLUMNS.MELTING_FLAME)
    .sort((a, b) => a.startFrame - b.startFrame);

  if (mfEvents.length < SCORCHING_HEART_THRESHOLD) return events;

  // Find frames where the 4th MF stack becomes active.
  // For each MF event, count how many other MF events are active at its start frame.
  // When the count reaches 4 (including the new one), that's a Scorching Heart activation.
  const derived: TimelineEvent[] = [];
  const clamped = new Map<string, TimelineEvent>();
  let activeSH: { id: string; startFrame: number; endFrame: number } | null = null;
  let idCounter = 0;

  for (const mf of mfEvents) {
    // Count active MF stacks at this event's start frame (including itself)
    let activeCount = 0;
    for (const other of mfEvents) {
      const otherEnd = other.startFrame + other.activationDuration;
      if (other.startFrame <= mf.startFrame && mf.startFrame < otherEnd) {
        activeCount++;
      }
    }

    if (activeCount < SCORCHING_HEART_THRESHOLD) continue;

    // Only trigger if this is the stack that crosses the threshold
    // (i.e. we weren't already at 4+ before this event started)
    let countWithout = 0;
    for (const other of mfEvents) {
      if (other.id === mf.id) continue;
      const otherEnd = other.startFrame + other.activationDuration;
      if (other.startFrame <= mf.startFrame && mf.startFrame < otherEnd) {
        countWithout++;
      }
    }
    if (countWithout >= SCORCHING_HEART_THRESHOLD) continue; // was already at threshold

    // If there's an active Scorching Heart, refresh it
    if (activeSH && mf.startFrame < activeSH.endFrame) {
      const existing = derived.find((ev) => ev.id === activeSH!.id);
      if (existing) {
        clamped.set(activeSH.id, {
          ...existing,
          activationDuration: mf.startFrame - activeSH.startFrame,
          eventStatus: EventStatusType.REFRESHED,
          eventStatusOwnerId: laevatainOwnerId,
          eventStatusSkillName: STATUS_LABELS[StatusType.MELTING_FLAME],
        });
      }
    }

    const shId = `sh-${laevatainOwnerId}-${idCounter++}`;
    derived.push({
      id: shId,
      name: StatusType.SCORCHING_HEART,
      ownerId: ENEMY_OWNER_ID,
      columnId: StatusType.SCORCHING_HEART,
      startFrame: mf.startFrame,
      activationDuration: SCORCHING_HEART_DURATION,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: laevatainOwnerId,
      sourceSkillName: STATUS_LABELS[StatusType.MELTING_FLAME],
    });
    activeSH = { id: shId, startFrame: mf.startFrame, endFrame: mf.startFrame + SCORCHING_HEART_DURATION };
  }

  if (derived.length === 0) return events;
  const finalDerived = derived.map((ev) => clamped.get(ev.id) ?? ev);
  return [...events, ...finalDerived];
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
export function deriveScorchingFangs(events: TimelineEvent[], loadoutStats?: Record<string, LoadoutStats>): TimelineEvent[] {
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
    (ev) => ev.columnId === REACTION_COLUMNS.COMBUSTION && ev.ownerId === ENEMY_OWNER_ID,
  );
  if (combustionEvents.length === 0) return events;

  // Collect all operator slot IDs
  const operatorSlots = new Set<string>();
  for (const ev of events) {
    if (ev.ownerId !== ENEMY_OWNER_ID && ev.ownerId !== COMMON_OWNER_ID) {
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
              eventStatus: EventStatusType.REFRESHED,
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
                eventStatus: EventStatusType.REFRESHED,
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

// ── Unbridled Edge (OBJ Edge of Lightness weapon buff) ───────────────────────

const UNBRIDLED_EDGE_WEAPON = 'OBJ Edge of Lightness';
const UNBRIDLED_EDGE_DURATION = 2400; // 20s at 120fps
const UNBRIDLED_EDGE_MAX_STACKS = 3;

/**
 * Derives Unbridled Edge team buff events from SP recovery frame hits.
 * The weapon grants a stacking team buff (max 3) when the wielder's skill
 * recovers SP. Additional stacks beyond 3 refresh the earliest expiring stack.
 */
export function deriveUnbridledEdge(
  events: TimelineEvent[],
  slotWeapons?: Record<string, string | undefined>,
  stops: readonly TimeStopRegion[] = [],
): TimelineEvent[] {
  if (!slotWeapons) return events;

  // Find the slot that has Edge of Lightness equipped
  let wielderSlotId: string | null = null;
  for (const [slotId, weaponName] of Object.entries(slotWeapons)) {
    if (weaponName === UNBRIDLED_EDGE_WEAPON) {
      wielderSlotId = slotId;
      break;
    }
  }
  if (!wielderSlotId) return events;

  // Collect all SP recovery frames from the wielder's events
  type SpRecoveryHit = { frame: number; sourceEventId: string; sourceSkillName: string };
  const spRecoveryHits: SpRecoveryHit[] = [];

  for (const ev of events) {
    if (ev.ownerId !== wielderSlotId) continue;
    if (!ev.segments) continue;
    const fStops = foreignStopsFor(ev, stops);
    let cumulativeOffset = 0;
    for (const seg of ev.segments) {
      if (seg.frames) {
        for (const frame of seg.frames) {
          if (frame.skillPointRecovery && frame.skillPointRecovery > 0) {
            const absFrame = absoluteFrame(ev.startFrame, cumulativeOffset, frame.offsetFrame, fStops);
            spRecoveryHits.push({
              frame: absFrame,
              sourceEventId: ev.id,
              sourceSkillName: ev.name,
            });
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  if (spRecoveryHits.length === 0) return events;
  spRecoveryHits.sort((a, b) => a.frame - b.frame);

  // Build stacking buff events with max 3 stacks and refresh-on-overflow
  const derived: TimelineEvent[] = [];
  const clamped = new Map<string, TimelineEvent>();
  // Track active stacks as { id, startFrame, endFrame }
  const activeStacks: { id: string; startFrame: number; endFrame: number }[] = [];
  let idCounter = 0;

  for (const hit of spRecoveryHits) {
    // Remove expired stacks
    for (let i = activeStacks.length - 1; i >= 0; i--) {
      if (activeStacks[i].endFrame <= hit.frame) {
        activeStacks.splice(i, 1);
      }
    }

    // If at max stacks, refresh the earliest-expiring one
    if (activeStacks.length >= UNBRIDLED_EDGE_MAX_STACKS) {
      // Find the stack with the earliest end frame
      let earliestIdx = 0;
      for (let i = 1; i < activeStacks.length; i++) {
        if (activeStacks[i].endFrame < activeStacks[earliestIdx].endFrame) {
          earliestIdx = i;
        }
      }
      const earliest = activeStacks[earliestIdx];
      // Clamp it at the current frame
      const existingDerived = derived.find((ev) => ev.id === earliest.id);
      if (existingDerived) {
        clamped.set(earliest.id, {
          ...existingDerived,
          activationDuration: hit.frame - earliest.startFrame,
          eventStatus: EventStatusType.REFRESHED,
          eventStatusOwnerId: wielderSlotId,
          eventStatusSkillName: hit.sourceSkillName,
        });
      }
      activeStacks.splice(earliestIdx, 1);
    }

    // Create new stack
    const stackId = `ue-${idCounter++}`;
    const endFrame = hit.frame + UNBRIDLED_EDGE_DURATION;
    derived.push({
      id: stackId,
      name: StatusType.UNBRIDLED_EDGE,
      ownerId: COMMON_OWNER_ID,
      columnId: StatusType.UNBRIDLED_EDGE,
      startFrame: hit.frame,
      activationDuration: UNBRIDLED_EDGE_DURATION,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: wielderSlotId,
      sourceSkillName: hit.sourceSkillName,
    });
    activeStacks.push({ id: stackId, startFrame: hit.frame, endFrame });
  }

  if (derived.length === 0) return events;
  const finalDerived = derived.map((ev) => clamped.get(ev.id) ?? ev);
  return [...events, ...finalDerived];
}

// ── Originium Crystal consumption (Endministrator) ──────────────────────────

/** Endministrator skills that consume Originium Crystals from the enemy. */
const CRYSTAL_CONSUMING_SKILLS = new Set([
  CombatSkillsType.CONSTRUCTIVE_SEQUENCE,
  CombatSkillsType.BOMBARDMENT_SEQUENCE,
]);

/**
 * Consumes Originium Crystal events on the enemy when Endministrator casts
 * battle skill (Constructive Sequence) or ultimate (Bombardment Sequence).
 * All active crystals are clamped at the consuming skill's start frame.
 */
export function consumeOriginiumCrystals(events: TimelineEvent[]): TimelineEvent[] {
  // Find Endministrator's consuming skill events
  const consumeFrames: { frame: number; ownerId: string; skillName: string }[] = [];
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID) continue;
    if (CRYSTAL_CONSUMING_SKILLS.has(ev.name as CombatSkillsType)) {
      consumeFrames.push({ frame: ev.startFrame, ownerId: ev.ownerId, skillName: ev.name });
    }
  }

  if (consumeFrames.length === 0) return events;
  consumeFrames.sort((a, b) => a.frame - b.frame);

  const clampMap = new Map<string, { frame: number; source: { ownerId: string; skillName: string } }>();

  for (const cf of consumeFrames) {
    for (const ev of events) {
      if (ev.ownerId !== ENEMY_OWNER_ID || ev.columnId !== OPERATOR_COLUMNS.ORIGINIUM_CRYSTAL) continue;
      if (clampMap.has(ev.id)) continue;
      const endFrame = ev.startFrame + ev.activationDuration;
      if (ev.startFrame <= cf.frame && endFrame > cf.frame) {
        clampMap.set(ev.id, { frame: cf.frame, source: { ownerId: cf.ownerId, skillName: cf.skillName } });
      }
    }
  }

  if (clampMap.size === 0) return events;

  return events.map((ev) => {
    const clamp = clampMap.get(ev.id);
    if (!clamp) return ev;
    return {
      ...ev,
      activationDuration: Math.max(0, clamp.frame - ev.startFrame),
      eventStatus: EventStatusType.CONSUMED,
      eventStatusOwnerId: clamp.source.ownerId,
      eventStatusSkillName: clamp.source.skillName,
    };
  });
}

// ── Messenger's Song ────────────────────────────────────────────────────────

const GILBERTA_SKILLS = new Set<CombatSkillsType>([
  CombatSkillsType.BEAM_COHESION_ARTS,
  CombatSkillsType.GRAVITY_MODE,
  CombatSkillsType.MATRIX_DISPLACEMENT,
  CombatSkillsType.GRAVITY_FIELD,
]);

/**
 * Derives a permanent Messenger's Song team buff event when Gilberta is in the team.
 * Grants Ultimate Gain Efficiency to all allied Guards, Casters, and Supporters.
 */
export function deriveMessengersSong(events: TimelineEvent[]): TimelineEvent[] {
  // Detect Gilberta's presence by scanning for her unique skill names
  let gilbertaOwnerId: string | null = null;
  for (const ev of events) {
    if (GILBERTA_SKILLS.has(ev.name as CombatSkillsType)) {
      gilbertaOwnerId = ev.ownerId;
      break;
    }
  }
  if (!gilbertaOwnerId) return events;

  // Check if a Messenger's Song event already exists (avoid duplicates)
  if (events.some((ev) => ev.columnId === StatusType.MESSENGERS_SONG)) return events;

  return [
    ...events,
    {
      id: `messengers-song-${gilbertaOwnerId}`,
      name: StatusType.MESSENGERS_SONG,
      ownerId: COMMON_OWNER_ID,
      columnId: StatusType.MESSENGERS_SONG,
      startFrame: 0,
      activationDuration: TOTAL_FRAMES,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: gilbertaOwnerId,
      sourceSkillName: 'Messenger\'s Song',
    },
  ];
}

// ── Gravity Field vulnerability consumption ─────────────────────────────────

/** Per-level Arts Susceptibility bonus per vulnerability stack consumed by Gravity Field. */
const GRAVITY_FIELD_SUSCEPTIBILITY_PER_STACK: readonly number[] = [
  0.05, 0.05, 0.06, 0.06, 0.07, 0.07, 0.08, 0.08, 0.09, 0.09, 0.10, 0.10,
];

/** Duration of Arts Susceptibility from Gravity Field (15s at 120fps). */
const GRAVITY_FIELD_SUSCEPTIBILITY_DURATION = 1800;

/**
 * Consumes enemy vulnerability stacks when Gilberta's Gravity Field (ultimate) fires.
 * Generates Arts Susceptibility on the enemy scaled by the number of consumed stacks.
 *
 * P2 (Wind Walker): Susceptibility per stack doubled; effective stacks += 1 (max 4).
 */
export function consumeVulnerabilityForSusceptibility(
  events: TimelineEvent[],
  loadoutStats?: Record<string, LoadoutStats>,
): TimelineEvent[] {
  // Find Gravity Field ultimate events
  const gravityFieldEvents = events.filter(
    (ev) => ev.name === CombatSkillsType.GRAVITY_FIELD && ev.ownerId !== ENEMY_OWNER_ID,
  );
  if (gravityFieldEvents.length === 0) return events;

  const clampMap = new Map<string, { frame: number; source: StatusSource }>();
  const generated: TimelineEvent[] = [];

  for (const gf of gravityFieldEvents) {
    const consumeFrame = gf.startFrame;
    const stats = loadoutStats?.[gf.ownerId];
    const potential = gf.operatorPotential ?? stats?.potential ?? 0;
    const ultLevel = stats?.ultimateLevel ?? 1;
    const levelIdx = Math.max(0, Math.min(ultLevel - 1, GRAVITY_FIELD_SUSCEPTIBILITY_PER_STACK.length - 1));
    const hasP2 = potential >= 2;

    // Count and clamp active vulnerability infliction events on enemy
    let stackCount = 0;
    for (const ev of events) {
      if (ev.ownerId !== ENEMY_OWNER_ID || ev.columnId !== PHYSICAL_INFLICTION_COLUMNS.VULNERABLE) continue;
      const clamp = clampMap.get(ev.id);
      const end = clamp ? clamp.frame : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      if (ev.startFrame <= consumeFrame && end > consumeFrame) {
        stackCount++;
        clampMap.set(ev.id, {
          frame: consumeFrame,
          source: { ownerId: gf.ownerId, skillName: gf.name },
        });
      }
    }

    if (stackCount === 0) continue;

    // P2: treat as +1 stack (max 4), double susceptibility per stack
    const effectiveStacks = hasP2 ? Math.min(stackCount + 1, 4) : stackCount;
    const perStack = GRAVITY_FIELD_SUSCEPTIBILITY_PER_STACK[levelIdx];
    const totalSusc = effectiveStacks * (hasP2 ? perStack * 2 : perStack);

    generated.push({
      id: `gf-susc-${gf.id}`,
      name: StatusType.SUSCEPTIBILITY,
      ownerId: ENEMY_OWNER_ID,
      columnId: StatusType.SUSCEPTIBILITY,
      startFrame: consumeFrame,
      activationDuration: GRAVITY_FIELD_SUSCEPTIBILITY_DURATION,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: gf.ownerId,
      sourceSkillName: gf.name,
      susceptibility: {
        [ElementType.HEAT]: totalSusc,
        [ElementType.ELECTRIC]: totalSusc,
        [ElementType.CRYO]: totalSusc,
        [ElementType.NATURE]: totalSusc,
      },
    });
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

// ── Last Rite T1 — Hypothermia (Cryo Susceptibility from combo) ─────────────

/** Cryo Susceptibility duration: 15s at 120fps. */
const HYPOTHERMIA_DURATION = 1800;

/**
 * Derives Cryo Susceptibility from Last Rite's combo skill (Winter's Devourer).
 * When the combo consumes Cryo Infliction stacks, it generates Cryo Susceptibility
 * equal to consumed stacks × 2% (T1) or × 4% (T2).
 */
export function consumeCryoForSusceptibility(
  events: TimelineEvent[],
  loadoutStats?: Record<string, LoadoutStats>,
): TimelineEvent[] {
  // Find Winter's Devourer combo events
  const comboEvents = events.filter(
    (ev) => ev.name === CombatSkillsType.WINTERS_DEVOURER && ev.ownerId !== ENEMY_OWNER_ID,
  );
  if (comboEvents.length === 0) return events;

  const clampMap = new Map<string, { frame: number; source: StatusSource }>();
  const generated: TimelineEvent[] = [];

  for (const combo of comboEvents) {
    const consumeFrame = combo.startFrame;
    const stats = loadoutStats?.[combo.ownerId];
    const talentOneLevel = stats?.talentOneLevel ?? 0;
    if (talentOneLevel < 1) continue;

    // Count and clamp active Cryo infliction events on enemy
    let stackCount = 0;
    for (const ev of events) {
      if (ev.ownerId !== ENEMY_OWNER_ID || ev.columnId !== INFLICTION_COLUMNS.CRYO) continue;
      const clamp = clampMap.get(ev.id);
      const end = clamp ? clamp.frame : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      if (ev.startFrame <= consumeFrame && end > consumeFrame) {
        stackCount++;
        clampMap.set(ev.id, {
          frame: consumeFrame,
          source: { ownerId: combo.ownerId, skillName: combo.name },
        });
      }
    }

    if (stackCount === 0) continue;

    const perStack = talentOneLevel >= 2 ? 0.04 : 0.02;
    const totalSusc = stackCount * perStack;

    generated.push({
      id: `hypothermia-${combo.id}`,
      name: StatusType.SUSCEPTIBILITY,
      ownerId: ENEMY_OWNER_ID,
      columnId: StatusType.SUSCEPTIBILITY,
      startFrame: consumeFrame,
      activationDuration: HYPOTHERMIA_DURATION,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: combo.ownerId,
      sourceSkillName: combo.name,
      susceptibility: {
        [ElementType.CRYO]: totalSusc,
      },
    });
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

// ── Xaihi P5 — Controlled Recursion (Amp x1.1) ─────────────────────────────

const XAIHI_SKILLS = new Set<CombatSkillsType>([
  CombatSkillsType.DISTRIBUTED_DOS,
  CombatSkillsType.STRESS_TESTING,
  CombatSkillsType.STACK_OVERFLOW,
]);

/**
 * Xaihi P5 — Controlled Recursion: Ultimate Amp effect multiplied by 1.1x.
 * Finds Arts Amp events sourced from Xaihi and boosts their statusValue.
 */
export function applyXaihiP5AmpBoost(
  events: TimelineEvent[],
  loadoutStats?: Record<string, LoadoutStats>,
): TimelineEvent[] {
  // Detect Xaihi's presence and check P5
  let xaihiOwnerId: string | null = null;
  for (const ev of events) {
    if (XAIHI_SKILLS.has(ev.name as CombatSkillsType)) {
      xaihiOwnerId = ev.ownerId;
      break;
    }
  }
  if (!xaihiOwnerId) return events;
  const potential = loadoutStats?.[xaihiOwnerId]?.potential ?? 0;
  if (potential < 5) return events;

  return events.map((ev) => {
    if (ev.columnId !== StatusType.ARTS_AMP || ev.sourceOwnerId !== xaihiOwnerId) return ev;
    const base = ev.statusValue ?? 0.15; // default amp bonus
    return { ...ev, statusValue: base * 1.1 };
  });
}

// ── Wildland Trekker (Arclight talent) ──────────────────────────────────────

/** Arclight's unique skill names for slot identification. */
const ARCLIGHT_SKILLS = new Set<CombatSkillsType>([
  CombatSkillsType.SEEK_AND_HUNT,
  CombatSkillsType.TEMPESTUOUS_ARC,
  CombatSkillsType.PEAL_OF_THUNDER,
  CombatSkillsType.EXPLODING_BLITZ,
]);

/** Wildland Trekker duration: 15s at 120fps. */
const WILDLAND_TREKKER_DURATION = 1800;

/** Per-Intellect Electric DMG bonus by talent level. */
const WILDLAND_TREKKER_PER_INTELLECT: Record<number, number> = {
  1: 0.0005, // 0.05% per Intellect
  2: 0.0008, // 0.08% per Intellect
};

/** Tactful Approach (T3): Electric Susceptibility from ultimate, by talent level. */
const TACTFUL_APPROACH_SUSCEPTIBILITY: Record<number, number> = {
  1: 0.06,
  2: 0.10,
};

/** Tactful Approach duration: 10s at 120fps. */
const TACTFUL_APPROACH_DURATION = 1200;

/**
 * Derives Wildland Trekker trigger stacks and team buff from Arclight's Tempestuous Arc.
 *
 * Each successful Tempestuous Arc cast during active Electrification creates a
 * visible trigger stack on Arclight's operator micro-column (like Melting Flame).
 * When the threshold is reached (3, or 2 with P5), all trigger stacks are consumed
 * and a team-wide Electric DMG buff is created.
 *
 * Also derives Tactful Approach (T3): Electric Susceptibility from ultimate.
 */
export function deriveWildlandTrekker(
  events: TimelineEvent[],
  loadoutStats?: Record<string, LoadoutStats>,
): TimelineEvent[] {
  // Find Arclight's slot
  let arclightOwnerId: string | null = null;
  let arclightPotential = 0;
  for (const ev of events) {
    if (ARCLIGHT_SKILLS.has(ev.name as CombatSkillsType)) {
      arclightOwnerId = ev.ownerId;
      arclightPotential = ev.operatorPotential ?? 0;
      break;
    }
  }
  if (!arclightOwnerId) return events;

  const stats = loadoutStats?.[arclightOwnerId];
  arclightPotential = stats?.potential ?? arclightPotential;
  const talentTwoLevel = stats?.talentTwoLevel ?? 0;

  const derived: TimelineEvent[] = [];
  const clamped = new Map<string, TimelineEvent>();
  let idCounter = 0;

  // ── Wildland Trekker: trigger stacks + team buff ──────────────────────────
  if (talentTwoLevel >= 1) {
    const threshold = arclightPotential >= 5 ? 2 : 3;
    const perIntellect = WILDLAND_TREKKER_PER_INTELLECT[talentTwoLevel] ?? WILDLAND_TREKKER_PER_INTELLECT[1];
    const p3Multiplier = arclightPotential >= 3 ? 1.3 : 1.0;
    const statusValue = perIntellect * p3Multiplier;

    // Collect Tempestuous Arc casts sorted by start frame
    const battleSkillCasts = events
      .filter((ev) => ev.ownerId === arclightOwnerId && ev.name === CombatSkillsType.TEMPESTUOUS_ARC)
      .sort((a, b) => a.startFrame - b.startFrame);

    // Collect active Electrification events on enemy
    const electrificationEvents = events.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === REACTION_COLUMNS.ELECTRIFICATION,
    );

    // Track active trigger stacks (pending consumption)
    const pendingTriggers: { id: string; startFrame: number }[] = [];
    // Track active team buff for refresh
    let activeBuff: { id: string; startFrame: number; endFrame: number } | null = null;

    for (const cast of battleSkillCasts) {
      // Check if any Electrification is active on enemy at this cast frame
      const hasElectrification = electrificationEvents.some((ef) => {
        const end = ef.startFrame + ef.activationDuration;
        return ef.startFrame <= cast.startFrame && cast.startFrame < end;
      });

      if (!hasElectrification) continue;

      // Create a visible trigger stack event on Arclight's micro-column
      const triggerId = `wt-trigger-${arclightOwnerId}-${idCounter++}`;
      derived.push({
        id: triggerId,
        name: StatusType.WILDLAND_TREKKER,
        ownerId: arclightOwnerId,
        columnId: OPERATOR_COLUMNS.WILDLAND_TREKKER_TRIGGER,
        startFrame: cast.startFrame,
        activationDuration: TOTAL_FRAMES * 10, // persist until consumed
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: arclightOwnerId,
        sourceSkillName: CombatSkillsType.TEMPESTUOUS_ARC,
      });
      pendingTriggers.push({ id: triggerId, startFrame: cast.startFrame });

      // Check if threshold reached
      if (pendingTriggers.length >= threshold) {
        // Consume all pending trigger stacks at this frame
        for (const trigger of pendingTriggers) {
          const existing = derived.find((ev) => ev.id === trigger.id);
          if (existing) {
            clamped.set(trigger.id, {
              ...existing,
              activationDuration: cast.startFrame - trigger.startFrame,
              eventStatus: EventStatusType.CONSUMED,
              eventStatusOwnerId: arclightOwnerId,
              eventStatusSkillName: CombatSkillsType.TEMPESTUOUS_ARC,
            });
          }
        }
        pendingTriggers.length = 0;

        // If there's an active team buff, clamp it (non-stacking, refresh)
        if (activeBuff && cast.startFrame < activeBuff.endFrame) {
          const existing = derived.find((ev) => ev.id === activeBuff!.id);
          if (existing) {
            clamped.set(activeBuff.id, {
              ...existing,
              activationDuration: cast.startFrame - activeBuff.startFrame,
              eventStatus: EventStatusType.REFRESHED,
              eventStatusOwnerId: arclightOwnerId,
              eventStatusSkillName: CombatSkillsType.TEMPESTUOUS_ARC,
            });
          }
        }

        // Create team buff event on COMMON timeline
        const buffId = `wt-buff-${idCounter++}`;
        derived.push({
          id: buffId,
          name: StatusType.WILDLAND_TREKKER,
          ownerId: COMMON_OWNER_ID,
          columnId: StatusType.WILDLAND_TREKKER,
          startFrame: cast.startFrame,
          activationDuration: WILDLAND_TREKKER_DURATION,
          activeDuration: 0,
          cooldownDuration: 0,
          sourceOwnerId: arclightOwnerId,
          sourceSkillName: CombatSkillsType.TEMPESTUOUS_ARC,
          statusValue,
        });
        activeBuff = { id: buffId, startFrame: cast.startFrame, endFrame: cast.startFrame + WILDLAND_TREKKER_DURATION };
      }
    }
  }

  // ── Tactful Approach: Electric Susceptibility from ultimate ────────────────
  if (talentTwoLevel >= 1) {
    const suscValue = TACTFUL_APPROACH_SUSCEPTIBILITY[talentTwoLevel] ?? TACTFUL_APPROACH_SUSCEPTIBILITY[1];
    const ultimateEvents = events.filter(
      (ev) => ev.ownerId === arclightOwnerId && ev.name === CombatSkillsType.EXPLODING_BLITZ,
    );

    for (const ult of ultimateEvents) {
      derived.push({
        id: `ta-susc-${ult.id}`,
        name: StatusType.SUSCEPTIBILITY,
        ownerId: ENEMY_OWNER_ID,
        columnId: StatusType.SUSCEPTIBILITY,
        startFrame: ult.startFrame,
        activationDuration: TACTFUL_APPROACH_DURATION,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: arclightOwnerId,
        sourceSkillName: CombatSkillsType.EXPLODING_BLITZ,
        susceptibility: {
          [ElementType.ELECTRIC]: suscValue,
        },
      });
    }
  }

  if (derived.length === 0) return events;

  // Apply clamping to derived events
  const finalDerived = derived.map((ev) => clamped.get(ev.id) ?? ev);
  return [...events, ...finalDerived];
}

