import { TimelineEvent } from '../../consts/viewTypes';
import { LoadoutStats } from '../../view/InformationPane';
import { ElementType, EventStatusType, StatusType } from '../../consts/enums';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { ENEMY_OWNER_ID, INFLICTION_COLUMNS, OPERATOR_COLUMNS, PHYSICAL_INFLICTION_COLUMNS, REACTION_COLUMNS } from '../../model/channels';
import { TimeStopRegion, absoluteFrame, foreignStopsFor, extendByTimeStops } from './processTimeStop';
import { EXCHANGE_STATUS_COLUMN, TEAM_STATUS_COLUMN, StatusSource } from './processInfliction';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { getOperatorJson, getAllOperatorIds, getSkillNameMap } from '../../model/event-frames/operatorJsonLoader';

// ── JSON-driven operator detection ──────────────────────────────────────────

/** Cache: operatorId → Set of CombatSkillsType names from skillNameMap. */
const skillNameCache = new Map<string, Set<string>>();

function getSkillNames(operatorId: string): Set<string> {
  if (skillNameCache.has(operatorId)) return skillNameCache.get(operatorId)!;
  const names = new Set(Object.keys(getSkillNameMap(operatorId)));
  skillNameCache.set(operatorId, names);
  return names;
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

/** Get skill names that map to a given category for an operator. */
function getSkillNamesForCategory(operatorId: string, category: string): string[] {
  const map = getSkillNameMap(operatorId);
  return Object.entries(map).filter(([_, cat]) => cat === category).map(([name]) => name);
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

// ── Scorching Fangs (data-driven: reads from wulfgard JSON statusEvents) ────

/** Scorching Fangs base duration: 15s at 120fps. */
const SCORCHING_FANGS_DURATION = 1800;

/**
 * Derives Scorching Fangs buff events from Combustion reaction events.
 * Finds the operator with SCORCHING_FANGS statusEvents (Wulfgard) dynamically.
 * P3+: Battle skill refreshes Scorching Fangs and shares it with teammates at 50%.
 */
export function deriveScorchingFangs(events: TimelineEvent[], loadoutStats?: Record<string, LoadoutStats>): TimelineEvent[] {
  // Find operator with SCORCHING_FANGS in statusEvents
  let sourceOpId: string | null = null;
  for (const opId of getAllOperatorIds()) {
    const json = getOperatorJson(opId);
    const statusEvents = json?.statusEvents as any[] | undefined;
    if (statusEvents?.some((se: any) => se.name === 'SCORCHING_FANGS')) {
      sourceOpId = opId;
      break;
    }
  }
  if (!sourceOpId) return events;

  const ownerSlotId = findSlot(events, sourceOpId);
  if (!ownerSlotId) return events;

  const stats = loadoutStats?.[ownerSlotId];
  const potential = stats?.potential ?? 0;

  // Get battle skill names for this operator
  const battleSkillNames = new Set(getSkillNamesForCategory(sourceOpId, 'BATTLE_SKILL'));

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

  const hasP3 = potential >= 3;
  const derived: TimelineEvent[] = [];
  const clamped = new Map<string, TimelineEvent>();

  type ActiveFang = { id: string; startFrame: number; endFrame: number };
  const activeFangs = new Map<string, ActiveFang[]>();

  const sortedCombustions = [...combustionEvents].sort((a, b) => a.startFrame - b.startFrame);

  // Collect battle skill cast frames for P3 refresh
  const battleSkillFrames: number[] = [];
  if (hasP3) {
    for (const ev of events) {
      if (ev.ownerId === ownerSlotId && battleSkillNames.has(ev.name)) {
        battleSkillFrames.push(ev.startFrame);
      }
    }
    battleSkillFrames.sort((a, b) => a - b);
  }

  let idCounter = 0;
  const makeFangId = (owner: string) => `sf-${owner}-${idCounter++}`;

  for (const combustion of sortedCombustions) {
    const frame = combustion.startFrame;
    const fangId = makeFangId(ownerSlotId);
    derived.push({
      id: fangId,
      name: StatusType.SCORCHING_FANGS,
      ownerId: ownerSlotId,
      columnId: StatusType.SCORCHING_FANGS,
      startFrame: frame,
      activationDuration: SCORCHING_FANGS_DURATION,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: combustion.sourceOwnerId,
      sourceSkillName: combustion.sourceSkillName,
    });
    const wulfFangs = activeFangs.get(ownerSlotId) ?? [];
    wulfFangs.push({ id: fangId, startFrame: frame, endFrame: frame + SCORCHING_FANGS_DURATION });
    activeFangs.set(ownerSlotId, wulfFangs);
  }

  // P3: Refresh on battle skill and share with team
  if (hasP3) {
    const battleSkillName = battleSkillNames.values().next().value ?? 'battle';
    for (const bsFrame of battleSkillFrames) {
      const wulfFangs = activeFangs.get(ownerSlotId) ?? [];
      const activeFang = wulfFangs.find((f) => bsFrame >= f.startFrame && bsFrame < f.endFrame);
      if (!activeFang) continue;

      for (const f of wulfFangs) {
        if (bsFrame >= f.startFrame && bsFrame < f.endFrame) {
          const existing = derived.find((ev) => ev.id === f.id);
          if (existing) {
            clamped.set(f.id, {
              ...existing,
              activationDuration: bsFrame - f.startFrame,
              eventStatus: EventStatusType.REFRESHED,
              eventStatusOwnerId: ownerSlotId,
              eventStatusSkillName: battleSkillName,
            });
          }
          f.endFrame = bsFrame;
        }
      }

      const refreshedId = makeFangId(ownerSlotId);
      derived.push({
        id: refreshedId,
        name: StatusType.SCORCHING_FANGS,
        ownerId: ownerSlotId,
        columnId: StatusType.SCORCHING_FANGS,
        startFrame: bsFrame,
        activationDuration: SCORCHING_FANGS_DURATION,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: ownerSlotId,
        sourceSkillName: battleSkillName,
      });
      wulfFangs.push({ id: refreshedId, startFrame: bsFrame, endFrame: bsFrame + SCORCHING_FANGS_DURATION });

      const sharedDuration = Math.floor(SCORCHING_FANGS_DURATION * 0.5);
      for (const slotId of Array.from(operatorSlots)) {
        if (slotId === ownerSlotId) continue;
        const slotFangs = activeFangs.get(slotId) ?? [];
        for (const f of slotFangs) {
          if (bsFrame >= f.startFrame && bsFrame < f.endFrame) {
            const existing = derived.find((ev) => ev.id === f.id);
            if (existing) {
              clamped.set(f.id, {
                ...existing,
                activationDuration: bsFrame - f.startFrame,
                eventStatus: EventStatusType.REFRESHED,
                eventStatusOwnerId: ownerSlotId,
                eventStatusSkillName: battleSkillName,
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
          sourceOwnerId: ownerSlotId,
          sourceSkillName: battleSkillName,
        });
        slotFangs.push({ id: sharedId, startFrame: bsFrame, endFrame: bsFrame + sharedDuration });
        activeFangs.set(slotId, slotFangs);
      }
    }
  }

  if (derived.length === 0) return events;
  const finalDerived = derived.map((ev) => clamped.get(ev.id) ?? ev);
  return [...events, ...finalDerived];
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

// ── Originium Crystal consumption (data-driven) ─────────────────────────────

/**
 * Consumes Originium Crystal events on the enemy when the source operator casts
 * battle skill or ultimate. Finds consuming skills via skillNameMap.
 */
export function consumeOriginiumCrystals(events: TimelineEvent[]): TimelineEvent[] {
  // Find operator with ORIGINIUM_CRYSTAL statusEvent
  let sourceOpId: string | null = null;
  for (const opId of getAllOperatorIds()) {
    const json = getOperatorJson(opId);
    const se = json?.statusEvents as any[] | undefined;
    if (se?.some((s: any) => s.name === 'ORIGINIUM_CRYSTAL')) {
      sourceOpId = opId;
      break;
    }
  }
  if (!sourceOpId) return events;

  const ownerSlotId = findSlot(events, sourceOpId);
  if (!ownerSlotId) return events;

  // Consuming skills: battle skill + ultimate
  const consumingNames = new Set([
    ...getSkillNamesForCategory(sourceOpId, 'BATTLE_SKILL'),
    ...getSkillNamesForCategory(sourceOpId, 'ULTIMATE'),
  ]);

  const consumeFrames: { frame: number; ownerId: string; skillName: string }[] = [];
  for (const ev of events) {
    if (ev.ownerId !== ownerSlotId) continue;
    if (consumingNames.has(ev.name)) {
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
    // Gilberta is identified by having GRAVITY_FIELD in her skillNameMap
    const map = getSkillNameMap(opId);
    if (Object.keys(map).some(name => name === 'GRAVITY_FIELD')) {
      sourceOpId = opId;
      break;
    }
  }
  if (!sourceOpId) return events;

  const ultimateNames = new Set(getSkillNamesForCategory(sourceOpId, 'ULTIMATE'));

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
    const map = getSkillNameMap(opId);
    if (Object.keys(map).some(name => name === 'WINTERS_DEVOURER')) {
      sourceOpId = opId;
      break;
    }
  }
  if (!sourceOpId) return events;

  const comboNames = new Set(getSkillNamesForCategory(sourceOpId, 'COMBO_SKILL'));

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
    const map = getSkillNameMap(opId);
    if (Object.keys(map).some(name => name === 'STACK_OVERFLOW')) {
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

// ── Wildland Trekker (data-driven) ──────────────────────────────────────────

const WILDLAND_TREKKER_DURATION = 1800;
const WILDLAND_TREKKER_PER_INTELLECT: Record<number, number> = { 1: 0.0005, 2: 0.0008 };
const TACTFUL_APPROACH_SUSCEPTIBILITY: Record<number, number> = { 1: 0.06, 2: 0.10 };
const TACTFUL_APPROACH_DURATION = 1200;

/**
 * Derives Wildland Trekker trigger stacks and team buff.
 * Finds Arclight dynamically by checking for WILDLAND_TREKKER_TRIGGER in statusEvents.
 */
export function deriveWildlandTrekker(
  events: TimelineEvent[],
  loadoutStats?: Record<string, LoadoutStats>,
): TimelineEvent[] {
  // Find operator with WILDLAND_TREKKER_TRIGGER in statusEvents
  let sourceOpId: string | null = null;
  for (const opId of getAllOperatorIds()) {
    const json = getOperatorJson(opId);
    const statusEvents = json?.statusEvents as any[] | undefined;
    if (statusEvents?.some((se: any) => se.name === 'WILDLAND_TREKKER_TRIGGER')) {
      sourceOpId = opId;
      break;
    }
  }
  if (!sourceOpId) return events;

  const ownerSlotId = findSlot(events, sourceOpId);
  if (!ownerSlotId) return events;

  const stats = loadoutStats?.[ownerSlotId];
  const potential = stats?.potential ?? 0;
  const talentTwoLevel = stats?.talentTwoLevel ?? 0;

  const derived: TimelineEvent[] = [];
  const clamped = new Map<string, TimelineEvent>();
  let idCounter = 0;

  // Get battle skill and ultimate names
  const battleSkillNames = new Set(getSkillNamesForCategory(sourceOpId, 'BATTLE_SKILL'));
  const ultimateNames = new Set(getSkillNamesForCategory(sourceOpId, 'ULTIMATE'));

  // ── Wildland Trekker: trigger stacks + team buff ──────────────────────────
  if (talentTwoLevel >= 1) {
    const threshold = potential >= 5 ? 2 : 3;
    const perIntellect = WILDLAND_TREKKER_PER_INTELLECT[talentTwoLevel] ?? WILDLAND_TREKKER_PER_INTELLECT[1];
    const p3Multiplier = potential >= 3 ? 1.3 : 1.0;
    const statusValue = perIntellect * p3Multiplier;

    const battleSkillCasts = events
      .filter((ev) => ev.ownerId === ownerSlotId && battleSkillNames.has(ev.name))
      .sort((a, b) => a.startFrame - b.startFrame);

    const electrificationEvents = events.filter(
      (ev) => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === REACTION_COLUMNS.ELECTRIFICATION,
    );

    const pendingTriggers: { id: string; startFrame: number }[] = [];
    let activeBuff: { id: string; startFrame: number; endFrame: number } | null = null;
    const battleSkillName = battleSkillNames.values().next().value ?? 'battle';

    for (const cast of battleSkillCasts) {
      const hasElectrification = electrificationEvents.some((ef) => {
        const end = ef.startFrame + ef.activationDuration;
        return ef.startFrame <= cast.startFrame && cast.startFrame < end;
      });

      if (!hasElectrification) continue;

      const triggerId = `wt-trigger-${ownerSlotId}-${idCounter++}`;
      derived.push({
        id: triggerId,
        name: StatusType.WILDLAND_TREKKER,
        ownerId: ownerSlotId,
        columnId: OPERATOR_COLUMNS.WILDLAND_TREKKER_TRIGGER,
        startFrame: cast.startFrame,
        activationDuration: TOTAL_FRAMES * 10,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: ownerSlotId,
        sourceSkillName: battleSkillName,
      });
      pendingTriggers.push({ id: triggerId, startFrame: cast.startFrame });

      if (pendingTriggers.length >= threshold) {
        for (const trigger of pendingTriggers) {
          const existing = derived.find((ev) => ev.id === trigger.id);
          if (existing) {
            clamped.set(trigger.id, {
              ...existing,
              activationDuration: cast.startFrame - trigger.startFrame,
              eventStatus: EventStatusType.CONSUMED,
              eventStatusOwnerId: ownerSlotId,
              eventStatusSkillName: battleSkillName,
            });
          }
        }
        pendingTriggers.length = 0;

        const currentBuff = activeBuff;
        if (currentBuff && cast.startFrame < currentBuff.endFrame) {
          const existing = derived.find((ev) => ev.id === currentBuff.id);
          if (existing) {
            clamped.set(currentBuff.id, {
              ...existing,
              activationDuration: cast.startFrame - currentBuff.startFrame,
              eventStatus: EventStatusType.REFRESHED,
              eventStatusOwnerId: ownerSlotId,
              eventStatusSkillName: battleSkillName,
            });
          }
        }

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
          sourceOwnerId: ownerSlotId,
          sourceSkillName: battleSkillName,
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
      (ev) => ev.ownerId === ownerSlotId && ultimateNames.has(ev.name),
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
        sourceOwnerId: ownerSlotId,
        sourceSkillName: ult.name,
        susceptibility: { [ElementType.ELECTRIC]: suscValue },
      });
    }
  }

  if (derived.length === 0) return events;
  const finalDerived = derived.map((ev) => clamped.get(ev.id) ?? ev);
  return [...events, ...finalDerived];
}
