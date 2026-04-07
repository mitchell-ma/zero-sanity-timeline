import { EventFrameType, DamageScalingStatType } from "../../consts/enums";

// ── Clause/predicate types (DSL v2) ──────────────────────────────────────────

/** A condition within a frame clause predicate. */
export interface FrameCondition {
  subjectDeterminer?: string;
  subject: string;
  verb: string;
  negated?: boolean;
  objectQualifier?: string;
  object?: string;
  objectId?: string;
  cardinalityConstraint?: string;
  value?: unknown;
  with?: Record<string, unknown>;
  /** OF — possessor chain (e.g. STACKS OF CRYO INFLICTION STATUS OF ENEMY). */
  of?: import('../../dsl/semantics').OfClause;
}

/** Inline damage data from a DEAL DAMAGE effect. */
export interface FrameDealDamage {
  element?: string;          // "NATURE", "HEAT", etc.
  multipliers: number[];     // per skill level (12 entries) — empty for compound expressions
  mainStat?: DamageScalingStatType;
  /** Raw ValueNode for compound multiplier expressions (MULT, ADD, etc.).
   *  Resolved at damage-table-build time with full skill level + potential context. */
  multiplierNode?: unknown;
}

/** A single effect within a clause predicate. */
export interface FrameClauseEffect {
  type: 'dsl' | 'dealDamage' | 'recoverSP' | 'applyStagger';
  /** DSL effect routed through interpret(). */
  dslEffect?: import('../../dsl/semantics').Effect;
  /** Inline damage data (display-only, not engine-processed here). */
  dealDamage?: FrameDealDamage;
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

  /** Skill points recovered on this frame. */
  abstract getSkillPointRecovery(): number;

  /** Stagger damage dealt on this frame. */
  abstract getStagger(): number;

  /** Element of damage dealt by this frame (for coloring), or null. */
  getDamageElement(): string | null { return null; }

  /** Whether this frame duplicates the source infliction that triggered it. */
  getDuplicateTriggerSource(): boolean { return false; }

  /** Frame clauses (DSL v2): conditional and unconditional effect groups. */
  getClauses(): readonly FrameClausePredicate[] { return []; }

  /** Clause evaluation mode: 'FIRST_MATCH' stops after first matching conditional clause; default is 'ALL'. */
  getClauseType(): string | undefined { return undefined; }

  /** Inline DEAL DAMAGE data (element + per-level multiplier array), or null. */
  getDealDamage(): FrameDealDamage | null { return null; }

  /** Ultimate energy gained on this frame, or 0. */
  getUltimateEnergyGain(): number { return 0; }

  /** Frame dependency types. */
  getDependencyTypes(): readonly string[] { return []; }

  /** Frame-level perform action types (FINAL_STRIKE, FINISHER, DIVE) parsed from clauses. */
  getFrameTypes(): readonly EventFrameType[] { return []; }

  /** Whether this frame scored a critical hit (runtime state for simulation mode). */
  isCrit = false;

  /** Whether this frame deals damage. */
  hasDealDamage(): boolean { return this.getDealDamage() != null; }

  /** Whether this frame grants any skill points. */
  hasSkillPointRecovery(): boolean { return this.getSkillPointRecovery() > 0; }

  /** Whether this frame deals stagger damage. */
  hasStagger(): boolean { return this.getStagger() > 0; }

  /** Convert to a view-layer EventFrameMarker. */
  toMarker(fps: number): import('../../consts/viewTypes').EventFrameMarker {
    const marker: import('../../consts/viewTypes').EventFrameMarker = {
      offsetFrame: Math.round(this.getOffsetSeconds() * fps),
      skillPointRecovery: this.getSkillPointRecovery() || undefined,
      stagger: this.getStagger() || undefined,
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
    const dd = this.getDealDamage();
    if (dd) marker.dealDamage = dd;
    const gg = this.getUltimateEnergyGain();
    if (gg) marker.ultimateEnergyGain = gg;
    const ggNode = (this as { getUltimateEnergyGainNode?: () => import('../../dsl/semantics').ValueNode | undefined }).getUltimateEnergyGainNode?.();
    if (ggNode) marker.ultimateEnergyGainNode = ggNode;
    const deps = this.getDependencyTypes();
    if (deps.length > 0) marker.dependencyTypes = [...deps];
    const fts = this.getFrameTypes();
    if (fts.length > 0) marker.frameTypes = [...fts];
    return marker;
  }
}
