# Event Specification

This document defines the abstract Event model and its concrete types (CombatSkillEvent, StatusEvent). All events on a timeline share a common base structure composed of segments and frames.

All interactions in the DSL use the SVO (Subject-Verb-Object) grammar defined in `src/consts/semantics.ts`. For stacking mechanics, interaction semantics, and pipeline processing order, see [Game Mechanics Specification](game-data/gameMechanicsSpec.md).

---

## SVO Semantic Grammar

Every interaction in the system is a sentence: **Subject does Verb to Object.**

Types are defined in `src/consts/semantics.ts`:

### SubjectType

Who is performing the action or being checked.

| Value | Meaning |
|-------|---------|
| `THIS_OPERATOR` | The operator who owns this event/status |
| `OTHER_OPERATOR` | Any single teammate (excludes this operator) |
| `OTHER_OPERATORS` | All teammates except this operator |
| `ALL_OPERATORS` | Entire team including this operator |
| `ENEMY` | The enemy target |
| `ANY_OPERATOR` | Any operator on the team (wildcard — matches any operator subject in interaction matching) |
| `SYSTEM` | System-initiated (threshold effects, passive triggers) |

### VerbType

| Category | Verbs | Description |
|----------|-------|-------------|
| **Action** | `PERFORM` | Execute a skill or action |
| | `APPLY` | Apply a status, infliction, or reaction |
| | `CONSUME` | Remove/use stacks |
| | `ABSORB` | Take stacks and optionally convert them (see `conversion` field) |
| | `DEFEAT` | Kill a target |
| | `HIT` | Strike a target (cardinality = how many hit) |
| **Resource** | `EXPEND` | Spend a resource |
| | `RECOVER` | Gain a resource |
| | `OVERHEAL` | Recovery exceeds maximum |
| | `RETURN` | Return resource to source |
| **Physical** | `LIFT` | Lift an enemy |
| | `KNOCK_DOWN` | Knock down an enemy |
| | `BREACH` | Breach an enemy |
| | `CRUSH` | Crush an enemy |
| **Stack/Duration** | `REFRESH` | Reset duration to full |
| | `EXTEND` | Extend duration |
| | `MERGE` | Newer subsumes older |
| | `RESET` | Reset stacks or cooldown to 0 |
| **State** | `HAVE` | Quantity/possession assertion (uses cardinality) |
| | `IS` | State assertion (uses subjectProperty for possessive, optional `negated` for NOT) |

### ObjectType

| Category | Values | Description |
|----------|--------|-------------|
| **Skills** | `BASIC_ATTACK`, `BATTLE_SKILL`, `COMBO_SKILL`, `ULTIMATE`, `FINAL_STRIKE`, `CRITICAL_HIT` | Skill types and combat events |
| **Statuses** | `STATUS`, `INFLICTION`, `REACTION`, `ARTS_REACTION`, `STACKS` | Status effects and stack counts |
| **Resources** | `SKILL_POINT`, `ULTIMATE_ENERGY`, `STAGGER`, `COOLDOWN`, `HP` | Combat resources |
| **Entities** | `THIS_OPERATOR`, `OTHER_OPERATOR`, `OTHER_OPERATORS`, `ALL_OPERATORS`, `ENEMY` | Targets (merged from TargetType) |
| **States** | `ACTIVE`, `LIFTED`, `KNOCKED_DOWN`, `BREACHED`, `CRUSHED`, `COMBUSTED`, `CORRODED`, `ELECTRIFIED`, `SOLIDIFIED` | For IS verb (with optional `negated: true` for NOT) |

### CardinalityConstraintType

| Value | Meaning |
|-------|---------|
| `EXACTLY` | == N |
| `AT_LEAST` | >= N |
| `AT_MOST` | <= N |

### Interaction

```ts
interface Interaction {
  subjectType: SubjectType;
  subjectProperty?: ObjectType;     // possessive — "This Operator's ULTIMATE"
  verbType: VerbType;
  negated?: boolean;                // NOT — "IS NOT ACTIVE"
  objectType: ObjectType;
  objectId?: string;                // specific identifier (StatusType, skill name, etc.)
  cardinalityConstraint?: CardinalityConstraintType;  // EXACTLY, AT_LEAST, AT_MOST
  cardinality?: number;             // the count N in a cardinality assertion
  stacks?: number;                  // stacks to apply/consume
  isForced?: boolean;               // forced application (no initial damage)
  element?: ElementType;            // element filter

  // For ABSORB — what the absorbed stacks convert into.
  // Quantity = min(source available, target max - target current).
  conversion?: {
    objectType: ObjectType;
    objectId?: string;
  };
}
```

### Predicate

A set of conditions that, when all met, trigger a set of effects. Conditions are AND'd. When a predicate passes, all its effects are applied.

```ts
interface Predicate {
  conditions: Interaction[];        // AND — all must hold for this predicate to pass
  effects: Interaction[];           // applied when all conditions are met
}
```

### Clause

A list of predicates that are all evaluated independently. Every predicate whose conditions pass has its effects applied. Used on events to gate availability and define conditional behavior.

```ts
type Clause = Predicate[];
```

### StatusReaction (deprecated)

Replaced by `Predicate`. A StatusReaction is equivalent to a Predicate with a single condition and a single effect.

```ts
interface StatusReaction {
  trigger: Interaction;             // → Predicate.conditions[0]
  reaction: Interaction;            // → Predicate.effects[0]
}
```

---

## Abstract Event

