/**
 * Pure event validation and creation functions.
 *
 * Extracts the event CRUD logic from App.tsx so it can be tested
 * independently and keeps the view layer thin.
 */

import { EventFrameType } from '../../consts/enums';
import { TimelineEvent, EventSegmentData, Operator, computeSegmentsSpan } from '../../consts/viewTypes';
import { ENEMY_OWNER_ID, OPERATOR_COLUMNS, REACTION_COLUMN_IDS, SKILL_COLUMNS } from '../../model/channels';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { ComboSkillEventController } from './comboSkillEventController';
import { hasEnhanceClauseAtFrame } from './eventValidator';
import type { CombatLoadout } from '../combat-loadout/combatLoadout';

// ── ID generation ───────────────────────────────────────────────────────────

let _id = 1;

// ── Combat context ──────────────────────────────────────────────────────────

let _combatLoadout: CombatLoadout | null = null;

export function setCombatLoadout(ctx: CombatLoadout | null): void {
  _combatLoadout = ctx;
}

export function hasSufficientSP(ownerId: string, frame: number): boolean {
  return _combatLoadout?.hasSufficientSP(ownerId, frame) ?? true;
}

export function genEventId(): string {
  return `ev-${_id++}-${Math.random().toString(36).slice(2, 6)}`;
}

export function setNextEventId(id: number): void {
  _id = id;
}

export function getNextEventId(): number {
  return _id;
}

// ── Non-overlappable range helpers ──────────────────────────────────────────

function getRange(ev: TimelineEvent): number {
  // Prefer segments (may be time-stop-extended) over static nonOverlappableRange
  if (ev.segments) return computeSegmentsSpan(ev.segments);
  return ev.nonOverlappableRange ?? 0;
}

/**
 * Look up the processed (time-stop-extended) version of a sibling for range
 * calculation. Falls back to the raw event if no processed list is provided.
 */
function getSibRange(sib: TimelineEvent, processedEvents?: readonly TimelineEvent[]): number {
  const resolved = processedEvents?.find((e) => e.id === sib.id) ?? sib;
  return getRange(resolved);
}

/**
 * Returns true if placing `ev` at `startFrame` would conflict with a sibling's
 * non-overlappable range, or if `ev`'s own range would cover a sibling.
 *
 * When `processedEvents` is provided, sibling ranges use their time-stop-extended
 * durations so that overlap checks account for the visual (real-time) footprint.
 */
export function wouldOverlapNonOverlappable(
  allEvents: TimelineEvent[],
  ev: TimelineEvent,
  startFrame: number,
  processedEvents?: readonly TimelineEvent[],
): boolean {
  const evRange = getSibRange(ev, processedEvents);
  for (const sib of allEvents) {
    if (sib.id === ev.id || sib.ownerId !== ev.ownerId || sib.columnId !== ev.columnId) continue;
    const sibRange = getSibRange(sib, processedEvents);
    if (sibRange > 0 && startFrame >= sib.startFrame && startFrame < sib.startFrame + sibRange) return true;
    if (evRange > 0 && sib.startFrame >= startFrame && sib.startFrame < startFrame + evRange) return true;
  }
  return false;
}

/**
 * Clamp `desiredFrame` so that `ev` doesn't overlap any sibling's non-overlappable range.
 * Returns the closest valid frame in the direction of `desiredFrame` from `ev.startFrame`.
 *
 * When `processedEvents` is provided, sibling ranges use their time-stop-extended
 * durations so that overlap checks account for the visual (real-time) footprint.
 */
export function clampNonOverlappable(
  allEvents: TimelineEvent[],
  ev: TimelineEvent,
  desiredFrame: number,
  processedEvents?: readonly TimelineEvent[],
): number {
  const evRange = getSibRange(ev, processedEvents);
  if (evRange === 0) return desiredFrame;
  const movingForward = desiredFrame >= ev.startFrame;
  let result = desiredFrame;
  for (const sib of allEvents) {
    if (sib.id === ev.id || sib.ownerId !== ev.ownerId || sib.columnId !== ev.columnId) continue;
    const sibRange = getSibRange(sib, processedEvents);
    if (sibRange === 0 && evRange === 0) continue;
    const sibEnd = sib.startFrame + sibRange;
    const evEnd = result + evRange;
    if (evEnd > sib.startFrame && result < sibEnd) {
      // Direct overlap at target — clamp to nearest edge
      if (movingForward) {
        result = Math.min(result, sib.startFrame - evRange);
      } else {
        result = Math.max(result, sibEnd);
      }
    } else if (sibRange > 0) {
      // Fast drag skipped entirely past sibling — clamp to the entry edge
      if (movingForward && ev.startFrame + evRange <= sib.startFrame && result >= sibEnd) {
        result = Math.min(result, sib.startFrame - evRange);
      } else if (!movingForward && ev.startFrame >= sibEnd && result + evRange <= sib.startFrame) {
        result = Math.max(result, sibEnd);
      }
    }
  }
  return Math.max(0, result);
}

