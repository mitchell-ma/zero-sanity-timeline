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

// ── Noun ────────────────────────────────────────────────────────────────────

/** Core nouns — entities, skills, resources, statuses, and states. */
enum CoreNounType {
  // Entities
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
  /** Any operator (used for triggers that can come from any team member). */
  ANY_OPERATOR = "ANY_OPERATOR",
  /** The event/status that owns this clause — self-referential (e.g. "this event has MAX stacks"). */
  THIS_EVENT = "THIS_EVENT",
  /** System-initiated (threshold effects, passive triggers). */
  SYSTEM = "SYSTEM",

  // Skills / actions
  BASIC_ATTACK = "BASIC_ATTACK",
  BATTLE_SKILL = "BATTLE_SKILL",
  COMBO_SKILL = "COMBO_SKILL",
  ULTIMATE = "ULTIMATE",
  FINAL_STRIKE = "FINAL_STRIKE",
  CRITICAL_HIT = "CRITICAL_HIT",

  // Damage
  NORMAL_ATTACK = "NORMAL_ATTACK",
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

  // States (for IS/BECOME verbs)
  ACTIVE = "ACTIVE",
}

// ── Noun Adjunct ──────────────────────────────────────────────────────────

/** Noun adjuncts — nouns used in adjective position to modify other nouns. */
export enum NounAdjunctType {
  /** The triggering effect — "APPLY SOURCE INFLICTION TO ENEMY" (duplicate what triggered this). */
  SOURCE = "SOURCE",
}

/** All nouns = core nouns + noun adjuncts. */
export type NounType = CoreNounType | NounAdjunctType;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const NounType = { ...CoreNounType, ...NounAdjunctType } as typeof CoreNounType & typeof NounAdjunctType;

// ── Subject ─────────────────────────────────────────────────────────────────

/** Subject position — any noun can be a subject. */
export type SubjectType = NounType;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const SubjectType = NounType;

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

// ── Adjective ──────────────────────────────────────────────────────────────

/** Adjective type — modifies an object to specify its variant/category. */
export enum AdjectiveType {
  NONE = "NONE",

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

  // State adjectives (ENEMY IS <adj>, ENEMY BECOME <adj>)
  LIFTED = "LIFTED",
  KNOCKED_DOWN = "KNOCKED_DOWN",
  CRUSHED = "CRUSHED",
  COMBUSTED = "COMBUSTED",
  CORRODED = "CORRODED",
  ELECTRIFIED = "ELECTRIFIED",
  SOLIDIFIED = "SOLIDIFIED",
  BREACHED = "BREACHED",

  // Physical reaction adjectives (APPLY 1 <adj> REACTION TO ENEMY)
  LIFT = "LIFT",
  KNOCK_DOWN = "KNOCK_DOWN",
  BREACH = "BREACH",
  CRUSH = "CRUSH",

  // Reaction modifier adjectives (APPLY 1 FORCED <reaction> REACTION TO ENEMY)
  FORCED = "FORCED",

  // Stagger adjectives (ENEMY BECOME NODE_STAGGERED STAGGER, ENEMY IS FULL_STAGGERED STAGGER)
  NODE_STAGGERED = "NODE_STAGGERED",
  FULL_STAGGERED = "FULL_STAGGERED",

  // Time stop adjectives (APPLY <adj> TIME_STOP FOR <duration>)
  COMBO = "COMBO",
  DODGE = "DODGE",
  ANIMATION = "ANIMATION",
}

// ── Object ──────────────────────────────────────────────────────────────────

/** Object position — nouns or adjectives (e.g. ENEMY IS BREACHED, APPLY COMBUSTION REACTION). */
export type ObjectType = NounType | AdjectiveType;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const ObjectType = { ...NounType, ...AdjectiveType } as typeof NounType & typeof AdjectiveType;

/** Valid objects for the EXPERIENCE verb (segment time dependency). */
export const EXPERIENCE_OBJECTS: ObjectType[] = [
  ObjectType.GAME_TIME,
  ObjectType.REAL_TIME,
];

