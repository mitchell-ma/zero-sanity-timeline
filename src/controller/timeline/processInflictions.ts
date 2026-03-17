import { TimelineEvent, FrameAbsorptionMarker, SkillType, computeSegmentsSpan } from '../../consts/viewTypes';
import { LoadoutProperties, DEFAULT_LOADOUT_PROPERTIES } from '../../view/InformationPane';
import { CombatSkillsType, EventStatusType, StatusType, TargetType, TimeDependency } from '../../consts/enums';
import { SubjectType, VerbType, ObjectType, DeterminerType, matchInteraction } from '../../consts/semantics';
import type { Interaction } from '../../consts/semantics';
import { TriggerCapability } from '../../consts/triggerCapabilities';
import { ENEMY_OWNER_ID, INFLICTION_COLUMN_IDS, OPERATOR_COLUMNS, REACTION_COLUMN_IDS, REACTION_COLUMNS, PHYSICAL_INFLICTION_COLUMN_IDS, SKILL_COLUMNS, EXCHANGE_STATUS_MAX_SLOTS } from '../../model/channels';
import { deriveReactions } from './deriveReactions';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { getCorrosionBaseReduction, getCorrosionReductionMultiplier } from '../../model/calculation/damageFormulas';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
import { MAX_SKILL_LEVEL_INDEX } from '../calculation/statusQueryService';

// ── Combo time-stop chaining ─────────────────────────────────────────────────

/**
 * Combo time-stop chaining: combo time-stops are special — other combos can
 * be triggered within a combo's time-stop region. A combo's time-stop covers
 * the game-frame range [startFrame, startFrame + animationDuration). When
 * another combo's startFrame falls within that range, the earlier combo's
 * time-stop is cut short at the interruption point.
 *
 * Effective animDur = B.startFrame - A.startFrame (truncated band width).
 * The game frames [A.startFrame, B.startFrame) become a "frozen range" in
 * the layout — they collapse to zero real-time width, with A's truncated
 * time-stop band filling that space. The two bands render adjacent (no gap).
 */
function applyComboChaining(events: TimelineEvent[]): TimelineEvent[] {
  const comboStops: { id: string; startFrame: number; animDur: number }[] = [];
  for (const ev of events) {
    if (ev.columnId !== SKILL_COLUMNS.COMBO) continue;
    const anim = ev.animationDuration;
    if (!anim || anim <= 0) continue;
    comboStops.push({ id: ev.id, startFrame: ev.startFrame, animDur: anim });
  }
  if (comboStops.length <= 1) return events;

  comboStops.sort((a, b) => a.startFrame - b.startFrame);

  const overrides = new Map<string, number>();
  for (let i = 0; i < comboStops.length; i++) {
    const a = comboStops[i];
    const effectiveAnimDur = overrides.get(a.id) ?? a.animDur;
    const coveredEnd = a.startFrame + effectiveAnimDur;

    for (let j = i + 1; j < comboStops.length; j++) {
      const b = comboStops[j];
      if (b.startFrame >= coveredEnd) break;

      // B starts within A's time-stop band (real-time overlap) — truncate
      // A's animation at B's start.
      overrides.set(a.id, b.startFrame - a.startFrame);
      break;
    }
  }

  if (overrides.size === 0) return events;
  return events.map((ev) => {
    const truncatedAnim = overrides.get(ev.id);
    if (truncatedAnim == null) return ev;
    return {
      ...ev,
      animationDuration: truncatedAnim,
      activationDuration: Math.min(ev.activationDuration, truncatedAnim),
    };
  });
}

// ── Time-stop duration extension ─────────────────────────────────────────────
//
// All durations in the system are real-time. When an event overlaps with a
// foreign time-stop region, its duration is extended by the overlapping
// time-stop duration — the result is still real-time.
//
// An event's own time-stop does NOT extend itself.

export interface TimeStopRegion {
  startFrame: number;
  durationFrames: number;
  eventId: string;
}

function isTimeStopEvent(ev: TimelineEvent): boolean {
  const anim = ev.animationDuration ?? 0;
  if (anim <= 0) return false;
  return ev.columnId === SKILL_COLUMNS.ULTIMATE || ev.columnId === SKILL_COLUMNS.COMBO ||
    (ev.columnId === OPERATOR_COLUMNS.DASH && !!ev.isPerfectDodge);
}

/** Collect all time-stop regions from combo/ultimate/dodge events. */
export function collectTimeStopRegions(events: TimelineEvent[]): readonly TimeStopRegion[] {
  const stops: TimeStopRegion[] = [];
  for (const ev of events) {
    if (!isTimeStopEvent(ev)) continue;
    stops.push({
      startFrame: ev.startFrame,
      durationFrames: ev.animationDuration!,
      eventId: ev.id,
    });
  }
  stops.sort((a, b) => a.startFrame - b.startFrame);
  return stops;
}

/**
 * Compute the absolute frame position of a frame within an event,
 * accounting for time-stop extension.
 *
 * segStartOffset is the cumulative offset of preceding (already extended)
 * segments. frameOffset is the frame's local offset within its segment,
 * extended by any time-stops it spans.
 */
function absoluteFrame(
  eventStart: number,
  segStartOffset: number,
  frameOffset: number,
  foreignStops: readonly TimeStopRegion[],
): number {
  const segAbsStart = eventStart + segStartOffset;
  return segAbsStart + extendByTimeStops(segAbsStart, frameOffset, foreignStops);
}

/**
 * Compute foreign time-stop regions for an event (all stops except its own).
 */
function foreignStopsFor(ev: TimelineEvent, stops: readonly TimeStopRegion[]): readonly TimeStopRegion[] {
  return isTimeStopEvent(ev) ? stops.filter((s) => s.eventId !== ev.id) : stops;
}

/**
 * Extend a base duration by any time-stop regions it overlaps with.
 *
 * Walks forward from `startFrame` for `baseDuration` frames, adding the
 * duration of any time-stop regions encountered (since the event's timer
 * is paused during those periods). Returns the extended real-time duration.
 */
export function extendByTimeStops(
  startFrame: number,
  baseDuration: number,
  stops: readonly TimeStopRegion[],
): number {
  if (baseDuration <= 0 || stops.length === 0) return baseDuration;
  let remaining = baseDuration;
  let cursor = startFrame;

  for (const s of stops) {
    const stopEnd = s.startFrame + s.durationFrames;
    if (stopEnd <= cursor) continue;
    if (s.startFrame >= cursor + remaining) break;

    if (s.startFrame > cursor) {
      const gap = s.startFrame - cursor;
      if (gap >= remaining) break;
      remaining -= gap;
      cursor = stopEnd;
    } else {
      cursor = stopEnd;
    }
  }

  return (cursor + remaining) - startFrame;
}

/**
 * Extends all event durations that overlap with foreign time-stop regions.
 * Events whose IDs are in `alreadyExtended` are skipped (prevents double extension).
 * Returns the updated events and adds newly extended IDs to the set.
 *
 * For time-stop events (combos/ultimates/dodges), the animation sub-phase
 * is itself the time-stop and is not extended. Only post-animation portions
 * of time-stop events are extended by OTHER time-stops.
 */
