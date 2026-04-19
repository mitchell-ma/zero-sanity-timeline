import { t } from '../locales/locale';

export enum QueueFrameType {
  PROCESS_FRAME = 'PROCESS_FRAME',
  COMBO_RESOLVE = 'COMBO_RESOLVE',
  STATUS_EXIT = 'STATUS_EXIT',
}

export enum FrameHookType {
  EVENT_START = 'EVENT_START',
  EVENT_END = 'EVENT_END',
  SEGMENT_START = 'SEGMENT_START',
  SEGMENT_END = 'SEGMENT_END',
  // Phase 4a — synthetic-frame hook surface for the unified dispatcher.
  // These land as part of the dispatcher infrastructure; call sites are
  // switched over in Phases 4b (skill-level) / 4c (status) / 4d (reactive).
  /** Per-frame marker clause dispatch (replaces inline loops at :2155). */
  ON_FRAME = 'ON_FRAME',
  /** Reactive trigger firing (replaces handleEngineTrigger inline dispatch). */
  ON_TRIGGER = 'ON_TRIGGER',
  /** Status creation (onEntryClause) — runs once when a status event is applied. */
  STATUS_ENTRY = 'STATUS_ENTRY',
  /** Status passive clause — runs once per status instance at creation time. */
  STATUS_PASSIVE = 'STATUS_PASSIVE',
  /** Status expiry (onExitClause) — runs once when a status event ends. */
  STATUS_EXIT = 'STATUS_EXIT',
  /** Talent passive seed — runs at pipeline start to apply operator talent stats. */
  TALENT_SEED = 'TALENT_SEED',
}


export enum MainStatType {
  BASE_HP = "BASE_HP",
  HP_FROM_STRENGTH = "HP_FROM_STRENGTH",
  BASE_ATTACK = "BASE_ATTACK",
  ATTACK_BONUS = "ATTACK_BONUS",
  BASE_DEFENSE = "BASE_DEFENSE",
}

/** The main stat that a DEAL DAMAGE effect scales from. */
export enum DamageScalingStatType {
  ATTACK = "ATTACK",
  DEFENSE = "DEFENSE",
  HP = "HP",
}

export enum CombatResourceType {
  HP = "HP",
  SKILL_POINT = "SKILL_POINT",
  ULTIMATE_ENERGY = "ULTIMATE_ENERGY",
  STAGGER = "STAGGER",
  COOLDOWN = "COOLDOWN",
}

export enum EventComponentType {
  EVENT = "EVENT",
  SEGMENT = "SEGMENT",
  FRAME = "FRAME",
}

export enum DataSourceType {
  END_AXIS = "END_AXIS",
  WARFARIN = "WARFARIN",
  ENDFIELD_SIMULATIONS = "ENDFIELD_SIMULATIONS",
}

export enum UnitType {
  FRAME = "FRAME",
  SECOND = "SECOND",
  PERCENTAGE = "PERCENTAGE",
  FLAT = "FLAT",
  LEVEL = "LEVEL",
  MULTIPLIER = "MULTIPLIER",
  STACK = "STACK",
}

export enum EventFrameType {
  NORMAL = "NORMAL",
  FINAL_STRIKE = "FINAL_STRIKE",
  FINISHER = "FINISHER",
  DIVE = "DIVE",
  DAMAGE_OVER_TIME = "DAMAGE_OVER_TIME",
  GUARANTEED_HIT = "GUARANTEED_HIT",
  PASSIVE = "PASSIVE",
  INTERRUPTIBLE = "INTERRUPTIBLE",
}

export enum EdgeKind {
  CREATION = 'CREATION',
  TRANSITION = 'TRANSITION',
}

export enum EventStatusType {
  EXPIRED = "EXPIRED",
  CONSUMED = "CONSUMED",
  REFRESHED = "REFRESHED",
  TRIGGERED = "TRIGGERED",
  EXTENDED = "EXTENDED",
}

export enum RequirementStateType {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  APPLIED = "APPLIED",
  CONSUMED = "CONSUMED",
  EQ = "EQ",
  GT = "GT",
  GEQ = "GEQ",
  LT = "LT",
  LEQ = "LEQ",
}

export enum ComparisonType {
  EQ = "EQ",
  GT = "GT",
  GEQ = "GEQ",
  LT = "LT",
  LEQ = "LEQ",
}

export enum StackInteractionType {
  NONE = "NONE",
  RESET = "RESET",
  MERGE = "MERGE",
  REFRESH = "REFRESH",
}

/** Effectively infinite — used for unlimited stacks and permanent duration in JSON configs. */
export const INFINITY = 99999;
export const UNLIMITED_STACKS = INFINITY;
export const PERMANENT_DURATION = INFINITY;

export enum ElementType {
  NONE = "NONE",
  PHYSICAL = "PHYSICAL",
  HEAT = "HEAT",
  CRYO = "CRYO",
  NATURE = "NATURE",
  ELECTRIC = "ELECTRIC",
  ARTS = "ARTS",
}

/** Maps status types to their associated element (for coloring).
 *  Reaction entries are hardcoded; operator status entries are built from JSON via gameDataController.getStatusElementMap(). */
export const STATUS_ELEMENT: Record<string, string> = {
  COMBUSTION:       ElementType.HEAT,
  SOLIDIFICATION:   ElementType.CRYO,
  CORROSION:        ElementType.NATURE,
  ELECTRIFICATION:  ElementType.ELECTRIC,
};

export const ELEMENT_LABELS: Record<ElementType, string> = {
  [ElementType.NONE]:     t('element.NONE'),
  [ElementType.PHYSICAL]: t('element.PHYSICAL'),
  [ElementType.HEAT]:     t('element.HEAT'),
  [ElementType.CRYO]:     t('element.CRYO'),
  [ElementType.NATURE]:   t('element.NATURE'),
  [ElementType.ELECTRIC]: t('element.ELECTRIC'),
  [ElementType.ARTS]:     t('element.ARTS'),
};

