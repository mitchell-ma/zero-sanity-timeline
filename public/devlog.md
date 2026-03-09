# Devlog

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
