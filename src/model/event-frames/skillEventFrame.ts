import { ElementType, StatusType, TargetType } from "../../consts/enums";

/** Arts infliction applied by a frame tick. */
export interface FrameArtsInfliction {
  element: string;       // e.g. "HEAT", "CRYO"
  stacks: number;
}

/** Arts infliction absorbed by a frame tick (e.g. Scorching Heart). */
export interface FrameArtsAbsorption {
  element: string;       // e.g. "HEAT"
  stacks: number;        // max stacks absorbed
  exchangeStatus: StatusType;  // what the absorbed stacks convert into
  ratio: string;         // e.g. "1:1"
}

/** Arts infliction consumed by a frame tick (removed without exchange). */
export interface FrameArtsConsumption {
  element: string;       // e.g. "HEAT"
  stacks: number;        // max stacks consumed
}

/** Forced arts reaction applied by a frame tick (bypasses infliction stacks). */
export interface FrameForcedReaction {
  reaction: StatusType;  // e.g. COMBUSTION
  statusLevel: number;   // reaction intensity level
  durationFrames?: number; // override default reaction duration
}

/** Reaction consumed by a frame tick (e.g. Dolly Rush consuming Corrosion). */
export interface FrameReactionConsumption {
  columnId: string;       // reaction to consume (e.g. 'corrosion')
  applyStatus?: FrameApplyStatus;  // conditional status to apply if consumed
}

/** A segment within a multi-phase status (e.g. Focus → Empowered Focus). */
export interface StatusSegment {
  name: string;
  durationFrames: number;
  susceptibility?: Partial<Record<ElementType, readonly number[]>>;
}

/** Status applied by a frame tick to a target. */
export interface FrameApplyStatus {
  target: TargetType;          // SELF (e.g. Melting Flame) or ENEMY (e.g. Focus)
  status: string;              // StatusType or columnId — determines which column the event routes to
  stacks: number;              // stack count (for self-targeted statuses)
  durationFrames: number;      // duration in frames (for enemy-targeted statuses)
  susceptibility?: Partial<Record<ElementType, readonly number[]>>;  // ElementType → per-level bonus array (12 levels)
  /** How reapplication interacts with existing instances (e.g. 'RESET' refreshes the previous). */
  stackingInteraction?: string;
  /** Minimum operator potential required for this effect to apply. */
  potentialMin?: number;
  /** Maximum operator potential for this effect to apply (effect skipped if potential exceeds this). */
  potentialMax?: number;
  /** Multi-phase segments with per-segment susceptibility (e.g. Focus → Empowered Focus at P5). */
  segments?: StatusSegment[];
  /** Override event name (defaults to status). Use when the in-game name differs from the column. */
  eventName?: string;
  /** Specific operator ID when targeting a named operator (e.g. 'LAEVATAIN'). Resolved to slot ID at runtime. */
  targetOperatorId?: string;
}

// ── Clause/predicate types (DSL v2) ──────────────────────────────────────────

/** A condition within a frame clause predicate. */
export interface FrameCondition {
  subjectType: string;
  verbType: string;
  negated?: boolean;
  objectType?: string;
  objectId?: string;
  cardinalityConstraint?: string;
  cardinality?: number;
}

/** Inline damage data from a DEAL DAMAGE effect. */
export interface FrameDealDamage {
  element?: string;          // "NATURE", "HEAT", etc.
  multipliers: number[];     // per skill level (12 entries)
}

/** A single effect within a clause predicate. */
export interface FrameClauseEffect {
  type: 'consumeReaction' | 'applyStatus' | 'applyInfliction' | 'dealDamage' | 'recoverSP' | 'applyStagger';
  consumeReaction?: FrameReactionConsumption;
  applyStatus?: FrameApplyStatus;
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

  /** Arts infliction applied by this frame, or null. */
  getApplyArtsInfliction(): FrameArtsInfliction | null { return null; }

  /** Arts infliction absorbed by this frame, or null. */
  getAbsorbArtsInfliction(): FrameArtsAbsorption | null { return null; }

  /** Arts infliction consumed by this frame (removed without exchange), or null. */
  getConsumeArtsInfliction(): FrameArtsConsumption | null { return null; }

  /** Forced arts reaction applied by this frame, or null. */
  getApplyForcedReaction(): FrameForcedReaction | null { return null; }

  /** Status applied by this frame to a target, or null. */
  getApplyStatus(): FrameApplyStatus | null { return null; }

  /** All status applications by this frame (supports multiple conditional effects). */
  getApplyStatuses(): readonly FrameApplyStatus[] { return []; }

  /** Reaction consumed by this frame (e.g. Corrosion consumed by Dolly Rush), or null. */
  getConsumeReaction(): FrameReactionConsumption | null { return null; }

  /** Status consumed by this frame (e.g. Thunderlance consumed by ultimate), or null. */
  getConsumeStatus(): string | null { return null; }

  /** Element of damage dealt by this frame (for coloring), or null. */
  getDamageElement(): string | null { return null; }

  /** Whether this frame duplicates the source infliction that triggered it. */
  getDuplicatesSourceInfliction(): boolean { return false; }

  /** Frame clauses (DSL v2): conditional and unconditional effect groups. */
  getClauses(): readonly FrameClausePredicate[] { return []; }

  /** Inline DEAL DAMAGE data (element + per-level multiplier array), or null. */
  getDealDamage(): FrameDealDamage | null { return null; }

  /** Ultimate gauge gained on this frame, or 0. */
  getGaugeGain(): number { return 0; }

  /** Whether this frame grants any skill points. */
  hasSkillPointRecovery(): boolean { return this.getSkillPointRecovery() > 0; }

  /** Whether this frame deals stagger damage. */
  hasStagger(): boolean { return this.getStagger() > 0; }
}
