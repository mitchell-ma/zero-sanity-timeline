/**
 * WeaponSkillsLoader — loads and deserializes weapon skill JSON configs
 * into typed WeaponSkill class instances.
 *
 * Auto-discovers weapons/weapon-skills/*.json via require.context.
 * Generic skills (shared stat boosts) are in generic-skills.json keyed by ID.
 * Named skills (per-weapon) are in <weapon>-skills.json with metadata.originId.
 */
import type { Interaction } from '../../dsl/semantics';
import { NounType, DeterminerType } from '../../dsl/semantics';
import { EventType } from '../../consts/enums';
import type { ClauseEffect, ClausePredicate } from './weaponStatusesStore';
import { resolveEffectStat } from '../enums/stats';
import { checkKeys, checkIdAndName, VALID_VALUE_NODE_KEYS, VALID_CLAUSE_KEYS, VALID_METADATA_KEYS, VALID_EFFECT_KEYS, VALID_EFFECT_WITH_KEYS, VALID_TRIGGER_CONDITION_KEYS, validateEffect as validateEffectSemantics, validateNonNegativeValues } from './validationUtils';
import { LocaleKey, GENERIC_WEAPON_ID, GAME_ORIGIN_ID, resolveEventName, resolveOptionalEventDescription } from '../../locales/gameDataLocale';

// ── Validation ──────────────────────────────────────────────────────────────
const VALID_PROPERTIES_KEYS = new Set(['id', 'eventCategoryType']);
const VALID_TOP_KEYS = new Set(['segments', 'onTriggerClause', 'properties', 'metadata']);

function validateValueNode(wv: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(wv, VALID_VALUE_NODE_KEYS, path);
  if ('verb' in wv && typeof wv.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if ('operator' in wv && typeof wv.operator !== 'string') errors.push(`${path}.operator: must be a string`);
  return errors;
}

function validateLocalEffect(ef: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(ef, VALID_EFFECT_KEYS, path);
  if (typeof ef.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if (typeof ef.object !== 'string') errors.push(`${path}.object: must be a string`);
  errors.push(...validateEffectSemantics(ef, path));
  if (ef.with) {
    const w = ef.with as Record<string, unknown>;
    errors.push(...checkKeys(w, VALID_EFFECT_WITH_KEYS, `${path}.with`));
    if (w.multiplier) errors.push(...validateValueNode(w.multiplier as Record<string, unknown>, `${path}.with.multiplier`));
    if (w.value) errors.push(...validateValueNode(w.value as Record<string, unknown>, `${path}.with.value`));
  }
  return errors;
}

function validateClause(clause: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(clause, VALID_CLAUSE_KEYS, path);
  if (!Array.isArray(clause.conditions)) errors.push(`${path}.conditions: must be an array`);
  if (!Array.isArray(clause.effects)) errors.push(`${path}.effects: must be an array`);
  else (clause.effects as Record<string, unknown>[]).forEach((ef, i) => errors.push(...validateLocalEffect(ef, `${path}.effects[${i}]`)));
  return errors;
}

function validateTriggerClause(clause: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(clause, VALID_CLAUSE_KEYS, path);
  if (!Array.isArray(clause.conditions)) errors.push(`${path}.conditions: must be an array`);
  else (clause.conditions as Record<string, unknown>[]).forEach((c, i) => errors.push(...checkKeys(c, VALID_TRIGGER_CONDITION_KEYS, `${path}.conditions[${i}]`)));
  if (clause.effects) {
    if (!Array.isArray(clause.effects)) errors.push(`${path}.effects: must be an array`);
    else (clause.effects as Record<string, unknown>[]).forEach((ef, i) => errors.push(...validateLocalEffect(ef, `${path}.effects[${i}]`)));
  }
  return errors;
}

/** Validate a raw weapon skill JSON entry. Returns an array of error messages (empty = valid). */
export function validateWeaponSkill(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_TOP_KEYS, 'root');
  errors.push(...validateNonNegativeValues(json, 'root'));

  // Root-level `clause` is rejected — clauses MUST live inside segments.
  if ('clause' in json) errors.push('root.clause: not allowed — move clause effects into segments[0].clause');

  if (json.segments) {
    if (!Array.isArray(json.segments)) errors.push('root.segments: must be an array');
    else (json.segments as Record<string, unknown>[]).forEach((s, si) => {
      const segClause = (s as { clause?: unknown[] }).clause;
      if (Array.isArray(segClause)) {
        (segClause as Record<string, unknown>[]).forEach((c, i) => errors.push(...validateClause(c, `segments[${si}].clause[${i}]`)));
      }
    });
  }

  if (json.onTriggerClause) {
    if (!Array.isArray(json.onTriggerClause)) errors.push('root.onTriggerClause: must be an array');
    else (json.onTriggerClause as Record<string, unknown>[]).forEach((c, i) => errors.push(...validateTriggerClause(c, `onTriggerClause[${i}]`)));
  }

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...checkKeys(props, VALID_PROPERTIES_KEYS, 'properties'));
  errors.push(...checkIdAndName(props, 'properties'));

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) {
    errors.push(...checkKeys(meta, VALID_METADATA_KEYS, 'metadata'));
    if (typeof meta.originId !== 'string') errors.push('metadata.originId: must be a string');
  }

  return errors;
}

