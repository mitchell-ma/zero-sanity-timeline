import React from 'react';
import { frameToPx, durationToPx, TOTAL_FRAMES } from '../utils/timeline';
import { TimelineEvent, EventFrameMarker } from "../consts/viewTypes";
import { ELEMENT_COLORS, ElementType, STATUS_ELEMENT } from '../consts/enums';

function getFrameElementColor(f: EventFrameMarker): string | undefined {
  const el = f.applyArtsInfliction?.element
    ?? f.absorbArtsInfliction?.element
    ?? f.consumeArtsInfliction?.element
    ?? (f.applyForcedReaction ? STATUS_ELEMENT[f.applyForcedReaction.reaction] : undefined)
    ?? (f.applyStatus ? STATUS_ELEMENT[f.applyStatus.status] : undefined);
  return el ? ELEMENT_COLORS[el as ElementType] : undefined;
}

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
  onFrameContextMenu?: (e: React.MouseEvent, eventId: string, segmentIndex: number, frameIndex: number) => void;
  onFrameDragStart?: (e: React.MouseEvent, eventId: string, segmentIndex: number, frameIndex: number) => void;
  onSegmentContextMenu?: (e: React.MouseEvent, eventId: string, segmentIndex: number) => void;
  /** Currently selected frames for highlight. */
  selectedFrames?: { segmentIndex: number; frameIndex: number }[];
  /** If true, event cannot be dragged — shows pointer cursor instead of grab. */
  notDraggable?: boolean;
  /** Full ordered segment labels from the column definition (for contiguity validation). */
  allSegmentLabels?: string[];
  /** Full default segments from the column definition (for frame contiguity validation). */
  allDefaultSegments?: import('../consts/viewTypes').EventSegmentData[];
  /** Current hover-line frame (absolute). Diamonds at this frame get hover-selected styling. */
  hoverFrame?: number | null;
  /** If true, use diagonal stripe pattern for the active segment (e.g. combo trigger). */
  striped?: boolean;
  /** If set, shows a warning overlay on top of the event (e.g. combo outside trigger window). */
  comboWarning?: string | null;
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

