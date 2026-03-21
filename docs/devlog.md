# Devlog

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
