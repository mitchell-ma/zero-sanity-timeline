# Devlog

## 2026-04-21
- Zhuang Fangyi added. New 6-star Striker (Electric / Arts Unit, main WILL / secondary INTELLECT). Her Battle Skill, Mantra of Sundering, consumes the enemy's Electrification and fires a chain of Thunder Strikes whose length matches how many Sunderblades she's holding — up to three, based on the Electrification level consumed. Each strike deals Electric damage, recovers Ultimate Energy, and adds a stack of Force of Nature (elemental AMP); the final strike hits for 6× damage. Her Ultimate, Smiting Tempest, transforms her into the Empyrean of Truth — enhanced Basic Attack and enhanced Breath of Transformation variants swap in for the duration, Finisher is disabled, and the first post-transform cast of Mantra of Sundering is a guaranteed free, full-conversion cast. P1–P5 potentials scale the chain's damage, refund SP, and extend the transformation window; the talents Force of Nature (per-strike Electric AMP) and Ordained by Heaven round out the kit.
- Top bar slimmed down further. Devlog, Feedback, Keyboard shortcuts, the Freeform toggle, and the GitHub link are no longer separate buttons — they now live together under a single "About" button, which opens a compact menu with the same options. The theme, settings, and collab buttons stay where they were.
- Collaboration flow unified into one modal. Hosting, joining, and the live session (room code, peer list, reconnect status, share-link copy) are all handled by one dialog now, and reopening it after a refresh automatically lands you back on the role you were using. Managing shared loadouts moved inside the same dialog so you don't jump between windows.
- Combat sheet damage header redesigned. The old spreadsheet-style table at the top of the combat sheet is replaced with a dashboard: Team Total / DPS / Duration / Crowd Control on the left, one horizontal lane per occupied operator on the right showing a stacked bar that breaks out Basic / Battle / Combo / Ultimate contribution with its share of the team total. Operators with no damage shrink down and empty skill columns collapse, so the header reflects what actually happened in the fight.
- Enemy picker inside the info pane. Opening the enemy card now shows a searchable, tier-filtered selector at the top (mirroring the operator picker) — you can swap the enemy without leaving the pane.
- Enemy stat edits persist. HP, DEF, per-element resistances, stagger, level, and any other fields you change on an enemy are saved locally per enemy id and restored on reload. A reset button clears the override to pull the stock values back.
- Event labels render fuller. Reactions and statuses with short names (Focus, Breach, Crush) now stay spelled out instead of collapsing to just the trailing numeral when space permits. Labels that end in a single "I" never shrink to just the "I" anymore — a lone roman-one carried no information.
- New loadout auto-starts in rename mode. Creating a new loadout opens the rename field immediately so you can type a name right away — no extra right-click.
- Statistics view with many sibling permutations loads faster. When a sheet's sources share the same parent loadout, the underlying data is parsed once and reused across every view, so a 25-view permutation grid no longer does 25 redundant loads.
- Skill-type context menus read more naturally. Basic Attack / Battle Skill / Combo Skill / Ultimate now appear in Title Case inside right-click menus, while the compact ALL-CAPS form stays on timeline column headers.
- Gear and weapon icons refreshed. The full set of gear piece and weapon thumbnails has been re-exported to WebP for sharper rendering at small sizes and smaller download size.

## 2026-04-19
- French language support. A new Français option in Settings switches the entire interface — buttons, tooltips, context menus, modals, info-pane cards — into French. Every operator, skill, talent, potential, gear piece, and weapon name and description is localized too, pulled from the wiki's French content. Anything not yet translated quietly falls back to English so the app stays usable during the rollout.
- Steadier collaboration over tricky networks. When two peers can't reach each other directly (a common case with Firefox on the same LAN, or either side behind a strict corporate / mobile NAT), the app now relays traffic through our own servers automatically. You shouldn't see any change if your connection was already working — but sessions that used to fail silently now connect reliably, and mid-session drops that were caused by network-layer blockage now recover on their own.
- Number-driven descriptions. Every potential, skill, and talent description that used to bake in fixed numbers (e.g. `+30% DMG for 15s`) now reads its actual numbers from the operator's data — so when a balance patch changes a value, or when we reconcile a level-scaling number, the description updates everywhere automatically. The numbers shown on the info-pane card always match what the damage engine is using.

