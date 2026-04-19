# Devlog

## 2026-04-18
- **Loadout Views — compare setups at different potentials / weapon ranks at a glance.** Right-click a loadout → **Create views…** to pick per-slot operator potentials (P0 – P5) and weapon skill 3 ranks (R1 – R9). The app generates the full cartesian product as read-only child views under the parent loadout, each named from the values that vary (e.g. `Laevatain P0R9 - Antal P5R1`). Clicking a view loads that permutation instantly — same rotation, different stats — so you can quickly see how a build scales with upgrades. Edits are disabled on views (change the parent to refresh the set). Capped at 256 views per loadout. Use **Edit views…** to tweak the axes, or **Clear all views** to remove them.
- **New combat sheet header.** The top of every combat sheet now shows each operator with their splash art, potential / class / element badges, and a compact gear strip (weapon + weapon rank, consumable, tactical, armor, gloves, kit 1, kit 2) — next to a damage table that breaks out Basic / Battle / Combo / Ultimate totals per operator with their share of the team total. Team DPS, Duration, Time to Kill, and Team Total sit along the bottom.
- **Critical and Grouping controls moved onto the sheet.** The global `E[CRIT] / NO CRIT / MAX CRIT / MANUAL` and `FRAME / SEGMENT / EVENT` buttons in the top bar are gone. Right-click anywhere on the combat sheet to open a compact menu with two steppers — **Grouping** and **Critical Mode** — plus a **Randomize** action (visible in Manual crit mode) that re-rolls every pinned crit frame in one click. Crit and Grouping labels now read in sentence case (`Expected`, `Never`, `Always`, `Manual`, `Frame`, `Segment`, `Event`).
- **Sidebar gains Share, Download, Import, Export.** Right-clicking a loadout now offers **Copy share link** (with a "URL Link Copied" toast) and **Download** (save a single loadout to a file). The sidebar footer adds dedicated **Import** and **Export** buttons for moving entire bundles in and out — the old top-bar Import/Export actions are gone.
- **Ctrl+drag in the loadout sidebar adds to your selection.** Previously the marquee-select replaced the current selection. Hold Ctrl (or Cmd) while dragging to add loadouts/folders to whatever you already had selected.
- **Context menus and enemy picker no longer clip at screen edges.** Right-click menus that open near the bottom or right edge of the window now nudge up/left so they stay fully on-screen. The enemy picker dropdown gets the same treatment.
- **Corrosion now reduces Physical Resistance as well as Arts.** Each Corrosion segment applies both Arts and Physical Resistance Reduction, so physical-damage hits on a corroded enemy finally benefit from the debuff. Together Arts (covering Heat / Cryo / Nature / Electric) + Physical covers every damage type — Corrosion is universally useful against any team comp.
- **Corrosion reduction strengths fixed.** The stack values were being read as raw numbers instead of percentages, producing nonsensical resistance multipliers. Corrosion at 1 → 4 stacks now correctly applies 3.6% → 7.2% initial ramping up to 12% → 24% maximum reduction, matching the in-game values.
- **Laevatain Scorching Heart Heat Resistance Ignore fixed.** The talent was reading its values as raw numbers (10 / 15 / 20) instead of percentages, inflating the calculated bonus dramatically. It now correctly ignores 10% / 15% / 20% Heat Resistance at talent levels 1 / 2 / 3.
- **Damage breakdown resistance display no longer double-counts Arts entries.** Per-element rows (Heat / Cryo / Nature / Electric) used to re-list the Arts umbrella Resistance Ignore / Reduction sources under each element. Those now show only in the dedicated Arts row — the math is unchanged; each contributing source appears exactly once.

