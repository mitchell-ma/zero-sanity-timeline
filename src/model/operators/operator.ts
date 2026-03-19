import { StatType } from "../../consts/enums";

export interface BaseStats {
  lv1: Partial<Record<StatType, number>>;
  lv90: Partial<Record<StatType, number>>;
}

export function interpolateStats(baseStats: BaseStats, level: number): Partial<Record<StatType, number>> {
  const t = (level - 1) / 89;
  const result: Partial<Record<StatType, number>> = {};
  const allKeys = Array.from(new Set([
    ...Object.keys(baseStats.lv1),
    ...Object.keys(baseStats.lv90),
  ]));
  for (const key of allKeys) {
    const v1 = (baseStats.lv1 as Record<string, number | undefined>)[key] ?? 0;
    const v90 = (baseStats.lv90 as Record<string, number | undefined>)[key] ?? 0;
    result[key as StatType] = v1 + (v90 - v1) * t;
  }
  return result;
}

/** Attribute increase values by level (0–4). Shared across all operators. */
export const ATTRIBUTE_INCREASE_VALUES: readonly number[] = [0, 10, 15, 15, 20];