function EventBlock({
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
  onFrameContextMenu,
  onFrameDragStart,
  onSegmentContextMenu,
  selectedFrames,
  notDraggable = false,
  allSegmentLabels,
  allDefaultSegments,
  hoverFrame: hoverFrameProp,
  striped = false,
  comboWarning = null,
}: EventBlockProps) {
  const { id, startFrame, activationDuration, activeDuration, cooldownDuration, segments, animationDuration } = event;

  // ── Sequenced variant (multi-sequence with frame diamonds) ──────────────
  if (variant === 'sequenced' && segments && segments.length > 0) {
    const totalFrames = segments.reduce((sum, s) => sum + s.durationFrames, 0);
    const clampedEnd = Math.min(startFrame + totalFrames, TOTAL_FRAMES);
    const topPx = frameToPx(startFrame, zoom);
    const totalHeight = durationToPx(clampedEnd - startFrame, zoom);

    if (totalHeight <= 0) return null;

    // Validation: collect warnings for non-contiguous segments and frames
    const warnings: string[] = [];
    if (allSegmentLabels && allSegmentLabels.length > 1 && segments.length < allSegmentLabels.length) {
      const presentLabels = new Set(segments.map((s) => s.label));
      const indices = allSegmentLabels
        .map((l, i) => presentLabels.has(l) ? i : -1)
        .filter((i) => i >= 0);
      for (let j = 1; j < indices.length; j++) {
        if (indices[j] !== indices[j - 1] + 1) {
          const missingLabels = allSegmentLabels.filter((l) => !presentLabels.has(l));
          warnings.push(`Non-contiguous sequences (missing: ${missingLabels.join(', ')})`);
          break;
        }
      }
    }
    // Frame contiguity per segment
    if (allDefaultSegments) {
      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        const defaultSeg = allDefaultSegments.find((ds) => ds.label === seg.label) ?? allDefaultSegments[si];
        const allFrameOffsets = defaultSeg?.frames?.map((f) => f.offsetFrame) ?? [];
        const presentOffsets = new Set((seg.frames ?? []).map((f) => f.offsetFrame));
        if (allFrameOffsets.length > 0 && presentOffsets.size < allFrameOffsets.length) {
          const presentIndices = allFrameOffsets
            .map((o, i) => presentOffsets.has(o) ? i : -1)
            .filter((i) => i >= 0);
          for (let j = 1; j < presentIndices.length; j++) {
            if (presentIndices[j] !== presentIndices[j - 1] + 1) {
              const missingNums = allFrameOffsets
                .map((o, i) => presentOffsets.has(o) ? null : i + 1)
                .filter((n) => n !== null);
              warnings.push(`Sequence ${seg.label ?? si + 1}: non-contiguous frames (missing: ${missingNums.join(', ')})`);
              break;
            }
          }
        }
      }
    }

    const wrapClass = `event-wrap${notDraggable ? ' event-wrap--static' : ''}${selected ? ' event-wrap--selected' : ''}${hovered && !selected ? ' event-wrap--hovered' : ''}`;

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
          onContextMenu={segments.length > 1 ? (e) => { e.preventDefault(); e.stopPropagation(); onSegmentContextMenu?.(e, id, i); } : undefined}
        >
          {segH > 14 && (seg.label || (isFirst && label)) && (
            <span className="event-block-label" style={{ color: '#fff' }}>{seg.label ?? label}</span>
          )}
          {/* Frame diamonds */}
          {seg.frames?.map((f, fi) => {
            const framePx = durationToPx(f.offsetFrame, zoom);
            const isSelected = selectedFrames?.some((sf) => sf.segmentIndex === i && sf.frameIndex === fi) ?? false;
            const isHoverHighlight = !isSelected && hoverFrameProp != null &&
              Math.abs(durationToPx(hoverFrameProp - (startFrame + offsetFrames + f.offsetFrame), zoom)) <= 4;
            const elColor = getFrameElementColor(f);
            return (
              <div
                key={`f-${fi}`}
                className={`event-frame-diamond${isSelected ? ' event-frame-diamond--selected' : ''}${isHoverHighlight ? ' event-frame-diamond--hover-hit' : ''}${f.isFinalStrike ? ' event-frame-diamond--final-strike' : ''}`}
                style={{ top: framePx, ...(elColor && !isSelected && !isHoverHighlight ? { background: elColor, boxShadow: `0 0 3px ${elColor}80` } : {}) }}
                onMouseDown={(e) => { e.stopPropagation(); if (e.button === 0) onFrameDragStart?.(e, id, i, fi); }}
                onClick={(e) => { e.stopPropagation(); onFrameClick?.(id, i, fi); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onFrameContextMenu?.(e, id, i, fi); }}
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
          if (e.button === 0) { e.stopPropagation(); if (!notDraggable) onDragStart(e, id, startFrame); }
        }}
        onClick={(e) => onSelect?.(e, id)}
        onMouseOver={() => onHover?.(id)}
        onMouseOut={() => onHover?.(null)}
        onTouchStart={(e) => !notDraggable && onTouchStart?.(e, id, startFrame)}
      >
        {(warnings.length > 0 || comboWarning) && (
          <div
            className="event-segment-warning"
            title={[...warnings, ...(comboWarning ? [comboWarning] : [])].join('\n')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M8 1L15 14H1L8 1Z" fill="#f0a030" stroke="#000" strokeWidth="0.5"/>
              <text x="8" y="12.5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#000">!</text>
            </svg>
          </div>
        )}
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

  // Animation sub-phase within activation (TIME_STOP portion)
  const hasAnimation = variant === 'ultimate' && animationDuration != null && animationDuration > 0 && animationDuration < activationDuration;
  const animH = hasAnimation ? durationToPx(animationDuration!, zoom) : 0;
  const postAnimH = hasAnimation ? activeH - animH : 0;

  const topPx      = frameToPx(startFrame, zoom);
  const totalHeight = durationToPx(clampedCoolEnd - startFrame, zoom);

  if (activeH <= 0 && lingerH <= 0) return null;

  const activeRadius = !hasLinger && !hasCooldown ? '2px' : '2px 2px 0 0';
  const lingerRadius = !hasCooldown ? '0 0 2px 2px' : '0';

  const wrapClass = `event-wrap${notDraggable ? ' event-wrap--static' : ''}${selected ? ' event-wrap--selected' : ''}${hovered && !selected ? ' event-wrap--hovered' : ''}`;

  return (
    <div
      className={wrapClass}
      data-event-id={id}
      style={{ top: topPx, height: totalHeight }}
      onContextMenu={(e) => onContextMenu(e, id)}
      onMouseDown={(e) => {
        if (e.button === 0) e.stopPropagation();
        if (!notDraggable && variant === 'ultimate' && e.button === 0) onDragStart(e, id, startFrame);
      }}
      onClick={(e) => onSelect?.(e, id)}
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
      onTouchStart={(e) => !notDraggable && onTouchStart?.(e, id, startFrame)}
    >
      {/* Active / Activation segment */}
      {activeH > 0 && hasAnimation ? (
        <>
          {/* Animation sub-phase (TIME_STOP) */}
          <div
            className="event-segment"
            style={{
              top: 0,
              height: animH,
              background: hexAlpha(color, 0.35),
              border: `1px solid ${hexAlpha(color, 0.55)}`,
              borderBottom: 'none',
              borderRadius: '2px 2px 0 0',
            }}
            onMouseDown={(e) => onDragStart(e, id, startFrame)}
          >
            {animH > 14 && (
              <span className="event-block-label" style={{ color: hexAlpha(color, 0.8) }}>Animation</span>
            )}
          </div>
          {/* Post-animation activation */}
          <div
            className="event-segment"
            style={{
              top: animH,
              height: postAnimH,
              background: hexAlpha(color, 0.55),
              border: `1px solid ${hexAlpha(color, 0.75)}`,
              borderTop: `1px dashed ${hexAlpha(color, 0.55)}`,
              borderBottom: hasLinger ? `1px dashed ${hexAlpha(color, 0.75)}` : undefined,
              borderRadius: hasLinger || hasCooldown ? '0' : '0 0 2px 2px',
            }}
            onMouseDown={(e) => onDragStart(e, id, startFrame)}
          >
            {postAnimH > 14 && (
              <span className="event-block-label" style={{ color: '#fff' }}>Activation</span>
            )}
          </div>
        </>
      ) : activeH > 0 ? (
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
            background: striped ? stripedBg(color) : hexAlpha(color, 0.80),
            border: `1px solid ${striped ? hexAlpha(color, 0.55) : hexAlpha(color, 0.95)}`,
            boxShadow: striped ? undefined : `0 0 6px ${hexAlpha(color, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.12)`,
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
      ) : null}

      {/* Lingering / Active phase segment */}
      {hasLinger && lingerH > 0 && (() => {
        const ultFrames = variant === 'ultimate' && segments && segments.length > 0 ? segments[0].frames : undefined;
        return (
        <div
          className={`event-segment${ultFrames ? ' event-segment--sequenced' : ''}`}
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
          {ultFrames?.map((f, fi) => {
            const framePx = durationToPx(f.offsetFrame, zoom);
            const isSelected = selectedFrames?.some((sf) => sf.segmentIndex === 0 && sf.frameIndex === fi) ?? false;
            const isHoverHighlight = !isSelected && hoverFrameProp != null &&
              Math.abs(durationToPx(hoverFrameProp - (startFrame + activationDuration + f.offsetFrame), zoom)) <= 4;
            const elColor = getFrameElementColor(f);
            return (
              <div
                key={`f-${fi}`}
                className={`event-frame-diamond${isSelected ? ' event-frame-diamond--selected' : ''}${isHoverHighlight ? ' event-frame-diamond--hover-hit' : ''}`}
                style={{ top: framePx, ...(elColor && !isSelected && !isHoverHighlight ? { background: elColor, boxShadow: `0 0 3px ${elColor}80` } : {}) }}
                onMouseDown={(e) => { e.stopPropagation(); if (e.button === 0) onFrameDragStart?.(e, id, 0, fi); }}
                onClick={(e) => { e.stopPropagation(); onFrameClick?.(id, 0, fi); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onFrameContextMenu?.(e, id, 0, fi); }}
                onMouseOver={(e) => { e.stopPropagation(); onHover?.(null); }}
                onMouseOut={(e) => { e.stopPropagation(); }}
              />
            );
          })}
        </div>
        );
      })()}

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

      {/* Combo warning icon above event */}
      {comboWarning && (
        <div className="event-segment-warning" title={comboWarning}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M8 1L15 14H1L8 1Z" fill="#f0a030" stroke="#000" strokeWidth="0.5"/>
            <text x="8" y="12.5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#000">!</text>
          </svg>
        </div>
      )}
    </div>
  );
}

export default React.memo(EventBlock);
