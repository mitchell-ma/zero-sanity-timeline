/**
 * ConfigStore — central config layer that owns all sub-stores.
 *
 * Composes operator, skill, status, weapon, gear, and effect data from typed sub-stores.
 * Builds typed OperatorConfig objects, trigger associations, and provides all
 * data access functions that were previously in operatorJsonLoader and weaponGearEffectLoader.
 *
 * This is an internal module — consumers should import from gameDataStore.ts.
 */

import type { EventSegmentData } from '../consts/viewTypes';
import type { FrameClausePredicate } from '../model/event-frames/skillEventFrame';
import { CombatSkillType, StackInteractionType, UnitType } from '../consts/enums';
import { VerbType, NounType, DeterminerType } from '../dsl/semantics';
import type { Interaction, ValueNode } from '../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from './calculation/valueResolver';

// ── Sub-stores (private to this module) ──────────────────────────────────────

import {
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
} from '../model/game-data/operatorsStore';

import {
  getOperatorSkills,
  getOperatorSkill,
  getOperatorSkillIds,
  getAllOperatorSkillSetIds,
  type OperatorSkill,
} from '../model/game-data/operatorSkillsStore';

import {
  getOperatorStatuses,
  getAllOperatorStatusOriginIds,
  getAllOperatorStatuses,
  type OperatorStatus,
} from '../model/game-data/operatorStatusesStore';

import {
  getWeapon,
  getAllWeapons,
  getWeaponsByType,
  getWeaponIdByName,
  registerCustomWeapon,
  deregisterCustomWeapon,
  type Weapon,
} from '../model/game-data/weaponsStore';

import {
  getGearPiece,
  getAllGearPieces,
  getGearPiecesBySet,
  getGearPiecesByType,
  getGearPieceIdByName,
  registerCustomGearPiece,
  deregisterCustomGearPiece,
  type GearPiece,
} from '../model/game-data/gearPiecesStore';

import {
  getGearSetEffect,
  getAllGearSetEffectIds,
  getAllGearSetEffects,
  getGearStatuses,
  getAllGearStatusOriginIds,
  type GearSetEffect,
  type GearStatus,
} from '../model/game-data/gearStatusesStore';

import {
  getGenericWeaponSkill,
  getNamedWeaponSkill,
  getGenericSkillStats,
  getNamedSkillPassiveStats,
  type WeaponSkillStatResult,
  type WeaponSkill,
} from '../model/game-data/weaponSkillsStore';

import {
  getWeaponStatuses,
  getAllWeaponStatusOriginIds,
} from '../model/game-data/weaponStatusesStore';

// ── Frame pipeline ──────────────────────────────────────────────────────────

import {
  buildSequencesFromOperatorJson,
  DataDrivenSkillEventSequence,
} from '../model/event-frames/dataDrivenEventFrames';

import {
  getSkillTimings,
  getUltimateEnergyCost,
  getSkillGaugeGains,
  getBattleSkillSpCost,
  getSkillCategoryData,
  getBasicAttackDurations,
} from '../model/event-frames/dataDrivenEventFrames';

import type { SkillTimings, SkillGaugeGains, SkillCategoryData } from '../model/event-frames/dataDrivenEventFrames';

// ═══════════════════════════════════════════════════════════════════════════
// Re-export sub-store APIs (surfaced through gameDataStore)
// ═══════════════════════════════════════════════════════════════════════════

export type {
  OperatorBase,
  OperatorSkill,
  OperatorStatus,
  Weapon,
  GearPiece,
  GearSetEffect,
  GearStatus,
  WeaponSkill,
  WeaponSkillStatResult,
};

// Operators
export { getOperatorBase, getAllOperatorBases, getAllOperatorBaseIds };
export { getOperatorBasesByClass, getOperatorBasesByElement, getOperatorIdByName };
export { registerCustomOperatorBase, deregisterCustomOperatorBase };
export { getOperatorPotentialRaw };

// Operator skills
export { getOperatorSkills, getOperatorSkill, getOperatorSkillIds, getAllOperatorSkillSetIds };

// Operator statuses
export { getOperatorStatuses, getAllOperatorStatusOriginIds, getAllOperatorStatuses };

// Weapons
export { getWeapon, getAllWeapons, getWeaponsByType, getWeaponIdByName };
export { registerCustomWeapon, deregisterCustomWeapon };

