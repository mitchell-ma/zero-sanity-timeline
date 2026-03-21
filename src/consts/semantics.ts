/**
 * SVO Semantic Grammar for the Event DSL.
 *
 * Every interaction in the system is a sentence: Subject → Verb → Object.
 * These types are the primitives for triggers, conditions, reactions, and effects.
 *
 * See src/model/eventSpec.md for the full specification.
 */

import { Reaction } from '../model/combat-statuses/reaction';

// ── Sentinels ───────────────────────────────────────────────────────────────

/** Sentinel value meaning "the potential-resolved maximum" for stack counts and cardinality. */
export const THRESHOLD_MAX = 'MAX' as const;

/** Sentinel for UNTIL preposition — extend to the end of the parent event. */
export const DURATION_END = 'END' as const;

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

// ── Determiner ──────────────────────────────────────────────────────────────

/** Determiner — specifies which/how many of a noun. */
export enum DeterminerType {
  /** The operator who owns this event/status. */
  THIS = "THIS",
  /** Any single teammate (excludes owner). */
  OTHER = "OTHER",
  /** Entire team including owner. */
  ALL = "ALL",
  /** All teammates excluding owner. */
  ALL_OTHER = "ALL_OTHER",
  /** Any operator (wildcard for triggers). */
  ANY = "ANY",
}

// ── Noun ────────────────────────────────────────────────────────────────────

/** Core nouns — entities, skills, resources, statuses, and states. */
enum CoreNounType {
  // Entities
  /** An operator — use DeterminerType to specify which. */
  OPERATOR = "OPERATOR",
  /** The enemy target. */
  ENEMY = "ENEMY",
  /** An event — the event/status that owns this clause. */
  EVENT = "EVENT",
  /** System-initiated (threshold effects, passive triggers). */
  SYSTEM = "SYSTEM",

  // Skills / actions
  BASIC_ATTACK = "BASIC_ATTACK",
  BATTLE_SKILL = "BATTLE_SKILL",
  COMBO_SKILL = "COMBO_SKILL",
  ULTIMATE = "ULTIMATE",
  FINAL_STRIKE = "FINAL_STRIKE",
  FINISHER = "FINISHER",
  DIVE_ATTACK = "DIVE_ATTACK",
  CRITICAL_HIT = "CRITICAL_HIT",

  // Damage
  NORMAL_ATTACK = "NORMAL_ATTACK",
  DAMAGE = "DAMAGE",

  // Statuses
  STATUS = "STATUS",
  INFLICTION = "INFLICTION",
  REACTION = "REACTION",
  ARTS_REACTION = "ARTS_REACTION",
  /** Same-element infliction stacking. Not directly applicable — triggered automatically. */
  ARTS_BURST = "ARTS_BURST",
  PHYSICAL_STATUS = "PHYSICAL_STATUS",
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
  // ── Compound (structural wrappers, can nest) ────────────────────────────
  /** Evaluate all predicates in order, execute each one that passes. Optional cardinality (ALL AT_MOST 4). */
  ALL = "ALL",
  /** Evaluate predicates in order, execute the first that passes. */
  ANY = "ANY",

  // ── Action ──────────────────────────────────────────────────────────────
  /** Execute a skill or action. */
  PERFORM = "PERFORM",
  /** Apply status, infliction, reaction, stagger, physical status. */
  APPLY = "APPLY",
  /** Remove/spend: status, infliction, reaction, resource (SP, ult energy, cooldown). */
  CONSUME = "CONSUME",
  /** Deal damage (inline multiplier). */
  DEAL = "DEAL",
  /** Strike a target (cardinality = count). */
  HIT = "HIT",
  /** Kill a target. */
  DEFEAT = "DEFEAT",

  // ── Resource ────────────────────────────────────────────────────────────
  /** Gain a resource (SP, ult energy, HP). */
  RECOVER = "RECOVER",
  /** Recovery exceeds maximum. */
  OVERHEAL = "OVERHEAL",
  /** Return resource to source. */
  RETURN = "RETURN",