/** Valid adjectives per object type (noun adjuncts like NORMAL_ATTACK, FINAL_STRIKE handled separately). */
export const OBJECT_ADJECTIVES: Partial<Record<ObjectType, AdjectiveType[]>> = {
  [ObjectType.DAMAGE]: [
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

/**
 * Valid noun adjuncts per object noun.
 * Noun adjuncts are NounType values used in adjective position to modify another noun.
 * e.g. APPLY SOURCE INFLICTION TO ENEMY — SOURCE modifies INFLICTION.
 */
export const NOUN_ADJUNCTS: Partial<Record<NounType, NounAdjunctType[]>> = {
  [NounType.INFLICTION]: [
    // SOURCE: duplicate the triggering infliction (e.g. Antal combo copies the infliction that triggered it)
    NounAdjunctType.SOURCE,
  ],
  [NounType.STATUS]: [
    // SOURCE: duplicate the triggering status (e.g. Antal combo copies the physical status that triggered it)
    NounAdjunctType.SOURCE,
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
  /** Target/recipient: "APPLY MELTING_FLAME STATUS *TO* THIS_OPERATOR". */
  TO = "TO",
  /** Source: "ABSORB HEAT INFLICTION *FROM* ENEMY". */
  FROM = "FROM",
  /** Stat target: "IGNORE HEAT_RESISTANCE *ON* ENEMY" — refers to the stat on the target entity. */
  ON = "ON",
  /** Properties/qualifiers: "PERFORM HEAT DAMAGE TO ENEMY *WITH* MULTIPLIER ..., STAGGER_VALUE ...". */
  WITH = "WITH",
  /** Cardinality limit: "PERFORM_ALL *FOR* AT_MOST 4" — how many times a compound action can occur. */
  FOR = "FOR",
}

// ── WITH preposition value verbs ─────────────────────────────────────────────

/**
 * Verb that determines the shape of a WITH preposition value.
 * - IS: single value (number)
 * - DEPENDS_ON: multi-dimensional array indexed by the dependency (SKILL_LEVEL, RANK, etc.)
 */
export enum WithValueVerb {
  IS = "IS",
  DEPENDS_ON = "DEPENDS_ON",
}

/** A single WITH preposition entry: a cardinality with its own verb determining value shape. */
export interface WithValue {
  verb: WithValueVerb;
  /** Dependency target when verb is DEPENDS_ON (e.g. "SKILL_LEVEL", "RANK"). */
  object?: string;
  /** The value — single number for IS, array for DEPENDS_ON. */
  value: number | number[];
}

/**
 * WITH preposition map — all properties/cardinalities of an effect.
 *
 * Each key is a named cardinality whose value shape is determined by its verb (IS or DEPENDS_ON).
 *
 * Key hierarchy:
 *   cardinality      — generic count (e.g. RECOVER 100 SKILL_POINT, EXPEND 300 ULTIMATE_ENERGY)
 *   duration         — seconds (e.g. TIME_STOP, REACTION, STATUS duration)
 *   multiplier       — damage multiplier (DEPENDS_ON SKILL_LEVEL → per-level array)
 *   staggerValue     — stagger amount
 *   skillPoint       — SP value
 *   stacks           — stack count, implies stacking mechanism (STATUS, INFLICTION)
 *     └─ statusLevel — specialization of stacks for reaction/status tier (1-4);
 *                      applies to: ARTS_REACTION, PHYSICAL_STATUS, INFLICTION
 */
export type WithPreposition = Record<string, WithValue>;

// ── Effect ──────────────────────────────────────────────────────────────────

/**
 * A Verb-Object sentence with optional adjective and prepositional phrases.
 *
 * Used for effects within predicates and on frames.
 * No subject — the actor is implicit (the system/event owner).
 *
 * Grammar: VERB [adjective] OBJECT [prepositions...]
 *
 * Examples:
 *   PERFORM HEAT DAMAGE TO ENEMY WITH MULTIPLIER DEPENDS_ON SKILL_LEVEL [0.5, ...]
 *   APPLY FORCED COMBUSTION REACTION TO ENEMY WITH STATUS_LEVEL IS 1
 *   APPLY COMBO TIME_STOP WITH DURATION IS 0.566
 *   RECOVER SKILL_POINT WITH CARDINALITY IS 20
 *   APPLY HEAT INFLICTION TO ENEMY WITH STACKS IS 1
 *   ABSORB HEAT INFLICTION FROM ENEMY WITH STACKS IS 1
 *
 * Compound effects use PERFORM_ALL as a grouping verb:
 *   PERFORM_ALL FOR AT_MOST MAX:
 *     ABSORB HEAT INFLICTION FROM ENEMY WITH STACKS IS 1
 *     APPLY MELTING_FLAME STATUS TO THIS_OPERATOR WITH STACKS IS 1
 */
export interface Effect {
  verbType: VerbType;
  objectType?: ObjectType;
  /** Specific identifier (StatusType, skill name, etc.). */
  objectId?: string;
  /** Adjective(s) — modifies the object. Can stack: e.g. [FORCED, COMBUSTION] REACTION, [HEAT] DAMAGE. */
  adjective?: AdjectiveType | AdjectiveType[];
  /** Constraint on cardinality (AT_MOST, AT_LEAST, EXACTLY) — for compound PERFORM_ALL grouping. */
  cardinalityConstraint?: CardinalityConstraintType;
  /** Cardinality for compound constraints (e.g. PERFORM_ALL AT_MOST MAX). */
  cardinality?: number | typeof THRESHOLD_MAX;
  /** TO — target/recipient. */
  toObjectType?: SubjectType | string;
  /** FROM — source. */
  fromObjectType?: SubjectType | string;
  /** ON — stat target entity (e.g. IGNORE HEAT_RESISTANCE ON ENEMY). */
  onObjectType?: SubjectType | string;
  /** WITH — properties/cardinalities of this effect (duration, stacks, multiplier, etc.). */
  withPreposition?: WithPreposition;
  /** FOR — cardinality limit on compound actions: "PERFORM_ALL FOR AT_MOST 4". */
  forPreposition?: { cardinalityConstraint: CardinalityConstraintType; cardinality: number | typeof THRESHOLD_MAX };

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

// ── Interaction matching ────────────────────────────────────────────────────

/**
 * Check if a published interaction satisfies a required interaction.
 *
 * Matching rules:
 * - Subject: must match, unless required is ANY_OPERATOR (wildcard).
 * - Verb: must match exactly.
 * - Object: must match exactly.
 * - ObjectId: if required specifies objectId, published must match.
 *   If required omits objectId, any published objectId matches (parent/wildcard).
 *   e.g. required {APPLY INFLICTION} matches published {APPLY INFLICTION objectId:HEAT}.
 * - Element: same wildcard logic as objectId.
 * - Adjective: if required specifies adjective, published must include it.
 * - Negated: must match.
 * - Cardinality: ignored for matching (cardinality is an assertion, not a filter).
 */
export function matchInteraction(published: Interaction, required: Interaction): boolean {
  // Subject: ANY_OPERATOR in required matches any operator subject
  if (required.subjectType !== NounType.ANY_OPERATOR && published.subjectType !== required.subjectType) return false;
  // Verb
  if (published.verbType !== required.verbType) return false;
  // Object
  if (published.objectType !== required.objectType) return false;
  // ObjectId: required specifies → must match; required omits → wildcard
  if (required.objectId != null && published.objectId !== required.objectId) return false;
  // Element: same wildcard logic
  if (required.element != null && published.element !== required.element) return false;
  // Negated
  if (!!required.negated !== !!published.negated) return false;
  return true;
}

/**
 * Human-readable label for an Interaction.
 * e.g. {THIS_OPERATOR, PERFORM, BATTLE_SKILL} → "Cast Battle Skill"
 *      {ENEMY, IS, COMBUSTED} → "Enemy is Combusted"
 */
export function interactionToLabel(i: Interaction): string {
  const fmt = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  const subject = i.subjectType === NounType.THIS_OPERATOR ? '' : fmt(i.subjectType) + ' ';
  const verb = fmt(i.verbType);
  const obj = fmt(i.objectType);
  const id = i.objectId ? ` (${fmt(i.objectId)})` : '';
  const el = i.element ? ` [${fmt(i.element)}]` : '';
  const neg = i.negated ? 'Not ' : '';

  return `${subject}${neg}${verb} ${obj}${id}${el}`.trim();
}

