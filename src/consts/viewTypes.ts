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
  channelId: string;
  startFrame: number;
  activeDuration: number;
  lingeringDuration: number;
  cooldownDuration: number;
}

export interface ContextMenuItem {
  label?: string;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export type VisibleSkills = Record<string, Record<SkillType, boolean>>;

export type SkillColumn = {
  key: string;
  type: "skill";
  ownerId: string;
  channelId: SkillType;
  operator: Operator;
  skill: SkillDef;
  color: string;
};

export type StatusColumn = {
  key: string;
  type: "status";
  ownerId: "enemy";
  channelId: string;
  status: EnemyStatus;
  color: string;
  label: string;
};

export type PlaceholderColumn = {
  key: string;
  type: "placeholder";
  ownerId: string;
  color: string;
};

export type MeltingFlameColumn = {
  key: string;
  type: "melting-flame";
  ownerId: string;
  channelId: "melting-flame";
  color: string;
};

export type Column = SkillColumn | StatusColumn | PlaceholderColumn | MeltingFlameColumn;