  // ── Duration/stack ──────────────────────────────────────────────────────
  /** Reset duration to full. */
  REFRESH = "REFRESH",
  /** Add to duration. */
  EXTEND = "EXTEND",
  /** Newer subsumes older. */
  MERGE = "MERGE",
  /** Reset stacks or cooldown to 0. */
  RESET = "RESET",

  // ── Stat ────────────────────────────────────────────────────────────────
  /** Ignore a resistance/stat (e.g. IGNORE HEAT_RESISTANCE ON ENEMY). */
  IGNORE = "IGNORE",
  /** Enhance a skill type for a target operator (e.g. ENHANCE BASIC_ATTACK TO THIS OPERATOR). */
  ENHANCE = "ENHANCE",
  /** Disable a skill variant tier (e.g. DISABLE NORMAL BASIC_ATTACK TO THIS OPERATOR). */
  DISABLE = "DISABLE",

  // ── Time ────────────────────────────────────────────────────────────────
  /** Segment time interaction (GAME_TIME, REAL_TIME). */
  EXPERIENCE = "EXPERIENCE",

  // ── Condition-only (used in predicate conditions, not effects) ──────────
  /** Quantity/possession assertion (uses cardinality). */
  HAVE = "HAVE",
  /** State assertion — subject is currently in this state. */
  IS = "IS",
  /** Transition assertion — subject just entered this state. */
  BECOME = "BECOME",
  /** Target receives a status/infliction/reaction (fires each time, regardless of prior state). */
  RECEIVE = "RECEIVE",
}

/** Physical status types — objects of APPLY, moved from VerbType. */
export enum PhysicalStatusType {
  LIFT = "LIFT",
  KNOCK_DOWN = "KNOCK_DOWN",
  BREACH = "BREACH",
  CRUSH = "CRUSH",
}

/**
 * Verb → valid object type chaining map.
 * Defines which NounType/ObjectType values each verb can take as its object.
 */
export const VERB_OBJECTS: Partial<Record<VerbType, string[]>> = {
  [VerbType.APPLY]:      ['INFLICTION', 'REACTION', 'ARTS_BURST', 'PHYSICAL_STATUS', 'STATUS', 'STAGGER', 'TIME_STOP'],
  [VerbType.CONSUME]:    ['INFLICTION', 'REACTION', 'STATUS', 'SKILL_POINT', 'ULTIMATE_ENERGY', 'COOLDOWN', 'STAGGER', 'STACKS'],
  [VerbType.RECOVER]:    ['SKILL_POINT', 'ULTIMATE_ENERGY', 'HP'],
  [VerbType.RETURN]:     ['SKILL_POINT'],
  [VerbType.DEAL]:       ['DAMAGE', 'STAGGER'],
  [VerbType.PERFORM]:    ['BASIC_ATTACK', 'BATTLE_SKILL', 'COMBO_SKILL', 'ULTIMATE', 'FINAL_STRIKE', 'FINISHER', 'DIVE_ATTACK', 'NORMAL_ATTACK'],
  [VerbType.HIT]:        ['ENEMY'],
  [VerbType.DEFEAT]:     ['ENEMY'],
  [VerbType.REFRESH]:    ['STATUS', 'INFLICTION', 'REACTION'],
  [VerbType.EXTEND]:     ['STATUS', 'INFLICTION', 'REACTION'],
  [VerbType.MERGE]:      ['STATUS', 'INFLICTION'],
  [VerbType.RESET]:      ['COOLDOWN', 'STACKS'],
  [VerbType.IGNORE]:     ['STATUS', 'ULTIMATE_ENERGY'],
  [VerbType.ENHANCE]:    ['BASIC_ATTACK', 'BATTLE_SKILL', 'COMBO_SKILL', 'ULTIMATE'],
  [VerbType.EXPERIENCE]: ['GAME_TIME', 'REAL_TIME'],
  [VerbType.HAVE]:       ['STATUS', 'INFLICTION', 'REACTION', 'STACKS', 'SKILL_POINT', 'ULTIMATE_ENERGY'],
  [VerbType.IS]:         ['ACTIVE', 'LIFTED', 'KNOCKED_DOWN', 'CRUSHED', 'BREACHED', 'COMBUSTED', 'CORRODED', 'ELECTRIFIED', 'SOLIDIFIED', 'NODE_STAGGERED', 'FULL_STAGGERED'],
  [VerbType.BECOME]:     ['ACTIVE', 'LIFTED', 'KNOCKED_DOWN', 'CRUSHED', 'BREACHED', 'COMBUSTED', 'CORRODED', 'ELECTRIFIED', 'SOLIDIFIED', 'NODE_STAGGERED', 'FULL_STAGGERED'],
  [VerbType.RECEIVE]:    ['STATUS', 'INFLICTION', 'REACTION', 'STAGGER'],
  [VerbType.OVERHEAL]:   ['HP'],
};

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
    // Element prefix: DEAL HEAT DAMAGE, DEAL PHYSICAL DAMAGE
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
  [ObjectType.STATUS]: [
    // Physical statuses (APPLY LIFT STATUS TO ENEMY)
    AdjectiveType.LIFT, AdjectiveType.KNOCK_DOWN, AdjectiveType.BREACH, AdjectiveType.CRUSH,
  ],
  [ObjectType.PHYSICAL_STATUS]: [
    AdjectiveType.LIFT, AdjectiveType.KNOCK_DOWN, AdjectiveType.BREACH, AdjectiveType.CRUSH,
  ],
  [ObjectType.TIME_STOP]: [
    AdjectiveType.COMBO, AdjectiveType.DODGE, AdjectiveType.ANIMATION,
  ],
  [ObjectType.STAGGER]: [
    AdjectiveType.NODE_STAGGERED, AdjectiveType.FULL_STAGGERED,
  ],
  [ObjectType.NORMAL_ATTACK]: [
    AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL,
  ],
  [ObjectType.FINAL_STRIKE]: [
    AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL,
  ],
};

