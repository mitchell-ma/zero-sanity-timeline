/**
 * ZIP export for custom and built-in game content.
 *
 * Produces a .zip file mirroring the game-data directory structure:
 *   game-data/operators/<id>/<id>.json + skills/*.json + statuses/*.json
 *   game-data/weapons/<id>/<id>.json + statuses/*.json
 *   game-data/gears/<id>/<id>.json + pieces/*.json + statuses/*.json
 *   manifest.json
 */
import { zipSync, strToU8 } from 'fflate';
import { loadGameDataArray, STORAGE_KEYS } from '../../utils/customContentStorage';
import { toDirectoryName } from './gameDataAdapters';

type GameDataJson = Record<string, unknown>;

interface ExportManifest {
  version: string;
  exportedAt: string;
  source: string;
  counts: {
    operators: number;
    weapons: number;
    gearSets: number;
    skills: number;
    operatorStatuses: number;
    operatorTalents: number;
    weaponEffects: number;
    gearEffects: number;
  };
}

/** Export all custom content as a ZIP file and trigger download. */
export function exportAllCustomContent(): void {
  const files: Record<string, Uint8Array> = {};
  const counts = {
    operators: 0, weapons: 0, gearSets: 0,
    skills: 0, operatorStatuses: 0, operatorTalents: 0,
    weaponEffects: 0, gearEffects: 0,
  };

  // ── Operators ──────────────────────────────────────────────────────────────
  const operatorJsons = loadGameDataArray(STORAGE_KEYS.operators);
  for (const json of operatorJsons) {
    const id = (json.id ?? '') as string;
    const dir = toDirectoryName(id);
    files[`game-data/operators/${dir}/${dir}.json`] = jsonToBytes(json);
    counts.operators++;
  }

  // ── Skills (operator skills linked to operators) ─────────────────────────
  const skillBundles = loadGameDataArray(STORAGE_KEYS.skills);
  for (const bundle of skillBundles) {
    const skillJson = (bundle.skill ?? bundle) as GameDataJson;
    const props = (skillJson.properties ?? {}) as GameDataJson;
    const meta = (skillJson.metadata ?? {}) as GameDataJson;
    const skillId = (props.id ?? bundle._wrapId ?? '') as string;
    const operatorId = (meta.originId ?? '') as string;
    if (!skillId) continue;

    const opDir = operatorId ? toDirectoryName(operatorId) : 'custom';
    files[`game-data/operators/${opDir}/skills/${toDirectoryName(skillId)}.json`] = jsonToBytes(skillJson);
    counts.skills++;
  }

  // ── Operator Statuses ──────────────────────────────────────────────────────
  const statusBundles = loadGameDataArray(STORAGE_KEYS.operatorStatuses);
  for (const bundle of statusBundles) {
    const statusJson = (bundle.status ?? bundle) as GameDataJson;
    const props = (statusJson.properties ?? {}) as GameDataJson;
    const meta = (statusJson.metadata ?? {}) as GameDataJson;
    const statusId = (props.id ?? bundle._wrapId ?? '') as string;
    const operatorId = (meta.originId ?? bundle.operatorId ?? '') as string;
    if (!statusId) continue;

    const opDir = operatorId ? toDirectoryName(operatorId) : 'custom';
    files[`game-data/operators/${opDir}/statuses/status-${toDirectoryName(statusId)}.json`] = jsonToBytes(statusJson);
    counts.operatorStatuses++;
  }

  // ── Operator Talents ───────────────────────────────────────────────────────
  const talentBundles = loadGameDataArray(STORAGE_KEYS.operatorTalents);
  for (const bundle of talentBundles) {
    const statuses = (bundle.statuses ?? []) as GameDataJson[];
    const operatorId = (bundle.operatorId ?? '') as string;
    const opDir = operatorId ? toDirectoryName(operatorId) : 'custom';

    for (const statusJson of statuses) {
      const props = (statusJson.properties ?? {}) as GameDataJson;
      const statusId = (props.id ?? '') as string;
      if (!statusId) continue;
      files[`game-data/operators/${opDir}/talents/talent-${toDirectoryName(statusId)}.json`] = jsonToBytes(statusJson);
    }
    counts.operatorTalents++;
  }

  // ── Weapon Effects ─────────────────────────────────────────────────────────
  const weaponEffectBundles = loadGameDataArray(STORAGE_KEYS.weaponEffects);
  for (const bundle of weaponEffectBundles) {
    const statuses = (bundle.statuses ?? []) as GameDataJson[];
    const weaponId = (bundle.weaponId ?? bundle._wrapId ?? '') as string;
    const weaponDir = weaponId ? toDirectoryName(weaponId) : 'custom';

    for (const statusJson of statuses) {
      const props = (statusJson.properties ?? {}) as GameDataJson;
      const statusId = (props.id ?? '') as string;
      if (!statusId) continue;
      files[`game-data/weapons/${weaponDir}/statuses/status-${toDirectoryName(statusId)}.json`] = jsonToBytes(statusJson);
    }
    counts.weaponEffects++;
  }

  // ── Gear Effects ───────────────────────────────────────────────────────────
  const gearEffectBundles = loadGameDataArray(STORAGE_KEYS.gearEffects);
  for (const bundle of gearEffectBundles) {
    const statuses = (bundle.statuses ?? []) as GameDataJson[];
    const gearSetId = (bundle.gearSetId ?? bundle._wrapId ?? '') as string;
    const gearDir = gearSetId ? toDirectoryName(gearSetId) : 'custom';

    for (const statusJson of statuses) {
      const props = (statusJson.properties ?? {}) as GameDataJson;
      const statusId = (props.id ?? '') as string;
      if (!statusId) continue;
      files[`game-data/gears/${gearDir}/statuses/status-${toDirectoryName(statusId)}.json`] = jsonToBytes(statusJson);
    }
    counts.gearEffects++;
  }

  // ── Weapons ────────────────────────────────────────────────────────────────
  const weaponBundles = loadGameDataArray(STORAGE_KEYS.weapons);
  for (const bundle of weaponBundles) {
    const weaponJson = (bundle.weapon ?? bundle) as GameDataJson;
    const statuses = (bundle.statuses ?? []) as GameDataJson[];
    const props = (weaponJson.properties ?? {}) as GameDataJson;
    const id = (props.id ?? '') as string;
    const dir = toDirectoryName(id);

    files[`game-data/weapons/${dir}/${dir}.json`] = jsonToBytes(weaponJson);

    for (const status of statuses) {
      const sProps = (status.properties ?? {}) as GameDataJson;
      const sId = (sProps.id ?? '') as string;
      files[`game-data/weapons/${dir}/statuses/status-${toDirectoryName(sId)}.json`] = jsonToBytes(status);
    }
    counts.weapons++;
  }

  // ── Gear Sets ──────────────────────────────────────────────────────────────
  const gearBundles = loadGameDataArray(STORAGE_KEYS.gearSets);
  for (const bundle of gearBundles) {
    const setEffect = bundle.setEffect as GameDataJson | null;
    const pieces = (bundle.pieces ?? []) as GameDataJson[];
    const statuses = (bundle.statuses ?? []) as GameDataJson[];

    if (!setEffect) continue;
    const setProps = (setEffect.properties ?? {}) as GameDataJson;
    const id = (setProps.id ?? '') as string;
    const dir = toDirectoryName(id);

    files[`game-data/gears/${dir}/${dir}.json`] = jsonToBytes(setEffect);

    for (const piece of pieces) {
      const pProps = (piece.properties ?? {}) as GameDataJson;
      const pId = (pProps.id ?? '') as string;
      files[`game-data/gears/${dir}/pieces/${toDirectoryName(pId)}.json`] = jsonToBytes(piece);
    }

    for (const status of statuses) {
      const sProps = (status.properties ?? {}) as GameDataJson;
      const sId = (sProps.id ?? '') as string;
      files[`game-data/gears/${dir}/statuses/status-${toDirectoryName(sId)}.json`] = jsonToBytes(status);
    }
    counts.gearSets++;
  }

  // ── Manifest ───────────────────────────────────────────────────────────────
  const manifest: ExportManifest = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    source: 'zero-sanity-timeline',
    counts,
  };
  files['manifest.json'] = jsonToBytes(manifest);

  // ── Build ZIP and download ─────────────────────────────────────────────────
  const zipped = zipSync(files, { level: 6 });
  downloadBlob(new Blob([zipped as unknown as BlobPart], { type: 'application/zip' }), 'custom-content.zip');
}

