/**
 * GameDataStore — single public facade for all game data access.
 *
 * All consumers import from here. configStore and sub-stores are internal.
 */

import { ElementType, ArtsReactionType, PhysicalStatusType, StatusType } from '../consts/enums';
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
  getWeaponIdByName,
  registerCustomWeapon,
  deregisterCustomWeapon,
  type Weapon,

  // Gear pieces
  getGearPiece,
  getAllGearPieces,
  getGearPiecesBySet,
  getGearPiecesByType,
  getGearPieceIdByName,
  registerCustomGearPiece,
  deregisterCustomGearPiece,
  type GearPiece,

  // Gear statuses & set effects
  getGearSetEffect,
  getAllGearSetEffectIds,
  getAllGearSetEffects,
  getGearStatuses,
  getAllGearStatusOriginIds,
  type GearSetEffect,
  type GearStatus,

  // Weapon skills
  getGenericWeaponSkill,
  getNamedWeaponSkill,
  getGenericSkillStats,
  getNamedSkillPassiveStats,
  type WeaponSkillStatResult,
  type WeaponSkill,

  // Weapon statuses
  getWeaponStatuses,
  getAllWeaponStatusOriginIds,

  // Weapon & gear effects
  getWeaponEffectDefs,
  getGearEffectDefs,
  getWeaponTriggerDefs,
  getWeaponStatusTriggerDefs,
  getGearTriggerDefs,
  getGearStatusTriggerDefs,
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
  getConsumable, getAllConsumables, getConsumableIdByName,
  getTactical, getAllTacticals, getTacticalIdByName,
  type ConsumableData, type TacticalData,
} from '../model/game-data/consumablesStore';

// ── Re-export types ─────────────────────────────────────────────────────────

export type {
  Weapon,
  GearPiece,
  GearSetEffect,
  GearStatus,
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

export { getWeapon, getAllWeapons, getWeaponsByType, getWeaponIdByName };
export { registerCustomWeapon, deregisterCustomWeapon };

// ── Gear pieces ─────────────────────────────────────────────────────────────

export { getGearPiece, getAllGearPieces, getGearPiecesBySet, getGearPiecesByType, getGearPieceIdByName };
export { registerCustomGearPiece, deregisterCustomGearPiece };

// ── Gear statuses & set effects ─────────────────────────────────────────────

export { getGearSetEffect, getAllGearSetEffectIds, getAllGearSetEffects };
export { getGearStatuses, getAllGearStatusOriginIds };

// ── Weapon skills ───────────────────────────────────────────────────────────

export { getGenericWeaponSkill, getNamedWeaponSkill };
export { getGenericSkillStats, getNamedSkillPassiveStats };

// ── Weapon statuses ─────────────────────────────────────────────────────────

export { getWeaponStatuses, getAllWeaponStatusOriginIds };

// ── Weapon & gear effects ──────────────────────────────────────────────────

export { getWeaponEffectDefs, getGearEffectDefs, getAllWeaponEffectIds, getAllGearEffectTypes };
export { getWeaponTriggerDefs, getWeaponStatusTriggerDefs, getGearTriggerDefs, getGearStatusTriggerDefs, getConsumablePassiveDef, getTacticalTriggerDef };
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
      const clauses = [...(status.clause ?? []), ...(status.onTriggerClause ?? [])];
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

export { getConsumable, getAllConsumables, getConsumableIdByName };
export { getTactical, getAllTacticals, getTacticalIdByName };

// ── Legacy name→ID resolution (for sheet migration) ─────────────────────────

export { getWeaponIdByName as resolveWeaponId };
export { getGearPieceIdByName as resolveGearPieceId };
export { getConsumableIdByName as resolveConsumableId };
export { getTacticalIdByName as resolveTacticalId };
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
    [StatusType.WEAKEN]:          t('status.WEAKEN'),
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
  for (const originId of getAllWeaponStatusOriginIds()) {
    for (const ws of getWeaponStatuses(originId)) {
      if (ws.name && ws.id) labels[ws.id] = ws.name;
    }
  }
  // Gear statuses
  for (const originId of getAllGearStatusOriginIds()) {
    for (const gs of getGearStatuses(originId)) {
      if (gs.name && gs.id) labels[gs.id] = gs.name;
    }
  }
  // Gear set effects
  for (const gse of getAllGearSetEffects()) {
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
    [INFLICTION_COLUMNS.HEAT]:     t('infliction.heatInfliction'),
    [INFLICTION_COLUMNS.CRYO]:     t('infliction.cryoInfliction'),
    [INFLICTION_COLUMNS.NATURE]:   t('infliction.natureInfliction'),
    [INFLICTION_COLUMNS.ELECTRIC]: t('infliction.electricInfliction'),
    // Physical inflictions
    [PHYSICAL_INFLICTION_COLUMNS.VULNERABLE]: t('infliction.vulnerableInfliction'),
    // Arts reactions
    [REACTION_COLUMNS.COMBUSTION]:       t('infliction.combustion'),
    [REACTION_COLUMNS.SOLIDIFICATION]:   t('infliction.solidification'),
    [REACTION_COLUMNS.CORROSION]:        t('infliction.corrosion'),
    [REACTION_COLUMNS.ELECTRIFICATION]:  t('infliction.electrification'),
    // Physical statuses
    [PhysicalStatusType.BREACH]:  t('infliction.breach'),
    // Enemy statuses
    [StatusType.FOCUS]:           t('infliction.FOCUS'),
    [StatusType.SUSCEPTIBILITY]:  t('infliction.SUSCEPTIBILITY'),
    // Team statuses
    [StatusType.SHIELD]:          t('infliction.SHIELD'),
    // Enemy debuffs
    [StatusType.FRAGILITY]:       t('infliction.FRAGILITY'),
    // Stagger status events
    [NODE_STAGGER_COLUMN_ID]:     t('infliction.STAGGER_NODE'),
    [FULL_STAGGER_COLUMN_ID]:     t('infliction.STAGGER'),
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

/** Look up any status definition (operator, weapon, or gear) and return serialized JSON. */
export function getAnyStatusSerialized(statusId: string): Record<string, unknown> | null {
  const opStatus = buildStatusByIdCache().get(statusId);
  if (opStatus) return opStatus.serialize() as Record<string, unknown>;
  for (const originId of getAllWeaponStatusOriginIds()) {
    for (const ws of getWeaponStatuses(originId)) {
      if (ws.id === statusId) return ws.serialize() as Record<string, unknown>;
    }
  }
  for (const originId of getAllGearStatusOriginIds()) {
    for (const gs of getGearStatuses(originId)) {
      if (gs.id === statusId) return gs.serialize() as Record<string, unknown>;
    }
  }
  for (const gse of getAllGearSetEffects()) {
    if (gse.id === statusId) return gse.serialize() as Record<string, unknown>;
  }
  return null;
}

let _statusElementMap: Record<string, string> | null = null;

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
