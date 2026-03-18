/**
 * Column ID constants and mappings.
 *
 * A "column ID" identifies a timeline lane — the vertical column an event
 * belongs to (e.g. 'basic', 'melting-flame', 'heatInfliction', 'combustion').
 * Not to be confused with reactive signals or pub/sub channels; these are
 * purely categorization keys that determine which timeline column renders
 * a given event.
 */

import { SkillType } from '../../consts/viewTypes';

// ── Owner IDs ─────────────────────────────────────────────────────────────

export const ENEMY_OWNER_ID = 'enemy';
export const USER_ID = 'user';

// ── Skill columns ──────────────────────────────────────────────────────────

/** Skill column ID constants — use these instead of magic strings. */
export const SKILL_COLUMNS = {
  BASIC:    'basic' as SkillType,
  BATTLE:   'battle' as SkillType,
  COMBO:    'combo' as SkillType,
  ULTIMATE: 'ultimate' as SkillType,
} as const;

export const SKILL_COLUMN_ORDER: SkillType[] = [
  SKILL_COLUMNS.BASIC, SKILL_COLUMNS.BATTLE, SKILL_COLUMNS.COMBO, SKILL_COLUMNS.ULTIMATE,
];

// ── Infliction columns ─────────────────────────────────────────────────────

/** Column IDs for elemental arts infliction lanes. */
export const INFLICTION_COLUMNS = {
  HEAT:     'heatInfliction',
  CRYO:     'cryoInfliction',
  NATURE:   'natureInfliction',
  ELECTRIC: 'electricInfliction',
} as const;

export const INFLICTION_COLUMN_IDS: Set<string> = new Set(Object.values(INFLICTION_COLUMNS));

// ── Reaction columns ───────────────────────────────────────────────────────

/** Column IDs for arts reaction lanes. */
export const REACTION_COLUMNS = {
  COMBUSTION:       'combustion',
  SOLIDIFICATION:   'solidification',
  CORROSION:        'corrosion',
  ELECTRIFICATION:  'electrification',
} as const;

/** Maps infliction columnId → arts reaction columnId. */
export const INFLICTION_TO_REACTION: Record<string, string> = {
  [INFLICTION_COLUMNS.HEAT]:     REACTION_COLUMNS.COMBUSTION,
  [INFLICTION_COLUMNS.CRYO]:     REACTION_COLUMNS.SOLIDIFICATION,
  [INFLICTION_COLUMNS.NATURE]:   REACTION_COLUMNS.CORROSION,
  [INFLICTION_COLUMNS.ELECTRIC]: REACTION_COLUMNS.ELECTRIFICATION,
};

export const REACTION_COLUMN_IDS = new Set(Object.values(INFLICTION_TO_REACTION));

// ── Physical infliction columns ───────────────────────────────────────────

/** Column IDs for physical infliction lanes. */
export const PHYSICAL_INFLICTION_COLUMNS = {
  VULNERABLE: 'vulnerableInfliction',
} as const;

export const PHYSICAL_INFLICTION_COLUMN_IDS: Set<string> = new Set(Object.values(PHYSICAL_INFLICTION_COLUMNS));

/** Column IDs for physical status lanes. */
export const PHYSICAL_STATUS_COLUMNS = {
  BREACH: 'breach',
} as const;

/** Maps physical infliction columnId → physical status columnId. */
export const PHYSICAL_INFLICTION_TO_STATUS: Record<string, string> = {
  [PHYSICAL_INFLICTION_COLUMNS.VULNERABLE]: PHYSICAL_STATUS_COLUMNS.BREACH,
};

export const PHYSICAL_STATUS_COLUMN_IDS = new Set(Object.values(PHYSICAL_INFLICTION_TO_STATUS));

// ── Operator effect columns ───────────────────────────────────────────────

export const OPERATOR_COLUMNS = {
  MELTING_FLAME:  'melting-flame',
  THUNDERLANCE:   'thunderlance',
  CRIT_STACKS:    'crit-stacks',
  ORIGINIUM_CRYSTAL: 'originium-crystal',
  WILDLAND_TREKKER_TRIGGER: 'wildland-trekker-trigger',
  DASH:           'dash',
  OTHER:          'other',
} as const;


// ── Weapon fragility columns ──────────────────────────────────────────────

/** Prefix for per-slot weapon fragility column IDs (e.g. 'fragility-slot1'). */
export const FRAGILITY_COLUMN_PREFIX = 'fragility-';

// ── Enemy group columns ───────────────────────────────────────────────────

export const ENEMY_GROUP_COLUMNS = {
  ENEMY_STATUS:         'enemy-status',
} as const;

/** Event-level column IDs for stagger frailty events (routed to unified status column). */
export const STAGGER_FRAILTY_COLUMN_ID = 'stagger-frailty';
