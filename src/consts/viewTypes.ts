import { DamageFactorType, DamageType, ElementType, EnhancementType, EventFrameType, EventStatusType, InteractionModeType, SegmentType, TimeDependency } from './enums';
import type { FrameClausePredicate } from '../model/event-frames/skillEventFrame';

/** String union for the four operator combat skills, matching the data keys in operators.ts. */
/** @deprecated Use NounType skill values directly. */
export type SkillType = string;

export interface SkillDef {
  name: string;
  /** In-game skill description text. */
  description?: string;
  /** Element type of this skill (e.g. "PHYSICAL", "HEAT"). */
  element?: string;
  /** Default segments for this skill. Optional — defaults to a single segment with the activation duration. */
  defaultSegments?: EventSegmentData[];
  triggerCondition: string | null;
  /** SP cost for battle skills. */
  skillPointCost?: number;
  /** Description of SP return mechanics (potentials, talents, gear effects). */
  spReturnNotes?: string[];
}

export interface Operator {
  id: string;
  name: string;
  color: string;
  element: string;
  role: string;
  /** Raw operator class type from game data (e.g. "GUARD", "CASTER"). */
  operatorClassType?: string;
  rarity: number;
  splash?: string;
  weaponTypes: string[];
  weapon: string;
  armor: string;
  gloves: string;
  kit1: string;
  kit2: string;
  food: string;
  tactical: string;
  skills: Record<string, SkillDef>;
  maxTalentOneLevel: number;
  maxTalentTwoLevel: number;
  talentOneName: string;
  talentTwoName: string;
  attributeIncreaseName: string;
  attributeIncreaseAttribute: string;
  maxAttributeIncreaseLevel: number;
  /** Per-level talent descriptions. Key = talent index (1 or 2), value = array indexed by level (0-based). */
  talentDescriptions?: Record<number, string[]>;
  /** Per-potential-level descriptions. Array indexed by potential (index 0 = P1). */
  potentialDescriptions?: string[];
}

export interface EnemyStatus {
  id: string;
  label: string;
  color: string;
}

export interface Enemy {
  id: string;
  name: string;
  tier: string;
  sprite?: string;
  statuses: EnemyStatus[];
  /** Total stagger HP per node. */
  staggerHp: number;
  /** Number of stagger nodes (bosses). 0 or 1 for normal enemies. */
  staggerNodes: number;
  /** Seconds the enemy is frail after a stagger node is broken. */
  staggerNodeRecoverySeconds: number;
  /** Seconds the enemy is staggered after the meter reaches max (also the drain duration). */
  staggerBreakDurationSeconds: number;
}


/** A damage frame marker within a segment. */
export interface EventFrameMarker {
  /** Optional name for this frame. */
  name?: string;
  /** Frame offset from the start of the parent segment (base/raw value). */
  offsetFrame: number;
  /** Derived frame offset accounting for time-stop extension within the segment (set by processCombatSimulation). */
  derivedOffsetFrame?: number;
  /** Pre-computed absolute frame position (set by processCombatSimulation). */
  absoluteFrame?: number;
  /** Damage type: NORMAL (default) or DAMAGE_OVER_TIME (cannot crit). */
  damageType?: DamageType;
  /** Element of damage dealt by this frame (for coloring when no infliction). */
  damageElement?: string;
  /** Label for status-effect frames (e.g. "-12.0 Res"). Non-null marks this as a status frame rather than a damage frame. */
  statusLabel?: string;
  /** Whether this frame re-applies the trigger source (infliction or physical status) that caused the combo. */
  duplicateTriggerSource?: boolean;
  /** DSL v2 clause predicates (conditional + unconditional effect groups). */
  clauses?: readonly FrameClausePredicate[];
  /** Clause evaluation mode: 'FIRST_MATCH' stops after first matching conditional; default 'ALL'. */
  clauseType?: string;
  /** True when all conditional clauses were evaluated and none matched (frame produced no effects). */
  frameSkipped?: boolean;
  /** Frame type classifications (defaults to [NORMAL]). */
  frameTypes?: EventFrameType[];
  /** Frame dependency types. */
  dependencyTypes?: string[];
  /** User-supplied parameters available as VARY_BY dimensions on this frame (e.g. { VARY_BY: ['ENEMY_HIT'] }). */
  suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
  /** Whether this frame scored a critical hit (runtime state for simulation mode). */
  isCrit?: boolean;
  /** Expected crit rate E(T) at this frame (EXPECTED mode only). */
  expectedCritRate?: number;
  /** CHANCE probability gate on this frame (0.0–1.0). Omitted = no CHANCE gate (expectation 1). */
  chance?: number;
  /** Whether this frame's CHANCE gate fired (runtime state for MANUAL mode). */
  isChance?: boolean;
  /** Template SP recovery for this frame when it is the final strike (from model data). */
  templateFinalStrikeSP?: number;
  /** Template stagger for this frame when it is the final strike (from model data). */
  templateFinalStrikeStagger?: number;
}

