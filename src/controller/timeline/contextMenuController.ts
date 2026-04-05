/**
 * Context menu controller — builds context menu items for column right-clicks,
 * event right-clicks, and segment/frame right-clicks.
 *
 * Returns arrays of ContextMenuItemDef with actionId+actionPayload instead of
 * closures, allowing the view to map actionIds to callbacks.
 */
import { TimelineEvent, Column, MiniTimeline, ContextMenuItem, getAnimationDurationFromSegments } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import { ColumnType, MicroColumnAssignment, InteractionModeType } from '../../consts/enums';
import { getAllSkillLabels, getAllInflictionLabels } from '../gameDataStore';
import { REACTION_LABELS } from '../../model/channels';
import { t } from '../../locales/locale';
import { formatSegmentShortName } from '../../dsl/semanticsTranslation';
import { OPERATOR_COLUMNS, ENEMY_OWNER_ID } from '../../model/channels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { getLastController } from './eventQueueController';
import { isColumnFull, isBeforeLastEvent } from './microColumnController';
import {
  checkComboWindowAvailability,
  checkVariantAvailability,
  checkResourceAvailability,
  wouldOverlapSiblings,
  isBlockedByTimeStop,
  computeProspectiveRange,
  wouldSegmentAdditionOverlap,
  getEffectiveStaggerWindows,
  type TimeStopRegion,
  type VariantAvailability,
} from './eventValidator';
import type { Slot } from './columnBuilder';
import type { ResourceGraphData } from '../../app/useResourceGraphs';
import type { StaggerBreak } from './staggerTimeline';
import { frameToDetailLabel, TOTAL_FRAMES } from '../../utils/timeline';

export interface ColumnContextMenuContext {
  events: TimelineEvent[];
  slots: Slot[];
  resourceGraphs?: Map<string, ResourceGraphData>;
  alwaysAvailableComboSlots: Set<string>;
  timeStopRegions: TimeStopRegion[];
  staggerBreaks?: readonly StaggerBreak[];
  columnPositions: Map<string, { left: number; right: number }>;
  interactionMode?: InteractionModeType;
}

/**
 * Builds context menu items for right-clicking on an empty column area.
 * Returns null if no menu should be shown.
 */
/** Build "Set as Controlled Operator" item for operator-owned columns. */
export function controlledItem(ownerId: string, atFrame: number, timeStopRegions?: TimeStopRegion[]): ContextMenuItem | null {
  if (ownerId === ENEMY_OWNER_ID || ownerId === COMMON_OWNER_ID) return null;
  const alreadyControlled = getLastController()?.isControlledAt(ownerId, atFrame) ?? false;
  const inTimeStop = timeStopRegions?.some(
    (stop) => atFrame > stop.startFrame && atFrame < stop.startFrame + stop.durationFrames,
  ) ?? false;
  const disabled = alreadyControlled || inTimeStop;
  const disabledReason = alreadyControlled ? t('ctx.alreadyControlled')
    : inTimeStop ? 'Control swap cannot occur during time-stop'
    : undefined;
  return {
    label: t('ctx.setControlled'),
    actionId: 'addEvent',
    actionPayload: {
      ownerId,
      columnId: OPERATOR_COLUMNS.INPUT,
      atFrame,
      defaultSkill: { id: NounType.CONTROL, name: NounType.CONTROL, segments: [{ properties: { duration: TOTAL_FRAMES - atFrame, name: 'Control' } }] },
    },
    disabled,
    disabledReason,
  };
}

