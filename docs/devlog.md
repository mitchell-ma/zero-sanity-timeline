# Devlog

## 2026-04-08
- Ongoing internal engine cleanup — no player-facing changes, but the event pipeline is being restructured incrementally for more predictable behavior in future operator updates

## 2026-04-07
- Estella's Commiseration SP refund moved into the battle skill itself — the talent now just grants the stack, and the skill checks for the stack and consumes it on use, fixing cases where the refund didn't fire reliably
- Ember Pay The Ferric Price no longer triggers off her own damage frames — the talent now correctly fires only when the enemy hits Ember, not whenever Ember deals damage
- Trigger conditions that name the enemy or "any other operator" as the subject now match correctly across all action verbs, fixing several latent edge cases in cascading-trigger interactions
- Internal event pipeline unification pass — large engine cleanup with no intended player-facing change, but expect more consistent trigger and effect resolution across operators

## 2026-04-06
- Avywenna fully verified — Thunderlance battle skill now models per-lance damage, stagger, and ultimate energy through new Pierce/Pierce-EX statuses applied to the enemy, with one frame fired per lance for accurate damage breakdown
- Avywenna P5 Carrot and Sharp Stick now properly conditional — the 1.15× damage bonus only applies when the enemy has Electric Susceptibility, modeled directly through the susceptibility stack count rather than a flat multiplier
- Last Rite fully verified — all skills, talents, potentials, and statuses marked as verified against in-game data
- Last Rite Hypothermic Perfusion split into parent + Mirage child — the parent buff sits on the controlled operator and triggers a separate mirage attack on each Final Strike, with proper P5 damage scaling
- Fluorite Craver of Chaos status added for the new combo skill flow
- Akekuri battle skill ultimate energy generation now covered by integration tests
- Avywenna P5 susceptibility damage scaling covered by integration tests
- Counter-style status columns (running-total stacks) consolidated into the standard stacking path — the dedicated counter branch is gone, and oldest-first consume now respects per-event stack counts so multi-stack events are correctly drained
- Reaction status routing simplified — the legacy REACTION_STATUS_TO_COLUMN map was removed in favor of the canonical STATUS / REACTION grammar
- Estella Distortion, Onomatopoeia, Commiseration, Laziness Pays Off Now, and Survival Is a Win P5 talent reworked and consolidated (the standalone P5 status was folded back into the talent)
- Yvonne Brr-Brr Bomb, Flashfreezer, Cryoblasting Pistolier, and Freezing Point talent updated with corrected damage and freeze interactions
- Many smaller config polish passes across Alesh Auger Angling, Ardelia Eruption Column, Gilberta Matrix Displacement, Laevatain Smouldering Fire Empowered, Perlica Instant Protocol Chain, Wulfgard Wolven Fury, Xaihi Stack Overflow, Hot Work / Pulser Labs gear sets, and Last Rite's full kit
- 8 weapon infliction skills (Clannibal, Dreams of the Starry Beach, Finchaser-30, Navigator, Opus the Living, Twelve Questions, Wedge, White Night Nova) tightened up
- Damage breakdown now resolves enemy-side susceptibility stack counts in value formulas, enabling damage multipliers that scale off how susceptible the target currently is
- Inline value editing in the info pane — click any number on a freeform event's skill or status card to type in a custom value, with a one-click reset to revert. Overridden numbers glow yellow so you can see at a glance what's been hot-wired
- Multi-column events now expand into adjacent empty space — when neighboring micro-columns have temporal gaps, an event widens to fill them for clearer reading, while still respecting other events' time ranges so nothing visually overlaps
- Estella's "Survival is a Win" P5 self-triggering status now actually fires — previously the potential was being skipped at load time so the buff never came online
- Estella Commiseration talent reworked — the SP refund on battle skill use is now properly gated on having a Commiseration stack, and the standalone status was folded back into the talent itself
- Talent display names cleaned up across the roster — "(Talent)" suffixes replaced with shorter "T1"/"T2" tags so the timeline reads more cleanly

