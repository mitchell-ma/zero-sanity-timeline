# Customization Specification

Users can create custom operators, weapons, gears, and their associated skills/effects through an in-app customization UI. All custom content uses the SVO semantic grammar defined in `src/consts/semantics.ts` and the event DSL from `src/model/eventSpec.md`.

---

## 1. Custom Operators

### Data Model

A custom operator is a JSON object conforming to the operator data spec (`src/model/game-data/operatorDataSpec.md`) with additional metadata for display.

```ts
CustomOperator = {
  // ── Identity ──
  "id": string,                              // kebab-case unique ID (e.g. "my-custom-striker")
  "name": string,                            // display name
  "operatorClassType": OperatorClassType,     // GUARD, CASTER, STRIKER, VANGUARD, DEFENDER, SUPPORTER
  "elementType": ElementType,                // HEAT, CRYO, NATURE, ELECTRIC, PHYSICAL, NONE
  "weaponType": WeaponType,                  // SWORD, GREAT_SWORD, POLEARM, HANDCANNON, ARTS_UNIT
  "operatorRarity": OperatorRarity,          // 4, 5, 6

  // ── Display ──
  "splashArt"?: string,                      // data URL or empty (falls back to class icon)

  // ── Stats ──
  "mainAttributeType": StatType,             // PRIMARY scaling stat
  "secondaryAttributeType"?: StatType,       // optional secondary
  "baseStats": {
    "lv1": Partial<Record<StatType, number>>,
    "lv90": Partial<Record<StatType, number>>
  },

  // ── Potentials ──
  "potentials": PotentialEntry[],            // 0-5 potential bonuses (see below)

  // ── Skills ──
  "skills": {
    "basicAttack": CustomCombatSkillDef,
    "battleSkill": CustomCombatSkillDef,
    "comboSkill": CustomCombatSkillDef,
    "ultimate": CustomCombatSkillDef
  },

  // ── Combo Activation ──
  "combo": {
    "requires": Interaction[],                // OR conditions — any match opens combo window
    "description": string,                    // tooltip text
    "windowFrames"?: number,                  // activation window (default: 120)
    "forbidsActiveColumns"?: string[],        // columns that prevent combo
    "requiresActiveColumns"?: string[]        // columns that must be active
  },

  // ── Status Events ──
  // Operator-specific statuses (self-buffs, debuffs, reactions).
  // Uses the full StatusEvent DSL from eventSpec.md.
  "statusEvents"?: StatusEventDef[]
}
```

### CustomCombatSkillDef

Defines a single skill slot using the CombatSkillEvent DSL with embedded frame data.

```ts
CustomCombatSkillDef = {
  "name": string,                            // display name (e.g. "Smouldering Fire")
  "combatSkillType": CombatSkillType,        // BASIC_ATTACK, BATTLE_SKILL, COMBO_SKILL, ULTIMATE
  "element"?: ElementType,                   // override operator element for this skill

  // ── Timing ──
  "durationSeconds": number,                 // active duration
  "cooldownSeconds"?: number,                // cooldown (combo/ultimate)
  "animationSeconds"?: number,               // animation lock duration
  "timeInteractionType"?: TimeInteractionType, // TIME_STOP, TIME_DELAY, NONE

  // ── Resources ──
  "resourceInteractions"?: ResourceInteraction[],

  // ── Activation Conditions ──
  // When this skill variant is available (e.g. enhanced during ultimate).
  // Uses OR-of-ANDs: each inner array is a conjunction of predicates.
  "clauses"?: Interaction[][],

  // ── Segments & Frames ──
  // Uses the same Segment/Frame DSL from eventSpec.md.
  // If omitted, the skill has no frame-level detail (duration-only block).
  "segments"?: SegmentDef[],

  // ── Skill Multipliers ──
  // Level-indexed (1-12). Optional — if omitted, no damage contribution.
  "multipliers"?: {
    "label": string,                         // e.g. "Base Explosion"
    "values": number[]                       // 12 entries, one per skill level
  }[],

  // ── Triggers Published ──
  // What Interactions this skill publishes when performed.
  // Defaults are inferred from element (e.g. HEAT → APPLY INFLICTION heat).
  "publishesTriggers"?: Interaction[]
}
```

