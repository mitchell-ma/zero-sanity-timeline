export enum ContentCategory {
  OPERATORS = 'OPERATORS',
  SKILLS = 'SKILLS',
  TALENTS = 'TALENTS',
  WEAPONS = 'WEAPONS',
  GEAR_SETS = 'GEAR_SETS',
  WEAPON_EFFECTS = 'WEAPON_EFFECTS',
  GEAR_EFFECTS = 'GEAR_EFFECTS',
}

export interface ContentBrowserItem {
  id: string;
  name: string;
  category: ContentCategory;
  source: 'builtin' | 'custom';
  icon?: string;
  meta: string;
  color?: string;
}

export interface ContentSelection {
  id: string;
  category: ContentCategory;
  source: 'builtin' | 'custom';
}
