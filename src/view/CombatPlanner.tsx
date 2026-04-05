import React, { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { TimelineCanvas } from './canvas/TimelineCanvas';
import type { ColumnLayoutRecipe } from './canvas/TimelineCanvas';
import type { TimelineRenderer } from './canvas/TimelineRenderer';
import type { CanvasRenderData } from './canvas/canvasTypes';
import { buildTimelineLayout } from '../controller/timeline/timelineLayout';
import { contractByTimeStops } from '../controller/timeline/processTimeStop';
import { NounType } from '../dsl/semantics';
import { createPortal } from 'react-dom';
// EventBlock rendering moved to TimelineColumn
import { wouldOverlapNonOverlappable } from '../controller/timeline/inputEventController';
import { DragState, computeInvalidSet, computeOverlapInvalidSet, clampDragDelta } from './combatPlannerDragUtils';
import OperatorLoadoutHeader, { OperatorLoadoutState, DropdownTierBar } from './OperatorLoadoutHeader';
import { ENEMY_TIERS } from '../utils/enemies';
import {
  pxPerFrame as getPxPerFrame,
  frameToPx,
  durationToPx,
  pxToFrame,
  timelineHeight,
  getTickMarks,
  getVisibleFrameRange,
  frameToTimeLabel,
  FPS,
  TIME_AXIS_WIDTH,
  HEADER_HEIGHT,
  TOTAL_FRAMES,
  TIMELINE_TOP_PAD,
} from '../utils/timeline';
import { OPERATOR_COLUMNS, OPERATOR_STATUS_COLUMN_ID, COMBO_WINDOW_COLUMN_ID, ENEMY_ACTION_COLUMN_ID } from '../model/channels';
import { COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import { TimelineSourceType, InteractionModeType, ColumnType, DamageType } from '../consts/enums';
import {
  Operator,
  Enemy,
  TimelineEvent,
  VisibleSkills,
  ContextMenuState,
  Column,
  MiniTimeline,
  SelectedFrame,
  computeSegmentsSpan,
} from "../consts/viewTypes";
import { computeMonotonicBounds } from '../controller/timeline/microColumnController';
import type { Slot } from '../controller/timeline/columnBuilder';
import { formatSegmentShortName } from '../dsl/semanticsTranslation';
import {
  getAlwaysAvailableComboSlots,
  computeResourceInsufficiencyZones,
  computeResourceZonesForDrag,
  isDuplicatePlacementInResourceZone,
} from '../controller/timeline/eventValidator';
import { computeAllValidations } from '../controller/timeline/eventValidationController';
import { computeSlotElementColors, computeEventPresentation, computeTimelinePresentation } from '../controller/timeline/eventPresentationController';
import {
  buildColumnContextMenu,
} from '../controller/timeline/contextMenuController';
import { useTouchHandlers } from '../utils/useTouchHandlers';
import TimelineColumn from './TimelineColumn';
import { getCritModeGeneration } from '../controller/combatStateController';
import { throttleByRAF } from '../utils/throttle';
import type { ResourcePoint } from '../controller/timeline/resourceTimeline';
import { getAxisMap, type Orientation } from '../utils/axisMap';


const MIN_SLOT_COLS = 4;
const EMPTY_WEAPON_TYPES: string[] = [];
const EMPTY_COMBO_WINDOW_EVENTS: TimelineEvent[] = [];


interface MarqueeState {
  startX: number;
  startY: number;
  ctrlKey: boolean;
  priorSelection: Set<string>;
}

interface SlotGroup {
  slot: Slot;
  columnCount: number;
  startCol: number;
}

interface CombatPlannerProps {
  slots: Slot[];
  enemy: Enemy;
  events: TimelineEvent[];
  columns: Column[];
  visibleSkills: VisibleSkills;
  loadouts: Record<string, OperatorLoadoutState>;
  zoom: number;
  onZoom: (deltaY: number) => void;
  orientation?: Orientation;
  onToggleOrientation?: () => void;
  onToggleSkill: (slotId: string, skillType: string) => void;
  onAddEvent: (ownerId: string, columnId: string, atFrame: number, defaultSkill: object | null) => void;
  onMoveEvent: (id: string, newStartFrame: number, overlapExemptIds?: Set<string>, strictOverride?: boolean) => void;
  onMoveEvents?: (ids: string[], delta: number, overlapExemptIds?: Set<string>, strictOverride?: boolean) => void;
  onContextMenu: (state: ContextMenuState | null) => void;
  onEditEvent: (id: string | null, context?: string) => void;
  onRemoveEvent: (id: string) => void;
  onRemoveEvents?: (ids: string[]) => void;
  onResetEvent?: (id: string) => void;
  onResetEvents?: (ids: string[]) => void;
  onResetSegments?: (id: string) => void;
  onResetFrames?: (id: string) => void;
  onLoadoutChange: (slotId: string, state: OperatorLoadoutState) => void;
  onEditLoadout: (slotId: string) => void;
  editingSlotId?: string | null;
  allOperators?: Operator[];
  onSwapOperator?: (slotId: string, newOperatorId: string | null) => void;
  allEnemies?: Enemy[];
  onSwapEnemy?: (enemyId: string) => void;
  onEditEnemy?: () => void;
  /** Resource graph data keyed by column key (e.g. 'common-skill-points'). */
  resourceGraphs?: Map<string, { points: ReadonlyArray<ResourcePoint>; min: number; max: number; wasted?: number }>;
  onEditResource?: (columnKey: string) => void;
  onBatchStart?: () => void;
  onBatchEnd?: () => void;
  onFrameClick?: (e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onRemoveFrame?: (eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onRemoveFrames?: (frames: import('../consts/viewTypes').SelectedFrame[]) => void;
  onSetCritPins?: (frames: import('../consts/viewTypes').SelectedFrame[], value: boolean) => void;
  onRemoveSegment?: (eventUid: string, segmentIndex: number) => void;
  onAddSegment?: (eventUid: string, segmentLabel: string) => void;
  onAddFrame?: (eventUid: string, segmentIndex: number, frameOffsetFrame: number) => void;
  onMoveFrame?: (eventUid: string, segmentIndex: number, frameIndex: number, newOffsetFrame: number) => void;
  onResizeSegment?: (eventUid: string, updates: { segmentIndex: number; newDuration: number }[]) => void;
  selectedFrames?: import('../consts/viewTypes').SelectedFrame[];
  onSelectedFramesChange?: (frames: import('../consts/viewTypes').SelectedFrame[]) => void;
  /** Callback to expose the scroll container ref for external scroll sync. */
  onScrollRef?: (el: HTMLDivElement | null) => void;
  /** Callback when the timeline scrolls (for scroll sync). */
  onScroll?: (scrollTop: number) => void;
  /** Callback with measured loadout row height. */
  onLoadoutRowHeight?: (h: number) => void;
  /** Callback with measured header row height. */
  onHeaderRowHeight?: (h: number) => void;
  /** Callback when the hovered frame changes. */
  onHoverFrame?: (frame: number | null) => void;
  /** Hide scrollbar (when scroll is synced to another container). */
  hideScrollbar?: boolean;
  onDuplicateEvents?: (sourceEvents: TimelineEvent[], frameOffset: number) => string[];
  /** Event IDs to select externally (e.g. after undo/redo). Consumed after applied. */
  selectEventIds?: Set<string>;
  onSelectEventIdsConsumed?: () => void;
  /** Whether to display real-time (default) or game-time on the time axis. */
  showRealTime?: boolean;
  onToggleRealTime?: () => void;
  interactionMode?: InteractionModeType;
  staggerBreaks?: readonly import('../controller/timeline/staggerTimeline').StaggerBreak[];
  /** Dynamic timeline length in frames (grows with content). */
  contentFrames?: number;
  /** Per-slot SP insufficiency zones from the SP controller, keyed by `slotId:battle`. */
  spInsufficiencyZones?: Map<string, import('../controller/timeline/skillPointTimeline').ResourceZone[]>;
  /** Drag throttle cadence (1=every frame ~60fps, 2=every other ~30fps, 3=~20fps). */
  dragThrottle?: number;
  /** When true, all mutations are disabled (community/sample loadouts). */
  readOnly?: boolean;
  /** ID of the event currently shown in the info pane (null = pane closed). */
  editingEventId?: string | null;
  /** Whether any info pane is currently open (event, damage, loadout, etc.). */
  infoPaneOpen?: boolean;
  /** Ref to changed event UIDs from the last pipeline run (for incremental view updates). */
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop1 = (_a: unknown) => {};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop2 = (_a: unknown, _b: unknown) => {};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop3 = (_a: unknown, _b: unknown, _c: unknown) => {};

const STATUS_TYPE_LABELS: Record<string, string> = {
  'STATUS': 'Combat Status',
  [NounType.SKILL_STATUS]: 'Skill Status',
  [NounType.TALENT]: 'Talent',
  [NounType.TALENT_STATUS]: 'Talent Status',
  [NounType.WEAPON_STATUS]: 'Weapon Status',
  [NounType.GEAR_STATUS]: 'Gear Status',
  [NounType.GEAR_SET_EFFECT]: 'Gear Set Effect',
  [NounType.GEAR_SET_STATUS]: 'Gear Set Status',
  [NounType.POTENTIAL]: 'Potential',
  [NounType.POTENTIAL_STATUS]: 'Potential Status',
  [NounType.CONSUMABLE]: 'Consumable',
  [NounType.TACTICAL]: 'Tactical',
};

/** Special key for the cross-cutting "Permanent" filter (not an ). */
const PERMANENT_FILTER_KEY = 'PERMANENT';

/** Groups of status types for the filter menu, with display order. */
const STATUS_FILTER_GROUPS: { label: string; types: string[]; permanent?: boolean }[] = [
  { label: 'Passive', types: [], permanent: true },
  { label: 'Skills', types: [NounType.SKILL_STATUS, NounType.TALENT, NounType.TALENT_STATUS, NounType.POTENTIAL, NounType.POTENTIAL_STATUS] },
  { label: 'Weapons', types: [NounType.WEAPON_STATUS] },
  { label: 'Gears', types: [NounType.GEAR_STATUS, NounType.GEAR_SET_EFFECT, NounType.GEAR_SET_STATUS] },
  { label: 'Consumables', types: [NounType.CONSUMABLE] },
  { label: 'Tacticals', types: [NounType.TACTICAL] },
];

// Column width weight — used for grid proportions within operator groups
const COL_WEIGHT_SKILL_IDS = new Set<string>([NounType.BASIC_ATTACK, NounType.BATTLE, NounType.COMBO, NounType.ULTIMATE]);
function getColWeight(col: Column) {
  if (col.type === 'placeholder') return 1;
  const cid = col.type === 'mini-timeline' ? col.columnId : undefined;
  if (cid === OPERATOR_COLUMNS.INPUT) return 2;
  if (cid === OPERATOR_STATUS_COLUMN_ID) return 4;
  if (cid && COL_WEIGHT_SKILL_IDS.has(cid)) return 2;
  return 2; // tactical, etc.
}

export default React.memo(function CombatPlanner({
  slots,
  enemy,
  events,
  columns: columnsProp,
  visibleSkills,
  loadouts,
  zoom,
  onZoom,
  onToggleSkill,
  onAddEvent,
  onMoveEvent,
  onMoveEvents,
  onContextMenu,
  onEditEvent,
  onRemoveEvent,
  onRemoveEvents,
  onResetEvent,
  onResetEvents,
  onResetSegments,
  onResetFrames,
  onLoadoutChange,
  onEditLoadout,
  editingSlotId,
  allOperators,
  onSwapOperator,
  allEnemies,
  onSwapEnemy,
  onEditEnemy,
  resourceGraphs,
  onEditResource,
  onBatchStart,
  onBatchEnd,
  onFrameClick,
  onRemoveFrame,
  onRemoveFrames,
  onSetCritPins,
  onRemoveSegment,
  onAddSegment,
  onAddFrame,
  onMoveFrame,
  onResizeSegment,
  selectedFrames,
  onSelectedFramesChange,
  onScrollRef,
  onScroll: onScrollProp,
  onLoadoutRowHeight,
  onHeaderRowHeight,
  onHoverFrame,
  hideScrollbar,
  onDuplicateEvents,
  selectEventIds,
  onSelectEventIdsConsumed,
  showRealTime = true,
  onToggleRealTime,
  interactionMode,
  staggerBreaks,
  contentFrames: contentFramesProp,
  spInsufficiencyZones: spInsufficiencyZonesProp,
  orientation = 'vertical',
  onToggleOrientation,
  dragThrottle = 2,
  readOnly,
  editingEventId: editingEventIdProp,
  infoPaneOpen,
}: CombatPlannerProps) {
  const axis = getAxisMap(orientation);
  const isHorizontal = orientation === 'horizontal';
  const scrollRef   = useRef<HTMLDivElement>(null);
  const outerRef    = useRef<HTMLDivElement>(null);
  const warningTooltipRef = useRef<HTMLDivElement>(null);
  const loadoutRef  = useRef<HTMLDivElement>(null);
  const headerGridRef = useRef<HTMLDivElement>(null);
  const timeAxisRef = useRef<HTMLDivElement>(null);
  const dragRef     = useRef<DragState | null>(null);
  const marqueeRef  = useRef<MarqueeState | null>(null);
  const rmbMarqueeRef = useRef<{ startX: number; startY: number; moved: boolean; ctrlKey: boolean; priorFrames: SelectedFrame[] } | null>(null);
  const rmbDraggedRef = useRef(false);
  const dragMovedRef = useRef(false);
  // Stable refs for callbacks used inside throttled drag actions — avoids stale closures
  const onMoveFrameRef = useRef(onMoveFrame);
  onMoveFrameRef.current = onMoveFrame;
  const onResizeSegmentRef = useRef(onResizeSegment);
  onResizeSegmentRef.current = onResizeSegment;
  const frameDragRef = useRef<{
    eventUid: string;
    segmentIndex: number;
    frameIndex: number;
    startMouseFrame: number; // mouse coordinate along frame axis at drag start
    startOffsetFrame: number;
    /** Minimum allowed offsetFrame (0 or prev frame's offset + 1). */
    minOffset: number;
    /** Maximum allowed offsetFrame (segDuration - 1 or next frame's offset - 1). */
    maxOffset: number;
  } | null>(null);
  const segResizeDragRef = useRef<{
    eventUid: string;
    segmentIndex: number;
    edge: 'start' | 'end';
    startMouseFrame: number;
    startDuration: number;
    minDuration: number;
    siblingIndex: number;
    siblingStartDuration: number;
    siblingMinDuration: number;
  } | null>(null);
  const zoomRef     = useRef(zoom);
  const bodyTopRef  = useRef<number | null>(null);
  /** Raw mouse client position along frame axis — used to recompute hoverFrame on scroll. */
  const hoverClientFrameRef = useRef<number | null>(null);

  // ── Hover state (refs + direct DOM for performance) ─────────────────────────
  // hoverClientY and hoverColKey drive only visual decoration (line position,
  // column highlight) and are updated imperatively to avoid React re-renders.
  // hoverFrame drives hover line display + resource indicators.
  // Updates are batched to reduce re-render frequency.
  const hoverClientYRef    = useRef<number | null>(null);
  const hoverColKeyRef     = useRef<string | null>(null);
  const hoverLineRef       = useRef<HTMLDivElement>(null);
  const prevHoverColRef    = useRef<Element | null>(null);
  const [hoverFrame,       setHoverFrameRaw]    = useState<number | null>(null);
  const hoverFrameRef      = useRef<number | null>(null);
  const hoverFrameRafRef   = useRef<number | null>(null);
  /** Batch hoverFrame state updates to at most once per animation frame. */
  const setHoverFrame = useCallback((f: number | null) => {
    hoverFrameRef.current = f;
    onHoverFrame?.(f);
    if (hoverFrameRafRef.current === null) {
      hoverFrameRafRef.current = requestAnimationFrame(() => {
        hoverFrameRafRef.current = null;
        setHoverFrameRaw(hoverFrameRef.current);
      });
    }
  }, [onHoverFrame]);
  /** Update hover line position imperatively (no React state). */
  const updateHoverLineDOM = useCallback((clientPos: number | null) => {
    hoverClientYRef.current = clientPos;
    const el = hoverLineRef.current;
    if (!el) return;
    if (clientPos === null) {
      el.style.display = '';  // revert to CSS .hover-line--imperative { display: none }
      return;
    }
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) { el.style.display = ''; return; }
    el.style.display = 'block';
    el.style.top = el.style.left = el.style.width = el.style.height = '';
    el.style[axis.framePos] = `${clientPos}px`;
    el.style[axis.lanePos] = `${rect[axis.rectLaneStart]}px`;
    el.style[axis.frameSize] = '1px';
    el.style[axis.laneSize] = `${rect[axis.laneSize]}px`;
  }, [axis]);
  /** Update hovered column highlight imperatively (no React state). */
  const prevHoverHeaderRef = useRef<Element | null>(null);
  const updateHoverColDOM = useCallback((colKey: string | null) => {
    if (hoverColKeyRef.current === colKey) return;
    hoverColKeyRef.current = colKey;
    // Remove previous highlights
    if (prevHoverColRef.current) {
      prevHoverColRef.current.classList.remove('tl-sub-timeline--col-hover');
      prevHoverColRef.current = null;
    }
    if (prevHoverHeaderRef.current) {
      prevHoverHeaderRef.current.classList.remove('tl-header-cell--col-hover');
      prevHoverHeaderRef.current = null;
    }
    // Add new highlights
    if (colKey) {
      const colEl = scrollRef.current?.querySelector(`[data-col-key="${colKey}"]`);
      if (colEl) {
        colEl.classList.add('tl-sub-timeline--col-hover');
        prevHoverColRef.current = colEl;
      }
      const headerEl = outerRef.current?.querySelector(`[data-header-col-key="${colKey}"]`);
      if (headerEl) {
        headerEl.classList.add('tl-header-cell--col-hover');
        prevHoverHeaderRef.current = headerEl;
      }
    }
  }, []);
  const [outerRect,        setOuterRect]        = useState<DOMRect | null>(null);
  const [loadoutRowHeight, setLoadoutRowHeight] = useState(0);
  const [scrollClientHeight, setScrollClientHeight] = useState<number | null>(null);
  const [enemyMenuOpen,    setEnemyMenuOpen]    = useState(false);
  const [enemyMenuPos,     setEnemyMenuPos]     = useState<{ top: number; left: number } | null>(null);
  const [enemySearch,      setEnemySearch]      = useState('');
  const [enemyActiveTiers, setEnemyActiveTiers] = useState<Set<string>>(new Set(ENEMY_TIERS));
  const [selectedIds,      setSelectedIds]      = useState<Set<string>>(new Set());
  // Apply external selection (e.g. after undo/redo)
  useEffect(() => {
    if (selectEventIds && selectEventIds.size > 0) {
      setSelectedIds(selectEventIds);
      onSelectEventIdsConsumed?.();
    }
  }, [selectEventIds, onSelectEventIdsConsumed]);
  const [hoveredId,        setHoveredId]        = useState<string | null>(null);
  const [marqueeRect,      setMarqueeRect]      = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // ─── Duplicate ghost state ──────────────────────────────────────────────────
  const [dupMode, setDupMode] = useState(false);
  const dupSourceRef = useRef<TimelineEvent[]>([]);
  /** Frame offset from each source event's original startFrame to the ghost position. */
  const [dupOffset, setDupOffset] = useState(0);
  /** Whether the current ghost position is valid (no overlaps). */
  const [dupValid, setDupValid] = useState(false);
  const enemyNameRef = useRef<HTMLDivElement>(null);
  const [draggingIds, setDraggingIds] = useState<Set<string> | null>(null);
  const [dragZonesSnapshot, setDragZonesSnapshot] = useState<Map<string, import('../controller/timeline/skillPointTimeline').ResourceZone[]> | null>(null);
  const enemyMenuRef = useRef<HTMLDivElement>(null);

  // Hidden status types — applies globally to all status columns
  const [hiddenStatusTypes, setHiddenStatusTypes] = useState<Set<string>>(new Set());

  // Filter columns: remove hidden micro-columns from status columns
  // Keep unfiltered reference for header context menu (to show all types)
  const columns = useMemo(() => {
    if (hiddenStatusTypes.size === 0) return columnsProp;
    const hidePermanent = hiddenStatusTypes.has(PERMANENT_FILTER_KEY);
    return columnsProp.map((col) => {
      if (col.type !== 'mini-timeline' || !col.microColumns || col.microColumnAssignment !== 'dynamic-split') return col;
      const hasFilterable = col.microColumns.some((mc) => mc.statusType || mc.permanent);
      if (!hasFilterable) return col;
      const isMcHidden = (mc: import('../consts/viewTypes').MicroColumn) => {
        const effectiveType = mc.statusType ?? NounType.SKILL_STATUS;
        if (hiddenStatusTypes.has(effectiveType)) return true;
        if (hidePermanent && mc.permanent) return true;
        return false;
      };
      const filtered = col.microColumns.filter((mc) => !isMcHidden(mc));
      if (filtered.length === col.microColumns.length) return col;
      // Collect hidden micro-column IDs to exclude from event matching
      const hiddenIds = new Set<string>();
      for (const mc of col.microColumns) {
        if (isMcHidden(mc)) hiddenIds.add(mc.id);
      }
      // Extend matchAllExcept to also exclude hidden status column IDs
      const extendedExcept = new Set<string>();
      if (col.matchAllExcept) col.matchAllExcept.forEach((id) => extendedExcept.add(id));
      hiddenIds.forEach((id) => extendedExcept.add(id));
      return {
        ...col,
        microColumns: filtered,
        matchColumnIds: col.matchColumnIds?.filter((id) => !hiddenIds.has(id)),
        matchAllExcept: extendedExcept,
      };
    });
  }, [columnsProp, hiddenStatusTypes]);

  // Map slotId → element color for sequenced event coloring
  const slotElementColors = useMemo(() => computeSlotElementColors(slots), [slots]);

  const alwaysAvailableComboSlots = useMemo(
    () => getAlwaysAvailableComboSlots(slots),
    [slots],
  );



  // ── Event validation (controller) ─────────────────────────────────────────
  const { maps: validationMaps, timeStopRegions, autoFinisherIds } = useMemo(
    () => computeAllValidations(events, slots, resourceGraphs, staggerBreaks, draggingIds),
    [events, slots, resourceGraphs, staggerBreaks, draggingIds],
  );

  const timelineLayoutData = useMemo(
    () => buildTimelineLayout(events),
    [events],
  );

  const resourceInsufficiencyZones = useMemo(() => {
    // SP zones come from the controller; ultimate zones computed here
    const zones = new Map<string, import('../controller/timeline/skillPointTimeline').ResourceZone[]>();
    if (spInsufficiencyZonesProp) {
      spInsufficiencyZonesProp.forEach((val, key) => zones.set(key, val));
    }
    if (resourceGraphs) {
      const ultZones = computeResourceInsufficiencyZones(resourceGraphs, slots);
      // Only merge ultimate zones (SP zones already in controller output)
      ultZones.forEach((val, key) => {
        if (!key.endsWith(`:${NounType.BATTLE}`)) zones.set(key, val);
      });
    }
    return zones;
  }, [spInsufficiencyZonesProp, resourceGraphs, slots]);

  // Validate dragged events against the resource zones snapshot captured at
  // drag start (excludes the dragged event's own consumption). The live graph
  // lags behind event position during drag, so snapshot zones are stable.
  const dragResourceWarnings = useMemo(() => {
    if (!draggingIds || !dragZonesSnapshot) return null;
    const warnings = new Map<string, string>();
    for (const ev of events) {
      if (!draggingIds.has(ev.uid)) continue;
      if (ev.columnId !== NounType.BATTLE && ev.columnId !== NounType.ULTIMATE) continue;
      const zones = dragZonesSnapshot.get(`${ev.ownerId}:${ev.columnId}`);
      if (!zones) continue;
      for (const zone of zones) {
        if (ev.startFrame >= zone.start && ev.startFrame < zone.end) {
          const label = ev.columnId === NounType.BATTLE ? 'SP' : 'ultimate energy';
          warnings.set(ev.uid, `Not enough ${label}`);
          break;
        }
      }
    }
    return warnings.size > 0 ? warnings : null;
  }, [draggingIds, dragZonesSnapshot, events]);

  const filteredEnemies = useMemo(() => {
    if (!allEnemies) return [];
    const lc = enemySearch.toLowerCase();
    return allEnemies
      .filter((en) => {
        if (lc && !en.name.toLowerCase().includes(lc)) return false;
        if (!enemyActiveTiers.has(en.tier)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEnemies, enemySearch, enemyActiveTiers]);

  const toggleEnemyTier = useCallback((t: string) => {
    setEnemyActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }, []);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Track ctrl key held state via CSS class on outer container (avoids re-renders)
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) el.classList.add('ctrl-held');
      else el.classList.remove('ctrl-held');
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    // Also clear on blur (ctrl released while window unfocused)
    const onBlur = () => el.classList.remove('ctrl-held');
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const outerRectRef = useRef(outerRect);
  outerRectRef.current = outerRect;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const resourceZonesRef = useRef(resourceInsufficiencyZones);
  resourceZonesRef.current = resourceInsufficiencyZones;
  const resourceGraphsRef = useRef(resourceGraphs);
  resourceGraphsRef.current = resourceGraphs;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const interactionModeRef = useRef(interactionMode);
  interactionModeRef.current = interactionMode;

  // Throttled action executor for drag operations — cadence controlled by dragThrottle.
  const throttledDragAction = useRef(throttleByRAF((action: () => void) => action(), dragThrottle));
  const prevThrottleRef = useRef(dragThrottle);
  if (prevThrottleRef.current !== dragThrottle) {
    prevThrottleRef.current = dragThrottle;
    throttledDragAction.current.cancel();
    throttledDragAction.current = throttleByRAF((action: () => void) => action(), dragThrottle);
  }

  // Clear event selection when frames become selected (mutual exclusion)
  useEffect(() => {
    if (selectedFrames && selectedFrames.length > 0) setSelectedIds(new Set());
  }, [selectedFrames]);

  // ─── Enemy selector ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enemyMenuOpen) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      if (
        enemyNameRef.current && !enemyNameRef.current.contains(e.target as Node) &&
        enemyMenuRef.current && !enemyMenuRef.current.contains(e.target as Node)
      ) {
        setEnemyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [enemyMenuOpen]);

  const handleEnemyClick = useCallback(() => {
    if (readOnly || !allEnemies || !onSwapEnemy) return;
    if (enemyMenuOpen) { setEnemyMenuOpen(false); return; }
    if (enemyNameRef.current) {
      const rect = enemyNameRef.current.getBoundingClientRect();
      setEnemyMenuPos(isHorizontal
        ? { top: rect.top, left: rect.right + 2 }
        : { top: rect.bottom + 2, left: rect.left },
      );
    }
    setEnemySearch('');
    setEnemyActiveTiers(new Set(ENEMY_TIERS));
    setEnemyMenuOpen(true);
  }, [readOnly, enemyMenuOpen, allEnemies, onSwapEnemy, isHorizontal]);

  const pickEnemy = useCallback((id: string) => {
    onSwapEnemy?.(id);
    setEnemyMenuOpen(false);
  }, [onSwapEnemy]);

  // ─── Compute slot groups for loadout row ──────────────────────────────────
  const commonColCount = columns.filter((c) => c.type === 'mini-timeline' && c.source === TimelineSourceType.COMMON).length;
  const slotGroups: SlotGroup[] = [];
  const commonStartCol = 2; // right after time axis
  let colIdx = 2 + commonColCount; // common columns come first
  for (const slot of slots) {
    // Count all columns belonging to this slot (operator skills + status + weapon buff + placeholders)
    const slotCols = columns.filter((c) => c.ownerId === slot.slotId);
    const count = Math.max(MIN_SLOT_COLS, slotCols.length);
    slotGroups.push({ slot, columnCount: count, startCol: colIdx });
    colIdx += count;
  }
  const enemyColCount = columns.filter((c) => c.type === 'mini-timeline' && c.source === TimelineSourceType.ENEMY).length;

  // Identify first column of each group (operator slots + enemy) for visual gap styling
  const groupStartKeys = new Set<string>();
  for (const group of slotGroups) {
    const first = columns.find((c) => c.ownerId === group.slot.slotId);
    if (first) groupStartKeys.add(first.key);
  }
  const firstEnemy = columns.find((c) => c.type === 'mini-timeline' && c.source === TimelineSourceType.ENEMY);
  if (firstEnemy) groupStartKeys.add(firstEnemy.key);

  // Build fluid gridTemplateColumns: team:operator:enemy = 1:3:2
  // Pre-compute total weight per slot group
  const slotGroupWeights = slotGroups.map((g) => {
    const slotCols = columns.filter((c) => c.ownerId === g.slot.slotId);
    const totalWeight = slotCols.reduce((sum, c) => sum + getColWeight(c), 0);
    return { ...g, totalWeight, slotCols };
  });
  const GROUP_FR = 3;
  const COMMON_FR = 1;
  const ENEMY_FR = 2;

  // Compute fr values for all columns
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colFrValues = useMemo(() => {
    const values: number[] = [];
    for (let i = 0; i < commonColCount; i++) {
      values.push(COMMON_FR / Math.max(1, commonColCount));
    }
    for (const gw of slotGroupWeights) {
      for (const col of gw.slotCols) {
        const w = getColWeight(col);
        values.push(GROUP_FR * w / gw.totalWeight);
      }
    }
    const enemyCols = columns.filter((c): c is MiniTimeline => c.type === 'mini-timeline' && c.source === TimelineSourceType.ENEMY);
    const enemyWeights = enemyCols.map((c) => (c.columnId === ENEMY_ACTION_COLUMN_ID || c.columnId === COMMON_COLUMN_IDS.STAGGER) ? 1 : 3);
    const totalEnemyWeight = enemyWeights.reduce((s, w) => s + w, 0);
    for (const w of enemyWeights) {
      values.push(ENEMY_FR * w / totalEnemyWeight);
    }
    return values;
  }, [commonColCount, slotGroupWeights, columns]);

  const colFrStrings = colFrValues.map((fr) => `minmax(0, ${fr}fr)`);
  const gridCols = `${TIME_AXIS_WIDTH}px ${colFrStrings.join(' ')}`;
  // In horizontal mode, lanes become rows — use fixed min height so rows don't collapse
  const rowFrStrings = colFrStrings.map((s) => s.replace('minmax(0,', 'minmax(28px,'));
  const gridRows = `${TIME_AXIS_WIDTH}px ${rowFrStrings.join(' ')}`;

  // Compute column pixel positions from the container's lane-axis dimension
  // Vertical: lanes are columns → use width. Horizontal: lanes are rows → use scroll container clientHeight.
  const containerWidth = isHorizontal
    ? (scrollClientHeight ?? outerRect?.height ?? 800)
    : (outerRect?.width ?? 800);
  const totalFr = colFrValues.reduce((s, v) => s + v, 0);
  const pxPerFr = totalFr > 0 ? (containerWidth - TIME_AXIS_WIDTH) / totalFr : 0;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columnPositions = useMemo(() => {
    const map = new Map<string, { left: number; right: number }>();
    let x = TIME_AXIS_WIDTH;
    for (let i = 0; i < columns.length; i++) {
      const w = colFrValues[i] * pxPerFr;
      map.set(columns[i].key, { left: x, right: x + w });
      x += w;
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, pxPerFr, colFrValues]);

  const columnPositionsRef = useRef(columnPositions);
  columnPositionsRef.current = columnPositions;

  // Column layout recipe for imperative resize recomputation in the canvas
  const columnLayoutRef = useRef<ColumnLayoutRecipe>({ keys: [], frValues: [], totalFr: 0 });
  const canvasRendererRef = useRef<TimelineRenderer | null>(null);
  columnLayoutRef.current = useMemo(() => ({
    keys: columns.map(c => c.key),
    frValues: colFrValues,
    totalFr: colFrValues.reduce((s, v) => s + v, 0),
  }), [columns, colFrValues]);

  const totalRealFrames = timelineLayoutData.totalRealFrames;
  const tlHeight = timelineHeight(zoom, totalRealFrames);
  // In vertical mode, headers are above → offset Y mouse coords by header height.
  // In horizontal mode, headers are to the left → no frame-axis (X) offset needed.
  // (We use scrollRect directly for hover calculations, so this only matters for touch handlers.)
  const [headerRowHeight, setHeaderRowHeight] = useState(0);
  const headerHeight = isHorizontal ? HEADER_HEIGHT : headerRowHeight;
  const combinedHeaderHeight = isHorizontal ? 0 : loadoutRowHeight + headerHeight;

  // ─── Viewport-aware rendering (lazy timeline) ─────────────────────────────
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(800);
  // Zoom anchor: when zooming, compute the target scroll position inline so
  // visibleRange uses it in the same render (avoids flash from stale scrollTop).
  const [zoomAnchor, setZoomAnchor] = useState<{ anchorFrame: number; mouseInContainer: number } | null>(null);
  const pendingScrollTop = zoomAnchor
    ? Math.max(0, frameToPx(zoomAnchor.anchorFrame, zoom) - zoomAnchor.mouseInContainer)
    : null;
  const effectiveScrollTop = pendingScrollTop ?? scrollTop;
  const visibleRange = useMemo(
    () => getVisibleFrameRange(effectiveScrollTop, viewportH, zoom),
    [effectiveScrollTop, viewportH, zoom],
  );
  const tickElements = useMemo(() =>
    getTickMarks(zoom, visibleRange.startFrame, visibleRange.endFrame, totalRealFrames).map((tick) => (
      <div
        key={tick.frame}
        className={`tl-tick${tick.major ? ' tl-tick--major' : ' tl-tick--minor'}`}
        style={{ [axis.framePos]: frameToPx(tick.frame, zoom) } as React.CSSProperties}
      >
        {tick.major && (
          <span className="tl-tick-label">{frameToTimeLabel(tick.frame)}</span>
        )}
      </div>
    )),
  [zoom, visibleRange, totalRealFrames, axis]);

  // ─── Touch handlers (pinch-to-zoom on mobile) ──────────────────────────────
  useTouchHandlers({
    scrollRef,
    bodyTopRef,
    zoomRef,
    onMoveEvent,
    onZoom,
    onContextMenu,
    setHoverFrame,
    updateHoverLineDOM,
    outerRect,
    combinedHeaderHeight,
    axis,
  });

  // ─── Outer rect (updated on resize of the element itself, not just window) ─
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setOuterRect(el.getBoundingClientRect());
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Measure loadout row height dynamically ──────────────────────────────
  useLayoutEffect(() => {
    const el = loadoutRef.current;
    if (!el) return;
    const update = () => {
      const h = el.offsetHeight;
      setLoadoutRowHeight(h);
      // Only report to parent in vertical mode so the sheet header isn't affected
      if (!isHorizontal) onLoadoutRowHeight?.(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onLoadoutRowHeight, isHorizontal]);

  // ─── Measure header row height dynamically (vertical mode only) ─────────
  useLayoutEffect(() => {
    if (isHorizontal) return;
    const el = headerGridRef.current;
    if (!el) return;
    const update = () => {
      const h = el.offsetHeight;
      setHeaderRowHeight(h);
      onHeaderRowHeight?.(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isHorizontal, onHeaderRowHeight]);

  // ─── Expose scroll ref & scroll events for sync ────────────────────────
  useEffect(() => {
    onScrollRef?.(scrollRef.current);
    return () => onScrollRef?.(null);
  }, [onScrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el[axis.viewportFrame]);
    const ro = new ResizeObserver(() => {
      setViewportH(el[axis.viewportFrame]);
      // Track scroll container's clientHeight to sync header area height in horizontal mode
      if (isHorizontal) setScrollClientHeight(el.clientHeight);
    });
    ro.observe(el);
    if (isHorizontal) setScrollClientHeight(el.clientHeight);
    const handler = () => {
      setScrollTop(el[axis.scrollPos]);
      onScrollProp?.(el[axis.scrollPos]);
      onContextMenu(null);
      // Recompute hoverFrame during scroll so segment highlights update
      const frameClient = hoverClientFrameRef.current;
      if (frameClient != null && bodyTopRef.current !== null) {
        const scrollRect = el.getBoundingClientRect();
        const scrollFrame = el[axis.scrollPos];
        const bodyTop = bodyTopRef.current;
        const relFrame = frameClient - scrollRect[axis.rectFrameStart] + scrollFrame - bodyTop;
        if (relFrame > 0) {
          const ppf = getPxPerFrame(zoomRef.current);
          const snappedRel = Math.max(TIMELINE_TOP_PAD, TIMELINE_TOP_PAD + Math.round((relFrame - TIMELINE_TOP_PAD) / ppf) * ppf);
          const frame = pxToFrame(snappedRel, zoomRef.current);
          setHoverFrame(frame);
          updateHoverLineDOM(snappedRel - scrollFrame + scrollRect[axis.rectFrameStart] + bodyTop);
        }
      }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => { el.removeEventListener('scroll', handler); ro.disconnect(); };
  }, [onScrollProp, onContextMenu, axis, isHorizontal, setHoverFrame, updateHoverLineDOM]);

  // Headers are now outside the scroll container, so body starts at top of scroll
  useEffect(() => {
    bodyTopRef.current = 0;
  }, []);

  // ─── Wheel: shift = zoom; in horizontal mode, vertical scroll → horizontal scroll
  useLayoutEffect(() => {
    if (pendingScrollTop == null) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    scrollEl[axis.scrollPos] = pendingScrollTop;
    // Batch-clear anchor + sync scrollTop to avoid extra renders
    setZoomAnchor(null);
    setScrollTop(pendingScrollTop);
  }, [pendingScrollTop, axis]);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      const scrollEl = scrollRef.current;
      if (!scrollEl) { onZoom(e.deltaY); return; }

      // Capture the frame under the cursor for anchor-based zoom
      const scrollRect = scrollEl.getBoundingClientRect();
      const mouseInContainer = e[axis.clientFrame] - scrollRect[axis.rectFrameStart];
      const contentPx = scrollEl[axis.scrollPos] + mouseInContainer;
      setZoomAnchor({
        anchorFrame: pxToFrame(contentPx, zoomRef.current),
        mouseInContainer,
      });

      onZoom(e.deltaY);
    } else if (isHorizontal && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      // Translate vertical scroll wheel into horizontal scroll
      e.preventDefault();
      scrollRef.current?.scrollBy({ left: e.deltaY, behavior: 'instant' as ScrollBehavior });
    }
  }, [onZoom, isHorizontal, axis]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ─── Keyboard shortcuts: Delete, Ctrl+A ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (readOnly) return;
      if (e.key === 'Delete' && selectedIds.size > 0) {
        e.preventDefault();
        const ids = Array.from(selectedIds);
        if (ids.length > 1 && onRemoveEvents) {
          onRemoveEvents(ids);
        } else {
          ids.forEach((id) => onRemoveEvent(id));
        }
        setSelectedIds(new Set());
      } else if (e.key === 'Delete' && selectedFrames && selectedFrames.length > 0) {
        e.preventDefault();
        if (selectedFrames.length > 1) {
          onRemoveFrames?.(selectedFrames);
        } else {
          const sf = selectedFrames[0];
          onRemoveFrame?.(sf.eventUid, sf.segmentIndex, sf.frameIndex);
        }
        onSelectedFramesChange?.([]);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (interactionMode !== InteractionModeType.STRICT) {
          setSelectedIds(new Set(events.map((ev) => ev.uid)));
        } else {
          const derivedCols = new Set(
            columns.filter((c): c is MiniTimeline => c.type === 'mini-timeline' && !!c.derived).map((c) => `${c.ownerId}-${c.columnId}`),
          );
          setSelectedIds(new Set(
            events.filter((ev) => !derivedCols.has(`${ev.ownerId}-${ev.columnId}`)).map((ev) => ev.uid),
          ));
        }
      }
      // Ctrl+D: enter duplicate mode with selected events
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedIds.size > 0 && onDuplicateEvents) {
        e.preventDefault();
        let sources: TimelineEvent[];
        if (interactionMode !== InteractionModeType.STRICT) {
          sources = events.filter((ev) => selectedIds.has(ev.uid));
        } else {
          const derivedCols = new Set(
            columns.filter((c): c is MiniTimeline => c.type === 'mini-timeline' && !!c.derived).map((c) => `${c.ownerId}-${c.columnId}`),
          );
          sources = events.filter((ev) => selectedIds.has(ev.uid) && !derivedCols.has(`${ev.ownerId}-${ev.columnId}`));
        }
        if (sources.length > 0) {
          dupSourceRef.current = sources;
          setDupMode(true);
          setDupOffset(0);
          setDupValid(false);
        }
      }
      // Escape: cancel duplicate mode
      if (e.key === 'Escape' && dupMode) {
        e.preventDefault();
        setDupMode(false);
        dupSourceRef.current = [];
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selectedFrames, events, columns, dupMode, onRemoveEvent, onRemoveEvents, onRemoveFrame, onRemoveFrames, onSelectedFramesChange, onDuplicateEvents]);

  // ─── Timeline presentation: column view models ──────────────────────────────
  const columnViewModels = useMemo(
    () => computeTimelinePresentation(events, columns),
    [events, columns], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ─── Pre-computed event presentations (used by PixiJS canvas renderer) ─
  const eventPresentations = useMemo(() => {
    const map = new Map<string, import('../controller/timeline/eventPresentationController').EventPresentation>();
    let mergedValidationMaps = validationMaps;
    if (dragResourceWarnings) {
      const merged = new Map(validationMaps.resource);
      dragResourceWarnings.forEach((v, k) => merged.set(k, v));
      mergedValidationMaps = { ...validationMaps, resource: merged };
    }
    for (const [colKey, vm] of Array.from(columnViewModels.entries())) {
      const col = vm.column;
      const opts = {
        slotElementColors, alwaysAvailableComboSlots, autoFinisherIds,
        validationMaps: mergedValidationMaps, interactionMode, statusViewOverrides: vm.statusOverrides, events,
      };
      for (const ev of vm.events) {
        map.set(`${colKey}:${ev.uid}`, computeEventPresentation(ev, col, opts));
      }
    }
    return map;
  }, [columnViewModels, validationMaps, dragResourceWarnings, slotElementColors, alwaysAvailableComboSlots, autoFinisherIds, interactionMode, events]);

  // ─── PixiJS canvas render data ──────────────────────────────────────────────
  const critModeGen = getCritModeGeneration();
  const canvasRenderData = useMemo((): CanvasRenderData => ({
    columns,
    columnViewModels,
    eventPresentations,
    eventLayouts: timelineLayoutData.events,
    columnPositions,
    zoom,
    axis,
    isHorizontal,
    tlHeight,
    visibleStartFrame: visibleRange.startFrame,
    visibleEndFrame: visibleRange.endFrame,
    totalRealFrames,
    selectedIds,
    selectedFrames: selectedFrames ?? [],
    draggingIds,
    hoveredId,
    hoverFrame,
    critModeGeneration: critModeGen,
    timeStopRegions,
  }), [columns, columnViewModels, eventPresentations, timelineLayoutData, columnPositions, zoom, axis, isHorizontal,
    tlHeight, visibleRange, totalRealFrames, selectedIds, selectedFrames, draggingIds, hoveredId, hoverFrame, timeStopRegions, critModeGen]);

  // ─── Pre-computed combo window events by owner (avoids per-column filter in render) ─
  const comboWindowEventsByOwner = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const ev of events) {
      if (ev.columnId !== COMBO_WINDOW_COLUMN_ID) continue;
      let arr = map.get(ev.ownerId);
      if (!arr) { arr = []; map.set(ev.ownerId, arr); }
      arr.push(ev);
    }
    return map;
  }, [events]);

  // ─── Marquee intersection helper ────────────────────────────────────────────
  // Rect coords: in vertical mode {left=lane, top=frame}, in horizontal mode {left=frame, top=lane}
  const getEventsInRect = useCallback((rect: { left: number; top: number; right: number; bottom: number }) => {
    const bodyTop = bodyTopRef.current ?? 0;
    const ids = new Set<string>();
    for (const ev of events) {
      // Resolve pixel bounds: check micro-column position first, fall back to column
      let evColPos: { left: number; right: number } | undefined;
      const colBasePos = columnPositions.get(`${ev.ownerId}-${ev.columnId}`);
      // Look up micro-position from the column view model
      const vms = Array.from(columnViewModels.values());
      for (let vi = 0; vi < vms.length; vi++) {
        const mp = vms[vi].microPositions.get(ev.uid);
        if (mp) {
          const parentPos = columnPositions.get(vms[vi].column.key);
          if (parentPos) {
            const parentW = parentPos.right - parentPos.left;
            evColPos = { left: parentPos.left + mp.leftFrac * parentW, right: parentPos.left + (mp.leftFrac + mp.widthFrac) * parentW };
          }
          break;
        }
      }
      if (!evColPos) evColPos = colBasePos;
      if (!evColPos) continue;
      const totalDur = computeSegmentsSpan(ev.segments);
      const evFrameStart = bodyTop + frameToPx(ev.startFrame, zoomRef.current);
      const evFrameEnd = evFrameStart + durationToPx(totalDur, zoomRef.current);
      if (isHorizontal) {
        if (evColPos.right > rect.top && evColPos.left < rect.bottom &&
            evFrameEnd > rect.left && evFrameStart < rect.right) {
          ids.add(ev.uid);
        }
      } else {
        if (evColPos.right > rect.left && evColPos.left < rect.right &&
            evFrameEnd > rect.top && evFrameStart < rect.bottom) {
          ids.add(ev.uid);
        }
      }
    }
    return ids;
  }, [events, columnPositions, columnViewModels, isHorizontal]);

  /** Find all frame diamonds within a content-space rect. */
  const getFramesInRect = useCallback((rect: { left: number; top: number; right: number; bottom: number }): SelectedFrame[] => {
    const bodyTop = bodyTopRef.current ?? 0;
    const z = zoomRef.current;
    const result: SelectedFrame[] = [];
    // In horizontal mode, frame axis is X (left/right), lane axis is Y (top/bottom)
    const rectFrameStart = isHorizontal ? rect.left : rect.top;
    const rectFrameEnd = isHorizontal ? rect.right : rect.bottom;
    const rectLaneStart = isHorizontal ? rect.top : rect.left;
    const rectLaneEnd = isHorizontal ? rect.bottom : rect.right;
    for (const ev of events) {
      if (!ev.segments || ev.segments.length === 0) continue;
      const colPos = columnPositions.get(`${ev.ownerId}-${ev.columnId}`);
      if (!colPos) continue;
      // Column (lane axis) must overlap
      if (colPos.right <= rectLaneStart || colPos.left >= rectLaneEnd) continue;
      const baseOffset = 0;
      const evFramePx = bodyTop + frameToPx(ev.startFrame, z);
      let segOffset = 0;
      for (let si = 0; si < ev.segments.length; si++) {
        const seg = ev.segments[si];
        if (seg.frames) {
          for (let fi = 0; fi < seg.frames.length; fi++) {
            const f = seg.frames[fi];
            const innerOffset = baseOffset + segOffset + f.offsetFrame;
            const framePx = evFramePx + durationToPx(innerOffset, z);
            if (framePx >= rectFrameStart && framePx <= rectFrameEnd) {
              result.push({ eventUid: ev.uid, segmentIndex: si, frameIndex: fi });
            }
          }
        }
        segOffset += seg.properties.duration;
      }
    }
    return result;
  }, [events, columnPositions, isHorizontal]);

  // ─── Event hover ──────────────────────────────────────────────────────────────
  const handleEventHover = useCallback((id: string | null) => {
    if (rmbDraggedRef.current) return;
    setHoveredId(id);
  }, []);

  // ─── Event select (click) ─────────────────────────────────────────────────────
  const handleEventSelect = useCallback((e: React.MouseEvent, eventUid: string) => {
    if (dragMovedRef.current) return;
    onContextMenu(null); // dismiss any open context menu
    onSelectedFramesChange?.([]); // deselect frames when selecting events
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds(new Set([eventUid]));
    } else {
      setSelectedIds((prev) => {
        if (prev.has(eventUid) && prev.size === 1) return new Set();
        return new Set([eventUid]);
      });
    }
    if (editingEventIdProp != null || infoPaneOpen) onEditEvent(eventUid);
  }, [onContextMenu, onSelectedFramesChange, onEditEvent, editingEventIdProp, infoPaneOpen]);

  // ─── Event double-click (open info pane) ──────────────────────────────────────
  const handleEventDoubleClick = useCallback((_e: React.MouseEvent, eventUid: string) => {
    onEditEvent(eventUid);
    setSelectedIds(new Set([eventUid]));
  }, [onEditEvent]);

  // ─── Mouse move ─────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Suppress hover line during right-click marquee drag
    if (rmbMarqueeRef.current?.moved) {
      updateHoverLineDOM(null);
      setHoverFrame(null);
      canvasRendererRef.current?.patchHoverFrame(null);

    } else if (dragRef.current || frameDragRef.current || segResizeDragRef.current) {
      // During drag, hover line is updated inside the throttled drag action — skip here.
      // Still track mouse position for scroll-based recomputation.
      hoverClientFrameRef.current = e[axis.clientFrame];

    } else
    // Hover line — snaps to the nearest frame-interval grid line
    if (scrollRef.current && outerRectRef.current && bodyTopRef.current !== null) {
      const scrollEl = scrollRef.current;
      const scrollRect = scrollEl.getBoundingClientRect();
      // Only show hover line when mouse is inside the scroll body along the frame axis
      const frameClient = e[axis.clientFrame];
      const frameEnd = axis.framePos === 'top' ? 'bottom' as const : 'right' as const;
      if (frameClient < scrollRect[axis.rectFrameStart] || frameClient > scrollRect[frameEnd]) {
        setHoverFrame(null);
        canvasRendererRef.current?.patchHoverFrame(null);
        updateHoverLineDOM(null);
        hoverClientFrameRef.current = null;
      } else {
        hoverClientFrameRef.current = frameClient;
        const scrollFrame = scrollEl[axis.scrollPos];
        const bodyTop = bodyTopRef.current;
        const relFrame = frameClient - scrollRect[axis.rectFrameStart] + scrollFrame - bodyTop;
        if (relFrame > 0) {
          // Snap to nearest frame-interval grid line (works inside time-stop zones too)
          const ppf = getPxPerFrame(zoomRef.current);
          const snappedRel = Math.max(TIMELINE_TOP_PAD, TIMELINE_TOP_PAD + Math.round((relFrame - TIMELINE_TOP_PAD) / ppf) * ppf);
          const frame = pxToFrame(snappedRel, zoomRef.current);
          setHoverFrame(frame);
          canvasRendererRef.current?.patchHoverFrame(frame);
          updateHoverLineDOM(snappedRel - scrollFrame + scrollRect[axis.rectFrameStart] + bodyTop);
        } else {
          setHoverFrame(null);
          canvasRendererRef.current?.patchHoverFrame(null);
          updateHoverLineDOM(null);
        }
      }
    }

    // Column highlight — find which lane the mouse is over
    // Vertical: lanes are columns (X axis). Horizontal: lanes are rows (Y axis).
    // Only highlight when the mouse is inside the scroll body (not over loadout/header areas)
    if (outerRectRef.current && scrollRef.current) {
      const scrollRect = scrollRef.current.getBoundingClientRect();
      const inBody = e.clientY >= scrollRect.top && e.clientY <= scrollRect.bottom
        && e.clientX >= scrollRect.left && e.clientX <= scrollRect.right;
      if (inBody) {
        const mouseLane = e[axis.clientLane] - outerRectRef.current[axis.rectLaneStart];
        let foundCol: string | null = null;
        const cols = columnsRef.current;
        const colPos = columnPositionsRef.current;
        for (let i = 0; i < cols.length; i++) {
          const pos = colPos.get(cols[i].key);
          if (pos && mouseLane >= pos.left && mouseLane < pos.right) {
            foundCol = cols[i].key;
            break;
          }
        }
        updateHoverColDOM(foundCol);
      } else {
        updateHoverColDOM(null);
      }
    }

    // Duplicate ghost positioning
    if (dupMode && scrollRef.current && outerRectRef.current && bodyTopRef.current !== null) {
      const scrollEl2 = scrollRef.current;
      const scrollRect2 = scrollEl2.getBoundingClientRect();
      const scrollFrame = scrollEl2[axis.scrollPos];
      const bodyTop = bodyTopRef.current;
      const relFrame = e[axis.clientFrame] - scrollRect2[axis.rectFrameStart] + scrollFrame - bodyTop;
      const mouseFrame = pxToFrame(relFrame, zoomRef.current);
      const sources = dupSourceRef.current;
      if (sources.length > 0) {
        // Offset relative to the earliest source event
        const minSourceFrame = Math.min(...sources.map((s) => s.startFrame));
        const offset = mouseFrame - minSourceFrame;
        setDupOffset(offset);
        // Validate: no overlaps for any ghost event at its new position
        // Use a fake ID so the overlap check doesn't skip the original event
        let valid = true;
        for (const src of sources) {
          const ghostFrame = src.startFrame + offset;
          if (ghostFrame < 0 || ghostFrame >= TOTAL_FRAMES) { valid = false; break; }
          const ghost = { ...src, uid: `__dup_ghost_${src.uid}` };
          if (wouldOverlapNonOverlappable(eventsRef.current, ghost, ghostFrame)) { valid = false; break; }
          if (interactionModeRef.current === InteractionModeType.STRICT && isDuplicatePlacementInResourceZone(src, ghostFrame, resourceZonesRef.current)) { valid = false; break; }
        }
        setDupValid(valid);
      }
    }

    // Event drag (single or batch)
    if (dragRef.current) {
      dragMovedRef.current = true;
      const { primaryId, eventUids, startMouseFrame: startMouseF, startFrames } = dragRef.current;

      const deltaFrames = Math.round(
        (e[axis.clientFrame] - startMouseF) / getPxPerFrame(zoomRef.current)
      );

      const baseStrict = interactionModeRef.current === InteractionModeType.STRICT;
      const strict = (e.ctrlKey || e.metaKey) ? !baseStrict : baseStrict;
      const { clampedDelta, overlapExempt } = clampDragDelta(deltaFrames, dragRef.current, eventsRef.current, strict);

      // Hover line + dragged event positions update immediately (no throttle)
      // for visual responsiveness. The state update (pipeline + React) is throttled below.
      const pnf = (startFrames.get(primaryId) ?? 0) + clampedDelta;
      const scrollEl = scrollRef.current;
      const bTop = bodyTopRef.current;
      if (scrollEl && bTop !== null) {
        const sRect = scrollEl.getBoundingClientRect();
        const scrollFrame = scrollEl[axis.scrollPos];
        const snappedRel = frameToPx(pnf, zoomRef.current);
        updateHoverLineDOM(snappedRel - scrollFrame + sRect[axis.rectFrameStart] + bTop);
      }

      // Throttled state update — triggers React re-render + pipeline
      const dragState = dragRef.current;
      const strictForMove = strict;
      throttledDragAction.current(() => {
        if (eventUids.length > 1 && onMoveEvents) {
          const incrementalDelta = clampedDelta - dragState.lastAppliedDelta;
          onMoveEvents(eventUids, incrementalDelta, overlapExempt, strictForMove);
          dragState.lastAppliedDelta = clampedDelta;
        } else {
          for (const eid of eventUids) {
            const orig = startFrames.get(eid) ?? 0;
            onMoveEvent(eid, orig + clampedDelta, overlapExempt, strictForMove);
          }
        }
        setHoverFrame(pnf);
      });
      return;
    }

    // Frame diamond drag
    if (frameDragRef.current) {
      dragMovedRef.current = true;
      const { eventUid, segmentIndex, frameIndex, startMouseFrame: startMouseF, startOffsetFrame, minOffset, maxOffset } = frameDragRef.current;
      const deltaFrames = Math.round((e[axis.clientFrame] - startMouseF) / getPxPerFrame(zoomRef.current));
      const newOffset = Math.max(minOffset, Math.min(maxOffset, startOffsetFrame + deltaFrames));
      throttledDragAction.current(() => onMoveFrameRef.current?.(eventUid, segmentIndex, frameIndex, newOffset));
      return;
    }

    // Segment edge resize drag — adjusts both the target segment and its sibling
    if (segResizeDragRef.current) {
      dragMovedRef.current = true;
      const { eventUid, segmentIndex, edge, startMouseFrame: startMouseF, startDuration, minDuration, siblingIndex, siblingStartDuration, siblingMinDuration } = segResizeDragRef.current;
      const rawDelta = Math.round((e[axis.clientFrame] - startMouseF) / getPxPerFrame(zoomRef.current));
      // For 'start' edge: shrinking this segment grows the sibling (and vice versa)
      // For 'end' edge: growing this segment shrinks the sibling
      const thisDelta = edge === 'end' ? rawDelta : -rawDelta;
      const hasSibling = siblingStartDuration > 0;
      // Clamp so neither segment goes below its minimum
      const maxGrow = hasSibling ? siblingStartDuration - siblingMinDuration : Infinity;
      const maxShrink = startDuration - minDuration;
      const clampedDelta = Math.max(-maxShrink, Math.min(maxGrow, thisDelta));
      const newDuration = startDuration + clampedDelta;
      const updates: { segmentIndex: number; newDuration: number }[] = [{ segmentIndex, newDuration }];
      if (hasSibling) {
        updates.push({ segmentIndex: siblingIndex, newDuration: siblingStartDuration - clampedDelta });
      }
      throttledDragAction.current(() => onResizeSegmentRef.current?.(eventUid, updates));
      return;
    }

    // Marquee drag
    if (marqueeRef.current && scrollRef.current) {
      const scroll = scrollRef.current;
      const scrollRect = scroll.getBoundingClientRect();
      const curX = e.clientX - scrollRect.left + scroll.scrollLeft;
      const curY = e.clientY - scrollRect.top + scroll.scrollTop;
      const { startX, startY } = marqueeRef.current;
      const left = Math.min(startX, curX);
      const top = Math.min(startY, curY);
      const width = Math.abs(curX - startX);
      const height = Math.abs(curY - startY);
      setMarqueeRect({ left, top, width, height });
      dragMovedRef.current = true;

      // Live-update selection as marquee is dragged
      const marqueeIds = getEventsInRect({
        left, top, right: left + width, bottom: top + height,
      });
      let finalIds: Set<string>;
      if (marqueeRef.current.ctrlKey) {
        finalIds = new Set(marqueeRef.current.priorSelection);
        marqueeIds.forEach((id) => finalIds.add(id));
      } else {
        finalIds = marqueeIds;
      }
      setSelectedIds(finalIds);
    }

    // Right-click marquee drag (frame selection)
    if (rmbMarqueeRef.current && scrollRef.current) {
      const scroll = scrollRef.current;
      const scrollRect = scroll.getBoundingClientRect();
      const curX = e.clientX - scrollRect.left + scroll.scrollLeft;
      const curY = e.clientY - scrollRect.top + scroll.scrollTop;
      const { startX, startY } = rmbMarqueeRef.current;
      const dx = curX - startX;
      const dy = curY - startY;
      if (!rmbMarqueeRef.current.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      if (!rmbMarqueeRef.current.moved) setHoveredId(null);
      rmbMarqueeRef.current.moved = true;
      rmbDraggedRef.current = true;
      const left = Math.min(startX, curX);
      const top = Math.min(startY, curY);
      const width = Math.abs(dx);
      const height = Math.abs(dy);
      setMarqueeRect({ left, top, width, height });
      const newFrames = getFramesInRect({ left, top, right: left + width, bottom: top + height });
      // Merge with prior selection when Ctrl is held
      let frames: SelectedFrame[];
      if (rmbMarqueeRef.current.ctrlKey && rmbMarqueeRef.current.priorFrames.length > 0) {
        const prior = rmbMarqueeRef.current.priorFrames;
        const seen = new Set(prior.map((f) => `${f.eventUid}-${f.segmentIndex}-${f.frameIndex}`));
        frames = [...prior];
        for (const f of newFrames) {
          const key = `${f.eventUid}-${f.segmentIndex}-${f.frameIndex}`;
          if (!seen.has(key)) { frames.push(f); seen.add(key); }
        }
      } else {
        frames = newFrames;
      }
      // Open info pane first (onEditEvent may clear selectedFrames),
      // then set selected frames so the later setState wins in the batch.
      if (frames.length > 0) {
        onEditEvent(frames[0].eventUid);
      } else {
        onEditEvent(null);
      }
      onSelectedFramesChange?.(frames);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMoveEvent, getEventsInRect, getFramesInRect, onSelectedFramesChange, dupMode, axis]);

  const handleMouseLeave = useCallback(() => {
    updateHoverLineDOM(null);
    setHoverFrame(null);
    updateHoverColDOM(null);
    hoverClientFrameRef.current = null;
    // End any active drag/batch if mouse leaves the timeline
    if (frameDragRef.current) {
      throttledDragAction.current.flush();
      frameDragRef.current = null;
      onBatchEnd?.();
      requestAnimationFrame(() => { dragMovedRef.current = false; });
    }
    if (segResizeDragRef.current) {
      throttledDragAction.current.flush();
      segResizeDragRef.current = null;
      outerRef.current?.classList.remove('segment-resizing');
      outerRef.current?.querySelectorAll('.resize-active').forEach((el) => el.classList.remove('resize-active'));
      onBatchEnd?.();
      requestAnimationFrame(() => { dragMovedRef.current = false; });
    }
    if (dragRef.current) {
      throttledDragAction.current.flush();
      dragRef.current = null;
      setDraggingIds(null);
      setDragZonesSnapshot(null);
      onBatchEnd?.();
      requestAnimationFrame(() => { dragMovedRef.current = false; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBatchEnd]);

  const handleMouseUp = useCallback(() => {
    // Flush any pending throttled drag action so the final position is applied.
    throttledDragAction.current.flush();
    if (dragRef.current) {
      dragRef.current = null;
      setDraggingIds(null);
      setDragZonesSnapshot(null);
      onBatchEnd?.();
    }
    if (frameDragRef.current) {
      frameDragRef.current = null;
      onBatchEnd?.();
    }
    if (segResizeDragRef.current) {
      segResizeDragRef.current = null;
      outerRef.current?.classList.remove('segment-resizing');
      outerRef.current?.querySelectorAll('.resize-active').forEach((el) => el.classList.remove('resize-active'));
      onBatchEnd?.();
    }
    if (marqueeRef.current) {
      // Click without drag — dismiss selection
      if (!dragMovedRef.current) {
        if (!marqueeRef.current.ctrlKey) {
          setSelectedIds(new Set());
          onSelectedFramesChange?.([]);
        }
      }
      marqueeRef.current = null;
      setMarqueeRect(null);
    }
    if (rmbMarqueeRef.current) {
      rmbMarqueeRef.current = null;
      setMarqueeRect(null);
    }
    requestAnimationFrame(() => { dragMovedRef.current = false; rmbDraggedRef.current = false; });
  }, [onBatchEnd, onSelectedFramesChange]);

  // ─── Drag start (event move) ──────────────────────────────────────────────────
  const getMonotonicBounds = useCallback(
    (draggedIds: string[]) => computeMonotonicBounds(draggedIds, events, columns, TOTAL_FRAMES),
    [events, columns],
  );

  const handleEventDragStart = useCallback((
    e: React.MouseEvent,
    eventUid: string,
    startFrame: number,
  ) => {
    if (readOnly || e.button !== 0) return;
    // Block drag for naturally-derived events (engine-created) on derived columns.
    // Freeform-placed events (creationInteractionMode set) remain draggable.
    const ev = events.find((ev) => ev.uid === eventUid);
    if (ev && interactionMode === InteractionModeType.STRICT && ev.creationInteractionMode == null) {
      const col = columns.find((c): c is MiniTimeline => c.type === 'mini-timeline' && c.ownerId === ev.ownerId && c.columnId === ev.columnId);
      if (col?.derived) return;
    }
    e.preventDefault();
    e.stopPropagation();
    dragMovedRef.current = false;
    onBatchStart?.();

    // If dragging a selected event, drag all selected events together
    if (selectedIds.has(eventUid) && selectedIds.size > 1) {
      const startFrames = new Map<string, number>();
      const draggedIds: string[] = [];
      const draggedEvents: TimelineEvent[] = [];
      for (const ev of events) {
        if (selectedIds.has(ev.uid)) {
          draggedIds.push(ev.uid);
          startFrames.set(ev.uid, ev.startFrame);
          draggedEvents.push(ev);
        }
      }
      const dragSet = new Set(draggedIds);
      const resZones = resourceGraphsRef.current
        ? computeResourceZonesForDrag(resourceGraphsRef.current, slotsRef.current, dragSet, events)
        : resourceZonesRef.current;
      const invalidSet = computeInvalidSet(draggedEvents, resourceZonesRef.current, eventsRef.current);
      const overlapInvalid = computeOverlapInvalidSet(draggedEvents, eventsRef.current);
      dragRef.current = { primaryId: eventUid, eventUids: draggedIds, startMouseFrame: e[axis.clientFrame], startFrames, monotonicBounds: getMonotonicBounds(draggedIds), lastAppliedDelta: 0, resourceZonesSnapshot: resZones, invalidAtDragStart: invalidSet, revalidated: new Set(), overlapInvalidAtDragStart: overlapInvalid, overlapRevalidated: new Set(), comboRevalidated: new Map() };
      setDraggingIds(dragSet);
      setDragZonesSnapshot(resZones);
    } else {
      if (!(e.ctrlKey || e.metaKey) && !(selectedIds.has(eventUid) && selectedIds.size === 1)) {
        setSelectedIds(new Set());
      }
      const startFrames = new Map<string, number>();
      startFrames.set(eventUid, startFrame);
      const dragSet = new Set([eventUid]);
      const resZones = resourceGraphsRef.current
        ? computeResourceZonesForDrag(resourceGraphsRef.current, slotsRef.current, dragSet, events)
        : resourceZonesRef.current;
      const draggedEv = events.find((e) => e.uid === eventUid);
      const invalidSet = draggedEv ? computeInvalidSet([draggedEv], resourceZonesRef.current, eventsRef.current) : new Set<string>();
      const overlapInvalid = draggedEv ? computeOverlapInvalidSet([draggedEv], eventsRef.current) : new Set<string>();
      dragRef.current = { primaryId: eventUid, eventUids: [eventUid], startMouseFrame: e[axis.clientFrame], startFrames, monotonicBounds: getMonotonicBounds([eventUid]), lastAppliedDelta: 0, resourceZonesSnapshot: resZones, invalidAtDragStart: invalidSet, revalidated: new Set(), overlapInvalidAtDragStart: overlapInvalid, overlapRevalidated: new Set(), comboRevalidated: new Map() };
      setDraggingIds(dragSet);
      setDragZonesSnapshot(resZones);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, events, getMonotonicBounds, onEditEvent, onBatchStart, axis]);

  // ─── Frame diamond drag start ────────────────────────────────────────────────
  const handleFrameDragStart = useCallback((e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => {
    if (readOnly || e.button !== 0) return;
    const ev = events.find((ev) => ev.uid === eventUid);
    if (!ev?.segments) return;
    const seg = ev.segments[segmentIndex];
    if (!seg?.frames) return;
    const frame = seg.frames[frameIndex];
    if (!frame) return;

    // Compute bounds: must stay within segment [0, segDuration-1]
    const prevOffset = 0;
    const nextOffset = seg.properties.duration - 1;

    onBatchStart?.();
    frameDragRef.current = {
      eventUid,
      segmentIndex,
      frameIndex,
      startMouseFrame: e[axis.clientFrame],
      startOffsetFrame: frame.offsetFrame,
      minOffset: prevOffset,
      maxOffset: nextOffset,
    };
    dragMovedRef.current = false;
  }, [readOnly, events, onBatchStart, axis]);

  const handleFrameClickGuarded = useCallback((e: React.MouseEvent, eid: string, si: number, fi: number) => {
    if (!dragMovedRef.current) onFrameClick?.(e, eid, si, fi);
  }, [onFrameClick]);

  const handleSegmentResizeDragStart = useCallback((e: React.MouseEvent, eventUid: string, segmentIndex: number, edge: 'start' | 'end') => {
    if (readOnly || e.button !== 0) return;
    const ev = events.find((ev) => ev.uid === eventUid);
    if (!ev) return;
    const seg = ev.segments[segmentIndex];
    if (!seg) return;
    // Minimum duration: max frame offset + 1 (so frames don't exceed segment bounds), or 1
    const maxFrameOffset = seg.frames?.reduce((mx, f) => Math.max(mx, f.offsetFrame), -1) ?? -1;
    const minDuration = maxFrameOffset + 1 || 1;
    // Sibling: the adjacent segment that shares the edge being dragged
    const siblingIndex = edge === 'start' ? segmentIndex - 1 : segmentIndex + 1;
    const sibling = ev.segments[siblingIndex] ?? null;
    const sibMaxFrame = sibling?.frames?.reduce((mx, f) => Math.max(mx, f.offsetFrame), -1) ?? -1;
    const siblingMinDuration = sibling ? (sibMaxFrame + 1 || 1) : 0;

    // Contract durations from real-time back to game-time so the override
    // stores raw durations — the pipeline will re-extend for time-stops.
    const segAbsStart = seg.absoluteStartFrame ?? ev.startFrame;
    const rawDuration = contractByTimeStops(segAbsStart, seg.properties.duration, timeStopRegions);
    const sibAbsStart = sibling?.absoluteStartFrame ?? (segAbsStart + seg.properties.duration);
    const rawSibDuration = sibling ? contractByTimeStops(sibAbsStart, sibling.properties.duration, timeStopRegions) : 0;

    onBatchStart?.();
    segResizeDragRef.current = {
      eventUid,
      segmentIndex,
      edge,
      startMouseFrame: e[axis.clientFrame],
      startDuration: rawDuration,
      minDuration,
      siblingIndex,
      siblingStartDuration: rawSibDuration,
      siblingMinDuration,
    };
    dragMovedRef.current = false;
    setHoverFrame(null);
    updateHoverLineDOM(null);
    e.stopPropagation();
    e.preventDefault();
    // Mark outer as resizing and highlight the active handle
    outerRef.current?.classList.add('segment-resizing');
    const handle = e.currentTarget as HTMLElement | undefined;
    handle?.classList.add('resize-active');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, onBatchStart, axis, timeStopRegions]);

  // ─── Marquee start (mousedown on empty timeline area) ─────────────────────────
  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    // Dup mode: right-click cancels, left-click confirms
    if (dupMode) {
      if (e.button === 2 || e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        if (e.button === 0 && dupValid && onDuplicateEvents) {
          const newIds = onDuplicateEvents(dupSourceRef.current, dupOffset);
          setSelectedIds(new Set(newIds));
        }
        setDupMode(false);
        dupSourceRef.current = [];
      }
      return;
    }
    // Right-click: cancel left-click marquee, start frame marquee
    if (e.button === 2) {
      if (marqueeRef.current) {
        marqueeRef.current = null;
        setMarqueeRect(null);
        return;
      }
      const scroll = scrollRef.current;
      if (!scroll) return;
      const scrollRect = scroll.getBoundingClientRect();
      const contentX = e.clientX - scrollRect.left + scroll.scrollLeft;
      const contentY = e.clientY - scrollRect.top + scroll.scrollTop;
      const bodyTop = bodyTopRef.current ?? 0;
      const contentFrame = isHorizontal ? contentX : contentY;
      const contentLane = isHorizontal ? contentY : contentX;
      if (contentFrame < bodyTop || contentLane < TIME_AXIS_WIDTH) return;
      const ctrlKey = e.ctrlKey || e.metaKey;
      rmbMarqueeRef.current = {
        startX: contentX, startY: contentY, moved: false,
        ctrlKey,
        priorFrames: ctrlKey && selectedFrames ? [...selectedFrames] : [],
      };
      return;
    }
    if (e.button !== 0) return;
    // Left-click: cancel right-click marquee
    if (rmbMarqueeRef.current) {
      rmbMarqueeRef.current = null;
      setMarqueeRect(null);
      return;
    }
    const scroll = scrollRef.current;
    if (!scroll) return;
    const scrollRect = scroll.getBoundingClientRect();
    const contentX = e.clientX - scrollRect.left + scroll.scrollLeft;
    const contentY = e.clientY - scrollRect.top + scroll.scrollTop;
    const bodyTop = bodyTopRef.current ?? 0;
    // Only start marquee in the timeline body area
    const contentFrame = isHorizontal ? contentX : contentY;
    const contentLane = isHorizontal ? contentY : contentX;
    if (contentFrame < bodyTop || contentLane < TIME_AXIS_WIDTH) return;

    const ctrlKey = e.ctrlKey || e.metaKey;
    marqueeRef.current = {
      startX: contentX,
      startY: contentY,
      ctrlKey,
      priorSelection: ctrlKey ? new Set(selectedIds) : new Set(),
    };
    // If not ctrl, clear selection immediately (will be set by marquee)
    if (!ctrlKey) {
      setSelectedIds(new Set());
      onSelectedFramesChange?.([]);
    }
  }, [selectedIds, selectedFrames, onSelectedFramesChange, dupMode, dupValid, dupOffset, onDuplicateEvents, isHorizontal]);

  // ─── Map controller menu items (actionId) to view callbacks ─────────────────
  const resolveMenuItemAction = useCallback((item: import('../consts/viewTypes').ContextMenuItem): import('../consts/viewTypes').ContextMenuItem => {
    if (item.separator || item.header || item.action) return item;
    const { actionId, actionPayload, ...rest } = item;
    // Resolve inline buttons recursively
    const resolvedInline = rest.inlineButtons?.map((btn) => {
      if (btn.action || !btn.actionId) return btn;
      if (btn.actionId === 'addEvent') {
        const p = btn.actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: object | null };
        return { ...btn, action: () => onAddEvent(p.ownerId, p.columnId, p.atFrame, p.defaultSkill) };
      }
      return btn;
    });
    const resolved = resolvedInline ? { ...rest, inlineButtons: resolvedInline } : rest;
    switch (actionId) {
      case 'addEvent': {
        const p = actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: object | null };
        return { ...resolved, action: () => onAddEvent(p.ownerId, p.columnId, p.atFrame, p.defaultSkill) };
      }
      case 'editResource':
        return { ...resolved, action: () => { onEditResource?.(actionPayload as string); onContextMenu(null); } };
      case 'addSegment': {
        const p = actionPayload as { eventId: string; segmentLabel: string };
        return { ...resolved, action: () => { onAddSegment?.(p.eventId, p.segmentLabel); onContextMenu(null); } };
      }
      case 'addFrame': {
        const p = actionPayload as { eventId: string; segmentIndex: number; frameOffsetFrame: number };
        return { ...resolved, action: () => { onAddFrame?.(p.eventId, p.segmentIndex, p.frameOffsetFrame); onContextMenu(null); } };
      }
      default:
        return { ...item, ...(resolvedInline ? { inlineButtons: resolvedInline } : {}) };
    }
  }, [onAddEvent, onEditResource, onContextMenu, onAddSegment, onAddFrame]);

  // ─── Right-click on empty column ────────────────────────────────────────────
  const handleSubTimelineContextMenu = useCallback((
    e: React.MouseEvent,
    col: Column,
  ) => {
    e.preventDefault();
    if (readOnly) return;
    e.stopPropagation();
    if (dupMode) { setDupMode(false); dupSourceRef.current = []; return; }
    if (rmbDraggedRef.current) return;
    onSelectedFramesChange?.([]);

    const scrollFrame = scrollRef.current?.[axis.scrollPos] ?? 0;
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect || bodyTopRef.current === null) return;

    const relFrame = e[axis.clientFrame] - rect[axis.rectFrameStart] + scrollFrame - bodyTopRef.current;
    const atFrame = pxToFrame(Math.max(0, relFrame), zoomRef.current);

    // Compute relative click along lane axis for by-column-id micro-columns
    const colPos = columnPositions.get(col.key);
    const relClickX = colPos ? e[axis.clientLane] - (rect[axis.rectLaneStart] - (scrollRef.current?.[axis.scrollLane] ?? 0)) - colPos.left : undefined;

    const effectiveMode = (e.ctrlKey || e.metaKey)
      ? (interactionMode === InteractionModeType.STRICT ? InteractionModeType.FREEFORM : InteractionModeType.STRICT)
      : interactionMode;
    const items = buildColumnContextMenu(col, atFrame, relClickX, {
      events, slots, resourceGraphs, alwaysAvailableComboSlots,
      timeStopRegions, staggerBreaks, columnPositions, interactionMode: effectiveMode,
    });
    if (!items) return;

    // Check if click landed on an event — add Remove Event option
    const eventEl = (e.target as HTMLElement | undefined)?.closest?.('[data-event-uid]');
    const clickedEventUid = eventEl?.getAttribute('data-event-uid') ?? null;
    const removeItems: import('../consts/viewTypes').ContextMenuItem[] = [];
    if (clickedEventUid) {
      removeItems.push({ separator: true }, { label: 'Remove Event', action: () => onRemoveEvent(clickedEventUid), danger: true });
    }

    onContextMenu({
      x: e.clientX, y: e.clientY,
      items: [...items.map(resolveMenuItemAction), ...removeItems],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onContextMenu, events, columnPositions, resourceGraphs, onSelectedFramesChange, dupMode, slots, interactionMode, timeStopRegions, staggerBreaks, alwaysAvailableComboSlots, resolveMenuItemAction, axis, isHorizontal, onRemoveEvent]);

  // ─── Right-click on status column header ───────────────────────────────────
  // Collect all status types across all status columns (global setting)
  const { statusTypeCounts, permanentCount } = useMemo(() => {
    const types = new Map<string, number>();
    let permCount = 0;
    for (const col of columnsProp) {
      if (col.type !== 'mini-timeline' || !col.microColumns || col.microColumnAssignment !== 'dynamic-split') continue;
      const hasTyped = col.microColumns.some((mc) => mc.statusType);
      if (!hasTyped) continue;
      for (const mc of col.microColumns) {
        const effectiveType = mc.statusType ?? NounType.SKILL_STATUS;
        types.set(effectiveType, (types.get(effectiveType) ?? 0) + 1);
        if (mc.permanent) permCount++;
      }
    }
    return { statusTypeCounts: types, permanentCount: permCount };
  }, [columnsProp]);

  // Ref for checked getters to read current hidden state without stale closures
  const hiddenStatusTypesRef = useRef(hiddenStatusTypes);
  hiddenStatusTypesRef.current = hiddenStatusTypes;

  /** Update hidden status types and eagerly sync the ref for immediate getter reads. */
  const toggleHiddenStatusTypes = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setHiddenStatusTypes((prev) => {
      const next = updater(prev);
      hiddenStatusTypesRef.current = next;
      return next;
    });
  }, []);

  const handleHeaderContextMenu = useCallback((e: React.MouseEvent, col: Column) => {
    e.preventDefault();
    e.stopPropagation();
    if (col.type !== 'mini-timeline' || col.microColumnAssignment !== 'dynamic-split') return;
    if (statusTypeCounts.size === 0) return;
    const unfilteredCol = columnsProp.find((c) => c.key === col.key);
    if (!unfilteredCol || unfilteredCol.type !== 'mini-timeline' || !unfilteredCol.microColumns?.some((mc) => mc.statusType)) return;
    const items: import('../consts/viewTypes').ContextMenuItem[] = [
      { label: 'Status Filters', header: true },
    ];
    for (const group of STATUS_FILTER_GROUPS) {
      // Permanent group: cross-cutting, uses PERMANENT_FILTER_KEY
      if (group.permanent) {
        if (permanentCount === 0) continue;
        items.push({
          label: `${group.label} (${permanentCount})`,
          checked: () => !hiddenStatusTypesRef.current.has(PERMANENT_FILTER_KEY),
          keepOpen: true,
          action: () => {
            toggleHiddenStatusTypes((prev) => {
              const next = new Set(prev);
              if (next.has(PERMANENT_FILTER_KEY)) next.delete(PERMANENT_FILTER_KEY); else next.add(PERMANENT_FILTER_KEY);
              return next;
            });
          },
        });
        continue;
      }
      // Source-based groups — flat list of individually toggleable types
      const groupTypes = group.types.filter((t) => statusTypeCounts.has(t));
      if (groupTypes.length === 0) continue;
      if (groupTypes.length === 1) {
        const type = groupTypes[0];
        const count = statusTypeCounts.get(type) ?? 0;
        items.push({
          label: `${group.label} (${count})`,
          checked: () => !hiddenStatusTypesRef.current.has(type),
          keepOpen: true,
          action: () => {
            toggleHiddenStatusTypes((prev) => {
              const next = new Set(prev);
              if (next.has(type)) next.delete(type); else next.add(type);
              return next;
            });
          },
        });
      } else {
        items.push({ label: group.label, header: true });
        for (const type of groupTypes) {
          const count = statusTypeCounts.get(type) ?? 0;
          items.push({
            label: `${STATUS_TYPE_LABELS[type] ?? type} (${count})`,
            checked: () => !hiddenStatusTypesRef.current.has(type),
            keepOpen: true,
            action: () => {
              toggleHiddenStatusTypes((prev) => {
                const next = new Set(prev);
                if (next.has(type)) next.delete(type); else next.add(type);
                return next;
              });
            },
          });
        }
      }
    }
    for (const [type, count] of Array.from(statusTypeCounts.entries())) {
      if (STATUS_FILTER_GROUPS.some((g) => g.types.includes(type as string))) continue;
      items.push({
        label: `${STATUS_TYPE_LABELS[type] ?? type} (${count})`,
        checked: () => !hiddenStatusTypesRef.current.has(type),
        keepOpen: true,
        action: () => {
          toggleHiddenStatusTypes((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type); else next.add(type);
            return next;
          });
        },
      });
    }
    onContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [statusTypeCounts, permanentCount, onContextMenu, columnsProp, toggleHiddenStatusTypes]);

  // ─── Right-click on event ────────────────────────────────────────────────────
  const handleEventContextMenu = useCallback((
    e: React.MouseEvent,
    eventUid: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return;
    if (rmbDraggedRef.current) return;
    onSelectedFramesChange?.([]);

    // ── Batch: right-clicked event is part of a multi-selection ─────────
    if (selectedIds.has(eventUid) && selectedIds.size > 1) {
      const ids = Array.from(selectedIds);
      const items: import('../consts/viewTypes').ContextMenuItem[] = [];
      if (onResetEvents) {
        items.push({ label: `Reset ${ids.length} Events`, action: () => { onResetEvents(ids); onContextMenu(null); } });
      }
      if (onRemoveEvents) {
        items.push({ label: `Remove ${ids.length} Events`, action: () => { onRemoveEvents(ids); setSelectedIds(new Set()); onContextMenu(null); }, danger: true });
      }
      onContextMenu({ x: e.clientX, y: e.clientY, items });
      return;
    }

    // ── Single event ───────────────────────────────────────────────────
    const ev = events.find((ev) => ev.uid === eventUid);
    if (!ev) return;

    // Control events: show remove + the column's add items (dash/dodge)
    if (ev.name === NounType.CONTROL) {
      const col = columns.find((c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE && c.ownerId === ev.ownerId && c.columnId === ev.columnId);
      const items: import('../consts/viewTypes').ContextMenuItem[] = [];
      if (onRemoveEvent) {
        items.push({ label: 'Remove Event', action: () => { onRemoveEvent(eventUid); onContextMenu(null); }, danger: true });
      }
      if (col) {
        const clickFrame = hoverFrameRef.current ?? ev.startFrame;
        const colMenu = buildColumnContextMenu(col, clickFrame, undefined, {
          events, slots, resourceGraphs,
          alwaysAvailableComboSlots: getAlwaysAvailableComboSlots(slots),
          timeStopRegions,
          staggerBreaks,
          columnPositions: columnPositionsRef.current,
          interactionMode,
        });
        if (colMenu) {
          const addItems = colMenu.filter(i => i.actionId === 'addEvent').map(resolveMenuItemAction);
          if (addItems.length > 0) {
            items.push({ separator: true });
            items.push(...addItems);
          }
        }
      }
      if (items.length > 0) onContextMenu({ x: e.clientX, y: e.clientY, items });
      return;
    }

    // Combo activation window: show combo skill column's add items (no remove/reset)
    if (ev.columnId === COMBO_WINDOW_COLUMN_ID) {
      const comboCol = columns.find((c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE && c.ownerId === ev.ownerId && c.columnId === NounType.COMBO);
      if (comboCol) {
        const clickFrame = hoverFrameRef.current ?? ev.startFrame;
        const colMenu = buildColumnContextMenu(comboCol, clickFrame, undefined, {
          events, slots, resourceGraphs,
          alwaysAvailableComboSlots: getAlwaysAvailableComboSlots(slots),
          timeStopRegions,
          staggerBreaks,
          columnPositions: columnPositionsRef.current,
          interactionMode,
        });
        if (colMenu) {
          const addItems = colMenu.filter(i => i.actionId === 'addEvent').map(resolveMenuItemAction);
          if (addItems.length > 0) {
            onContextMenu({ x: e.clientX, y: e.clientY, items: addItems });
          }
        }
      }
      return;
    }
    if (interactionMode === InteractionModeType.STRICT) {
      const col = columns.find((c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE && c.ownerId === ev.ownerId && c.columnId === ev.columnId);
      if (col?.derived) return;
    }

    const multiSegment = ev.segments.length > 1;
    const isCombo = ev.columnId === NounType.COMBO;

    // Determine which segment the click landed on
    const evEl = scrollRef.current?.querySelector(`[data-event-uid="${eventUid}"]`) as HTMLElement | null;
    let hoveredSegIndex = 0;
    if (evEl) {
      const evRect = evEl.getBoundingClientRect();
      const clickRel = e[axis.clientFrame] - evRect[axis.rectFrameStart];
      let running = 0;
      for (let si = 0; si < ev.segments.length; si++) {
        const segPx = durationToPx(ev.segments[si].properties.duration, zoomRef.current);
        if (clickRel < running + segPx) { hoveredSegIndex = si; break; }
        running += segPx;
        hoveredSegIndex = si;
      }
    }
    const segLabel = ev.segments[hoveredSegIndex]?.properties.name ?? formatSegmentShortName(undefined, hoveredSegIndex);

    const items: import('../consts/viewTypes').ContextMenuItem[] = [];
    if (onResetEvent) items.push({ label: 'Reset Event to Default', action: () => { onResetEvent(eventUid); onContextMenu(null); } });
    if (multiSegment && !isCombo && onResetSegments) {
      items.push({ label: `Reset Segment ${segLabel}`, action: () => { onResetSegments(eventUid); onContextMenu(null); } });
    }
    items.push({ label: 'Remove Event', action: () => { onRemoveEvent(eventUid); onContextMenu(null); }, danger: true });
    onContextMenu({ x: e.clientX, y: e.clientY, items });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRemoveEvent, onRemoveEvents, onResetEvent, onResetEvents, onResetSegments, onContextMenu, events, selectedIds, onSelectedFramesChange, interactionMode, axis]);

  // ─── Right-click on frame diamond ──────────────────────────────────────────
  const handleFrameContextMenu = useCallback((
    e: React.MouseEvent,
    eventUid: string,
    segmentIndex: number,
    frameIndex: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return;
    if (rmbDraggedRef.current) return;
    const isInSelection = selectedFrames?.some(
      (sf) => sf.eventUid === eventUid && sf.segmentIndex === segmentIndex && sf.frameIndex === frameIndex,
    );
    const isBatch = isInSelection && selectedFrames && selectedFrames.length > 1;
    const targetFrames = isBatch ? selectedFrames : [{ eventUid, segmentIndex, frameIndex }];

    // Filter out DOT frames (cannot crit)
    const crittableFrames = targetFrames.filter((sf) => {
      const ev = events.find((ev) => ev.uid === sf.eventUid);
      return ev?.segments[sf.segmentIndex]?.frames?.[sf.frameIndex]?.damageType !== DamageType.DAMAGE_OVER_TIME;
    });

    // Resolve crit state for toggle: mixed/no-crit → crit, all crit → no-crit
    const resolveCrit = (sf: import('../consts/viewTypes').SelectedFrame) => {
      const ev = events.find((ev) => ev.uid === sf.eventUid);
      return ev?.segments[sf.segmentIndex]?.frames?.[sf.frameIndex]?.isCrit ?? false;
    };
    const allCrit = crittableFrames.length > 0 && crittableFrames.every(resolveCrit);
    const critTarget = !allCrit;

    const items: import('../consts/viewTypes').ContextMenuItem[] = [];

    if (onSetCritPins && crittableFrames.length > 0) {
      items.push({
        label: isBatch
          ? (allCrit ? `Set ${crittableFrames.length} Frames No-Crit` : `Set ${crittableFrames.length} Frames Crit`)
          : (allCrit ? 'Set No-Crit' : 'Set Crit'),
        action: () => {
          // Imperative DOM update for instant visual feedback
          for (const sf of crittableFrames) {
            const el = document.querySelector(`[data-frame-id="${sf.eventUid}-${sf.segmentIndex}-${sf.frameIndex}"]`);
            if (el) el.classList.toggle('event-frame-diamond--crit', critTarget);
          }
          onSetCritPins(crittableFrames, critTarget);
          onContextMenu(null);
        },
      });
    }

    if (isBatch) {
      items.push({
        label: `Remove ${targetFrames.length} Frames`,
        action: () => {
          onRemoveFrames?.(targetFrames);
          onSelectedFramesChange?.([]);
          onContextMenu(null);
        },
        danger: true,
      });
    } else {
      items.push({
        label: 'Remove Frame',
        action: () => { onRemoveFrame?.(eventUid, segmentIndex, frameIndex); onContextMenu(null); },
        danger: true,
      });
    }

    onContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [readOnly, onContextMenu, onRemoveFrame, onRemoveFrames, onSetCritPins, selectedFrames, onSelectedFramesChange, events]);

  // ─── Right-click on segment (multi-segment events only) ────────────────────
  const handleSegmentContextMenu = useCallback((
    e: React.MouseEvent,
    eventUid: string,
    segmentIndex: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return;
    if (rmbDraggedRef.current) return;
    onSelectedFramesChange?.([]);
    const ev = events.find((ev) => ev.uid === eventUid);
    if (!ev) return;
    const segLabel = ev.segments[segmentIndex]?.properties.name ?? formatSegmentShortName(undefined, segmentIndex);
    const multiSegment = ev.segments.length > 1;
    const isCombo = ev.columnId === NounType.COMBO;
    const items: import('../consts/viewTypes').ContextMenuItem[] = [];
    if (onResetEvent) items.push({ label: 'Reset Event to Default', action: () => { onResetEvent(eventUid); } });
    if (multiSegment && !isCombo && onResetSegments) {
      items.push({ label: `Reset Segment ${segLabel}`, action: () => { onResetSegments(eventUid); } });
    }
    items.push({ label: 'Remove Event', action: () => onRemoveEvent(eventUid), danger: true });
    onContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [readOnly, onContextMenu, onRemoveEvent, onResetEvent, onResetSegments, onSelectedFramesChange, events]);

  // ─── Warning tooltip (canvas hover on warning icons) ────────────────────────
  const handleWarningHover = useCallback((eventUid: string | null, clientX: number, clientY: number) => {
    const tip = warningTooltipRef.current;
    if (!tip) return;
    if (!eventUid) {
      tip.style.display = 'none';
      return;
    }
    const pres = eventPresentations.get(
      Array.from(eventPresentations.keys()).find(k => k.endsWith(`:${eventUid}`)) ?? eventUid
    );
    if (!pres?.comboWarning) { tip.style.display = 'none'; return; }
    tip.textContent = pres.comboWarning;
    tip.style.display = 'block';
    tip.style.left = `${clientX + 12}px`;
    tip.style.top = `${clientY - 8}px`;
  }, [eventPresentations]);

  // ─── PixiJS canvas interaction callbacks ────────────────────────────────────
  const canvasCallbacks = useMemo((): import('./canvas/canvasTypes').CanvasCallbacks => ({
    onEventDragStart: handleEventDragStart,
    onEventSelect: handleEventSelect,
    onEventDoubleClick: handleEventDoubleClick,
    onEventContextMenu: handleEventContextMenu,
    onEventHover: handleEventHover,
    onFrameClick: handleFrameClickGuarded,
    onFrameContextMenu: handleFrameContextMenu,
    onFrameDragStart: handleFrameDragStart,
    onSegmentContextMenu: handleSegmentContextMenu,
    onSegmentResizeDragStart: handleSegmentResizeDragStart,
    onColumnContextMenu: handleSubTimelineContextMenu,
    onMarqueeStart: handleTimelineMouseDown,
    onWarningHover: handleWarningHover,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
  }), [handleEventDragStart, handleEventSelect, handleEventDoubleClick,
    handleEventContextMenu, handleEventHover, handleFrameClickGuarded,
    handleFrameContextMenu, handleFrameDragStart, handleSegmentContextMenu,
    handleSegmentResizeDragStart, handleSubTimelineContextMenu, handleTimelineMouseDown,
    handleWarningHover, handleMouseMove, handleMouseUp]);
  // NOTE: onMouseMove/onMouseUp are still needed — InteractionBridge forwards
  // PixiJS pointermove/pointerup to these for drag tracking and hover line updates.

  return (
    <div
      ref={outerRef}
      className={`timeline-outer${isHorizontal ? ' timeline-outer--horizontal' : ''}${dupMode ? ' timeline-outer--dup' : ''}${marqueeRect ? ' timeline-outer--selecting' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onContextMenu={dupMode ? (e) => { e.preventDefault(); setDupMode(false); dupSourceRef.current = []; } : undefined}
      onMouseDown={dupMode ? (e) => {
        if (e.button === 0) {
          e.preventDefault();
          e.stopPropagation();
          if (dupValid && onDuplicateEvents) {
            const newIds = onDuplicateEvents(dupSourceRef.current, dupOffset);
            setSelectedIds(new Set(newIds));
          }
          setDupMode(false);
          dupSourceRef.current = [];
        }
      } : undefined}
    >
      {/* ── Fixed headers (outside scroll) ─────────────────────── */}
      <div className="timeline-header-area" style={isHorizontal && scrollClientHeight ? { height: scrollClientHeight } : undefined}>
        {/* Row 1: Loadout — in horizontal mode, stacks vertically as rows */}
        <div
          ref={loadoutRef}
          className="timeline-header-grid"
          style={isHorizontal ? { gridTemplateRows: gridRows } : { gridTemplateColumns: gridCols }}
        >
          <div className="tl-loadout-corner">
            <span className="corner-label">LOADOUT</span>
            {onToggleOrientation && (
              <button
                className="btn-orientation-toggle"
                onClick={onToggleOrientation}
                title={isHorizontal ? 'Switch to vertical timeline' : 'Switch to horizontal timeline'}
              >
                {isHorizontal ? 'Horizontal' : 'Vertical'}
              </button>
            )}
          </div>

          <div
            className="tl-loadout-cell tl-loadout-cell--common"
            style={{ [isHorizontal ? 'gridRow' : 'gridColumn']: `${commonStartCol} / span ${commonColCount}` } as React.CSSProperties}
          >
            <div className="lo-cell lo-cell--common">
              <span className="lo-common-label">TEAM</span>
            </div>
          </div>

          {slotGroups.map((group) => {
            const { slot } = group;
            const op = slot.operator;
            return (
              <div
                key={`lo-${slot.slotId}`}
                className={`tl-loadout-cell tl-group-start${op ? ' tl-loadout-cell--occupied' : ''}${editingSlotId === slot.slotId ? ' tl-loadout-cell--editing' : ''}`}
                style={{
                  [isHorizontal ? 'gridRow' : 'gridColumn']: `${group.startCol} / span ${group.columnCount}`,
                  '--op-color': op?.color ?? '#666',
                } as React.CSSProperties}
              >
                <OperatorLoadoutHeader
                  operatorName={op?.name ?? 'EMPTY'}
                  operatorColor={op?.color ?? '#666'}
                  operatorWeaponTypes={op?.weaponTypes ?? EMPTY_WEAPON_TYPES}
                  splash={op?.splash}
                  state={loadouts[slot.slotId]}
                  slotId={slot.slotId}
                  onEdit={readOnly ? noop1 : onEditLoadout}
                />
              </div>
            );
          })}

          {enemyColCount > 0 && (
            <div
              className="tl-loadout-cell tl-loadout-cell--enemy tl-group-start"
              style={{ [isHorizontal ? 'gridRow' : 'gridColumn']: `${colIdx} / span ${enemyColCount}` } as React.CSSProperties}
            >
              <div className="lo-cell lo-cell--enemy">
                <div
                  ref={enemyNameRef}
                  className={`lo-enemy-splash${allEnemies ? ' lo-enemy-splash--clickable' : ''}`}
                  onClick={handleEnemyClick}
                >
                  {enemy.sprite ? (
                    <img className="lo-enemy-splash-img" src={enemy.sprite} alt={enemy.name} />
                  ) : (
                    <div className="lo-enemy-splash-fallback" />
                  )}
                </div>
                <div className="lo-enemy-splash-fade" />
                <div className="lo-name-row">
                  <span className="lo-enemy-name">{enemy.name}</span>
                </div>
              </div>

              {onEditEnemy && (
                <button className="lo-edit-btn" onClick={onEditEnemy} title="Edit enemy stats">
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M7.5.8 9.2 2.5 3.2 8.5.5 9.5l1-2.7z"/>
                  </svg>
                </button>
              )}

              {enemyMenuOpen && enemyMenuPos && allEnemies && createPortal(
                <div
                  ref={enemyMenuRef}
                  className="lo-dropdown-menu lo-enemy-menu"
                  style={{ top: enemyMenuPos.top, left: enemyMenuPos.left }}
                  onMouseMove={(e) => e.stopPropagation()}
                >
                  <DropdownTierBar
                    search={enemySearch}
                    onSearch={setEnemySearch}
                    tiers={Array.from(ENEMY_TIERS)}
                    activeTiers={enemyActiveTiers}
                    onToggleTier={toggleEnemyTier}
                  />
                  <div className="lo-dropdown-scroll">
                    {filteredEnemies.map((en) => (
                      <button
                        key={en.id}
                        className={`lo-dropdown-option${en.id === enemy.id ? ' selected' : ''}`}
                        onClick={() => pickEnemy(en.id)}
                      >
                        {en.sprite ? (
                          <img className="lo-enemy-option-sprite" src={en.sprite} alt={en.name} />
                        ) : (
                          <span className="lo-dropdown-option-empty" />
                        )}
                        <span className="lo-dropdown-option-name">{en.name}</span>
                      </button>
                    ))}
                  </div>
                </div>,
                document.body,
              )}
            </div>
          )}
        </div>

        {/* Row 2: Skill column headers — becomes row labels in horizontal mode */}
        <div
          ref={headerGridRef}
          className="timeline-header-grid"
          style={isHorizontal
            ? { gridTemplateRows: gridRows, width: HEADER_HEIGHT }
            : { gridTemplateColumns: gridCols }
          }
        >
          <div className="tl-corner">
          </div>

          {columns.map((col) => (
            <div
              key={`hdr-${col.key}`}
              className={`tl-header-cell${col.type === 'mini-timeline' && col.headerVariant === 'infliction' ? ' enemy-header' : ''}${col.type === 'placeholder' ? ' tl-header-cell--empty' : ''}${groupStartKeys.has(col.key) ? ' tl-group-start' : ''}`}
              data-header-col-key={col.key}
              style={{ '--op-color': col.color } as React.CSSProperties}
              onContextMenu={col.type === 'mini-timeline' && col.microColumns && col.microColumnAssignment === 'dynamic-split'
                ? (e) => handleHeaderContextMenu(e, col)
                : undefined}
            >
              {col.type === 'mini-timeline' && col.headerVariant === 'skill' ? (
                <span className={`skill-badge skill-badge--vertical skill-badge--${col.columnId}`}>
                  {col.label}
                </span>
              ) : col.type === 'mini-timeline' && col.headerVariant === 'infliction' ? (
                <span
                  className="skill-badge skill-badge--vertical"
                  style={{ color: col.color }}
                >
                  {col.label}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────── */}
      <div ref={scrollRef} className={`timeline-scroll${isHorizontal ? ' timeline-scroll--horizontal' : ''}${hideScrollbar ? ' timeline-scroll--no-bar' : ''}${draggingIds ? ' timeline-scroll--dragging' : ''}`}>
        {/* PixiJS canvas — renders events, gridlines, selection; handles all interaction */}
        <TimelineCanvas
          data={canvasRenderData}
          tlHeight={tlHeight}
          scrollRef={scrollRef}
          callbacks={canvasCallbacks}
          columnLayoutRef={columnLayoutRef}
          canvasRendererRef={canvasRendererRef}
        />
        <div
          className={`timeline-body-grid${isHorizontal ? ' timeline-body-grid--horizontal' : ''}`}
          style={isHorizontal
            ? { gridTemplateRows: gridRows }
            : { gridTemplateColumns: gridCols }
          }
        >
          {/* Time axis */}
          <div ref={timeAxisRef} className="tl-time-axis" style={{ [axis.frameSize]: tlHeight } as React.CSSProperties}>
            {tickElements}
          </div>

          {/* Sub-timeline columns */}
          {columns.map((col) => {
            if (col.type === 'placeholder') {
              return (
                <div
                  key={`col-${col.key}`}
                  className={`tl-sub-timeline tl-sub-timeline--empty${groupStartKeys.has(col.key) ? ' tl-group-start' : ''}`}
                  data-col-key={col.key}
                  style={{ [axis.frameSize]: tlHeight } as React.CSSProperties}
                />

              );
            }

            const comboWindowEvts = col.columnId === NounType.COMBO
              ? (comboWindowEventsByOwner.get(col.ownerId) ?? EMPTY_COMBO_WINDOW_EVENTS)
              : EMPTY_COMBO_WINDOW_EVENTS;

            return (
              <TimelineColumn
                key={`col-${col.key}`}
                col={col}
                viewModel={columnViewModels.get(col.key)}
                zoom={zoom}
                axis={axis}
                isHorizontal={isHorizontal}
                tlHeight={tlHeight}
                isGroupStart={groupStartKeys.has(col.key)}
                resourceGraph={resourceGraphs?.get(col.key)}
                insufficiencyZones={resourceInsufficiencyZones.get(`${col.ownerId}:${NounType.BATTLE}`)}
                alwaysAvailableCombo={alwaysAvailableComboSlots.has(col.ownerId)}
                comboWindowEvents={comboWindowEvts}
                enemyStaggerNodes={enemy.staggerNodes}
                interactionMode={interactionMode}
              />
            );
          })}

        </div>

        {/* Time-stop overlays rendered on the canvas (TimelineRenderer) */}

        {/* Marquee selection box */}
        {marqueeRect && (
          <div
            className="selection-marquee"
            style={{
              position: 'absolute',
              left: marqueeRect.left,
              top: marqueeRect.top,
              width: marqueeRect.width,
              height: marqueeRect.height,
            }}
          />
        )}

        {/* Duplicate ghost events */}
        {dupMode && dupSourceRef.current.map((src) => {
          const ghostFrame = src.startFrame + dupOffset;
          const colKey = columns.find((c) =>
            c.type === 'mini-timeline' &&
            c.ownerId === src.ownerId &&
            (c.columnId === src.columnId || (c.matchColumnIds?.includes(src.columnId) ?? false)),
          )?.key;
          const colPos = colKey ? columnPositions.get(colKey) : undefined;
          if (!colPos) return null;
          const topPx = frameToPx(ghostFrame, zoom);
          const totalDuration = computeSegmentsSpan(src.segments);
          const heightPx = durationToPx(totalDuration, zoom);
          return (
            <div
              key={`ghost-${src.uid}`}
              className={`dup-ghost ${dupValid ? 'dup-ghost--valid' : 'dup-ghost--invalid'}`}
              style={{
                position: 'absolute',
                [axis.framePos]: topPx,
                [axis.lanePos]: colPos.left,
                [axis.laneSize]: colPos.right - colPos.left,
                [axis.frameSize]: heightPx,
                pointerEvents: 'none',
              } as React.CSSProperties}
            />
          );
        })}

      </div>

      {/* Hover line — always mounted, positioned imperatively via updateHoverLineDOM */}
        <div
          ref={hoverLineRef}
          className={`hover-line hover-line--imperative${isHorizontal ? ' hover-line--horizontal' : ''}`}
        >
          {hoverFrame !== null && outerRect && (() => {
            const totalSec = hoverFrame / FPS;
            const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
            const secsRaw = (totalSec % 60).toFixed(2);
            const secs = secsRaw.indexOf('.') < 2 ? secsRaw.padStart(5, '0') : secsRaw;
            const frameNum = Math.round(hoverFrame) % FPS;

            // Resource graph indicators
            const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
            const resourceIndicators: React.ReactNode[] = [];
            if (resourceGraphs) {
              for (const [colKey, graph] of Array.from(resourceGraphs)) {
                const colPos = columnPositions.get(colKey);
                if (!colPos || graph.points.length < 2 || graph.max === graph.min) continue;

                // Interpolate value at hoverFrame (max value at frame, handles gain+consume at same frame)
                const pts = graph.points;
                let value = pts[0].value;
                let foundAtFrame = false;
                let maxAtFrame = -Infinity;
                let lastBeforeIdx = 0;
                for (let i = 0; i < pts.length; i++) {
                  if (pts[i].frame > hoverFrame) break;
                  if (pts[i].frame === hoverFrame) {
                    foundAtFrame = true;
                    maxAtFrame = Math.max(maxAtFrame, pts[i].value);
                  } else {
                    lastBeforeIdx = i;
                  }
                }
                if (foundAtFrame) {
                  value = maxAtFrame;
                } else {
                  const p0 = pts[lastBeforeIdx];
                  const p1 = pts[lastBeforeIdx + 1];
                  if (!p1 || p0.frame === p1.frame) {
                    value = p0.value;
                  } else {
                    const t = (hoverFrame - p0.frame) / (p1.frame - p0.frame);
                    value = p0.value + t * (p1.value - p0.value);
                  }
                }

                const col = columns.find((c) => c.key === colKey);
                const dotColor = col?.color ?? 'rgba(100, 200, 255, 1)';

                if (isHorizontal) {
                  // In horizontal mode: position dot along Y axis of the vertical hover line.
                  // Find the row element for this column in the body grid.
                  const colIdx = columns.findIndex((c) => c.key === colKey);
                  const rowEl = scrollRef.current?.querySelector(`.tl-sub-timeline:nth-child(${colIdx + 2})`) as HTMLElement | null; // +2 for 1-indexed + time axis
                  if (rowEl) {
                    const rowRect = rowEl.getBoundingClientRect();
                    const yInLine = rowRect.top + rowRect.height / 2 - outerRect.top;
                    resourceIndicators.push(
                      <div
                        key={colKey}
                        className="hover-line-resource-dot hover-line-resource-dot--horizontal"
                        style={{ top: yInLine, borderColor: dotColor, boxShadow: `0 0 6px ${dotColor}55` }}
                      >
                        {value.toFixed(1).replace(/\.0$/, '')}
                      </div>
                    );
                  }
                } else {
                  // In vertical mode: position dot along X axis of the horizontal hover line.
                  const colWidth = colPos.right - colPos.left;
                  const xInLine = colPos.left - scrollLeft + colWidth / 2;
                  resourceIndicators.push(
                    <div
                      key={colKey}
                      className="hover-line-resource-dot"
                      style={{ left: xInLine, borderColor: dotColor, boxShadow: `0 0 6px ${dotColor}55` }}
                    >
                      {value.toFixed(1).replace(/\.0$/, '')}
                    </div>
                  );
                }
              }
            }

            return (
              <>
                <span className="hover-line-label">
                  <span className="hover-line-time">{`${mins}:${secs}s`}</span>
                </span>
                <span className="hover-line-label-below">
                  <span className="hover-line-frame">{`F${String(frameNum).padStart(3, '0')}`}</span>
                </span>
                {resourceIndicators}
              </>
            );
          })()}
        </div>
      {createPortal(
        <div ref={warningTooltipRef} style={{
          display: 'none', position: 'fixed', zIndex: 10000,
          background: '#1a1a1a', border: '1px solid #555', borderRadius: 4,
          padding: '4px 8px', fontSize: 11, color: '#f0a030',
          fontFamily: 'Rajdhani, sans-serif', whiteSpace: 'pre-line',
          pointerEvents: 'none', maxWidth: 260,
        }} />,
        document.body,
      )}
    </div>
  );
});