export const ELEMENT_COLORS: Record<ElementType, string> = {
  [ElementType.NONE]:     '#999999',
  [ElementType.PHYSICAL]: '#8890a0',
  [ElementType.HEAT]:     '#e06030',
  [ElementType.CRYO]:     '#40b8b0',
  [ElementType.NATURE]:   '#60a840',
  [ElementType.ELECTRIC]: '#d4a028',
  [ElementType.ARTS]:     '#c080e0',
};

/** Default event color when no element is associated (indigo). */
export const DEFAULT_EVENT_COLOR = '#6366f1';

/** Arts reactions — triggered by arts infliction combinations. */
export enum ArtsReactionType {
  COMBUSTION = "COMBUSTION",
  SOLIDIFICATION = "SOLIDIFICATION",
  CORROSION = "CORROSION",
  ELECTRIFICATION = "ELECTRIFICATION",
  SHATTER = "SHATTER",
}

/** Physical statuses — triggered by physical reactions (stagger consumption). */
export enum PhysicalStatusType {
  LIFT = "LIFT",
  KNOCK_DOWN = "KNOCK_DOWN",
  BREACH = "BREACH",
  CRUSH = "CRUSH",
}

/**
 * Enemy action IDs — event variants the user can place on the enemy-action
 * column via the context menu. Each action corresponds to one `eventVariant`
 * in the enemy-action column definition.
 *
 * - `AOE_*`: elemental AOE damage actions (generate damage on placement).
 * - `CHARGE`: wind-up / telegraph state before a big attack. No damage on
 *   placement; used as a trigger source for operator combo activation
 *   windows (e.g. Catcher's Timely Suppression on `ENEMY PERFORM STATUS CHARGE`).
 */
export enum EnemyActionType {
  AOE_PHYSICAL = "AOE_PHYSICAL",
  AOE_HEAT = "AOE_HEAT",
  AOE_CRYO = "AOE_CRYO",
  AOE_NATURE = "AOE_NATURE",
  AOE_ELECTRIC = "AOE_ELECTRIC",
  CHARGE = "CHARGE",
}

/** All built-in reaction types = arts reactions + physical statuses. */
export type ReactionType = ArtsReactionType | PhysicalStatusType;

/** Crowd control effects — statuses that restrict enemy movement/actions. */
export enum CrowdControlType {
  LIFT = "LIFT",
  KNOCK_DOWN = "KNOCK_DOWN",
  LOCK_DOWN = "LOCK_DOWN",
  IMMOBILIZE = "IMMOBILIZE",
  SOLIDIFICATION = "SOLIDIFICATION",
}
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const ReactionType = { ...ArtsReactionType, ...PhysicalStatusType } as typeof ArtsReactionType & typeof PhysicalStatusType;

enum _StatusType {
  // ── Gear set effects ──────────────────────────────────────────────────────
  GEAR_BUFF = "GEAR_BUFF",
  // ── Team statuses ─────────────────────────────────────────────────────────
  LINK = "LINK",
  SHIELD = "SHIELD",
  // ── Enemy debuffs ─────────────────────────────────────────────────────────
  FOCUS = "FOCUS",
  SUSCEPTIBILITY = "SUSCEPTIBILITY",
  FRAGILITY = "FRAGILITY",
  /** Damage-dealt-reduction debuff applied to the enemy. Applied with a
   *  multiplicative factor (`with.multiplier`) — the stored `statusValue`
   *  is the raw multiplier, and the damage calc layer composes it into the
   *  final damage formula multiplicatively. */
  WEAKNESS = "WEAKNESS",
  DMG_REDUCTION = "DMG_REDUCTION",
  PROTECTION = "PROTECTION",
}

export type StatusType = _StatusType | ReactionType;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const StatusType = { ..._StatusType, ...ReactionType } as typeof _StatusType & typeof ArtsReactionType & typeof PhysicalStatusType;

/** Damage formula multiplier factor that a status contributes to. */
export enum DamageFactorType {
  NONE = "NONE",
  DAMAGE_BONUS = "DAMAGE_BONUS",
  AMP = "AMP",
  STAGGER = "STAGGER",
  LINK = "LINK",
  WEAKNESS = "WEAKNESS",
  SUSCEPTIBILITY = "SUSCEPTIBILITY",
  FRAGILITY = "FRAGILITY",
  DMG_REDUCTION = "DMG_REDUCTION",
  PROTECTION = "PROTECTION",
  DEFENSE = "DEFENSE",
  RESISTANCE = "RESISTANCE",
}

/** Maps known StatusTypes to the damage formula factor they contribute to. Unknown types default to NONE.
 *  Only game-mechanic statuses are listed here; operator status damage factors are derived from their clause effects. */
export const STATUS_DAMAGE_FACTOR: Partial<Record<string, DamageFactorType>> = {
  // Arts reactions
  [StatusType.COMBUSTION]: DamageFactorType.NONE,
  [StatusType.SOLIDIFICATION]: DamageFactorType.NONE,
  [StatusType.CORROSION]: DamageFactorType.RESISTANCE,
  [StatusType.ELECTRIFICATION]: DamageFactorType.FRAGILITY,
  // Gear set effects
  [StatusType.GEAR_BUFF]: DamageFactorType.NONE,
  // Team statuses
  [StatusType.LINK]: DamageFactorType.LINK,
  [StatusType.SHIELD]: DamageFactorType.NONE,
  // Enemy debuffs
  [StatusType.FOCUS]: DamageFactorType.SUSCEPTIBILITY,
  [StatusType.SUSCEPTIBILITY]: DamageFactorType.SUSCEPTIBILITY,
  [StatusType.FRAGILITY]: DamageFactorType.FRAGILITY,
  [StatusType.WEAKNESS]: DamageFactorType.WEAKNESS,
  [StatusType.DMG_REDUCTION]: DamageFactorType.DMG_REDUCTION,
  [StatusType.PROTECTION]: DamageFactorType.PROTECTION,
  // Arts reactions
  [ArtsReactionType.SHATTER]: DamageFactorType.NONE,
  // Physical statuses
  [PhysicalStatusType.LIFT]: DamageFactorType.STAGGER,
  [PhysicalStatusType.KNOCK_DOWN]: DamageFactorType.STAGGER,
  [PhysicalStatusType.CRUSH]: DamageFactorType.NONE,
  [PhysicalStatusType.BREACH]: DamageFactorType.FRAGILITY,
};

