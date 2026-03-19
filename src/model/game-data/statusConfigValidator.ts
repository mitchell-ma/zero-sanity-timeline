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

// ── Allowed key sets ────────────────────────────────────────────────────────

const EVENT_KEYS = new Set([
  'properties', 'metadata', 'segments',
  'clause', 'onTriggerClause', 'onEntryClause', 'onExitClause',
]);

const EVENT_PROPERTIES_KEYS = new Set([
  'id', 'name', 'type', 'element',
  'target', 'targetDeterminer',
  'isForced', 'enhancementTypes',
  'statusLevel', 'duration',
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
  'cardinalityConstraint', 'cardinality',
]);

const EFFECT_KEYS = new Set([
  'verb', 'object', 'objectId', 'adjective', 'element',
  'to', 'toObject', 'toDeterminer',
  'fromObject', 'onObject',
  'with', 'for', 'until',
  'cardinality', 'cardinalityConstraint',
  // Nested sub-effects (ALL → effects[])
  'effects',
]);

// ── Valid enum values ───────────────────────────────────────────────────────

const VALID_ELEMENTS = new Set(['HEAT', 'ELECTRIC', 'CRYO', 'NATURE']);
const VALID_STATUS_LEVEL_INTERACTIONS = new Set(['NONE', 'RESET']);
const VALID_ENHANCEMENT_TYPES = new Set(['EMPOWERED', 'ENHANCED']);
const VALID_LIMIT_VERBS = new Set(['IS', 'BASED_ON']);
const VALID_DURATION_UNITS = new Set(['SECOND', 'FRAME']);
const VALID_TARGETS = new Set(['OPERATOR', 'ENEMY']);
const VALID_TARGET_DETERMINERS = new Set(['THIS', 'OTHER', 'ALL', 'ANY']);
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
  statusLevel: 'properties.statusLevel',
  stack: 'properties.statusLevel',
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

const validateDuration = (duration: unknown, path: string) => {
  const errors: ValidationError[] = [];
  if (typeof duration !== 'object' || duration === null) {
    errors.push({ path, message: 'duration must be an object' });
    return errors;
  }
  const d = duration as Record<string, unknown>;
  if (d.value === undefined) {
    errors.push({ path, message: 'duration must have "value"' });
  }
  if (d.unit === undefined) {
    errors.push({ path, message: 'duration must have "unit"' });
  } else if (!VALID_DURATION_UNITS.has(d.unit as string)) {
    errors.push({ path, message: `unknown duration unit "${d.unit}"` });
  }
  for (const key of Object.keys(d)) {
    if (key !== 'value' && key !== 'unit') {
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

// ── StatusLevel ─────────────────────────────────────────────────────────────

const validateStatusLevel = (statusLevel: unknown, path: string) => {
  const errors: ValidationError[] = [];
  if (typeof statusLevel !== 'object' || statusLevel === null) {
    errors.push({ path, message: 'statusLevel must be an object' });
    return errors;
  }
  const sl = statusLevel as Record<string, unknown>;
  errors.push(...checkKeys(sl, new Set(['limit', 'statusLevelInteractionType']), path, 'statusLevel'));

  if (sl.limit === undefined) {
    errors.push({ path, message: 'statusLevel must have "limit"' });
  } else if (typeof sl.limit !== 'object' || sl.limit === null) {
    errors.push({ path: `${path}.limit`, message: 'limit must be an object' });
  } else {
    const limit = sl.limit as Record<string, unknown>;
    errors.push(...checkKeys(limit, new Set(['verb', 'value', 'object']), `${path}.limit`, 'limit'));
    if (limit.verb === undefined) {
      errors.push({ path: `${path}.limit`, message: 'limit must have "verb"' });
    } else if (!VALID_LIMIT_VERBS.has(limit.verb as string)) {
      errors.push({ path: `${path}.limit`, message: `unknown limit verb "${limit.verb}"` });
    }
    if (limit.value === undefined) {
      errors.push({ path: `${path}.limit`, message: 'limit must have "value"' });
    }
  }

  if (sl.statusLevelInteractionType === undefined) {
    errors.push({ path, message: 'statusLevel must have "statusLevelInteractionType"' });
  } else if (!VALID_STATUS_LEVEL_INTERACTIONS.has(sl.statusLevelInteractionType as string)) {
    errors.push({ path, message: `unknown statusLevelInteractionType "${sl.statusLevelInteractionType}"` });
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

    // statusLevel: required
    if (props.statusLevel === undefined) {
      errors.push({ path: `${path}.properties`, message: 'missing required "statusLevel"' });
    } else {
      errors.push(...validateStatusLevel(props.statusLevel, `${path}.properties.statusLevel`));
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

// ── Public API ──────────────────────────────────────────────────────────────

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
