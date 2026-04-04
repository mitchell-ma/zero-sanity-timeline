/**
 * Data status integrity — verified operators
 *
 * Ensures every JSON file under verified operator directories has
 * metadata.dataStatus === "VERIFIED". Catches cases where a file
 * is added or regenerated without the VERIFIED tag.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DataStatus } from '../../consts/enums';

const GAME_DATA_ROOT = path.resolve(__dirname, '../../model/game-data');

/** Operator directory names that must be fully VERIFIED. */
const VERIFIED_OPERATORS = [
  'laevatain',
  'antal',
  'rossi',
  'akekuri',
  'ardelia',
  'ember',
  'xaihi',
];

function walkJson(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkJson(full));
    else if (entry.name.endsWith('.json')) results.push(full);
  }
  return results;
}

describe('dataStatus — verified operators', () => {
  for (const op of VERIFIED_OPERATORS) {
    const opDir = path.join(GAME_DATA_ROOT, 'operators', op);

    it(`all ${op} files are VERIFIED`, () => {
      const files = walkJson(opDir);
      expect(files.length).toBeGreaterThan(0);

      const missing: string[] = [];
      for (const f of files) {
        const json = JSON.parse(fs.readFileSync(f, 'utf8'));
        const status = json.metadata?.dataStatus;
        if (status !== DataStatus.VERIFIED) {
          missing.push(`${path.relative(GAME_DATA_ROOT, f)} — got ${status ?? 'undefined'}`);
        }
      }

      if (missing.length > 0) {
        throw new Error(
          `${missing.length} file(s) under operators/${op}/ are not VERIFIED:\n  ${missing.join('\n  ')}`,
        );
      }
    });
  }
});