```ts
// Sentinel value for permanent duration (never expires naturally)
const PERMANENT = -1;

event = {
  // ── Identity ──
  "name": string,                          // unique identifier
  "source": OperatorType | EnemyType | WeaponType | GearEffectType | ...,
  "element"?: ElementType,                 // NONE, PHYSICAL, HEAT, CRYO, NATURE, ELECTRIC

  // ── Duration ──
  // Array length determined by context: stack.max for StatusEvent, [single] for CombatSkillEvent.
  // Use PERMANENT (-1) for events that never expire naturally.
  "duration": {
    "value": number[],                     // e.g. [12, 18, 24, 30] or [-1]
    "unit": DurationUnit                   // SECOND or FRAME
  },

  // ── Clause ──
  // A list of predicates evaluated independently. Each predicate with passing conditions
  // has its effects applied. Gates event availability and defines conditional behavior.
  // Empty means no preconditions (always available).
  "clause"?: Predicate[],

  // ── Segments ──
  // An event is composed of sequential segments. Each segment represents a distinct phase
  // with its own duration, stats, and frames. Segments contain frames.
  "segments"?: Segment[]
}
```

### Segment

A distinct time phase within an event. Segments are sequential — each begins where the previous ends. Used for multi-phase skills (explosion + additional attack), ramping effects (Corrosion), DoT phases, cooldowns, time stops, etc.

By default, a segment experiences `TIME_STOP` (game time paused). Cooldown segments experience `NONE`.

```ts
{
  "metadata": {
    "eventComponentType": "SEGMENT",
    "dataSources"?: string[]
  },
  "properties": {
    "duration": {
      "value": number[],                    // array length matches parent event's level count
      "unit": DurationUnit
    },
    "name"?: string                         // e.g. "EXPLOSION", "MAGMA_FRAGMENT", "COOLDOWN"
  },
  "experience"?: TimeDependencyType,        // default: GAME_TIME. Cooldown segments: REAL_TIME
  "effects"?: Effect[],                     // segment-level effects (e.g. APPLY COMBO TIME_STOP WITH DURATION 0.566)
  "stats"?: StatModifier[],                 // passive modifiers active during this segment
  "frames"?: Frame[]                        // ordered damage/effect ticks within this segment
}
```

### Frame

A single point in time within a segment where something happens — damage, effects, status application. Frames are positioned by offset relative to their parent segment's start.

All damage, resource recovery, stagger, inflictions, and status applications are expressed as effects using the DSL grammar.

```ts
{
  "metadata": {
    "eventComponentType": "FRAME",
    "dataSources"?: string[]
  },
  "properties": {
    "offset": {
      "value": number,                      // when this frame fires relative to segment start
      "unit": DurationUnit
    }
  },
  "effects"?: Effect[],                     // e.g. PERFORM HEAT DAMAGE TO ENEMY WITH MULTIPLIER ...
  "multipliers"?: MultiplierEntry[]         // per-level numeric data (structural, absorbed into effects later)
}
```

### Effect

A Verb-Object sentence with optional adjective and prepositional phrases.

```ts
{
  "verbType": VerbType,
  "objectType"?: ObjectType,
  "objectId"?: string,                      // specific identifier (StatusType, skill name)
  "adjective"?: string | string[],          // e.g. "HEAT", ["FORCED", "COMBUSTION"]
  "toObjectType"?: string,                  // TO preposition — target/recipient
  "fromObjectType"?: string,                // FROM preposition — source
  "onObjectType"?: string,                  // ON preposition — stat target entity
  "withPreposition"?: {                     // WITH preposition — properties/cardinalities
    [key: string]: {
      "verb": "IS" | "DEPENDS_ON",
      "object"?: string,                    // dependency target for DEPENDS_ON (e.g. "SKILL_LEVEL")
      "value": number | number[]            // single for IS, array for DEPENDS_ON
    }
  }
}
```

#### WITH preposition keys (cardinalities)

| Key | Meaning | Applies to |
|-----|---------|------------|
| `cardinality` | Generic count | Resources (SP, energy, cooldown) |
| `duration` | Seconds | TIME_STOP, REACTION, STATUS |
| `multiplier` | Damage multiplier | DAMAGE |
| `staggerValue` | Stagger amount | STAGGER |
| `skillPoint` | SP value | SKILL_POINT |
| `stacks` | Stack count (implies stacking mechanism) | STATUS, INFLICTION |
| `statusLevel` | Reaction/status tier (1-4), specialization of stacks | ARTS_REACTION, PHYSICAL_STATUS, INFLICTION |

`statusLevel` is-a `stacks` is-a quantity. Each carries different semantic weight.

#### WITH value verbs

| Verb | Value shape | Example |
|------|-------------|---------|
| `IS` | Single number | `{ "verb": "IS", "value": 10 }` |
| `DEPENDS_ON` | Array indexed by dependency | `{ "verb": "DEPENDS_ON", "object": "SKILL_LEVEL", "value": [0.5, 0.6, ...] }` |

#### Noun adjuncts

Noun adjuncts are `NounType` values used in adjective position to modify an object. They appear in the `adjective` field of an Effect but are nouns, not adjectives — they act as compound noun modifiers.

| Noun adjunct | Valid objects | Meaning | Example |
|-------------|-------------|---------|---------|
| `SOURCE` | `INFLICTION`, `STATUS` | Duplicate the triggering effect — apply another stack of whatever infliction/status triggered this skill | `APPLY SOURCE INFLICTION TO ENEMY` |

**Example — Antal combo skill (EMP Test Site):**

Antal's combo triggers when an enemy with Focus suffers a Physical Status or Arts Infliction. On hit, the combo applies another stack of the same effect:

```json
{
  "effects": [
    { "verbType": "APPLY", "adjective": "SOURCE", "objectType": "INFLICTION", "toObjectType": "ENEMY" },
    { "verbType": "APPLY", "adjective": "SOURCE", "objectType": "STATUS", "toObjectType": "ENEMY" }
  ]
}
```

Two effects are needed because the combo has two trigger clauses (one for arts infliction, one for physical status). At runtime, only the effect matching the actual trigger fires.

See `NOUN_ADJUNCTS` in `src/consts/semantics.ts` for the valid noun adjunct map.

