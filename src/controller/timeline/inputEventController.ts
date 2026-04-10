/**
 * Pure event validation and creation functions.
 *
 * Extracts the event CRUD logic from App.tsx so it can be tested
 * independently and keeps the view layer thin.
 */

import { v4 as uuidv4 } from 'uuid';
import { NounType } from '../../dsl/semantics';
import { ColumnType, EnhancementType, EventFrameType } from '../../consts/enums';
import { TimelineEvent, EventSegmentData, Operator, computeSegmentsSpan, getAnimationDuration, eventEndFrame, durationSegment } from '../../consts/viewTypes';
import { ENEMY_ID, REACTION_COLUMN_IDS, INFLICTION_COLUMN_IDS, COMBO_WINDOW_COLUMN_ID } from '../../model/channels';

import { TOTAL_FRAMES } from '../../utils/timeline';
import { ComboSkillEventController } from './comboSkillEventController';
import { hasEnableClauseAtFrame } from './eventValidator';
import { isResetStatus } from './eventPresentationController';
import type { CombatLoadoutController } from '../combat-loadout/combatLoadoutController';
import { hasSkillPointClause, buildSkillPointRecoveryClause, hasStaggerClause, buildDealStaggerClause, stripStaggerClauses } from './clauseQueries';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';

// `cloneAndSplitEvents` + `resetSegmentCloneCache` + the
// segment clone cache moved into `./parser/cloneAndSplit.ts`. Re-exported
// here for existing external callers; new callers should import from
// `./parser` directly.
export { cloneAndSplitEvents, resetSegmentCloneCache } from './parser';

/**
 * Append a synthetic RECOVER SKILL_POINT clause for the perfect-dodge bonus
 * onto the first frame of the first segment. If no first frame exists, one
 * is added at offset 0. Returns a new segments array — does not mutate input.
 */
function attachPerfectDodgeSpClause(segments: EventSegmentData[]): EventSegmentData[] {
  if (segments.length === 0) return segments;
  const clause = buildSkillPointRecoveryClause(GENERAL_MECHANICS.skillPoints.perfectDodgeRecovery);
  const out = [...segments];
  const seg0 = out[0];
  const frames = seg0.frames ? [...seg0.frames] : [{ offsetFrame: 0 }];
  const f0 = frames[0];
  frames[0] = { ...f0, clauses: [...(f0.clauses ?? []), clause] };
  out[0] = { ...seg0, frames };
  return out;
}

// ── UID generation ──────────────────────────────────────────────────────────

let _uid = 1;

// ── Combat context ──────────────────────────────────────────────────────────

let _combatLoadout: CombatLoadoutController | null = null;

export function setCombatLoadout(ctx: CombatLoadoutController | null): void {
  _combatLoadout = ctx;
}

export function hasSufficientSP(ownerEntityId: string, frame: number): boolean {
  return _combatLoadout?.hasSufficientSP(ownerEntityId, frame) ?? true;
}

export function genEventUid(): string {
  return `ev-${_uid++}-${uuidv4()}`;
}

/**
 * Deterministic UID for pipeline-derived events.
 * Uses a per-prefix sequence counter that resets each pipeline run.
 * Same pipeline execution order → same UIDs across ticks.
 */
const _derivedSeq = new Map<string, number>();

export function resetDerivedEventUids() { _derivedSeq.clear(); }

export function derivedEventUid(columnId: string, sourceEntityId: string, frame: number, disambiguator?: string) {
  const prefix = disambiguator
    ? `d-${columnId}-${sourceEntityId}-${frame}-${disambiguator}`
    : `d-${columnId}-${sourceEntityId}-${frame}`;
  const seq = _derivedSeq.get(prefix) ?? 0;
  _derivedSeq.set(prefix, seq + 1);
  return seq === 0 ? prefix : `${prefix}-${seq}`;
}

export function setNextEventUid(id: number): void {
  _uid = id;
}

export function getNextEventUid(): number {
  return _uid;
}

// ── Non-overlappable range helpers ──────────────────────────────────────────

