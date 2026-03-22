/**
 * Loader for weapon and gear set effect DSL definitions.
 *
 * Auto-discovers JSON files from weapon-effects/ and gear-effects/ directories.
 * Provides lookup functions used by the status derivation engine.
 */
import type { GearSetType } from '../../consts/enums';
import type { Interaction } from '../../consts/semantics';
import { getGearStatuses } from './gearStatusesController';

// ── Normalized effect def shape ──────────────────────────────────────────────

/** Normalized status event def as returned by the public API. */
export interface NormalizedEffectDef {
  [key: string]: unknown;
  id: string;
  name?: string;
  type?: string;
  label?: string;
  description?: string;
  element?: string;
  target: string;
  targetDeterminer: string;
  originId?: string;
  statusLevel: {
    limit: { verb: string; value: number };
    statusLevelInteractionType: string;
  };
  onTriggerClause: { conditions: Interaction[] }[];
  clause?: { conditions: Interaction[]; effects: Record<string, unknown>[] }[];
  note?: string;
  cooldownSeconds?: number;
  properties?: { duration?: { value: number[]; unit: string } };
  stack?: { max?: Record<string, number> };
  buffs?: { stat: string; value?: number; valueMin?: number; valueMax?: number; perStack?: boolean }[];
  isForced?: boolean;
  enhancementTypes?: string[];
  susceptibility?: Record<string, number[]>;
  segments?: unknown[];
  stats?: unknown[];
  /** Event status type override for the engine. */
  statusValue?: number;
}

// ── Auto-discover weapon effect JSONs ────────────────────────────────────────

interface WeaponEffectJson { weaponName: string; statusEvents: Record<string, unknown>[] }
const WEAPON_EFFECT_JSON: Record<string, WeaponEffectJson> = {};
/** Weapon name → file key lookup for O(1) access. */
const WEAPON_NAME_INDEX: Record<string, string> = {};

const weaponEffectContext = require.context('./weapons/weapon-effects', false, /-effects\.json$/);
for (const key of weaponEffectContext.keys()) {
  const data = weaponEffectContext(key) as WeaponEffectJson;
  WEAPON_EFFECT_JSON[key] = data;
  if (data.weaponName) {
    WEAPON_NAME_INDEX[data.weaponName] = key;
  }
}

// ── Auto-discover gear effect JSONs ──────────────────────────────────────────

interface GearEffectEntry { properties: { type: string; id: string; name: string }; onTriggerClause?: { conditions: Interaction[]; effects: { objectId?: string }[] }[] }
/** Gear set effect entry (type=GEAR_SET_EFFECT) indexed by file key. */
const GEAR_EFFECT_INDEX: Record<string, GearEffectEntry> = {};
/** GearSetType → file key lookup for O(1) access. */
const GEAR_TYPE_INDEX: Record<string, string> = {};

const gearStatusContext2 = require.context('./gears/gear-statuses', false, /-statuses\.json$/);
for (const key of gearStatusContext2.keys()) {
  const entries = gearStatusContext2(key) as Record<string, unknown>[];
  if (!Array.isArray(entries)) continue;
  // First entry with type GEAR_SET_EFFECT is the set-level effect
  const effectEntry = entries.find(e => (e.properties as Record<string, unknown>)?.type === 'GEAR_SET_EFFECT') as GearEffectEntry | undefined;
  if (effectEntry?.properties?.id) {
    GEAR_EFFECT_INDEX[key] = effectEntry;
    GEAR_TYPE_INDEX[effectEntry.properties.id] = key;
  }
}

// ── Custom weapon/gear effect registries ─────────────────────────────────────

