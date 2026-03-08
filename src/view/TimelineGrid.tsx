import { useRef, useState, useCallback, useEffect } from 'react';
import EventBlock from './EventBlock';
import OperatorLoadoutHeader, { OperatorLoadoutState } from './OperatorLoadoutHeader';
import {
  pxPerFrame as getPxPerFrame,
  frameToPx,
  pxToFrame,
  timelineHeight,
  getTickMarks,
  frameToTimeLabel,
  frameToDetailLabel,
  TIME_AXIS_WIDTH,
  COL_WIDTH,
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

const MIN_SLOT_COLS = 2;

interface DragState {
  eventId: string;
  startMouseY: number;
  startFrame: number;
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
}: TimelineGridProps) {
  const scrollRef   = useRef<HTMLDivElement>(null);
  const outerRef    = useRef<HTMLDivElement>(null);
  const loadoutRef  = useRef<HTMLDivElement>(null);
  const dragRef     = useRef<DragState | null>(null);
  const zoomRef     = useRef(zoom);

  const [hoverClientY,     setHoverClientY]     = useState<number | null>(null);
  const [hoverFrame,       setHoverFrame]       = useState<number | null>(null);
  const [outerRect,        setOuterRect]        = useState<DOMRect | null>(null);
  const [loadoutRowHeight, setLoadoutRowHeight] = useState(0);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

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

  const numCols  = columns.length;
  const totalW   = TIME_AXIS_WIDTH + numCols * COL_WIDTH;
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

  // ─── Mouse move ─────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (scrollRef.current && outerRect) {
      const scrollTop = scrollRef.current.scrollTop;
      const relY = e.clientY - outerRect.top + scrollTop - combinedHeaderHeight;
      if (relY > 0) {
        const frame = pxToFrame(relY, zoomRef.current);
        setHoverFrame(frame);
        const snappedRelY = frameToPx(frame, zoomRef.current);
        setHoverClientY(snappedRelY - scrollTop + outerRect.top + combinedHeaderHeight);
      } else {
        setHoverFrame(null);
        setHoverClientY(null);
      }
    }

    if (dragRef.current) {
      const { eventId, startMouseY, startFrame } = dragRef.current;
      const deltaFrames = Math.round(
        (e.clientY - startMouseY) / getPxPerFrame(zoomRef.current)
      );
      const newFrame = Math.max(0, Math.min(TOTAL_FRAMES - 1, startFrame + deltaFrames));
      onMoveEvent(eventId, newFrame);
    }
  }, [outerRect, onMoveEvent, combinedHeaderHeight]);

  const handleMouseLeave = useCallback(() => {
    setHoverClientY(null);
    setHoverFrame(null);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ─── Drag start ─────────────────────────────────────────────────────────────
  const handleEventDragStart = useCallback((
    e: React.MouseEvent,
    eventId: string,
    startFrame: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { eventId, startMouseY: e.clientY, startFrame };
  }, []);

  // ─── Right-click on empty column ────────────────────────────────────────────
  const handleSubTimelineContextMenu = useCallback((
    e: React.MouseEvent,
    col: Column,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relY    = e.clientY - rect.top + scrollTop - HEADER_HEIGHT;
    const atFrame = pxToFrame(Math.max(0, relY), zoomRef.current);
    const label   = frameToDetailLabel(atFrame);

    if (col.type === 'skill') {
      onContextMenu({
        x: e.clientX, y: e.clientY,
        items: [{
          label: `Add event at ${label}`,
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
            gridTemplateColumns: `${TIME_AXIS_WIDTH}px repeat(${numCols}, ${COL_WIDTH}px)`,
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

          {/* Enemy loadout placeholder */}
          {enemyColCount > 0 && (
            <div
              className="tl-loadout-cell tl-loadout-cell--enemy"
              style={{ gridColumn: `${colIdx} / span ${enemyColCount}` }}
            >
              <div className="lo-cell">
                <div className="lo-name" style={{ color: '#cc4444' }}>ENEMY</div>
              </div>
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
                <>
                  <div className="hdr-skill-row">
                    <span className={`skill-badge skill-badge--${col.channelId}`}>
                      {SKILL_LABELS[col.channelId]}
                    </span>
                    <span className="hdr-skill-name">{col.skill.name}</span>
                  </div>
                  {col.skill.triggerCondition && (
                    <div className="hdr-trigger">{col.skill.triggerCondition}</div>
                  )}
                </>
              ) : col.type === 'status' ? (
                <div className="hdr-skill-row">
                  <span
                    className="skill-badge"
                    style={{ background: `${col.color}33`, color: col.color }}
                  >
                    {col.label}
                  </span>
                </div>
              ) : null}
              {col.type === 'skill' && (
                <button
                  className="hdr-toggle-btn"
                  onClick={() => onToggleSkill(col.ownerId, col.channelId)}
                  title="Hide column"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {/* ── Row 3: Timeline body ──────────────────────────── */}

          {/* Time axis */}
          <div className="tl-time-axis" style={{ height: tlHeight }}>
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
                    onDragStart={handleEventDragStart}
                    onContextMenu={handleEventContextMenu}
                    onDoubleClick={onEditEvent}
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
      </div>

      {/* Hover line */}
      {showHoverLine && outerRect && (
        <div
          className="hover-line"
          style={{ top: hoverClientY!, left: outerRect.left, width: outerRect.width }}
        >
          {hoverFrame !== null && (
            <span className="hover-line-label">{frameToDetailLabel(hoverFrame)}</span>
          )}
        </div>
      )}
    </div>
  );
}