### Composition

```
Event
└── Segment[]
    └── Frame[]
        └── Effect[]
            └── withPreposition{}
```

An Event owns Segments. A Segment owns Frames. Frames contain Effects. Effects carry their properties via the WITH preposition.

### Implied Delay Segments

Some skills have frames whose offset exceeds the segment's stated duration — these represent delayed hits (projectile travel, delayed explosions, etc.). These are marked with `properties.hasDelayedHit: true`. During segment building, any out-of-bound frames are automatically split into an implied trailing segment labeled "Delay". The delayed frames' offsets are rebased relative to the new segment's start, and the segment's duration covers the latest frame.

Examples:
- **Ardelia COMBO_SKILL**: duration 0.77s, frame at 2.40s (delayed explosion applies Corrosion)
- **Da Pan COMBO_SKILL**: duration 0.80s, frame at 1.76s (delayed wok flip hit)
- **Fluorite BATTLE_SKILL**: duration 1.13s, frame at 2.97s (delayed explosive detonation)

---

## CombatSkillEvent

Player-initiated skill activation. Extends the abstract Event with skill-specific fields.

```ts
combatSkillEvent = {
  // ── Inherited from Event ──
  "name": string,                          // CombatSkillsType enum value
  "source": OperatorType,
  "element"?: ElementType,
  "clause"?: Predicate[],                  // activation gate (no effects — combat skill clauses are pure conditions)
  "segments"?: Segment[],

  // ── CombatSkillEvent-specific ──
  "combatSkillType": CombatSkillType,      // BASIC_ATTACK, BATTLE_SKILL, COMBO_SKILL, ULTIMATE
}
```

> Note: Time stops, cooldowns, resource costs/gains, and damage are all expressed as segment-level or frame-level effects. The old `animation` and `resourceInteractions` fields are replaced by segments with `APPLY <ADJ> TIME_STOP FOR <duration>` effects and frame effects respectively.

---

## StatusEvent

Condition-triggered status effect, buff, debuff, infliction, or reaction. Extends the abstract Event with status-specific fields.

### StatusEventType

| Type | Behavior |
|------|----------|
| *(none)* | Standard status — created by triggers, lives on a timeline micro-column. |
| `TALENT` | Operator talent passive. Created as a permanent presence event at frame 0 when the talent level is met. Trigger clause effects define side-effect conditions (e.g. absorption exchange) whose output may redirect to a different status via PERFORM_ALL → APPLY. Talent JSONs live in `operator-talents/`. |

```ts
statusEvent = {
  // ── Inherited from Event ──
  "name": string,                          // StatusType enum value
  "source": OperatorType | EnemyType | WeaponType | GearEffectType | ...,
  "element"?: ElementType,
  "duration": { "value": number[], "unit": DurationUnit },  // length = stack.max
  "segments"?: Segment[],

  // ── StatusEvent-specific ──
  "type"?: StatusEventType,                // optional — "TALENT" for operator talent passives
  "target": ObjectType,                    // THIS_OPERATOR, ENEMY, ALL_OPERATORS, OTHER_OPERATOR
  "isNamedEvent": boolean,                 // whether this appears as a named event on the timeline
  "isForceApplied": boolean,               // set by source — forced reactions have no initial damage

  // Stacking — stack.max (resolved for the operator's potential) determines the length of
  // all value arrays (duration, stats, segments).
  // Current stack count = status level. A status at 3 stacks uses index [2] (0-indexed).
  "stack": {
    "interactionType": StackInteractionType,  // NONE, RESET, EXTEND, MERGE
    "max": Record<PotentialType, number>,     // keyed by potential (P0–P5)
    "instances": number,                      // how many independent timeline instances exist
  },

  // Clause — list of predicates evaluated independently. Each predicate whose
  // conditions pass has its effects applied. Replaces the old "reactions" field.
  // Use for stack thresholds (conditions: HAVE STACKS AT MAX), consumption
  // (conditions: OTHER_OPERATOR PERFORM BATTLE_SKILL), etc.
  "clause": Predicate[],

  // Trigger clause — predicates that determine when this status is created.
  // Each predicate is evaluated independently; any passing predicate can create the status.
  // For TALENT type: triggers define side-effect conditions (e.g. absorption exchange).
  // The talent itself is created as a permanent presence event at frame 0.
  "triggerClause": Predicate[],

  // Consume clause — predicates that determine when stacks are consumed.
  // When conditions are met (e.g. cast battle skill at max stacks), all active
  // stacks are clamped, freeing slots for re-accumulation.
  "consumeClause"?: Predicate[],

  // Talent level requirement — only process this def when the talent is unlocked.
  "minTalentLevel"?: { "talent": number, "minLevel": number },

  // Stats — flat buffs/debuffs applied for the entire status duration (no time variation).
  // For time-varying stats, use segments instead.
  // Each stat's value is an array of length stack.max, indexed by current stack count.
  "stats": StatModifier[]
}
```

---

## Shared Sub-Types

### StackInteractionType

Defines what happens when a new instance is applied while at max stacks.

| Type      | Behavior |
|-----------|----------|
| `NONE`    | No interaction. New stacks are ignored at max, or accumulate independently without limit. |
| `RESET`   | End the earliest-expiring stack and start a new one with full base duration. |
| `EXTEND`  | Extend all existing stacks' durations to match the newest stack's end time. |
| `MERGE`   | Newer effect subsumes older — older is clamped at newer's start frame. Only when newer outlasts older. |

### ResourceInteraction

```ts
{
  "subjectType": SubjectType,              // who initiates (THIS_OPERATOR, SYSTEM)
  "verbType": VerbType,                    // EXPEND, RECOVER, RETURN
  "objectType": ObjectType,               // SKILL_POINT, ULTIMATE_ENERGY, STAGGER, COOLDOWN, HP
  "cardinality": number,
  "target"?: ObjectType,                   // who receives (THIS_OPERATOR, ALL_OPERATORS, ENEMY)
  "conditions"?: {
    "enemiesHit"?: {
      "cardinalityConstraint": CardinalityConstraintType,
      "cardinality": number
    }
  }
}
```