/**
 * Maps DSL NounType effect objects to the damage formula factor they contribute to.
 * Used to derive `DamageFactorType` from operator status clause effects (e.g. `object: "AMP"`).
 * AMP is elemental — its adjective (HEAT, ELECTRIC, etc.) carries the element type.
 */
export const NOUN_DAMAGE_FACTOR: Partial<Record<string, DamageFactorType>> = {
  AMP: DamageFactorType.AMP,
  STAGGER: DamageFactorType.STAGGER,
  DAMAGE: DamageFactorType.DAMAGE_BONUS,
};

/** Arts inflictions — elemental inflictions that trigger arts reactions. */
export enum ArtsInflictionType {
  HEAT_INFLICTION = "HEAT_INFLICTION",
  CRYO_INFLICTION = "CRYO_INFLICTION",
  NATURE_INFLICTION = "NATURE_INFLICTION",
  ELECTRIC_INFLICTION = "ELECTRIC_INFLICTION",
}

/** Physical inflictions. */
export enum PhysicalInflictionType {
  VULNERABLE = "VULNERABLE",
}

/** All infliction types = arts + physical. */
export type InflictionType = ArtsInflictionType | PhysicalInflictionType;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const InflictionType = { ...ArtsInflictionType, ...PhysicalInflictionType } as typeof ArtsInflictionType & typeof PhysicalInflictionType;

export { OperatorClassType } from '../model/enums/operators';

export enum WeaponType {
  SWORD = "SWORD",
  GREAT_SWORD = "GREAT_SWORD",
  POLEARM = "POLEARM",
  HANDCANNON = "HANDCANNON",
  ARTS_UNIT = "ARTS_UNIT",
}

export enum GearCategory {
  ARMOR = "ARMOR",
  GLOVES = "GLOVES",
  KIT = "KIT",
}

export enum BasicAttackType {
  BATK = "BATK",
  FINISHER = "FINISHER",
  DIVE = "DIVE",
}

/** Categorization of BATK sequences — NORMAL hits and FINAL_ATTACK (last hit in chain). */
export enum BatkType {
  NORMAL = "NORMAL",
  FINAL_ATTACK = "FINAL_ATTACK",
}

export enum GearSetType {
  NONE = "NONE",
  AIC_HEAVY = "AIC_HEAVY_STAT",
  AIC_LIGHT = "AIC_LIGHT_STAT",
  ARMORED_MSGR = "ARMORED_MSGR_STAT",
  ROVING_MSGR = "ROVING_MSGR_STAT",
  MORDVOLT_INSULATION = "MORDVOLT_INSULATION_STAT",
  MORDVOLT_RESISTANT = "MORDVOLT_RESISTANT_STAT",
  ABURREY_LEGACY = "ABURREY_LEGACY_STAT",
  CATASTROPHE = "CATASTROPHE_STAT",
  SWORDMANCER = "SWORDMANCER_STAT",
  LYNX = "LYNX_STAT",
  AETHERTECH = "AETHERTECH_STAT",
  BONEKRUSHA = "BONEKRUSHA_STAT",
  PULSER_LABS = "PULSER_LABS_STAT",
  FRONTIERS = "FRONTIERS_STAT",
  HOT_WORK = "HOT_WORK_STAT",
  MI_SECURITY = "MI_SECURITY_STAT",
  TYPE_50_YINGLUNG = "TYPE_50_YINGLUNG_STAT",
  TIDE_SURGE = "TIDE_SURGE_STAT",
  ETERNAL_XIRANITE = "ETERNAL_XIRANITE_STAT",
  QINGBO = "QINGBO_STAT",
  XIRANFLOW = "XIRANFLOW_STAT",
}

export enum DataStatus {
  RECONCILED = 'RECONCILED',
  PARTIALLY_VERIFIED = 'PARTIALLY_VERIFIED',
  VERIFIED = 'VERIFIED',
}

export enum EventType {
  SKILL = "SKILL",
  STATUS = "STATUS",
}


export enum EventOriginType {
  OPERATOR = "OPERATOR",
  GEAR_EFFECT = "GEAR_EFFECT",
  WEAPON = "WEAPON",
  CONSUMABLE = "CONSUMABLE",
  ENEMY = "ENEMY",
}

/** Time manipulation effects that prevent other events from starting. */
export enum TimeInteractionType {
  /** No interaction with other timelines — purely cosmetic/tracking. */
  NONE = "NONE",
  /** No other events can start on any timeline while this is active. */
  TIME_STOP = "TIME_STOP",
  /** Delays all other timelines by this event's duration (e.g. dash with dodge). */
  TIME_DELAY = "TIME_DELAY",
}

/** Whether an event segment's duration is tied to game-time (affected by time-stops) or real-time (unaffected). */
export enum TimeDependency {
  GAME_TIME = "GAME_TIME",
  REAL_TIME = "REAL_TIME",
}

/** Enhancement tier of a skill variant. Base skills are NORMAL; absence implies NORMAL. */
export enum EnhancementType {
  NORMAL = "NORMAL",
  ENHANCED = "ENHANCED",
  EMPOWERED = "EMPOWERED",
  MINOR = "MINOR",
  MAJOR = "MAJOR",
}

/**
 * Skill category keys used as top-level keys in operator `skills` JSON,
 * and as discriminators in parsers/merge logic. These represent enhancement
 * variants of BASIC_ATTACK and BATTLE_SKILL. Base categories
 * (BASIC_ATTACK, BATTLE_SKILL, etc.) come from NounType.
 */
export enum SkillCategoryKey {
  ENHANCED_BASIC_ATTACK = "ENHANCED_BASIC_ATTACK",
  EMPOWERED_BASIC_ATTACK = "EMPOWERED_BASIC_ATTACK",
  ENHANCED_BATTLE_SKILL = "ENHANCED_BATTLE_SKILL",
  EMPOWERED_BATTLE_SKILL = "EMPOWERED_BATTLE_SKILL",
  ENHANCED_EMPOWERED_BATTLE_SKILL = "ENHANCED_EMPOWERED_BATTLE_SKILL",
}

