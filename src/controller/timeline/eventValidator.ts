/**
 * Event validation — computes warnings for placed timeline events.
 *
 * Validates combo windows, resource availability (SP / ultimate energy),
 * empowered skill prerequisites, and time-stop overlap constraints.
 */
import { TimelineEvent, SkillType, EventSegmentData } from '../../consts/viewTypes';
import { CombatSkillsType } from '../../consts/enums';
import { SKILL_LABELS } from '../../consts/channelLabels';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { ALWAYS_AVAILABLE_TRIGGERS, COMBO_WINDOW_COLUMN_ID } from './processInteractions';
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

// ── SP-insufficient zones ─────────────────────────────────────────────────────

export type SpZone = { start: number; end: number };

/**
 * Computes frame ranges where SP is below a given battle skill cost.
 * Walks the SP resource graph, finding threshold crossings via linear interpolation.
 * Returns a map from slotId → array of insufficient zones.
 */
export function computeSpInsufficientZones(
  resourceGraphs: Map<string, ResourceGraphData>,
  slots: Slot[],
): Map<string, SpZone[]> {
  const zones = new Map<string, SpZone[]>();
  const spKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
  const graph = resourceGraphs.get(spKey);
  if (!graph || graph.points.length < 2) return zones;
  const pts = graph.points;

  for (const slot of slots) {
    if (!slot.operator) continue;
    const cost = slot.operator.skills.battle.skillPointCost ?? 100;

    const gaps: SpZone[] = [];
    let insuffStart: number | null = pts[0].value < cost ? pts[0].frame : null;

    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];

      if (prev.frame === curr.frame) {
        if (curr.value < cost && insuffStart === null) {
          insuffStart = curr.frame;
        } else if (curr.value >= cost && insuffStart !== null) {
          gaps.push({ start: insuffStart, end: curr.frame });
          insuffStart = null;
        }
        continue;
      }

      const prevBelow = prev.value < cost;
      const currBelow = curr.value < cost;

      if (prevBelow && !currBelow) {
        const t = (cost - prev.value) / (curr.value - prev.value);
        const crossFrame = Math.round(prev.frame + t * (curr.frame - prev.frame));
        if (insuffStart !== null) {
          gaps.push({ start: insuffStart, end: crossFrame });
          insuffStart = null;
        }
      } else if (!prevBelow && currBelow) {
        const t = (cost - prev.value) / (curr.value - prev.value);
        const crossFrame = Math.round(prev.frame + t * (curr.frame - prev.frame));
        insuffStart = crossFrame;
      }
    }

    if (insuffStart !== null) {
      gaps.push({ start: insuffStart, end: pts[pts.length - 1].frame });
    }

    if (gaps.length > 0) {
      zones.set(slot.slotId, gaps);
    }
  }
  return zones;
}

/**
 * Clamps a drag delta to prevent battle events from landing in SP-insufficient zones.
 * Skips zones that contain the event's current position (created by the event's own SP cost).
 * Returns the clamped delta.
 */
