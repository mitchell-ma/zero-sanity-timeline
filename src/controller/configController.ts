/**
 * ConfigController — operator config deserialization and trigger association management.
 *
 * Builds typed OperatorConfig objects from operatorJsonLoader and
 * TriggerAssociation lists by scanning operator statuses, weapon effects, and gear effects.
 *
 * This is an internal module — consumers should import from gameDataController.ts.
 */

import type { EventSegmentData } from '../consts/viewTypes';
import type { FrameClausePredicate } from '../model/event-frames/skillEventFrame';
import type { Interaction } from '../consts/semantics';
import {
  getOperatorJson,
  getAllOperatorIds,
  getSkillTypeMap,
} from '../model/event-frames/operatorJsonLoader';
import {
  getWeaponEffectDefs,
  getGearEffectDefs,
  getAllWeaponEffectNames,
  getAllGearEffectTypes,
} from '../model/game-data/weaponGearEffectLoader';

// ── Config types ─────────────────────────────────────────────────────────────

/** Typed config for a single skill. */
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

/** Typed config for a status event definition. */
export interface StatusEventConfig {
  id: string;
  originId: string;
  target: string;
  targetDeterminer: string;
  type?: string;
  element?: string;
  duration?: number;
  statusLevel?: {
    interactionType: string;
    limit: { verb: string; values: number[] };
  };
  susceptibility?: Record<string, number[]>;
  minPotential?: number;
  enhancementTypes?: string[];
  cooldownSeconds?: number;
  onTriggerClause?: { conditions: Interaction[] }[];
  onEntryClause?: { conditions: Interaction[]; effects: unknown[] }[];
  onExitClause?: { conditions: Interaction[]; effects: unknown[] }[];
  clause?: { conditions: unknown[]; effects: unknown[] }[];
  segments?: EventSegmentData[];
}

/** Typed wrapper for an operator's full config. */
export interface OperatorConfig {
  id: string;
  skills: Record<string, SkillConfig>;
  statusEvents: StatusEventConfig[];
  skillTypeMap: Record<string, string>;
}

/** Association between a trigger clause and its source. */
export interface TriggerAssociation {
  operatorId: string;
  statusId: string;
  originId: string;
  triggerClause: { conditions: Interaction[] }[];
  source: 'status' | 'talent' | 'weapon' | 'gear';
  /** Full status event config for trigger evaluation. */
  config?: StatusEventConfig;
}

// ── Internal caches ──────────────────────────────────────────────────────────

let operatorConfigCache: Record<string, OperatorConfig> | null = null;
let triggerAssociationCache: TriggerAssociation[] | null = null;

const FPS = 120;

// ── Parsing helpers ──────────────────────────────────────────────────────────

function parseDurationFrames(props: Record<string, unknown> | undefined): number | undefined {
  if (!props?.duration) return undefined;
  const dur = props.duration as { value: number | number[]; unit: string };
  const val = Array.isArray(dur.value) ? dur.value[0] : dur.value;
  if (val == null || val < 0) return undefined;
  return dur.unit === 'SECOND' ? Math.round(val * FPS) : val;
}

function parseStatusEvent(raw: Record<string, unknown>): StatusEventConfig {
  const props = (raw.properties ?? {}) as Record<string, unknown>;
  const id = (props.id ?? props.name ?? '') as string;
  const sl = props.statusLevel as { interactionType?: string; limit?: { verb?: string; values?: number[]; value?: number } } | undefined;

  return {
    id,
    originId: ((raw.metadata as Record<string, unknown>)?.originId ?? raw.originId ?? '') as string,
    target: (props.target ?? raw.target ?? 'OPERATOR') as string,
    targetDeterminer: (props.targetDeterminer ?? raw.targetDeterminer ?? 'THIS') as string,
    type: props.type as string | undefined,
    element: props.element as string | undefined,
    duration: parseDurationFrames(props),
    ...(sl ? {
      statusLevel: {
        interactionType: sl.interactionType ?? 'NONE',
        limit: {
          verb: sl.limit?.verb ?? 'IS',
          values: sl.limit?.values ?? (sl.limit?.value != null ? [sl.limit.value as number] : [1]),
        },
      },
    } : {}),
    ...(props.susceptibility ? { susceptibility: props.susceptibility as Record<string, number[]> } : {}),
    ...(props.minPotential != null ? { minPotential: props.minPotential as number } : {}),
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
    const json = getOperatorJson(operatorId);
    if (!json) continue;

    const skillsJson = (json.skills ?? {}) as Record<string, Record<string, unknown>>;
    const skills: Record<string, SkillConfig> = {};
    for (const [skillId, skillData] of Object.entries(skillsJson)) {
      skills[skillId] = parseSkillConfig(skillId, skillData);
    }

    const rawStatusEvents = (json.statusEvents ?? []) as Record<string, unknown>[];
    const statusEvents = rawStatusEvents.map(parseStatusEvent);

    const skillTypeMap = getSkillTypeMap(operatorId);

    configs[operatorId] = { id: operatorId, skills, statusEvents, skillTypeMap };
  }

  return configs;
}

function buildTriggerAssociations(): TriggerAssociation[] {
  const associations: TriggerAssociation[] = [];
  const configs = ensureOperatorConfigs();

  // Operator status events
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

  // Weapon effects
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

  // Gear effects
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

/** Get the typed config for an operator by ID. */
export function getOperatorConfig(operatorId: string): OperatorConfig | undefined {
  return ensureOperatorConfigs()[operatorId];
}

/** Get all operator configs. */
export function getAllOperatorConfigs(): OperatorConfig[] {
  return Object.values(ensureOperatorConfigs());
}

/** Get a specific skill config for an operator. */
export function getSkillConfig(operatorId: string, skillId: string): SkillConfig | undefined {
  return ensureOperatorConfigs()[operatorId]?.skills[skillId];
}

/** Get a specific status event config for an operator by status ID. */
export function getStatusEventConfig(operatorId: string, statusId: string): StatusEventConfig | undefined {
  const config = ensureOperatorConfigs()[operatorId];
  if (!config) return undefined;
  return config.statusEvents.find(se => se.id === statusId);
}

/** Get all trigger associations for a specific operator. */
export function getTriggerAssociations(operatorId: string): TriggerAssociation[] {
  return ensureTriggerAssociations().filter(a => a.operatorId === operatorId);
}

/** Get all trigger associations across all sources. */
export function getAllTriggerAssociations(): TriggerAssociation[] {
  return ensureTriggerAssociations();
}