### SegmentDef

```ts
SegmentDef = {
  "name"?: string,
  "durationSeconds": number,
  "stats"?: StatModifier[],
  "frames"?: FrameDef[]
}
```

### FrameDef

```ts
FrameDef = {
  "offsetSeconds": number,                   // offset from segment start
  "damage"?: {
    "elementType": ElementType,
    "multiplier": number[],                  // level-indexed
    "damageType": DamageType                 // PHYSICAL or ARTS
  },
  "resourceInteractions"?: ResourceInteraction[],
  "statusInteractions"?: Interaction[]       // SVO interactions (APPLY, CONSUME, ABSORB)
}
```

### PotentialEntry

```ts
PotentialEntry = {
  "level": 1 | 2 | 3 | 4 | 5,
  "type": PotentialEffectType,               // STAT_MODIFIER, SKILL_PARAMETER, SKILL_COST, BUFF_ATTACHMENT
  "description": string,
  "statModifiers"?: Partial<Record<StatType, number>>,
  "parameterModifier"?: {
    "skill": CombatSkillType,
    "multiplierLabel": string,               // which multiplier row to modify
    "modifyType": ParameterModifyType,       // ADDITIVE, MULTIPLICATIVE, UNIQUE_MULTIPLIER
    "value": number
  },
  // Potential-specific reactions (e.g. P5 combo cooldown reset)
  "reactions"?: StatusReaction[]
}
```

### StatusEventDef

Uses the full StatusEvent DSL from `eventSpec.md` with SVO grammar. The `name` field serves as the status identifier and can reference a built-in `StatusType` or define a custom status name (prefixed with `CUSTOM_` to avoid collisions).

```ts
StatusEventDef = {
  // Full StatusEvent structure — see eventSpec.md.
  // All trigger conditions, reactions, and status interactions use the
  // Interaction and StatusReaction interfaces from semantics.ts.
  // Custom status names must be prefixed: "CUSTOM_MY_STATUS_NAME"
}
```

---

## 2. Custom Weapons

### Data Model

```ts
CustomWeapon = {
  // ── Identity ──
  "id": string,                              // kebab-case unique ID
  "name": string,                            // display name
  "weaponType": WeaponType,                  // SWORD, GREAT_SWORD, POLEARM, HANDCANNON, ARTS_UNIT
  "weaponRarity": 3 | 4 | 5 | 6,

  // ── Display ──
  "icon"?: string,                           // data URL or empty (falls back to weapon type icon)

  // ── Stats ──
  "baseAtk": {
    "lv1": number,
    "lv90": number
  },

  // ── Skills ──
  // Rarity determines skill count: 3★ = 0, 4★ = 1, 5★ = 2, 6★ = 3
  "skills": CustomWeaponSkillDef[]
}
```

### CustomWeaponSkillDef

A weapon skill is either a **stat boost** (passive scaling stat) or a **named skill** (triggered effect with statuses).

```ts
CustomWeaponSkillDef = {
  "type": "STAT_BOOST" | "NAMED",

  // ── Common ──
  "label": string,                           // display name

  // ── STAT_BOOST ──
  // Simple scaling stat. Value scales by weapon skill level (1-9).
  "statBoost"?: {
    "stat": StatType,
    "values": number[]                       // 9 entries, one per weapon skill level
  },

  // ── NAMED ──
  // Triggered effect producing a WeaponSkillStatusEvent.
  "namedEffect"?: CustomWeaponNamedEffect
}
```

### CustomWeaponNamedEffect

Named weapon skills produce `WeaponSkillStatusEvent` instances on the timeline. Triggers use the SVO `Interaction` interface.

