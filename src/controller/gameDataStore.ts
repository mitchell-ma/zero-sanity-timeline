/**
 * GameDataStore — single public facade for all game data access.
 *
 * All consumers import from here. configStore and sub-stores are internal.
 */

import { ElementType, ArtsReactionType, PhysicalStatusType, StatusType, EventCategoryType } from '../consts/enums';
import { NounType } from '../dsl/semantics';
import { t } from '../locales/locale';
import {
  INFLICTION_COLUMNS, REACTION_COLUMNS,
  PHYSICAL_INFLICTION_COLUMNS,
  NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID,
  ENEMY_ACTION_COLUMN_ID,
} from '../model/channels';

// ── configStore (private to this module) ─────────────────────────────────────

import {
  // Operators
  getOperatorBase,
  getAllOperatorBases,
  getAllOperatorBaseIds,
  getOperatorBasesByClass,
  getOperatorBasesByElement,
  getOperatorIdByName,
  getOperatorPotentialRaw,
  registerCustomOperatorBase,
  deregisterCustomOperatorBase,
  type OperatorBase,

  // Operator skills
  getOperatorSkills,
  getOperatorSkill,
  getOperatorSkillIds,
  getAllOperatorSkillSetIds,
  type OperatorSkill,

  // Operator statuses
  getOperatorStatuses,
  getAllOperatorStatusOriginIds,
  getAllOperatorStatuses,
  type OperatorStatus,

  // Weapons
  getWeapon,
  getAllWeapons,
  getWeaponsByType,
  findWeaponBySkillId,
  registerCustomWeapon,
  deregisterCustomWeapon,
  type Weapon,

  // Gear pieces
  getGearPiece,
  getAllGearPieces,
  getGearPiecesBySet,
  getGearPiecesByType,
  registerCustomGearPiece,
  deregisterCustomGearPiece,
  type GearPiece,

  // Gear statuses & set effects
  getGearSet,
  getAllGearSetIds,
  getAllGearSets,
  getGearStats,
  getAllGearStatOriginIds,
  type GearSet,
  type GearStat,

  // Weapon skills
  getGenericWeaponSkill,
  getNamedWeaponSkill,
  getGenericSkillStats,
  getNamedSkillPassiveStats,
  type WeaponSkillStatResult,
  type WeaponSkill,

  // Weapon statuses
  getWeaponStats,
  getAllWeaponStatOriginIds,

  // Weapon & gear effects
  getWeaponEffectDefs,
  getGearEffectDefs,
  getWeaponTriggerDefs,
  getWeaponStatTriggerDefs,
  getGearTriggerDefs,
  getGearStatTriggerDefs,
  getConsumablePassiveDef,
  getTacticalTriggerDef,
  getAllWeaponEffectIds,
  getAllGearEffectTypes,
  registerCustomWeaponEffectDefs,
  deregisterCustomWeaponEffectDefs,
  registerCustomGearEffectDefs,
  deregisterCustomGearEffectDefs,
  getGearEffectLabel,
  resolveTargetDisplay,
  resolveDurationSeconds,
  resolveTriggerInteractions,
  type NormalizedEffectDef,

  // Operator JSON composition
  buildMergedOperatorJson,
  getAllOperatorIds,
  getEnabledStatusEvents,
  getSkillIds,
  getSkillTypeMap,
  getRawSkillTypeMap,
  resolveSkillType,
  getFrameSequences,
  getSegmentLabels,
  getComboTriggerClause,
  getComboTriggerInfo,
  getComboSkillIds,
  getAllStatusIds,
  getAllReactionIds,
  getAllInflictionIds,
  getTeamStatusIds,
  type TriggerCondition,
  type ComboTriggerInfo,
  type StatusIdEntry,

  // Frame pipeline
  buildSequencesFromOperatorJson,
  DataDrivenSkillEventSequence,
  getSkillTimings,
  getUltimateEnergyCost,
  getBattleSkillSpCost,
  getBasicAttackDurations,
  type SkillTimings,

  // Gear set data
  getGearSetData,
  getAllGearSetData,
  type GearSetData,
  type GearPieceData,

  // Operator configs & trigger associations
  getOperatorConfig,
  getAllOperatorConfigs,
  getSkillConfig,
  getStatusEventConfig,
  getTriggerAssociations,
  getAllTriggerAssociations,
  type SkillConfig,
  type StatusEventConfig,
  type OperatorConfig,
  type TriggerAssociation,
} from './configStore';