// ── Event creation ──────────────────────────────────────────────────────────

export function createEvent(
  ownerId: string,
  columnId: string,
  atFrame: number,
  defaultSkill: {
    name?: string;
    defaultActivationDuration?: number;
    defaultActiveDuration?: number;
    defaultCooldownDuration?: number;
    segments?: EventSegmentData[];
    gaugeGain?: number;
    teamGaugeGain?: number;
    gaugeGainByEnemies?: Record<number, number>;
    animationDuration?: number;
    operatorPotential?: number;
    timeInteraction?: string;
    isPerfectDodge?: boolean;
    timeStop?: number;
    timeDependency?: import('../../consts/enums').TimeDependency;
    skillPointCost?: number;
    sourceOwnerId?: string;
    sourceSkillName?: string;
  } | null,
): TimelineEvent {
  const isForced = ownerId === ENEMY_OWNER_ID && REACTION_COLUMN_IDS.has(columnId);
  return {
    id: genEventId(),
    name: defaultSkill?.name ?? columnId,
    ownerId,
    columnId,
    startFrame: atFrame,
    activationDuration: defaultSkill?.defaultActivationDuration ?? 120,
    activeDuration: defaultSkill?.defaultActiveDuration ?? 0,
    cooldownDuration: defaultSkill?.defaultCooldownDuration ?? 0,
    ...(isForced ? { isForced: true } : {}),
    ...(defaultSkill?.segments ? {
      segments: defaultSkill.segments,
      nonOverlappableRange: computeSegmentsSpan(defaultSkill.segments),
    } : {}),
    ...(columnId === SKILL_COLUMNS.ULTIMATE && !defaultSkill?.segments ? {
      nonOverlappableRange: (defaultSkill?.defaultActivationDuration ?? 120)
        + (defaultSkill?.defaultActiveDuration ?? 0)
        + (defaultSkill?.defaultCooldownDuration ?? 0),
    } : {}),
    ...(columnId === OPERATOR_COLUMNS.DASH ? {
      nonOverlappableRange: defaultSkill?.defaultActivationDuration ?? 120,
    } : {}),
    ...(defaultSkill?.gaugeGain ? { gaugeGain: defaultSkill.gaugeGain } : {}),
    ...(defaultSkill?.teamGaugeGain ? { teamGaugeGain: defaultSkill.teamGaugeGain } : {}),
    ...(defaultSkill?.gaugeGainByEnemies ? { gaugeGainByEnemies: defaultSkill.gaugeGainByEnemies } : {}),
    ...(defaultSkill?.animationDuration ? { animationDuration: defaultSkill.animationDuration } : {}),
    ...(defaultSkill?.operatorPotential != null ? { operatorPotential: defaultSkill.operatorPotential } : {}),
    ...(defaultSkill?.timeInteraction ? { timeInteraction: defaultSkill.timeInteraction } : {}),
    ...(defaultSkill?.isPerfectDodge ? { isPerfectDodge: defaultSkill.isPerfectDodge } : {}),
    ...(defaultSkill?.timeStop ? { timeStop: defaultSkill.timeStop } : {}),
    ...(defaultSkill?.timeDependency ? { timeDependency: defaultSkill.timeDependency } : {}),
    ...(defaultSkill?.skillPointCost != null ? { skillPointCost: defaultSkill.skillPointCost } : {}),
    ...(defaultSkill?.sourceOwnerId ? { sourceOwnerId: defaultSkill.sourceOwnerId } : {}),
    ...(defaultSkill?.sourceSkillName ? { sourceSkillName: defaultSkill.sourceSkillName } : {}),
  };
}