/** The phase type of an event segment. */
export enum SegmentType {
  ANIMATION = "ANIMATION",
  STASIS = "STASIS",
  COOLDOWN = "COOLDOWN",
  IMMEDIATE_COOLDOWN = "IMMEDIATE_COOLDOWN",
}

export enum TimelineSourceType {
  OPERATOR = "OPERATOR",
  GEAR_EFFECT = "GEAR_EFFECT",
  WEAPON = "WEAPON",
  ENEMY = "ENEMY",
  COMMON = "COMMON",
  TACTICAL = "TACTICAL",
  FREEFORM = "FREEFORM",
}

/** High-level source category for status events — used for timeline filters. */
export enum EventCategoryType {
  SKILL = "SKILL",
  TALENT = "TALENT",
  POTENTIAL = "POTENTIAL",
  WEAPON = "WEAPON",
  GEAR = "GEAR",
  CONSUMABLE = "CONSUMABLE",
  TACTICAL = "TACTICAL",
  STATUS = "STATUS",
  INFLICTION = "INFLICTION",
  REACTION = "REACTION",
  PHYSICAL_STATUS = "PHYSICAL_STATUS",
}

export enum InteractionModeType {
  STRICT = "STRICT",
  FREEFORM = "FREEFORM",
  DEBUG = "DEBUG",
}

export enum InfoLevel {
  CONCISE = 0,
  DETAILED = 1,
  VERBOSE = 2,
  DEBUG = 3,
}


export { StatType, StatOwnerType, STAT_ATTRIBUTION, getStatsForTarget } from '../model/enums/stats';

export { OperatorInformationType } from '../model/enums/operators';

export enum GearType {
  ARMOR = "ARMOR",
  GLOVES = "GLOVES",
  KIT = "KIT",
}

export enum EnemyType {
  // ── Aggeloi ─────────────────────────────────────────────────────────────────
  RAM = "RAM",
  RAM_ALPHA = "RAM_ALPHA",
  STING = "STING",
  STING_ALPHA = "STING_ALPHA",
  FALSEWINGS = "FALSEWINGS",
  FALSEWINGS_ALPHA = "FALSEWINGS_ALPHA",
  MUDFLOW = "MUDFLOW",
  MUDFLOW_DELTA = "MUDFLOW_DELTA",
  HEDRON = "HEDRON",
  HEDRON_DELTA = "HEDRON_DELTA",
  PRISM = "PRISM",
  HEAVY_RAM = "HEAVY_RAM",
  HEAVY_RAM_ALPHA = "HEAVY_RAM_ALPHA",
  HEAVY_STING = "HEAVY_STING",
  HEAVY_STING_ALPHA = "HEAVY_STING_ALPHA",
  EFFIGY = "EFFIGY",
  SENTINEL = "SENTINEL",
  TIDEWALKER = "TIDEWALKER",
  TIDEWALKER_DELTA = "TIDEWALKER_DELTA",
  WALKING_CHRYSOPOLIS = "WALKING_CHRYSOPOLIS",
  TIDALKLAST = "TIDALKLAST",
  TRIAGGELOS = "TRIAGGELOS",
  MARBLE_AGGELOMOIRAI_PALECORE = "MARBLE_AGGELOMOIRAI_PALECORE",
  MARBLE_AGGELOMOIRAI_PALESENT = "MARBLE_AGGELOMOIRAI_PALESENT",
  MARBLE_APPENDAGE = "MARBLE_APPENDAGE",
  // ── Landbreakers ────────────────────────────────────────────────────────────
  BONEKRUSHER_RIPPTUSK = "BONEKRUSHER_RIPPTUSK",
  ELITE_RIPPTUSK = "ELITE_RIPPTUSK",
  HAZEFYRE_TUSKBEAST = "HAZEFYRE_TUSKBEAST",
  HAZEFYRE_CLAW = "HAZEFYRE_CLAW",
  BONEKRUSHER_RAIDER = "BONEKRUSHER_RAIDER",
  ELITE_RAIDER = "ELITE_RAIDER",
  BONEKRUSHER_AMBUSHER = "BONEKRUSHER_AMBUSHER",
  ELITE_AMBUSHER = "ELITE_AMBUSHER",
  BONEKRUSHER_INFILTRATOR = "BONEKRUSHER_INFILTRATOR",
  BONEKRUSHER_VANGUARD = "BONEKRUSHER_VANGUARD",
  BONEKRUSHER_PYROMANCER = "BONEKRUSHER_PYROMANCER",
  BONEKRUSHER_ARSONIST = "BONEKRUSHER_ARSONIST",
  BONEKRUSHER_BALLISTA = "BONEKRUSHER_BALLISTA",
  BONEKRUSHER_EXECUTIONER = "BONEKRUSHER_EXECUTIONER",
  ELITE_EXECUTIONER = "ELITE_EXECUTIONER",
  BONEKRUSHER_SIEGEKNUCKLES = "BONEKRUSHER_SIEGEKNUCKLES",
  RHODAGN_THE_BONEKRUSHING_FIST = "RHODAGN_THE_BONEKRUSHING_FIST",
  // ── Wildlife ────────────────────────────────────────────────────────────────
  ACID_ORIGINIUM_SLUG = "ACID_ORIGINIUM_SLUG",
  BLAZEMIST_ORIGINIUM_SLUG = "BLAZEMIST_ORIGINIUM_SLUG",
  FIREMIST_ORIGINIUM_SLUG = "FIREMIST_ORIGINIUM_SLUG",
  BRUTAL_PINCERBEAST = "BRUTAL_PINCERBEAST",
  INDIGENOUS_PINCERBEAST = "INDIGENOUS_PINCERBEAST",
  WATERLAMP = "WATERLAMP",
  IMBUED_QUILLBEAST = "IMBUED_QUILLBEAST",
  QUILLBEAST = "QUILLBEAST",
  TUNNELING_NIDWYRM = "TUNNELING_NIDWYRM",
  AXE_ARMORBEAST = "AXE_ARMORBEAST",
  HAZEFYRE_AXE_ARMORBEAST = "HAZEFYRE_AXE_ARMORBEAST",
  GLARING_RAKERBEAST = "GLARING_RAKERBEAST",
  SPOTTED_RAKERBEAST = "SPOTTED_RAKERBEAST",
  // ── Cangzei Pirates ─────────────────────────────────────────────────────────
  GROVE_ARCHER = "GROVE_ARCHER",
  ROAD_PLUNDERER = "ROAD_PLUNDERER",
}