function applyTimeStopExtension(
  events: TimelineEvent[],
  stops: readonly TimeStopRegion[],
  alreadyExtended?: Set<string>,
): TimelineEvent[] {
  if (stops.length === 0) return events;

  const extended = alreadyExtended ?? new Set<string>();

  const result = events.map((ev) => {
    if (extended.has(ev.id)) return ev;

    const isOwn = isTimeStopEvent(ev);
    const animDur = ev.animationDuration ?? 0;

    // Foreign stops = all stops except this event's own
    const foreignStops = isOwn
      ? stops.filter((s) => s.eventId !== ev.id)
      : stops;
    if (foreignStops.length === 0) return ev;

    // ── Sequenced events ─────────────────────────────────────────────────
    if (ev.segments && ev.segments.length > 0) {
      let rawOffset = 0;      // cumulative raw (base) offset — for animation boundary checks
      let derivedOffset = 0;  // cumulative derived offset — real start of next segment
      let changed = false;
      const newSegments = ev.segments.map((seg) => {
        const rawSegStart = rawOffset;
        rawOffset += seg.durationFrames;

        if (seg.timeDependency === TimeDependency.REAL_TIME || seg.durationFrames === 0) {
          derivedOffset += seg.durationFrames;
          return seg;
        }

        // For time-stop events, segments within animation are not extended
        if (isOwn && animDur > 0 && rawSegStart + seg.durationFrames <= animDur) {
          derivedOffset += seg.durationFrames;
          return seg;
        }

        let ext: number;
        if (isOwn && animDur > 0 && rawSegStart < animDur) {
          // Segment straddles animation boundary — only extend post-anim portion
          const animPortion = animDur - rawSegStart;
          const postAnimPortion = seg.durationFrames - animPortion;
          ext = animPortion + extendByTimeStops(ev.startFrame + animDur, postAnimPortion, foreignStops);
        } else {
          // Use derived offset for real start position, raw duration as base
          ext = extendByTimeStops(ev.startFrame + derivedOffset, seg.durationFrames, foreignStops);
        }

        derivedOffset += ext;

        if (ext === seg.durationFrames) return seg;
        changed = true;
        return { ...seg, durationFrames: ext };
      });

      if (!changed) return ev;
      extended.add(ev.id);
      return {
        ...ev,
        activationDuration: computeSegmentsSpan(newSegments),
        segments: newSegments,
      };
    }

    // ── 3-phase events ───────────────────────────────────────────────────
    if (ev.timeDependency === TimeDependency.REAL_TIME) return ev;

    let newActivation = ev.activationDuration;
    let newActive = ev.activeDuration;

    if (!isOwn || animDur <= 0) {
      if (ev.activationDuration > 0) {
        newActivation = extendByTimeStops(ev.startFrame, ev.activationDuration, foreignStops);
      }
      if (ev.activeDuration > 0) {
        newActive = extendByTimeStops(ev.startFrame + newActivation, ev.activeDuration, foreignStops);
      }
    } else {
      // Time-stop event: animation portion not extended, post-anim is
      if (ev.activationDuration > animDur) {
        const postAnim = ev.activationDuration - animDur;
        newActivation = animDur + extendByTimeStops(ev.startFrame + animDur, postAnim, foreignStops);
      }
      if (ev.activeDuration > 0) {
        newActive = extendByTimeStops(ev.startFrame + newActivation, ev.activeDuration, foreignStops);
      }
    }

    if (newActivation === ev.activationDuration && newActive === ev.activeDuration) return ev;
    extended.add(ev.id);
    return { ...ev, activationDuration: newActivation, activeDuration: newActive };
  });

  return result;
}

// ── Potential-based effects ──────────────────────────────────────────────────

/** Map of ultimate skill names → combo cooldown reset at potential threshold. */
const ULTIMATE_RESETS_COMBO: Record<string, number> = {
  [CombatSkillsType.WOLVEN_FURY]: 5, // Wulfgard P5: Natural Predator
};

/**
 * Applies potential-gated effects that modify operator events:
 * - Combo cooldown reset on ultimate cast (e.g. Wulfgard P5)
 */
function applyPotentialEffects(events: TimelineEvent[]): TimelineEvent[] {
  const ultimates = events.filter(
    (ev) => ev.columnId === SKILL_COLUMNS.ULTIMATE && ULTIMATE_RESETS_COMBO[ev.name] != null
      && (ev.operatorPotential ?? 0) >= ULTIMATE_RESETS_COMBO[ev.name],
  );
  if (ultimates.length === 0) return events;

  const modified = new Map<string, TimelineEvent>();
  for (const ult of ultimates) {
    const ultFrame = ult.startFrame;
    for (const ev of events) {
      if (ev.ownerId !== ult.ownerId || ev.columnId !== SKILL_COLUMNS.COMBO) continue;
      const activeEnd = ev.startFrame + ev.activationDuration + ev.activeDuration;
      const cooldownEnd = activeEnd + ev.cooldownDuration;
      // If the combo is in its cooldown phase when the ultimate is cast, reset it
      if (ultFrame >= activeEnd && ultFrame < cooldownEnd) {
        modified.set(ev.id, {
          ...ev,
          cooldownDuration: Math.max(0, ultFrame - activeEnd),
        });
      }
    }
  }

  if (modified.size === 0) return events;
  return events.map((ev) => modified.get(ev.id) ?? ev);
}


/** Maps forced reaction name → reaction columnId. */
const FORCED_REACTION_COLUMN: Record<string, string> = {
  [StatusType.COMBUSTION]:      REACTION_COLUMNS.COMBUSTION,
  [StatusType.SOLIDIFICATION]:  REACTION_COLUMNS.SOLIDIFICATION,
  [StatusType.CORROSION]:       REACTION_COLUMNS.CORROSION,
  [StatusType.ELECTRIFICATION]: REACTION_COLUMNS.ELECTRIFICATION,
};

/** Default active duration for derived reaction events (20s at 120fps). */
const REACTION_DURATION = 2400;

/** Forced reaction durations by type (frames at 120fps). */
const FORCED_REACTION_DURATION: Record<string, number> = {
  combustion: 600,        // 5s
  solidification: 600,    // 5s
  corrosion: 600,         // 5s
  electrification: 600,   // 5s
};

/** Default active duration for derived infliction events (20s at 120fps). */
const INFLICTION_DURATION = 2400;



/** Default active duration for derived physical infliction events (20s at 120fps). */
const PHYSICAL_INFLICTION_DURATION = 2400;

/** Maps element key (from frame data) → infliction columnId. */
const ELEMENT_TO_INFLICTION_COLUMN: Record<string, string> = {
  HEAT: 'heatInfliction',
  CRYO: 'cryoInfliction',
  NATURE: 'natureInfliction',
  ELECTRIC: 'electricInfliction',
};

/** Maps self-targeted grant status → team-level derived column. */
export const TEAM_STATUS_COLUMN: Record<string, string> = {
  [StatusType.SQUAD_BUFF]: StatusType.LINK,
};

/** P5 link extension: extra frames added to link duration when operator potential >= 5. */
const P5_LINK_EXTENSION_FRAMES = 600; // 5s at 120fps

// ── Frame position resolution ─────────────────────────────────────────────
//
// Pre-computes `absoluteFrame` on every EventFrameMarker so consumers
// (damage table, resource graphs, view) never need time-stop knowledge.

function resolveFramePositions(
  events: TimelineEvent[],
  stops: readonly TimeStopRegion[],
): TimelineEvent[] {
  if (stops.length === 0) {
    // No time-stops: offsets unchanged, absoluteFrame = eventStart + cumulativeOffset + offsetFrame
    return events.map((ev) => {
      if (!ev.segments) return ev;
      let cumulativeOffset = 0;
      const newSegments = ev.segments.map((seg) => {
        const segStart = cumulativeOffset;
        cumulativeOffset += seg.durationFrames;
        if (!seg.frames) return seg;
        return {
          ...seg,
          frames: seg.frames.map((f) => ({
            ...f,
            derivedOffsetFrame: f.offsetFrame,
            absoluteFrame: ev.startFrame + segStart + f.offsetFrame,
          })),
        };
      });
      return { ...ev, segments: newSegments };
    });
  }

  return events.map((ev) => {
    if (!ev.segments) return ev;
    const fStops = foreignStopsFor(ev, stops);
    let cumulativeOffset = 0;
    const newSegments = ev.segments.map((seg) => {
      const segStart = cumulativeOffset;
      cumulativeOffset += seg.durationFrames;
      if (!seg.frames) return seg;
      const segAbsStart = ev.startFrame + segStart;
      return {
        ...seg,
        frames: seg.frames.map((f) => {
          const extOffset = extendByTimeStops(segAbsStart, f.offsetFrame, fStops);
          return {
            ...f,
            derivedOffsetFrame: extOffset,
            absoluteFrame: segAbsStart + extOffset,
          };
        }),
      };
    });
    return { ...ev, segments: newSegments };
  });
}

