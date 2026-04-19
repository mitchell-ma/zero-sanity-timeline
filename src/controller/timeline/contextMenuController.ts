/**
 * Context menu controller — builds context menu items for column right-clicks,
 * event right-clicks, and segment/frame right-clicks.
 *
 * Returns arrays of ContextMenuItemDef with actionId+actionPayload instead of
 * closures, allowing the view to map actionIds to callbacks.
 */
import { TimelineEvent, Column, MiniTimeline, ContextMenuItem, ContextMenuParameterSubmenu, ContextMenuParamAxis, ContextMenuParamOption, EventSegmentData, getAnimationDurationFromSegments } from '../../consts/viewTypes';
import { NounType, VerbType, type Effect } from '../../dsl/semantics';
import type { FrameClausePredicate } from '../../model/event-frames/skillEventFrame';
import { ColumnType, MicroColumnAssignment, InteractionModeType, ContextMenuAxisKind } from '../../consts/enums';
import { getAllSkillLabels, getAllInflictionLabels, getStatusById } from '../gameDataStore';
import { REACTION_LABELS, REACTION_COLUMN_IDS } from '../../model/channels';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';
import { t } from '../../locales/locale';
import { formatSegmentShortName } from '../../dsl/semanticsTranslation';
import { OPERATOR_COLUMNS, ENEMY_ID } from '../../model/channels';
import { TEAM_ID } from '../slot/commonSlotController';
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

/** Build a right-side parameter submenu — one axis per supplied parameter,
 *  each rendered as a single row of inline options (e.g. "Enemies Hit: ×1 ×2 ×3").
 *  Returns undefined when no params exist. */
function buildParameterSubmenu(
  params: readonly { id: string; name: string; lowerRange: number; upperRange: number; default: number }[] | undefined,
): ContextMenuParameterSubmenu | undefined {
  if (!params || params.length === 0) return undefined;
  const axes: ContextMenuParamAxis[] = [];
  for (const param of params) {
    const options: ContextMenuParamOption[] = [];
    for (let val = param.lowerRange; val <= param.upperRange; val++) {
      options.push({ label: `\u00d7${val}`, value: val, isDefault: val === param.default });
    }
    axes.push({ paramId: param.id, paramName: param.name, options, kind: ContextMenuAxisKind.PARAMETER });
  }
  return axes;
}

/** Seed parameterValues with each axis's default value. Skips non-PARAMETER axes
 *  (stacks/statusLevel do not ride on event.parameterValues). */
