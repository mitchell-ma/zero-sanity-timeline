/**
 * Shared comparison-mode helpers used by both the grouped-mode stats table
 * (views sharing one parent loadout) and the inter-loadout cards (multiple
 * independent loadouts stacked). Keeps Base/Previous delta formatting, skill
 * aggregation, and row-data assembly in one place so the two surfaces stay
 * in lockstep.
 */

import React from 'react';
import type { SimulationResult } from '../controller/statistics/simulateSheet';
import type { DamageStatistics, DamageTableColumn } from '../controller/calculation/damageTableBuilder';
import type { SourceStatsBundle } from '../controller/statistics/statisticsController';
import { ComparisonModeType, NumberFormatType, StatisticsColumnType } from '../consts/enums';
import { NounType } from '../dsl/semantics';

const FPS = 120;

/** Maps the skill-filter enum to the corresponding per-slot damage columnId. */
export const SKILL_COLUMN_ID_BY_FILTER: ReadonlyMap<StatisticsColumnType, string> = new Map([
  [StatisticsColumnType.BASIC,    NounType.BASIC_ATTACK],
  [StatisticsColumnType.BATTLE,   NounType.BATTLE],
  [StatisticsColumnType.COMBO,    NounType.COMBO],
  [StatisticsColumnType.ULTIMATE, NounType.ULTIMATE],
]);

// ── Formatters ─────────────────────────────────────────────────────────────

export function formatDamage(n: number): string {
  if (n <= 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

export function formatSeconds(frames: number): string {
  return (frames / FPS).toFixed(1);
}

export function makeFormatPct(decimalPlaces: number, numberFormat: NumberFormatType) {
  return (n: number): string =>
    numberFormat === NumberFormatType.DECIMAL
      ? n.toFixed(decimalPlaces)
      : `${(n * 100).toFixed(decimalPlaces)}%`;
}

export type DeltaClass = '' | ' slc-num--delta-pos' | ' slc-num--delta-neg';

export function makeFormatDelta(decimalPlaces: number, numberFormat: NumberFormatType) {
  return (current: number, reference: number): { text: string; deltaClass: DeltaClass } => {
    if (reference === 0) return { text: '', deltaClass: '' };
    const delta = (current - reference) / reference;
    if (delta === 0) return { text: '', deltaClass: '' };

    if (numberFormat === NumberFormatType.DECIMAL) {
      const text = (1 + delta).toFixed(decimalPlaces);
      return { text, deltaClass: delta > 0 ? ' slc-num--delta-pos' : ' slc-num--delta-neg' };
    }
    const body = `${(delta * 100).toFixed(decimalPlaces)}%`;
    if (delta > 0) return { text: `+${body}`, deltaClass: ' slc-num--delta-pos' };
    return { text: body, deltaClass: ' slc-num--delta-neg' };
  };
}

export interface CellResult {
  node: React.ReactNode;
  dim: boolean;
  deltaClass: DeltaClass;
}

export function makeCellContent(
  mode: ComparisonModeType,
  formatDelta: ReturnType<typeof makeFormatDelta>,
) {
  return (
    current: number | null | undefined,
    reference: number | null | undefined,
    rawRender: (n: number) => React.ReactNode,
    rawIsEmpty: (n: number) => boolean = (n) => n <= 0,
  ): CellResult => {
    if (current == null) return { node: '', dim: true, deltaClass: '' };
    if (mode === ComparisonModeType.RAW) {
      if (rawIsEmpty(current)) return { node: '', dim: true, deltaClass: '' };
      return { node: rawRender(current), dim: false, deltaClass: '' };
    }
    if (reference == null) return { node: '', dim: true, deltaClass: '' };
    const { text, deltaClass } = formatDelta(current, reference);
    if (text === '') return { node: '', dim: true, deltaClass: '' };
    return { node: text, dim: false, deltaClass };
  };
}

// ── Aggregation helpers ────────────────────────────────────────────────────

function buildSlotColumnDamage(
  statistics: DamageStatistics,
  tableColumns: DamageTableColumn[],
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const col of tableColumns) {
    const dmg = statistics.columnTotals.get(col.key) ?? 0;
    let inner = map.get(col.ownerEntityId);
    if (!inner) { inner = new Map(); map.set(col.ownerEntityId, inner); }
    inner.set(col.columnId, (inner.get(col.columnId) ?? 0) + dmg);
  }
  return map;
}

function sumAllSkill(
  slotColumnDamage: Map<string, Map<string, number>>,
  columnId: string,
): number {
  let total = 0;
  slotColumnDamage.forEach((inner) => {
    total += inner.get(columnId) ?? 0;
  });
  return total;
}

export interface RowData {
  sim: SimulationResult;
  slotColumnDamage: Map<string, Map<string, number>>;
  teamTotal: number;
  durationSec: number | null;
  teamSkills: Map<string, number>;
  operatorData: Map<string, { total: number; skills: Map<string, number> }>;
  teamDps: number | null;
  crowdControlPct: number | null;
  timeToKill: number | null;
}

export function buildRowData(bundle: SourceStatsBundle): RowData | null {
  const sim = bundle.simulation;
  if (!sim) return null;

  const slotColumnDamage = buildSlotColumnDamage(sim.damageStatistics, sim.tableColumns);
  const teamTotal = sim.damageStatistics.teamTotalDamage;
  const durationSec =
    sim.damageStatistics.teamDps != null && sim.damageStatistics.teamDps > 0
      ? teamTotal / sim.damageStatistics.teamDps
      : null;

  const teamSkills = new Map<string, number>();
  SKILL_COLUMN_ID_BY_FILTER.forEach((columnId) => {
    teamSkills.set(columnId, sumAllSkill(slotColumnDamage, columnId));
  });

  const operatorData = new Map<string, { total: number; skills: Map<string, number> }>();
  for (const slot of sim.slots) {
    if (!slot.operator) continue;
    const opStats = sim.damageStatistics.operators.find((o) => o.ownerEntityId === slot.slotId);
    const opTotal = opStats?.totalDamage ?? 0;
    const skillBreakdown = slotColumnDamage.get(slot.slotId) ?? new Map<string, number>();
    const skills = new Map<string, number>();
    SKILL_COLUMN_ID_BY_FILTER.forEach((columnId) => {
      skills.set(columnId, skillBreakdown.get(columnId) ?? 0);
    });
    operatorData.set(slot.slotId, { total: opTotal, skills });
  }

  return {
    sim, slotColumnDamage, teamTotal, durationSec, teamSkills, operatorData,
    teamDps: sim.damageStatistics.teamDps ?? null,
    crowdControlPct: sim.damageStatistics.crowdControlPct ?? null,
    timeToKill: sim.damageStatistics.timeToKill ?? null,
  };
}

/** Picks the reference bundle for a source index under the given mode. */
export function resolveReferenceIndex(
  index: number,
  mode: ComparisonModeType,
): number | null {
  if (mode === ComparisonModeType.RAW) return null;
  if (index === 0) return null;
  if (mode === ComparisonModeType.DELTA_AGAINST_BASE) return 0;
  return index - 1;
}
