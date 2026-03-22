# Pipeline Refactor — eventQueueController → CombatLoadoutController + DEC inline

Full plan at: `.claude/plans/snappy-sniffing-crescent.md`

## Summary

eventQueueController currently orchestrates 7 phases + statusDerivationEngine does batch post-processing.
This violates the "no batch pre/post processing" invariant in engineSpec.md.

### Target: All singletons, linear pipeline

```
                                      CombatLoadoutController (singleton)
                                                ↓
USER → InputEventController → EventQueueController → DerivedEventController
         (singleton)             (singleton, queue only)    (singleton, inline)
```

### Phase redistribution

| Phase | Current | Target |
|-------|---------|--------|
| 0: Classify | eventQueueController | InputEventController (upstream) |
| 1: Register + extend | eventQueueController | CombatLoadoutController → DEC |
| 2: Combo triggers + potentials | eventQueueController | CombatLoadoutController → DEC |
| 3: Talent events | eventQueueController + SDE | CombatLoadoutController collects, DEC registers |
| 4: Queue loop | eventQueueController | eventQueueController (stays) |
| 5: Merge queue output | eventQueueController | DEC inline |
| 6: Combo windows | eventQueueController (post-queue) | DEC inline |
| 7: Finalize | eventQueueController | DEC inline |

### SDE elimination

statusDerivationEngine.ts removed entirely:
- Config parsing → ConfigController (singleton)
- Lifecycle evaluation (onEntry/onTrigger/onExit) → DEC inline
- Trigger matching → DEC inline
- Batch orchestration → eliminated

### Key: onEntry/onExit scope

onEntryClause and onExitClause can exist on events OR segments.
Evaluate at event start/end OR segment start/end accordingly.

## Execution steps

1. Create CombatLoadoutController singleton
2. Move phases out of eventQueueController
3. Add inline lifecycle/trigger evaluation to DEC
4. Move combo window derivation into DEC
5. Remove statusDerivationEngine
6. Make ConfigController singleton
7. Update processInteractions + tests
