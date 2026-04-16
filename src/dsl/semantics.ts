/**
 * SVO Semantic Grammar for the Event DSL.
 *
 * Every interaction in the system is a sentence: Subject → Verb → Object.
 * These types are the primitives for triggers, conditions, reactions, and effects.
 *
 * See src/model/eventSpec.md for the full specification.
 */

import { UnitType } from '../consts/enums';
import { Reaction } from '../model/combat-statuses/reaction';

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
  /** Any operator except the owner (wildcard for triggers, excludes self). */
  ANY_OTHER = "ANY_OTHER",
  /** The operator currently controlled by the player. */
  CONTROLLED = "CONTROLLED",
  /** The operator who triggered this effect (e.g. dealt damage that activated a talent). */
  TRIGGER = "TRIGGER",
  /** The operator who owns the talent/status definition (the source/origin operator). */
  SOURCE = "SOURCE",
}

// ── Clause evaluation mode ──────────────────────────────────────────────────

/** How multiple clauses in an onTriggerClause array are evaluated. */
export enum ClauseEvaluationType {
  /** Evaluate all clauses — execute each one whose conditions pass. */
  ALL = "ALL",
  /** Evaluate in order — execute only the first clause whose conditions pass. */
  FIRST_MATCH = "FIRST_MATCH",
}

// ── Noun ────────────────────────────────────────────────────────────────────

/** Nouns — entities, skills, resources, statuses, and states. */
export enum NounType {
  // Entities
  /** An operator — use DeterminerType to specify which. */
  OPERATOR = "OPERATOR",
  /** The team as a shared entity — statuses applied here go to the common team-status column. */
  TEAM = "TEAM",
  /** The enemy target. */
  ENEMY = "ENEMY",
  /** An event — the event/status that owns this clause. */
  EVENT = "EVENT",
  /** System-initiated (threshold effects, passive triggers). */
  SYSTEM = "SYSTEM",

  // Skills / actions
  BASIC_ATTACK = "BASIC_ATTACK",
  /** Basic attack subcategory (normal attack sequence). Distinct from BASIC_ATTACK which is the skill category. */
  BATK = "BATK",
  /** Battle skill column / category ID. */
  BATTLE = "BATTLE",
  /** Combo skill column / category ID. */
  COMBO = "COMBO",
  ULTIMATE = "ULTIMATE",
  FINAL_STRIKE = "FINAL_STRIKE",
  FINISHER = "FINISHER",
  DIVE = "DIVE",
  CRITICAL_HIT = "CRITICAL_HIT",
  /** Operator action — non-combat skill events (e.g. healing shadows, deployables). */
  ACTION = "ACTION",
  /** Dash action (basic attack variant). */
  DASH = "DASH",
  /** Enemy control action. */
  CONTROL = "CONTROL",
  /** Ultimate skill (event category alias). */
  ULTIMATE_SKILL = "ULTIMATE_SKILL",
  /** Enemy skill charge-up action. */
  CHARGE = "CHARGE",

  // Damage
  NORMAL_ATTACK = "NORMAL_ATTACK",
  DAMAGE = "DAMAGE",
  /** Generic "all skills" qualifier (e.g. [SKILL] DAMAGE_BONUS). Base object for normalized skill references. */
  SKILL = "SKILL",

  // Statuses
  STATUS = "STATUS",
  AMP = "AMP",
  HEAT_AMP = "HEAT_AMP",
  CRYO_AMP = "CRYO_AMP",
  NATURE_AMP = "NATURE_AMP",
  ELECTRIC_AMP = "ELECTRIC_AMP",
  PHYSICAL_AMP = "PHYSICAL_AMP",
  ARTS_AMP = "ARTS_AMP",
  INFLICTION = "INFLICTION",
  REACTION = "REACTION",
  ARTS_REACTION = "ARTS_REACTION",
  /** Same-element infliction stacking. Not directly applicable — triggered automatically. */
  ARTS_BURST = "ARTS_BURST",
  /** Self-referential stack count within a stack reaction. */
  STACKS = "STACKS",
  /** Movement speed reduction (percentage, e.g. 0.8 = 80% slow). */
  SLOW = "SLOW",
  /** Stagger frailty — non-zero while enemy is in any stagger state. Used in HAVE conditions. */
  STAGGER_FRAILTY = "STAGGER_FRAILTY",
  /** Arts/elemental susceptibility debuff on enemy. Qualified by element (ARTS = all arts elements). */
  SUSCEPTIBILITY = "SUSCEPTIBILITY",
  /** Elemental/skill damage bonus. Qualified by element or skill type. */
  DAMAGE_BONUS = "DAMAGE_BONUS",
  /** Damage taken bonus (enemy debuff). Qualified by element. */
  DAMAGE_TAKEN_BONUS = "DAMAGE_TAKEN_BONUS",
  /** Damage reduction buff on operator. */
  PROTECTED = "PROTECTED",
  /** Damage reduction debuff on enemy. Qualified by element. Separate damage factor from SUSCEPTIBILITY. */
  FRAGILITY = "FRAGILITY",
  /** Damage reduction buff on operator (in-game: Sanctuary). */
  SANCTUARY = "SANCTUARY",
  /** Absorptive shield barrier on operator. */
  SHIELD = "SHIELD",
  /** Damage dealt reduction debuff on enemy (in-game: Weakness). */
  WEAKNESS = "WEAKNESS",

  // Structural
  /** Generic endpoint — meaning depends on context (UNTIL END = end of segment/event). */
  END = "END",
  /** A segment within an event (for UNTIL END OF THIS SEGMENT). */
  SEGMENT = "SEGMENT",

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
  /** Enemy HP as a percentage of max HP (0–100). Used with HAVE for threshold conditions. */
  PERCENTAGE_HP = "PERCENTAGE_HP",
  /** Operator potential level (0–5). Used with HAVE for potential-gated effects. */
  POTENTIAL = "POTENTIAL",

  // States (for IS/BECOME verbs)
  ACTIVE = "ACTIVE",
  /** The operator is currently controlled by the player. */
  CONTROLLED_STATE = "CONTROLLED",

  // Supplied parameters (user-input runtime values)
  /** A user-supplied parameter (e.g. ENEMY_HIT). Used as condition subject. */
  PARAMETER = "PARAMETER",

