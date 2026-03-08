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
  frameToTimeLabelPrecise,
  frameToDetailLabel,
  TIME_AXIS_WIDTH,
  HEADER_HEIGHT,
  TOTAL_FRAMES,
} from '../utils/timeline';
import { SKILL_LABELS, SKILL_ORDER } from '../utils/operators';
import {
  Operator,
  Enemy,
  TimelineEvent,
  VisibleSkills,
  ContextMenuState,
  Column,
  MiniTimeline,
} from "../consts/viewTypes";
import { WindowsMap } from '../controller/combat-loadout';
import { ELEMENT_COLORS, ElementType, TimelineSourceType } from '../consts/enums';
import { useTouchHandlers } from '../utils/useTouchHandlers';

const MIN_SLOT_COLS = 4;

// Minimum loadout width derived from icon layout:
// Row 1: 5 icons × 28px + 4 gaps × 3px + 2 × 6px padding = 164px
// Row 2: 2 icons × 28px + 1 gap × 3px = 59px (narrower, not constraining)
const LOADOUT_MIN_WIDTH = 164;

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

export interface Slot {
  slotId: string;
  operator: Operator | null;
}

interface SlotGroup {
  slot: Slot;
  columnCount: number;
  startCol: number;
}

interface TimelineGridProps {
  slots: Slot[];
  enemy: Enemy;
  events: TimelineEvent[];
  visibleSkills: VisibleSkills;
  loadouts: Record<string, OperatorLoadoutState>;
  zoom: number;
  onZoom: (deltaY: number) => void;
  onToggleSkill: (slotId: string, skillType: string) => void;
  onAddEvent: (ownerId: string, channelId: string, atFrame: number, defaultSkill: object | null) => void;
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
  onBatchStart?: () => void;
  onBatchEnd?: () => void;
}

const MF_MICRO_COLS = 4;