## 2026-04-05
- Tangtang fully implemented — all skills, talents, potentials, and five statuses (Whirlpool, Waterspout, Olden Stare, Early Rogue Wave, Waterspout Ult) with full integration tests covering basic attack chains, battle skill, combo skill, ultimate, and status interactions
- Last Rite expanded — Hypothermic Perfusion status added, battle skill cryo DOT reworked, combo skill now checks cryo infliction stacks, P2 Absolute Zero Armament potential implemented, and Hypothermia talent updated with proper slow and susceptibility effects
- Avywenna reworked — Thunderlance status split into regular and enhanced (EX) variants, battle skill interdiction updated with full stagger interaction data, combo and ultimate configs expanded, and Tactful Approach talent removed in favor of data-driven triggers
- Lifeng's Subduer of Evil talent chain fully implemented — Knock Down triggers reactive talent with Physical DMG, Illumination talent reworked, status configs updated with proper stat-based triggers
- Xaihi's Auxiliary Crystal expanded — Distributed DoS Amp status added for team damage amplification, crystal targeting and consumption tests added
- Fluorite reworked — battle skill, combo skill, ultimate, and Love the Stab and Twist talent updated with new status configs (Improvised Explosive, Improvised Explosive Ult) and slow-based talent triggers
- Slow effects now tracked as a stat — talents and statuses that check "enemy is slowed" work correctly through the stat accumulator rather than requiring a specific status column
- Frame markers on the timeline now distinguish between damage frames (diamond) and non-damage frames (circle), making it easier to identify which frames deal damage at a glance
- Stagger frailty stat added — enables talents that trigger effects while enemies are in any stagger state
- Per-element susceptibility stats added (Heat, Cryo, Nature, Electric, Physical) for more granular debuff tracking
- Final Strike damage bonus stat added for skills and operators that buff final strike damage specifically
- Condition evaluator expanded — LESS_THAN and LESS_THAN_EQUAL comparisons now work correctly with zero counts, BECOME conditions support previous stack count overrides, and LINK stack consumption checks added
- Stat source breakdowns now show sub-component labels (skill level vs potential contributions) in the damage breakdown panel
- Freeform status events now inherit duration from the parent event's resize, so manually adjusting a status placement propagates correctly
- Event editor now shows activation window trigger clauses for combo skills, making it easier to inspect combo trigger conditions
- Massive weapon data pass — all 48 weapon skill configs updated with standardized formatting
- Operator data updates for Perlica (Obliteration Protocol), Rossi (Razor Clawmark), Gilberta (Anomalous Gravity Field), Arclight (Tactful Approach), Estella (Distortion, Tremolo), Da-Pan (Chop N Dunk), Endministrator (Realspace Stasis), and Antal (Focus, Focus Empowered)
- Stagger status configs (node stagger, full stagger) updated with proper stat-based triggers
- New integration tests for Fluorite slow talent, skill column noun type verification, and Perlica Obliteration Protocol
- Lifeng's ultimate reworked — Vajra Impact is now a conditional segment that only activates when LINK is consumed. Without LINK, the ultimate skips the Vajra Impact phase entirely, resulting in a shorter animation. With LINK, the full extended attack plays out with bonus damage
- Lifeng's Subduer of Evil P5 talent now correctly targets the enemy (applying Physical DMG debuff) and only activates at Potential 5
- Susceptibility values on freeform status events are now editable — click a susceptibility event to adjust the percentage in the event editor instead of being read-only
- Combo skill activation now correctly checks which operator is being controlled at the time of the trigger — previously any operator's final strike could activate any combo, now only the actively controlled operator's actions count
- Lift and Knock Down physical status effects now properly calculate and display their damage in the damage breakdown
- Avywenna's Thunderlance talent now properly recovers ultimate energy based on talent level and potential — each thunderlance throw during combo skill and ultimate grants scaling energy, rewarding investment in talent upgrades and potentials
- Last Rite's ultimate energy isolation is now fully data-driven — her restriction to only gaining energy from her own skills is properly enforced through the Vigil Services status rather than a hardcoded exception
- Conditional skill segments (like Lifeng's Vajra Impact without LINK) no longer show phantom frame markers when the condition isn't met — the timeline cleanly reflects the actual skill animation
- Xaihi's Auxiliary Crystal stat scaling now correctly references the source operator's stats instead of the crystal's own
- Fluorite, Lifeng, and Perlica operator data fully verified against in-game values
- New integration tests for Avywenna (thunderlance ultimate energy recovery, combo controlled triggers, full kit, potential status duration) and Last Rite (battle skill, combo skill, UE lockout and talents)

## 2026-04-04
- Laevatain's Empowered Battle Skill now properly consumes all Melting Flame stacks at once, matching in-game behavior — previously it consumed only one stack per use, leaving leftover stacks that incorrectly triggered Scorching Heart
- Scorching Heart activation condition updated — now reliably fires when Melting Flame reaches max stacks and won't re-trigger from leftover stacks after consumption
- Context menu now shows individual basic attack segments as cards with numbered buttons (I, II, III, etc.), making it easier to place specific segments
- Crowd control effects (stun, bind, etc.) now tracked in the timeline system
- DSL grammar expanded with new noun types for finer-grained control over battle skills, combo skills, dive attacks, dash attacks, and talent statuses
- Massive gear data update — all gear set pieces across every gear family updated with standardized stat scaling and effect definitions
- Weapon data pass — all weapon skill and status configs updated with consistent formatting and effect structures
- Perlica skill configs expanded with additional frame data and segment hooks
- Yvonne's Cryoblasting Pistolier talent and Flashfreezer talent reworked with updated frame data and potential effects
- Internal engine cleanup — legacy pre-queue status derivation system removed, reducing codebase by ~1400 lines while keeping all functionality intact through the modern reactive trigger pipeline

## 2026-04-03
- Endministrator fully reworked — Originium Crystals now trigger reactive shatter when any physical status (Vulnerable, Lift, Crush, Knock Down, Breach) is applied to a crystallized enemy, dealing bonus Physical DMG and granting Essence Disintegration ATK buffs. Battle skill no longer needs to explicitly consume crystals; applying Crush naturally triggers the chain. P1 SP refund and P2 team ATK share at half value both work correctly
- Pogranichnik fully implemented — The Living Banner talent tracks SP gains as a running counter, triggering Fervent Morale ATK/Arts Intensity buffs when the threshold is reached. Steel Oath team stacks from ultimate are consumed by combo skill, branching into Harass or Decisive Assault based on remaining stacks. All potentials functional including P1 conditional SP on multi-hit, P3 reduced threshold and increased buff cap
- Perlica's Obliteration Protocol talent reworked with reactive triggers for node stagger and full stagger events, segment-level DISABLE support for battle skill sequences, and proper CONSUME of active battle skill on ultimate cast
- Yvonne's empowered basic attack expanded with full frame data across all skill levels, battle skill and combo skill configs updated, and Flawless Creation P2 potential added
- Combo activation windows now properly split when a combo skill's cooldown ends between two trigger windows, preventing a single merged window from incorrectly allowing multiple combos
- Right-click marquee selection now works on the canvas — right-dragging selects events, and right-clicking without dragging opens the context menu as before
- Status effects that grant temporary stat bonuses (like ATK% or element damage bonus) now correctly affect damage calculations for the duration they're active, with per-frame stat tracking
- Counter-style talents (like Living Banner) that accumulate stacks over time now display correctly — starting invisible at 0 stacks and showing running totals as stacks are gained or consumed
- Segment-level skill disabling added — statuses can now disable individual segments of a skill (e.g. disabling specific battle skill sequences) rather than the entire skill, with disabled segments greyed out in the context menu
- Combo window availability now correctly accounts for active combo events rather than total placed combos, so re-triggering a combo after the previous one's cooldown ends works properly

## 2026-04-02
- Skills with variable parameters (like number of enemies hit) now show inline buttons in the context menu — pick ×1, ×2, ×3, etc. when placing the skill, and damage calculations adjust accordingly
- Shield system added — operators with shield-granting abilities now show absorptive barriers that soak incoming damage before HP is reduced
- HP threshold triggers now work correctly — talents and statuses that activate when HP drops below a percentage (e.g. "below 50% HP") fire reliably during combat simulation
- Right-clicking a combo activation window now opens the combo skill's add menu directly, so you don't need to find the combo column separately
- Individual basic attack segments placed from the context menu now show their sequence number (I, II, III) for easier identification
- Double-clicking derived events (like combo windows) now correctly opens the detail panel instead of being ignored
- Canvas no longer flickers blank when the browser window is resized — the renderer immediately redraws during resize instead of waiting for the next frame
- Passive event labels (like combo activation windows) are now subtler in light mode to better distinguish them from active skill events
- Enemy action events now appear on the timeline canvas alongside player skill events
- Damage calculation now picks up multipliers from skill effect definitions when frame-level multiplier data isn't available, improving coverage for skills that define damage through DSL clauses
- Full data reconciliation pass across all 26 operators, 20 gear sets, consumables, and generic statuses — every config file has been audited and marked with a verification status
- New segment lifecycle hooks in the event engine enable per-segment trigger evaluation, supporting skills that activate effects at the start or end of specific segments

## 2026-04-01
- Major rendering performance overhaul — the timeline now uses a PixiJS canvas layer for event blocks, gridlines, and interaction highlights, drastically reducing the number of DOM elements and improving smoothness during scrolling, zooming, and dragging
- Removed object pooling, reconciler, and incremental validation systems from the pipeline — these added complexity without benefiting the new canvas-based renderer, resulting in a cleaner and faster pipeline
- Settings panel simplified — Object Pooling, Reconciler, and Event Pool Limit options removed since they're no longer needed
- Segment resize handles are now always visible when holding Ctrl (no longer require hovering the event first), shown as subtle boundary lines instead of glowing bars
- Tick marks and gridlines now scale smoothly across all zoom levels with consistent spacing — no more abrupt jumps between fixed zoom tiers
- Rossi's empowered Crimson Shadow battle skill updated with correct frame timing for Wolven Ambrage and additional damage frame data
- Vulnerable status category corrected from physical-only to general infliction, matching in-game behavior
- New integration tests for battle skill segment labels, time-stop segment gaps, time-stop frame stability, and time-stop layout positioning
- Timeline layout engine simplified — real-time expansion for time-stops is now handled entirely in the pipeline, so the layout layer just presents the pre-computed values directly

## 2026-03-31
- Crit mode now correctly affects damage calculations without overwriting saved crit data — switching between Never, Always, and Expected no longer permanently mutates your per-frame crit rolls, so toggling back to Random or Manual preserves your previous results
- Crit-triggered buff stacks (like MI Security gear) now accumulate frame-by-frame in all modes — Always mode correctly shows stacks building up over time instead of instantly applying maximum stacks, producing more accurate damage numbers
- Expected mode damage is now properly bounded between Never and Always for every frame
- Consumable and tactical item buffs now appear as status columns on the timeline, so you can see when passive item effects are active on each operator
- Fixed tactical item events using an incorrect internal column ID
- Damage breakdown tree now shows full source drill-downs for every stat — expand ATK, HP, Crit Rate, Crit DMG, element bonuses, weaken, DMG reduction, and protection to see exactly which gear, weapon, talent, or status is contributing each value
- Runtime status buff contributions (e.g. MI Security crit rate at 5 stacks) now appear in the breakdown with stack count, per-stack value, and uptime probability
- Loadout stats panel redesigned as a collapsible tree matching the damage breakdown style — HP, ATK, and Defense each expand to show base values, percentage bonuses, attribute contributions, and individual sources
- Attribute-derived stats now calculated and displayed: STR adds HP, AGI adds Physical RES, INT adds Arts RES, WIL adds Treatment Received bonus
- Arts Resistance added as a tracked stat for operators
- Damage sheet rows now highlight the corresponding frame on the timeline when you hover — and hovering a timeline frame highlights the matching sheet row
- Clicking a damage sheet row selects that frame in the timeline and opens its detail panel
- Skill segments now display in their element's color (e.g. Heat segments glow orange) instead of all using the operator's base color — animation and cooldown segments keep the operator color
- Event block colors now use the dominant element across the event's segments for a more accurate visual representation
- Timeline auto-expands when you scroll near the bottom, so you no longer need to manually extend it for longer rotations — minimum length reduced to 60 seconds for quicker setups
- Damage breakdown pane now auto-refreshes when you switch crit modes, so the detail view always matches the current calculation
- Number formatting settings (decimal places, percentage vs decimal display) now apply consistently across the loadout panel, damage sheet, and breakdown tree
- Rossi's Ultimate Razorclaw Ambuscade updated with correct Heat element on all damage frames
- Rossi's empowered Crimson Shadow battle skill data refined
- Intra-frame ordering fix: when a damage frame triggers a status buff at the same moment, that buff no longer incorrectly boosts the frame that created it — statuses take effect starting from the next damage frame
- Akekuri's game data fully implemented — combo skill Flash and Dash now models talent-scaled SP recovery based on Intellect, and ultimate SQUAD! ON ME! includes all frame timings and SP recovery pulses
- Akekuri's potential effects modeled: P1 Positive Feedback (ATK +10% per SP recovery, stacking up to 5×), P3 Committed Team Player (team ATK +10% during ultimate), P4 ultimate energy discount, and P5 extended team link duration
- Talent and potential statuses now appear as permanent columns — no need to manually add them from the context menu
- Loadout cell now highlights with a colored border when its edit panel is open, making it clearer which operator you're editing
- Damage sheet now virtualizes rows — only rows visible in the scroll viewport are rendered, improving performance for long rotations with hundreds of damage frames
- Switching between Expected and Always crit modes no longer re-runs the full timeline pipeline, since both produce the same event sequence — only the damage sheet recalculates
- New gear icons added for Bonekrusha, Frontiers, Lynx, Redeemer, Swordmancer, and Type-50 Yinglung sets
- Hover dots on resource graphs now show cleaner number formatting
- Action column label and color updated for clarity

## 2026-03-30
- Shared URLs are now dramatically smaller — the encoding was rebuilt from scratch using binary compression, so complex 4-operator loadouts produce much shorter links
- Damage breakdown panel redesigned as a drill-down tree — click into skill segments to see per-frame multipliers, and expand damage bonus nodes to see individual element and stat contributions
- Gilberta's Messenger's Song talent now correctly applies buffs only to matching operator classes (Guard, Caster, Supporter) instead of the whole team — Strikers and other non-matching classes are properly excluded
- Antal's Focus passive at P5 now correctly applies class-filtered stat bonuses
- Laevatain's Ultimate Twilight timing refined to match in-game data (2.07s → 2.43s)
- Rossi's Ultimate Razorclaw Ambuscade and empowered combo skill data cleaned up for accuracy
- Timeline performance improved — dragging events is smoother, and edits to a few events no longer re-validate the entire timeline
- Operator name labels on the loadout row now have a translucent backdrop for better readability over splash art
- SP insufficiency zones now display as red diagonal stripes, making it clearer when an operator can't afford a battle skill
- Stagger timeline column spacing rebalanced for better proportions
- Column header text is now centered
- New crit analysis modes — choose between Never, Expected, Always, Random, or Manual to control how critical hits factor into damage calculations
- Expected crit mode uses a probability model that accounts for crit-triggered feedback loops (e.g. weapons that gain crit rate from crit-triggered buffs) to compute realistic average damage
- Random mode rolls crits stochastically per frame based on each operator's crit rate — re-roll anytime with the dice button
- Manual mode lets you pin individual frames as crit or non-crit for precise "what if" scenarios
- Crit mode selector added to the top bar with color-coded mode indicators
- Damage breakdown now shows crit source probabilities and expected status uptimes when using Expected mode
- Antal's EMP Test Site combo skill now triggers additional effects when the enemy has Focus (Empowered)
- Lupine Scarlet's Wolven Blood status consume effects now correctly trigger lifecycle transitions
- Status effects can now execute actions when they expire, enabling mechanics like buff-on-consume weapon effects
- Permanent-duration statuses (like consumable buffs active from the start) now have their own filter group in column headers
- Old planning documents cleaned up

## 2026-03-29
- Introduced an override system for event segments — you can now resize, pin, or remove individual segments and frames without losing the original skill data, so your edits survive round-trips through shared URLs
- Combo skill activation windows now support multiple skills per window — operators with multi-combo windows can queue several skills in the same activation period
- Rossi is now fully data-complete with all stat progressions, skill variants (empowered battle skill, dive/finisher attacks), crit and timing statuses, and potentials
- Five new weapons added: Brigand's Calling, Glorious Memory, Home Longing, Lupine Scarlet, and Prominent Edge
- Event detail panel redesigned with tabbed segment views and cleaner data cards for easier reading of complex skill breakdowns
- Event categories (talent, weapon status, gear status, gear set effect, potential, etc.) are now tracked and labeled — status effects display more descriptive type tags
- Custom operator and weapon data can now be exported and imported as ZIP files for sharing custom content between browsers
- Trigger condition matching improved — conditions with multiple requirements now correctly aggregate candidates across all clauses
- Enable/disable variant resolution now matches by variant ID instead of object type, fixing cases where the wrong variant was toggled
- Gear effect data expanded across many sets with improved metadata and status configs
- Rossi banner image optimized (83% smaller file size)
- New gear piece icons for Aethertech light gloves and stabilizer
- Added a Community section in the sidebar with pre-built sample loadouts — browse them read-only, or right-click to duplicate into your own collection
- Talents that only activate on specific triggers no longer appear as permanent bars on the timeline — they now correctly spawn as individual instances when their conditions are met
- Wulfgard's Scorching Fangs talent now properly gates behind potential level and active Scorching Fangs status, with correct SP return and damage on reaction consumption
- Status filter checkboxes in column headers now update instantly when toggled instead of requiring a menu re-open
- Weapon status effects with trigger conditions (like Lupine Scarlet's Wolven Blood) now properly contribute to the trigger pipeline
- New MI Security gear piece icons added
- Single-clicking an event now switches the detail panel to that event when it's already open, without popping up unexpectedly when closed

## 2026-03-28
- Status effects can now trigger actions when they appear or expire, enabling mechanics like Gilberta's Gravity Field extending Lift duration while the field is active
- Scorching Heart now correctly activates when Laevatain absorbs 4 Heat Inflictions via Final Strike — previously the absorption path didn't trigger the activation
- Status effects created by compound skill actions (like multi-hit absorptions) now properly chain into follow-up triggers
- EXTEND effects now support scoping to the current segment or full event duration, allowing precise control over how long extensions last
- Fixed shared URLs sometimes loading with missing skill columns
- Removed hardcoded operator-specific status labels — all status names now come from game data
- Added Fragility, Sanctuary, Weakness, and Protected status types — skills that reduce or increase damage taken by element now display correctly on the timeline
- Element-specific Amp statuses (Heat Amp, Cryo Amp, etc.) now each get their own column instead of sharing a single generic one
- Consumable and tactical item passive effects now trigger during the timeline — e.g. items that buff on skill use or apply effects at fight start
- Talent scaling now correctly resolves per talent slot — Talent 1 and Talent 2 each use their own level instead of always defaulting to Talent 1's level
- Context menu for columns with many options (like enemy statuses) is now capped in height and scrolls instead of stretching the full screen
- Context menu items now support inline action buttons and section headers for better organization
- Massive gear status data expansion — added status configs for Aburrey Legacy, Aethertech, AIC Heavy, Armored Messenger, Mordvolt Insulation, Mordvolt Resistant, and Roving Messenger gear sets
- Added generic Fragility and Susceptibility status configs for all elements (Heat, Cryo, Nature, Electric, Physical, Arts)
- Gear pieces, gear statuses, operator statuses, and consumable data stores updated to support broader config loading

## 2026-03-27
- All timeline events — whether placed manually or generated by skills — now go through the same processing pipeline, making behavior more consistent and predictable
- Each column type (inflictions, reactions, physical statuses, operator buffs, etc.) now has its own dedicated behavior engine that handles stacking, consumption, and side effects
- Freeform placement of any status or effect now works identically to how skills create them — same stacking rules, same reactive triggers, same visual stack labels
- Status column IDs are now consistent across the entire app — no more mismatches between how events are created and how they're displayed
- Built-in combat mechanics (all inflictions, reactions, and physical statuses) are now fully data-driven from JSON configs instead of hardcoded — the same format used for operator skills and custom events
- Stack position (I, II, III, IV) is now tracked at creation time for all event types, improving label accuracy
- Fixed an issue where manually placed events could bypass stack limits or stacking rules
- When a skill effect doesn't specify a target, it now correctly falls back to what the status config defines (e.g. team buffs always route to the team column)
- Chen Qianyu's Slashing Edge talent now correctly triggers on Battle Skill, Combo Skill, and Ultimate individually instead of only on generic damage
- Stagger (full break and node break) now has proper status configs with correct durations and stacking behavior
- Improved how talent and status triggers detect skill usage — triggers now fire more reliably when operators perform specific skill types
- Status effects placed on the enemy timeline now correctly resolve their column and target

## 2026-03-26
- Team status buffs (Link, Steel Oath, Overclocked Moment) now display with proper names and stack labels (I, II, III, IV) instead of raw IDs
- Different team statuses no longer interfere with each other when overlapping
- Stackable statuses like Link can overlap freely; RESET statuses correctly replace the previous instance
- Pogranichnik's Ultimate now generates 5 Steel Oath stacks, and Combo Skills consume them to summon Shieldguard Harass attacks on the enemy
- Stack labels cap at the status limit (e.g. 5th+ Link shows IV, not V)
- Info pane shows "REFRESHED" or "CONSUMED" instead of incorrectly labeling clamped durations as "time stop"
- Share links now correctly preserve team status events
- RESET statuses can be dragged past each other freely
- Susceptibility status effects now display on the enemy timeline — skills that increase elemental damage taken show their element and rate
- Ardelia's full kit is now supported: Dolly Rush consumes Corrosion stacks, Eruption Column applies Corrosion, Wooly Party has complete frame data including P3 bonus frames
- Ardelia's empowered battle skill variant is now embedded in the base skill data, activated by Friendly Presence talent conditions
- Freeform events (manually placed inflictions, reactions, statuses) now trigger the same reactive effects as engine-created ones
- Physical status reactive triggers (e.g. "when Lift is applied") no longer fire incorrectly when only Vulnerable was created
- Talent events no longer duplicate when re-processing the timeline
- Massive game data refresh across all gear sets, weapons, and operators — hundreds of stat values, effect descriptions, and status configs updated to match latest game data
- Damage Taken Bonus stat now supported for enemy-side damage calculations
- Loadout sidebar, customizer, and weapon section now use consistent internal naming

## 2026-03-25
- Unified how all skill effects are processed — inflictions, status applications, reactions, and physical statuses now all flow through a single pipeline instead of separate legacy paths, making behavior more consistent
- Forced reactions (like Wulfgard's Ultimate applying Combustion or Ardelia's Combo applying Corrosion) are now expressed more cleanly in the data and process correctly through the unified pipeline
- Physical status effects (Lift, Knock Down, Crush, Breach) are now treated as a subtype of Status in the effect grammar rather than their own separate category
- Potential-gated effects (like Antal's Empowered Focus at P5) now use the standard condition system instead of a special-case filter
- Link (team buff from Ultimates) now correctly routes to the shared team status column and consumption works properly
- Fixed several test alignment issues from previous data normalization changes
- **Comprehensive data reconciliation across 18 operators** — every skill, talent, potential, and status was cross-referenced against in-game wiki descriptions to catch and fix errors:
  - Fixed incorrect combo skill trigger conditions for Alesh, Ember, Fluorite, Avywenna, Catcher, Lifeng, Tangtang, and Xaihi — combos now activate under the correct in-game conditions
  - Fixed SP recovery/return behavior for Snowshine, Last Rite, Endministrator, Estella, and Catcher — skills that "return" SP (conditional refund) are now correctly distinguished from natural SP recovery, which affects Ultimate energy generation
  - Baked potential effects into skills for all 18 operators — damage multiplier bonuses, cooldown reductions, susceptibility buffs, and conditional strikes from potentials now properly scale when potentials are unlocked
  - Added missing skill effects: Ember's combo now heals the controlled operator, Yvonne's battle skill now consumes infliction stacks and applies Solidification, Arclight's empowered battle skill now deals damage, Tangtang's battle skill has its shooting damage, and more
  - Corrected wrong values: Fluorite's ultimate energy cost updated from 80 to 100 (post-patch), Yvonne's ultimate energy cost fixed to 220, multiple combo cooldowns corrected to match in-game values
  - Added missing damage frames for Yvonne (Flashfreezer energy releases and ultimate), Arclight (basic attack sequence 4, empowered battle skill), and Catcher (combo sequence 1)
  - Fixed talent effects: Perlica's Obliteration Protocol now correctly detects staggered enemies, Avywenna's Tactful Approach now applies Electric Susceptibility, Tangtang's Riot Bringer now grants the DMG Dealt buff
  - Fluorite's combo and ultimate now re-apply the matching element's infliction when hitting enemies with 2+ stacks
  - Yvonne's Crit Stacks status now grants Critical Rate per stack and Critical Damage at max stacks
  - Last Rite's combo ultimate energy gain is now dynamic based on consumed Cryo Infliction stacks instead of a fixed value
- Warning icon on combo skills placed outside their trigger window is now properly centered above the event block

## 2026-03-24
- Combo skills can now be triggered by physical statuses (Lift, Breach, Knock Down, Crush) in addition to elemental inflictions — Antal's combo correctly activates when an ally applies Lift to an enemy with Focus
- Combo trigger duplication now works for physical statuses — when a combo duplicates its trigger source, it properly re-applies the physical status (e.g. adding Vulnerable) instead of only working for elemental inflictions
- Status triggers can now cascade — when a triggered status creates another status, any triggers watching for that second status will also fire, up to a safety depth limit
- BECOME conditions now properly detect state transitions — triggers that fire "when X just happened" (like reaching a specific stack count) no longer fire repeatedly when the state hasn't changed
- Conditional physical status effects on skill frames now execute properly — skills that apply Lift, Knock Down, etc. based on conditions (like "if enemy is Vulnerable") work correctly
- Variant activation checks (enhanced/empowered skills) now use the full condition evaluator, supporting richer conditions beyond just "ultimate is active"
- Removed the "NO EVENTS" placeholder text from empty timeline columns for a cleaner look
- Talent level scaling unified — statuses that scale with talent level now resolve correctly regardless of which talent slot they belong to
- Time-stop duration extensions no longer double-apply when processing is re-run
- Damage multiplier data streamlined across all operators — removed unused per-tick ramping system in favor of the simpler segment-total approach
- Dragging events on the timeline is now significantly smoother — reduced lag and stutter during drag interactions
- Hovering the mouse over the timeline no longer causes unnecessary UI recalculation
- The damage sheet no longer re-renders when moving the mouse, reducing CPU usage
- Added a Performance setting (High / Balanced / Low) to control drag responsiveness vs CPU trade-off
- Timeline columns that aren't affected by a drag no longer update, saving processing time
- Event blocks use GPU-accelerated positioning for smoother visual movement
- Timeline processing engine now reuses internal objects between updates instead of rebuilding from scratch — noticeably faster when dragging or making rapid changes
- Added output reconciliation: unchanged events keep their identity between updates, so only the parts of the timeline that actually changed get re-rendered
- New settings for Object Pooling, Reconciler, and Event Pool Limit in the Performance section — turn them on/off to tune responsiveness
- Event presentation caching: skill labels, colors, and visual properties are preserved when nothing changed, reducing unnecessary visual updates
- Combo window lookups are now pre-indexed per operator instead of filtered each render

## 2026-03-23
- Skill descriptions, icons, and element types added for every operator — basic attacks, battle skills, combos, ultimates, and talents all show their in-game info
- Potential descriptions added for all operators showing what each potential upgrade does
- Talent data expanded — every operator now has complete talent entries with descriptions and icons
- Fixed damage element on several skills (Akekuri Burst of Passion, Ardelia and Gilberta skills were incorrectly listed as Physical)
- Status effects across operators, weapons, and gear now include descriptions
- Link buff consumption now works correctly — Battle Skills and Ultimates consume the buff, basic attacks and combos ignore it
- Akekuri's Squad! On Me! now includes SP recovery and applies Link to the team
- Stackable statuses (like Melting Flame) no longer show false overlap warnings
- Stack limits enforced — can't place more stacks than the game allows
- Undo correctly restores consumed status stacks
- Content browser expanded with detailed skill breakdowns, segment viewer, and talent icons
- Hit-timing diamonds now render above segments instead of being clipped
- Updated element colors for better readability
- Operator timeline groups separated by a visible border for easier navigation
- Removed unused editor buttons from the top bar
- Reorganized game data files into per-item directories

## 2026-03-22
- Empowered skill variants show as disabled until their activation condition is met
- Arts Amp tracked per element type instead of a single shared column
- Cross-operator buff chains now resolve correctly to the triggering operator
- Status stack limits enforced in the context menu
- Antal's ultimate now correctly applies Overclocked Moment amp to all operators
- Fixed status durations reading incorrectly from nested data formats
- Frame diamond dragging restored, plus Ctrl+click multi-select
- Dragging on the timeline no longer accidentally selects text
- Content browser with inline editing, event viewer, and status editor
- Human-readable effect descriptions replace raw data display
- Localization framework added for future multi-language support
- Improved ultimate energy and SP tracking accuracy
- Damage sheet fold modes and marquee row selection
- Healing tracking with overheal calculations
- Probability-based status effects supported
- Improved skill event styling with phase indicators and validation warnings
- Ultimate active segments now show their skill name

## 2026-03-21
- Enemy HP tracking — cumulative damage dealt to the boss enables HP-threshold conditions
- Status effect values can now use math expressions combining stats, stacks, and skill levels
- Redesigned clause and expression editors with compact form layouts
- Status effects can now check which operator is currently controlled
- New status data for Alesh, Ardelia, Fluorite, Last Rite, Perlica, Pogranichnik, Tangtang, and Xaihi
- Updated gear piece stats across all sets

## 2026-03-20
- Status effects added for Akekuri, Chen Qianyu, Da Pan, Ember, Estella, Gilberta, Lifeng, and Snowshine
- Status triggers from skills, weapons, and gear fire more reliably
- Fixed item selector edge cases where similarly-named items could conflict
- Updated skill data for all 24 operators with more accurate frame timings

## 2026-03-19
- Crit simulation mode with randomized per-hit rolls alongside always/never/expected modes
- Cumulative damage tracking for ramping skills like Smouldering Fire's DoT
- Physical statuses (Lift, Breach, Crush, Shatter) tracked separately from arts reactions
- Operator editor redesigned with skills grouped by type in a flat layout
- Gear browser added to the customizer
- Stagger and ATK multiplier shown per hit in the info pane

## 2026-03-18
- Freeform mode — manually place inflictions and reactions on the enemy timeline
- Unified customizer — edit all custom content from a single sidebar panel
- Combat sheet overhaul with configurable columns and visibility toggles
- Loadout editing moved to the side panel with splash art previews and filters
- Timeline columns now have weighted widths for better readability
- Ultimate energy tracking improved with a dual-pool SP model
- Status segments trim when consumed or refreshed early
- Hover highlight on event segments

## 2026-03-17
- Fixed edge cases in status effect consumption
- Internal cleanup (no user-facing changes)

## 2026-03-16
- Weapon skills and gear set bonuses now respond to fight conditions
- Gilberta added with full talent support
- Status effects show more detail in the info pane
- Shorter sharing links
- Improved multi-phase status calculations (like Corrosion decay)

## 2026-03-15
- Rebranded to Endfield: Zero Sanity Simulations with new logo and domain
- Tangtang added as a new operator
- Custom content system expanded with skill linking and shared content browsing
- Stagger timeline tracks enemy stagger buildup
- Horizontal timeline mode with touch controls
- Light/dark theme toggle, starred operators, improved mobile support
- Antal and Ardelia skill data expanded with full frame timing

## 2026-03-14
- All game data now loads from JSON files instead of being hardcoded
- Custom content system — create and share operators, weapons, and gear sets
- Content browser UI for managing custom items
- Updated enemy stats, gear effects, and weapon skills

## 2026-03-13
- Skills can have activation conditions checked before use
- Events and skill segments can have custom names

## 2026-03-12
- Damage numbers account for arts reactions with proper defense and resistance
- More enemy status effects supported: Crit Stacks, Weaken, DMG Reduction, Protection
- Gear and weapon data expanded

## 2026-03-11
- Damage table factors in stagger, susceptibility, link, and arts amplification in real time
- Stagger timeline shows the enemy's stagger meter
- Events snap to valid positions when dragged near time-stops
- Weapon skill system with stat bonuses and passive effects
- Loadout sidebar with tree-based session management

## 2026-03-10
- Ultimate gauge tracks charge and drain in real time
- Potential affects ultimate charge cost (e.g. P4 = 15% cheaper)
- Combo skill availability highlighted on the timeline
- Ardelia's full skill kit added
- Undo/redo covers equipment and stat changes
- Battle skills consume SP, with SP return reducing ultimate gauge gain
- Session sidebar with folders, export/import

## 2026-03-09
- Ctrl+D duplicates selected events with ghost preview
- Status subtimelines for team buffs and enemy effects
- Batch event move preserves relative timing
- Damage table with per-tick breakdowns
- Viewport culling for better scroll performance
- 18 new operators added

## 2026-03-08
- Damage calculation pipeline with per-frame accuracy
- Skill point economy (200 SP pool, 8 SP/s regen)
- Resource graphs with hover values
- Ultimate energy timeline
- Save/export/import sheets
- Marquee select and combo activation windows

## 2026-03-07
- Initial game data, operator/gear/weapon models
- Timeline interactions (drag, right-click, undo/redo)
- GitHub Pages deployment

## 2026-03-06
- Project init — basic timeline and UI