## 2026-04-18
- Real-time collaboration. A new Collab button in the top bar lets you host a room (share the code) or join one. Every loadout edit — adds, drags, edits, permutation views — streams between peers over a direct peer-to-peer connection, with no server in the middle. The button shows connection status (connected / connecting / reconnecting / error), and the dropdown lists every peer in the room with their role and display name. If your connection drops, the session reconnects automatically with a live "next try in Ns" countdown and resyncs on recovery. Hosts can add or remove shared loadouts at any time from the dropdown, and joiners see the host's actual loadout names (with a small people icon marking them as live).
- Statistics view. A new Statistics tab in the left rail lets you build comparison sheets that pull data from any number of loadouts or permutation views at once. Each sheet shows per-source rows for Basic / Battle / Combo / Ultimate totals, Team DPS, Duration, Time to Kill, Crowd Control %, and Team Total, with per-operator subrows. Switch Comparison Mode between Raw values, deltas vs the base row, or deltas vs the previous row — delta cells are coloured green when higher than the reference and red when lower, and follow your Decimal / Percentage number-format preference (a `1.12` multiplier in Decimal, a signed `+12.00%` in Percentage). When every source shares the same parent loadout, the view auto-groups as a single permutation table. Drag column headers to reorder columns and drag the grab handle on any row to reorder rows — since Base is always the first row and Previous is the row directly above, reordering lets you re-anchor the comparison without recreating the sheet. Crit Mode is a per-sheet setting too.
- Loadout Views — compare setups at different potentials and weapon ranks at a glance. Right-click a loadout and choose Create views… to pick per-slot operator potentials (P0–P5) and weapon skill 3 ranks (R1–R9). The app generates the full cartesian product as read-only child views under the parent, each named from the values that vary (e.g. `Laevatain P0R9 - Antal P5R1`). Clicking a view loads that permutation instantly — same rotation, different stats — so you can see how a build scales with upgrades. Capped at 256 views per loadout.
- New combat sheet header. The top of every combat sheet shows each operator with splash art, potential / class / element badges, and a compact gear strip (weapon + weapon rank, consumable, tactical, armor, gloves, kit 1, kit 2) next to a damage table that breaks out Basic / Battle / Combo / Ultimate totals per operator with their share of the team total. The operator cards are clickable — click one to open its loadout edit panel. Team DPS, Duration, Time to Kill, Crowd Control %, and Team Total sit along the bottom.
- Sidebar redesign. The left rail tabs (Loadouts / Workbench / Statistics) now fully collapse when you click the active tab again, giving the timeline and sheet the full width — click any tab to bring it back. The sidebar footer adds dedicated Import and Export buttons for moving bundles in and out, and right-clicking a loadout now offers Copy share link (with a "URL Link Copied" toast) and Download (save a single loadout to a file). Ctrl+drag during marquee-select adds to your current selection instead of replacing it.
- Top bar slimmed down. The inline loadout-name display, rename pencil, and Clear All button are gone — rename and delete live on the loadout itself in the sidebar (right-click). The bar now hosts only global affordances (theme, settings, devlog, freeform, collab, keyboard shortcuts).
- Crit and Grouping controls moved onto the sheet. The global Expected / Never / Always / Manual and Frame / Segment / Event buttons in the top bar are gone. Right-click anywhere on the combat sheet for a compact menu with Grouping and Critical Mode steppers — plus a Randomize action (visible in Manual mode) that re-rolls every pinned crit frame in one click.
- Create / Edit Views modal. The bottom button is dual-mode: Generate N views when you have axes selected, Clear views (red) when you've collapsed every selection back to the parent, or Generate if no permutations would be created yet — so you can clear a view set without leaving the modal. Hovering the ⚠ on an invalid permutation lists every placement issue inline (e.g. "Antal: weapon rank R1 not unlocked at potential 0").
- Export modal gains drag-sweep-invert — click and drag across rows in the Export Loadouts picker to invert each row's selection as the cursor passes over it.
- Custom skill editor hover-help. Hovering a field label in the skill / segment / frame / clause editors reveals a short explanation of what the field controls, lowering the onboarding cost for building a custom skill from scratch.
- Corrosion now reduces Physical Resistance as well as Arts. Each Corrosion segment applies both Arts and Physical Resistance Reduction, so physical-damage hits on a corroded enemy finally benefit from the debuff. Together with Arts (covering Heat / Cryo / Nature / Electric), Corrosion is universally useful against any team comp. Corrosion's stack values also now read correctly as percentages — 1→4 stacks apply 3.6%→7.2% initial, ramping up to 12%→24% maximum reduction.
- Context menus and enemy picker no longer clip at the screen edge — menus opening near the bottom or right nudge up/left to stay fully on-screen.
- Comparison delta cells with no value now render as a clean blank instead of a placeholder dash.

## 2026-04-17
- Per-element AMP is now a first-class stat. Zhuang Fangyi's Force of Nature talent — and any other operator / weapon / gear effect that grants Heat / Cryo / Nature / Electric / Physical AMP — now actually feeds into damage math. Previously only Arts AMP worked; per-element AMPs were silently dropped by the formula. The AMP row in the damage breakdown splits per element to match.
- Per-element Resistance Ignore and Resistance Reduction are now first-class stats. Operator-side Resistance Ignore and enemy-side Resistance Reduction (Heat / Cryo / Nature / Electric / Physical / Arts) flow through the unified stat pipeline and sum correctly into the resistance addback. The damage card now has a dedicated Resistance category showing base resistance plus every contributing source broken out per element.
- Laevatain Scorching Heart actually reduces enemy Heat Resistance now. The talent used to rely on an instruction the engine silently ignored, so its +10 / +15 / +20 Heat Resistance Ignore at talent levels 1–3 never reached the damage formula.
- Corrosion uses the unified resistance pipeline. Each Corrosion tick now applies Arts Resistance Reduction through the same pipeline as every other effect, so it appears in the damage breakdown as a first-class source and stacks correctly with any other Arts Resistance Reduction. The segment layout is simpler too — 9 ramp ticks (one per second) followed by a single hold segment for the rest of the duration, with per-segment cards rendered inline like skill cards.

