# Devlog

## 2026-03-23
- **Link team buff consumption** — the Link damage buff (from Li Feng and Akekuri) is now properly consumed when a Battle Skill or Ultimate is used, boosting all hits across the entire skill. Basic attacks, combo skills, finishers, and dive attacks correctly ignore Link, matching in-game behavior
- **Akekuri Ultimate skill data** — Squad! On Me! now includes SP recovery frames and applies the Link buff to the team during the channeling phase
- **Stackable statuses now overlap freely** — status effects with multiple stacks (like Melting Flame) no longer show false overlap warnings when placed near each other on the timeline
- **Stack limits enforced on add** — attempting to place more stacks than an effect allows (e.g. a 5th Melting Flame) is now blocked, matching in-game behavior
- **Undo preserves status state** — undoing an action that consumed status stacks (like an empowered battle skill) now correctly restores the stacks to their unconsumed state
- **Expanded content browser** — the operator viewer now shows detailed skill breakdowns: per-segment timing, frame hit data, SP costs, combo triggers, cooldowns, and element-colored indicators for each skill variant
- **Skill segment viewer** — browse individual segments of a skill with tabbed navigation, seeing frame-by-frame hit details, stagger values, inflictions, and status applications
- **Frame diamonds render above segments** — hit-timing diamonds on the timeline now draw on top of all segments instead of inside them, so they're no longer clipped by adjacent phases
- **Updated element colors** — element type indicators (Heat, Cryo, Nature, Electric) now use more distinct, saturated colors for better readability
- **Talent icons** — operator talent icons are now displayed in the content browser
- Reorganized game data files for operators, weapons, and gear into per-item directories for cleaner structure

## 2026-03-22
- **Empowered skill activation conditions** — empowered skill variants (Arclight, Wulfgard, Yvonne) now show as disabled in the context menu until their activation condition is met (e.g. max Scorching Fangs stacks)
- **Arts Amp is now per-element** — amp buffs are tracked per element type (Heat Amp, Cryo Amp, etc.) instead of a single shared column, matching in-game behavior
- **TRIGGER determiner** — status effects that reference "the triggering operator" now correctly resolve to whichever operator caused the trigger, enabling cross-operator buff chains
- **Status stack limits enforced** — statuses with stack limits (e.g. max 3 instances) now prevent adding more events beyond the cap in the context menu
- **Antal Overclocked Moment amp** — Antal's EMP Test Site ultimate now correctly applies the Overclocked Moment amp buff to all operators
- **Improved status duration parsing** — status columns now correctly read nested duration formats from game data, fixing some statuses showing incorrect durations
- **Consume status targets resolved from data** — status consumption (e.g. Originium Crystal) now derives its target from operator configs instead of a hardcoded registry
- **Frame diamond dragging restored** — you can once again drag the hit-timing diamonds within skill events to fine-tune exactly when each hit lands
- **Ctrl+click frame multi-select** — hold Ctrl (or Cmd) and click multiple frame diamonds to select them together, useful for comparing hit timings across a skill
- **No more accidental text selection** — dragging on the timeline (marquee select or moving events) no longer highlights text
- **Content browser and editor** — browse all operators, weapons, gear sets, and their skills, statuses, talents, and effects in one unified panel with inline editing and a "clone to custom" workflow
- **Event viewer** — multi-page event inspector showing event details, segment breakdowns, and per-frame hit data with a live timeline preview
- **Status event editor** — dedicated editor for operator status configs with property, metadata, and clause sections
- **Human-readable effect descriptions** — status effects and skill clauses now display as plain-language descriptions (e.g. "Apply Focus to the enemy for 10s") instead of raw data
- **Localization framework** — all UI text now uses a translation system, preparing for future multi-language support
- **Ultimate energy and skill point tracking improvements** — these resource systems now update incrementally as events are processed, improving accuracy for complex rotations
- **Damage sheet fold modes** — collapse damage breakdown rows by frame, segment, or full event for easier analysis of long rotations
- **Marquee selection in damage sheet** — drag to select multiple rows in the damage table and see a summary of selected hits
- **Operator healing tracking** — the simulation now tracks healing received by operators, including overheal calculations, enabling more accurate buff uptime analysis
- **Cross-operator talent effects** — talents that affect the triggering operator (e.g. "when any ally uses a skill, heal the attacker") now correctly resolve to the right target
- **Probability-based effects** — status effects with activation chances (e.g. "30% chance to apply X on hit") are now supported with per-hit resolution
- **Improved skill event display** — skill blocks on the timeline now show distinct visual styling for each phase (animation, active, stasis, cooldown) and display warning icons for validation issues
- **Drag constraint improvements** — dragging events on the timeline now handles edge cases better, including overlapping events and resource zone boundaries
- **Ultimate skill active segments now show their skill name** — the active phase of ultimates (Laevatain, Akekuri, Antal, Ardelia, Yvonne) now displays the skill name instead of a generic "Active" label
- Updated skill data, status configs, and gear stats across all operators and equipment
- Reorganized tests into unit and integration categories