// ── Ultimate animation constraint ────────────────────────────────────────────

/**
 * Returns true if `frame` falls within any ultimate's animation region,
 * excluding the ultimate event itself (an ultimate can exist at its own start).
 */
export function isInUltimateAnimation(
  allEvents: TimelineEvent[],
  frame: number,
  excludeEventId?: string,
): boolean {
  for (const ev of allEvents) {
    if (ev.id === excludeEventId) continue;
    if (ev.columnId !== SKILL_COLUMNS.ULTIMATE) continue;
    const animDur = ev.animationDuration;
    if (!animDur || animDur <= 0) continue;
    if (frame >= ev.startFrame && frame < ev.startFrame + animDur) return true;
  }
  return false;
}

/**
 * If `desiredFrame` lands inside an ultimate animation region, clamp to the
 * nearest edge based on drag direction. Events are allowed to skip over
 * the region entirely — only landing inside is blocked.
 */
function clampToUltimateEdge(
  allEvents: TimelineEvent[],
  target: TimelineEvent,
  desiredFrame: number,
): number {
  const movingForward = desiredFrame >= target.startFrame;
  let result = desiredFrame;
  for (const ev of allEvents) {
    if (ev.id === target.id || ev.columnId !== SKILL_COLUMNS.ULTIMATE) continue;
    const animDur = ev.animationDuration;
    if (!animDur || animDur <= 0) continue;
    const animEnd = ev.startFrame + animDur;
    if (result >= ev.startFrame && result < animEnd) {
      result = movingForward ? ev.startFrame - 1 : animEnd;
    }
  }
  return result;
}

// ── Combo animation constraint ───────────────────────────────────────────────

/**
 * Returns true if `frame` falls within any combo skill's animation region.
 * Battle skills cannot start during a combo animation time-stop.
 */
export function isInComboAnimation(
  allEvents: TimelineEvent[],
  frame: number,
  excludeEventId?: string,
): boolean {
  for (const ev of allEvents) {
    if (ev.id === excludeEventId) continue;
    if (ev.columnId !== SKILL_COLUMNS.COMBO) continue;
    const animDur = ev.animationDuration;
    if (!animDur || animDur <= 0) continue;
    if (frame >= ev.startFrame && frame < ev.startFrame + animDur) return true;
  }
  return false;
}

/**
 * If `desiredFrame` lands inside a combo animation region and the target is a
 * battle skill, clamp to the nearest edge based on drag direction.
 */
function clampToComboEdge(
  allEvents: TimelineEvent[],
  target: TimelineEvent,
  desiredFrame: number,
): number {
  const movingForward = desiredFrame >= target.startFrame;
  let result = desiredFrame;
  for (const ev of allEvents) {
    if (ev.id === target.id || ev.columnId !== SKILL_COLUMNS.COMBO) continue;
    const animDur = ev.animationDuration;
    if (!animDur || animDur <= 0) continue;
    const animEnd = ev.startFrame + animDur;
    if (result >= ev.startFrame && result < animEnd) {
      result = movingForward ? ev.startFrame - 1 : animEnd;
    }
  }
  return result;
}

// ── Enhanced → ENHANCE clause constraint ─────────────────────────────────

/** Map column IDs to DSL ENHANCE object types. */
const COLUMN_TO_ENHANCE_OBJECT: Record<string, string> = {
  basic: 'BASIC_ATTACK',
  battle: 'BATTLE_SKILL',
  combo: 'COMBO_SKILL',
  ultimate: 'ULTIMATE',
};

/**
 * Clamp enhanced events so that all segment start frames remain within
 * an active ENHANCE clause window.
 */
function clampToEnhanceWindow(
  allEvents: TimelineEvent[],
  target: TimelineEvent,
  desiredFrame: number,
): number {
  const enhanceObject = COLUMN_TO_ENHANCE_OBJECT[target.columnId];
  if (!enhanceObject) return target.startFrame;

  // Find the ENHANCE window by scanning for a frame that has the clause
  if (!hasEnhanceClauseAtFrame(allEvents, target.ownerId, enhanceObject, desiredFrame)) {
    return target.startFrame; // desired frame outside ENHANCE window
  }
  return desiredFrame;
}