## 2026-04-17
- **Per-element AMP is now a first-class stat.** Zhuang Fangyi's Force of Nature talent — and any other operator / weapon / gear effect that grants Heat / Cryo / Nature / Electric / Physical AMP — now actually feeds into damage math. Previously only Arts AMP worked; per-element AMPs were silently dropped by the formula. The existing Arts umbrella still stacks on top for the four arts elements.
- **AMP row in the damage breakdown splits per element.** The Amp entry in the damage card now has Physical / Heat / Cryo / Nature / Electric / Arts sub-rows matching Fragility and Susceptibility, so Force of Nature's +18% Electric AMP appears as its own labeled source under the Electric row instead of being invisible.
- **Per-element Resistance Ignore and Resistance Reduction are now first-class stats.** Operator-side Resistance Ignore (Heat / Cryo / Nature / Electric / Physical / Arts) and enemy-side Resistance Reduction (same elements) both flow through the unified stat pipeline. They sum together into the resistance addback per the formula — so `1 − Resistance + IgnoredResistance` now reflects every source, including ones applied by newer operators.
- **Damage breakdown has a dedicated Resistance category.** The Resistance entry in the damage card now shows base resistance plus every contributing source broken out per element, mirroring how Fragility / Susceptibility / AMP already render.
- **Laevatain Scorching Heart actually reduces enemy Heat Resistance now.** The talent used to rely on an "IGNORE RESISTANCE" instruction that the engine silently did nothing with — so Scorching Heart's +10 / +15 / +20 Heat Resistance Ignore at talent levels 1–3 never reached the damage formula. It now applies through the new Heat Resistance Ignore stat and contributes correctly to damage.
- **Corrosion uses the unified resistance pipeline.** Corrosion previously applied its resistance reduction through a bespoke calculation hidden inside the damage formula. Each Corrosion tick now applies Arts Resistance Reduction through the same stat pipeline as every other effect — so it appears in the damage breakdown as a first-class source you can see, and it stacks with any other Arts Resistance Reduction correctly.
- **Corrosion segment layout simplified.** Instead of 15 one-second segments (the last six identical), Corrosion now shows 9 ramp ticks (one per second, ramping the reduction value) followed by a single hold segment that covers the rest of the duration. Segment names read "Corrosion I" for the first tick (matching the status level), then sequential "II / III / IV…" — matching the skill-card convention.
- **Status cards render per-segment details consistently with skill cards.** Reactions like Corrosion now render their segments through the same tabbed layout as skill cards, with per-segment APPLY clauses shown inline. The tab row scrolls horizontally when there are many segments, and segments without damage frames no longer render stray empty-box placeholders below their tabs.
- **Unified status creation under the hood.** Inflictions, physical statuses (Lift / Knock Down / Crush / Breach), restacked statuses, and cross-element reactions (e.g. Corrosion spawned by Heat + Nature infliction collision) all go through the same status creation path now. Any trigger watching for these events fires consistently, and segment-level clauses on those statuses actually dispatch instead of being silently skipped.