/** Identifies a specific frame within a sequenced event. */
export interface SelectedFrame {
  eventUid: string;
  segmentIndex: number;
  frameIndex: number;
}

/** A sequence segment within a multi-sequence event (e.g. basic attack chain). */
export interface EventSegmentData {
  metadata?: {
    /** Data sources this segment was derived from. */
    dataSources?: string[];
  };
  properties: {
    /** The phase types of this segment. */
    segmentTypes?: SegmentType[];
    /** Duration of this segment in frames. */
    duration: number;
    /**
     * Offset from event start in frames. If absent, this segment starts at the
     * end of the previous segment (ordered chronologically by offset + duration).
     */
    offset?: number;
    /** Display name for this segment (e.g. "1", "2", "Wind-up", "Cooldown"). */
    name?: string;
    /** Element type of this segment (e.g. "PHYSICAL", "HEAT"). */
    element?: string;
    /** Whether this segment's duration is game-time or real-time dependent. Defaults to GAME_TIME. */
    timeDependency?: TimeDependency;
    /** How this segment interacts with other timelines (e.g. TIME_STOP). */
    timeInteractionType?: string;
    /** User-supplied parameters available as VARY_BY dimensions on this segment. */
    suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
  };
  /** Damage frame markers within this segment. */
  frames?: EventFrameMarker[];
  /** Clause effects active during this segment (from JSON clause data). */
  clause?: { conditions: Record<string, unknown>[]; effects: { verb: string; objectId?: string; objectQualifier?: string; object: string; toDeterminer?: string; to?: string; of?: Record<string, unknown>; with?: { segments?: number[] } }[] }[];
  /** Absolute start frame on the timeline (set by processCombatSimulation, not raw JSON). */
  absoluteStartFrame?: number;
  /** Catch-all for domain-specific fields not part of the core segment model. */
  unknown?: Record<string, unknown>;
}

