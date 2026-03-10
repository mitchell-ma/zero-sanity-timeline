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

// ── Skill columns ──────────────────────────────────────────────────────────

export const SKILL_COLUMN_ORDER: SkillType[] = ['basic', 'battle', 'combo', 'ultimate'];

// ── Infliction columns ─────────────────────────────────────────────────────

export const INFLICTION_COLUMN_IDS = new Set([
  'heatInfliction', 'cryoInfliction', 'natureInfliction', 'electricInfliction',
]);

/** Maps infliction columnId → arts reaction columnId. */
export const INFLICTION_TO_REACTION: Record<string, string> = {
  heatInfliction:     'combustion',
  cryoInfliction:     'solidification',
  natureInfliction:   'corrosion',
  electricInfliction: 'electrification',
};

// ── Reaction columns ───────────────────────────────────────────────────────

export const REACTION_COLUMN_IDS = new Set(Object.values(INFLICTION_TO_REACTION));

// ── Physical infliction columns ───────────────────────────────────────────

export const PHYSICAL_INFLICTION_COLUMN_IDS = new Set([
  'vulnerableInfliction',
]);

/** Maps physical infliction columnId → physical status columnId. */
export const PHYSICAL_INFLICTION_TO_STATUS: Record<string, string> = {
  vulnerableInfliction: 'breach',
};

export const PHYSICAL_STATUS_COLUMN_IDS = new Set(Object.values(PHYSICAL_INFLICTION_TO_STATUS));
