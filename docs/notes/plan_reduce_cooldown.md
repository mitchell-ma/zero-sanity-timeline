# REDUCE COOLDOWN Verb — Stashed Plan

## Grammar

```
REDUCE [determiner] [OPERATOR] [objectId] COOLDOWN WITH
  DURATION
    value IS/VARY_BY [...]
    unit PERCENTAGE|SECOND
```

- Object: `COOLDOWN` only (for now)
- `objectId`: `COMBO_SKILL` or `ULTIMATE` (which skill's cooldown)
- `objectSource`: `OPERATOR` only (for now)
- `objectSourceDeterminer`: any of THIS, OTHER, ALL, ANY
- WITH.duration: reduction amount with `unit` field (PERCENTAGE or SECOND)
- PERCENTAGE: reduce by % of max cooldown duration
- SECOND: reduce by flat seconds (→ frames)
- Reduction can happen during any phase of the event (pre-reduces cooldown segment)
- If cooldown segment `timeDependency === REAL_TIME`, straight subtraction

## Implementation

### semantics.ts
- Add `REDUCE = "REDUCE"` to VerbType
- Add `[VerbType.REDUCE]: ['COOLDOWN']` to VERB_OBJECTS
- Add `objectSource?: string` and `objectSourceDeterminer?: DeterminerType` to Effect
- Add `unit?: DurationUnit` to WithValue
- Add `PERCENTAGE = "PERCENTAGE"` to DurationUnit enum in enums.ts

### eventInterpretor.ts (runs in queue)
- Add `doReduce(effect, ctx)` handler
- Find target skill event's cooldown segment (SegmentType.COOLDOWN)
- Calculate reduction (SECOND: value * FPS, PERCENTAGE: maxCooldown * value / 100)
- Modify segment via DerivedEventController

### derivedEventController.ts
- Add `reduceCooldown(eventId, segmentIndex, newDuration)` method

### effectExecutor.ts
- Add `case VerbType.REDUCE:` returning emptyMutationSet() (NOOP — handled by interpretor)

## Blocked by
- Pipeline refactor (eventQueueController → CombatLoadoutController + DEC inline)