## 2026-04-16
- Arts Susceptibility / Fragility / AMP are now first-class stats. Any effect that grants an arts-umbrella buff (without naming a specific element) now flows into damage math for every arts element — Heat, Cryo, Nature, Electric — through the shared stat accumulator. Per-element stats stack on top of the umbrella. The damage breakdown has a dedicated Arts row alongside Physical / Heat / Cryo / Nature / Electric; for physical-only hits, the Arts entry is greyed out with "Does not apply to this hit" so it's clear the row is reference.
- Pog Fervent Morale buff no longer vanishes when Steel Oath is consumed. Consuming a Steel Oath stack was silently reversing the ATK% buff from Fervent Morale — reversals now only reschedule if they belong to the status being consumed.
- Freeform-placed Lift / Knock-Down / Crush / Breach are draggable, removable, and respect segment-resize. Manually dragging any of the four physical statuses into the enemy column now produces an event you can edit, drag, resize, and right-click-remove.
- MI Security gear stacks I → V on basic attack crits render as separate labeled segments across the BA's crit frames instead of collapsing into one long banner.
- Status column filter menu rebuilt. The right-click filter on status columns now groups into a flatter list — Skill / Talent / Potential / Weapon / Gear / Consumable / Tactical / Combat Status / Infliction / Reaction / Physical Status — driven by each status's own metadata, so new statuses show up in the right group automatically.
- Da Pan Ultimate "Enemy Defeated" parameter. Da Pan's ultimate exposes an Enemy Defeated toggle (0 / 1, default 0); set to 1 and the final damage frame applies Fine Cooking Potential (+30% Physical DMG, 15s) to Da Pan, representing the P1 improvement. Harmonized Flavors (P2) is baked into the base Prep Ingredients status itself — duration and max-stack scaling now live on the status so one row reflects your potential, and Salty or Mild (T2) now self-applies Prep Ingredients on her ultimate.
- Shared-URL loadouts remember weapon level. Weapon base-attack scaling by weapon level is now a first-class dimension in the data model, so a shared loadout at a non-max weapon level restores the correct base attack.

## 2026-04-15
- Pogranichnik Fervent Morale reaches 5 stacks at P5. The stack cap was resolving against a default loadout and capping at III even at P5 (where the cap is 3 + 2 = 5). Each applied Fervent Morale now carries its own runtime cap, so the column shows labels up to V and no stacks are falsely clamped. Only Pog herself gets the extra two stacks from P3+.
- Da Pan Reduce and Thicken (T1) collapsed to one row. Consuming a Vulnerability stack now directly applies the talent event itself — +4% / +6% Physical DMG Dealt (by talent level) for 10s, up to 4 stacks. The consume trigger is always wired up for Crush and Breach Vulnerability consumption, fixing intermittent misses.
- Da Pan Salty or Mild (T2) now shows a 2s marker per ult. The talent firing on Da Pan's ultimate produces a visible 2-second event on her timeline so you can see exactly when Prep Ingredients is granted.
- Laevatain Re-Ignition (T2) collapsed to one row. Dropping below 40% HP now applies the talent event itself — 90% Protection + 5% Max HP regen per second for 4s / 8s (by talent level), with a 120s internal cooldown segment.
- Laevatain Scorching Heart now fires on Skill Finisher hits. The talent's second trigger was missing, so after certain finisher casts the absorb-Heat → apply-Melting-Flame chain didn't run.
- Infliction stacks now label along the bar. Heat / Cryo / Electric / Nature / Vulnerable / Knock-Down / Lift / Crush / Breach bars split into labeled sub-segments reflecting the cumulative active stack count over time — a Heat bar reads "Heat I → Heat II → Heat I" as stacks are added and consumed, instead of only showing the count at the moment the bar started.
- Waterspout damage ticks no longer get cut off. Overlapping Waterspouts now only clamp if it wouldn't hide an internal tick, so every Waterspout's own damage schedule stays visible.
- Active loadout column is highlighted in info-pane tables. When viewing a skill / talent / status / weapon / gear card, the column matching your live skill level / talent level / potential / attribute-increase level is highlighted so it's obvious at a glance which number applies to your current loadout.
- Complex stack-limit expressions render as a readable tree (instead of raw data) on info-pane cards, with identity comparisons ("this operator is source") written in plain English.
- Shared-link events on non-skill columns stay draggable. Previously, decoding a shared URL produced infliction / status / reaction events that couldn't be dragged.

## 2026-04-14
- Chen Qianyu Slashing Edge collapsed to one row. Each battle / combo / ultimate cast applies the talent event itself — ATK stacking up to 5× for 10s. Shadowless (P1) folds into a single self-triggering potential event that applies itself whenever the enemy drops below 50% HP for a flat +20% DMG.
- Endministrator Essence Disintegration collapsed to one row. The talent directly applies itself to the caster for +15% / +30% ATK on crystal consume; P2 adds a second branch that also applies Essence Disintegration Minor (+7.5% / +15% ATK) to the other three operators.
- Lifeng Subduer of Evil / Unremitting cleaned up. Subduer of Evil is a single 2-second talent event that fires whenever any operator applies Knock-Down and deals its Physical damage from its own frame-0 damage frame. Unremitting (P5) layers the +250% ATK burst + 5 stagger onto the Knock-Down cycle.
- Rossi Razor Clawmark now applies a real Fragility debuff. Razor Clawmark stacks apply per-element Fragility (Physical + Heat) directly through the stat accumulator, flowing into every damage and reaction multiplier. Seething Blood (talent) reworked alongside — its Talent Level expression now resolves correctly whether the talent sits on slot one or two.
- Tangtang Waterspout / Olden Stare polished. Waterspout stacks from Whirlpool applications now fire the intended per-whirlpool damage frames, and Early Rogue Wave / Olden Stare lifecycles align with wiki data.
- Fragility is now a first-class stat. Per-element Fragility (Physical / Heat / Cryo / Nature / Electric / Arts) can be applied via `APPLY STAT` and shows as individual contributor rows in the damage breakdown, tagged with the originating status (e.g. "Razor Clawmark +10%"). Before this change, only a handful of hardcoded sources could contribute.
- Susceptibility stat contributions now flow into reaction damage. Antal's Focus and any operator applying a per-element Susceptibility via `APPLY STAT` now correctly boosts reaction damage (Combustion, Solidification, etc.), not just direct damage.
- Freeform-placed statuses / inflictions / reactions go through the same lifecycle as skill-triggered ones. Manually placed events now share the same end frame, time-stop extension, and on-enter / on-exit hooks. Visible fix: Yvonne's Freezing Point no longer drops one time-stop early on a manually-dragged Cryo infliction.
- Info pane shows raw duration + time-stop adjusted duration. For any event whose active range got extended by an ultimate time-stop, both numbers appear — raw on the first line, time-stop-adjusted in gold below — making it obvious when a status is running long because of an animation extension.
- Info pane shows the value on stat-style statuses. Generic statuses that carry a percentage value on the event itself (Fragility, AMP, Weakness, DMG Reduction, Protection, Susceptibility) now render their value directly on the card and it's editable in edit mode.
- Damage breakdown attributes talent damage to the right talent slot. For operators with two talents, damage from a compound expression inside a talent event now resolves against whichever talent slot owns the event, not always talent one.