export enum EnemyTierType {
  COMMON = "COMMON",
  ADVANCED = "ADVANCED",
  ELITE = "ELITE",
  ALPHA = "ALPHA",
  BOSS = "BOSS",
}

export enum RaceType {
  LANDBREAKERS = "LANDBREAKERS",
  AGGELOI = "AGGELOI",
  CANGZEI_PIRATES = "CANGZEI_PIRATES",
  WILDLIFE = "WILDLIFE",
}

export enum EnemyLocationType {
  GROUND = "GROUND",
  AIRBORNE = "AIRBORNE",
}

export enum ThemeType {
  DARK = 'DARK',
  LIGHT = 'LIGHT',
}

export enum NumberFormatType {
  PERCENTAGE = 'PERCENTAGE',
  DECIMAL = 'DECIMAL',
}

export enum PerformanceMode {
  HIGH = 'HIGH',
  BALANCED = 'BALANCED',
  LOW = 'LOW',
}

export enum CritMode {
  NEVER = 'NEVER',
  EXPECTED = 'EXPECTED',
  ALWAYS = 'ALWAYS',
  MANUAL = 'MANUAL',
}

export enum FoldMode {
  FRAME = 'FRAME',
  SEGMENT = 'SEGMENT',
  EVENT = 'EVENT',
}

export enum DamageType {
  NORMAL = 'NORMAL',
  DAMAGE_OVER_TIME = 'DAMAGE_OVER_TIME',
}




/** Discriminator for custom weapon skill definitions — stat-boost passive or a named triggered effect. */
export enum CustomWeaponSkillKind {
  STAT_BOOST = "STAT_BOOST",
  NAMED = "NAMED",
}

export enum WeaponSkillType {
  // ── Stat boosts (each has _S / _M / _L size variants) ──────────────────────
  ATTACK_BOOST_S = "ATTACK_BOOST_S",
  ATTACK_BOOST_M = "ATTACK_BOOST_M",
  ATTACK_BOOST_L = "ATTACK_BOOST_L",

  STRENGTH_BOOST_S = "STRENGTH_BOOST_S",
  STRENGTH_BOOST_M = "STRENGTH_BOOST_M",
  STRENGTH_BOOST_L = "STRENGTH_BOOST_L",

  AGILITY_BOOST_S = "AGILITY_BOOST_S",
  AGILITY_BOOST_M = "AGILITY_BOOST_M",
  AGILITY_BOOST_L = "AGILITY_BOOST_L",

  INTELLECT_BOOST_S = "INTELLECT_BOOST_S",
  INTELLECT_BOOST_M = "INTELLECT_BOOST_M",
  INTELLECT_BOOST_L = "INTELLECT_BOOST_L",

  WILL_BOOST_S = "WILL_BOOST_S",
  WILL_BOOST_M = "WILL_BOOST_M",
  WILL_BOOST_L = "WILL_BOOST_L",

  MAIN_ATTRIBUTE_BOOST_S = "MAIN_ATTRIBUTE_BOOST_S",
  MAIN_ATTRIBUTE_BOOST_M = "MAIN_ATTRIBUTE_BOOST_M",
  MAIN_ATTRIBUTE_BOOST_L = "MAIN_ATTRIBUTE_BOOST_L",

  PHYSICAL_DAMAGE_BOOST_S = "PHYSICAL_DAMAGE_BOOST_S",
  PHYSICAL_DAMAGE_BOOST_M = "PHYSICAL_DAMAGE_BOOST_M",
  PHYSICAL_DAMAGE_BOOST_L = "PHYSICAL_DAMAGE_BOOST_L",

  HEAT_DAMAGE_BOOST_S = "HEAT_DAMAGE_BOOST_S",
  HEAT_DAMAGE_BOOST_M = "HEAT_DAMAGE_BOOST_M",
  HEAT_DAMAGE_BOOST_L = "HEAT_DAMAGE_BOOST_L",

  CRYO_DAMAGE_BOOST_S = "CRYO_DAMAGE_BOOST_S",
  CRYO_DAMAGE_BOOST_M = "CRYO_DAMAGE_BOOST_M",
  CRYO_DAMAGE_BOOST_L = "CRYO_DAMAGE_BOOST_L",

  NATURE_DAMAGE_BOOST_S = "NATURE_DAMAGE_BOOST_S",
  NATURE_DAMAGE_BOOST_M = "NATURE_DAMAGE_BOOST_M",
  NATURE_DAMAGE_BOOST_L = "NATURE_DAMAGE_BOOST_L",

  ELECTRIC_DAMAGE_BOOST_S = "ELECTRIC_DAMAGE_BOOST_S",
  ELECTRIC_DAMAGE_BOOST_M = "ELECTRIC_DAMAGE_BOOST_M",
  ELECTRIC_DAMAGE_BOOST_L = "ELECTRIC_DAMAGE_BOOST_L",

  ULTIMATE_GAIN_EFFICIENCY_BOOST_S = "ULTIMATE_GAIN_EFFICIENCY_BOOST_S",
  ULTIMATE_GAIN_EFFICIENCY_BOOST_M = "ULTIMATE_GAIN_EFFICIENCY_BOOST_M",
  ULTIMATE_GAIN_EFFICIENCY_BOOST_L = "ULTIMATE_GAIN_EFFICIENCY_BOOST_L",

  HP_BOOST_S = "HP_BOOST_S",
  HP_BOOST_M = "HP_BOOST_M",
  HP_BOOST_L = "HP_BOOST_L",

