import { TimelineEvent } from '../../consts/viewTypes';
import { LoadoutStats } from '../../view/InformationPane';
import { CombatSkillsType, StatusType } from '../../consts/enums';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { TimeStopRegion, absoluteFrame, foreignStopsFor } from './processTimeStop';
import { EXCHANGE_STATUS_COLUMN, TEAM_STATUS_COLUMN, StatusSource } from './processInfliction';

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

// ── Consume operator statuses ────────────────────────────────────────────────

/**
 * Consumes operator exchange-status events (e.g. Thunderlance) when a frame has
 * `consumeStatus`. All active events of the matching status owned by the same
 * operator are clamped at the consumption frame.
 */
export function consumeOperatorStatuses(events: TimelineEvent[], stops: readonly TimeStopRegion[]): TimelineEvent[] {
  // Collect consume-status points from frame markers
  type ConsumePoint = { absoluteFrame: number; ownerId: string; status: string; source: StatusSource };
  const consumePoints: ConsumePoint[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === 'enemy' || event.ownerId === COMMON_OWNER_ID) continue;

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
          eventStatus: 'refreshed' as const,
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