// ── Time-stop start validation ────────────────────────────────────────────
//
// Validates that events starting inside a time-stop period are allowed per
// the game rules defined in docs/specifications/time_stop.

function validateTimeStopStarts(
  events: TimelineEvent[],
  stops: readonly TimeStopRegion[],
): TimelineEvent[] {
  if (stops.length === 0) return events;

  // Build a lookup from eventId → event for time-stop source identification
  const evById = new Map<string, TimelineEvent>();
  for (const ev of events) evById.set(ev.id, ev);

  return events.map((ev) => {
    const warnings: string[] = [];

    for (const stop of stops) {
      if (stop.eventId === ev.id) continue;
      const stopEnd = stop.startFrame + stop.durationFrames;
      if (ev.startFrame <= stop.startFrame || ev.startFrame >= stopEnd) continue;

      // ev starts inside this time-stop region — check if allowed
      const source = evById.get(stop.eventId);
      if (!source) continue;

      const sourceIsUltimate = source.columnId === SKILL_COLUMNS.ULTIMATE;
      const sourceIsDodge = source.columnId === OPERATOR_COLUMNS.DASH && !!source.isPerfectDodge;

      // All time-stops can start within dodge's time-stop
      if (sourceIsDodge) continue;

      // Combo cannot start during ultimate animation time-stop
      if (ev.columnId === SKILL_COLUMNS.COMBO && sourceIsUltimate) {
        warnings.push(`Combo skill cannot start during ultimate animation time-stop`);
      }

      // Ultimate cannot start during another ultimate's animation time-stop
      if (ev.columnId === SKILL_COLUMNS.ULTIMATE && sourceIsUltimate) {
        warnings.push(`Ultimate cannot start during another ultimate's animation time-stop`);
      }

      // Combo can start within combo time-stops (chaining) and stagger — OK
      // Ultimate can start within combo and stagger and dodge — OK
      // Everything else within combo/stagger is OK
    }

    if (warnings.length === 0) return ev;
    return { ...ev, warnings: [...(ev.warnings ?? []), ...warnings] };
  });
}

/** Source information for event status changes (consumed/refreshed). */
export interface StatusSource {
  ownerId: string;
  skillName?: string;
}

// ── Combo activation window derivation ──────────────────────────────────────

/** Column ID for derived combo activation window events. */
export const COMBO_WINDOW_COLUMN_ID = 'comboActivationWindow';

const _I = (subjectType: any, verbType: any, objectType: any, extra?: Partial<Interaction>): Interaction =>
  ({ subjectType, verbType, objectType, ...extra } as Interaction);

/**
 * Maps derived enemy event columnIds to the interactions they publish.
 * Used to generate combo windows from derived events at their actual frame timing.
 */
export const ENEMY_COLUMN_TO_INTERACTIONS: Record<string, Interaction[]> = {
  heatInfliction:       [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { subjectDeterminer: DeterminerType.THIS, element: 'HEAT' })],
  cryoInfliction:       [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { subjectDeterminer: DeterminerType.THIS, element: 'CRYO' })],
  natureInfliction:     [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { subjectDeterminer: DeterminerType.THIS, element: 'NATURE' })],
  electricInfliction:   [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { subjectDeterminer: DeterminerType.THIS, element: 'ELECTRIC' })],
  combustion:           [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.COMBUSTED)],
  solidification:       [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.SOLIDIFIED)],
  corrosion:            [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.CORRODED)],
  electrification:      [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.ELECTRIFIED)],
  vulnerableInfliction: [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.STATUS, { subjectDeterminer: DeterminerType.THIS, objectId: 'VULNERABILITY' })],
  breach:               [_I(SubjectType.OPERATOR, VerbType.APPLY, ObjectType.STATUS, { subjectDeterminer: DeterminerType.THIS, objectId: 'PHYSICAL' })],
};

/**
 * Always-available interactions — operators whose combo requires one of these
 * get a full-timeline activation window regardless of team composition.
 */
const ALWAYS_AVAILABLE_INTERACTIONS: Interaction[] = [
  _I(SubjectType.ENEMY, VerbType.HIT, ObjectType.OPERATOR),
  _I(SubjectType.OPERATOR, VerbType.HAVE, ObjectType.HP, { subjectDeterminer: DeterminerType.THIS, cardinalityConstraint: 'AT_MOST' as any }),
  _I(SubjectType.OPERATOR, VerbType.HAVE, ObjectType.HP, { subjectDeterminer: DeterminerType.THIS, cardinalityConstraint: 'AT_LEAST' as any }),
  _I(SubjectType.OPERATOR, VerbType.HAVE, ObjectType.ULTIMATE_ENERGY, { subjectDeterminer: DeterminerType.THIS, cardinalityConstraint: 'AT_MOST' as any }),
];

/** Check if an interaction is "always available" (matches any always-available pattern). */
function isAlwaysAvailable(i: Interaction): boolean {
  return ALWAYS_AVAILABLE_INTERACTIONS.some((aa) => matchInteraction(i, aa));
}

/** All interactions published by derived enemy columns — used to skip in phase 1. */
const DERIVED_INTERACTIONS: Interaction[] = [];
for (const interactions of Object.values(ENEMY_COLUMN_TO_INTERACTIONS)) {
  for (const i of interactions) DERIVED_INTERACTIONS.push(i);
}

/** Check if an interaction is a derived enemy trigger (should be skipped in phase 1). */
function isDerivedInteraction(i: Interaction): boolean {
  return DERIVED_INTERACTIONS.some((d) => matchInteraction(i, d));
}

/** Check if an interaction represents FINAL_STRIKE. */
function isFinalStrike(i: Interaction): boolean {
  return i.verbType === VerbType.PERFORM && i.objectType === ObjectType.FINAL_STRIKE;
}

/** Slot-level trigger wiring for the pipeline. */
export interface SlotTriggerWiring {
  slotId: string;
  capability: TriggerCapability;
}

/**
 * Derive combo activation window events from processed events + operator trigger capabilities.
 * Each window becomes a single-segment derived TimelineEvent.
 */