  ARTS_BOOST_S = "ARTS_BOOST_S",
  ARTS_BOOST_M = "ARTS_BOOST_M",
  ARTS_BOOST_L = "ARTS_BOOST_L",

  ARTS_INTENSITY_BOOST_S = "ARTS_INTENSITY_BOOST_S",
  ARTS_INTENSITY_BOOST_M = "ARTS_INTENSITY_BOOST_M",
  ARTS_INTENSITY_BOOST_L = "ARTS_INTENSITY_BOOST_L",

  CRITICAL_RATE_BOOST_S = "CRITICAL_RATE_BOOST_S",
  CRITICAL_RATE_BOOST_M = "CRITICAL_RATE_BOOST_M",
  CRITICAL_RATE_BOOST_L = "CRITICAL_RATE_BOOST_L",

  TREATMENT_EFFICIENCY_BOOST_S = "TREATMENT_EFFICIENCY_BOOST_S",
  TREATMENT_EFFICIENCY_BOOST_M = "TREATMENT_EFFICIENCY_BOOST_M",
  TREATMENT_EFFICIENCY_BOOST_L = "TREATMENT_EFFICIENCY_BOOST_L",

  // ── Named weapon skills (prefixed by weapon name) ──────────────────────────

  // Sword
  EMINENT_REPUTE_BRUTALITY_DISCIPLINARIAN = "EMINENT_REPUTE_BRUTALITY_DISCIPLINARIAN",
  FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL = "FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL",
  RAPID_ASCENT_TWILIGHT_AZURE_CLOUDS = "RAPID_ASCENT_TWILIGHT_AZURE_CLOUDS",
  WHITE_NIGHT_NOVA_INFLICTION_WHITE_NIGHT_NOVA = "WHITE_NIGHT_NOVA_INFLICTION_WHITE_NIGHT_NOVA",
  NEVER_REST_FLOW_REINCARNATION = "NEVER_REST_FLOW_REINCARNATION",
  GRAND_VISION_INFLICTION_LONG_TIME_WISH = "GRAND_VISION_INFLICTION_LONG_TIME_WISH",
  THERMITE_CUTTER_FLOW_THERMAL_RELEASE = "THERMITE_CUTTER_FLOW_THERMAL_RELEASE",
  UMBRAL_TORCH_INFLICTION_COVETOUS_BUILDUP = "UMBRAL_TORCH_INFLICTION_COVETOUS_BUILDUP",
  SUNDERING_STEEL_COMBATIVE_ANTHEM_OF_CINDER = "SUNDERING_STEEL_COMBATIVE_ANTHEM_OF_CINDER",
  FORTMAKER_INSPIRING_BACK_TO_THE_BROKEN_CITY = "FORTMAKER_INSPIRING_BACK_TO_THE_BROKEN_CITY",
  ASPIRANT_TWILIGHT_IMPOSING_PEAK = "ASPIRANT_TWILIGHT_IMPOSING_PEAK",
  OBJ_EDGE_OF_LIGHTNESS_FLOW_UNBRIDLED_EDGE = "OBJ_EDGE_OF_LIGHTNESS_FLOW_UNBRIDLED_EDGE",
  TWELVE_QUESTIONS_INFLICTION_SINCERE_INTERROGATION = "TWELVE_QUESTIONS_INFLICTION_SINCERE_INTERROGATION",
  FINCHASER_3_0_SUPPRESSION_FIN_CHASERS_INTENT = "FINCHASER_3_0_SUPPRESSION_FIN_CHASERS_INTENT",
  WAVE_TIDE_PURSUIT_UNENDING_CYCLE = "WAVE_TIDE_PURSUIT_UNENDING_CYCLE",
  CONTINGENT_MEASURE_SUPPRESSION_EMERGENCY_BOOST = "CONTINGENT_MEASURE_SUPPRESSION_EMERGENCY_BOOST",
  TARR_11_ASSAULT_ARMAMENT_PREP = "TARR_11_ASSAULT_ARMAMENT_PREP",

  // Great Sword
  FORMER_FINERY_MINCING_THERAPY = "FORMER_FINERY_MINCING_THERAPY",
  SUNDERED_PRINCE_CRUSHER_PRINCELY_DETERRENCE = "SUNDERED_PRINCE_CRUSHER_PRINCELY_DETERRENCE",
  THUNDERBERGE_MEDICANT_EYE_OF_TALOS = "THUNDERBERGE_MEDICANT_EYE_OF_TALOS",
  EXEMPLAR_SUPPRESSION_STACKED_HEW = "EXEMPLAR_SUPPRESSION_STACKED_HEW",
  KHRAVENGGER_DETONATE_BONECHILLING = "KHRAVENGGER_DETONATE_BONECHILLING",
  OBJ_HEAVY_BURDEN_EFFICACY_TENACIOUS_WILL = "OBJ_HEAVY_BURDEN_EFFICACY_TENACIOUS_WILL",
  FINISHING_CALL_MEDICANT_GLORY_OF_KNIGHTHOOD = "FINISHING_CALL_MEDICANT_GLORY_OF_KNIGHTHOOD",
  ANCIENT_CANAL_BRUTALITY_LANDS_OF_YORE = "ANCIENT_CANAL_BRUTALITY_LANDS_OF_YORE",
  SEEKER_OF_DARK_LUNG_DETONATE_SEEKER_OF_THE_ESOTERIC = "SEEKER_OF_DARK_LUNG_DETONATE_SEEKER_OF_THE_ESOTERIC",
  INDUSTRY_0_1_SUPPRESSION_EMERGENCY_BOOST = "INDUSTRY_0_1_SUPPRESSION_EMERGENCY_BOOST",
  QUENCHER_CRUSHER_HONED_INTO_LEGION = "QUENCHER_CRUSHER_HONED_INTO_LEGION",
  DARHOFF_7_ASSAULT_ARMAMENT_PREP = "DARHOFF_7_ASSAULT_ARMAMENT_PREP",

