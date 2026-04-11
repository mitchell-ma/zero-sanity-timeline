# Catcher — Skill & Status Coverage

4-star Defender | Physical | Great Sword | STR main / WILL secondary | **VERIFIED**

## Basic Attack: Basic Tactics (Rigid Interdiction Basic)
- 4-segment physical chain + Dive + Finisher variants
- Per-segment DEAL PHYSICAL DAMAGE; final segment RECOVER SKILL_POINT and DEAL STAGGER 22
- Finisher variant: Physical DMG `[4.0 → 9.0]`
- Dive variant: Physical DMG `[0.80 → 1.80]`

## Battle Skill: Rigid Interdiction (100 SP)
- Single 3.17 s active frame at offset 0 applies:
  - APPLY STATUS PROTECTION (0.9) to **ALL OPERATOR** (per-slot, not team), duration matches BS segment (3.17 s, not generic 5 s)
  - RECOVER SKILL_POINT 30 to THIS OPERATOR
  - APPLY STATUS `RIGID_INTERDICTION_RETALIATION` to THIS OPERATOR (3.17 s window)
- **Retaliation status** (`RIGID_INTERDICTION_RETALIATION`): `onTriggerClause` fires an inner `RIGID_INTERDICTION_RETALIATION_BURST` status event each time `ENEMY DEAL DAMAGE to THIS OPERATOR`.
- **Retaliation burst** (`RIGID_INTERDICTION_RETALIATION_BURST`, 0.2 s segment):
  - Frame 0: DEAL STAGGER 20, APPLY VULNERABLE (1 stack), DEAL PHYSICAL DAMAGE `[1.78 → 4.0] × ATK`
  - Frame 0 (P1+): DEAL PHYSICAL DAMAGE `(300 + 5 × BASE_DEFENSE) × DEFENSE` (DEF-scaling bonus)
  - Frame 0 (P5+): RETURN SKILL_POINT 10
  - Frame 1 @0.1s (P1+): additional DEAL PHYSICAL DAMAGE `[1.78 → 4.0] × ATK` (split 0.1 s after primary)
- Carries `properties.element = PHYSICAL` for diamond coloring.

## Combo Skill: Timely Suppression
- **Activation window (dual-predicate, ANY):**
  - `ENEMY PERFORM STATUS CHARGE`, **OR**
  - `ENEMY DEAL DAMAGE to CONTROLLED OPERATOR` AND `CONTROLLED OPERATOR HAVE PERCENTAGE_HP ≤ 40`
- Animation segment is TIME_STOP (0.5 s)
- Active frame @0.07s:
  - DEAL STAGGER 10
  - DEAL PHYSICAL DAMAGE `[1.0 → 2.25]`
  - APPLY STATUS SHIELD to **ALL OPERATOR** (per-slot, 4 separate events). Shield value = `ADD(base[VARY_BY SL], MULT(defAdditive[VARY_BY SL], DEFENSE))`. Duration = `10 + VARY_BY POTENTIAL [0,0,0,5,5,5]` (P3 bake-in).
- Cooldown segment `VARY_BY SKILL_LEVEL [35×11, 33]`

## Ultimate: Textbook Assault (`VARY_BY POTENTIAL [80,80,80,80,72,72]` UE)

Four segments: **Animation** (1.3 s, TIME_STOP) → **Slash I** (0.83 s) → **Slash II** (0.7 s) → **Final Slam** (0.67 s). Frame offsets are relative to their own segment.

| Segment | Offset | Content | Gate |
|---|---|---|---|
| Slash I | 0.23 s | STAGGER 5, Physical DMG `[0.89 → 2.0]`, APPLY STATUS WEAKNESS with `multiplier = SUB(1, [0.2…0.3] by SL)`, 8 s | always |
| Slash I | 0.33 s | Physical DMG `(300 + 5 × BASE_DEFENSE) × DEFENSE` | P1+ |
| Slash II | 0 s | STAGGER 5, Physical DMG `[1.2 → 2.7]` | always |
| Slash II | 0.1 s | DEF-scaling bonus (same formula) | P1+ |
| Final Slam | 0 s | STAGGER 10, APPLY KNOCK_DOWN, Physical DMG `[1.78 → 4.0]` | always |
| Final Slam | 0.1 s | DEF-scaling bonus | P1+ |
| Final Slam | 0.2 s | T2 shockwave #1 Physical DMG `[0.3, 0.45] × ATK` | T1 ≥ 1 |
| Final Slam | 0.3 s | T2 shockwave #2 | T1 ≥ 1 |
| Final Slam | 0.4 s | T2 shockwave #3 | T1 ≥ 2 |

