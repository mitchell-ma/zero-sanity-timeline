import { TimelineEvent } from '../../consts/viewTypes';
import { LoadoutProperties } from '../../view/InformationPane';
import { ElementType, EventStatusType, StatusType } from '../../consts/enums';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { ENEMY_OWNER_ID, INFLICTION_COLUMNS } from '../../model/channels';
import { TimeStopRegion, absoluteFrame, foreignStopsFor, extendByTimeStops } from './processTimeStop';
import { EXCHANGE_STATUS_COLUMN, TEAM_STATUS_COLUMN, StatusSource } from './processInfliction';
import { getAllOperatorIds, getSkillIds, getSkillTypeMap } from '../../model/event-frames/operatorJsonLoader';

// ── JSON-driven operator detection ──────────────────────────────────────────

/** Cache: operatorId → Set of skill IDs. */
const skillIdCache = new Map<string, Set<string>>();

function getSkillNames(operatorId: string): Set<string> {
  if (skillIdCache.has(operatorId)) return skillIdCache.get(operatorId)!;
  const ids = getSkillIds(operatorId);
  skillIdCache.set(operatorId, ids);
  return ids;
}

/** Find the slot ID for a given operator by scanning events. */
function findSlot(events: TimelineEvent[], operatorId: string): string | null {
  const names = getSkillNames(operatorId);
  if (names.size === 0) return null;
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID) continue;
    if (names.has(ev.name)) return ev.ownerId;
  }
  return null;
}

/** Get all skill IDs of a given type (BASIC_ATTACK, BATTLE_SKILL, etc.) including variants. */
function getSkillIdsForType(operatorId: string, skillType: string): string[] {
  const typeMap = getSkillTypeMap(operatorId);
  const baseId = typeMap[skillType];
  if (!baseId) return [];
  const ids = getSkillIds(operatorId);
  // Return the base ID + any variants (_ENHANCED, _EMPOWERED, _ENHANCED_EMPOWERED)
  return Array.from(ids).filter(id => id === baseId || id.startsWith(baseId + '_'));
}


// ── Consume team statuses ────────────────────────────────────────────────────

/** Skill column IDs that consume team statuses (Link) when cast. */
const CONSUMING_COLUMNS = new Set(['battle', 'combo', 'ultimate']);

/**
 * Consumes team status events (e.g. Link) when a battle/combo/ultimate skill is cast.
 * The first skill cast after Link is granted clamps the Link event at that frame.
 */
export function consumeTeamStatuses(events: TimelineEvent[]): TimelineEvent[] {
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

    for (const ev of events) {
      if (ev.ownerId !== cp.ownerId || ev.columnId !== exchangeColumnId) continue;
      if (clampMap.has(ev.id)) continue;

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

// ── Cryo → Susceptibility consumption (data-driven) ─────────────────────────

const HYPOTHERMIA_DURATION = 1800;

/**
 * Derives Cryo Susceptibility from combo skill that consumes Cryo Infliction stacks.
 * Finds the relevant operator by checking for WINTERS_DEVOURER in skillNameMap.
 */
export function consumeCryoForSusceptibility(
  events: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
): TimelineEvent[] {
  // Find operator with WINTERS_DEVOURER combo skill
  let sourceOpId: string | null = null;
  for (const opId of getAllOperatorIds()) {
    if (getSkillIds(opId).has('WINTERS_DEVOURER')) {
      sourceOpId = opId;
      break;
    }
  }
  if (!sourceOpId) return events;

  const comboNames = new Set(getSkillIdsForType(sourceOpId, 'COMBO_SKILL'));

  const comboEvents = events.filter(
    (ev) => comboNames.has(ev.name) && ev.ownerId !== ENEMY_OWNER_ID,
  );
  if (comboEvents.length === 0) return events;

  const clampMap = new Map<string, { frame: number; source: StatusSource }>();
  const generated: TimelineEvent[] = [];

  for (const combo of comboEvents) {
    const consumeFrame = combo.startFrame;
    const props = loadoutProperties?.[combo.ownerId];
    const talentOneLevel = props?.operator.talentOneLevel ?? 0;
    if (talentOneLevel < 1) continue;

    let stackCount = 0;
    for (const ev of events) {
      if (ev.ownerId !== ENEMY_OWNER_ID || ev.columnId !== INFLICTION_COLUMNS.CRYO) continue;
      const clamp = clampMap.get(ev.id);
      const end = clamp ? clamp.frame : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      if (ev.startFrame <= consumeFrame && end > consumeFrame) {
        stackCount++;
        clampMap.set(ev.id, { frame: consumeFrame, source: { ownerId: combo.ownerId, skillName: combo.name } });
      }
    }

    if (stackCount === 0) continue;

    const perStack = talentOneLevel >= 2 ? 0.04 : 0.02;
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
      susceptibility: { [ElementType.CRYO]: stackCount * perStack },
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

// ── Xaihi P5 — Controlled Recursion (Amp boost, data-driven) ────────────────

/**
 * Xaihi P5 — Controlled Recursion: Ultimate Amp effect multiplied by 1.1x.
 * Finds the operator dynamically by checking for STACK_OVERFLOW in skillNameMap.
 */
export function applyXaihiP5AmpBoost(
  events: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
): TimelineEvent[] {
  // Find operator with STACK_OVERFLOW (Xaihi's ultimate)
  let sourceOpId: string | null = null;
  for (const opId of getAllOperatorIds()) {
    if (getSkillIds(opId).has('STACK_OVERFLOW')) {
      sourceOpId = opId;
      break;
    }
  }
  if (!sourceOpId) return events;

  const ownerSlotId = findSlot(events, sourceOpId);
  if (!ownerSlotId) return events;
  const potential = loadoutProperties?.[ownerSlotId]?.operator.potential ?? 0;
  if (potential < 5) return events;

  return events.map((ev) => {
    if (ev.columnId !== StatusType.ARTS_AMP || ev.sourceOwnerId !== ownerSlotId) return ev;
    const base = ev.statusValue ?? 0.15;
    return { ...ev, statusValue: base * 1.1 };
  });
}
