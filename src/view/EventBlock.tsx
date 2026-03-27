import React, { useCallback, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { frameToPx, durationToPx, pxPerFrame } from '../utils/timeline';
import { TimelineEvent, EventFrameMarker, EventSegmentData } from "../consts/viewTypes";
import { ELEMENT_COLORS, ElementType, EventFrameType, SegmentType } from '../consts/enums';
import { getStatusElementMap } from '../controller/gameDataStore';
import type { EventLayout } from '../controller/timeline/timelineLayout';
// validateSegmentContiguity removed — no longer needed in render path
import { VERTICAL_AXIS, segmentRadius, type AxisMap } from '../utils/axisMap';
import { formatSegmentShortName } from '../dsl/semanticsTranslation';
import { VerbType, NounType, AdjectiveType } from '../dsl/semantics';

/** Warning icon with a fixed-position tooltip that escapes scroll overflow. */
const WarningIcon = React.memo(function WarningIcon({ messages }: { messages: string[] }) {
  const iconRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const handleEnter = useCallback(() => {
    const el = iconRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  }, []);

  const handleLeave = useCallback(() => setPos(null), []);

  return (
    <div
      ref={iconRef}
      className="event-segment-warning"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <svg width="16" height="16" viewBox="0 0 16 16">
        <path d="M8 1L15 14H1L8 1Z" fill="#f0a030" stroke="#000" strokeWidth="0.5"/>
        <text x="8" y="12.5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#000">!</text>
      </svg>
      {pos && ReactDOM.createPortal(
        <div className="warning-tooltip warning-tooltip--fixed" style={{ left: pos.x, top: pos.y }}>
          {messages.map((msg, i) => (
            <div key={i} className="warning-tooltip-line">{msg}</div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
});

const ROMAN_RE = /^\d+$/;
/** Convert bare numeric labels (legacy "1","2",...) to Roman numerals. */
const toDisplayLabel = (label: string | undefined) =>
  label && ROMAN_RE.test(label) ? formatSegmentShortName(undefined, Number(label) - 1) : label;

function hasInflictionOrStatus(f: EventFrameMarker): boolean {
  if (!f.clauses) return false;
  for (const pred of f.clauses) {
    for (const ef of pred.effects) {
      if (ef.dslEffect) {
        const v = ef.dslEffect.verb;
        if (v === VerbType.APPLY || v === VerbType.CONSUME) return true;
      }
    }
  }
  return false;
}


const EMPTY_MESSAGES: string[] = [];

// Cached border/shadow strings — avoids template literal allocation per segment per render.
const _borderCache = new Map<string, string>();
function cachedBorder(color: string, alpha: number): string {
  const key = `${color}\0${alpha}`;
  let cached = _borderCache.get(key);
  if (!cached) { cached = `1px solid ${hexAlpha(color, alpha)}`; _borderCache.set(key, cached); }
  return cached;
}
const _dashedBorderCache = new Map<string, string>();
function cachedDashedBorder(color: string, alpha: number): string {
  const key = `${color}\0${alpha}`;
  let cached = _dashedBorderCache.get(key);
  if (!cached) { cached = `1px dashed ${hexAlpha(color, alpha)}`; _dashedBorderCache.set(key, cached); }
  return cached;
}
const _glowShadowCache = new Map<string, string>();
function cachedGlowShadow(color: string): string {
  let cached = _glowShadowCache.get(color);
  if (!cached) { cached = `0 0 6px ${hexAlpha(color, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.12)`; _glowShadowCache.set(color, cached); }
  return cached;
}

// Cached element→color-mix mapping — avoids string allocation per frame per render.
const _elementColorMixCache = new Map<string, string>();
function getElementColorMix(el: string): string | undefined {
  let cached = _elementColorMixCache.get(el);
  if (cached !== undefined) return cached;
  const base = ELEMENT_COLORS[el as ElementType];
  if (!base) {
    _elementColorMixCache.set(el, '');
    return undefined;
  }
  cached = `color-mix(in srgb, ${base} 75%, #fff)`;
  _elementColorMixCache.set(el, cached);
  return cached;
}

function getFrameElementColor(f: EventFrameMarker, skillElement?: string): string | undefined {
  // Extract element from clause effects (first APPLY/CONSUME with an element qualifier or status element).
  let el: string | undefined;
  if (f.clauses) {
    for (const pred of f.clauses) {
      if (el) break;
      for (const ef of pred.effects) {
        if (!ef.dslEffect) continue;
        const q = Array.isArray(ef.dslEffect.objectQualifier) ? ef.dslEffect.objectQualifier[0] : ef.dslEffect.objectQualifier;
        if (ef.dslEffect.verb === VerbType.APPLY || ef.dslEffect.verb === VerbType.CONSUME) {
          if (ef.dslEffect.object === NounType.INFLICTION && q) { el = q; break; }
          if (ef.dslEffect.object === NounType.REACTION && q) { el = getStatusElementMap()[q]; break; }
          if (ef.dslEffect.object === NounType.STATUS && ef.dslEffect.objectId && ef.dslEffect.objectId !== AdjectiveType.PHYSICAL) {
            el = getStatusElementMap()[ef.dslEffect.objectId]; break;
          }
        }
      }
    }
  }
  if (!el) el = f.damageElement ?? skillElement;
  if (!el) return undefined;
  return getElementColorMix(el) || undefined;
}

// ── Segment-type-aware styling ─────────────────────────────────────────────

interface SegmentStyle {
  bgAlpha: number;
  borderAlpha: number;
  labelColor: string;
  glow: boolean;
}

// Pre-allocated style constants — avoids object creation per segment per render.
const STYLE_COOLDOWN: SegmentStyle = { bgAlpha: 0.35, borderAlpha: 0.2, labelColor: 'rgba(180,180,180,0.7)', glow: false };
const STYLE_STASIS: SegmentStyle = { bgAlpha: 0.7, borderAlpha: 0.85, labelColor: '#fff', glow: false };
const STYLE_ACTIVE: SegmentStyle = { bgAlpha: 0.9, borderAlpha: 1.0, labelColor: '#fff', glow: true };
const STYLE_PASSIVE: SegmentStyle = { bgAlpha: 0.15, borderAlpha: 0, labelColor: '#fff', glow: false };
// Animation style depends on color — cache per color.
const _animStyleCache = new Map<string, SegmentStyle>();

function getSegmentStyle(seg: EventSegmentData, color: string): SegmentStyle {
  const types = seg.properties.segmentTypes;
  if (types?.includes(SegmentType.COOLDOWN) || types?.includes(SegmentType.IMMEDIATE_COOLDOWN)) {
    return STYLE_COOLDOWN;
  }
  if (types?.includes(SegmentType.ANIMATION)) {
    let cached = _animStyleCache.get(color);
    if (!cached) {
      cached = { bgAlpha: 0.55, borderAlpha: 0.7, labelColor: hexAlpha(color, 0.9), glow: false };
      _animStyleCache.set(color, cached);
    }
    return cached;
  }
  if (types?.includes(SegmentType.STASIS)) {
    return STYLE_STASIS;
  }
  // Default (ACTIVE, NORMAL, or untyped): solid active look
  return STYLE_ACTIVE;
}

interface EventBlockProps {
  event: TimelineEvent;
  color: string;
  zoom: number;
  axis?: AxisMap;
  selected?: boolean;
  hovered?: boolean;
  /** Display name shown on the event block (used only for single-segment events with no segment name). */
  label?: string;
  onDragStart: (e: React.MouseEvent, eventUid: string, startFrame: number) => void;
  onContextMenu: (e: React.MouseEvent, eventUid: string) => void;
  onSelect?: (e: React.MouseEvent, eventUid: string) => void;
  onHover?: (eventUid: string | null) => void;
  onTouchStart?: (e: React.TouchEvent, eventUid: string, startFrame: number) => void;
  onFrameClick?: (e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onFrameContextMenu?: (e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onFrameDragStart?: (e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onSegmentContextMenu?: (e: React.MouseEvent, eventUid: string, segmentIndex: number) => void;
  /** Currently selected frames for highlight. */
  selectedFrames?: { segmentIndex: number; frameIndex: number }[];
  /** If true, event cannot be dragged — shows pointer cursor instead of grab. */
  notDraggable?: boolean;
  /** If true, event is derived (controller-generated) — shows default cursor. */
  derived?: boolean;
  /** Current hover-line real-frame. Diamonds near this frame get hover-selected styling. */
  hoverFrame?: number | null;
  /** Element type of the skill (e.g. "HEAT", "NATURE") for frame diamond coloring. */
  skillElement?: string;
  /** If true, event is non-interactive: translucent, default cursor, no highlight. */
  passive?: boolean;
  /** If set, shows a warning overlay on top of the event (e.g. combo outside trigger window). */
  comboWarning?: string | null;
  /** If true, this basic attack is auto-promoted to finisher during a stagger break. */
  isAutoFinisher?: boolean;
  /** Pre-computed layout from the controller (real-time positions). */
  eventLayout?: EventLayout;
  /** Additional inline styles for the event wrapper (e.g. overlap lane positioning). */
  wrapStyle?: React.CSSProperties;
}

// Cached hex→rgba conversion — avoids string allocation for repeated color+alpha combos.
const _hexAlphaCache = new Map<string, string>();
function hexAlpha(hex: string, alpha: number): string {
  const key = `${hex}\0${alpha}`;
  let cached = _hexAlphaCache.get(key);
  if (cached) return cached;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  cached = `rgba(${r},${g},${b},${alpha})`;
  _hexAlphaCache.set(key, cached);
  return cached;
}

function EventBlock({
  event,
  color,
  zoom,
  selected = false,
  hovered = false,
  label,
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
  hoverFrame: hoverFrameProp,
  skillElement,
  passive = false,
  comboWarning = null,
  isAutoFinisher = false,
  eventLayout,
  wrapStyle,
  axis = VERTICAL_AXIS,
}: EventBlockProps) {
  const { uid, startFrame, segments } = event;
  const displayLabel = isAutoFinisher ? 'Finisher' : label;

  // ── Layout-aware positioning ────────────────────────────────────────────────
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

  /** Compute the label's position offset (px) within a hovered segment so it follows the hover line. */
  const hoverLabelStyle = (segStartFrame: number): React.CSSProperties | undefined => {
    if (hoverFrameProp == null) return undefined;
    const px = durationToPx(hoverFrameProp - segStartFrame, zoom) + 6;
    return axis.framePos === 'top' ? { top: px } : { left: px };
  };

  const comboWarningMessages = useMemo(
    () => comboWarning ? comboWarning.split('\n') : EMPTY_MESSAGES,
    [comboWarning],
  );

  // ── Generic segment-driven renderer ─────────────────────────────────────────
  if (!segments || segments.length === 0) return null;

  const topPx = layout
    ? frameToPx(layout.realStartFrame, zoom)
    : frameToPx(startFrame, zoom);

  // Compute total height: max end across all segments (some may have explicit offsets)
  let fallbackTotal = 0;
  if (!layout) {
    let running = 0;
    for (const s of segments) {
      const off = s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)
        ? 0
        : s.properties.offset != null ? s.properties.offset : running;
      const end = off + s.properties.duration;
      if (end > fallbackTotal) fallbackTotal = end;
      running = s.properties.offset == null ? running + s.properties.duration : end;
    }
  }
  const totalHeight = layout
    ? durationToPx(layout.realTotalDuration, zoom)
    : durationToPx(fallbackTotal, zoom);

  if (totalHeight <= 0) return null;

  const isSingleSegment = segments.length === 1;

  const wrapClass = `event-wrap${passive ? ' event-wrap--passive' : notDraggable ? ' event-wrap--static' : ''}${derived ? ' event-wrap--derived' : ''}${!passive && selected ? ' event-wrap--selected' : ''}${!passive && hovered && !selected ? ' event-wrap--hovered' : ''}${comboWarning ? ' event-wrap--has-warning' : ''}`;

  let offsetFrames = 0;
  const segmentElements: React.ReactNode[] = [];
  const frameElements: React.ReactNode[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segLayout = layout?.segments?.[i];
    // IMMEDIATE_COOLDOWN starts at event frame 0; explicit offset overrides; otherwise chain
    const segOffset = seg.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)
      ? 0
      : seg.properties.offset != null ? seg.properties.offset : offsetFrames;

    const segH = segLayout
      ? durationToPx(segLayout.realDuration, zoom)
      : durationToPx(seg.properties.duration, zoom);

    if (segH <= 0) { offsetFrames = seg.properties.offset == null ? offsetFrames + seg.properties.duration : segOffset + seg.properties.duration; continue; }

    const segTopPx = segLayout
      ? durationToPx(segLayout.realOffset, zoom)
      : durationToPx(segOffset, zoom);

    const isFirst = i === 0;
    const isLast = i === segments.length - 1;
    const borderRadiusVal = segmentRadius(axis, isFirst, isLast);

    const segAbsStart = segLayout
      ? layout!.realStartFrame + segLayout.realOffset
      : startFrame + segOffset;
    const segAbsDur = segLayout ? segLayout.realDuration : seg.properties.duration;
    const segHover = isSegmentHovered(segAbsStart, segAbsDur);
    const segLabelHover = segHover ? hoverLabelStyle(segAbsStart) : undefined;

    // Derive styling from segment types
    const style = passive ? STYLE_PASSIVE : getSegmentStyle(seg, color);

    // Segment label: use segment name if present, otherwise empty for multi-segment.
    // For single-segment events, fall back to the display label.
    const segLabel = seg.properties.name
      ? toDisplayLabel(seg.properties.name)
      : (isSingleSegment ? displayLabel : undefined);

    // For IMMEDIATE_COOLDOWN segments that start at offset 0, push the label below
    // where the active segments end so it doesn't overlap with active segment text.
    const isCooldownOverlap = seg.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN) && segOffset === 0;
    const cooldownLabelOffset = isCooldownOverlap
      ? Math.max(4, durationToPx(offsetFrames, zoom) - segTopPx + 4)
      : 4;

    // Build segment label style — always include explicit frame-axis position
    // so the label never relies on CSS fallback (which can get clipped by overflow:hidden during re-render)
    // For cooldown overlaps, clamp the hover position so it doesn't go above the adjusted start
    const labelStyle = segLabelHover
      ? { color: style.labelColor, ...segLabelHover, ...(isCooldownOverlap && typeof segLabelHover[axis.framePos] === 'number' && (segLabelHover[axis.framePos] as number) < cooldownLabelOffset ? { [axis.framePos]: cooldownLabelOffset } : {}) }
      : { color: style.labelColor, [axis.framePos]: cooldownLabelOffset };

    segmentElements.push(
      <div
        key={`seg-${i}`}
        className={`event-segment${seg.frames?.length ? ' event-segment--sequenced' : ''}${segHover ? ' event-segment--hover-hit' : ''}`}
        style={{
          [axis.framePos]: segTopPx,
          [axis.frameSize]: segH,
          background: hexAlpha(color, style.bgAlpha),
          border: passive ? 'none' : cachedBorder(color, style.borderAlpha),
          [axis.framePos === 'top' ? 'borderTop' : 'borderLeft']: passive ? 'none' : isFirst ? undefined : cachedDashedBorder(color, Math.min(style.borderAlpha, 0.5)),
          borderRadius: passive ? '2px' : borderRadiusVal,
          boxShadow: style.glow ? cachedGlowShadow(color) : undefined,
          zIndex: segments.length - i,
          padding: 0,
          margin: 0,
        } as React.CSSProperties}
        onMouseDown={(e) => { if (e.button === 0 && !notDraggable) onDragStart(e, uid, startFrame); }}
        onContextMenu={segments.length > 1 ? (e) => { e.preventDefault(); e.stopPropagation(); onSegmentContextMenu?.(e, uid, i); } : undefined}
      >
        {(passive || segH > 14) && segLabel && (
          <span className="event-block-label" style={labelStyle}>{segLabel}</span>
        )}
      </div>,
    );

    // Collect frame diamonds into a separate layer above all segments
    seg.frames?.forEach((f, fi) => {
      const framePx = segTopPx + durationToPx(f.derivedOffsetFrame ?? f.offsetFrame, zoom);
      const isSelected = selectedFrames?.some((sf) => sf.segmentIndex === i && sf.frameIndex === fi) ?? false;
      const frameAbsReal = f.absoluteFrame ?? (startFrame + segOffset + f.offsetFrame);
      const isHoverHighlight = !isSelected && isFrameHovered(frameAbsReal);
      const elColor = getFrameElementColor(f, skillElement);
      frameElements.push(
        <div
          key={`f-${i}-${fi}`}
          className={`event-frame-diamond${isSelected ? ' event-frame-diamond--selected' : ''}${isHoverHighlight ? ' event-frame-diamond--hover-hit' : ''}${(f.frameTypes ?? []).includes(EventFrameType.FINAL_STRIKE) ? ' event-frame-diamond--final-strike' : ''}${(f.frameTypes ?? []).includes(EventFrameType.FINISHER) ? ' event-frame-diamond--finisher' : ''}${(f.frameTypes ?? []).includes(EventFrameType.DIVE) ? ' event-frame-diamond--dive' : ''}${hasInflictionOrStatus(f) ? ' event-frame-diamond--infliction' : ''}${f.statusLabel ? ' event-frame-diamond--status' : ''}`}
          style={elColor && !isSelected && !isHoverHighlight
            ? { [axis.framePos]: framePx, background: elColor, boxShadow: `0 0 3px ${elColor}80` } as React.CSSProperties
            : { [axis.framePos]: framePx } as React.CSSProperties}
          title={f.statusLabel ?? undefined}
          onMouseDown={(e) => { e.stopPropagation(); if (e.button === 0) onFrameDragStart?.(e, uid, i, fi); }}
          onClick={(e) => { e.stopPropagation(); onFrameClick?.(e, uid, i, fi); }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onFrameContextMenu?.(e, uid, i, fi); }}
          onMouseOver={(e) => { e.stopPropagation(); onHover?.(null); }}
          onMouseOut={(e) => { e.stopPropagation(); }}
        />,
      );
    });

    // Advance running offset
    if (seg.properties.offset == null) offsetFrames += seg.properties.duration;
    else offsetFrames = segOffset + seg.properties.duration;
  }

  return (
    <div
      className={wrapClass}
      data-event-uid={uid}
      style={{ transform: axis.framePos === 'top' ? `translateY(${topPx}px)` : `translateX(${topPx}px)`, [axis.frameSize]: totalHeight, ...wrapStyle } as React.CSSProperties}
      onContextMenu={(e) => onContextMenu(e, uid)}
      onMouseDown={(e) => {
        if (e.button === 0) { e.stopPropagation(); if (!notDraggable) onDragStart(e, uid, startFrame); }
      }}
      onClick={(e) => onSelect?.(e, uid)}
      onMouseOver={() => onHover?.(uid)}
      onMouseOut={() => onHover?.(null)}
      onTouchStart={(e) => !notDraggable && onTouchStart?.(e, uid, startFrame)}
    >
      {segmentElements}
      {frameElements}
      {comboWarning && (
        <WarningIcon messages={comboWarningMessages} />
      )}
    </div>
  );
}

/** Custom comparator — skip callback props (always stable via useCallback/noop).
 *  Compare only data props that affect rendering output. */
function eventBlockPropsEqual(prev: EventBlockProps, next: EventBlockProps): boolean {
  // Fast identity check on the event object — covers no-change case
  if (prev.event !== next.event) {
    // Check if the event actually changed in a way that affects rendering
    if (prev.event.uid !== next.event.uid ||
        prev.event.startFrame !== next.event.startFrame ||
        prev.event.segments !== next.event.segments) return false;
  }
  return prev.color === next.color
    && prev.zoom === next.zoom
    && prev.axis === next.axis
    && prev.selected === next.selected
    && prev.hovered === next.hovered
    && prev.label === next.label
    && prev.hoverFrame === next.hoverFrame
    && prev.passive === next.passive
    && prev.notDraggable === next.notDraggable
    && prev.derived === next.derived
    && prev.isAutoFinisher === next.isAutoFinisher
    && prev.comboWarning === next.comboWarning
    && prev.skillElement === next.skillElement
    && prev.selectedFrames === next.selectedFrames
    && prev.eventLayout === next.eventLayout
    && prev.wrapStyle === next.wrapStyle;
}

export default React.memo(EventBlock, eventBlockPropsEqual);