## 2026-03-21
- **Enemy HP tracking** — the simulation now estimates cumulative damage dealt to the boss over time, enabling HP-threshold conditions (e.g. "below 50% HP") for status effects and triggers
- **Value expressions** — status effect values can now use math expressions (multiply, add, min/max) combining stats, stack counts, and skill levels, enabling more complex buff formulas
- **Redesigned clause editor** — the IF/THEN clause editor is now a compact form-based layout, replacing the old tree view for easier editing
- **Status event editor** — new full-featured editor for operator status configs with sections for properties, metadata, clauses, and frame data
- **Expression editor** — visual editor for building value expressions with nested operators, stat references, and variable lookups
- **"Controlled operator" condition** — status effects can now check which operator the player is currently controlling
- Renamed "BASED_ON" lookups to "VARY_BY" across all skill and status data for clarity
- Removed `skillTypeMap` from skill JSONs — skill types are now inferred automatically from naming conventions
- Status effects now infer their target from clause effects when not explicitly set
- New status data added for Alesh, Ardelia, Fluorite, Last Rite, Perlica, Pogranichnik, Tangtang, and Xaihi
- Updated gear piece data with corrected stat values across all gear sets

## 2026-03-20
- **Status effects for more operators** — Akekuri, Chen Qianyu, Da Pan, Ember, Estella, Gilberta, Lifeng, and Snowshine now have tracked status effects on the timeline (buffs, debuffs, and triggered effects)
- **Improved status trigger system** — status effects from skills, weapons, and gear now trigger more reliably and consistently across all operators
- **Loadout lookup improvements** — weapon, gear, consumable, and tactical selectors now use faster ID-based lookups, fixing edge cases where items with similar names could conflict
- Updated skill data for all 24 operators with more accurate frame timings and status references