### StatModifier

```ts
{
  "statType": StatType | EnemyStatType,      // stat being modified
  "value": number[]                          // level-indexed array (length = stack.max for statuses)
}
```

### EnemyStatType

Enemy-specific stat types applied by debuff statuses. Each maps to a `DamageFactorType` that determines how the value enters the damage formula.

| EnemyStatType              | DamageFactorType   | Description                                    | Used by |
|----------------------------|--------------------|------------------------------------------------|---------|
| `ARTS_FRAGILITY`           | `FRAGILITY`        | Extra arts damage taken (%)                    | Electrification, Breach |
| `PHYSICAL_FRAGILITY`       | `FRAGILITY`        | Extra physical damage taken (%)                | Breach |
| `ARMOR_REDUCTION`          | `RESISTANCE`       | Reduce enemy defense/armor                     | Corrosion |
| `ELEMENT_SUSCEPTIBILITY`   | `SUSCEPTIBILITY`   | Element-specific weakness                      | Focus, Susceptibility |
| `WEAKEN`                   | `WEAKEN`           | General damage reduction on enemy              | Weaken |
| `DMG_REDUCTION`            | `DMG_REDUCTION`    | Damage reduction modifier                      | DmgReduction |
| `PROTECTION`               | `PROTECTION`       | Damage mitigation                              | Protection |

---

## StatusEvent Examples

### Melting Flame (operator self-buff, permanent independent stacks)

Located in `operator-skills/laevatain-skills.json`. Stacks from battle skills and combo skills.
At max stacks, the threshold clause applies SCORCHING_HEART_EFFECT to the operator.

```json
{
  "name": "MELTING_FLAME",
  "target": "THIS_OPERATOR",
  "element": "HEAT",
  "isNamedEvent": true,
  "stack": { "max": { "P0": 4, ... }, "instances": 4, "verbType": "NONE" },
  "clause": [
    {
      "conditions": [
        { "subjectType": "THIS_EVENT", "verbType": "HAVE", "objectType": "STACKS", "cardinalityConstraint": "EXACTLY", "cardinality": "MAX" }
      ],
      "effects": [
        { "verbType": "APPLY", "objectType": "STATUS", "objectId": "SCORCHING_HEART_EFFECT", "toObjectType": "THIS_OPERATOR" }
      ]
    }
  ],
  "triggerClause": [
    { "conditions": [{ "subjectType": "THIS_OPERATOR", "verbType": "PERFORM", "objectType": "BATTLE_SKILL" }] },
    { "conditions": [{ "subjectType": "THIS_OPERATOR", "verbType": "PERFORM", "objectType": "COMBO_SKILL" }] }
  ],
  "consumeClause": [
    {
      "conditions": [
        { "subjectType": "THIS_OPERATOR", "verbType": "PERFORM", "objectType": "BATTLE_SKILL" },
        { "subjectType": "THIS_EVENT", "verbType": "HAVE", "objectType": "STACKS", "cardinalityConstraint": "EXACTLY", "cardinality": "MAX" }
      ],
      "effects": [{ "verbType": "CONSUME", "objectType": "ALL_STACKS" }]
    }
  ],
  "properties": { "duration": { "value": [-1], "unit": "SECOND" } }
}
```

### Scorching Heart (Talent 1 — absorption exchange passive)

Located in `operator-talents/laevatain-talents.json`. Permanent passive (type: TALENT).
When any operator performs a Final Strike while enemy has Heat Infliction, absorbs
the infliction and applies Melting Flame to Laevatain (PERFORM_ALL with output redirect).

```json
{
  "name": "SCORCHING_HEART",
  "type": "TALENT",
  "originId": "laevatain",
  "target": "THIS_OPERATOR",
  "element": "HEAT",
  "stack": { "max": { "P0": 1, ... }, "instances": 1, "verbType": "NONE" },
  "triggerClause": [
    {
      "conditions": [
        { "subjectType": "ANY_OPERATOR", "verbType": "PERFORM", "objectType": "FINAL_STRIKE" },
        { "subjectType": "ENEMY", "verbType": "HAVE", "objectType": "INFLICTION", "objectId": "HEAT" }
      ],
      "effects": [
        {
          "verbType": "PERFORM_ALL",
          "cardinalityConstraint": "AT_MOST",
          "cardinality": "MAX",
          "effects": [
            { "verbType": "ABSORB", "cardinality": 1, "objectType": "INFLICTION", "element": "HEAT", "fromObjectType": "ENEMY" },
            { "verbType": "APPLY", "cardinality": 1, "objectType": "STATUS", "objectId": "MELTING_FLAME", "toObjectType": "THIS_OPERATOR" }
          ]
        }
      ]
    }
  ],
  "properties": { "duration": { "value": [-1], "unit": "SECOND" } },
  "minTalentLevel": { "talent": 1, "minLevel": 1 }
}
```

### Scorching Heart Effect (self-buff from max MF stacks, RESET on reapply)

Located in `operator-skills/laevatain-skills.json`. Applied by MELTING_FLAME's threshold clause.
Provides Heat Resistance Ignore scaling by talent level.

```json
{
  "name": "SCORCHING_HEART_EFFECT",
  "target": "THIS_OPERATOR",
  "element": "HEAT",
  "isNamedEvent": true,
  "stack": { "max": { "P0": 1, ... }, "instances": 1, "verbType": "RESET" },
  "triggerClause": [],
  "stats": [{ "statType": "HEAT_RESISTANCE_IGNORE", "value": [10, 15, 20] }],
  "properties": { "duration": { "value": [20], "unit": "SECOND" } }
}
```