function defaultParamValues(submenu: ContextMenuParameterSubmenu | undefined): Record<string, number> | undefined {
  if (!submenu || submenu.length === 0) return undefined;
  const out: Record<string, number> = {};
  for (const axis of submenu) {
    if (axis.kind !== ContextMenuAxisKind.PARAMETER) continue;
    const def = axis.options.find((o) => o.isDefault) ?? axis.options[0];
    out[axis.paramId] = def.value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const ROMAN_NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Resolve the stacks cap for a status/reaction column — reads `stacks.limit`
 *  from the JSON config. Reactions are hard-capped at 4 (StatusLevel 1..4).
 *  Returns undefined when the column is not stackable. */
function resolveStacksCap(columnId: string): number | undefined {
  if (REACTION_COLUMN_IDS.has(columnId)) return 4;
  const cfg = getStatusById(columnId);
  const limitNode = cfg?.stacks?.limit;
  if (!limitNode) return undefined;
  const resolved = resolveValueNode(limitNode, DEFAULT_VALUE_CONTEXT);
  return resolved > 1 ? resolved : undefined;
}

/**
 * Bake a chosen reaction `statusLevel` into the freeform APPLY REACTION clause
 * on the given default-skill segments. Walks segments → frames → clauses →
 * effects, finds each `APPLY STATUS REACTION <X>` dsl effect, and replaces
 * `with.statusLevel` with `{ IS, level }`. Non-reaction APPLY effects and
 * non-dsl effects are passed through unchanged.
 *
 * Returns a new segments array — inputs are not mutated.
 */
export function injectStatusLevelIntoSegments(
  segments: readonly EventSegmentData[] | undefined,
  level: number,
): EventSegmentData[] | undefined {
  if (!segments) return undefined;
  return segments.map((seg) => {
    if (!seg.frames) return seg;
    const frames = seg.frames.map((f) => {
      if (!f.clause) return f;
      const clauses: FrameClausePredicate[] = f.clause.map((clause) => {
        const effects = clause.effects.map((dsl) => {
          if (dsl.verb !== VerbType.APPLY || dsl.objectId !== NounType.REACTION) return dsl;
          return {
            ...dsl,
            with: { ...(dsl.with ?? {}), statusLevel: { verb: VerbType.IS, value: level } },
          } as Effect;
        });
        return { ...clause, effects };
      });
      return { ...f, clause: clauses };
    });
    return { ...seg, frames };
  });
}

/** Build a stacks/statusLevel axis for a stackable column.
 *  - Reactions (REACTION_COLUMN_IDS): STATUS_LEVEL axis, I/II/III/IV labels.
 *  - Other stackable columns: STACKS axis, 1..cap labels (stepper when cap > 4).
 *  Default selection is 1 so plain clicks preserve pre-feature behavior. */
function buildStacksAxis(columnId: string): ContextMenuParamAxis | undefined {
  const cap = resolveStacksCap(columnId);
  if (cap == null) return undefined;
  const isReaction = REACTION_COLUMN_IDS.has(columnId);
  const kind = isReaction ? ContextMenuAxisKind.STATUS_LEVEL : ContextMenuAxisKind.STACKS;
  const paramId = isReaction ? NounType.STATUS_LEVEL : NounType.STACKS;
  const paramName = isReaction ? 'Status Level' : 'Stacks';
  const useStepper = cap > 4;
  const options: ContextMenuParamOption[] = useStepper
    ? [{ label: '1', value: 1, isDefault: true }]
    : Array.from({ length: cap }, (_, i) => ({
        label: isReaction ? ROMAN_NUMERALS[i + 1] : String(i + 1),
        value: i + 1,
        isDefault: i === 0,
      }));
  return { paramId, paramName, options, kind, useStepper, min: 1, max: cap };
}

/**
 * Builds context menu items for right-clicking on an empty column area.
 * Returns null if no menu should be shown.
 */
/** Build "Set as Controlled Operator" item for operator-owned columns. */
export function controlledItem(ownerEntityId: string, atFrame: number, timeStopRegions?: TimeStopRegion[]): ContextMenuItem | null {
  if (ownerEntityId === ENEMY_ID || ownerEntityId === TEAM_ID) return null;
  const alreadyControlled = getLastController()?.isControlledAt(ownerEntityId, atFrame) ?? false;
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
      ownerEntityId,
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

  const ctrlItem = controlledItem(col.ownerEntityId, atFrame, timeStopRegions);

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

  const checkOverlap = (ownerEntityId: string, columnId: string, range: number) =>
    wouldOverlapSiblings(ownerEntityId, columnId, atFrame, range, events);

  const timeStop = isBlockedByTimeStop(col.columnId, atFrame, timeStopRegions, getAnimationDurationFromSegments(col.defaultEvent?.segments));
  const inTimeStop = timeStop.blocked;
  const timeStopReason = timeStop.reason;

  if (col.microColumns && col.microColumnAssignment === MicroColumnAssignment.DYNAMIC_SPLIT) {
    const mcItems = col.microColumns.filter(mc => !mc.permanent).map((mc) => {
      // Check stack limit per micro-column
      const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
      const mcEvents = events.filter(
        (ev) => ev.ownerEntityId === col.ownerEntityId && (matchSet ? ev.columnId === mc.id : ev.columnId === col.columnId),
      );
      const mcFull = col.maxEvents != null && mcEvents.length >= col.maxEvents;
      const mcDisabled = mcFull || inTimeStop;
      const stacksAxis = !mcDisabled ? buildStacksAxis(mc.id) : undefined;
      const submenu: ContextMenuParameterSubmenu | undefined = stacksAxis ? [stacksAxis] : undefined;
      return {
        label: REACTION_LABELS[mc.id]?.label ?? mc.label,
        actionId: 'addEvent' as const,
        actionPayload: { ownerEntityId: col.ownerEntityId, columnId: mc.id, atFrame, defaultSkill: mc.defaultEvent ?? col.defaultEvent ?? null },
        disabled: mcDisabled,
        disabledReason: mcFull ? t('ctx.stacksFull', { current: String(mcEvents.length), max: String(col.maxEvents ?? '?') }) : inTimeStop ? timeStopReason : undefined,
        ...(submenu ? { parameterSubmenu: submenu } : {}),
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
        actionPayload: { ownerEntityId: col.ownerEntityId, columnId: mc.id, atFrame, defaultSkill: mc.defaultEvent ?? col.defaultEvent ?? null },
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
      (ev) => ev.ownerEntityId === col.ownerEntityId &&
        (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
    );

    if (col.matchColumnIds && col.microColumns) {
      const mcItems = col.microColumns.map((mc) => {
        const stacksAxis = !inTimeStop ? buildStacksAxis(mc.id) : undefined;
        const submenu: ContextMenuParameterSubmenu | undefined = stacksAxis ? [stacksAxis] : undefined;
        return {
          label: getAllInflictionLabels()[mc.id] ?? mc.label,
          actionId: 'addEvent' as const,
          actionPayload: {
            ownerEntityId: col.ownerEntityId,
            columnId: mc.id,
            atFrame,
            defaultSkill: mc.defaultEvent ?? (col.defaultEvent
              ? { ...col.defaultEvent, id: mc.id, name: getAllInflictionLabels()[mc.id] ?? mc.id }
              : null),
          },
          disabled: inTimeStop,
          disabledReason: inTimeStop ? timeStopReason : undefined,
          ...(submenu ? { parameterSubmenu: submenu } : {}),
        };
      }).sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
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
    const singleStacksAxis = !disabled ? buildStacksAxis(col.columnId) : undefined;
    const singleStacksSubmenu: ContextMenuParameterSubmenu | undefined = singleStacksAxis ? [singleStacksAxis] : undefined;
    return [
      headerItem,
      {
        label: eventName,
        actionId: 'addEvent',
        actionPayload: { ownerEntityId: col.ownerEntityId, columnId: col.columnId, atFrame, defaultSkill: col.defaultEvent ?? null },
        disabled,
        disabledReason: disabledReason || undefined,
        ...(singleStacksSubmenu ? { parameterSubmenu: singleStacksSubmenu } : {}),
      },
      ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
    ];
  }

  // Simple single-column mini-timeline (skill columns)
  const rawName = col.defaultEvent?.id ?? col.label;
  const eventName = getAllSkillLabels()[rawName as string] ?? getAllInflictionLabels()[rawName] ?? col.defaultEvent?.name ?? rawName;

  if (col.columnId === NounType.COMBO) {
    const comboAvail = checkComboWindowAvailability(col.ownerEntityId, atFrame, events, alwaysAvailableComboSlots);
    const variants = col.eventVariants && col.eventVariants.length > 1 ? col.eventVariants : null;

    if (variants) {
      // Multiple combo variants (e.g. normal + empowered) — show each with individual availability
      return [
        headerItem,
        ...variants.map((v) => {
          const availability = checkVariantAvailability(v.id, col.ownerEntityId, events, atFrame, col.columnId, slots);
          const overlap = checkOverlap(col.ownerEntityId, col.columnId, computeProspectiveRange(v, atFrame, timeStopRegions));
          const disabled = interactionMode === InteractionModeType.STRICT && (inTimeStop || !comboAvail.available || availability.disabled || overlap);
          const displayName = v.displayName ?? getAllSkillLabels()[v.id as string] ?? v.name ?? v.id;
          const reason = inTimeStop ? timeStopReason
            : !comboAvail.available ? comboAvail.reason
            : availability.disabled ? availability.reason
            : overlap ? t('ctx.overlap') : undefined;
          // Build supplied-parameter submenu for combo variants (e.g. Enemies Hit)
          const comboParamSubmenu = !disabled ? buildParameterSubmenu(v.suppliedParameters?.VARY_BY) : undefined;
          const comboDefaultParamValues = defaultParamValues(comboParamSubmenu);
          return {
            label: displayName,
            actionId: 'addEvent' as const,
            actionPayload: {
              ownerEntityId: col.ownerEntityId,
              columnId: col.columnId,
              atFrame,
              defaultSkill: {
                ...v,
                comboTriggerColumnId: comboAvail.comboTriggerColumnId,
                ...(comboDefaultParamValues ? { parameterValues: comboDefaultParamValues } : {}),
              },
            },
            disabled,
            disabledReason: reason,
            ...(comboParamSubmenu ? { parameterSubmenu: comboParamSubmenu } : {}),
          };
        }),
        ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
      ];
    }

    // Single combo variant — show as one item
    const overlap = checkOverlap(col.ownerEntityId, col.columnId, computeProspectiveRange(col.defaultEvent ?? null, atFrame, timeStopRegions));
    const disabled = interactionMode === InteractionModeType.STRICT && (inTimeStop || !comboAvail.available || overlap);
    const reason = inTimeStop ? timeStopReason
      : !comboAvail.available ? comboAvail.reason
      : overlap ? t('ctx.overlap') : undefined;

    // Build supplied-parameter submenu for single combo
    const singleComboParamSubmenu = !disabled ? buildParameterSubmenu(col.defaultEvent?.suppliedParameters?.VARY_BY) : undefined;
    const singleComboDefaultParamValues = defaultParamValues(singleComboParamSubmenu);

    return [
      headerItem,
      {
        label: eventName,
        actionId: 'addEvent',
        actionPayload: {
          ownerEntityId: col.ownerEntityId,
          columnId: col.columnId,
          atFrame,
          defaultSkill: {
            ...col.defaultEvent,
            comboTriggerColumnId: comboAvail.comboTriggerColumnId,
            ...(singleComboDefaultParamValues ? { parameterValues: singleComboDefaultParamValues } : {}),
          },
        },
        disabled,
        disabledReason: reason,
        ...(singleComboParamSubmenu ? { parameterSubmenu: singleComboParamSubmenu } : {}),
      },
      ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
    ];
  }

  if (col.eventVariants && col.eventVariants.length > 0) {
    const spAvail = resourceGraphs
      ? checkResourceAvailability(col.columnId, col.ownerEntityId, atFrame, resourceGraphs, slots)
      : { sufficient: true };
    const spInsufficient = !spAvail.sufficient;
    const spReason = spAvail.reason;

    return [
      headerItem,
      ...col.eventVariants.map((v) => {
        const availability = checkVariantAvailability(v.id, col.ownerEntityId, events, atFrame, col.columnId, slots);
        const variantStackLimit = (v.stacks?.limit as { value?: number } | undefined)?.value ?? 1;
        const overlap = variantStackLimit > 1 ? false : checkOverlap(col.ownerEntityId, col.columnId, computeProspectiveRange(v, atFrame, timeStopRegions));
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
            const segOverlap = checkOverlap(col.ownerEntityId, col.columnId, computeProspectiveRange({ segments: [seg] }, atFrame, timeStopRegions));
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
                ownerEntityId: col.ownerEntityId,
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

        // Build supplied-parameter submenu (e.g. Enemies Hit: ×1 / ×2 / ×3)
        const paramSubmenu = !disabled ? buildParameterSubmenu(v.suppliedParameters?.VARY_BY) : undefined;
        const paramSubmenuDefaults = defaultParamValues(paramSubmenu);

        return {
          label: displayName,
          disabledReason: reason,
          actionId: 'addEvent' as const,
          actionPayload: {
            ownerEntityId: col.ownerEntityId,
            columnId: col.columnId,
            atFrame,
            defaultSkill: {
              id: v.id,
              name: v.name,
              ...(v.segments ? { segments: v.segments } : {}),
              ...(v.timeInteraction ? { timeInteraction: v.timeInteraction } : {}),
              ...(v.isPerfectDodge ? { isPerfectDodge: v.isPerfectDodge } : {}),
              ...(v.timeDependency ? { timeDependency: v.timeDependency } : {}),
              ...(v.skillPointCost != null ? { skillPointCost: v.skillPointCost } : {}),
              ...(v.enhancementType ? { enhancementType: v.enhancementType } : {}),
              ...(v.activationClause ? { activationClause: v.activationClause } : {}),
              ...(v.suppliedParameters ? { suppliedParameters: v.suppliedParameters } : {}),
              ...(v.stacks ? { stacks: v.stacks } : {}),
              ...(paramSubmenuDefaults ? { parameterValues: paramSubmenuDefaults } : {}),
            },
          },
          disabled,
          ...(isBatkChain ? { segmentTabs: true } : {}),
          ...(inlineButtons ? { inlineButtons } : {}),
          ...(paramSubmenu ? { parameterSubmenu: paramSubmenu } : {}),
        };
      }),
      ...(ctrlItem ? [{ separator: true } as ContextMenuItem, ctrlItem] : []),
    ];
  }

  // Default: simple column
  const overlap = checkOverlap(col.ownerEntityId, col.columnId, computeProspectiveRange(col.defaultEvent ?? null, atFrame, timeStopRegions));
  const resAvail = resourceGraphs
    ? checkResourceAvailability(col.columnId, col.ownerEntityId, atFrame, resourceGraphs, slots)
    : { sufficient: true };
  const defaultName = col.defaultEvent?.id;
  const availability = defaultName
    ? checkVariantAvailability(defaultName, col.ownerEntityId, events, atFrame, col.columnId, slots)
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
      const defParamSubmenu = !disabled ? buildParameterSubmenu(col.defaultEvent?.suppliedParameters?.VARY_BY) : undefined;
      const defDefaultParamValues = defaultParamValues(defParamSubmenu);
      const defStacksAxis = !disabled ? buildStacksAxis(col.columnId) : undefined;
      const mergedSubmenu: ContextMenuParameterSubmenu | undefined =
        defParamSubmenu || defStacksAxis ? [...(defParamSubmenu ?? []), ...(defStacksAxis ? [defStacksAxis] : [])] : undefined;
      const defaultSkill = col.defaultEvent
        ? (defDefaultParamValues ? { ...col.defaultEvent, parameterValues: defDefaultParamValues } : col.defaultEvent)
        : null;
      return {
        label: eventName,
        actionId: 'addEvent' as const,
        actionPayload: { ownerEntityId: col.ownerEntityId, columnId: col.columnId, atFrame, defaultSkill },
        disabled,
        disabledReason: reason,
        ...(mergedSubmenu ? { parameterSubmenu: mergedSubmenu } : {}),
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
    if (c.matchColumnIds) return c.ownerEntityId === ev.ownerEntityId && c.matchColumnIds.includes(ev.columnId);
    return c.ownerEntityId === ev.ownerEntityId && c.columnId === ev.columnId;
  }) as MiniTimeline | undefined;

  if (!col) return [];

  if (col.matchColumnIds && col.microColumns) {
    return col.microColumns.map((mc) => ({
      label: t('ctx.addAt', { item: mc.label, location: label }),
      actionId: onAddEventActionId,
      actionPayload: { ownerEntityId: col.ownerEntityId, columnId: mc.id, atFrame, defaultSkill: col.defaultEvent ?? null },
    }));
  }

  // Single-column stacking (MF)
  const full = isColumnFull(col, events, atFrame);
  const beforePrev = isBeforeLastEvent(col, events, atFrame);
  const disabled = interactionMode === InteractionModeType.STRICT && (full || beforePrev);
  const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
  const existing = events.filter(
    (ev) => ev.ownerEntityId === col.ownerEntityId &&
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
    actionPayload: { ownerEntityId: col.ownerEntityId, columnId: col.columnId, atFrame, defaultSkill: col.defaultEvent ?? null },
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
    c.type === ColumnType.MINI_TIMELINE && c.ownerEntityId === ev.ownerEntityId && c.columnId === ev.columnId);
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
    c.type === ColumnType.MINI_TIMELINE && c.ownerEntityId === ev.ownerEntityId && c.columnId === ev.columnId);
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