  // Value resolution
  /** A raw operator stat reference (used in ValueStat). */
  STAT = "STAT",
  /** Skill level of the owning operator (1-indexed, 1–12 → array[0–11]). */
  SKILL_LEVEL = "SKILL_LEVEL",
  /** Status level — distinct from stacks; a status can have 1 stack at varying levels. */
  STATUS_LEVEL = "STATUS_LEVEL",
  /** Talent level of the current event's talent slot (resolved from operator's talent key-map). */
  TALENT_LEVEL = "TALENT_LEVEL",
  /** Attribute increase level of an operator (0–4). */
  ATTRIBUTE_INCREASE_LEVEL = "ATTRIBUTE_INCREASE_LEVEL",
  // Event categories (replaces )
  PHYSICAL_INFLICTION = "PHYSICAL_INFLICTION",
  PHYSICAL_STATUS = "PHYSICAL_STATUS",
  TALENT = "TALENT",
  SKILL_STATUS = "SKILL_STATUS",
  WEAPON_STATUS = "WEAPON_STATUS",
  GEAR_STATUS = "GEAR_STATUS",
  GEAR_SET_EFFECT = "GEAR_SET_EFFECT",
  GEAR_SET_STATUS = "GEAR_SET_STATUS",
  CONSUMABLE = "CONSUMABLE",
  TACTICAL = "TACTICAL",
}

// ── Subject ─────────────────────────────────────────────────────────────────

/** Subject position — any noun can be a subject. */
export type SubjectType = NounType;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const SubjectType = NounType;

// ── Target ──────────────────────────────────────────────────────────────────

/** A determiner+noun pair identifying a target entity (e.g. THIS OPERATOR, ENEMY). */
export interface DslTarget {
  determiner?: DeterminerType;
  noun: NounType;
}

// ── Verb ────────────────────────────────────────────────────────────────────

export enum VerbType {
  // ── Compound (structural wrappers, can nest) ────────────────────────────
  /** Evaluate all predicates in order, execute each one that passes. Optional cardinality (ALL LESS_THAN_EQUAL 4). */
  ALL = "ALL",
  /** Evaluate predicates in order, execute the first that passes. */
  ANY = "ANY",
  /** Probability gate — wraps child effects with an RNG check (resolved per CritMode). */
  CHANCE = "CHANCE",

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
  /** Subtract from a resource or duration (REDUCE COOLDOWN BY 2 SECOND). */
  REDUCE = "REDUCE",

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
  /** Enable a specific skill variant by ID (e.g. ENABLE FLAMING_CINDERS_BATK_ENHANCED BATK OF THIS OPERATOR). */
  ENABLE = "ENABLE",
  /** Disable a specific skill variant by ID (e.g. DISABLE FLAMING_CINDERS_BATK BATK OF THIS OPERATOR). */
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

  // ── Value node (used in ValueLiteral/ValueVariable) ─────────────────────
  /** Variable lookup — value depends on skill level, potential, talent level, etc. */
  VARY_BY = "VARY_BY",
}

/** Physical status types — objects of APPLY, moved from VerbType. */
export enum PhysicalStatusType {
  LIFT = "LIFT",
  KNOCK_DOWN = "KNOCK_DOWN",
  BREACH = "BREACH",
  CRUSH = "CRUSH",
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
  ARTS = "ARTS",

  // Arts reaction adjectives (APPLY 1 <adj> REACTION TO ENEMY)
  COMBUSTION = "COMBUSTION",
  SOLIDIFICATION = "SOLIDIFICATION",
  CORROSION = "CORROSION",
  ELECTRIFICATION = "ELECTRIFICATION",

  // State adjectives:
  //   IS <adj>     = existence check (is the entity currently in this state?)
  //   BECOME <adj> = transition trigger (did the entity just enter/leave this state?)
  // Stat-based states (SLOWED, STAGGERED) use the stat accumulator for both.
  // Column-based states (LIFTED, COMBUSTED, etc.) check active events on their column.
  SLOWED = "SLOWED",
  LIFTED = "LIFTED",
  KNOCKED_DOWN = "KNOCKED_DOWN",
  CRUSHED = "CRUSHED",
  COMBUSTED = "COMBUSTED",
  CORRODED = "CORRODED",
  ELECTRIFIED = "ELECTRIFIED",
  SOLIDIFIED = "SOLIDIFIED",
  BREACHED = "BREACHED",

  // Element-infliction state adjectives — entity has an active infliction event on the given element column.
  CRYO_INFLICTED = "CRYO_INFLICTED",
  HEAT_INFLICTED = "HEAT_INFLICTED",
  NATURE_INFLICTED = "NATURE_INFLICTED",
  ELECTRIC_INFLICTED = "ELECTRIC_INFLICTED",
  /**
   * Entity has any arts-element infliction active (any of the four element columns).
   * Multi-column state — requires STATE_TO_COLUMNS (plural) support in the trigger index
   * and condition evaluator before first use.
   */
  ARTS_INFLICTED = "ARTS_INFLICTED",
  /** Entity has an active Vulnerable physical infliction. */
  VULNERABLE_INFLICTED = "VULNERABLE_INFLICTED",

  // Physical reaction adjectives (APPLY 1 <adj> REACTION TO ENEMY)
  LIFT = "LIFT",
  KNOCK_DOWN = "KNOCK_DOWN",
  BREACH = "BREACH",
  CRUSH = "CRUSH",

  // Reaction modifier adjectives (APPLY 1 FORCED <reaction> REACTION TO ENEMY)
  FORCED = "FORCED",

  // Stagger adjectives (ENEMY BECOME STAGGERED, ENEMY IS NODE_STAGGERED/FULL_STAGGERED)
  STAGGERED = "STAGGERED",
  NODE_STAGGERED = "NODE_STAGGERED",
  FULL_STAGGERED = "FULL_STAGGERED",

  // Time stop adjectives (APPLY <adj> TIME_STOP FOR <duration>)
  DODGE = "DODGE",
  ANIMATION = "ANIMATION",

  // Enhancement qualifiers (PERFORM EMPOWERED BATTLE_SKILL)
  NORMAL = "NORMAL",
  ENHANCED = "ENHANCED",
  EMPOWERED = "EMPOWERED",
  MINOR = "MINOR",

  // Stat filter/threshold adjectives (RECOVER HP TO ANY OPERATOR WITH filter { LOWEST HP STAT })
  LOWEST = "LOWEST",
  HIGHEST = "HIGHEST",
  /** At maximum capacity (e.g. CONTROLLED OPERATOR HAVE FULL HP). */
  FULL = "FULL",