const customWeaponEffects: Record<string, NormalizedEffectDef[]> = {};
const customGearEffects: Record<string, NormalizedEffectDef[]> = {};

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Infer target/targetDeterminer from explicit properties first, then from onTriggerClause effects.
 * Does NOT infer from clause effects (those describe the status's behavior, not its target).
 */
function inferTarget(se: Record<string, unknown>): { target: string; targetDeterminer: string } {
  const props = (se.properties ?? {}) as Record<string, unknown>;
  // Explicit target from properties
  if (props.target) return { target: props.target as string, targetDeterminer: (props.targetDeterminer ?? props.toDeterminer ?? 'THIS') as string };
  if (props.to) return { target: props.to as string, targetDeterminer: (props.toDeterminer ?? 'THIS') as string };
  // Infer from onTriggerClause effects (APPLY STATUS effects indicate target for the triggered status)
  const triggers = se.onTriggerClause as { effects?: { to?: string; toDeterminer?: string }[] }[] | undefined;
  if (triggers) {
    for (const clause of triggers) {
      for (const effect of clause.effects ?? []) {
        if (effect.to === 'ENEMY') return { target: 'ENEMY', targetDeterminer: 'THIS' };
        if (effect.toDeterminer === 'OTHER') return { target: 'OPERATOR', targetDeterminer: 'OTHER' };
        if (effect.toDeterminer === 'ALL') return { target: 'OPERATOR', targetDeterminer: 'ALL' };
      }
    }
  }
  return { target: 'OPERATOR', targetDeterminer: 'THIS' };
}

/**
 * Normalize a new-format weapon/gear statusEvent entry into the engine-expected flat shape.
 */
function normalizeEffectEntry(raw: Record<string, unknown>): NormalizedEffectDef {
  const props = (raw.properties ?? {}) as Record<string, unknown>;
  const sl = (props.statusLevel ?? {}) as Record<string, unknown>;

  // Pass through statusLevel.limit as { verb, value } DSL format — handle both value and values
  const limit = sl.limit as { verb?: string; value?: unknown; values?: number[] } | undefined;
  const limitVal = limit?.value ?? (limit?.values?.[0]);
  const resolvedLimit = limit
    ? { verb: limit.verb ?? 'IS', value: (limitVal as number) ?? 1 }
    : { verb: 'IS', value: 1 };

  const { target, targetDeterminer } = inferTarget(raw);

  const out: NormalizedEffectDef = {
    id: (props.id ?? raw.id) as string,
    ...(props.name ? { name: props.name as string } : {}),
    ...(props.type ? { type: props.type as string } : {}),
    ...(raw.description ? { description: raw.description as string } : {}),
    ...(raw.element ? { element: raw.element as string } : {}),
    target,
    targetDeterminer,
    originId: raw.originId as string | undefined,
    statusLevel: {
      limit: resolvedLimit,
      statusLevelInteractionType: ((sl.statusLevelInteractionType ?? sl.interactionType) as string) ?? 'NONE',
    },
    onTriggerClause: (raw.onTriggerClause ?? []) as NormalizedEffectDef['onTriggerClause'],
    ...(raw.clause ? { clause: raw.clause as NormalizedEffectDef['clause'] } : {}),
    ...(raw.note ? { note: raw.note as string } : {}),
    ...(raw.cooldownSeconds ?? (props.cooldownSeconds as number | undefined) ? { cooldownSeconds: (raw.cooldownSeconds ?? props.cooldownSeconds) as number } : {}),
  };

  // Duration — handle both { value } and { values } formats
  if (props.duration) {
    const dur = props.duration as { value?: number | number[]; values?: number[]; unit: string };
    const dv = dur.value ?? dur.values;
    if (dv != null) {
      out.properties = { duration: { value: Array.isArray(dv) ? dv : [dv], unit: dur.unit } };
    }
  }

  return out;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Get DSL status event defs for a weapon by name. */
export function getWeaponEffectDefs(weaponName: string): NormalizedEffectDef[] {
  // Check custom first
  if (customWeaponEffects[weaponName]) return customWeaponEffects[weaponName];
  const key = WEAPON_NAME_INDEX[weaponName];
  if (!key) return [];
  return (WEAPON_EFFECT_JSON[key]?.statusEvents ?? []).map(normalizeEffectEntry);
}

/** Get DSL status event defs for a gear set type. */
export function getGearEffectDefs(gearSetType: GearSetType | string): NormalizedEffectDef[] {
  // Check custom first
  if (customGearEffects[gearSetType]) return customGearEffects[gearSetType];
  // Load statuses from gearStatusesController, normalize, and inject triggers from gear-effects
  const statuses = getGearStatuses(gearSetType as string);
  if (statuses.length === 0) return [];
  const defs = statuses.map(s => normalizeEffectEntry(s.serialize() as Record<string, unknown>));
  // Inject onTriggerClause from gear-effects file
  const key = GEAR_TYPE_INDEX[gearSetType];
  const triggers = key ? (GEAR_EFFECT_INDEX[key]?.onTriggerClause ?? []) as { conditions: Interaction[]; effects: { objectId?: string }[] }[] : [];
  for (const def of defs) {
    if (!def.onTriggerClause || def.onTriggerClause.length === 0) {
      const trigger = triggers.find(t => t.effects?.some(e => e.objectId === def.id));
      if (trigger) {
        def.onTriggerClause = [{ conditions: trigger.conditions }];
      }
    }
  }
  return defs;
}

/** Get all weapon names that have effect definitions. */
export function getAllWeaponEffectNames(): string[] {
  return [
    ...Object.values(WEAPON_EFFECT_JSON).map(d => d.weaponName),
    ...Object.keys(customWeaponEffects),
  ];
}

/** Get all gear set types that have effect definitions. */
export function getAllGearEffectTypes(): string[] {
  return [
    ...Object.values(GEAR_EFFECT_INDEX).map(d => d.properties.id),
    ...Object.keys(customGearEffects),
  ];
}

/** Register custom weapon effect defs at runtime. */
export function registerCustomWeaponEffectDefs(weaponName: string, defs: NormalizedEffectDef[] | Record<string, unknown>[]): void {
  customWeaponEffects[weaponName] = defs as NormalizedEffectDef[];
}

/** Deregister custom weapon effect defs. */
export function deregisterCustomWeaponEffectDefs(weaponName: string): void {
  delete customWeaponEffects[weaponName];
}

/** Register custom gear effect defs at runtime. Normalizes raw JSON entries and merges trigger+status pairs. */
export function registerCustomGearEffectDefs(gearSetType: string, defs: NormalizedEffectDef[] | Record<string, unknown>[]): void {
  // Normalize raw entries
  const normalized = (defs as Record<string, unknown>[]).map(d => normalizeEffectEntry(d));
  // Merge trigger+status pairs: inject onTriggerClause into status entries that share the same id,
  // then filter out trigger-only entries whose objectId points to a status entry
  const triggerObjectIds = new Set<string>();
  for (const def of normalized) {
    if (!def.onTriggerClause || def.onTriggerClause.length === 0) {
      const trigger = normalized.find(t =>
        t.onTriggerClause?.length &&
        t.onTriggerClause.some(tc => (tc as unknown as { effects?: { objectId?: string }[] }).effects?.some(e => e.objectId === def.id))
      );
      if (trigger) {
        const matchingClause = trigger.onTriggerClause.find(tc =>
          (tc as unknown as { effects?: { objectId?: string }[] }).effects?.some(e => e.objectId === def.id)
        );
        if (matchingClause) {
          def.onTriggerClause = [{ conditions: matchingClause.conditions }];
          triggerObjectIds.add(def.id);
        }
      }
    }
  }
  // Remove trigger-only entries whose APPLY STATUS targets have been merged
  const result = normalized.filter(def => {
    if (!def.onTriggerClause?.length) return true;
    const isRedirect = def.onTriggerClause.some(tc =>
      (tc as unknown as { effects?: { objectId?: string }[] }).effects?.some(e => e.objectId && triggerObjectIds.has(e.objectId))
    );
    return !isRedirect;
  });
  customGearEffects[gearSetType] = result;
}

/** Deregister custom gear effect defs. */
export function deregisterCustomGearEffectDefs(gearSetType: string): void {
  delete customGearEffects[gearSetType];
}

/** Get the gear set label from the gear JSON metadata. */
export function getGearEffectLabel(gearSetType: GearSetType | string): string | undefined {
  const key = GEAR_TYPE_INDEX[gearSetType];
  if (!key) return undefined;
  return GEAR_EFFECT_INDEX[key]?.properties?.name;
}

// ── Display helpers for DSL status event defs ────────────────────────────────

/** Resolve target display string from DSL def fields. */
export function resolveTargetDisplay(def: { target?: string; targetDeterminer?: string }): string {
  if (def.target === 'ENEMY') return 'enemy';
  if (def.targetDeterminer === 'OTHER') return 'team';
  return 'wielder';
}

/** Get duration in seconds from a DSL def. */
export function resolveDurationSeconds(def: { properties?: { duration?: { value: number[] } } }): number {
  return def.properties?.duration?.value?.[0] ?? 0;
}

/** Resolve onTriggerClause conditions to flat Interaction-like objects for display. */
export function resolveTriggerInteractions(def: { onTriggerClause?: { conditions: Interaction[] }[] }): Interaction[] {
  const clauses = def.onTriggerClause ?? [];
  return clauses.flatMap(c => c.conditions);
}
