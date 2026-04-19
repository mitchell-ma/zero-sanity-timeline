/**
 * Shared helpers for gear-set E2E tests.
 *
 * Each gear-set test file exercises three layers:
 *   1. Loadout aggregation — 3-piece passive stat appears in `aggregatedStats`
 *      with the canonical `<Set Name> (Gear Set)` source label.
 *   2. Trigger dispatch — the set's `onTriggerClause` fires and creates the
 *      buff status event in `allProcessedEvents`.
 *   3. Calculation ingestion — when the buff status is active during a damage
 *      frame, its `clause` STAT application surfaces in
 *      `damageRow.params.sub.statSources` (and consequently in the info-pane
 *      damage breakdown). This is the leg that the engine wiring still owes:
 *      assertions here are EXPECTED to fail until weapon/gear STAT ingestion
 *      lands.
 */
import { act } from '@testing-library/react';
import { runCalculation } from '../../../controller/calculation/calculationController';
import { buildMultiplierEntries, type MultiplierEntry } from '../../../controller/info-pane/damageBreakdownController';
import { CritMode, StatType } from '../../../consts/enums';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult, AddEventPayload } from '../helpers';
import type { OperatorLoadoutState } from '../../../view/OperatorLoadoutHeader';
import { getStatusDef } from '../../../controller/timeline/configCache';

/**
 * Resolve the display name of a gear status (or any status) by id.
 * Game-data JSON no longer carries `properties.name` — the serialized def
 * from `configCache` reprojects the locale-backed display name back into
 * `properties.name` so the UI can surface it.
 */
export function statusDisplayName(statusId: string): string {
  const def = getStatusDef(statusId);
  const name = (def?.properties as { name?: string } | undefined)?.name;
  return name ?? statusId;
}

export const SLOT = 'slot-0';
export const SLOT_INDEX = 0;

/** Build a loadout state with the given three gear pieces (one set, one of each type). */
export function gearLoadout(
  armorId: string,
  glovesId: string,
  kit1Id: string,
  weaponId: string | null = null,
): OperatorLoadoutState {
  return {
    weaponId,
    armorId,
    glovesId,
    kit1Id,
    kit2Id: null,
    consumableId: null,
    tacticalId: null,
  };
}

/** Run the full damage calculation for the current app state. */
export function calc(app: AppResult, mode: CritMode = CritMode.EXPECTED) {
  return runCalculation(
    app.allProcessedEvents,
    app.columns,
    app.slots,
    app.enemy,
    app.loadoutProperties,
    app.loadouts,
    app.staggerBreaks,
    mode,
    app.overrides,
  );
}

/** Find the first damage row produced by `slotId` whose `sub` data is populated. */
export function firstDamageRow(
  result: ReturnType<typeof runCalculation>,
  slotId: string = SLOT,
) {
  return result.rows.find(
    r => r.damage != null && r.damage > 0 && r.params?.sub != null && r.ownerEntityId === slotId,
  );
}

/** Find a damage row produced by `slotId` at-or-after `atFrame` with populated `sub`. */
export function damageRowAtOrAfter(
  result: ReturnType<typeof runCalculation>,
  atFrame: number,
  slotId: string = SLOT,
) {
  return result.rows
    .filter(r => r.damage != null && r.damage > 0 && r.params?.sub != null && r.ownerEntityId === slotId)
    .sort((a, b) => a.absoluteFrame - b.absoluteFrame)
    .find(r => r.absoluteFrame >= atFrame);
}

/** Sum a stat's runtime contribution from a specific source label across `sub.statSources`. */
export function statContributionFromSource(
  row: ReturnType<typeof firstDamageRow>,
  stat: StatType,
  sourceLabelSubstring: string,
): number {
  if (!row?.params?.sub) return 0;
  const sources = row.params.sub.statSources?.[stat];
  if (!sources) return 0;
  return sources
    .filter(s => s.source.toLowerCase().includes(sourceLabelSubstring.toLowerCase()))
    .reduce((sum, s) => sum + s.value, 0);
}

/** Walk the breakdown tree and find the first entry matching `label`. */
export function findEntry(
  entries: MultiplierEntry[],
  label: string,
): MultiplierEntry | undefined {
  for (const e of entries) {
    if (e.label === label) return e;
    if (e.subEntries) {
      const inner = findEntry(e.subEntries, label);
      if (inner) return inner;
    }
  }
  return undefined;
}

/** Resolve the breakdown tree for a damage row. */
export function breakdownFor(row: ReturnType<typeof firstDamageRow>): MultiplierEntry[] {
  return buildMultiplierEntries(row!.params!);
}

/** Find a sub-entry under any breakdown entry whose source label matches. */
export function findSourceEntry(
  entries: MultiplierEntry[],
  sourceSubstring: string,
): MultiplierEntry | undefined {
  for (const e of entries) {
    if (e.subEntries) {
      for (const sub of e.subEntries) {
        if (sub.subEntries) {
          for (const ss of sub.subEntries) {
            if (ss.label.toLowerCase().includes(sourceSubstring.toLowerCase())) return ss;
            if (ss.source.toLowerCase().includes(sourceSubstring.toLowerCase())) return ss;
          }
        }
        if (sub.label.toLowerCase().includes(sourceSubstring.toLowerCase())) return sub;
        if (sub.source.toLowerCase().includes(sourceSubstring.toLowerCase())) return sub;
      }
    }
  }
  return undefined;
}

/** Convenience: place a skill via the context menu flow. */
export function placeSkill(
  app: AppResult,
  slotId: string,
  columnId: string,
  atFrame: number,
): AddEventPayload {
  const col = findColumn(app, slotId, columnId);
  if (!col) throw new Error(`Column ${columnId} not found for ${slotId}`);
  const payload = getMenuPayload(app, col, atFrame);
  act(() => {
    app.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
  });
  return payload;
}

/** All events on a particular column for a particular owner. */
export function eventsOnColumn(app: AppResult, ownerId: string, columnId: string) {
  return app.allProcessedEvents
    .filter(ev => ev.ownerEntityId === ownerId && ev.columnId === columnId)
    .sort((a, b) => a.startFrame - b.startFrame);
}
