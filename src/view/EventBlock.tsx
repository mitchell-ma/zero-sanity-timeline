import React from 'react';
import { frameToPx, durationToPx, pxPerFrame, TOTAL_FRAMES } from '../utils/timeline';
import { TimelineEvent, EventFrameMarker } from "../consts/viewTypes";
import { ELEMENT_COLORS, ElementType, EventFrameType, SegmentType, STATUS_ELEMENT } from '../consts/enums';
import type { EventLayout } from '../controller/timeline/timelineLayout';
import { validateSegmentContiguity } from '../controller/timeline/eventValidator';
import { SKILL_COLUMNS } from '../model/channels';
import { VERTICAL_AXIS, segmentRadius, type AxisMap } from '../utils/axisMap';
import { formatSegmentShortName } from '../utils/semanticsTranslation';

const ROMAN_RE = /^\d+$/;
/** Convert bare numeric labels (legacy "1","2",...) to Roman numerals. */
const toDisplayLabel = (label: string | undefined) =>
  label && ROMAN_RE.test(label) ? formatSegmentShortName(undefined, Number(label) - 1) : label;

function hasInflictionOrStatus(f: EventFrameMarker): boolean {
  return !!(f.applyArtsInfliction || f.absorbArtsInfliction || f.consumeArtsInfliction ||
    f.applyForcedReaction || f.applyStatus || f.consumeStatus);
}


function getFrameElementColor(f: EventFrameMarker, skillElement?: string): string | undefined {
  // If the frame has a specific action (infliction, absorption, status grant, etc.),
  // use that action's element. Don't fallthrough to skillElement — a Squad Buff grant
  // on a Heat operator shouldn't render as a Heat diamond.
  let el: string | undefined;
  if (f.applyArtsInfliction) el = f.applyArtsInfliction.element;
  else if (f.absorbArtsInfliction) el = f.absorbArtsInfliction.element;
  else if (f.consumeArtsInfliction) el = f.consumeArtsInfliction.element;
  else if (f.applyForcedReaction) el = STATUS_ELEMENT[f.applyForcedReaction.reaction];
  else if (f.applyStatus) el = STATUS_ELEMENT[f.applyStatus.status];
  else el = f.damageElement ?? skillElement;
  if (!el) return undefined;
  const base = ELEMENT_COLORS[el as ElementType];
  return base ? `color-mix(in srgb, ${base} 75%, #fff)` : undefined;
}