// ── Consumables & Tacticals ─────────────────────────────────────────────────

import {
  getConsumable, getAllConsumables,
  getTactical, getAllTacticals,
  type ConsumableData, type TacticalData,
} from '../model/game-data/consumablesStore';

// ── Re-export types ─────────────────────────────────────────────────────────

export type {
  Weapon,
  GearPiece,
  GearSet,
  GearStat,
  WeaponSkill,
  WeaponSkillStatResult,
  OperatorBase,
  OperatorSkill,
  OperatorStatus,
  SkillConfig,
  StatusEventConfig,
  OperatorConfig,
  TriggerAssociation,
  NormalizedEffectDef,
  TriggerCondition,
  ComboTriggerInfo,
  StatusIdEntry,
  SkillTimings,
  GearSetData,
  GearPieceData,
};

// ── Weapons ─────────────────────────────────────────────────────────────────

export { getWeapon, getAllWeapons, getWeaponsByType, findWeaponBySkillId };
export { registerCustomWeapon, deregisterCustomWeapon };

// ── Gear pieces ─────────────────────────────────────────────────────────────

export { getGearPiece, getAllGearPieces, getGearPiecesBySet, getGearPiecesByType };
export { registerCustomGearPiece, deregisterCustomGearPiece };

// ── Gear statuses & set effects ─────────────────────────────────────────────

export { getGearSet, getAllGearSetIds, getAllGearSets };
export { getGearStats, getAllGearStatOriginIds };

// ── Weapon skills ───────────────────────────────────────────────────────────

export { getGenericWeaponSkill, getNamedWeaponSkill };
export { getGenericSkillStats, getNamedSkillPassiveStats };

// ── Weapon statuses ─────────────────────────────────────────────────────────

export { getWeaponStats, getAllWeaponStatOriginIds };

// ── Weapon & gear effects ──────────────────────────────────────────────────

export { getWeaponEffectDefs, getGearEffectDefs, getAllWeaponEffectIds, getAllGearEffectTypes };
export { getWeaponTriggerDefs, getWeaponStatTriggerDefs, getGearTriggerDefs, getGearStatTriggerDefs, getConsumablePassiveDef, getTacticalTriggerDef };
export { registerCustomWeaponEffectDefs, deregisterCustomWeaponEffectDefs };
export { registerCustomGearEffectDefs, deregisterCustomGearEffectDefs };
export { getGearEffectLabel, resolveTargetDisplay, resolveDurationSeconds, resolveTriggerInteractions };

// ── Operator base ───────────────────────────────────────────────────────

export { getOperatorBase, getAllOperatorBases, getAllOperatorBaseIds };
export { getOperatorBasesByClass, getOperatorBasesByElement, getOperatorIdByName };
export { getOperatorPotentialRaw };
export { registerCustomOperatorBase, deregisterCustomOperatorBase };

// ── Operator skills ─────────────────────────────────────────────────────

export { getOperatorSkills, getOperatorSkill, getOperatorSkillIds, getAllOperatorSkillSetIds };

// ── Operator statuses ───────────────────────────────────────────────────────

export { getOperatorStatuses, getAllOperatorStatusOriginIds, getAllOperatorStatuses };

/** Get the `with` property keys that a specific status supports, derived from its clause effects. */
export function getStatusWithProperties(statusId: string): string[] {
  const allStatuses = getAllOperatorStatuses();
  for (const status of allStatuses) {
    if (status.id === statusId) {
      const withKeys = new Set<string>();
      const segmentClauses = (status.segments ?? []).flatMap((s: { clause?: unknown[] }) => s.clause ?? []);
      const clauses = [...segmentClauses, ...(status.onTriggerClause ?? [])];
      for (const c of clauses) {
        const predicate = c as { effects?: { with?: Record<string, unknown> }[] };
        for (const ef of predicate.effects ?? []) {
          if (ef.with) {
            for (const key of Object.keys(ef.with)) withKeys.add(key);
          }
        }
      }
      return Array.from(withKeys);
    }
  }
  return [];
}