```ts
CustomWeaponNamedEffect = {
  "name": string,                            // status display name
  "description"?: string,

  // ── Trigger ──
  // Any match activates (OR). Each entry is an SVO Interaction.
  "triggers": Interaction[],
  "target": ObjectType,                      // THIS_OPERATOR, ENEMY, ALL_OPERATORS, OTHER_OPERATOR, OTHER_OPERATORS
  "element"?: ElementType,

  // ── Duration & Stacking ──
  "durationSeconds": number,
  "maxStacks": number,                       // 1 = no stacking
  "cooldownSeconds"?: number,

  // ── Buffs ──
  // Each buff is a stat modifier applied while the effect is active.
  // Values scale by weapon skill level (min at lv1, max at lv9).
  "buffs": CustomWeaponBuff[],

  // ── Passive Stats ──
  // Stats applied unconditionally while weapon is equipped.
  "passiveStats"?: {
    "stat": StatType,
    "values": number[]                       // 9 entries per weapon skill level
  }[],

  // ── Reactions ──
  // Optional reactions when this weapon effect is active (e.g. consume on next skill).
  "reactions"?: StatusReaction[],

  "note"?: string
}
```

### CustomWeaponBuff

```ts
CustomWeaponBuff = {
  "stat": StatType | EnemyStatType,          // stat being modified
  "valueMin": number,                        // value at weapon skill level 1
  "valueMax": number,                        // value at weapon skill level 9
  "perStack": boolean                        // if true, value is per-stack (multiplied by current stacks)
}
```

---

## 3. Custom Gears

### Data Model

A custom gear set consists of 3 pieces (armor, gloves, kit) with optional set effects.

```ts
CustomGearSet = {
  // ── Identity ──
  "id": string,                              // kebab-case unique ID
  "setName": string,                         // display name (e.g. "My Custom Set")
  "rarity": 4 | 5 | 6,

  // ── Display ──
  "icon"?: string,                           // data URL or empty

  // ── Pieces ──
  "pieces": CustomGearPiece[],               // exactly 3: one per GearCategory

  // ── Set Effect ──
  // Requires 3 pieces equipped. Optional — not all gear sets have effects.
  "setEffect"?: CustomGearSetEffect
}
```

### CustomGearPiece

```ts
CustomGearPiece = {
  "name": string,                            // piece display name
  "gearCategory": GearCategory,              // ARMOR, GLOVES, KIT
  "defense": number,                         // flat defense value (constant across ranks)

  // ── Stats by Rank ──
  // Rank 1-4. Each rank provides stats that override previous.
  // Uses sparse lookup — rank 1 stats apply to all ranks unless overridden.
  "statsByRank": {
    [rank: number]: Partial<Record<StatType, number>>
  }
}
```

### CustomGearSetEffect

Set effects activate when 3 pieces from the same set are equipped. They can have passive stats and/or triggered conditional effects.

```ts
CustomGearSetEffect = {
  // ── Passive Stats ──
  // Always active with 3-piece bonus. No trigger required.
  "passiveStats"?: Partial<Record<StatType, number>>,

  // ── Triggered Effects ──
  // Conditional buffs that produce GearSetStatusEvent instances.
  "effects"?: CustomGearEffect[]
}
```

### CustomGearEffect

Triggered gear effects produce `GearSetStatusEvent` instances on the timeline.

```ts
CustomGearEffect = {
  "label": string,                           // effect display name

  // ── Trigger ──
  // Any match activates (OR). Each entry is an SVO Interaction.
  "triggers": Interaction[],
  "target": ObjectType,                      // THIS_OPERATOR, ENEMY, ALL_OPERATORS, OTHER_OPERATOR, OTHER_OPERATORS

  // ── Duration & Stacking ──
  "durationSeconds": number,
  "maxStacks": number,
  "cooldownSeconds"?: number,

  // ── Buffs ──
  "buffs": CustomGearBuff[],

  // ── Stack Reactions ──
  // Optional reactions on stack changes (e.g. threshold effects).
  "stackReactions"?: StatusReaction[],

  "note"?: string
}
```

### CustomGearBuff

```ts
CustomGearBuff = {
  "stat": StatType | EnemyStatType,
  "value": number,                           // fixed value (gear effects don't scale by rank)
  "perStack": boolean
}
```

---

## 4. DSL Extensions

### Extended Enums

Custom content introduces dynamic enum values. The system must support custom identifiers alongside built-in enums in these specific places:

| Field | Built-in Enum | Custom Extension |
|-------|---------------|------------------|
| Operator identity | `OperatorType` | `CUSTOM_<id>` prefix |
| Skill names | `CombatSkillsType` | `CUSTOM_<id>_<skill>` prefix |
| Status names | `StatusType` | `CUSTOM_<id>` prefix |
| Gear set type | `GearSetType` | `CUSTOM_<id>` prefix |
| Weapon name | registry key | `custom/<id>` prefix |
| Gear effect type | `GearSetEffectType` | `CUSTOM_<id>` prefix |
| Weapon skill type | `WeaponSkillType` | `CUSTOM_<id>` prefix |

All custom identifiers are prefixed to prevent namespace collisions with built-in values. The prefix is stripped for display purposes.

### Custom StatusEvent Integration

Custom operators can define arbitrary status events using the full `StatusEvent` DSL with SVO interactions. These integrate into the existing timeline pipeline:

1. **Trigger resolution**: SVO trigger `Interaction`s are evaluated alongside built-in triggers in `processStatus.ts`
2. **Infliction processing**: Custom element inflictions follow the same threshold → reaction pipeline
3. **Stack management**: All `StackInteractionType` behaviors apply identically
4. **StatusReactions**: Custom reactions fire on stack changes and external events
5. **Stat application**: Custom stat modifiers feed into `loadoutAggregator.ts` and `statusQueryService.ts`

### Cross-Reference Between Custom Components

Custom components can reference each other via `objectId` in `Interaction`s:

```
CustomOperator.statusEvents[].trigger.conditions → can reference custom status names
CustomWeapon.skills[].namedEffect.triggers       → can reference custom objectIds
CustomGearSet.setEffect.effects[].triggers       → can reference custom objectIds
```

The resolution order is: built-in enums first, then custom definitions from all loaded custom content.

---

## 5. Storage

### Format

All custom content is stored as JSON in `localStorage` under namespaced keys:

```
zst-custom-operators:   CustomOperator[]
zst-custom-weapons:     CustomWeapon[]
zst-custom-gear-sets:   CustomGearSet[]
```

### Import/Export

Custom content can be exported as a single JSON bundle and imported on another browser:

```ts
CustomBundle = {
  "version": 1,
  "operators": CustomOperator[],
  "weapons": CustomWeapon[],
  "gearSets": CustomGearSet[]
}
```

Export/import uses the same download/upload pattern as sheet save/load in `sheetStorage.ts`.

### Sheet References

When a sheet references custom content, the sheet save includes the custom content IDs. On load, missing custom content shows a warning with an option to import.

---

## 6. Customization UI

### Entry Point

A "Custom Content" button in the app bar opens the customization panel. The panel has tabs for each content type: **Operators**, **Weapons**, **Gear Sets**.

Each tab shows:
- List of existing custom content (edit/delete/duplicate)
- "Create New" button

### Form Architecture

The customization UI is a multi-step wizard that guides users through creating each component. Each step maps to a section of the data model. The form validates in real-time and shows previews where possible.

All forms follow the controller pattern: a `CustomizationController` handles validation, serialization, and state management. The view layer renders form fields and previews.

### Operator Creation Wizard

**Step 1: Identity & Class**
- Name (text input)
- Class type (dropdown: Guard, Caster, Striker, Vanguard, Defender, Supporter)
- Element (dropdown with color chips: Heat, Cryo, Nature, Electric, Physical, None)
- Weapon type (dropdown: Sword, Great Sword, Polearm, Handcannon, Arts Unit)
- Rarity (radio: 4★, 5★, 6★)
- Display color (color picker)
- Splash art (file upload, optional)

**Step 2: Base Stats**
- Two-column table: Lv1 stats and Lv90 stats
- Pre-populated with `DEFAULT_STATS` for the chosen class
- Editable number inputs for each stat
- Stats filtered by `STAT_ATTRIBUTION[OPERATOR]`

**Step 3: Skills**
For each of the 4 skill slots (Basic Attack, Battle Skill, Combo Skill, Ultimate):

