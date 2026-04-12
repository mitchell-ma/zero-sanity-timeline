// ── Clause/predicate types (DSL v2) ──────────────────────────────────────────

import { EventFrameType } from "../../consts/enums";

/** A condition within a frame clause predicate. */
export interface FrameCondition {
  subjectDeterminer?: string;
  subject: string;
  verb: string;
  negated?: boolean;
  objectQualifier?: string;
  object?: string;
  objectId?: string;
  /** Determiner on the object side (THIS / TRIGGER / SOURCE / etc.) — used by
   * entity-equality checks like `THIS OPERATOR IS TRIGGER OPERATOR`. */
  objectDeterminer?: string;
  cardinalityConstraint?: string;
  value?: unknown;
  with?: Record<string, unknown>;
  /** OF — possessor chain (e.g. STACKS OF CRYO INFLICTION STATUS OF ENEMY). */
  of?: import('../../dsl/semantics').OfClause;
}

/**
 * A single effect within a clause predicate. After Phase 0d, the only shape
 * is `{ type: 'dsl', dslEffect: Effect }` — every effect routes through
 * `interpret()` and downstream consumers read clause data via the
 * `clauseQueries` helpers (`findDealDamageInClauses`, etc.).
 */
export interface FrameClauseEffect {
  type: 'dsl';
  dslEffect?: import('../../dsl/semantics').Effect;
}

/** A predicate: conditions (AND'd) → effects. Empty conditions = unconditional. */
export interface FrameClausePredicate {
  conditions: FrameCondition[];
  effects: FrameClauseEffect[];
}

/** A single damage tick within a skill sequence. */
export abstract class SkillEventFrame {
  /** Offset in seconds from the start of the parent sequence. */
  abstract getOffsetSeconds(): number;

  /** Element of damage dealt by this frame (for coloring), or null. */
  getDamageElement(): string | null { return null; }

  /** Whether this frame duplicates the source infliction that triggered it. */
  getDuplicateTriggerSource(): boolean { return false; }

  /** Frame clauses (DSL v2): conditional and unconditional effect groups. */
  getClauses(): readonly FrameClausePredicate[] { return []; }

  /** Clause evaluation mode: 'FIRST_MATCH' stops after first matching conditional clause; default is 'ALL'. */
  getClauseType(): string | undefined { return undefined; }

  /** Frame dependency types. */
  getDependencyTypes(): readonly string[] { return []; }

  /** Frame-level perform action types (FINAL_STRIKE, FINISHER, DIVE) parsed from clauses. */
  getFrameTypes(): readonly EventFrameType[] { return []; }

  /** Whether this frame scored a critical hit (runtime state for simulation mode). */
  isCrit = false;

  /** Convert to a view-layer EventFrameMarker. */
  toMarker(fps: number): import('../../consts/viewTypes').EventFrameMarker {
    const marker: import('../../consts/viewTypes').EventFrameMarker = {
      offsetFrame: Math.round(this.getOffsetSeconds() * fps),
    };
    const dmgEl = this.getDamageElement();
    if (dmgEl) marker.damageElement = dmgEl;
    if (this.getDuplicateTriggerSource()) marker.duplicateTriggerSource = true;
    const clauses = this.getClauses();
    if (clauses.length > 0) {
      marker.clauses = clauses as FrameClausePredicate[];
      const ct = this.getClauseType();
      if (ct) marker.clauseType = ct;
    }
    const deps = this.getDependencyTypes();
    if (deps.length > 0) marker.dependencyTypes = [...deps];
    const fts = this.getFrameTypes();
    if (fts.length > 0) marker.frameTypes = [...fts];
    return marker;
  }
}