export function buildColumnContextMenu(
  col: Column,
  atFrame: number,
  relativeClickX: number | undefined,
  ctx: ColumnContextMenuContext,
): ContextMenuItem[] | null {
  if (col.type !== ColumnType.MINI_TIMELINE) return null;
  if (col.derived && ctx.interactionMode === InteractionModeType.STRICT) return null;

  const { events, slots, resourceGraphs, alwaysAvailableComboSlots, timeStopRegions, staggerBreaks, columnPositions, interactionMode } = ctx;

  const ctrlItem = controlledItem(col.ownerId, atFrame, timeStopRegions);

  // Resource columns: show "Edit Resource" only
  if (col.noAdd && resourceGraphs?.has(col.key)) {
    return [
      { label: col.label, header: true },
      { label: t('ctx.editResource'), actionId: 'editResource', actionPayload: col.key },
      ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
    ];
  }
  if (col.noAdd && interactionMode === InteractionModeType.STRICT) return null;

  const headerItem: ContextMenuItem = { label: t('ctx.header.add', { frame: frameToDetailLabel(atFrame) }), header: true };

  const checkOverlap = (ownerId: string, columnId: string, range: number) =>
    wouldOverlapSiblings(ownerId, columnId, atFrame, range, events);

  const timeStop = isBlockedByTimeStop(col.columnId, atFrame, timeStopRegions, getAnimationDurationFromSegments(col.defaultEvent?.segments));
  const inTimeStop = timeStop.blocked;
  const timeStopReason = timeStop.reason;

  if (col.microColumns && col.microColumnAssignment === MicroColumnAssignment.DYNAMIC_SPLIT) {
    const mcItems = col.microColumns.filter(mc => !mc.permanent).map((mc) => {
      // Check stack limit per micro-column
      const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
      const mcEvents = events.filter(
        (ev) => ev.ownerId === col.ownerId && (matchSet ? ev.columnId === mc.id : ev.columnId === col.columnId),
      );
      const mcFull = col.maxEvents != null && mcEvents.length >= col.maxEvents;
      return {
        label: REACTION_LABELS[mc.id]?.label ?? mc.label,
        actionId: 'addEvent' as const,
        actionPayload: { ownerId: col.ownerId, columnId: mc.id, atFrame, defaultSkill: mc.defaultEvent ?? col.defaultEvent ?? null },
        disabled: mcFull || inTimeStop,
        disabledReason: mcFull ? t('ctx.stacksFull', { current: String(mcEvents.length), max: String(col.maxEvents ?? '?') }) : inTimeStop ? timeStopReason : undefined,
      };
    }).sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
    return [
      headerItem,
      ...mcItems,
      ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
    ];
  }

  if (col.microColumns && col.microColumnAssignment === MicroColumnAssignment.BY_COLUMN_ID) {
    const colPos = columnPositions.get(col.key);
    if (!colPos || relativeClickX === undefined) return null;
    const microW = (colPos.right - colPos.left) / col.microColumns.length;
    const mcIdx = Math.max(0, Math.min(col.microColumns.length - 1, Math.floor(relativeClickX / microW)));
    const mc = col.microColumns[mcIdx];
    return [
      headerItem,
      {
        label: mc.label,
        actionId: 'addEvent',
        actionPayload: { ownerId: col.ownerId, columnId: mc.id, atFrame, defaultSkill: mc.defaultEvent ?? col.defaultEvent ?? null },
        disabled: inTimeStop,
        disabledReason: inTimeStop ? timeStopReason : undefined,
      },
      ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
    ];
  }

  if (col.microColumns && col.microColumnAssignment === MicroColumnAssignment.BY_ORDER) {
    const full = isColumnFull(col, events, atFrame);
    const beforePrev = isBeforeLastEvent(col, events, atFrame);
    const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
    const existing = events.filter(
      (ev) => ev.ownerId === col.ownerId &&
        (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
    );

    if (col.matchColumnIds && col.microColumns) {
      const mcItems = col.microColumns.map((mc) => ({
        label: getAllInflictionLabels()[mc.id] ?? mc.label,
        actionId: 'addEvent' as const,
        actionPayload: {
          ownerId: col.ownerId,
          columnId: mc.id,
          atFrame,
          defaultSkill: mc.defaultEvent ?? (col.defaultEvent
            ? { ...col.defaultEvent, id: mc.id, name: getAllInflictionLabels()[mc.id] ?? mc.id }
            : null),
        },
        disabled: inTimeStop,
        disabledReason: inTimeStop ? timeStopReason : undefined,
      })).sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
      return [
        headerItem,
        ...mcItems,
        ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
      ];
    }

    // Single-column stacking (MF) — stack limit is always enforced; ordering/time-stop are strict-only
    const strict = interactionMode === InteractionModeType.STRICT;
    const disabled = full || (strict && (inTimeStop || beforePrev));
    const rawName = col.defaultEvent?.id ?? col.label;
    const eventName = getAllSkillLabels()[rawName as string] ?? getAllInflictionLabels()[rawName] ?? col.defaultEvent?.name ?? rawName;
    const disabledReason = inTimeStop
      ? t('ctx.ultimateActive')
      : full
        ? t('ctx.stacksFull', { current: String(col.maxEvents ?? '?'), max: String(col.maxEvents ?? '?') })
        : beforePrev
          ? t('ctx.stacksOrder', { number: String(existing.length) })
          : '';
    return [
      headerItem,
      {
        label: eventName,
        actionId: 'addEvent',
        actionPayload: { ownerId: col.ownerId, columnId: col.columnId, atFrame, defaultSkill: col.defaultEvent ?? null },
        disabled,
        disabledReason: disabledReason || undefined,
      },
      ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
    ];
  }

  // Simple single-column mini-timeline (skill columns)
  const rawName = col.defaultEvent?.id ?? col.label;
  const eventName = getAllSkillLabels()[rawName as string] ?? getAllInflictionLabels()[rawName] ?? col.defaultEvent?.name ?? rawName;

  if (col.columnId === NounType.COMBO) {
    const comboAvail = checkComboWindowAvailability(col.ownerId, atFrame, events, alwaysAvailableComboSlots);
    const variants = col.eventVariants && col.eventVariants.length > 1 ? col.eventVariants : null;

    if (variants) {
      // Multiple combo variants (e.g. normal + empowered) — show each with individual availability
      return [
        headerItem,
        ...variants.map((v) => {
          const availability = checkVariantAvailability(v.id, col.ownerId, events, atFrame, col.columnId, slots);
          const overlap = checkOverlap(col.ownerId, col.columnId, computeProspectiveRange(v, atFrame, timeStopRegions));
          const disabled = interactionMode === InteractionModeType.STRICT && (inTimeStop || !comboAvail.available || availability.disabled || overlap);
          const displayName = v.displayName ?? getAllSkillLabels()[v.id as string] ?? v.name ?? v.id;
          const reason = inTimeStop ? timeStopReason
            : !comboAvail.available ? comboAvail.reason
            : availability.disabled ? availability.reason
            : overlap ? t('ctx.overlap') : undefined;
          // Build supplied-parameter expansion buttons for combo variants
          const comboParamDefs = v.suppliedParameters?.VARY_BY;
          const comboParamButtons = comboParamDefs && comboParamDefs.length > 0 && !disabled
            ? comboParamDefs.flatMap((param) => {
              const buttons: NonNullable<ContextMenuItem['inlineButtons']> = [];
              for (let val = param.lowerRange; val <= param.upperRange; val++) {
                buttons.push({
                  label: `×${val}`,
                  actionId: 'addEvent' as const,
                  actionPayload: {
                    ownerId: col.ownerId,
                    columnId: col.columnId,
                    atFrame,
                    defaultSkill: { ...v, comboTriggerColumnId: comboAvail.comboTriggerColumnId, parameterValues: { [param.id]: val } },
                  },
                  disabled: false,
                });
              }
              return buttons;
            })
            : undefined;
          return {
            label: displayName,
            actionId: 'addEvent' as const,
            actionPayload: {
              ownerId: col.ownerId,
              columnId: col.columnId,
              atFrame,
              defaultSkill: { ...v, comboTriggerColumnId: comboAvail.comboTriggerColumnId },
            },
            disabled,
            disabledReason: reason,
            ...(comboParamButtons ? { inlineLabel: comboParamDefs![0].name } : {}),
            inlineButtons: comboParamButtons,
          };
        }),
        ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
      ];
    }

    // Single combo variant — show as one item
    const overlap = checkOverlap(col.ownerId, col.columnId, computeProspectiveRange(col.defaultEvent ?? null, atFrame, timeStopRegions));
    const disabled = interactionMode === InteractionModeType.STRICT && (inTimeStop || !comboAvail.available || overlap);
    const reason = inTimeStop ? timeStopReason
      : !comboAvail.available ? comboAvail.reason
      : overlap ? t('ctx.overlap') : undefined;

    // Build supplied-parameter expansion buttons for single combo
    const singleComboParams = col.defaultEvent?.suppliedParameters?.VARY_BY;
    const singleComboParamButtons = singleComboParams && singleComboParams.length > 0 && !disabled
      ? singleComboParams.flatMap((param) => {
        const buttons: NonNullable<ContextMenuItem['inlineButtons']> = [];
        for (let val = param.lowerRange; val <= param.upperRange; val++) {
          buttons.push({
            label: `×${val}`,
            actionId: 'addEvent' as const,
            actionPayload: {
              ownerId: col.ownerId,
              columnId: col.columnId,
              atFrame,
              defaultSkill: { ...col.defaultEvent, comboTriggerColumnId: comboAvail.comboTriggerColumnId, parameterValues: { [param.id]: val } },
            },
            disabled: false,
          });
        }
        return buttons;
      })
      : undefined;

    return [
      headerItem,
      {
        label: eventName,
        actionId: 'addEvent',
        actionPayload: {
          ownerId: col.ownerId,
          columnId: col.columnId,
          atFrame,
          defaultSkill: { ...col.defaultEvent, comboTriggerColumnId: comboAvail.comboTriggerColumnId },
        },
        disabled,
        disabledReason: reason,
        ...(singleComboParamButtons ? { inlineLabel: singleComboParams![0].name } : {}),
        inlineButtons: singleComboParamButtons,
      },
      ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
    ];
  }

  if (col.eventVariants && col.eventVariants.length > 0) {
    const spAvail = resourceGraphs
      ? checkResourceAvailability(col.columnId, col.ownerId, atFrame, resourceGraphs, slots)
      : { sufficient: true };
    const spInsufficient = !spAvail.sufficient;
    const spReason = spAvail.reason;

    return [
      headerItem,
      ...col.eventVariants.map((v) => {
        const availability = checkVariantAvailability(v.id, col.ownerId, events, atFrame, col.columnId, slots);
        const variantStackLimit = (v.stacks?.limit as { value?: number } | undefined)?.value ?? 1;
        const overlap = variantStackLimit > 1 ? false : checkOverlap(col.ownerId, col.columnId, computeProspectiveRange(v, atFrame, timeStopRegions));
        let finisherBlock: string | undefined;
        if (v.id === NounType.FINISHER && staggerBreaks) {
          const effectiveBreaks = getEffectiveStaggerWindows(events, staggerBreaks);
          const inBreak = effectiveBreaks.find((b) => atFrame >= b.startFrame && atFrame < b.endFrame);
          if (!inBreak) {
            finisherBlock = t('ctx.finisher.outsideBreak');
          } else {
            const existing = events.some((ev) =>
              ev.id === NounType.FINISHER
              && ev.startFrame >= inBreak.startFrame && ev.startFrame < inBreak.endFrame,
            );
            if (existing) finisherBlock = t('ctx.finisher.duplicate');
          }
        }
        const hasSegmentDisable = (availability.disabledSegments?.size ?? 0) > 0;
        const disabled = interactionMode === InteractionModeType.STRICT && (inTimeStop || v.disabled || availability.disabled || overlap || spInsufficient || !!finisherBlock || hasSegmentDisable);
        const displayName = v.isPerfectDodge ? 'Dodge'
          : v.id === NounType.DASH ? 'Dash'
          : v.displayName ?? getAllSkillLabels()[v.id as string] ?? getAllInflictionLabels()[v.id] ?? v.name ?? v.id;
        const reason = v.disabledReason
          ?? (hasSegmentDisable ? t('ctx.segmentDisabled')
          : inTimeStop ? timeStopReason
          : spInsufficient ? spReason
          : availability.disabled ? availability.reason
          : finisherBlock ? finisherBlock
          : overlap ? t('ctx.overlap')
          : undefined);
        // Build inline segment buttons for BATK variants with multiple segments
        const isBatkChain = col.columnId === NounType.BASIC_ATTACK
          && v.segments && v.segments.length > 1
          && v.id !== NounType.FINISHER && v.id !== NounType.DIVE;
        const inlineButtons = isBatkChain
          ? v.segments!.map((seg, segIdx) => {
            const segOverlap = checkOverlap(col.ownerId, col.columnId, computeProspectiveRange({ segments: [seg] }, atFrame, timeStopRegions));
            const segStatusDisabled = availability.disabledSegments?.has(segIdx) ?? false;
            const segDisabled = interactionMode === InteractionModeType.STRICT && (inTimeStop || v.disabled || availability.disabled || segOverlap || spInsufficient || segStatusDisabled);
            const segReason = v.disabledReason
              ?? (segStatusDisabled ? t('ctx.segmentDisabled')
              : inTimeStop ? timeStopReason
              : spInsufficient ? spReason
              : availability.disabled ? availability.reason
              : segOverlap ? t('ctx.overlap')
              : undefined);
            return {
              label: formatSegmentShortName(seg.properties.name, segIdx),
              actionId: 'addEvent' as const,
              actionPayload: {
                ownerId: col.ownerId,
                columnId: col.columnId,
                atFrame,
                defaultSkill: {
                  id: v.id,
                  name: v.name,
                  segments: [seg],
                  segmentOrigin: [segIdx],
                  ...(v.enhancementType ? { enhancementType: v.enhancementType } : {}),
                },
              },
              disabled: segDisabled,
              disabledReason: segReason,
            };
          })
          : undefined;

        // Build supplied-parameter expansion buttons (e.g. "×1", "×2", "×3" for Enemies Hit)
        const paramDefs = v.suppliedParameters?.VARY_BY;
        const paramButtons = paramDefs && paramDefs.length > 0 && !disabled
          ? paramDefs.flatMap((param) => {
            const buttons: NonNullable<ContextMenuItem['inlineButtons']> = [];
            for (let val = param.lowerRange; val <= param.upperRange; val++) {
              buttons.push({
                label: `×${val}`,
                actionId: 'addEvent' as const,
                actionPayload: {
                  ownerId: col.ownerId,
                  columnId: col.columnId,
                  atFrame,
                  defaultSkill: {
                    id: v.id,
                    name: v.name,
                    ...(v.segments ? { segments: v.segments } : {}),
                    ...(v.gaugeGain != null ? { gaugeGain: v.gaugeGain } : {}),
                    ...(v.teamGaugeGain != null ? { teamGaugeGain: v.teamGaugeGain } : {}),
                    ...(v.gaugeGainByEnemies ? { gaugeGainByEnemies: v.gaugeGainByEnemies } : {}),
                    ...(v.timeInteraction ? { timeInteraction: v.timeInteraction } : {}),
                    ...(v.isPerfectDodge ? { isPerfectDodge: v.isPerfectDodge } : {}),
                    ...(v.timeDependency ? { timeDependency: v.timeDependency } : {}),
                    ...(v.skillPointCost != null ? { skillPointCost: v.skillPointCost } : {}),
                    ...(v.enhancementType ? { enhancementType: v.enhancementType } : {}),
                    ...(v.activationClause ? { activationClause: v.activationClause } : {}),
                    suppliedParameters: v.suppliedParameters,
                    parameterValues: { [param.id]: val },
                  },
                },
                disabled: false,
              });
            }
            return buttons;
          })
          : undefined;

        // Merge BATK inline buttons with parameter buttons (in practice they won't coexist)
        const allInlineButtons = inlineButtons ?? paramButtons
          ?? undefined;

        return {
          label: displayName,
          disabledReason: reason,
          actionId: 'addEvent' as const,
          actionPayload: {
            ownerId: col.ownerId,
            columnId: col.columnId,
            atFrame,
            defaultSkill: {
              id: v.id,
              name: v.name,
              ...(v.segments ? { segments: v.segments } : {}),
              ...(v.gaugeGain != null ? { gaugeGain: v.gaugeGain } : {}),
              ...(v.teamGaugeGain != null ? { teamGaugeGain: v.teamGaugeGain } : {}),
              ...(v.gaugeGainByEnemies ? { gaugeGainByEnemies: v.gaugeGainByEnemies } : {}),
              ...(v.timeInteraction ? { timeInteraction: v.timeInteraction } : {}),
              ...(v.isPerfectDodge ? { isPerfectDodge: v.isPerfectDodge } : {}),
              ...(v.timeDependency ? { timeDependency: v.timeDependency } : {}),
              ...(v.skillPointCost != null ? { skillPointCost: v.skillPointCost } : {}),
              ...(v.enhancementType ? { enhancementType: v.enhancementType } : {}),
              ...(v.activationClause ? { activationClause: v.activationClause } : {}),
              ...(v.suppliedParameters ? { suppliedParameters: v.suppliedParameters } : {}),
              ...(v.stacks ? { stacks: v.stacks } : {}),
            },
          },
          disabled,
          ...(paramButtons && paramDefs ? { inlineLabel: paramDefs[0].name } : {}),
          ...(isBatkChain ? { segmentTabs: true } : {}),
          inlineButtons: allInlineButtons,
        };
      }),
      ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
    ];
  }

  // Default: simple column
  const overlap = checkOverlap(col.ownerId, col.columnId, computeProspectiveRange(col.defaultEvent ?? null, atFrame, timeStopRegions));
  const resAvail = resourceGraphs
    ? checkResourceAvailability(col.columnId, col.ownerId, atFrame, resourceGraphs, slots)
    : { sufficient: true };
  const defaultName = col.defaultEvent?.id;
  const availability = defaultName
    ? checkVariantAvailability(defaultName, col.ownerId, events, atFrame, col.columnId, slots)
    : { disabled: false } as VariantAvailability;
  const disabled = interactionMode === InteractionModeType.STRICT && (inTimeStop || overlap || !resAvail.sufficient || availability.disabled);
  const reason = inTimeStop ? timeStopReason : overlap ? t('ctx.overlap') : !resAvail.sufficient ? resAvail.reason : availability.disabled ? availability.reason : undefined;
  return [
    headerItem,
    ...(resourceGraphs?.has(col.key) ? [
      { label: t('ctx.editResource'), actionId: 'editResource' as const, actionPayload: col.key },
      { separator: true } as ContextMenuItem,
    ] : []),
    (() => {
      const defs = col.defaultEvent?.suppliedParameters?.VARY_BY;
      const defParamButtons = defs && defs.length > 0 && !disabled
        ? defs.flatMap((param) => {
          const buttons: NonNullable<ContextMenuItem['inlineButtons']> = [];
          for (let val = param.lowerRange; val <= param.upperRange; val++) {
            buttons.push({
              label: `×${val}`,
              actionId: 'addEvent' as const,
              actionPayload: { ownerId: col.ownerId, columnId: col.columnId, atFrame, defaultSkill: { ...col.defaultEvent, parameterValues: { [param.id]: val } } },
              disabled: false,
            });
          }
          return buttons;
        })
        : undefined;
      return {
        label: eventName,
        actionId: 'addEvent' as const,
        actionPayload: { ownerId: col.ownerId, columnId: col.columnId, atFrame, defaultSkill: col.defaultEvent ?? null },
        disabled,
        disabledReason: reason,
        ...(defParamButtons && defs ? { inlineLabel: defs[0].name } : {}),
        inlineButtons: defParamButtons,
      };
    })(),
    ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
  ];
}

/**
 * Builds "Add" items for stackable columns when right-clicking an event.
 */
export function buildEventAddItems(
  ev: TimelineEvent,
  columns: Column[],
  events: TimelineEvent[],
  atFrame: number,
  label: string,
  onAddEventActionId: string,
  interactionMode?: InteractionModeType,
): ContextMenuItem[] {
  const col = columns.find((c) => {
    if (c.type !== ColumnType.MINI_TIMELINE || !c.microColumns || c.microColumnAssignment !== MicroColumnAssignment.BY_ORDER) return false;
    if (c.matchColumnIds) return c.ownerId === ev.ownerId && c.matchColumnIds.includes(ev.columnId);
    return c.ownerId === ev.ownerId && c.columnId === ev.columnId;
  }) as MiniTimeline | undefined;

  if (!col) return [];

  if (col.matchColumnIds && col.microColumns) {
    return col.microColumns.map((mc) => ({
      label: t('ctx.addAt', { item: mc.label, location: label }),
      actionId: onAddEventActionId,
      actionPayload: { ownerId: col.ownerId, columnId: mc.id, atFrame, defaultSkill: col.defaultEvent ?? null },
    }));
  }

  // Single-column stacking (MF)
  const full = isColumnFull(col, events, atFrame);
  const beforePrev = isBeforeLastEvent(col, events, atFrame);
  const disabled = interactionMode === InteractionModeType.STRICT && (full || beforePrev);
  const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
  const existing = events.filter(
    (ev) => ev.ownerId === col.ownerId &&
      (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
  );
  const maxLabel = col.maxEvents ?? '?';
  const rawName = col.defaultEvent?.id ?? col.label;
  const eventName = getAllSkillLabels()[rawName as string] ?? getAllInflictionLabels()[rawName] ?? col.defaultEvent?.name ?? rawName;
  const disabledReason = full
    ? `${maxLabel}/${maxLabel} stacks`
    : beforePrev
      ? `Must be after stack ${existing.length}`
      : undefined;
  return [{
    label: t('ctx.addAt', { item: eventName, location: label }),
    actionId: onAddEventActionId,
    actionPayload: { ownerId: col.ownerId, columnId: col.columnId, atFrame, defaultSkill: col.defaultEvent ?? null },
    disabled,
    disabledReason,
  }];
}

/**
 * Builds "Add Segment" items for a sequenced event.
 */
export function buildSegmentAddItems(
  eventUid: string,
  events: TimelineEvent[],
  columns: Column[],
  interactionMode?: InteractionModeType,
): ContextMenuItem[] {
  const ev = events.find((e) => e.uid === eventUid);
  if (!ev) return [];
  const col = columns.find((c): c is MiniTimeline =>
    c.type === ColumnType.MINI_TIMELINE && c.ownerId === ev.ownerId && c.columnId === ev.columnId);
  const allSegments = col?.defaultEvent?.segments;
  if (!allSegments || allSegments.length <= 1) return [];
  const addable = allSegments.filter((s) => s.properties.name);
  if (addable.length === 0) return [];
  return addable.map((s) => {
    const wouldOverlap = wouldSegmentAdditionOverlap(ev, s.properties.duration, events);
    return {
      label: t('ctx.addSequence', { name: s.properties.name! }),
      actionId: 'addSegment',
      actionPayload: { eventUid, segmentLabel: s.properties.name! },
      disabled: interactionMode === InteractionModeType.STRICT && wouldOverlap,
      disabledReason: wouldOverlap ? t('ctx.overlap') : undefined,
    };
  });
}

/**
 * Builds "Add Frame" items for a segment.
 */
export function buildFrameAddItems(
  eventUid: string,
  segmentIndex: number,
  events: TimelineEvent[],
  columns: Column[],
): ContextMenuItem[] {
  const ev = events.find((e) => e.uid === eventUid);
  if (!ev?.segments[segmentIndex]) return [];
  const col = columns.find((c): c is MiniTimeline =>
    c.type === ColumnType.MINI_TIMELINE && c.ownerId === ev.ownerId && c.columnId === ev.columnId);
  const seg = ev.segments[segmentIndex];
  const allDefaultSegs = col?.defaultEvent?.segments;
  const defaultSeg = allDefaultSegs?.find((s) => s.properties.name === seg.properties.name) ?? allDefaultSegs?.[segmentIndex];
  const allFrames = defaultSeg?.frames;
  if (!allFrames || allFrames.length <= 0) return [];
  const presentOffsets = new Set((seg.frames ?? []).map((f) => f.offsetFrame));
  const missing = allFrames.filter((f) => !presentOffsets.has(f.offsetFrame));
  if (missing.length === 0) return [];
  return missing.map((f) => {
    const allIdx = allFrames.indexOf(f);
    return {
      label: t('ctx.addFrame', { number: String(allIdx + 1) }),
      actionId: 'addFrame',
      actionPayload: { eventUid, segmentIndex, frameOffsetFrame: f.offsetFrame },
    };
  });
}
