/**
 * ZIP import for game data content.
 *
 * Accepts a .zip file in the game-data directory structure and imports
 * the content as custom entities. Validates JSON against store validators
 * before importing.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { loadGameDataArray, saveGameDataArray, STORAGE_KEYS } from '../../utils/customContentStorage';
import { registerCustomOperatorJson, deregisterCustomOperatorJson } from './customOperatorRegistrar';
import { registerCustomWeaponJson, deregisterCustomWeaponJson } from './customWeaponRegistrar';
import { registerCustomGearSetJson, deregisterCustomGearSetJson } from './customGearRegistrar';

type GameDataJson = Record<string, unknown>;

export interface ImportResult {
  imported: {
    operators: number;
    weapons: number;
    gearSets: number;
  };
  errors: string[];
  warnings: string[];
}

/** Import content from a ZIP file (File object from <input type="file">). */
export async function importFromZip(file: File): Promise<ImportResult> {
  const result: ImportResult = {
    imported: { operators: 0, weapons: 0, gearSets: 0 },
    errors: [],
    warnings: [],
  };

  // Read file as ArrayBuffer
  const buffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(uint8);
  } catch (e) {
    result.errors.push(`Failed to unzip file: ${e}`);
    return result;
  }

  // Check manifest
  const manifestBytes = files['manifest.json'];
  if (manifestBytes) {
    try {
      const manifest = JSON.parse(strFromU8(manifestBytes));
      if (manifest.version && !manifest.version.startsWith('2')) {
        result.warnings.push(`ZIP was exported with version ${manifest.version}, expected 2.x`);
      }
    } catch {
      result.warnings.push('Could not parse manifest.json');
    }
  }

  // ── Parse all JSON files by directory structure ─────────────────────────
  // Strip game-data/ prefix if present so paths are normalized to operators/*, weapons/*, gears/*
  const parsedFiles = new Map<string, GameDataJson>();
  for (const [rawPath, bytes] of Object.entries(files)) {
    if (!rawPath.endsWith('.json') || rawPath === 'manifest.json') continue;
    const path = rawPath.replace(/^game-data\//, '');
    try {
      parsedFiles.set(path, JSON.parse(strFromU8(bytes)));
    } catch (e) {
      result.errors.push(`Failed to parse ${path}: ${e}`);
    }
  }

  // ── Import operators ──────────────────────────────────────────────────────
  const operatorDirs = new Set<string>();
  Array.from(parsedFiles.keys()).forEach(path => {
    const match = path.match(/^operators\/([^/]+)\//);
    if (match) operatorDirs.add(match[1]);
  });

  for (const dir of Array.from(operatorDirs)) {
    // Find base operator JSON
    const baseKey = `operators/${dir}/${dir}.json`;
    const baseJson = parsedFiles.get(baseKey);
    if (!baseJson) {
      // Try to find any JSON in the operator root (not in subdirs)
      const altKey = Array.from(parsedFiles.keys()).find(
        k => k.startsWith(`operators/${dir}/`) && !k.includes('/skills/') && !k.includes('/statuses/') && !k.includes('/talents/'),
      );
      if (!altKey) {
        result.warnings.push(`operators/${dir}: no base operator JSON found`);
        continue;
      }
    }

    const opJson = baseJson ?? parsedFiles.get(Array.from(parsedFiles.keys()).find(
      k => k.startsWith(`operators/${dir}/`) && !k.includes('/skills/') && !k.includes('/statuses/') && !k.includes('/talents/'),
    )!)!;

    try {
      // Add to storage
      const existing = loadGameDataArray(STORAGE_KEYS.operators);
      const id = (opJson.id ?? '') as string;
      const existingIdx = existing.findIndex(e => (e.id as string) === id);
      if (existingIdx >= 0) {
        deregisterCustomOperatorJson(existing[existingIdx]);
        existing[existingIdx] = opJson;
        result.warnings.push(`operator "${id}": replaced existing`);
      } else {
        existing.push(opJson);
      }
      registerCustomOperatorJson(opJson);
      saveGameDataArray(STORAGE_KEYS.operators, existing);
      result.imported.operators++;
    } catch (e) {
      result.errors.push(`operator "${dir}": ${e}`);
    }
  }

  // ── Import weapons ────────────────────────────────────────────────────────
  const weaponDirs = new Set<string>();
  Array.from(parsedFiles.keys()).forEach(path => {
    const match = path.match(/^weapons\/([^/]+)\//);
    if (match) weaponDirs.add(match[1]);
  });

  for (const dir of Array.from(weaponDirs)) {
    const baseKey = `weapons/${dir}/${dir}.json`;
    const weaponJson = parsedFiles.get(baseKey);
    if (!weaponJson) {
      result.warnings.push(`weapons/${dir}: no base weapon JSON found`);
      continue;
    }

    // Collect statuses
    const statuses: GameDataJson[] = [];
    parsedFiles.forEach((json, path) => {
      if (path.startsWith(`weapons/${dir}/statuses/`)) {
        statuses.push(json);
      }
    });

    try {
      const bundle = { weapon: weaponJson, statuses };
      const existing = loadGameDataArray(STORAGE_KEYS.weapons);
      const props = (weaponJson.properties ?? {}) as GameDataJson;
      const id = (props.id ?? '') as string;

      const existingIdx = existing.findIndex(e => {
        const ep = ((e.weapon ?? e) as GameDataJson).properties as GameDataJson | undefined;
        return ep && (ep.id as string) === id;
      });

      if (existingIdx >= 0) {
        const oldBundle = existing[existingIdx] as unknown as { weapon: GameDataJson };
        deregisterCustomWeaponJson(oldBundle.weapon ?? existing[existingIdx]);
        existing[existingIdx] = bundle as unknown as GameDataJson;
        result.warnings.push(`weapon "${id}": replaced existing`);
      } else {
        existing.push(bundle as unknown as GameDataJson);
      }
      registerCustomWeaponJson(weaponJson, statuses);
      saveGameDataArray(STORAGE_KEYS.weapons, existing);
      result.imported.weapons++;
    } catch (e) {
      result.errors.push(`weapon "${dir}": ${e}`);
    }
  }

  // ── Import gear sets ──────────────────────────────────────────────────────
  const gearDirs = new Set<string>();
  Array.from(parsedFiles.keys()).forEach(path => {
    const match = path.match(/^gears\/([^/]+)\//);
    if (match) gearDirs.add(match[1]);
  });

  for (const dir of Array.from(gearDirs)) {
    const baseKey = `gears/${dir}/${dir}.json`;
    const setEffectJson = parsedFiles.get(baseKey) ?? null;

    // Collect pieces
    const pieces: GameDataJson[] = [];
    parsedFiles.forEach((json, path) => {
      if (path.startsWith(`gears/${dir}/pieces/`)) {
        pieces.push(json);
      }
    });

    // Collect statuses
    const statuses: GameDataJson[] = [];
    parsedFiles.forEach((json, path) => {
      if (path.startsWith(`gears/${dir}/statuses/`)) {
        statuses.push(json);
      }
    });

    if (!setEffectJson && pieces.length === 0) {
      result.warnings.push(`gears/${dir}: no set effect or pieces found`);
      continue;
    }

    try {
      const bundle = { setEffect: setEffectJson, pieces, statuses };
      const existing = loadGameDataArray(STORAGE_KEYS.gearSets);
      const setProps = setEffectJson ? (setEffectJson.properties ?? {}) as GameDataJson : {};
      const id = (setProps.id ?? '') as string;

      const existingIdx = existing.findIndex(e => {
        const se = e.setEffect as GameDataJson | undefined;
        if (!se) return false;
        const sp = (se.properties ?? {}) as GameDataJson;
        return (sp.id as string) === id;
      });

      if (existingIdx >= 0) {
        const old = existing[existingIdx];
        deregisterCustomGearSetJson(
          old.setEffect as GameDataJson | null,
          (old.pieces ?? []) as GameDataJson[],
        );
        existing[existingIdx] = bundle as unknown as GameDataJson;
        result.warnings.push(`gear set "${id}": replaced existing`);
      } else {
        existing.push(bundle as unknown as GameDataJson);
      }
      registerCustomGearSetJson(setEffectJson, pieces, statuses);
      saveGameDataArray(STORAGE_KEYS.gearSets, existing);
      result.imported.gearSets++;
    } catch (e) {
      result.errors.push(`gear set "${dir}": ${e}`);
    }
  }

  return result;
}
