/**
 * OperatorStatusesController — loads and deserializes operator status JSON configs
 * into typed OperatorStatus class instances.
 *
 * Auto-discovers operator-statuses/*.json via require.context.
 * Each file contains an array of operator status entries sharing an originId.
 */
import { EventType, EventCategoryType, UNLIMITED_STACKS } from '../../consts/enums';
import { NounType, EVENT_CATEGORY_TO_GROUP, ClauseEvaluationType } from '../../dsl/semantics';
import type { EventSegmentData, EventFrameMarker } from '../../consts/viewTypes';
import type { ClauseEffect, StacksConfig, DurationConfig, StatusSegment } from './weaponStatusesStore';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT, type ValueResolutionContext } from '../../controller/calculation/valueResolver';
import { PERMANENT_DURATION } from '../../consts/enums';
import { DataDrivenSkillEventFrame } from '../event-frames/dataDrivenEventFrames';

import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { checkKeys, checkIdAndName, VALID_VALUE_NODE_KEYS, VALID_CLAUSE_KEYS, VALID_METADATA_KEYS, VALID_EFFECT_KEYS, VALID_EFFECT_WITH_KEYS, VALID_TRIGGER_CONDITION_KEYS, validateEffect, validateInteraction, validateSegmentShape, validateNonNegativeValues, collectThisOperatorInClauses, collectEnemyWithDeterminer } from './validationUtils';
import { LocaleKey, resolveEventName, resolveOptionalEventDescription, resolveSegmentName, resolveFrameName } from '../../locales/gameDataLocale';

// ── Trigger clause type ─────────────────────────────────────────────────────

interface TriggerCondition {
  subjectDeterminer?: string;
  subject?: string;
  verb: string;
  object?: string;
  objectId?: string;
  value?: unknown;
  cardinalityConstraint?: string;
  to?: string;
  toDeterminer?: string;
  with?: unknown;
}

interface TriggerClause {
  conditions: TriggerCondition[];
  effects?: ClauseEffect[];
}

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_DURATION_KEYS = new Set(['value', 'unit', 'modifier']);
const VALID_STATUS_LEVEL_KEYS = new Set(['limit', 'interactionType', 'level']);
const VALID_PROPERTIES_KEYS = new Set([
  'id', 'type', 'element', 'target', 'targetDeterminer', 'to', 'toDeterminer',
  'duration', 'stacks', 'enhancementType', 'enhancementTypes', 'eventType',
  'eventCategoryType', 'maxLevel', 'crowdControls',
  // Allowed when a potential file is loaded-as-a-status:
  'level', 'descriptionParams',
]);
const VALID_TOP_KEYS = new Set([
  'onTriggerClause', 'onEntryClause', 'onExitClause',
  // Evaluation mode for each clause bucket — FIRST_MATCH stops after the first
  // matching clause (e.g. Essence Disintegration: base + P>=2 refinement),
  // otherwise every matching clause fires. Parallels segment-level `clauseType`.
  'onTriggerClauseType', 'onEntryClauseType', 'onExitClauseType',
  'segments', 'properties', 'metadata',
]);

