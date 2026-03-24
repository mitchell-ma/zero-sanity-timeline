/**
 * GameDataStore — single public facade for all game data access.
 *
 * All consumers import from here. configStore and sub-stores are internal.
 */

import { CombatSkillType, ElementType, ArtsReactionType } from '../consts/enums';
import { t } from '../locales/locale';

// ── configStore (private to this module) ─────────────────────────────────────

import {
  // Operators
  getOperatorBase,
  getAllOperatorBases,
  getAllOperatorBaseIds,
  getOperatorBasesByClass,
  getOperatorBasesByElement,
  getOperatorBaseByType,
  getOperatorIdByName,
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
  getAllWeaponEffectNames,
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
  getSkillGaugeGains,
  getBattleSkillSpCost,
  getSkillCategoryData,
  getBasicAttackDurations,
  type SkillTimings,
  type SkillGaugeGains,
  type SkillCategoryData,

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

import { Consumable } from '../model/consumables/consumable';
import { GinsengMeatStew } from '../model/consumables/ginsengMeatStew';
import { PerplexingMedication } from '../model/consumables/perplexingMedication';
import { Tactical } from '../model/consumables/tactical';
import { StewMeeting } from '../model/consumables/stewMeeting';
import ginsengMeatStewIcon from '../assets/consumables/ginseng_meat_stew.webp';
import perplexingMedicationIcon from '../assets/consumables/perplexing_medication.webp';
import stewMeetingIcon from '../assets/consumables/stew_meeting.webp';

export interface ConsumableEntry {
  id: string;
  name: string;
  icon?: string;
  rarity: number;
  create: () => Consumable;
}

export interface TacticalEntry {
  id: string;
  name: string;
  icon?: string;
  rarity: number;
  create: () => Tactical;
}

const CONSUMABLE_ENTRIES: ConsumableEntry[] = [
  { id: 'GINSENG_MEAT_STEW', name: t('consumable.GINSENG_MEAT_STEW'), icon: ginsengMeatStewIcon, rarity: 3, create: () => new GinsengMeatStew() },
  { id: 'PERPLEXING_MEDICATION', name: t('consumable.PERPLEXING_MEDICATION'), icon: perplexingMedicationIcon, rarity: 4, create: () => new PerplexingMedication() },
];

const TACTICAL_ENTRIES: TacticalEntry[] = [
  { id: 'STEW_MEETING', name: t('tactical.STEW_MEETING'), icon: stewMeetingIcon, rarity: 3, create: () => new StewMeeting() },
];

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
  SkillGaugeGains,
  SkillCategoryData,
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

export { getWeaponEffectDefs, getGearEffectDefs, getAllWeaponEffectNames, getAllGearEffectTypes };
export { registerCustomWeaponEffectDefs, deregisterCustomWeaponEffectDefs };
export { registerCustomGearEffectDefs, deregisterCustomGearEffectDefs };
export { getGearEffectLabel, resolveTargetDisplay, resolveDurationSeconds, resolveTriggerInteractions };

// ── Operator base ───────────────────────────────────────────────────────

export { getOperatorBase, getAllOperatorBases, getAllOperatorBaseIds };
export { getOperatorBasesByClass, getOperatorBasesByElement, getOperatorBaseByType, getOperatorIdByName };
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
export { getSkillIds, getSkillTypeMap, getRawSkillTypeMap, resolveSkillType };
export { getFrameSequences, getSegmentLabels };
export { getComboTriggerClause, getComboTriggerInfo };
export { getAllStatusIds, getAllReactionIds, getAllInflictionIds };
export { getTeamStatusIds };

// ── Frame pipeline ──────────────────────────────────────────────────────────

export { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence };
export { getSkillTimings, getUltimateEnergyCost, getSkillGaugeGains, getBattleSkillSpCost, getSkillCategoryData, getBasicAttackDurations };

// ── Gear set data ───────────────────────────────────────────────────────────

export { getGearSetData, getAllGearSetData };

// ── Operator configs & trigger associations ─────────────────────────────────

export { getOperatorConfig, getAllOperatorConfigs };
export { getSkillConfig, getStatusEventConfig };
export { getTriggerAssociations, getAllTriggerAssociations };

// ── Consumables & Tacticals ─────────────────────────────────────────────────

export function getAllConsumableEntries(): readonly ConsumableEntry[] {
  return CONSUMABLE_ENTRIES;
}

export function getConsumableEntry(consumableId: string): ConsumableEntry | undefined {
  return CONSUMABLE_ENTRIES.find(c => c.id === consumableId);
}

export function getConsumableIdByName(name: string): string | undefined {
  return CONSUMABLE_ENTRIES.find(c => c.name === name)?.id;
}

export function getAllTacticalEntries(): readonly TacticalEntry[] {
  return TACTICAL_ENTRIES;
}

export function getTacticalEntry(tacticalId: string): TacticalEntry | undefined {
  return TACTICAL_ENTRIES.find(t => t.id === tacticalId);
}

export function getTacticalIdByName(name: string): string | undefined {
  return TACTICAL_ENTRIES.find(t => t.name === name)?.id;
}

// ── Legacy name→ID resolution (for sheet migration) ─────────────────────────

export { getWeaponIdByName as resolveWeaponId };
export { getGearPieceIdByName as resolveGearPieceId };
export { getConsumableIdByName as resolveConsumableId };
export { getTacticalIdByName as resolveTacticalId };

// ── Derived label / metadata maps ────────────────────────────────────────────

let _skillLabels: Record<string, string> | null = null;

export function getAllSkillLabels(): Record<string, string> {
  if (_skillLabels) return _skillLabels;
  const labels: Record<string, string> = {
    [CombatSkillType.DASH]: t('skill.DASH'),
    [CombatSkillType.FINISHER]: t('skill.FINISHER'),
    [CombatSkillType.DIVE]: t('skill.DIVE'),
    [CombatSkillType.CONTROL]: t('skill.CONTROL'),
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
  const labels: Record<string, string> = {};
  for (const status of getAllOperatorStatuses()) {
    if (status.name) labels[status.id] = status.name;
  }
  _statusLabels = labels;
  return _statusLabels;
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
