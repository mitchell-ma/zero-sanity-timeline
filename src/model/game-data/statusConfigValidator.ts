/**
 * Validates status event JSON configs against the schema.
 *
 * All three levels (event, segment, frame) share the same clause shape:
 *   { conditions?: Predicate[], effects: Effect[] }
 *
 * Hierarchy:
 *   EVENT  → { properties, metadata, clause, onTriggerClause, onEntryClause, onExitClause, segments }
 *   SEGMENT → { name, properties, clause, onTriggerClause, onEntryClause, onExitClause, frames }
 *   FRAME   → { metadata, properties, clause }
 */

import { VerbType, ObjectType } from '../../dsl/semantics';

// ── Allowed key sets ────────────────────────────────────────────────────────

const EVENT_KEYS = new Set([
  'properties', 'metadata', 'segments',
  'clause', 'onTriggerClause', 'onEntryClause', 'onExitClause',
]);

const EVENT_PROPERTIES_KEYS = new Set([
  'id', 'name', 'type', 'element',
  'target', 'targetDeterminer',
  'isForced', 'enhancementTypes',
  'stacks', 'duration',
  'eventType', 'eventCategoryType',
]);

const EVENT_METADATA_KEYS = new Set([
  'originId', 'description', 'note',
]);

const SEGMENT_KEYS = new Set([
  'properties', 'frames',
  'clause', 'onTriggerClause', 'onEntryClause', 'onExitClause',
]);

const SEGMENT_PROPERTIES_KEYS = new Set([
  'name', 'duration',
]);

const FRAME_KEYS = new Set([
  'metadata', 'properties', 'clause',
]);

const FRAME_METADATA_KEYS = new Set([
  'eventComponentType',
]);

const FRAME_PROPERTIES_KEYS = new Set([
  'offset',
]);

const CLAUSE_ENTRY_KEYS = new Set([
  'conditions', 'effects',
]);

const CONDITION_KEYS = new Set([
  'subjectDeterminer', 'subject', 'verb', 'negated',
  'object', 'objectId', 'element', 'adjective',
  'cardinalityConstraint', 'value',
]);

const EFFECT_KEYS = new Set([
  'verb', 'object', 'objectId', 'adjective', 'element',
  'to', 'toObject', 'toDeterminer',
  'fromObject', 'onObject',
  'with', 'for', 'until',
  'value', 'cardinalityConstraint',
  // Nested sub-effects (ALL → effects[])
  'effects',
]);

// ── Valid enum values ───────────────────────────────────────────────────────

const VALID_ELEMENTS = new Set(['HEAT', 'ELECTRIC', 'CRYO', 'NATURE']);
const VALID_STATUS_LEVEL_INTERACTIONS = new Set(['NONE', 'RESET']);
const VALID_ENHANCEMENT_TYPES = new Set(['EMPOWERED', 'ENHANCED']);
const VALID_LIMIT_VERBS = new Set([VerbType.IS, VerbType.VARY_BY]);
const VALID_DURATION_UNITS = new Set(['SECOND', 'FRAME', 'PERCENTAGE']);
const VALID_TARGETS = new Set(['OPERATOR', 'ENEMY']);
const VALID_TARGET_DETERMINERS = new Set(['THIS', 'OTHER', 'ALL', 'ANY', 'CONTROLLED']);
const ID_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** Legacy keys with migration guidance. */
const LEGACY_RENAMES: Record<string, string> = {
  onActivationClause: 'onEntryClause',
  reactiveTriggerClause: 'onTriggerClause',
  triggerClause: 'onTriggerClause',
  originId: 'metadata.originId',
  id: 'properties.id',
  name: 'properties.name',
  target: 'properties.target',
  targetDeterminer: 'properties.targetDeterminer',
  stack: 'properties.stacks',
  isNamedEvent: '(remove)',
  isForceApplied: '(remove)',
  minTalentLevel: '(remove)',
  p3TeamShare: '(remove)',
  stats: '(remove — use clause effects)',
  cooldownSeconds: '(remove — use segments)',
  susceptibility: '(remove — move to clause effects)',
  element: 'properties.element',
  description: 'metadata.description',
  note: 'metadata.note',
};

// ── Types ───────────────────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
}

// ── Key validation helpers ──────────────────────────────────────────────────