export default function TimelineGrid({
  slots,
  enemy,
  events,
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
  onBatchStart,
  onBatchEnd,
}: TimelineGridProps) {
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
  const [hoverFrame,       setHoverFrame]       = useState<number | null>(null);
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

  // ─── Build ordered column descriptors (keyed by slotId) ──────────────────
  const columns: Column[] = [];
  for (const slot of slots) {
    const op = slot.operator;
    const isLaevatain = op?.id === 'laevatain';
    let slotHasCols = false;
    if (op) {
      for (const skillType of SKILL_ORDER) {
        if (visibleSkills[slot.slotId]?.[skillType]) {
          const skill = op.skills[skillType];
          columns.push({
            key: `${slot.slotId}-${skillType}`,
            type: 'mini-timeline',
            source: TimelineSourceType.OPERATOR,
            ownerId: slot.slotId,
            channelId: skillType,
            label: SKILL_LABELS[skillType],
            color: op.color,
            headerVariant: 'skill',
            defaultEvent: {
              name: skill.name,
              defaultActiveDuration: skill.defaultActiveDuration,
              defaultLingeringDuration: skill.defaultLingeringDuration,
              defaultCooldownDuration: skill.defaultCooldownDuration,
              triggerCondition: skill.triggerCondition,
            },
          });
          slotHasCols = true;
        }
      }
    }
    // Add single MeltingFlame subtimeline column for Laevatain
    if (isLaevatain) {
      columns.push({
        key: `${slot.slotId}-melting-flame`,
        type: 'mini-timeline',
        source: TimelineSourceType.OPERATOR,
        ownerId: slot.slotId,
        channelId: 'melting-flame',
        label: 'MF',
        color: op!.color,
        headerVariant: 'mf',
        microColumns: Array.from({ length: MF_MICRO_COLS }, (_, i) => ({
          id: `mf-${i}`,
          label: String(i + 1),
          color: ELEMENT_COLORS[ElementType.HEAT],
        })),
        microColumnAssignment: 'by-order',
        maxEvents: MF_MICRO_COLS,
        requiresMonotonicOrder: true,
        defaultEvent: {
          name: 'Melting Flame',
          defaultActiveDuration: TOTAL_FRAMES * 10,
          defaultLingeringDuration: 0,
          defaultCooldownDuration: 0,
        },
      });
    }
    // Every slot gets at least MIN_SLOT_COLS columns so the loadout row stays visible
    const skillColCount = slotHasCols
      ? SKILL_ORDER.filter((st) => visibleSkills[slot.slotId]?.[st]).length
      : 0;
    const mfColCount = isLaevatain ? 1 : 0;
    const needed = MIN_SLOT_COLS - (skillColCount + mfColCount);
    for (let p = 0; p < Math.max(0, needed); p++) {
      columns.push({
        key: `${slot.slotId}-placeholder${p}`,
        type: 'placeholder',
        ownerId: slot.slotId,
        color: op?.color ?? '#666',
      });
    }
  }
  // Single arts infliction mini-timeline for the enemy (stacking like MF)
  const inflictionStatuses = enemy.statuses;
  const inflictionChannelIds = inflictionStatuses.map((s) => s.id);
  columns.push({
    key: 'enemy-arts-infliction',
    type: 'mini-timeline',
    source: TimelineSourceType.ENEMY,
    ownerId: 'enemy',
    channelId: 'arts-infliction',
    label: 'INFLICTION',
    color: '#cc3333',
    headerVariant: 'infliction',
    microColumns: inflictionStatuses.map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color,
    })),
    microColumnAssignment: 'by-order',
    matchChannelIds: inflictionChannelIds,
    reuseExpiredSlots: true,
    defaultEvent: {
      name: 'Infliction',
      defaultActiveDuration: 2400, // 20 seconds at 120fps
      defaultLingeringDuration: 0,
      defaultCooldownDuration: 0,
    },
  });
  // Arts reaction mini-timeline for the enemy
  columns.push({
    key: 'enemy-arts-reaction',
    type: 'mini-timeline',
    source: TimelineSourceType.ENEMY,
    ownerId: 'enemy',
    channelId: 'arts-reaction',
    label: 'ARTS REACTION',
    color: '#dd6644',
    headerVariant: 'infliction',
    microColumns: [
      { id: 'combustion',       label: 'COMB',  color: '#ff5522' },
      { id: 'solidification',   label: 'SOLID', color: '#88ddff' },
      { id: 'corrosion',        label: 'CORR',  color: '#33cc66' },
      { id: 'electrification',  label: 'ELEC',  color: '#e8c840' },
    ],
    microColumnAssignment: 'by-channel-id',
  });

  // ─── Compute slot groups for loadout row ──────────────────────────────────
  const slotGroups: SlotGroup[] = [];
  let colIdx = 2; // 1-indexed grid column (col 1 = time axis)
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

  // Compute per-slot column width: ensure loadout content fits
  const slotColWidths: number[] = slotGroups.map((g) => {
    const minPerCol = Math.ceil(LOADOUT_MIN_WIDTH / g.columnCount);
    return Math.max(25, minPerCol); // floor of 25px
  });
  const enemyColWidth = enemyColCount > 0
    ? Math.max(25, Math.ceil(LOADOUT_MIN_WIDTH / enemyColCount))
    : 25;

  // Build gridTemplateColumns string
  const colWidthStrings: string[] = [];
  for (let si = 0; si < slotGroups.length; si++) {
    const g = slotGroups[si];
    for (let c = 0; c < g.columnCount; c++) {
      colWidthStrings.push(`${slotColWidths[si]}px`);
    }
  }
  for (let i = 0; i < enemyColCount; i++) {
    colWidthStrings.push(`${enemyColWidth}px`);
  }
  const gridCols = `${TIME_AXIS_WIDTH}px ${colWidthStrings.join(' ')}`;

  // Precompute column X positions (content coords) for marquee intersection
  const columnPositions = new Map<string, { left: number; right: number }>();
  {
    let xPos = TIME_AXIS_WIDTH;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const sgIdx = slotGroups.findIndex((g) => g.slot.slotId === col.ownerId);
      const w = sgIdx >= 0 ? slotColWidths[sgIdx] : enemyColWidth;
      columnPositions.set(col.key, { left: xPos, right: xPos + w });
      xPos += w;
    }
  }

  const numCols  = columns.length;
  const totalW   = TIME_AXIS_WIDTH + slotGroups.reduce((sum, g, i) => sum + g.columnCount * slotColWidths[i], 0) + enemyColCount * enemyColWidth;
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
    setLoadoutRowHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => {
      setLoadoutRowHeight(el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Measure timeline body top offset ────────────────────────────────────
  useEffect(() => {
    const updateBodyTop = () => {
      const axis = timeAxisRef.current;
      const scroll = scrollRef.current;
      if (axis && scroll) {
        bodyTopRef.current = axis.offsetTop;
      }
    };
    updateBodyTop();
    const ro = new ResizeObserver(updateBodyTop);
    if (loadoutRef.current) ro.observe(loadoutRef.current);
    return () => ro.disconnect();
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

  // ─── Greedy micro-column slot assignments for reuseExpiredSlots columns ────
  // Maps eventId → assigned micro-column index. Uses clamped durations so that
  // consumed inflictions free their slot at the consumption frame.
  const greedySlotAssignments = useMemo(() => {
    const assignments = new Map<string, number>();
    for (const col of columns) {
      if (col.type !== 'mini-timeline' || !col.reuseExpiredSlots || !col.microColumns) continue;
      const microCount = col.microColumns.length;

      // Collect clamped events for this column
      const matchSet = col.matchChannelIds ? new Set(col.matchChannelIds) : null;
      const colEvents = events.filter(
        (ev) => ev.ownerId === col.ownerId &&
          (matchSet ? matchSet.has(ev.channelId) : ev.channelId === col.channelId),
      );

      // Sort by startFrame
      const sorted = [...colEvents].sort((a, b) => a.startFrame - b.startFrame);

      // Track when each slot becomes free
      const slotEndFrames = new Array(microCount).fill(-1);
      for (const ev of sorted) {
        const endFrame = ev.startFrame + ev.activeDuration + ev.lingeringDuration + ev.cooldownDuration;
        // Find first free slot
        let assigned = -1;
        for (let s = 0; s < microCount; s++) {
          if (slotEndFrames[s] <= ev.startFrame) {
            assigned = s;
            slotEndFrames[s] = endFrame;
            break;
          }
        }
        // Overflow: pack into last slot
        if (assigned < 0) assigned = microCount - 1;
        assignments.set(ev.id, assigned);
      }
    }
    return assignments;
  }, [events, columns]);

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
        const matchSet = col.matchChannelIds ? new Set(col.matchChannelIds) : null;
        const colEvents = events.filter(
          (ev) => ev.ownerId === col.ownerId &&
            (matchSet ? matchSet.has(ev.channelId) : ev.channelId === col.channelId),
        );
        colEvents.forEach((ev, i) => {
          // Use greedy assignment if available, else sequential
          const microIdx = greedySlotAssignments.get(ev.id) ?? Math.min(i, microCount - 1);
          const mcMatch = matchSet
            ? col.microColumns!.find((mc) => mc.id === ev.channelId)
            : undefined;
          positions.set(ev.id, {
            left: colPos.left + microIdx * microW,
            right: colPos.left + (microIdx + 1) * microW,
            color: mcMatch?.color ?? col.microColumns![microIdx].color,
          });
        });
      } else {
        // by-channel-id: match event channelId to micro-column id
        col.microColumns.forEach((mc, mcIdx) => {
          const mcEvents = events.filter(
            (ev) => ev.ownerId === col.ownerId && ev.channelId === mc.id,
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
        columnPositions.get(`${ev.ownerId}-${ev.channelId}`);
      if (!colPos) continue;
      const totalDur = ev.activeDuration + ev.lingeringDuration + ev.cooldownDuration;
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
      const relY = e.clientY - outerRect.top + scrollTop - bodyTop;
      if (relY > 0) {
        const frame = pxToFrame(relY, zoomRef.current);
        setHoverFrame(frame);
        const snappedRelY = frameToPx(frame, zoomRef.current);
        setHoverClientY(snappedRelY - scrollTop + outerRect.top + bodyTop);
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

      // Compute the most restrictive delta across all MF-constrained events
      let clampedDelta = deltaFrames;
      for (const eid of eventIds) {
        const bounds = monotonicBounds.get(eid);
        if (!bounds) continue;
        const orig = startFrames.get(eid) ?? 0;
        const minDelta = bounds.min - orig;
        const maxDelta = bounds.max - orig;
        clampedDelta = Math.max(minDelta, Math.min(maxDelta, clampedDelta));
      }

      for (const eid of eventIds) {
        const orig = startFrames.get(eid) ?? 0;
        const delta = monotonicBounds.has(eid) ? clampedDelta : deltaFrames;
        const newFrame = Math.max(0, Math.min(TOTAL_FRAMES - 1, orig + delta));
        onMoveEvent(eid, newFrame);
        if (eid === primaryId) primaryNewFrame = newFrame;
      }

      if (scrollRef.current && outerRect && bodyTopRef.current !== null) {
        const scrollTop = scrollRef.current.scrollTop;
        const bodyTop = bodyTopRef.current;
        const snappedRelY = frameToPx(primaryNewFrame, zoomRef.current);
        setHoverFrame(primaryNewFrame);
        setHoverClientY(snappedRelY - scrollTop + outerRect.top + bodyTop);
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
      requestAnimationFrame(() => { dragMovedRef.current = false; });
    }
    if (marqueeRef.current) {
      marqueeRef.current = null;
      setMarqueeRect(null);
    }
  }, [onBatchEnd]);

  // ─── Drag start (event move) ──────────────────────────────────────────────────
  // Compute drag bounds for events in monotonic-order micro-column mini-timelines
  const computeMonotonicBounds = useCallback((draggedIds: string[]): Map<string, { min: number; max: number }> => {
    const bounds = new Map<string, { min: number; max: number }>();
    const draggedSet = new Set(draggedIds);
    // Find all mini-timelines with requiresMonotonicOrder
    const monotonicCols = columns.filter(
      (c): c is MiniTimeline => c.type === 'mini-timeline' && !!c.requiresMonotonicOrder,
    );
    for (const eid of draggedIds) {
      const ev = events.find((e) => e.id === eid);
      if (!ev) continue;
      const col = monotonicCols.find((c) => {
        if (c.ownerId !== ev.ownerId) return false;
        if (c.matchChannelIds) return c.matchChannelIds.includes(ev.channelId);
        return c.channelId === ev.channelId;
      });
      if (!col) continue;
      const matchSet = col.matchChannelIds ? new Set(col.matchChannelIds) : null;
      const allInCol = events.filter((e) =>
        e.ownerId === col.ownerId &&
        (matchSet ? matchSet.has(e.channelId) : e.channelId === col.channelId),
      );
      const idx = allInCol.findIndex((e) => e.id === eid);
      if (idx < 0) continue;
      let min = 0;
      let max = TOTAL_FRAMES - 1;
      for (let i = idx - 1; i >= 0; i--) {
        if (!draggedSet.has(allInCol[i].id)) { min = allInCol[i].startFrame; break; }
      }
      for (let i = idx + 1; i < allInCol.length; i++) {
        if (!draggedSet.has(allInCol[i].id)) { max = allInCol[i].startFrame; break; }
      }
      bounds.set(eid, { min, max });
    }
    return bounds;
  }, [events, columns]);

  const handleEventDragStart = useCallback((
    e: React.MouseEvent,
    eventId: string,
    startFrame: number,
  ) => {
    if (e.button !== 0) return; // only left-click drag
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

    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect || bodyTopRef.current === null) return;

    const relY    = e.clientY - rect.top + scrollTop - bodyTopRef.current;
    const atFrame = pxToFrame(Math.max(0, relY), zoomRef.current);
    const label   = frameToDetailLabel(atFrame);

    if (col.microColumns && col.microColumnAssignment === 'by-channel-id') {
      // Micro-column by channel: determine which micro-column was clicked
      const colPos = columnPositions.get(col.key);
      if (!colPos) return;
      const relX = e.clientX - (rect.left - (scrollRef.current?.scrollLeft ?? 0)) - colPos.left;
      const microW = (colPos.right - colPos.left) / col.microColumns.length;
      const mcIdx = Math.max(0, Math.min(col.microColumns.length - 1, Math.floor(relX / microW)));
      const mc = col.microColumns[mcIdx];
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [{
          label: `Add ${mc.label} at ${label}`,
          action: () => onAddEvent(col.ownerId, mc.id, atFrame, col.defaultEvent ?? null),
        }],
      });
    } else if (col.microColumns && col.microColumnAssignment === 'by-order') {
      // Monotonic stacking micro-columns (e.g. MF stacks, inflictions)
      const matchSet = col.matchChannelIds ? new Set(col.matchChannelIds) : null;
      const existing = events.filter(
        (ev) => ev.ownerId === col.ownerId &&
          (matchSet ? matchSet.has(ev.channelId) : ev.channelId === col.channelId),
      );

      // For reuseExpiredSlots columns, count slots occupied at the target frame using clamped events
      let full: boolean;
      if (col.reuseExpiredSlots && col.microColumns) {
        const activeAtFrame = events.filter(
          (ev) => ev.ownerId === col.ownerId &&
            (matchSet ? matchSet.has(ev.channelId) : ev.channelId === col.channelId) &&
            ev.startFrame <= atFrame &&
            ev.startFrame + ev.activeDuration + ev.lingeringDuration + ev.cooldownDuration > atFrame,
        );
        full = activeAtFrame.length >= col.microColumns.length;
      } else {
        full = col.maxEvents != null && existing.length >= col.maxEvents;
      }

      const lastFrame = existing.length > 0
        ? existing[existing.length - 1].startFrame
        : -1;
      const beforePrev = col.requiresMonotonicOrder && atFrame < lastFrame;

      if (col.matchChannelIds && col.microColumns) {
        // Multi-channel stacking (inflictions): always allow adding (at 4 stacks,
        // adding more refreshes durations; 4th slot shows sequential bars)
        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: col.microColumns.map((mc) => ({
            label: `Add ${mc.label} at ${label}`,
            action: () => onAddEvent(col.ownerId, mc.id, atFrame, col.defaultEvent ?? null),
          })),
        });
      } else {
        // Single-channel stacking (MF)
        const disabled = full || beforePrev;
        const maxLabel = col.maxEvents ?? '?';
        const disabledLabel = full
          ? `${col.defaultEvent?.name ?? col.label} (${maxLabel}/${maxLabel} stacks)`
          : beforePrev
            ? `${col.defaultEvent?.name ?? col.label} (must be after stack ${existing.length})`
            : '';
        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: [{
            label: disabled
              ? disabledLabel
              : `Add ${col.defaultEvent?.name ?? col.label} at ${label}`,
            action: () => onAddEvent(col.ownerId, col.channelId, atFrame, col.defaultEvent ?? null),
            disabled,
          }],
        });
      }
    } else {
      // Simple single-channel mini-timeline (skill columns)
      const eventName = col.defaultEvent?.name ?? col.label;
      // Gate combo skill additions behind activation windows
      if (col.channelId === 'combo' && activationWindows) {
        const windows = activationWindows.get(col.ownerId) ?? [];
        const inWindow = windows.some((w) => atFrame >= w.startFrame && atFrame < w.endFrame);
        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: [{
            label: inWindow
              ? `Add ${eventName} at ${label}`
              : `${eventName} (no trigger active)`,
            action: () => onAddEvent(col.ownerId, col.channelId, atFrame, col.defaultEvent ?? null),
            disabled: !inWindow,
          }],
        });
      } else {
        onContextMenu({
          x: e.clientX, y: e.clientY,
          items: [{
            label: `Add ${eventName} at ${label}`,
            action: () => onAddEvent(col.ownerId, col.channelId, atFrame, col.defaultEvent ?? null),
          }],
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

    // Build "Add" items for stackable columns (by-order with matchChannelIds)
    const ev = events.find((ev) => ev.id === eventId);
    let addItems: import('../consts/viewTypes').ContextMenuItem[] = [];
    if (ev) {
      const col = columns.find((c) => {
        if (c.type !== 'mini-timeline' || !c.microColumns || c.microColumnAssignment !== 'by-order') return false;
        if (c.matchChannelIds) return c.ownerId === ev.ownerId && c.matchChannelIds.includes(ev.channelId);
        return c.ownerId === ev.ownerId && c.channelId === ev.channelId;
      }) as MiniTimeline | undefined;

      if (col?.matchChannelIds && col.microColumns) {
        addItems = col.microColumns.map((mc) => ({
          label: `Add ${mc.label} at ${label}`,
          action: () => onAddEvent(col.ownerId, mc.id, atFrame, col.defaultEvent ?? null),
        }));
      } else if (col) {
        // Single-channel stacking (MF)
        const matchSet = col.matchChannelIds ? new Set(col.matchChannelIds) : null;
        const existing = events.filter(
          (ev) => ev.ownerId === col.ownerId &&
            (matchSet ? matchSet.has(ev.channelId) : ev.channelId === col.channelId),
        );
        const full = col.maxEvents != null && existing.length >= col.maxEvents;
        const lastFrame = existing.length > 0 ? existing[existing.length - 1].startFrame : -1;
        const beforePrev = col.requiresMonotonicOrder && atFrame < lastFrame;
        const disabled = full || beforePrev;
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
          action: () => onAddEvent(col.ownerId, col.channelId, atFrame, col.defaultEvent ?? null),
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
      <div ref={scrollRef} className="timeline-scroll">
        <div
          className="timeline-grid"
          style={{
            gridTemplateColumns: gridCols,
            gridTemplateRows: `auto ${HEADER_HEIGHT}px auto`,
            width: totalW,
          }}
        >
          {/* ── Row 1: Loadout row ─────────────────────────────────── */}

          {/* Loadout corner */}
          <div ref={loadoutRef} className="tl-loadout-corner">
            <span className="corner-label">LOADOUT</span>
          </div>

          {/* Slot loadout cells */}
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

          {/* Enemy loadout cell */}
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

          {/* ── Row 2: Skill column headers ────────────────────────── */}

          {/* Corner */}
          <div className="tl-corner" style={{ top: loadoutRowHeight }}>
            <span className="corner-label">TIME</span>
          </div>

          {/* Header cells */}
          {columns.map((col) => (
            <div
              key={`hdr-${col.key}`}
              className={`tl-header-cell${col.type === 'mini-timeline' && col.headerVariant === 'infliction' ? ' enemy-header' : ''}${col.type === 'placeholder' ? ' tl-header-cell--empty' : ''}${col.type === 'mini-timeline' && col.headerVariant === 'mf' ? ' tl-header-cell--mf' : ''}`}
              style={{
                '--op-color': col.color,
                top: loadoutRowHeight,
              } as React.CSSProperties}
            >
              {col.type === 'mini-timeline' && col.headerVariant === 'skill' ? (
                <span className={`skill-badge skill-badge--vertical skill-badge--${col.channelId}`}>
                  {col.label}
                </span>
              ) : col.type === 'mini-timeline' && col.headerVariant === 'infliction' ? (
                <span
                  className="skill-badge skill-badge--vertical"
                  style={{ background: `${col.color}33`, color: col.color }}
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

          {/* ── Row 3: Timeline body ──────────────────────────── */}

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
            if (col.matchChannelIds) {
              const matchSet = new Set(col.matchChannelIds);
              colEvents = events.filter(
                (ev) => ev.ownerId === col.ownerId && matchSet.has(ev.channelId),
              );
            } else if (hasMicro && col.microColumnAssignment === 'by-channel-id') {
              const mcIds = new Set(col.microColumns!.map((mc) => mc.id));
              colEvents = events.filter(
                (ev) => ev.ownerId === col.ownerId && mcIds.has(ev.channelId),
              );
            } else {
              colEvents = events.filter(
                (ev) => ev.ownerId === col.ownerId && ev.channelId === col.channelId,
              );
            }

            const isMf = col.headerVariant === 'mf';
            const empowered = isMf && col.maxEvents != null && colEvents.length >= col.maxEvents;

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

                {/* Micro-column dividers */}
                {hasMicro && Array.from({ length: microCount - 1 }, (_, i) => (
                  <div
                    key={`mc-div-${i}`}
                    className="mf-micro-divider"
                    style={{ left: `${((i + 1) / microCount) * 100}%` }}
                  />
                ))}

                {/* Activation windows (combo skills) */}
                {col.channelId === 'combo' && activationWindows?.get(col.ownerId)?.map((win, i) => (
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
                    let microIdx: number;
                    let microColor: string;
                    if (col.microColumnAssignment === 'by-order') {
                      // Use greedy slot if available, else sequential
                      microIdx = greedySlotAssignments.get(ev.id) ?? Math.min(i, microCount - 1);
                      // Color by channelId match if multi-channel, else by position
                      const mcMatch = col.matchChannelIds
                        ? col.microColumns!.find((mc) => mc.id === ev.channelId)
                        : undefined;
                      microColor = mcMatch?.color ?? col.microColumns![microIdx].color;
                    } else {
                      microIdx = col.microColumns!.findIndex((mc) => mc.id === ev.channelId);
                      if (microIdx < 0) microIdx = 0;
                      microColor = col.microColumns![microIdx].color;
                    }
                    const microW = 100 / microCount;
                    return (
                      <div
                        key={ev.id}
                        className={`mf-micro-slot${empowered ? ' mf-micro-slot--empowered' : ''}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${microIdx * microW}%`,
                          width: `${microW}%`,
                        }}
                      >
                        <EventBlock
                          event={ev}
                          color={microColor}
                          zoom={zoom}
                          selected={selectedIds.has(ev.id)}
                          hovered={hoveredId === ev.id}
                          onDragStart={handleEventDragStart}
                          onContextMenu={handleEventContextMenu}
                          onDoubleClick={onEditEvent}
                          onSelect={handleEventSelect}
                          onHover={handleEventHover}
                          onTouchStart={handleEventTouchStart}
                        />
                      </div>
                    );
                  })
                ) : (
                  // Single-channel events
                  colEvents.map((ev) => (
                    <EventBlock
                      key={ev.id}
                      event={ev}
                      color={col.color}
                      zoom={zoom}
                      selected={selectedIds.has(ev.id)}
                      hovered={hoveredId === ev.id}
                      onDragStart={handleEventDragStart}
                      onContextMenu={handleEventContextMenu}
                      onDoubleClick={onEditEvent}
                      onSelect={handleEventSelect}
                      onHover={handleEventHover}
                      onTouchStart={handleEventTouchStart}
                    />
                  ))
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
          {hoverFrame !== null && (
            <span className="hover-line-label">
              <span className="hover-line-time">{frameToTimeLabelPrecise(hoverFrame)}</span>
              <span className="hover-line-frame">f{hoverFrame % 120}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
