/**
 * Column ID constants and mappings.
 *
 * A "column ID" identifies a timeline lane — the vertical column an event
 * belongs to (e.g. 'basic', 'MELTING_FLAME', 'heatInfliction', 'combustion').
 * Not to be confused with reactive signals or pub/sub channels; these are
 * purely categorization keys that determine which timeline column renders
 * a given event.
 */

import { PhysicalStatusType, StatusType } from '../../consts/enums';
import { SkillType } from '../../consts/viewTypes';
import { FPS } from '../../utils/timeline';
import { t } from '../../locales/locale';

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
  SHATTER:          'shatter',
} as const;

/** Maps infliction columnId → arts reaction columnId. */
export const INFLICTION_TO_REACTION: Record<string, string> = {
  [INFLICTION_COLUMNS.HEAT]:     REACTION_COLUMNS.COMBUSTION,
  [INFLICTION_COLUMNS.CRYO]:     REACTION_COLUMNS.SOLIDIFICATION,
  [INFLICTION_COLUMNS.NATURE]:   REACTION_COLUMNS.CORROSION,
  [INFLICTION_COLUMNS.ELECTRIC]: REACTION_COLUMNS.ELECTRIFICATION,
};

export const REACTION_COLUMN_IDS = new Set([...Object.values(INFLICTION_TO_REACTION), REACTION_COLUMNS.SHATTER]);

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
  MELTING_FLAME:  'MELTING_FLAME',
  THUNDERLANCE:   'THUNDERLANCE',
  CRIT_STACKS:    'CRIT_STACKS',
  ORIGINIUM_CRYSTAL: 'ORIGINIUM_CRYSTAL',
  WILDLAND_TREKKER_TRIGGER: 'WILDLAND_TREKKER_TRIGGER',
  INPUT:          'INPUT',
  CONTROLLED:     'CONTROLLED',
  OTHER:          'OTHER',
} as const;


// ── Weapon fragility columns ──────────────────────────────────────────────

/** Prefix for per-slot weapon fragility column IDs (e.g. 'fragility-slot1'). */
export const FRAGILITY_COLUMN_PREFIX = 'fragility-';

// ── Enemy action columns ──────────────────────────────────────────────────

/** Column ID for enemy action timeline (HIT events that deal damage to operators). */
export const ENEMY_ACTION_COLUMN_ID = 'enemy-action';

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

/** Reverse: infliction column → element. */
export const INFLICTION_COLUMN_TO_ELEMENT: Record<string, string> = Object.fromEntries(
  Object.entries(ELEMENT_TO_INFLICTION_COLUMN).map(([el, col]) => [col, el]),
);

/** Maps forced reaction name → reaction columnId. */
export const FORCED_REACTION_COLUMN: Record<string, string> = {
  [StatusType.COMBUSTION]:      REACTION_COLUMNS.COMBUSTION,
  [StatusType.SOLIDIFICATION]:  REACTION_COLUMNS.SOLIDIFICATION,
  [StatusType.CORROSION]:       REACTION_COLUMNS.CORROSION,
  [StatusType.ELECTRIFICATION]: REACTION_COLUMNS.ELECTRIFICATION,
};

/** Maps reaction status name → reaction column ID. */
export const REACTION_STATUS_TO_COLUMN: Record<string, string> = {
  COMBUSTION:       REACTION_COLUMNS.COMBUSTION,
  SOLIDIFICATION:   REACTION_COLUMNS.SOLIDIFICATION,
  CORROSION:        REACTION_COLUMNS.CORROSION,
  ELECTRIFICATION:  REACTION_COLUMNS.ELECTRIFICATION,
};

/** Maps skill noun type → skill column ID. */
export const SKILL_NOUN_TO_COLUMN: Record<string, string> = {
  COMBO_SKILL:  SKILL_COLUMNS.COMBO,
  BATTLE_SKILL: SKILL_COLUMNS.BATTLE,
  ULTIMATE:     SKILL_COLUMNS.ULTIMATE,
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

/** Shatter reaction duration (2s at 120fps). */
export const SHATTER_DURATION = 2 * FPS;

// ── Reaction micro-columns ──────────────────────────────────────────────────

export const REACTION_MICRO_COLUMNS = [
  { id: 'combustion',      label: t('reaction.micro.combustion'),  color: '#ff5522' },
  { id: 'solidification',  label: t('reaction.micro.solidification'), color: '#88ddff' },
  { id: 'corrosion',       label: t('reaction.micro.corrosion'),  color: '#33cc66' },
  { id: 'electrification', label: t('reaction.micro.electrification'),  color: '#e8c840' },
  { id: 'shatter',         label: t('reaction.micro.shatter'),    color: '#88ddff' },
];

export const REACTION_LABELS: Record<string, { label: string; color: string }> = {
  combustion:      { label: t('reaction.combustion'),      color: '#ff5522' },
  solidification:  { label: t('reaction.solidification'),  color: '#88ddff' },
  corrosion:       { label: t('reaction.corrosion'),       color: '#33cc66' },
  electrification: { label: t('reaction.electrification'), color: '#e8c840' },
  shatter:         { label: t('reaction.shatter'),         color: '#88ddff' },
};

// ── Physical infliction / status micro-columns ──────────────────────────────

export const PHYSICAL_INFLICTION_LABELS: Record<string, { label: string; color: string }> = {
  vulnerableInfliction: { label: t('physicalInfliction.vulnerable'), color: '#c0c8d0' },
};

export const PHYSICAL_INFLICTION_MICRO_COLUMNS = [
  { id: 'vuln-0', label: t('physicalInfliction.micro.vuln'), color: '#c0c8d0' },
  { id: 'vuln-1', label: t('physicalInfliction.micro.vuln'), color: '#c0c8d0' },
  { id: 'vuln-2', label: t('physicalInfliction.micro.vuln'), color: '#c0c8d0' },
  { id: 'vuln-3', label: t('physicalInfliction.micro.vuln'), color: '#c0c8d0' },
];

export const PHYSICAL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  [PhysicalStatusType.LIFT]: { label: t('physicalStatus.LIFT'), color: '#c0c8d0' },
  [PhysicalStatusType.KNOCK_DOWN]: { label: t('physicalStatus.KNOCK_DOWN'), color: '#c0c8d0' },
  [PhysicalStatusType.CRUSH]: { label: t('physicalStatus.CRUSH'), color: '#c0c8d0' },
  [PhysicalStatusType.BREACH]: { label: t('physicalStatus.BREACH'), color: '#c0c8d0' },
};

export const PHYSICAL_STATUS_MICRO_COLUMNS = [
  { id: PhysicalStatusType.LIFT, label: t('physicalStatus.micro.LIFT'), color: '#c0c8d0' },
  { id: PhysicalStatusType.KNOCK_DOWN, label: t('physicalStatus.micro.KNOCK_DOWN'), color: '#c0c8d0' },
  { id: PhysicalStatusType.CRUSH, label: t('physicalStatus.micro.CRUSH'), color: '#c0c8d0' },
  { id: PhysicalStatusType.BREACH, label: t('physicalStatus.micro.BREACH'), color: '#c0c8d0' },
];
