/**
 * SVO Semantic Grammar for the Event DSL.
 *
 * Every interaction in the system is a sentence: Subject → Verb → Object.
 * These types are the primitives for triggers, conditions, reactions, and effects.
 *
 * See src/model/eventSpec.md for the full specification.
 */

// ── Sentinels ───────────────────────────────────────────────────────────────

/** Sentinel value meaning "the potential-resolved maximum" for stack counts and cardinality. */
export const THRESHOLD_MAX = 'MAX' as const;

// ── Potential ───────────────────────────────────────────────────────────────

/** Potential level (P0 = no potential unlocked, P1-P5 = unlocked potentials). */
export enum PotentialType {
  P0 = "P0",
  P1 = "P1",
  P2 = "P2",
  P3 = "P3",
  P4 = "P4",
  P5 = "P5",
}

// ── Subject ─────────────────────────────────────────────────────────────────

/** Who is performing the action or being checked. */
export enum SubjectType {
  /** The operator who owns this event/status. */
  THIS_OPERATOR = "THIS_OPERATOR",
  /** Any single teammate (excludes this operator). */
  OTHER_OPERATOR = "OTHER_OPERATOR",
  /** All teammates except this operator. */
  OTHER_OPERATORS = "OTHER_OPERATORS",
  /** Entire team including this operator. */
  ALL_OPERATORS = "ALL_OPERATORS",
  /** The enemy target. */
  ENEMY = "ENEMY",
  /** Any entity (used for reactions triggered by anyone). */
  ANY = "ANY",
  /** The event/status that owns this clause — self-referential (e.g. "this event has MAX stacks"). */
  THIS_EVENT = "THIS_EVENT",
  /** System-initiated (threshold effects, passive triggers). */
  SYSTEM = "SYSTEM",
}

// ── Verb ────────────────────────────────────────────────────────────────────

export enum VerbType {
  // Action verbs
  /** Execute a skill or action. */
  PERFORM = "PERFORM",
  /** Execute all child effects as an atomic group. */
  PERFORM_ALL = "PERFORM_ALL",
  /** Apply a status, infliction, or reaction. */
  APPLY = "APPLY",
  /** Remove/use stacks. */
  CONSUME = "CONSUME",
  /** Take stacks and optionally convert them (see conversion field). */
  ABSORB = "ABSORB",
  /** Kill a target. */
  DEFEAT = "DEFEAT",
  /** Strike a target (cardinality = how many hit). */
  HIT = "HIT",

  // Resource verbs
  /** Spend a resource. */
  EXPEND = "EXPEND",
  /** Gain a resource. */
  RECOVER = "RECOVER",
  /** Recovery exceeds maximum. */
  OVERHEAL = "OVERHEAL",
  /** Return resource to source. */
  RETURN = "RETURN",

  // Physical mechanic verbs
  LIFT = "LIFT",
  KNOCK_DOWN = "KNOCK_DOWN",
  BREACH = "BREACH",
  CRUSH = "CRUSH",

  // Stack/duration verbs
  /** Reset duration to full. */
  REFRESH = "REFRESH",
  /** Extend duration. */
  EXTEND = "EXTEND",
  /** Newer subsumes older. */
  MERGE = "MERGE",
  /** Reset stacks or cooldown to 0. */
  RESET = "RESET",

  // Stat verbs
  /** Ignore a stat (e.g. IGNORE HEAT_RESISTANCE ON ENEMY). */
  IGNORE = "IGNORE",

  // Time verbs
  /** Segment time interaction — what the segment experiences (TIME_STOP, NONE, TIME_DELAY). */
  EXPERIENCE = "EXPERIENCE",

  // State verbs
  /** Quantity/possession assertion (uses cardinality). */
  HAVE = "HAVE",
  /** State assertion — subject is currently in this state. */
  IS = "IS",
  /** Transition assertion — subject just entered this state. */
  BECOME = "BECOME",
}

// ── Object ──────────────────────────────────────────────────────────────────

export enum ObjectType {
  // Skills / actions
  BASIC_ATTACK = "BASIC_ATTACK",
  BATTLE_SKILL = "BATTLE_SKILL",
  COMBO_SKILL = "COMBO_SKILL",
  ULTIMATE = "ULTIMATE",
  FINAL_STRIKE = "FINAL_STRIKE",
  CRITICAL_HIT = "CRITICAL_HIT",

  // Damage
  DAMAGE = "DAMAGE",

  // Statuses
  STATUS = "STATUS",
  INFLICTION = "INFLICTION",
  REACTION = "REACTION",
  ARTS_REACTION = "ARTS_REACTION",
  /** Self-referential stack count within a stack reaction. */
  STACKS = "STACKS",

  // Time
  TIME_STOP = "TIME_STOP",
  GAME_TIME = "GAME_TIME",
  REAL_TIME = "REAL_TIME",

  // Resources
  SKILL_POINT = "SKILL_POINT",
  ULTIMATE_ENERGY = "ULTIMATE_ENERGY",
  STAGGER = "STAGGER",
  COOLDOWN = "COOLDOWN",
  HP = "HP",