- Skill name (text input)
- Duration (seconds, number input)
- Cooldown (seconds, for combo/ultimate)
- Animation duration (seconds, optional)
- Time interaction (dropdown: None, Time Stop, Time Delay)
- Resource interactions (repeatable row group):
  - Uses SVO: Subject + Verb + Object + quantity
  - e.g. `[This Operator ▼] [Expend ▼] [Skill Point ▼] [100]`

**Step 3b: Skill Segments & Frames** (expandable per skill)
- Add/remove segments
- Per segment:
  - Name (optional text)
  - Duration (seconds)
  - Stats (repeatable stat modifier rows)
  - Frames (repeatable frame rows):
    - Offset (seconds)
    - Damage (optional: element, multiplier array, damage type)
    - Resource interactions (SVO rows)
    - Status interactions (SVO `Interaction` builder):
      - `[Subject ▼] [Verb ▼] [Object ▼] [objectId ▼]`
      - Shows conversion fields when verb is ABSORB

**Step 3c: Skill Multipliers** (expandable per skill)
- Repeatable multiplier rows:
  - Label (text)
  - 12 level values (number inputs in a compact row)

**Step 4: Combo Activation**
- Trigger conditions (SVO `Interaction` builder, OR list)
- Description (text)
- Window frames (number, default 120)
- Forbids/requires active columns (multi-select, optional)

**Step 5: Potentials**
- 5 potential slots (P1-P5)
- Per potential:
  - Type (dropdown: Stat Modifier, Skill Parameter, Skill Cost, Buff Attachment)
  - Description (text)
  - For Stat Modifier: stat type + value
  - For Skill Parameter: skill target, multiplier label, modify type, value
  - Reactions (optional StatusReaction builder)

**Step 6: Status Events** (optional, repeatable)
- Full StatusEvent form using the SVO DSL:
  - Name (text, auto-prefixed with CUSTOM_)
  - Target (dropdown from ObjectType entities: This Operator, Enemy, All Operators, Other Operator)
  - Element (dropdown)
  - Is named event (checkbox — whether it shows on timeline)
  - Duration array (dynamic inputs based on max stacks)
  - Stack config:
    - Interaction type (dropdown from StackInteractionType)
    - Max stacks (number)
    - Instances (number)
    - Stack reactions (StatusReaction builder — trigger + reaction pairs)
  - Trigger conditions (OR-of-ANDs builder using `Interaction`):
    - Visual group builder: "ANY OF" groups containing "ALL OF" conditions
    - Each condition: SVO `Interaction` row
  - Status reactions (StatusReaction builder — trigger + reaction pairs)
  - Stats (repeatable: stat type + value array)
  - Segments (same segment builder as skills)

**Step 7: Preview & Save**
- Summary card showing operator with all configured skills
- Timeline preview showing a sample rotation
- Save button (validates and stores to localStorage)

### Weapon Creation Wizard

**Step 1: Identity**
- Name (text input)
- Weapon type (dropdown)
- Rarity (radio: 3★, 4★, 5★, 6★)
- Base attack at Lv1 and Lv90 (number inputs)
- Icon (file upload, optional)

**Step 2: Skills**
Number of skill slots determined by rarity (3★=0, 4★=1, 5★=2, 6★=3). Per skill:

- Skill type toggle: **Stat Boost** or **Named Effect**

For **Stat Boost**:
- Stat type (dropdown)
- 9 level values (compact number row)

For **Named Effect**:
- Effect name (text)
- Description (text, optional)
- Triggers (SVO `Interaction` builder, OR list)
- Target (dropdown from ObjectType entities)
- Element (dropdown, optional)
- Duration (seconds)
- Max stacks (number)
- Cooldown (seconds, optional)
- Buffs (repeatable):
  - Stat type (dropdown)
  - Value at skill lv1 (number)
  - Value at skill lv9 (number)
  - Per stack (checkbox)
- Passive stats (optional, repeatable):
  - Stat type (dropdown)
  - 9 level values (compact number row)
- Reactions (optional StatusReaction builder)
- Note (text, optional)