function getRange(ev: TimelineEvent): number {
  if (ev.nonOverlappableRange == null) return 0;
  // Prefer segments (may be time-stop-extended) over static nonOverlappableRange
  if (ev.segments) return computeSegmentsSpan(ev.segments);
  return ev.nonOverlappableRange;
}

/**
 * Look up the processed (time-stop-extended) version of a sibling for range
 * calculation. Falls back to the raw event if no processed list is provided.
 */
function getSibRange(sib: TimelineEvent, processedEvents?: readonly TimelineEvent[]): number {
  const resolved = processedEvents?.find((e) => e.uid === sib.uid) ?? sib;
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
  // Enemy inflictions are stackable — skip overlap check
  if (ev.ownerEntityId === ENEMY_ID && INFLICTION_COLUMN_IDS.has(ev.columnId)) return false;
  const evIsReset = ev.id && isResetStatus(ev.id);
  // Combo skills in multi-skill activation windows bypass overlap against siblings in the same window
  const comboWindowBypass = ev.columnId === NounType.COMBO && processedEvents
    ? findMultiSkillWindow(ev.ownerEntityId, startFrame, processedEvents)
    : undefined;
  const evRange = getSibRange(ev, processedEvents);
  for (const sib of allEvents) {
    if (sib.uid === ev.uid || sib.ownerEntityId !== ev.ownerEntityId || sib.columnId !== ev.columnId) continue;
    // RESET statuses clamp same-id siblings — skip overlap check only for those
    if (evIsReset && sib.id === ev.id) continue;
    // Combo skills in the same multi-skill activation window bypass overlap
    if (comboWindowBypass && sib.columnId === NounType.COMBO &&
        sib.startFrame >= comboWindowBypass.startFrame &&
        sib.startFrame < eventEndFrame(comboWindowBypass)) continue;
    const sibRange = getSibRange(sib, processedEvents);
    if (sibRange > 0 && startFrame >= sib.startFrame && startFrame < sib.startFrame + sibRange) return true;
    if (evRange > 0 && sib.startFrame >= startFrame && sib.startFrame < startFrame + evRange) return true;
  }
  return false;
}

