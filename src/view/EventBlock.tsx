import React from 'react';
import { frameToPx, durationToPx, pxPerFrame, TOTAL_FRAMES } from '../utils/timeline';
import { TimelineEvent, EventFrameMarker } from "../consts/viewTypes";
import { ELEMENT_COLORS, ElementType, HitType, STATUS_ELEMENT } from '../consts/enums';
import type { EventLayout } from '../controller/timeline/timelineLayout';

function hasInflictionOrStatus(f: EventFrameMarker): boolean {
  return !!(f.applyArtsInfliction || f.absorbArtsInfliction || f.consumeArtsInfliction ||
    f.applyForcedReaction || f.applyStatus || f.consumeStatus);
}


function getFrameElementColor(f: EventFrameMarker, skillElement?: string): string | undefined {
  const el = f.applyArtsInfliction?.element
    ?? f.absorbArtsInfliction?.element
    ?? f.consumeArtsInfliction?.element
    ?? (f.applyForcedReaction ? STATUS_ELEMENT[f.applyForcedReaction.reaction] : undefined)
    ?? (f.applyStatus ? STATUS_ELEMENT[f.applyStatus.status] : undefined)
    ?? f.damageElement
    ?? skillElement;
  if (!el) return undefined;
  const base = ELEMENT_COLORS[el as ElementType];
  return base ? `color-mix(in srgb, ${base} 75%, #fff)` : undefined;
}