### Electrification (arts reaction, level-scaled enemy debuff)

```json
{
  "name": "ELECTRIFICATION",
  "source": "ANY_OPERATOR",
  "target": "ENEMY",
  "isNamedEvent": true,
  "element": "ELECTRIC",
  "isForceApplied": false,
  "stack": {
    "interactionType": "MERGE",
    "max": [
      4,
      4,
      4,
      4,
      4,
      4
    ],
    "instances": 1
  },
  "triggerClause": [
    {
      "conditions": [
        {
          "subjectType": "ENEMY",
          "verbType": "HAVE",
          "objectType": "INFLICTION",
          "objectId": "ELECTRIC",
          "cardinalityConstraint": "AT_LEAST",
          "cardinality": 2
        }
      ],
      "effects": []
    }
  ],
  "duration": {
    "value": [
      12,
      18,
      24,
      30
    ],
    "unit": "SECOND"
  },
  "stats": [
    {
      "statType": "ARTS_FRAGILITY",
      "value": [
        0.12,
        0.16,
        0.2,
        0.24
      ]
    }
  ]
}
```

### Corrosion (arts reaction, ramping armor reduction via segments)

```json
{
  "name": "CORROSION",
  "source": "ANY_OPERATOR",
  "target": "ENEMY",
  "isNamedEvent": true,
  "element": "NATURE",
  "isForceApplied": false,
  "stack": {
    "interactionType": "MERGE",
    "max": [
      4,
      4,
      4,
      4,
      4,
      4
    ],
    "instances": 1
  },
  "triggerClause": [
    {
      "conditions": [
        {
          "subjectType": "ENEMY",
          "verbType": "HAVE",
          "objectType": "INFLICTION",
          "objectId": "NATURE",
          "cardinalityConstraint": "AT_LEAST",
          "cardinality": 2
        }
      ],
      "effects": []
    }
  ],
  "duration": {
    "value": [
      15,
      15,
      15,
      15
    ],
    "unit": "SECOND"
  },
  "segments": [
    {
      "name": "RAMP_PHASE",
      "duration": {
        "value": [
          10,
          10,
          10,
          10
        ],
        "unit": "SECOND"
      },
      "stats": [
        {
          "statType": "ARMOR_REDUCTION",
          "value": [
            3.6,
            4.8,
            6.0,
            7.2
          ]
        }
      ]
    },
    {
      "name": "FULL_EFFECT",
      "duration": {
        "value": [
          5,
          5,
          5,
          5
        ],
        "unit": "SECOND"
      },
      "stats": [
        {
          "statType": "ARMOR_REDUCTION",
          "value": [
            12,
            16,
            20,
            24
          ]
        }
      ]
    }
  ],
  "stats": []
}
```

### Combustion (arts reaction, initial damage + DoT via segments/frames)

```json
{
  "name": "COMBUSTION",
  "source": "ANY_OPERATOR",
  "target": "ENEMY",
  "isNamedEvent": true,
  "element": "HEAT",
  "isForceApplied": false,
  "stack": {
    "interactionType": "MERGE",
    "max": [
      4,
      4,
      4,
      4,
      4,
      4
    ],
    "instances": 1
  },
  "triggerClause": [
    {
      "conditions": [
        {
          "subjectType": "ENEMY",
          "verbType": "HAVE",
          "objectType": "INFLICTION",
          "objectId": "HEAT",
          "cardinalityConstraint": "AT_LEAST",
          "cardinality": 2
        }
      ],
      "effects": []
    }
  ],
  "duration": {
    "value": [
      10,
      10,
      10,
      10
    ],
    "unit": "SECOND"
  },
  "segments": [
    {
      "name": "DOT_PHASE",
      "duration": {
        "value": [
          10,
          10,
          10,
          10
        ],
        "unit": "SECOND"
      },
      "frames": [
        {
          "offset": {
            "value": 0,
            "unit": "SECOND"
          },
          "damage": {
            "elementType": "HEAT",
            "multiplier": [
              1.6,
              2.4,
              3.2,
              4.0
            ],
            "damageType": "ARTS"
          }
        },
        {
          "offset": {
            "value": 1,
            "unit": "SECOND"
          },
          "damage": {
            "elementType": "HEAT",
            "multiplier": [
              0.24,
              0.36,
              0.48,
              0.6
            ],
            "damageType": "ARTS"
          }
        },
        {
          "offset": {
            "value": 2,
            "unit": "SECOND"
          },
          "damage": {
            "elementType": "HEAT",
            "multiplier": [
              0.24,
              0.36,
              0.48,
              0.6
            ],
            "damageType": "ARTS"
          }
        }
      ]
    }
  ],
  "stats": []
}
```

> Note: Combustion has 10 DoT frames (1/s for 10s) — only 3 shown above for brevity. When `isForceApplied` is true, the initial damage frame (offset 0) deals 0 damage.

### Link (team buff, consumed on skill cast)

```json
{
  "name": "LINK",
  "source": "CHEN_QIANYU",
  "target": "ALL_OPERATORS",
  "isNamedEvent": true,
  "element": "NONE",
  "isForceApplied": false,
  "stack": {
    "interactionType": "NONE",
    "max": [
      1,
      1,
      1,
      1,
      1,
      1
    ],
    "instances": 1
  },
  "clause": [
    {
      "conditions": [
        {
          "subjectType": "OTHER_OPERATOR",
          "verbType": "PERFORM",
          "objectType": "BATTLE_SKILL"
        }
      ],
      "effects": [
        {
          "verbType": "CONSUME",
          "objectType": "STACKS",
          "cardinality": 1
        }
      ]
    }
  ],
  "triggerClause": [
    {
      "conditions": [
        {
          "subjectType": "THIS_OPERATOR",
          "verbType": "PERFORM",
          "objectType": "BATTLE_SKILL"
        }
      ],
      "effects": []
    }
  ],
  "duration": {
    "value": [
      30
    ],
    "unit": "SECOND"
  },
  "stats": [
    {
      "statType": "BATTLE_SKILL_DAMAGE_BONUS",
      "value": [
        0.3
      ]
    },
    {
      "statType": "ULTIMATE_DAMAGE_BONUS",
      "value": [
        0.2
      ]
    }
  ]
}
```

