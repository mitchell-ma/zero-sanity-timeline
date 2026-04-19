/**
 * Game-data locale loader and resolver.
 *
 * Loads per-operator / per-weapon / per-gear locale bundles from
 * `src/locales/game-data/<locale>/**\/*.json` via `require.context`,
 * merges them into the locale dictionary consumed by `t()`, and exposes
 * typed resolver helpers for the three-tier (event / segment / frame)
 * hierarchy of names and descriptions.
 *
 * File format (one JSON per entity file):
 * ```
 * {
 *   "op.DA_PAN.event.name": { "text": "Da Pan", "dataStatus": "RECONCILED" },
 *   "op.DA_PAN.skill.FLIP_DA_WOK.event.description": {
 *     "text": "Takes out a wok...",
 *     "dataStatus": "VERIFIED"
 *   }
 * }
 * ```
 *
 * Resolver output mirrors the JSON structure: event strings always return
 * a string (falling through to the key when missing); segment/frame names
 * return `undefined` when absent (most frames are unnamed).
 */

import { registerLocale, t, tOptional } from './locale';
import { DataStatus } from '../consts/enums';

// ── Types ───────────────────────────────────────────────────────────────────

export interface GameDataLocaleEntry {
  text: string;
  dataStatus: DataStatus;
}

type GameDataLocaleDict = Record<string, GameDataLocaleEntry>;

// ── Raw records (kept for the reconciler to inspect dataStatus) ─────────────

const gameDataRecords: Record<string, GameDataLocaleDict> = {};

function ingest(locale: string, files: Record<string, GameDataLocaleDict>): void {
  const merged: GameDataLocaleDict = gameDataRecords[locale] ?? {};
  for (const dict of Object.values(files)) {
    for (const [key, entry] of Object.entries(dict)) {
      merged[key] = entry;
    }
  }
  gameDataRecords[locale] = merged;

  const flat: Record<string, string> = {};
  for (const [key, entry] of Object.entries(merged)) flat[key] = entry.text;
  registerLocale(locale, flat);
}

function collectContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
): Record<string, GameDataLocaleDict> {
  const out: Record<string, GameDataLocaleDict> = {};
  for (const key of ctx.keys()) {
    const mod = ctx(key) as GameDataLocaleDict;
    out[key] = mod;
  }
  return out;
}

// ── Bundled locales ────────────────────────────────────────────────────────
// `require.context` arguments must be string literals — one block per locale.

const enUSContext = require.context('./game-data/en-US', true, /\.json$/);
ingest('en-US', collectContext(enUSContext));

const frFRContext = require.context('./game-data/fr-FR', true, /\.json$/);
ingest('fr-FR', collectContext(frFRContext));

// ── Reconciler API (read/write raw entries with dataStatus) ────────────────

export function getGameDataEntry(locale: string, key: string): GameDataLocaleEntry | undefined {
  return gameDataRecords[locale]?.[key];
}

export function getAllGameDataEntries(locale: string): Readonly<GameDataLocaleDict> {
  return gameDataRecords[locale] ?? {};
}

// ── Key builders — produce the dot-delimited entity prefix ─────────────────

export const LocaleKey = {
  operator: (operatorId: string) => `op.${operatorId}`,
  operatorSkill: (operatorId: string, skillId: string) => `op.${operatorId}.skill.${skillId}`,
  operatorTalent: (operatorId: string, talentId: string) => `op.${operatorId}.talent.${talentId}`,
  operatorStatus: (operatorId: string, statusId: string) => `op.${operatorId}.status.${statusId}`,
  operatorPotential: (operatorId: string, level: number) => `op.${operatorId}.potential.${level}`,
  weapon: (weaponId: string) => `weapon.${weaponId}`,
  gear: (gearId: string) => `gear.${gearId}`,
  gearPiece: (gearId: string, pieceId: string) => `gear.${gearId}.piece.${pieceId}`,
  gearStatus: (gearId: string, statusId: string) => `gear.${gearId}.status.${statusId}`,
  consumable: (consumableId: string) => `consumable.${consumableId}`,
  genericStatus: (statusId: string) => `status.${statusId}`,
};

// ── Tier suffix builders ───────────────────────────────────────────────────

const EVENT_NAME = 'event.name';
const EVENT_DESCRIPTION = 'event.description';
const segmentNameSuffix = (segIdx: number) => `segment.${segIdx}.name`;
const frameNameSuffix = (segIdx: number, frameIdx: number) =>
  `segment.${segIdx}.frame.${frameIdx}.name`;

// ── Resolvers ──────────────────────────────────────────────────────────────

/** Event-tier name. Falls back to the key itself when missing (via t()). */
export function resolveEventName(entityPrefix: string): string {
  return t(`${entityPrefix}.${EVENT_NAME}`);
}

/** Event-tier description, with optional `{param:format}` interpolation. */
export function resolveEventDescription(
  entityPrefix: string,
  params?: Record<string, string | number>,
): string {
  return t(`${entityPrefix}.${EVENT_DESCRIPTION}`, params);
}

/** Segment-tier name. Returns `undefined` when not defined in any locale. */
export function resolveSegmentName(entityPrefix: string, segIdx: number): string | undefined {
  return tOptional(`${entityPrefix}.${segmentNameSuffix(segIdx)}`);
}

/** Frame-tier name. Returns `undefined` when the frame is unnamed. */
export function resolveFrameName(
  entityPrefix: string,
  segIdx: number,
  frameIdx: number,
): string | undefined {
  return tOptional(`${entityPrefix}.${frameNameSuffix(segIdx, frameIdx)}`);
}
