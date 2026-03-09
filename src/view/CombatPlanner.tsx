import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import EventBlock from './EventBlock';
import OperatorLoadoutHeader, { OperatorLoadoutState, DropdownTierBar } from './OperatorLoadoutHeader';
import { ENEMY_TIERS } from '../utils/enemies';
import {
  pxPerFrame as getPxPerFrame,
  frameToPx,
  durationToPx,
  pxToFrame,
  timelineHeight,
  getTickMarks,
  frameToTimeLabel,
  frameToDetailLabel,
  FPS,
  TIME_AXIS_WIDTH,
  HEADER_HEIGHT,
  TOTAL_FRAMES,
} from '../utils/timeline';
import { SKILL_COLUMN_ORDER as SKILL_ORDER } from '../model/channels';
import { REACTION_LABELS, COMBAT_SKILL_LABELS } from '../consts/channelLabels';
import { CombatSkillsType, TimelineSourceType } from '../consts/enums';
import {
  Operator,
  Enemy,
  TimelineEvent,
  VisibleSkills,
  ContextMenuState,
  Column,
  MiniTimeline,
} from "../consts/viewTypes";
import { MicroColumnController } from '../controller/timeline/microColumnController';
import { WindowsMap } from '../controller/combat-loadout';
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
  onContextMenu: (state: ContextMenuState | null) => void;
  onEditEvent: (id: string | null) => void;
  onRemoveEvent: (id: string) => void;
  onLoadoutChange: (slotId: string, state: OperatorLoadoutState) => void;
  onEditLoadout: (slotId: string) => void;
  allOperators?: Operator[];
  onSwapOperator?: (slotId: string, newOperatorId: string | null) => void;
  allEnemies?: Enemy[];
  onSwapEnemy?: (enemyId: string) => void;
  activationWindows?: WindowsMap;
  /** Resource graph data keyed by column key (e.g. 'common-skill-points'). */
  resourceGraphs?: Map<string, { points: ReadonlyArray<{ frame: number; value: number }>; min: number; max: number }>;
  onBatchStart?: () => void;
  onBatchEnd?: () => void;
  onFrameClick?: (eventId: string, segmentIndex: number, frameIndex: number) => void;
  selectedFrame?: import('../consts/viewTypes').SelectedFrame | null;
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
  onContextMenu,
  onEditEvent,
  onRemoveEvent,
  onLoadoutChange,
  onEditLoadout,
  allOperators,
  onSwapOperator,
  allEnemies,
  onSwapEnemy,
  activationWindows,
  resourceGraphs,
  onBatchStart,
  onBatchEnd,
  onFrameClick,
  selectedFrame,
  onScrollRef,
  onScroll: onScrollProp,
  onLoadoutRowHeight,
  onHoverFrame,
  hideScrollbar,
}: CombatPlannerProps) {
  const scrollRef   = useRef<HTMLDivElement>(null);
  const outerRef    = useRef<HTMLDivElement>(null);
  const loadoutRef  = useRef<HTMLDivElement>(null);
  const timeAxisRef = useRef<HTMLDivElement>(null);
  const dragRef     = useRef<DragState | null>(null);
  const marqueeRef  = useRef<MarqueeState | null>(null);
  const dragMovedRef = useRef(false);
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
  const enemyNameRef = useRef<HTMLDivElement>(null);
  const enemyMenuRef = useRef<HTMLDivElement>(null);

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
  const enemyColCount = 2; // arts-infliction + arts-reaction mini-timelines

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
  const ticks    = getTickMarks(zoom);
  const combinedHeaderHeight = loadoutRowHeight + HEADER_HEIGHT;

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

  // ─── Outer rect ────────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      if (outerRef.current) setOuterRect(outerRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
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
    if (!el || !onScrollProp) return;
    const handler = () => onScrollProp(el.scrollTop);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [onScrollProp]);

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
        onBatchStart?.();
        ids.forEach((id) => onRemoveEvent(id));
        onBatchEnd?.();
        setSelectedIds(new Set());
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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIds, events, onRemoveEvent, onBatchStart, onBatchEnd]);

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
        );
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
      const totalDur = ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
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

  // ─── Event hover ──────────────────────────────────────────────────────────────
  const handleEventHover = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  // ─── Event select (click) ─────────────────────────────────────────────────────
  const handleEventSelect = useCallback((e: React.MouseEvent, eventId: string) => {
    if (dragMovedRef.current) return;
    onContextMenu(null); // dismiss any open context menu
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
  }, [onContextMenu, onEditEvent]);

  // ─── Mouse move ─────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
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

    // Event drag (single or batch)
    if (dragRef.current) {
      dragMovedRef.current = true;
      const { primaryId, eventIds, startMouseY, startFrames } = dragRef.current;
      const deltaFrames = Math.round(
        (e.clientY - startMouseY) / getPxPerFrame(zoomRef.current)
      );
      let primaryNewFrame = 0;
      const { monotonicBounds } = dragRef.current;

      // Compute a single delta clamped by ALL events' constraints so that
      // relative timing between events is preserved during batch drag.
      let clampedDelta = deltaFrames;
      for (const eid of eventIds) {
        const orig = startFrames.get(eid) ?? 0;
        // Timeline bounds: orig + delta must stay in [0, TOTAL_FRAMES - 1]
        const timelineMin = -orig;
        const timelineMax = TOTAL_FRAMES - 1 - orig;
        clampedDelta = Math.max(timelineMin, Math.min(timelineMax, clampedDelta));
        // Monotonic bounds (MF stacks)
        const bounds = monotonicBounds.get(eid);
        if (bounds) {
          const minDelta = bounds.min - orig;
          const maxDelta = bounds.max - orig;
          clampedDelta = Math.max(minDelta, Math.min(maxDelta, clampedDelta));
        }
      }

      for (const eid of eventIds) {
        const orig = startFrames.get(eid) ?? 0;
        const newFrame = orig + clampedDelta;
        onMoveEvent(eid, newFrame);
        if (eid === primaryId) primaryNewFrame = newFrame;
      }

      if (scrollRef.current && outerRect && bodyTopRef.current !== null) {
        const scrollTop = scrollRef.current.scrollTop;
        const bodyTop = bodyTopRef.current;
        const snappedRelY = frameToPx(primaryNewFrame, zoomRef.current);
        setHoverFrame(primaryNewFrame);
        setHoverClientY(snappedRelY - scrollTop + outerRect.top + combinedHeaderHeight + bodyTop);
      }
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
  }, [outerRect, onMoveEvent, combinedHeaderHeight, getEventsInRect]);

  const handleMouseLeave = useCallback(() => {
    setHoverClientY(null);
    setHoverFrame(null);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      onBatchEnd?.();
    }
    if (marqueeRef.current) {
      marqueeRef.current = null;
      setMarqueeRect(null);
    }
    requestAnimationFrame(() => { dragMovedRef.current = false; });
  }, [onBatchEnd]);

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
        onEditEvent(null);
      }
      const startFrames = new Map<string, number>();
      startFrames.set(eventId, startFrame);
      dragRef.current = { primaryId: eventId, eventIds: [eventId], startMouseY: e.clientY, startFrames, monotonicBounds: computeMonotonicBounds([eventId]) };
    }
  }, [selectedIds, events, computeMonotonicBounds, onEditEvent, onBatchStart]);

  // ─── Marquee start (mousedown on empty timeline area) ─────────────────────────
  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
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
    }
  }, [selectedIds]);

  // ─── Right-click on empty column ────────────────────────────────────────────
  const handleSubTimelineContextMenu = useCallback((
    e: React.MouseEvent,
    col: Column,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (col.type !== 'mini-timeline') return;
    if (col.noAdd || col.derived) return;

    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect || bodyTopRef.current === null) return;

    const relY    = e.clientY - rect.top + scrollTop - bodyTopRef.current;
    const atFrame = pxToFrame(Math.max(0, relY), zoomRef.current);
    const headerItem = { label: `Add @ ${frameToDetailLabel(atFrame)}`, header: true };

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
        const eventName = col.defaultEvent?.name ?? col.label;
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
              label: disabled ? `${eventName} ${disabledReason}` : eventName,
              action: () => onAddEvent(col.ownerId, col.columnId, atFrame, col.defaultEvent ?? null),
              disabled,
            },
          ],
        });
      }
    } else {
      // Simple single-column mini-timeline (skill columns)
      const eventName = col.defaultEvent?.name ?? col.label;
      if (col.columnId === 'combo' && activationWindows) {
        const windows = activationWindows.get(col.ownerId) ?? [];
        const inWindow = windows.some((w) => atFrame >= w.startFrame && atFrame < w.endFrame);
        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: [
            headerItem,
            {
              label: inWindow ? eventName : `${eventName} (no trigger active)`,
              action: () => onAddEvent(col.ownerId, col.columnId, atFrame, col.defaultEvent ?? null),
              disabled: !inWindow,
            },
          ],
        });
      } else if (col.eventVariants && col.eventVariants.length > 0) {
        // Multiple event variants (e.g. Laevatain battle skill)
        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: [
            headerItem,
            ...col.eventVariants.map((v) => {
              const displayName = COMBAT_SKILL_LABELS[v.name as CombatSkillsType] ?? v.name;
              return {
                label: v.disabled ? `${displayName} ${v.disabledReason ?? ''}`.trim() : displayName,
                action: () => onAddEvent(col.ownerId, col.columnId, atFrame, {
                  name: v.name,
                  defaultActivationDuration: v.defaultActivationDuration,
                  defaultActiveDuration: v.defaultActiveDuration,
                  defaultCooldownDuration: v.defaultCooldownDuration,
                  ...(v.segments ? { segments: v.segments } : {}),
                }),
                disabled: v.disabled,
              };
            }),
          ],
        });
      } else {
        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: [
            headerItem,
            { label: eventName, action: () => onAddEvent(col.ownerId, col.columnId, atFrame, col.defaultEvent ?? null) },
          ],
        });
      }
    }
  }, [onAddEvent, onContextMenu, events, columnPositions, activationWindows]);

  // ─── Right-click on event ────────────────────────────────────────────────────
  const handleEventContextMenu = useCallback((
    e: React.MouseEvent,
    eventId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
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
        const disabledLabel = full
          ? `${col.defaultEvent?.name ?? col.label} (${maxLabel}/${maxLabel} stacks)`
          : beforePrev
            ? `${col.defaultEvent?.name ?? col.label} (must be after stack ${existing.length})`
            : '';
        addItems = [{
          label: disabled
            ? disabledLabel
            : `Add ${col.defaultEvent?.name ?? col.label} at ${label}`,
          action: () => onAddEvent(col.ownerId, col.columnId, atFrame, col.defaultEvent ?? null),
          disabled,
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
          {
            label: `Remove ${count} Events`,
            action: () => { onBatchStart?.(); ids.forEach((id) => onRemoveEvent(id)); onBatchEnd?.(); setSelectedIds(new Set()); onContextMenu(null); },
            danger: true,
          },
          ...(addItems.length > 0 ? [{ separator: true } as const, ...addItems] : []),
        ],
      });
    } else {
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [
          { label: 'Edit Event',   action: () => { onEditEvent(eventId); onContextMenu(null); } },
          { separator: true },
          { label: 'Remove Event', action: () => onRemoveEvent(eventId), danger: true },
          ...(addItems.length > 0 ? [{ separator: true } as const, ...addItems] : []),
        ],
      });
    }
  }, [onEditEvent, onRemoveEvent, onContextMenu, selectedIds, onBatchStart, onBatchEnd, events, columns, onAddEvent]);

  const showHoverLine = hoverClientY !== null && outerRect
    && hoverClientY > outerRect.top + combinedHeaderHeight
    && hoverClientY < outerRect.bottom;

  return (
    <div
      ref={outerRef}
      className="timeline-outer"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
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

                {/* Activation windows (combo skills) */}
                {col.columnId === 'combo' && activationWindows?.get(col.ownerId)?.map((win, i) => (
                  <div
                    key={`win-${i}`}
                    className="activation-window"
                    style={{
                      top: frameToPx(win.startFrame, zoom),
                      height: durationToPx(win.endFrame - win.startFrame, zoom),
                      '--op-color': col.color,
                    } as React.CSSProperties}
                  />
                ))}

                {/* Events */}
                {hasMicro ? (
                  // Micro-column events
                  colEvents.map((ev, i) => {
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
                          label={COMBAT_SKILL_LABELS[ev.name as CombatSkillsType] ?? ev.name}
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
                  colEvents.map((ev) => {
                    const isEnemy = col.source === TimelineSourceType.ENEMY;
                    return (
                      <EventBlock
                        key={ev.id}
                        event={ev}
                        color={col.color}
                        zoom={zoom}
                        selected={selectedIds.has(ev.id)}
                        hovered={hoveredId === ev.id}
                        label={COMBAT_SKILL_LABELS[ev.name as CombatSkillsType] ?? ev.name}
                        variant={col.columnId === 'ultimate' ? 'ultimate' : ev.segments && ev.segments.length > 0 ? 'sequenced' : 'default'}
                        onDragStart={handleEventDragStart}
                        onContextMenu={handleEventContextMenu}
                        onSelect={handleEventSelect}
                        onHover={handleEventHover}
                        onTouchStart={handleEventTouchStart}
                        onFrameClick={onFrameClick}
                        selectedFrame={selectedFrame?.eventId === ev.id ? selectedFrame : null}
                        notDraggable={isEnemy}
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
