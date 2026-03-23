/**
 * OperatorJsonLoader — thin adapter that composes data from the three operator
 * controllers (operatorsController, operatorSkillsController, operatorStatusesController)
 * into the merged JSON format that dataDrivenEventFrames expects.
 *
 * This file is being gradually replaced by direct controller imports.
 * Only functions that depend on the frame pipeline remain here.
 */
import {
  buildSequencesFromOperatorJson,
  DataDrivenSkillEventSequence,
} from "./dataDrivenEventFrames";
import {
  getOperatorBase,
  getAllOperatorBaseIds,
} from '../game-data/operatorsController';
import {
  getOperatorSkills,
  getOperatorSkillIds as controllerGetSkillIds,
} from '../game-data/operatorSkillsController';
import {
  getOperatorStatuses as controllerGetStatuses,
} from '../game-data/operatorStatusesController';

// ── Status key normalization ─────────────────────────────────────────────────

/** Key mappings: short (operator-statuses) → long (engine-expected). */
const KEY_EXPAND: Record<string, string> = {
  verb: 'verb', object: 'object', subject: 'subject',
  to: 'to',
  from: 'fromObject',
  on: 'onObject',
  with: 'with', for: 'for',
};

/** Recursively expand short keys in a JSON value. */
function expandKeys(val: unknown): unknown {
  if (val == null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(expandKeys);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    out[KEY_EXPAND[k] ?? k] = expandKeys(v);
  }
  return out;
}

// ── SkillTypeMap inference ──────────────────────────────────────────────────

/**
 * Infer skillTypeMap from skill entries by naming conventions:
 * - Skills with _FINISHER/_DIVE variants → BASIC_ATTACK
 * - Skills with onTriggerClause → COMBO_SKILL
 * - Skills with ANIMATION + ACTIVE/STASIS segments → ULTIMATE
 * - Remaining skill → BATTLE_SKILL
 */
function inferSkillTypeMap(skills: ReadonlyMap<string, { onTriggerClause: unknown[]; segments: unknown[] }>): Record<string, unknown> {
  const typeMap: Record<string, unknown> = {};
  const skillIds: string[] = [];
  skills.forEach((_, id) => skillIds.push(id));

  // Find BASIC_ATTACK: the skill that has _FINISHER and _DIVE variants
  const finisherIds = skillIds.filter(id => id.endsWith('_FINISHER'));
  const diveIds = skillIds.filter(id => id.endsWith('_DIVE'));

  let batkId: string | undefined;
  for (const fId of finisherIds) {
    const base = fId.replace(/_FINISHER$/, '');
    if (skills.has(base)) {
      batkId = base;
      const batk: Record<string, string> = { BATK: base };
      batk.FINISHER = fId;
      const diveId = diveIds.find(d => d.replace(/_DIVE$/, '') === base);
      if (diveId) batk.DIVE = diveId;
      typeMap.BASIC_ATTACK = batk;
      break;
    }
  }

  // Filter to base skills (not enhanced/empowered/finisher/dive)
  const variantSuffixes = ['_FINISHER', '_DIVE', '_ENHANCED', '_EMPOWERED', '_ENHANCED_EMPOWERED'];
  const baseSkills = skillIds.filter(id => {
    if (id === batkId) return false;
    return !variantSuffixes.some(s => id.endsWith(s));
  });

  // Find COMBO_SKILL: has onTriggerClause
  for (const id of baseSkills) {
    const skill = skills.get(id);
    if (skill?.onTriggerClause?.length) {
      typeMap.COMBO_SKILL = id;
      break;
    }
  }

  // Remaining base skills (not BATK, not COMBO)
  const remaining = baseSkills.filter(id => id !== typeMap.COMBO_SKILL);

  // Find ULTIMATE: has ANIMATION segment type
  for (const id of remaining) {
    const skill = skills.get(id);
    const segs = skill?.segments as { properties: { segmentTypes?: string[] } }[] | undefined;
    if (segs?.some(s => s.properties.segmentTypes?.includes('ANIMATION'))) {
      typeMap.ULTIMATE = id;
      break;
    }
  }

  // BATTLE_SKILL: the remaining one
  const battleCandidates = remaining.filter(id => id !== typeMap.ULTIMATE);
  if (battleCandidates.length === 1) {
    typeMap.BATTLE_SKILL = battleCandidates[0];
  }

  return typeMap;
}

// ── Merged JSON builder (for dataDrivenEventFrames) ─────────────────────────