const checkKeys = (
  obj: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  label: string,
  legacy?: Record<string, string>,
): ValidationError[] => {
  const errors: ValidationError[] = [];
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      const rename = legacy?.[key];
      if (rename) {
        errors.push({ path, message: `legacy ${label} key "${key}" → ${rename}` });
      } else {
        errors.push({ path, message: `unexpected ${label} key "${key}"` });
      }
    }
  }
  return errors;
};

// ── Duration ────────────────────────────────────────────────────────────────

const VALID_DURATION_TOP_KEYS = new Set(['value', 'unit', 'modifier']);

const validateDuration = (duration: unknown, path: string) => {
  const errors: ValidationError[] = [];
  if (typeof duration !== 'object' || duration === null) {
    errors.push({ path, message: 'duration must be an object' });
    return errors;
  }
  const d = duration as Record<string, unknown>;
  if (d.value === undefined) {
    errors.push({ path, message: 'duration must have "value"' });
  } else if (typeof d.value !== 'object' || d.value === null) {
    errors.push({ path, message: 'duration.value must be a ValueNode object' });
  }
  if (d.unit === undefined) {
    errors.push({ path, message: 'duration must have "unit"' });
  } else if (!VALID_DURATION_UNITS.has(d.unit as string)) {
    errors.push({ path, message: `unknown duration unit "${d.unit}"` });
  }
  for (const key of Object.keys(d)) {
    if (!VALID_DURATION_TOP_KEYS.has(key)) {
      errors.push({ path, message: `unexpected duration key "${key}"` });
    }
  }
  return errors;
};

// ── Clause validation (shared across all levels) ────────────────────────────

const validateCondition = (cond: Record<string, unknown>, path: string) => {
  return checkKeys(cond, CONDITION_KEYS, path, 'condition');
};

const validateEffect = (effect: Record<string, unknown>, path: string): ValidationError[] => {
  const errors = checkKeys(effect, EFFECT_KEYS, path, 'effect');
  // Recurse into nested sub-effects (e.g. ALL → effects[])
  if (Array.isArray(effect.effects)) {
    for (let i = 0; i < effect.effects.length; i++) {
      const sub = effect.effects[i];
      if (typeof sub === 'object' && sub !== null) {
        errors.push(...validateEffect(sub as Record<string, unknown>, `${path}.effects[${i}]`));
      }
    }
  }
  return errors;
};

const validateClauseEntries = (clause: unknown, path: string) => {
  const errors: ValidationError[] = [];
  if (!Array.isArray(clause)) {
    errors.push({ path, message: 'clause must be an array' });
    return errors;
  }
  for (let i = 0; i < clause.length; i++) {
    const entry = clause[i];
    if (typeof entry !== 'object' || entry === null) {
      errors.push({ path: `${path}[${i}]`, message: 'clause entry must be an object' });
      continue;
    }
    const e = entry as Record<string, unknown>;
    errors.push(...checkKeys(e, CLAUSE_ENTRY_KEYS, `${path}[${i}]`, 'clause entry'));

    if (e.conditions !== undefined) {
      if (!Array.isArray(e.conditions)) {
        errors.push({ path: `${path}[${i}].conditions`, message: 'conditions must be an array' });
      } else {
        for (let ci = 0; ci < e.conditions.length; ci++) {
          const c = e.conditions[ci];
          if (typeof c === 'object' && c !== null) {
            errors.push(...validateCondition(c as Record<string, unknown>, `${path}[${i}].conditions[${ci}]`));
          }
        }
      }
    }

    if (e.effects !== undefined) {
      if (!Array.isArray(e.effects)) {
        errors.push({ path: `${path}[${i}].effects`, message: 'effects must be an array' });
      } else {
        for (let ei = 0; ei < e.effects.length; ei++) {
          const eff = e.effects[ei];
          if (typeof eff === 'object' && eff !== null) {
            errors.push(...validateEffect(eff as Record<string, unknown>, `${path}[${i}].effects[${ei}]`));
          }
        }
      }
    }
  }
  return errors;
};

// ── Clause group validation (all 4 types) ───────────────────────────────────

