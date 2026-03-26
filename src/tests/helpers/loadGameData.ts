/**
 * Test helpers for loading game data from the per-item directory structure.
 *
 * The game data was restructured from monolithic keyed-object files into
 * individual files per skill/status/talent. These helpers reconstruct the
 * old keyed-object or array shapes that test code expects.
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import * as path from 'path';
import * as fs from 'fs';

const GAME_DATA_ROOT = path.resolve(__dirname, '../../model/game-data');

// Build JSON-ID → directory-name map by scanning each operator directory for a JSON with an `id` field.
const _idToDirMap = new Map<string, string>();
for (const entry of fs.readdirSync(path.join(GAME_DATA_ROOT, 'operators'), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'generic') continue;
  const dirPath = path.join(GAME_DATA_ROOT, 'operators', entry.name);
  for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8'));
    if (typeof j.id === 'string') { _idToDirMap.set(j.id, entry.name); break; }
  }
}

/** Resolve operator ID to directory name. Accepts both JSON IDs and directory names. */
function resolveDir(operatorId: string): string {
  return _idToDirMap.get(operatorId) ?? operatorId;
}

// ── Operator Skills ─────────────────────────────────────────────────────────

/**
 * Load all skill JSON files for an operator and reconstruct the old
 * keyed-object format: `{ SKILL_ID: skillData, ... }`.
 */
export function loadSkillsJson(operatorId: string): Record<string, any> {
  const dir = path.join(GAME_DATA_ROOT, 'operators', resolveDir(operatorId), 'skills');
  const obj: Record<string, any> = {};
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const skill = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const id = skill.properties?.id;
    if (id) obj[id] = skill;
  }
  return obj;
}

/**
 * Load a single skill by its ID from an operator's skills directory.
 */
export function loadSkillById(operatorId: string, skillId: string): any {
  const skills = loadSkillsJson(operatorId);
  return skills[skillId];
}

// ── Operator Statuses + Talents ─────────────────────────────────────────────

/**
 * Load all status and talent JSON files for an operator and reconstruct
 * the old array format: `[statusData, ...]`.
 */
export function loadStatusesJson(operatorId: string): any[] {
  const arr: any[] = [];
  for (const subdir of ['statuses', 'talents']) {
    const dir = path.join(GAME_DATA_ROOT, 'operators', resolveDir(operatorId), subdir);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      arr.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
    }
  }
  return arr;
}

// ── Weapon Skills (Generic) ─────────────────────────────────────────────────

/**
 * Load all generic weapon skills and reconstruct the old keyed-object format.
 */
export function loadGenericWeaponSkills(): Record<string, any> {
  const dir = path.join(GAME_DATA_ROOT, 'weapons', 'generic');
  const obj: Record<string, any> = {};
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const skill = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const id = skill.properties?.id;
    if (id) obj[id] = skill;
  }
  return obj;
}

// ── Weapon Named Skills ─────────────────────────────────────────────────────

/**
 * Load a named weapon's skill file(s) from the new per-weapon directory.
 * Returns the single skill object (old format was a single-object file).
 */
export function loadWeaponNamedSkills(weaponSlug: string): any {
  const dir = path.join(GAME_DATA_ROOT, 'weapons', weaponSlug, 'skills');
  if (!fs.existsSync(dir)) return undefined;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length === 1) {
    return JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  }
  // Multiple skills — return first (named weapons typically have one skill)
  if (files.length > 0) {
    return JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  }
  return undefined;
}

// ── Weapon Statuses (formerly weapon-effects) ───────────────────────────────

/**
 * Load weapon status/effect files from the new per-weapon directory.
 * Reconstructs the old `{ weaponName, statusEvents: [...] }` format.
 *
 * In the old format, each statusEvent had both `onTriggerClause` and
 * `clause`/`properties` merged together. In the new structure:
 * - Weapon skills (`skills/`) may have `onTriggerClause` that reference
 *   status IDs via `objectId`.
 * - Weapon statuses (`statuses/`) have the effect `clause` + `properties`.
 *
 * This function merges them back: for each status, if a skill references
 * it via `objectId`, the skill's `onTriggerClause` is injected into the
 * status entry.
 */