function deriveComboActivationWindows(
  events: TimelineEvent[],
  slotWirings: SlotTriggerWiring[],
  stops: readonly TimeStopRegion[],
): TimelineEvent[] {
  // Intermediate accumulator: slotId → unsorted windows
  const windowsBySlot = new Map<string, { startFrame: number; endFrame: number; sourceEventId: string; sourceOwnerId?: string; sourceSkillName?: string; sourceColumnId?: string; triggerInteraction?: Interaction }[]>();

  // Build slotId → index for event ownership lookup
  const slotIdToIndex = new Map<string, number>();
  for (let i = 0; i < slotWirings.length; i++) {
    slotIdToIndex.set(slotWirings[i].slotId, i);
  }

  // Build set of combo time-stop event IDs per slot, so a slot's own combo
  // time stops don't extend its combo activation window duration.
  const comboStopIdsBySlot = new Map<string, Set<string>>();
  for (const ev of events) {
    if (ev.columnId !== SKILL_COLUMNS.COMBO || !isTimeStopEvent(ev)) continue;
    if (!comboStopIdsBySlot.has(ev.ownerId)) comboStopIdsBySlot.set(ev.ownerId, new Set());
    comboStopIdsBySlot.get(ev.ownerId)!.add(ev.id);
  }

  // Pre-index combo events per slot for cooldown checks
  const comboEventsBySlot = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.columnId !== SKILL_COLUMNS.COMBO) continue;
    if (!comboEventsBySlot.has(ev.ownerId)) comboEventsBySlot.set(ev.ownerId, []);
    comboEventsBySlot.get(ev.ownerId)!.push(ev);
  }

  const addWindow = (
    published: Interaction,
    event: TimelineEvent,
    triggerFrame: number,
  ) => {
    for (const wiring of slotWirings) {
      const cap = wiring.capability;
      const matchesTrigger = cap.comboRequires.some((req) => matchInteraction(published, req));
      if (!matchesTrigger) continue;

      // Skip self-trigger
      if (event.sourceOwnerId === wiring.slotId) continue;

      // Skip if combo skill is on cooldown at trigger time
      const slotCombos = comboEventsBySlot.get(wiring.slotId);
      if (slotCombos) {
        const onCooldown = slotCombos.some((ce) => {
          const totalDur = ce.activationDuration + ce.activeDuration + ce.cooldownDuration;
          return triggerFrame >= ce.startFrame && triggerFrame < ce.startFrame + totalDur;
        });
        if (onCooldown) continue;
      }

      // Check comboForbidsActiveColumns
      const forbids = cap.comboForbidsActiveColumns;
      if (forbids && forbids.length > 0 && hasActiveEventInColumns(events, forbids, triggerFrame)) continue;

      // Check comboRequiresActiveColumns
      const requires = cap.comboRequiresActiveColumns;
      if (requires && requires.length > 0 && !hasActiveEventInColumns(events, requires, triggerFrame)) continue;

      const baseDuration = cap.comboWindowFrames;
      // Exclude this slot's own combo time stops from window extension
      const ownComboStops = comboStopIdsBySlot.get(wiring.slotId);
      const windowStops = ownComboStops ? stops.filter((s) => !ownComboStops.has(s.eventId)) : stops;
      const extendedDuration = extendByTimeStops(triggerFrame, baseDuration, windowStops);

      if (!windowsBySlot.has(wiring.slotId)) windowsBySlot.set(wiring.slotId, []);
      windowsBySlot.get(wiring.slotId)!.push({
        startFrame: triggerFrame,
        endFrame: triggerFrame + extendedDuration,
        sourceEventId: event.id,
        sourceOwnerId: event.ownerId !== ENEMY_OWNER_ID ? event.ownerId : event.sourceOwnerId,
        sourceSkillName: event.name,
        sourceColumnId: event.columnId,
        triggerInteraction: published,
      });
    }
  };

  // Phase 1: operator-published interactions (skip derived enemy interactions)
  for (const event of events) {
    const slotIndex = slotIdToIndex.get(event.ownerId);
    if (slotIndex === undefined) continue;
    const cap = slotWirings[slotIndex].capability;
    const published = cap.publishesTriggers[event.columnId];
    if (!published || published.length === 0) continue;

    // Finisher/Dive events don't publish FINAL_STRIKE — only normal basic attack sequences do
    const isNonSequenceBasic = event.name === CombatSkillsType.FINISHER || event.name === CombatSkillsType.DIVE;

    const defaultTriggerFrame = event.startFrame + event.activationDuration;
    const finalStrikeTriggerFrame = getFinalStrikeTriggerFrame(event, stops) ?? defaultTriggerFrame;

    for (const interaction of published) {
      if (isDerivedInteraction(interaction)) continue;
      if (isNonSequenceBasic && isFinalStrike(interaction)) continue;
      const frame = isFinalStrike(interaction) ? finalStrikeTriggerFrame : defaultTriggerFrame;
      addWindow(interaction, event, frame);
    }
  }

  // Phase 2: derived enemy event interactions
  for (const event of events) {
    if (event.ownerId !== ENEMY_OWNER_ID) continue;
    const interactions = ENEMY_COLUMN_TO_INTERACTIONS[event.columnId];
    if (!interactions) continue;
    for (const interaction of interactions) {
      addWindow(interaction, event, event.startFrame);
    }
  }

  // Phase 3: always-available interactions → full-timeline windows
  for (const wiring of slotWirings) {
    const hasAlways = wiring.capability.comboRequires.some((req) => isAlwaysAvailable(req));
    if (!hasAlways) continue;
    if (!windowsBySlot.has(wiring.slotId)) windowsBySlot.set(wiring.slotId, []);
    windowsBySlot.get(wiring.slotId)!.push({
      startFrame: 0,
      endFrame: TOTAL_FRAMES,
      sourceEventId: '__always_available__',
    });
  }

  // Sort, merge, and convert to TimelineEvents
  const derived: TimelineEvent[] = [];
  windowsBySlot.forEach((wins, slotId) => {
    wins.sort((a, b) => a.startFrame - b.startFrame);
    // Merge overlapping
    const merged: typeof wins = [];
    for (const w of wins) {
      const prev = merged.length > 0 ? merged[merged.length - 1] : null;
      if (prev && w.startFrame <= prev.endFrame) {
        prev.endFrame = Math.max(prev.endFrame, w.endFrame);
      } else {
        merged.push({ ...w });
      }
    }
    for (let i = 0; i < merged.length; i++) {
      const w = merged[i];
      const duration = w.endFrame - w.startFrame;
      derived.push({
        id: `combo-window-${slotId}-${i}`,
        name: COMBO_WINDOW_COLUMN_ID,
        ownerId: slotId,
        columnId: COMBO_WINDOW_COLUMN_ID,
        startFrame: w.startFrame,
        activationDuration: duration,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: w.sourceOwnerId,
        sourceSkillName: w.sourceSkillName,
        comboTriggerColumnId: w.sourceColumnId,
        segments: [{ durationFrames: duration }],
      });
    }
  });

  return derived;
}

/**
 * Check if any event whose columnId is in `columnIds` is active at `frame`.
 * An event is "active" if frame falls within [startFrame, startFrame + totalDuration).
 */
export function hasActiveEventInColumns(events: TimelineEvent[], columnIds: string[], frame: number): boolean {
  for (const ev of events) {
    if (!columnIds.includes(ev.columnId) && !columnIds.includes(ev.name)) continue;
    const totalDuration = ev.segments
      ? computeSegmentsSpan(ev.segments)
      : ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
    if (frame >= ev.startFrame && frame < ev.startFrame + totalDuration) {
      return true;
    }
  }
  return false;
}

/**
 * For a sequenced event, compute the frame at which the final strike's last
 * hit lands.  Returns null if the event has no segments or fewer than 2.
 *
 * When `stops` is provided, the last hit's offset within its segment is
 * extended by any overlapping time-stop regions, matching how
 * `deriveFrameInflictions` / `absoluteFrame()` position the actual hit.
 */
export function getFinalStrikeTriggerFrame(
  event: TimelineEvent,
  stops?: readonly TimeStopRegion[],
): number | null {
  const segs = event.segments;
  if (!segs || segs.length < 2) return null;

  let offsetFrames = 0;
  for (let i = 0; i < segs.length - 1; i++) {
    offsetFrames += segs[i].durationFrames;
  }

  const lastSeg = segs[segs.length - 1];
  const frames = lastSeg.frames;
  if (frames && frames.length > 0) {
    const lastFrame = frames[frames.length - 1];
    if (lastFrame.absoluteFrame != null) return lastFrame.absoluteFrame;
  }
  const lastHitOffset = frames && frames.length > 0
    ? frames[frames.length - 1].offsetFrame
    : 0;

  const segAbsStart = event.startFrame + offsetFrames;
  if (stops && stops.length > 0) {
    const fStops = foreignStopsFor(event, stops);
    return segAbsStart + extendByTimeStops(segAbsStart, lastHitOffset, fStops);
  }
  return segAbsStart + lastHitOffset;
}

/** Get the end frame of a combo activation window event. */
export function comboWindowEndFrame(ev: TimelineEvent): number {
  const duration = ev.segments
    ? computeSegmentsSpan(ev.segments)
    : ev.activationDuration;
  return ev.startFrame + duration;
}

/**
 * Processes raw timeline events into renderable events.
 *
 * 1. Derives infliction events from operator frames with applyArtsInfliction.
 * 2. Derives arts reaction events from cross-element infliction overlaps.
 *    The triggering (incoming) infliction is removed; the consumed inflictions
 *    are clamped at the reaction frame.
 * 3. Same-element infliction refresh: slots 0–2 get durations extended to the
 *    newest stack's end time. Slot 3 shows sequential bars.
 */
