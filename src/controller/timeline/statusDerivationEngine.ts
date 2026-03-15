/**
 * Generic status derivation engine.
 *
 * Evaluates `statusEvents` from operator JSONs against timeline state,
 * producing derived TimelineEvent instances. Replaces hardcoded derive*
 * functions in processStatus.ts one at a time.
 *
 * Supports:
 * - IS_PRESENT triggers (passive buffs, e.g. Messenger's Song)
 * - PERFORM triggers (skill-cast-based, e.g. Scorching Heart via Melting Flame)
 * - HAVE STATUS triggers (reaction-based, e.g. Scorching Fangs on Combustion)
 * - Compound triggers (PERFORM X while ENEMY HAVE Y, e.g. Wildland Trekker)
 * - Stack threshold clauses (at max stacks → apply derived status)
 * - Stack interaction types: NONE (independent), RESET (refresh earlier)
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { EventStatusType } from '../../consts/enums';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { ENEMY_OWNER_ID, OPERATOR_COLUMNS, REACTION_COLUMNS } from '../../model/channels';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { getOperatorJson, getSkillNameMap, getAllOperatorIds } from '../../model/event-frames/operatorJsonLoader';
import { LoadoutStats } from '../../view/InformationPane';

// ── Types from JSON ─────────────────────────────────────────────────────────

interface StatusEventDef {
  name: string;
  target: string;
  element?: string;
  isNamedEvent?: boolean;
  stack: {
    verbType: string;
    max: Record<string, number>;
    instances: number;
  };
  triggerClause: TriggerClause[];
  clause?: EffectClause[];
  consumeClause?: EffectClause[];
  duration?: { value: number[]; unit: string };
  properties?: { duration?: { value: number[]; unit: string } };
  stats?: unknown[];
  minTalentLevel?: { talent: number; minLevel: number };
  p3TeamShare?: { durationMultiplier: number };
  susceptibility?: Record<string, number[]>;
}

interface TriggerClause {
  conditions: Predicate[];
}

interface EffectClause {
  conditions: Predicate[];
  effects: Effect[];
}

interface Predicate {
  subjectType: string;
  verbType: string;
  objectType?: string;
  objectId?: string;
  cardinalityConstraint?: string;
  cardinality?: number | string;
}

interface Effect {
  verbType: string;
  objectType: string;
  objectId?: string;
  prepositionType?: string;
  toObjectType?: string;
}

// ── Operator detection ──────────────────────────────────────────────────────

/** Find which slot owns a given operator by scanning events for their skill names. */
function findOperatorSlot(
  events: TimelineEvent[],
  operatorId: string,
): string | null {
  const skillNames = new Set(Object.keys(getSkillNameMap(operatorId)));
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID || ev.ownerId === COMMON_OWNER_ID) continue;
    if (skillNames.has(ev.name)) return ev.ownerId;
  }
  return null;
}

// ── Column ID mapping ───────────────────────────────────────────────────────

const REACTION_STATUS_TO_COLUMN: Record<string, string> = {
  COMBUSTION: REACTION_COLUMNS.COMBUSTION,
  SOLIDIFICATION: REACTION_COLUMNS.SOLIDIFICATION,
  CORROSION: REACTION_COLUMNS.CORROSION,
  ELECTRIFICATION: REACTION_COLUMNS.ELECTRIFICATION,
};

function statusNameToColumnId(name: string): string {
  return REACTION_STATUS_TO_COLUMN[name]
    ?? (OPERATOR_COLUMNS as Record<string, string>)[name]
    ?? name.toLowerCase().replace(/_/g, '-');
}

// ── Target resolution ───────────────────────────────────────────────────────

/**
 * Resolve a target string to an owner ID.
 * Supports: 'ENEMY', 'ALL_OPERATORS', 'THIS_OPERATOR', and operator IDs
 * (e.g. 'LAEVATAIN') which are resolved via the operatorSlotMap.
 */
