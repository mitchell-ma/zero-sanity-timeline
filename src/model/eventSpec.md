# Event Specification

This document defines the abstract Event model and its concrete types (CombatSkillEvent, StatusEvent). All events on a timeline share a common base structure composed of segments and frames.

All interactions in the DSL use the SVO (Subject-Verb-Object) grammar defined in `src/consts/semantics.ts`. For stacking mechanics, interaction semantics, and pipeline processing order, see [Game Mechanics Specification](game-data/gameMechanicsSpec.md).

---

## SVO Semantic Grammar

Every interaction in the system is a sentence: **Subject does Verb to Object.**

Types are defined in `src/consts/semantics.ts`:

### SubjectType

Who is performing the action or being checked.

Subjects use DeterminerType + NounType. e.g. `THIS OPERATOR`, `ANY OPERATOR`, `ENEMY`.

| DeterminerType | NounType | Meaning |
|----------------|----------|---------|
| `THIS` | `OPERATOR` | The operator who owns this event/status |
| `OTHER` | `OPERATOR` | Any single teammate (excludes this operator) |
| `ALL_OTHER` | `OPERATOR` | All teammates except this operator |
| `ALL` | `OPERATOR` | Entire team including this operator |
| `ANY` | `OPERATOR` | Any operator on the team (wildcard for triggers) |
| `CONTROLLED` | `OPERATOR` | The operator currently controlled by the player |
| `SOURCE` | `OPERATOR` | The operator who owns the talent/status definition |
| — | `ENEMY` | The enemy target |
| — | `SYSTEM` | System-initiated (threshold effects, passive triggers) |
| `THIS` | `EVENT` | The event/status that owns this clause |

### VerbType

| Category | Verbs | Description |
|----------|-------|-------------|
| **Action** | `PERFORM` | Execute a skill or action |
| | `APPLY` | Apply a status, infliction, or reaction |
| | `CONSUME` | Remove/use stacks |
| | `ABSORB` | Take stacks and optionally convert them (see `conversion` field) |
| | `DEFEAT` | Kill a target |
| | `HIT` | Strike a target (cardinality = how many hit) |
| **Resource** | `CONSUME` | Spend a resource |
| | `RECOVER` | Gain a resource |
| | `OVERHEAL` | Recovery exceeds maximum |
| | `RETURN` | Return resource to source |
| **Physical** | `LIFT` | Lift an enemy (requires pre-existing Vulnerable) |
| | `KNOCK_DOWN` | Knock down an enemy (requires pre-existing Vulnerable) |
| | `BREACH` | Breach an enemy (always applies) |
| | `CRUSH` | Crush an enemy (always applies) |
| **Stack/Duration** | `REFRESH` | Reset duration to full |
| | `EXTEND` | Extend duration |
| | `MERGE` | Newer subsumes older |
| | `RESET` | Reset stacks or cooldown to 0 |
| **Stat** | `IGNORE` | Ignore a resistance/stat |
| | `ENABLE` | Enable a skill variant tier |
| | `DISABLE` | Disable a skill variant tier |
| **Condition** | `HAVE` | Quantity/possession assertion (uses cardinality) |
| | `IS` | State assertion (uses subjectProperty for possessive, optional `negated` for NOT) |
| | `BECOME` | Transition assertion — subject just entered this state |
| | `RECEIVE` | Target receives a status/infliction/reaction |
| | `APPLY` | Subject applies something to a target (also an action verb; valid in conditions as trigger) |

### ObjectType

| Category | Values | Description |
|----------|--------|-------------|
| **Skills** | `BASIC_ATTACK`, `BATTLE_SKILL`, `COMBO_SKILL`, `ULTIMATE`, `FINAL_STRIKE`, `CRITICAL_HIT` | Skill types and combat events |
| **Statuses** | `STATUS`, `INFLICTION`, `REACTION`, `ARTS_REACTION`, `STACKS` | Status effects and stack counts |
| **Resources** | `SKILL_POINT`, `ULTIMATE_ENERGY`, `STAGGER`, `COOLDOWN`, `HP` | Combat resources |
| **Entities** | `OPERATOR` (with DeterminerType), `TEAM`, `ENEMY`, `EVENT` | Targets (DeterminerType + NounType) |
| **States** | `ACTIVE`, `LIFTED`, `KNOCKED_DOWN`, `BREACHED`, `CRUSHED`, `COMBUSTED`, `CORRODED`, `ELECTRIFIED`, `SOLIDIFIED` | For IS verb (with optional `negated: true` for NOT) |