  // Entities (merged from TargetType)
  THIS_OPERATOR = "THIS_OPERATOR",
  OTHER_OPERATOR = "OTHER_OPERATOR",
  OTHER_OPERATORS = "OTHER_OPERATORS",
  ALL_OPERATORS = "ALL_OPERATORS",
  ENEMY = "ENEMY",

  // States (for IS/BECOME verbs, with optional negated: true for NOT)
  ACTIVE = "ACTIVE",
  LIFTED = "LIFTED",
  KNOCKED_DOWN = "KNOCKED_DOWN",
  BREACHED = "BREACHED",
  CRUSHED = "CRUSHED",
  COMBUSTED = "COMBUSTED",
  CORRODED = "CORRODED",
  ELECTRIFIED = "ELECTRIFIED",
  SOLIDIFIED = "SOLIDIFIED",
}

// ── Adjective ──────────────────────────────────────────────────────────────

/** Adjective type — modifies an object to specify its variant/category. */
export enum AdjectiveType {
  NONE = "NONE",

  // Damage adjectives (PERFORM <adj> DAMAGE TO ENEMY)
  NORMAL_ATTACK = "NORMAL_ATTACK",
  FINAL_STRIKE = "FINAL_STRIKE",

  // Element adjectives (APPLY 1 <adj> INFLICTION TO ENEMY, PERFORM <adj> DAMAGE)
  HEAT = "HEAT",
  CRYO = "CRYO",
  NATURE = "NATURE",
  ELECTRIC = "ELECTRIC",
  PHYSICAL = "PHYSICAL",

  // Arts reaction adjectives (APPLY 1 <adj> REACTION TO ENEMY)
  COMBUSTION = "COMBUSTION",
  SOLIDIFICATION = "SOLIDIFICATION",
  CORROSION = "CORROSION",
  ELECTRIFICATION = "ELECTRIFICATION",

  // Physical reaction adjectives (APPLY 1 <adj> REACTION TO ENEMY)
  LIFT = "LIFT",
  KNOCK_DOWN = "KNOCK_DOWN",
  BREACH = "BREACH",
  CRUSH = "CRUSH",

  // Reaction modifier adjectives (APPLY 1 FORCED <reaction> REACTION TO ENEMY)
  FORCED = "FORCED",

  // Time stop adjectives (APPLY <adj> TIME_STOP FOR <duration>)
  COMBO = "COMBO",
  DODGE = "DODGE",
  ANIMATION = "ANIMATION",
}

/** Valid objects for the EXPERIENCE verb (segment time dependency). */
export const EXPERIENCE_OBJECTS: ObjectType[] = [
  ObjectType.GAME_TIME,
  ObjectType.REAL_TIME,
];

/** Valid adjectives per object type. */
export const OBJECT_ADJECTIVES: Partial<Record<ObjectType, AdjectiveType[]>> = {
  [ObjectType.DAMAGE]: [
    AdjectiveType.NORMAL_ATTACK, AdjectiveType.FINAL_STRIKE,
    // Element prefix: PERFORM HEAT DAMAGE, PERFORM PHYSICAL DAMAGE
    AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL,
  ],
  [ObjectType.INFLICTION]: [
    AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL,
  ],
  [ObjectType.REACTION]: [
    // Arts reactions
    AdjectiveType.COMBUSTION, AdjectiveType.SOLIDIFICATION, AdjectiveType.CORROSION, AdjectiveType.ELECTRIFICATION,
    // Physical reactions
    AdjectiveType.LIFT, AdjectiveType.KNOCK_DOWN, AdjectiveType.BREACH, AdjectiveType.CRUSH,
    // Modifier
    AdjectiveType.FORCED,
  ],
  [ObjectType.TIME_STOP]: [
    AdjectiveType.COMBO, AdjectiveType.DODGE, AdjectiveType.ANIMATION,
  ],
};

// ── Cardinality Constraint ───────────────────────────────────────────────────

export enum CardinalityConstraintType {
  /** == N */
  EXACTLY = "EXACTLY",
  /** >= N */
  AT_LEAST = "AT_LEAST",
  /** <= N */
  AT_MOST = "AT_MOST",
}

/** @deprecated Use CardinalityConstraintType instead. */
export const CardinalityType = CardinalityConstraintType;
/** @deprecated Use CardinalityConstraintType instead. */
export type CardinalityType = CardinalityConstraintType;

// ── Interaction (condition) ──────────────────────────────────────────────────

/**
 * A single SVO sentence: Subject does Verb to Object.
 *
 * Used for conditions within predicates.
 */
export interface Interaction {
  subjectType: SubjectType;
  /** Possessive — "This Operator's ULTIMATE". Used with IS and OVERHEAL. */
  subjectProperty?: ObjectType;
  verbType: VerbType;
  /** NOT — "IS NOT ACTIVE". */
  negated?: boolean;
  objectType: ObjectType;
  /** Specific identifier (StatusType, skill name, etc.). */
  objectId?: string;
  /** Constraint type for cardinality assertions (EXACTLY, AT_LEAST, AT_MOST). */
  cardinalityConstraint?: CardinalityConstraintType;
  /** The count N in a cardinality assertion. */
  cardinality?: number;
  /** Stacks to apply/consume. */
  stacks?: number;
  /** Element filter. */
  element?: string; // ElementType from enums.ts
}