// ── Event validation ────────────────────────────────────────────────────────

/**
 * Validate an event update through the MeltingFlame and ComboSkill controllers,
 * then check non-overlappable constraints. Returns the merged event or null if invalid.
 */
export function validateUpdate(
  allEvents: TimelineEvent[],
  target: TimelineEvent,
  updates: Partial<TimelineEvent>,
  processedEvents?: readonly TimelineEvent[] | null,
): TimelineEvent | null {
  // ── Field-level clamping ──────────────────────────────────────────────────
  const clamped = { ...updates };

  // Clamp durations to >= 0
  if (clamped.activationDuration != null) clamped.activationDuration = Math.max(0, clamped.activationDuration);
  if (clamped.activeDuration != null) clamped.activeDuration = Math.max(0, clamped.activeDuration);
  if (clamped.cooldownDuration != null) clamped.cooldownDuration = Math.max(0, clamped.cooldownDuration);
  if (clamped.startFrame != null) clamped.startFrame = Math.max(0, clamped.startFrame);

  // Clamp animation duration to activation duration
  if (clamped.animationDuration != null) {
    const activation = clamped.activationDuration ?? target.activationDuration;
    clamped.animationDuration = Math.max(0, Math.min(clamped.animationDuration, activation));
  }

  // Clamp segment durations and inner frame offsets
  if (clamped.segments) {
    clamped.segments = clamped.segments.map((seg) => {
      const dur = Math.max(1, seg.durationFrames);
      const updated = { ...seg, durationFrames: dur };
      if (updated.frames) {
        const maxOffset = Math.max(0, dur - 1);
        updated.frames = updated.frames
          .map((f) => {
            const clamped = { ...f, offsetFrame: Math.max(0, Math.min(maxOffset, f.offsetFrame)) };
            // Populate final strike values from templates, clear for normal hits
            const types = clamped.frameTypes ?? [EventFrameType.NORMAL];
            if (types.includes(EventFrameType.FINAL_STRIKE)) {
              if (clamped.skillPointRecovery === 0 && clamped.templateFinalStrikeSP) {
                clamped.skillPointRecovery = clamped.templateFinalStrikeSP;
              }
              if (clamped.stagger === 0 && clamped.templateFinalStrikeStagger) {
                clamped.stagger = clamped.templateFinalStrikeStagger;
              }
            } else if (!types.includes(EventFrameType.NORMAL)) {
              clamped.skillPointRecovery = 0;
            }
            return clamped;
          });
      }
      return updated;
    });
  }

  let validated = { ...clamped };
  validated = ComboSkillEventController.validateUpdate(target, validated, processedEvents as TimelineEvent[] | null);
  const merged = { ...target, ...validated };
  if (wouldOverlapNonOverlappable(allEvents, merged, merged.startFrame, processedEvents ?? undefined)) return null;
  // Block non-ultimate events from being placed during an ultimate animation
  if (merged.columnId !== SKILL_COLUMNS.ULTIMATE && isInUltimateAnimation(allEvents, merged.startFrame, merged.id)) return null;
  // Block battle skills from being placed during a combo animation
  if (merged.columnId === SKILL_COLUMNS.BATTLE && isInComboAnimation(allEvents, merged.startFrame, merged.id)) return null;
  // Empowered battle skills require 4 active Melting Flame stacks
  if (merged.name?.includes('EMPOWERED')) {
    const mfSource = processedEvents ?? allEvents;
    const mfCount = mfSource.filter(
      (e) => e.ownerId === merged.ownerId && e.columnId === OPERATOR_COLUMNS.MELTING_FLAME
        && e.startFrame <= merged.startFrame && e.startFrame + e.activationDuration > merged.startFrame,
    ).length;
    if (mfCount < 4) return null;
  }
  // Enhanced battle skills require an active ultimate
  if (merged.name?.includes('ENHANCED') && !merged.name?.includes('EMPOWERED')) {
    const ultActive = allEvents.some(
      (e) => e.id !== merged.id && e.ownerId === merged.ownerId && e.columnId === SKILL_COLUMNS.ULTIMATE
        && merged.startFrame >= e.startFrame + e.activationDuration
        && merged.startFrame < e.startFrame + e.activationDuration + e.activeDuration,
    );
    if (!ultActive) return null;
  }
  return merged;
}