### Unbridled Edge (incrementing stacks, resets oldest at max)

```json
{
  "name": "UNBRIDLED_EDGE",
  "source": "AKEKURI",
  "target": "THIS_OPERATOR",
  "isNamedEvent": true,
  "element": "NONE",
  "isForceApplied": false,
  "stack": {
    "interactionType": "RESET",
    "max": [
      3,
      3,
      3,
      3,
      3,
      3
    ],
    "instances": 3
  },
  "triggerClause": [
    {
      "conditions": [
        {
          "subjectType": "THIS_OPERATOR",
          "subjectProperty": "HP",
          "verbType": "OVERHEAL"
        }
      ],
      "effects": []
    }
  ],
  "duration": {
    "value": [
      15,
      15,
      15
    ],
    "unit": "SECOND"
  },
  "stats": [
    {
      "statType": "PHYSICAL_DAMAGE_BONUS",
      "value": [
        0.08,
        0.08,
        0.08
      ]
    }
  ]
}
```

### Wildland Trekker (Arclight T2 — trigger stacks → team buff at max)

Arclight's empowered battle skill (gated by `clauses: [[ENEMY IS ELECTRIFIED]]`)
has an additional hit segment whose frame applies `WILDLAND_TREKKER_TRIGGER` stacks. When
trigger stacks reach max (3 normally, 2 at P5), the team buff is applied — same pattern as
Melting Flame → Scorching Heart.

**Trigger stack status (operator self-buff, counts toward team buff):**

```json
{
  "name": "WILDLAND_TREKKER_TRIGGER",
  "source": "ARCLIGHT",
  "target": "THIS_OPERATOR",
  "isNamedEvent": true,
  "element": "ELECTRIC",
  "isForceApplied": false,
  "stack": {
    "interactionType": "NONE",
    "max": [
      3,
      3,
      3,
      3,
      2,
      2
    ],
    "instances": 3
  },
  "clause": [
    {
      "conditions": [
        {
          "subjectType": "THIS_EVENT",
          "verbType": "HAVE",
          "objectType": "STACKS",
          "cardinalityConstraint": "EXACTLY",
          "cardinality": "MAX"
        }
      ],
      "effects": [
        {
          "verbType": "APPLY",
          "objectType": "STATUS",
          "objectId": "WILDLAND_TREKKER_BUFF",
          "toObjectType": "THIS_OPERATOR"
        }
      ]
    }
  ],
  "triggerClause": [
    {
      "conditions": [
        {
          "subjectType": "THIS_OPERATOR",
          "verbType": "PERFORM",
          "objectType": "BATTLE_SKILL"
        }
      ],
      "effects": []
    }
  ],
  "duration": {
    "value": [
      -1,
      -1,
      -1
    ],
    "unit": "SECOND"
  },
  "stats": []
}
```

**Team buff status (applied when trigger stacks reach max):**

```json
{
  "name": "WILDLAND_TREKKER_BUFF",
  "source": "ARCLIGHT",
  "target": "ALL_OPERATORS",
  "isNamedEvent": true,
  "element": "ELECTRIC",
  "isForceApplied": false,
  "stack": {
    "interactionType": "RESET",
    "max": [
      1,
      1,
      1,
      1,
      1,
      1
    ],
    "instances": 1
  },
  "triggerClause": [
    {
      "conditions": [
        {
          "subjectType": "THIS_OPERATOR",
          "verbType": "HAVE",
          "objectType": "STATUS",
          "objectId": "WILDLAND_TREKKER_TRIGGER",
          "cardinalityConstraint": "EXACTLY",
          "cardinality": "MAX"
        }
      ],
      "effects": []
    }
  ],
  "duration": {
    "value": [
      15
    ],
    "unit": "SECOND"
  },
  "stats": []
}
```

### MI Security (gear set — crit counter with threshold reset)

```json
{
  "name": "MI_SECURITY_BUFF",
  "source": "GEAR_EFFECT",
  "target": "THIS_OPERATOR",
  "isNamedEvent": true,
  "element": "NONE",
  "isForceApplied": false,
  "stack": {
    "interactionType": "NONE",
    "max": [
      5,
      5,
      5,
      5,
      5,
      5
    ],
    "instances": 1
  },
  "clause": [
    {
      "conditions": [
        {
          "subjectType": "THIS_EVENT",
          "verbType": "HAVE",
          "objectType": "STACKS",
          "cardinalityConstraint": "EXACTLY",
          "cardinality": "MAX"
        }
      ],
      "effects": [
        {
          "verbType": "APPLY",
          "objectType": "STATUS",
          "objectId": "MI_SECURITY_CRIT_BONUS",
          "toObjectType": "THIS_OPERATOR"
        },
        {
          "verbType": "RESET",
          "objectType": "STACKS"
        }
      ]
    }
  ],
  "triggerClause": [
    {
      "conditions": [
        {
          "subjectType": "THIS_OPERATOR",
          "verbType": "PERFORM",
          "objectType": "CRITICAL_HIT"
        }
      ],
      "effects": []
    }
  ],
  "duration": {
    "value": [
      5,
      5,
      5,
      5,
      5
    ],
    "unit": "SECOND"
  },
  "stats": [
    {
      "statType": "ATTACK_BONUS",
      "value": [
        0.05,
        0.05,
        0.05,
        0.05,
        0.05
      ]
    }
  ]
}
```

### Heat Infliction Absorption (Laevatain enhanced basic attack frame)

