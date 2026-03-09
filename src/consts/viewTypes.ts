/** String union for the four operator combat skills, matching the data keys in operators.ts. */
export type SkillType = "basic" | "battle" | "combo" | "ultimate";

export interface SkillDef {
  name: string;
  defaultActivationDuration: number; // frames
  defaultActiveDuration: number; // frames
  defaultCooldownDuration: number; // frames
  triggerCondition: string | null;
}

export interface Operator {
  id: string;
  name: string;
  color: string;
  role: string;
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
  skills: Record<SkillType, SkillDef>;
  ultimateEnergyCost: number;
  maxTalentOneLevel: number;
  maxTalentTwoLevel: number;
  triggerCapability?: import('./triggerCapabilities').TriggerCapability;
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
}

/** Arts infliction applied or absorbed by a frame. */
export interface FrameInflictionMarker {
  element: string;
  stacks: number;
}

/** Arts infliction absorption with conversion (e.g. Scorching Heart). */
export interface FrameAbsorptionMarker {
  element: string;
  stacks: number;
  exchangeStatus: string;
  ratio: string;
}

/** A damage frame marker within a segment. */
export interface EventFrameMarker {
  /** Frame offset from the start of the parent segment. */
  offsetFrame: number;
  /** SP recovered on this frame hit. */
  skillPointRecovery?: number;
  /** Stagger dealt on this frame hit. */
  stagger?: number;
  /** Arts infliction applied on this frame hit. */
  applyArtsInfliction?: FrameInflictionMarker;
  /** Arts infliction absorbed on this frame hit. */
  absorbArtsInfliction?: FrameAbsorptionMarker;
  /** Forced arts reaction applied on this frame hit (bypasses infliction stacks). */
  applyForcedReaction?: { reaction: string; statusLevel: number };
}

/** Identifies a specific frame within a sequenced event. */
export interface SelectedFrame {
  eventId: string;
  segmentIndex: number;
  frameIndex: number;
}

/** A sequence segment within a multi-sequence event (e.g. basic attack chain). */
export interface EventSegmentData {
  /** Duration of this segment in frames. */
  durationFrames: number;
  /** Label for this segment (e.g. "1", "2"). */
  label?: string;
  /** Damage frame markers within this segment. */
  frames?: EventFrameMarker[];
}

export interface TimelineEvent {
  id: string;
  /** CombatSkillsType enum value identifying this event's skill variant. */
  name: string;
  ownerId: string;
  columnId: string;
  startFrame: number;
  activationDuration: number;
  activeDuration: number;
  cooldownDuration: number;
  /** If present, this event is multi-sequence. Segments replace the standard 3-phase layout. */
  segments?: EventSegmentData[];
  /** True for manually-added arts reaction events (not derived from infliction interactions). */
  isForced?: boolean;
  /** Arts reaction status level (1–4). Higher = stronger effect. */
  statusLevel?: number;
  /**
   * Frame count from startFrame during which no other event in the same
   * mini-timeline or micro-timeline column may overlap.
   * Default is 0 (no restriction — events can always overlap).
   */
  nonOverlappableRange?: number;
}

export interface ContextMenuItem {
  label?: string;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  /** Non-interactive section header label. */
  header?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export type VisibleSkills = Record<string, Record<SkillType, boolean>>;

/** A sub-column within a micro-column mini-timeline. */
export interface MicroColumn {
  id: string;         // used as columnId for events in this micro-column
  label: string;      // short display label (e.g. "HEAT", "1")
  color: string;      // render color for events in this micro-column
}

/** Unified mini-timeline column — replaces SkillColumn, StatusColumn, MeltingFlameColumn. */
export type MiniTimeline = {
  key: string;
  type: "mini-timeline";
  source: import("./enums").TimelineSourceType;
  ownerId: string;
  columnId: string;
  label: string;
  color: string;
  headerVariant: "skill" | "infliction" | "mf";

  /** If present, this mini-timeline has micro-columns. */
  microColumns?: MicroColumn[];
  /** How events are assigned to micro-columns. */
  microColumnAssignment?: "by-order" | "by-column-id" | "dynamic-split";
  /** If set, collect events matching any of these columnIds (instead of col.columnId). */
  matchColumnIds?: string[];

  /** Default durations for new events created in this mini-timeline. */
  defaultEvent?: {
    name: string;
    defaultActivationDuration: number;
    defaultActiveDuration: number;
    defaultCooldownDuration: number;
    triggerCondition?: string | null;
    /** If present, the event is multi-sequence. */
    segments?: EventSegmentData[];
  };

  /** Multiple event variants selectable from the context menu (e.g. Laevatain battle skill). */
  eventVariants?: {
    name: string;
    defaultActivationDuration: number;
    defaultActiveDuration: number;
    defaultCooldownDuration: number;
    triggerCondition?: string | null;
    /** If present, the event is multi-sequence. */
    segments?: EventSegmentData[];
    /** If true, this variant is disabled in the context menu. */
    disabled?: boolean;
    /** Reason shown when disabled. */
    disabledReason?: string;
  }[];

  /** If true, suppress the "Add" context menu for this column. */
  noAdd?: boolean;
  /** If true, events in this column are derived/computed and cannot be added, dragged, or edited. */
  derived?: boolean;
  /** Max events allowed (e.g. MF has max 4). */
  maxEvents?: number;
  /** Events must be added in monotonically increasing start-frame order. */
  requiresMonotonicOrder?: boolean;
  /** If true, micro-column slots freed by expired/consumed events can be reused. */
  reuseExpiredSlots?: boolean;
};

export type PlaceholderColumn = {
  key: string;
  type: "placeholder";
  ownerId: string;
  color: string;
};

export type Column = MiniTimeline | PlaceholderColumn;
