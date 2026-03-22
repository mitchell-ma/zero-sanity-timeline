/**
 * Column ID constants and mappings.
 *
 * A "column ID" identifies a timeline lane — the vertical column an event
 * belongs to (e.g. 'basic', 'melting-flame', 'heatInfliction', 'combustion').
 * Not to be confused with reactive signals or pub/sub channels; these are
 * purely categorization keys that determine which timeline column renders
 * a given event.
 */

import { PhysicalStatusType, StatusType } from '../../consts/enums';
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

/**
 * Column IDs for physical status lanes — use PhysicalStatusType enum values.
 *
 * Physical statuses are all triggered from Vulnerable infliction stacks,
 * but which status is applied depends on the operator's skill (unlike arts
 * where each element maps 1:1 to a reaction).
 */
export const PHYSICAL_STATUS_COLUMNS = {
  LIFT: PhysicalStatusType.LIFT,
  KNOCK_DOWN: PhysicalStatusType.KNOCK_DOWN,
  CRUSH: PhysicalStatusType.CRUSH,
  BREACH: PhysicalStatusType.BREACH,
} as const;

export const PHYSICAL_STATUS_COLUMN_IDS = new Set<string>(Object.values(PHYSICAL_STATUS_COLUMNS));

// ── Operator effect columns ───────────────────────────────────────────────

export const OPERATOR_COLUMNS = {
  MELTING_FLAME:  'melting-flame',
  THUNDERLANCE:   'thunderlance',
  CRIT_STACKS:    'crit-stacks',
  ORIGINIUM_CRYSTAL: 'originium-crystal',
  WILDLAND_TREKKER_TRIGGER: 'wildland-trekker-trigger',
  DASH:           'dash',
  CONTROLLED:     'controlled',
  OTHER:          'other',
} as const;


// ── Weapon fragility columns ──────────────────────────────────────────────

/** Prefix for per-slot weapon fragility column IDs (e.g. 'fragility-slot1'). */
export const FRAGILITY_COLUMN_PREFIX = 'fragility-';

// ── Enemy group columns ───────────────────────────────────────────────────

export const ENEMY_GROUP_COLUMNS = {
  ENEMY_STATUS:         'enemy-status',
} as const;

/** Column ID for node stagger frailty events. */
export const NODE_STAGGER_COLUMN_ID = 'node-stagger';
/** Column ID for full stagger frailty events. */
export const FULL_STAGGER_COLUMN_ID = 'full-stagger';
/** Column ID for derived combo activation window events. */
export const COMBO_WINDOW_COLUMN_ID = 'comboActivationWindow';

// ── Infliction / Reaction domain constants ───────────────────────────────

/** Maps element key (from frame data) → infliction columnId. */
export const ELEMENT_TO_INFLICTION_COLUMN: Record<string, string> = {
  HEAT: 'heatInfliction',
  CRYO: 'cryoInfliction',
  NATURE: 'natureInfliction',
  ELECTRIC: 'electricInfliction',
};

/** Maps forced reaction name → reaction columnId. */
export const FORCED_REACTION_COLUMN: Record<string, string> = {
  [StatusType.COMBUSTION]:      REACTION_COLUMNS.COMBUSTION,
  [StatusType.SOLIDIFICATION]:  REACTION_COLUMNS.SOLIDIFICATION,
  [StatusType.CORROSION]:       REACTION_COLUMNS.CORROSION,
  [StatusType.ELECTRIFICATION]: REACTION_COLUMNS.ELECTRIFICATION,
};

/** Maps self-targeted grant status → team-level derived column. */
export const TEAM_STATUS_COLUMN: Record<string, string> = {
  [StatusType.SQUAD_BUFF]: StatusType.LINK,
};

/** Default active duration for derived reaction events (20s at 120fps). */
export const REACTION_DURATION = 2400;

/** Forced reaction durations by type (frames at 120fps). */
export const FORCED_REACTION_DURATION: Record<string, number> = {
  [REACTION_COLUMNS.COMBUSTION]:      600,  // 5s
  [REACTION_COLUMNS.SOLIDIFICATION]:  600,  // 5s
  [REACTION_COLUMNS.CORROSION]:       600,  // 5s
  [REACTION_COLUMNS.ELECTRIFICATION]: 600,  // 5s
};

/** Default active duration for derived infliction events (20s at 120fps). */
export const INFLICTION_DURATION = 2400;

/** Breach durations by status level (frames at 120fps). */
export const BREACH_DURATION: Record<number, number> = {
  1: 1440,   // 12s
  2: 2160,   // 18s
  3: 2880,   // 24s
  4: 3600,   // 30s
};

/** Default active duration for derived physical infliction events (20s at 120fps). */
export const PHYSICAL_INFLICTION_DURATION = 2400;

/** P5 link extension: extra frames added to link duration when operator potential >= 5. */
export const P5_LINK_EXTENSION_FRAMES = 600; // 5s at 120fps
