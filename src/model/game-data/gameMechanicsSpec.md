# Game Mechanics Specification

This document defines the game mechanics and their modeling in the timeline system.

---

## Stacking

Status effects, inflictions, and buffs can stack. Each stackable effect has a `maxStacks` count and a `stackInteractionType` that determines what happens when a new stack is applied.

### Max Stacks

| Value | Meaning |
|-------|---------|
| `0`   | Infinite stacks. Stacks never interact with each other. Each instance lives independently. |
| `1`   | Single-stack. Every new application immediately triggers the stack interaction. |
| `N`   | Up to N concurrent stacks. Stack interaction triggers only when applying at max. |

If `maxStacks === 0`, stacks are infinite and no interaction occurs (unless the effect has a MERGE or APPLY property).

If `maxStacks === 1`, the stack interaction is triggered on every application after the first.

If `maxStacks > 1` and the stacks have infinite duration without a MERGE property, we do nothing when at max stacks (no new stack is created).

### StackInteractionType

Defines the behavior when a new stack is applied at (or beyond) max stacks.

| Type      | Behavior | Current Implementations |
|-----------|----------|------------------------|
| `NONE`    | No interaction. New stacks are ignored when at max, or stacks accumulate independently without limit. | Melting Flame at max 4 slots (infinite duration, no new stacks created), infinite-stack effects |
| `REFRESH` | End the stack expiring earliest and start a new stack in its place. The refreshed stack gets the full base duration. | Unbridled Edge (max 3 → clamp earliest, create new), Scorching Fangs P3 (clamp active, create new) |
| `EXTEND`  | Extend the duration of all existing stacks to match the newest stack's end time. All stacks share the same expiry. | Arts inflictions (`applySameElementRefresh`), Physical inflictions (`applyPhysicalInflictionRefresh`) |
| `MERGE`   | Merge overlapping effects of the same type. The newer effect subsumes the older — the older is clamped at the newer's start frame. Only applies when the newer outlasts the older. | Arts reactions (`mergeReactions`) |
| `APPLY`   | When a stack threshold is met, a new derived Event is produced on another timeline. The stacks themselves may or may not be consumed. | Cross-element infliction overlap → Reaction event (`deriveReactions`), Combustion → Scorching Fangs (`deriveScorchingFangs`) |
| `CONSUME` | When a condition is met, stacks are reset to 0 (clamped at the consumption frame). The condition is external — a skill cast, an absorption frame, or a cross-timeline event. | Absorption (Melting Flame: infliction stacks consumed on absorb frame), Team status consumption (Link: consumed on next skill cast), Operator status consumption (Thunderlance: consumed on `consumeStatus` frame), Reaction consumption (cross-element inflictions clamped on reaction) |

### Interaction with Duration

- **Finite duration + REFRESH**: The oldest stack is ended early and replaced. Used for rolling buff windows (Unbridled Edge).
- **Finite duration + EXTEND**: All stacks' durations stretch to the newest stack's natural end. Models the in-game "timer refresh" mechanic (arts/physical inflictions).
- **Finite duration + MERGE**: Overlapping same-type effects consolidate. The older is clamped only if the newer outlasts it. If the older would outlast the newer, both coexist.
- **Infinite duration + max slots**: Once at max, no new stacks are created. The slot system caps concurrent instances (Melting Flame max 4).
- **Infinite duration + no max**: Stacks accumulate without limit and never interact.

### Compound Interactions

Some effects use multiple interaction types in sequence:

1. **Inflictions → Reaction**: EXTEND (same-element refresh) + APPLY (cross-element → reaction) + CONSUME (both elements clamped on reaction).
2. **Absorption → Exchange Status**: CONSUME (infliction stacks absorbed) + creates new exchange status events (Melting Flame stacks).
3. **Scorching Fangs P3**: APPLY (combustion → create Scorching Fangs) + REFRESH (battle skill refreshes existing fangs and shares with team).

### Pipeline Order

The processing pipeline applies stack interactions in chronological frame order via the event queue. See [Engine Specification](../../controller/timeline/engineSpec.md) for the full architecture.

---

## Related Specifications

- [Event Specification](../eventSpec.md) — Abstract Event, CombatSkillEvent, StatusEvent, and shared sub-types (Segment, Frame, TriggerCondition, InteractionType, etc.)

---

## Enum Reference

| Enum                    | Location              |
|-------------------------|-----------------------|
| `StackInteractionType`  | `src/consts/enums.ts` |