// ── Operator JSON composition ───────────────────────────────────────────────

export { buildMergedOperatorJson, getAllOperatorIds, getEnabledStatusEvents };

// ── Team status resolution (data-driven from status JSON configs) ──────────

let _teamStatusIds: Set<string> | null = null;

/** Build the set of status IDs that target the team (to === NounType.TEAM). */
function buildTeamStatusIds(): Set<string> {
  if (_teamStatusIds) return _teamStatusIds;
  const ids = new Set<string>();
  for (const s of getAllOperatorStatuses()) {
    if (s.to === NounType.TEAM && s.id) ids.add(s.id);
  }
  _teamStatusIds = ids;
  return ids;
}

/** Check if a status ID targets the team (to === NounType.TEAM in its JSON config). */
export function isTeamStatus(statusId: string): boolean {
  return buildTeamStatusIds().has(statusId);
}

export { getSkillIds, getSkillTypeMap, getRawSkillTypeMap, resolveSkillType };
export { getFrameSequences, getSegmentLabels };
export { getComboTriggerClause, getComboTriggerInfo, getComboSkillIds };
export { getAllStatusIds, getAllReactionIds, getAllInflictionIds };
export { getTeamStatusIds };

// ── Frame pipeline ──────────────────────────────────────────────────────────

export { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence };
export { getSkillTimings, getUltimateEnergyCost, getBattleSkillSpCost, getBasicAttackDurations };

// ── Gear set data ───────────────────────────────────────────────────────────

export { getGearSetData, getAllGearSetData };

// ── Operator configs & trigger associations ─────────────────────────────────

export { getOperatorConfig, getAllOperatorConfigs };
export { getSkillConfig, getStatusEventConfig };
export { getTriggerAssociations, getAllTriggerAssociations };

// ── Consumables & Tacticals ─────────────────────────────────────────────────

export { getConsumable, getAllConsumables };
export { getTactical, getAllTacticals };

export type { ConsumableData, TacticalData };

// ── Derived label / metadata maps ────────────────────────────────────────────

let _skillLabels: Record<string, string> | null = null;

export function getAllSkillLabels(): Record<string, string> {
  if (_skillLabels) return _skillLabels;
  const labels: Record<string, string> = {
    [NounType.DASH]: t('skill.DASH'),
    [NounType.FINISHER]: t('skill.FINISHER'),
    [NounType.DIVE]: t('skill.DIVE'),
    [NounType.CONTROL]: t('skill.CONTROL'),
  };
  for (const operatorId of getAllOperatorSkillSetIds()) {
    const skills = getOperatorSkills(operatorId);
    if (!skills) continue;
    skills.forEach((skill) => {
      if (skill.name) labels[skill.id] = skill.name;
    });
  }
  _skillLabels = labels;
  return _skillLabels;
}

let _statusLabels: Record<string, string> | null = null;