/** Find an activation window with maxSkills > 1 containing the given frame for this owner. */
function findMultiSkillWindow(ownerEntityId: string, frame: number, processedEvents: readonly TimelineEvent[]): TimelineEvent | undefined {
  for (const ev of processedEvents) {
    if (ev.columnId !== COMBO_WINDOW_COLUMN_ID || ev.ownerEntityId !== ownerEntityId) continue;
    if ((ev.maxSkills ?? 1) <= 1) continue;
    if (frame >= ev.startFrame && frame < eventEndFrame(ev)) return ev;
  }
  return undefined;
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
  const evIsReset = ev.id && isResetStatus(ev.id);
  const comboWindowBypass = ev.columnId === NounType.COMBO && processedEvents
    ? findMultiSkillWindow(ev.ownerEntityId, desiredFrame, processedEvents)
    : undefined;
  const evRange = getSibRange(ev, processedEvents);
  if (evRange === 0) return desiredFrame;
  const movingForward = desiredFrame >= ev.startFrame;
  let result = desiredFrame;
  for (const sib of allEvents) {
    if (sib.uid === ev.uid || sib.ownerEntityId !== ev.ownerEntityId || sib.columnId !== ev.columnId) continue;
    // RESET statuses clamp same-id siblings — skip overlap check only for those
    if (evIsReset && sib.id === ev.id) continue;
    if (comboWindowBypass && sib.columnId === NounType.COMBO &&
        sib.startFrame >= comboWindowBypass.startFrame &&
        sib.startFrame < eventEndFrame(comboWindowBypass)) continue;
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

/**
 * Clamps a drag delta to prevent an event from overlapping siblings,
 * with support for the invalid→revalidated state machine.
 *
 * If `overlapInvalidAtDragStart` contains this event, the event was already
 * overlapping at drag start. Free movement is allowed until the target
 * reaches a non-overlapping position, at which point the event is removed
 * from the set and added to `overlapRevalidated` (clamped going forward).
 */
export function clampDeltaByOverlap(
  clampedDelta: number,
  eventUid: string,
  allEvents: TimelineEvent[],
  startFrame: number,
  draggedIds: Set<string>,
  processedEvents?: readonly TimelineEvent[],
  overlapInvalidAtDragStart?: Set<string>,
  overlapRevalidated?: Set<string>,
): number {
  const ev = allEvents.find((e) => e.uid === eventUid);
  if (!ev) return clampedDelta;
  // Control events are passive state markers — no overlap constraints
  if (ev.id === NounType.CONTROL) return clampedDelta;
  const evIsReset = ev.id && isResetStatus(ev.id);
  const evRange = getSibRange(ev, processedEvents);
  if (evRange === 0) return clampedDelta;

  const target = startFrame + clampedDelta;

  // Collect non-dragged siblings in the same column
  const siblings: { start: number; end: number }[] = [];
  for (const sib of allEvents) {
    if (sib.uid === ev.uid || sib.ownerEntityId !== ev.ownerEntityId || sib.columnId !== ev.columnId) continue;
    if (draggedIds.has(sib.uid)) continue; // skip other dragged events
    // RESET statuses clamp same-id siblings — skip overlap check only for those
    if (evIsReset && sib.id === ev.id) continue;
    const sibRange = getSibRange(sib, processedEvents);
    if (sibRange <= 0) continue;
    siblings.push({ start: sib.startFrame, end: sib.startFrame + sibRange });
  }
  if (siblings.length === 0) return clampedDelta;

  const wouldOverlap = (frame: number) =>
    siblings.some((s) => frame < s.end && frame + evRange > s.start);

  // Event was overlapping at drag start — allow free movement until it
  // reaches a non-overlapping position.
  if (overlapInvalidAtDragStart?.has(eventUid)) {
    if (wouldOverlap(target)) return clampedDelta; // still overlapping, free movement
    // Target is now valid — transition to revalidated
    overlapInvalidAtDragStart.delete(eventUid);
    overlapRevalidated?.add(eventUid);
    return clampedDelta; // current position is valid, no clamping needed
  }

  // Normal overlap clamping (including revalidated events)
  if (!wouldOverlap(target)) return clampedDelta;

  // Revalidated events: startFrame may be inside an overlap zone.
  // Use nearest-boundary clamping so the event can't re-enter the zone.
  if (overlapRevalidated?.has(eventUid)) {
    let lo = -Infinity;
    let hi = Infinity;
    for (const s of siblings) {
      if (target + evRange <= s.start || target >= s.end) continue;
      const overlapStart = s.start - evRange;
      const overlapEnd = s.end;
      if (startFrame >= overlapStart && startFrame < overlapEnd) {
        // startFrame is inside this overlap zone — snap to nearest edge
        const distToLeft = target - overlapStart;
        const distToRight = overlapEnd - target;
        if (distToLeft <= distToRight) {
          hi = Math.min(hi, overlapStart - startFrame);
        } else {
          lo = Math.max(lo, overlapEnd - startFrame);
        }
      } else {
        // Normal sibling — directional edge clamping
        if (clampedDelta >= 0) {
          hi = Math.min(hi, overlapStart - startFrame);
        } else {
          lo = Math.max(lo, overlapEnd - startFrame);
        }
      }
    }
    return Math.max(lo, Math.min(hi, clampedDelta));
  }

  // Find the nearest valid position by clamping to sibling edges
  if (clampedDelta >= 0) {
    // Moving forward — stop just before the first blocking sibling
    let best = clampedDelta;
    for (const s of siblings) {
      if (target + evRange > s.start && target < s.end) {
        const edgeDelta = s.start - evRange - startFrame;
        if (edgeDelta >= 0) {
          best = Math.min(best, edgeDelta);
        }
      }
    }
    return best;
  } else {
    // Moving backward — stop just after the first blocking sibling
    let best = clampedDelta;
    for (const s of siblings) {
      if (target < s.end && target + evRange > s.start) {
        const edgeDelta = s.end - startFrame;
        if (edgeDelta <= 0) {
          best = Math.max(best, edgeDelta);
        }
      }
    }
    return best;
  }
}

// ── Event creation ──────────────────────────────────────────────────────────

export function createEvent(
  ownerEntityId: string,
  columnId: string,
  atFrame: number,
  defaultSkill: {
    id?: string;
    name?: string;
    segments?: EventSegmentData[];
    operatorPotential?: number;
    timeInteraction?: string;
    isPerfectDodge?: boolean;
    timeStop?: number;
    timeDependency?: import('../../consts/enums').TimeDependency;
    skillPointCost?: number;
    sourceEntityId?: string;
    sourceSkillName?: string;
    enhancementType?: import('../../consts/enums').EnhancementType;
    stacks?: Record<string, unknown>;
    segmentOrigin?: number[];
    suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
    parameterValues?: Record<string, number>;
    susceptibility?: Partial<Record<import('../../consts/enums').ElementType, number>>;
  } | null,
  interactionMode?: import('../../consts/enums').InteractionModeType,
): TimelineEvent {
  const isForced = ownerEntityId === ENEMY_ID && REACTION_COLUMN_IDS.has(columnId);
  let segments = defaultSkill?.segments ?? durationSegment(120);
  // Perfect-dodge SP recovery is delivered via a RECOVER SKILL_POINT clause
  // attached to the dash event's first frame at offset 0. The interpret() →
  // doRecover → DEC.recordSkillPointRecovery path then routes the gain through
  // the single SP ingress. Replaces the legacy synthetic 'sp-recovery' event
  // scan that previously lived in skillPointController.deriveSPRecoveryEvents.
  if (defaultSkill?.isPerfectDodge) {
    segments = attachPerfectDodgeSpClause(segments);
  }
  const span = computeSegmentsSpan(segments);
  const stackLimit = (defaultSkill?.stacks?.limit as { value?: number } | undefined)?.value ?? 1;
  const isStackable = stackLimit > 1 || (ownerEntityId === ENEMY_ID && INFLICTION_COLUMN_IDS.has(columnId));
  const eventId = defaultSkill?.id ?? columnId;
  return {
    uid: genEventUid(),
    id: eventId,
    name: eventId,
    ownerEntityId,
    columnId,
    startFrame: atFrame,
    segments,
    ...(isForced ? { isForced: true } : {}),
    // Stackable events (status stacks, enemy inflictions) allow overlap
    ...(span > 0 && !isStackable ? { nonOverlappableRange: span } : {}),
    ...(defaultSkill?.operatorPotential != null ? { operatorPotential: defaultSkill.operatorPotential } : {}),
    ...(defaultSkill?.timeInteraction ? { timeInteraction: defaultSkill.timeInteraction } : {}),
    ...(defaultSkill?.isPerfectDodge ? { isPerfectDodge: defaultSkill.isPerfectDodge } : {}),
    ...(defaultSkill?.timeStop ? { timeStop: defaultSkill.timeStop } : {}),
    ...(defaultSkill?.timeDependency ? { timeDependency: defaultSkill.timeDependency } : {}),
    ...(defaultSkill?.skillPointCost != null ? { skillPointCost: defaultSkill.skillPointCost } : {}),
    sourceEntityId: defaultSkill?.sourceEntityId ?? ownerEntityId,
    sourceSkillName: defaultSkill?.sourceSkillName ?? 'Freeform',
    ...(defaultSkill?.enhancementType ? { enhancementType: defaultSkill.enhancementType } : {}),
    ...(interactionMode ? { creationInteractionMode: interactionMode } : {}),
    ...(defaultSkill?.segmentOrigin ? { segmentOrigin: defaultSkill.segmentOrigin } : {}),
    ...(defaultSkill?.suppliedParameters ? { suppliedParameters: defaultSkill.suppliedParameters } : {}),
    ...(defaultSkill?.parameterValues ? { parameterValues: defaultSkill.parameterValues } : {}),
    ...(defaultSkill?.susceptibility ? { susceptibility: defaultSkill.susceptibility } : {}),
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
    if (ev.uid === excludeEventId) continue;
    if (ev.columnId !== NounType.ULTIMATE) continue;
    const animDur = getAnimationDuration(ev);
    if (animDur <= 0) continue;
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
    if (ev.uid === target.uid || ev.columnId !== NounType.ULTIMATE) continue;
    const animDur = getAnimationDuration(ev);
    if (animDur <= 0) continue;
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
    if (ev.uid === excludeEventId) continue;
    if (ev.columnId !== NounType.COMBO) continue;
    const animDur = getAnimationDuration(ev);
    if (animDur <= 0) continue;
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
    if (ev.uid === target.uid || ev.columnId !== NounType.COMBO) continue;
    const animDur = getAnimationDuration(ev);
    if (animDur <= 0) continue;
    const animEnd = ev.startFrame + animDur;
    if (result >= ev.startFrame && result < animEnd) {
      result = movingForward ? ev.startFrame - 1 : animEnd;
    }
  }
  return result;
}

// ── Enhanced → ENABLE clause constraint ──────────────────────────────────

/**
 * Clamp enhanced events so that all segment start frames remain within
 * an active ENABLE clause window targeting this variant's ID.
 */
function clampToEnableWindow(
  allEvents: TimelineEvent[],
  target: TimelineEvent,
  desiredFrame: number,
): number {
  // Find the ENABLE window by scanning for a frame that has the clause
  if (!hasEnableClauseAtFrame(allEvents, target.ownerEntityId, target.name, desiredFrame)) {
    return target.startFrame; // desired frame outside ENABLE window
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

  // Clamp startFrame to >= 0
  if (clamped.startFrame != null) clamped.startFrame = Math.max(0, clamped.startFrame);

  // Clamp segment durations and inner frame offsets
  if (clamped.segments) {
    clamped.segments = clamped.segments.map((seg) => {
      const dur = Math.max(1, seg.properties.duration);
      const updated = { ...seg, properties: { ...seg.properties, duration: dur } };
      if (updated.frames) {
        const maxOffset = Math.max(0, dur - 1);
        updated.frames = updated.frames
          .map((f) => {
            const clamped = { ...f, offsetFrame: Math.max(0, Math.min(maxOffset, f.offsetFrame)) };
            // Populate final-strike templates onto the active stagger field; the
            // active SP value rides on a RECOVER SKILL_POINT clause attached to
            // whichever frame is currently the final strike. When a frame becomes
            // FINAL_STRIKE, synthesize the clause from templateFinalStrikeSP. When
            // a frame loses FINAL_STRIKE, strip any SP clause it carries.
            const types = clamped.frameTypes ?? [EventFrameType.NORMAL];
            if (types.includes(EventFrameType.FINAL_STRIKE)) {
              const hasSp = hasSkillPointClause(clamped.clauses);
              if (!hasSp && clamped.templateFinalStrikeSP) {
                clamped.clauses = [
                  ...(clamped.clauses ?? []),
                  buildSkillPointRecoveryClause(clamped.templateFinalStrikeSP),
                ];
              }
              const hasStagger = hasStaggerClause(clamped.clauses);
              if (!hasStagger && clamped.templateFinalStrikeStagger) {
                clamped.clauses = [
                  ...(clamped.clauses ?? []),
                  buildDealStaggerClause(clamped.templateFinalStrikeStagger),
                ];
              }
            } else if (!types.includes(EventFrameType.NORMAL)) {
              if (hasSkillPointClause(clamped.clauses)) {
                clamped.clauses = (clamped.clauses ?? []).map(p => ({
                  ...p,
                  effects: p.effects.filter(e => {
                    const dsl = (e as { dslEffect?: { verb?: string; object?: string } }).dslEffect;
                    return !(dsl && (dsl.verb === 'RECOVER' || dsl.verb === 'RETURN') && dsl.object === 'SKILL_POINT');
                  }),
                })).filter(p => p.effects.length > 0);
              }
              if (hasStaggerClause(clamped.clauses)) {
                clamped.clauses = stripStaggerClauses(clamped.clauses);
              }
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
  if (merged.columnId !== NounType.ULTIMATE && isInUltimateAnimation(allEvents, merged.startFrame, merged.uid)) return null;
  // Block battle skills from being placed during a combo animation
  if (merged.columnId === NounType.BATTLE && isInComboAnimation(allEvents, merged.startFrame, merged.uid)) return null;
  // Enhanced skills require an active ultimate
  if (merged.enhancementType === EnhancementType.ENHANCED) {
    const ultActive = allEvents.some(
      (e) => e.uid !== merged.uid && e.ownerEntityId === merged.ownerEntityId && e.columnId === NounType.ULTIMATE
        && merged.startFrame >= e.startFrame + getAnimationDuration(e)
        && merged.startFrame < eventEndFrame(e),
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
  overlapExemptIds?: Set<string>,
): number {
  let clamped = Math.max(0, Math.min(TOTAL_FRAMES - 1, newStartFrame));
  // Control events are passive state markers — no overlap or animation-edge
  // constraints apply. Only timeline bounds matter.
  if (target.id === NounType.CONTROL) return clamped;
  // Combo events are constrained only by their activation window — no other
  // validator (overlap, ultimate edge, etc.) may override the window boundary.
  if (ComboSkillEventController.isCombo(target)) {
    return ComboSkillEventController.validateMove(target, clamped, processedEvents as TimelineEvent[] | null);
  }
  if (!overlapExemptIds?.has(target.uid)) {
    clamped = clampNonOverlappable(allEvents, target, clamped, processedEvents ?? undefined);
  }
  // In strict mode (processedEvents provided), enforce animation-edge and
  // enable-window constraints. In freeform mode these are skipped.
  if (processedEvents != null) {
    // Clamp non-ultimate events to the edge of ultimate animation regions
    if (target.columnId !== NounType.ULTIMATE) {
      clamped = clampToUltimateEdge(allEvents, target, clamped);
    }
    // Clamp battle/basic skills to the edge of combo animation regions
    if (target.columnId === NounType.BATTLE || target.columnId === NounType.BASIC_ATTACK) {
      clamped = clampToComboEdge(allEvents, target, clamped);
    }
    // Clamp enhanced events within the ENABLE clause window
    if (target.enhancementType === EnhancementType.ENHANCED) {
      clamped = clampToEnableWindow(allEvents, target, clamped);
    }
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
  overlapExemptIds?: Set<string>,
): number {
  let clampedDelta = delta;
  for (const id of targetIds) {
    const target = allEvents.find((ev) => ev.uid === id);
    if (!target) continue;
    const desired = target.startFrame + clampedDelta;
    const clamped = validateMove(allEvents, target, desired, processedEvents, overlapExemptIds);
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
 * Build a Set of valid "ownerEntityId:columnId" pairs from the controller-produced
 * columns. Used both for filtering stale events and for gating new additions.
 */
export function buildValidColumnPairs(
  columns: readonly { type: string; ownerEntityId: string; columnId?: string; matchColumnIds?: string[] }[],
): Set<string> {
  const pairs = new Set<string>();
  for (const col of columns) {
    if (col.type !== ColumnType.MINI_TIMELINE || !col.columnId) continue;
    pairs.add(`${col.ownerEntityId}:${col.columnId}`);
    if (col.matchColumnIds) {
      for (const id of col.matchColumnIds) {
        pairs.add(`${col.ownerEntityId}:${id}`);
      }
    }
  }
  return pairs;
}

/**
 * Filter events to only those whose ownerEntityId/columnId match a column produced
 * by the controller. The columns array is the source of truth for what
 * subtimelines exist — events with no matching column are discarded.
 */
export function filterEventsToColumns(
  events: TimelineEvent[],
  columns: readonly { type: string; ownerEntityId: string; columnId?: string; matchColumnIds?: string[] }[],
): TimelineEvent[] {
  const validPairs = buildValidColumnPairs(columns);
  return events.filter((ev) => validPairs.has(`${ev.ownerEntityId}:${ev.columnId}`));
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
  return events.filter((ev) => ev.ownerEntityId !== slotId);
}