/** Objects whose adjective is required (no empty "—" option in dropdown). */
export const OBJECT_REQUIRED_ADJECTIVE = new Set<string>([ObjectType.DAMAGE]);

/** Default adjective for objects that require one. */
export const OBJECT_DEFAULT_ADJECTIVE: Partial<Record<ObjectType, AdjectiveType>> = {
  [ObjectType.DAMAGE]: AdjectiveType.PHYSICAL,
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
  /** Determiner for OPERATOR subjects (THIS, OTHER, ALL, ANY). Defaults to THIS. */
  subjectDeterminer?: DeterminerType;
  subject: SubjectType;
  /** Possessive — "This Operator's ULTIMATE". Used with IS and OVERHEAL. */
  subjectProperty?: ObjectType;
  verb: VerbType;
  /** NOT — "IS NOT ACTIVE". */
  negated?: boolean;
  object: ObjectType;
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
  /** Source: "CONSUME HEAT INFLICTION *FROM* ENEMY". */
  FROM = "FROM",
  /** Stat target: "IGNORE HEAT_RESISTANCE *ON* ENEMY" — refers to the stat on the target entity. */
  ON = "ON",
  /** Properties/qualifiers: "PERFORM HEAT DAMAGE TO ENEMY *WITH* MULTIPLIER ..., STAGGER_VALUE ...". */
  WITH = "WITH",
  /** Cardinality limit: "ALL *FOR* AT_MOST 4" — how many times a compound action can occur. */
  FOR = "FOR",
  /** Duration cap: "EXTEND LIFT STATUS ON ENEMY *UNTIL* END". */
  UNTIL = "UNTIL",
}

// ── WITH preposition value verbs ─────────────────────────────────────────────

/**
 * Verb that determines the shape of a WITH preposition value.
 * - IS: single value (number)
 * - BASED_ON: multi-dimensional array indexed by the dependency (SKILL_LEVEL, RANK, etc.)
 */
export enum WithValueVerb {
  IS = "IS",
  BASED_ON = "BASED_ON",
}