export function clampDeltaBySpZones(
  clampedDelta: number,
  eventId: string,
  events: TimelineEvent[],
  startFrame: number,
  spZones: Map<string, SpZone[]>,
): number {
  const ev = events.find((e) => e.id === eventId);
  if (!ev || ev.columnId !== 'battle') return clampedDelta;
  const zones = spZones.get(ev.ownerId);
  if (!zones || zones.length === 0) return clampedDelta;

  const target = startFrame + clampedDelta;

  for (const zone of zones) {
    // Skip zones containing the event's drag-start position (self-caused)
    if (startFrame >= zone.start && startFrame < zone.end) continue;
    if (target >= zone.start && target < zone.end) {
      if (clampedDelta >= 0) {
        // Dragging down (later) → stop just before zone
        return Math.max(0, zone.start - 1 - startFrame);
      } else {
        // Dragging up (earlier) → stop just after zone
        return Math.min(0, zone.end - startFrame);
      }
    }
  }
  return clampedDelta;
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

// ── Resource availability for placement ───────────────────────────────────────

export type ResourceAvailability = {
  sufficient: boolean;
  reason?: string;
};

/**
 * Checks whether the resource (SP or ultimate energy) is sufficient to place
 * an event of a given column type at a given frame.
 */
export function checkResourceAvailability(
  columnId: string,
  ownerId: string,
  atFrame: number,
  resourceGraphs: Map<string, ResourceGraphData>,
  slots: Slot[],
): ResourceAvailability {
  if (columnId === 'ultimate') {
    const ultKey = `${ownerId}-ultimate`;
    const graph = resourceGraphs.get(ultKey);
    if (graph) {
      const val = preConsumptionValue(graph, atFrame);
      if (val !== null && val < graph.max) {
        return { sufficient: false, reason: `Not enough ultimate energy (${Math.floor(val)}/${graph.max})` };
      }
    }
  } else if (columnId === 'battle') {
    const slot = slots.find((s) => s.slotId === ownerId);
    const spCost = slot?.operator?.skills.battle.skillPointCost ?? 100;
    const spKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
    const spGraph = resourceGraphs.get(spKey);
    if (spGraph) {
      const val = preConsumptionValue(spGraph, atFrame);
      if (val !== null && val < spCost) {
        return { sufficient: false, reason: `Not enough SP (${Math.floor(val)}/${spCost})` };
      }
    }
  }
  return { sufficient: true };
}

// ── Segment addition overlap ─────────────────────────────────────────────────

/**
 * Checks if adding a segment to an event would cause it to overlap siblings.
 */
export function wouldSegmentAdditionOverlap(
  event: TimelineEvent,
  addedDurationFrames: number,
  events: TimelineEvent[],
): boolean {
  const currentRange = event.nonOverlappableRange
    ?? (event.segments ? event.segments.reduce((sum, s) => sum + s.durationFrames, 0) : 0);
  const newRange = currentRange + addedDurationFrames;

  return events.some((sib) => {
    if (sib.id === event.id || sib.ownerId !== event.ownerId || sib.columnId !== event.columnId) return false;
    const sibRange = sib.nonOverlappableRange
      ?? (sib.segments ? sib.segments.reduce((sum, seg) => sum + seg.durationFrames, 0) : 0);
    if (sibRange > 0 && event.startFrame >= sib.startFrame && event.startFrame < sib.startFrame + sibRange) return true;
    if (newRange > 0 && sib.startFrame >= event.startFrame && sib.startFrame < event.startFrame + newRange) return true;
    return false;
  });
}

// ── Duplicate placement validation ───────────────────────────────────────────

/**
 * Checks if a duplicated event can be placed at a given frame.
 * Validates SP zone violations for battle skills.
 */
export function isDuplicatePlacementInSpZone(
  event: TimelineEvent,
  ghostFrame: number,
  spZones: Map<string, SpZone[]>,
): boolean {
  if (event.columnId !== 'battle') return false;
  const zones = spZones.get(event.ownerId);
  if (!zones) return false;
  return zones.some((z) => ghostFrame >= z.start && ghostFrame < z.end);
}

// ── Combo window drag clamping ────────────────────────────────────────────────

/**
 * Clamps a drag delta to keep a combo event within its activation window.
 * Uses the processed events to find combo windows for the event's owner.
 * Non-combo events pass through unchanged.
 */
export function clampDeltaByComboWindow(
  clampedDelta: number,
  eventId: string,
  events: TimelineEvent[],
  startFrame: number,
  processedEvents: readonly TimelineEvent[],
): number {
  const ev = events.find((e) => e.id === eventId);
  if (!ev || ev.columnId !== 'combo') {
    return clampedDelta;
  }

  const windows = processedEvents.filter(
    (e) => e.columnId === COMBO_WINDOW_COLUMN_ID && e.ownerId === ev.ownerId,
  );
  if (windows.length === 0) return clampedDelta;

  // Compute window end frame using segments if available (same as comboWindowEndFrame)
  const windowEndFrame = (w: TimelineEvent) => {
    const duration = w.segments
      ? w.segments.reduce((sum, s) => sum + s.durationFrames, 0)
      : w.activationDuration;
    return w.startFrame + duration;
  };

  // Find the window the event started in
  const origWindow = windows.find((w) => {
    return startFrame >= w.startFrame && startFrame < windowEndFrame(w);
  });
  if (!origWindow) return clampedDelta;

  const windowStart = origWindow.startFrame;
  const windowEnd = windowEndFrame(origWindow);
  const target = startFrame + clampedDelta;

  if (target < windowStart) {
    return windowStart - startFrame;
  }
  if (target >= windowEnd) {
    return windowEnd - 1 - startFrame;
  }
  return clampedDelta;
}

// ── Event placement checks ────────────────────────────────────────────────────

/**
 * Checks if placing an event at `atFrame` would overlap with existing sibling
 * events in the same column, using nonOverlappableRange from segments.
 */
export function wouldOverlapSiblings(
  ownerId: string,
  columnId: string,
  atFrame: number,
  range: number,
  events: TimelineEvent[],
): boolean {
  if (range <= 0) return false;
  return events.some((sib) => {
    if (sib.ownerId !== ownerId || sib.columnId !== columnId) return false;
    const sibRange = sib.segments
      ? sib.segments.reduce((sum, s) => sum + s.durationFrames, 0)
      : (sib.nonOverlappableRange ?? 0);
    if (sibRange > 0 && atFrame >= sib.startFrame && atFrame < sib.startFrame + sibRange) return true;
    if (sib.startFrame >= atFrame && sib.startFrame < atFrame + range) return true;
    return false;
  });
}

/**
 * Checks if placing an event of a given column type at `atFrame` is blocked
 * by an active time-stop animation region.
 *
 * Returns `{ blocked: false }` or `{ blocked: true, reason: string }`.
 */
export function isBlockedByTimeStop(
  columnId: string,
  atFrame: number,
  timeStopRegions: TimeStopRegion[],
): { blocked: boolean; reason?: string } {
  if (columnId !== 'ultimate') {
    const ultBlock = timeStopRegions.some(
      (stop) => stop.sourceColumnId === 'ultimate' && atFrame >= stop.startFrame && atFrame < stop.startFrame + stop.durationFrames,
    );
    if (ultBlock) return { blocked: true, reason: 'Ultimate animation active' };
  }
  if (columnId === 'battle') {
    const comboBlock = timeStopRegions.some(
      (stop) => stop.sourceColumnId === 'combo' && atFrame >= stop.startFrame && atFrame < stop.startFrame + stop.durationFrames,
    );
    if (comboBlock) return { blocked: true, reason: 'Combo animation active' };
  }
  return { blocked: false };
}

/**
 * Computes the non-overlappable frame range for a prospective event
 * from its segments or default activation duration.
 */
export function computeProspectiveRange(
  defaultSkill: { defaultActivationDuration?: number; segments?: EventSegmentData[] } | null,
): number {
  if (defaultSkill?.segments) return defaultSkill.segments.reduce((sum, s) => sum + s.durationFrames, 0);
  return defaultSkill?.defaultActivationDuration ?? 0;
}

// ── Combo window availability ─────────────────────────────────────────────────

export type ComboWindowAvailability = {
  available: boolean;
  reason?: string;
  /** The combo trigger column ID from the matching window, if any. */
  comboTriggerColumnId?: string;
};

/**
 * Checks whether a combo skill can be placed at a given frame for an owner.
 *
 * Checks:
 * - A combo activation window exists for this owner at this frame
 * - The window hasn't already been consumed by another combo event
 * - Always-available combo operators bypass window checks
 */
export function checkComboWindowAvailability(
  ownerId: string,
  atFrame: number,
  events: TimelineEvent[],
  alwaysAvailableSlots: Set<string>,
): ComboWindowAvailability {
  if (alwaysAvailableSlots.has(ownerId)) {
    return { available: true };
  }

  const windowEvents = events.filter(
    (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === ownerId,
  );
  const matchingWindow = windowEvents.find((w) => {
    const endFrame = w.startFrame + w.activationDuration;
    return atFrame >= w.startFrame && atFrame < endFrame;
  });

  if (!matchingWindow) {
    return { available: false, reason: 'No trigger active' };
  }

  const windowConsumed = events.some((ev) =>
    ev.columnId === 'combo' && ev.ownerId === ownerId &&
    ev.startFrame >= matchingWindow.startFrame &&
    ev.startFrame < matchingWindow.startFrame + matchingWindow.activationDuration,
  );

  if (windowConsumed) {
    return { available: false, reason: 'Combo skill already activated' };
  }

  return { available: true, comboTriggerColumnId: matchingWindow.comboTriggerColumnId };
}

// ── Segment / frame contiguity ────────────────────────────────────────────────

/**
 * Validates that an event's segments and frames form contiguous runs.
 * Returns an array of warning strings (empty if valid).
 *
 * - Segments: present segments must be consecutive within allSegmentLabels.
 * - Frames: within each segment, present frames must form a consecutive run
 *   starting at index 0 relative to allDefaultSegments.
 */
export function validateSegmentContiguity(
  segments: EventSegmentData[],
  allSegmentLabels?: string[],
  allDefaultSegments?: EventSegmentData[],
): string[] {
  const warnings: string[] = [];

  // Segment-level contiguity
  if (allSegmentLabels && allSegmentLabels.length > 1 && segments.length < allSegmentLabels.length) {
    const presentLabels = new Set(segments.map((s) => s.label));
    const indices = allSegmentLabels
      .map((l, i) => presentLabels.has(l) ? i : -1)
      .filter((i) => i >= 0);
    for (let j = 1; j < indices.length; j++) {
      if (indices[j] !== indices[j - 1] + 1) {
        const missingLabels = allSegmentLabels.filter((l) => !presentLabels.has(l));
        warnings.push(`Non-contiguous sequences (missing: ${missingLabels.join(', ')})`);
        break;
      }
    }
  }

  // Frame-level contiguity per segment
  if (allDefaultSegments) {
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const defaultSeg = allDefaultSegments.find((ds) => ds.label === seg.label) ?? allDefaultSegments[si];
      const allFrameOffsets = defaultSeg?.frames?.map((f) => f.offsetFrame) ?? [];
      const presentOffsets = new Set((seg.frames ?? []).map((f) => f.offsetFrame));
      if (allFrameOffsets.length > 0 && presentOffsets.size < allFrameOffsets.length) {
        const presentIndices = allFrameOffsets
          .map((o, i) => presentOffsets.has(o) ? i : -1)
          .filter((i) => i >= 0);
        const isNonContiguous = presentIndices.length === 0 ||
          presentIndices[0] !== 0 ||
          presentIndices.some((idx, j) => j > 0 && idx !== presentIndices[j - 1] + 1);
        if (isNonContiguous) {
          const missingNums = allFrameOffsets
            .map((o, i) => presentOffsets.has(o) ? null : i + 1)
            .filter((n) => n !== null);
          warnings.push(`Sequence ${seg.label ?? si + 1}: non-contiguous frames (missing: ${missingNums.join(', ')})`);
        }
      }
    }
  }

  return warnings;
}

// ── Variant availability ─────────────────────────────────────────────────────

export type VariantAvailability = {
  disabled: boolean;
  reason?: string;
};

/**
 * Determines whether an event variant is available at a given frame.
 *
 * Checks:
 * - Enhanced variants require an active ultimate
 * - Non-enhanced variants are unavailable while ultimate is active
 * - Empowered variants require max Melting Flame stacks (4)
 */
export function checkVariantAvailability(
  variantName: string,
  ownerId: string,
  events: TimelineEvent[],
  atFrame: number,
): VariantAvailability {
  const isEnhanced = variantName.includes('ENHANCED');
  const isEmpowered = variantName.includes('EMPOWERED');

  // Check if the ultimate is active at this frame
  const ultActive = events.some((ev) =>
    ev.ownerId === ownerId && ev.columnId === 'ultimate'
    && atFrame >= ev.startFrame + ev.activationDuration
    && atFrame < ev.startFrame + ev.activationDuration + ev.activeDuration,
  );

  if (isEnhanced && !ultActive) {
    return { disabled: true, reason: 'No ultimate active' };
  }
  if (!isEnhanced && ultActive) {
    return { disabled: true, reason: 'Ultimate is active (use enhanced variant)' };
  }

  // Check Melting Flame stacks for empowered variants
  if (isEmpowered) {
    const mfActiveCount = events.filter(
      (ev) =>
        ev.ownerId === ownerId &&
        ev.columnId === 'melting-flame' &&
        ev.startFrame <= atFrame &&
        ev.startFrame + ev.activationDuration > atFrame,
    ).length;
    if (mfActiveCount < 4) {
      return { disabled: true, reason: `Requires max Melting Flame (${mfActiveCount}/4)` };
    }
  }

  return { disabled: false };
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
  skipIds?: ReadonlySet<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  const spKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;

  for (const ev of events) {
    if (skipIds?.has(ev.id)) continue;
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
        mf.startFrame + mf.activationDuration > ev.startFrame,
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
