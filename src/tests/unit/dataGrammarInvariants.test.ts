/**
 * Data grammar invariants — walk every JSON under `src/model/game-data/` and
 * pin three shape rules the DSL migration relied on:
 *
 *   1. `"object": "INFLICTION"` and `"object": "REACTION"` are never allowed
 *      anywhere. Inflictions and reactions are objectIds under `object: STATUS`.
 *   2. Status defs (files with segments or any onX-Clause) never carry a
 *      root-level `clause` key — clauses live on segments.
 *   3. Status defs never carry a root-level `clauseType` key — per-bucket
 *      evaluation modes are `onTriggerClauseType` / `onEntryClauseType` /
 *      `onExitClauseType`, and segment-level `clauseType` is allowed on
 *      segments themselves (not the status root).
 *
 * Failures emit the full list of offending file paths so a future violator can
 * find the regression in one jump.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NounType } from '../../dsl/semantics';

const GAME_DATA_ROOT = path.resolve(__dirname, '../../model/game-data');

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

const ALL_JSON_FILES = collectJsonFiles(GAME_DATA_ROOT);

/** Parse JSON once per file. `null` means the file didn't parse — skipped here. */
const PARSED: Array<{ file: string; json: unknown }> = ALL_JSON_FILES.map(file => {
  const raw = fs.readFileSync(file, 'utf8');
  return { file, json: JSON.parse(raw) };
});

/** Walk a parsed value and invoke `visit` on every plain object encountered. */
function walkObjects(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkObjects(item, visit);
    return;
  }
  const obj = node as Record<string, unknown>;
  visit(obj);
  for (const key of Object.keys(obj)) walkObjects(obj[key], visit);
}

/** Relative path for readable error output. */
function rel(file: string): string {
  return path.relative(GAME_DATA_ROOT, file);
}

describe('data grammar invariants', () => {
  test('no JSON uses object: INFLICTION or object: REACTION anywhere', () => {
    const offenders: string[] = [];
    for (const { file, json } of PARSED) {
      let offends = false;
      walkObjects(json, obj => {
        if (offends) return;
        if (obj.object === NounType.INFLICTION || obj.object === NounType.REACTION) {
          offends = true;
        }
      });
      if (offends) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  test('status defs have no root-level "clause" key (clauses live on segments)', () => {
    const offenders: string[] = [];
    for (const { file, json } of PARSED) {
      if (!json || typeof json !== 'object' || Array.isArray(json)) continue;
      const root = json as Record<string, unknown>;
      const isStatusDef = 'onTriggerClause' in root
        || 'onEntryClause' in root
        || 'onExitClause' in root
        || 'segments' in root;
      if (!isStatusDef) continue;
      if ('clause' in root) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  test('status defs have no root-level "clauseType" key (use onX-ClauseType)', () => {
    const offenders: string[] = [];
    for (const { file, json } of PARSED) {
      if (!json || typeof json !== 'object' || Array.isArray(json)) continue;
      const root = json as Record<string, unknown>;
      const isStatusDef = 'onTriggerClause' in root
        || 'onEntryClause' in root
        || 'onExitClause' in root
        || 'segments' in root;
      if (!isStatusDef) continue;
      if ('clauseType' in root) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });
});