function validateValueNode(wv: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(wv, VALID_VALUE_NODE_KEYS, path);
  if ('verb' in wv && typeof wv.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  if ('operation' in wv && typeof wv.operation !== 'string') errors.push(`${path}.operation: must be a string`);
  return errors;
}

function validateStatusEffect(ef: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(ef, VALID_EFFECT_KEYS, path);
  if (typeof ef.verb !== 'string') errors.push(`${path}.verb: must be a string`);
  // Compound effects (ALL/ANY) have nested effects instead of an object
  if (!ef.effects && typeof ef.object !== 'string') errors.push(`${path}.object: must be a string`);
  errors.push(...validateEffect(ef, path));
  if (ef.with) {
    const w = ef.with as Record<string, unknown>;
    errors.push(...checkKeys(w, VALID_EFFECT_WITH_KEYS, `${path}.with`));
    if (w.value) errors.push(...validateValueNode(w.value as Record<string, unknown>, `${path}.with.value`));
  }
  return errors;
}

function validateTriggerClause(clause: Record<string, unknown>, path: string): string[] {
  const errors = checkKeys(clause, VALID_CLAUSE_KEYS, path);
  if (!Array.isArray(clause.conditions)) errors.push(`${path}.conditions: must be an array`);
  else {
    (clause.conditions as Record<string, unknown>[]).forEach((c, i) => {
      errors.push(...checkKeys(c, VALID_TRIGGER_CONDITION_KEYS, `${path}.conditions[${i}]`));
      errors.push(...validateInteraction(c, `${path}.conditions[${i}]`));
    });
  }
  if (clause.effects) {
    if (!Array.isArray(clause.effects)) errors.push(`${path}.effects: must be an array`);
    else (clause.effects as Record<string, unknown>[]).forEach((ef, i) => errors.push(...validateStatusEffect(ef, `${path}.effects[${i}]`)));
  }
  return errors;
}

/** Validate a raw operator status JSON entry. Returns an array of error messages (empty = valid). */
export function validateOperatorStatus(json: Record<string, unknown>): string[] {
  const errors = checkKeys(json, VALID_TOP_KEYS, 'root');
  errors.push(...validateNonNegativeValues(json, 'root'));

  // Root-level `clause`/`clauseType` are rejected — clauses MUST live inside
  // segments; root-level `clauseType` is replaced by per-bucket
  // `onTriggerClauseType` / `onEntryClauseType` / `onExitClauseType` which
  // target the specific clause list they apply to.
  if ('clause' in json) errors.push('root.clause: not allowed — move clause effects into segments[0].clause');
  if ('clauseType' in json) errors.push('root.clauseType: not allowed — use onTriggerClauseType / onEntryClauseType / onExitClauseType, or set clauseType on the segment that owns the clause');
  for (const ctKey of ['onTriggerClauseType', 'onEntryClauseType', 'onExitClauseType'] as const) {
    const v = json[ctKey];
    if (v !== undefined && v !== ClauseEvaluationType.FIRST_MATCH && v !== ClauseEvaluationType.ALL) {
      errors.push(`root.${ctKey}: "${v}" is not a valid ClauseEvaluationType (FIRST_MATCH or ALL)`);
    }
  }

  for (const triggerKey of ['onTriggerClause', 'onEntryClause', 'onExitClause']) {
    if (json[triggerKey]) {
      if (!Array.isArray(json[triggerKey])) errors.push(`root.${triggerKey}: must be an array`);
      else (json[triggerKey] as Record<string, unknown>[]).forEach((c, i) => errors.push(...validateTriggerClause(c, `${triggerKey}[${i}]`)));
    }
  }

  // Description-only configs (no onTriggerClause / onEntryClause / onExitClause /
  // segments) are allowed — they represent passive talents/potentials that only
  // exist as reference metadata and never fire on the timeline. Otherwise, if a
  // config has any runtime hook, it must also carry a non-empty `segments` array.
  const hasRuntimeHook =
    (Array.isArray(json.onTriggerClause) && (json.onTriggerClause as unknown[]).length > 0) ||
    (Array.isArray(json.onEntryClause) && (json.onEntryClause as unknown[]).length > 0) ||
    (Array.isArray(json.onExitClause) && (json.onExitClause as unknown[]).length > 0);
  if (json.segments) {
    if (!Array.isArray(json.segments) || (json.segments as unknown[]).length === 0) {
      errors.push('root.segments: must be a non-empty array');
    } else {
      (json.segments as Record<string, unknown>[]).forEach((s, i) => errors.push(...validateSegmentShape(s, `segments[${i}]`)));
    }
  } else if (!hasRuntimeHook) {
    // description-only: allowed without segments
  } else {
    // hasRuntimeHook but no segments — trigger-only configs (talents that only
    // dispatch APPLY STATUS/CONSUME EVENT effects) don't need segments.
  }

  const props = json.properties as Record<string, unknown> | undefined;
  if (!props) { errors.push('root.properties: required'); return errors; }
  errors.push(...checkKeys(props, VALID_PROPERTIES_KEYS, 'properties'));
  errors.push(...checkIdAndName(props, 'properties'));

  // eventCategoryType must be a known category. TALENT_STATUS / POTENTIAL_STATUS are
  // no longer valid — use TALENT / POTENTIAL instead. A TALENT or POTENTIAL is
  // not inherently passive; the engine decides based on whether other events
  // trigger it (onTriggerClause with APPLY/CONSUME EVENT THIS).
  if (typeof props.eventCategoryType === 'string') {
    // eslint-disable-next-line no-restricted-syntax
    if (props.eventCategoryType === 'TALENT_STATUS') {
      errors.push(`properties.eventCategoryType: "TALENT_STATUS" is invalid — use "TALENT" instead`);
    // eslint-disable-next-line no-restricted-syntax
    } else if (props.eventCategoryType === 'POTENTIAL_STATUS') {
      errors.push(`properties.eventCategoryType: "POTENTIAL_STATUS" is invalid — use "POTENTIAL" instead`);
    }
  }

  // Status configs must specify a target — this determines default routing
  if (!props.to && !props.target) errors.push('properties.to: required (TEAM, OPERATOR, or ENEMY)');

  // When the status targets TEAM or ENEMY (properties.to), value resolution
  // and determiner resolution run against that non-operator entity — no stats,
  // skill level, talent level, or potential. Flag any determiner+noun pair of
  // the form `THIS + OPERATOR` anywhere in the clause trees (effect-level
  // to/from/of/object/subject determiners, condition-level subject/object
  // determiners, nested `of` structs in ValueNodes, and predicates inside
  // compound ALL/ANY effects). The canonical form is `SOURCE` so the resolver
  // picks up the casting operator's context.
  //
  // Walks every clause location: top-level clauses, onTrigger/onEntry/onExit,
  // and per-segment (seg.clause, seg.onEntry/onExit/onTrigger, seg.frames[*].clause).
  if (props.to === NounType.TEAM || props.to === NounType.ENEMY) {
    const ownerLabel = props.to === NounType.TEAM ? 'TEAM' : 'ENEMY';
    const walk = (clauses: unknown, clausePath: string) => {
      errors.push(...collectThisOperatorInClauses(clauses, clausePath, ownerLabel));
    };
    if (json.onTriggerClause) walk(json.onTriggerClause, 'onTriggerClause');
    if (json.onEntryClause) walk(json.onEntryClause, 'onEntryClause');
    if (json.onExitClause) walk(json.onExitClause, 'onExitClause');
    if (Array.isArray(json.segments)) {
      for (let si = 0; si < (json.segments as unknown[]).length; si++) {
        const seg = (json.segments as Record<string, unknown>[])[si];
        const segBase = `segments[${si}]`;
        if (seg.clause) walk(seg.clause, `${segBase}.clause`);
        if (seg.onTriggerClause) walk(seg.onTriggerClause, `${segBase}.onTriggerClause`);
        if (seg.onEntryClause) walk(seg.onEntryClause, `${segBase}.onEntryClause`);
        if (seg.onExitClause) walk(seg.onExitClause, `${segBase}.onExitClause`);
        if (Array.isArray(seg.frames)) {
          for (let fi = 0; fi < (seg.frames as unknown[]).length; fi++) {
            const frame = (seg.frames as Record<string, unknown>[])[fi];
            if (frame.clause) walk(frame.clause, `${segBase}.frames[${fi}].clause`);
          }
        }
      }
    }
  }

  if (props.duration) {
    const dur = props.duration as Record<string, unknown>;
    errors.push(...checkKeys(dur, VALID_DURATION_KEYS, 'properties.duration'));
  }

  if (props.stacks) {
    const sl = props.stacks as Record<string, unknown>;
    errors.push(...checkKeys(sl, VALID_STATUS_LEVEL_KEYS, 'properties.stacks'));
    if (sl.limit) errors.push(...checkKeys(sl.limit as Record<string, unknown>, VALID_VALUE_NODE_KEYS, 'properties.stacks.limit'));
  }

  const meta = json.metadata as Record<string, unknown> | undefined;
  if (meta) {
    errors.push(...checkKeys(meta, VALID_METADATA_KEYS, 'metadata'));
    if (typeof meta.originId !== 'string') errors.push('metadata.originId: must be a string');
  }

  // Flag any `object: ENEMY` paired with a determiner — ENEMY is a singleton
  // in the DSL and has no determiner. Covers value-node `of` chains, effect
  // subject/object/to/from references, and nested predicates everywhere.
  errors.push(...collectEnemyWithDeterminer(json, 'root'));

  return errors;
}

// ── OperatorStatus class ────────────────────────────────────────────────────

/** An operator status effect definition. Maps 1:1 to the JSON shape. */
export class OperatorStatus {
  readonly onTriggerClause: TriggerClause[];
  readonly onEntryClause: TriggerClause[];
  readonly onExitClause: TriggerClause[];
  readonly onTriggerClauseType?: string;
  readonly onEntryClauseType?: string;
  readonly onExitClauseType?: string;
  readonly segments: EventSegmentData[];
  private readonly _rawSegments: StatusSegment[];
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly type?: string;
  readonly element?: string;
  readonly target: string;
  readonly targetDeterminer?: string;
  readonly to: string;
  readonly toDeterminer?: string;
  readonly duration?: DurationConfig;
  readonly stacks?: StacksConfig;
  readonly enhancementTypes?: string[];
  readonly eventType: EventType;
  readonly eventCategoryType?: string;
  readonly categoryType?: EventCategoryType;
  readonly isEnabled?: boolean;
  readonly originId: string;
  readonly dataSources: string[];
  readonly icon?: string;

  constructor(json: Record<string, unknown>) {
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const meta = (json.metadata ?? {}) as Record<string, unknown>;

    this.onTriggerClause = (json.onTriggerClause ?? []) as TriggerClause[];
    this.onEntryClause = (json.onEntryClause ?? []) as TriggerClause[];
    this.onExitClause = (json.onExitClause ?? []) as TriggerClause[];
    if (json.onTriggerClauseType) this.onTriggerClauseType = json.onTriggerClauseType as string;
    if (json.onEntryClauseType) this.onEntryClauseType = json.onEntryClauseType as string;
    if (json.onExitClauseType) this.onExitClauseType = json.onExitClauseType as string;
    const rawSegments = (json.segments ?? []) as StatusSegment[];
    this._rawSegments = rawSegments;
    // Compute the locale prefix up front so segment/frame names can be resolved
    // while building the view-layer segments below.
    this.id = (props.id ?? '') as string;
    const operatorId = (meta.originId ?? '') as string;
    // Operator-specific statuses key under op.<id>.status.<sid>; generic
    // statuses (operators/generic/ and generic/statuses/) key under status.<sid>.
    // The loader may override this default via the `__localePrefix` hint when a
    // file is a potential/talent being loaded as a status (those live under
    // different locale prefixes).
    const prefixOverride = (json as { __localePrefix?: string }).__localePrefix;
    const prefix = prefixOverride ?? (this.id
      ? (operatorId
          ? LocaleKey.operatorStatus(operatorId, this.id)
          : LocaleKey.genericStatus(this.id))
      : '');
    this.segments = rawSegments.map((seg, si) => {
      const segProps = seg.properties as Record<string, unknown> | undefined;
      const durConfig = segProps?.duration as { value: unknown; unit: string } | undefined;
      const durationFrames = durConfig
        ? Math.round(resolveValueNode(durConfig.value as import('../../dsl/semantics').ValueNode, DEFAULT_VALUE_CONTEXT) * FPS)
        : 0;
      const segElement = segProps?.element as string | undefined;
      const segName = prefix ? resolveSegmentName(prefix, si) : undefined;
      const segData: EventSegmentData = {
        properties: {
          duration: durationFrames,
          ...(segName !== undefined ? { name: segName } : {}),
          element: segElement,
          // Preserve segment-type classifications (ANIMATION, COOLDOWN,
          // IMMEDIATE_COOLDOWN, etc.) from the raw config — the layout,
          // renderer, and combo-cooldown gate all read segmentTypes to
          // decide how to handle the segment.
          ...(segProps?.segmentTypes ? { segmentTypes: segProps.segmentTypes as import('../../consts/enums').SegmentType[] } : {}),
          ...(segProps?.timeDependency ? { timeDependency: segProps.timeDependency as import('../../consts/enums').TimeDependency } : {}),
          ...(segProps?.timeInteractionType ? { timeInteractionType: segProps.timeInteractionType as string } : {}),
        },
      };
      if (seg.frames && seg.frames.length > 0) {
        segData.frames = seg.frames.map((f, fi) => {
          const marker = new DataDrivenSkillEventFrame(f as Record<string, unknown>).toMarker(FPS) as EventFrameMarker;
          // Inherit segment element for frame diamond coloring when the frame
          // doesn't specify its own.
          if (!marker.damageElement && segElement) marker.damageElement = segElement;
          const frameName = prefix ? resolveFrameName(prefix, si, fi) : undefined;
          if (frameName !== undefined) (marker as unknown as Record<string, unknown>).name = frameName;
          return marker;
        });
      }
      return segData;
    });
    this.name = prefix ? resolveEventName(prefix) : '';
    if (prefix) {
      // descriptionParams live on potential / talent files and carry the
      // blackboard values that `{poise:0}` / `{Str:0}` / `{duration:0s}`
      // templates reference.
      const descriptionParams = props.descriptionParams as Record<string, number> | undefined;
      const desc = resolveOptionalEventDescription(prefix, descriptionParams);
      if (desc !== undefined) this.description = desc;
    }
    if (props.type) this.type = props.type as string;
    if (props.element) this.element = props.element as string;
    this.target = (props.target ?? props.to ?? 'OPERATOR') as string;
    if (props.targetDeterminer ?? props.toDeterminer) this.targetDeterminer = (props.targetDeterminer ?? props.toDeterminer) as string;
    this.to = (props.to ?? props.target ?? 'OPERATOR') as string;
    if (props.toDeterminer) this.toDeterminer = props.toDeterminer as string;
    if (props.duration) {
      this.duration = props.duration as DurationConfig;
    }
    if (props.stacks) {
      this.stacks = props.stacks as StacksConfig;
    }
    if (props.enhancementTypes) this.enhancementTypes = props.enhancementTypes as string[];
    this.eventType = (props.eventType as EventType) ?? EventType.STATUS;
    if (props.eventCategoryType) {
      this.eventCategoryType = props.eventCategoryType as string;
      this.categoryType = EVENT_CATEGORY_TO_GROUP[this.eventCategoryType];
    }
    if (meta.isEnabled === false) this.isEnabled = false;
    this.originId = (meta.originId ?? '') as string;
    this.dataSources = (meta.dataSources ?? []) as string[];
    if (meta.icon) this.icon = meta.icon as string;
  }

  get durationSeconds(): number {
    if (!this.duration) return 0;
    return resolveValueNode(this.duration.value, DEFAULT_VALUE_CONTEXT);
  }

  /** Resolve duration with a specific potential level (for potential-dependent status durations). */
  resolveDurationSeconds(potential: number): number {
    if (!this.duration) return 0;
    return resolveValueNode(this.duration.value, { ...DEFAULT_VALUE_CONTEXT, potential });
  }

  /**
   * Resolve the status's top-level `properties.duration` against the apply-time
   * ValueResolutionContext (potential + talent level + skill level + stats).
   * Returns a frame count, or `TOTAL_FRAMES` for permanent / zero-resolved
   * durations (locked potentials / talent level 0). Returns `undefined` when
   * the status has no `properties.duration` declared.
   */
  resolveDurationFrames(ctx: ValueResolutionContext): number | undefined {
    if (!this.duration) return undefined;
    const secs = resolveValueNode(this.duration.value, ctx);
    return secs === PERMANENT_DURATION || secs === 0 ? TOTAL_FRAMES : Math.round(secs * FPS);
  }

  /**
   * Resolve per-segment durations against the apply-time ValueResolutionContext.
   * Returns a cloned segments array with durations re-resolved from the raw
   * ValueNode configs. Zero-duration segments are pruned — a segment whose
   * duration resolves to 0 at the given context (e.g. VARY_BY POTENTIAL for a
   * locked potential, VARY_BY TALENT_LEVEL at level 0) is conceptually absent.
   *
   * Callers must pass a populated context (potential, talentLevel, skillLevel,
   * stats); otherwise talent-gated / potential-gated segments will be dropped.
   */
  resolveSegments(ctx: ValueResolutionContext): EventSegmentData[] {
    return this.segments
      .map((seg, i) => {
        const rawProps = this._rawSegments[i]?.properties as Record<string, unknown> | undefined;
        const rawDur = rawProps?.duration as { value: unknown; unit: string } | undefined;
        const durationFrames = rawDur
          ? Math.round(resolveValueNode(rawDur.value as import('../../dsl/semantics').ValueNode, ctx) * FPS)
          : seg.properties.duration;
        return {
          ...seg,
          properties: { ...seg.properties, duration: durationFrames },
          ...(seg.frames ? { frames: seg.frames.map(f => ({ ...f })) } : {}),
        };
      })
      .filter(seg => seg.properties.duration > 0);
  }

  get maxStacks(): number {
    if (!this.stacks) return 1;
    return resolveValueNode(this.stacks.limit, DEFAULT_VALUE_CONTEXT);
  }

  /** Serialize back to the JSON shape. */
  serialize(): Record<string, unknown> {
    return {
      ...(this.onTriggerClause.length > 0 ? { onTriggerClause: this.onTriggerClause } : {}),
      ...(this.onTriggerClauseType ? { onTriggerClauseType: this.onTriggerClauseType } : {}),
      ...(this.onEntryClause.length > 0 ? { onEntryClause: this.onEntryClause } : {}),
      ...(this.onEntryClauseType ? { onEntryClauseType: this.onEntryClauseType } : {}),
      ...(this.onExitClause.length > 0 ? { onExitClause: this.onExitClause } : {}),
      ...(this.onExitClauseType ? { onExitClauseType: this.onExitClauseType } : {}),
      ...(this._rawSegments.length > 0 ? { segments: this._rawSegments } : {}),
      properties: {
        id: this.id,
        // Reproject locale-resolved strings so configCache/getStatusDef surfaces them.
        ...(this.name ? { name: this.name } : {}),
        ...(this.description ? { description: this.description } : {}),
        ...(this.type ? { type: this.type } : {}),
        ...(this.element ? { element: this.element } : {}),
        target: this.target,
        ...(this.targetDeterminer ? { targetDeterminer: this.targetDeterminer } : {}),
        ...(this.duration ? { duration: this.duration } : {}),
        ...(this.stacks ? { stacks: this.stacks } : {}),
        ...(this.enhancementTypes ? { enhancementTypes: this.enhancementTypes } : {}),
        eventType: this.eventType,
        ...(this.eventCategoryType ? { eventCategoryType: this.eventCategoryType } : {}),
      },
      metadata: {
        ...(this.isEnabled === false ? { isEnabled: false } : {}),
        originId: this.originId,
        ...(this.dataSources.length > 0 ? { dataSources: this.dataSources } : {}),
        ...(this.icon ? { icon: this.icon } : {}),
      },
    };
  }

  /**
   * Deserialize from JSON with validation.
   *
   * `localePrefix`, when provided, overrides the default
   * `op.<opId>.status.<id>` lookup used by the constructor — required for
   * potential/talent files that are also loaded as statuses (their strings
   * live under `op.<opId>.potential.<level>` / `op.<opId>.talent.<id>`).
   */
  static deserialize(
    json: Record<string, unknown>,
    source?: string,
    localePrefix?: string,
  ): OperatorStatus {
    const meta = json.metadata as Record<string, unknown> | undefined;
    if (meta?.isEnabled !== false) {
      const errors = validateOperatorStatus(json);
      if (errors.length > 0) {
        const id = (json.properties as Record<string, unknown>)?.id ?? 'unknown';
        console.warn(`[OperatorStatus] Validation errors in ${source ?? id}:\n  ${errors.join('\n  ')}`);
      }
    }
    if (localePrefix) {
      const tagged = { ...json, __localePrefix: localePrefix };
      return new OperatorStatus(tagged);
    }
    return new OperatorStatus(json);
  }
}

// ── Directory → JSON-ID map ──────────────────────────────────────────────────

const _dirToId = new Map<string, string>();
const _opCtx = require.context('./operators', true, /\/[^/]+\/[^/]+\.json$/);
for (const k of _opCtx.keys()) {
  const m = k.match(/^\.\/([^/]+)\/[^/]+\.json$/);
  if (!m || m[1] === 'generic' || k.includes('/potentials/') || k.includes('/skills/') || k.includes('/statuses/') || k.includes('/talents/')) continue;
  const j = _opCtx(k) as Record<string, unknown>;
  if (typeof j.id === 'string') _dirToId.set(m[1], j.id);
}

// ── Loader ──────────────────────────────────────────────────────────────────

/** All operator statuses indexed by operator JSON ID. */
const operatorStatusCache = new Map<string, OperatorStatus[]>();

// Load individual status/talent/potential files from operator subdirectories.
// Potentials are scanned too because self-triggering potentials (e.g. Estella
// P5 "Survival is a Win") live in potentials/ and carry onTriggerClause.
// Description-only potential files (no clause / no onTriggerClause) are skipped.
const operatorStatusContext = require.context('./operators', true, /\/(statuses|talents|potentials)\/[^/]+\.json$/);
for (const key of operatorStatusContext.keys()) {
  // Extract operatorId from path: ./laevatain/statuses/status-melting-flame.json → LAEVATAIN
  const match = key.match(/^\.\/([^/]+)\/(statuses|talents|potentials)\/[^/]+\.json$/);
  if (!match || match[1] === 'generic') continue;
  const operatorId = _dirToId.get(match[1]) ?? match[1];

  const json = operatorStatusContext(key) as Record<string, unknown>;
  // Potential files are description-only by convention (their effects are
  // baked into the skill/talent/status they modify via VARY_BY POTENTIAL).
  // Only load potential files that are explicitly marked as STATUS (e.g.
  // self-triggering potential statuses like Estella P5 Survival is a Win).
  // Other potential files may still carry legacy clauses — skip them so
  // they don't fire without proper potential-level gating.
  const kind = match[2];
  if (kind === 'potentials') {
    const props = json.properties as Record<string, unknown> | undefined;
    if (props?.eventType !== EventType.STATUS) continue;
  }

  // Pick the locale prefix that matches the source directory. Always derive
  // the operator id from the file path (_dirToId) rather than the file's
  // metadata.originId — some status JSONs set originId to their parent skill
  // (e.g. OVERCLOCKED_MOMENT) rather than the operator.
  const fileProps = (json.properties ?? {}) as Record<string, unknown>;
  const statusId = (fileProps.id ?? '') as string;
  let localePrefix: string | undefined;
  if (kind === 'statuses' && statusId) {
    localePrefix = LocaleKey.operatorStatus(operatorId, statusId);
  } else if (kind === 'talents' && statusId) {
    localePrefix = LocaleKey.operatorTalent(operatorId, statusId);
  } else if (kind === 'potentials') {
    const level = fileProps.level as number | undefined;
    if (typeof level === 'number') localePrefix = LocaleKey.operatorPotential(operatorId, level);
    else {
      // Filename fallback: potential-<N>-*.json
      const m = key.match(/potential-(\d+)-/);
      if (m) localePrefix = LocaleKey.operatorPotential(operatorId, parseInt(m[1], 10));
    }
  }

  const status = OperatorStatus.deserialize(json, key, localePrefix);

  if (!operatorStatusCache.has(operatorId)) {
    operatorStatusCache.set(operatorId, []);
  }
  operatorStatusCache.get(operatorId)!.push(status);
}

// Load generic statuses from operators/generic/ (flat) and generic/statuses/.
// Both are keyed in the locale bundle under `status.<id>` (no operator scope).
const genericStatusContext = require.context('./operators/generic', false, /\.json$/);
for (const key of genericStatusContext.keys()) {
  const json = genericStatusContext(key) as Record<string, unknown>;
  const sid = ((json.properties ?? {}) as Record<string, unknown>).id as string | undefined;
  const status = OperatorStatus.deserialize(json, key, sid ? LocaleKey.genericStatus(sid) : undefined);

  if (!operatorStatusCache.has('generic')) {
    operatorStatusCache.set('generic', []);
  }
  operatorStatusCache.get('generic')!.push(status);
}

const genericStatusDirContext = require.context('./generic/statuses', false, /\.json$/);
for (const key of genericStatusDirContext.keys()) {
  const json = genericStatusDirContext(key) as Record<string, unknown>;
  // Generic statuses without stacks config get unlimited stacks
  const props = json.properties as Record<string, unknown> | undefined;
  if (props && !props.stacks) {
    props.stacks = { limit: { verb: 'IS', value: UNLIMITED_STACKS }, interactionType: 'NONE' };
  }
  const sid = props?.id as string | undefined;
  const status = OperatorStatus.deserialize(json, key, sid ? LocaleKey.genericStatus(sid) : undefined);

  if (!operatorStatusCache.has('generic')) {
    operatorStatusCache.set('generic', []);
  }
  operatorStatusCache.get('generic')!.push(status);
}

/** Get all operator statuses for an operator by originId (e.g. "laevatain"). */
export function getOperatorStatuses(originId: string): readonly OperatorStatus[] {
  return operatorStatusCache.get(originId) ?? [];
}

/** Get all registered operator IDs that have status definitions. */
export function getAllOperatorStatusOriginIds(): string[] {
  return Array.from(operatorStatusCache.keys());
}

/** Get all operator statuses across all operators. */
export function getAllOperatorStatuses(): readonly OperatorStatus[] {
  const result: OperatorStatus[] = [];
  operatorStatusCache.forEach(statuses => result.push(...statuses));
  return result;
}
