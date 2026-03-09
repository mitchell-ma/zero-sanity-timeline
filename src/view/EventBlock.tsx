import React from 'react';
import { frameToPx, durationToPx, TOTAL_FRAMES } from '../utils/timeline';
import { TimelineEvent } from "../consts/viewTypes";

interface EventBlockProps {
  event: TimelineEvent;
  color: string;
  zoom: number;
  selected?: boolean;
  hovered?: boolean;
  /** Display name shown on the event block. */
  label?: string;
  /** "ultimate" renders Activation → Active → Cooldown. "sequenced" renders multi-sequence segments with frame diamonds. */
  variant?: "default" | "ultimate" | "sequenced";
  onDragStart: (e: React.MouseEvent, eventId: string, startFrame: number) => void;
  onContextMenu: (e: React.MouseEvent, eventId: string) => void;
  onSelect?: (e: React.MouseEvent, eventId: string) => void;
  onHover?: (eventId: string | null) => void;
  onTouchStart?: (e: React.TouchEvent, eventId: string, startFrame: number) => void;
  onFrameClick?: (eventId: string, segmentIndex: number, frameIndex: number) => void;
  /** Currently selected frame (segment + frame index) for highlight. */
  selectedFrame?: { segmentIndex: number; frameIndex: number } | null;
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
  label,
  variant = "default",
  onDragStart,
  onContextMenu,
  onSelect,
  onHover,
  onTouchStart,
  onFrameClick,
  selectedFrame,
}: EventBlockProps) {
  const { id, startFrame, activationDuration, activeDuration, cooldownDuration, segments } = event;

  // ── Sequenced variant (multi-sequence with frame diamonds) ──────────────
  if (variant === 'sequenced' && segments && segments.length > 0) {
    const totalFrames = segments.reduce((sum, s) => sum + s.durationFrames, 0);
    const clampedEnd = Math.min(startFrame + totalFrames, TOTAL_FRAMES);
    const topPx = frameToPx(startFrame, zoom);
    const totalHeight = durationToPx(clampedEnd - startFrame, zoom);

    if (totalHeight <= 0) return null;

    const wrapClass = `event-wrap${selected ? ' event-wrap--selected' : ''}${hovered && !selected ? ' event-wrap--hovered' : ''}`;

    let offsetFrames = 0;
    const segmentElements: React.ReactNode[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segStartFrame = startFrame + offsetFrames;
      const segEndFrame = Math.min(segStartFrame + seg.durationFrames, TOTAL_FRAMES);
      const segH = durationToPx(segEndFrame - segStartFrame, zoom);

      if (segH <= 0) { offsetFrames += seg.durationFrames; continue; }

      const segTopPx = durationToPx(offsetFrames, zoom);
      const isFirst = i === 0;
      const isLast = i === segments.length - 1;
      const alpha = 0.55 + (i % 2) * 0.15;
      const borderRadius = isFirst && isLast ? '2px'
        : isFirst ? '2px 2px 0 0'
        : isLast ? '0 0 2px 2px'
        : '0';

      segmentElements.push(
        <div
          key={`seg-${i}`}
          className="event-segment event-segment--sequenced"
          style={{
            top: segTopPx,
            height: segH,
            background: hexAlpha(color, alpha),
            border: `1px solid ${hexAlpha(color, alpha + 0.15)}`,
            borderTop: isFirst ? undefined : `1px dashed ${hexAlpha(color, 0.5)}`,
            borderRadius,
            padding: 0,
            margin: 0,
          }}
        >
          {segH > 14 && (seg.label || (isFirst && label)) && (
            <span className="event-block-label" style={{ color: '#fff' }}>{seg.label ?? label}</span>
          )}
          {/* Frame diamonds */}
          {seg.frames?.map((f, fi) => {
            const framePx = durationToPx(f.offsetFrame, zoom);
            const isSelected = selectedFrame?.segmentIndex === i && selectedFrame?.frameIndex === fi;
            return (
              <div
                key={`f-${fi}`}
                className={`event-frame-diamond${isSelected ? ' event-frame-diamond--selected' : ''}`}
                style={{ top: framePx }}
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); onFrameClick?.(id, i, fi); }}
                onMouseOver={(e) => { e.stopPropagation(); onHover?.(null); }}
                onMouseOut={(e) => { e.stopPropagation(); }}
              />
            );
          })}
        </div>,
      );

      offsetFrames += seg.durationFrames;
    }

    return (
      <div
        className={wrapClass}
        data-event-id={id}
        style={{ top: topPx, height: totalHeight }}
        onContextMenu={(e) => onContextMenu(e, id)}
        onMouseDown={(e) => {
          if (e.button === 0) { e.stopPropagation(); onDragStart(e, id, startFrame); }
        }}
        onClick={(e) => onSelect?.(e, id)}
        onMouseOver={() => onHover?.(id)}
        onMouseOut={() => onHover?.(null)}
        onTouchStart={(e) => onTouchStart?.(e, id, startFrame)}
      >
        {segmentElements}
      </div>
    );
  }

  // ── Standard 3-phase layout (default / ultimate) ────────────────────────
  const hasLinger   = activeDuration > 0;
  const hasCooldown = cooldownDuration > 0;

  const lingerStart = startFrame + activationDuration;
  const coolStart   = lingerStart + activeDuration;
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
      data-event-id={id}
      style={{ top: topPx, height: totalHeight }}
      onContextMenu={(e) => onContextMenu(e, id)}
      onMouseDown={(e) => {
        if (e.button === 0) e.stopPropagation();
        if (variant === 'ultimate' && e.button === 0) onDragStart(e, id, startFrame);
      }}
      onClick={(e) => onSelect?.(e, id)}
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
      onTouchStart={(e) => onTouchStart?.(e, id, startFrame)}
    >
      {/* Active segment */}
      {activeH > 0 && (
        <div
          className="event-segment"
          style={variant === 'ultimate' ? {
            top: 0,
            height: activeH,
            background: hexAlpha(color, 0.55),
            border: `1px solid ${hexAlpha(color, 0.75)}`,
            borderBottom: hasLinger ? `1px dashed ${hexAlpha(color, 0.75)}` : undefined,
            borderRadius: activeRadius,
          } : {
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
            <span className="event-block-label" style={{ color: '#fff' }}>
              {variant === 'ultimate' ? 'Activation' : (label ?? 'ACT')}
            </span>
          )}
        </div>
      )}

      {/* Lingering / Active phase segment */}
      {hasLinger && lingerH > 0 && (
        <div
          className="event-segment"
          style={variant === 'ultimate' ? {
            top: activeH,
            height: lingerH,
            background: hexAlpha(color, 0.80),
            border: `1px solid ${hexAlpha(color, 0.95)}`,
            boxShadow: `0 0 6px ${hexAlpha(color, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.12)`,
            borderTop: `1px dashed ${hexAlpha(color, 0.95)}`,
            borderBottom: hasCooldown ? 'none' : `1px solid ${hexAlpha(color, 0.95)}`,
            borderRadius: lingerRadius,
          } : {
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
            <span className="event-block-label" style={{ color: variant === 'ultimate' ? '#fff' : hexAlpha(color, 0.9) }}>
              {variant === 'ultimate' ? 'Active' : 'LNG'}
            </span>
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
            <span className="event-block-label" style={{ color: 'rgba(120,150,180,0.7)' }}>Cooldown</span>
          )}
        </div>
      )}
    </div>
  );
}
