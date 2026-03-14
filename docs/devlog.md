# Devlog

## 2026-03-13
- New ActivationCondition system for combat skill events — a unified interface for expressing skill activation prerequisites as OR-of-ANDs conditions
- Conditions can target statuses, combat resources (SP, HP, ultimate energy), combat skill states (ultimate active), and trigger conditions — all via a single RequirementType union
- RequirementStateType covers state checks (ACTIVE/INACTIVE), occurrence tracking (APPLIED/CONSUMED), and comparisons (EQ/GT/GEQ/LT/LEQ)
- ActivationCounter added for multi-occurrence requirements (e.g. Arclight's Wildland Trekker needing 3 Electrification consumes) with reset-on-met support
- Optional name field added to Event, EventSegmentData, and EventFrameMarker
- HP added to CombatResourceType; ComparisonType enum added for counter thresholds

## 2026-03-12
- Skill multipliers for all 20+ operators added to the codebase — every battle skill, combo skill, and ultimate now has its actual ATK% values stored and accessible to the damage calculator
- Arts reaction damage (Combustion, Solidification, Corrosion, Electrification) now runs through the full damage formula with defense, resistance, fragility, and amplification all accounted for
- Damage calculation split into dedicated controllers: a skill multiplier registry, arts reaction controller, status query service, and damage breakdown builder — business logic moved out of the view
- Information pane logic extracted into controller layer (eventPaneController, loadoutPaneController, damageBreakdownController) — views are now presentation-only
- New enemy status types: Crit Stacks, Weaken, DMG Reduction, Protection, Scorching Heart, Originium Crystal, Messenger's Song, Wildland Trekker
- Status consumption now correctly accounts for time-stop extension when checking active duration at consume frames
- EventStatusType (expired/consumed/refreshed/triggered/extended) migrated from string literals to a proper enum
- Element type labels added for display in UI
- Gear set effects and weapon skill data expanded across most sets
- All operator models updated with element type and additional stat data
- Specifications folder added for design docs

## 2026-03-11 (evening)
- Warning tooltips styled to match the dark theme instead of browser defaults
- Battle skills blocked during combo animation time-stops, not just ultimate ones
- SP constraint enforced when placing and dragging battle skills — can't use them when you don't have enough SP
- Empowered battle skills require max Melting Flame stacks to use (controller-enforced, not just visual)
- Enhanced vs empowered skill detection fixed — "Enhanced Empowered" variants no longer falsely require an active ultimate
- Basic attack overlap checks now use time-stop-extended durations so events can't clip into each other
- CombatLoadout refactored into a combat context facade — SP validation, slot data, and operator wiring all live in one place instead of scattered module globals
- Save files now stamp the current version and strip legacy fields on export
- Stagger subtimeline shows dashed lines at node threshold positions
- Panel resizer and loadout sidebar restyled from blue to grey theme

## 2026-03-11
- Damage table now accounts for stagger, susceptibility, link, and arts amp — numbers change in real time as statuses activate on the timeline
- Stagger timeline with node thresholds and break periods — the enemy's stagger meter builds up and breaks when maxed out
- Battle skill ultimate charge now triggers on the actual hit frame, not when you press the button
- Events can't be dragged into ultimate or combo animation time-stops anymore — they snap to the edge instead of getting stuck
- Fast dragging no longer lets events teleport through each other or through time-stop zones
- Combo skill warning icon now appears while dragging (not just after releasing)
- Weapon skill system — Edge of Lightness and TARR-11 with stat bonuses and effects
- Loadout sidebar replaces session sidebar — tree-based loadout management with folders
- App state extracted into useApp hook and appStateController — cleaner architecture
- processInflictions moved from utils to controller layer where it belongs
- Resource graph lines are thinner and less visually noisy
- All 20+ operators now have element type data on their base class
- Named weapon skills expanded with new effects and stat contributions

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
- Battle skills now consume SP — the shared SP bar drops when you use them
- SP return mechanic: skills that refund SP (Last Rite, Snowshine, Catcher) reduce ultimate gauge gain proportionally
- Wulfgard P4 reduces ultimate cost by 15%, P5 resets combo cooldown after using ultimate
- Scorching Fangs status — Wulfgard gains a buff when Combustion triggers; P3 refreshes it on battle skill and shares with team at half power
- Antal combo trigger fixed: now correctly requires Focus (not Susceptibility)
- Ardelia combo skill frame timing adjusted
- Perplexing Medication consumable added (+23.76% Ultimate Gain Efficiency)
- Session sidebar with drag-and-drop folders, rename, and multi-session export/import
- Confirm dialogs for destructive actions (clear session, clear all)
- Undo/redo for session tree changes (rename, move, delete)
- Extended status — infliction events that got their timer refreshed now show as "extended"
- Debug mode toggle — bypasses all validation so you can freely place any event anywhere
- New gear sets: Redeemer, Tide Surge
- Loadout aggregator: centralizes stat collection from operator + weapon + gear + consumable
- Tactical consumable events derived from loadout (e.g. consumable buff durations on timeline)

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
