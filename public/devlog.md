# Devlog

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
