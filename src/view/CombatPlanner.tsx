import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import EventBlock from './EventBlock';
import { wouldOverlapNonOverlappable } from '../controller/timeline/eventController';
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
} from '../utils/timeline';
import { SKILL_COLUMN_ORDER as SKILL_ORDER } from '../model/channels';
import { REACTION_LABELS, COMBAT_SKILL_LABELS, INFLICTION_EVENT_LABELS } from '../consts/channelLabels';
import { CombatSkillsType, TimelineSourceType, ELEMENT_COLORS, ElementType } from '../consts/enums';
import {
  Operator,
  Enemy,
  TimelineEvent,
  VisibleSkills,
  ContextMenuState,
  Column,
  MiniTimeline,
  SelectedFrame,
} from "../consts/viewTypes";
import { MicroColumnController } from '../controller/timeline/microColumnController';
import { WindowsMap, ALWAYS_AVAILABLE_TRIGGERS } from '../controller/combat-loadout';
import type { Slot } from '../controller/timeline/columnBuilder';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import { useTouchHandlers } from '../utils/useTouchHandlers';

const MIN_SLOT_COLS = 4;

interface DragState {
  primaryId: string; // the event the user grabbed
  eventIds: string[];
  startMouseY: number;
  startFrames: Map<string, number>; // original startFrame per event
  monotonicBounds: Map<string, { min: number; max: number }>; // MF drag constraints captured at drag start
}

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
  onToggleSkill: (slotId: string, skillType: string) => void;
  onAddEvent: (ownerId: string, columnId: string, atFrame: number, defaultSkill: object | null) => void;
  onMoveEvent: (id: string, newStartFrame: number) => void;
  onMoveEvents?: (ids: string[], delta: number) => void;
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
  activationWindows?: WindowsMap;
  /** Resource graph data keyed by column key (e.g. 'common-skill-points'). */
  resourceGraphs?: Map<string, { points: ReadonlyArray<{ frame: number; value: number }>; min: number; max: number }>;
  onEditResource?: (columnKey: string) => void;
  onBatchStart?: () => void;
  onBatchEnd?: () => void;
  onFrameClick?: (eventId: string, segmentIndex: number, frameIndex: number) => void;
  onRemoveFrame?: (eventId: string, segmentIndex: number, frameIndex: number) => void;
  onRemoveFrames?: (frames: import('../consts/viewTypes').SelectedFrame[]) => void;
  onRemoveSegment?: (eventId: string, segmentIndex: number) => void;
  onAddSegment?: (eventId: string, segmentLabel: string) => void;
  onAddFrame?: (eventId: string, segmentIndex: number, frameOffsetFrame: number) => void;
  onMoveFrame?: (eventId: string, segmentIndex: number, frameIndex: number, newOffsetFrame: number) => void;
  selectedFrames?: import('../consts/viewTypes').SelectedFrame[];
  onSelectedFramesChange?: (frames: import('../consts/viewTypes').SelectedFrame[]) => void;
  /** Callback to expose the scroll container ref for external scroll sync. */
  onScrollRef?: (el: HTMLDivElement | null) => void;
  /** Callback when the timeline scrolls (for scroll sync). */
  onScroll?: (scrollTop: number) => void;
  /** Callback with measured loadout row height. */
  onLoadoutRowHeight?: (h: number) => void;
  /** Callback when the hovered frame changes. */
  onHoverFrame?: (frame: number | null) => void;
  /** Hide scrollbar (when scroll is synced to another container). */
  hideScrollbar?: boolean;
  onDuplicateEvents?: (sourceEvents: TimelineEvent[], frameOffset: number) => string[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop2 = (_a: any, _b: any) => {};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop3 = (_a: any, _b: any, _c: any) => {};

export default function CombatPlanner({
  slots,
  enemy,
  events,
  columns,
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
  activationWindows,
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
  onHoverFrame,
  hideScrollbar,
  onDuplicateEvents,
}: CombatPlannerProps) {
  const scrollRef   = useRef<HTMLDivElement>(null);
  const outerRef    = useRef<HTMLDivElement>(null);
  const loadoutRef  = useRef<HTMLDivElement>(null);
  const timeAxisRef = useRef<HTMLDivElement>(null);
  const dragRef     = useRef<DragState | null>(null);
  const marqueeRef  = useRef<MarqueeState | null>(null);
  const rmbMarqueeRef = useRef<{ startX: number; startY: number; moved: boolean; ctrlKey: boolean; priorFrames: SelectedFrame[] } | null>(null);
  const rmbDraggedRef = useRef(false);
  const dragMovedRef = useRef(false);
  const frameDragRef = useRef<{
    eventId: string;
    segmentIndex: number;
    frameIndex: number;
    startMouseY: number;
    startOffsetFrame: number;
    /** Minimum allowed offsetFrame (0 or prev frame's offset + 1). */
    minOffset: number;
    /** Maximum allowed offsetFrame (segDuration - 1 or next frame's offset - 1). */
    maxOffset: number;
  } | null>(null);
  const zoomRef     = useRef(zoom);
  const bodyTopRef  = useRef<number | null>(null);

  const [hoverClientY,     setHoverClientY]     = useState<number | null>(null);
  const [hoverFrame,       setHoverFrameRaw]    = useState<number | null>(null);
  const setHoverFrame = useCallback((f: number | null) => {
    setHoverFrameRaw(f);
    onHoverFrame?.(f);
  }, [onHoverFrame]);
  const [outerRect,        setOuterRect]        = useState<DOMRect | null>(null);
  const [loadoutRowHeight, setLoadoutRowHeight] = useState(0);
  const [enemyMenuOpen,    setEnemyMenuOpen]    = useState(false);
  const [enemyMenuPos,     setEnemyMenuPos]     = useState<{ top: number; left: number } | null>(null);
  const [enemySearch,      setEnemySearch]      = useState('');
  const [enemyActiveTiers, setEnemyActiveTiers] = useState<Set<string>>(new Set(ENEMY_TIERS));
  const [selectedIds,      setSelectedIds]      = useState<Set<string>>(new Set());
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
  const enemyMenuRef = useRef<HTMLDivElement>(null);

  // Map slotId → element color for sequenced event coloring
  const slotElementColor = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of slots) {
      if (s.operator) map[s.slotId] = ELEMENT_COLORS[s.operator.element as ElementType] ?? s.operator.color;
    }
    return map;
  }, [slots]);

  // Slots whose combo is always available (passive triggers like being hit / HP threshold)
  const alwaysAvailableComboSlots = useMemo(() => {
    const set = new Set<string>();
    for (const s of slots) {
      const cap = s.operator?.triggerCapability;
      if (cap && cap.comboRequires.some((t) => ALWAYS_AVAILABLE_TRIGGERS.has(t))) {
        set.add(s.slotId);
      }
    }
    return set;
  }, [slots]);

  // Combo events outside their activation windows get a warning
  const invalidComboIds = useMemo(() => {
    const map = new Map<string, string>();
    if (!activationWindows) return map;
    for (const ev of events) {
      if (ev.columnId !== 'combo') continue;
      if (alwaysAvailableComboSlots.has(ev.ownerId)) continue;
      const windows = activationWindows.get(ev.ownerId);
      if (!windows || windows.length === 0) {
        map.set(ev.id, 'No combo trigger window available');
        continue;
      }
      const inWindow = windows.some((w) => ev.startFrame >= w.startFrame && ev.startFrame < w.endFrame);
      if (!inWindow) {
        map.set(ev.id, 'Outside combo trigger window');
      }
    }
    return map;
  }, [events, activationWindows, alwaysAvailableComboSlots]);

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
    const op = slot.operator;
    const isLaevatain = op?.id === 'laevatain';
    const skillCount = op
      ? SKILL_ORDER.filter((st) => visibleSkills[slot.slotId]?.[st]).length
      : 0;
    const mfCount = isLaevatain ? 1 : 0;
    const count = Math.max(MIN_SLOT_COLS, skillCount + mfCount);
    slotGroups.push({ slot, columnCount: count, startCol: colIdx });
    colIdx += count;
  }
  const enemyColCount = columns.filter((c) => c.type === 'mini-timeline' && c.source === TimelineSourceType.ENEMY).length;

  // Build fluid gridTemplateColumns: equal-width operator/enemy groups, smaller TEAM
  // Each operator & enemy group gets GROUP_FR total fr; common (TEAM) gets COMMON_FR
  const GROUP_FR = 1;
  const COMMON_FR = 0.3;
  const colFrStrings: string[] = [];
  // Common columns
  for (let i = 0; i < commonColCount; i++) {
    colFrStrings.push(`minmax(0, ${COMMON_FR / Math.max(1, commonColCount)}fr)`);
  }
  // Operator groups
  for (const g of slotGroups) {
    const perCol = GROUP_FR / g.columnCount;
    for (let c = 0; c < g.columnCount; c++) {
      colFrStrings.push(`minmax(0, ${perCol}fr)`);
    }
  }
  // Enemy columns
  for (let i = 0; i < enemyColCount; i++) {
    colFrStrings.push(`minmax(0, ${GROUP_FR / enemyColCount}fr)`);
  }
  const gridCols = `${TIME_AXIS_WIDTH}px ${colFrStrings.join(' ')}`;

  // Compute column pixel positions from available container width
  const containerWidth = outerRect?.width ?? 800;
  const totalFr = commonColCount * (COMMON_FR / Math.max(1, commonColCount))
    + slotGroups.reduce((sum, g) => sum + g.columnCount * (GROUP_FR / g.columnCount), 0)
    + enemyColCount * (GROUP_FR / enemyColCount);
  const pxPerFr = totalFr > 0 ? (containerWidth - TIME_AXIS_WIDTH) / totalFr : 0;

  const columnPositions = useMemo(() => {
    const map = new Map<string, { left: number; right: number }>();
    let x = TIME_AXIS_WIDTH;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      let fr: number;
      if (col.type === 'mini-timeline' && col.source === TimelineSourceType.COMMON) {
        fr = COMMON_FR / Math.max(1, commonColCount);
      } else {
        const sg = slotGroups.find((g) => g.slot.slotId === col.ownerId);
        fr = sg ? GROUP_FR / sg.columnCount : GROUP_FR / enemyColCount;
      }
      const w = fr * pxPerFr;
      map.set(col.key, { left: x, right: x + w });
      x += w;
    }
    return map;
  }, [columns, slotGroups, commonColCount, enemyColCount, pxPerFr]);

  const numCols  = columns.length;
  const tlHeight = timelineHeight(zoom);
  const combinedHeaderHeight = loadoutRowHeight + HEADER_HEIGHT;

  // ─── Viewport-aware rendering (lazy timeline) ─────────────────────────────
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(800);
  const visibleRange = useMemo(
    () => getVisibleFrameRange(scrollTop, viewportH, zoom),
    [scrollTop, viewportH, zoom],
  );
  const ticks = useMemo(
    () => getTickMarks(zoom, visibleRange.startFrame, visibleRange.endFrame),
    [zoom, visibleRange],
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
      onLoadoutRowHeight?.(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onLoadoutRowHeight]);

  // ─── Expose scroll ref & scroll events for sync ────────────────────────
  useEffect(() => {
    onScrollRef?.(scrollRef.current);
    return () => onScrollRef?.(null);
  }, [onScrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    const handler = () => {
      setScrollTop(el.scrollTop);
      onScrollProp?.(el.scrollTop);
      onContextMenu(null);
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => { el.removeEventListener('scroll', handler); ro.disconnect(); };
  }, [onScrollProp, onContextMenu]);

  // Headers are now outside the scroll container, so body starts at top of scroll
  useEffect(() => {
    bodyTopRef.current = 0;
  }, []);

  // ─── Wheel: shift = zoom, else native ────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      onZoom(e.deltaY);
    }
  }, [onZoom]);

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
          onRemoveFrame?.(sf.eventId, sf.segmentIndex, sf.frameIndex);
        }
        onSelectedFramesChange?.([]);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const derivedCols = new Set(
          columns.filter((c): c is MiniTimeline => c.type === 'mini-timeline' && !!c.derived).map((c) => `${c.ownerId}-${c.columnId}`),
        );
        setSelectedIds(new Set(
          events.filter((ev) => !derivedCols.has(`${ev.ownerId}-${ev.columnId}`)).map((ev) => ev.id),
        ));
      }
      // Ctrl+D: enter duplicate mode with selected events
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedIds.size > 0 && onDuplicateEvents) {
        e.preventDefault();
        const derivedCols = new Set(
          columns.filter((c): c is MiniTimeline => c.type === 'mini-timeline' && !!c.derived).map((c) => `${c.ownerId}-${c.columnId}`),
        );
        const sources = events.filter((ev) => selectedIds.has(ev.id) && !derivedCols.has(`${ev.ownerId}-${ev.columnId}`));
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
  }, [selectedIds, selectedFrames, events, columns, dupMode, onRemoveEvent, onRemoveEvents, onRemoveFrame, onRemoveFrames, onSelectedFramesChange, onDuplicateEvents]);

  // ─── Greedy micro-column slot assignments for reuseExpiredSlots columns ────
  const greedySlotAssignments = useMemo(
    () => MicroColumnController.greedySlotAssignments(events, columns),
    [events, columns],
  );

  // ─── Precompute micro-column positions per event ────────────────────────────
  const microColumnEventPositions = useMemo(() => {
    const positions = new Map<string, { left: number; right: number; color: string }>();
    for (const col of columns) {
      if (col.type !== 'mini-timeline' || !col.microColumns) continue;
      const colPos = columnPositions.get(col.key);
      if (!colPos) continue;
      const colWidth = colPos.right - colPos.left;
      const microCount = col.microColumns.length;
      const microW = colWidth / microCount;

      if (col.microColumnAssignment === 'by-order') {
        const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
        const colEvents = events.filter(
          (ev) => ev.ownerId === col.ownerId &&
            (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
        ).sort((a, b) => a.startFrame - b.startFrame);
        colEvents.forEach((ev, i) => {
          // Use greedy assignment if available, else sequential
          const microIdx = greedySlotAssignments.get(ev.id) ?? Math.min(i, microCount - 1);
          const mcMatch = matchSet
            ? col.microColumns!.find((mc) => mc.id === ev.columnId)
            : undefined;
          positions.set(ev.id, {
            left: colPos.left + microIdx * microW,
            right: colPos.left + (microIdx + 1) * microW,
            color: mcMatch?.color ?? col.microColumns![microIdx].color,
          });
        });
      } else if (col.microColumnAssignment === 'dynamic-split') {
        const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
        const colEvents = events.filter(
          (ev) => ev.ownerId === col.ownerId &&
            (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
        );

        const typeOrder = new Map<string, number>();
        col.microColumns!.forEach((mc, idx) => typeOrder.set(mc.id, idx));
        const mcById = new Map(col.microColumns!.map((mc) => [mc.id, mc]));

        for (const ev of colEvents) {
          const { count, index } = MicroColumnController.dynamicSplitPosition(ev, colEvents, typeOrder);
          const dynW = colWidth / count;
          positions.set(ev.id, {
            left: colPos.left + index * dynW,
            right: colPos.left + (index + 1) * dynW,
            color: mcById.get(ev.columnId)?.color ?? col.color,
          });
        }
      } else {
        // by-column-id: match event columnId to micro-column id
        col.microColumns.forEach((mc, mcIdx) => {
          const mcEvents = events.filter(
            (ev) => ev.ownerId === col.ownerId && ev.columnId === mc.id,
          );
          mcEvents.forEach((ev) => {
            positions.set(ev.id, {
              left: colPos.left + mcIdx * microW,
              right: colPos.left + (mcIdx + 1) * microW,
              color: mc.color,
            });
          });
        });
      }
    }
    return positions;
  }, [events, columns, columnPositions, greedySlotAssignments]);

  // ─── Marquee intersection helper ────────────────────────────────────────────
  const getEventsInRect = useCallback((rect: { left: number; top: number; right: number; bottom: number }) => {
    const bodyTop = bodyTopRef.current ?? 0;
    const ids = new Set<string>();
    for (const ev of events) {
      // Try micro-column positions first, then regular column positions
      let colPos: { left: number; right: number } | undefined =
        microColumnEventPositions.get(ev.id) ??
        columnPositions.get(`${ev.ownerId}-${ev.columnId}`);
      if (!colPos) continue;
      const totalDur = ev.segments && ev.segments.length > 0
        ? ev.segments.reduce((sum, s) => sum + s.durationFrames, 0)
        : ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      const evTop = bodyTop + frameToPx(ev.startFrame, zoomRef.current);
      const evBot = bodyTop + frameToPx(ev.startFrame + totalDur, zoomRef.current);
      // Check rect intersection
      if (colPos.right > rect.left && colPos.left < rect.right &&
          evBot > rect.top && evTop < rect.bottom) {
        ids.add(ev.id);
      }
    }
    return ids;
  }, [events, columnPositions, microColumnEventPositions]);

  /** Find all frame diamonds within a content-space rect. */
  const getFramesInRect = useCallback((rect: { left: number; top: number; right: number; bottom: number }): SelectedFrame[] => {
    const bodyTop = bodyTopRef.current ?? 0;
    const z = zoomRef.current;
    const result: SelectedFrame[] = [];
    for (const ev of events) {
      if (!ev.segments || ev.segments.length === 0) continue;
      const colPos = columnPositions.get(`${ev.ownerId}-${ev.columnId}`);
      if (!colPos) continue;
      // Column X must overlap
      if (colPos.right <= rect.left || colPos.left >= rect.right) continue;
      // Ultimate frames live in the Active phase (offset by activationDuration)
      const isUltimate = ev.columnId === 'ultimate';
      const baseOffset = isUltimate ? ev.activationDuration : 0;
      let segOffset = 0;
      for (let si = 0; si < ev.segments.length; si++) {
        const seg = ev.segments[si];
        if (seg.frames) {
          for (let fi = 0; fi < seg.frames.length; fi++) {
            const f = seg.frames[fi];
            const absFrame = ev.startFrame + baseOffset + segOffset + f.offsetFrame;
            const y = bodyTop + frameToPx(absFrame, z);
            if (y >= rect.top && y <= rect.bottom) {
              result.push({ eventId: ev.id, segmentIndex: si, frameIndex: fi });
            }
          }
        }
        segOffset += seg.durationFrames;
      }
    }
    return result;
  }, [events, columnPositions]);

  // ─── Event hover ──────────────────────────────────────────────────────────────
  const handleEventHover = useCallback((id: string | null) => {
    if (rmbDraggedRef.current) return;
    setHoveredId(id);
  }, []);

  // ─── Event select (click) ─────────────────────────────────────────────────────
  const handleEventSelect = useCallback((e: React.MouseEvent, eventId: string) => {
    if (dragMovedRef.current) return;
    onContextMenu(null); // dismiss any open context menu
    onSelectedFramesChange?.([]); // deselect frames when selecting events
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(eventId)) next.delete(eventId);
        else next.add(eventId);
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
        if (prev.has(eventId) && prev.size === 1) {
          onEditEvent(null);
          return new Set();
        }
        onEditEvent(eventId);
        return new Set([eventId]);
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
    // Hover line
    if (scrollRef.current && outerRect && bodyTopRef.current !== null) {
      const scrollTop = scrollRef.current.scrollTop;
      const bodyTop = bodyTopRef.current;
      const relY = e.clientY - outerRect.top - combinedHeaderHeight + scrollTop - bodyTop;
      if (relY > 0) {
        const frame = pxToFrame(relY, zoomRef.current);
        setHoverFrame(frame);
        const snappedRelY = frameToPx(frame, zoomRef.current);
        setHoverClientY(snappedRelY - scrollTop + outerRect.top + combinedHeaderHeight + bodyTop);
      } else {
        setHoverFrame(null);
        setHoverClientY(null);
      }
    }

    // Duplicate ghost positioning
    if (dupMode && scrollRef.current && outerRect && bodyTopRef.current !== null) {
      const scrollTop = scrollRef.current.scrollTop;
      const bodyTop = bodyTopRef.current;
      const relY = e.clientY - outerRect.top - combinedHeaderHeight + scrollTop - bodyTop;
      const mouseFrame = pxToFrame(relY, zoomRef.current);
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
          const ghost = { ...src, id: `__dup_ghost_${src.id}` };
          if (wouldOverlapNonOverlappable(events, ghost, ghostFrame)) { valid = false; break; }
        }
        setDupValid(valid);
      }
    }

    // Event drag (single or batch)
    if (dragRef.current) {
      dragMovedRef.current = true;
      const { primaryId, eventIds, startMouseY, startFrames } = dragRef.current;
      const deltaFrames = Math.round(
        (e.clientY - startMouseY) / getPxPerFrame(zoomRef.current)
      );
      let primaryNewFrame = 0;
      const { monotonicBounds } = dragRef.current;

      // Pre-clamp delta by timeline bounds and monotonic (MF) bounds.
      let clampedDelta = deltaFrames;
      for (const eid of eventIds) {
        const orig = startFrames.get(eid) ?? 0;
        const timelineMin = -orig;
        const timelineMax = TOTAL_FRAMES - 1 - orig;
        clampedDelta = Math.max(timelineMin, Math.min(timelineMax, clampedDelta));
        const bounds = monotonicBounds.get(eid);
        if (bounds) {
          const minDelta = bounds.min - orig;
          const maxDelta = bounds.max - orig;
          clampedDelta = Math.max(minDelta, Math.min(maxDelta, clampedDelta));
        }
      }

      // Batch move: delegate to controller which applies full validation
      // (non-overlappable, combo windows, etc.) and picks the most restrictive
      // delta so all events preserve their relative positions.
      if (eventIds.length > 1 && onMoveEvents) {
        onMoveEvents(eventIds, clampedDelta);
      } else {
        for (const eid of eventIds) {
          const orig = startFrames.get(eid) ?? 0;
          onMoveEvent(eid, orig + clampedDelta);
        }
      }
      primaryNewFrame = (startFrames.get(primaryId) ?? 0) + clampedDelta;

      if (scrollRef.current && outerRect && bodyTopRef.current !== null) {
        const scrollTop = scrollRef.current.scrollTop;
        const bodyTop = bodyTopRef.current;
        const snappedRelY = frameToPx(primaryNewFrame, zoomRef.current);
        setHoverFrame(primaryNewFrame);
        setHoverClientY(snappedRelY - scrollTop + outerRect.top + combinedHeaderHeight + bodyTop);
      }
      return;
    }

    // Frame diamond drag
    if (frameDragRef.current) {
      dragMovedRef.current = true;
      const { eventId, segmentIndex, frameIndex, startMouseY, startOffsetFrame, minOffset, maxOffset } = frameDragRef.current;
      const deltaFrames = Math.round((e.clientY - startMouseY) / getPxPerFrame(zoomRef.current));
      const newOffset = Math.max(minOffset, Math.min(maxOffset, startOffsetFrame + deltaFrames));
      onMoveFrame?.(eventId, segmentIndex, frameIndex, newOffset);
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
        const seen = new Set(prior.map((f) => `${f.eventId}-${f.segmentIndex}-${f.frameIndex}`));
        frames = [...prior];
        for (const f of newFrames) {
          const key = `${f.eventId}-${f.segmentIndex}-${f.frameIndex}`;
          if (!seen.has(key)) { frames.push(f); seen.add(key); }
        }
      } else {
        frames = newFrames;
      }
      // Open info pane first (onEditEvent may clear selectedFrames),
      // then set selected frames so the later setState wins in the batch.
      if (frames.length > 0) {
        onEditEvent(frames[0].eventId);
      } else {
        onEditEvent(null);
      }
      onSelectedFramesChange?.(frames);
    }
  }, [outerRect, onMoveEvent, combinedHeaderHeight, getEventsInRect, getFramesInRect, onSelectedFramesChange, dupMode, events]);

  const handleMouseLeave = useCallback(() => {
    setHoverClientY(null);
    setHoverFrame(null);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
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
    eventId: string,
    startFrame: number,
  ) => {
    if (e.button !== 0) return; // only left-click drag
    // Block drag for derived columns (e.g. melting flame)
    const ev = events.find((ev) => ev.id === eventId);
    if (ev) {
      const col = columns.find((c): c is MiniTimeline => c.type === 'mini-timeline' && c.ownerId === ev.ownerId && c.columnId === ev.columnId);
      if (col?.derived) return;
    }
    e.preventDefault();
    e.stopPropagation();
    dragMovedRef.current = false;
    onBatchStart?.();

    // If dragging a selected event, drag all selected events together
    if (selectedIds.has(eventId) && selectedIds.size > 1) {
      const startFrames = new Map<string, number>();
      const draggedIds: string[] = [];
      for (const ev of events) {
        if (selectedIds.has(ev.id)) {
          draggedIds.push(ev.id);
          startFrames.set(ev.id, ev.startFrame);
        }
      }
      dragRef.current = { primaryId: eventId, eventIds: draggedIds, startMouseY: e.clientY, startFrames, monotonicBounds: computeMonotonicBounds(draggedIds) };
    } else {
      if (!(e.ctrlKey || e.metaKey) && !(selectedIds.has(eventId) && selectedIds.size === 1)) {
        setSelectedIds(new Set());
      }
      const startFrames = new Map<string, number>();
      startFrames.set(eventId, startFrame);
      dragRef.current = { primaryId: eventId, eventIds: [eventId], startMouseY: e.clientY, startFrames, monotonicBounds: computeMonotonicBounds([eventId]) };
    }
  }, [selectedIds, events, computeMonotonicBounds, onEditEvent, onBatchStart]);

  // ─── Frame diamond drag start ────────────────────────────────────────────────
  const handleFrameDragStart = useCallback((e: React.MouseEvent, eventId: string, segmentIndex: number, frameIndex: number) => {
    if (e.button !== 0) return;
    const ev = events.find((ev) => ev.id === eventId);
    if (!ev?.segments) return;
    const seg = ev.segments[segmentIndex];
    if (!seg?.frames) return;
    const frame = seg.frames[frameIndex];
    if (!frame) return;

    // Compute bounds: must stay within segment [0, segDuration-1] and preserve order with neighbors
    const prevOffset = frameIndex > 0 ? seg.frames[frameIndex - 1].offsetFrame + 1 : 0;
    const nextOffset = frameIndex < seg.frames.length - 1 ? seg.frames[frameIndex + 1].offsetFrame - 1 : seg.durationFrames - 1;

    onBatchStart?.();
    frameDragRef.current = {
      eventId,
      segmentIndex,
      frameIndex,
      startMouseY: e.clientY,
      startOffsetFrame: frame.offsetFrame,
      minOffset: prevOffset,
      maxOffset: nextOffset,
    };
    dragMovedRef.current = false;
  }, [events, onBatchStart]);

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

  // ─── Right-click on empty column ────────────────────────────────────────────
  const handleSubTimelineContextMenu = useCallback((
    e: React.MouseEvent,
    col: Column,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    // Cancel dup mode on right-click
    if (dupMode) {
      setDupMode(false);
      dupSourceRef.current = [];
      return;
    }
    // Suppress context menu if right-click marquee was dragged
    if (rmbDraggedRef.current) return;
    onSelectedFramesChange?.([]);
    if (col.type !== 'mini-timeline') return;
    if (col.derived) return;

    // Resource columns: show "Edit Resource" context menu
    if (col.noAdd && resourceGraphs?.has(col.key) && onEditResource) {
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [
          { label: col.label, header: true },
          { label: 'Edit Resource', action: () => { onEditResource(col.key); onContextMenu(null); } },
        ],
      });
      return;
    }
    if (col.noAdd) return;

    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect || bodyTopRef.current === null) return;

    const relY    = e.clientY - rect.top + scrollTop - bodyTopRef.current;
    const atFrame = pxToFrame(Math.max(0, relY), zoomRef.current);
    const headerItem = { label: `Add @ ${frameToDetailLabel(atFrame)}`, header: true };

    // Helper: check if placing a new event with the given non-overlappable range would overlap siblings
    const checkOverlap = (ownerId: string, columnId: string, range: number): boolean => {
      if (range <= 0) return false;
      return events.some((sib) => {
        if (sib.ownerId !== ownerId || sib.columnId !== columnId) return false;
        const sibRange = sib.nonOverlappableRange
          ?? (sib.segments ? sib.segments.reduce((sum, s) => sum + s.durationFrames, 0) : 0);
        if (sibRange > 0 && atFrame >= sib.startFrame && atFrame < sib.startFrame + sibRange) return true;
        if (sib.startFrame >= atFrame && sib.startFrame < atFrame + range) return true;
        return false;
      });
    };

    // Compute the non-overlappable range for a prospective event
    const prospectiveRange = (defaultSkill: { defaultActivationDuration?: number; segments?: any[] } | null): number => {
      if (defaultSkill?.segments) return defaultSkill.segments.reduce((sum: number, s: any) => sum + (s.durationFrames ?? 0), 0);
      return defaultSkill?.defaultActivationDuration ?? 0;
    };

    if (col.microColumns && col.microColumnAssignment === 'dynamic-split') {
      // Dynamic-split: all micro-column types as options
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [
          headerItem,
          ...col.microColumns.map((mc) => ({
            label: REACTION_LABELS[mc.id]?.label ?? mc.label,
            action: () => onAddEvent(col.ownerId, mc.id, atFrame, col.defaultEvent ?? null),
          })),
        ],
      });
    } else if (col.microColumns && col.microColumnAssignment === 'by-column-id') {
      // Micro-column by column ID: determine which micro-column was clicked
      const colPos = columnPositions.get(col.key);
      if (!colPos) return;
      const relX = e.clientX - (rect.left - (scrollRef.current?.scrollLeft ?? 0)) - colPos.left;
      const microW = (colPos.right - colPos.left) / col.microColumns.length;
      const mcIdx = Math.max(0, Math.min(col.microColumns.length - 1, Math.floor(relX / microW)));
      const mc = col.microColumns[mcIdx];
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [
          headerItem,
          { label: mc.label, action: () => onAddEvent(col.ownerId, mc.id, atFrame, col.defaultEvent ?? null) },
        ],
      });
    } else if (col.microColumns && col.microColumnAssignment === 'by-order') {
      // Monotonic stacking micro-columns (e.g. MF stacks, inflictions)
      const full = MicroColumnController.isColumnFull(col, events, atFrame);
      const beforePrev = MicroColumnController.isBeforeLastEvent(col, events, atFrame);
      const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
      const existing = events.filter(
        (ev) => ev.ownerId === col.ownerId &&
          (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
      );

      if (col.matchColumnIds && col.microColumns) {
        // Multi-column stacking (inflictions)
        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: [
            headerItem,
            ...col.microColumns.map((mc) => ({
              label: mc.label,
              action: () => onAddEvent(col.ownerId, mc.id, atFrame, col.defaultEvent ?? null),
            })),
          ],
        });
      } else {
        // Single-column stacking (MF)
        const disabled = full || beforePrev;
        const rawName = col.defaultEvent?.name ?? col.label;
        const eventName = COMBAT_SKILL_LABELS[rawName as CombatSkillsType] ?? INFLICTION_EVENT_LABELS[rawName] ?? rawName;
        const disabledReason = full
          ? `(${col.maxEvents ?? '?'}/${col.maxEvents ?? '?'} stacks)`
          : beforePrev
            ? `(must be after stack ${existing.length})`
            : '';
        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: [
            headerItem,
            {
              label: eventName,
              action: () => onAddEvent(col.ownerId, col.columnId, atFrame, col.defaultEvent ?? null),
              disabled,
              disabledReason: disabled ? disabledReason : undefined,
            },
          ],
        });
      }
    } else {
      // Simple single-column mini-timeline (skill columns)
      const rawName = col.defaultEvent?.name ?? col.label;
      const eventName = COMBAT_SKILL_LABELS[rawName as CombatSkillsType] ?? INFLICTION_EVENT_LABELS[rawName] ?? rawName;
      if (col.columnId === 'combo' && activationWindows) {
        const windows = activationWindows.get(col.ownerId) ?? [];
        const matchingWindow = windows.find((w) => atFrame >= w.startFrame && atFrame < w.endFrame);
        const inWindow = !!matchingWindow;
        const overlap = checkOverlap(col.ownerId, col.columnId, prospectiveRange(col.defaultEvent ?? null));
        const disabled = !inWindow || overlap;
        const reason = !inWindow ? 'No trigger active' : overlap ? 'Would overlap another event' : undefined;

        // Find trigger source columnId from the source event
        const sourceEvent = matchingWindow ? events.find((ev) => ev.id === matchingWindow.sourceEventId) : undefined;
        const comboTriggerColumnId = sourceEvent?.columnId;

        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: [
            headerItem,
            {
              label: eventName,
              action: () => onAddEvent(col.ownerId, col.columnId, atFrame,
                { ...col.defaultEvent, comboTriggerColumnId }),
              disabled,
              disabledReason: disabled ? reason : undefined,
            },
          ],
        });
      } else if (col.eventVariants && col.eventVariants.length > 0) {
        // Multiple event variants (e.g. Laevatain battle skill)
        // Check if the ultimate is active at this frame (for enhanced variant gating)
        const ultActive = events.some((ev) =>
          ev.ownerId === col.ownerId && ev.columnId === 'ultimate'
          && atFrame >= ev.startFrame + ev.activationDuration
          && atFrame < ev.startFrame + ev.activationDuration + ev.activeDuration,
        );
        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: [
            headerItem,
            ...col.eventVariants.map((v) => {
              const isEnhanced = v.name.includes('ENHANCED');
              const overlap = checkOverlap(col.ownerId, col.columnId, prospectiveRange(v));
              const disabled = v.disabled || (isEnhanced && !ultActive) || overlap;
              const displayName = COMBAT_SKILL_LABELS[v.name as CombatSkillsType] ?? INFLICTION_EVENT_LABELS[v.name] ?? v.name;
              const reason = v.disabledReason ?? (isEnhanced && !ultActive ? 'No ultimate active' : overlap ? 'Would overlap another event' : undefined);
              return {
                label: displayName,
                disabledReason: disabled ? reason : undefined,
                action: () => onAddEvent(col.ownerId, col.columnId, atFrame, {
                  name: v.name,
                  defaultActivationDuration: v.defaultActivationDuration,
                  defaultActiveDuration: v.defaultActiveDuration,
                  defaultCooldownDuration: v.defaultCooldownDuration,
                  ...(v.segments ? { segments: v.segments } : {}),
                  ...(v.gaugeGain != null ? { gaugeGain: v.gaugeGain } : {}),
                  ...(v.teamGaugeGain != null ? { teamGaugeGain: v.teamGaugeGain } : {}),
                  ...(v.gaugeGainByEnemies ? { gaugeGainByEnemies: v.gaugeGainByEnemies } : {}),
                  ...(v.animationDuration != null ? { animationDuration: v.animationDuration } : {}),
                }),
                disabled,
              };
            }),
          ],
        });
      } else {
        const overlap = checkOverlap(col.ownerId, col.columnId, prospectiveRange(col.defaultEvent ?? null));
        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: [
            headerItem,
            ...(resourceGraphs?.has(col.key) && onEditResource ? [
              { label: 'Edit Resource', action: () => { onEditResource(col.key); onContextMenu(null); } },
              { separator: true } as const,
            ] : []),
            {
              label: eventName,
              action: () => onAddEvent(col.ownerId, col.columnId, atFrame, col.defaultEvent ?? null),
              disabled: overlap,
              disabledReason: overlap ? 'Would overlap another event' : undefined,
            },
          ],
        });
      }
    }
  }, [onAddEvent, onContextMenu, events, columnPositions, activationWindows, resourceGraphs, onEditResource, onSelectedFramesChange, dupMode]);

  // ─── Build "Add Segment" items for a sequenced event ────────────────────────
  const buildSegmentAddItems = useCallback((eventId: string): import('../consts/viewTypes').ContextMenuItem[] => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev?.segments) return [];
    const col = columns.find((c): c is MiniTimeline =>
      c.type === 'mini-timeline' && c.ownerId === ev.ownerId && c.columnId === ev.columnId);
    const allSegments = col?.defaultEvent?.segments;
    if (!allSegments || allSegments.length <= 1) return [];
    const addable = allSegments.filter((s) => s.label);
    if (addable.length === 0) return [];
    // Current non-overlappable range
    const currentRange = ev.nonOverlappableRange
      ?? ev.segments.reduce((sum, s) => sum + s.durationFrames, 0);
    // Siblings in the same column
    const siblings = events.filter(
      (sib) => sib.id !== ev.id && sib.ownerId === ev.ownerId && sib.columnId === ev.columnId,
    );
    return addable.map((s) => {
      const newRange = currentRange + s.durationFrames;
      // Check if expanded range would overlap a sibling
      const wouldOverlap = siblings.some((sib) => {
        const sibRange = sib.nonOverlappableRange
          ?? (sib.segments ? sib.segments.reduce((sum, seg) => sum + seg.durationFrames, 0) : 0);
        if (sibRange > 0 && ev.startFrame >= sib.startFrame && ev.startFrame < sib.startFrame + sibRange) return true;
        if (newRange > 0 && sib.startFrame >= ev.startFrame && sib.startFrame < ev.startFrame + newRange) return true;
        return false;
      });
      return {
        label: `Add Sequence ${s.label}`,
        action: () => { onAddSegment?.(eventId, s.label!); onContextMenu(null); },
        disabled: wouldOverlap,
        disabledReason: wouldOverlap ? 'Would overlap another event' : undefined,
      };
    });
  }, [events, columns, onAddSegment, onContextMenu]);

  // ─── Right-click on event ────────────────────────────────────────────────────
  const handleEventContextMenu = useCallback((
    e: React.MouseEvent,
    eventId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    // Suppress context menu if right-click marquee was dragged
    if (rmbDraggedRef.current) return;
    onSelectedFramesChange?.([]);
    // Block context menu for derived columns (e.g. melting flame)
    const target = events.find((ev) => ev.id === eventId);
    if (target) {
      const col = columns.find((c): c is MiniTimeline => c.type === 'mini-timeline' && c.ownerId === target.ownerId && c.columnId === target.columnId);
      if (col?.derived) return;
    }

    // Compute frame from click position (for "Add" items)
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const rect = scrollRef.current?.getBoundingClientRect();
    let atFrame = 0;
    let label = '';
    if (rect && bodyTopRef.current !== null) {
      const relY = e.clientY - rect.top + scrollTop - bodyTopRef.current;
      atFrame = pxToFrame(Math.max(0, relY), zoomRef.current);
      label = frameToDetailLabel(atFrame);
    }

    // Build "Add" items for stackable columns (by-order with matchColumnIds)
    const ev = events.find((ev) => ev.id === eventId);
    let addItems: import('../consts/viewTypes').ContextMenuItem[] = [];
    if (ev) {
      const col = columns.find((c) => {
        if (c.type !== 'mini-timeline' || !c.microColumns || c.microColumnAssignment !== 'by-order') return false;
        if (c.matchColumnIds) return c.ownerId === ev.ownerId && c.matchColumnIds.includes(ev.columnId);
        return c.ownerId === ev.ownerId && c.columnId === ev.columnId;
      }) as MiniTimeline | undefined;

      if (col?.matchColumnIds && col.microColumns) {
        addItems = col.microColumns.map((mc) => ({
          label: `Add ${mc.label} at ${label}`,
          action: () => onAddEvent(col.ownerId, mc.id, atFrame, col.defaultEvent ?? null),
        }));
      } else if (col) {
        // Single-column stacking (MF)
        const full = MicroColumnController.isColumnFull(col, events, atFrame);
        const beforePrev = MicroColumnController.isBeforeLastEvent(col, events, atFrame);
        const disabled = full || beforePrev;
        const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
        const existing = events.filter(
          (ev) => ev.ownerId === col.ownerId &&
            (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
        );
        const maxLabel = col.maxEvents ?? '?';
        const rawName = col.defaultEvent?.name ?? col.label;
        const eventName = COMBAT_SKILL_LABELS[rawName as CombatSkillsType] ?? INFLICTION_EVENT_LABELS[rawName] ?? rawName;
        const disabledReason2 = full
          ? `${maxLabel}/${maxLabel} stacks`
          : beforePrev
            ? `Must be after stack ${existing.length}`
            : undefined;
        addItems = [{
          label: `Add ${eventName} at ${label}`,
          action: () => onAddEvent(col.ownerId, col.columnId, atFrame, col.defaultEvent ?? null),
          disabled,
          disabledReason: disabled ? disabledReason2 : undefined,
        }];
      }
    }

    // Batch context menu when right-clicking a selected event in a multi-selection
    if (selectedIds.has(eventId) && selectedIds.size > 1) {
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
        ],
      });
    } else {
      const hasSegments = ev?.segments && ev.segments.length > 0;
      const multiSegment = (ev?.segments?.length ?? 0) > 1;
      const segAddItems = multiSegment ? buildSegmentAddItems(eventId) : [];
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [
          ...(onResetEvent ? [{ label: 'Reset Event to Default', action: () => { onResetEvent(eventId); } }] : []),
          ...(multiSegment && onResetSegments ? [{ label: 'Reset Segments to Default', action: () => { onResetSegments(eventId); } }] : []),
          ...(hasSegments && onResetFrames ? [{ label: 'Reset Frames to Default', action: () => { onResetFrames(eventId); } }] : []),
          { separator: true },
          ...(segAddItems.length > 0 ? [...segAddItems, { separator: true } as const] : []),
          { label: 'Remove Event', action: () => onRemoveEvent(eventId), danger: true },
          ...(addItems.length > 0 ? [{ separator: true } as const, ...addItems] : []),
        ],
      });
    }
  }, [onEditEvent, onRemoveEvent, onRemoveEvents, onResetEvent, onResetEvents, onResetSegments, onResetFrames, onContextMenu, selectedIds, events, columns, onAddEvent, onSelectedFramesChange, buildSegmentAddItems]);

  // ─── Right-click on frame diamond ──────────────────────────────────────────
  const handleFrameContextMenu = useCallback((
    e: React.MouseEvent,
    eventId: string,
    segmentIndex: number,
    frameIndex: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (rmbDraggedRef.current) return;
    const isInSelection = selectedFrames?.some(
      (sf) => sf.eventId === eventId && sf.segmentIndex === segmentIndex && sf.frameIndex === frameIndex,
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
            action: () => { onRemoveFrame?.(eventId, segmentIndex, frameIndex); onContextMenu(null); },
            danger: true,
          },
        ],
      });
    }
  }, [onContextMenu, onRemoveFrame, onRemoveFrames, selectedFrames, onSelectedFramesChange]);

  // ─── Build "Add Frame" items for a segment ─────────────────────────────────
  const buildFrameAddItems = useCallback((eventId: string, segmentIndex: number): import('../consts/viewTypes').ContextMenuItem[] => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev?.segments?.[segmentIndex]) return [];
    const col = columns.find((c): c is MiniTimeline =>
      c.type === 'mini-timeline' && c.ownerId === ev.ownerId && c.columnId === ev.columnId);
    // Find the matching default segment by label
    const seg = ev.segments[segmentIndex];
    const allDefaultSegs = col?.defaultEvent?.segments;
    const defaultSeg = allDefaultSegs?.find((s) => s.label === seg.label) ?? allDefaultSegs?.[segmentIndex];
    const allFrames = defaultSeg?.frames;
    if (!allFrames || allFrames.length <= 0) return [];
    const presentOffsets = new Set((seg.frames ?? []).map((f) => f.offsetFrame));
    const missing = allFrames.filter((f) => !presentOffsets.has(f.offsetFrame));
    if (missing.length === 0) return [];
    return missing.map((f, i) => {
      const allIdx = allFrames.indexOf(f);
      return {
        label: `Add Frame ${allIdx + 1}`,
        action: () => { onAddFrame?.(eventId, segmentIndex, f.offsetFrame); onContextMenu(null); },
      };
    });
  }, [events, columns, onAddFrame, onContextMenu]);

  // ─── Right-click on segment (multi-segment events only) ────────────────────
  const handleSegmentContextMenu = useCallback((
    e: React.MouseEvent,
    eventId: string,
    segmentIndex: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (rmbDraggedRef.current) return;
    onSelectedFramesChange?.([]);
    const ev = events.find((ev) => ev.id === eventId);
    const segLabel = ev?.segments?.[segmentIndex]?.label;
    const multiSegment = (ev?.segments?.length ?? 0) > 1;
    const addSegItems = multiSegment ? buildSegmentAddItems(eventId) : [];
    const addFrameItems = buildFrameAddItems(eventId, segmentIndex);
    onContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        ...(onResetEvent ? [{ label: 'Reset Event to Default', action: () => { onResetEvent(eventId); } }] : []),
        ...(multiSegment && onResetSegments ? [{ label: 'Reset Segments to Default', action: () => { onResetSegments(eventId); } }] : []),
        ...(onResetFrames ? [{ label: 'Reset Frames to Default', action: () => { onResetFrames(eventId); } }] : []),
        { separator: true },
        ...(addFrameItems.length > 0 ? [...addFrameItems, { separator: true } as const] : []),
        ...(addSegItems.length > 0 ? [...addSegItems, { separator: true } as const] : []),
        ...(multiSegment && ev?.columnId === 'basic' ? [{
          label: `Remove Sequence${segLabel ? ` ${segLabel}` : ` ${segmentIndex + 1}`}`,
          action: () => { onRemoveSegment?.(eventId, segmentIndex); onContextMenu(null); },
          danger: true,
        }] : []),
        { label: 'Remove Event', action: () => onRemoveEvent(eventId), danger: true },
      ],
    });
  }, [onContextMenu, onEditEvent, onRemoveEvent, onRemoveSegment, onResetEvent, onResetSegments, onResetFrames, onSelectedFramesChange, events, buildSegmentAddItems, buildFrameAddItems]);

  const showHoverLine = hoverClientY !== null && outerRect
    && hoverClientY > outerRect.top + combinedHeaderHeight
    && hoverClientY < outerRect.bottom;

  return (
    <div
      ref={outerRef}
      className={`timeline-outer${dupMode ? ' timeline-outer--dup' : ''}`}
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
      <div className="timeline-header-area">
        {/* Row 1: Loadout row */}
        <div
          ref={loadoutRef}
          className="timeline-header-grid"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="tl-loadout-corner">
            <span className="corner-label">LOADOUT</span>
          </div>

          <div
            className="tl-loadout-cell tl-loadout-cell--common"
            style={{ gridColumn: `${commonStartCol} / span ${commonColCount}` }}
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
                  gridColumn: `${group.startCol} / span ${group.columnCount}`,
                  '--op-color': op?.color ?? '#666',
                } as React.CSSProperties}
              >
                <OperatorLoadoutHeader
                  operatorName={op?.name ?? 'EMPTY'}
                  operatorColor={op?.color ?? '#666'}
                  operatorWeaponTypes={op?.weaponTypes ?? []}
                  splash={op?.splash}
                  state={loadouts[slot.slotId]}
                  onChange={(s) => onLoadoutChange(slot.slotId, s)}
                  onEdit={() => onEditLoadout(slot.slotId)}
                  allOperators={allOperators}
                  onSelectOperator={onSwapOperator ? (opId) => onSwapOperator(slot.slotId, opId) : undefined}
                />
              </div>
            );
          })}

          {enemyColCount > 0 && (
            <div
              className="tl-loadout-cell tl-loadout-cell--enemy"
              style={{ gridColumn: `${colIdx} / span ${enemyColCount}` }}
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
                <div className="lo-name-row">
                  <span className="lo-enemy-name">{enemy.name}</span>
                </div>
              </div>

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

        {/* Row 2: Skill column headers */}
        <div
          className="timeline-header-grid"
          style={{ gridTemplateColumns: gridCols, height: HEADER_HEIGHT }}
        >
          <div className="tl-corner">
            <span className="corner-label">TIME</span>
          </div>

          {columns.map((col) => (
            <div
              key={`hdr-${col.key}`}
              className={`tl-header-cell${col.type === 'mini-timeline' && col.headerVariant === 'infliction' ? ' enemy-header' : ''}${col.type === 'placeholder' ? ' tl-header-cell--empty' : ''}${col.type === 'mini-timeline' && col.headerVariant === 'mf' ? ' tl-header-cell--mf' : ''}`}
              style={{ '--op-color': col.color } as React.CSSProperties}
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
              ) : col.type === 'mini-timeline' && col.headerVariant === 'mf' ? (
                <span
                  className="skill-badge skill-badge--vertical skill-badge--mf"
                  style={{ '--op-color': col.color } as React.CSSProperties}
                >
                  {col.label}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────── */}
      <div ref={scrollRef} className={`timeline-scroll${hideScrollbar ? ' timeline-scroll--no-bar' : ''}`}>
        <div
          className="timeline-body-grid"
          style={{ gridTemplateColumns: gridCols }}
        >
          {/* Time axis */}
          <div ref={timeAxisRef} className="tl-time-axis" style={{ height: tlHeight }}>
            {ticks.map((tick) => (
              <div
                key={tick.frame}
                className={`tl-tick${tick.major ? ' tl-tick--major' : ' tl-tick--minor'}`}
                style={{ top: frameToPx(tick.frame, zoom) }}
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
                  className="tl-sub-timeline tl-sub-timeline--empty"
                  style={{ height: tlHeight }}
                  onMouseDown={handleTimelineMouseDown}
                >
                  {ticks.filter((t) => t.major).map((tick) => (
                    <div
                      key={tick.frame}
                      className="tl-gridline"
                      style={{ top: frameToPx(tick.frame, zoom) }}
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
            if (col.derived) {
              for (let i = 0; i < colEvents.length - 1; i++) {
                const cur = colEvents[i];
                const next = colEvents[i + 1];
                const curEnd = cur.startFrame + cur.activationDuration + cur.activeDuration + cur.cooldownDuration;
                if (curEnd > next.startFrame) {
                  const clampedTotal = next.startFrame - cur.startFrame;
                  colEvents[i] = {
                    ...cur,
                    activationDuration: Math.min(cur.activationDuration, clampedTotal),
                    activeDuration: Math.max(0, Math.min(cur.activeDuration, clampedTotal - cur.activationDuration)),
                    cooldownDuration: Math.max(0, Math.min(cur.cooldownDuration, clampedTotal - cur.activationDuration - cur.activeDuration)),
                  };
                }
              }
            }
            // Viewport culling: only render events overlapping the visible frame range
            const visColEvents = colEvents.filter((ev) => {
              const evEnd = ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
              return evEnd >= visibleRange.startFrame && ev.startFrame <= visibleRange.endFrame;
            });

            const isMf = col.headerVariant === 'mf';
            const empowered = isMf && col.maxEvents != null && colEvents.length >= col.maxEvents;
            const colPos = columnPositions.get(col.key);

            return (
              <div
                key={`col-${col.key}`}
                className={`tl-sub-timeline${hasMicro ? ' tl-sub-timeline--mf' : ''}`}
                style={{ height: tlHeight }}
                onContextMenu={(e) => handleSubTimelineContextMenu(e, col)}
                onMouseDown={handleTimelineMouseDown}
              >
                {ticks.filter((t) => t.major).map((tick) => (
                  <div
                    key={tick.frame}
                    className="tl-gridline"
                    style={{ top: frameToPx(tick.frame, zoom) }}
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
                  // In the column: left = 0 (min), right = full width (max)
                  // Y axis = frame → px (vertical timeline)
                  const svgPoints = points.map((pt) => {
                    const x = ((pt.value - rMin) / range) * 100;
                    const y = frameToPx(pt.frame, zoom);
                    return { x, y };
                  });
                  const lineStr = svgPoints.map((p) => `${p.x},${p.y}`).join(' ');
                  // Close to left edge for fill: down left edge, then back up along the line
                  const lastPt = svgPoints[svgPoints.length - 1];
                  const firstPt = svgPoints[0];
                  const fillStr = `${lineStr} 0,${lastPt.y} 0,${firstPt.y}`;
                  return (
                    <svg
                      className="resource-graph"
                      viewBox={`0 0 100 ${tlHeight}`}
                      preserveAspectRatio="none"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: tlHeight, pointerEvents: 'none' }}
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
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  );
                })()}

                {/* Combo disabled background + "No trigger condition" labels */}
                {col.columnId === 'combo' && !alwaysAvailableComboSlots.has(col.ownerId) && (() => {
                  const windows = activationWindows?.get(col.ownerId) ?? [];
                  // Compute gaps between activation windows
                  const gaps: { start: number; end: number }[] = [];
                  let cursor = 0;
                  for (const w of windows) {
                    if (w.startFrame > cursor) gaps.push({ start: cursor, end: w.startFrame });
                    cursor = Math.max(cursor, w.endFrame);
                  }
                  if (cursor < TOTAL_FRAMES) gaps.push({ start: cursor, end: TOTAL_FRAMES });

                  // Place labels every LABEL_INTERVAL frames within each gap
                  const LABEL_INTERVAL = 1800; // 15 seconds
                  const LABEL_PAD = 60; // 0.5 seconds offset from gap start
                  const labels: { frame: number }[] = [];
                  for (const gap of gaps) {
                    const gapDur = gap.end - gap.start;
                    if (gapDur < 600) continue; // skip tiny gaps
                    let f = gap.start + LABEL_PAD;
                    while (f < gap.end - LABEL_PAD) {
                      labels.push({ frame: f });
                      f += LABEL_INTERVAL;
                    }
                  }

                  return (
                    <>
                      {gaps.map((gap, i) => (
                        <div
                          key={`gap-${i}`}
                          className="combo-disabled-bg"
                          style={{
                            top: frameToPx(gap.start, zoom),
                            height: durationToPx(gap.end - gap.start, zoom),
                          }}
                        />
                      ))}
                      {labels.map((l, i) => (
                        <div
                          key={`no-trigger-${i}`}
                          className="combo-no-trigger-label"
                          style={{ top: frameToPx(l.frame, zoom) }}
                        >
                          No trigger condition
                        </div>
                      ))}
                    </>
                  );
                })()}

                {/* Activation windows (combo skills) */}
                {col.columnId === 'combo' && activationWindows?.get(col.ownerId)
                  ?.filter((win) => win.endFrame >= visibleRange.startFrame && win.startFrame <= visibleRange.endFrame)
                  .map((win, i) => (
                  <div
                    key={`win-${i}`}
                    className="activation-window"
                    style={{
                      top: frameToPx(win.startFrame, zoom),
                      height: durationToPx(win.endFrame - win.startFrame, zoom),
                      '--op-color': col.color,
                    } as React.CSSProperties}
                    onClick={(e) => { e.stopPropagation(); onEditEvent(win.sourceEventId, `combo-trigger:${win.startFrame}:${win.endFrame}`); }}
                  />
                ))}

                {/* Events */}
                {hasMicro ? (
                  // Micro-column events
                  visColEvents.map((ev, i) => {
                    const dynPos = col.microColumnAssignment === 'dynamic-split'
                      ? microColumnEventPositions.get(ev.id)
                      : undefined;

                    let microIdx: number;
                    let microColor: string;
                    let leftPct: string;
                    let widthPct: string;

                    if (dynPos && colPos) {
                      // Dynamic-split: use precomputed pixel positions
                      const colWidth = colPos.right - colPos.left;
                      const relLeft = dynPos.left - colPos.left;
                      const relWidth = dynPos.right - dynPos.left;
                      leftPct = `${(relLeft / colWidth) * 100}%`;
                      widthPct = `${(relWidth / colWidth) * 100}%`;
                      microColor = dynPos.color;
                    } else if (col.microColumnAssignment === 'by-order') {
                      // Use greedy slot if available, else sequential
                      microIdx = greedySlotAssignments.get(ev.id) ?? Math.min(i, microCount - 1);
                      // Color by columnId match if multi-column, else by position
                      const mcMatch = col.matchColumnIds
                        ? col.microColumns!.find((mc) => mc.id === ev.columnId)
                        : undefined;
                      microColor = mcMatch?.color ?? col.microColumns![microIdx!].color;
                      const microW = 100 / microCount;
                      leftPct = `${microIdx! * microW}%`;
                      widthPct = `${microW}%`;
                    } else {
                      microIdx = col.microColumns!.findIndex((mc) => mc.id === ev.columnId);
                      if (microIdx < 0) microIdx = 0;
                      microColor = col.microColumns![microIdx].color;
                      const microW = 100 / microCount;
                      leftPct = `${microIdx * microW}%`;
                      widthPct = `${microW}%`;
                    }
                    return (
                      <div
                        key={ev.id}
                        className={`mf-micro-slot${empowered ? ' mf-micro-slot--empowered' : ''}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: leftPct,
                          width: widthPct,
                        }}
                      >
                        <EventBlock
                          event={ev}
                          color={microColor}
                          zoom={zoom}
                          selected={false}
                          hovered={hoveredId === ev.id}
                          label={COMBAT_SKILL_LABELS[ev.name as CombatSkillsType] ?? INFLICTION_EVENT_LABELS[ev.name] ?? ev.name}
                          onDragStart={col.derived ? noop3 : handleEventDragStart}
                          onContextMenu={col.derived ? noop2 : handleEventContextMenu}
                          onSelect={handleEventSelect}
                          onHover={handleEventHover}
                          onTouchStart={col.derived ? undefined : handleEventTouchStart}
                          notDraggable={col.source === TimelineSourceType.ENEMY}
                        />
                      </div>
                    );
                  })
                ) : (
                  // Single-column events
                  visColEvents.map((ev) => {
                    const isEnemy = col.source === TimelineSourceType.ENEMY;
                    const isSequenced = ev.segments && ev.segments.length > 0;
                    const skillElColor = col.type === 'mini-timeline' && col.skillElement
                      ? ELEMENT_COLORS[col.skillElement as ElementType]
                      : undefined;
                    const eventColor = isSequenced
                      ? (skillElColor ?? slotElementColor[col.ownerId] ?? col.color)
                      : col.color;
                    return (
                      <EventBlock
                        key={ev.id}
                        event={ev}
                        color={eventColor}
                        zoom={zoom}
                        selected={selectedIds.has(ev.id)}
                        hovered={hoveredId === ev.id}
                        label={COMBAT_SKILL_LABELS[ev.name as CombatSkillsType] ?? INFLICTION_EVENT_LABELS[ev.name] ?? ev.name}
                        variant={col.columnId === 'ultimate' ? 'ultimate' : ev.segments && ev.segments.length > 0 ? 'sequenced' : 'default'}
                        striped={col.columnId === 'combo' && !alwaysAvailableComboSlots.has(col.ownerId)}
                        comboWarning={invalidComboIds.get(ev.id) ?? null}
                        onDragStart={handleEventDragStart}
                        onContextMenu={handleEventContextMenu}
                        onSelect={handleEventSelect}
                        onHover={handleEventHover}
                        onTouchStart={handleEventTouchStart}
                        onFrameClick={handleFrameClickGuarded}
                        onFrameContextMenu={handleFrameContextMenu}
                        onFrameDragStart={handleFrameDragStart}
                        onSegmentContextMenu={handleSegmentContextMenu}
                        selectedFrames={selectedFrames?.filter((sf) => sf.eventId === ev.id)}
                        notDraggable={isEnemy}
                        allSegmentLabels={col.defaultEvent?.segments?.map((s) => s.label!)}
                        allDefaultSegments={col.defaultEvent?.segments}
                        hoverFrame={isSequenced ? hoverFrame : undefined}
                        skillElement={col.type === 'mini-timeline' ? col.skillElement : undefined}
                      />
                    );
                  })
                )}

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
          const totalDuration = src.segments
            ? src.segments.reduce((sum, s) => sum + s.durationFrames, 0)
            : src.activationDuration + src.activeDuration + src.cooldownDuration;
          const heightPx = durationToPx(totalDuration, zoom);
          return (
            <div
              key={`ghost-${src.id}`}
              className={`dup-ghost ${dupValid ? 'dup-ghost--valid' : 'dup-ghost--invalid'}`}
              style={{
                position: 'absolute',
                top: topPx,
                left: colPos.left,
                width: colPos.right - colPos.left,
                height: heightPx,
                pointerEvents: 'none',
              }}
            />
          );
        })}
      </div>

      {/* Hover line */}
      {showHoverLine && outerRect && (
        <div
          className="hover-line"
          style={{ top: hoverClientY!, left: outerRect.left, width: outerRect.width }}
        >
          {hoverFrame !== null && (() => {
            const totalSec = hoverFrame / FPS;
            const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
            const secsRaw = (totalSec % 60).toFixed(2);
            const secs = secsRaw.indexOf('.') < 2 ? secsRaw.padStart(5, '0') : secsRaw;
            const frameNum = hoverFrame % FPS;

            // Resource graph indicators
            const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
            const resourceIndicators: React.ReactNode[] = [];
            if (resourceGraphs) {
              for (const [colKey, graph] of Array.from(resourceGraphs)) {
                const colPos = columnPositions.get(colKey);
                if (!colPos || graph.points.length < 2 || graph.max === graph.min) continue;

                // Interpolate value at hoverFrame
                const pts = graph.points;
                let value = pts[0].value;
                for (let i = 0; i < pts.length - 1; i++) {
                  if (hoverFrame <= pts[i].frame) { value = pts[i].value; break; }
                  if (hoverFrame <= pts[i + 1].frame) {
                    const t = (hoverFrame - pts[i].frame) / (pts[i + 1].frame - pts[i].frame);
                    value = pts[i].value + t * (pts[i + 1].value - pts[i].value);
                    break;
                  }
                  value = pts[i + 1].value;
                }

                const colWidth = colPos.right - colPos.left;
                const xInLine = colPos.left - scrollLeft + colWidth / 2;
                const col = columns.find((c) => c.key === colKey);
                const dotColor = col?.color ?? 'rgba(100, 200, 255, 1)';

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
