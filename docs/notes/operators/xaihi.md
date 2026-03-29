# Xaihi — Skill & Status Coverage

5-star Supporter | Cryo | Arts Unit

## Skills

- Basic Attack: Cooldown (5 sequences, Cryo, final strike + SP recovery)
- Battle Skill: Distributed DoS (APPLY AUXILIARY_CRYSTAL with 2 stacks to CONTROLLED OPERATOR)
- Combo Skill: Stress Testing (Cryo DMG + Cryo Infliction + Stagger + CRYO_FRAGILITY)
- Ultimate: Stack Overflow (CRYO_AMP + NATURE_AMP to TEAM, Intellect scaling + cap)

## Statuses

- AUXILIARY_CRYSTAL: 2 stacks, 20s, RESET. Self-consumes on THIS OPERATOR PERFORM FINAL_STRIKE (restack). Heals + conditional ARTS_AMP on max HP.
- CRYO_FRAGILITY: Applied by combo frame via VARY_BY TALENT_LEVEL [0, 0.07, 0.10]. 5s duration, stack limit 1, RESET.

## Talents

- Execute Process (Talent 1): Description-only. Effect baked into combo skill frame as CRYO_FRAGILITY.
- Freeze Protocol (Talent 2): Description-only. Effect baked into ult frame as CONSUME CRYO INFLICTION + SOLIDIFICATION FROM ALL OPERATOR (gated by TALENT_LEVEL >= 2).

## Potentials

- P1: BS AMP +5% → baked into AC status VARY_BY POTENTIAL ADD [0, 0.05, ...]
- P2: Ult energy cost -10% → baked into ult CONSUME VARY_BY POTENTIAL MULT [1,1,0.9,...]
- P3: Combo chains to 1 additional target (description-only)
- P4: Intellect +15, Treatment Efficiency +10% (stat clause)
- P5: Ult AMP ×1.1 → baked into ult VARY_BY POTENTIAL MULT [...,1.1]

## Test Coverage

- `skills.test.ts`: BA (5 segments, variants), BS (placement, SP), Ult (TIME_STOP, CRYO/NATURE AMP, Intellect scaling, view), energy cost
- `auxiliaryCrystal.test.ts`: AC targeting (CONTROLLED), consumption (restack, II→I), combo window activation, combo cryo infliction
- `potentialEffects.test.ts`: P1 BS AMP (+5%), P2 energy cost, P5 AMP ×1.1
- `executeProcess.test.ts`: CRYO_FRAGILITY from combo, negative case

## TODOs

- **Talent maxLevel**: Description-only talents (Execute Process, Freeze Protocol) don't have VARY_BY TALENT_LEVEL to infer max level from. Need `properties.maxLevel` field on talent JSONs so `getDefaultLoadoutProperties` resolves correct talent levels. Affects ALL operators with description-only talents — not just Xaihi. The Operator's `maxTalentOneLevel`/`maxTalentTwoLevel` must be computed from the talent def's `maxLevel` property.
- **Execute Process talent level**: F1 test currently gets `statusValue: 0` because talent level resolves to index 0 (VARY_BY TALENT_LEVEL [0, 0.07, 0.10]). Blocked on maxLevel fix above.
- **BS AMP visibility**: ARTS_AMP from AC trigger doesn't appear in operator status column (column builder doesn't scan status trigger effects for micro-columns).
- **ALL_OTHER OPERATOR**: resolveOwnerId still routes to COMMON_OWNER_ID.
