import { useRef, useState, useCallback, useEffect } from 'react';
import EventBlock from './EventBlock';
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
import { SKILL_TYPES, SKILL_LABELS } from '../utils/operators';

export default function TimelineGrid({
  operators,
  enemy,
  events,
  visibleSkills,
  zoom,
  onZoom,
  onToggleSkill,
  onAddEvent,
  onMoveEvent,
  onContextMenu,
  onEditEvent,
  onRemoveEvent,
}) {
  const scrollRef      = useRef(null);
  const outerRef       = useRef(null);
  const dragRef        = useRef(null);
  const zoomRef        = useRef(zoom);

  const [hoverClientY, setHoverClientY]   = useState(null);
  const [hoverFrame, setHoverFrame]       = useState(null);
  const [outerRect, setOuterRect]         = useState(null);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // ─── Build ordered column descriptors ──────────────────────────────────────
  const columns = [];
  for (const op of operators) {
    for (const skillType of [SKILL_TYPES.BASIC, SKILL_TYPES.BATTLE, SKILL_TYPES.COMBO, SKILL_TYPES.ULTIMATE]) {
      if (visibleSkills[op.id]?.[skillType]) {
        columns.push({
          key: `${op.id}-${skillType}`,
          type: 'skill',
          ownerId: op.id,
          channelId: skillType,
          operator: op,
          skill: op.skills[skillType],
          color: op.color,
        });
      }
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

  const numCols   = columns.length;
  const totalW    = TIME_AXIS_WIDTH + numCols * COL_WIDTH;
  const tlHeight  = timelineHeight(zoom);
  const ticks     = getTickMarks(zoom);

  // ─── Outer rect tracking ───────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      if (outerRef.current) setOuterRect(outerRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ─── Wheel: alt = zoom, else native ───────────────────────────────────────
  const handleWheel = useCallback((e) => {
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

  // ─── Mouse move: hover line + drag ────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    setHoverClientY(e.clientY);

    // Compute hover frame for label
    if (scrollRef.current && outerRect) {
      const scrollTop = scrollRef.current.scrollTop;
      const relY = e.clientY - outerRect.top + scrollTop - HEADER_HEIGHT;
      setHoverFrame(relY > 0 ? pxToFrame(relY, zoomRef.current) : null);
    }

    // Drag
    if (dragRef.current) {
      const { eventId, startMouseY, startFrame } = dragRef.current;
      const deltaY = e.clientY - startMouseY;
      const deltaFrames = Math.round(deltaY / getPxPerFrame(zoomRef.current));
      const newFrame = Math.max(0, Math.min(TOTAL_FRAMES - 1, startFrame + deltaFrames));
      onMoveEvent(eventId, newFrame);
    }
  }, [outerRect, onMoveEvent]);

  const handleMouseLeave = useCallback(() => {
    setHoverClientY(null);
    setHoverFrame(null);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ─── Drag start (called by EventBlock) ────────────────────────────────────
  const handleEventDragStart = useCallback((e, eventId, startFrame) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { eventId, startMouseY: e.clientY, startFrame };
  }, []);

  // ─── Right-click on empty column area ─────────────────────────────────────
  const handleSubTimelineContextMenu = useCallback((e, col) => {
    e.preventDefault();
    e.stopPropagation();

    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relY = e.clientY - rect.top + scrollTop - HEADER_HEIGHT;
    const atFrame = pxToFrame(Math.max(0, relY), zoomRef.current);
    const timeLabel = frameToDetailLabel(atFrame);

    let items;
    if (col.type === 'skill') {
      items = [
        {
          label: `Add event at ${timeLabel}`,
          action: () => onAddEvent(col.ownerId, col.channelId, atFrame, col.skill),
        },
      ];
    } else {
      items = [
        {
          label: `Add ${col.label} at ${timeLabel}`,
          action: () => onAddEvent(col.ownerId, col.channelId, atFrame, null),
        },
      ];
    }

    onContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [onAddEvent, onContextMenu]);

  // ─── Right-click on event ──────────────────────────────────────────────────
  const handleEventContextMenu = useCallback((e, eventId) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Edit Event', action: () => { onEditEvent(eventId); onContextMenu(null); } },
        { separator: true },
        { label: 'Remove Event', action: () => onRemoveEvent(eventId), danger: true },
      ],
    });
  }, [onEditEvent, onRemoveEvent, onContextMenu]);

  // ─── Hover line visibility ─────────────────────────────────────────────────
  const showHoverLine = hoverClientY !== null && outerRect &&
    hoverClientY > outerRect.top + HEADER_HEIGHT &&
    hoverClientY < outerRect.bottom;

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
            width: totalW,
          }}
        >
          {/* ── Corner cell ─────────────────────────────────────────────── */}
          <div className="tl-corner">
            <span className="corner-label">TIME</span>
          </div>

          {/* ── Header cells ─────────────────────────────────────────────── */}
          {columns.map((col) => (
            <div
              key={`hdr-${col.key}`}
              className={`tl-header-cell${col.type === 'status' ? ' enemy-header' : ''}`}
              style={{ '--op-color': col.color }}
            >
              {col.type === 'skill' ? (
                <>
                  <div className="hdr-op-name" style={{ color: col.operator.color }}>
                    {col.operator.name}
                  </div>
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
              ) : (
                <>
                  <div className="hdr-op-name" style={{ color: '#cc4444' }}>ENEMY</div>
                  <div className="hdr-skill-row">
                    <span className="skill-badge" style={{ background: `${col.color}33`, color: col.color }}>
                      {col.label}
                    </span>
                  </div>
                </>
              )}
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

          {/* ── Time axis ────────────────────────────────────────────────── */}
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

          {/* ── Sub-timeline columns ─────────────────────────────────────── */}
          {columns.map((col) => {
            const colEvents = events.filter(
              (ev) => ev.ownerId === col.ownerId && ev.channelId === col.channelId
            );
            return (
              <div
                key={`col-${col.key}`}
                className="tl-sub-timeline"
                style={{ height: tlHeight }}
                onContextMenu={(e) => handleSubTimelineContextMenu(e, col)}
              >
                {/* Gridlines */}
                {ticks
                  .filter((t) => t.major)
                  .map((tick) => (
                    <div
                      key={tick.frame}
                      className="tl-gridline"
                      style={{ top: frameToPx(tick.frame, zoom) }}
                    />
                  ))}

                {/* Events */}
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

                {/* Empty state hint for first visible col */}
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

      {/* ── Hover guide line ──────────────────────────────────────────────── */}
      {showHoverLine && (
        <div
          className="hover-line"
          style={{
            top: hoverClientY,
            left: outerRect.left,
            width: outerRect.width,
          }}
        >
          {hoverFrame !== null && (
            <span className="hover-line-label">
              {frameToDetailLabel(hoverFrame)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