// Gear pieces
export { getGearPiece, getAllGearPieces, getGearPiecesBySet, getGearPiecesByType, getGearPieceIdByName };
export { registerCustomGearPiece, deregisterCustomGearPiece };

// Gear statuses & set effects
export { getGearSetEffect, getAllGearSetEffectIds, getAllGearSetEffects };
export { getGearStatuses, getAllGearStatusOriginIds };

// Weapon skills
export { getGenericWeaponSkill, getNamedWeaponSkill };
export { getGenericSkillStats, getNamedSkillPassiveStats };

// Weapon statuses
export { getWeaponStatuses, getAllWeaponStatusOriginIds };

// Frame pipeline
export { buildSequencesFromOperatorJson, DataDrivenSkillEventSequence };
export { getSkillTimings, getUltimateEnergyCost, getSkillGaugeGains, getBattleSkillSpCost, getSkillCategoryData, getBasicAttackDurations };
export type { SkillTimings, SkillGaugeGains, SkillCategoryData };

// ═══════════════════════════════════════════════════════════════════════════
// Operator JSON composition (absorbed from operatorJsonLoader)
// ═══════════════════════════════════════════════════════════════════════════

// ── SkillTypeMap inference ──────────────────────────────────────────────────

function inferSkillTypeMap(skills: ReadonlyMap<string, { onTriggerClause: unknown[]; segments: unknown[] }>): Record<string, unknown> {
  const typeMap: Record<string, unknown> = {};
  const skillIds: string[] = [];
  skills.forEach((_, id) => skillIds.push(id));

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

  const variantSuffixes = ['_FINISHER', '_DIVE', '_ENHANCED', '_EMPOWERED', '_ENHANCED_EMPOWERED'];
  const baseSkills = skillIds.filter(id => {
    if (id === batkId) return false;
    return !variantSuffixes.some(s => id.endsWith(s));
  });

  for (const id of baseSkills) {
    const skill = skills.get(id);
    if (skill?.onTriggerClause?.length) {
      typeMap.COMBO_SKILL = id;
      break;
    }
  }

  const remaining = baseSkills.filter(id => id !== typeMap.COMBO_SKILL);

  for (const id of remaining) {
    const skill = skills.get(id);
    const segs = skill?.segments as { properties: { segmentTypes?: string[] } }[] | undefined;
    if (segs?.some(s => s.properties.segmentTypes?.includes('ANIMATION'))) {
      typeMap.ULTIMATE = id;
      break;
    }
  }

  const battleCandidates = remaining.filter(id => id !== typeMap.ULTIMATE);
  if (battleCandidates.length === 1) {
    typeMap.BATTLE_SKILL = battleCandidates[0];
  }

  return typeMap;
}

// ── Internal merged JSON builder (for dataDrivenEventFrames interop) ────────

/**
 * Build a merged operator JSON shape from typed stores.
 * Used internally by getFrameSequences/buildOperatorConfigs/operatorRegistry
 * which need to pass data to dataDrivenEventFrames functions.
 */
function buildMergedOperatorJson(operatorId: string): Record<string, unknown> | undefined {
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

  return {
    ...base.serialize(),
    skills: skillEntries,
    skillTypeMap,
  };
}

export { buildMergedOperatorJson };

export function getAllOperatorIds(): string[] {
  return getAllOperatorBaseIds();
}

export function getEnabledStatusEvents(operatorId: string): readonly OperatorStatus[] {
  return getOperatorStatuses(operatorId).filter(s => s.isEnabled !== false);
}

export function getSkillIds(operatorId: string): Set<string> {
  const ids = getOperatorSkillIds(operatorId);
  ids.add('FINISHER');
  ids.add('DIVE');
  return ids;
}

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

export function getRawSkillTypeMap(operatorId: string): Record<string, unknown> {
  const skills = getOperatorSkills(operatorId);
  if (!skills) return {};
  return inferSkillTypeMap(skills);
}