  // Stacks-reference qualifier (for ValueStatus in CONSUME-triggered effects):
  //   `{ verb: IS, object: STACKS, objectQualifier: CONSUMED }` resolves to the
  //   number of stacks consumed by the triggering CONSUME effect. Used when an
  //   APPLY following CONSUME wants to scale by the consumed count.
  CONSUMED = "CONSUMED",
}

// ── Object ──────────────────────────────────────────────────────────────────

/** Object position — nouns or adjectives (e.g. ENEMY IS BREACHED, APPLY COMBUSTION REACTION). */
export type ObjectType = NounType | AdjectiveType;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const ObjectType = { ...NounType, ...AdjectiveType } as typeof NounType & typeof AdjectiveType;

/**
 * Verb → valid object type chaining map.
 * Defines which NounType/ObjectType values each verb can take as its object.
 */
export const VERB_OBJECTS: Partial<Record<VerbType, ObjectType[]>> = {
  [VerbType.APPLY]:      [ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.ARTS_BURST, ObjectType.STATUS, ObjectType.STAT, ObjectType.STAGGER, ObjectType.SUSCEPTIBILITY, ObjectType.FRAGILITY, ObjectType.TIME_STOP, ObjectType.EVENT],
  [VerbType.CONSUME]:    [ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.STATUS, ObjectType.SKILL_POINT, ObjectType.ULTIMATE_ENERGY, ObjectType.COOLDOWN, ObjectType.STAGGER, ObjectType.STACKS, ObjectType.EVENT, ObjectType.SKILL],
  [VerbType.RECOVER]:    [ObjectType.SKILL_POINT, ObjectType.ULTIMATE_ENERGY, ObjectType.HP],
  [VerbType.RETURN]:     [ObjectType.SKILL_POINT],
  [VerbType.DEAL]:       [ObjectType.DAMAGE, ObjectType.STAGGER],
  [VerbType.PERFORM]:    [ObjectType.SKILL, ObjectType.NORMAL_ATTACK, ObjectType.CHARGE, ObjectType.CRITICAL_HIT],
  [VerbType.HIT]:        [ObjectType.ENEMY],
  [VerbType.DEFEAT]:     [ObjectType.ENEMY],
  [VerbType.REFRESH]:    [ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION],
  [VerbType.EXTEND]:     [ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION],
  [VerbType.MERGE]:      [ObjectType.STATUS, ObjectType.INFLICTION],
  [VerbType.RESET]:      [ObjectType.STACKS],
  [VerbType.IGNORE]:     [ObjectType.STATUS, ObjectType.STAT, ObjectType.ULTIMATE_ENERGY],
  [VerbType.ENABLE]:     [ObjectType.SKILL],
  [VerbType.DISABLE]:    [ObjectType.SKILL],
  [VerbType.EXPERIENCE]: [ObjectType.GAME_TIME, ObjectType.REAL_TIME],
  [VerbType.HAVE]:       [ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.STACKS, ObjectType.SKILL_POINT, ObjectType.ULTIMATE_ENERGY, ObjectType.HP, ObjectType.POTENTIAL, ObjectType.CHARGE],
  [VerbType.IS]:         [ObjectType.ACTIVE, ObjectType.CONTROLLED_STATE, ObjectType.SLOWED, ObjectType.STAGGERED, ObjectType.LIFTED, ObjectType.KNOCKED_DOWN, ObjectType.CRUSHED, ObjectType.BREACHED, ObjectType.COMBUSTED, ObjectType.CORRODED, ObjectType.ELECTRIFIED, ObjectType.SOLIDIFIED, ObjectType.CRYO_INFLICTED, ObjectType.HEAT_INFLICTED, ObjectType.NATURE_INFLICTED, ObjectType.ELECTRIC_INFLICTED, ObjectType.ARTS_INFLICTED, ObjectType.VULNERABLE_INFLICTED, ObjectType.NODE_STAGGERED, ObjectType.FULL_STAGGERED, ObjectType.STACKS],
  [VerbType.BECOME]:     [ObjectType.STACKS, ObjectType.ACTIVE, ObjectType.STAGGERED, ObjectType.SLOWED, ObjectType.LIFTED, ObjectType.KNOCKED_DOWN, ObjectType.CRUSHED, ObjectType.BREACHED, ObjectType.COMBUSTED, ObjectType.CORRODED, ObjectType.ELECTRIFIED, ObjectType.SOLIDIFIED, ObjectType.CRYO_INFLICTED, ObjectType.HEAT_INFLICTED, ObjectType.NATURE_INFLICTED, ObjectType.ELECTRIC_INFLICTED, ObjectType.ARTS_INFLICTED, ObjectType.VULNERABLE_INFLICTED, ObjectType.NODE_STAGGERED, ObjectType.FULL_STAGGERED],
  [VerbType.RECEIVE]:    [ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.STAGGER],
  [VerbType.OVERHEAL]:   [ObjectType.HP],
  [VerbType.REDUCE]:     [ObjectType.COOLDOWN],
};

/** Valid objects for the EXPERIENCE verb (segment time dependency). */
export const EXPERIENCE_OBJECTS: ObjectType[] = [
  ObjectType.GAME_TIME,
  ObjectType.REAL_TIME,
];

/** Valid object qualifiers per object type (noun adjuncts like NORMAL_ATTACK, FINAL_STRIKE handled separately). */
export const OBJECT_QUALIFIERS: Partial<Record<ObjectType, (AdjectiveType | NounType)[]>> = {
  [ObjectType.DAMAGE]: [
    // Element prefix: DEAL HEAT DAMAGE, DEAL PHYSICAL DAMAGE
    AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL,
  ],
  [ObjectType.INFLICTION]: [
    AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL, AdjectiveType.ARTS,
  ],
  [ObjectType.REACTION]: [
    // Arts reactions
    AdjectiveType.COMBUSTION, AdjectiveType.SOLIDIFICATION, AdjectiveType.CORROSION, AdjectiveType.ELECTRIFICATION,
    // Physical reactions
    AdjectiveType.LIFT, AdjectiveType.KNOCK_DOWN, AdjectiveType.BREACH, AdjectiveType.CRUSH,
  ],
  [ObjectType.STATUS]: [
    // Physical statuses (APPLY LIFT STATUS TO ENEMY)
    AdjectiveType.LIFT, AdjectiveType.KNOCK_DOWN, AdjectiveType.BREACH, AdjectiveType.CRUSH,
  ],
  [ObjectType.TIME_STOP]: [
    NounType.COMBO, AdjectiveType.DODGE, AdjectiveType.ANIMATION,
  ],
  [ObjectType.STAGGER]: [
    AdjectiveType.NODE_STAGGERED, AdjectiveType.FULL_STAGGERED,
  ],
  [ObjectType.AMP]: [
    AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL,
  ],
  [ObjectType.NORMAL_ATTACK]: [
    AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL,
  ],
  [ObjectType.FINAL_STRIKE]: [
    AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL,
  ],
};

