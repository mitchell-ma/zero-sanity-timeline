/**
 * Event validation — computes warnings for placed timeline events.
 *
 * Validates combo windows, resource availability (SP / ultimate energy),
 * empowered skill prerequisites, and time-stop overlap constraints.
 */
import { TimelineEvent, SkillType } from '../../consts/viewTypes';
import { CombatSkillsType } from '../../consts/enums';
import { SKILL_LABELS } from '../../consts/channelLabels';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { ALWAYS_AVAILABLE_TRIGGERS, COMBO_WINDOW_COLUMN_ID } from './processInflictions';
import type { Slot } from './columnBuilder';
import type { ResourceGraphData } from '../../app/useResourceGraphs';

export type TimeStopRegion = {
  startFrame: number;
  durationFrames: number;
  ownerId: string;
  sourceColumnId: string;
};

// ── Time-stop regions ─────────────────────────────────────────────────────────

export function computeTimeStopRegions(events: TimelineEvent[]): TimeStopRegion[] {
  const stops: TimeStopRegion[] = [];
  for (const ev of events) {
    const anim = ev.animationDuration;
    if (!anim || anim <= 0) continue;
    const isTimeStop = ev.columnId === 'ultimate' || ev.columnId === 'combo' ||
      (ev.columnId === 'dash' && ev.isPerfectDodge);
    if (!isTimeStop) continue;
    stops.push({ startFrame: ev.startFrame, durationFrames: anim, ownerId: ev.ownerId, sourceColumnId: ev.columnId });
  }
  return stops;
}

// ── Resource graph helpers ────────────────────────────────────────────────────

/**
 * Get the pre-consumption value at a frame from a resource graph.
 * When multiple points exist at the same frame (pre/post consumption),
 * returns the highest value (the pre-consumption level).
 */
export function preConsumptionValue(
  graph: ResourceGraphData | undefined,
  frame: number,
): number | null {
  if (!graph || graph.points.length === 0) return null;
  const pts = graph.points;
  let maxAtFrame = -Infinity;
  let foundAtFrame = false;
  let lastBeforeIdx = 0;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].frame > frame) break;
    if (pts[i].frame === frame) {
      foundAtFrame = true;
      maxAtFrame = Math.max(maxAtFrame, pts[i].value);
    } else {
      lastBeforeIdx = i;
    }
  }
  if (foundAtFrame) return maxAtFrame;
  const p0 = pts[lastBeforeIdx];
  const p1 = pts[lastBeforeIdx + 1];
  if (!p1 || p0.frame === p1.frame) return p0.value;
  const t = (frame - p0.frame) / (p1.frame - p0.frame);
  return p0.value + t * (p1.value - p0.value);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getAlwaysAvailableComboSlots(slots: Slot[]): Set<string> {
  const set = new Set<string>();
  for (const s of slots) {
    const cap = s.operator?.triggerCapability;
    if (cap && cap.comboRequires.some((t) => ALWAYS_AVAILABLE_TRIGGERS.has(t))) {
      set.add(s.slotId);
    }
  }
  return set;
}

// ── Validation functions ──────────────────────────────────────────────────────

