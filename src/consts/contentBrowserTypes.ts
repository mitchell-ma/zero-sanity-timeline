export enum ContentCategory {
  OPERATORS = 'OPERATORS',
  SKILLS = 'SKILLS',
  TALENTS = 'TALENTS',
  WEAPONS = 'WEAPONS',
  GEAR_SETS = 'GEAR_SETS',
  WEAPON_EFFECTS = 'WEAPON_EFFECTS',
  GEAR_EFFECTS = 'GEAR_EFFECTS',
  OPERATOR_STATUSES = 'OPERATOR_STATUSES',
  OPERATOR_TALENTS = 'OPERATOR_TALENTS',
  CONSUMABLES = 'CONSUMABLES',
  TACTICALS = 'TACTICALS',
  EVENT_EDITOR = 'EVENT_EDITOR',
}

export interface ContentBrowserItem {
  id: string;
  name: string;
  category: ContentCategory;
  source: 'builtin' | 'custom';
  icon?: string;
  meta: string;
  color?: string;
  /** Validation/load warning for this item; when set the customizer flags it. */
  warning?: string;
}

export interface ContentSelection {
  id: string;
  category: ContentCategory;
  source: 'builtin' | 'custom';
}