/**
 * Validate an event move through the MeltingFlame and ComboSkill controllers,
 * then clamp to non-overlappable constraints. Returns the clamped frame.
 */
export function validateMove(
  allEvents: TimelineEvent[],
  target: TimelineEvent,
  newStartFrame: number,
  processedEvents?: readonly TimelineEvent[] | null,
): number {
  let clamped = Math.max(0, Math.min(TOTAL_FRAMES - 1, newStartFrame));
  clamped = ComboSkillEventController.validateMove(target, clamped, processedEvents as TimelineEvent[] | null);
  clamped = clampNonOverlappable(allEvents, target, clamped, processedEvents ?? undefined);
  // Clamp non-ultimate events to the edge of ultimate animation regions
  if (target.columnId !== SKILL_COLUMNS.ULTIMATE) {
    clamped = clampToUltimateEdge(allEvents, target, clamped);
  }
  // Clamp battle/basic skills to the edge of combo animation regions
  if (target.columnId === SKILL_COLUMNS.BATTLE || target.columnId === SKILL_COLUMNS.BASIC) {
    clamped = clampToComboEdge(allEvents, target, clamped);
  }
  // Clamp enhanced events within the ENHANCE clause window
  if (target.name?.includes('ENHANCED') && !target.name?.includes('EMPOWERED')) {
    clamped = clampToEnhanceWindow(allEvents, target, clamped);
  }
  return clamped;
}

/**
 * Validate a batch move: compute the most restrictive delta across all events
 * so that relative frame positions are preserved. Returns the clamped delta
 * (add to each event's original startFrame).
 */
export function validateBatchMoveDelta(
  allEvents: TimelineEvent[],
  targetIds: string[],
  delta: number,
  processedEvents?: readonly TimelineEvent[] | null,
): number {
  let clampedDelta = delta;
  for (const id of targetIds) {
    const target = allEvents.find((ev) => ev.id === id);
    if (!target) continue;
    const desired = target.startFrame + clampedDelta;
    const clamped = validateMove(allEvents, target, desired, processedEvents);
    const effectiveDelta = clamped - target.startFrame;
    if (delta >= 0) {
      clampedDelta = Math.min(clampedDelta, effectiveDelta);
    } else {
      clampedDelta = Math.max(clampedDelta, effectiveDelta);
    }
  }
  return clampedDelta;
}

// ── Column-based event filtering ─────────────────────────────────────────

/**
 * Build a Set of valid "ownerId:columnId" pairs from the controller-produced
 * columns. Used both for filtering stale events and for gating new additions.
 */
export function buildValidColumnPairs(
  columns: readonly { type: string; ownerId: string; columnId?: string; matchColumnIds?: string[] }[],
): Set<string> {
  const pairs = new Set<string>();
  for (const col of columns) {
    if (col.type !== 'mini-timeline' || !col.columnId) continue;
    pairs.add(`${col.ownerId}:${col.columnId}`);
    if (col.matchColumnIds) {
      for (const id of col.matchColumnIds) {
        pairs.add(`${col.ownerId}:${id}`);
      }
    }
  }
  return pairs;
}

/**
 * Filter events to only those whose ownerId/columnId match a column produced
 * by the controller. The columns array is the source of truth for what
 * subtimelines exist — events with no matching column are discarded.
 */
export function filterEventsToColumns(
  events: TimelineEvent[],
  columns: readonly { type: string; ownerId: string; columnId?: string; matchColumnIds?: string[] }[],
): TimelineEvent[] {
  const validPairs = buildValidColumnPairs(columns);
  return events.filter((ev) => validPairs.has(`${ev.ownerId}:${ev.columnId}`));
}

// ── Operator swap validation ─────────────────────────────────────────────

/**
 * Remove events that belong to a slot whose operator changed.
 * Events carry operator-specific skill names, durations, and frame data,
 * so they are invalid when the operator is swapped.
 *
 * If the new operator is the same as the previous one, events are kept.
 */
export function filterEventsOnOperatorChange(
  events: TimelineEvent[],
  slotId: string,
  prevOperator: Operator | null,
  newOperator: Operator | null,
): TimelineEvent[] {
  if (prevOperator?.id === newOperator?.id) return events;
  return events.filter((ev) => ev.ownerId !== slotId);
}