/**
 * Build the merged operator JSON that dataDrivenEventFrames expects.
 * Composes from the three controllers + infers skillTypeMap.
 */
export function getOperatorJson(operatorId: string): Record<string, unknown> | undefined {
  const base = getOperatorBase(operatorId);
  if (!base) return undefined;

  const skills = getOperatorSkills(operatorId);
  const skillEntries: Record<string, unknown> = {};
  let skillTypeMap: Record<string, unknown> = {};

  if (skills) {
    skills.forEach((skill, skillId) => {
      skillEntries[skillId] = skill.serialize();
    });
    skillTypeMap = inferSkillTypeMap(skills);
  }

  const statuses = controllerGetStatuses(operatorId);
  const statusEvents = statuses.map(s => expandKeys(s.serialize()));

  return {
    ...base.serialize(),
    skills: skillEntries,
    skillTypeMap,
    ...(statusEvents.length > 0 ? { statusEvents } : {}),
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Get all registered operator IDs. */
export function getAllOperatorIds(): string[] {
  return getAllOperatorBaseIds();
}

/** Get all skill IDs for an operator. */
export function getSkillIds(operatorId: string): Set<string> {
  const ids = controllerGetSkillIds(operatorId);
  ids.add('FINISHER');
  ids.add('DIVE');
  return ids;
}

/**
 * Get the flattened skill type map: { BASIC_ATTACK → batkId, BATTLE_SKILL → id, ... }.
 */
export function getSkillTypeMap(operatorId: string): Record<string, string> {
  const skills = getOperatorSkills(operatorId);
  if (!skills) return {};
  const raw = inferSkillTypeMap(skills);
  const flat: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    flat[key] = typeof val === 'string' ? val : (val as Record<string, string> | undefined)?.BATK ?? key;
  }
  return flat;
}

/**
 * Get the raw skill type map for an operator.
 * BASIC_ATTACK may be an object { BATK, FINISHER, DIVE }; other entries are strings.
 */
export function getRawSkillTypeMap(operatorId: string): Record<string, unknown> {
  const skills = getOperatorSkills(operatorId);
  if (!skills) return {};
  return inferSkillTypeMap(skills);
}

/**
 * Resolve the skill type (BASIC_ATTACK, BATTLE_SKILL, etc.) for a given skill ID.
 */
export function resolveSkillType(operatorId: string, skillId: string): string | null {
  if (skillId === 'FINISHER' || skillId === 'DIVE') return 'BASIC_ATTACK';
  const typeMap = getSkillTypeMap(operatorId);
  for (const [type, baseId] of Object.entries(typeMap)) {
    if (baseId === skillId) return type;
  }
  const suffixes = ['_ENHANCED_EMPOWERED', '_ENHANCED', '_EMPOWERED'];
  for (const suffix of suffixes) {
    if (skillId.endsWith(suffix)) {
      const baseId = skillId.slice(0, -suffix.length);
      for (const [type, id] of Object.entries(typeMap)) {
        if (id === baseId) return type;
      }
    }
  }
  return null;
}

/** Sequence cache keyed by `operatorId:skillId`. */
const sequenceCache = new Map<string, readonly DataDrivenSkillEventSequence[]>();

/** Get frame sequences for a skill ID, with caching. */
export function getFrameSequences(
  operatorId: string,
  skillId: string,
): readonly DataDrivenSkillEventSequence[] {
  const cacheKey = `${operatorId}:${skillId}`;
  const cached = sequenceCache.get(cacheKey);
  if (cached) return cached;

  const json = getOperatorJson(operatorId);
  if (!json) return [];

  const sequences = buildSequencesFromOperatorJson(json, skillId);
  sequenceCache.set(cacheKey, sequences);
  return sequences;
}

/** Get segment labels for a multi-sequence skill. */
export function getSegmentLabels(
  operatorId: string,
  skillId: string,
): string[] | undefined {
  const sequences = getFrameSequences(operatorId, skillId);
  if (sequences.length <= 1) return undefined;
  const labels = sequences
    .map(seq => seq.segmentName)
    .filter((name): name is string => name != null);
  return labels.length === sequences.length ? labels : undefined;
}

/** A trigger condition predicate. */
export interface TriggerCondition {
  subject: string;
  verb: string;
  object?: string;
  objectId?: string;
  negated?: boolean;
  cardinalityConstraint?: string;
  value?: number | string | Record<string, unknown>;
  element?: string;
  adjective?: string;
  subjectDeterminer?: string;
  to?: string;
  toDeterminer?: string;
}

/** Combo trigger info. */
export interface ComboTriggerInfo {
  onTriggerClause: readonly { conditions: TriggerCondition[] }[];
  description: string;
  windowFrames: number;
}

/**
 * Get the combo skill's onTriggerClause.
 * Finds the combo skill (has onTriggerClause) and returns its trigger clause.
 */
export function getComboTriggerClause(operatorId: string): readonly { conditions: TriggerCondition[] }[] | undefined {
  const skills = getOperatorSkills(operatorId);
  if (!skills) return undefined;
  let result: readonly { conditions: TriggerCondition[] }[] | undefined;
  skills.forEach(skill => {
    if (!result && skill.onTriggerClause.length > 0) {
      result = skill.onTriggerClause as readonly { conditions: TriggerCondition[] }[];
    }
  });
  return result;
}

/**
 * Get the combo skill's trigger info.
 */
export function getComboTriggerInfo(operatorId: string): ComboTriggerInfo | undefined {
  const skills = getOperatorSkills(operatorId);
  if (!skills) return undefined;
  let result: ComboTriggerInfo | undefined;
  skills.forEach(skill => {
    if (!result && skill.onTriggerClause.length > 0) {
      result = {
        onTriggerClause: skill.onTriggerClause as readonly { conditions: TriggerCondition[] }[],
        description: skill.description ?? '',
        windowFrames: skill.windowFrames ?? 720,
      };
    }
  });
  return result;
}

// ── ID collection helpers ───────────────────────────────────────────────────

/** Status entry: ID + display label. */
export interface StatusIdEntry { id: string; label: string; }

/**
 * Collect all status IDs with display names.
 */
let _allStatusEntries: StatusIdEntry[] | null = null;
export function getAllStatusIds(): StatusIdEntry[] {
  if (_allStatusEntries) return _allStatusEntries;
  const seen = new Set<string>();
  const entries: StatusIdEntry[] = [];
  const { STATUS_LABELS } = require('../../consts/timelineColumnLabels');
  const { StatusType, ReactionType } = require('../../consts/enums');

  const reactionIds = new Set(Object.values(ReactionType) as string[]);

  for (const id of Object.values(StatusType) as string[]) {
    if (!seen.has(id) && !reactionIds.has(id)) {
      seen.add(id);
      entries.push({ id, label: STATUS_LABELS[id] ?? id });
    }
  }

  for (const operatorId of getAllOperatorBaseIds()) {
    const statuses = controllerGetStatuses(operatorId);
    for (const status of statuses) {
      if (!seen.has(status.id)) {
        seen.add(status.id);
        entries.push({ id: status.id, label: status.name || STATUS_LABELS[status.id] || status.id });
      }
    }
  }

  entries.sort((a, b) => a.label.localeCompare(b.label));
  _allStatusEntries = entries;
  return _allStatusEntries;
}

/**
 * Collect all reaction IDs with display names.
 */
let _allReactionEntries: StatusIdEntry[] | null = null;
export function getAllReactionIds(): StatusIdEntry[] {
  if (_allReactionEntries) return _allReactionEntries;
  const { ArtsReactionType, PhysicalStatusType } = require('../../consts/enums');
  const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
  const entries: StatusIdEntry[] = [];
  for (const id of Object.values(ArtsReactionType) as string[]) {
    entries.push({ id, label: titleCase(id) });
  }
  for (const id of Object.values(PhysicalStatusType) as string[]) {
    entries.push({ id, label: titleCase(id) });
  }
  _allReactionEntries = entries;
  return _allReactionEntries;
}

/**
 * Collect all infliction IDs with display names.
 */
let _allInflictionEntries: StatusIdEntry[] | null = null;
export function getAllInflictionIds(): StatusIdEntry[] {
  if (_allInflictionEntries) return _allInflictionEntries;
  const { InflictionType } = require('../../consts/enums');
  const entries: StatusIdEntry[] = [];
  for (const id of Object.values(InflictionType) as string[]) {
    const label = id.replace(/_INFLICTION$/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
    entries.push({ id, label });
  }
  entries.sort((a, b) => a.label.localeCompare(b.label));
  _allInflictionEntries = entries;
  return _allInflictionEntries;
}

// Re-export timing functions from dataDrivenEventFrames
export {
  getSkillTimings,
  getUltimateEnergyCost,
  getSkillGaugeGains,
  getBattleSkillSpCost,
  getSkillCategoryData,
  getBasicAttackDurations,
} from "./dataDrivenEventFrames";
export type { SkillTimings, SkillGaugeGains, SkillCategoryData } from "./dataDrivenEventFrames";
