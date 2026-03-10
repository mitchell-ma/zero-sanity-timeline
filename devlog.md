# Devlog

## 2026-03-10
- Ultimate gauge now charges from battle and combo skills, and drains when you use it — the graph tracks it in real time
- Changing operator potential updates ultimate charge cost automatically (e.g. P4 reduces it by 15%)
- Combo skills show when they can and can't be used — highlighted trigger windows on the timeline
- Operators that can always combo (like being attacked or low HP) show a solid bar instead of striped
- Antal's battle skill now applies Focus status to enemies (with element susceptibility bonuses)
- Ardelia's full skill kit added — Dolly Rush, Eruption Column, and Wooly Party with forced nature reactions
- Breach status system — consuming Vulnerable stacks on enemies triggers Breach (damage amplification)
- Undo/redo now covers equipment and stat changes, not just event edits
- Ultimate skill details panel is now fully editable (animation, activation, active phase, cooldown, frame offsets)
- Events show their outcome (expired, consumed, refreshed, triggered, forced) in the details panel
- Resizable split between the timeline and damage sheet panels
- Drag, select, and edit individual damage frames on events
- Warning icons appear above events instead of covering them
- Better drag performance and more accurate marquee selection
- Equipment saved by name instead of slot number (more resilient to future updates)

## 2026-03-09
- Ctrl+D duplicates selected events — ghost preview follows your mouse (green = valid, red = overlap)
- Status subtimelines for team buffs: Arts Amp (Antal/Xaihi ult), Shield (Ember/Snowshine/Catcher), enemy Susceptibility (Ardelia/Gilberta/Avywenna/Lifeng)
- Overlapping status effects (like Focus) now show cleanly — the earlier one stops where the next begins
- Multi-sequence ultimates for Lifeng and Arclight (delayed hits render as separate segments)
- Batch event move support — dragging multiple selected events preserves relative timing
- Damage table expanded with per-tick breakdowns and element-aware calculations
- Viewport culling — only visible events are rendered, improving scroll performance on long timelines
- Added 18 new operators: Endministrator, Lifeng, Chen Qianyu, Estella, Ember, Snowshine, Catcher, Gilberta, Xaihi, Perlica, Fluorite, Last Rite, Yvonne, Avywenna, Da Pan, Pogranichnik, Alesh, Arclight
- Full skill frame data parsed from game data for all operators
- Combo trigger wiring for all operators (pub/sub system)
- Backward-compatible save migration for old loadout data

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