/** Objects whose object qualifier is required (no empty "—" option in dropdown). */
export const OBJECT_REQUIRED_QUALIFIER = new Set<string>([ObjectType.DAMAGE]);

/** Default object qualifier for objects that require one. */
export const OBJECT_DEFAULT_QUALIFIER: Partial<Record<ObjectType, AdjectiveType>> = {
  [ObjectType.DAMAGE]: AdjectiveType.PHYSICAL,
};

/**
 * Valid unit types per noun.
 * Defines what units a noun's value can be expressed in.
 */
export const NOUN_UNITS: Partial<Record<NounType, UnitType[]>> = {
  [NounType.COOLDOWN]: [UnitType.SECOND, UnitType.PERCENTAGE],
  [NounType.GAME_TIME]: [UnitType.SECOND],
  [NounType.REAL_TIME]: [UnitType.SECOND],
  [NounType.HP]: [UnitType.FLAT, UnitType.PERCENTAGE],
  [NounType.STAGGER]: [UnitType.FLAT],
  [NounType.ULTIMATE_ENERGY]: [UnitType.FLAT, UnitType.PERCENTAGE],
  [NounType.SKILL_POINT]: [UnitType.FLAT],
  [NounType.STACKS]: [UnitType.STACK],
  [NounType.INFLICTION]: [UnitType.STACK],
  [NounType.DAMAGE]: [UnitType.FLAT, UnitType.PERCENTAGE, UnitType.MULTIPLIER],
  [NounType.SLOW]: [UnitType.PERCENTAGE],
  [NounType.SUSCEPTIBILITY]: [UnitType.PERCENTAGE],
  [NounType.FRAGILITY]: [UnitType.PERCENTAGE],
  [NounType.DAMAGE_BONUS]: [UnitType.PERCENTAGE],
};

/**
 * Valid object qualifiers per noun — combined map for both adjective qualifiers
 * and skill/stat category qualifiers.
 * Skill types (COMBO, BATTLE, etc.) and element adjectives both use objectQualifier.
 */
export const OBJECT_QUALIFIER_MAPPING: Partial<Record<NounType, (AdjectiveType | NounType | DeterminerType)[]>> = {
  [NounType.DAMAGE_BONUS]: [AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL, AdjectiveType.ARTS, NounType.BASIC_ATTACK, NounType.BATTLE, NounType.COMBO, NounType.ULTIMATE, NounType.STAGGER, NounType.SKILL, NounType.FINAL_STRIKE],
  [NounType.DAMAGE_TAKEN_BONUS]: [AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL, AdjectiveType.ARTS],
  [NounType.SKILL]: [AdjectiveType.NORMAL, AdjectiveType.ENHANCED, AdjectiveType.EMPOWERED],
  [NounType.HP]: [AdjectiveType.LOWEST, AdjectiveType.HIGHEST, AdjectiveType.FULL],
};

/**
 * Determiners that support a `filter` in the `with` block to narrow target selection.
 * e.g. `RECOVER HP TO ANY OPERATOR WITH filter { objectQualifier: LOWEST, objectId: HP, object: STAT }`.
 */
export const DETERMINER_FILTER_SUPPORT: DeterminerType[] = [
  DeterminerType.ANY,
];

/**
 * Valid "OF" object targets per noun.
 * Defines what a noun's value can belong to via the OF preposition.
 * e.g. "REDUCE COOLDOWN OF THIS OPERATOR", "REDUCE COOLDOWN OF EVENT".
 */
export const NOUN_POSSESSOR_MAPPING: Partial<Record<NounType, NounType[]>> = {
  [NounType.STACKS]: [NounType.EVENT, NounType.STATUS],
  [NounType.COOLDOWN]: [NounType.OPERATOR, NounType.EVENT, NounType.SKILL],
  [NounType.SKILL_LEVEL]: [NounType.OPERATOR],
  [NounType.TALENT_LEVEL]: [NounType.OPERATOR],
  [NounType.STAT]: [NounType.OPERATOR],
  [NounType.SKILL]: [NounType.OPERATOR],
};

/**
 * Valid object nouns per verb.
 * Defines which nouns a verb can take as its object via the BY preposition.
 * e.g. "RECOVER HP TO THIS OPERATOR BY [value]".
 */
export const VERB_OBJECT_MAPPING: Partial<Record<VerbType, NounType[]>> = {
  [VerbType.RECOVER]: [NounType.HP, NounType.SKILL_POINT, NounType.ULTIMATE_ENERGY],
};

// ── Cardinality Constraint ───────────────────────────────────────────────────

export enum CardinalityConstraintType {
  /** == N */
  EXACTLY = "EXACTLY",
  /** > N */
  GREATER_THAN = "GREATER_THAN",
  /** >= N */
  GREATER_THAN_EQUAL = "GREATER_THAN_EQUAL",
  /** < N */
  LESS_THAN = "LESS_THAN",
  /** <= N */
  LESS_THAN_EQUAL = "LESS_THAN_EQUAL",
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
  /** Specific identifier for the subject (e.g. status ID: "AUXILIARY_CRYSTAL"). */
  subjectId?: string;
  /** Possessive — "This Operator's ULTIMATE". Used with IS and OVERHEAL. */
  subjectProperty?: ObjectType;
  /** OF — possessor: "[STATUS] OF [CONTROLLED OPERATOR]". */
  of?: OfClause;
  verb: VerbType;
  /** NOT — "IS NOT ACTIVE". */
  negated?: boolean;
  object: ObjectType;
  /** Specific identifier (StatusType, skill name, etc.). */
  objectId?: string;
  /** Object qualifier — element or type modifier (e.g. HEAT, PHYSICAL, CRYO, COMBO_SKILL). */
  objectQualifier?: AdjectiveType | NounType;
  /** Constraint type for cardinality assertions (EXACTLY, GREATER_THAN_EQUAL, LESS_THAN_EQUAL, etc.). */
  cardinalityConstraint?: CardinalityConstraintType;
  /** The count N in a cardinality assertion. */
  value?: ValueNode;
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
  /** Cardinality limit: "ALL *FOR* LESS_THAN_EQUAL 4" — how many times a compound action can occur. */
  FOR = "FOR",
  /** Duration cap: "EXTEND LIFT STATUS ON ENEMY *UNTIL* END". */
  UNTIL = "UNTIL",
  /** Ownership/possession: "REDUCE COOLDOWN *OF* BATTLE_SKILL". */
  OF = "OF",
  /** Amount: "REDUCE COOLDOWN *BY* 2 SECOND". */
  BY = "BY",
}