## 2026-04-13
- Yvonne reconciled. Freezing Point now grants Critical DMG based on what's on the enemy — +20% / +40% (talent 1/2) while Solidification is active, +10% / +20% while Cryo Infliction is active (additive), with P3+ layering another +20% on each tier. Cryoblasting Pistolier models its crit stack loop as two separate statuses: a per-stack +3% crit rate and a one-shot +60% Critical DMG buff that fires the moment stacks reach the cap.
- Antal Focus simplified. The separate Focus Empowered status is gone — the P5 branch folds back into the main Focus status, so there's only one row on the enemy's column instead of two switching places.
- Chen Qianyu Momentum Breaker reworked. The talent is a proper 2-second event with a stagger damage frame and explicit per-skill triggers — firing once each for Battle Skill, Combo Skill, and Ultimate when those interrupt an enemy charge. Stagger value scales correctly with talent level (0 / 5 / 10).
- Ardelia Friendly Presence is now a passive talent (triggered healing removed, it was double-firing with the skill's own healing frames).
- Laevatain Smouldering Fire Empowered at P1+ now grants a 1.2× damage multiplier on the final damage frame and returns 20 SP per cast.
- Enemy "being charged up" is now a trigger condition, along with "enemy BECOMES / IS Cryo / Heat / Nature / Electric / Vulnerable infliction" as first-class conditions (used by Yvonne's Freezing Point to drop the talent buff the instant Cryo falls off).
- Condition ordering is no longer order-sensitive. Triggers with multiple conditions now evaluate cleanly no matter what order the conditions are listed.
- Damage breakdown collapses repeated contributions. One status contributing many small stat entries (e.g. 10 Cryoblasting Pistolier crit stacks at +3% each) now shows one "×10: 0.30" line instead of ten identical rows. Folded Segment / Event views also sum correctly — the info pane's damage card labels itself "Segment" / "Event" and the rolled-up total is what you see.
- Natural SP and returned SP visualized separately. The SP graph now draws natural SP recovery (yellow) and returned SP (red) as distinct lines, matching the in-game distinction: only naturally-recovered SP feeds ultimate energy.
- Info pane card reflects live drags and resizes. When you drag a frame diamond or resize a segment, the skill card updates its offsets and durations in real time instead of showing the static values.
- Infinite durations display as "Infinite" instead of "99999 second".

## 2026-04-11
- Alesh fully verified. All skills, talents, potentials, and statuses reconciled against in-game data. Combo Skill (Auger Angling) reworked with proper hit/else branches — the Rare Fin bonus frame correctly shows two possible outcomes, and the chance toggle on frames works for both branches.
- Arclight reconciled. Wildland Trekker team-wide Electric damage bonus now routes through the stat accumulator as a proper team-wide apply, so the damage sheet correctly reflects the buff on every operator's damage rows. P2 Speed Battler grants +15 Agility and +15 Intellect.
- Chance hit/else branches work end-to-end. Skills with a chance compound (like Alesh's Rare Fin) resolve both damage paths; the damage sheet shows the right multiplier for the active branch, and toggling the chance pin updates the sheet immediately.
- Team-wide stat buffs now affect damage calculations. Buffs applied to the team entity (like Arclight's Wildland Trekker Electric damage bonus) merge into each operator's damage rows, where previously they were silently ignored.
- Element-specific AMP and resistance ignore are element-filtered. Effects that target a specific element now correctly apply only to matching damage, instead of applying to all elements.
- Event color comes from the event's own element data instead of relying on the column definition, fixing cases where events in shared columns (like enemy statuses) showed the wrong color.
- Info-pane compound effect display improved. Chance and all/any blocks with a single conditional branch render as a flat IF block instead of a nested compound, reducing visual clutter.
- Consume triggers now fire at the consumption frame instead of the consumed event's start frame, matching in-game timing for skills that trigger off consuming a reaction or status.
- Enemy HP percentage is available for condition evaluation, enabling HP-gated conditional clauses on enemy-targeted effects.

## 2026-04-10
- Snowshine fully verified. Whole kit reworked end-to-end: Saturated Defense (BS) raises a 4.5s shield granting Protection to the team and retaliates against every attacking hit with a Cryo damage burst (with stagger and Cryo Infliction). SAR Professional (T2) grants 6 / 10 Ultimate Energy per retaliation; Cold Disaster Specialist (P5) returns 10 SP per retaliation. Polar Rescue (CS) opens only when the controlled operator is hit and at ≤60% HP, dropping Snowfield SAR Assistance on each operator with an instant heal plus three ticks over 3 seconds. Frigid Snowfield (Ult) drops a Snow Zone ticking Cryo 10× over 5 seconds and forcibly applies Solidification on contact; Polar Survival Guide (P3) extends Solidification by 2 seconds. Tundra Aegis (P4) grants the +20 DEF and +20 Will it should.
- Reactions now show their tier (I–IV) directly on the event block as a roman numeral, matching how skill levels and stack counts already render.
- Frame diamond colors corrected across the board. A latent bug left some damage frame diamonds white instead of their element colour on many operators (Yvonne, Wulfgard, Last Rite, Perlica, Tangtang, and others). Every damage / infliction / reaction frame now renders in the correct element colour.
- Info pane "Forced" badge appears for engine-applied forced reactions. Snowshine's Snow Zone Solidification, and any reaction a skill explicitly forces, now shows the Forced indicator and toggle. Previously only manually-added freeform reactions were marked as forced.
- Talent level 0 = no benefit. Snowshine's SAR Professional was granting 6 Ultimate Energy per retaliation even when the talent was locked; level 0 now correctly produces no benefit.
- Combat sheet now shows damage rows for retaliation-style chains. Operator-owned status events that deal damage (Snowshine's retaliation burst, and any future status of the same shape) now produce damage rows in the combat sheet attributed back to the originating skill column.

## 2026-04-09
- Damage-calc bug affecting Wulfgard, Antal, Avywenna, and Last Rite fixed. Effects referencing the "source" of a triggered event were silently resolving against the wrong operator's stats in some chained-trigger cases.
- Reactions caused by overlapping inflictions now correctly attribute back to every contributing source, not just the most recent — improves accuracy when multiple operators' inflictions feed into a single reaction.
- The info panel now shows which operator consumed or refreshed an infliction/status, traced through the event chain rather than a stored snapshot.

## 2026-04-08
- Combo activation windows flow through a single reactive path. Windows open the moment a matching trigger event fires, and the sidebar stays in sync with combo cooldown reductions (e.g. Wulfgard P5 ult resetting the combo cooldown).
- Controlled-operator combo triggers resolve more consistently. Avywenna's combo window correctly ignores a non-controlled Akekuri's basic attack, matching the in-game behavior.
- Enemy inflictions and operator statuses now correctly stretch through later time-stops. If an ultimate animation lands partway through an active infliction, the infliction's remaining duration is extended by the animation, matching how skill events already behaved.

## 2026-04-07
- Estella's Commiseration SP refund moved into the battle skill itself. The talent grants the stack, and the skill checks for the stack and consumes it on use, fixing cases where the refund didn't fire reliably.
- Ember Pay The Ferric Price no longer triggers off her own damage frames. The talent correctly fires only when the enemy hits Ember, not whenever Ember deals damage.
- Trigger conditions that name the enemy or "any other operator" as the subject now match correctly across all action verbs, fixing several latent edge cases in cascading-trigger interactions.

## 2026-04-06
- Avywenna fully verified. Thunderlance battle skill models per-lance damage, stagger, and ultimate energy through new Pierce / Pierce-EX statuses applied to the enemy, with one frame fired per lance for accurate damage breakdown. P5 Carrot and Sharp Stick's 1.15× damage bonus only applies when the enemy has Electric Susceptibility, modelled through the susceptibility stack count.
- Last Rite fully verified. All skills, talents, potentials, and statuses marked as verified against in-game data. Hypothermic Perfusion split into parent + Mirage child — the parent buff sits on the controlled operator and triggers a separate mirage attack on each Final Strike, with proper P5 damage scaling.
- Inline value editing in the info pane. Click any number on a freeform event's skill or status card to type in a custom value, with a one-click reset to revert. Overridden numbers glow yellow so you can see at a glance what's been hot-wired.
- Multi-column events now expand into adjacent empty space. When neighbouring micro-columns have temporal gaps, an event widens to fill them for clearer reading, while still respecting other events' time ranges so nothing visually overlaps.
- Damage breakdown resolves enemy-side susceptibility stack counts in value formulas, enabling damage multipliers that scale off how susceptible the target currently is.
- Talent display names cleaned up — "(Talent)" suffixes replaced with shorter "T1" / "T2" tags so the timeline reads more cleanly.

## 2026-04-05
- Tangtang fully implemented. All skills, talents, potentials, and five statuses (Whirlpool, Waterspout, Olden Stare, Early Rogue Wave, Waterspout Ult).
- Last Rite expanded. Hypothermic Perfusion status added, battle skill cryo DOT reworked, combo skill now checks cryo infliction stacks, P2 Absolute Zero Armament implemented, and Hypothermia talent gains proper slow and susceptibility effects.
- Avywenna reworked. Thunderlance status split into regular and enhanced (EX) variants, battle skill interdiction updated with full stagger interaction data, combo and ultimate configs expanded.
- Lifeng's ultimate reworked. Vajra Impact is a conditional segment that only activates when LINK is consumed — without LINK, the ultimate skips that phase entirely for a shorter animation; with LINK, the full extended attack plays out with bonus damage.
- Slow effects are tracked as a stat. Talents and statuses that check "enemy is slowed" work through the stat accumulator instead of requiring a specific status column.
- Frame markers on the timeline distinguish between damage frames (diamond) and non-damage frames (circle), making it easier to identify which frames deal damage at a glance.
- Per-element susceptibility stats (Heat, Cryo, Nature, Electric, Physical) and a Final Strike damage bonus stat are now tracked for more granular debuff and buff modelling.
- Combo skill activation now correctly checks which operator is being controlled at the time of the trigger. Previously any operator's final strike could activate any combo — now only the actively controlled operator's actions count.
- Lift and Knock Down physical status effects properly calculate and display their damage in the damage breakdown.

## 2026-04-04
- Laevatain's Empowered Battle Skill now consumes all Melting Flame stacks at once, matching in-game behaviour. Scorching Heart's activation condition reliably fires when Melting Flame reaches max stacks and won't re-trigger from leftover stacks.
- Context menu shows individual basic attack segments as cards with numbered buttons (I, II, III, etc.) for easier placement.
- Crowd control effects (stun, bind, etc.) are now tracked in the timeline system.

## 2026-04-03
- Endministrator fully reworked. Originium Crystals trigger a reactive shatter when any physical status (Vulnerable, Lift, Crush, Knock Down, Breach) is applied to a crystallised enemy, dealing bonus Physical DMG and granting Essence Disintegration ATK buffs. P1 SP refund and P2 team ATK share at half value both work correctly.
- Pogranichnik fully implemented. The Living Banner talent tracks SP gains as a running counter, triggering Fervent Morale ATK / Arts Intensity buffs when the threshold is reached. Steel Oath team stacks from ultimate are consumed by the combo skill, branching into Harass or Decisive Assault based on remaining stacks. All potentials functional.
- Perlica's Obliteration Protocol talent reworked with reactive triggers for node stagger and full stagger events, segment-level disable support for battle skill sequences, and proper consume of active battle skill on ultimate cast.
- Combo activation windows properly split when a combo skill's cooldown ends between two trigger windows, preventing a single merged window from incorrectly allowing multiple combos.
- Right-click marquee selection now works on the canvas — right-dragging selects events, and right-clicking without dragging opens the context menu as before.
- Segment-level skill disabling added. Statuses can disable individual segments of a skill rather than the entire skill, with disabled segments greyed out in the context menu.

## 2026-04-02
- Skills with variable parameters (like number of enemies hit) show inline buttons in the context menu — pick ×1, ×2, ×3, etc. when placing the skill, and damage calculations adjust accordingly.
- Shield system added. Operators with shield-granting abilities now show absorptive barriers that soak incoming damage before HP is reduced.
- HP threshold triggers work correctly. Talents and statuses that activate when HP drops below a percentage (e.g. "below 50% HP") fire reliably during combat simulation.
- Right-clicking a combo activation window opens the combo skill's add menu directly, so you don't need to find the combo column separately.
- Enemy action events appear on the timeline canvas alongside player skill events.
- Full data reconciliation pass across all 26 operators, 20 gear sets, consumables, and generic statuses — every config file audited and marked with a verification status.

## 2026-04-01
- Major rendering performance overhaul. The timeline now uses a dedicated canvas layer for event blocks, gridlines, and interaction highlights, drastically reducing DOM elements and improving smoothness during scrolling, zooming, and dragging.
- Segment resize handles are always visible when holding Ctrl (no longer require hovering the event first), shown as subtle boundary lines instead of glowing bars.
- Tick marks and gridlines scale smoothly across all zoom levels with consistent spacing — no more abrupt jumps between fixed zoom tiers.

## 2026-03-31
- Crit mode correctly affects damage calculations without overwriting saved crit data. Switching between Never, Always, and Expected no longer permanently mutates your per-frame crit rolls, so toggling back to Random or Manual preserves your previous results. Crit-triggered buff stacks (like MI Security gear) also accumulate frame-by-frame in all modes, producing more accurate damage numbers.
- Damage breakdown tree shows full source drill-downs for every stat. Expand ATK, HP, Crit Rate, Crit DMG, element bonuses, weaken, DMG reduction, and protection to see exactly which gear, weapon, talent, or status is contributing each value. Runtime status buff contributions (e.g. MI Security crit rate at 5 stacks) appear in the breakdown with stack count, per-stack value, and uptime probability.
- Loadout stats panel redesigned as a collapsible tree matching the damage breakdown style — HP, ATK, and Defense each expand to show base values, percentage bonuses, attribute contributions, and individual sources.
- Attribute-derived stats now calculated and displayed: STR adds HP, AGI adds Physical RES, INT adds Arts RES, WIL adds Treatment Received bonus.
- Damage sheet rows highlight the corresponding frame on the timeline when you hover, and vice versa. Clicking a damage sheet row selects that frame in the timeline and opens its detail panel.
- Skill segments display in their element's colour (e.g. Heat segments glow orange) instead of all using the operator's base colour — animation and cooldown segments keep the operator colour.
- Timeline auto-expands when you scroll near the bottom, so you no longer need to manually extend it for longer rotations. Minimum length reduced to 60 seconds for quicker setups.
- Consumable and tactical item buffs appear as status columns on the timeline, so you can see when passive item effects are active on each operator.
- Akekuri's game data fully implemented. Combo skill Flash and Dash models talent-scaled SP recovery based on Intellect, and ultimate SQUAD! ON ME! includes all frame timings and SP recovery pulses. Potentials modelled: P1 Positive Feedback (ATK +10% per SP recovery, up to 5×), P3 Committed Team Player (team ATK +10% during ultimate), P4 ultimate energy discount, P5 extended team link duration.
- Damage sheet virtualises rows — only rows visible in the scroll viewport are rendered, improving performance for long rotations with hundreds of damage frames.
- Talent and potential statuses appear as permanent columns — no need to manually add them from the context menu.

## 2026-03-30
- Shared URLs are dramatically smaller. The encoding was rebuilt from scratch using binary compression, so complex 4-operator loadouts produce much shorter links.
- Damage breakdown panel redesigned as a drill-down tree — click into skill segments to see per-frame multipliers, and expand damage bonus nodes to see individual element and stat contributions.
- Gilberta's Messenger's Song talent now applies buffs only to matching operator classes (Guard, Caster, Supporter) instead of the whole team. Strikers and other non-matching classes are properly excluded.
- New crit analysis modes. Choose between Never, Expected, Always, Random, or Manual to control how critical hits factor into damage calculations. Expected uses a probability model that accounts for crit-triggered feedback loops (e.g. weapons that gain crit rate from crit-triggered buffs) to compute realistic average damage. Random rolls crits stochastically per frame — re-roll anytime with the dice button. Manual lets you pin individual frames as crit or non-crit for precise "what if" scenarios.
- SP insufficiency zones display as red diagonal stripes, making it clearer when an operator can't afford a battle skill.
- Permanent-duration statuses (like consumable buffs active from the start) now have their own filter group in column headers.

## 2026-03-29
- Introduced an override system for event segments. You can now resize, pin, or remove individual segments and frames without losing the original skill data, so your edits survive round-trips through shared URLs.
- Combo skill activation windows support multiple skills per window — operators with multi-combo windows can queue several skills in the same activation period.
- Rossi is fully data-complete with all stat progressions, skill variants (empowered battle skill, dive/finisher attacks), crit and timing statuses, and potentials.
- Five new weapons added: Brigand's Calling, Glorious Memory, Home Longing, Lupine Scarlet, and Prominent Edge.
- Event detail panel redesigned with tabbed segment views and cleaner data cards for easier reading of complex skill breakdowns.
- Custom operator and weapon data can now be exported and imported as ZIP files for sharing custom content between browsers.
- A Community section added to the sidebar with pre-built sample loadouts. Browse read-only, or right-click to duplicate into your own collection.
- Talents that only activate on specific triggers no longer appear as permanent bars on the timeline — they now correctly spawn as individual instances when their conditions are met.

## 2026-03-28
- Status effects can trigger actions when they appear or expire, enabling mechanics like Gilberta's Gravity Field extending Lift duration while the field is active.
- Scorching Heart correctly activates when Laevatain absorbs 4 Heat Inflictions via Final Strike. Previously the absorption path didn't trigger the activation.
- Added Fragility, Sanctuary, Weakness, and Protected status types. Skills that reduce or increase damage taken by element now display correctly on the timeline.
- Element-specific Amp statuses (Heat Amp, Cryo Amp, etc.) each get their own column instead of sharing a single generic one.
- Consumable and tactical item passive effects trigger during the timeline — e.g. items that buff on skill use or apply effects at fight start.
- Talent scaling correctly resolves per talent slot. Talent 1 and Talent 2 each use their own level instead of always defaulting to Talent 1's level.
- Context menu for columns with many options (like enemy statuses) is capped in height and scrolls instead of stretching the full screen.

## 2026-03-27
- All timeline events — whether placed manually or generated by skills — go through the same processing pipeline, making behaviour more consistent and predictable.
- Freeform placement of any status or effect works identically to how skills create them — same stacking rules, same reactive triggers, same visual stack labels.
- Stack position (I, II, III, IV) is tracked at creation time for all event types, improving label accuracy.
- Chen Qianyu's Slashing Edge talent correctly triggers on Battle Skill, Combo Skill, and Ultimate individually instead of only on generic damage.
- Stagger (full break and node break) has proper status configs with correct durations and stacking behaviour.

## 2026-03-26
- Team status buffs (Link, Steel Oath, Overclocked Moment) display with proper names and stack labels (I, II, III, IV) instead of raw IDs. Different team statuses no longer interfere with each other when overlapping — stackable statuses like Link overlap freely; RESET statuses correctly replace the previous instance.
- Pogranichnik's Ultimate generates 5 Steel Oath stacks, and Combo Skills consume them to summon Shieldguard Harass attacks on the enemy.
- Susceptibility status effects display on the enemy timeline. Skills that increase elemental damage taken show their element and rate.
- Ardelia's full kit is now supported. Dolly Rush consumes Corrosion stacks, Eruption Column applies Corrosion, Wooly Party has complete frame data including P3 bonus frames. The empowered battle skill variant is embedded in the base skill, activated by Friendly Presence talent conditions.
- Freeform events (manually placed inflictions, reactions, statuses) trigger the same reactive effects as engine-created ones.

## 2026-03-25
- Forced reactions (like Wulfgard's Ultimate applying Combustion or Ardelia's Combo applying Corrosion) are now expressed cleanly in the data and process correctly through the unified pipeline.
- Potential-gated effects (like Antal's Empowered Focus at P5) use the standard condition system instead of a special-case filter.
- Link (team buff from Ultimates) correctly routes to the shared team status column and consumption works properly.
- Comprehensive data reconciliation across 18 operators. Every skill, talent, potential, and status was cross-referenced against in-game wiki descriptions to catch and fix errors — fixed combo trigger conditions for Alesh, Ember, Fluorite, Avywenna, Catcher, Lifeng, Tangtang, and Xaihi; SP recovery / return behaviour for Snowshine, Last Rite, Endministrator, Estella, and Catcher; baked potential effects into skills for all 18 operators; added missing skill effects (Ember combo heals controlled operator; Yvonne battle skill consumes infliction stacks and applies Solidification; Arclight empowered battle skill deals damage; Tangtang battle skill shooting damage); corrected values (Fluorite ult cost 80→100 post-patch, Yvonne ult cost 220, multiple combo cooldowns); added missing damage frames (Yvonne Flashfreezer + ult, Arclight BA sequence 4 + empowered BS, Catcher combo sequence 1); fixed talent effects (Perlica Obliteration Protocol stagger detection, Avywenna Tactful Approach Electric Susceptibility, Tangtang Riot Bringer DMG Dealt buff); and more.

## 2026-03-24
- Combo skills can be triggered by physical statuses (Lift, Breach, Knock Down, Crush) in addition to elemental inflictions. Antal's combo correctly activates when an ally applies Lift to an enemy with Focus.
- Status triggers cascade. When a triggered status creates another status, any triggers watching for that second status also fire, up to a safety depth limit.
- Conditional physical status effects on skill frames execute properly. Skills that apply Lift, Knock Down, etc. based on conditions work correctly.
- Variant activation checks (enhanced / empowered skills) use the full condition evaluator, supporting richer conditions beyond just "ultimate is active".
- Added a Performance setting (High / Balanced / Low) to control drag responsiveness vs CPU trade-off. Dragging events is significantly smoother overall, and the damage sheet no longer re-renders when moving the mouse.

## 2026-03-23
- Skill descriptions, icons, and element types added for every operator. Basic attacks, battle skills, combos, ultimates, and talents all show their in-game info. Potentials and talents have complete descriptions and icons too.
- Link buff consumption works correctly — Battle Skills and Ultimates consume the buff; basic attacks and combos ignore it.
- Akekuri's Squad! On Me! includes SP recovery and applies Link to the team.
- Content browser expanded with detailed skill breakdowns, segment viewer, and talent icons.

## 2026-03-22
- Empowered skill variants show as disabled until their activation condition is met.
- Arts Amp tracked per element type instead of a single shared column.
- Content browser with inline editing, event viewer, and status editor.
- Human-readable effect descriptions replace raw data display.
- Localization framework added for future multi-language support.
- Damage sheet fold modes and marquee row selection.
- Healing tracking with overheal calculations.
- Probability-based status effects supported.
- Ultimate active segments show their skill name.

## 2026-03-21
- Enemy HP tracking. Cumulative damage dealt to the boss enables HP-threshold conditions.
- Status effect values can use math expressions combining stats, stacks, and skill levels.
- Status effects can check which operator is currently controlled.
- Redesigned clause and expression editors with compact form layouts.

## 2026-03-20
- Status effects added for Akekuri, Chen Qianyu, Da Pan, Ember, Estella, Gilberta, Lifeng, and Snowshine.
- Status triggers from skills, weapons, and gear fire more reliably.
- Updated skill data for all 24 operators with more accurate frame timings.

## 2026-03-19
- Crit simulation mode with randomised per-hit rolls alongside always/never/expected modes.
- Cumulative damage tracking for ramping skills like Smouldering Fire's DoT.
- Physical statuses (Lift, Breach, Crush, Shatter) tracked separately from arts reactions.
- Operator editor redesigned with skills grouped by type in a flat layout.
- Gear browser added to the customizer.

## 2026-03-18
- Freeform mode. Manually place inflictions and reactions on the enemy timeline.
- Unified customizer. Edit all custom content from a single sidebar panel.
- Combat sheet overhaul with configurable columns and visibility toggles.
- Loadout editing moved to the side panel with splash art previews and filters.
- Ultimate energy tracking improved with a dual-pool SP model.

## 2026-03-16
- Weapon skills and gear set bonuses respond to fight conditions.
- Gilberta added with full talent support.
- Shorter sharing links.
- Improved multi-phase status calculations (like Corrosion decay).

## 2026-03-15
- Rebranded to Endfield: Zero Sanity Simulations with new logo and domain.
- Tangtang added as a new operator.
- Custom content system expanded with skill linking and shared content browsing.
- Stagger timeline tracks enemy stagger buildup.
- Horizontal timeline mode with touch controls.
- Light/dark theme toggle, starred operators, improved mobile support.
- Antal and Ardelia skill data expanded with full frame timing.

## 2026-03-14
- All game data now loads from JSON files instead of being hardcoded.
- Custom content system — create and share operators, weapons, and gear sets.
- Content browser UI for managing custom items.

## 2026-03-13
- Skills can have activation conditions checked before use.
- Events and skill segments can have custom names.

## 2026-03-12
- Damage numbers account for arts reactions with proper defense and resistance.
- More enemy status effects supported: Crit Stacks, Weaken, DMG Reduction, Protection.
- Gear and weapon data expanded.

## 2026-03-11
- Damage table factors in stagger, susceptibility, link, and arts amplification in real time.
- Stagger timeline shows the enemy's stagger meter.
- Events snap to valid positions when dragged near time-stops.
- Weapon skill system with stat bonuses and passive effects.
- Loadout sidebar with tree-based session management.

## 2026-03-10
- Ultimate gauge tracks charge and drain in real time.
- Potential affects ultimate charge cost (e.g. P4 = 15% cheaper).
- Combo skill availability highlighted on the timeline.
- Ardelia's full skill kit added.
- Undo/redo covers equipment and stat changes.
- Battle skills consume SP, with SP return reducing ultimate gauge gain.
- Session sidebar with folders, export/import.

## 2026-03-09
- Ctrl+D duplicates selected events with ghost preview.
- Status subtimelines for team buffs and enemy effects.
- Batch event move preserves relative timing.
- Damage table with per-tick breakdowns.
- 18 new operators added.

## 2026-03-08
- Damage calculation pipeline with per-frame accuracy.
- Skill point economy (200 SP pool, 8 SP/s regen).
- Resource graphs with hover values.
- Ultimate energy timeline.
- Save/export/import sheets.
- Marquee select and combo activation windows.

## 2026-03-07
- Initial game data, operator/gear/weapon models.
- Timeline interactions (drag, right-click, undo/redo).
- GitHub Pages deployment.

## 2026-03-06
- Project started.