/** A single WITH preposition entry: a cardinality with its own verb determining value shape. */
export interface WithValue {
  verb: WithValueVerb;
  /** Dependency target when verb is BASED_ON (e.g. "SKILL_LEVEL", "RANK"). */
  object?: string;
  /** The value — single number for IS, array for BASED_ON. */
  value: number | number[];
}

/**
 * WITH preposition map — all properties/cardinalities of an effect.
 *
 * Each key is a named cardinality whose value shape is determined by its verb (IS or BASED_ON).
 *
 * Key hierarchy:
 *   cardinality      — generic count (e.g. RECOVER 100 SKILL_POINT, CONSUME 300 ULTIMATE_ENERGY)
 *   duration         — seconds (e.g. TIME_STOP, REACTION, STATUS duration)
 *   multiplier       — damage multiplier (BASED_ON SKILL_LEVEL → per-level array)
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
 *   PERFORM HEAT DAMAGE TO ENEMY WITH MULTIPLIER BASED_ON SKILL_LEVEL [0.5, ...]
 *   APPLY FORCED COMBUSTION REACTION TO ENEMY WITH STATUS_LEVEL IS 1
 *   APPLY COMBO TIME_STOP WITH DURATION IS 0.566
 *   RECOVER SKILL_POINT WITH CARDINALITY IS 20
 *   APPLY HEAT INFLICTION TO ENEMY WITH STACKS IS 1
 *   CONSUME HEAT INFLICTION FROM ENEMY WITH STACKS IS 1
 *
 * Compound effects use ALL/ANY as structural wrappers:
 *   ALL FOR AT_MOST MAX:
 *     [unconditional]:
 *       CONSUME HEAT INFLICTION FROM ENEMY WITH STACKS IS 1
 *       APPLY MELTING_FLAME STATUS TO THIS_OPERATOR WITH STACKS IS 1
 */
export interface Effect {
  verb: VerbType;
  object?: ObjectType;
  /** Specific identifier (StatusType, skill name, etc.). */
  objectId?: string;
  /** Adjective(s) — modifies the object. Can stack: e.g. [FORCED, COMBUSTION] REACTION, [HEAT] DAMAGE. */
  adjective?: AdjectiveType | AdjectiveType[];
  /** Constraint on cardinality (AT_MOST, AT_LEAST, EXACTLY) — for compound ALL/ANY grouping. */
  cardinalityConstraint?: CardinalityConstraintType;
  /** Cardinality for compound constraints (e.g. ALL AT_MOST MAX). */
  cardinality?: number | typeof THRESHOLD_MAX;
  /** TO — target/recipient. */
  toObject?: SubjectType | string;
  /** Determiner for TO target (THIS, OTHER, ALL, ANY). */
  toDeterminer?: DeterminerType;
  /** Class filter for TO target (e.g. "GUARD"). */
  toObjectClassFilter?: string;
  /** FROM — source. */
  fromObject?: SubjectType | string;
  /** Determiner for FROM source (THIS, OTHER, ALL, ANY). */
  fromDeterminer?: DeterminerType;
  /** ON — stat target entity (e.g. IGNORE HEAT_RESISTANCE ON ENEMY). */
  onObject?: SubjectType | string;
  /** Determiner for ON target (THIS, OTHER, ALL, ANY). */
  onDeterminer?: DeterminerType;
  /** WITH — properties/cardinalities of this effect (duration, stacks, multiplier, etc.). */
  with?: WithPreposition;
  /** FOR — cardinality limit on compound actions: "ALL FOR AT_MOST 4". */
  for?: { cardinalityConstraint: CardinalityConstraintType; cardinality: number | typeof THRESHOLD_MAX };
  /** UNTIL — duration cap: "EXTEND STATUS UNTIL END". */
  until?: typeof DURATION_END;

  /**
   * Nested predicates for ALL/ANY compound effects.
   * ALL: evaluate all predicates, execute each passing one.
   * ANY: evaluate predicates in order, execute the first passing one.
   */
  predicates?: Predicate[];