const validateAllClauses = (obj: Record<string, unknown>, path: string) => {
  const errors: ValidationError[] = [];
  if (obj.clause !== undefined) errors.push(...validateClauseEntries(obj.clause, `${path}.clause`));
  if (obj.onTriggerClause !== undefined) errors.push(...validateClauseEntries(obj.onTriggerClause, `${path}.onTriggerClause`));
  if (obj.onEntryClause !== undefined) errors.push(...validateClauseEntries(obj.onEntryClause, `${path}.onEntryClause`));
  if (obj.onExitClause !== undefined) errors.push(...validateClauseEntries(obj.onExitClause, `${path}.onExitClause`));
  return errors;
};

// ── Stacks ──────────────────────────────────────────────────────────────────

const validateStacks = (stacks: unknown, path: string) => {
  const errors: ValidationError[] = [];
  if (typeof stacks !== 'object' || stacks === null) {
    errors.push({ path, message: 'stacks must be an object' });
    return errors;
  }
  const sl = stacks as Record<string, unknown>;
  errors.push(...checkKeys(sl, new Set(['limit', 'interactionType']), path, 'stacks'));

  if (sl.limit === undefined) {
    errors.push({ path, message: 'stacks must have "limit"' });
  } else if (typeof sl.limit !== 'object' || sl.limit === null) {
    errors.push({ path: `${path}.limit`, message: 'limit must be an object' });
  } else {
    const limit = sl.limit as Record<string, unknown>;
    errors.push(...checkKeys(limit, new Set(['verb', 'value', 'object']), `${path}.limit`, 'limit'));
    if (limit.verb === undefined) {
      errors.push({ path: `${path}.limit`, message: 'limit must have "verb"' });
    } else if (!VALID_LIMIT_VERBS.has(limit.verb as VerbType)) {
      errors.push({ path: `${path}.limit`, message: `unknown limit verb "${limit.verb}"` });
    }
    if (limit.value === undefined) {
      errors.push({ path: `${path}.limit`, message: 'limit must have "value"' });
    }
  }

  if (sl.interactionType === undefined) {
    errors.push({ path, message: 'stacks must have "interactionType"' });
  } else if (!VALID_STATUS_LEVEL_INTERACTIONS.has(sl.interactionType as string)) {
    errors.push({ path, message: `unknown interactionType "${sl.interactionType}"` });
  }

  return errors;
};

// ── Frame ───────────────────────────────────────────────────────────────────

const validateFrame = (frame: Record<string, unknown>, path: string) => {
  const errors: ValidationError[] = [];
  errors.push(...checkKeys(frame, FRAME_KEYS, path, 'frame'));

  if (frame.metadata !== undefined && typeof frame.metadata === 'object' && frame.metadata !== null) {
    errors.push(...checkKeys(frame.metadata as Record<string, unknown>, FRAME_METADATA_KEYS, `${path}.metadata`, 'frame metadata'));
  }
  if (frame.properties !== undefined && typeof frame.properties === 'object' && frame.properties !== null) {
    errors.push(...checkKeys(frame.properties as Record<string, unknown>, FRAME_PROPERTIES_KEYS, `${path}.properties`, 'frame properties'));
  }
  if (frame.clause !== undefined) {
    errors.push(...validateClauseEntries(frame.clause, `${path}.clause`));
  }

  return errors;
};

// ── Segment ─────────────────────────────────────────────────────────────────

const validateSegment = (segment: Record<string, unknown>, path: string) => {
  const errors: ValidationError[] = [];
  errors.push(...checkKeys(segment, SEGMENT_KEYS, path, 'segment'));

  if (segment.properties !== undefined) {
    if (typeof segment.properties !== 'object' || segment.properties === null) {
      errors.push({ path: `${path}.properties`, message: 'properties must be an object' });
    } else {
      const sp = segment.properties as Record<string, unknown>;
      errors.push(...checkKeys(sp, SEGMENT_PROPERTIES_KEYS, `${path}.properties`, 'segment properties'));
      if (sp.duration !== undefined) {
        errors.push(...validateDuration(sp.duration, `${path}.properties.duration`));
      }
    }
  }

  errors.push(...validateAllClauses(segment, path));

  if (segment.frames !== undefined) {
    if (!Array.isArray(segment.frames)) {
      errors.push({ path: `${path}.frames`, message: 'frames must be an array' });
    } else {
      for (let i = 0; i < segment.frames.length; i++) {
        errors.push(...validateFrame(segment.frames[i], `${path}.frames[${i}]`));
      }
    }
  }

  return errors;
};