export function getAllStatusLabels(): Record<string, string> {
  if (_statusLabels) return _statusLabels;
  const labels: Record<string, string> = {
    // Game-mechanic status labels
    [StatusType.FOCUS]:           t('status.FOCUS'),
    [StatusType.SUSCEPTIBILITY]:  t('status.SUSCEPTIBILITY'),
    [StatusType.FRAGILITY]:       t('status.FRAGILITY'),
    [StatusType.WEAKNESS]:        t('status.WEAKNESS'),
    [StatusType.DMG_REDUCTION]:   t('status.DMG_REDUCTION'),
    [StatusType.PROTECTION]:      t('status.PROTECTION'),
    [StatusType.LINK]:            t('status.LINK'),
    [StatusType.SHIELD]:          t('status.SHIELD'),
    [StatusType.GEAR_BUFF]:       t('status.GEAR_BUFF'),
    // Reactions
    [StatusType.COMBUSTION]:      t('status.COMBUSTION'),
    [StatusType.SOLIDIFICATION]:  t('status.SOLIDIFICATION'),
    [StatusType.CORROSION]:       t('status.CORROSION'),
    [StatusType.ELECTRIFICATION]: t('status.ELECTRIFICATION'),
    // Physical statuses
    [StatusType.LIFT]:            t('status.LIFT'),
    [StatusType.KNOCK_DOWN]:      t('status.KNOCK_DOWN'),
    [StatusType.CRUSH]:           t('status.CRUSH'),
    [StatusType.BREACH]:          t('status.BREACH'),
    [StatusType.SHATTER]:         t('status.SHATTER'),
  };
  // Operator statuses from JSON
  for (const status of getAllOperatorStatuses()) {
    if (status.name) labels[status.id] = status.name;
  }
  // Weapon statuses
  for (const originId of getAllWeaponStatOriginIds()) {
    for (const ws of getWeaponStats(originId)) {
      if (ws.name && ws.id) labels[ws.id] = ws.name;
    }
  }
  // Gear statuses
  for (const originId of getAllGearStatOriginIds()) {
    for (const gs of getGearStats(originId)) {
      if (gs.name && gs.id) labels[gs.id] = gs.name;
    }
  }
  // Gear set effects
  for (const gse of getAllGearSets()) {
    if (gse.name && gse.id) labels[gse.id] = gse.name;
  }
  _statusLabels = labels;
  return _statusLabels;
}

let _inflictionLabels: Record<string, string> | null = null;

/** All infliction/reaction/status event display labels. */
export function getAllInflictionLabels(): Record<string, string> {
  if (_inflictionLabels) return _inflictionLabels;
  _inflictionLabels = {
    // Arts inflictions
    [INFLICTION_COLUMNS.HEAT]:     t('infliction.heat'),
    [INFLICTION_COLUMNS.CRYO]:     t('infliction.cryo'),
    [INFLICTION_COLUMNS.NATURE]:   t('infliction.nature'),
    [INFLICTION_COLUMNS.ELECTRIC]: t('infliction.electric'),
    // Physical inflictions
    [PHYSICAL_INFLICTION_COLUMNS.VULNERABLE]: t('infliction.vulnerable'),
    // Arts reactions
    [REACTION_COLUMNS.COMBUSTION]:       t('reaction.combustion'),
    [REACTION_COLUMNS.SOLIDIFICATION]:   t('reaction.solidification'),
    [REACTION_COLUMNS.CORROSION]:        t('reaction.corrosion'),
    [REACTION_COLUMNS.ELECTRIFICATION]:  t('reaction.electrification'),
    // Physical statuses
    [PhysicalStatusType.BREACH]:  t('physicalStatus.BREACH'),
    // Combat statuses
    [StatusType.FOCUS]:           t('status.FOCUS'),
    [StatusType.SUSCEPTIBILITY]:  t('status.SUSCEPTIBILITY'),
    [StatusType.SHIELD]:          t('status.SHIELD'),
    [StatusType.FRAGILITY]:       t('status.FRAGILITY'),
    // Stagger
    [NODE_STAGGER_COLUMN_ID]:     t('stagger.node'),
    [FULL_STAGGER_COLUMN_ID]:     t('stagger.full'),
    // Enemy actions
    [ENEMY_ACTION_COLUMN_ID]:     t('enemyAction.AOE_PHYSICAL'),
  };
  return _inflictionLabels;
}

// ── Status lookup by ID ───────────────────────────────────────────────────

let _statusByIdCache: Map<string, OperatorStatus> | null = null;

function buildStatusByIdCache() {
  if (_statusByIdCache) return _statusByIdCache;
  const cache = new Map<string, OperatorStatus>();
  for (const status of getAllOperatorStatuses()) {
    if (status.id && !cache.has(status.id)) {
      cache.set(status.id, status);
    }
  }
  _statusByIdCache = cache;
  return cache;
}

