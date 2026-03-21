/**
 * Operator registry — operator entries with icons for loadout display.
 *
 * Weapons, gears, consumables, and tacticals have been migrated to
 * gameDataController.ts. Only operators remain here until they get
 * their own typed controller.
 */
import { DataDrivenOperator } from "../model/operators/dataDrivenOperator";
import { getOperatorConfig } from "../controller/operators/operatorRegistry";
import { getOperatorJson, getAllOperatorIds } from "../model/event-frames/operatorJsonLoader";

// ─── Registry types ─────────────────────────────────────────────────────────

export interface RegistryEntry<T> {
  name: string;
  icon?: string;
  rarity: number;
  create: () => T;
}

// ─── Icon auto-discovery ────────────────────────────────────────────────────

const operatorIconContext = require.context('../assets/operators', false, /_icon\.png$/);
const OPERATOR_ICONS: Record<string, string> = {};
for (const key of operatorIconContext.keys()) {
  const match = key.match(/\.\/(.+)_icon\.png$/);
  if (match) {
    OPERATOR_ICONS[match[1]] = operatorIconContext(key);
  }
}

function getOperatorIcon(name: string): string | undefined {
  const key = name.replace(/ /g, '_');
  if (OPERATOR_ICONS[key]) return OPERATOR_ICONS[key];
  for (const [assetKey, url] of Object.entries(OPERATOR_ICONS)) {
    if (assetKey.startsWith(key)) return url;
  }
  return undefined;
}

// ─── Operators ──────────────────────────────────────────────────────────────

export const OPERATORS: RegistryEntry<DataDrivenOperator | null>[] = getAllOperatorIds().map(id => {
  const json = getOperatorJson(id);
  if (!json) throw new Error(`No JSON data for operator: ${id}`);
  return {
    name: json.name as string,
    icon: getOperatorIcon(json.name as string),
    rarity: json.operatorRarity as number,
    create: () => {
      const config = getOperatorConfig(id);
      return config ? new DataDrivenOperator(config, 90) : null;
    },
  };
});