function resolveOwnerId(
  target: string,
  operatorSlotId: string,
  operatorSlotMap?: Record<string, string>,
): string {
  switch (target) {
    case 'ENEMY': return ENEMY_OWNER_ID;
    case 'ALL_OPERATORS': return COMMON_OWNER_ID;
    case 'THIS_OPERATOR': return operatorSlotId;
    default: {
      // Try to resolve as an operator ID (e.g. 'LAEVATAIN' → 'slot1')
      if (operatorSlotMap) {
        const slotId = operatorSlotMap[target.toLowerCase()];
        if (slotId) return slotId;
      }
      return operatorSlotId;
    }
  }
}

// ── Max stacks by potential ─────────────────────────────────────────────────

function getMaxStacks(stackMax: Record<string, number>, potential: number): number {
  const key = `P${potential}`;
  return stackMax[key] ?? stackMax.P0 ?? 1;
}

// ── Duration resolution ─────────────────────────────────────────────────────

function getDurationFrames(duration: { value: number[]; unit: string }): number {
  const val = duration.value[0];
  if (val < 0) return TOTAL_FRAMES; // -1 = permanent
  if (duration.unit === 'SECOND') return Math.round(val * 120);
  return val;
}

// ── Trigger evaluation ──────────────────────────────────────────────────────

interface TriggerMatch {
  frame: number;
  sourceOwnerId: string;
  sourceSkillName: string;
}

/**
 * Check if a single predicate is satisfied at a given frame.
 */
function checkPredicate(
  pred: Predicate,
  events: TimelineEvent[],
  operatorSlotId: string,
  candidateFrame: number,
): boolean {
  switch (pred.verbType) {
    case 'IS_PRESENT':
      return true; // operator presence already verified by findOperatorSlot

    case 'PERFORM':
      // Not used for direct checking — PERFORM triggers are found by scanning events
      return true;

    case 'HAVE': {
      if (pred.objectType === 'STATUS' && pred.objectId) {
        const colId = statusNameToColumnId(pred.objectId);
        const target = pred.subjectType === 'ENEMY' ? ENEMY_OWNER_ID
          : pred.subjectType === 'ALL_OPERATORS' ? COMMON_OWNER_ID
          : operatorSlotId;
        // Count active events of this status at candidateFrame
        const activeCount = events.filter(ev =>
          ev.columnId === colId &&
          (target === ENEMY_OWNER_ID ? ev.ownerId === ENEMY_OWNER_ID : ev.ownerId !== ENEMY_OWNER_ID) &&
          ev.startFrame <= candidateFrame &&
          candidateFrame < ev.startFrame + ev.activationDuration
        ).length;

        if (activeCount === 0) return false;

        // Check cardinality constraint if specified
        if (pred.cardinality != null) {
          const required = typeof pred.cardinality === 'number' ? pred.cardinality : 0;
          if (pred.cardinalityConstraint === 'EXACTLY') {
            return activeCount === required;
          } else if (pred.cardinalityConstraint === 'AT_LEAST') {
            return activeCount >= required;
          }
        }
        return true;
      }
      return false;
    }

    default:
      return false;
  }
}

/**
 * Find all trigger matches for a status event definition.
 */