  /**
   * Child effects (leaf-level, no conditions).
   * Used for ALL/ANY with flat effect lists (no predicate conditions).
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
  // Subject: ANY determiner on OPERATOR matches any operator subject
  const reqIsAnyOperator = required.subject === NounType.OPERATOR && (required.subjectDeterminer as string) === DeterminerType.ANY;
  if (!reqIsAnyOperator && published.subject !== required.subject) return false;
  // When both are OPERATOR, check determiner match (unless required is ANY)
  if (!reqIsAnyOperator && published.subject === NounType.OPERATOR && required.subject === NounType.OPERATOR) {
    const pubDet = published.subjectDeterminer ?? DeterminerType.THIS;
    const reqDet = required.subjectDeterminer ?? DeterminerType.THIS;
    if (pubDet !== reqDet) return false;
  }
  // Verb
  if (published.verb !== required.verb) return false;
  // Object
  if (published.object !== required.object) return false;
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

  let subject: string;
  if (i.subject === NounType.OPERATOR) {
    const det = i.subjectDeterminer ?? DeterminerType.THIS;
    subject = det === DeterminerType.THIS ? '' : `${fmt(det)} Operator `;
  } else {
    subject = fmt(i.subject) + ' ';
  }

  const verb = fmt(i.verb);
  const obj = fmt(i.object);
  const id = i.objectId ? ` (${fmt(i.objectId)})` : '';
  const el = i.element ? ` [${fmt(i.element)}]` : '';
  const neg = i.negated ? 'Not ' : '';

  return `${subject}${neg}${verb} ${obj}${id}${el}`.trim();
}

// ── Verb/Object lists for builders ──────────────────────────────────────────

/** Verbs available when subject is OPERATOR (alphabetical by label). */
export const OPERATOR_VERBS = [
  VerbType.APPLY, VerbType.CONSUME, VerbType.DEAL,
  VerbType.DEFEAT, VerbType.HAVE, VerbType.IS,
  VerbType.OVERHEAL, VerbType.PERFORM, VerbType.RECEIVE,
  VerbType.RECOVER,
];

/** Verbs available for effects (alphabetical, ANY disabled). */
export const EFFECT_VERBS = [
  VerbType.ALL, // VerbType.ANY,
  VerbType.APPLY, VerbType.CONSUME, VerbType.DEAL,
  VerbType.DISABLE, VerbType.ENHANCE, VerbType.EXTEND,
  VerbType.IGNORE, VerbType.MERGE, VerbType.PERFORM,
  VerbType.RECOVER, VerbType.REFRESH, VerbType.RESET,
  VerbType.RETURN,
];

/** Valid object types for a given effect verb. */
export function getObjectsForEffectVerb(verb: VerbType): ObjectType[] {
  const mapped = VERB_OBJECTS[verb];
  if (mapped) return mapped as ObjectType[];
  return Object.values(ObjectType);
}

/** Valid object types for a given condition verb. */
export function getObjectsForConditionVerb(verb: VerbType): ObjectType[] {
  const mapped = VERB_OBJECTS[verb];
  if (mapped) return mapped as ObjectType[];
  return Object.values(ObjectType);
}

/** Get available verb options for a given subject. */
export function getVerbsForSubject(subject: SubjectType): VerbType[] {
  if (subject === SubjectType.OPERATOR) return OPERATOR_VERBS;
  return Object.values(VerbType);
}

// ── Interaction field visibility (progressive disclosure) ───────────────────

// Verbs that support cardinality
const CARDINALITY_VERBS = new Set([VerbType.HAVE, VerbType.HIT, VerbType.PERFORM, VerbType.CONSUME]);
// Verbs that support subjectProperty
const PROPERTY_VERBS = new Set([VerbType.IS, VerbType.OVERHEAL]);
// Objects that need an objectId
const NEEDS_OBJECT_ID = new Set<string>([ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.COOLDOWN]);

/** Which fields are visible in the interaction builder. */
export interface InteractionFieldVisibility {
  showDeterminer: boolean;
  showVerb: boolean;
  showProperty: boolean;
  showNegated: boolean;
  showObject: boolean;
  showObjectId: boolean;
  showObjectIdIsStatus: boolean;
  showObjectIdIsInfliction: boolean;
  showObjectIdIsReaction: boolean;
  showCardinality: boolean;
  showCardinalityValue: boolean;
  showTo: boolean;
  showFrom: boolean;
  showQualifierRow: boolean;
  /** WITH property keys available for this verb+object combination. */
  withProperties: string[];
  /** If non-null, the target is forced (not user-selectable) — e.g. STAGGER always targets ENEMY. */
  forcedTarget: SubjectType | null;
}

// Verbs that need prepositions
const NEEDS_TO = new Set([VerbType.APPLY, VerbType.RECOVER, VerbType.RETURN, VerbType.ENHANCE, VerbType.DISABLE]);
const NEEDS_FROM = new Set([VerbType.CONSUME]);
const NEEDS_ON = new Set([VerbType.EXTEND, VerbType.REFRESH, VerbType.MERGE, VerbType.IGNORE]);
const NEEDS_DURATION = new Set([VerbType.APPLY]);

/** Which fields are visible in the effect builder. */
export interface EffectFieldVisibility {
  showCardinality: boolean;
  showAdjective: boolean;
  showObjectId: boolean;
  showObjectIdIsStatus: boolean;
  showObjectIdIsInfliction: boolean;
  showObjectIdIsReaction: boolean;
  showTo: boolean;
  showFrom: boolean;
  showOn: boolean;
  showDuration: boolean;
  showUntilEnd: boolean;
  showQualifierRow: boolean;
  withProperties: string[];
}

/** Compute effect field visibility based on current effect state. */
export function getEffectFieldVisibility(value: Effect): EffectFieldVisibility {
  const adjectives = value.object ? (OBJECT_ADJECTIVES[value.object] ?? []) : [];
  const showObjectId = NEEDS_OBJECT_ID.has(value.object ?? '');
  const showTo = NEEDS_TO.has(value.verb);
  const showFrom = NEEDS_FROM.has(value.verb);
  const showOn = NEEDS_ON.has(value.verb);
  const showDuration = NEEDS_DURATION.has(value.verb) && value.object === ObjectType.TIME_STOP;
  const showUntilEnd = value.verb === VerbType.EXTEND;

  return {
    showCardinality: new Set([VerbType.APPLY, VerbType.CONSUME, VerbType.RECOVER, VerbType.RETURN]).has(value.verb),
    showAdjective: adjectives.length > 0 && value.object !== ObjectType.STATUS,
    showObjectId,
    showObjectIdIsStatus: value.object === ObjectType.STATUS,
    showObjectIdIsInfliction: value.object === ObjectType.INFLICTION,
    showObjectIdIsReaction: value.object === ObjectType.REACTION,
    showTo,
    showFrom,
    showOn,
    showDuration,
    showUntilEnd,
    showQualifierRow: showTo || showFrom || showOn || showDuration || showUntilEnd,
    withProperties: value.object ? getWithProperties(value.verb, value.object, value.objectId) : [],
  };
}

// ── WITH property resolution ────────────────────────────────────────────────

/** WITH property labels for UI display. */
export const WITH_PROPERTY_LABELS: Record<string, string> = {
  duration: 'Duration (s)',
  multiplier: 'Multiplier',
  statusLevel: 'Status Level',
  value: 'Value',
  isForced: 'Forced',
};

/** WITH properties that are boolean toggles (not numeric inputs). */
export const WITH_BOOLEAN_PROPERTIES = new Set(['isForced']);

/**
 * Object → forced target. Objects that can only target a specific entity.
 * If an object is in this map, the TO target is auto-set and not user-selectable.
 */
export const OBJECT_FORCED_TARGET: Partial<Record<ObjectType, SubjectType>> = {
  [ObjectType.STAGGER]:        SubjectType.ENEMY,
  [ObjectType.INFLICTION]:     SubjectType.ENEMY,
  [ObjectType.REACTION]:       SubjectType.ENEMY,
  [ObjectType.ARTS_BURST]:     SubjectType.ENEMY,
  [ObjectType.PHYSICAL_STATUS]: SubjectType.ENEMY,
};

/**
 * Verb+Object → available WITH property keys.
 * Central source of truth for which properties a given combination supports.
 */
export const VERB_OBJECT_WITH_PROPERTIES: Record<string, Record<string, string[]>> = {
  [VerbType.APPLY]: {
    [ObjectType.STATUS]:          ['duration', 'statusLevel'],
    [ObjectType.INFLICTION]:      ['statusLevel'],
    [ObjectType.REACTION]:        [...Reaction.EDITABLE_PROPERTIES],
    [ObjectType.PHYSICAL_STATUS]: [...Reaction.EDITABLE_PROPERTIES],
    [ObjectType.TIME_STOP]:       ['duration'],
    [ObjectType.STAGGER]:         ['value'],
  },
  [VerbType.DEAL]: {
    [ObjectType.DAMAGE]:     ['value'],
    [ObjectType.STAGGER]:    ['value'],
  },
  [VerbType.CONSUME]: {
    [ObjectType.STATUS]:     ['statusLevel'],
    [ObjectType.INFLICTION]: ['statusLevel'],
  },
  [VerbType.EXTEND]:  { _default: ['duration'] },
  [VerbType.REFRESH]: { _default: ['duration'] },
  [VerbType.RECOVER]: { _default: ['statusLevel'] },
};

/**
 * Get available WITH properties for a verb+object combination.
 * For STATUS, also accepts objectId to look up dynamic properties from configs.
 */
export function getWithProperties(verb: VerbType, object: ObjectType, objectId?: string): string[] {
  // Static lookup from the map
  const verbMap = VERB_OBJECT_WITH_PROPERTIES[verb];
  const staticProps = verbMap ? (verbMap[object] ?? verbMap._default ?? []) : [];

  // For STATUS with a specific objectId, merge dynamic properties from configs
  if (object === ObjectType.STATUS && objectId) {
    // Lazy import to avoid circular deps
    const { getStatusWithProperties } = require('../model/event-frames/operatorJsonLoader');
    const dynamicProps = getStatusWithProperties(objectId) as string[];
    if (dynamicProps.length > 0) {
      const merged = new Set([...staticProps, ...dynamicProps]);
      return Array.from(merged);
    }
  }

  return staticProps;
}

/** Compute progressive field visibility based on current interaction state. */
export function getInteractionFieldVisibility(value: Interaction): InteractionFieldVisibility {
  const hasSubject = !!value.subject;
  const needsDeterminer = hasSubject && value.subject === SubjectType.OPERATOR;
  const determinerDone = !needsDeterminer || !!value.subjectDeterminer;
  const showVerb = hasSubject && determinerDone;
  const hasVerb = showVerb && !!value.verb;
  const hasObject = hasVerb && !!value.object;
  const needsId = hasObject && NEEDS_OBJECT_ID.has(value.object);

  return {
    showDeterminer: needsDeterminer,
    showVerb,
    showProperty: hasVerb && PROPERTY_VERBS.has(value.verb),
    showNegated: hasVerb && (value.verb === VerbType.IS || value.verb === VerbType.BECOME),
    showObject: hasVerb,
    showObjectId: needsId,
    showObjectIdIsStatus: hasObject && value.object === ObjectType.STATUS,
    showObjectIdIsInfliction: hasObject && value.object === ObjectType.INFLICTION,
    showObjectIdIsReaction: hasObject && value.object === ObjectType.REACTION,
    showCardinality: hasObject && CARDINALITY_VERBS.has(value.verb),
    showCardinalityValue: !!value.cardinalityConstraint,
    showTo: hasObject && NEEDS_TO.has(value.verb) && !OBJECT_FORCED_TARGET[value.object],
    showFrom: hasObject && NEEDS_FROM.has(value.verb) && !OBJECT_FORCED_TARGET[value.object],
    showQualifierRow: hasObject && (NEEDS_TO.has(value.verb) || NEEDS_FROM.has(value.verb)) && !OBJECT_FORCED_TARGET[value.object],
    forcedTarget: hasObject ? OBJECT_FORCED_TARGET[value.object] ?? null : null,
    withProperties: hasObject ? getWithProperties(value.verb, value.object, value.objectId) : [],
  };
}

// ── Display labels for builder UI ────────────────────────────────────────────

const titleCase = (s: string) =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const VERB_LABELS: Record<string, string> = {
  [VerbType.ALL]: 'All',
  [VerbType.ANY]: 'Any',
  [VerbType.PERFORM]: 'Perform',
  [VerbType.APPLY]: 'Apply',
  [VerbType.CONSUME]: 'Consume',
  [VerbType.DEAL]: 'Deal',
  [VerbType.HIT]: 'Hit',
  [VerbType.DEFEAT]: 'Defeat',
  [VerbType.RECOVER]: 'Recover',
  [VerbType.OVERHEAL]: 'Overheal',
  [VerbType.RETURN]: 'Return',
  [VerbType.REFRESH]: 'Refresh',
  [VerbType.EXTEND]: 'Extend',
  [VerbType.MERGE]: 'Merge',
  [VerbType.RESET]: 'Reset',
  [VerbType.IGNORE]: 'Ignore',
  [VerbType.ENHANCE]: 'Enhance',
  [VerbType.DISABLE]: 'Disable',
  [VerbType.EXPERIENCE]: 'Experience',
  [VerbType.HAVE]: 'Have',
  [VerbType.IS]: 'Is',
  [VerbType.BECOME]: 'Become',
  [VerbType.RECEIVE]: 'Receive',
};

export const SUBJECT_LABELS: Record<string, string> = {
  [SubjectType.OPERATOR]: 'Operator',
  [SubjectType.ENEMY]: 'Enemy',
  [SubjectType.EVENT]: 'Event',
};

export const OBJECT_LABELS: Record<string, string> = {
  [ObjectType.STATUS]: 'Status',
  [ObjectType.INFLICTION]: 'Infliction',
  [ObjectType.REACTION]: 'Reaction',
  [ObjectType.ARTS_REACTION]: 'Arts Reaction',
  [ObjectType.STACKS]: 'Stacks',
  [ObjectType.SKILL_POINT]: 'Skill Point',
  [ObjectType.ULTIMATE_ENERGY]: 'Ultimate Energy',
  [ObjectType.STAGGER]: 'Stagger',
  [ObjectType.COOLDOWN]: 'Cooldown',
  [ObjectType.HP]: 'HP',
  [ObjectType.DAMAGE]: 'Damage',
  [ObjectType.TIME_STOP]: 'Time Stop',
  [ObjectType.GAME_TIME]: 'Game Time',
  [ObjectType.REAL_TIME]: 'Real Time',
  [ObjectType.BASIC_ATTACK]: 'Basic Attack',
  [ObjectType.BATTLE_SKILL]: 'Battle Skill',
  [ObjectType.COMBO_SKILL]: 'Combo Skill',
  [ObjectType.ULTIMATE]: 'Ultimate',
  [ObjectType.FINAL_STRIKE]: 'Final Strike',
  [ObjectType.NORMAL_ATTACK]: 'Normal Attack',
  [ObjectType.ACTIVE]: 'Active',
};

export const ADJECTIVE_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(AdjectiveType).filter((v) => v !== AdjectiveType.NONE).map((v) => [v, titleCase(v)])
);

export const DETERMINER_LABELS: Record<string, string> = {
  [DeterminerType.THIS]: 'This',
  [DeterminerType.OTHER]: 'Other',
  [DeterminerType.ALL]: 'All',
  [DeterminerType.ANY]: 'Any',
};

export const TARGET_LABELS: Record<string, string> = {
  ENEMY: 'Enemy',
  OPERATOR: 'Operator',
};

export const CARDINALITY_LABELS: Record<string, string> = {
  [CardinalityConstraintType.EXACTLY]: 'Exactly',
  [CardinalityConstraintType.AT_LEAST]: 'At Least',
  [CardinalityConstraintType.AT_MOST]: 'At Most',
};

