/**
 * Shared integration test helpers.
 *
 * These helpers simulate user interactions (right-click → context menu → add event)
 * and provide typed accessors for verifying pipeline and view-layer state.
 */
import { ColumnType } from '../../consts/enums';
import type { InteractionModeType } from '../../consts/enums';
import type { MiniTimeline, ContextMenuItem, Column } from '../../consts/viewTypes';
import {
  buildColumnContextMenu,
  type ColumnContextMenuContext,
} from '../../controller/timeline/contextMenuController';
import { getAlwaysAvailableComboSlots } from '../../controller/timeline/eventValidator';
import { computeAllValidations } from '../../controller/timeline/eventValidationController';
import { ultimateGraphKey } from '../../model/channels';
import { getUltimateEnergyCost } from '../../controller/operators/operatorRegistry';
import type { useApp } from '../../app/useApp';

// ── Types ────────────────────────────────────────────────────────────────────

/** The shape returned by useApp(). */
export type AppResult = ReturnType<typeof useApp>;

/** The actionPayload shape used by all 'addEvent' context menu items. */
export interface AddEventPayload {
  ownerEntityId: string;
  columnId: string;
  atFrame: number;
  defaultSkill: Record<string, unknown>;
}

// ── Column Lookup ────────────────────────────────────────────────────────────

/** Find a MiniTimeline column by owner and column ID. */
export function findColumn(app: AppResult, slotId: string, columnId: string) {
  return app.columns.find(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === slotId &&
      c.columnId === columnId,
  );
}

// ── Context Menu ─────────────────────────────────────────────────────────────

/**
 * Build a context menu for a column at a given frame — simulates the user
 * right-clicking on a column at a specific position.
 *
 * Derives `alwaysAvailableComboSlots` and `timeStopRegions` from the current
 * app state so callers don't need to compute them manually.
 */
export function buildContextMenu(
  app: AppResult,
  col: Column,
  atFrame: number,
  relativeClickX?: number,
): ContextMenuItem[] | null {
  const { timeStopRegions } = computeAllValidations(
    app.allProcessedEvents,
    app.slots,
    app.resourceGraphs,
    app.staggerBreaks,
    null,
  );

  const ctx: ColumnContextMenuContext = {
    events: app.allProcessedEvents,
    slots: app.slots,
    resourceGraphs: app.resourceGraphs,
    alwaysAvailableComboSlots: getAlwaysAvailableComboSlots(app.slots),
    timeStopRegions,
    staggerBreaks: app.staggerBreaks,
    columnPositions: new Map(),
    interactionMode: app.interactionMode as InteractionModeType,
  };

  return buildColumnContextMenu(col, atFrame, relativeClickX, ctx);
}

/**
 * Find an 'addEvent' menu item and return its payload.
 * Optionally filter by variant label.
 * Asserts the item exists and is enabled.
 */
export function getAddEventPayload(
  menuItems: ContextMenuItem[],
  variantLabel?: string,
): AddEventPayload {
  const item = variantLabel
    ? menuItems.find(i => i.actionId === 'addEvent' && i.label === variantLabel)
    : menuItems.find(i => i.actionId === 'addEvent');

  if (!item) {
    const available = menuItems
      .filter(i => i.actionId === 'addEvent')
      .map(i => `"${i.label}"${i.disabled ? ` (disabled: ${i.disabledReason})` : ''}`)
      .join(', ');
    throw new Error(
      variantLabel
        ? `No addEvent menu item with label "${variantLabel}". Available: ${available}`
        : `No addEvent menu item found. Available items: ${menuItems.map(i => i.label ?? i.actionId).join(', ')}`,
    );
  }

  if (item.disabled) {
    throw new Error(
      `addEvent menu item "${item.label}" is disabled: ${item.disabledReason ?? '(no reason)'}`,
    );
  }

  return item.actionPayload as AddEventPayload;
}

/**
 * Set ultimate energy to max for a slot so ultimates can be placed.
 * Must be called inside act().
 */
export function setUltimateEnergyToMax(app: AppResult, slotId: string, slotIndex: number) {
  const op = app.operators[slotIndex];
  if (!op) return;
  const cost = getUltimateEnergyCost(op.id);
  app.handleResourceConfigChange(ultimateGraphKey(slotId), { startValue: cost, max: cost, regenPerSecond: 0 });
}

/**
 * Build the context menu and extract the addEvent payload in one call.
 * Convenience wrapper for the most common pattern:
 *   right-click column → get the "Add" action payload → call handleAddEvent.
 */
export function getMenuPayload(
  app: AppResult,
  col: Column,
  atFrame: number,
  variantLabel?: string,
): AddEventPayload {
  const items = buildContextMenu(app, col, atFrame);
  if (!items) {
    throw new Error(
      `Context menu returned null for column ${(col as MiniTimeline).columnId} at frame ${atFrame}`,
    );
  }
  return getAddEventPayload(items, variantLabel);
}