// ── Event (status entry) ────────────────────────────────────────────────────

const validateStatusEntry = (entry: Record<string, unknown>, path: string) => {
  const errors: ValidationError[] = [];

  // Top-level keys
  errors.push(...checkKeys(entry, EVENT_KEYS, path, 'top-level', LEGACY_RENAMES));

  // metadata: required, must have originId
  if (entry.metadata === undefined) {
    errors.push({ path, message: 'missing required "metadata"' });
  } else if (typeof entry.metadata !== 'object' || entry.metadata === null) {
    errors.push({ path, message: '"metadata" must be an object' });
  } else {
    const meta = entry.metadata as Record<string, unknown>;
    errors.push(...checkKeys(meta, EVENT_METADATA_KEYS, `${path}.metadata`, 'metadata'));
    if (!meta.originId) {
      errors.push({ path: `${path}.metadata`, message: 'metadata must have "originId"' });
    }
  }

  // properties: required
  if (entry.properties === undefined) {
    errors.push({ path, message: 'missing required "properties"' });
  } else if (typeof entry.properties !== 'object' || entry.properties === null) {
    errors.push({ path, message: '"properties" must be an object' });
  } else {
    const props = entry.properties as Record<string, unknown>;
    errors.push(...checkKeys(props, EVENT_PROPERTIES_KEYS, `${path}.properties`, 'properties'));

    // id: required, ALL_CAPS
    if (props.id === undefined) {
      errors.push({ path: `${path}.properties`, message: 'missing required "id"' });
    } else if (typeof props.id !== 'string') {
      errors.push({ path: `${path}.properties.id`, message: 'id must be a string' });
    } else if (!ID_PATTERN.test(props.id)) {
      errors.push({ path: `${path}.properties.id`, message: `id "${props.id}" must be ALL_CAPS` });
    }

    // target: required
    if (props.target === undefined) {
      errors.push({ path: `${path}.properties`, message: 'missing required "target"' });
    } else if (!VALID_TARGETS.has(props.target as string)) {
      errors.push({ path: `${path}.properties.target`, message: `unknown target "${props.target}"` });
    }

    // targetDeterminer: required for OPERATOR targets (ENEMY has no determiner)
    if (props.target === 'OPERATOR') {
      if (props.targetDeterminer === undefined) {
        errors.push({ path: `${path}.properties`, message: 'missing required "targetDeterminer" for OPERATOR target' });
      } else if (!VALID_TARGET_DETERMINERS.has(props.targetDeterminer as string)) {
        errors.push({ path: `${path}.properties.targetDeterminer`, message: `unknown targetDeterminer "${props.targetDeterminer}"` });
      }
    }

    // element: optional, must be valid
    if (props.element !== undefined && !VALID_ELEMENTS.has(props.element as string)) {
      errors.push({ path: `${path}.properties.element`, message: `unknown element "${props.element}"` });
    }

    // isForced: optional, must be boolean
    if (props.isForced !== undefined && typeof props.isForced !== 'boolean') {
      errors.push({ path: `${path}.properties.isForced`, message: 'isForced must be a boolean' });
    }

    // enhancementTypes: optional, must be array of valid strings
    if (props.enhancementTypes !== undefined) {
      if (!Array.isArray(props.enhancementTypes)) {
        errors.push({ path: `${path}.properties.enhancementTypes`, message: 'enhancementTypes must be an array' });
      } else {
        for (const et of props.enhancementTypes) {
          if (!VALID_ENHANCEMENT_TYPES.has(et as string)) {
            errors.push({ path: `${path}.properties.enhancementTypes`, message: `unknown enhancement type "${et}"` });
          }
        }
      }
    }

    // stacks: required
    if (props.stacks === undefined) {
      errors.push({ path: `${path}.properties`, message: 'missing required "stacks"' });
    } else {
      errors.push(...validateStacks(props.stacks, `${path}.properties.stacks`));
    }

    // duration: optional
    if (props.duration !== undefined) {
      errors.push(...validateDuration(props.duration, `${path}.properties.duration`));
    }
  }

  // clauses
  errors.push(...validateAllClauses(entry, path));

  // segments
  if (entry.segments !== undefined) {
    if (!Array.isArray(entry.segments)) {
      errors.push({ path: `${path}.segments`, message: 'segments must be an array' });
    } else {
      for (let i = 0; i < entry.segments.length; i++) {
        errors.push(...validateSegment(entry.segments[i], `${path}.segments[${i}]`));
      }
    }
  }

  return errors;
};

