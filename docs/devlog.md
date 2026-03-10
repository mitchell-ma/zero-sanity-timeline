# Devlog

## 2026-03-10

**What's new:**
- Ultimate gauge now charges from battle and combo skills, and drains when you use it — the graph tracks it in real time
- Changing operator potential now updates ultimate charge cost automatically (e.g. P4 reduces it by 15%)
- Combo skills show when they can and can't be used — highlighted trigger windows on the timeline
- Operators that can always combo (like being attacked or low HP) show a solid bar instead of striped
- Antal's battle skill now applies Focus status to enemies (with element susceptibility bonuses)
- Ardelia's full skill kit added — Dolly Rush, Eruption Column, and Wooly Party with forced nature reactions
- Breach status system — consuming Vulnerable stacks on enemies triggers Breach (damage amplification)
- You can now undo/redo equipment and stat changes, not just event edits
- Ultimate skill details panel is now fully editable (animation, activation, active phase, cooldown, frame offsets)
- Events show their outcome (expired, consumed, refreshed, triggered, forced) in the details panel
- Resizable split between the timeline and damage sheet panels
- Drag, select, and edit individual damage frames on events
- Warning icons appear above events instead of covering them, and are no longer clickable
- Better drag performance and more accurate marquee selection
- Equipment saved by name instead of slot number (more resilient to future changes)

**Technical:**
- Operator registry moved to controller layer; builds view operators from model + skills.json timing data
- Unified UndoableState: events, operators, enemy, loadouts, loadoutStats, resourceConfigs all in one history
- Arts infliction consumption pipeline (CONSUME vs ABSORB — removes stacks without generating exchange events)
- Derived event pipeline: status application (Focus, Melting Flame), combo trigger inflictions, physical infliction refresh
- Combo activation windows generated from derived enemy events with trigger condition hierarchy
- Frame manipulation: drag-to-reposition, right-click menus, multi-select, add/remove frames and segments
- Segment duration edits clamp inner frame offsets; arts reactions sorted by start frame
- ResourceConfig interface for editable SP/ultimate parameters with persistence
- CSS: panel resizer, combo window visualization, animation phase styling, frame diamond hover/selection states

## 2026-03-09
- Added 18 new operators: Endministrator, Lifeng, Chen Qianyu, Estella, Ember, Snowshine, Catcher, Gilberta, Xaihi, Perlica, Fluorite, Last Rite, Yvonne, Avywenna, Da Pan, Pogranichnik, Alesh, Arclight
- Full MVC stack per operator — combat skills, operator model, event frames, events
- Parsed skills.json frame data from gamedata.json for all operators (tick timing, arts inflictions)
- Operator registry rewrite — all 23 operators with skill timing data from skills.json
- Trigger capabilities for all operators (combo pub/sub wiring)
- comboRequires upgraded to array type for multi-condition combo triggers
- Backward-compatible loadout stats migration (field-level merge for old saves)

## 2026-03-08
- Unified MiniTimeline column type (replaces separate skill/status/melting flame columns)
- Damage calculation pipeline (pure formulas + frame calculator with loadout/enemy context)
- SlotController per-slot architecture with dual pub/sub (combo + gear effect triggers)
- Arts infliction processing — duration refresh, consumption clamping, reaction events
- CommonSlotController for Skill Points (200 SP, 8 SP/s regen) and Team Status
- Resource graphs with SVG shaded fill, hover dot, and interpolated values
- Ultimate energy timeline (charge from 0, consume on activation)
- Save/export/import sheets to localStorage and JSON files
- App bar UI — devlog modal, keyboard controls, WIP badge, GitHub link
- Marquee tool for multi-select, Ctrl+A select all, Delete to remove
- Combo activation windows and melting flame subtimeline
- Laevatain battle skill variants and basic attack frame data
- Akekuri operator skills, frame data, and talent/potential interactions
- Unified InformationPane (event editor + loadout stats in one right-side panel)
- Loadout stat fields with +/- hold-to-repeat arrows and level breakpoint selectors
- Sticky header/enemy fix, hover line with time/frame display
- columnId rename, extract columnBuilder, zoom persistence

## 2026-03-07
- Game data gathering
- Models for operators, gears, weapons, skills
- Started controller/view components
- PubSub approach for coupling skills; why tf does JS not have signals
- GitHub pages
- Undo/redo system
- Timeline interaction functionality
- Tweak loadouts GUI

## 2026-03-06
- Init
- Basic timeline and UI