export function processInflictionEvents(
  rawEvents: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotWeapons?: Record<string, string | undefined>,
  slotWirings?: SlotTriggerWiring[],
): TimelineEvent[] {
  // ── Phase 1: Finalize time-stop regions ──────────────────────────────────
  // Combo chaining truncates overlapping combo animations, finalizing the
  // time-stop regions used throughout the pipeline.
  const withComboChaining = applyComboChaining(rawEvents);
  const stops = collectTimeStopRegions(withComboChaining);

  // Shared set tracks which event IDs have already been extended to prevent
  // double-extension across multiple applyTimeStopExtension passes.
  const extendedIds = new Set<string>();

  // ── Phase 2: Extend user-placed events by time-stop overlap ──────────────
  // All durations are real-time. Events that overlap foreign time-stop regions
  // have their durations extended (timer paused during time-stops).
  const ext1 = applyTimeStopExtension(withComboChaining, stops, extendedIds);

  // ── Phase 3: Process pipeline (all durations are extended real-time) ──────
  const withPotentialEffects = applyPotentialEffects(ext1);
  const withDerivedInflictions = deriveFrameInflictions(withPotentialEffects, loadoutProperties, stops);
  // Extend newly derived events by time-stop overlap
  const ext2 = applyTimeStopExtension(withDerivedInflictions, stops, extendedIds);
  // Refresh same-element stacks BEFORE absorptions/reactions so that
  // overlapping stacks get their durations extended using the original
  // infliction duration. Later steps (absorption, reaction) can then
  // clamp the already-extended events as needed.
  const withSameElementRefresh = applySameElementRefresh(ext2);
  const withPhysicalRefresh = applyPhysicalInflictionRefresh(withSameElementRefresh);
  const withConsumedOperatorStatuses = consumeOperatorStatuses(withPhysicalRefresh, stops);
  const withConsumedTeam = consumeTeamStatuses(withConsumedOperatorStatuses);
  const withAbsorptions = applyAbsorptions(withConsumedTeam, stops);
  const withReactions = deriveReactions(withAbsorptions);
  const ext3 = applyTimeStopExtension(withReactions, stops, extendedIds);
  const withMergedReactions = mergeReactions(ext3);
  const withScorchingFangs = deriveScorchingFangs(withMergedReactions, loadoutProperties);
  const withUnbridledEdge = deriveUnbridledEdge(withScorchingFangs, slotWeapons, stops);
  // Final extension for Scorching Fangs, Unbridled Edge, and any other derived events
  const ext4 = applyTimeStopExtension(withUnbridledEdge, stops, extendedIds);
  const withSpReturnGaugeReduction = applySpReturnGaugeReduction(ext4);

  // ── Derive combo activation windows ────────────────────────────────────
  const withComboWindows = slotWirings && slotWirings.length > 0
    ? [...withSpReturnGaugeReduction, ...deriveComboActivationWindows(withSpReturnGaugeReduction, slotWirings, stops)]
    : withSpReturnGaugeReduction;

  // ── Phase 4: Resolve frame positions & validate ────────────────────────
  const withResolvedFrames = resolveFramePositions(withComboWindows, stops);
  const withValidation = validateTimeStopStarts(withResolvedFrames, stops);
  return withValidation;
}

/** Skill column IDs that consume team statuses (Link) when cast. */
const CONSUMING_COLUMNS = new Set(['battle', 'combo', 'ultimate']);

/**
 * Consumes team status events (e.g. Link) when a battle/combo/ultimate skill is cast.
 * The first skill cast after Link is granted clamps the Link event at that frame.
 */
function consumeTeamStatuses(events: TimelineEvent[]): TimelineEvent[] {
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

/**
 * Consumes operator exchange-status events (e.g. Thunderlance) when a frame has
 * `consumeStatus`. All active events of the matching status owned by the same
 * operator are clamped at the consumption frame.
 */
function consumeOperatorStatuses(events: TimelineEvent[], stops: readonly TimeStopRegion[]): TimelineEvent[] {
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
      eventStatus: EventStatusType.CONSUMED,
      eventStatusOwnerId: clamp.source.ownerId,
      eventStatusSkillName: clamp.source.skillName,
    };
  });
}

/**
 * Scans sequenced operator events for frames with `applyArtsInfliction` markers
 * and generates corresponding enemy infliction events at the correct absolute frame.
 */
/** Resolves per-level susceptibility array to a scalar using the source operator's skill level. */
function resolveSusceptibility(
  raw: Record<string, readonly number[]>,
  sourceColumnId: string,
  sourceOwnerId: string,
  loadoutProperties?: Record<string, LoadoutProperties>,
): Record<string, number> {
  const stats = loadoutProperties?.[sourceOwnerId] ?? DEFAULT_LOADOUT_PROPERTIES;
  const skillType = sourceColumnId as SkillType;
  let skillLevel: number;
  switch (skillType) {
    case 'combo': skillLevel = stats.skills.comboSkillLevel; break;
    case 'ultimate': skillLevel = stats.skills.ultimateLevel; break;
    default: skillLevel = stats.skills.battleSkillLevel; break;
  }
  const idx = Math.max(0, Math.min(skillLevel - 1, MAX_SKILL_LEVEL_INDEX));
  const resolved: Record<string, number> = {};
  for (const [element, table] of Object.entries(raw)) {
    // Normalize key to uppercase to match ElementType enum values
    resolved[element.toUpperCase()] = table[Math.min(idx, table.length - 1)];
  }
  return resolved;
}