export interface TimelineEvent {
  /** Unique instance identifier (e.g. `ev-1-abc4`). Not the game-data config ID. */
  uid: string;
  /** Game-data config ID (e.g. `NounType.DASH`, `"BURST_OF_PASSION"`). Used for all identity comparisons. */
  id: string;
  /** Display name. Not used for logic — use `id` for comparisons. */
  name: string;
  ownerEntityId: string;
  columnId: string;
  startFrame: number;
  /** Required segment array — all event timing flows through segments. */
  segments: EventSegmentData[];
  /** True for manually-added arts reaction events (not derived from infliction interactions). */
  isForced?: boolean;
  /** Stack count (e.g. infliction stacks consumed for reactions, operator status stacks). */
  stacks?: number;
  /**
   * Frame count from startFrame during which no other event in the same
   * mini-timeline or micro-timeline column may overlap.
   * Default is 0 (no restriction — events can always overlap).
   */
  nonOverlappableRange?: number;
  /** Number of enemies hit (selectable in info pane). */
  enemiesHit?: number;
  /** User-supplied parameters available as VARY_BY dimensions on this event. */
  suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
  /** User-selected values for supplied parameters (set via context menu). Defaults to lowerRange if not set. */
  parameterValues?: Record<string, number>;
  /** Susceptibility bonuses applied by this status event (e.g. Focus), keyed by ElementType → resolved percentage. */
  susceptibility?: Partial<Record<ElementType, number>>;
  /** For combo events: the trigger source's columnId (e.g. INFLICTION_COLUMNS.HEAT, PhysicalStatusType.BREACH). */
  comboTriggerColumnId?: string;
  /**
   * For combo events and COMBO_WINDOW events: uid of the source event that
   * caused this combo to be triggered. Chain-of-action ref — lookups via
   * getAllEvents() return the live source event so handlers like
   * `duplicateTriggerSource` read column/id from the event itself rather
   * than consulting a denormalized string.
   */
  triggerEventUid?: string;
  /** For combo events: the status level of the triggering physical status (= Vulnerability stacks consumed). */
  triggerStacks?: number;
  /** How this event interacts with other timelines (TIME_STOP for ultimates and perfect dodges, NONE otherwise). */
  timeInteraction?: string;
  /** If true, this dash includes a perfect dodge (i-frame), applying TIME_STOP and generating 7.5 SP. */
  isPerfectDodge?: boolean;
  /** Visual time-stop stretch factor: 1.0 = normal, >1.0 = stretched (e.g. perfect dodge ≈ 1.709). */
  timeStop?: number;
  /** Whether this event's duration is game-time or real-time dependent. Defaults to GAME_TIME. */
  timeDependency?: TimeDependency;
  /** Operator slot ID that originally produced this derived event. */
  sourceEntityId?: string;
  /** Skill name of the operator event that produced this derived event. */
  sourceSkillName?: string;
  /** Source damage frame identity ("eventUid:si:fi") for intra-frame ordering.
   *  Set when this status was created by a damage frame's clause effects or trigger chain. */
  sourceFrameKey?: string;
  /** Outcome of a derived event: how it ended. */
  eventStatus?: EventStatusType;
  /** True if this reaction was forced (bypassed infliction stacks). */
  forcedReaction?: boolean;
  /** True if this infliction event was a same-element stack (Arts Burst). */
  isArtsBurst?: boolean;
  /** Inherited reduction floor from a merged corrosion (resistance points). */
  reductionFloor?: number;
  /** Source operator's Arts Intensity at time of reaction (for corrosion scaling). */
  artsIntensity?: number;
  /** Operator potential (0–5) for potential-dependent derived effects. */
  operatorPotential?: number;
  /** SP cost consumed when this battle skill event fires. */
  skillPointCost?: number;
  /** Enhancement tier of this event's skill variant (derived from column definition). */
  enhancementType?: EnhancementType;
  /** Preconditions for placing this event (OR of predicates). Evaluated by context menu and validation. */
  activationClause?: import('../dsl/semantics').Predicate[];
  /** Maximum number of combo skills allowed within this activation window (default 1). */
  maxSkills?: number;
  /** For chained combo time-stops: game frames [startFrame, comboChainFreezeEnd) are frozen in real-time layout. */
  comboChainFreezeEnd?: number;
  /** Validation warnings (e.g. event starts inside an invalid time-stop period). */
  warnings?: string[];
  /** Magnitude of a status effect (e.g. 0.15 for 15% amp, 0.30 for 30% link bonus, 0.10 for 10% weaken). */
  statusValue?: number;
  /** Damage formula factor this status contributes to (e.g. AMP, WEAKEN, SUSCEPTIBILITY). */
  damageFactorType?: DamageFactorType;
  /** Interaction mode at creation time — determines pipeline routing (strict = input, freeform = derived). */
  creationInteractionMode?: InteractionModeType;
  /** Indices of segments from the full variant chain placed at creation. Undefined = full chain. */
  segmentOrigin?: number[];
  /** Expected probability this event is active (0.0-1.0). Omitted for deterministic events (implicitly 1.0). Set for CHANCE-gated or crit-triggered status events in EXPECTED mode. */
  expectedUptime?: number;
  /** Number of stacks consumed by the CONSUME effect that triggered this event's creation (for STACKS CONSUMED resolution). */
  consumedStacks?: number;
}