## 2026-04-16
- **Arts Susceptibility / Fragility / AMP are now first-class stats.** Any effect that grants "Arts Susceptibility / Fragility / AMP" (without naming a specific element) now flows into damage math for every arts element — Heat, Cryo, Nature, and Electric — through the shared stat accumulator. Previously these were silently ignored by the formula. Per-element stats stack on top of the arts umbrella.
- **Damage breakdown has a dedicated Arts row.** The per-element multiplier block in the damage card now has its own "Arts" entry alongside Physical / Heat / Cryo / Nature / Electric, showing contributions from ARTS_* stats (Fragility, Susceptibility, AMP, DMG bonus). For physical-only hits, the Arts DMG% entry is greyed out with "Does not apply to this hit" to make it clear the row is just reference.
- **Pog Fervent Morale buff no longer vanishes when Steel Oath is consumed.** A combo attack that consumed a Steel Oath stack was also silently reversing the ATK% buff from Fervent Morale — the consume handler was collapsing _every_ pending stat-reversal to the consumption frame, including ones from unrelated statuses. Reversals now only reschedule if they belong to the status being consumed.
- **Freeform-placed Lift / Knock-Down / Crush / Breach are draggable and removable again.** Manually dragging any of the four physical statuses into the enemy column produced an event that couldn't be dragged or right-click-removed — the visible event had a different internal id from the raw wrapper, so the controller couldn't resolve it. They now reuse the wrapper's id (same pattern as freeform Inflictions and Reactions) and stay fully editable.
- **Freeform physical statuses respect segment-resize.** Resizing the wrapper of a manually placed Lift / Knock-Down / Crush / Breach now updates the applied event's duration instead of snapping back to the hardcoded default.
- **MI Security gear stacks I → V on basic attack crits.** Equipping MI Security now renders its stacks as separate labeled segments (I, II, III, IV, V) across the BA's crit frames instead of collapsing into one long "MI Security I" banner. Root cause: the gear-set trigger source and the applied stat both used the same internal id, so the self-apply gate saw the first applied stack as a duplicate and dropped every subsequent one.
- **Status column filter menu rebuilt around source categories.** The right-click filter on status columns now groups into a flatter list — Skill / Talent / Potential / Weapon / Gear / Consumable / Tactical / Combat Status / Infliction / Reaction / Physical Status — driven by each status's own category metadata rather than a hardcoded mapping. New statuses automatically show up in the correct group without code changes.
- **Da Pan Ultimate "Enemy Defeated" parameter.** Da Pan's ultimate now exposes an **Enemy Defeated** toggle (0 / 1, default 0). When set to 1, the final damage frame applies Fine Cooking Potential (+30% Physical DMG, 15s) to Da Pan — representing the P1 improvement where the ultimate grants the buff if it defeats at least one enemy. Previously this required a bespoke self-trigger flow that didn't show up in the damage sheet.
- **Da Pan P2 Harmonized Flavors baked into the base Prep Ingredients status.** Prep Ingredients duration (20s → 30s at P2+) and max stacks (1 → 2 at P2+) now scale by potential inside the status itself, so no separate P2 event — just a single Prep Ingredients row that reflects your potential.
- **Da Pan Talent 2 Salty or Mild self-applies Prep Ingredients.** The talent now directly applies Prep Ingredients to Da Pan whenever she casts her ultimate, instead of firing a separate intermediate Fine Cooking Potential event.
- **Active loadout column highlight simplified.** The accent-colour fill on the live skill-level / talent-level / potential column in VARY_BY tables was overwhelming stat-bar rows. It's now just a bolder font weight plus the underline, which reads more cleanly across all table styles.
- **Shared-URL loadouts remember weapon level.** Weapon base-attack scaling by weapon level is now a first-class dimension in the data model, so a shared loadout at a non-max weapon level will restore the correct base attack.
- **Internal cleanup** — Event and status files now carry a single `eventCategoryType` field (Skill / Talent / Potential / Weapon / Gear / Consumable / Tactical / Combat Status / Infliction / Reaction / Physical Status), replacing the older split fields. No user-visible change on its own, but it's what lets the new filter menu pick up new statuses for free.