interface EventBlockProps {
  event: TimelineEvent;
  color: string;
  zoom: number;
  axis?: AxisMap;
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
  /** If true, this basic attack is auto-promoted to finisher during a stagger break. */
  isAutoFinisher?: boolean;
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
  isAutoFinisher = false,
  eventLayout,
  axis = VERTICAL_AXIS,
}: EventBlockProps) {
  const { id, startFrame, activationDuration, activeDuration, cooldownDuration, segments, animationDuration } = event;
  const displayLabel = isAutoFinisher ? 'Finisher' : label;

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

  /** Check if the hover line falls within a segment's absolute frame range. */
  const isSegmentHovered = (segStartFrame: number, segDuration: number): boolean => {
    if (hoverFrameProp == null) return false;
    return hoverFrameProp >= segStartFrame && hoverFrameProp < segStartFrame + segDuration;
  };

  // ── Sequenced variant (multi-sequence with frame diamonds) ──────────────
  if (variant === 'sequenced' && segments && segments.length > 0) {
    const topPx = layout
      ? frameToPx(layout.realStartFrame, zoom)
      : frameToPx(startFrame, zoom);
    // Compute total height: max end across all segments (some may have explicit offsets)
    let fallbackTotal = 0;
    if (!layout) {
      let running = 0;
      for (const s of segments) {
        const off = s.offset != null ? s.offset : running;
        const end = off + s.durationFrames;
        if (end > fallbackTotal) fallbackTotal = end;
        running = s.offset == null ? running + s.durationFrames : end;
      }
    }
    const totalHeight = layout
      ? durationToPx(layout.realTotalDuration, zoom)
      : durationToPx(fallbackTotal, zoom);

    if (totalHeight <= 0) return null;

    const warnings = validateSegmentContiguity(segments, allSegmentLabels, allDefaultSegments);

    const wrapClass = `event-wrap${passive ? ' event-wrap--passive' : notDraggable ? ' event-wrap--static' : ''}${derived ? ' event-wrap--derived' : ''}${!passive && selected ? ' event-wrap--selected' : ''}${!passive && hovered && !selected ? ' event-wrap--hovered' : ''}`;

    let offsetFrames = 0;
    const segmentElements: React.ReactNode[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segLayout = layout?.segments?.[i];
      // Use explicit offset if present, otherwise chain from previous segment
      const segOffset = seg.offset != null ? seg.offset : offsetFrames;

      const segH = segLayout
        ? durationToPx(segLayout.realDuration, zoom)
        : durationToPx(seg.durationFrames, zoom);

      if (segH <= 0) { offsetFrames = seg.offset == null ? offsetFrames + seg.durationFrames : segOffset + seg.durationFrames; continue; }

      const segTopPx = segLayout
        ? durationToPx(segLayout.realOffset, zoom)
        : durationToPx(segOffset, zoom);

      const isFirst = i === 0;
      const isLast = i === segments.length - 1;
      const isCooldown = seg.segmentType === SegmentType.COOLDOWN;
      const alpha = passive ? 0.15 : isCooldown ? 0.15 : 0.55 + (i % 2) * 0.15;
      const borderRadius = segmentRadius(axis, isFirst, isLast);

      const segAbsStart = segLayout
        ? layout!.realStartFrame + segLayout.realOffset
        : startFrame + segOffset;
      const segAbsDur = segLayout ? segLayout.realDuration : seg.durationFrames;
      const segHover = !passive && isSegmentHovered(segAbsStart, segAbsDur);

      segmentElements.push(
        <div
          key={`seg-${i}`}
          className={`event-segment event-segment--sequenced${segHover ? ' event-segment--hover-hit' : ''}`}
          style={{
            [axis.framePos]: segTopPx,
            [axis.frameSize]: segH,
            background: isCooldown ? stripedBg(color) : hexAlpha(color, alpha),
            border: passive ? 'none' : isCooldown ? '1px solid rgba(255,255,255,0.1)' : `1px solid ${hexAlpha(color, alpha + 0.15)}`,
            borderTop: passive ? 'none' : isCooldown ? 'none' : isFirst ? undefined : `1px dashed ${hexAlpha(color, 0.5)}`,
            borderRadius: passive ? '2px' : borderRadius,
            padding: 0,
            margin: 0,
          }}
          onContextMenu={segments.length > 1 ? (e) => { e.preventDefault(); e.stopPropagation(); onSegmentContextMenu?.(e, id, i); } : undefined}
        >
          {(passive || segH > 14) && (seg.label || (isFirst && displayLabel)) && (
            <span className="event-block-label" style={passive ? undefined : isCooldown ? { color: 'rgba(180,180,180,0.5)' } : { color: '#fff' }}>{toDisplayLabel(seg.label) ?? displayLabel}</span>
          )}
          {/* Frame diamonds */}
          {/* eslint-disable-next-line no-loop-func */}
          {seg.frames?.map((f, fi) => {

            const framePx = durationToPx(f.derivedOffsetFrame ?? f.offsetFrame, zoom);
            const isSelected = selectedFrames?.some((sf) => sf.segmentIndex === i && sf.frameIndex === fi) ?? false;
            // Hover highlight: compare absolute real-frame positions
            const frameAbsReal = f.absoluteFrame ?? (startFrame + segOffset + f.offsetFrame);
            const isHoverHighlight = !isSelected && isFrameHovered(frameAbsReal);
            const elColor = getFrameElementColor(f, skillElement);
            return (
              <div
                key={`f-${fi}`}
                className={`event-frame-diamond${isSelected ? ' event-frame-diamond--selected' : ''}${isHoverHighlight ? ' event-frame-diamond--hover-hit' : ''}${(f.frameTypes ?? []).includes(EventFrameType.FINAL_STRIKE) ? ' event-frame-diamond--final-strike' : ''}${(f.frameTypes ?? []).includes(EventFrameType.FINISHER) ? ' event-frame-diamond--finisher' : ''}${(f.frameTypes ?? []).includes(EventFrameType.DIVE) ? ' event-frame-diamond--dive' : ''}${hasInflictionOrStatus(f) ? ' event-frame-diamond--infliction' : ''}${f.statusLabel ? ' event-frame-diamond--status' : ''}`}
                style={{ [axis.framePos]: framePx, ...(elColor && !isSelected && !isHoverHighlight ? { background: elColor, boxShadow: `0 0 3px ${elColor}80` } : {}) } as React.CSSProperties}
                title={f.statusLabel ?? undefined}
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

      // Advance running offset
      if (seg.offset == null) offsetFrames += seg.durationFrames;
      else offsetFrames = segOffset + seg.durationFrames;
    }

    return (
      <div
        className={wrapClass}
        data-event-id={id}
        style={{ [axis.framePos]: topPx, [axis.frameSize]: totalHeight } as React.CSSProperties}
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
  const ultSegs = variant === SKILL_COLUMNS.ULTIMATE && segments && segments.length >= 4 ? segments : null;

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
    : ((variant === SKILL_COLUMNS.ULTIMATE || event.columnId === SKILL_COLUMNS.COMBO) && animationDuration != null && animationDuration > 0 && animationDuration <= activationDuration);
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

  const activationRadius = segmentRadius(axis, true, !hasActive && !hasCooldown);
  const activePhaseRadius = segmentRadius(axis, false, !hasCooldown);

  const wrapClass = `event-wrap${passive ? ' event-wrap--passive' : notDraggable ? ' event-wrap--static' : ''}${!passive && selected ? ' event-wrap--selected' : ''}${!passive && hovered && !selected ? ' event-wrap--hovered' : ''}`;

  // Compute absolute frame ranges for phase hover highlighting
  const realStart = layout ? layout.realStartFrame : startFrame;
  const animDur = ultSegs
    ? ultSegs[0].durationFrames
    : (hasAnimation ? (phases?.realAnimationDuration ?? animationDuration!) : 0);
  const activationDur = ultSegs
    ? ultSegs[0].durationFrames + ultSegs[1].durationFrames
    : (phases ? phases.realActivationDuration : Math.min(activationDuration, TOTAL_FRAMES - startFrame));
  const activeDur = hasActive
    ? (ultSegs ? ultSegs[2].durationFrames : (phases ? phases.realActiveDuration : activeDuration))
    : 0;
  const coolDur = hasCooldown
    ? (ultSegs ? ultSegs[3].durationFrames : (phases?.realCooldownDuration ?? cooldownDuration))
    : 0;

  const animSegHover = !passive && hasAnimation && isSegmentHovered(realStart, animDur);
  const statisSegHover = !passive && hasAnimation && isSegmentHovered(realStart + animDur, activationDur - animDur);
  const activationSegHover = !passive && !hasAnimation && isSegmentHovered(realStart, activationDur);
  const activeSegHover = !passive && hasActive && isSegmentHovered(realStart + activationDur, activeDur);
  const coolSegHover = !passive && hasCooldown && isSegmentHovered(realStart + activationDur + activeDur, coolDur);

  return (
    <div
      className={wrapClass}
      data-event-id={id}
      style={{ [axis.framePos]: topPx, [axis.frameSize]: totalHeight } as React.CSSProperties}
      onContextMenu={(e) => onContextMenu(e, id)}
      onMouseDown={(e) => {
        if (e.button === 0) { e.stopPropagation(); if (!notDraggable) onDragStart(e, id, startFrame); }
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
            className={`event-segment${animSegHover ? ' event-segment--hover-hit' : ''}`}
            style={{
              [axis.framePos]: 0,
              [axis.frameSize]: animH,
              background: hexAlpha(color, 0.35),
              border: `1px solid ${hexAlpha(color, 0.55)}`,
              borderBottom: `1px dashed ${hexAlpha(color, 0.55)}`,
              borderRadius: segmentRadius(axis, true, false),
            } as React.CSSProperties}
            onMouseDown={(e) => onDragStart(e, id, startFrame)}
          >
            {animH > 14 && (
              <span className="event-block-label" style={{ color: hexAlpha(color, 0.8) }}>Animation</span>
            )}
          </div>
          {/* Statis sub-phase (post-animation) */}
          <div
            className={`event-segment${actFrames ? ' event-segment--sequenced' : ''}${statisSegHover ? ' event-segment--hover-hit' : ''}`}
            style={{
              [axis.framePos]: animH,
              [axis.frameSize]: postAnimH,
              background: hexAlpha(color, 0.55),
              border: `1px solid ${hexAlpha(color, 0.75)}`,
              borderTop: 'none',
              borderBottom: hasActive ? `1px dashed ${hexAlpha(color, 0.75)}` : undefined,
              borderRadius: hasActive || hasCooldown ? '0' : segmentRadius(axis, false, true),
            } as React.CSSProperties}
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
                  style={{ [axis.framePos]: framePx, ...(elColor && !isSelected && !isHoverHighlight ? { background: elColor, boxShadow: `0 0 3px ${elColor}80` } : {}) } as React.CSSProperties}
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
        const actFrames = variant === SKILL_COLUMNS.ULTIMATE && !hasActive && segments && segments.length > 1 ? segments[1].frames : undefined;
        return (
        <div
          className={`event-segment${actFrames ? ' event-segment--sequenced' : ''}${activationSegHover ? ' event-segment--hover-hit' : ''}`}
          style={variant === SKILL_COLUMNS.ULTIMATE ? {
            [axis.framePos]: 0,
            [axis.frameSize]: activationH,
            background: hexAlpha(color, 0.55),
            border: `1px solid ${hexAlpha(color, 0.75)}`,
            borderBottom: hasActive ? `1px dashed ${hexAlpha(color, 0.75)}` : undefined,
            borderRadius: activationRadius,
          } as React.CSSProperties : {
            [axis.framePos]: 0,
            [axis.frameSize]: activationH,
            background: striped ? stripedBg(color) : hexAlpha(color, 0.80),
            border: `1px solid ${striped ? hexAlpha(color, 0.55) : hexAlpha(color, 0.95)}`,
            boxShadow: striped ? undefined : `0 0 6px ${hexAlpha(color, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.12)`,
            borderRadius: activationRadius,
          } as React.CSSProperties}
          onMouseDown={(e) => onDragStart(e, id, startFrame)}
        >
          {activationH > 14 && (
            <span className="event-block-label" style={{ color: '#fff' }}>
              {variant === SKILL_COLUMNS.ULTIMATE ? 'Statis' : (label ?? 'ACT')}
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
                style={{ [axis.framePos]: framePx, ...(elColor && !isSelected && !isHoverHighlight ? { background: elColor, boxShadow: `0 0 3px ${elColor}80` } : {}) } as React.CSSProperties}
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
        const ultFrames = variant === SKILL_COLUMNS.ULTIMATE && segments && segments.length > 2 ? segments[2].frames : undefined;
        return (
        <div
          className={`event-segment${ultFrames ? ' event-segment--sequenced' : ''}${activeSegHover ? ' event-segment--hover-hit' : ''}`}
          style={variant === SKILL_COLUMNS.ULTIMATE ? {
            [axis.framePos]: activationH,
            [axis.frameSize]: activePhaseH,
            background: hexAlpha(color, 0.80),
            border: `1px solid ${hexAlpha(color, 0.95)}`,
            boxShadow: `0 0 6px ${hexAlpha(color, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.12)`,
            borderTop: `1px dashed ${hexAlpha(color, 0.95)}`,
            borderBottom: hasCooldown ? 'none' : `1px solid ${hexAlpha(color, 0.95)}`,
            borderRadius: activePhaseRadius,
          } as React.CSSProperties : {
            [axis.framePos]: activationH,
            [axis.frameSize]: activePhaseH,
            background: hexAlpha(color, 0.28),
            borderLeft:   `1px solid ${hexAlpha(color, 0.55)}`,
            borderRight:  `1px solid ${hexAlpha(color, 0.55)}`,
            borderTop:    `1px dashed ${hexAlpha(color, 0.55)}`,
            borderBottom: hasCooldown ? 'none' : `1px solid ${hexAlpha(color, 0.55)}`,
            borderRadius: activePhaseRadius,
          } as React.CSSProperties}
        >
          {activePhaseH > 14 && (
            <span className="event-block-label" style={{ color: variant === SKILL_COLUMNS.ULTIMATE ? '#fff' : hexAlpha(color, 0.9) }}>
              {variant === SKILL_COLUMNS.ULTIMATE ? 'Active' : 'LNG'}
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
                style={{ [axis.framePos]: framePx, ...(elColor && !isSelected && !isHoverHighlight ? { background: elColor, boxShadow: `0 0 3px ${elColor}80` } : {}) } as React.CSSProperties}
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
          className={`event-segment${coolSegHover ? ' event-segment--hover-hit' : ''}`}
          style={{
            [axis.framePos]: activationH + activePhaseH,
            [axis.frameSize]: coolH,
            background: stripedBg(color),
            border: '1px solid rgba(255,255,255,0.1)',
            borderTop: 'none',
            borderRadius: segmentRadius(axis, false, true),
          } as React.CSSProperties}
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