export interface ContextMenuItem {
  label?: string;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Reason shown below label when disabled. */
  disabledReason?: string;
  separator?: boolean;
  /** Non-interactive section header label. */
  header?: boolean;
  /** Action identifier for controller-built menus (view maps to callback). */
  actionId?: string;
  /** Payload for the action (e.g. event creation params). */
  actionPayload?: unknown;
  /** Show a check indicator — for toggle items. Static boolean or getter function. */
  checked?: boolean | (() => boolean);
  /** If true, clicking this item does NOT close the menu. */
  keepOpen?: boolean;
  /** Label shown above inline buttons (e.g. parameter name). */
  inlineLabel?: string;
  /** When true, inline buttons render as conjoined segment tabs (skill-card style). */
  segmentTabs?: boolean;
  /** Inline sub-buttons rendered as a horizontal row (e.g. individual BATK segments). */
  inlineButtons?: {
    label: string;
    action?: () => void;
    actionId?: string;
    actionPayload?: unknown;
    disabled?: boolean;
    disabledReason?: string;
  }[];
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export type VisibleSkills = Record<string, Record<string, boolean>>;

/** Editable resource parameters for a resource subtimeline. */
export interface ResourceConfig {
  startValue: number;
  max: number;
  regenPerSecond: number;
}

/** A sub-column within a micro-column mini-timeline. */
export interface MicroColumn {
  id: string;         // used as columnId for events in this micro-column
  label: string;      // short display label (e.g. "HEAT", "1")
  color: string;      // render color for events in this micro-column
  /** Status category type (TALENT, TALENT_STATUS, GEAR_STATUS, WEAPON_STATUS, etc.). */
  statusType?: string;
  /** Whether this status has permanent/infinite duration (99999 frames). */
  permanent?: boolean;
  /** Maximum concurrent events for this micro-column (from status stacks limit). */
  maxEvents?: number;
  /** Per-micro-column default event overrides (id, duration). Used by dynamic-split context menu. */
  defaultEvent?: {
    id: string;
    /** Display name for translation/labels. Business logic must use `id`. */
    name?: string;
    segments?: EventSegmentData[];
    /** Source operator ID for manually-created events (e.g. 'debugger'). */
    sourceEntityId?: string;
    /** Source skill name for manually-created events (e.g. 'Debug'). */
    sourceSkillName?: string;
    /** Stacking config from status JSON (limit, interactionType, duration). */
    stacks?: Record<string, unknown>;
  };
}

/** Unified mini-timeline column — replaces SkillColumn, StatusColumn, MeltingFlameColumn. */
export type MiniTimeline = {
  key: string;
  type: import("./enums").ColumnType.MINI_TIMELINE;
  source: import("./enums").TimelineSourceType;
  ownerEntityId: string;
  columnId: string;
  label: string;
  color: string;
  headerVariant: import("./enums").HeaderVariant;

  /** If present, this mini-timeline has micro-columns. */
  microColumns?: MicroColumn[];
  /** How events are assigned to micro-columns. */
  microColumnAssignment?: import("./enums").MicroColumnAssignment;
  /** If set, collect events matching any of these columnIds (instead of col.columnId). */
  matchColumnIds?: string[];
  /** If set, match all events on this ownerEntityId EXCEPT those with columnIds in this set. */
  matchAllExcept?: ReadonlySet<string>;

  /** Default durations for new events created in this mini-timeline. */
  defaultEvent?: {
    id: string;
    /** Display name for translation/labels. Business logic must use `id`. */
    name?: string;
    triggerCondition?: string | null;
    /** Segment definitions for this event. */
    segments?: EventSegmentData[];
    /** How this event interacts with other timelines. */
    timeInteraction?: string;
    /** If true, this is a perfect dodge. */
    isPerfectDodge?: boolean;
    /** Visual time-stop stretch factor. */
    timeStop?: number;
    /** Whether this event's duration is game-time or real-time dependent. */
    timeDependency?: TimeDependency;
    /** SP cost for battle skills. */
    skillPointCost?: number;
    /** User-supplied parameters available as VARY_BY dimensions (e.g. Enemies Hit). */
    suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
  };

  /** Multiple event variants selectable from the context menu (e.g. Laevatain battle skill). */
  eventVariants?: {
    id: string;
    /** Display name for translation/labels. Business logic must use `id`. */
    name?: string;
    /** Display label in the context menu (falls back to COMBAT_SKILL_LABELS or id). */
    displayName?: string;
    /** Enhancement tier of this variant (NORMAL for base skills, ENHANCED/EMPOWERED for upgraded). */
    enhancementType?: import('./enums').EnhancementType;
    triggerCondition?: string | null;
    /** Segment definitions for this variant. */
    segments?: EventSegmentData[];
    /** If true, this variant is disabled in the context menu. */
    disabled?: boolean;
    /** Reason shown when disabled. */
    disabledReason?: string;
    /** How this event interacts with other timelines. */
    timeInteraction?: string;
    /** If true, this is a perfect dodge. */
    isPerfectDodge?: boolean;
    /** Visual time-stop stretch factor. */
    timeStop?: number;
    /** Whether this event's duration is game-time or real-time dependent. */
    timeDependency?: TimeDependency;
    /** SP cost for battle skills. */
    skillPointCost?: number;
    /** Preconditions for placing this variant (OR of predicates). */
    activationClause?: import('../dsl/semantics').Predicate[];
    /** User-supplied parameters available as VARY_BY dimensions (e.g. Enemies Hit). */
    suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
    /** Stacking config — events with limit > 1 are allowed to overlap. */
    stacks?: Record<string, unknown>;
  }[];

  /** Element type of this skill column (for per-skill coloring). */
  skillElement?: string;
  /** If true, suppress the "Add" context menu for this column. */
  noAdd?: boolean;
  /** If true, events in this column are derived/computed and cannot be added, dragged, or edited. */
  derived?: boolean;
  /** Max events allowed (optional data-driven limit). */
  maxEvents?: number;
  /** Events must be added in monotonically increasing start-frame order. */
  requiresMonotonicOrder?: boolean;
  /** If true, micro-column slots freed by expired/consumed events can be reused. */
  reuseExpiredSlots?: boolean;
};

export type PlaceholderColumn = {
  key: string;
  type: import("./enums").ColumnType.PLACEHOLDER;
  ownerEntityId: string;
  color: string;
};

export type Column = MiniTimeline | PlaceholderColumn;

/**
 * Compute the total span of segments, accounting for explicit offsets.
 * When a segment has an explicit `offset`, it starts at that position
 * instead of after the previous segment.
 */
export function computeSegmentsSpan(segments: readonly EventSegmentData[]): number {
  let running = 0;
  let maxEnd = 0;
  for (const s of segments) {
    const off = s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)
      ? 0
      : s.properties.offset != null ? s.properties.offset : running;
    const end = off + s.properties.duration;
    if (end > maxEnd) maxEnd = end;
    running = s.properties.offset == null ? running + s.properties.duration : end;
  }
  return maxEnd;
}

