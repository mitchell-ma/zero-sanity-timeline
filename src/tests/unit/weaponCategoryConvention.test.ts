/**
 * Weapon category convention — every JSON under
 * `src/model/game-data/weapons/<name>/skills/*.json` must declare
 * `properties.eventCategoryType === NounType.WEAPON_STAT`, and every JSON
 * under `src/model/game-data/weapons/<name>/statuses/*.json` must declare
 * `properties.eventCategoryType === NounType.WEAPON`.
 *
 * Top-level weapon files (`weapons/<name>/<name>.json`) carry no category —
 * skipped.
 *
 * Failures emit the full list of offending file paths so a drift is easy to
 * locate and fix.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NounType } from '../../dsl/semantics';

const WEAPONS_ROOT = path.resolve(__dirname, '../../model/game-data/weapons');

/** Recursively collect every `.json` file under `dir`. */
function collectJsonFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

const ALL_WEAPON_FILES = collectJsonFiles(WEAPONS_ROOT);

/** Posix-style relative path so the regex matches across platforms. */
function relPosix(file: string): string {
  return path.relative(WEAPONS_ROOT, file).split(path.sep).join('/');
}

/** Does `file` live at `weapons/<name>/skills/<anything>.json`? */
function isWeaponSkillPath(file: string): boolean {
  return /^[^/]+\/skills\/[^/]+\.json$/.test(relPosix(file));
}

/** Does `file` live at `weapons/<name>/statuses/<anything>.json`? */
function isWeaponStatusPath(file: string): boolean {
  return /^[^/]+\/statuses\/[^/]+\.json$/.test(relPosix(file));
}

/** Parse once; surface a clear error if a weapon file is malformed. */
function loadProps(file: string): Record<string, unknown> | undefined {
  const raw = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(raw) as unknown;
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined;
  const props = (json as Record<string, unknown>).properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
  return props as Record<string, unknown>;
}

describe('weapon category convention', () => {
  test('weapons/*/skills/*.json declare eventCategoryType=WEAPON_STAT', () => {
    const offenders: string[] = [];
    for (const file of ALL_WEAPON_FILES) {
      if (!isWeaponSkillPath(file)) continue;
      const props = loadProps(file);
      const got = props?.eventCategoryType;
      if (got !== NounType.WEAPON_STAT) {
        offenders.push(`${relPosix(file)} (got: ${JSON.stringify(got)})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('weapons/*/statuses/*.json declare eventCategoryType=WEAPON', () => {
    const offenders: string[] = [];
    for (const file of ALL_WEAPON_FILES) {
      if (!isWeaponStatusPath(file)) continue;
      const props = loadProps(file);
      const got = props?.eventCategoryType;
      if (got !== NounType.WEAPON) {
        offenders.push(`${relPosix(file)} (got: ${JSON.stringify(got)})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