// ── Trigger clause type ─────────────────────────────────────────────────────

export interface TriggerClause {
  conditions: Interaction[];
  effects: ClauseEffect[];
}

// ── WeaponSkill class ───────────────────────────────────────────────────────

/** A weapon skill definition (eventCategoryType=WEAPON_STAT). The trigger-
 *  source wrapper: segments[i].clause (passive stats) + `onTriggerClause` that
 *  applies the in-game-visible WeaponStat status (eventCategoryType=WEAPON). */
export class WeaponSkill {
  readonly id: string;
  readonly segments: { clause?: ClausePredicate[] }[];
  readonly onTriggerClause: TriggerClause[];
  readonly name: string;
  readonly description: string;
  readonly eventCategoryType: string;
  readonly originId?: string;

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.id = (props.id ?? '') as string;
    this.segments = (json.segments ?? []) as { clause?: ClausePredicate[] }[];
    this.onTriggerClause = (json.onTriggerClause ?? []) as TriggerClause[];
    const weaponId = (meta.originId ?? '') as string;
    // Weapon-specific (named) skills key under weapon.<weaponId>.skill.<skillId>;
    // generic weapon skills (originId === GAME_ORIGIN_ID) under the GENERIC namespace.
    const localeWeaponId = !weaponId || weaponId === GAME_ORIGIN_ID ? GENERIC_WEAPON_ID : weaponId;
    const prefix = this.id ? LocaleKey.weaponSkill(localeWeaponId, this.id) : '';
    this.name = prefix ? resolveEventName(prefix) : '';
    this.description = prefix ? (resolveOptionalEventDescription(prefix) ?? '') : '';
    this.eventCategoryType = props.eventCategoryType as string;
    if (meta.originId) this.originId = meta.originId as string;
  }

  /** All clause predicates flattened across segments. */
  get clause(): ClausePredicate[] {
    return this.segments.flatMap(s => s.clause ?? []);
  }

  /** Get the permanent (passive) effects — clauses with no conditions. */
  get passiveEffects(): ClauseEffect[] {
    return this.clause
      .filter(c => !c.conditions || c.conditions.length === 0)
      .flatMap(c => c.effects);
  }

  /** Get the per-rank values for a passive stat (e.g. "HEAT_DAMAGE_BONUS"). */
  getPassiveValues(statObject: string): number[] {
    for (const effect of this.passiveEffects) {
      if (resolveEffectStat(effect) === statObject) {
        const wv = effect.with?.multiplier ?? effect.with?.value;
        const v = (wv as { value?: number | number[] })?.value;
        if (v != null) return Array.isArray(v) ? v : [v];
      }
    }
    return [];
  }

  /** Serialize back to the JSON shape. */
  serialize(): Record<string, unknown> {
    return {
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      properties: {
        id: this.id,
        // Reproject locale-resolved strings so configCache/getStatusDef surfaces them.
        ...(this.name ? { name: this.name } : {}),
        ...(this.description ? { description: this.description } : {}),
        eventCategoryType: this.eventCategoryType,
      },
      ...(this.originId ? { metadata: { originId: this.originId } } : {}),
    };
  }

  /** Serialize as a trigger-source def for the event pipeline. */
  serializeAsTriggerDef(): Record<string, unknown> {
    return {
      ...(this.segments.length > 0 ? { segments: this.segments } : {}),
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      properties: {
        id: this.id,
        ...(this.name ? { name: this.name } : {}),
        target: NounType.OPERATOR,
        targetDeterminer: DeterminerType.THIS,
        eventTypes: [EventType.STATUS],
        eventCategoryType: NounType.WEAPON_STAT,
      },
      metadata: {
        ...(this.originId ? { originId: this.originId } : {}),
      },
    };
  }

  /** Deserialize from JSON with validation. */
  static deserialize(json: Record<string, unknown>, source?: string): WeaponSkill {
    const errors = validateWeaponSkill(json);
    if (errors.length > 0) {
      const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(`[WeaponSkill] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
    }
    return new WeaponSkill(json);
  }
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** Generic skills indexed by skill ID (e.g. "INTELLECT_BOOST_L"). */
const genericSkillCache = new Map<string, WeaponSkill>();

/** Named skills indexed by originId (e.g. "FORGEBORN_SCATHE"). */
const namedSkillCache = new Map<string, WeaponSkill>();

// Generic weapon skills: individual files in weapons/generic/ with skill- prefix
const genericContext = require.context('./weapons/generic', false, /^\.\/skill-.*\.json$/);
for (const key of genericContext.keys()) {
  const json = genericContext(key) as Record<string, unknown>;
  const props = json.properties as Record<string, unknown> | undefined;
  const skillId = (props?.id ?? '') as string;
  if (!skillId) {
    console.warn(`[WeaponSkillsController] Missing properties.id in generic ${key}`);
    continue;
  }
  genericSkillCache.set(skillId, WeaponSkill.deserialize(json, `generic:${skillId}`));
}

// Named weapon skills: route by eventCategoryType=WEAPON_STAT (not by path).
// The JSON's properties.eventCategoryType determines that this is a named
// skill; paths are informational only.
const namedContext = require.context('./weapons', true, /\.json$/);
for (const key of namedContext.keys()) {
  if (key.includes('/generic/') || key.includes('/statuses/')) continue;
  const json = namedContext(key) as Record<string, unknown>;
  const props = (json.properties ?? {}) as Record<string, unknown>;
  if (props.eventCategoryType !== NounType.WEAPON_STAT) continue;
  const skill = WeaponSkill.deserialize(json, key);
  if (skill.originId) {
    namedSkillCache.set(skill.originId, skill);
  }
}

/** Get a generic weapon skill by ID (e.g. "INTELLECT_BOOST_L"). */
export function getGenericWeaponSkill(skillId: string): WeaponSkill | undefined {
  return genericSkillCache.get(skillId);
}

/** Get the named weapon skill by weapon originId (e.g. "FORGEBORN_SCATHE"). */
export function getNamedWeaponSkill(originId: string): WeaponSkill | undefined {
  return namedSkillCache.get(originId);
}

/** Get all generic weapon skill IDs. */
export function getAllGenericSkillIds(): string[] {
  return Array.from(genericSkillCache.keys());
}

/** Get all weapon originIds that have named skills. */
export function getAllNamedSkillOriginIds(): string[] {
  return Array.from(namedSkillCache.keys());
}

// ── Skill stat computation ──────────────────────────────────────────────────

export interface WeaponSkillStatResult {
  stat: string;
  value: number;
}

/**
 * Get all stat contributions from a generic weapon skill at a given level.
 * Returns one entry per passive effect (e.g. ASSAULT_ARMAMENT_PREP has two: MAIN_ATTRIBUTE + ATTACK_BONUS).
 * Returns empty array if not a generic skill or no passive effects.
 */
export function getGenericSkillStats(skillId: string, level: number): WeaponSkillStatResult[] {
  const skill = genericSkillCache.get(skillId);
  if (!skill) return [];
  const results: WeaponSkillStatResult[] = [];
  for (const effect of skill.passiveEffects) {
    const wv = effect.with?.multiplier ?? effect.with?.value;
    if ((wv as { value?: unknown })?.value == null) continue;
    const vals = Array.isArray((wv as { value: unknown }).value) ? (wv as { value: number[] }).value : [(wv as { value: number }).value];
    const value = vals[level - 1] ?? 0;
    if (value !== 0) results.push({ stat: resolveEffectStat(effect) ?? effect.object, value });
  }
  return results;
}

/**
 * Get all passive stat contributions from a weapon's named skill.
 * Looks up the named skill by weapon originId (e.g. "FORGEBORN_SCATHE").
 */
export function getNamedSkillPassiveStats(weaponOriginId: string, level: number): WeaponSkillStatResult[] {
  const skill = namedSkillCache.get(weaponOriginId);
  if (!skill) return [];
  const results: WeaponSkillStatResult[] = [];
  for (const effect of skill.passiveEffects) {
    const wv = effect.with?.multiplier ?? effect.with?.value;
    if ((wv as { value?: unknown })?.value == null) continue;
    const vals = Array.isArray((wv as { value: unknown }).value) ? (wv as { value: number[] }).value : [(wv as { value: number }).value];
    const value = vals.length === 1 ? vals[0] : (vals[level - 1] ?? 0);
    if (value !== 0) results.push({ stat: resolveEffectStat(effect) ?? effect.object, value });
  }
  return results;
}
