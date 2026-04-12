/**
 * Read-only helpers for inspecting frame-level DSL clauses without going
 * through the interpreter. Used by view-layer components and registry caches
 * that need to display the resolved numeric value of a clause effect (e.g.
 * "Gauge Gain: +18") instead of executing it.
 *
 * Source of truth is always `frame.clauses` — these helpers replace the
 * deprecated `frame.ultimateEnergyGain` cache field.
 */
import { NounType, VerbType, AdjectiveType } from '../../dsl/semantics';
import type { Effect, ValueNode } from '../../dsl/semantics';
import type { FrameClausePredicate, FrameClauseEffect } from '../../model/event-frames/skillEventFrame';
import { CritMode, type DamageScalingStatType } from '../../consts/enums';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT, type ValueResolutionContext } from '../calculation/valueResolver';

/**
 * Resolved DEAL DAMAGE info reconstructed from a clause set. This is the
 * shape every damage-calc consumer (`damageTableBuilder`, `calculationController`,
 * `frameCalculator`, view layer) expects when asking "does this frame deal
 * damage, and if so, with what element / multipliers / scaling stat?".
 *
 * `multipliers` is a per-skill-level array (12 entries when parser-provided
 * from a `VARY_BY SKILL_LEVEL` array) or a single-element array `[N]` when
 * the value comes from a runtime-attached clause (Crush/Breach/Shatter/Lift)
 * or from a constant `IS` literal. Compound expressions (`MULT`/`ADD` of
 * VARY_BY subtrees) use `multiplierNode` instead — resolved at the calc site.
 */
export interface DealDamageInfo {
  element?: string;
  multipliers: number[];
  mainStat?: DamageScalingStatType;
  multiplierNode?: unknown;
  /**
   * True when this DEAL DAMAGE was found nested inside a CHANCE compound. The
   * damage builder gates row emission on the frame's `isChance` pin (via
   * `shouldFireChance`) when this flag is set. The probability ValueNode on
   * the CHANCE wrapper is display-only and does NOT weight the damage.
   */
  insideChance?: boolean;
}

/**
 * Policy helper — decides whether a CHANCE-wrapped effect should fire given
 * the active crit mode and the per-frame pin. Used by the interpretor to
 * choose between hit / else branches and by the damage builder to gate
 * CHANCE-wrapped damage rows.
 *
 *   ALWAYS  — always hit
 *   NEVER   — always miss
 *   MANUAL  — per-frame pin, default miss when unpinned
 *   EXPECTED — same as MANUAL (CHANCE is not expectation-weighted; the
 *              EXPECTED mode has no special behavior for CHANCE)
 */
export function shouldFireChance(
  critMode: CritMode,
  pin: boolean | undefined,
): boolean {
  if (critMode === CritMode.ALWAYS) return true;
  if (critMode === CritMode.NEVER) return false;
  return pin ?? false;
}

/**
 * Sum the resolved value of every clause effect matching the given verb set
 * and object. Used by both RECOVER/RETURN resource queries and DEAL STAGGER.
 */
function sumVerbObject(
  clauses: readonly FrameClausePredicate[] | undefined,
  verbs: ReadonlySet<string>,
  object: string,
  ctx: ValueResolutionContext,
): number | undefined {
  if (!clauses || clauses.length === 0) return undefined;
  let total = 0;
  let found = false;
  for (const pred of clauses) {
    for (const ef of pred.effects) {
      const dsl = ef.dslEffect as Effect | undefined;
      if (!dsl) continue;
      if (!verbs.has(dsl.verb as string) || dsl.object !== object) continue;
      const node = (dsl.with as { value?: ValueNode } | undefined)?.value;
      if (node == null) continue;
      const v = typeof node === 'number' ? node : resolveValueNode(node as ValueNode, ctx);
      if (typeof v === 'number' && !Number.isNaN(v)) {
        total += v;
        found = true;
      }
    }
  }
  return found ? total : undefined;
}

const RECOVER_VERBS: ReadonlySet<string> = new Set([VerbType.RECOVER, VerbType.RETURN]);
const DEAL_VERBS: ReadonlySet<string> = new Set([VerbType.DEAL]);

function sumRecoverObject(
  clauses: readonly FrameClausePredicate[] | undefined,
  object: string,
  ctx: ValueResolutionContext,
): number | undefined {
  return sumVerbObject(clauses, RECOVER_VERBS, object, ctx);
}

/**
 * Find the resolved RECOVER/RETURN ULTIMATE_ENERGY value on a clause set.
 * Returns the summed value across all matching clause effects, or undefined
 * when no UE clause is present. Conditional clauses are NOT filtered — the
 * caller is responsible for choosing the right context.
 */
