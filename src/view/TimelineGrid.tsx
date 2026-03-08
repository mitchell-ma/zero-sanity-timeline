import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import EventBlock from './EventBlock';
import OperatorLoadoutHeader, { OperatorLoadoutState, DropdownTierBar } from './OperatorLoadoutHeader';
import { ENEMY_TIERS } from '../utils/enemies';
import {
  pxPerFrame as getPxPerFrame,
  frameToPx,
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
} from "../consts/viewTypes";

const MIN_SLOT_COLS = 4;

// Minimum loadout width derived from icon layout:
// Row 1: 5 icons × 28px + 4 gaps × 3px + 2 × 6px padding = 164px
// Row 2: 2 icons × 28px + 1 gap × 3px = 59px (narrower, not constraining)
const LOADOUT_MIN_WIDTH = 164;

interface DragState {
  eventId: string;
  startMouseY: number;
  startFrame: number;
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
  onEditEvent: (id: string) => void;
  onRemoveEvent: (id: string) => void;
  onLoadoutChange: (slotId: string, state: OperatorLoadoutState) => void;
  onEditLoadout: (slotId: string) => void;
  allOperators?: Operator[];
  onSwapOperator?: (slotId: string, newOperatorId: string | null) => void;
  allEnemies?: Enemy[];
  onSwapEnemy?: (enemyId: string) => void;
}

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
    const handle = (e: MouseEvent) => {
      if (
        enemyNameRef.current && !enemyNameRef.current.contains(e.target as Node) &&
        enemyMenuRef.current && !enemyMenuRef.current.contains(e.target as Node)
      ) {
        setEnemyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
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
    let slotHasCols = false;
    if (op) {
      for (const skillType of SKILL_ORDER) {
        if (visibleSkills[slot.slotId]?.[skillType]) {
          columns.push({
            key: `${slot.slotId}-${skillType}`,
            type: 'skill',
            ownerId: slot.slotId,
            channelId: skillType,
            operator: op,
            skill: op.skills[skillType],
            color: op.color,
          });
          slotHasCols = true;
        }
      }
    }
    // Every slot gets at least MIN_SLOT_COLS columns so the loadout row stays visible
    const needed = MIN_SLOT_COLS - (slotHasCols
      ? SKILL_ORDER.filter((st) => visibleSkills[slot.slotId]?.[st]).length
      : 0);
    for (let p = 0; p < needed; p++) {
      columns.push({
        key: `${slot.slotId}-placeholder${p}`,
        type: 'placeholder',
        ownerId: slot.slotId,
        color: op?.color ?? '#666',
      });
    }
  }
  for (const status of enemy.statuses) {
    columns.push({
      key: `enemy-${status.id}`,
      type: 'status',
      ownerId: 'enemy',
      channelId: status.id,
      status,
      color: status.color,
      label: status.label,
    });
  }

  // ─── Compute slot groups for loadout row ──────────────────────────────────
  const slotGroups: SlotGroup[] = [];
  let colIdx = 2; // 1-indexed grid column (col 1 = time axis)
  for (const slot of slots) {
    const op = slot.operator;
    const skillCount = op
      ? SKILL_ORDER.filter((st) => visibleSkills[slot.slotId]?.[st]).length
      : 0;
    const count = Math.max(MIN_SLOT_COLS, skillCount);
    slotGroups.push({ slot, columnCount: count, startCol: colIdx });
    colIdx += count;
  }
  const enemyColCount = enemy.statuses.length;

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
  useEffect(() => {
    const el = loadoutRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setLoadoutRowHeight(entry.contentRect.height);
      }
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

  // ─── Wheel: alt = zoom, else native ────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.altKey) {
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

  // ─── Marquee intersection helper ────────────────────────────────────────────
  const getEventsInRect = useCallback((rect: { left: number; top: number; right: number; bottom: number }) => {
    const bodyTop = bodyTopRef.current ?? 0;
    const ids = new Set<string>();
    for (const ev of events) {
      const colKey = `${ev.ownerId}-${ev.channelId}`;
      const colPos = columnPositions.get(colKey);
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
  }, [events, columnPositions]);

  // ─── Event hover ──────────────────────────────────────────────────────────────
  const handleEventHover = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  // ─── Event select (click) ─────────────────────────────────────────────────────
  const handleEventSelect = useCallback((e: React.MouseEvent, eventId: string) => {
    if (dragMovedRef.current) return;
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(eventId)) next.delete(eventId);
        else next.add(eventId);
        return next;
      });
    } else {
      setSelectedIds(new Set([eventId]));
    }
  }, []);

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

    // Event drag
    if (dragRef.current) {
      dragMovedRef.current = true;
      const { eventId, startMouseY, startFrame } = dragRef.current;
      const deltaFrames = Math.round(
        (e.clientY - startMouseY) / getPxPerFrame(zoomRef.current)
      );
      const newFrame = Math.max(0, Math.min(TOTAL_FRAMES - 1, startFrame + deltaFrames));
      onMoveEvent(eventId, newFrame);

      if (scrollRef.current && outerRect && bodyTopRef.current !== null) {
        const scrollTop = scrollRef.current.scrollTop;
        const bodyTop = bodyTopRef.current;
        const snappedRelY = frameToPx(newFrame, zoomRef.current);
        setHoverFrame(newFrame);
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
      if (marqueeRef.current.ctrlKey) {
        const combined = new Set(marqueeRef.current.priorSelection);
        marqueeIds.forEach((id) => combined.add(id));
        setSelectedIds(combined);
      } else {
        setSelectedIds(marqueeIds);
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
      requestAnimationFrame(() => { dragMovedRef.current = false; });
    }
    if (marqueeRef.current) {
      marqueeRef.current = null;
      setMarqueeRect(null);
    }
  }, []);

  // ─── Drag start (event move) ──────────────────────────────────────────────────
  const handleEventDragStart = useCallback((
    e: React.MouseEvent,
    eventId: string,
    startFrame: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    dragMovedRef.current = false;
    dragRef.current = { eventId, startMouseY: e.clientY, startFrame };
  }, []);

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

    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect || bodyTopRef.current === null) return;

    const relY    = e.clientY - rect.top + scrollTop - bodyTopRef.current;
    const atFrame = pxToFrame(Math.max(0, relY), zoomRef.current);
    const label   = frameToDetailLabel(atFrame);

    if (col.type === 'skill') {
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [{
          label: `Add ${col.skill.name} at ${label}`,
          action: () => onAddEvent(col.ownerId, col.channelId, atFrame, col.skill),
        }],
      });
    } else if (col.type === 'status') {
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [{
          label: `Add ${col.label} at ${label}`,
          action: () => onAddEvent(col.ownerId, col.channelId, atFrame, null),
        }],
      });
    }
  }, [onAddEvent, onContextMenu]);

  // ─── Right-click on event ────────────────────────────────────────────────────
  const handleEventContextMenu = useCallback((
    e: React.MouseEvent,
    eventId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Edit Event',   action: () => { onEditEvent(eventId); onContextMenu(null); } },
        { separator: true },
        { label: 'Remove Event', action: () => onRemoveEvent(eventId), danger: true },
      ],
    });
  }, [onEditEvent, onRemoveEvent, onContextMenu]);

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
              className={`tl-header-cell${col.type === 'status' ? ' enemy-header' : ''}${col.type === 'placeholder' ? ' tl-header-cell--empty' : ''}`}
              style={{
                '--op-color': col.color,
                top: loadoutRowHeight,
              } as React.CSSProperties}
            >
              {col.type === 'skill' ? (
                <span className={`skill-badge skill-badge--vertical skill-badge--${col.channelId}`}>
                  {SKILL_LABELS[col.channelId]}
                </span>
              ) : col.type === 'status' ? (
                <span
                  className="skill-badge skill-badge--vertical"
                  style={{ background: `${col.color}33`, color: col.color }}
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
            const colEvents = events.filter(
              (ev) => ev.ownerId === col.ownerId && ev.channelId === col.channelId,
            );
            return (
              <div
                key={`col-${col.key}`}
                className="tl-sub-timeline"
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

                {colEvents.map((ev) => (
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
                  />
                ))}

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