/** Export a single built-in entity by serializing it from the game data stores. */
export function exportBuiltinEntity(
  entityType: 'operator' | 'weapon' | 'gearSet',
  serialize: () => { files: Record<string, GameDataJson> },
): void {
  const { files: jsonFiles } = serialize();
  const files: Record<string, Uint8Array> = {};

  for (const [path, json] of Object.entries(jsonFiles)) {
    files[path] = jsonToBytes(json);
  }

  const manifest: ExportManifest = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    source: 'zero-sanity-timeline',
    counts: {
      operators: entityType === 'operator' ? 1 : 0,
      weapons: entityType === 'weapon' ? 1 : 0,
      gearSets: entityType === 'gearSet' ? 1 : 0,
      skills: 0, operatorStatuses: 0, operatorTalents: 0,
      weaponEffects: 0, gearEffects: 0,
    },
  };
  files['manifest.json'] = jsonToBytes(manifest);

  const zipped = zipSync(files, { level: 6 });
  const name = Object.keys(jsonFiles)[0]?.split('/')[2] ?? entityType;
  downloadBlob(new Blob([zipped as unknown as BlobPart], { type: 'application/zip' }), `${name}.zip`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function jsonToBytes(obj: unknown): Uint8Array {
  return strToU8(JSON.stringify(obj, null, 2));
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
