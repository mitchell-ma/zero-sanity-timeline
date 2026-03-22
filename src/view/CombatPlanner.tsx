import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import EventBlock from './EventBlock';
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
  frameToDetailLabel,
  FPS,
  TIME_AXIS_WIDTH,
  HEADER_HEIGHT,
  TOTAL_FRAMES,
  TIMELINE_TOP_PAD,
} from '../utils/timeline';
import { SKILL_COLUMNS, OPERATOR_COLUMNS, COMBO_WINDOW_COLUMN_ID } from '../model/channels';
import { TimelineSourceType, InteractionModeType, CombatSkillsType } from '../consts/enums';
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
  eventEndFrame,
  durationSegment,
} from "../consts/viewTypes";
import { MicroColumnController } from '../controller/timeline/microColumnController';
import type { Slot } from '../controller/timeline/columnBuilder';
import { formatSegmentShortName } from '../dsl/semanticsTranslation';
import { COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import {
  getAlwaysAvailableComboSlots,
  computeResourceInsufficiencyZones,
  computeResourceZonesForDrag,
  isDuplicatePlacementInResourceZone,
} from '../controller/timeline/eventValidator';
import { computeAllValidations } from '../controller/timeline/eventValidationController';
import { computeSlotElementColors, computeEventPresentation } from '../controller/timeline/eventPresentationController';
import { computeStatusViewOverrides } from '../controller/timeline/statusViewController';
import {
  buildColumnContextMenu,
  buildEventAddItems,
  buildSegmentAddItems as buildSegmentAddItemsCtrl,
  buildFrameAddItems as buildFrameAddItemsCtrl,
  controlledItem,
} from '../controller/timeline/contextMenuController';
import { useTouchHandlers } from '../utils/useTouchHandlers';
import { throttleByRAF } from '../utils/throttle';
import type { ResourcePoint } from '../controller/timeline/resourceTimeline';
import { getAxisMap, type Orientation } from '../utils/axisMap';


const MIN_SLOT_COLS = 4;


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
  onMoveEvent: (id: string, newStartFrame: number, overlapExemptIds?: Set<string>) => void;
  onMoveEvents?: (ids: string[], delta: number, overlapExemptIds?: Set<string>) => void;
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
  onFrameClick?: (eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onRemoveFrame?: (eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onRemoveFrames?: (frames: import('../consts/viewTypes').SelectedFrame[]) => void;
  onRemoveSegment?: (eventUid: string, segmentIndex: number) => void;
  onAddSegment?: (eventUid: string, segmentLabel: string) => void;
  onAddFrame?: (eventUid: string, segmentIndex: number, frameOffsetFrame: number) => void;
  onMoveFrame?: (eventUid: string, segmentIndex: number, frameIndex: number, newOffsetFrame: number) => void;
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
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop2 = (_a: unknown, _b: unknown) => {};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop3 = (_a: unknown, _b: unknown, _c: unknown) => {};

const STATUS_TYPE_LABELS: Record<string, string> = {
  STATUS: 'Status',
  TALENT: 'Talent', TALENT_STATUS: 'Talent Status', SKILL_STATUS: 'Skill Status',
  GEAR_STATUS: 'Gear Status', WEAPON_STATUS: 'Weapon Status',
  POTENTIAL: 'Potential', POTENTIAL_STATUS: 'Potential Status',
};

export default function CombatPlanner({
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
  onRemoveSegment,
  onAddSegment,
  onAddFrame,
  onMoveFrame,
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
}: CombatPlannerProps) {
  const axis = getAxisMap(orientation);
  const isHorizontal = orientation === 'horizontal';
  const scrollRef   = useRef<HTMLDivElement>(null);
  const outerRef    = useRef<HTMLDivElement>(null);
  const loadoutRef  = useRef<HTMLDivElement>(null);
  const headerGridRef = useRef<HTMLDivElement>(null);
  const timeAxisRef = useRef<HTMLDivElement>(null);
  const dragRef     = useRef<DragState | null>(null);
  const marqueeRef  = useRef<MarqueeState | null>(null);
  const rmbMarqueeRef = useRef<{ startX: number; startY: number; moved: boolean; ctrlKey: boolean; priorFrames: SelectedFrame[] } | null>(null);
  const rmbDraggedRef = useRef(false);
  const dragMovedRef = useRef(false);
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
  const zoomRef     = useRef(zoom);
  const bodyTopRef  = useRef<number | null>(null);
  /** Raw mouse client position along frame axis — used to recompute hoverFrame on scroll. */
  const hoverClientFrameRef = useRef<number | null>(null);

  const [hoverClientY,     setHoverClientY]     = useState<number | null>(null);
  const [hoverFrame,       setHoverFrameRaw]    = useState<number | null>(null);
  const setHoverFrame = useCallback((f: number | null) => {
    setHoverFrameRaw(f);
    onHoverFrame?.(f);
  }, [onHoverFrame]);
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
  const [hoverColKey,      setHoverColKey]      = useState<string | null>(null);
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
    return columnsProp.map((col) => {
      if (col.type !== 'mini-timeline' || !col.microColumns || col.microColumnAssignment !== 'dynamic-split') return col;
      // Check if any micro-column in this column has a statusType that could be filtered
      const hasFilterable = col.microColumns.some((mc) => mc.statusType);
      if (!hasFilterable) return col;
      const filtered = col.microColumns.filter((mc) => {
        const effectiveType = mc.statusType ?? 'STATUS';
        return !hiddenStatusTypes.has(effectiveType);
      });
      if (filtered.length === col.microColumns.length) return col;
      // Build set of hidden micro-column IDs + their uppercase variants to filter matchColumnIds
      const hiddenIds = new Set<string>();
      for (const mc of col.microColumns) {
        const effectiveType = mc.statusType ?? 'STATUS';
        if (hiddenStatusTypes.has(effectiveType)) {
          hiddenIds.add(mc.id);
          // Also add uppercase form (e.g. 'melting-flame' → 'MELTING_FLAME')
          hiddenIds.add(mc.id.toUpperCase().replace(/-/g, '_'));
        }
      }
      return {
        ...col,
        microColumns: filtered,
        matchColumnIds: col.matchColumnIds?.filter((id) => !hiddenIds.has(id)),
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
    () => computeAllValidations(events, slots, resourceGraphs, staggerBreaks, draggingIds, interactionMode),
    [events, slots, resourceGraphs, staggerBreaks, draggingIds, interactionMode],
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
        if (!key.endsWith(`:${SKILL_COLUMNS.BATTLE}`)) zones.set(key, val);
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
      if (ev.columnId !== SKILL_COLUMNS.BATTLE && ev.columnId !== SKILL_COLUMNS.ULTIMATE) continue;
      const zones = dragZonesSnapshot.get(`${ev.ownerId}:${ev.columnId}`);
      if (!zones) continue;
      for (const zone of zones) {
        if (ev.startFrame >= zone.start && ev.startFrame < zone.end) {
          const label = ev.columnId === SKILL_COLUMNS.BATTLE ? 'SP' : 'ultimate energy';
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

  // Throttled action executor for drag operations — fires at most once per animation frame.
  // Uses a generic action callback so any drag path can share it.
  const throttledDragAction = useRef(throttleByRAF((action: () => void) => action()));

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
    if (!allEnemies || !onSwapEnemy) return;
    if (enemyMenuOpen) { setEnemyMenuOpen(false); return; }
    if (enemyNameRef.current) {
      const rect = enemyNameRef.current.getBoundingClientRect();
      setEnemyMenuPos({ top: rect.bottom + 2, left: rect.left });
    }
    setEnemySearch('');
    setEnemyActiveTiers(new Set(ENEMY_TIERS));
    setEnemyMenuOpen(true);
  }, [enemyMenuOpen, allEnemies, onSwapEnemy]);

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

  // Build fluid gridTemplateColumns: team:operator:enemy = 1:3:2
  // Within each operator group, columns have weighted widths:
  // DASH=1, combat skills=2, status=4, tactical=2, placeholder=1
  const SKILL_IDS = new Set([SKILL_COLUMNS.BASIC, SKILL_COLUMNS.BATTLE, SKILL_COLUMNS.COMBO, SKILL_COLUMNS.ULTIMATE]);
  const getColWeight = (col: Column) => {
    if (col.type === 'placeholder') return 1;
    const cid = col.type === 'mini-timeline' ? col.columnId : undefined;
    if (cid === OPERATOR_COLUMNS.INPUT) return 1;
    if (cid === 'operator-status') return 4;
    if (cid && (SKILL_IDS as Set<string>).has(cid)) return 2;
    return 2; // tactical, etc.
  };
  // Pre-compute total weight per slot group
  const slotGroupWeights = slotGroups.map((g) => {
    const slotCols = columns.filter((c) => c.ownerId === g.slot.slotId);
    const totalWeight = slotCols.reduce((sum, c) => sum + getColWeight(c), 0);
    return { ...g, totalWeight, slotCols };
  });
  const GROUP_FR = 3;
  const COMMON_FR = 1;
  const ENEMY_FR = 2;
  const colFrStrings: string[] = [];
  // Common columns
  for (let i = 0; i < commonColCount; i++) {
    colFrStrings.push(`minmax(0, ${COMMON_FR / Math.max(1, commonColCount)}fr)`);
  }
  // Operator groups — weighted columns
  for (const gw of slotGroupWeights) {
    for (const col of gw.slotCols) {
      const w = getColWeight(col);
      const fr = GROUP_FR * w / gw.totalWeight;
      colFrStrings.push(`minmax(0, ${fr}fr)`);
    }
  }
  // Enemy columns
  for (let i = 0; i < enemyColCount; i++) {
    colFrStrings.push(`minmax(0, ${ENEMY_FR / enemyColCount}fr)`);
  }
  const gridCols = `${TIME_AXIS_WIDTH}px ${colFrStrings.join(' ')}`;
  // In horizontal mode, lanes become rows — use fixed min height so rows don't collapse
  const rowFrStrings = colFrStrings.map((s) => s.replace('minmax(0,', 'minmax(28px,'));
  const gridRows = `${TIME_AXIS_WIDTH}px ${rowFrStrings.join(' ')}`;

  // Compute column pixel positions from the container's lane-axis dimension
  // Vertical: lanes are columns → use width. Horizontal: lanes are rows → use scroll container clientHeight.
  const containerWidth = isHorizontal
    ? (scrollClientHeight ?? outerRect?.height ?? 800)
    : (outerRect?.width ?? 800);
  const totalFr = commonColCount * (COMMON_FR / Math.max(1, commonColCount))
    + slotGroupWeights.reduce((sum, gw) => sum + gw.slotCols.reduce((s, c) => s + GROUP_FR * getColWeight(c) / gw.totalWeight, 0), 0)
    + (enemyColCount > 0 ? enemyColCount * (ENEMY_FR / enemyColCount) : 0);
  const pxPerFr = totalFr > 0 ? (containerWidth - TIME_AXIS_WIDTH) / totalFr : 0;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columnPositions = useMemo(() => {
    const map = new Map<string, { left: number; right: number }>();
    let x = TIME_AXIS_WIDTH;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      let fr: number;
      if (col.type === 'mini-timeline' && col.source === TimelineSourceType.COMMON) {
        fr = COMMON_FR / Math.max(1, commonColCount);
      } else {
        const gw = slotGroupWeights.find((g) => g.slot.slotId === col.ownerId);
        fr = gw ? GROUP_FR * getColWeight(col) / gw.totalWeight : ENEMY_FR / enemyColCount;
      }
      const w = fr * pxPerFr;
      map.set(col.key, { left: x, right: x + w });
      x += w;
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, commonColCount, enemyColCount, pxPerFr]);

  const contentFrames = contentFramesProp ?? TOTAL_FRAMES;
  const totalRealFrames = contentFrames + timeStopRegions.reduce((sum, s) => sum + s.durationFrames, 0);
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
  const ticks = useMemo(
    () => getTickMarks(zoom, visibleRange.startFrame, visibleRange.endFrame, totalRealFrames),
    [zoom, visibleRange, totalRealFrames],
  );

  // ─── Touch handlers ───────────────────────────────────────────────────────
  const { handleEventTouchStart } = useTouchHandlers({
    scrollRef,
    bodyTopRef,
    zoomRef,
    onMoveEvent,
    onZoom,
    onContextMenu,
    setHoverFrame,
    setHoverClientY,
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
          setHoverClientY(snappedRel - scrollFrame + scrollRect[axis.rectFrameStart] + bodyTop);
        }
      }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => { el.removeEventListener('scroll', handler); ro.disconnect(); };
  }, [onScrollProp, onContextMenu, axis, isHorizontal, setHoverFrame]);

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

  // ─── Greedy micro-column slot assignments for reuseExpiredSlots columns ────
  const greedySlotAssignments = useMemo(
    () => MicroColumnController.greedySlotAssignments(events, columns),
    [events, columns],
  );

  // ─── Precompute micro-column positions per event ────────────────────────────
  const microColumnEventPositions = useMemo(
    () => MicroColumnController.computeMicroColumnPixelPositions(events, columns, columnPositions, greedySlotAssignments),
    [events, columns, columnPositions, greedySlotAssignments],
  );

  // ─── Precompute stack-aware status view overrides ──────────────────────────
  const statusViewOverrides = useMemo(
    () => computeStatusViewOverrides(events, columns),
    [events, columns],
  );

  // ─── Marquee intersection helper ────────────────────────────────────────────
  // Rect coords: in vertical mode {left=lane, top=frame}, in horizontal mode {left=frame, top=lane}
  const getEventsInRect = useCallback((rect: { left: number; top: number; right: number; bottom: number }) => {
    const bodyTop = bodyTopRef.current ?? 0;
    const ids = new Set<string>();
    for (const ev of events) {
      let colPos: { left: number; right: number } | undefined =
        microColumnEventPositions.get(ev.uid) ??
        columnPositions.get(`${ev.ownerId}-${ev.columnId}`);
      if (!colPos) continue;
      const totalDur = computeSegmentsSpan(ev.segments);
      const evFrameStart = bodyTop + frameToPx(ev.startFrame, zoomRef.current);
      const evFrameEnd = evFrameStart + durationToPx(totalDur, zoomRef.current);
      // In vertical: frame axis=Y, lane axis=X. In horizontal: frame axis=X, lane axis=Y
      if (isHorizontal) {
        if (colPos.right > rect.top && colPos.left < rect.bottom &&
            evFrameEnd > rect.left && evFrameStart < rect.right) {
          ids.add(ev.uid);
        }
      } else {
        if (colPos.right > rect.left && colPos.left < rect.right &&
            evFrameEnd > rect.top && evFrameStart < rect.bottom) {
          ids.add(ev.uid);
        }
      }
    }
    return ids;
  }, [events, columnPositions, microColumnEventPositions, isHorizontal]);

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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(eventUid)) next.delete(eventUid);
        else next.add(eventUid);
        if (next.size === 1) {
          let singleId = '';
          next.forEach((id) => { singleId = id; });
          onEditEvent(singleId);
        } else {
          onEditEvent(null);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        if (prev.has(eventUid) && prev.size === 1) {
          onEditEvent(null);
          return new Set();
        }
        onEditEvent(eventUid);
        return new Set([eventUid]);
      });
    }
  }, [onContextMenu, onEditEvent, onSelectedFramesChange]);

  // ─── Mouse move ─────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Suppress hover line during right-click marquee drag
    if (rmbMarqueeRef.current?.moved) {
      setHoverClientY(null);
      setHoverFrame(null);

    } else
    // Hover line — snaps to the nearest frame-interval grid line
    if (scrollRef.current && outerRect && bodyTopRef.current !== null) {
      const scrollEl = scrollRef.current;
      const scrollRect = scrollEl.getBoundingClientRect();
      // Only show hover line when mouse is inside the scroll body along the frame axis
      const frameClient = e[axis.clientFrame];
      const frameEnd = axis.framePos === 'top' ? 'bottom' as const : 'right' as const;
      if (frameClient < scrollRect[axis.rectFrameStart] || frameClient > scrollRect[frameEnd]) {
        setHoverFrame(null);
        setHoverClientY(null);
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
          setHoverClientY(snappedRel - scrollFrame + scrollRect[axis.rectFrameStart] + bodyTop);
        } else {
          setHoverFrame(null);
          setHoverClientY(null);
        }
      }
    }

    // Column highlight — find which lane the mouse is over
    // Vertical: lanes are columns (X axis). Horizontal: lanes are rows (Y axis).
    // Only highlight when the mouse is inside the scroll body (not over loadout/header areas)
    if (outerRect && scrollRef.current) {
      const scrollRect = scrollRef.current.getBoundingClientRect();
      const inBody = e.clientY >= scrollRect.top && e.clientY <= scrollRect.bottom
        && e.clientX >= scrollRect.left && e.clientX <= scrollRect.right;
      if (inBody) {
        const mouseLane = e[axis.clientLane] - outerRect[axis.rectLaneStart];
        let foundCol: string | null = null;
        for (let i = 0; i < columns.length; i++) {
          const pos = columnPositions.get(columns[i].key);
          if (pos && mouseLane >= pos.left && mouseLane < pos.right) {
            foundCol = columns[i].key;
            break;
          }
        }
        setHoverColKey(foundCol);
      } else {
        setHoverColKey(null);
      }
    }

    // Duplicate ghost positioning
    if (dupMode && scrollRef.current && outerRect && bodyTopRef.current !== null) {
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

      let primaryNewFrame = 0;

      const strict = interactionModeRef.current === InteractionModeType.STRICT;
      const { clampedDelta, overlapExempt } = clampDragDelta(deltaFrames, dragRef.current, eventsRef.current, strict);

      // Throttle the expensive move calls (triggers React state + interaction recalc).
      // Hover line stays at full rate below; only the controller dispatch is batched.
      const dragState = dragRef.current;
      throttledDragAction.current(() => {
        if (eventUids.length > 1 && onMoveEvents) {
          const incrementalDelta = clampedDelta - dragState.lastAppliedDelta;
          onMoveEvents(eventUids, incrementalDelta, overlapExempt);
          dragState.lastAppliedDelta = clampedDelta;
        } else {
          for (const eid of eventUids) {
            const orig = startFrames.get(eid) ?? 0;
            onMoveEvent(eid, orig + clampedDelta, overlapExempt);
          }
        }
      });
      primaryNewFrame = (startFrames.get(primaryId) ?? 0) + clampedDelta;

      if (scrollRef.current && bodyTopRef.current !== null) {
        const sEl = scrollRef.current;
        const sRect = sEl.getBoundingClientRect();
        const scrollFrame = sEl[axis.scrollPos];
        const bodyTop = bodyTopRef.current;
        const snappedRel = frameToPx(primaryNewFrame, zoomRef.current);
        setHoverFrame(primaryNewFrame);
        setHoverClientY(snappedRel - scrollFrame + sRect[axis.rectFrameStart] + bodyTop);
      }
      return;
    }

    // Frame diamond drag
    if (frameDragRef.current) {
      dragMovedRef.current = true;
      const { eventUid, segmentIndex, frameIndex, startMouseFrame: startMouseF, startOffsetFrame, minOffset, maxOffset } = frameDragRef.current;
      const deltaFrames = Math.round((e[axis.clientFrame] - startMouseF) / getPxPerFrame(zoomRef.current));
      const newOffset = Math.max(minOffset, Math.min(maxOffset, startOffsetFrame + deltaFrames));
      throttledDragAction.current(() => onMoveFrame?.(eventUid, segmentIndex, frameIndex, newOffset));
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
      if (finalIds.size === 1) {
        let singleId = '';
        finalIds.forEach((id) => { singleId = id; });
        onEditEvent(singleId);
      } else {
        onEditEvent(null);
      }
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
  }, [outerRect, onMoveEvent, combinedHeaderHeight, getEventsInRect, getFramesInRect, onSelectedFramesChange, dupMode, columns, columnPositions, axis]);

  const handleMouseLeave = useCallback(() => {
    setHoverClientY(null);
    setHoverFrame(null);
    setHoverColKey(null);
    hoverClientFrameRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (marqueeRef.current) {
      // Click without drag — dismiss selection and info pane
      if (!dragMovedRef.current) {
        if (!marqueeRef.current.ctrlKey) {
          setSelectedIds(new Set());
          onSelectedFramesChange?.([]);
        }
        onEditEvent(null);
      }
      marqueeRef.current = null;
      setMarqueeRect(null);
    }
    if (rmbMarqueeRef.current) {
      rmbMarqueeRef.current = null;
      setMarqueeRect(null);
    }
    requestAnimationFrame(() => { dragMovedRef.current = false; rmbDraggedRef.current = false; });
  }, [onBatchEnd, onEditEvent, onSelectedFramesChange]);

  // ─── Drag start (event move) ──────────────────────────────────────────────────
  const computeMonotonicBounds = useCallback(
    (draggedIds: string[]) => MicroColumnController.computeMonotonicBounds(draggedIds, events, columns, TOTAL_FRAMES),
    [events, columns],
  );

  const handleEventDragStart = useCallback((
    e: React.MouseEvent,
    eventUid: string,
    startFrame: number,
  ) => {
    if (e.button !== 0) return; // only left-click drag
    // Block drag for derived columns (e.g. melting flame) unless freeform mode
    const ev = events.find((ev) => ev.uid === eventUid);
    if (ev && interactionMode === InteractionModeType.STRICT) {
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
      dragRef.current = { primaryId: eventUid, eventUids: draggedIds, startMouseFrame: e[axis.clientFrame], startFrames, monotonicBounds: computeMonotonicBounds(draggedIds), lastAppliedDelta: 0, resourceZonesSnapshot: resZones, invalidAtDragStart: invalidSet, revalidated: new Set(), overlapInvalidAtDragStart: overlapInvalid, overlapRevalidated: new Set(), comboRevalidated: new Set() };
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
      dragRef.current = { primaryId: eventUid, eventUids: [eventUid], startMouseFrame: e[axis.clientFrame], startFrames, monotonicBounds: computeMonotonicBounds([eventUid]), lastAppliedDelta: 0, resourceZonesSnapshot: resZones, invalidAtDragStart: invalidSet, revalidated: new Set(), overlapInvalidAtDragStart: overlapInvalid, overlapRevalidated: new Set(), comboRevalidated: new Set() };
      setDraggingIds(dragSet);
      setDragZonesSnapshot(resZones);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, events, computeMonotonicBounds, onEditEvent, onBatchStart, axis]);

  // ─── Frame diamond drag start ────────────────────────────────────────────────
  const handleFrameDragStart = useCallback((e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => {
    if (e.button !== 0) return;
    const ev = events.find((ev) => ev.uid === eventUid);
    if (!ev?.segments) return;
    const seg = ev.segments[segmentIndex];
    if (!seg?.frames) return;
    const frame = seg.frames[frameIndex];
    if (!frame) return;

    // Compute bounds: must stay within segment [0, segDuration-1] and preserve order with neighbors
    const prevOffset = frameIndex > 0 ? seg.frames[frameIndex - 1].offsetFrame + 1 : 0;
    const nextOffset = frameIndex < seg.frames.length - 1 ? seg.frames[frameIndex + 1].offsetFrame - 1 : seg.properties.duration - 1;

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
  }, [events, onBatchStart, axis]);

  const handleFrameClickGuarded = useCallback((eid: string, si: number, fi: number) => {
    if (!dragMovedRef.current) onFrameClick?.(eid, si, fi);
  }, [onFrameClick]);

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
      if (contentY < bodyTop || contentX < TIME_AXIS_WIDTH) return;
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
    if (contentY < bodyTop || contentX < TIME_AXIS_WIDTH) return;

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
  }, [selectedIds, selectedFrames, onSelectedFramesChange, dupMode, dupValid, dupOffset, onDuplicateEvents]);

  // ─── Map controller menu items (actionId) to view callbacks ─────────────────
  const resolveMenuItemAction = useCallback((item: import('../consts/viewTypes').ContextMenuItem): import('../consts/viewTypes').ContextMenuItem => {
    if (item.separator || item.header || item.action) return item;
    const { actionId, actionPayload, ...rest } = item;
    switch (actionId) {
      case 'addEvent': {
        const p = actionPayload as { ownerId: string; columnId: string; atFrame: number; defaultSkill: object | null };
        return { ...rest, action: () => onAddEvent(p.ownerId, p.columnId, p.atFrame, p.defaultSkill) };
      }
      case 'editResource':
        return { ...rest, action: () => { onEditResource?.(actionPayload as string); onContextMenu(null); } };
      case 'addSegment': {
        const p = actionPayload as { eventId: string; segmentLabel: string };
        return { ...rest, action: () => { onAddSegment?.(p.eventId, p.segmentLabel); onContextMenu(null); } };
      }
      case 'addFrame': {
        const p = actionPayload as { eventId: string; segmentIndex: number; frameOffsetFrame: number };
        return { ...rest, action: () => { onAddFrame?.(p.eventId, p.segmentIndex, p.frameOffsetFrame); onContextMenu(null); } };
      }
      default:
        return item;
    }
  }, [onAddEvent, onEditResource, onContextMenu, onAddSegment, onAddFrame]);

  // ─── Right-click on empty column ────────────────────────────────────────────
  const handleSubTimelineContextMenu = useCallback((
    e: React.MouseEvent,
    col: Column,
  ) => {
    e.preventDefault();
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
    const relClickX = colPos ? e[axis.clientLane] - (rect[axis.rectLaneStart] - (scrollRef.current?.[isHorizontal ? 'scrollTop' : 'scrollLeft'] ?? 0)) - colPos.left : undefined;

    const items = buildColumnContextMenu(col, atFrame, relClickX, {
      events, slots, resourceGraphs, alwaysAvailableComboSlots,
      timeStopRegions, staggerBreaks, columnPositions, interactionMode,
    });
    if (!items) return;

    onContextMenu({
      x: e.clientX, y: e.clientY,
      items: items.map(resolveMenuItemAction),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onContextMenu, events, columnPositions, resourceGraphs, onSelectedFramesChange, dupMode, slots, interactionMode, timeStopRegions, staggerBreaks, alwaysAvailableComboSlots, resolveMenuItemAction, axis, isHorizontal]);

  // ─── Right-click on status column header ───────────────────────────────────
  // Collect all status types across all status columns (global setting)
  const allStatusTypes = useMemo(() => {
    const types = new Map<string, number>();
    for (const col of columnsProp) {
      if (col.type !== 'mini-timeline' || !col.microColumns || col.microColumnAssignment !== 'dynamic-split') continue;
      // Only count columns that have at least one micro-column with a statusType
      const hasTyped = col.microColumns.some((mc) => mc.statusType);
      if (!hasTyped) continue;
      for (const mc of col.microColumns) {
        const effectiveType = mc.statusType ?? 'STATUS';
        types.set(effectiveType, (types.get(effectiveType) ?? 0) + 1);
      }
    }
    return types;
  }, [columnsProp]);

  const handleHeaderContextMenu = useCallback((e: React.MouseEvent, col: Column) => {
    e.preventDefault();
    e.stopPropagation();
    if (col.type !== 'mini-timeline' || col.microColumnAssignment !== 'dynamic-split') return;
    if (allStatusTypes.size === 0) return;
    // Only show on columns that have filterable micro-columns (with statusType)
    const unfilteredCol = columnsProp.find((c) => c.key === col.key);
    if (!unfilteredCol || unfilteredCol.type !== 'mini-timeline' || !unfilteredCol.microColumns?.some((mc) => mc.statusType)) return;
    const items: import('../consts/viewTypes').ContextMenuItem[] = [
      { label: 'Status Filters', header: true },
      ...Array.from(allStatusTypes.entries()).map(([type, count]) => ({
        label: `${STATUS_TYPE_LABELS[type] ?? type} (${count})`,
        checked: !hiddenStatusTypes.has(type),
        keepOpen: true,
        action: () => {
          setHiddenStatusTypes((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type); else next.add(type);
            return next;
          });
        },
      })),
    ];
    onContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [allStatusTypes, hiddenStatusTypes, onContextMenu, columnsProp]);

  // ─── Right-click on event ────────────────────────────────────────────────────
  const handleEventContextMenu = useCallback((
    e: React.MouseEvent,
    eventUid: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (rmbDraggedRef.current) return;
    onSelectedFramesChange?.([]);
    const target = events.find((ev) => ev.uid === eventUid);
    if (target && interactionMode === InteractionModeType.STRICT) {
      const col = columns.find((c): c is MiniTimeline => c.type === 'mini-timeline' && c.ownerId === target.ownerId && c.columnId === target.columnId);
      if (col?.derived) return;
    }

    const scrollFrame = scrollRef.current?.[axis.scrollPos] ?? 0;
    const rect = scrollRef.current?.getBoundingClientRect();
    let atFrame = 0;
    let label = '';
    if (rect && bodyTopRef.current !== null) {
      const relFrame = e[axis.clientFrame] - rect[axis.rectFrameStart] + scrollFrame - bodyTopRef.current;
      atFrame = pxToFrame(Math.max(0, relFrame), zoomRef.current);
      label = frameToDetailLabel(atFrame);
    }

    const ev = events.find((ev) => ev.uid === eventUid);
    const addItems = ev
      ? buildEventAddItems(ev, columns, events, atFrame, label, 'addEvent', interactionMode).map(resolveMenuItemAction)
      : [];

    const ctrlItem = ev ? controlledItem(ev.ownerId, atFrame) : null;
    const ctrlItems = ctrlItem ? [{ separator: true } as const, resolveMenuItemAction(ctrlItem)] : [];

    if (selectedIds.has(eventUid) && selectedIds.size > 1) {
      const count = selectedIds.size;
      const ids = Array.from(selectedIds);
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [
          ...(onResetEvents ? [{
            label: `Reset ${count} Events to Default`,
            action: () => { onResetEvents(ids); },
          }] : []),
          {
            label: `Remove ${count} Events`,
            action: () => { onRemoveEvents?.(ids); setSelectedIds(new Set()); onContextMenu(null); },
            danger: true,
          },
          ...(addItems.length > 0 ? [{ separator: true } as const, ...addItems] : []),
          ...ctrlItems,
        ],
      });
    } else {
      const isControl = ev?.name === CombatSkillsType.CONTROL;
      const isSeededControl = isControl && ev?.uid.startsWith('controlled-seed-');
      const hasSegments = ev && ev.segments.length > 0;
      const multiSegment = (ev?.segments.length ?? 0) > 1;
      const isCombo = ev?.columnId === SKILL_COLUMNS.COMBO;
      const segAddItems = multiSegment && !isCombo && !isControl
        ? buildSegmentAddItemsCtrl(eventUid, events, columns, interactionMode).map(resolveMenuItemAction)
        : [];
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [
          ...(!isControl && onResetEvent ? [{ label: 'Reset Event to Default', action: () => { onResetEvent(eventUid); } }] : []),
          ...(!isControl && multiSegment && !isCombo && onResetSegments ? [{ label: 'Reset Segments to Default', action: () => { onResetSegments(eventUid); } }] : []),
          ...(!isControl && hasSegments && onResetFrames ? [{ label: 'Reset Frames to Default', action: () => { onResetFrames(eventUid); } }] : []),
          ...(!isControl ? [{ separator: true }] : []),
          ...(segAddItems.length > 0 ? [...segAddItems, { separator: true } as const] : []),
          ...(!isSeededControl ? [{ label: 'Remove Event', action: () => onRemoveEvent(eventUid), danger: true }] : []),
          ...(addItems.length > 0 ? [{ separator: true } as const, ...addItems] : []),
          ...ctrlItems,
        ],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRemoveEvent, onRemoveEvents, onResetEvent, onResetEvents, onResetSegments, onResetFrames, onContextMenu, selectedIds, events, columns, onSelectedFramesChange, interactionMode, resolveMenuItemAction]);

  // ─── Right-click on frame diamond ──────────────────────────────────────────
  const handleFrameContextMenu = useCallback((
    e: React.MouseEvent,
    eventUid: string,
    segmentIndex: number,
    frameIndex: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (rmbDraggedRef.current) return;
    const isInSelection = selectedFrames?.some(
      (sf) => sf.eventUid === eventUid && sf.segmentIndex === segmentIndex && sf.frameIndex === frameIndex,
    );
    if (isInSelection && selectedFrames && selectedFrames.length > 1) {
      const frames = selectedFrames;
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [
          {
            label: `Remove ${frames.length} Frames`,
            action: () => {
              onRemoveFrames?.(frames);
              onSelectedFramesChange?.([]);
              onContextMenu(null);
            },
            danger: true,
          },
        ],
      });
    } else {
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [
          {
            label: 'Remove Frame',
            action: () => { onRemoveFrame?.(eventUid, segmentIndex, frameIndex); onContextMenu(null); },
            danger: true,
          },
        ],
      });
    }
  }, [onContextMenu, onRemoveFrame, onRemoveFrames, selectedFrames, onSelectedFramesChange]);

  // ─── Right-click on segment (multi-segment events only) ────────────────────
  const handleSegmentContextMenu = useCallback((
    e: React.MouseEvent,
    eventUid: string,
    segmentIndex: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (rmbDraggedRef.current) return;
    onSelectedFramesChange?.([]);
    const ev = events.find((ev) => ev.uid === eventUid);
    const segLabel = ev?.segments[segmentIndex]?.properties.name;
    const multiSegment = (ev?.segments.length ?? 0) > 1;
    const isCombo = ev?.columnId === SKILL_COLUMNS.COMBO;
    const addSegItems = multiSegment && !isCombo
      ? buildSegmentAddItemsCtrl(eventUid, events, columns, interactionMode).map(resolveMenuItemAction)
      : [];
    const addFrameItems = buildFrameAddItemsCtrl(eventUid, segmentIndex, events, columns).map(resolveMenuItemAction);
    onContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        ...(onResetEvent ? [{ label: 'Reset Event to Default', action: () => { onResetEvent(eventUid); } }] : []),
        ...(multiSegment && !isCombo && onResetSegments ? [{ label: 'Reset Segments to Default', action: () => { onResetSegments(eventUid); } }] : []),
        ...(onResetFrames ? [{ label: 'Reset Frames to Default', action: () => { onResetFrames(eventUid); } }] : []),
        { separator: true },
        ...(addFrameItems.length > 0 ? [...addFrameItems, { separator: true } as const] : []),
        ...(addSegItems.length > 0 ? [...addSegItems, { separator: true } as const] : []),
        ...(multiSegment && !isCombo && ev?.columnId === SKILL_COLUMNS.BASIC ? [{
          label: `Remove Sequence ${segLabel ?? formatSegmentShortName(undefined, segmentIndex)}`,
          action: () => { onRemoveSegment?.(eventUid, segmentIndex); onContextMenu(null); },
          danger: true,
        }] : []),
        { label: 'Remove Event', action: () => onRemoveEvent(eventUid), danger: true },
      ],
    });
  }, [onContextMenu, onRemoveEvent, onRemoveSegment, onResetEvent, onResetSegments, onResetFrames, onSelectedFramesChange, events, columns, interactionMode, resolveMenuItemAction]);

  const showHoverLine = hoverClientY !== null && outerRect;

  return (
    <div
      ref={outerRef}
      className={`timeline-outer${isHorizontal ? ' timeline-outer--horizontal' : ''}${dupMode ? ' timeline-outer--dup' : ''}`}
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
                className="tl-loadout-cell"
                style={{
                  [isHorizontal ? 'gridRow' : 'gridColumn']: `${group.startCol} / span ${group.columnCount}`,
                  '--op-color': op?.color ?? '#666',
                } as React.CSSProperties}
              >
                <OperatorLoadoutHeader
                  operatorName={op?.name ?? 'EMPTY'}
                  operatorColor={op?.color ?? '#666'}
                  operatorWeaponTypes={op?.weaponTypes ?? []}
                  splash={op?.splash}
                  state={loadouts[slot.slotId]}
                  onEdit={() => onEditLoadout(slot.slotId)}
                />
              </div>
            );
          })}

          {enemyColCount > 0 && (
            <div
              className="tl-loadout-cell tl-loadout-cell--enemy"
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
              className={`tl-header-cell${col.type === 'mini-timeline' && col.headerVariant === 'infliction' ? ' enemy-header' : ''}${col.type === 'placeholder' ? ' tl-header-cell--empty' : ''}${hoverColKey === col.key ? ' tl-header-cell--col-hover' : ''}`}
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
        <div
          className={`timeline-body-grid${isHorizontal ? ' timeline-body-grid--horizontal' : ''}`}
          style={isHorizontal
            ? { gridTemplateRows: gridRows }
            : { gridTemplateColumns: gridCols }
          }
        >
          {/* Time axis */}
          <div ref={timeAxisRef} className="tl-time-axis" style={{ [axis.frameSize]: tlHeight } as React.CSSProperties}>
            {ticks.map((tick) => (
              <div
                key={tick.frame}
                className={`tl-tick${tick.major ? ' tl-tick--major' : ' tl-tick--minor'}`}
                style={{ [axis.framePos]: frameToPx(tick.frame, zoom) } as React.CSSProperties}
              >
                {tick.major && (
                  <span className="tl-tick-label">{frameToTimeLabel(tick.frame)}</span>
                )}
              </div>
            ))}
          </div>

          {/* Sub-timeline columns */}
          {columns.map((col) => {
            if (col.type === 'placeholder') {
              return (
                <div
                  key={`col-${col.key}`}
                  className={`tl-sub-timeline tl-sub-timeline--empty${hoverColKey === col.key ? ' tl-sub-timeline--col-hover' : ''}`}
                  style={{ [axis.frameSize]: tlHeight } as React.CSSProperties}
                  onMouseDown={handleTimelineMouseDown}
                >
                  {ticks.filter((t) => t.major).map((tick) => (
                    <div
                      key={tick.frame}
                      className="tl-gridline"
                      style={{ [axis.framePos]: frameToPx(tick.frame, zoom) } as React.CSSProperties}
                    />
                  ))}
                </div>
              );
            }

            // ── Unified mini-timeline rendering ──────────────────────
            const hasMicro = !!col.microColumns;
            const microCount = col.microColumns?.length ?? 0;

            // Collect events belonging to this mini-timeline
            // Events are already processed (refresh + consumption clamping)
            // by the time they reach this component.
            let colEvents: TimelineEvent[];
            if (col.matchColumnIds) {
              const matchSet = new Set(col.matchColumnIds);
              colEvents = events.filter(
                (ev) => ev.ownerId === col.ownerId && matchSet.has(ev.columnId),
              );
            } else if (hasMicro && col.microColumnAssignment === 'by-column-id') {
              const mcIds = new Set(col.microColumns!.map((mc) => mc.id));
              colEvents = events.filter(
                (ev) => ev.ownerId === col.ownerId && mcIds.has(ev.columnId),
              );
            } else {
              colEvents = events.filter(
                (ev) => ev.ownerId === col.ownerId && ev.columnId === col.columnId,
              );
            }
            // Sort by startFrame for micro-columns and derived columns (events may arrive out of order)
            if (col.microColumnAssignment === 'by-order' || col.derived) {
              colEvents.sort((a, b) => a.startFrame - b.startFrame);
            }
            // For derived (overlappable) columns, truncate each event's visual
            // duration at the start of the next event in the same column.
            // Skip for dynamic-split columns — their events overlap and share width.
            if (col.derived && col.microColumnAssignment !== 'dynamic-split' && col.microColumnAssignment !== 'by-order' && !col.reuseExpiredSlots) {
              for (let i = 0; i < colEvents.length - 1; i++) {
                const cur = colEvents[i];
                const next = colEvents[i + 1];
                const curEnd = eventEndFrame(cur);
                if (curEnd > next.startFrame) {
                  const clampedTotal = next.startFrame - cur.startFrame;
                  const clampedEvent = { ...cur, segments: cur.segments.map(s => ({ ...s })) };
                  // Trim segments to fit within clampedTotal
                  let remaining = clampedTotal;
                  clampedEvent.segments = cur.segments.map(s => {
                    if (remaining <= 0) return { ...s, properties: { ...s.properties, duration: 0 } };
                    const dur = Math.min(s.properties.duration, remaining);
                    remaining -= dur;
                    return { ...s, properties: { ...s.properties, duration: dur } };
                  }).filter(s => s.properties.duration > 0);
                  if (clampedEvent.segments.length === 0) {
                    clampedEvent.segments = [{ properties: { duration: clampedTotal } }];
                  }
                  colEvents[i] = clampedEvent;
                }
              }
            }
            // Viewport culling: only render events overlapping the visible frame range
            const visColEvents = colEvents.filter((ev) => {
              const evEnd = eventEndFrame(ev);
              return evEnd >= visibleRange.startFrame && ev.startFrame <= visibleRange.endFrame;
            });

            const colPos = columnPositions.get(col.key);

            return (
              <div
                key={`col-${col.key}`}
                className={`tl-sub-timeline${hasMicro ? ' tl-sub-timeline--mf' : ''}${hoverColKey === col.key ? ' tl-sub-timeline--col-hover' : ''}`}
                style={{ [axis.frameSize]: tlHeight } as React.CSSProperties}
                onContextMenu={(e) => handleSubTimelineContextMenu(e, col)}
                onMouseDown={handleTimelineMouseDown}
              >
                {ticks.filter((t) => t.major).map((tick) => (
                  <div
                    key={tick.frame}
                    className="tl-gridline"
                    style={{ [axis.framePos]: frameToPx(tick.frame, zoom) } as React.CSSProperties}
                  />
                ))}

                {/* Micro-column dividers (skip for dynamic-split — no fixed lanes) */}
                {hasMicro && col.microColumnAssignment !== 'dynamic-split' && Array.from({ length: microCount - 1 }, (_, i) => (
                  <div
                    key={`mc-div-${i}`}
                    className="mf-micro-divider"
                    style={{ left: `${((i + 1) / microCount) * 100}%` }}
                  />
                ))}

                {/* Resource line graph */}
                {resourceGraphs?.has(col.key) && (() => {
                  const graph = resourceGraphs.get(col.key)!;
                  const { points, min: rMin, max: rMax } = graph;
                  if (points.length < 2 || rMax === rMin) return null;
                  const range = rMax - rMin;
                  // In vertical: X=value(0-100), Y=frame(px). In horizontal: X=frame(px), Y=value(0-100) flipped
                  const svgPoints = points.map((pt) => {
                    const val = ((pt.value - rMin) / range) * 100;
                    const framePx = frameToPx(pt.frame, zoom);
                    return isHorizontal
                      ? { x: framePx, y: 100 - val }
                      : { x: val, y: framePx };
                  });
                  const lineStr = svgPoints.map((p) => `${p.x},${p.y}`).join(' ');
                  const lastPt = svgPoints[svgPoints.length - 1];
                  const firstPt = svgPoints[0];
                  const viewBox = isHorizontal ? `0 0 ${tlHeight} 100` : `0 0 100 ${tlHeight}`;
                  // Close polygon to bottom edge (horizontal) or left edge (vertical)
                  const fillStr = isHorizontal
                    ? `${lineStr} ${lastPt.x},100 ${firstPt.x},100`
                    : `${lineStr} 0,${lastPt.y} 0,${firstPt.y}`;
                  return (
                    <svg
                      className="resource-graph"
                      viewBox={viewBox}
                      preserveAspectRatio="none"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                    >
                      <polygon
                        points={fillStr}
                        fill={col.color}
                        fillOpacity="0.15"
                        stroke="none"
                      />
                      <polyline
                        points={lineStr}
                        fill="none"
                        stroke={col.color}
                        strokeWidth="0.5"
                        vectorEffect="non-scaling-stroke"
                      />
                      {/* Stagger node threshold lines */}
                      {col.columnId === COMMON_COLUMN_IDS.STAGGER && enemy.staggerNodes > 0 && (() => {
                        const nodeCount = enemy.staggerNodes;
                        const lines: React.ReactElement[] = [];
                        for (let i = 1; i <= nodeCount; i++) {
                          const nodeValue = rMax * i / (nodeCount + 1);
                          const val = ((nodeValue - rMin) / range) * 100;
                          if (isHorizontal) {
                            const y = 100 - val;
                            lines.push(<line key={`node-${i}`} x1={0} y1={y} x2={tlHeight} y2={y} stroke={col.color} strokeWidth="0.5" strokeDasharray="4 3" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />);
                          } else {
                            lines.push(<line key={`node-${i}`} x1={val} y1={0} x2={val} y2={tlHeight} stroke={col.color} strokeWidth="0.5" strokeDasharray="4 3" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />);
                          }
                        }
                        return lines;
                      })()}
                    </svg>
                  );
                })()}

                {/* Combo disabled background + "No trigger condition" labels */}
                {col.columnId === SKILL_COLUMNS.COMBO && !alwaysAvailableComboSlots.has(col.ownerId) && (() => {
                  const windowEvts = events.filter(
                    (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === col.ownerId,
                  );
                  // Compute enabled zones from activation windows
                  const enabled: { start: number; end: number }[] = [];
                  for (const w of windowEvts) {
                    enabled.push({ start: w.startFrame, end: eventEndFrame(w) });
                  }

                  return (
                    <>
                      <div className="sp-stripes-bg" />
                      {enabled.map((zone, i) => (
                        <div
                          key={`combo-ok-${i}`}
                          className="sp-sufficient-bg"
                          style={{
                            [axis.framePos]: frameToPx(zone.start, zoom),
                            [axis.frameSize]: durationToPx(zone.end - zone.start, zoom),
                          } as React.CSSProperties}
                        />
                      ))}
                    </>
                  );
                })()}

                {/* SP zones on battle columns: permanent stripes with
                    sufficient zones patched over to hide them */}
                {col.columnId === SKILL_COLUMNS.BATTLE && (() => {
                  const insuffGaps = resourceInsufficiencyZones.get(`${col.ownerId}:${SKILL_COLUMNS.BATTLE}`) ?? [];

                  // Compute sufficient zones (inverse of insufficient gaps)
                  const sufficient: { start: number; end: number }[] = [];
                  let cursor = 0;
                  for (const gap of insuffGaps) {
                    if (gap.start > cursor) sufficient.push({ start: cursor, end: gap.start });
                    cursor = Math.max(cursor, gap.end);
                  }
                  if (cursor < totalRealFrames) sufficient.push({ start: cursor, end: totalRealFrames });

                  return (
                    <>
                      <div className="sp-stripes-bg" />
                      {sufficient.map((zone, i) => (
                        <div
                          key={`sp-ok-${i}`}
                          className="sp-sufficient-bg"
                          style={{
                            [axis.framePos]: frameToPx(zone.start, zoom),
                            [axis.frameSize]: durationToPx(zone.end - zone.start, zoom),
                          } as React.CSSProperties}
                        />
                      ))}
                    </>
                  );
                })()}

                {/* Events */}
                {(() => {
                  // ── Shared EventBlock props via presentation controller ──
                  const isDerivedCol = !!col.derived && interactionMode === InteractionModeType.STRICT;
                  let mergedValidationMaps = validationMaps;
                  if (dragResourceWarnings) {
                    const merged = new Map(validationMaps.resource);
                    dragResourceWarnings.forEach((v, k) => merged.set(k, v));
                    mergedValidationMaps = { ...validationMaps, resource: merged };
                  }
                  const presentationOpts = {
                    slotElementColors, alwaysAvailableComboSlots, autoFinisherIds,
                    validationMaps: mergedValidationMaps, interactionMode, statusViewOverrides, events,
                  };

                  const buildEventBlockProps = (ev: TimelineEvent, pres: import('../controller/timeline/eventPresentationController').EventPresentation) => ({
                    event: pres.visualActivationDuration != null
                      ? { ...ev, segments: durationSegment(pres.visualActivationDuration) }
                      : ev,
                    zoom,
                    axis,
                    label: pres.label,
                    color: pres.color,
                    comboWarning: pres.comboWarning,
                    striped: pres.striped,
                    passive: pres.passive,
                    notDraggable: pres.notDraggable,
                    derived: pres.derived,
                    isAutoFinisher: pres.isAutoFinisher,
                    skillElement: pres.skillElement,
                    allSegmentLabels: pres.allSegmentLabels,
                    allDefaultSegments: pres.allDefaultSegments,
                    onDragStart: isDerivedCol || pres.passive ? noop3 : handleEventDragStart,
                    onContextMenu: isDerivedCol || pres.passive ? noop2 : handleEventContextMenu,
                    onSelect: handleEventSelect,
                    onHover: pres.passive ? undefined : handleEventHover,
                    onTouchStart: isDerivedCol || pres.passive ? undefined : handleEventTouchStart,
                    onFrameClick: pres.passive ? undefined : handleFrameClickGuarded,
                    onFrameContextMenu: pres.passive ? undefined : handleFrameContextMenu,
                    onFrameDragStart: pres.passive ? undefined : handleFrameDragStart,
                    onSegmentContextMenu: pres.passive ? undefined : handleSegmentContextMenu,
                    selectedFrames: pres.passive ? undefined : selectedFrames?.filter((sf) => sf.eventUid === ev.uid),
                    hoverFrame: draggingIds?.has(ev.uid) ? null : hoverFrame,
                  });

                  return hasMicro ? (
                  // Micro-column events
                  visColEvents.map((ev, i) => {
                    const dynPos = col.microColumnAssignment === 'dynamic-split'
                      ? microColumnEventPositions.get(ev.uid)
                      : undefined;

                    let microColor: string;
                    let leftPct: string;
                    let widthPct: string;

                    if (dynPos && colPos) {
                      const colWidth = colPos.right - colPos.left;
                      const relLeft = dynPos.left - colPos.left;
                      const relWidth = dynPos.right - dynPos.left;
                      leftPct = `${(relLeft / colWidth) * 100}%`;
                      widthPct = `${(relWidth / colWidth) * 100}%`;
                      microColor = dynPos.color;
                    } else if (col.microColumnAssignment === 'by-order') {
                      const microIdx = greedySlotAssignments.get(ev.uid) ?? Math.min(i, microCount - 1);
                      const mcMatch = col.matchColumnIds
                        ? col.microColumns!.find((mc) => mc.id === ev.columnId)
                        : undefined;
                      microColor = mcMatch?.color ?? col.microColumns![microIdx].color;
                      const microW = 100 / microCount;
                      leftPct = `${microIdx * microW}%`;
                      widthPct = `${microW}%`;
                    } else {
                      let microIdx = col.microColumns!.findIndex((mc) => mc.id === ev.columnId);
                      if (microIdx < 0) microIdx = 0;
                      microColor = col.microColumns![microIdx].color;
                      const microW = 100 / microCount;
                      leftPct = `${microIdx * microW}%`;
                      widthPct = `${microW}%`;
                    }
                    // Micro-column events use infliction warning only
                    const microPres = computeEventPresentation(ev, col, presentationOpts);
                    return (
                      <div
                        key={ev.uid}
                        className="mf-micro-slot"
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: leftPct,
                          width: widthPct,
                        }}
                      >
                        <EventBlock
                          {...buildEventBlockProps(ev, { ...microPres, color: microColor })}
                          selected={false}
                          hovered={hoveredId === ev.uid}
                          />
                      </div>
                    );
                  })
                ) : (
                  // Single-column events
                  visColEvents.map((ev) => {
                    const pres = computeEventPresentation(ev, col, presentationOpts);
                    const isWindow = ev.columnId === COMBO_WINDOW_COLUMN_ID;
                    return (
                      <EventBlock
                        key={ev.uid}
                        {...buildEventBlockProps(ev, pres)}
                        selected={isWindow ? false : selectedIds.has(ev.uid)}
                        hovered={isWindow ? false : hoveredId === ev.uid}
                        hoverFrame={isWindow ? undefined : draggingIds?.has(ev.uid) ? null : hoverFrame}
                      />
                    );
                  })
                );
                })()}

                {colEvents.length === 0 && col === columns[0] && (
                  <div className="timeline-empty-state">
                    <div className="empty-state-title">NO EVENTS</div>
                    <div className="empty-state-hint">right-click to add</div>
                  </div>
                )}
              </div>
            );
          })}

        </div>

        {/* Time-stop overlay bands */}
        {timeStopRegions.map((stop, i) => (
          <div
            key={`ts-${i}`}
            className="time-stop-overlay"
            style={{ [axis.framePos]: frameToPx(stop.startFrame, zoom), [axis.frameSize]: durationToPx(stop.durationFrames, zoom) } as React.CSSProperties}
          />
        ))}

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

      {/* Hover line */}
      {showHoverLine && outerRect && (
        <div
          className={`hover-line${isHorizontal ? ' hover-line--horizontal' : ''}`}
          style={isHorizontal
            ? { left: hoverClientY!, top: outerRect.top, width: 1, height: outerRect.height }
            : { top: hoverClientY!, left: outerRect.left, width: outerRect.width, height: 1 }
          }
        >
          {hoverFrame !== null && (() => {
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
                        style={{ top: yInLine, borderColor: dotColor, color: dotColor, boxShadow: `0 0 6px ${dotColor}55` }}
                      >
                        {Math.round(value)}
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
                      style={{ left: xInLine, borderColor: dotColor, color: dotColor, boxShadow: `0 0 6px ${dotColor}55` }}
                    >
                      {Math.round(value)}
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
      )}
    </div>
  );
}