export function loadWeaponEffects(weaponSlug: string): { weaponName: string; statusEvents: any[] } {
  const baseFile = path.join(GAME_DATA_ROOT, 'weapons', weaponSlug, `${weaponSlug}.json`);
  const baseJson = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
  const weaponName = baseJson.properties?.name ?? weaponSlug;

  // Load status definitions
  const statusDir = path.join(GAME_DATA_ROOT, 'weapons', weaponSlug, 'statuses');
  const statusById: Record<string, any> = {};
  if (fs.existsSync(statusDir)) {
    for (const file of fs.readdirSync(statusDir).filter(f => f.endsWith('.json'))) {
      const status = JSON.parse(fs.readFileSync(path.join(statusDir, file), 'utf8'));
      const id = status.properties?.id;
      if (id) statusById[id] = status;
    }
  }

  // Load skill files that have onTriggerClause and merge into matching statuses
  const skillDir = path.join(GAME_DATA_ROOT, 'weapons', weaponSlug, 'skills');
  if (fs.existsSync(skillDir)) {
    for (const file of fs.readdirSync(skillDir).filter(f => f.endsWith('.json'))) {
      const skill = JSON.parse(fs.readFileSync(path.join(skillDir, file), 'utf8'));
      if (!skill.onTriggerClause) continue;
      // Find referenced status IDs in trigger effects
      for (const clause of skill.onTriggerClause) {
        for (const effect of clause.effects ?? []) {
          const targetId = effect.objectId;
          if (targetId && statusById[targetId]) {
            statusById[targetId].onTriggerClause = skill.onTriggerClause;
          }
        }
      }
    }
  }

  return { weaponName, statusEvents: Object.values(statusById) };
}

// ── Gear Pieces ─────────────────────────────────────────────────────────────

/**
 * Load all gear pieces for a gear set and reconstruct the old array format.
 */
export function loadGearPieces(gearSetSlug: string): any[] {
  const dir = path.join(GAME_DATA_ROOT, 'gears', gearSetSlug, 'pieces');
  const arr: any[] = [];
  if (!fs.existsSync(dir)) return arr;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    arr.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
  }
  return arr;
}

// ── Gear Statuses ───────────────────────────────────────────────────────────

/**
 * Load gear statuses for a gear set.
 * Returns `{ gearSetType, statusEvents: [...] }` matching the old format.
 *
 * In the new structure:
 * - `gears/{set}/{set}.json` = gear set effect (has `onTriggerClause`)
 * - `gears/{set}/statuses/status-*.json` = individual status definitions
 *
 * This function merges them: the gear set effect's `onTriggerClause` is
 * injected into status entries whose `id` matches the `objectId` in the
 * trigger effects.
 */
export function loadGearStatuses(gearSetSlug: string): { gearSetType: string; statusEvents: any[] } {
  // Load individual status definitions
  const statusDir = path.join(GAME_DATA_ROOT, 'gears', gearSetSlug, 'statuses');
  const statusById: Record<string, any> = {};
  if (fs.existsSync(statusDir)) {
    for (const file of fs.readdirSync(statusDir).filter(f => f.endsWith('.json'))) {
      const status = JSON.parse(fs.readFileSync(path.join(statusDir, file), 'utf8'));
      const id = status.properties?.id;
      if (id) statusById[id] = status;
    }
  }

  // Load gear set effect file and merge onTriggerClause into matching statuses
  const setEffectFile = path.join(GAME_DATA_ROOT, 'gears', gearSetSlug, `${gearSetSlug}.json`);
  if (fs.existsSync(setEffectFile)) {
    const setEffect = JSON.parse(fs.readFileSync(setEffectFile, 'utf8'));
    if (setEffect.onTriggerClause) {
      for (const clause of setEffect.onTriggerClause) {
        for (const effect of clause.effects ?? []) {
          const targetId = effect.objectId;
          if (targetId && statusById[targetId]) {
            statusById[targetId].onTriggerClause = setEffect.onTriggerClause;
          }
        }
      }
    }
  }

  return { gearSetType: gearSetSlug, statusEvents: Object.values(statusById) };
}