/** Get animation duration (frames) from an event's ANIMATION segment. Returns 0 if none. */
export function getAnimationDuration(ev: Pick<TimelineEvent, 'segments'>): number {
  const seg = ev.segments.find(s => s.properties.segmentTypes?.includes(SegmentType.ANIMATION));
  return seg?.properties.duration ?? 0;
}

/** Get animation duration (frames) from a default event or variant definition's segments. Returns 0 if none. */
export function getAnimationDurationFromSegments(segments: readonly EventSegmentData[] | undefined): number {
  if (!segments) return 0;
  const seg = segments.find(s => s.properties.segmentTypes?.includes(SegmentType.ANIMATION));
  return seg?.properties.duration ?? 0;
}

/** Get the total duration of an event from its segments. */
export function eventDuration(ev: Pick<TimelineEvent, 'segments'>): number {
  return computeSegmentsSpan(ev.segments);
}

/** Get the absolute frame where the event's active portion ends (before cooldown segments). */
export function activeEndFrame(ev: Pick<TimelineEvent, 'startFrame' | 'segments'>): number {
  let running = 0;
  let activeEnd = 0;
  for (const seg of ev.segments) {
    const isCooldown = seg.properties.segmentTypes?.some(
      t => t === SegmentType.COOLDOWN || t === SegmentType.IMMEDIATE_COOLDOWN,
    );
    const off = seg.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)
      ? 0 : seg.properties.offset ?? running;
    const end = off + seg.properties.duration;
    if (!isCooldown && end > activeEnd) activeEnd = end;
    running = seg.properties.offset == null ? running + seg.properties.duration : end;
  }
  return ev.startFrame + activeEnd;
}