// ── Preposition ─────────────────────────────────────────────────────────────

/** Preposition type — clarifies the relationship of the prepositional object. */
export enum PrepositionType {
  /** Target/recipient: "APPLY 1 STATUS SCORCHING_HEART *TO* THIS_OPERATOR". */
  TO = "TO",
  /** Source: "ABSORB 1 HEAT INFLICTION *FROM* ENEMY". */
  FROM = "FROM",
  /** Duration: "APPLY COMBUSTION *FOR* 5 SECONDS". */
  FOR = "FOR",
  /** Stat target: "IGNORE HEAT_RESISTANCE *ON* ENEMY" — refers to the stat on the target entity. */
  ON = "ON",
  /** Properties/qualifiers: "PERFORM HEAT_DAMAGE *WITH* × [0.5 ... 1.0]". */
  WITH = "WITH",
}

// ── Effect ──────────────────────────────────────────────────────────────────

/**
 * A Verb-Object sentence with optional adjective and prepositional phrases.
 *
 * Used for effects within predicates and on frames.
 * No subject — the actor is implicit (the system/event owner).
 *
 * Grammar: VERB [cardinality] [adjective] OBJECT [prepositions...]
 *
 * Examples:
 *   PERFORM NORMAL_ATTACK DAMAGE WITH × [0.5] TO ENEMY
 *   PERFORM FINAL_STRIKE DAMAGE WITH × [1.2] TO ENEMY
 *   APPLY 1 FORCED COMBUSTION REACTION TO ENEMY
 *   APPLY COMBO TIME_STOP FOR 0.566s
 *   APPLY ANIMATION TIME_STOP FOR 2.07s
 *   RECOVER 20 SKILL_POINT TO TEAM
 *   APPLY 12 STAGGER TO ENEMY
 *   ABSORB 1 HEAT INFLICTION FROM ENEMY
 *
 * Compound effects use PERFORM_ALL as a grouping verb:
 *   PERFORM_ALL AT_MOST MAX:
 *     ABSORB 1 HEAT INFLICTION FROM ENEMY
 *     APPLY 1 MELTING_FLAME STATUS TO THIS_OPERATOR
 */
export interface Effect {
  verbType: VerbType;
  objectType?: ObjectType;
  /** Specific identifier (StatusType, skill name, etc.). */
  objectId?: string;
  /** Adjective(s) — modifies the object. Can stack: e.g. [FORCED, COMBUSTION] REACTION, [HEAT, FINAL_STRIKE] DAMAGE. */
  adjective?: AdjectiveType | AdjectiveType[];
  /** Element filter. */
  element?: string; // ElementType from enums.ts
  /** The count N (e.g. RECOVER *20* SKILL_POINT, ABSORB *1* INFLICTION). */
  cardinality?: number | typeof THRESHOLD_MAX;
  /** Constraint on cardinality (AT_MOST, AT_LEAST, EXACTLY). */
  cardinalityConstraint?: CardinalityConstraintType;
  /** TO — target/recipient. */
  toObjectType?: SubjectType | string;
  /** FROM — source. */
  fromObjectType?: SubjectType | string;
  /** ON — stat target entity (e.g. IGNORE HEAT_RESISTANCE ON ENEMY). */
  onObjectType?: SubjectType | string;
  /** WITH — multiplier array (level-indexed damage multipliers). */
  withMultiplier?: number[];
  /** FOR — duration in seconds (e.g. APPLY COMBO TIME_STOP FOR 0.566). */
  forDuration?: number;

  /**
   * Child effects for compound PERFORM_ALL grouping.
   * "PERFORM_ALL AT_MOST MAX:" followed by a list of effects executed as a unit.
   */
  effects?: Effect[];
}

// ── Predicate ──────────────────────────────────────────────────────────────

/**
 * A predicate: a set of conditions that, when all met, trigger a set of effects.
 *
 * Conditions are AND'd — all must hold for the predicate to pass.
 * When a predicate passes, all its effects are applied.
 */
export interface Predicate {
  /** AND — all conditions must hold for this predicate to pass. */
  conditions: Interaction[];
  /** Effects applied when all conditions are met. Each is an Effect or a compound PERFORM group. */
  effects: Effect[];
}

/**
 * A clause: a list of predicates that are all evaluated independently.
 *
 * Every predicate whose conditions pass has its effects applied.
 * A clause on an event gates availability — if no predicates pass, the event is unavailable.
 * An empty clause (no predicates) means no preconditions.
 */
export type Clause = Predicate[];

// ── StatusReaction (deprecated) ─────────────────────────────────────────────

/**
 * @deprecated Use Predicate instead. A StatusReaction is equivalent to a
 * Predicate with a single condition (trigger) and a single effect (reaction).
 */
export interface StatusReaction {
  /** When this fires. */
  trigger: Interaction;
  /** What happens in response. */
  reaction: Interaction;
}