function findTriggerMatches(
  def: StatusEventDef,
  events: TimelineEvent[],
  operatorSlotId: string,
): TriggerMatch[] {
  const matches: TriggerMatch[] = [];

  for (const clause of def.triggerClause) {
    // Classify conditions
    const performConds = clause.conditions.filter(c => c.verbType === 'PERFORM');
    const haveConds = clause.conditions.filter(c => c.verbType === 'HAVE');
    const presenceConds = clause.conditions.filter(c => c.verbType === 'IS_PRESENT');

    if (presenceConds.length > 0) {
      // IS_PRESENT: trigger once at frame 0
      matches.push({ frame: 0, sourceOwnerId: operatorSlotId, sourceSkillName: def.name });
      continue;
    }

    if (performConds.length > 0) {
      // PERFORM trigger: find all skill casts by this operator matching the objectType
      const performCond = performConds[0];
      const matchingSkillColumn = performCond.objectType === 'BATTLE_SKILL' ? 'battle'
        : performCond.objectType === 'COMBO_SKILL' ? 'combo'
        : performCond.objectType === 'ULTIMATE' ? 'ultimate'
        : performCond.objectType;

      for (const ev of events) {
        if (ev.ownerId !== operatorSlotId) continue;
        if (ev.columnId !== matchingSkillColumn) continue;

        // Check additional HAVE conditions at this frame
        const allHaveMet = haveConds.every(hc =>
          checkPredicate(hc, events, operatorSlotId, ev.startFrame)
        );
        if (!allHaveMet) continue;

        matches.push({
          frame: ev.startFrame,
          sourceOwnerId: ev.ownerId,
          sourceSkillName: ev.name,
        });
      }
    } else if (haveConds.length > 0) {
      // Pure HAVE trigger (e.g. ENEMY HAVE COMBUSTION, or THIS_OPERATOR HAVE STATUS X EXACTLY N):
      // trigger on each matching status event start, but only if cardinality is satisfied.
      const haveCond = haveConds[0];
      if (haveCond.objectType === 'STATUS' && haveCond.objectId) {
        const colId = statusNameToColumnId(haveCond.objectId);
        for (const ev of events) {
          if (ev.columnId !== colId) continue;
          if (haveCond.subjectType === 'ENEMY' && ev.ownerId !== ENEMY_OWNER_ID) continue;

          // Check cardinality constraint if specified
          if (haveCond.cardinality != null) {
            if (!checkPredicate(haveCond, events, operatorSlotId, ev.startFrame)) continue;
          }

          matches.push({
            frame: ev.startFrame,
            sourceOwnerId: ev.ownerId,
            sourceSkillName: ev.name,
          });
        }
      }
    }
  }

  // Deduplicate by frame (if multiple clauses match the same frame)
  const seen = new Set<number>();
  return matches.filter(m => {
    if (seen.has(m.frame)) return false;
    seen.add(m.frame);
    return true;
  }).sort((a, b) => a.frame - b.frame);
}

// ── Derive events ───────────────────────────────────────────────────────────

interface DeriveContext {
  events: TimelineEvent[];
  operatorId: string;
  operatorSlotId: string;
  potential: number;
  /** Maps operator ID (lowercase) → slot ID for cross-operator target resolution. */
  operatorSlotMap: Record<string, string>;
}

function deriveStatusEvents(
  def: StatusEventDef,
  ctx: DeriveContext,
  /** Only process triggers strictly after this frame (used for post-consumption re-derivation). */
  minTriggerFrame = -1,
  /** Pre-existing derived events to include in active stack count (consumed events with clamped durations). */
  priorDerived: TimelineEvent[] = [],
): TimelineEvent[] {
  const { events, operatorSlotId } = ctx;

  const duration = def.properties?.duration ?? def.duration;
  if (!duration) return [];
  const durationFrames = getDurationFrames(duration);
  const ownerId = resolveOwnerId(def.target, operatorSlotId, ctx.operatorSlotMap);
  const columnId = statusNameToColumnId(def.name);
  const maxStacks = getMaxStacks(def.stack.max, ctx.potential);

  const triggers = findTriggerMatches(def, events, operatorSlotId);
  if (triggers.length === 0) return [];

  // Check dedup: don't create if active (non-consumed) events already exist.
  // Prevents double-derivation when a status is reachable via both a triggerClause
  // and a threshold clause on another status. Consumed events are excluded so that
  // re-derivation after consumption can produce new stacks.
  if (events.some(ev =>
    ev.columnId === columnId && ev.eventStatus !== EventStatusType.CONSUMED
  )) return [];

  const derived: TimelineEvent[] = [];
  let idCounter = 0;

  for (const trigger of triggers) {
    // Skip triggers at or before the minimum frame (for post-consumption re-derivation)
    if (trigger.frame <= minTriggerFrame) continue;

    // Enforce max stack cap: count active events from both prior (consumed) and new derived
    const allDerived = [...priorDerived, ...derived];
    const activeAtFrame = allDerived.filter(ev => {
      const end = ev.startFrame + ev.activationDuration;
      return ev.startFrame <= trigger.frame && trigger.frame < end;
    }).length;
    if (activeAtFrame >= maxStacks) continue;

    const evId = `${def.name.toLowerCase()}-${operatorSlotId}-${idCounter++}`;

    // For RESET stacks: clamp previous instances
    if (def.stack.verbType === 'RESET' && derived.length > 0) {
      const prev = derived[derived.length - 1];
      const prevEnd = prev.startFrame + prev.activationDuration;
      if (trigger.frame < prevEnd) {
        derived[derived.length - 1] = {
          ...prev,
          activationDuration: trigger.frame - prev.startFrame,
          eventStatus: EventStatusType.REFRESHED,
          eventStatusOwnerId: trigger.sourceOwnerId,
          eventStatusSkillName: trigger.sourceSkillName,
        };
      }
    }

    derived.push({
      id: evId,
      name: def.name,
      ownerId,
      columnId,
      startFrame: trigger.frame,
      activationDuration: durationFrames,
      activeDuration: 0,
      cooldownDuration: 0,
      sourceOwnerId: operatorSlotId,
      sourceSkillName: trigger.sourceSkillName,
    });
  }

  return derived;
}