/** Get the end frame (startFrame + total segment duration) of an event. */
export function eventEndFrame(ev: Pick<TimelineEvent, 'startFrame' | 'segments'>): number {
  return ev.startFrame + eventDuration(ev);
}

/** Create a single-segment array with the given duration. */
export function durationSegment(duration: number): EventSegmentData[] {
  return [{ properties: { duration } }];
}

/**
 * Set the total duration of an event by mutating its segments.
 * For single-segment events, directly sets the segment's duration.
 * For multi-segment events, trims segments that extend beyond the target.
 */
export function setEventDuration(ev: TimelineEvent, duration: number) {
  if (ev.segments.length === 0) {
    ev.segments = [{ properties: { duration } }];
    return;
  }
  if (ev.segments.length === 1) {
    const seg = ev.segments[0];
    const updated = { ...seg, properties: { ...seg.properties, duration } };
    if (seg.frames) {
      const validFrames = seg.frames.filter(f => f.offsetFrame <= duration);
      updated.frames = validFrames.length > 0 ? validFrames : undefined;
    }
    ev.segments[0] = updated;
    return;
  }
  // Multi-segment: trim segments that extend beyond the target duration
  let cumOffset = 0;
  const trimmed: EventSegmentData[] = [];
  for (const seg of ev.segments) {
    if (cumOffset >= duration) break;
    const remaining = duration - cumOffset;
    if (seg.properties.duration <= remaining) {
      if (seg.frames) {
        const segStart = cumOffset;
        const validFrames = seg.frames.filter(f => segStart + f.offsetFrame <= duration);
        if (validFrames.length !== seg.frames.length) {
          trimmed.push({ ...seg, frames: validFrames.length > 0 ? validFrames : undefined });
        } else {
          trimmed.push(seg);
        }
      } else {
        trimmed.push(seg);
      }
      cumOffset += seg.properties.duration;
    } else {
      const clampedSeg = { ...seg, properties: { ...seg.properties, duration: remaining } };
      if (seg.frames) {
        const validFrames = seg.frames.filter(f => f.offsetFrame <= remaining);
        clampedSeg.frames = validFrames.length > 0 ? validFrames : undefined;
      }
      trimmed.push(clampedSeg);
      cumOffset += remaining;
    }
  }
  ev.segments = trimmed.length > 0 ? trimmed : [{ properties: { duration } }];
}
