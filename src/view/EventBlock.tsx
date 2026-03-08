import React from 'react';
import { frameToPx, durationToPx, TOTAL_FRAMES } from '../utils/timeline';
import { TimelineEvent } from "../consts/viewTypes";

interface EventBlockProps {
  event: TimelineEvent;
  color: string;
  zoom: number;
  selected?: boolean;
  hovered?: boolean;
  onDragStart: (e: React.MouseEvent, eventId: string, startFrame: number) => void;
  onContextMenu: (e: React.MouseEvent, eventId: string) => void;
  onDoubleClick: (eventId: string) => void;
  onSelect?: (e: React.MouseEvent, eventId: string) => void;
  onHover?: (eventId: string | null) => void;
}

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function stripedBg(color: string): string {
  return `repeating-linear-gradient(
    -45deg,
    ${hexAlpha(color, 0.18)} 0px,
    ${hexAlpha(color, 0.18)} 2px,
    transparent 2px,
    transparent 8px
  )`;
}

export default function EventBlock({
  event,
  color,
  zoom,
  selected = false,
  hovered = false,
  onDragStart,
  onContextMenu,
  onDoubleClick,
  onSelect,
  onHover,
}: EventBlockProps) {
  const { id, startFrame, activeDuration, lingeringDuration, cooldownDuration } = event;

  const hasLinger   = lingeringDuration > 0;
  const hasCooldown = cooldownDuration > 0;

  const lingerStart = startFrame + activeDuration;
  const coolStart   = lingerStart + lingeringDuration;
  const totalEnd    = coolStart + cooldownDuration;

  const clampedActiveEnd = Math.min(lingerStart, TOTAL_FRAMES);
  const clampedLingerEnd = Math.min(coolStart,   TOTAL_FRAMES);
  const clampedCoolEnd   = Math.min(totalEnd,    TOTAL_FRAMES);

  const activeH = durationToPx(clampedActiveEnd - startFrame, zoom);
  const lingerH = hasLinger   ? durationToPx(clampedLingerEnd - lingerStart, zoom) : 0;
  const coolH   = hasCooldown ? durationToPx(clampedCoolEnd   - coolStart,   zoom) : 0;

  const topPx      = frameToPx(startFrame, zoom);
  const totalHeight = durationToPx(clampedCoolEnd - startFrame, zoom);

  if (activeH <= 0 && lingerH <= 0) return null;

  const activeRadius = !hasLinger && !hasCooldown ? '2px' : '2px 2px 0 0';
  const lingerRadius = !hasCooldown ? '0 0 2px 2px' : '0';

  const wrapClass = `event-wrap${selected ? ' event-wrap--selected' : ''}${hovered && !selected ? ' event-wrap--hovered' : ''}`;

  return (
    <div
      className={wrapClass}
      style={{ top: topPx, height: totalHeight }}
      onContextMenu={(e) => onContextMenu(e, id)}
      onDoubleClick={() => onDoubleClick(id)}
      onMouseDown={(e) => { if (e.button === 0) e.stopPropagation(); }}
      onClick={(e) => onSelect?.(e, id)}
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Active segment */}
      {activeH > 0 && (
        <div
          className="event-segment"
          style={{
            top: 0,
            height: activeH,
            background: hexAlpha(color, 0.80),
            border: `1px solid ${hexAlpha(color, 0.95)}`,
            boxShadow: `0 0 6px ${hexAlpha(color, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.12)`,
            borderRadius: activeRadius,
          }}
          onMouseDown={(e) => onDragStart(e, id, startFrame)}
        >
          {activeH > 14 && (
            <span className="event-block-label" style={{ color: '#fff' }}>ACT</span>
          )}
        </div>
      )}

      {/* Lingering segment */}
      {hasLinger && lingerH > 0 && (
        <div
          className="event-segment"
          style={{
            top: activeH,
            height: lingerH,
            background: hexAlpha(color, 0.28),
            borderLeft:   `1px solid ${hexAlpha(color, 0.55)}`,
            borderRight:  `1px solid ${hexAlpha(color, 0.55)}`,
            borderTop:    `1px dashed ${hexAlpha(color, 0.55)}`,
            borderBottom: hasCooldown ? 'none' : `1px solid ${hexAlpha(color, 0.55)}`,
            borderRadius: lingerRadius,
          }}
        >
          {lingerH > 14 && (
            <span className="event-block-label" style={{ color: hexAlpha(color, 0.9) }}>LNG</span>
          )}
        </div>
      )}

      {/* Cooldown segment */}
      {hasCooldown && coolH > 0 && (
        <div
          className="event-segment"
          style={{
            top: activeH + lingerH,
            height: coolH,
            background: stripedBg(color),
            border: '1px solid rgba(80,100,140,0.3)',
            borderTop: 'none',
            borderRadius: '0 0 2px 2px',
          }}
        >
          {coolH > 14 && (
            <span className="event-block-label" style={{ color: 'rgba(120,150,180,0.7)' }}>CD</span>
          )}
        </div>
      )}
    </div>
  );
}
