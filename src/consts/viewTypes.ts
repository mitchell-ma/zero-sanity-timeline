/** String union for the four operator combat skills, matching the data keys in operators.ts. */
export type SkillType = "basic" | "battle" | "combo" | "ultimate";

export interface SkillDef {
  name: string;
  defaultActiveDuration: number; // frames
  defaultLingeringDuration: number; // frames
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

export interface TimelineEvent {
  id: string;
  ownerId: string;
  columnId: string;
  startFrame: number;
  activeDuration: number;
  lingeringDuration: number;
  cooldownDuration: number;
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
    defaultActiveDuration: number;
    defaultLingeringDuration: number;
    defaultCooldownDuration: number;
    triggerCondition?: string | null;
  };

  /** If true, suppress the "Add" context menu for this column. */
  noAdd?: boolean;
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