function deriveFrameInflictions(events: TimelineEvent[], loadoutProperties?: Record<string, LoadoutProperties>, stops: readonly TimeStopRegion[] = []): TimelineEvent[] {
  const derived: TimelineEvent[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === ENEMY_OWNER_ID) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

          if (frame.applyArtsInfliction) {
            const columnId = ELEMENT_TO_INFLICTION_COLUMN[frame.applyArtsInfliction.element];
            // Skip if this combo event's trigger column already handles this element
            // (the comboTriggerColumnId loop below generates those)
            if (columnId && columnId !== event.comboTriggerColumnId) {
              derived.push({
                id: `${event.id}-inflict-${si}-${fi}`,
                name: columnId,
                ownerId: ENEMY_OWNER_ID,
                columnId,
                startFrame: absFrame,
                activationDuration: INFLICTION_DURATION,
                activeDuration: 0,
                cooldownDuration: 0,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
              });
            }
          }

          // Status applied by this frame (self or enemy target)
          if (frame.applyStatus) {
            if (frame.applyStatus.target === TargetType.SELF) {
              // Self-targeted exchange status (e.g. Melting Flame, Thunderlance)
              const grantColumnId = EXCHANGE_STATUS_COLUMN[frame.applyStatus.status];
              if (grantColumnId) {
                const statusDuration = EXCHANGE_EVENT_DURATION;
                const maxSlots = EXCHANGE_STATUS_MAX_SLOTS[frame.applyStatus.status];
                // Count active stacks at this frame
                let activeCount = 0;
                if (maxSlots) {
                  for (const ev of [...events, ...derived]) {
                    if (ev.ownerId !== event.ownerId || ev.columnId !== grantColumnId) continue;
                    const endFrame = ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
                    if (ev.startFrame <= absFrame && endFrame > absFrame) activeCount++;
                  }
                }
                const slotsAvailable = maxSlots ? maxSlots - activeCount : frame.applyStatus.stacks;
                for (let s = 0; s < Math.min(frame.applyStatus.stacks, slotsAvailable); s++) {
                  derived.push({
                    id: `${event.id}-status-${si}-${fi}-${s}`,
                    name: frame.applyStatus.status,
                    ownerId: event.ownerId,
                    columnId: grantColumnId,
                    startFrame: absFrame,
                    activationDuration: statusDuration,
                    activeDuration: 0,
                    cooldownDuration: 0,
                    sourceOwnerId: event.ownerId,
                    sourceSkillName: event.name,
                  });
                }
              }
              // Team status (e.g. Squad Buff → Link)
              const teamColumnId = TEAM_STATUS_COLUMN[frame.applyStatus.status];
              if (teamColumnId) {
                // Link duration = remaining ultimate active phase from grant frame
                const ultActiveEnd = event.startFrame + event.activationDuration + event.activeDuration;
                let linkDuration = Math.max(0, ultActiveEnd - absFrame);
                // P5: extend link buff duration beyond ultimate active phase
                if ((event.operatorPotential ?? 0) >= 5) {
                  linkDuration += P5_LINK_EXTENSION_FRAMES;
                }
                derived.push({
                  id: `${event.id}-team-status-${si}-${fi}`,
                  name: 'Squad Buff (Link)',
                  ownerId: COMMON_OWNER_ID,
                  columnId: teamColumnId,
                  startFrame: absFrame,
                  activationDuration: linkDuration,
                  activeDuration: 0,
                  cooldownDuration: 0,
                  sourceOwnerId: event.ownerId,
                  sourceSkillName: event.name,
                });
              }
            } else if (frame.applyStatus.target === TargetType.ENEMY) {
              // Enemy-targeted status (e.g. Focus → Susceptibility column)
              derived.push({
                id: `${event.id}-status-${si}-${fi}`,
                name: frame.applyStatus.eventName ?? frame.applyStatus.status,
                ownerId: ENEMY_OWNER_ID,
                columnId: frame.applyStatus.status,
                startFrame: absFrame,
                activationDuration: frame.applyStatus.durationFrames,
                activeDuration: 0,
                cooldownDuration: 0,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                ...(frame.applyStatus.susceptibility && {
                  susceptibility: resolveSusceptibility(frame.applyStatus.susceptibility, event.columnId, event.ownerId, loadoutProperties),
                }),
              });
            }
          }

          // Forced reactions bypass infliction stacks entirely
          if (frame.applyForcedReaction) {
            const reactionColumnId = FORCED_REACTION_COLUMN[frame.applyForcedReaction.reaction];
            if (reactionColumnId) {
              derived.push({
                id: `${event.id}-forced-${si}-${fi}`,
                name: reactionColumnId,
                ownerId: ENEMY_OWNER_ID,
                columnId: reactionColumnId,
                startFrame: absFrame,
                activationDuration: frame.applyForcedReaction.durationFrames ?? FORCED_REACTION_DURATION[reactionColumnId] ?? REACTION_DURATION,
                activeDuration: 0,
                cooldownDuration: 0,
                statusLevel: frame.applyForcedReaction.statusLevel,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                forcedReaction: true,
              });
            }
          }

          // SP recovery from frames → team SP resource timeline
          if ((frame.skillPointRecovery ?? 0) > 0) {
            derived.push({
              id: `${event.id}-sp-${si}-${fi}`,
              name: 'sp-recovery',
              ownerId: COMMON_OWNER_ID,
              columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
              startFrame: absFrame,
              // Negative activationDuration = negative cost = SP gain in ResourceTimeline
              activationDuration: -(frame.skillPointRecovery!),
              activeDuration: 0,
              cooldownDuration: 0,
              sourceOwnerId: event.ownerId,
              sourceSkillName: event.name,
            });
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  // Combo events with comboTriggerColumnId: generate derived infliction/status
  // matching the trigger source at each tick frame
  for (const event of events) {
    if (!event.comboTriggerColumnId || !event.segments) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);
          const triggerCol = event.comboTriggerColumnId;

          if (INFLICTION_COLUMN_IDS.has(triggerCol)) {
            // Arts infliction: generate infliction event
            derived.push({
              id: `${event.id}-combo-inflict-${si}-${fi}`,
              name: triggerCol,
              ownerId: ENEMY_OWNER_ID,
              columnId: triggerCol,
              startFrame: absFrame,
              activationDuration: INFLICTION_DURATION,
              activeDuration: 0,
              cooldownDuration: 0,
              sourceOwnerId: event.ownerId,
              sourceSkillName: event.name,
            });
          } else if (PHYSICAL_INFLICTION_COLUMN_IDS.has(triggerCol)) {
            // Physical status: generate physical infliction event
            derived.push({
              id: `${event.id}-combo-phys-${si}-${fi}`,
              name: triggerCol,
              ownerId: ENEMY_OWNER_ID,
              columnId: triggerCol,
              startFrame: absFrame,
              activationDuration: PHYSICAL_INFLICTION_DURATION,
              activeDuration: 0,
              cooldownDuration: 0,
              sourceOwnerId: event.ownerId,
              sourceSkillName: event.name,
            });
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  // Perfect dodge dash events → SP recovery
  for (const event of events) {
    if (event.columnId === OPERATOR_COLUMNS.DASH && event.isPerfectDodge) {
      derived.push({
        id: `${event.id}-sp-dodge`,
        name: 'sp-recovery',
        ownerId: COMMON_OWNER_ID,
        columnId: COMMON_COLUMN_IDS.SKILL_POINTS,
        startFrame: event.startFrame,
        activationDuration: -GENERAL_MECHANICS.skillPoints.perfectDodgeRecovery,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: event.ownerId,
        sourceSkillName: event.name,
      });
    }
  }

  if (derived.length === 0) return events;
  return [...events, ...derived];
}

/** Maps absorption exchange status → columnId for generated events. */
export const EXCHANGE_STATUS_COLUMN: Record<string, string> = {
  MELTING_FLAME: 'melting-flame',
  THUNDERLANCE: 'thunderlance',
};

// EXCHANGE_STATUS_MAX_SLOTS imported from channels

/** Duration (frames) for each exchange status. Unkeyed = effectively permanent. */

/** Default duration for generated exchange events (effectively permanent). */
const EXCHANGE_EVENT_DURATION = TOTAL_FRAMES * 10;

/**
 * Processes absorption frames: consumes enemy infliction stacks and generates
 * exchange status events (e.g. Melting Flame) on the absorbing operator.
 *
 * For each absorption marker found on operator events:
 * 1. Count active infliction events of the matching element on the enemy
 * 2. Count active exchange status events on the operator
 * 3. Consume min(active inflictions, available slots, marker max stacks)
 * 4. Clamp consumed inflictions at the absorption frame
 * 5. Generate new exchange status events
 */
function applyAbsorptions(events: TimelineEvent[], stops: readonly TimeStopRegion[]): TimelineEvent[] {
  // Collect all absorption points: { absoluteFrame, ownerId, marker }
  type AbsorptionPoint = {
    absoluteFrame: number;
    ownerId: string;
    marker: FrameAbsorptionMarker;
    eventId: string;
    eventName: string;
    segmentIndex: number;
    frameIndex: number;
  };

  type ConsumptionPoint = {
    absoluteFrame: number;
    element: string;
    stacks: number;
    source: StatusSource;
  };

  const absorptions: AbsorptionPoint[] = [];
  const consumptions: ConsumptionPoint[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === ENEMY_OWNER_ID) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          if (frame.absorbArtsInfliction) {
            absorptions.push({
              absoluteFrame: absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops),
              ownerId: event.ownerId,
              marker: frame.absorbArtsInfliction,
              eventId: event.id,
              eventName: event.name,
              segmentIndex: si,
              frameIndex: fi,
            });
          }
          if (frame.consumeArtsInfliction) {
            consumptions.push({
              absoluteFrame: absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops),
              element: frame.consumeArtsInfliction.element,
              stacks: frame.consumeArtsInfliction.stacks,
              source: { ownerId: event.ownerId, skillName: event.name },
            });
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  if (absorptions.length === 0 && consumptions.length === 0) return events;

  // Sort absorptions chronologically
  absorptions.sort((a, b) => a.absoluteFrame - b.absoluteFrame);

  // Track modifications: clamped inflictions and removed inflictions
  const clampMap = new Map<string, { frame: number; source: StatusSource }>(); // infliction id → clamp info
  const removedIds = new Set<string>();
  const generated: TimelineEvent[] = [];

  for (const absorption of absorptions) {
    const { absoluteFrame, ownerId, marker } = absorption;
    const inflictionColumnId = ELEMENT_TO_INFLICTION_COLUMN[marker.element];
    const exchangeColumnId = EXCHANGE_STATUS_COLUMN[marker.exchangeStatus];
    const maxSlots = EXCHANGE_STATUS_MAX_SLOTS[marker.exchangeStatus] ?? 4;

    if (!inflictionColumnId || !exchangeColumnId) continue;

    // Find active enemy infliction events of the matching element at this frame
    const activeInflictions: TimelineEvent[] = [];
    for (const ev of events) {
      if (ev.ownerId !== ENEMY_OWNER_ID || ev.columnId !== inflictionColumnId) continue;
      if (removedIds.has(ev.id)) continue;

      const clamp = clampMap.get(ev.id);
      const endFrame = clamp !== undefined
        ? clamp.frame
        : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;

      if (ev.startFrame <= absoluteFrame && endFrame > absoluteFrame) {
        activeInflictions.push(ev);
      }
    }

    if (activeInflictions.length === 0) continue;

    // Count active exchange status events for this operator at this frame
    let activeExchangeCount = 0;
    for (const ev of [...events, ...generated]) {
      if (ev.ownerId !== ownerId || ev.columnId !== exchangeColumnId) continue;
      if (removedIds.has(ev.id)) continue;

      const clamp = clampMap.get(ev.id);
      const endFrame = clamp !== undefined
        ? clamp.frame
        : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;

      if (ev.startFrame <= absoluteFrame && endFrame > absoluteFrame) {
        activeExchangeCount++;
      }
    }

    const availableSlots = maxSlots - activeExchangeCount;
    if (availableSlots <= 0) continue;

    const stacksToConsume = Math.min(activeInflictions.length, availableSlots, marker.stacks);
    if (stacksToConsume <= 0) continue;

    // Sort active inflictions by startFrame (consume oldest first)
    activeInflictions.sort((a, b) => a.startFrame - b.startFrame);

    // Consume inflictions: clamp them at the absorption frame
    const absSource: StatusSource = { ownerId: absorption.ownerId, skillName: absorption.eventName };
    for (let i = 0; i < stacksToConsume; i++) {
      const consumed = activeInflictions[i];
      clampMap.set(consumed.id, { frame: absoluteFrame, source: absSource });
    }

    // Generate exchange status events
    for (let i = 0; i < stacksToConsume; i++) {
      generated.push({
        id: `${absorption.eventId}-absorb-${absorption.segmentIndex}-${absorption.frameIndex}-${i}`,
        name: marker.exchangeStatus,
        ownerId,
        columnId: exchangeColumnId,
        startFrame: absoluteFrame,
        activationDuration: EXCHANGE_EVENT_DURATION,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: ownerId,
        sourceSkillName: absorption.eventName,
      });
    }
  }

  // Process consumptions: clamp inflictions without generating exchange events
  consumptions.sort((a, b) => a.absoluteFrame - b.absoluteFrame);
  for (const consumption of consumptions) {
    const inflictionColumnId = ELEMENT_TO_INFLICTION_COLUMN[consumption.element];
    if (!inflictionColumnId) continue;

    const activeInflictions: TimelineEvent[] = [];
    for (const ev of events) {
      if (ev.ownerId !== ENEMY_OWNER_ID || ev.columnId !== inflictionColumnId) continue;
      if (removedIds.has(ev.id)) continue;
      const clamp = clampMap.get(ev.id);
      const endFrame = clamp !== undefined
        ? clamp.frame
        : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      if (ev.startFrame <= consumption.absoluteFrame && endFrame > consumption.absoluteFrame) {
        activeInflictions.push(ev);
      }
    }

    if (activeInflictions.length === 0) continue;
    activeInflictions.sort((a, b) => a.startFrame - b.startFrame);
    const toConsume = Math.min(activeInflictions.length, consumption.stacks);
    for (let i = 0; i < toConsume; i++) {
      clampMap.set(activeInflictions[i].id, { frame: consumption.absoluteFrame, source: consumption.source });
    }
  }

  if (clampMap.size === 0 && generated.length === 0) return events;

  // Build output: clamp consumed inflictions, append generated events
  const result: TimelineEvent[] = [];
  for (const ev of events) {
    if (removedIds.has(ev.id)) continue;

    const clamp = clampMap.get(ev.id);
    if (clamp !== undefined) {
      const available = Math.max(0, clamp.frame - ev.startFrame);
      const clampedActive = Math.min(ev.activationDuration, available);
      const remAfterActive = available - clampedActive;
      const clampedActiveDur = Math.min(ev.activeDuration, remAfterActive);
      const remAfterActiveDur = remAfterActive - clampedActiveDur;
      const clampedCooldown = Math.min(ev.cooldownDuration, remAfterActiveDur);
      result.push({
        ...ev,
        activationDuration: clampedActive,
        activeDuration: clampedActiveDur,
        cooldownDuration: clampedCooldown,
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

// deriveReactions is imported from ./deriveReactions.ts

/**
 * Merges overlapping same-type arts reaction events.
 *
 * **Corrosion** uses merge semantics: when a newer corrosion overlaps an
 * active older one, the older is clamped at the merge point and the newer
 * inherits max(statusLevel) and extends its duration if the older would
 * have lasted longer.
 *
 * **Other reactions** use refresh semantics: the older event is clamped
 * when the newer one would outlast it.
 */
export function mergeReactions(events: TimelineEvent[]): TimelineEvent[] {
  const reactionsByType = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID && REACTION_COLUMN_IDS.has(ev.columnId)) {
      const group = reactionsByType.get(ev.columnId) ?? [];
      group.push(ev);
      reactionsByType.set(ev.columnId, group);
    }
  }

  if (reactionsByType.size === 0) return events;

  const clampMap = new Map<string, { duration: number; source: StatusSource }>();
  const mergeMap = new Map<string, { activationDuration: number; statusLevel: number; inflictionStacks: number; reductionFloor?: number }>();

  reactionsByType.forEach((group, columnId) => {
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);

    if (columnId === REACTION_COLUMNS.CORROSION) {
      // Corrosion merge: newer absorbs older's stats and remaining duration
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const currentDur = mergeMap.get(current.id)?.activationDuration ?? current.activationDuration;
        const currentEnd = current.startFrame + currentDur;
        const next = sorted[i + 1];

        // Only merge if the newer event starts while the older is still active
        if (next.startFrame >= currentEnd) continue;

        // Clamp older at the merge point
        clampMap.set(current.id, {
          duration: Math.max(0, next.startFrame - current.startFrame),
          source: { ownerId: next.sourceOwnerId ?? ENEMY_OWNER_ID, skillName: next.sourceSkillName },
        });

        // Newer inherits max statusLevel and max remaining duration
        const currentStatusLevel = mergeMap.get(current.id)?.statusLevel ?? current.statusLevel ?? 1;
        const nextStatusLevel = next.statusLevel ?? 1;
        const currentStacks = mergeMap.get(current.id)?.inflictionStacks ?? current.inflictionStacks ?? 1;
        const nextStacks = next.inflictionStacks ?? 1;

        const remainingOldDuration = currentEnd - next.startFrame;
        const newDuration = next.activationDuration;

        // Compute the old corrosion's reduction at the merge point (with arts intensity)
        const elapsedSeconds = (next.startFrame - current.startFrame) / FPS;
        const oldReductionFloor = mergeMap.get(current.id)?.reductionFloor ?? 0;
        const oldArtsIntensity = current.artsIntensity ?? 0;
        const oldBaseReduction = getCorrosionBaseReduction(
          Math.min(currentStatusLevel, 4) as import('../../consts/types').StatusLevel,
          elapsedSeconds,
        ) * getCorrosionReductionMultiplier(oldArtsIntensity);
        const currentReduction = Math.max(oldReductionFloor, oldBaseReduction);

        mergeMap.set(next.id, {
          activationDuration: Math.max(remainingOldDuration, newDuration),
          statusLevel: Math.max(currentStatusLevel, nextStatusLevel),
          inflictionStacks: Math.max(currentStacks, nextStacks),
          reductionFloor: currentReduction,
        });
      }
    } else {
      // Other reactions: refresh semantics (clamp older when newer outlasts it)
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const currentEnd = current.startFrame + (clampMap.get(current.id)?.duration ?? current.activationDuration);
        const next = sorted[i + 1];
        const nextEnd = next.startFrame + next.activationDuration;

        if (next.startFrame < currentEnd && nextEnd >= currentEnd) {
          clampMap.set(current.id, {
            duration: Math.max(0, next.startFrame - current.startFrame),
            source: { ownerId: next.sourceOwnerId ?? ENEMY_OWNER_ID, skillName: next.sourceSkillName },
          });
        }
      }
    }
  });

  if (clampMap.size === 0 && mergeMap.size === 0) return events;

  return events.map((ev) => {
    const clamp = clampMap.get(ev.id);
    const merge = mergeMap.get(ev.id);

    if (clamp !== undefined) {
      return {
        ...ev,
        activationDuration: clamp.duration,
        eventStatus: EventStatusType.REFRESHED,
        eventStatusOwnerId: clamp.source.ownerId,
        eventStatusSkillName: clamp.source.skillName,
      };
    }
    if (merge !== undefined) {
      return {
        ...ev,
        activationDuration: merge.activationDuration,
        statusLevel: merge.statusLevel,
        inflictionStacks: merge.inflictionStacks,
        reductionFloor: merge.reductionFloor,
      };
    }
    return ev;
  });
}

/** Maximum concurrent stacks of the same element infliction (arts or physical). */
const MAX_INFLICTION_STACKS = 4;

function applyPhysicalInflictionRefresh(events: TimelineEvent[]): TimelineEvent[] {
  return applyInflictionDeque(events, PHYSICAL_INFLICTION_COLUMN_IDS);
}

function applySameElementRefresh(events: TimelineEvent[]): TimelineEvent[] {
  return applyInflictionDeque(events, INFLICTION_COLUMN_IDS);
}

/** Shared deque-based infliction stacking logic. */
function applyInflictionDeque(events: TimelineEvent[], columnIds: Set<string>): TimelineEvent[] {
  const inflictionsByColumn = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID && columnIds.has(ev.columnId)) {
      const group = inflictionsByColumn.get(ev.columnId) ?? [];
      group.push(ev);
      inflictionsByColumn.set(ev.columnId, group);
    }
  }

  if (inflictionsByColumn.size === 0) return events;

  const processedMap = new Map<string, TimelineEvent>();
  const clampMap = new Map<string, { frame: number; sourceOwnerId?: string; sourceSkillName?: string }>();

  inflictionsByColumn.forEach((group) => {
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);

    const extendedActive: number[] = sorted.map((ev) => ev.activationDuration);
    const evicted = new Map<number, number>();

    for (let i = 0; i < sorted.length; i++) {
      const incoming = sorted[i];
      const incomingEnd = incoming.startFrame + incoming.activationDuration;

      const activeIndices: number[] = [];
      for (let j = 0; j < i; j++) {
        const evictFrame = evicted.get(j);
        const jEnd = evictFrame !== undefined
          ? evictFrame
          : sorted[j].startFrame + extendedActive[j];
        if (jEnd > incoming.startFrame) activeIndices.push(j);
      }

      if (activeIndices.length >= MAX_INFLICTION_STACKS) {
        const oldestIdx = activeIndices[0];
        evicted.set(oldestIdx, incoming.startFrame);
        clampMap.set(sorted[oldestIdx].id, {
          frame: incoming.startFrame,
          sourceOwnerId: incoming.sourceOwnerId,
          sourceSkillName: incoming.sourceSkillName,
        });
        activeIndices.shift();
      }

      for (const j of activeIndices) {
        if (evicted.has(j)) continue;
        const jEnd = sorted[j].startFrame + extendedActive[j];
        if (incomingEnd > jEnd) {
          extendedActive[j] = incomingEnd - sorted[j].startFrame;
        }
      }
    }

    for (let i = sorted.length - 2; i >= 0; i--) {
      if (evicted.has(i)) continue;
      let nextIdx = -1;
      for (let j = i + 1; j < sorted.length; j++) {
        if (!evicted.has(j)) { nextIdx = j; break; }
      }
      if (nextIdx === -1) continue;
      const currentEnd = sorted[i].startFrame + extendedActive[i];
      if (sorted[nextIdx].startFrame > currentEnd) continue;
      const nextEnd = sorted[nextIdx].startFrame + extendedActive[nextIdx];
      if (nextEnd > currentEnd) {
        extendedActive[i] = nextEnd - sorted[i].startFrame;
      }
    }

    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      if (evicted.has(i)) {
        const evictFrame = evicted.get(i)!;
        const clampedDur = Math.max(0, evictFrame - ev.startFrame);
        if (clampedDur !== ev.activationDuration) {
          const clamp = clampMap.get(ev.id)!;
          processedMap.set(ev.id, {
            ...ev,
            activationDuration: clampedDur,
            activeDuration: 0,
            cooldownDuration: 0,
            eventStatus: EventStatusType.CONSUMED,
            eventStatusOwnerId: clamp.sourceOwnerId,
            eventStatusSkillName: clamp.sourceSkillName,
          });
        }
      } else if (extendedActive[i] !== ev.activationDuration) {
        let nextEv: TimelineEvent | undefined;
        for (let j = i + 1; j < sorted.length; j++) {
          if (!evicted.has(j)) { nextEv = sorted[j]; break; }
        }
        processedMap.set(ev.id, {
          ...ev,
          activationDuration: extendedActive[i],
          eventStatus: EventStatusType.EXTENDED,
          eventStatusOwnerId: nextEv?.sourceOwnerId,
          eventStatusSkillName: nextEv?.sourceSkillName,
        });
      }
    }
  });

  if (processedMap.size === 0) return events;
  return events.map((ev) => processedMap.get(ev.id) ?? ev);
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
function deriveScorchingFangs(events: TimelineEvent[], loadoutProperties?: Record<string, LoadoutProperties>): TimelineEvent[] {
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
function deriveUnbridledEdge(
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

// ── SP Return → Gauge Gain Reduction ─────────────────────────────────────────

/**
 * For battle skill events whose frame data includes SKILL_POINT_RECOVERY,
 * reduces gaugeGain and teamGaugeGain proportionally.
 *
 * ratio = (spCost - totalSpReturn) / spCost
 *
 * Affects: Last Rite (30 SP), Snowshine (30 SP), Catcher (30 SP).
 */
function applySpReturnGaugeReduction(events: TimelineEvent[]): TimelineEvent[] {
  const modified = new Map<string, TimelineEvent>();

  for (const ev of events) {
    if (ev.columnId !== SKILL_COLUMNS.BATTLE) continue;
    if (!ev.segments) continue;

    // Sum up all SP recovery from frame data
    let totalSpReturn = 0;
    for (const seg of ev.segments) {
      if (!seg.frames) continue;
      for (const frame of seg.frames) {
        if (frame.skillPointRecovery && frame.skillPointRecovery > 0) {
          totalSpReturn += frame.skillPointRecovery;
        }
      }
    }

    if (totalSpReturn <= 0) continue;

    const spCost = ev.skillPointCost ?? 100;
    if (spCost <= 0) continue;

    const ratio = Math.max(0, (spCost - totalSpReturn) / spCost);

    const updates: Partial<TimelineEvent> = {};
    if (ev.gaugeGain != null) {
      updates.gaugeGain = ev.gaugeGain * ratio;
    }
    if (ev.teamGaugeGain != null) {
      updates.teamGaugeGain = ev.teamGaugeGain * ratio;
    }
    if (ev.gaugeGainByEnemies != null) {
      const reduced: Record<number, number> = {};
      for (const [k, v] of Object.entries(ev.gaugeGainByEnemies)) {
        reduced[Number(k)] = v * ratio;
      }
      updates.gaugeGainByEnemies = reduced;
    }

    if (Object.keys(updates).length > 0) {
      modified.set(ev.id, { ...ev, ...updates });
    }
  }

  if (modified.size === 0) return events;
  return events.map((ev) => modified.get(ev.id) ?? ev);
}