### CardinalityConstraintType

| Value | Meaning |
|-------|---------|
| `EXACTLY` | == N |
| `GREATER_THAN` | > N |
| `GREATER_THAN_EQUAL` | >= N |
| `LESS_THAN` | < N |
| `LESS_THAN_EQUAL` | <= N |

### Interaction

```ts
interface Interaction {
  subjectDeterminer?: DeterminerType;  // THIS, OTHER, ALL, ANY
  subject: SubjectType;
  subjectProperty?: ObjectType;        // possessive — "This Operator's ULTIMATE"
  verb: VerbType;
  negated?: boolean;                   // NOT — "IS NOT ACTIVE"
  object: ObjectType;
  objectId?: string;                   // specific identifier (StatusType, skill name, etc.)
  cardinalityConstraint?: CardinalityConstraintType;  // EXACTLY, GREATER_THAN_EQUAL, LESS_THAN_EQUAL, etc.
  cardinality?: number;                // the count N in a cardinality assertion
  stacks?: number;                     // stacks to apply/consume
  element?: string;                    // element filter
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
    "unit": UnitType                   // SECOND or FRAME
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
      "unit": UnitType
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
      "unit": UnitType
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
  "verb": VerbType,
  "object"?: ObjectType,
  "objectId"?: string,                      // specific identifier (StatusType, skill name)
  "adjective"?: string | string[],          // e.g. "HEAT", ["FORCED", "COMBUSTION"]
  "toDeterminer"?: DeterminerType,      // THIS, OTHER, ALL, ANY — which target
  "toObject"?: string,                  // TO preposition — target/recipient
  "toObjectClassFilter"?: string,       // class filter for TO target (e.g. "GUARD")
  "fromDeterminer"?: DeterminerType,
  "from"?: string,                      // FROM preposition — source
  "onDeterminer"?: DeterminerType,
  "onObject"?: string,                  // ON preposition — stat target entity
  "with"?: {                                // WITH — properties/cardinalities
    [key: string]: {
      "verb": "IS" | "VARY_BY",
      "object"?: string,                    // dependency target for VARY_BY (e.g. "SKILL_LEVEL")
      "value": number | number[]            // single for IS, array for VARY_BY
    }
  }
}
```

#### WITH preposition keys (cardinalities)

| Key | Meaning | Semantic | Applies to |
|-----|---------|----------|------------|
| `value` | Additive amount | Values are **summed** within a damage/stat bucket | APPLY STAT (+20 STR), DEAL DAMAGE, RECOVER, CONSUME |
| `multiplier` | Multiplicative factor | Values **multiply** existing aggregate in a bucket | APPLY STAT (×1.2 existing susceptibility — e.g. LR T2 Cryogenic Embrittlement) |
| `duration` | Seconds | Duration of effect | TIME_STOP, REACTION, STATUS |
| `stagger` | Stagger amount | Additive | STAGGER |
| `skillPoint` | SP value | Additive | SKILL_POINT |
| `stacks` | Stack count | Count of stacks to apply/consume | STATUS, INFLICTION, ARTS_REACTION, PHYSICAL_STATUS |

**`value` vs `multiplier` for APPLY STAT:** Most stat effects use `value` (additive delta via `applyStatDelta`). Only effects that multiply the current aggregate use `multiplier` (via `applyStatMultiplier`). Currently only Last Rite's T2 Cryogenic Embrittlement uses `multiplier`.

#### WITH value verbs

| Verb | Value shape | Example |
|------|-------------|---------|
| `IS` | Single number | `{ "verb": "IS", "value": 10 }` |
| `VARY_BY` | Array indexed by dependency | `{ "verb": "VARY_BY", "object": "SKILL_LEVEL", "value": [0.5, 0.6, ...] }` |

#### Trigger-source duplication (`objectDeterminer: "TRIGGER"`)