export function validateComboWindows(
  events: TimelineEvent[],
  slots: Slot[],
  draggingIds: Set<string> | null,
): Map<string, string> {
  const map = new Map<string, string>();

  const alwaysAvailable = new Set<string>();
  for (const s of slots) {
    const cap = s.operator?.triggerCapability;
    if (cap && cap.comboRequires.some((t) => ALWAYS_AVAILABLE_TRIGGERS.has(t))) {
      alwaysAvailable.add(s.slotId);
    }
  }

  const windowEvents = events.filter((ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID);
  const consumedWindows = new Map<string, string>();

  // First pass: non-dragged events consume windows
  for (const ev of events) {
    if (draggingIds?.has(ev.id)) continue;
    if (ev.columnId !== 'combo') continue;
    if (alwaysAvailable.has(ev.ownerId)) continue;
    const ownerWindows = windowEvents.filter((w) => w.ownerId === ev.ownerId);
    if (ownerWindows.length === 0) {
      map.set(ev.id, 'No combo trigger window available');
      continue;
    }
    const matchingWindow = ownerWindows.find((w) => {
      const endFrame = w.startFrame + w.activationDuration;
      return ev.startFrame >= w.startFrame && ev.startFrame < endFrame;
    });
    if (!matchingWindow) {
      map.set(ev.id, 'Outside combo trigger window');
      continue;
    }
    const existing = consumedWindows.get(matchingWindow.id);
    if (existing) {
      map.set(ev.id, 'Combo skill already activated by another combo');
    } else {
      consumedWindows.set(matchingWindow.id, ev.id);
    }
  }

  // Second pass: dragged events check windows without consuming
  if (draggingIds) {
    for (const ev of events) {
      if (!draggingIds.has(ev.id)) continue;
      if (ev.columnId !== 'combo') continue;
      if (alwaysAvailable.has(ev.ownerId)) continue;
      const ownerWindows = windowEvents.filter((w) => w.ownerId === ev.ownerId);
      if (ownerWindows.length === 0) {
        map.set(ev.id, 'No combo trigger window available');
        continue;
      }
      const matchingWindow = ownerWindows.find((w) => {
        const endFrame = w.startFrame + w.activationDuration;
        return ev.startFrame >= w.startFrame && ev.startFrame < endFrame;
      });
      if (!matchingWindow) {
        map.set(ev.id, 'Outside combo trigger window');
        continue;
      }
      const existing = consumedWindows.get(matchingWindow.id);
      if (existing) {
        map.set(ev.id, 'Combo skill already activated by another combo');
      }
    }
  }

  return map;
}

export function validateResources(
  events: TimelineEvent[],
  resourceGraphs: Map<string, ResourceGraphData>,
  slots: Slot[],
): Map<string, string> {
  const map = new Map<string, string>();
  const spKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;

  for (const ev of events) {
    if (ev.columnId === 'ultimate') {
      const ultKey = `${ev.ownerId}-ultimate`;
      const graph = resourceGraphs.get(ultKey);
      if (!graph) continue;
      const val = preConsumptionValue(graph, ev.startFrame);
      if (val !== null && val < graph.max) {
        map.set(ev.id, `Not enough ultimate energy (${Math.floor(val)}/${graph.max})`);
      }
    } else if (ev.columnId === 'battle') {
      const slot = slots.find((s) => s.slotId === ev.ownerId);
      const spCost = slot?.operator?.skills.battle.skillPointCost ?? 100;
      const spGraph = resourceGraphs.get(spKey);
      if (!spGraph) continue;
      const val = preConsumptionValue(spGraph, ev.startFrame);
      if (val !== null && val < spCost) {
        map.set(ev.id, `Not enough SP (${Math.floor(val)}/${spCost})`);
      }
    }
  }
  return map;
}

export function validateEmpowered(events: TimelineEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  const empoweredNames = new Set([
    CombatSkillsType.SMOULDERING_FIRE_EMPOWERED,
    CombatSkillsType.SMOULDERING_FIRE_ENHANCED_EMPOWERED,
  ]);
  for (const ev of events) {
    if (!empoweredNames.has(ev.name as CombatSkillsType)) continue;
    const mfEvents = events.filter(
      (mf) =>
        mf.ownerId === ev.ownerId &&
        mf.columnId === 'melting-flame' &&
        mf.startFrame <= ev.startFrame &&
        mf.startFrame + mf.activeDuration > ev.startFrame,
    );
    if (mfEvents.length < 4) {
      map.set(ev.id, `Requires max Melting Flame stacks (${mfEvents.length}/4)`);
    }
  }
  return map;
}

export function validateTimeStops(
  events: TimelineEvent[],
  timeStopRegions: TimeStopRegion[],
): Map<string, string> {
  const map = new Map<string, string>();
  const ultStops = timeStopRegions.filter((s) => s.sourceColumnId === 'ultimate');
  const comboStops = timeStopRegions.filter((s) => s.sourceColumnId === 'combo');
  for (const ev of events) {
    if (ev.columnId === 'ultimate') continue;
    for (const stop of ultStops) {
      if (ev.startFrame >= stop.startFrame && ev.startFrame < stop.startFrame + stop.durationFrames) {
        const skillType = ev.columnId.charAt(0).toUpperCase() + ev.columnId.slice(1) + ' skill';
        map.set(ev.id, `${skillType} input is not possible during ultimate animations`);
        break;
      }
    }
    if (ev.columnId === 'battle' && !map.has(ev.id)) {
      for (const stop of comboStops) {
        if (ev.startFrame >= stop.startFrame && ev.startFrame < stop.startFrame + stop.durationFrames) {
          map.set(ev.id, 'Battle skill input is not possible during combo animations');
          break;
        }
      }
    }
  }
  return map;
}