**Step 3: Preview & Save**

### Gear Set Creation Wizard

**Step 1: Set Identity**
- Set name (text input)
- Rarity (radio: 4★, 5★, 6★)
- Icon (file upload, optional)

**Step 2: Pieces**
3 pieces auto-created (Armor, Gloves, Kit). Per piece:

- Piece name (text input, pre-populated: "[Set Name] Armor/Gloves/Kit")
- Defense value (number)
- Stats by rank (4 rank columns, each with stat type + value rows):
  - Compact table view with ranks as columns
  - Add stat row button
  - Percentages entered as decimals (tooltip: "0.05 = 5%")

**Step 3: Set Effect** (optional)
- Toggle: "This set has a set effect"

Passive stats (always-on with 3-piece):
- Repeatable stat + value rows

Triggered effects (repeatable):
- Label (text)
- Triggers (SVO `Interaction` builder, OR list)
- Target (dropdown from ObjectType entities)
- Duration (seconds)
- Max stacks (number)
- Cooldown (seconds, optional)
- Buffs (repeatable: stat + value + per-stack checkbox)
- Stack reactions (optional StatusReaction builder)
- Note (optional)

**Step 4: Preview & Save**

### Shared UI Components

**InteractionBuilder**
The core reusable component. Renders a single SVO `Interaction` as a form row. Used everywhere triggers, conditions, and effects are defined.