A compound PERFORM groups multiple effects into an atomic unit. The constraint on PERFORM
controls how many times the group executes. `MAX` resolves to the target StatusEvent's
potential-indexed `stack.max`.

Reads as: "Perform all at most MAX times: absorb 1 heat infliction from enemy, apply 1 melting flame status to this operator."

```json
{
  "effects": [
    {
      "verbType": "PERFORM_ALL",
      "cardinalityConstraint": "AT_MOST",
      "cardinality": "MAX",
      "effects": [
        {
          "verbType": "ABSORB",
          "cardinality": 1,
          "objectType": "INFLICTION",
          "element": "HEAT",
          "fromObjectType": "ENEMY"
        },
        {
          "verbType": "APPLY",
          "cardinality": 1,
          "objectType": "STATUS",
          "objectId": "MELTING_FLAME",
          "toObjectType": "THIS_OPERATOR"
        }
      ]
    }
  ]
}
```

---

## Skill Variant Naming Convention

Skills can have variants that are available under specific conditions. The naming convention:

| Prefix | Meaning | Clause condition |
|--------|---------|-----------------|
| **Enhanced** | Active during ultimate | `THIS_OPERATOR's ULTIMATE IS ACTIVE` |
| **Empowered** | Requires consuming a status event or resource (e.g. stacks, reaction) | `THIS_OPERATOR HAVE STATUS <X> AT_LEAST <N>` or similar |

Enhanced and Empowered are combinable (e.g. `ENHANCED_EMPOWERED_BATTLE_SKILL` — during ultimate AND consuming stacks).

---

## Combo Window

Combo skills can only be used during a combo window. The combo window is a derived event that appears when trigger conditions are met (e.g. enemy becomes combusted). The combo skill's clause simply checks if the window is active.

```json
{
  "name": "COMBO_WINDOW",
  "clause": [
    { "conditions": [{ "subjectType": "ENEMY", "verbType": "BECOME", "objectType": "COMBUSTED" }] },
    { "conditions": [{ "subjectType": "ENEMY", "verbType": "BECOME", "objectType": "CORRODED" }] }
  ],
  "segments": [
    { "name": "WINDOW", "duration": { "value": [6.0], "unit": "SECOND" } }
  ]
}
```

The combo window segment defaults to `EXPERIENCE TIME_STOP` like all non-cooldown segments.

---

## Time Stop Effects

Time stops are expressed as segment-level effects using the `APPLY` verb with an adjective modifier on `TIME_STOP`:

| Effect | Usage |
|--------|-------|
| `APPLY COMBO TIME_STOP FOR <duration>` | Combo skill time stop — other combos can chain within |
| `APPLY DODGE TIME_STOP FOR <duration>` | Perfect dodge time stop — all actions allowed within |
| `APPLY ANIMATION TIME_STOP FOR <duration>` | Ultimate animation time stop — blocks combos |

The adjective (`COMBO`, `DODGE`, `ANIMATION`) determines the chaining rules the engine enforces.

---

### Enhanced Battle Skill (clause — during ultimate)

```json
{
  "clause": [
    {
      "conditions": [
        {
          "subjectType": "THIS_OPERATOR",
          "subjectProperty": "ULTIMATE",
          "verbType": "IS",
          "objectType": "ACTIVE"
        }
      ],
      "effects": []
    }
  ]
}
```

### Empowered Battle Skill (clause — 4 Melting Flame stacks)

```json
{
  "clause": [
    {
      "conditions": [
        {
          "subjectType": "THIS_OPERATOR",
          "verbType": "HAVE",
          "objectType": "STATUS",
          "objectId": "MELTING_FLAME",
          "cardinalityConstraint": "AT_LEAST",
          "cardinality": 4
        }
      ],
      "effects": []
    }
  ]
}
```

### Laevatain Combo SP Recovery (scaled by enemies hit)

```json
{
  "resourceInteractions": [
    {
      "subjectType": "THIS_OPERATOR",
      "verbType": "RECOVER",
      "objectType": "SKILL_POINT",
      "cardinality": 25,
      "conditions": {
        "enemiesHit": {
          "cardinalityConstraint": "AT_LEAST",
          "cardinality": 1
        }
      }
    },
    {
      "subjectType": "THIS_OPERATOR",
      "verbType": "RECOVER",
      "objectType": "SKILL_POINT",
      "cardinality": 30,
      "conditions": {
        "enemiesHit": {
          "cardinalityConstraint": "AT_LEAST",
          "cardinality": 2
        }
      }
    },
    {
      "subjectType": "THIS_OPERATOR",
      "verbType": "RECOVER",
      "objectType": "SKILL_POINT",
      "cardinality": 35,
      "conditions": {
        "enemiesHit": {
          "cardinalityConstraint": "AT_LEAST",
          "cardinality": 3
        }
      }
    }
  ]
}
```

### Wulfgard P5 (combo cooldown reset on ultimate cast)

```json
{
  "clause": [
    {
      "conditions": [
        {
          "subjectType": "THIS_OPERATOR",
          "verbType": "PERFORM",
          "objectType": "ULTIMATE"
        }
      ],
      "effects": [
        {
          "verbType": "RESET",
          "objectType": "COOLDOWN",
          "objectId": "COMBO_SKILL"
        }
      ]
    }
  ]
}
```

---

## CombatSkillEvent Examples

### Laevatain Battle Skill (single segment with status interaction)