export function resolveSkillType(operatorId: string, skillId: string): string | null {
  if (skillId === CombatSkillType.FINISHER || skillId === CombatSkillType.DIVE) return CombatSkillType.BASIC_ATTACK;
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

// ── Frame sequences ─────────────────────────────────────────────────────────

const sequenceCache = new Map<string, readonly DataDrivenSkillEventSequence[]>();

export function getFrameSequences(
  operatorId: string,
  skillId: string,
): readonly DataDrivenSkillEventSequence[] {
  const cacheKey = `${operatorId}:${skillId}`;
  const cached = sequenceCache.get(cacheKey);
  if (cached) return cached;

  const json = buildMergedOperatorJson(operatorId);
  if (!json) return [];

  const sequences = buildSequencesFromOperatorJson(json, skillId);
  sequenceCache.set(cacheKey, sequences);
  return sequences;
}

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

// ── Combo trigger ───────────────────────────────────────────────────────────

export interface TriggerCondition {
  subject: string;
  verb: string;
  object?: string;
  objectId?: string;
  negated?: boolean;
  cardinalityConstraint?: string;
  value?: number | string | Record<string, unknown>;
  element?: string;
  objectQualifier?: string;
  subjectDeterminer?: string;
  to?: string;
  toDeterminer?: string;
}

export interface ComboTriggerInfo {
  onTriggerClause: readonly { conditions: TriggerCondition[] }[];
  description: string;
  windowFrames: number;
}

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

export interface StatusIdEntry { id: string; label: string; }

let _allStatusEntries: StatusIdEntry[] | null = null;
export function getAllStatusIds(): StatusIdEntry[] {
  if (_allStatusEntries) return _allStatusEntries;
  const seen = new Set<string>();
  const entries: StatusIdEntry[] = [];
  const { StatusType, ReactionType } = require('../consts/enums');
  const { getAllStatusLabels } = require('./gameDataStore');
  const statusLabels = getAllStatusLabels();

  const reactionIds = new Set(Object.values(ReactionType) as string[]);

  for (const id of Object.values(StatusType) as string[]) {
    if (!seen.has(id) && !reactionIds.has(id)) {
      seen.add(id);
      entries.push({ id, label: statusLabels[id] ?? id });
    }
  }

  for (const operatorId of getAllOperatorBaseIds()) {
    const statuses = getOperatorStatuses(operatorId);
    for (const status of statuses) {
      if (!seen.has(status.id)) {
        seen.add(status.id);
        entries.push({ id: status.id, label: status.name || statusLabels[status.id] || status.id });
      }
    }
  }

  entries.sort((a, b) => a.label.localeCompare(b.label));
  _allStatusEntries = entries;
  return _allStatusEntries;
}

let _allReactionEntries: StatusIdEntry[] | null = null;
export function getAllReactionIds(): StatusIdEntry[] {
  if (_allReactionEntries) return _allReactionEntries;
  const { ArtsReactionType, PhysicalStatusType } = require('../consts/enums');
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

let _allInflictionEntries: StatusIdEntry[] | null = null;
export function getAllInflictionIds(): StatusIdEntry[] {
  if (_allInflictionEntries) return _allInflictionEntries;
  const { InflictionType } = require('../consts/enums');
  const entries: StatusIdEntry[] = [];
  for (const id of Object.values(InflictionType) as string[]) {
    const label = id.replace(/_INFLICTION$/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
    entries.push({ id, label });
  }
  entries.sort((a, b) => a.label.localeCompare(b.label));
  _allInflictionEntries = entries;
  return _allInflictionEntries;
}

export function getTeamStatusIds(operatorId: string): string[] {
  const skills = getOperatorSkills(operatorId);
  if (!skills) return [];

  const ids = new Set<string>();
  skills.forEach((skill) => {
    const raw = skill.serialize();
    const segments = raw.segments as { frames?: { clause?: { effects?: Record<string, unknown>[] }[] }[] }[] | undefined;
    if (!segments) return;
    for (const seg of segments) {
      for (const frame of seg.frames ?? []) {
        for (const pred of frame.clause ?? []) {
          for (const ef of pred.effects ?? []) {
            if (ef.to === NounType.TEAM && ef.object === NounType.STATUS && ef.objectId) {
              ids.add(ef.objectId as string);
            }
          }
        }
      }
    }
  });
  return Array.from(ids);
}

// ═══════════════════════════════════════════════════════════════════════════
// Weapon & gear effect normalization (absorbed from weaponGearEffectLoader)
// ═══════════════════════════════════════════════════════════════════════════

export interface NormalizedEffectDef {
  [key: string]: unknown;
  id: string;
  name?: string;
  type?: string;
  label?: string;
  description?: string;
  element?: string;
  target: string;
  targetDeterminer: string;
  originId?: string;
  stacks: {
    limit: ValueNode;
    interactionType: string;
  };
  onTriggerClause: { conditions: Interaction[] }[];
  clause?: { conditions: Interaction[]; effects: Record<string, unknown>[] }[];
  note?: string;
  cooldownSeconds?: number;
  properties?: { duration?: { value: ValueNode; unit: string } };
  stack?: { max?: Record<string, number> };
  buffs?: { stat: string; value?: number; valueMin?: number; valueMax?: number; perStack?: boolean }[];
  isForced?: boolean;
  enhancementTypes?: string[];
  susceptibility?: Record<string, number[]>;
  segments?: unknown[];
  stats?: unknown[];
  statusValue?: number;
}

// ── Weapon name → originId mapping ────────────────────────────────────────────

const WEAPON_NAME_TO_ORIGIN: Record<string, string> = {};
for (const weapon of getAllWeapons()) {
  if (weapon.name && weapon.id) {
    WEAPON_NAME_TO_ORIGIN[weapon.name] = weapon.id;
  }
}

// ── Gear set effects index ──────────────────────────────────────────────────

interface GearEffectEntry { properties: { type: string; id: string; name: string }; onTriggerClause?: { conditions: Interaction[]; effects: { objectId?: string }[] }[] }
const GEAR_EFFECT_INDEX: Record<string, GearEffectEntry> = {};

for (const gearSetId of getAllGearSetEffectIds()) {
  const effect = getGearSetEffect(gearSetId);
  if (effect) {
    const serialized = effect.serialize() as unknown as GearEffectEntry;
    GEAR_EFFECT_INDEX[gearSetId] = serialized;
  }
}

// ── Custom weapon/gear effect registries ─────────────────────────────────────

const customWeaponEffects: Record<string, NormalizedEffectDef[]> = {};
const customGearEffects: Record<string, NormalizedEffectDef[]> = {};

// ── Normalization ─────────────────────────────────────────────────────────────

function inferTarget(se: Record<string, unknown>): { target: string; targetDeterminer: string } {
  const props = (se.properties ?? {}) as Record<string, unknown>;
  if (props.target) return { target: props.target as string, targetDeterminer: (props.targetDeterminer ?? props.toDeterminer ?? DeterminerType.THIS) as string };
  if (props.to) return { target: props.to as string, targetDeterminer: (props.toDeterminer ?? DeterminerType.THIS) as string };
  const triggers = se.onTriggerClause as { effects?: { to?: string; toDeterminer?: string }[] }[] | undefined;
  if (triggers) {
    for (const clause of triggers) {
      for (const effect of clause.effects ?? []) {
        if (effect.to === NounType.ENEMY) return { target: NounType.ENEMY, targetDeterminer: DeterminerType.THIS };
        if (effect.toDeterminer === DeterminerType.OTHER) return { target: NounType.OPERATOR, targetDeterminer: DeterminerType.OTHER };
        if (effect.toDeterminer === DeterminerType.ALL) return { target: NounType.OPERATOR, targetDeterminer: DeterminerType.ALL };
      }
    }
  }
  return { target: NounType.OPERATOR, targetDeterminer: DeterminerType.THIS };
}

function normalizeEffectEntry(raw: Record<string, unknown>): NormalizedEffectDef {
  const props = (raw.properties ?? {}) as Record<string, unknown>;
  const sl = (props.stacks ?? {}) as Record<string, unknown>;
  const limit = (sl.limit ?? { verb: VerbType.IS, value: 1 }) as ValueNode;

  const { target, targetDeterminer } = inferTarget(raw);

  const out: NormalizedEffectDef = {
    id: (props.id ?? raw.id) as string,
    ...(props.name ? { name: props.name as string } : {}),
    ...(props.type ? { type: props.type as string } : {}),
    ...(raw.description ? { description: raw.description as string } : {}),
    ...(raw.element ? { element: raw.element as string } : {}),
    target,
    targetDeterminer,
    originId: raw.originId as string | undefined,
    stacks: {
      limit,
      interactionType: (sl.interactionType as string) ?? StackInteractionType.NONE,
    },
    onTriggerClause: (raw.onTriggerClause ?? []) as NormalizedEffectDef['onTriggerClause'],
    ...(raw.clause ? { clause: raw.clause as NormalizedEffectDef['clause'] } : {}),
    ...(raw.note ? { note: raw.note as string } : {}),
    ...(raw.cooldownSeconds ?? (props.cooldownSeconds as number | undefined) ? { cooldownSeconds: (raw.cooldownSeconds ?? props.cooldownSeconds) as number } : {}),
  };

  if (props.duration) {
    out.properties = { duration: props.duration as { value: ValueNode; unit: string } };
  }

  return out;
}

export function getWeaponEffectDefs(weaponName: string): NormalizedEffectDef[] {
  if (customWeaponEffects[weaponName]) return customWeaponEffects[weaponName];
  const originId = WEAPON_NAME_TO_ORIGIN[weaponName];
  if (!originId) return [];
  const statuses = getWeaponStatuses(originId);
  if (statuses.length === 0) return [];
  const defs = statuses.map(s => normalizeEffectEntry(s.serialize() as Record<string, unknown>));
  const namedSkill = getNamedWeaponSkill(originId);
  const triggers = namedSkill?.onTriggerClause ?? [];
  for (const def of defs) {
    if (!def.onTriggerClause || def.onTriggerClause.length === 0) {
      const trigger = triggers.find(t =>
        (t as unknown as { effects?: { objectId?: string }[] }).effects?.some(e => e.objectId === def.id)
      );
      if (trigger) {
        def.onTriggerClause = [{ conditions: trigger.conditions }];
      }
    }
  }
  return defs;
}

export function getGearEffectDefs(gearSetType: string): NormalizedEffectDef[] {
  if (customGearEffects[gearSetType]) return customGearEffects[gearSetType];
  const statuses = getGearStatuses(gearSetType);
  if (statuses.length === 0) return [];
  const defs = statuses.map(s => normalizeEffectEntry(s.serialize() as Record<string, unknown>));
  const effectEntry = GEAR_EFFECT_INDEX[gearSetType];
  const triggers = (effectEntry?.onTriggerClause ?? []) as { conditions: Interaction[]; effects: { objectId?: string }[] }[];
  for (const def of defs) {
    if (!def.onTriggerClause || def.onTriggerClause.length === 0) {
      const trigger = triggers.find(t => t.effects?.some(e => e.objectId === def.id));
      if (trigger) {
        def.onTriggerClause = [{ conditions: trigger.conditions }];
      }
    }
  }
  return defs;
}

export function getAllWeaponEffectNames(): string[] {
  const names: string[] = [];
  for (const weapon of getAllWeapons()) {
    const statuses = getWeaponStatuses(weapon.id);
    if (statuses.length > 0) names.push(weapon.name);
  }
  return [...names, ...Object.keys(customWeaponEffects)];
}

export function getAllGearEffectTypes(): string[] {
  return [
    ...Object.keys(GEAR_EFFECT_INDEX),
    ...Object.keys(customGearEffects),
  ];
}

export function registerCustomWeaponEffectDefs(weaponName: string, defs: NormalizedEffectDef[] | Record<string, unknown>[]): void {
  customWeaponEffects[weaponName] = defs as NormalizedEffectDef[];
}

export function deregisterCustomWeaponEffectDefs(weaponName: string): void {
  delete customWeaponEffects[weaponName];
}

export function registerCustomGearEffectDefs(gearSetType: string, defs: NormalizedEffectDef[] | Record<string, unknown>[]): void {
  const normalized = (defs as Record<string, unknown>[]).map(d => normalizeEffectEntry(d));
  const triggerObjectIds = new Set<string>();
  for (const def of normalized) {
    if (!def.onTriggerClause || def.onTriggerClause.length === 0) {
      const trigger = normalized.find(t =>
        t.onTriggerClause?.length &&
        t.onTriggerClause.some(tc => (tc as unknown as { effects?: { objectId?: string }[] }).effects?.some(e => e.objectId === def.id))
      );
      if (trigger) {
        const matchingClause = trigger.onTriggerClause.find(tc =>
          (tc as unknown as { effects?: { objectId?: string }[] }).effects?.some(e => e.objectId === def.id)
        );
        if (matchingClause) {
          def.onTriggerClause = [{ conditions: matchingClause.conditions }];
          triggerObjectIds.add(def.id);
        }
      }
    }
  }
  const result = normalized.filter(def => {
    if (!def.onTriggerClause?.length) return true;
    const isRedirect = def.onTriggerClause.some(tc =>
      (tc as unknown as { effects?: { objectId?: string }[] }).effects?.some(e => e.objectId && triggerObjectIds.has(e.objectId))
    );
    return !isRedirect;
  });
  customGearEffects[gearSetType] = result;
}

export function deregisterCustomGearEffectDefs(gearSetType: string): void {
  delete customGearEffects[gearSetType];
}

export function getGearEffectLabel(gearSetType: string): string | undefined {
  return GEAR_EFFECT_INDEX[gearSetType]?.properties?.name;
}

// ── Display helpers ─────────────────────────────────────────────────────────

export function resolveTargetDisplay(def: { target?: string; targetDeterminer?: string; to?: string; toDeterminer?: string }): string {
  const target = def.target ?? def.to;
  const det = def.targetDeterminer ?? def.toDeterminer;
  if (!target) return '';
  const targetLabel = target.replace(/_/g, ' ').toLowerCase();
  return det ? `${det.replace(/_/g, ' ').toLowerCase()} ${targetLabel}` : targetLabel;
}

export function resolveDurationSeconds(def: { properties?: { duration?: { value: ValueNode } } }): number {
  if (!def.properties?.duration?.value) return 0;
  return resolveValueNode(def.properties.duration.value, DEFAULT_VALUE_CONTEXT);
}

export function resolveTriggerInteractions(def: { onTriggerClause?: { conditions: Interaction[] }[] }): Interaction[] {
  const clauses = def.onTriggerClause ?? [];
  return clauses.flatMap(c => c.conditions);
}

// ═══════════════════════════════════════════════════════════════════════════
// Gear set data (absorbed from gearSetDataLoader)
// ═══════════════════════════════════════════════════════════════════════════

export interface GearPieceData {
  gearType: string;
  name: string;
  gearCategory: string;
  defense: number;
  allLevels: Record<string, Record<string, number>>;
}

export interface GearSetData {
  gearSetType: string;
  name: string;
  suitID?: string;
  rarity: number;
  setEffect?: {
    piecesRequired: number;
    gearSetEffectType: string;
    description: string;
  };
  pieces: GearPieceData[];
  dataSources?: string[];
}

const GEAR_SET_DATA: Record<string, GearSetData> = {};

for (const effect of getAllGearSetEffects()) {
  const id = effect.id;
  if (id) {
    GEAR_SET_DATA[id] = {
      gearSetType: id,
      name: effect.name ?? '',
      rarity: effect.rarity ?? 0,
      ...(effect.piecesRequired ? {
        setEffect: {
          piecesRequired: effect.piecesRequired,
          gearSetEffectType: id,
          description: effect.description ?? '',
        },
      } : {}),
      pieces: [],
      dataSources: effect.dataSources ?? [],
    };
  }
}

// Populate pieces from gearPiecesStore
for (const [id, setData] of Object.entries(GEAR_SET_DATA)) {
  const gearPieces = getGearPiecesBySet(id);
  for (const gp of gearPieces) {
    // Extract stats from clause effects
    const allLevels: Record<string, Record<string, number>> = {};
    let defense = 0;
    for (const c of gp.clause ?? []) {
      for (const ef of (c as { effects?: { verb: string; object: string; with?: { value: { verb: string; value: number | number[]; object?: string } } }[] }).effects ?? []) {
        const w = ef.with?.value;
        if (!w) continue;
        if (ef.object === 'BASE_DEFENSE' && w.verb === VerbType.IS) {
          defense = w.value as number;
          continue;
        }
        const stat = ef.object;
        if (w.verb === VerbType.VARY_BY && Array.isArray(w.value)) {
          (w.value as number[]).forEach((v: number, ri: number) => {
            const rank = String(ri + 1);
            if (!allLevels[rank]) allLevels[rank] = {};
            allLevels[rank][stat] = v;
          });
        } else if (w.verb === VerbType.IS) {
          if (!allLevels['1']) allLevels['1'] = {};
          allLevels['1'][stat] = w.value as number;
        }
      }
    }
    setData.pieces.push({
      gearType: gp.id,
      name: gp.name,
      gearCategory: gp.type,
      defense,
      allLevels,
    });
  }
}

export function getGearSetData(gearSetType: string): GearSetData | undefined {
  return GEAR_SET_DATA[gearSetType];
}

export function getAllGearSetData(): GearSetData[] {
  return Object.values(GEAR_SET_DATA);
}

// ═══════════════════════════════════════════════════════════════════════════
// Operator config & trigger associations (original configController logic)
// ═══════════════════════════════════════════════════════════════════════════

export interface SkillConfig {
  id: string;
  segments: EventSegmentData[];
  clause?: FrameClausePredicate[];
  properties: {
    duration?: unknown;
    trigger?: unknown;
    enhancementTypes?: string[];
    dependencyTypes?: string[];
  };
}

export interface StatusEventConfig {
  id: string;
  originId: string;
  target: string;
  targetDeterminer: string;
  type?: string;
  element?: string;
  duration?: number;
  stacks?: {
    interactionType: string;
    limit: ValueNode;
  };
  susceptibility?: Record<string, number[]>;
  enhancementTypes?: string[];
  cooldownSeconds?: number;
  isEnabled?: boolean;
  onTriggerClause?: { conditions: Interaction[] }[];
  onEntryClause?: { conditions: Interaction[]; effects: unknown[] }[];
  onExitClause?: { conditions: Interaction[]; effects: unknown[] }[];
  clause?: { conditions: unknown[]; effects: unknown[] }[];
  segments?: EventSegmentData[];
}

export interface OperatorConfig {
  id: string;
  skills: Record<string, SkillConfig>;
  statusEvents: StatusEventConfig[];
  skillTypeMap: Record<string, string>;
}

export interface TriggerAssociation {
  operatorId: string;
  statusId: string;
  originId: string;
  triggerClause: { conditions: Interaction[] }[];
  source: 'status' | 'talent' | 'weapon' | 'gear';
  config?: StatusEventConfig;
}

// ── Internal caches ──────────────────────────────────────────────────────────

let operatorConfigCache: Record<string, OperatorConfig> | null = null;
let triggerAssociationCache: TriggerAssociation[] | null = null;

const FPS = 120;

// ── Parsing helpers ──────────────────────────────────────────────────────────

function parseDurationFrames(props: Record<string, unknown> | undefined): number | undefined {
  if (!props?.duration) return undefined;
  const dur = props.duration as { value: ValueNode; unit: string };
  const val = resolveValueNode(dur.value, DEFAULT_VALUE_CONTEXT);
  if (val < 0) return undefined;
  return dur.unit === UnitType.SECOND ? Math.round(val * FPS) : val;
}

function parseStatusEvent(raw: Record<string, unknown>): StatusEventConfig {
  const props = (raw.properties ?? {}) as Record<string, unknown>;
  const id = (props.id ?? props.name ?? '') as string;
  const sl = props.stacks as { interactionType?: string; limit?: ValueNode } | undefined;
  const metadata = (raw.metadata ?? {}) as Record<string, unknown>;

  return {
    id,
    originId: (metadata.originId ?? raw.originId ?? '') as string,
    ...(metadata.isEnabled === false ? { isEnabled: false } : {}),
    target: (props.target ?? raw.target ?? NounType.OPERATOR) as string,
    targetDeterminer: (props.targetDeterminer ?? raw.targetDeterminer ?? DeterminerType.THIS) as string,
    type: (props.eventCategoryType ?? props.type) as string | undefined,
    element: props.element as string | undefined,
    duration: parseDurationFrames(props),
    ...(sl ? {
      stacks: {
        interactionType: sl.interactionType ?? StackInteractionType.NONE,
        limit: sl.limit ?? { verb: VerbType.IS, value: 1 },
      },
    } : {}),
    ...(props.susceptibility ? { susceptibility: props.susceptibility as Record<string, number[]> } : {}),
    ...(props.enhancementTypes ? { enhancementTypes: props.enhancementTypes as string[] } : {}),
    ...(props.cooldownSeconds != null ? { cooldownSeconds: props.cooldownSeconds as number } : {}),
    ...(raw.onTriggerClause
      ? { onTriggerClause: raw.onTriggerClause as StatusEventConfig['onTriggerClause'] }
      : {}),
    ...(raw.onEntryClause
      ? { onEntryClause: raw.onEntryClause as StatusEventConfig['onEntryClause'] }
      : {}),
    ...(raw.onExitClause
      ? { onExitClause: raw.onExitClause as StatusEventConfig['onExitClause'] }
      : {}),
    ...(raw.clause
      ? { clause: raw.clause as StatusEventConfig['clause'] }
      : {}),
    ...(raw.segments
      ? { segments: raw.segments as EventSegmentData[] }
      : {}),
  };
}

function parseSkillConfig(skillId: string, raw: Record<string, unknown>): SkillConfig {
  const props = (raw.properties ?? {}) as Record<string, unknown>;

  return {
    id: skillId,
    segments: (raw.segments ?? []) as EventSegmentData[],
    ...(raw.clause ? { clause: raw.clause as FrameClausePredicate[] } : {}),
    properties: {
      duration: props.duration,
      trigger: props.trigger,
      enhancementTypes: props.enhancementTypes as string[] | undefined,
      dependencyTypes: props.dependencyTypes as string[] | undefined,
    },
  };
}

// ── Build functions ──────────────────────────────────────────────────────────

function buildOperatorConfigs(): Record<string, OperatorConfig> {
  const configs: Record<string, OperatorConfig> = {};

  for (const operatorId of getAllOperatorIds()) {
    const base = getOperatorBase(operatorId);
    if (!base) continue;

    const opSkills = getOperatorSkills(operatorId);
    const skills: Record<string, SkillConfig> = {};
    if (opSkills) {
      opSkills.forEach((skill, skillId) => {
        skills[skillId] = parseSkillConfig(skillId, skill.serialize());
      });
    }

    const statuses = getOperatorStatuses(operatorId);
    const statusEvents = statuses.map(s => parseStatusEvent(s.serialize()));

    const skillTypeMap = getSkillTypeMap(operatorId);

    configs[operatorId] = { id: operatorId, skills, statusEvents, skillTypeMap };
  }

  return configs;
}

function buildTriggerAssociations(): TriggerAssociation[] {
  const associations: TriggerAssociation[] = [];
  const configs = ensureOperatorConfigs();

  for (const [operatorId, config] of Object.entries(configs)) {
    for (const se of config.statusEvents) {
      if (se.onTriggerClause?.length) {
        associations.push({
          operatorId,
          statusId: se.id,
          originId: se.originId || operatorId,
          triggerClause: se.onTriggerClause,
          source: se.type === 'TALENT' ? 'talent' : 'status',
          config: se,
        });
      }
    }
  }

  for (const weaponName of getAllWeaponEffectNames()) {
    const defs = getWeaponEffectDefs(weaponName);
    for (const def of defs) {
      if (def.onTriggerClause?.length) {
        associations.push({
          operatorId: def.originId ?? weaponName,
          statusId: def.id,
          originId: def.originId ?? weaponName,
          triggerClause: def.onTriggerClause,
          source: 'weapon',
        });
      }
    }
  }

  for (const gearType of getAllGearEffectTypes()) {
    const defs = getGearEffectDefs(gearType);
    for (const def of defs) {
      if (def.onTriggerClause?.length) {
        associations.push({
          operatorId: def.originId ?? gearType,
          statusId: def.id,
          originId: def.originId ?? gearType,
          triggerClause: def.onTriggerClause,
          source: 'gear',
        });
      }
    }
  }

  return associations;
}

// ── Lazy initialization ──────────────────────────────────────────────────────

function ensureOperatorConfigs(): Record<string, OperatorConfig> {
  if (!operatorConfigCache) operatorConfigCache = buildOperatorConfigs();
  return operatorConfigCache;
}

function ensureTriggerAssociations(): TriggerAssociation[] {
  if (!triggerAssociationCache) triggerAssociationCache = buildTriggerAssociations();
  return triggerAssociationCache;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getOperatorConfig(operatorId: string): OperatorConfig | undefined {
  return ensureOperatorConfigs()[operatorId];
}

export function getAllOperatorConfigs(): OperatorConfig[] {
  return Object.values(ensureOperatorConfigs());
}

export function getSkillConfig(operatorId: string, skillId: string): SkillConfig | undefined {
  return ensureOperatorConfigs()[operatorId]?.skills[skillId];
}

export function getStatusEventConfig(operatorId: string, statusId: string): StatusEventConfig | undefined {
  const config = ensureOperatorConfigs()[operatorId];
  if (!config) return undefined;
  return config.statusEvents.find(se => se.id === statusId);
}

export function getTriggerAssociations(operatorId: string): TriggerAssociation[] {
  return ensureTriggerAssociations().filter(a => a.operatorId === operatorId);
}

export function getAllTriggerAssociations(): TriggerAssociation[] {
  return ensureTriggerAssociations();
}