// ── Stack threshold evaluation ──────────────────────────────────────────────

function evaluateThresholdClauses(
  def: StatusEventDef,
  derivedEvents: TimelineEvent[],
  ctx: DeriveContext,
): TimelineEvent[] {
  if (!def.clause || def.clause.length === 0) return [];

  const maxStacks = getMaxStacks(def.stack.max, ctx.potential);
  const thresholdDerived: TimelineEvent[] = [];
  let idCounter = 0;

  for (const clause of def.clause) {
    // Check for HAVE STACKS EXACTLY MAX condition
    const stackCond = clause.conditions.find(c =>
      c.subjectType === 'THIS_EVENT' && c.verbType === 'HAVE' && c.objectType === 'STACKS'
    );
    if (!stackCond) continue;

    const targetCount = stackCond.cardinality === 'MAX' ? maxStacks : Number(stackCond.cardinality);

    // Find frames where the stack count crosses the threshold
    const allStatusEvents = [...ctx.events, ...derivedEvents]
      .filter(ev => ev.columnId === statusNameToColumnId(def.name) && ev.ownerId === resolveOwnerId(def.target, ctx.operatorSlotId, ctx.operatorSlotMap))
      .sort((a, b) => a.startFrame - b.startFrame);

    for (const ev of allStatusEvents) {
      // Count active stacks at this event's start frame (including itself)
      let activeCount = 0;
      let countWithout = 0;
      for (const other of allStatusEvents) {
        const otherEnd = other.startFrame + other.activationDuration;
        if (other.startFrame <= ev.startFrame && ev.startFrame < otherEnd) {
          activeCount++;
          if (other.id !== ev.id) countWithout++;
        }
      }

      if (activeCount < targetCount) continue;
      if (countWithout >= targetCount) continue; // already at threshold before this event

      // Execute clause effects
      for (const effect of clause.effects) {
        if (effect.verbType === 'APPLY' && effect.objectType === 'STATUS' && effect.objectId) {
          // Find the target status definition to get its properties
          const targetStatusName = effect.objectId;

          // Look for the target status def in the same operator's statusEvents
          const json = getOperatorJson(ctx.operatorId);
          const targetDef = (json?.statusEvents as StatusEventDef[] ?? [])
            .find(d => d.name === targetStatusName);

          // Resolve owner from the target def's own target field (authoritative),
          // falling back to the clause's toObjectType
          const targetField = targetDef?.target ?? effect.toObjectType;
          const targetOwnerId = resolveOwnerId(targetField ?? 'THIS_OPERATOR', ctx.operatorSlotId, ctx.operatorSlotMap);

          const targetDuration = targetDef
            ? (targetDef.properties?.duration ?? targetDef.duration)
            : undefined;
          const duration = targetDuration
            ? getDurationFrames(targetDuration)
            : 2400; // fallback 20s

          const targetColumnId = statusNameToColumnId(targetStatusName);

          // Refresh: clamp previous instances of the target status
          if (thresholdDerived.length > 0) {
            const prev = thresholdDerived[thresholdDerived.length - 1];
            const prevEnd = prev.startFrame + prev.activationDuration;
            if (ev.startFrame < prevEnd && prev.columnId === targetColumnId) {
              thresholdDerived[thresholdDerived.length - 1] = {
                ...prev,
                activationDuration: ev.startFrame - prev.startFrame,
                eventStatus: EventStatusType.REFRESHED,
                eventStatusOwnerId: ctx.operatorSlotId,
                eventStatusSkillName: def.name,
              };
            }
          }

          thresholdDerived.push({
            id: `${targetStatusName.toLowerCase()}-${ctx.operatorSlotId}-${idCounter++}`,
            name: targetStatusName,
            ownerId: targetOwnerId,
            columnId: targetColumnId,
            startFrame: ev.startFrame,
            activationDuration: duration,
            activeDuration: 0,
            cooldownDuration: 0,
            sourceOwnerId: ctx.operatorSlotId,
            sourceSkillName: def.name,
          });
        }
      }
    }
  }

  return thresholdDerived;
}