export function findUltimateEnergyGainInClauses(
  clauses: readonly FrameClausePredicate[] | undefined,
  ctx: ValueResolutionContext = DEFAULT_VALUE_CONTEXT,
): number | undefined {
  return sumRecoverObject(clauses, NounType.ULTIMATE_ENERGY, ctx);
}

/**
 * Find the resolved RECOVER/RETURN SKILL_POINT value on a clause set.
 * Returns the summed value across all matching clause effects, or undefined
 * when no SP clause is present.
 */
export function findSkillPointRecoveryInClauses(
  clauses: readonly FrameClausePredicate[] | undefined,
  ctx: ValueResolutionContext = DEFAULT_VALUE_CONTEXT,
): number | undefined {
  return sumRecoverObject(clauses, NounType.SKILL_POINT, ctx);
}

/** True when any clause effect on this frame is a RECOVER/RETURN SKILL_POINT. */
export function hasSkillPointClause(
  clauses: readonly FrameClausePredicate[] | undefined,
): boolean {
  if (!clauses) return false;
  for (const pred of clauses) {
    for (const ef of pred.effects) {
      const dsl = ef.dslEffect as Effect | undefined;
      if (!dsl) continue;
      if ((dsl.verb === VerbType.RECOVER || dsl.verb === VerbType.RETURN)
        && dsl.object === NounType.SKILL_POINT) return true;
    }
  }
  return false;
}

// ── Generic verb+object query / parser ────────────────────────────────────

/**
 * Wrap raw JSON clause predicates (from `JsonSkillCategory.clause` or any
 * other top-level clause source) into the unified `FrameClausePredicate`
 * shape so loader-time metadata extractors share the same query helpers as
 * runtime frame-clause consumers. The conversion is a cheap cast: every
 * raw `JsonEffect` becomes `{ type: 'dsl', dslEffect: e }`.
 *
 * This replaces the legacy `flattenClauseEffects` / `findValue` /
 * `findEffectValue` / `withValue` helpers that previously lived in
 * `dataDrivenEventFrames.ts` — those walked raw JSON directly, so we had
 * two parallel value-query APIs. Now there is one.
 */
export function parseJsonClauseArray(
  clause: { conditions?: unknown[]; effects?: unknown[] }[] | undefined,
): FrameClausePredicate[] {
  if (!clause || clause.length === 0) return [];
  const out: FrameClausePredicate[] = [];
  for (const pred of clause) {
    const effects: FrameClauseEffect[] = [];
    for (const ef of (pred.effects ?? [])) {
      effects.push({ type: 'dsl', dslEffect: ef as unknown as Effect });
    }
    out.push({ conditions: (pred.conditions ?? []) as FrameClausePredicate['conditions'], effects });
  }
  return out;
}

/** Map dsl `to` + `toDeterminer` onto the legacy target labels. */
function dslTargetLabel(to?: string, toDeterminer?: string): string | undefined {
  if (to === NounType.TEAM) return 'TEAM';
  if (to === NounType.OPERATOR) return toDeterminer === 'ALL' ? 'TEAM' : 'SELF';
  if (to === NounType.ENEMY) return 'ENEMY';
  return undefined;
}

/**
 * Find the first clause effect matching `verb + object` (optionally filtered
 * by target label `SELF` / `TEAM` / `ENEMY`) and return its resolved numeric
 * value. Returns `undefined` when nothing matches. Used by loader-time
 * metadata extractors (cooldowns, SP costs, energy costs) that need a
 * single scalar out of a parsed skill category clause.
 *
 * Unlike `sumVerbObject` (which sums all matches), this returns the first
 * match — matching the legacy `findValue` semantics the skill-level
 * extractors depend on.
 */
export function findFirstEffectValue(
  clauses: readonly FrameClausePredicate[] | undefined,
  verb: string,
  object: string,
  target?: string,
  ctx: ValueResolutionContext = DEFAULT_VALUE_CONTEXT,
): number | undefined {
  if (!clauses || clauses.length === 0) return undefined;
  for (const pred of clauses) {
    for (const ef of pred.effects) {
      const dsl = ef.dslEffect as Effect | undefined;
      if (!dsl || dsl.verb !== verb || dsl.object !== object) continue;
      if (target) {
        const label = dslTargetLabel(dsl.to as string | undefined, (dsl as unknown as { toDeterminer?: string }).toDeterminer);
        if (label !== target) continue;
      }
      const node = (dsl.with as { value?: ValueNode } | undefined)?.value;
      if (node == null) return 0;
      if (typeof node === 'number') return node;
      return resolveValueNode(node as ValueNode, ctx);
    }
  }
  return undefined;
}

/**
 * Build a synthetic, unconditional RECOVER SKILL_POINT clause predicate. Used
 * by event-update paths that need to reposition the final-strike SP gain onto
 * a different frame after a basic-attack chain is clamped.
 */
