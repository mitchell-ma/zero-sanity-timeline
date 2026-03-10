/**
 * Pure event validation and creation functions.
 *
 * Extracts the event CRUD logic from App.tsx so it can be tested
 * independently and keeps the view layer thin.
 */

import { TimelineEvent, EventSegmentData } from '../../consts/viewTypes';
import { REACTION_COLUMN_IDS } from '../../model/channels';
import { MeltingFlameController } from './meltingFlameController';
import { ComboSkillEventController } from './comboSkillEventController';
import { WindowsMap } from '../combat-loadout';

// ── ID generation ───────────────────────────────────────────────────────────

let _id = 1;

export function genEventId(): string {
  return `ev-${_id++}`;
}

export function setNextEventId(id: number): void {
  _id = id;
}

export function getNextEventId(): number {
  return _id;
}

// ── Non-overlappable range helpers ──────────────────────────────────────────

function getRange(ev: TimelineEvent): number {
  return ev.nonOverlappableRange
    ?? (ev.segments ? ev.segments.reduce((sum, s) => sum + s.durationFrames, 0) : 0);
}

/**
 * Returns true if placing `ev` at `startFrame` would conflict with a sibling's
 * non-overlappable range, or if `ev`'s own range would cover a sibling.
 */
export function wouldOverlapNonOverlappable(
  allEvents: TimelineEvent[],
  ev: TimelineEvent,
  startFrame: number,
): boolean {
  const evRange = getRange(ev);
  for (const sib of allEvents) {
    if (sib.id === ev.id || sib.ownerId !== ev.ownerId || sib.columnId !== ev.columnId) continue;
    const sibRange = getRange(sib);
    if (sibRange > 0 && startFrame >= sib.startFrame && startFrame < sib.startFrame + sibRange) return true;
    if (evRange > 0 && sib.startFrame >= startFrame && sib.startFrame < startFrame + evRange) return true;
  }
  return false;
}

/**
 * Clamp `desiredFrame` so that `ev` doesn't overlap any sibling's non-overlappable range.
 * Returns the closest valid frame in the direction of `desiredFrame` from `ev.startFrame`.
 */
export function clampNonOverlappable(
  allEvents: TimelineEvent[],
  ev: TimelineEvent,
  desiredFrame: number,
): number {
  const evRange = getRange(ev);
  if (evRange === 0) return desiredFrame;
  let result = desiredFrame;
  for (const sib of allEvents) {
    if (sib.id === ev.id || sib.ownerId !== ev.ownerId || sib.columnId !== ev.columnId) continue;
    const sibRange = getRange(sib);
    if (sibRange === 0 && evRange === 0) continue;
    const evEnd = result + evRange;
    const sibEnd = sib.startFrame + sibRange;
    if (evEnd > sib.startFrame && result < sibEnd) {
      if (desiredFrame < ev.startFrame) {
        result = Math.max(result, sibEnd);
      } else {
        result = Math.min(result, sib.startFrame - evRange);
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
  } | null,
): TimelineEvent {
  const isForced = ownerId === 'enemy' && REACTION_COLUMN_IDS.has(columnId);
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
      nonOverlappableRange: defaultSkill.segments.reduce((sum, s) => sum + s.durationFrames, 0),
    } : {}),
    ...(defaultSkill?.gaugeGain ? { gaugeGain: defaultSkill.gaugeGain } : {}),
    ...(defaultSkill?.teamGaugeGain ? { teamGaugeGain: defaultSkill.teamGaugeGain } : {}),
    ...(defaultSkill?.gaugeGainByEnemies ? { gaugeGainByEnemies: defaultSkill.gaugeGainByEnemies } : {}),
    ...(defaultSkill?.animationDuration ? { animationDuration: defaultSkill.animationDuration } : {}),
  };
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
  activationWindows: WindowsMap,
): TimelineEvent | null {
  let validated = MeltingFlameController.validateUpdate(allEvents, target, updates);
  validated = ComboSkillEventController.validateUpdate(target, validated, activationWindows);
  const merged = { ...target, ...validated };
  if (wouldOverlapNonOverlappable(allEvents, merged, merged.startFrame)) return null;
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
  activationWindows: WindowsMap,
): number {
  let clamped = MeltingFlameController.validateMove(allEvents, target, newStartFrame);
  clamped = ComboSkillEventController.validateMove(target, clamped, activationWindows);
  clamped = clampNonOverlappable(allEvents, target, clamped);
  return clamped;
}