/**
 * Valid prepositions per verb.
 * Defines which prepositions a verb can take.
 */
export const VERB_PREPOSITION_MAPPING: Partial<Record<VerbType, PrepositionType[]>> = {
  [VerbType.REDUCE]: [PrepositionType.BY],
  [VerbType.APPLY]: [PrepositionType.WITH],
  [VerbType.RECOVER]: [PrepositionType.BY],
  [VerbType.EXTEND]: [PrepositionType.UNTIL],
};

// ── OF clause (possessor chain) ─────────────────────────────────────────────

/**
 * Recursive possessor clause — "X of Y of Z".
 *
 * Examples:
 *   { determiner: "THIS", object: "OPERATOR" }                          — of THIS OPERATOR
 *   { object: "STATUS", objectId: "INFLICTION", objectQualifier: "CRYO",
 *     of: { determiner: "THIS", object: "ENEMY" } }                     — of CRYO INFLICTION STATUS of THIS ENEMY
 *   { object: "SKILL", objectId: "COMBO" }                              — of COMBO SKILL
 */
export interface OfClause {
  /** Determiner for this possessor (THIS, SOURCE, CONTROLLED, etc.). */
  determiner?: DeterminerType;
  /** The possessor noun type. */
  object: NounType | string;
  /** Specific identifier for the possessor (e.g. status ID, skill category). */
  objectId?: string;
  /** Qualifier for the possessor (e.g. element adjective). */
  objectQualifier?: AdjectiveType;
  /** Chained possessor — the next "of" in the chain. */
  of?: OfClause;
}

// ── Value expression tree ────────────────────────────────────────────────────

/** Binary operators for composing values in the expression tree. */
export enum ValueOperation {
  MULT        = "MULT",
  ADD         = "ADD",
  SUB         = "SUB",
  INTEGER_DIV = "INTEGER_DIV",
  MIN         = "MIN",
  MAX         = "MAX",
}

/** Leaf node: a literal numeric value. */
export interface ValueLiteral {
  verb: VerbType.IS;
  value: number;
}

/**
 * Leaf node: a variable lookup — indexed table.
 *
 * The `value` array is indexed by the dependency (SKILL_LEVEL → 12 entries, POTENTIAL → 6).
 * When `of.determiner` is set (e.g. SOURCE), the lookup uses that operator's context instead of THIS.
 */
export interface ValueVariable {
  verb: VerbType.VARY_BY;
  object: string;
  value?: number | number[];
  /** Possessor chain — whose context to resolve against. */
  of?: OfClause;
}

/**
 * Leaf node: a raw stat reference.
 *
 * Resolves to the operator's current stat value (e.g. INTELLECT, STRENGTH).
 *
 * Two forms:
 *   Existing: { verb: IS, object: STAT, objectId: "INTELLECT" }
 *   Extended: { verb: IS, valueType: STAT, stat: "STRENGTH", of: { determiner: "SOURCE", object: "OPERATOR" } }
 */
export interface ValueStat {
  verb: VerbType.IS;
  /** Existing form: object is NounType.STAT. */
  object?: NounType.STAT;
  /** Existing form: stat key. */
  objectId?: string;
  /** Extended form: discriminator indicating this is a stat reference. */
  valueType?: NounType.STAT;
  /** Extended form: stat key. */
  stat?: string;
  /** Possessor chain — whose stat to look up. */
  of?: OfClause;
}

/**
 * Leaf node: a runtime status query.
 *
 * Resolves to a property of an active status on the timeline (e.g. stack count).
 * { verb: IS, object: STACKS, of: { object: STATUS, objectId: "INFLICTION", objectQualifier: "CRYO",
 *   of: { determiner: THIS, object: ENEMY } } }
 */
export interface ValueStatus {
  verb: VerbType.IS;
  /** The status property to read (STACKS). */
  object: NounType.STACKS;
  /** Possessor chain — which status and whose entity. */
  of?: OfClause;
}

/** Binary operation node: applies an operation to two operands. */
export interface ValueExpression {
  operation: ValueOperation;
  left: ValueNode;
  right: ValueNode;
}

/**
 * Leaf node: a boolean identity comparison between two entity references.
 *
 * Resolves to 1 when the subject and object reference the same entity, else 0.
 * Typical use: gate a value on "is the THIS operator the same as the SOURCE operator?"
 *
 * { verb: IS, subject: "OPERATOR", subjectDeterminer: "THIS",
 *   object: "OPERATOR", objectDeterminer: "SOURCE" }
 */
export interface ValueIdentity {
  verb: VerbType.IS;
  subject: NounType;
  subjectDeterminer: DeterminerType;
  object: NounType;
  objectDeterminer: DeterminerType;
}

/**
 * A value in the DSL — a literal, a variable lookup, a stat reference, or a binary expression.
 *
 * Examples:
 *   { verb: "IS", value: 15 }
 *   { verb: "VARY_BY", object: "SKILL_LEVEL", value: [0.5, 0.6, ...] }
 *   { verb: "IS", object: "STAT", objectId: "INTELLECT" }
 *   { operation: "MULT", left: { verb: "IS", value: 7.5 }, right: { verb: "IS", object: "STAT", objectId: "INTELLECT" } }
 */
export type ValueNode = ValueLiteral | ValueVariable | ValueStat | ValueStatus | ValueIdentity | ValueExpression;

// ── Type guards ─────────────────────────────────────────────────────────────

