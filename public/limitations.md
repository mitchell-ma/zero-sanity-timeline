# Known Limitations

## Damage Calculation — ±1 Rounding Variance

Calculated damage values may differ from in-game values by ±1 on individual hits. This affects roughly 3 out of every 11 ticks on ramping skills (e.g. Smouldering Fire), and occasionally on other skills.

**Cause:** The game engine (Unity/C#) and our calculator (JavaScript) accumulate floating point intermediates differently. The game's internal effective ATK value is ~0.01% higher than ours, which pushes a few borderline values across the rounding threshold.

We tested every combination of intermediate rounding (floor/round/ceil on total ATK, effective ATK, and final damage) — no single strategy matches all in-game values exactly. The gap is inherent to float precision differences between engines.

**Impact:** Negligible. Over a full rotation, the cumulative error is effectively zero.
