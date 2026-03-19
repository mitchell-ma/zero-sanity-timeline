/**
 * Event presentation controller — computes display properties (variant, label,
 * color, flags) for timeline events.
 *
 * CombatPlanner replaces buildBaseEventProps + inline overrides with a single
 * call to computeEventPresentation().
 */
import { TimelineEvent, Column, EventSegmentData } from '../../consts/viewTypes';
import { TimelineSourceType, ELEMENT_COLORS, ElementType, InteractionModeType } from '../../consts/enums';
import { COMBAT_SKILL_LABELS, INFLICTION_EVENT_LABELS } from '../../consts/timelineColumnLabels';
import { CombatSkillsType } from '../../consts/enums';
import { SKILL_COLUMNS } from '../../model/channels';
import { COMBO_WINDOW_COLUMN_ID } from './processInteractions';

import type { Slot } from './columnBuilder';
import type { ValidationMaps } from './eventValidationController';
import { aggregateEventWarnings } from './eventValidationController';
import type { StatusViewOverride } from './statusViewController';

function isWindowConsumed(windowEv: TimelineEvent, events: readonly TimelineEvent[]): boolean {
  const endFrame = windowEv.startFrame + windowEv.activationDuration;
  return events.some((ev) =>
    ev.columnId === SKILL_COLUMNS.COMBO &&
    ev.ownerId === windowEv.ownerId &&
    ev.startFrame >= windowEv.startFrame &&
    ev.startFrame < endFrame,
  );
}

export interface EventPresentation {
  variant: 'default' | 'ultimate' | 'sequenced';
  label: string;
  color: string;
  comboWarning: string | null;
  striped: boolean;
  passive: boolean;
  notDraggable: boolean;
  derived: boolean;
  isAutoFinisher: boolean;
  skillElement?: string;
  allSegmentLabels?: string[];
  allDefaultSegments?: EventSegmentData[];
  /** If set, overrides the event's activationDuration for visual rendering only. */
  visualActivationDuration?: number;
}

/**
 * Resolves the display label for an event.
 */
export function resolveEventLabel(ev: TimelineEvent): string {
  if (ev.isPerfectDodge) return 'Dodge';
  return COMBAT_SKILL_LABELS[ev.name as CombatSkillsType]
    ?? INFLICTION_EVENT_LABELS[ev.name]
    ?? ev.name;
}

/**
 * Resolves the color for an event based on column config and sequencing.
 */
export function resolveEventColor(
  ev: TimelineEvent,
  col: Column,
  slotElementColors: Record<string, string>,
): string {
  if (col.type !== 'mini-timeline') return col.color;
  const isSequenced = ev.segments && ev.segments.length > 0;
  if (!isSequenced) return col.color;
  const skillElColor = col.skillElement
    ? ELEMENT_COLORS[col.skillElement as ElementType]
    : undefined;
  return skillElColor ?? slotElementColors[col.ownerId] ?? col.color;
}

/**
 * Computes the element color map for all slots.
 */
export function computeSlotElementColors(slots: Slot[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of slots) {
    if (s.operator) {
      map[s.slotId] = ELEMENT_COLORS[s.operator.element as ElementType] ?? s.operator.color;
    }
  }
  return map;
}

/**
 * Computes full presentation props for a single event in a column context.
 */
export function computeEventPresentation(
  ev: TimelineEvent,
  col: Column,
  options: {
    slotElementColors: Record<string, string>;
    alwaysAvailableComboSlots: Set<string>;
    autoFinisherIds: Set<string>;
    validationMaps: ValidationMaps;
    interactionMode?: InteractionModeType;
    statusViewOverrides?: Map<string, StatusViewOverride>;
    events?: readonly TimelineEvent[];
  },
): EventPresentation {
  const { slotElementColors, alwaysAvailableComboSlots, autoFinisherIds, validationMaps, interactionMode, statusViewOverrides, events } = options;
  const isSequenced = ev.segments && ev.segments.length > 0;
  const isWindow = ev.columnId === COMBO_WINDOW_COLUMN_ID;
  const isDerivedCol = col.type === 'mini-timeline' && !!col.derived && interactionMode === InteractionModeType.STRICT;
  const isEnemy = col.type === 'mini-timeline' && col.source === TimelineSourceType.ENEMY;

  const variant = (col.type === 'mini-timeline' && col.columnId === SKILL_COLUMNS.ULTIMATE
    ? 'ultimate'
    : isSequenced ? 'sequenced' : 'default') as 'default' | 'ultimate' | 'sequenced';

  // Status view override: stack-aware label + visual truncation
  const statusOverride = statusViewOverrides?.get(ev.id);
  const label = isWindow
    ? (events && isWindowConsumed(ev, events) ? '' : 'COMBO ACTIVATION WINDOW')
    : (statusOverride?.label ?? resolveEventLabel(ev));
  const color = resolveEventColor(ev, col, slotElementColors);

  // Aggregate warnings — infliction-only for micro-column events, full for single-column
  const comboWarning = isWindow
    ? null
    : aggregateEventWarnings(ev.id, validationMaps);

  const striped = col.type === 'mini-timeline'
    && col.columnId === SKILL_COLUMNS.COMBO
    && !isWindow
    && !alwaysAvailableComboSlots.has(col.ownerId);

  const passive = isWindow;
  const notDraggable = isWindow || isDerivedCol || (isEnemy && interactionMode === InteractionModeType.STRICT);
  const derived = isDerivedCol;
  const isAutoFinisher = autoFinisherIds.has(ev.id);

  const skillElement = isWindow
    ? undefined
    : col.type === 'mini-timeline' ? col.skillElement : undefined;

  // Segment/frame metadata for sequenced events
  let allSegmentLabels: string[] | undefined;
  let allDefaultSegments: EventSegmentData[] | undefined;
  if (!isWindow && col.type === 'mini-timeline') {
    const variantSegs = col.eventVariants?.find((v) => v.name === ev.name)?.segments
      ?? col.defaultEvent?.segments;
    allSegmentLabels = variantSegs?.map((s) => s.label!);
    allDefaultSegments = variantSegs;
  }

  return {
    variant,
    label,
    color,
    comboWarning,
    striped,
    passive,
    notDraggable,
    derived,
    isAutoFinisher,
    skillElement,
    allSegmentLabels,
    allDefaultSegments,
    visualActivationDuration: statusOverride?.visualActivationDuration,
  };
}