/** Look up any operator/generic status definition by its ID. */
export function getStatusById(statusId: string): OperatorStatus | undefined {
  return buildStatusByIdCache().get(statusId);
}

/** Look up the EventCategoryType for any status by ID (operator, weapon, or gear). */
export function getStatusCategoryById(statusId: string): EventCategoryType | undefined {
  const opStatus = buildStatusByIdCache().get(statusId);
  if (opStatus) return opStatus.categoryType;
  for (const originId of getAllWeaponStatOriginIds()) {
    for (const ws of getWeaponStats(originId)) {
      if (ws.id === statusId) return ws.categoryType;
    }
  }
  for (const originId of getAllGearStatOriginIds()) {
    for (const gs of getGearStats(originId)) {
      if (gs.id === statusId) return gs.categoryType;
    }
  }
  for (const gse of getAllGearSets()) {
    if (gse.id === statusId) return gse.categoryType;
  }
  // Consumables
  if (getConsumable(statusId)) return EventCategoryType.CONSUMABLE;
  // Tacticals
  if (getTactical(statusId)) return EventCategoryType.TACTICAL;
  return undefined;
}

/** Look up any status definition (operator, weapon, or gear) and return serialized JSON. */
export function getAnyStatusSerialized(statusId: string): Record<string, unknown> | null {
  const opStatus = buildStatusByIdCache().get(statusId);
  if (opStatus) return opStatus.serialize() as Record<string, unknown>;
  for (const originId of getAllWeaponStatOriginIds()) {
    for (const ws of getWeaponStats(originId)) {
      if (ws.id === statusId) return ws.serialize() as Record<string, unknown>;
    }
  }
  for (const originId of getAllGearStatOriginIds()) {
    for (const gs of getGearStats(originId)) {
      if (gs.id === statusId) return gs.serialize() as Record<string, unknown>;
    }
  }
  for (const gse of getAllGearSets()) {
    if (gse.id === statusId) return gse.serialize() as Record<string, unknown>;
  }
  return null;
}

let _statusElementMap: Record<string, string> | null = null;

// ── Status categories (EventCategoryType) ───────────────────────────────────

let _statusCategories: Record<string, string> | null = null;

/**
 * Scan all status sources and return a map of EventCategoryType → display label
 * for every category that actually exists in the game data.
 */
export function getAllStatusCategories(): Record<string, string> {
  if (_statusCategories) return _statusCategories;
  const cats = new Set<EventCategoryType>();
  // Operator statuses (includes generic)
  for (const status of getAllOperatorStatuses()) {
    if (status.categoryType) cats.add(status.categoryType);
  }
  // Weapon statuses
  for (const originId of getAllWeaponStatOriginIds()) {
    for (const ws of getWeaponStats(originId)) {
      cats.add(ws.categoryType);
    }
  }
  // Gear set effects
  for (const gse of getAllGearSets()) {
    cats.add(gse.categoryType);
  }
  // Gear statuses
  for (const originId of getAllGearStatOriginIds()) {
    for (const gs of getGearStats(originId)) {
      cats.add(gs.categoryType);
    }
  }
  // Consumable + tactical categories always exist
  cats.add(EventCategoryType.CONSUMABLE);
  cats.add(EventCategoryType.TACTICAL);

  const labels: Record<string, string> = {};
  for (const cat of Array.from(cats)) {
    labels[cat] = t(`statusCategory.${cat}`) || cat;
  }
  _statusCategories = labels;
  return _statusCategories;
}

export function getStatusElementMap(): Record<string, string> {
  if (_statusElementMap) return _statusElementMap;
  const map: Record<string, string> = {
    [ArtsReactionType.COMBUSTION]: ElementType.HEAT,
    [ArtsReactionType.SOLIDIFICATION]: ElementType.CRYO,
    [ArtsReactionType.CORROSION]: ElementType.NATURE,
    [ArtsReactionType.ELECTRIFICATION]: ElementType.ELECTRIC,
  };
  for (const status of getAllOperatorStatuses()) {
    if (status.element) map[status.id] = status.element;
  }
  _statusElementMap = map;
  return _statusElementMap;
}