  // Polearm
  JET_SUPPRESSION_ASTROPHYSICS = "JET_SUPPRESSION_ASTROPHYSICS",
  MOUNTAIN_BEARER_WEIGHT_OF_MOUNTAIN = "MOUNTAIN_BEARER_WEIGHT_OF_MOUNTAIN",
  VALIANT_COMBATIVE_VIRTUOUS_GAIN = "VALIANT_COMBATIVE_VIRTUOUS_GAIN",
  COHESIVE_TRACTION_SUPPRESSION_CONCENTRIC_CIRCLES = "COHESIVE_TRACTION_SUPPRESSION_CONCENTRIC_CIRCLES",
  CHIMERIC_JUSTICE_BRUTALITY_CEMENTED_FURY = "CHIMERIC_JUSTICE_BRUTALITY_CEMENTED_FURY",
  OBJ_RAZORHORN_INFLICTION_CONQUEST_OF_ICY_PEAKS = "OBJ_RAZORHORN_INFLICTION_CONQUEST_OF_ICY_PEAKS",
  PATHFINDERS_BEACON_INSPIRING_START_OF_A_SAGA = "PATHFINDERS_BEACON_INSPIRING_START_OF_A_SAGA",
  AGGELOSLAYER_SUPPRESSION_EMERGENCY_BOOST = "AGGELOSLAYER_SUPPRESSION_EMERGENCY_BOOST",
  OPERO_77_ASSAULT_ARMAMENT_PREP = "OPERO_77_ASSAULT_ARMAMENT_PREP",

  // Handcannon
  WEDGE_INFLICTION_WEDGE_OF_CIVILIZATION = "WEDGE_INFLICTION_WEDGE_OF_CIVILIZATION",
  NAVIGATOR_INFLICTION_LONE_AND_DISTANT_SAIL = "NAVIGATOR_INFLICTION_LONE_AND_DISTANT_SAIL",
  ARTZY_TYRANNICAL_FRACTURE_ARTZY_EXAGGERATION = "ARTZY_TYRANNICAL_FRACTURE_ARTZY_EXAGGERATION",
  RATIONAL_FAREWELL_PURSUIT_AID_FROM_THE_PAST = "RATIONAL_FAREWELL_PURSUIT_AID_FROM_THE_PAST",
  OPUS_THE_LIVING_INFLICTION_ROAD_HOME_FOR_ALL_LIFE = "OPUS_THE_LIVING_INFLICTION_ROAD_HOME_FOR_ALL_LIFE",
  OBJ_VELOCITOUS_DETONATE_RAPID_STRIKE = "OBJ_VELOCITOUS_DETONATE_RAPID_STRIKE",
  HOWLING_GUARD_SUPPRESSION_EMERGENCY_BOOST = "HOWLING_GUARD_SUPPRESSION_EMERGENCY_BOOST",
  LONG_ROAD_PURSUIT_UNENDING_CYCLE = "LONG_ROAD_PURSUIT_UNENDING_CYCLE",
  CLANNIBAL_INFLICTION_VICIOUS_PURGE = "CLANNIBAL_INFLICTION_VICIOUS_PURGE",
  PECO_5_ASSAULT_ARMAMENT_PREP = "PECO_5_ASSAULT_ARMAMENT_PREP",

  // Arts Unit
  CHIVALRIC_VIRTUES_MEDICANT_BLIGHT_FERVOR = "CHIVALRIC_VIRTUES_MEDICANT_BLIGHT_FERVOR",
  DETONATION_UNIT_DETONATE_IMPOSING_CHAMPION = "DETONATION_UNIT_DETONATE_IMPOSING_CHAMPION",
  OBLIVION_TWILIGHT_HUMILIATION = "OBLIVION_TWILIGHT_HUMILIATION",
  OPUS_ETCH_FIGURE_SUPPRESSION_TILLITE_ETCHINGS = "OPUS_ETCH_FIGURE_SUPPRESSION_TILLITE_ETCHINGS",
  DELIVERY_GUARANTEED_PURSUIT_DUTY_FULFILLED = "DELIVERY_GUARANTEED_PURSUIT_DUTY_FULFILLED",
  OBJ_ARTS_IDENTIFIER_PURSUIT_TRANSCENDENT_ARTS = "OBJ_ARTS_IDENTIFIER_PURSUIT_TRANSCENDENT_ARTS",
  FREEDOM_TO_PROSELYTIZE_MEDICANT_REDEMPTION_OF_FAITH = "FREEDOM_TO_PROSELYTIZE_MEDICANT_REDEMPTION_OF_FAITH",
  WILD_WANDERER_INFLICTION_WILDERNESS_CLUSTER = "WILD_WANDERER_INFLICTION_WILDERNESS_CLUSTER",
  MONAIHE_INSPIRING_MORTISE_AND_TENON_ANALYSIS = "MONAIHE_INSPIRING_MORTISE_AND_TENON_ANALYSIS",
  FLUORESCENT_ROC_SUPPRESSION_EMERGENCY_BOOST = "FLUORESCENT_ROC_SUPPRESSION_EMERGENCY_BOOST",
  HYPERNOVA_AUTO_INSPIRING_START_OF_A_SAGA = "HYPERNOVA_AUTO_INSPIRING_START_OF_A_SAGA",
  JIMINY_12_ASSAULT_ARMAMENT_PREP = "JIMINY_12_ASSAULT_ARMAMENT_PREP",
  STANZA_OF_MEMORIALS_TWILIGHT_LUSTROUS_PYRE = "STANZA_OF_MEMORIALS_TWILIGHT_LUSTROUS_PYRE",
  DREAMS_OF_THE_STARRY_BEACH_INFLICTION_TIDAL_MURMURS = "DREAMS_OF_THE_STARRY_BEACH_INFLICTION_TIDAL_MURMURS",
  FLICKERS_IN_THE_MIST_EFFICACY_OVERLAPPING_FLICKERS = "FLICKERS_IN_THE_MIST_EFFICACY_OVERLAPPING_FLICKERS",
  LONE_BARGE_SUPPRESSION_STREAMING_BLITZ = "LONE_BARGE_SUPPRESSION_STREAMING_BLITZ",
}

export enum ColumnType {
  MINI_TIMELINE = "mini-timeline",
  PLACEHOLDER = "placeholder",
}