```json
{
  "name": "SMOULDERING_FIRE",
  "source": "LAEVATAIN",
  "element": "HEAT",
  "combatSkillType": "BATTLE_SKILL",
  "duration": {
    "value": [
      2.2
    ],
    "unit": "SECOND"
  },
  "resourceInteractions": [
    {
      "subjectType": "THIS_OPERATOR",
      "verbType": "EXPEND",
      "objectType": "SKILL_POINT",
      "cardinality": 100
    },
    {
      "subjectType": "THIS_OPERATOR",
      "verbType": "RECOVER",
      "objectType": "ULTIMATE_ENERGY",
      "cardinality": 6.5,
      "target": "THIS_OPERATOR"
    },
    {
      "subjectType": "THIS_OPERATOR",
      "verbType": "RECOVER",
      "objectType": "ULTIMATE_ENERGY",
      "cardinality": 6.5,
      "target": "ALL_OPERATORS"
    }
  ],
  "segments": [
    {
      "duration": {
        "value": [
          2.2
        ],
        "unit": "SECOND"
      },
      "frames": [
        {
          "offset": {
            "value": 0.73,
            "unit": "SECOND"
          },
          "resourceInteractions": [
            {
              "subjectType": "THIS_OPERATOR",
              "verbType": "RECOVER",
              "objectType": "SKILL_POINT",
              "cardinality": 20
            },
            {
              "subjectType": "THIS_OPERATOR",
              "verbType": "RECOVER",
              "objectType": "STAGGER",
              "cardinality": 10
            }
          ],
          "statusInteractions": [
            {
              "subjectType": "THIS_OPERATOR",
              "verbType": "APPLY",
              "objectType": "STATUS",
              "objectId": "MELTING_FLAME",
              "stacks": 1
            }
          ]
        }
      ]
    }
  ]
}
```

### Laevatain Ultimate (with time stop animation)

```json
{
  "name": "TWILIGHT",
  "source": "LAEVATAIN",
  "element": "HEAT",
  "combatSkillType": "ULTIMATE",
  "segments": [
    {
      "name": "ANIMATION",
      "duration": { "value": [2.07], "unit": "SECOND" },
      "effects": [
        { "verbType": "APPLY", "objectType": "TIME_STOP", "asAdjective": "ANIMATION" },
        { "verbType": "CONSUME", "cardinality": 300, "objectType": "ULTIMATE_ENERGY" }
      ]
    },
    {
      "name": "ACTIVE",
      "duration": { "value": [0.3], "unit": "SECOND" },
      "experience": "NONE"
    }
  ]
}
```

---

## Combo Skill Trigger Conditions

All combo skill triggers expressed as SVO Interactions.

> **"Suffer" mapping:** In-game text like "enemy suffers X" means the moment an operator applies the status — expressed as `[Any Operator] [Apply] [Status/Infliction]` in the DSL, not from the enemy's perspective.

| Operator | Combo | Trigger | Active Column Required |
|----------|-------|---------|----------------------|
| Antal | EMP Test Site | `[Any Operator] [Apply] [Status] PHYSICAL` OR `[Any Operator] [Apply] [Infliction]` + `APPLY SOURCE INFLICTION/STATUS TO ENEMY` | `enemy-focus` |
| Laevatain | Seethe | `[Enemy] [Is] [Combusted]` | |
| Akekuri | Flash and Dash | `[Enemy] [Is] [Combusted]` | |
| Arclight | Peal of Thunder | `[Enemy] [Is] [Electrified]` | |
| Ardelia | Eruption Column | `[Enemy] [Is] [Corroded]` | |
| Estella | Distortion | `[Enemy] [Is] [Solidified]` | |
| Alesh | Auger Angling | `[Enemy] [Have] [Infliction] arts, at least 2` | |
| Fluorite | Free Giveaway | `[Enemy] [Have] [Infliction] arts, at least 2` | |
| Gilberta | Matrix Displacement | `[Enemy] [Have] [Infliction] arts, at least 2` | |
| Last Rite | Winter's Devourer | `[Enemy] [Have] [Infliction] arts, at least 2` | |
| Chen Qianyu | Soar to the Stars | `[Enemy] [Is] [Lifted]` | |
| Da Pan | More Spice | `[Enemy] [Is] [Lifted]` | |
| Pogranichnik | Full Moon Slash | `[Enemy] [Is] [Breached]` | |
| Avywenna | Thunderlance Strike | `[Other Operator] [Perform] [Final Strike]` | |
| Lifeng | Aspect of Wrath | `[Other Operator] [Perform] [Final Strike]` | |
| Perlica | Instant Protocol Chain | `[Other Operator] [Perform] [Final Strike]` | |
| Yvonne | Flashfreezer | `[Other Operator] [Perform] [Final Strike]` | |
| Catcher | Timely Suppression | `[Other Operator's HP] [Have], at most <threshold>` | |
| Ember | Frontline Support | `[Other Operator's HP] [Have], at most <threshold>` | |
| Snowshine | Polar Rescue | `[Other Operator's HP] [Have], at most <threshold>` | |
| Xaihi | Stress Testing | `[Other Operator's HP] [Overheal]` | |
| Endministrator | Sealing Sequence | `[Other Operator] [Perform] [Combo Skill]` | |

---

## Enum Reference

| Enum | Location |
|------|---------|
| `SubjectType` | `src/consts/semantics.ts` |
| `VerbType` | `src/consts/semantics.ts` |
| `ObjectType` | `src/consts/semantics.ts` |
| `CardinalityConstraintType` | `src/consts/semantics.ts` |
| `Interaction` | `src/consts/semantics.ts` |
| `StatusReaction` | `src/consts/semantics.ts` |
| `StackInteractionType` | `src/consts/enums.ts` |
| `CombatSkillType` | `src/consts/enums.ts` |
| `ElementType` | `src/consts/enums.ts` |
| `StatusType` | `src/consts/enums.ts` |
| `DurationUnit` | `src/consts/enums.ts` |
| `TimeDependencyType` | `src/consts/enums.ts` |
| `DamageType` | `src/consts/enums.ts` |
| `StatType` | `src/model/enums/stats.ts` |
| `EnemyStatType` | `src/model/enums/stats.ts` |
| `DamageFactorType` | `src/consts/enums.ts` |
