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
 * `values` is the parsed `with.value` — a per-skill-level array (12 entries
 * when parser-provided from a `VARY_BY SKILL_LEVEL` array) or a single-element
 * array `[N]` when the value comes from a runtime-attached clause
 * (Crush/Breach/Shatter/Lift) or from a constant `IS` literal. Compound
 * expressions (`MULT`/`ADD` of VARY_BY subtrees) and VARY_BY axes other than
 * SKILL_LEVEL use `valueNode` instead — resolved at the calc site with the
 * appropriate context. Named after the DSL key `with.value` (distinct from
 * `with.multiplier`, which is a separate DSL preposition).
 */
export interface DealDamageInfo {
  element?: string;
  values: number[];
  mainStat?: DamageScalingStatType;
  valueNode?: unknown;
  /**
   * True when this DEAL DAMAGE was found in the CHANCE hit branch (effects/predicates).
   * The damage builder skips this row when shouldFireChance returns false (miss).
   */
  insideChance?: boolean;
  /**
   * True when this DEAL DAMAGE was found in the CHANCE else branch (elseEffects).
   * The damage builder skips this row when shouldFireChance returns true (hit).
   */
  insideChanceElse?: boolean;
}

/**
 * Policy helper — decides whether a CHANCE-wrapped effect should fire given
 * the active crit mode and the per-frame pin. Used by the interpretor to
 * choose between hit / else branches and by the damage builder to gate
 * CHANCE-wrapped damage rows.
 *
 * An explicit pin ALWAYS wins — settable and honored in any mode.
 * The mode only provides the default for unpinned frames:
 *   ALWAYS  — unpinned default: hit
 *   NEVER / MANUAL / EXPECTED — unpinned default: miss
 */
export function shouldFireChance(
  critMode: CritMode,
  pin: boolean | undefined,
): boolean {
  if (pin != null) return pin;
  if (critMode === CritMode.ALWAYS) return true;
  return false;
}

/**
 * Sum the resolved value of every clause effect matching the given verb set
 * and object. Descends into CHANCE/ALL/ANY compound wrappers so effects
 * nested inside compounds are visible to all clause query helpers.
 * For CHANCE, `chanceHit` selects which branch (true=hit, false=else,
 * undefined=all).
 */
function sumVerbObject(
  clauses: readonly FrameClausePredicate[] | undefined,
  verbs: ReadonlySet<string>,
  object: string,
  ctx: ValueResolutionContext,
  chanceHit?: boolean,
): number | undefined {
  if (!clauses || clauses.length === 0) return undefined;
  let total = 0;
  let found = false;
  for (const pred of clauses) {
    for (const ef of pred.effects) {
      const dsl = ef.dslEffect as Effect | undefined;
      if (!dsl) continue;
      const r = sumEffectTree(dsl, verbs, object, ctx, chanceHit);
      if (r != null) { total += r; found = true; }
    }
  }
  return found ? total : undefined;
}