export function isValueLiteral(node: ValueNode): node is ValueLiteral {
  return node != null && typeof node === 'object' && 'verb' in node && node.verb === VerbType.IS && !('object' in node) && !('valueType' in node);
}

export function isValueVariable(node: ValueNode): node is ValueVariable {
  return node != null && typeof node === 'object' && 'verb' in node && node.verb === VerbType.VARY_BY;
}

export function isValueStat(node: ValueNode): node is ValueStat {
  if (node == null || typeof node !== 'object') return false;
  if (!('verb' in node) || node.verb !== VerbType.IS) return false;
  if ('object' in node && (node as ValueStat).object === NounType.STAT) return true;
  if ('valueType' in node && (node as ValueStat).valueType === NounType.STAT) return true;
  return false;
}

export function isValueStatus(node: ValueNode): node is ValueStatus {
  if (node == null || typeof node !== 'object') return false;
  if (!('verb' in node) || node.verb !== VerbType.IS) return false;
  return 'object' in node && (node as ValueStatus).object === NounType.STACKS;
}

export function isValueIdentity(node: ValueNode): node is ValueIdentity {
  if (node == null || typeof node !== 'object') return false;
  if (!('verb' in node) || node.verb !== VerbType.IS) return false;
  return 'subject' in node && 'subjectDeterminer' in node && 'objectDeterminer' in node;
}

export function isValueExpression(node: ValueNode): node is ValueExpression {
  return node != null && typeof node === 'object' && 'operation' in node;
}

// ── Legacy aliases ───────────────────────────────────────────────────────────

/** Leaf ValueNode — a literal, variable lookup, or stat reference (excludes expressions). */
export type WithValue = ValueLiteral | ValueVariable | ValueStat;

/**
 * WITH preposition map — all properties/cardinalities of an effect.
 *
 * Each key is a named property whose value is a ValueNode expression tree.
 *
 * Key hierarchy:
 *   value            — additive amount (e.g. RECOVER 100 SKILL_POINT, APPLY STAT +20 STRENGTH)
 *   duration         — seconds (e.g. TIME_STOP, REACTION, STATUS duration)
 *   multiplier       — multiplicative factor (e.g. APPLY STAT SUSCEPTIBILITY ×1.2 for T2 Cryogenic Embrittlement)
 *   stagger          — stagger amount
 *   skillPoint       — SP value
 *   stacks           — stack count (STATUS, INFLICTION, ARTS_REACTION)
 */
export type WithPreposition = Record<string, ValueNode>;

/** UNTIL preposition — "UNTIL END OF THIS SEGMENT". */
export interface UntilPreposition {
  /** The object of the UNTIL clause — NounType.END. */
  object: NounType.END;
  /** Possessor — what "END" refers to (SEGMENT or EVENT). */
  of: OfClause;
}

// ── Effect ──────────────────────────────────────────────────────────────────

/**
 * A Verb-Object sentence with optional object qualifier and prepositional phrases.
 *
 * Used for effects within predicates and on frames.
 * No subject — the actor is implicit (the system/event owner).
 *
 * Grammar: VERB [objectQualifier] OBJECT [prepositions...]
 *
 * Examples:
 *   PERFORM HEAT DAMAGE TO ENEMY WITH MULTIPLIER VARY_BY SKILL_LEVEL [0.5, ...]
 *   APPLY FORCED COMBUSTION REACTION TO ENEMY WITH STATUS_LEVEL IS 1
 *   APPLY COMBO TIME_STOP WITH DURATION IS 0.566
 *   RECOVER SKILL_POINT WITH CARDINALITY IS 20
 *   APPLY HEAT INFLICTION TO ENEMY WITH STACKS IS 1
 *   CONSUME HEAT INFLICTION FROM ENEMY WITH STACKS IS 1
 *
 * Compound effects use ALL/ANY as structural wrappers:
 *   ALL FOR LESS_THAN_EQUAL MAX:
 *     [unconditional]:
 *       CONSUME HEAT INFLICTION FROM ENEMY WITH STACKS IS 1
 *       APPLY MELTING_FLAME STATUS TO THIS_OPERATOR WITH STACKS IS 1
 */
export interface Effect {
  verb: VerbType;
  object?: ObjectType;
  /** Specific identifier (StatusType, skill name, etc.). */
  objectId?: string;
  /** Object qualifier — modifies the object (e.g. COMBUSTION REACTION, HEAT DAMAGE, COMBO_SKILL DAMAGE_BONUS). */
  objectQualifier?: AdjectiveType | NounType;
  /** Constraint on cardinality (LESS_THAN_EQUAL, GREATER_THAN_EQUAL, EXACTLY, etc.) — for compound ALL/ANY grouping. */
  cardinalityConstraint?: CardinalityConstraintType;
  /** Value for compound constraints (e.g. ALL LESS_THAN_EQUAL MAX). */
  value?: ValueNode | typeof THRESHOLD_MAX;
  /** TO — target/recipient. */
  to?: SubjectType | string;
  /** Determiner for TO target (THIS, OTHER, ALL, ANY). */
  toDeterminer?: DeterminerType;
  /** Class filter for TO target (e.g. "GUARD"). */
  toClassFilter?: string;
  /** FROM — source. */
  from?: SubjectType | string;
  /** Determiner for FROM source (THIS, OTHER, ALL, ANY). */
  fromDeterminer?: DeterminerType;
  /** ON — stat target entity (e.g. IGNORE HEAT_RESISTANCE ON ENEMY). */
  onObject?: SubjectType | string;
  /** Determiner for ON target (THIS, OTHER, ALL, ANY). */
  onDeterminer?: DeterminerType;
  /** WITH — properties of this effect (duration, stacks, value, multiplier, etc.). */
  with?: WithPreposition;
  /** FOR — cardinality limit on compound actions: "ALL FOR LESS_THAN_EQUAL 4". */
  for?: { cardinalityConstraint: CardinalityConstraintType; value: ValueNode | typeof THRESHOLD_MAX };
  /** UNTIL — duration cap: "EXTEND STATUS UNTIL END OF THIS SEGMENT". */
  until?: UntilPreposition;
  /** OF — ownership/possession: "REDUCE COOLDOWN OF COMBO SKILL". */
  of?: OfClause;
  /** BY — amount: "REDUCE COOLDOWN BY PERCENTAGE VALUE IS 2". */
  by?: { unit: UnitType; value: ValueNode };

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

