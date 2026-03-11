import { HitType, TimeDependency } from './enums';

/** String union for the four operator combat skills, matching the data keys in operators.ts. */
export type SkillType = "basic" | "battle" | "combo" | "ultimate";

export interface SkillDef {
  name: string;
  /** Element type of this skill (e.g. "PHYSICAL", "HEAT"). */
  element?: string;
  defaultActivationDuration: number; // frames
  defaultActiveDuration: number; // frames
  defaultCooldownDuration: number; // frames
  triggerCondition: string | null;
  /** Trigger conditions this skill publishes when used. */
  publishesTriggers?: import('./enums').TriggerConditionType[];
  /** Ultimate gauge gained by this operator when skill is used. */
  gaugeGain?: number;
  /** Ultimate gauge gained by all team operators when skill is used. */
  teamGaugeGain?: number;
  /** Per-enemy-count gauge gain map (e.g. {1: 25, 2: 30, 3: 35}). */
  gaugeGainByEnemies?: Record<number, number>;
  /** Duration (frames) of the animation sub-phase (TIME_STOP) within activation. Ultimates and combo skills. */
  animationDuration?: number;
  /** SP cost for battle skills. */
  skillPointCost?: number;
}

export interface Operator {
  id: string;
  name: string;
  color: string;
  element: string;
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
  attributeIncreaseName: string;
  attributeIncreaseAttribute: string;
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
  /** Arts infliction consumed on this frame hit (removed without exchange). */
  consumeArtsInfliction?: { element: string; stacks: number };
  /** Forced arts reaction applied on this frame hit (bypasses infliction stacks). */
  applyForcedReaction?: { reaction: string; statusLevel: number; durationFrames?: number };
  /** Status applied by this frame to a target (self or enemy). */
  applyStatus?: { target: string; status: string; stacks: number; durationFrames: number; susceptibility?: Record<string, readonly number[]>; eventName?: string };
  /** Operator status consumed by this frame (e.g. Thunderlance consumed by ultimate). */
  consumeStatus?: string;
  /** Element of damage dealt by this frame (for coloring when no infliction). */
  damageElement?: string;
  /** Whether this frame duplicates the source infliction that triggered it. */
  duplicatesSourceInfliction?: boolean;
  /** Hit type classification (Normal or Final Strike). */
  hitType?: HitType;
  /** Template SP recovery for this frame when it is the final strike (from model data). */
  templateFinalStrikeSP?: number;
  /** Template stagger for this frame when it is the final strike (from model data). */
  templateFinalStrikeStagger?: number;
  /** Ultimate gauge gained by this operator on this frame. */
  gaugeGain?: number;
  /** Ultimate gauge gained by all team operators on this frame. */
  teamGaugeGain?: number;
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
  /** Whether this segment's duration is game-time or real-time dependent. Defaults to GAME_TIME. */
  timeDependency?: TimeDependency;
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
  /** Duration (frames) of the animation sub-phase (TIME_STOP) within activation. Ultimates and combo skills. */
  animationDuration?: number;
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
  /** Ultimate gauge gained by this operator when event fires. */
  gaugeGain?: number;
  /** Ultimate gauge gained by all team operators when event fires. */
  teamGaugeGain?: number;
  /** Per-enemy-count gauge gain map (e.g. {1: 25, 2: 30, 3: 35}). */
  gaugeGainByEnemies?: Record<number, number>;
  /** Number of enemies hit (selectable in info pane when gaugeGainByEnemies exists). */
  enemiesHit?: number;
  /** Susceptibility bonuses applied by this status event (e.g. Focus), keyed by element → resolved percentage. */
  susceptibility?: Record<string, number>;
  /** For combo events: the trigger source's columnId (e.g. 'heatInfliction', 'breach'). */
  comboTriggerColumnId?: string;
  /** How this event interacts with other timelines (TIME_STOP for ultimates and perfect dodges, NONE otherwise). */
  timeInteraction?: string;
  /** If true, this dash includes a perfect dodge (i-frame), applying TIME_STOP and generating 7.5 SP. */
  isPerfectDodge?: boolean;
  /** Visual time dilation factor: 1.0 = normal, >1.0 = stretched (e.g. perfect dodge ≈ 1.709). */
  timeDilation?: number;
  /** Whether this event's duration is game-time or real-time dependent. Defaults to GAME_TIME. */
  timeDependency?: TimeDependency;
  /** Operator slot ID that originally produced this derived event. */
  sourceOwnerId?: string;
  /** Skill name of the operator event that produced this derived event. */
  sourceSkillName?: string;
  /** Outcome of a derived event: how it ended. */
  eventStatus?: 'expired' | 'consumed' | 'refreshed' | 'triggered' | 'extended';
  /** Operator slot ID responsible for this event status change. */
  eventStatusOwnerId?: string;
  /** Skill name responsible for this event status change. */
  eventStatusSkillName?: string;
  /** True if this reaction was forced (bypassed infliction stacks). */
  forcedReaction?: boolean;
  /** Operator potential (0–5) for potential-dependent derived effects. */
  operatorPotential?: number;
  /** SP cost consumed when this battle skill event fires. */
  skillPointCost?: number;
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
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export type VisibleSkills = Record<string, Record<SkillType, boolean>>;

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
  /** Per-micro-column default event overrides (name, duration). Used by dynamic-split context menu. */
  defaultEvent?: {
    name: string;
    defaultActivationDuration: number;
    defaultActiveDuration: number;
    defaultCooldownDuration: number;
  };
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
    /** Ultimate gauge gained by this operator. */
    gaugeGain?: number;
    /** Ultimate gauge gained by all team operators. */
    teamGaugeGain?: number;
    /** Per-enemy-count gauge gain map. */
    gaugeGainByEnemies?: Record<number, number>;
    /** Duration (frames) of the animation sub-phase (TIME_STOP) within activation. */
    animationDuration?: number;
    /** How this event interacts with other timelines. */
    timeInteraction?: string;
    /** If true, this is a perfect dodge. */
    isPerfectDodge?: boolean;
    /** Visual time dilation factor. */
    timeDilation?: number;
    /** Whether this event's duration is game-time or real-time dependent. */
    timeDependency?: TimeDependency;
    /** SP cost for battle skills. */
    skillPointCost?: number;
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
    /** Ultimate gauge gained by this operator. */
    gaugeGain?: number;
    /** Ultimate gauge gained by all team operators. */
    teamGaugeGain?: number;
    /** Per-enemy-count gauge gain map. */
    gaugeGainByEnemies?: Record<number, number>;
    /** Duration (frames) of the animation sub-phase (TIME_STOP) within activation. */
    animationDuration?: number;
    /** How this event interacts with other timelines. */
    timeInteraction?: string;
    /** If true, this is a perfect dodge. */
    isPerfectDodge?: boolean;
    /** Visual time dilation factor. */
    timeDilation?: number;
    /** Whether this event's duration is game-time or real-time dependent. */
    timeDependency?: TimeDependency;
    /** SP cost for battle skills. */
    skillPointCost?: number;
  }[];

  /** Element type of this skill column (for per-skill coloring). */
  skillElement?: string;
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