A clause can re-apply whatever caused its trigger to fire by setting
`objectDeterminer: "TRIGGER"` on an `APPLY STATUS` effect. The engine reads
the triggering event at dispatch time and fills in the category (infliction,
physical status, etc.) from the trigger, so one effect covers every form the
trigger can take.

**Example — Antal combo skill (EMP Test Site):**

Antal's combo triggers when an enemy with Focus suffers an Arts Infliction
or a Physical Status. On hit, the combo applies another stack of the same
infliction/status that fired the trigger:

```json
{
  "effects": [
    { "verb": "APPLY", "objectDeterminer": "TRIGGER", "object": "STATUS", "objectId": "INFLICTION", "to": "ENEMY" },
    { "verb": "APPLY", "objectDeterminer": "TRIGGER", "object": "STATUS", "objectId": "PHYSICAL", "to": "ENEMY" }
  ]
}
```

The two effects cover the two trigger shapes (arts-infliction vs physical-
status). At runtime only the one matching the triggering event's category
fires; the other is a no-op.

Note: `INFLICTION` and `REACTION` are never valid as `object` in their own
right. They are `objectId` values under `object: STATUS`. The validator
rejects the legacy `{object: INFLICTION, objectQualifier: HEAT}` shape.

### Physical Status Mechanics — Vulnerable Prerequisite

Physical statuses (Lift, Knock Down, Breach, Crush) interact with **Vulnerable**, a physical infliction that stacks on the enemy.

**APPLY LIFT / KNOCK_DOWN** always adds 1 Vulnerable stack. The Lift/Knock Down status itself only triggers if the enemy **already had Vulnerable before this hit** (or `isForced` is set):

1. Engine checks `activeCount(VULNERABLE, ENEMY, frame) > 0`
2. Engine always applies 1 Vulnerable stack (regardless of check result)
3. If check was true → create Lift/Knock Down event (120% ATK Physical DMG, 1s RESET)
4. If check was false → only Vulnerable was added, no Lift/Knock Down

**Implication:** The first APPLY LIFT on a clean enemy only adds Vulnerable. A second APPLY LIFT (when Vulnerable exists) triggers the actual Lift. Rotation order matters.

**APPLY BREACH / CRUSH** do not require pre-existing Vulnerable — they always activate. Their damage scales with existing Vulnerable stacks (Breach: 50% + 50% per stack, Crush: 150% + 150% per stack).

All physical status applications also consume active **Solidification** (arts reaction) → triggering **Shatter** if present.

DSL pattern: `{ "verb": "APPLY", "objectQualifier": "LIFT", "objectId": "PHYSICAL", "object": "STATUS", "to": "ENEMY" }`

### Composition