// ── Public API — Status configs ──────────────────────────────────────────────

export const validateStatusConfig = (statuses: Record<string, unknown>[], operatorId: string) => {
  const errors: ValidationError[] = [];

  if (!Array.isArray(statuses)) {
    errors.push({ path: operatorId, message: 'status config must be an array' });
    return errors;
  }

  for (let i = 0; i < statuses.length; i++) {
    const id = (statuses[i] as Record<string, Record<string, unknown> | undefined>).properties?.id ?? `[${i}]`;
    errors.push(...validateStatusEntry(statuses[i], `${operatorId}.${id}`));
  }

  return errors;
};

// ── Skill config validation ────────────────────────────────────────────────
//
// Validates operator-skills JSON structure. Skills use the DSL clause format
// with segments and frames. The `animation` property is deprecated — time-stop
// animation must be expressed as an ANIMATION segment.

const SKILL_TOP_KEYS = new Set([
  'properties', 'clause', 'frames', 'segments',
  'dataSources', 'skillTypeMap', 'frameModifications',
  'metadata', 'frameTypes', 'statusEvents',
]);

const SKILL_PROPERTIES_KEYS = new Set([
  'name', 'description',
  'duration', 'trigger', 'hasDelayedHit', 'delayedHitLabel',
  'enhancementTypes', 'dependencyTypes',
  'eventType', 'eventCategoryType',
]);

/** Deprecated skill property keys with migration guidance. */
const SKILL_LEGACY_PROPERTIES: Record<string, string> = {
  animation: 'use an ANIMATION segment (segmentTypes: ["ANIMATION"]) instead',
  animationDuration: 'use an ANIMATION segment instead',
};

const SKILL_SEGMENT_KEYS = new Set([
  'metadata', 'properties', 'clause', 'frames',
]);

const SKILL_SEGMENT_METADATA_KEYS = new Set([
  'eventComponentType', 'dataSources',
]);

const SKILL_SEGMENT_PROPERTIES_KEYS = new Set([
  'name', 'duration', 'segmentTypes', 'timeDependency', 'timeInteractionType', 'dependencyTypes',
]);

const SKILL_FRAME_KEYS = new Set([
  'metadata', 'properties', 'clause', 'damageElement', 'frameTypes',
]);

const SKILL_FRAME_METADATA_KEYS = new Set([
  'eventComponentType', 'dataSources',
]);

const SKILL_FRAME_PROPERTIES_KEYS = new Set([
  'offset', 'dependencyTypes',
]);

const validateSkillFrame = (frame: Record<string, unknown>, path: string) => {
  const errors: ValidationError[] = [];
  errors.push(...checkKeys(frame, SKILL_FRAME_KEYS, path, 'skill frame'));
  if (frame.metadata && typeof frame.metadata === 'object') {
    errors.push(...checkKeys(frame.metadata as Record<string, unknown>, SKILL_FRAME_METADATA_KEYS, `${path}.metadata`, 'skill frame metadata'));
  }
  if (frame.properties && typeof frame.properties === 'object') {
    errors.push(...checkKeys(frame.properties as Record<string, unknown>, SKILL_FRAME_PROPERTIES_KEYS, `${path}.properties`, 'skill frame properties'));
  }
  if (frame.clause !== undefined) {
    errors.push(...validateClauseEntries(frame.clause, `${path}.clause`));
  }
  return errors;
};