  /**
   * Alternative effects for CHANCE — executed when the pin resolves to miss.
   * CHANCE execution is pin-driven, not probability-weighted:
   *   ALWAYS              — main `effects` fire; `elseEffects` skipped
   *   NEVER               — `elseEffects` fire; main `effects` skipped
   *   MANUAL / EXPECTED   — per-frame `isChance` pin drives the branch, with
   *                         unpinned frames defaulting to MISS (elseEffects)
   *
   * The probability ValueNode in `with.value` is display-only — it's shown in
   * the UI to tell the user the chance of the hit branch firing, but does NOT
   * weight the effects. Resource side-effects in the fired branch apply at
   * full strength; binary side-effects fire fully when their branch fires.
   */
  elseEffects?: Effect[];

  /**
   * When true, the created status inherits its duration from the parent event's
   * remaining duration instead of using the status config's fixed duration.
   * Used by freeform status placement so user-resized segments propagate to the
   * derived status effect.
   */
  inheritDuration?: boolean;
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
 * - ObjectQualifier: if required specifies objectQualifier, published must include it.
 * - Negated: must match.
 * - Cardinality: ignored for matching (cardinality is an assertion, not a filter).
 */
export function matchInteraction(published: Interaction, required: Interaction): boolean {
  // Subject: ANY/ANY_OTHER determiner on OPERATOR matches any operator subject
  const reqDet = required.subjectDeterminer ?? DeterminerType.THIS;
  const reqIsAnyOperator = required.subject === NounType.OPERATOR
    && (reqDet === DeterminerType.ANY || reqDet === DeterminerType.ANY_OTHER);
  if (!reqIsAnyOperator && published.subject !== required.subject) return false;
  // When both are OPERATOR, check determiner match (unless required is ANY/ANY_OTHER)
  if (!reqIsAnyOperator && published.subject === NounType.OPERATOR && required.subject === NounType.OPERATOR) {
    const pubDet = published.subjectDeterminer ?? DeterminerType.THIS;
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
  if (!i.subject) {
    subject = '';
  } else if (i.subject === NounType.OPERATOR) {
    const det = i.subjectDeterminer ?? DeterminerType.THIS;
    subject = det === DeterminerType.THIS ? '' : `${fmt(det)} Operator `;
  } else {
    subject = fmt(i.subject) + ' ';
  }

  const verb = i.verb ? fmt(i.verb) : '';
  const obj = i.object ? fmt(i.object) : '';
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

// ── Qualified ID utilities ──────────────────────────────────────────────────

/**
 * Flatten a qualifier + base noun into a qualified ID.
 * e.g. flattenQualifiedId("CRYO", "AMP") → "CRYO_AMP"
 */
export function flattenQualifiedId(qualifier: string, baseId: string): string {
  return `${qualifier}_${baseId}`;
}

/**
 * Check if an ID is a qualified variant of a base noun.
 * e.g. isQualifiedId("CRYO_AMP", "AMP") → true
 *
 * Used by the damage formula layer (`damageTableBuilder.ts`) to detect
 * which element a qualified susceptibility id refers to.
 *
 * NOTE: there is no `unflattenQualifiedId`. The engine does not split
 * qualified status IDs back into components — qualified IDs are
 * first-class column IDs throughout the pipeline.
 */
export function isQualifiedId(id: string, baseId: string): boolean {
  return id.endsWith(`_${baseId}`) && id.length > baseId.length + 1;
}

/** Verbs available for effects (alphabetical, ANY disabled). */
export const EFFECT_VERBS = [
  VerbType.ALL, // VerbType.ANY,
  VerbType.APPLY, VerbType.CHANCE, VerbType.CONSUME, VerbType.DEAL,
  VerbType.DISABLE, VerbType.ENABLE, VerbType.EXTEND,
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
const NEEDS_OBJECT_ID = new Set<string>([ObjectType.STATUS, ObjectType.INFLICTION, ObjectType.REACTION, ObjectType.COOLDOWN, ObjectType.STAT, ObjectType.SKILL]);

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
const NEEDS_TO = new Set([VerbType.APPLY, VerbType.RECOVER, VerbType.RETURN]);
const NEEDS_FROM = new Set([VerbType.CONSUME]);
const NEEDS_ON = new Set([VerbType.EXTEND, VerbType.REFRESH, VerbType.MERGE, VerbType.IGNORE]);
const NEEDS_DURATION = new Set([VerbType.APPLY]);

/** Which fields are visible in the effect builder. */
export interface EffectFieldVisibility {
  showCardinality: boolean;
  showObjectQualifier: boolean;
  showObjectId: boolean;
  showObjectIdIsStatus: boolean;
  showObjectIdIsInfliction: boolean;
  showObjectIdIsReaction: boolean;
  showTo: boolean;
  showFrom: boolean;
  showOn: boolean;
  showOf: boolean;
  showBy: boolean;
  showDuration: boolean;
  showUntilEnd: boolean;
  showQualifierRow: boolean;
  withProperties: string[];
}

/** Compute effect field visibility based on current effect state. */
export function getEffectFieldVisibility(value: Effect): EffectFieldVisibility {
  const qualifiers = value.object ? (OBJECT_QUALIFIERS[value.object] ?? []) : [];
  const extraQualifiers = value.object ? (OBJECT_QUALIFIER_MAPPING[value.object as NounType] ?? []) : [];
  const showObjectId = NEEDS_OBJECT_ID.has(value.object ?? '');
  const showTo = NEEDS_TO.has(value.verb);
  const showFrom = NEEDS_FROM.has(value.verb);
  const showOn = NEEDS_ON.has(value.verb);
  const prepositions = VERB_PREPOSITION_MAPPING[value.verb] ?? [];
  const showOf = value.object ? (NOUN_POSSESSOR_MAPPING[value.object as NounType] ?? []).length > 0 : false;
  const showBy = prepositions.includes(PrepositionType.BY);
  const showDuration = NEEDS_DURATION.has(value.verb) && value.object === ObjectType.TIME_STOP;
  const showUntilEnd = value.verb === VerbType.EXTEND;

  return {
    showCardinality: new Set([VerbType.APPLY, VerbType.CONSUME, VerbType.RECOVER, VerbType.RETURN]).has(value.verb),
    showObjectQualifier: (qualifiers.length > 0 && value.object !== ObjectType.STATUS) || extraQualifiers.length > 0,
    showObjectId,
    showObjectIdIsStatus: value.object === ObjectType.STATUS,
    showObjectIdIsInfliction: value.object === ObjectType.INFLICTION,
    showObjectIdIsReaction: value.object === ObjectType.REACTION,
    showTo,
    showFrom,
    showOn,
    showOf,
    showBy,
    showDuration,
    showUntilEnd,
    showQualifierRow: showTo || showFrom || showOn || showOf || showBy || showDuration || showUntilEnd,
    withProperties: value.object ? getWithProperties(value.verb, value.object, value.objectId) : [],
  };
}

// ── WITH property resolution ────────────────────────────────────────────────

/** WITH property labels for UI display. */
export const WITH_PROPERTY_LABELS: Record<string, string> = {
  duration: 'Duration (s)',
  multiplier: 'Multiplier',
  stacks: 'Stacks',
  value: 'Value',
  isForced: 'Forced',
};

/** WITH properties that are boolean toggles (not numeric inputs). */
export const WITH_BOOLEAN_PROPERTIES = new Set(['isForced']);

/**
 * Object → valid targets. Defines which entities an object can be directed at.
 * Used by validators and the builder UI. Single-entry arrays are forced targets.
 */
export const OBJECT_TARGET_MAPPING: Partial<Record<ObjectType, SubjectType[]>> = {
  [ObjectType.STAGGER]:        [SubjectType.ENEMY],
  [ObjectType.INFLICTION]:     [SubjectType.ENEMY],
  [ObjectType.REACTION]:       [SubjectType.ENEMY],
  [ObjectType.ARTS_BURST]:     [SubjectType.ENEMY],
  [ObjectType.STATUS]:         [SubjectType.OPERATOR, SubjectType.ENEMY, NounType.TEAM],
  [ObjectType.SUSCEPTIBILITY]: [SubjectType.ENEMY],
  [ObjectType.FRAGILITY]:      [SubjectType.ENEMY],
  [ObjectType.PROTECTED]:      [SubjectType.OPERATOR, NounType.TEAM],
  [ObjectType.SANCTUARY]:      [SubjectType.OPERATOR],
  [ObjectType.SHIELD]:         [SubjectType.OPERATOR],
  [ObjectType.WEAKNESS]:       [SubjectType.ENEMY],
};

/**
 * Object → valid CONSUME sources. CONSUME has broader valid targets than APPLY —
 * e.g. operators can consume inflictions/reactions from themselves (Xaihi ult).
 */
export const CONSUME_TARGET_MAPPING: Partial<Record<ObjectType, SubjectType[]>> = {
  ...OBJECT_TARGET_MAPPING,
  [ObjectType.INFLICTION]:     [SubjectType.ENEMY, SubjectType.OPERATOR],
  [ObjectType.REACTION]:       [SubjectType.ENEMY, SubjectType.OPERATOR],
};

/**
 * Object → forced target. Objects that can only target a specific entity.
 * If an object is in this map, the TO target is auto-set and not user-selectable.
 * Derived from OBJECT_TARGET_MAPPING — single-entry arrays are forced.
 */
export const OBJECT_FORCED_TARGET: Partial<Record<ObjectType, SubjectType>> = Object.fromEntries(
  Object.entries(OBJECT_TARGET_MAPPING)
    .filter(([, targets]) => targets.length === 1)
    .map(([obj, targets]) => [obj, targets[0]]),
);

/**
 * Verb+Object → available WITH property keys.
 * Central source of truth for which properties a given combination supports.
 */
export const VERB_OBJECT_WITH_PROPERTIES: Record<string, Record<string, string[]>> = {
  [VerbType.APPLY]: {
    [ObjectType.STATUS]:          ['duration', 'stacks', 'value', 'multiplier'],
    [ObjectType.STAT]:            ['value', 'multiplier'],
    [ObjectType.INFLICTION]:      ['stacks'],
    [ObjectType.REACTION]:        [...Reaction.EDITABLE_PROPERTIES],
    [ObjectType.TIME_STOP]:       ['duration'],
    [ObjectType.STAGGER]:         ['value'],
    [ObjectType.SUSCEPTIBILITY]:  ['duration', 'value'],
  },
  [VerbType.DEAL]: {
    [ObjectType.DAMAGE]:     ['value'],
    [ObjectType.STAGGER]:    ['value'],
  },
  [VerbType.CONSUME]: {
    [ObjectType.STATUS]:     ['stacks'],
    [ObjectType.INFLICTION]: ['stacks'],
  },
  [VerbType.CHANCE]: { _default: ['value'] },
  [VerbType.EXTEND]:  { _default: ['duration'] },
  [VerbType.REFRESH]: { _default: ['duration'] },
  [VerbType.RECOVER]: { _default: ['stacks'] },
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
    const { getStatusWithProperties } = require('../controller/gameDataStore');
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
  [VerbType.CHANCE]: 'Chance',
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
  [VerbType.ENABLE]: 'Enable',
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
  [ObjectType.PERCENTAGE_HP]: 'HP %',
  [ObjectType.DAMAGE]: 'Damage',
  [ObjectType.TIME_STOP]: 'Time Stop',
  [ObjectType.GAME_TIME]: 'Game Time',
  [ObjectType.REAL_TIME]: 'Real Time',
  [ObjectType.BASIC_ATTACK]: 'Basic Attack',
  [ObjectType.BATTLE]: 'Battle Skill',
  [ObjectType.COMBO]: 'Combo Skill',
  [ObjectType.ULTIMATE]: 'Ultimate',
  [ObjectType.FINAL_STRIKE]: 'Final Strike',
  [ObjectType.NORMAL_ATTACK]: 'Normal Attack',
  [ObjectType.CHARGE]: 'Charge',
  [ObjectType.ACTIVE]: 'Active',
  [ObjectType.STAT]: 'Stat',
  [ObjectType.SKILL_LEVEL]: 'Skill Level',
  [ObjectType.TALENT_LEVEL]: 'Talent Level',
};

export const OBJECT_QUALIFIER_LABELS: Record<string, string> = Object.fromEntries(
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
  [CardinalityConstraintType.GREATER_THAN]: 'Greater Than',
  [CardinalityConstraintType.GREATER_THAN_EQUAL]: 'Greater Than or Equal',
  [CardinalityConstraintType.LESS_THAN]: 'Less Than',
  [CardinalityConstraintType.LESS_THAN_EQUAL]: 'Less Than or Equal',
};