export function buildSkillPointRecoveryClause(amount: number): FrameClausePredicate {
  return {
    conditions: [],
    effects: [{
      type: 'dsl',
      dslEffect: {
        verb: VerbType.RECOVER,
        object: NounType.SKILL_POINT,
        with: { value: { verb: 'IS', value: amount } },
      } as unknown as Effect,
    }],
  };
}

/**
 * Find the resolved DEAL STAGGER value on a clause set. Returns the summed
 * value across all matching DEAL STAGGER clause effects, or undefined when no
 * stagger clause is present.
 */
export function findStaggerInClauses(
  clauses: readonly FrameClausePredicate[] | undefined,
  ctx: ValueResolutionContext = DEFAULT_VALUE_CONTEXT,
): number | undefined {
  return sumVerbObject(clauses, DEAL_VERBS, NounType.STAGGER, ctx);
}

/** True when any clause effect on this frame is a DEAL STAGGER. */
export function hasStaggerClause(
  clauses: readonly FrameClausePredicate[] | undefined,
): boolean {
  if (!clauses) return false;
  for (const pred of clauses) {
    for (const ef of pred.effects) {
      const dsl = ef.dslEffect as Effect | undefined;
      if (dsl?.verb === VerbType.DEAL && dsl.object === NounType.STAGGER) return true;
    }
  }
  return false;
}

/** Build a synthetic, unconditional DEAL STAGGER clause predicate. */
export function buildDealStaggerClause(amount: number): FrameClausePredicate {
  return {
    conditions: [],
    effects: [{
      type: 'dsl',
      dslEffect: {
        verb: VerbType.DEAL,
        object: NounType.STAGGER,
        with: { value: { verb: 'IS', value: amount } },
      } as unknown as Effect,
    }],
  };
}

/**
 * Strip every DEAL STAGGER clause from a clause set. Returns a new array;
 * does not mutate input. Used when programmatic stagger writes must replace
 * the existing value (e.g. physical-status arts-intensity recompute).
 */
export function stripStaggerClauses(
  clauses: readonly FrameClausePredicate[] | undefined,
): FrameClausePredicate[] | undefined {
  if (!clauses) return undefined;
  const out: FrameClausePredicate[] = [];
  for (const pred of clauses) {
    const filtered = pred.effects.filter(e => {
      const dsl = (e as { dslEffect?: { verb?: string; object?: string } }).dslEffect;
      return !(dsl?.verb === VerbType.DEAL && dsl.object === NounType.STAGGER);
    });
    if (filtered.length > 0) out.push({ ...pred, effects: filtered });
  }
  return out.length > 0 ? out : undefined;
}

const ELEMENT_QUALIFIERS = new Set<string>([
  AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE,
  AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL,
]);

/**
 * Find the DEAL DAMAGE info on a clause set. Returns null if no DEAL DAMAGE
 * clause is present. The first matching clause wins — historically frames
 * carry at most one DEAL DAMAGE effect.
 *
 * The shape returned matches the legacy `FrameDealDamage` cache exactly so
 * `damageTableBuilder` / `calculationController` consumers can read it
 * uniformly without caring whether the clause came from JSON parser
 * extraction or from a runtime-attached synthetic clause (Crush/Breach/etc.).
 */