## 2026-04-15
- **Pogranichnik Fervent Morale reaches 5 stacks at P5.** The stack cap was resolving against a default loadout and capping labels at III even when Pog was at P5 (where the cap is 3 + 2 = 5). Each applied Fervent Morale now carries its own runtime cap, so the column correctly shows labels up to V and no stacks are falsely clamped/refreshed. The underlying cap expression now gates on "THIS OPERATOR is the SOURCE of the effect" — so only Pog herself gets the extra two stacks from P3+.
- **Da Pan Reduce and Thicken (T1) collapsed to one row.** Consuming a Vulnerability stack now directly applies the talent event itself — +4% / +6% Physical DMG Dealt (by talent level) for 10s, up to 4 stacks (RESET). Previously this was a talent firing a separate Reduce and Thicken status, which caused intermittent failures when the consume trigger didn't fire. The consume trigger is now always wired up for Crush and Breach Vulnerability consumption.
- **Da Pan Salty or Mild (T2) now shows a 2s marker per ult.** The talent firing on Da Pan's ultimate now produces a visible 2-second event on her timeline so you can see exactly when Prep Ingredients is granted — before this it triggered but left no marker behind.
- **Laevatain Re-Ignition (T2) collapsed to one row.** Dropping below 40% HP now applies the talent event itself — 90% Protection + 5% Max HP regen per second for 4s / 8s (by talent level), with a 120s internal cooldown segment. Previously this was a talent firing a separate Re-Ignition status.
- **Laevatain Scorching Heart now fires on Skill Finisher hits.** The talent's second trigger (for absorbing Heat via the BATK finisher's Explosive sequence) was missing — so after certain finisher casts, the "absorb Heat → apply Melting Flame" chain didn't run. It now fires whenever any finisher hits an enemy carrying Heat infliction.
- **Infliction stacks now label along the bar.** Heat / Cryo / Electric / Nature / Vulnerable / Knock-Down / Lift / Crush / Breach bars now split into labeled sub-segments that reflect the cumulative active stack count over time — so a Heat bar reads "Heat I → Heat II → Heat I" as stacks are added and consumed, instead of only showing the count at the moment the bar started.
- **Waterspout damage ticks no longer get cut off.** When multiple Waterspouts overlap, the later one would clamp the earlier one's bar shorter — hiding its 2s / 3s damage frames. Overlapping now only clamps if it wouldn't hide an internal tick, so every Waterspout's own damage schedule stays visible.
- **Active loadout column is highlighted in info-pane tables.** When viewing a skill / talent / status / weapon / gear card, the VARY_BY column matching your live skill level / talent level / potential / attribute-increase level is highlighted (accent background + bold). Makes it obvious at a glance which number applies to your current loadout. Talent-level tables correctly pick the slot that owns the card (talent one vs talent two).
- **Complex stack-limit expressions render as a tree.** Stack limits written as compound math (like Fervent Morale's `3 + 2 × (is source?)`) now display as a readable tree on the info-pane card instead of a raw JSON blob. Identity comparisons (this operator is source / other) render in plain English.
- **Condition thresholds say "1 stack" / "3 stacks".** Cardinality thresholds reading stacks now render with proper singular/plural labels — e.g. "consume Vulnerable at least 1 stack" — instead of a bare number.
- **Shared-link events on non-skill columns stay draggable.** Previously, decoding a shared URL produced infliction / status / reaction events that were missing their freeform placement marker, so they couldn't be dragged. They now stay freely placeable.
- **Tangtang Waterspout config cleaned up.** The engine's stack-dispatch path no longer conflates the at-cap interaction type with multi-stack dispatch, so Waterspout's config switched from a `RESET + 99999` workaround to a clean `NONE` — no visible behavior change, just correct semantics.
- **Applying a status with an unknown ID no longer crashes the timeline.** If a skill references a status that isn't in the data bundle, the engine now logs a warning and skips the apply instead of throwing mid-processing.

## 2026-04-14
- **Chen Qianyu Slashing Edge collapsed to one row.** The old two-part setup (talent that applied a separate Slashing Edge status) is now a single talent-status on Chen's timeline — each battle/combo/ultimate cast applies the talent event itself, stacking ATK up to 5× for 10s with RESET. Shadowless (P1) also folded into a single event — a self-triggering potential status that applies itself whenever the enemy drops below 50% HP, for a flat +20% DMG.
- **Endministrator Essence Disintegration collapsed to one row.** The operator-side ATK buff is now directly the talent event — CONSUME ORIGINIUM_CRYSTAL → the talent applies itself to the caster for +15% / +30% ATK (by talent level). P2 adds a second branch that additionally applies Essence Disintegration Minor (+7.5% / +15% ATK) to the other three operators. Previously this was a talent firing a separate status, which doubled the row count and caused subtle target-routing bugs.
- **Lifeng Subduer of Evil / Unremitting cleaned up.** Subduer of Evil is now a single 2-second talent event on Lifeng's timeline that fires whenever any operator applies Knock-Down and deals its Physical damage from its own frame-0 damage frame. Unremitting (P5) is now a self-triggering potential event that layers the +250% ATK burst + 5 stagger onto the Knock-Down cycle. Both are merged talent-status events — the old bare talent + separate status pair is gone.
- **Rossi Razor Clawmark now applies a real Fragility debuff.** Razor Clawmark stacks on the enemy now apply per-element Fragility stats (Physical + Heat) directly, flowing into every damage and reaction multiplier through the stat accumulator instead of being ignored by the formula. Seething Blood (talent) fully reworked alongside — its damage frame now resolves its Talent Level expression correctly whether it sits on talent slot one or two, so P4/P5 operators see the right multiplier.
- **Tangtang Waterspout / Olden Stare polished.** Waterspout stacks from Whirlpool applications now fire the intended per-whirlpool damage frames, Early Rogue Wave and Olden Stare lifecycles line up with wiki data, and the ultimate-variant Waterspout damage is wired to the right ATK scaling.
- **Fragility is now a first-class stat.** Per-element Fragility (Physical / Heat / Cryo / Nature / Electric / Arts) can now be applied via `APPLY STAT`. The damage formula reads these as real sources — you'll see them as individual contributor rows in the damage breakdown, tagged with the originating status (e.g. "Razor Clawmark +10%"). Before this change, only statuses with hardcoded fragility reads (Breach, Electrification, weapons, a handful of talents) could contribute.
- **Susceptibility stat contributions now flow into reaction damage.** Antal's Focus (and any operator applying a per-element Susceptibility via `APPLY STAT`) now correctly boosts reaction damage (Combustion, Solidification, etc.), not just direct damage. Previously these buffs were only visible on direct damage rows.
- **Freeform-placed statuses / inflictions / reactions lifecycle unified.** Manually dragged infliction, reaction, and status events now go through the exact same lifecycle as skill-triggered ones — same end frame, same time-stop extension, same on-enter / on-exit hooks. The direct visible fix: Yvonne's Freezing Point talent no longer drops one time-stop early when placed on a manually-dragged Cryo infliction (the BECOME-NOT trigger was firing at the raw unextended end). Other latent double-trigger issues in the freeform path are also gone.
- **Freeform placements now default Forced on physical statuses.** Manually dragging a Lift / Knock-Down / Crush / Breach onto the enemy no longer silently fails to apply because there's no Vulnerable active — the freeform placement is treated as forced by default. You can still edit the clause to gate it if needed.
- **Physical status freeform placements always create the event.** Physical statuses placed freeform now reliably produce the underlying event instance (with 1 stack by default), so downstream triggers and damage rows see them consistently.
- **Info pane now shows raw duration + time-stop adjusted duration.** For any event whose active range got extended by an ultimate time-stop, the info pane now shows both numbers: the raw duration on the first line and the time-stop-adjusted duration in gold below it. Makes it obvious when a status or infliction is running long because of an animation extension.
- **Info pane shows the value on stat-style statuses.** Generic statuses that carry a percentage value on the event itself (Fragility, AMP, Weakness, DMG Reduction, Protection, Susceptibility) now render their value directly on the card — e.g. a Heat Fragility event shows "Fragility 10.00%" — and the value is editable in edit mode.
- **Crit toggle restricted to damage frames only.** The Set Crit / No Crit context-menu action now only applies to frames that actually deal damage. Previously it was enabled on any non-DOT frame, which let you toggle crit on frames that have no damage clause (where it did nothing visible anyway).
- **Damage breakdown attributes talent damage to the right talent slot.** For operators with two talents, damage from a compound expression inside a talent event (e.g. "Talent Level × some formula") now resolves against whichever talent slot owns the event, not always talent one. Concretely: if a P4/P5 operator has a second talent with its own damage frame, that frame now scales with talent two's level rather than silently reading talent one's level.
- **Antal Focus / Avywenna Thunderlance-Pierce tweaks** — small config cleanups to tighten up the damage and infliction data.

## 2026-04-13
- **Yvonne reconciled.** Freezing Point and Cryoblasting Pistolier rebuilt end-to-end:
  - **Freezing Point (Talent)** now grants Critical DMG to Yvonne based on what's on the enemy: **+20% / +40%** (talent 1/2) while the enemy has Solidification, and **+10% / +20%** while the enemy has Cryo Infliction (on top of the base). **P3+ adds another +20% / +20%** to each tier respectively. The buff comes online when Cryo or Solidification is applied, ticks along with the enemy's state, and drops the moment both fall off.
  - **Cryoblasting Pistolier (Ult)** now models its crit stack loop as two separate statuses — **Crit Rate**: each stack gives Yvonne +3% crit rate; **Crit Damage**: the moment stacks reach the max, Yvonne gains a one-shot +60% Critical DMG buff for the rest of the ultimate. Previously the crit damage bonus fired at 10 stacks unconditionally even if the skill was already ramping.
  - **Cryoblasting Pistolier → Empowered BATK** now reads the right operator as the skill source (was silently reversing source/target in some chains).
- **Antal Focus simplified.** The separate Focus Empowered status is gone — the P5 branch folds back into the main Focus status, so there's only one row on the enemy's column instead of two switching places. Specified Research Subject (Battle Skill) always applies Focus, and P5 enhancements live inside that status. Combo skill trigger list cleaned up of the old empowered-specific branches.
- **Chen Qianyu Momentum Breaker reworked.** The talent is now a proper 2-second event on Chen's timeline with a stagger damage frame and explicit per-skill triggers — firing once each for Battle Skill, Combo Skill, and Ultimate when those interrupt an enemy charge. Stagger value scales correctly with talent level (0 / 5 / 10). Previously the talent was a bare effect with no duration or visible event block.
- **Ardelia Friendly Presence** is now a passive talent (triggered healing removed — it was double-firing with the skill's own healing frames). Mr. Dolly Shadow heal values rewritten into the standard heal form with talent-level-0 guard so an unlocked T1 doesn't silently grant level-1 benefits.
- **Laevatain Smouldering Fire Empowered** P1+ now grants a **1.2× damage multiplier** on the final damage frame and **returns 20 SP** per cast. Previously the P1 damage bonus wasn't wired up and SP return was missing.
- **Fluorite Unpredictable** standalone status removed — the talent buff is now expressed directly inside the talent itself, removing a duplicate row from the status list.
- **Enemy "being charged up" is now a trigger condition.** Operators can now condition effects on "enemy HAS Charge" — used by Chen Qianyu's Momentum Breaker talent to only fire when the interrupted skill actually interrupts a charge.
- **Element infliction state now triggerable.** Triggers can now react to "enemy BECOMES / IS Cryo / Heat / Nature / Electric / Vulnerable infliction" as first-class conditions. Yvonne's Freezing Point uses the negated form to drop the talent buff the instant Cryo drops off.
- **Condition ordering is no longer order-sensitive.** Triggers with multiple conditions (e.g. "operator performs battle skill AND enemy has charge") now evaluate cleanly no matter what order the conditions are listed in the config. A handful of latent bugs where a condition silently didn't match because of ordering are resolved.
- **Frame drag respects time-stops.** Dragging a frame diamond inside a segment that overlaps an ultimate time-stop no longer "slips" — the drag clamps to the visual segment bounds and stores the correct raw offset underneath.
- **Damage breakdown collapses repeated contributions.** When one status contributes many small stat entries (e.g. 10 Cryoblasting Pistolier crit stacks at +3% each), the breakdown now shows one "×10: 0.30" line instead of ten identical rows.
- **Segment / Event breakdown views sum correctly.** When the combat sheet is folded to the Segment or Event level, the info pane's damage card now sums multipliers across the folded frames and labels the card "Segment" / "Event" instead of "Frame" — the rolled-up total is what you see.
- **Infinite durations display as "Infinite".** Status and segment property panels that carry a permanent 99999s duration now render as the word "Infinite" instead of "99999 second".
- **Generic statuses (Slow, stagger, etc.) now apply their buffs correctly.** A latent gap was leaving generic unowned statuses without their clause effects registered — Slow stat adjustments, stagger-node / stagger-full global effects, and similar generic statuses now apply as intended.
- **Natural SP and returned SP visualized separately.** The SP graph now draws natural SP recovery (yellow) and returned SP (red) as distinct lines, matching the in-game distinction: only naturally-recovered SP feeds ultimate energy.
- **Info pane card reflects live drags and resizes.** When you drag a frame diamond or resize a segment, the skill card in the info pane updates its offsets and durations in real time instead of showing the static JSON values.
- **Debug Mode toggle** added to Settings — replaces the old interaction-mode affordance for unlocking the DEBUG info pane verbosity level.
- **Negative durations and stack counts are now rejected at load time.** Configs that accidentally wrote a negative duration or stack value (previously a silent sentinel for "permanent") now fail validation with a clear message pointing at the field.

## 2026-04-11
- **Alesh fully verified.** All skills, talents, potentials, and statuses reconciled and marked verified against in-game data. Combo Skill (Auger Angling) reworked with proper CHANCE hit/else branches — the Rare Fin bonus frame now correctly shows two possible outcomes (hit: bonus Cryo damage + forced Solidification; miss: smaller base damage only), and the chance toggle on frames works for both branches. Battle Skill SP recovery corrected to scale with skill level (10 per stack at L1-9, 15 at L10-12) plus the P1 flat bonus.
- **Arclight reconciled.** Wildland Trekker talent pipeline reworked — the team-wide Electric damage bonus now routes through the stat accumulator as a proper APPLY STAT to TEAM, so the damage sheet correctly reflects the buff on every operator's damage rows. P2 Speed Battler now grants +15 Agility and +15 Intellect as stat clauses. Notes updated.
- **CHANCE hit/else branches now work end-to-end.** Skills with a CHANCE compound (like Alesh's Rare Fin) correctly resolve both the hit and else damage paths. The damage sheet shows the right multiplier for whichever branch is active, and toggling the chance pin via right-click updates the sheet immediately. The context menu labels now say "Set Chance" / "Set No Chance" instead of the old "Hit/Miss" wording.
- **Team-wide stat buffs now affect damage calculations.** Buffs applied to the team entity (like Arclight's Wildland Trekker Electric damage bonus) are now merged into each operator's damage rows in the combat sheet, where previously they were silently ignored.
- **Element-specific AMP and resistance ignore are now element-filtered.** AMP bonuses and ignored-resistance effects that target a specific element (e.g. Electric AMP) now correctly apply only to matching damage, instead of applying to all elements.
- **Event color now comes from the event's own element data** instead of relying on the column definition. This fixes cases where events in shared columns (like enemy statuses) were showing the wrong color.
- **Single-segment event labels no longer truncate to a roman numeral** when there's room for the full name. Previously, reactions like "Combustion I" could display as just "I" even when the block was tall enough for the whole label.
- **Info pane compound effect display improved.** CHANCE and ALL/ANY blocks with a single conditional branch now render as a flat IF block instead of a nested compound, reducing visual clutter. Unconditional effects inside compounds are flattened to the same nesting level as their siblings.
- **CONSUME triggers now fire at the consumption frame** instead of the consumed event's start frame, matching in-game timing for skills that trigger off consuming a reaction or status.
- **Enemy HP percentage now available for condition evaluation,** enabling HP-gated conditional clauses on enemy-targeted effects.
- **Locale labels cleaned up.** Infliction, reaction, physical status, combat status, and stagger labels reorganized into proper semantic categories instead of all living under "infliction.*". Removed ~20 duplicate/stale locale entries.
- **ESLint rule added for UPPER_SNAKE_CASE string literals in comparisons.** A new lint warning catches `=== 'SOME_CONSTANT'` patterns that should use enum imports, helping enforce the zero-magic-strings policy.
- **Validator: TEAM-targeted statuses now warn when value nodes reference THIS OPERATOR** instead of SOURCE OPERATOR, catching a common config error where stat lookups resolve against the empty team entity instead of the casting operator.

## 2026-04-10
- **Snowshine fully verified.** Whole kit reworked end-to-end against the wiki and in-game data:
  - **Saturated Defense (BS)** — raises a 4.5s shield that grants every operator Protection (90% damage reduction) for the same 4.5s window, returns 30 SP up front, and now retaliates against attackers per-hit. Each enemy hit during the shield triggers a Cryo damage burst (with stagger and Cryo Infliction) on the attacker, instead of the old single scheduled retaliation. SAR Professional (T2) grants 6/10 Ultimate Energy per retaliation; Cold Disaster Specialist (P5) returns 10 SP per retaliation.
  - **Polar Rescue (CS)** — opens its activation window only when both conditions hold: an enemy hits the controlled operator AND that operator is at 60% HP or below. The throw drops a Snowfield SAR Assistance status on each of the four operators with an instant heal plus three continuous heal ticks over 3 seconds, scaled off Snowshine's Will. Polar Survival (T1) baked into the heal output for +15% / +25% at talent levels 1 / 2. Cooldown corrected to 25s at L1-L8, 24s at L9-L11, 23s at L12.
  - **Frigid Snowfield (Ult)** — drops a Snow Zone on the enemy that ticks Cryo damage 10 times over 5 seconds and forcibly applies Solidification on contact. Polar Survival Guide (P3) extends the Solidification by 2 seconds at potential 3+; the zone itself stays 5 seconds.
  - **Tundra Aegis (P4)** now grants the +20 DEF and +20 Will it should.
- **Reactions now show their tier (I-IV) directly on the event block** as a roman numeral, matching how skill levels and stack counts already render. Easier to read at a glance which Combustion / Solidification / Corrosion / Electrification is which power tier.
- **Frame diamond colors corrected across the board.** A latent bug was leaving some damage frame diamonds white instead of their element color (Cryo, Heat, Nature, Electric) on a chunk of operators (Yvonne, Wulfgard, Last Rite, Perlica, Tangtang, and a dozen others). Every damage / infliction / reaction frame now renders in the correct element color across the timeline canvas, info pane, and hover tooltips.
- **Info pane "Forced" badge now appears for engine-applied forced reactions.** Snowshine's Snow Zone Solidification, and any other reaction that an operator skill explicitly forces, now correctly shows the Forced indicator and toggle. Previously only manually-added freeform reactions were marked as forced.
- **Info pane condition cards now show the threshold number** for predicates like "source Operator Have Potential at least 5" — previously the number was being dropped and the card just said "at least" with nothing after it. Affects every conditional clause that uses the extended `with.value` ValueNode form.
- **Talent level 0 = no benefit.** Snowshine's SAR Professional was granting 6 Ultimate Energy per retaliation even when the talent was locked. Talent level 0 now correctly produces no benefit; level 1 grants the first tier; level 2 grants the second. Other operators that hit the same edge case will be migrated as they're reconciled.
- **Rossi's Moment of Blazing Shadow combo cooldown corrected** to 15s at L1-L11 and 14s at L12 per wiki. Previously had the L12 reduction rolled one level early (`[..., 14, 14]`).
- **Combat sheet now shows damage rows for retaliation-style chains.** Operator-owned status events that deal damage (Snowshine's retaliation burst, plus any future status of the same shape) now produce damage rows in the combat sheet attributed back to the originating skill column instead of being silently dropped.
- Generic Protection status now has a 5s default duration so any future skill that grants Protection without an explicit timer behaves consistently.

## 2026-04-09
- Fixed a latent damage-calc bug affecting Wulfgard, Antal, Avywenna, and Last Rite — effects that referenced the "source" of a triggered event were silently resolving against the wrong operator's stats in some chained-trigger cases. Damage values for these operators in cascading interactions should now match in-game more closely.
- Reactions caused by overlapping inflictions now correctly attribute back to every contributing source, not just the most recent — improves accuracy when multiple operators' inflictions feed into a single reaction.
- The info panel now shows which operator consumed or refreshed an infliction/status, traced through the event chain rather than a stored snapshot — more accurate when multiple operators interact with the same status.
- Large internal engine overhaul — event identity tracking, resource accounting, and effect processing all consolidated into a single unified pipeline. No intended player-facing behavior changes beyond the fixes above, but the engine is significantly more robust for future operator updates.

## 2026-04-08
- Combo activation windows now flow through a single reactive path — windows open the moment a matching trigger event fires, and the sidebar stays in sync with combo cooldown reductions (e.g. Wulfgard P5 ult resetting the combo CD)
- CONTROLLED-operator combo triggers resolve more consistently — Avywenna's combo window correctly ignores a non-controlled Akekuri's basic attack, matching the in-game behavior
- Enemy inflictions and operator statuses now correctly stretch through later time-stops — if an ultimate animation lands partway through an active infliction, the infliction's remaining duration is now extended by the animation, matching how skill events already behaved
- Ongoing internal engine cleanup — event pipeline continues to be restructured incrementally for more predictable behavior in future operator updates

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
