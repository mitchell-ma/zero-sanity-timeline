# Open Questions

## Arts Reactions
- Corrosion
    - How long does it take to fully ramp up? Endfield wiki says "about 10s"
    - What's the rate of ramp up? Does it tick per second or frame?
    - How does corrosion stacking work? If a StatusLevel 1 corrosion ramps up fully but is refreshed by a status level 4 corrosion, does it start ramping from the status level 4 initial value or the current value?
- Foced Corrosion
    - Does it ramp up like a normal corrosion?
    - Can a forced corrosion extend the duration of a normal corrosion?
- If a skill can consume different kinds of arts reactions (eg. Wulgard battle skill), which reaction is consumed?
    - Wulfgard consumes combustion or electrification. It looks like he prioritizes combustion over electrification if both are present, regardless of the application order and category (forced vs natural) of the arts reactions.

## Skill Interactions
- Laevatain FinalStrike proccing Ardelia combo
    - Laevatain's talent description is "After the controlled operator's Final Strike or Finisher hits the enemy, Laevatain absorbs Heat Infliction icon.pngHeat Infliction from nearby enemies."
    - When I perform N5 with Laevatain as the controlled operator, it looks like heat is absorbed BEFORE the N5 damage contrary to talent description
    - Ardelia combo will therefore proc
    - Is this a bug or feature? If a future operator can also absorb inflictions with final strike, we can confirm the implementation details (ie. absorption happens before damage)
    - It also looks like Laevatain N5 has two damage frames, but only the last frame does the absorption and procs Ardelia combo; this means only the last frame is coded as a final strike

## Animation Cancelling
- Certain basic attack sequences have multiple frames. For example, Laevatain's basic attack sequence2 does two slashes. If we dodge between the two slashes, is the next attack sequence3 or do we continue from sequence2?
    - Is this dash/dodge animation-storing interaction bugged/clunky for operators like Last Rite?
        - Partial answer: seems like Last Rite BATK SEQ3/N3 can be infinitely repeated if you cancel after 1st frame; I would love in-game evidence though