/** Recursively walk an effect tree summing matching verb+object leaves. */
function sumEffectTree(
  dsl: Effect,
  verbs: ReadonlySet<string>,
  object: string,
  ctx: ValueResolutionContext,
  chanceHit?: boolean,
): number | null {
  // Compound wrappers: descend into children
  if (dsl.verb === VerbType.CHANCE || dsl.verb === VerbType.ALL || dsl.verb === VerbType.ANY) {
    let total = 0;
    let found = false;
    const add = (child: Effect) => {
      const r = sumEffectTree(child, verbs, object, ctx, chanceHit);
      if (r != null) { total += r; found = true; }
    };
    const isChance = dsl.verb === VerbType.CHANCE;
    // Hit branch (effects + predicates): skip when chanceHit === false
    if (!isChance || chanceHit !== false) {
      for (const child of dsl.effects ?? []) add(child);
      for (const pred of dsl.predicates ?? []) {
        for (const child of pred.effects) add(child as Effect);
      }
    }
    // Else branch: skip when chanceHit === true
    if (isChance && chanceHit !== true) {
      for (const child of dsl.elseEffects ?? []) add(child);
    }
    return found ? total : null;
  }
  // Leaf: check verb + object match
  if (!verbs.has(dsl.verb as string) || dsl.object !== object) return null;
  const node = (dsl.with as { value?: ValueNode } | undefined)?.value;
  if (node == null) return null;
  const v = typeof node === 'number' ? node : resolveValueNode(node as ValueNode, ctx);
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
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

/** True when any clause effect on this frame is a RECOVER/RETURN SKILL_POINT (descends into compounds). */
export function hasSkillPointClause(
  clauses: readonly FrameClausePredicate[] | undefined,
): boolean {
  if (!clauses) return false;
  for (const pred of clauses) {
    for (const ef of pred.effects) {
      const dsl = ef.dslEffect as Effect | undefined;
      if (!dsl) continue;
      if (effectContainsVerbObject(dsl, RECOVER_VERBS, NounType.SKILL_POINT)) return true;
    }
  }
  return false;
}

/** Recursively check if an effect tree contains a matching verb+object leaf. */
function effectContainsVerbObject(dsl: Effect, verbs: ReadonlySet<string>, object: string): boolean {
  if (verbs.has(dsl.verb as string) && dsl.object === object) return true;
  if (dsl.verb === VerbType.CHANCE || dsl.verb === VerbType.ALL || dsl.verb === VerbType.ANY) {
    for (const child of dsl.effects ?? []) { if (effectContainsVerbObject(child, verbs, object)) return true; }
    for (const pred of dsl.predicates ?? []) {
      for (const child of pred.effects) { if (effectContainsVerbObject(child as Effect, verbs, object)) return true; }
    }
    if (dsl.verb === VerbType.CHANCE) {
      for (const child of dsl.elseEffects ?? []) { if (effectContainsVerbObject(child, verbs, object)) return true; }
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
/**
 * @param chanceHit When defined, selects the CHANCE branch to search:
 *   true → hit branch only (predicates/effects), false → else branch only.
 *   undefined → returns the first DEAL DAMAGE found in any branch.
 */
export function findDealDamageInClauses(
  clauses: readonly FrameClausePredicate[] | undefined,
  chanceHit?: boolean,
): DealDamageInfo | null {
  if (!clauses || clauses.length === 0) return null;
  for (const pred of clauses) {
    for (const ef of pred.effects) {
      const dsl = ef.dslEffect as Effect | undefined;
      if (!dsl) continue;
      const found = extractDealDamageFromEffect(dsl, ChanceBranch.NONE, chanceHit);
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
const enum ChanceBranch { NONE, HIT, ELSE }

function extractDealDamageFromEffect(
  dsl: Effect,
  chanceBranch = ChanceBranch.NONE,
  preferBranch?: boolean,
): DealDamageInfo | null {
  if (dsl.verb === VerbType.CHANCE) {
    // When caller specifies a branch preference, only walk that branch.
    // undefined = walk all branches (first match wins).
    if (preferBranch !== false) {
      for (const child of dsl.effects ?? []) {
        const res = extractDealDamageFromEffect(child, ChanceBranch.HIT, preferBranch);
        if (res) return res;
      }
      for (const pred of dsl.predicates ?? []) {
        for (const child of pred.effects) {
          const res = extractDealDamageFromEffect(child as Effect, ChanceBranch.HIT, preferBranch);
          if (res) return res;
        }
      }
    }
    if (preferBranch !== true) {
      for (const child of dsl.elseEffects ?? []) {
        const res = extractDealDamageFromEffect(child, ChanceBranch.ELSE, preferBranch);
        if (res) return res;
      }
    }
    return null;
  }
  if (dsl.verb === VerbType.ALL || dsl.verb === VerbType.ANY) {
    for (const child of dsl.effects ?? []) {
      const res = extractDealDamageFromEffect(child, chanceBranch);
      if (res) return res;
    }
    for (const pred of dsl.predicates ?? []) {
      for (const child of pred.effects) {
        const res = extractDealDamageFromEffect(child as Effect, chanceBranch);
        if (res) return res;
      }
    }
    return null;
  }
  if (dsl.verb !== VerbType.DEAL || dsl.object !== NounType.DAMAGE) return null;

  const wp = dsl.with as { value?: unknown; mainStat?: { objectId?: string } } | undefined;
  const withValue = wp?.value as
    | { verb?: string; object?: string; value?: number | number[]; operation?: string }
    | undefined;
  const elementQualifier = dsl.objectQualifier && ELEMENT_QUALIFIERS.has(dsl.objectQualifier as string)
    ? (dsl.objectQualifier as string) : undefined;
  const mainStat = wp?.mainStat?.objectId as DamageScalingStatType | undefined;

  let values: number[] = [];
  let valueNode: unknown = undefined;
  if (withValue != null) {
    if (Array.isArray(withValue.value)) {
      // VARY_BY SKILL_LEVEL is the one axis the damage builder already has
      // its `skillLevel` plumbed for — flatten it so callers can read
      // `values[skillLevel-1]` directly and tests can assert on the table.
      // Every other VARY_BY axis (TALENT_LEVEL, POTENTIAL, STACKS, …) goes
      // through the runtime resolver: those need the caller's
      // ValueResolutionContext (potential, talentSlot → talentLevel, etc.),
      // which the fast-path doesn't provide.
      if (withValue.verb === VerbType.VARY_BY && withValue.object && withValue.object !== NounType.SKILL_LEVEL) {
        valueNode = withValue;
      } else {
        values = withValue.value as number[];
      }
    } else if (typeof withValue.value === 'number') {
      values = [withValue.value];
    } else if (withValue.operation) {
      valueNode = withValue;
    } else if (withValue.verb === 'IS' && typeof withValue.value === 'number') {
      values = [withValue.value];
    }
  }

  return {
    ...(elementQualifier ? { element: elementQualifier } : {}),
    values,
    ...(mainStat ? { mainStat } : {}),
    ...(values.length === 0 && valueNode ? { valueNode } : {}),
    ...(chanceBranch === ChanceBranch.HIT ? { insideChance: true } : {}),
    ...(chanceBranch === ChanceBranch.ELSE ? { insideChanceElse: true } : {}),
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
    for (const child of dsl.elseEffects ?? []) {
      if (effectContainsDealDamage(child)) return true;
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
