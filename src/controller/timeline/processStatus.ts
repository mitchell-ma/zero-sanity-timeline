import { TimelineEvent } from '../../consts/viewTypes';
import { LoadoutStats } from '../../view/InformationPane';
import { ElementType, EventStatusType, StatusType } from '../../consts/enums';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { ENEMY_OWNER_ID, INFLICTION_COLUMNS, PHYSICAL_INFLICTION_COLUMNS } from '../../model/channels';
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

// ── Unbridled Edge (weapon buff — SP recovery triggers stacking team buff) ──

const UNBRIDLED_EDGE_WEAPON = 'OBJ Edge of Lightness';
const UNBRIDLED_EDGE_DURATION = 2400;
const UNBRIDLED_EDGE_MAX_STACKS = 3;

/**
 * Derives Unbridled Edge team buff events from SP recovery frame hits.
 */
export function deriveUnbridledEdge(
  events: TimelineEvent[],
  slotWeapons?: Record<string, string | undefined>,
  stops: readonly TimeStopRegion[] = [],
): TimelineEvent[] {
  if (!slotWeapons) return events;

  let wielderSlotId: string | null = null;
  for (const [slotId, weaponName] of Object.entries(slotWeapons)) {
    if (weaponName === UNBRIDLED_EDGE_WEAPON) {
      wielderSlotId = slotId;
      break;
    }
  }
  if (!wielderSlotId) return events;

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
            const absF = absoluteFrame(ev.startFrame, cumulativeOffset, frame.offsetFrame, fStops);
            spRecoveryHits.push({ frame: absF, sourceEventId: ev.id, sourceSkillName: ev.name });
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  if (spRecoveryHits.length === 0) return events;
  spRecoveryHits.sort((a, b) => a.frame - b.frame);

  const derived: TimelineEvent[] = [];
  const clamped = new Map<string, TimelineEvent>();
  const activeStacks: { id: string; startFrame: number; endFrame: number }[] = [];
  let idCounter = 0;

  for (const hit of spRecoveryHits) {
    for (let i = activeStacks.length - 1; i >= 0; i--) {
      if (activeStacks[i].endFrame <= hit.frame) activeStacks.splice(i, 1);
    }

    if (activeStacks.length >= UNBRIDLED_EDGE_MAX_STACKS) {
      let earliestIdx = 0;
      for (let i = 1; i < activeStacks.length; i++) {
        if (activeStacks[i].endFrame < activeStacks[earliestIdx].endFrame) earliestIdx = i;
      }
      const earliest = activeStacks[earliestIdx];
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

    const stackId = `ue-${idCounter++}`;
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
    activeStacks.push({ id: stackId, startFrame: hit.frame, endFrame: hit.frame + UNBRIDLED_EDGE_DURATION });
  }

  if (derived.length === 0) return events;
  const finalDerived = derived.map((ev) => clamped.get(ev.id) ?? ev);
  return [...events, ...finalDerived];
}

// ── Vulnerability → Susceptibility consumption (data-driven) ────────────────

/** Per-level Arts Susceptibility bonus per vulnerability stack consumed. */
const GRAVITY_FIELD_SUSCEPTIBILITY_PER_STACK: readonly number[] = [
  0.05, 0.05, 0.06, 0.06, 0.07, 0.07, 0.08, 0.08, 0.09, 0.09, 0.10, 0.10,
];
const GRAVITY_FIELD_SUSCEPTIBILITY_DURATION = 1800;

/**
 * Consumes enemy vulnerability stacks when an operator's ultimate fires,
 * generating Arts Susceptibility. Finds the relevant operator by checking
 * which operators have COMBO_SKILL skills that appear in the timeline.
 */
export function consumeVulnerabilityForSusceptibility(
  events: TimelineEvent[],
  loadoutStats?: Record<string, LoadoutStats>,
): TimelineEvent[] {
  // Find ultimate events that trigger vulnerability consumption
  // This is Gilberta's Gravity Field — find by checking for ultimate skill names
  let sourceOpId: string | null = null;
  for (const opId of getAllOperatorIds()) {
    // Gilberta is identified by having GRAVITY_FIELD in her skill IDs
    if (getSkillIds(opId).has('GRAVITY_FIELD')) {
      sourceOpId = opId;
      break;
    }
  }
  if (!sourceOpId) return events;

  const ultimateNames = new Set(getSkillIdsForType(sourceOpId, 'ULTIMATE'));

  const gravityFieldEvents = events.filter(
    (ev) => ultimateNames.has(ev.name) && ev.ownerId !== ENEMY_OWNER_ID,
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

    let stackCount = 0;
    for (const ev of events) {
      if (ev.ownerId !== ENEMY_OWNER_ID || ev.columnId !== PHYSICAL_INFLICTION_COLUMNS.VULNERABLE) continue;
      const clamp = clampMap.get(ev.id);
      const end = clamp ? clamp.frame : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      if (ev.startFrame <= consumeFrame && end > consumeFrame) {
        stackCount++;
        clampMap.set(ev.id, { frame: consumeFrame, source: { ownerId: gf.ownerId, skillName: gf.name } });
      }
    }

    if (stackCount === 0) continue;

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

// ── Cryo → Susceptibility consumption (data-driven) ─────────────────────────

const HYPOTHERMIA_DURATION = 1800;

/**
 * Derives Cryo Susceptibility from combo skill that consumes Cryo Infliction stacks.
 * Finds the relevant operator by checking for WINTERS_DEVOURER in skillNameMap.
 */
export function consumeCryoForSusceptibility(
  events: TimelineEvent[],
  loadoutStats?: Record<string, LoadoutStats>,
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
    const stats = loadoutStats?.[combo.ownerId];
    const talentOneLevel = stats?.talentOneLevel ?? 0;
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
  loadoutStats?: Record<string, LoadoutStats>,
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
  const potential = loadoutStats?.[ownerSlotId]?.potential ?? 0;
  if (potential < 5) return events;

  return events.map((ev) => {
    if (ev.columnId !== StatusType.ARTS_AMP || ev.sourceOwnerId !== ownerSlotId) return ev;
    const base = ev.statusValue ?? 0.15;
    return { ...ev, statusValue: base * 1.1 };
  });
}