```
Event
└── Segment[]
    └── Frame[]
        └── Effect[]
            └── with{}
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
  "name": string,                          // CombatSkillType enum value
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
  "duration": { "value": number[], "unit": UnitType },  // length = stack.max
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
  "onTriggerClause": Predicate[],

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
  "subject": SubjectType,              // who initiates (THIS_OPERATOR, SYSTEM)
  "verb": VerbType,                    // CONSUME, RECOVER, RETURN
  "object": ObjectType,               // SKILL_POINT, ULTIMATE_ENERGY, STAGGER, COOLDOWN, HP
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
| `WEAKNESS`                 | `WEAKNESS`         | General damage reduction on enemy              | Weakness |
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
  "stack": { "max": { "P0": 4, ... }, "instances": 4, "verb": "NONE" },
  "clause": [
    {
      "conditions": [
        { "subject": "EVENT", "verb": "HAVE", "object": "STACKS", "cardinalityConstraint": "EXACTLY", "cardinality": "MAX" }
      ],
      "effects": [
        { "verb": "APPLY", "object": "STATUS", "objectId": "SCORCHING_HEART_EFFECT", "toObject": "THIS_OPERATOR" }
      ]
    }
  ],
  "onTriggerClause": [
    { "conditions": [{ "subject": "THIS_OPERATOR", "verb": "PERFORM", "object": "BATTLE_SKILL" }] },
    { "conditions": [{ "subject": "THIS_OPERATOR", "verb": "PERFORM", "object": "COMBO_SKILL" }] }
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
  "stack": { "max": { "P0": 1, ... }, "instances": 1, "verb": "NONE" },
  "onTriggerClause": [
    {
      "conditions": [
        { "subject": "ANY_OPERATOR", "verb": "PERFORM", "object": "FINAL_STRIKE" },
        { "subject": "ENEMY", "verb": "HAVE", "object": "STATUS", "objectId": "INFLICTION", "objectQualifier": "HEAT" }
      ],
      "effects": [
        {
          "verb": "PERFORM_ALL",
          "cardinalityConstraint": "LESS_THAN_EQUAL",
          "cardinality": "MAX",
          "effects": [
            { "verb": "ABSORB", "cardinality": 1, "object": "STATUS", "objectId": "INFLICTION", "objectQualifier": "HEAT", "from": "ENEMY" },
            { "verb": "APPLY", "cardinality": 1, "object": "STATUS", "objectId": "MELTING_FLAME", "toObject": "THIS_OPERATOR" }
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
  "stack": { "max": { "P0": 1, ... }, "instances": 1, "verb": "RESET" },
  "onTriggerClause": [],
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
  "onTriggerClause": [
    {
      "conditions": [
        {
          "subject": "ENEMY",
          "verb": "HAVE",
          "object": "STATUS",
          "objectId": "INFLICTION",
          "objectQualifier": "ELECTRIC",
          "cardinalityConstraint": "GREATER_THAN_EQUAL",
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
  "onTriggerClause": [
    {
      "conditions": [
        {
          "subject": "ENEMY",
          "verb": "HAVE",
          "object": "STATUS",
          "objectId": "INFLICTION",
          "objectQualifier": "NATURE",
          "cardinalityConstraint": "GREATER_THAN_EQUAL",
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
  "onTriggerClause": [
    {
      "conditions": [
        {
          "subject": "ENEMY",
          "verb": "HAVE",
          "object": "STATUS",
          "objectId": "INFLICTION",
          "objectQualifier": "HEAT",
          "cardinalityConstraint": "GREATER_THAN_EQUAL",
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
          "subject": "OTHER_OPERATOR",
          "verb": "PERFORM",
          "object": "BATTLE_SKILL"
        }
      ],
      "effects": [
        {
          "verb": "CONSUME",
          "object": "STACKS",
          "cardinality": 1
        }
      ]
    }
  ],
  "onTriggerClause": [
    {
      "conditions": [
        {
          "subject": "THIS_OPERATOR",
          "verb": "PERFORM",
          "object": "BATTLE_SKILL"
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
  "onTriggerClause": [
    {
      "conditions": [
        {
          "subject": "THIS_OPERATOR",
          "subjectProperty": "HP",
          "verb": "OVERHEAL"
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
          "subject": "EVENT",
          "verb": "HAVE",
          "object": "STACKS",
          "cardinalityConstraint": "EXACTLY",
          "cardinality": "MAX"
        }
      ],
      "effects": [
        {
          "verb": "APPLY",
          "object": "STATUS",
          "objectId": "WILDLAND_TREKKER_BUFF",
          "toObject": "THIS_OPERATOR"
        }
      ]
    }
  ],
  "onTriggerClause": [
    {
      "conditions": [
        {
          "subject": "THIS_OPERATOR",
          "verb": "PERFORM",
          "object": "BATTLE_SKILL"
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
  "onTriggerClause": [
    {
      "conditions": [
        {
          "subject": "THIS_OPERATOR",
          "verb": "HAVE",
          "object": "STATUS",
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
          "subject": "EVENT",
          "verb": "HAVE",
          "object": "STACKS",
          "cardinalityConstraint": "EXACTLY",
          "cardinality": "MAX"
        }
      ],
      "effects": [
        {
          "verb": "APPLY",
          "object": "STATUS",
          "objectId": "MI_SECURITY_CRIT_BONUS",
          "toObject": "THIS_OPERATOR"
        },
        {
          "verb": "RESET",
          "object": "STACKS"
        }
      ]
    }
  ],
  "onTriggerClause": [
    {
      "conditions": [
        {
          "subject": "THIS_OPERATOR",
          "verb": "PERFORM",
          "object": "CRITICAL_HIT"
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
      "verb": "PERFORM_ALL",
      "cardinalityConstraint": "LESS_THAN_EQUAL",
      "cardinality": "MAX",
      "effects": [
        {
          "verb": "ABSORB",
          "cardinality": 1,
          "object": "STATUS",
          "objectId": "INFLICTION",
          "objectQualifier": "HEAT",
          "from": "ENEMY"
        },
        {
          "verb": "APPLY",
          "cardinality": 1,
          "object": "STATUS",
          "objectId": "MELTING_FLAME",
          "toObject": "THIS_OPERATOR"
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
| **Empowered** | Requires consuming a status event or resource (e.g. stacks, reaction) | `THIS_OPERATOR HAVE STATUS <X> GREATER_THAN_EQUAL <N>` or similar |

Enhanced and Empowered are combinable (e.g. `ENHANCED_EMPOWERED_BATTLE_SKILL` — during ultimate AND consuming stacks).

---

## Combo Window

Combo skills can only be used during a combo window. The combo window is a derived event that appears when trigger conditions are met (e.g. enemy becomes combusted). The combo skill's clause simply checks if the window is active.

```json
{
  "name": "COMBO_WINDOW",
  "clause": [
    { "conditions": [{ "subject": "ENEMY", "verb": "BECOME", "object": "COMBUSTED" }] },
    { "conditions": [{ "subject": "ENEMY", "verb": "BECOME", "object": "CORRODED" }] }
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
          "subject": "THIS_OPERATOR",
          "subjectProperty": "ULTIMATE",
          "verb": "IS",
          "object": "ACTIVE"
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
          "subject": "THIS_OPERATOR",
          "verb": "HAVE",
          "object": "STATUS",
          "objectId": "MELTING_FLAME",
          "cardinalityConstraint": "GREATER_THAN_EQUAL",
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
      "subject": "THIS_OPERATOR",
      "verb": "RECOVER",
      "object": "SKILL_POINT",
      "cardinality": 25,
      "conditions": {
        "enemiesHit": {
          "cardinalityConstraint": "GREATER_THAN_EQUAL",
          "cardinality": 1
        }
      }
    },
    {
      "subject": "THIS_OPERATOR",
      "verb": "RECOVER",
      "object": "SKILL_POINT",
      "cardinality": 30,
      "conditions": {
        "enemiesHit": {
          "cardinalityConstraint": "GREATER_THAN_EQUAL",
          "cardinality": 2
        }
      }
    },
    {
      "subject": "THIS_OPERATOR",
      "verb": "RECOVER",
      "object": "SKILL_POINT",
      "cardinality": 35,
      "conditions": {
        "enemiesHit": {
          "cardinalityConstraint": "GREATER_THAN_EQUAL",
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
          "subject": "THIS_OPERATOR",
          "verb": "PERFORM",
          "object": "ULTIMATE"
        }
      ],
      "effects": [
        {
          "verb": "RESET",
          "object": "COOLDOWN",
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
      "subject": "THIS_OPERATOR",
      "verb": "CONSUME",
      "object": "SKILL_POINT",
      "cardinality": 100
    },
    {
      "subject": "THIS_OPERATOR",
      "verb": "RECOVER",
      "object": "ULTIMATE_ENERGY",
      "cardinality": 6.5,
      "target": "THIS_OPERATOR"
    },
    {
      "subject": "THIS_OPERATOR",
      "verb": "RECOVER",
      "object": "ULTIMATE_ENERGY",
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
              "subject": "THIS_OPERATOR",
              "verb": "RECOVER",
              "object": "SKILL_POINT",
              "cardinality": 20
            },
            {
              "subject": "THIS_OPERATOR",
              "verb": "RECOVER",
              "object": "STAGGER",
              "cardinality": 10
            }
          ],
          "statusInteractions": [
            {
              "subject": "THIS_OPERATOR",
              "verb": "APPLY",
              "object": "STATUS",
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
        { "verb": "APPLY", "object": "TIME_STOP", "asAdjective": "ANIMATION" },
        { "verb": "CONSUME", "cardinality": 300, "object": "ULTIMATE_ENERGY" }
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
| `UnitType` | `src/consts/enums.ts` |
| `TimeDependencyType` | `src/consts/enums.ts` |
| `DamageType` | `src/consts/enums.ts` |
| `StatType` | `src/model/enums/stats.ts` |
| `EnemyStatType` | `src/model/enums/stats.ts` |
| `DamageFactorType` | `src/consts/enums.ts` |