```
┌─────────────────────────────────────────────────────────────────┐
│ [Subject: This Operator ▼] [Verb: Perform ▼] [Object: ▼]      │
│                             Battle Skill                        │
│ Cardinality: [at least ▼] [1]   Stacks: [  ]   Forced: [ ]    │
│                                                                 │
│ ┌─ Conversion (ABSORB only) ─────────────────────────────────┐ │
│ │ → [Object: Status ▼] [objectId: Melting Flame ▼]           │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

Dynamic behavior:
- Object dropdown filters based on Verb (PERFORM → skills, APPLY → statuses/inflictions, RECOVER → resources, IS → states, HIT/DEFEAT → entities)
- Cardinality row shown only for HAVE, HIT, PERFORM (occurrence counting)
- Conversion section shown only for ABSORB
- subjectProperty shown only for IS and OVERHEAL
- Negated checkbox shown only for IS

**StatusReactionBuilder**
Renders a trigger/reaction pair using two `InteractionBuilder`s:

```
┌─ Status Reaction ───────────────────────────────────────────────┐
│ When:                                                           │
│   [This Operator ▼] [Have ▼] [Stacks ▼]  [exactly ▼] [4]     │
│ Then:                                                           │
│   [System ▼] [Apply ▼] [Status ▼] [Scorching Heart ▼]         │
└─────────────────────────────────────────────────────────────────┘
```

**ConditionGroupBuilder**
OR-of-ANDs builder using `InteractionBuilder` rows:

```
┌─ Any of these ──────────────────────────────────────────────────┐
│ ┌─ All of these ──────────────────────────────────────────────┐ │
│ │ [This Operator ▼] [Perform ▼] [Battle Skill ▼]             │ │
│ │                                                    [+ AND]  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─ All of these ──────────────────────────────────────────────┐ │
│ │ [This Operator's ▼] [HP ▼] [Overheal ▼]                    │ │
│ │                                                    [+ AND]  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                        [+ OR]   │
└─────────────────────────────────────────────────────────────────┘
```

**StatModifierEditor**
Repeatable row group for stat type + value(s). Supports single values, level-indexed arrays, and rank-indexed arrays depending on context.

**SegmentFrameEditor**
Nested editor for segments containing frames. Collapsible per segment, with drag-to-reorder for frames. Frame status interactions use `InteractionBuilder`.

**MultiplierTableEditor**
Compact table for entering 9 or 12 level-indexed values. Shows column headers (Lv1-Lv12 or Lv1-Lv9).

---

## 7. Registration & Hydration

### Boot Sequence

On app startup:

1. Load custom content from `localStorage`
2. For each `CustomOperator`: register into `operatorRegistry` and `loadoutRegistry`
3. For each `CustomWeapon`: register into `WEAPON_DATA` and `loadoutRegistry`
4. For each `CustomGearSet`: register pieces into `loadoutRegistry`, effects into `GEAR_SET_EFFECTS`
5. Custom `objectId` values are added to runtime lookup maps for `Interaction` resolution

### Hydration

Custom content is hydrated through the same factories as built-in content:

- **Operators**: `CustomOperator` JSON → `DataDrivenOperator` class (new, extends `BaseOperator`)
  - Skills → `DataDrivenSkill` wrappers around `CustomCombatSkillDef`
  - Frames → `DataDrivenSkillEventFrame` / `DataDrivenSkillEventSequence` (existing)
  - Status events → `StatusEvent` / `GearSetStatusEvent` / `WeaponSkillStatusEvent` (existing)
  - Triggers & reactions → resolved via `Interaction` evaluation engine

- **Weapons**: `CustomWeapon` JSON → `DataDrivenWeapon` (existing class in `weaponData.ts`)
  - Stat boosts → generic `WeaponSkill` subclass
  - Named effects → `WeaponSkillStatusEvent` (existing)
  - Triggers → `Interaction` evaluation

- **Gears**: `CustomGearSet` JSON → `Gear` subclass instances
  - Pieces → `DataDrivenGear` class (new, extends `Gear`)
  - Set effects → `GearSetStatusEvent` (existing)
  - Triggers & stack reactions → `Interaction` evaluation

### Deregistration

When custom content is deleted:
1. Remove from `localStorage`
2. Remove from runtime registries
3. Sheets referencing deleted content show warning and fall back to empty slots

---

## 8. Validation Rules

### Operator
- Name: required, unique among all operators (built-in + custom)
- Stats: at least `BASE_ATTACK` and `BASE_HP` must be set for both Lv1 and Lv90
- Skills: all 4 slots must have at least a name and duration
- Combo: at least one trigger `Interaction` required
- Status events: names must be unique, duration array length must match `stack.max`
- All `Interaction` fields must reference valid `SubjectType`, `VerbType`, `ObjectType` values
- `objectId` must reference a built-in or custom-defined identifier

### Weapon
- Name: required, unique among all weapons
- Base attack: both Lv1 and Lv90 must be positive
- Skill count must not exceed rarity allowance
- Named effect buffs: `valueMin` and `valueMax` must be same sign
- Trigger `Interaction`s must be valid

### Gear Set
- Set name: required, unique among all gear sets
- Must have exactly 3 pieces (one per category)
- Each piece must have at least one stat at rank 1
- Defense must be non-negative
- Effect buffs: value must be non-zero
- Trigger `Interaction`s must be valid

### Cross-references
- `objectId` values in `Interaction`s referencing custom statuses must point to a status defined in the same operator or already registered
- `StatusReaction` trigger and reaction `Interaction`s must both be individually valid

---

## 9. Implementation Priority

### Phase 1: Semantic Grammar (`src/consts/semantics.ts`)
Define `SubjectType`, `VerbType`, `ObjectType`, `CardinalityType`, `Interaction`, `StatusReaction` interfaces. Add converter functions between legacy interfaces (`TriggerCondition`, `StatusInteractionEntry`, `ActivationCondition`) and the new `Interaction` type.

### Phase 2: Custom Weapons
Smallest surface area. Weapon data model is already data-driven (`DataDrivenWeapon`). Named effects feed into existing `WeaponSkillStatusEvent`. UI is a simple 2-step wizard. Builds the `InteractionBuilder` component.

### Phase 3: Custom Gear Sets
Moderate complexity. Gear pieces are straightforward stat tables. Set effects use existing `GearSetStatusEvent`. UI requires the stat-by-rank table editor and `StatusReactionBuilder`.

### Phase 4: Custom Operators
Largest surface area. Requires `DataDrivenOperator` class, full skill/frame/status-event forms, and integration with operator registry, timeline pipeline, and damage calculation. Uses all shared UI components.

### Phase 5: Import/Export & Cross-Reference
Bundle export/import, sheet reference resolution, and custom-to-custom cross-references.