const validateSkillSegment = (segment: Record<string, unknown>, path: string) => {
  const errors: ValidationError[] = [];
  errors.push(...checkKeys(segment, SKILL_SEGMENT_KEYS, path, 'skill segment'));
  if (segment.metadata && typeof segment.metadata === 'object') {
    errors.push(...checkKeys(segment.metadata as Record<string, unknown>, SKILL_SEGMENT_METADATA_KEYS, `${path}.metadata`, 'skill segment metadata'));
  }
  if (segment.properties && typeof segment.properties === 'object') {
    errors.push(...checkKeys(segment.properties as Record<string, unknown>, SKILL_SEGMENT_PROPERTIES_KEYS, `${path}.properties`, 'skill segment properties'));
    const sp = segment.properties as Record<string, unknown>;
    if (sp.duration !== undefined) {
      errors.push(...validateDuration(sp.duration, `${path}.properties.duration`));
    }
  }
  if (segment.clause !== undefined) {
    errors.push(...validateClauseEntries(segment.clause, `${path}.clause`));
  }
  if (segment.frames !== undefined) {
    if (!Array.isArray(segment.frames)) {
      errors.push({ path: `${path}.frames`, message: 'frames must be an array' });
    } else {
      for (let i = 0; i < segment.frames.length; i++) {
        errors.push(...validateSkillFrame(segment.frames[i], `${path}.frames[${i}]`));
      }
    }
  }
  return errors;
};

const validateSkillCategory = (skill: Record<string, unknown>, path: string) => {
  const errors: ValidationError[] = [];
  errors.push(...checkKeys(skill, SKILL_TOP_KEYS, path, 'skill'));

  if (skill.properties && typeof skill.properties === 'object') {
    const props = skill.properties as Record<string, unknown>;
    errors.push(...checkKeys(props, SKILL_PROPERTIES_KEYS, `${path}.properties`, 'skill properties', SKILL_LEGACY_PROPERTIES));
    if (props.duration !== undefined) {
      errors.push(...validateDuration(props.duration, `${path}.properties.duration`));
    }
  }

  if (skill.clause !== undefined) {
    errors.push(...validateClauseEntries(skill.clause, `${path}.clause`));
  }

  if (skill.frames !== undefined) {
    if (!Array.isArray(skill.frames)) {
      errors.push({ path: `${path}.frames`, message: 'frames must be an array' });
    } else {
      for (let i = 0; i < skill.frames.length; i++) {
        errors.push(...validateSkillFrame(skill.frames[i], `${path}.frames[${i}]`));
      }
    }
  }

  if (skill.segments !== undefined) {
    if (!Array.isArray(skill.segments)) {
      errors.push({ path: `${path}.segments`, message: 'segments must be an array' });
    } else {
      for (let i = 0; i < skill.segments.length; i++) {
        errors.push(...validateSkillSegment(skill.segments[i], `${path}.segments[${i}]`));
      }
    }
  }

  return errors;
};

/** Check whether a skill category's clauses contain a CONSUME ULTIMATE_ENERGY effect. */
const hasConsumeUltimateEnergy = (skill: Record<string, unknown>): boolean => {
  const clause = skill.clause;
  if (!Array.isArray(clause)) return false;
  for (const entry of clause) {
    if (typeof entry !== 'object' || entry === null) continue;
    const effects = (entry as Record<string, unknown>).effects;
    if (!Array.isArray(effects)) continue;
    for (const eff of effects) {
      if (typeof eff !== 'object' || eff === null) continue;
      const e = eff as Record<string, unknown>;
      if (e.verb === VerbType.CONSUME && e.object === ObjectType.ULTIMATE_ENERGY) return true;
    }
  }
  return false;
};

/** Validate an operator-skills JSON file (keyed by skill ID, plus skillTypeMap). */
export const validateSkillConfig = (
  skillJson: Record<string, unknown>,
  operatorId: string,
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const typeMap = skillJson.skillTypeMap as Record<string, string> | undefined;

  for (const [key, value] of Object.entries(skillJson)) {
    if (key === 'skillTypeMap') continue;
    if (typeof value !== 'object' || value === null) continue;
    errors.push(...validateSkillCategory(value as Record<string, unknown>, `${operatorId}.${key}`));
  }

  // Warn if ultimate skill is missing CONSUME ULTIMATE_ENERGY effect
  const ultSkillId = typeMap?.ULTIMATE ?? 'ULTIMATE';
  const ultSkill = skillJson[ultSkillId];
  if (ultSkill && typeof ultSkill === 'object' && ultSkill !== null) {
    if (!hasConsumeUltimateEnergy(ultSkill as Record<string, unknown>)) {
      console.warn(`[${operatorId}] ultimate skill "${ultSkillId}" is missing a ${VerbType.CONSUME} ${ObjectType.ULTIMATE_ENERGY} effect`);
    }
  }

  return errors;
};