export function findDealDamageInClauses(
  clauses: readonly FrameClausePredicate[] | undefined,
): DealDamageInfo | null {
  if (!clauses || clauses.length === 0) return null;
  for (const pred of clauses) {
    for (const ef of pred.effects) {
      const dsl = ef.dslEffect as Effect | undefined;
      if (!dsl) continue;
      // Descend into CHANCE wrappers: the wrapped DEAL DAMAGE inherits the
      // wrapper's probability as a chanceNode for the damage builder to resolve.
      const found = extractDealDamageFromEffect(dsl);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Walk an Effect tree looking for a DEAL DAMAGE leaf. Descends through CHANCE,
 * ALL, and ANY compound wrappers. When the DEAL DAMAGE is found nested inside
 * a CHANCE, the returned info carries `insideChance: true` so the damage
 * builder gates row emission on the frame's pin. Returns null if no DEAL
 * DAMAGE is found.
 */
function extractDealDamageFromEffect(
  dsl: Effect,
  insideChance = false,
): DealDamageInfo | null {
  if (dsl.verb === VerbType.CHANCE) {
    for (const child of dsl.effects ?? []) {
      const res = extractDealDamageFromEffect(child, true);
      if (res) return res;
    }
    return null;
  }
  if (dsl.verb === VerbType.ALL || dsl.verb === VerbType.ANY) {
    for (const child of dsl.effects ?? []) {
      const res = extractDealDamageFromEffect(child, insideChance);
      if (res) return res;
    }
    for (const pred of dsl.predicates ?? []) {
      for (const child of pred.effects) {
        const res = extractDealDamageFromEffect(child as Effect, insideChance);
        if (res) return res;
      }
    }
    return null;
  }
  if (dsl.verb !== VerbType.DEAL || dsl.object !== NounType.DAMAGE) return null;

  const wp = dsl.with as { value?: unknown; mainStat?: { objectId?: string } } | undefined;
  const valueNode = wp?.value as
    | { verb?: string; value?: number | number[]; operation?: string }
    | undefined;
  const elementQualifier = dsl.objectQualifier && ELEMENT_QUALIFIERS.has(dsl.objectQualifier as string)
    ? (dsl.objectQualifier as string) : undefined;
  const mainStat = wp?.mainStat?.objectId as DamageScalingStatType | undefined;

  let multipliers: number[] = [];
  let multiplierNode: unknown = undefined;
  if (valueNode != null) {
    if (Array.isArray(valueNode.value)) {
      multipliers = valueNode.value as number[];
    } else if (typeof valueNode.value === 'number') {
      multipliers = [valueNode.value];
    } else if (valueNode.operation) {
      multiplierNode = valueNode;
    } else if (valueNode.verb === 'IS' && typeof valueNode.value === 'number') {
      multipliers = [valueNode.value];
    }
  }

  return {
    ...(elementQualifier ? { element: elementQualifier } : {}),
    multipliers,
    ...(mainStat ? { mainStat } : {}),
    ...(multipliers.length === 0 && multiplierNode ? { multiplierNode } : {}),
    ...(insideChance ? { insideChance: true } : {}),
  };
}

/** True when any clause effect on this frame is a DEAL DAMAGE (including CHANCE-wrapped ones). */
export function hasDealDamageClause(
  clauses: readonly FrameClausePredicate[] | undefined,
): boolean {
  if (!clauses) return false;
  for (const pred of clauses) {
    for (const ef of pred.effects) {
      const dsl = ef.dslEffect as Effect | undefined;
      if (dsl && effectContainsDealDamage(dsl)) return true;
    }
  }
  return false;
}

function effectContainsDealDamage(dsl: Effect): boolean {
  if (dsl.verb === VerbType.DEAL && dsl.object === NounType.DAMAGE) return true;
  if (dsl.verb === VerbType.CHANCE || dsl.verb === VerbType.ALL || dsl.verb === VerbType.ANY) {
    for (const child of dsl.effects ?? []) {
      if (effectContainsDealDamage(child)) return true;
    }
    for (const pred of dsl.predicates ?? []) {
      for (const child of pred.effects) {
        if (effectContainsDealDamage(child as Effect)) return true;
      }
    }
  }
  return false;
}

/**
 * True when any clause effect on this frame is (or wraps) a CHANCE compound.
 * Used by the context menu to decide whether to show the "pin CHANCE" option,
 * and by the view layer to draw an indicator on the frame diamond.
 */
export function hasChanceClause(
  clauses: readonly FrameClausePredicate[] | undefined,
): boolean {
  if (!clauses) return false;
  for (const pred of clauses) {
    for (const ef of pred.effects) {
      const dsl = ef.dslEffect as Effect | undefined;
      if (!dsl) continue;
      if (effectContainsChance(dsl)) return true;
    }
  }
  return false;
}

function effectContainsChance(dsl: Effect): boolean {
  if (dsl.verb === VerbType.CHANCE) return true;
  if (dsl.verb === VerbType.ALL || dsl.verb === VerbType.ANY) {
    for (const child of dsl.effects ?? []) {
      if (effectContainsChance(child)) return true;
    }
    for (const pred of dsl.predicates ?? []) {
      for (const child of pred.effects) {
        if (effectContainsChance(child as Effect)) return true;
      }
    }
  }
  return false;
}

/**
 * Build a synthetic, unconditional DEAL DAMAGE clause predicate. Used by
 * runtime damage writers (Crush/Breach/Shatter/Lift) to attach a resolved
 * damage effect to a frame, and by tests that synthesize damage frames.
 */
export function buildDealDamageClause(opts: {
  multiplier: number;
  element?: string;
  mainStat?: DamageScalingStatType;
}): FrameClausePredicate {
  return {
    conditions: [],
    effects: [{
      type: 'dsl',
      dslEffect: {
        verb: VerbType.DEAL,
        object: NounType.DAMAGE,
        ...(opts.element ? { objectQualifier: opts.element } : {}),
        with: {
          value: { verb: 'IS', value: opts.multiplier },
          ...(opts.mainStat ? { mainStat: { objectId: opts.mainStat } } : {}),
        },
      } as unknown as Effect,
    }],
  };
}
