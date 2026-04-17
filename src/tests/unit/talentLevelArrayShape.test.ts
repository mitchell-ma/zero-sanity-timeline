/**
 * TALENT_LEVEL VARY_BY array shape audit.
 *
 * The condition/value resolvers index `VARY_BY TALENT_LEVEL` arrays as
 * zero-based: index 0 is talent level 0 (no benefit), index N is talent level N.
 * For an unlock-gated talent with maxLevel=N, the array must have length N+1
 * with index 0 holding the neutral value (0 for additive bonuses, 1 for
 * multiplicative ones).
 *
 * A length-2 array on a maxLevel=2 talent silently grants L1 benefits at talent
 * level 0 — see `feedback_talent_levels_zero_indexed.md`.
 *
 * This test walks every operator JSON, finds every VARY_BY TALENT_LEVEL node,
 * and asserts that each array's length matches one of the operator's talent
 * maxLevels (+1). Files in the known-ambiguous list need wiki data to fill in
 * missing L0/Lmax entries; they're skipped here with a TODO comment.
 */

import * as fs from 'fs';
import * as path from 'path';
import { VerbType, NounType } from '../../dsl/semantics';

const GAME_DATA_ROOT = path.resolve(__dirname, '../../model/game-data');
const OPERATORS_DIR = path.join(GAME_DATA_ROOT, 'operators');

/**
 * Files where the VARY_BY TALENT_LEVEL array shape is incorrect AND we don't
 * yet have the wiki data needed to fix them. Each entry should reference an
 * issue/TODO in `docs/todo.md` that documents the missing values.
 */
const KNOWN_AMBIGUOUS = new Set<string>([
  // maxLevel=3, current array [10,15,20] length 3 — needs L0 + L1 + L2 + L3 (length 4)
  'laevatain/statuses/status-scorching-heart.json',
  // maxLevel=2, current array [0, 0.5] length 2 — leading 0 OK but missing L2 value
  'yvonne/statuses/status-barrage-of-technology.json',
  // maxLevel=3, currently [63,63,63] — should be condition-gated constant or length-4 array
  'ardelia/talents/talent-friendly-presence-talent.json',
  // maxLevel=3, currently [45,63,90] and [0.38,0.53,0.75] — needs L0/L1/L2/L3
  'ardelia/skills/action-mr-dolly-shadow.json',
]);

interface VaryByMatch {
  filePath: string;
  array: number[];
  jsonPath: string;
}

/** Recursively walk every JSON file under a directory. */
function walkJson(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkJson(full));
    else if (entry.name.endsWith('.json')) results.push(full);
  }
  return results;
}

/** Recursively find every `{ verb: "VARY_BY", object: "TALENT_LEVEL", value: [...] }` node. */
function findTalentLevelArrays(node: unknown, jsonPath: string, out: VaryByMatch[], filePath: string): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => findTalentLevelArrays(item, `${jsonPath}[${i}]`, out, filePath));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (obj.verb === VerbType.VARY_BY && obj.object === NounType.TALENT_LEVEL && Array.isArray(obj.value)) {
    out.push({ filePath, array: obj.value as number[], jsonPath });
  }
  for (const [k, v] of Object.entries(obj)) {
    findTalentLevelArrays(v, `${jsonPath}.${k}`, out, filePath);
  }
}

/** Resolve `properties.maxLevel.value` from a talent JSON, or undefined if not set. */
function readTalentMaxLevel(talentFilePath: string): number | undefined {
  const json = JSON.parse(fs.readFileSync(talentFilePath, 'utf8'));
  const ml = json.properties?.maxLevel;
  if (typeof ml === 'number') return ml;
  if (ml && typeof ml === 'object' && typeof ml.value === 'number') return ml.value;
  return undefined;
}

/** For an operator dir, return [maxLevelTalentOne, maxLevelTalentTwo]. */
function getOperatorTalentMaxLevels(opDir: string): number[] {
  const talentsDir = path.join(opDir, 'talents');
  if (!fs.existsSync(talentsDir)) return [];
  const levels: number[] = [];
  for (const entry of fs.readdirSync(talentsDir)) {
    if (!entry.endsWith('.json')) continue;
    const ml = readTalentMaxLevel(path.join(talentsDir, entry));
    if (ml != null) levels.push(ml);
  }
  return levels;
}

describe('VARY_BY TALENT_LEVEL array shape', () => {
  const operators = fs.readdirSync(OPERATORS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const op of operators) {
    const opDir = path.join(OPERATORS_DIR, op);

    it(`${op} — every TALENT_LEVEL array length matches a talent maxLevel + 1`, () => {
      const talentMaxLevels = getOperatorTalentMaxLevels(opDir);
      // Allowed lengths = (any talent maxLevel) + 1. If an operator has talents
      // with different maxLevels, either is acceptable for any given array.
      const allowedLengths = new Set(talentMaxLevels.map((ml) => ml + 1));

      const files = walkJson(opDir);
      const violations: string[] = [];
      for (const f of files) {
        const rel = path.relative(OPERATORS_DIR, f);
        if (KNOWN_AMBIGUOUS.has(rel)) continue;

        const json = JSON.parse(fs.readFileSync(f, 'utf8'));
        const matches: VaryByMatch[] = [];
        findTalentLevelArrays(json, '', matches, rel);

        for (const m of matches) {
          if (allowedLengths.size === 0) {
            violations.push(`${rel}${m.jsonPath}: TALENT_LEVEL array present but operator has no talent maxLevel — array=[${m.array.join(',')}]`);
            continue;
          }
          if (!allowedLengths.has(m.array.length)) {
            const allowedStr = Array.from(allowedLengths).sort().join(' or ');
            violations.push(`${rel}${m.jsonPath}: array length ${m.array.length} (allowed: ${allowedStr}) — array=[${m.array.join(',')}]`);
          }
        }
      }

      if (violations.length > 0) {
        throw new Error(
          `TALENT_LEVEL array shape violations in ${op}:\n  ${violations.join('\n  ')}\n\n`
          + 'Arrays must be zero-indexed with length = talent maxLevel + 1. '
          + 'See feedback_talent_levels_zero_indexed.md.',
        );
      }
    });
  }
});