## 2026-03-19
- **Crit simulation mode** — damage calculator now supports randomized crit rolls per hit, in addition to always/never/expected crit modes, for more realistic rotation analysis
- **Cumulative damage tracking** — skills with ramping or stacking damage (like Smouldering Fire's DoT) now correctly accumulate across hits
- **Physical status split** — Lift, Knock Down, Breach, Crush, and Shatter are now tracked separately from arts reactions for clearer status timelines
- **Operator editor redesign** — skills are now organized by type (Basic / Battle / Combo / Ultimate) with a flat scrollable layout, making it easier to view and edit all skill data at once
- **Gear browser** — view gear set pieces, stats, set bonuses, and triggered effects directly in the customizer
- **Stagger per hit** — the info pane now shows how much stagger each individual hit deals
- Damage frame display now shows ATK multiplier per hit
- Cleaned up and consolidated the custom content editor — removed the old separate wizard panels

## 2026-03-18
- **Freeform mode** — new interaction mode lets you manually place inflictions and reactions on the enemy timeline, bypassing the normal skill-driven pipeline
- **Unified customizer** — all custom content (operators, skills, weapons, gears, effects, statuses, talents) editable from a single sidebar panel with collapsible sections
- **Combat sheet overhaul** — configurable columns with visibility toggles; new Boss Stagger, Ult Charge, and Skill Points columns available
- Loadout editing moved to the side panel — click the gear icon on any operator header to open a full loadout editor with operator, weapon, gear, consumable, and tactical selectors
- Operator and item selectors now feature splash art previews, search filtering, and rarity filters
- Timeline columns now have weighted widths — status columns are wider, dash columns narrower, for better readability
- Combo skill activation windows now derive directly from operator data instead of a separate hardcoded lookup — more accurate and automatically picks up new operators
- Enhanced skill validation now uses the DSL clause system instead of hardcoded ultimate active phase checks
- Ultimate energy tracking improved — SP return from skills is now simulated with a dual-pool model for more accurate gauge calculations
- Segment trimming — when status effects get consumed or refreshed early, their visual segments are properly shortened
- Hover highlight on event segments shows which segment your cursor is over
- Custom content expanded — you can now create and edit custom gear effects, weapon effects, operator statuses, and operator talents
- All operator data files updated with a cleaner, more consistent format

## 2026-03-17
- Under-the-hood cleanup — fixed some edge cases in how status effects get consumed and removed unused code
- Renamed internal components for clarity (no user-facing changes)

## 2026-03-16
- Weapon skills and gear set bonuses are now smarter — effects like "increase Heat DMG when Combustion is active" correctly respond to what's happening in the fight
- Gilberta added with full talent support
- Status effects now show more detail in the info pane — you can see exactly how much susceptibility, resistance ignore, or damage bonus each effect provides
- Sharing links are shorter and more compact
- Improved accuracy for how multi-phase status effects (like Corrosion decay) are calculated over time

## 2026-03-15
- Rebranded to **Endfield: Zero Sanity Simulations** — new name, new logo, new domain (endfieldsimulations.dev)
- Tangtang added as a new playable operator
- Custom content system expanded — you can now link custom skills to operators and browse/edit shared content more easily
- Stagger timeline tracks enemy stagger buildup across the fight
- Horizontal timeline mode with improved layout and touch controls
- Light/dark theme toggle, starred operators, improved info pane, better mobile support
- Antal and Ardelia skill data greatly expanded with full frame timing and multipliers
- Invalid skill placements are now caught before they happen

## 2026-03-14
- All operator, weapon, and gear data now loads from JSON files instead of being hardcoded — makes it much easier to add new content and keep up with game updates
- Custom content system — users can create and share their own operators, weapons, and gear sets
- New content browser UI for managing custom items
- Enemy data updated with more accurate stats across all enemy types
- Gear set effects and weapon skill effects expanded with more complete data
- Various UI and styling improvements

## 2026-03-13
- Skills can now have activation conditions — requirements like "needs 3 Electrification stacks consumed" are checked before a skill can be used
- Events and skill segments can have custom names for clearer labeling

## 2026-03-12
- Damage numbers now account for arts reactions (Combustion, Solidification, Corrosion, Electrification) with proper defense and resistance calculations
- More enemy status effects supported: Crit Stacks, Weaken, DMG Reduction, Protection, and more
- Gear set effects and weapon skill data expanded across most sets

## 2026-03-11
- Damage table now factors in stagger, susceptibility, link, and arts amplification — numbers update in real time as the timeline plays out
- Stagger timeline shows the enemy's stagger meter building up and breaking
- Events snap to valid positions instead of getting stuck when dragged near time-stops
- Weapon skill system with stat bonuses and passive effects
- Loadout sidebar with tree-based session management (folders, rename, drag-and-drop)

## 2026-03-10
- Ultimate gauge tracks charge from skills and drains on use — the graph updates in real time
- Operator potential affects ultimate charge cost (e.g. P4 = 15% cheaper)
- Combo skill availability highlighted on the timeline — shows exactly when you can combo
- Ardelia's full skill kit added
- Undo/redo now covers equipment and stat changes, not just event edits
- Battle skills consume SP from the shared SP bar
- SP return mechanic: skills that refund SP reduce ultimate gauge gain proportionally
- Session sidebar with folders, export/import, and undo/redo for session changes
- Debug mode toggle to bypass validation

## 2026-03-09
- Ctrl+D duplicates selected events with a ghost preview (green = valid, red = overlap)
- Status subtimelines for team buffs like Arts Amp, Shield, and enemy Susceptibility
- Batch event move — dragging multiple selected events preserves relative timing
- Damage table with per-tick breakdowns
- Viewport culling for better scroll performance on long timelines
- 18 new operators added with full skill and frame data

## 2026-03-08
- Damage calculation pipeline with per-frame accuracy
- Skill point economy (200 SP pool, 8 SP/s regen)
- Resource graphs with hover values
- Ultimate energy timeline
- Save/export/import sheets to localStorage and JSON files
- Marquee select, Ctrl+A, Delete to remove
- Combo activation windows and Melting Flame subtimeline

## 2026-03-07
- Initial game data, operator/gear/weapon models
- Timeline interactions (drag, right-click, undo/redo)
- GitHub Pages deployment

## 2026-03-06
- Project init — basic timeline and UI