// ── Consume clause evaluation ───────────────────────────────────────────────

/**
 * Evaluate consumeClause on a status definition. When conditions are met
 * (e.g. PERFORM BATTLE_SKILL while at MAX stacks), clamp all active derived
 * events at the consumption frame, freeing up stack slots for re-accumulation.
 *
 * Mutates `derivedEvents` in place (shortens activationDuration).
 * Returns the frames at which consumption occurred (for downstream use).
 */
function evaluateConsumeClauses(
  def: StatusEventDef,
  derivedEvents: TimelineEvent[],
  ctx: DeriveContext,
): number[] {
  if (!def.consumeClause || def.consumeClause.length === 0) return [];

  const maxStacks = getMaxStacks(def.stack.max, ctx.potential);
  const consumeFrames: number[] = [];
  const columnId = statusNameToColumnId(def.name);
  const ownerId = resolveOwnerId(def.target, ctx.operatorSlotId, ctx.operatorSlotMap);

  for (const clause of def.consumeClause) {
    // Find PERFORM conditions to scan for trigger events
    const performConds = clause.conditions.filter(c => c.verbType === 'PERFORM');
    const stackConds = clause.conditions.filter(c =>
      c.subjectType === 'THIS_EVENT' && c.verbType === 'HAVE' && c.objectType === 'STACKS'
    );
    if (performConds.length === 0) continue;

    const performCond = performConds[0];
    const matchingColumn = performCond.objectType === 'BATTLE_SKILL' ? 'battle'
      : performCond.objectType === 'COMBO_SKILL' ? 'combo'
      : performCond.objectType === 'ULTIMATE' ? 'ultimate'
      : performCond.objectType;

    // Check if effects include CONSUME ALL_STACKS
    const consumeAll = clause.effects.some(e =>
      e.verbType === 'CONSUME' && e.objectType === 'ALL_STACKS'
    );
    if (!consumeAll) continue;

    // Scan input events for matching skill casts
    for (const ev of ctx.events) {
      if (ev.ownerId !== ctx.operatorSlotId) continue;
      if (ev.columnId !== matchingColumn) continue;

      // Check stack condition: count stacks that were active BEFORE this trigger.
      // A trigger that successfully created an MF should not also consume — only
      // triggers that were blocked by the max cap should consume.
      if (stackConds.length > 0) {
        const stackCond = stackConds[0];
        const targetCount = stackCond.cardinality === 'MAX' ? maxStacks : Number(stackCond.cardinality);

        // Count active stacks from derived events EXCLUDING any created at this exact frame
        // by this trigger (those were just added, not pre-existing)
        const preExistingCount = derivedEvents.filter(d =>
          d.columnId === columnId &&
          d.ownerId === ownerId &&
          d.startFrame < ev.startFrame &&
          ev.startFrame < d.startFrame + d.activationDuration
        ).length;

        if (stackCond.cardinalityConstraint === 'EXACTLY' && preExistingCount !== targetCount) continue;
        if (stackCond.cardinalityConstraint === 'AT_LEAST' && preExistingCount < targetCount) continue;
      }

      // Consume: clamp all active derived events at this frame
      for (const d of derivedEvents) {
        if (d.columnId !== columnId || d.ownerId !== ownerId) continue;
        const end = d.startFrame + d.activationDuration;
        if (d.startFrame <= ev.startFrame && ev.startFrame < end) {
          d.activationDuration = ev.startFrame - d.startFrame;
          d.eventStatus = EventStatusType.CONSUMED;
          d.eventStatusOwnerId = ev.ownerId;
          d.eventStatusSkillName = ev.name;
        }
      }

      consumeFrames.push(ev.startFrame);
    }
  }

  return consumeFrames;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Operator IDs for which the engine handles status derivation (others use legacy code). */
const ENGINE_HANDLED_OPERATORS = new Set(['gilberta', 'laevatain']);

/**
 * Run the generic status derivation engine for all operators present in the timeline.
 * Returns the events array with derived status events appended.
 */
export function deriveStatusesFromEngine(
  events: TimelineEvent[],
  loadoutStats?: Record<string, LoadoutStats>,
): TimelineEvent[] {
  let result = [...events];

  // Build operator ID → slot ID map for cross-operator target resolution
  const operatorSlotMap: Record<string, string> = {};
  for (const opId of Array.from(ENGINE_HANDLED_OPERATORS)) {
    const slot = findOperatorSlot(result, opId);
    if (slot) operatorSlotMap[opId] = slot;
  }
  // Also scan all operator JSONs (not just engine-handled) for slot mapping
  for (const opId of getAllOperatorIds()) {
    if (operatorSlotMap[opId]) continue;
    const slot = findOperatorSlot(result, opId);
    if (slot) operatorSlotMap[opId] = slot;
  }

  for (const operatorId of Array.from(ENGINE_HANDLED_OPERATORS)) {
    const json = getOperatorJson(operatorId);
    if (!json?.statusEvents) continue;

    const slotId = findOperatorSlot(result, operatorId);
    if (!slotId) continue;

    const stats = loadoutStats?.[slotId];
    const potential = stats?.potential ?? 0;

    const defs = json.statusEvents as StatusEventDef[];
    for (const def of defs) {
      // Check talent level requirement
      if (def.minTalentLevel) {
        const talentLevel = def.minTalentLevel.talent === 1
          ? (stats?.talentOneLevel ?? 0)
          : (stats?.talentTwoLevel ?? 0);
        if (talentLevel < def.minTalentLevel.minLevel) continue;
      }

      const ctx: DeriveContext = {
        events: result,
        operatorId,
        operatorSlotId: slotId,
        potential,
        operatorSlotMap,
      };

      const derived = deriveStatusEvents(def, ctx);

      // Evaluate consume clauses — mutates derived events (clamps durations)
      const consumeFrames = evaluateConsumeClauses(def, derived, ctx);

      // After consumption, re-derive to fill new stacks from triggers after each consume point.
      if (consumeFrames.length > 0) {
        const earliestConsume = Math.min(...consumeFrames);
        const reDerived = deriveStatusEvents(def, ctx, earliestConsume, derived);

        // Recursively handle additional consume cycles in re-derived events
        const reConsumeFrames = evaluateConsumeClauses(def, reDerived, ctx);
        if (reConsumeFrames.length > 0) {
          const nextConsume = Math.min(...reConsumeFrames);
          const reReDerived = deriveStatusEvents(
            def, ctx, nextConsume, [...derived, ...reDerived],
          );
          reDerived.push(...reReDerived);
        }

        derived.push(...reDerived);
      }

      const thresholdDerived = evaluateThresholdClauses(def, derived, ctx);
      result = [...result, ...derived, ...thresholdDerived];
    }
  }

  return result;
}