Segments carry `properties.element = PHYSICAL`; the element propagates onto frames that don't specify their own, so diamonds color correctly.

## Statuses

| ID | Type | Source | Effect |
|---|---|---|---|
| RIGID_INTERDICTION_RETALIATION | SKILL_STATUS | BS | 3.17 s retaliation window; onTrigger fires `RIGID_INTERDICTION_RETALIATION_BURST` per enemy hit. Element PHYSICAL. |
| RIGID_INTERDICTION_RETALIATION_BURST | SKILL_STATUS | BS retaliation | Single-hit burst: stagger, vulnerable, Physical DMG (+ P1 DEF bonus at 0 and at 0.1 s, + P5 SP return). Element PHYSICAL. |
| RESILIENT_DEFENSE_TALENT | TALENT | T1 | Passive: APPLY STAT BASE_DEFENSE = `MULT(INTEGER_DIV(WILL, 10), 1.2)` to this operator (loadout aggregator path) |
| COMPREHENSIVE_MINDSET_TALENT | TALENT | T2 | Description-only — shockwaves are baked directly into Ult Final Slam |

## Potentials

| P | Name | Implementation |
|---|---|---|
| P1 | Multi-layered Readiness | Baked into BS retaliation burst (P1+ extra DEF bonus + 0.1 s-delayed additional strike) and Ult (P1+ DEF bonus frame at +0.1 s after each slash/slam) |
| P2 | Bonus Spec Training | `APPLY STAT` clause: DEF +20, WILL +10 |
| P3 | Unwavering Post | Baked into CS SHIELD duration via `VARY_BY POTENTIAL` offset |
| P4 | Compensated Suffering | Baked into Ult `CONSUME ULTIMATE_ENERGY` via `VARY_BY POTENTIAL` |
| P5 | Choice Without Regrets | Baked into retaliation burst: `RETURN SKILL_POINT 10` gated on `HAVE POTENTIAL ≥ 5` |

## Talents

| Slot | Level 1 | Level 2 |
|---|---|---|
| Forged (passive attr) | STR +10/+15/+15/+20 per promotion | — |
| T1 Resilient Defense | DEF `+1.0 per 10 WILL` (wiki) | DEF `+1.2 per 10 WILL` — implemented as constant 1.2 × `floor(WILL/10)` since T1 L2 is the canonical value |
| T2 Comprehensive Mindset | Final hit → 2 shockwaves, 30% ATK Physical DMG | 3 shockwaves, 45% ATK Physical DMG |

## Test coverage — `src/tests/integration/operators/catcher/skills.test.ts` (35 passing)

- **A.** Core placement (BS/CS/Ult)
- **B.** BS shield window setup — PROTECTION per-slot, 3.17 s duration (not generic 5 s), retaliation status on Catcher
- **C.** BS retaliation fan-out — enemy attack inside window → VULNERABLE + Physical DMG
- **D.** BS P5 SP return — RETURN SKILL_POINT clause gated on POTENTIAL ≥ 5
- **E.** CS SHIELD applied via `toDeterminer: ALL` (single DSL effect → 4 per-operator events)
- **F.** CS activation window — CHARGE enemy action opens CS menu; placed CHARGE event is draggable; CS disabled outside window
- **G.** Ult frame layout — UE cost per potential; T1/P-gated frame skips; 4-segment split verified
- **G4.** Segment structure assertion: Animation + Slash I + Slash II + Final Slam; frame offsets as in table above
- **H.** Ult Final Slam KNOCK_DOWN and Slash I WEAKNESS application
- **I.** T1 Will-based DEF formula in the talent file and as a passive event on Catcher
- **J.** View layer — BS/Ult/retaliation visible in their column view models