export enum MicroColumnAssignment {
  BY_ORDER = "by-order",
  BY_COLUMN_ID = "by-column-id",
  DYNAMIC_SPLIT = "dynamic-split",
}

export enum InfoPaneMode {
  EVENT = "event",
  LOADOUT = "loadout",
  ENEMY = "enemy",
  RESOURCE = "resource",
}

export enum SidebarMode {
  LOADOUTS = "loadouts",
  WORKBENCH = "workbench",
  STATISTICS = "statistics",
}

export enum HeaderVariant {
  INFLICTION = "infliction",
  SKILL = "skill",
}

export enum LoadoutNodeType {
  FOLDER = "folder",
  LOADOUT = "loadout",
  LOADOUT_VIEW = "loadout-view",
}

export enum StatisticsNodeType {
  FOLDER = "folder",
  STATISTICS = "statistics",
}

/**
 * A single numeric dimension that can be compared across statistics sources.
 * Some metrics need additional config (operator, column, stat) to be resolvable.
 */
export enum StatisticsMetricType {
  TEAM_TOTAL_DAMAGE = "TEAM_TOTAL_DAMAGE",
  TEAM_DPS = "TEAM_DPS",
  TIME_TO_KILL = "TIME_TO_KILL",
  HIGHEST_BURST = "HIGHEST_BURST",
  HIGHEST_TICK = "HIGHEST_TICK",
  OPERATOR_DAMAGE = "OPERATOR_DAMAGE",
  COLUMN_DAMAGE = "COLUMN_DAMAGE",
  AGGREGATED_STAT = "AGGREGATED_STAT",
}

export enum StatisticsLayoutType {
  TABLE = "TABLE",
  BAR_CHART = "BAR_CHART",
  OPERATOR_BREAKDOWN = "OPERATOR_BREAKDOWN",
}

/**
 * Comparison mode for statistics-table cells.
 *  - RAW: show raw numeric values.
 *  - DELTA_AGAINST_BASE: show each row's % delta vs the first row's value
 *    for the same column (per-slot for operator subrows). First row is "—".
 *  - DELTA_AGAINST_PREVIOUS: show each row's % delta vs the previous row.
 *    First row is "—".
 * Underlying values used for delta computation are always the RAW numbers.
 */
export enum ComparisonModeType {
  RAW                    = "RAW",
  DELTA_AGAINST_BASE     = "DELTA_AGAINST_BASE",
  DELTA_AGAINST_PREVIOUS = "DELTA_AGAINST_PREVIOUS",
}

/**
 * Individual columns/stats that can be hidden in a statistics sheet's
 * per-source stats table. Persisted per-sheet in `StatisticsData.hiddenColumns`.
 */
export enum StatisticsColumnType {
  OPERATOR           = "OPERATOR",
  OPERATOR_POTENTIAL = "OPERATOR_POTENTIAL",
  WEAPON_RANK        = "WEAPON_RANK",
  TOTAL              = "TOTAL",
  BASIC              = "BASIC",
  BATTLE             = "BATTLE",
  COMBO              = "COMBO",
  ULTIMATE           = "ULTIMATE",
  TEAM_DPS           = "TEAM_DPS",
  CROWD_CONTROL      = "CROWD_CONTROL",
  DURATION           = "DURATION",
  TIME_TO_KILL       = "TIME_TO_KILL",
  TEAM_TOTAL         = "TEAM_TOTAL",
}

export enum CollaborationRole {
  HOST = 'host',
  JOINER = 'joiner',
}

export enum PermissionLevel {
  VIEW = 'view',
  EDIT = 'edit',
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  /** Initial connection attempt (no prior successful connect). */
  CONNECTING = 'connecting',
  /** Retry after a previously-established connection dropped. */
  RECONNECTING = 'reconnecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export enum SyncStatus {
  IDLE = 'idle',
  SYNCING = 'syncing',
}

/**
 * Variables that can be permuted to generate read-only loadout views.
 * Each axis maps to a single field inside `LoadoutProperties`.
 */
export enum ViewVariableType {
  OPERATOR_POTENTIAL = 'operatorPotential',
  WEAPON_SKILL_3_LEVEL = 'weaponSkill3Level',
}

/** Maximum number of view-permutations a single loadout may generate. */
export const MAX_LOADOUT_VIEW_PERMUTATIONS = 256;

/**
 * Axis kind for a ContextMenuParamAxis.
 *  - PARAMETER: a `suppliedParameters.VARY_BY` dimension (e.g. Enemies Hit ×1/×2/×3).
 *  - STACKS: initial stack count for a stackable status/infliction event.
 *  - STATUS_LEVEL: initial reaction status level (I–IV).
 */
export enum ContextMenuAxisKind {
  PARAMETER = 'PARAMETER',
  STACKS = 'STACKS',
  STATUS_LEVEL = 'STATUS_LEVEL',
}

/** Icon glyphs available on a stepper's trailing action button. */
export enum StepperActionIcon {
  REFRESH = 'REFRESH',
}

// ── Column header labels ─────────────────────────────────────────────────────

export const enum ColumnLabel {
  SKILL_POINTS         = 'SKILL POINTS',
  TEAM_STATUS          = 'TEAM STATUS',
  LINK                 = 'LINK',
  SHIELD               = 'SHIELD',
  INFLICTION           = 'ARTS INFLICTION',
  ARTS_REACTION        = 'ARTS REACTION',
  PHYSICAL_INFLICTION  = 'PHYSICAL INFLICTION',
  PHYSICAL_STATUS      = 'PHYSICAL STATUS',
  SUSCEPTIBILITY       = 'SUSCEPTIBILITY',
  FRAGILITY            = 'FRAGILITY',
  WEAPON_BUFF          = 'WEAPON',
  GEAR_BUFF            = 'GEAR',
  TACTICAL             = 'TACTICAL',
  STATUS               = 'STATUS',
  STAGGER              = 'STAGGER',
  STAGGER_FRAILTY      = 'STAGGER FRAILTY',
  ACTION               = 'ACTION',
  CONTROLLED           = 'CONTROLLED',
  OTHER                = 'OTHER',
}