interface EventBlockProps {
  event: TimelineEvent;
  color: string;
  zoom: number;
  selected?: boolean;
  hovered?: boolean;
  /** Display name shown on the event block. */
  label?: string;
  /** "ultimate" renders Animation → Statis → Active → Cooldown. "sequenced" renders multi-sequence segments with frame diamonds. */
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
  /** If true, event is derived (controller-generated) — shows default cursor. */
  derived?: boolean;
  /** Full ordered segment labels from the column definition (for contiguity validation). */
  allSegmentLabels?: string[];
  /** Full default segments from the column definition (for frame contiguity validation). */
  allDefaultSegments?: import('../consts/viewTypes').EventSegmentData[];
  /** Current hover-line real-frame. Diamonds near this frame get hover-selected styling. */
  hoverFrame?: number | null;
  /** Element type of the skill (e.g. "HEAT", "NATURE") for frame diamond coloring. */
  skillElement?: string;
  /** If true, use diagonal stripe pattern for the active segment (e.g. combo trigger). */
  striped?: boolean;
  /** If true, event is non-interactive: translucent, default cursor, no highlight. */
  passive?: boolean;
  /** If set, shows a warning overlay on top of the event (e.g. combo outside trigger window). */
  comboWarning?: string | null;
  /** Pre-computed layout from the controller (real-time positions). */
  eventLayout?: EventLayout;
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
  derived = false,
  allSegmentLabels,
  allDefaultSegments,
  hoverFrame: hoverFrameProp,
  skillElement,
  striped = false,
  passive = false,
  comboWarning = null,
  eventLayout,
}: EventBlockProps) {
  const { id, startFrame, activationDuration, activeDuration, cooldownDuration, segments, animationDuration } = event;

  // ── Layout-aware positioning ────────────────────────────────────────────────
  // When eventLayout is provided (from controller), use real-time positions.
  // This eliminates fragile time-stop zone filtering in the view layer.
  const layout = eventLayout;
  const ppf = pxPerFrame(zoom);

  /** Check if a frame diamond is near the hover line (within 4px). */
  const isFrameHovered = (frameAbsReal: number): boolean => {
    if (hoverFrameProp == null) return false;
    return Math.abs((hoverFrameProp - frameAbsReal) * ppf) <= 4;
  };

  // ── Sequenced variant (multi-sequence with frame diamonds) ──────────────
  if (variant === 'sequenced' && segments && segments.length > 0) {
    const topPx = layout
      ? frameToPx(layout.realStartFrame, zoom)
      : frameToPx(startFrame, zoom);
    const totalHeight = layout
      ? durationToPx(layout.realTotalDuration, zoom)
      : durationToPx(segments.reduce((sum, s) => sum + s.durationFrames, 0), zoom);

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
          // Check contiguity: present frames must form a consecutive run starting at index 0
          const isNonContiguous = presentIndices.length === 0 ||
            presentIndices[0] !== 0 ||
            presentIndices.some((idx, j) => j > 0 && idx !== presentIndices[j - 1] + 1);
          if (isNonContiguous) {
            const missingNums = allFrameOffsets
              .map((o, i) => presentOffsets.has(o) ? null : i + 1)
              .filter((n) => n !== null);
            warnings.push(`Sequence ${seg.label ?? si + 1}: non-contiguous frames (missing: ${missingNums.join(', ')})`);
          }
        }
      }
    }

    const wrapClass = `event-wrap${passive ? ' event-wrap--passive' : notDraggable ? ' event-wrap--static' : ''}${derived ? ' event-wrap--derived' : ''}${!passive && selected ? ' event-wrap--selected' : ''}${!passive && hovered && !selected ? ' event-wrap--hovered' : ''}`;

    let offsetFrames = 0;
    const segmentElements: React.ReactNode[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segLayout = layout?.segments?.[i];

      const segH = segLayout
        ? durationToPx(segLayout.realDuration, zoom)
        : durationToPx(seg.durationFrames, zoom);

      if (segH <= 0) { offsetFrames += seg.durationFrames; continue; }

      const segTopPx = segLayout
        ? durationToPx(segLayout.realOffset, zoom)
        : durationToPx(offsetFrames, zoom);

      const isFirst = i === 0;
      const isLast = i === segments.length - 1;
      const alpha = passive ? 0.15 : 0.55 + (i % 2) * 0.15;
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
            border: passive ? 'none' : `1px solid ${hexAlpha(color, alpha + 0.15)}`,
            borderTop: passive ? 'none' : isFirst ? undefined : `1px dashed ${hexAlpha(color, 0.5)}`,
            borderRadius: passive ? '2px' : borderRadius,
            padding: 0,
            margin: 0,
          }}
          onContextMenu={segments.length > 1 ? (e) => { e.preventDefault(); e.stopPropagation(); onSegmentContextMenu?.(e, id, i); } : undefined}
        >
          {(passive || segH > 14) && (seg.label || (isFirst && label)) && (
            <span className="event-block-label" style={passive ? undefined : { color: '#fff' }}>{seg.label ?? label}</span>
          )}
          {/* Frame diamonds */}
          {seg.frames?.map((f, fi) => {

            const framePx = durationToPx(f.derivedOffsetFrame ?? f.offsetFrame, zoom);
            const isSelected = selectedFrames?.some((sf) => sf.segmentIndex === i && sf.frameIndex === fi) ?? false;
            // Hover highlight: compare absolute real-frame positions
            const frameAbsReal = f.absoluteFrame ?? (startFrame + offsetFrames + f.offsetFrame);
            const isHoverHighlight = !isSelected && isFrameHovered(frameAbsReal);
            const elColor = getFrameElementColor(f, skillElement);
            return (
              <div
                key={`f-${fi}`}
                className={`event-frame-diamond${isSelected ? ' event-frame-diamond--selected' : ''}${isHoverHighlight ? ' event-frame-diamond--hover-hit' : ''}${f.hitType === HitType.FINAL_STRIKE ? ' event-frame-diamond--final-strike' : ''}${hasInflictionOrStatus(f) ? ' event-frame-diamond--infliction' : ''}`}
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
          <div className="event-segment-warning">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M8 1L15 14H1L8 1Z" fill="#f0a030" stroke="#000" strokeWidth="0.5"/>
              <text x="8" y="12.5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#000">!</text>
            </svg>
            <div className="warning-tooltip">
              {[...warnings, ...(comboWarning ? [comboWarning] : [])].map((msg, i) => (
                <div key={i} className="warning-tooltip-line">{msg}</div>
              ))}
            </div>
          </div>
        )}
        {segmentElements}
      </div>
    );
  }

  // ── Standard 3-phase layout (default / ultimate) ────────────────────────
  // For ultimates with 4 segments, derive phase durations from segments directly
  // to avoid the activationDuration = sum(all segments) issue after time-stop extension.
  const ultSegs = variant === 'ultimate' && segments && segments.length >= 4 ? segments : null;

  const hasActive   = ultSegs ? ultSegs[2].durationFrames > 0 : activeDuration > 0;
  const hasCooldown = ultSegs ? ultSegs[3].durationFrames > 0 : cooldownDuration > 0;

  const phases = layout?.phases;
  const activationH = ultSegs
    ? durationToPx(ultSegs[0].durationFrames + ultSegs[1].durationFrames, zoom)
    : (phases
        ? durationToPx(phases.realActivationDuration, zoom)
        : durationToPx(Math.min(activationDuration, TOTAL_FRAMES - startFrame), zoom));
  const activePhaseH = hasActive
    ? (ultSegs
        ? durationToPx(ultSegs[2].durationFrames, zoom)
        : (phases
            ? durationToPx(phases.realActiveDuration, zoom)
            : durationToPx(activeDuration, zoom)))
    : 0;
  const coolH = hasCooldown
    ? (ultSegs
        ? durationToPx(ultSegs[3].durationFrames, zoom)
        : durationToPx(phases?.realCooldownDuration ?? cooldownDuration, zoom))
    : 0;

  // Animation sub-phase within activation (TIME_STOP portion)
  const hasAnimation = ultSegs
    ? ultSegs[0].durationFrames > 0
    : ((variant === 'ultimate' || event.columnId === 'combo') && animationDuration != null && animationDuration > 0 && animationDuration <= activationDuration);
  const animH = ultSegs
    ? durationToPx(ultSegs[0].durationFrames, zoom)
    : (hasAnimation ? durationToPx(phases?.realAnimationDuration ?? animationDuration!, zoom) : 0);
  const postAnimH = ultSegs
    ? durationToPx(ultSegs[1].durationFrames, zoom)
    : (hasAnimation ? activationH - animH : 0);

  const topPx = layout
    ? frameToPx(layout.realStartFrame, zoom)
    : frameToPx(startFrame, zoom);
  const totalHeight = activationH + activePhaseH + coolH;

  if (activationH <= 0 && activePhaseH <= 0) return null;

  const activationRadius = !hasActive && !hasCooldown ? '2px' : '2px 2px 0 0';
  const activePhaseRadius = !hasCooldown ? '0 0 2px 2px' : '0';

  const wrapClass = `event-wrap${passive ? ' event-wrap--passive' : notDraggable ? ' event-wrap--static' : ''}${!passive && selected ? ' event-wrap--selected' : ''}${!passive && hovered && !selected ? ' event-wrap--hovered' : ''}`;



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
      {activationH > 0 && hasAnimation ? (() => {
        // For ultimates with animation sub-phases but no active phase, render frame diamonds
        // Statis frames are in segments[1] (Animation=0, Statis=1, Active=2)
        const actFrames = !hasActive && segments && segments.length > 1 ? segments[1].frames : undefined;
        return (
        <>
          {/* Animation sub-phase (TIME_STOP) — starts at top of activation */}
          <div
            className="event-segment"
            style={{
              top: 0,
              height: animH,
              background: hexAlpha(color, 0.35),
              border: `1px solid ${hexAlpha(color, 0.55)}`,
              borderBottom: `1px dashed ${hexAlpha(color, 0.55)}`,
              borderRadius: '2px 2px 0 0',
            }}
            onMouseDown={(e) => onDragStart(e, id, startFrame)}
          >
            {animH > 14 && (
              <span className="event-block-label" style={{ color: hexAlpha(color, 0.8) }}>Animation</span>
            )}
          </div>
          {/* Statis sub-phase (post-animation) */}
          <div
            className={`event-segment${actFrames ? ' event-segment--sequenced' : ''}`}
            style={{
              top: animH,
              height: postAnimH,
              background: hexAlpha(color, 0.55),
              border: `1px solid ${hexAlpha(color, 0.75)}`,
              borderTop: 'none',
              borderBottom: hasActive ? `1px dashed ${hexAlpha(color, 0.75)}` : undefined,
              borderRadius: hasActive || hasCooldown ? '0' : '0 0 2px 2px',
            }}
            onMouseDown={(e) => onDragStart(e, id, startFrame)}
          >
            {postAnimH > 14 && (
              <span className="event-block-label" style={{ color: '#fff' }}>Statis</span>
            )}
            {actFrames?.map((f, fi) => {

              const framePx = durationToPx((f.derivedOffsetFrame ?? f.offsetFrame) - (animationDuration ?? 0), zoom);
              if (framePx < 0 || framePx > postAnimH) return null;
              const isSelected = selectedFrames?.some((sf) => sf.segmentIndex === 1 && sf.frameIndex === fi) ?? false;
              const frameAbsReal = f.absoluteFrame ?? (startFrame + f.offsetFrame);
              const isHoverHighlight = !isSelected && isFrameHovered(frameAbsReal);
              const elColor = getFrameElementColor(f, skillElement);
              return (
                <div
                  key={`f-${fi}`}
                  className={`event-frame-diamond${isSelected ? ' event-frame-diamond--selected' : ''}${isHoverHighlight ? ' event-frame-diamond--hover-hit' : ''}${hasInflictionOrStatus(f) ? ' event-frame-diamond--infliction' : ''}`}
                  style={{ top: framePx, ...(elColor && !isSelected && !isHoverHighlight ? { background: elColor, boxShadow: `0 0 3px ${elColor}80` } : {}) }}
                  onMouseDown={(e) => { e.stopPropagation(); if (e.button === 0) onFrameDragStart?.(e, id, 1, fi); }}
                  onClick={(e) => { e.stopPropagation(); onFrameClick?.(id, 1, fi); }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onFrameContextMenu?.(e, id, 1, fi); }}
                  onMouseOver={(e) => { e.stopPropagation(); onHover?.(null); }}
                  onMouseOut={(e) => { e.stopPropagation(); }}
                />
              );
            })}
          </div>
        </>
        );
      })() : activationH > 0 ? (() => {
        // For ultimates with no active phase, render frame diamonds in the statis segment
        const actFrames = variant === 'ultimate' && !hasActive && segments && segments.length > 1 ? segments[1].frames : undefined;
        return (
        <div
          className={`event-segment${actFrames ? ' event-segment--sequenced' : ''}`}
          style={variant === 'ultimate' ? {
            top: 0,
            height: activationH,
            background: hexAlpha(color, 0.55),
            border: `1px solid ${hexAlpha(color, 0.75)}`,
            borderBottom: hasActive ? `1px dashed ${hexAlpha(color, 0.75)}` : undefined,
            borderRadius: activationRadius,
          } : {
            top: 0,
            height: activationH,
            background: striped ? stripedBg(color) : hexAlpha(color, 0.80),
            border: `1px solid ${striped ? hexAlpha(color, 0.55) : hexAlpha(color, 0.95)}`,
            boxShadow: striped ? undefined : `0 0 6px ${hexAlpha(color, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.12)`,
            borderRadius: activationRadius,
          }}
          onMouseDown={(e) => onDragStart(e, id, startFrame)}
        >
          {activationH > 14 && (
            <span className="event-block-label" style={{ color: '#fff' }}>
              {variant === 'ultimate' ? 'Statis' : (label ?? 'ACT')}
            </span>
          )}
          {actFrames?.map((f, fi) => {

            const framePx = durationToPx(f.derivedOffsetFrame ?? f.offsetFrame, zoom);
            const isSelected = selectedFrames?.some((sf) => sf.segmentIndex === 1 && sf.frameIndex === fi) ?? false;
            const frameAbsReal = f.absoluteFrame ?? (startFrame + f.offsetFrame);
            const isHoverHighlight = !isSelected && isFrameHovered(frameAbsReal);
            const elColor = getFrameElementColor(f, skillElement);
            return (
              <div
                key={`f-${fi}`}
                className={`event-frame-diamond${isSelected ? ' event-frame-diamond--selected' : ''}${isHoverHighlight ? ' event-frame-diamond--hover-hit' : ''}`}
                style={{ top: framePx, ...(elColor && !isSelected && !isHoverHighlight ? { background: elColor, boxShadow: `0 0 3px ${elColor}80` } : {}) }}
                onMouseDown={(e) => { e.stopPropagation(); if (e.button === 0) onFrameDragStart?.(e, id, 1, fi); }}
                onClick={(e) => { e.stopPropagation(); onFrameClick?.(id, 1, fi); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onFrameContextMenu?.(e, id, 1, fi); }}
                onMouseOver={(e) => { e.stopPropagation(); onHover?.(null); }}
                onMouseOut={(e) => { e.stopPropagation(); }}
              />
            );
          })}
        </div>
        );
      })() : null}

      {/* Active phase segment */}
      {hasActive && activePhaseH > 0 && (() => {
        const ultFrames = variant === 'ultimate' && segments && segments.length > 2 ? segments[2].frames : undefined;
        return (
        <div
          className={`event-segment${ultFrames ? ' event-segment--sequenced' : ''}`}
          style={variant === 'ultimate' ? {
            top: activationH,
            height: activePhaseH,
            background: hexAlpha(color, 0.80),
            border: `1px solid ${hexAlpha(color, 0.95)}`,
            boxShadow: `0 0 6px ${hexAlpha(color, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.12)`,
            borderTop: `1px dashed ${hexAlpha(color, 0.95)}`,
            borderBottom: hasCooldown ? 'none' : `1px solid ${hexAlpha(color, 0.95)}`,
            borderRadius: activePhaseRadius,
          } : {
            top: activationH,
            height: activePhaseH,
            background: hexAlpha(color, 0.28),
            borderLeft:   `1px solid ${hexAlpha(color, 0.55)}`,
            borderRight:  `1px solid ${hexAlpha(color, 0.55)}`,
            borderTop:    `1px dashed ${hexAlpha(color, 0.55)}`,
            borderBottom: hasCooldown ? 'none' : `1px solid ${hexAlpha(color, 0.55)}`,
            borderRadius: activePhaseRadius,
          }}
        >
          {activePhaseH > 14 && (
            <span className="event-block-label" style={{ color: variant === 'ultimate' ? '#fff' : hexAlpha(color, 0.9) }}>
              {variant === 'ultimate' ? 'Active' : 'LNG'}
            </span>
          )}
          {ultFrames?.map((f, fi) => {

            const framePx = durationToPx(f.derivedOffsetFrame ?? f.offsetFrame, zoom);
            const isSelected = selectedFrames?.some((sf) => sf.segmentIndex === 2 && sf.frameIndex === fi) ?? false;
            const frameAbsReal = f.absoluteFrame ?? (startFrame + activationDuration + f.offsetFrame);
            const isHoverHighlight = !isSelected && isFrameHovered(frameAbsReal);
            const elColor = getFrameElementColor(f, skillElement);
            return (
              <div
                key={`f-${fi}`}
                className={`event-frame-diamond${isSelected ? ' event-frame-diamond--selected' : ''}${isHoverHighlight ? ' event-frame-diamond--hover-hit' : ''}`}
                style={{ top: framePx, ...(elColor && !isSelected && !isHoverHighlight ? { background: elColor, boxShadow: `0 0 3px ${elColor}80` } : {}) }}
                onMouseDown={(e) => { e.stopPropagation(); if (e.button === 0) onFrameDragStart?.(e, id, 2, fi); }}
                onClick={(e) => { e.stopPropagation(); onFrameClick?.(id, 2, fi); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onFrameContextMenu?.(e, id, 2, fi); }}
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
            top: activationH + activePhaseH,
            height: coolH,
            background: stripedBg(color),
            border: '1px solid rgba(255,255,255,0.1)',
            borderTop: 'none',
            borderRadius: '0 0 2px 2px',
          }}
        >
          {coolH > 14 && (
            <span className="event-block-label" style={{ color: 'rgba(180,180,180,0.5)' }}>Cooldown</span>
          )}
        </div>
      )}

      {/* Combo warning icon above event */}
      {comboWarning && (
        <div className="event-segment-warning">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M8 1L15 14H1L8 1Z" fill="#f0a030" stroke="#000" strokeWidth="0.5"/>
            <text x="8" y="12.5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#000">!</text>
          </svg>
          <div className="warning-tooltip">
            {comboWarning.split('\n').map((msg, i) => (
              <div key={i} className="warning-tooltip-line">{msg}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(EventBlock);
