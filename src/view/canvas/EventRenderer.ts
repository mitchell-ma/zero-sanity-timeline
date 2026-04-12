/**
 * Renders a single event (segments + frame diamonds) onto pooled PixiJS objects.
 * Pure function — takes data, writes to PooledEvent graphics. No state.
 */
import type { EventPool } from './EventPool';
import type { TimelineEvent, EventSegmentData, EventFrameMarker } from '../../consts/viewTypes';
import type { EventPresentation } from '../../controller/timeline/eventPresentationController';
import type { EventLayout } from '../../controller/timeline/timelineLayout';
import { ColorMatrixFilter, Texture, ImageSource } from 'pixi.js';
import { durationToPx } from '../../utils/timeline';
import { SegmentType, ELEMENT_COLORS, ElementType, CritMode, EventFrameType } from '../../consts/enums';
import { getRuntimeCritMode } from '../../controller/combatStateController';
import { VerbType, NounType, AdjectiveType } from '../../dsl/semantics';
import { getStatusElementMap } from '../../controller/gameDataStore';
import { hasDealDamageClause } from '../../controller/timeline/clauseQueries';
import { formatSegmentShortName } from '../../dsl/semanticsTranslation';

/** Match trailing roman numeral (I–XX) or arabic number at end of label. */
const TRAILING_NUMERAL_RE = /\s+((?:X{0,2}(?:IX|IV|V?I{0,3}))|(?:\d+))$/;

// ── Gradient mask texture (shared, created once) ──────────────────────
// White-to-transparent vertical gradient: solid for most of the height,
// fades to 0 alpha over the last ~15%. Used as a Sprite alpha mask on labels.
let _fadeMaskTexture: Texture | null = null;
const FADE_TEX_H = 128;
const FADE_FRACTION = 0.08; // last 8% fades out
function getFadeMaskTexture(): Texture {
  if (_fadeMaskTexture) return _fadeMaskTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = FADE_TEX_H;
  const ctx = canvas.getContext('2d')!;
  const fadeStart = Math.floor(FADE_TEX_H * (1 - FADE_FRACTION));
  // Solid white region
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 4, fadeStart);
  // Gradient fade region
  const grad = ctx.createLinearGradient(0, fadeStart, 0, FADE_TEX_H);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, fadeStart, 4, FADE_TEX_H - fadeStart);
  _fadeMaskTexture = new Texture({ source: new ImageSource({ resource: canvas }) });
  return _fadeMaskTexture;
}

// ── Color utilities ────────────────────────────────────────────────────

export function hexToNum(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

function alternateColor(hex: string): number {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 15);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 15);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 15);
  return (r << 16) | (g << 8) | b;
}

function darkenColor(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}


function mixWithWhite75(hex: string): number {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * 0.75 + 255 * 0.25));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * 0.75 + 255 * 0.25));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * 0.75 + 255 * 0.25));
  return (r << 16) | (g << 8) | b;
}

// ── Segment styling ────────────────────────────────────────────────────

interface SegStyle { bgAlpha: number; borderAlpha: number; }

const STYLE_COOLDOWN: SegStyle = { bgAlpha: 0.2, borderAlpha: 0.2 };
const STYLE_ANIMATION: SegStyle = { bgAlpha: 0.2, borderAlpha: 0.2 };
const STYLE_STASIS: SegStyle = { bgAlpha: 0.7, borderAlpha: 0.85 };
const STYLE_ACTIVE: SegStyle = { bgAlpha: 0.9, borderAlpha: 1.0 };
const STYLE_PASSIVE: SegStyle = { bgAlpha: 0.15, borderAlpha: 0 };

function getSegStyle(seg: EventSegmentData, passive: boolean): SegStyle {
  if (passive) return STYLE_PASSIVE;
  const types = seg.properties.segmentTypes;
  if (types?.includes(SegmentType.COOLDOWN) || types?.includes(SegmentType.IMMEDIATE_COOLDOWN)) return STYLE_COOLDOWN;
  if (types?.includes(SegmentType.ANIMATION)) return STYLE_ANIMATION;
  if (types?.includes(SegmentType.STASIS)) return STYLE_STASIS;
  return STYLE_ACTIVE;
}

// ── Frame diamond helpers ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

function getFrameElementColor(f: EventFrameMarker, skillElement?: string): number | undefined {
  // Priority chain:
  //   1. Explicit frame element (author declared `properties.element`, surfaced
  //      as `damageElement`) — highest priority because it reflects explicit intent
  //   2. DEAL DAMAGE effect's `objectQualifier` — inferred from the damage itself
  //   3. APPLY / CONSUME effect's element qualifier (inflictions, reactions,
  //      element-tagged statuses) — inferred from secondary effects
  //   4. Fall back to the skill's declared element
  let el: string | undefined = f.damageElement;
  if (!el && f.clauses) {
    // DEAL DAMAGE walk
    outer: for (const pred of f.clauses) {
      for (const ef of pred.effects) {
        const dsl = ef.dslEffect;
        if (!dsl) continue;
        if (dsl.verb === VerbType.DEAL && dsl.object === NounType.DAMAGE && dsl.objectQualifier) {
          el = dsl.objectQualifier as string;
          break outer;
        }
      }
    }
  }
  if (!el && f.clauses) {
    // Inflictions / reactions / element-tagged statuses walk
    outer: for (const pred of f.clauses) {
      for (const ef of pred.effects) {
        const dsl = ef.dslEffect;
        if (!dsl) continue;
        const q = dsl.objectQualifier;
        if (dsl.verb === VerbType.APPLY || dsl.verb === VerbType.CONSUME) {
          if (dsl.object === NounType.INFLICTION && q) { el = q; break outer; }
          if (dsl.object === NounType.STATUS && dsl.objectId === NounType.REACTION && q) {
            el = getStatusElementMap()[q]; break outer;
          }
          if (dsl.object === NounType.STATUS && dsl.objectId
              && dsl.objectId !== AdjectiveType.PHYSICAL
              && dsl.objectId !== NounType.REACTION) {
            el = getStatusElementMap()[dsl.objectId]; break outer;
          }
        }
      }
    }
  }
  if (!el) el = skillElement;
  if (!el) return undefined;
  const base = ELEMENT_COLORS[el as ElementType];
  if (!base) return undefined;
  return mixWithWhite75(base);
}

function isFrameVisualCrit(f: EventFrameMarker): boolean {
  const mode = getRuntimeCritMode();
  if (mode === CritMode.ALWAYS || mode === CritMode.EXPECTED) return hasDealDamageClause(f.clauses);
  if (mode === CritMode.NEVER) return false;
  return !!f.isCrit;
}

/** Get the majority element color from a segment's frames. */
function getSegmentMajorityElement(seg: EventSegmentData, skillElement?: string): number | undefined {
  // Use segment-level element if set
  if (seg.properties.element) {
    const c = ELEMENT_COLORS[seg.properties.element as ElementType];
    if (c) return hexToNum(c);
  }
  // Count element occurrences across frames
  if (!seg.frames || seg.frames.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const f of seg.frames) {
    const el = f.damageElement ?? skillElement;
    if (el) counts.set(el, (counts.get(el) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  // Find majority
  let maxEl = '';
  let maxCount = 0;
  counts.forEach((count, el) => { if (count > maxCount) { maxCount = count; maxEl = el; } });
  const c = ELEMENT_COLORS[maxEl as ElementType];
  return c ? hexToNum(c) : undefined;
}

const HOVER_BRIGHTNESS_FILTER = new ColorMatrixFilter();
HOVER_BRIGHTNESS_FILTER.brightness(1.1, false);

const DIAMOND_HALF = 9;
const CRIT_DOT_HALF = 2;
const LANE_INSET = 2;

// ── Main render function ───────────────────────────────────────────────

export function renderEvent(
  pool: EventPool,
  uid: string,
  event: TimelineEvent,
  presentation: EventPresentation,
  zoom: number,
  isHorizontal: boolean,
  selected: boolean,
  hovered: boolean,
  columnWidth: number,
  /** Index of this event within its column — used for alternating colors between adjacent events. */
  eventIndex: number,
  layout?: EventLayout,
  hoverFrame?: number | null,
  selectedFrames?: readonly { eventUid: string; segmentIndex: number; frameIndex: number }[],
  ctrlHeld = false,
  diamondOrigin?: { x: number; y: number },
  isDragging = false,
) {
  const obj = pool.acquire(uid);

  // Reset PixiJS v8's didViewUpdate flag so that subsequent clear()+draw
  // calls properly register with the render group via onViewUpdate().
  // After _buildInstructions (structural change), PixiJS does NOT reset
  // this flag — leaving it true causes onViewUpdate()'s guard to bail,
  // preventing the Graphics from being added to childrenRenderablesToUpdate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resetView = (o: any) => { o.didViewUpdate = false; };
  for (const seg of obj.segments) resetView(seg);
  for (const d of obj.diamonds) resetView(d);
  for (const h of obj.resizeHandles) resetView(h);
  if (obj.selectionOutline) resetView(obj.selectionOutline);
  for (const l of obj.labelMasks) resetView(l);

  let { segments } = event;
  if (!segments || segments.length === 0) {
    obj.container.visible = false;
    return;
  }

  // Visual truncation: when the presentation specifies a clamped visual duration
  // (e.g. stacking statuses where later instances visually clamp earlier ones),
  // replace segments with a single segment of the clamped duration and skip layout.
  if (presentation.visualActivationDuration != null) {
    segments = [{
      properties: { duration: presentation.visualActivationDuration },
      frames: [],
    } as EventSegmentData];
    layout = undefined;
  }

  // Compute total span
  let fallbackTotal = 0;
  if (!layout) {
    let running = 0;
    for (const s of segments) {
      const off = s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)
        ? 0 : s.properties.offset != null ? s.properties.offset : running;
      const end = off + s.properties.duration;
      if (end > fallbackTotal) fallbackTotal = end;
      running = s.properties.offset == null ? running + s.properties.duration : end;
    }
  }
  const totalHeightPx = presentation.visualActivationDuration != null
    ? durationToPx(presentation.visualActivationDuration, zoom)
    : layout
      ? durationToPx(layout.realTotalDuration, zoom)
      : durationToPx(fallbackTotal, zoom);

  if (totalHeightPx <= 0) {
    obj.container.visible = false;
    return;
  }

  const laneW = columnWidth;
  const inset = LANE_INSET;
  const eventW = Math.max(4, laneW - inset * 2);
  obj.container.visible = true;
  obj.container.cursor = presentation.notDraggable ? 'default' : 'grab';
  obj.diamondContainer.cursor = presentation.notDraggable ? 'default' : 'grab';
  const baseColor = hexToNum(presentation.color);
  const isSingleSeg = segments.length === 1;

  // ── Segments ─────────────────────────────────────────────────────────
  pool.ensureSegments(obj, segments.length);

  let totalDiamondCount = 0;
  for (const seg of segments) totalDiamondCount += seg.frames?.length ?? 0;
  pool.ensureDiamonds(obj, totalDiamondCount, uid);

  const handleCount = segments.length > 0 && !presentation.passive ? segments.length : 0;
  pool.ensureResizeHandles(obj, handleCount);

  // We need per-segment labels — ensure enough Text objects
  pool.ensureLabels(obj, segments.length);

  let offsetFrames = 0;
  let diamondIdx = 0;
  let maxSegEndPx = 0; // track actual rendered extent for outline
  const segEndPositions: number[] = [];
  // Collect segment rects for overlay highlighting (drawn on selectionOutline later)
  const segRects: { topPx: number; h: number; absStart: number; absDur: number }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segLayout = layout?.segments?.[i];
    const segOffset = seg.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)
      ? 0 : seg.properties.offset != null ? seg.properties.offset : offsetFrames;

    const segTopPx = Math.round(segLayout
      ? durationToPx(segLayout.realOffset, zoom)
      : durationToPx(segOffset, zoom));
    // Use the shorter of layout duration and event segment duration — truncateDerivedEvents
    // may shorten the event's segments without updating the layout.
    const segVisualDur = segLayout
      ? Math.min(segLayout.realDuration, seg.properties.duration)
      : seg.properties.duration;
    const segEndPx = Math.round(segLayout
      ? durationToPx(segLayout.realOffset + segVisualDur, zoom)
      : durationToPx(segOffset + seg.properties.duration, zoom));
    const segH = segEndPx - segTopPx;
    if (segEndPx > maxSegEndPx) maxSegEndPx = segEndPx;



    const g = obj.segments[i];
    g.clear();
    g.cursor = presentation.notDraggable ? 'default' : 'grab';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g as any).__segIndex = i;

    if (segH <= 0) {
      g.visible = false;
      if (obj.labels[i]) obj.labels[i].visible = false;
      if (seg.properties.offset == null) offsetFrames += seg.properties.duration;
      else offsetFrames = segOffset + seg.properties.duration;
      segEndPositions.push(segTopPx);
      continue;
    }

    g.visible = true;
    const isNonDamage = seg.properties.segmentTypes?.some(
      t => t === SegmentType.ANIMATION || t === SegmentType.COOLDOWN || t === SegmentType.IMMEDIATE_COOLDOWN,
    );
    // Segment color: use majority frame element color if frames have element data,
    // otherwise fall back to presentation color with alternation.
    const isOdd = isSingleSeg ? (eventIndex % 2 === 1) : (i % 2 === 1);
    let segColorNum: number;
    const segElement = getSegmentMajorityElement(seg, presentation.skillElement);
    if (segElement && !isNonDamage) {
      segColorNum = isOdd ? darkenColor(segElement, 0.85) : segElement;
    } else {
      segColorNum = isOdd ? alternateColor(presentation.color) : baseColor;
    }

    const style = getSegStyle(seg, presentation.passive);

    // Segment absolute position (for hover-follow label and segRects)
    const segAbsStart = layout
      ? layout.realStartFrame + (segLayout?.realOffset ?? 0)
      : event.startFrame + segOffset;

    if (isHorizontal) {
      g.roundRect(0, 0, segH, eventW, 2);
      g.fill({ color: segColorNum, alpha: style.bgAlpha });
      g.x = segTopPx; g.y = inset;
    } else {
      g.roundRect(0, 0, eventW, segH, 2);
      g.fill({ color: segColorNum, alpha: style.bgAlpha });
      g.x = inset; g.y = segTopPx;
    }
    segRects.push({ topPx: segTopPx, h: segH, absStart: segAbsStart, absDur: segVisualDur });

    // ── Per-segment label ─────────────────────────────────────────────
    // Single-segment: show event label. Multi-segment: show segment name,
    // fall back to I/II/III for non-animation/cooldown if name doesn't fit.
    const isAnimOrCooldown = isNonDamage;
    const isBatk = event.columnId === NounType.BASIC_ATTACK;
    let segLabelText: string | undefined;
    if (isSingleSeg && isBatk && event.segmentOrigin != null) {
      // Individual BATK segment placed via context menu — show Roman numeral
      segLabelText = seg.properties.name ?? formatSegmentShortName(undefined, event.segmentOrigin[0]);
    } else if (isSingleSeg) {
      const fullLabel = presentation.label;
      if (fullLabel) {
        // Try full label first; fall back to trailing numeral (stack indicator) if too wide
        const trailingMatch = fullLabel.match(TRAILING_NUMERAL_RE);
        segLabelText = (fullLabel.length * 6 + 8 <= segH)
          ? fullLabel
          : (trailingMatch?.[1] ?? fullLabel);
      }
    } else if (seg.properties.name) {
      const segName = seg.properties.name;
      if (!isAnimOrCooldown && isBatk && segName.length * 6 + 8 > segH) {
        // BATK: fall back to Roman numeral when name doesn't fit
        segLabelText = i < 10 ? formatSegmentShortName(undefined, i) : `${i + 1}`;
      } else {
        segLabelText = segName;
      }
    } else if (!isAnimOrCooldown && isBatk) {
      // No name — use numeral only for basic attacks
      segLabelText = i < 10 ? formatSegmentShortName(undefined, i) : `${i + 1}`;
    }

    const labelObj = obj.labels[i];
    if (labelObj && segH > 14 && segLabelText) {
      // IMMEDIATE_COOLDOWN starts at offset 0 and overlaps active segments —
      // push the label past the overlapping content, still within this segment.
      const isCooldownOverlap = seg.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN) && segOffset === 0;
      const LABEL_PAD = 6;
      const labelStartPx = isCooldownOverlap
        ? Math.max(segTopPx + LABEL_PAD, Math.round(durationToPx(offsetFrames, zoom)) + LABEL_PAD)
        : segTopPx + LABEL_PAD;

      labelObj.text = segLabelText;
      labelObj.visible = true;
      const isLight = presentation.passive && document.documentElement.getAttribute('data-theme') === 'light';
      labelObj.alpha = isLight ? 0.25 : 0.9;
      labelObj.style.fill = isLight ? 0x000000 : 0xffffff;

      // Alpha-gradient mask: Sprite stretched to segment bounds.
      // Texture is solid white with a fade-to-transparent at the bottom ~15%.
      // PixiJS uses the mask's alpha channel — text fades smoothly at the segment edge.
      const maskSprite = obj.labelMasks[i];
      if (maskSprite) {
        maskSprite.texture = getFadeMaskTexture();
        maskSprite.visible = true;
        if (isHorizontal) {
          maskSprite.x = segTopPx;
          maskSprite.y = 0;
          maskSprite.width = segH;
          maskSprite.height = eventW + inset * 2;
        } else {
          maskSprite.x = 0;
          maskSprite.y = segTopPx;
          maskSprite.width = eventW + inset * 2;
          maskSprite.height = segH;
        }
        labelObj.mask = maskSprite;
      }

      const sr = segRects[i];
      const segEndPxLocal = segTopPx + segH;
      // During drag, pin label to the head of the segment
      const markerInSeg = !isDragging && sr && !presentation.passive && hoverFrame != null
        && hoverFrame >= sr.absStart && hoverFrame < sr.absStart + sr.absDur;

      if (isHorizontal) {
        labelObj.angle = 0;
        labelObj.anchor.set(0, 0.5);
        const cy = inset + eventW / 2;
        if (markerInSeg) {
          const hoverPx = segTopPx + durationToPx(hoverFrame! - sr.absStart, zoom) + LABEL_PAD;
          labelObj.x = Math.max(Math.min(hoverPx, segEndPxLocal - LABEL_PAD), labelStartPx);
        } else {
          labelObj.x = labelStartPx;
        }
        labelObj.y = cy;
      } else {
        labelObj.angle = 90;
        labelObj.anchor.set(0, 0.5);
        const cx = inset + eventW / 2;
        if (markerInSeg) {
          const hoverPx = segTopPx + durationToPx(hoverFrame! - sr.absStart, zoom) + LABEL_PAD;
          labelObj.x = cx;
          labelObj.y = Math.max(Math.min(hoverPx, segEndPxLocal - LABEL_PAD), labelStartPx);
        } else {
          labelObj.x = cx;
          labelObj.y = labelStartPx;
        }
      }
    } else if (labelObj) {
      labelObj.visible = false;
      labelObj.mask = null;
      if (obj.labelMasks[i]) obj.labelMasks[i].visible = false;
    }

    // ── Frame diamonds ────────────────────────────────────────────────
    // Skip frames in 0-duration segments (conditional segments like Vajra Impact without LINK)
    if (seg.frames && seg.properties.duration > 0) {
      // Pre-compute lateral offsets for co-located frames (same offset → adjacent diamonds)
      const frameLateralOffsets: number[] = [];
      for (let fi = 0; fi < seg.frames.length; fi++) {
        const offset = seg.frames[fi].derivedOffsetFrame ?? seg.frames[fi].offsetFrame;
        let groupIdx = 0;
        for (let pfi = 0; pfi < fi; pfi++) {
          const prevOffset = seg.frames[pfi].derivedOffsetFrame ?? seg.frames[pfi].offsetFrame;
          if (prevOffset === offset) groupIdx++;
        }
        frameLateralOffsets.push(groupIdx);
      }

      for (let fi = 0; fi < seg.frames.length; fi++) {
        const f = seg.frames[fi];
        const framePx = segTopPx + durationToPx(f.derivedOffsetFrame ?? f.offsetFrame, zoom);
        const lateralShift = frameLateralOffsets[fi] * DIAMOND_HALF * 2;
        const dg = obj.diamonds[diamondIdx];
        dg.clear();
        dg.cursor = presentation.notDraggable ? 'default' : 'pointer';
        dg.visible = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (dg as any).__segIndex = i; (dg as any).__frameIndex = fi;

        const elColor = getFrameElementColor(f, seg.properties.element ?? presentation.skillElement);
        const isCrit = isFrameVisualCrit(f);
        const isFinisher = (f.frameTypes ?? []).includes(EventFrameType.FINISHER);
        const isFrameSelected = selectedFrames?.some(sf => sf.segmentIndex === i && sf.frameIndex === fi) ?? false;
        const baseFillColor = elColor ?? (isCrit ? 0xffcc00 : isFinisher ? 0xff6666 : 0xffffff);

        // Highlight diamond when hover marker overlaps the diamond's visual extent.
        // Compare pixel positions directly: framePx is the diamond's event-local px,
        // hoverPxLocal is the hover line's event-local px.
        const hoverPxLocal = hoverFrame != null ? durationToPx(hoverFrame - event.startFrame, zoom) : null;
        const isHoverHit = hoverPxLocal != null && Math.abs(hoverPxLocal - framePx) <= DIAMOND_HALF;
        const isHighlighted = isHoverHit || isFrameSelected;
        const fillColor = isHighlighted ? 0xffdd44 : baseFillColor;
        const alpha = isHighlighted ? 1.0 : 0.85;
        // Deep outline: darken the fill color
        const outlineColor = darkenColor(fillColor, 0.5);
        const strokeWidth = isHighlighted ? 2 : 1.5;

        // Compute absolute frame for zIndex ordering
        const segOffset = seg.properties.offset != null ? seg.properties.offset : (offsetFrames);
        const absFrame = event.startFrame + segOffset + (f.derivedOffsetFrame ?? f.offsetFrame);
        const ox = diamondOrigin?.x ?? 0;
        const oy = diamondOrigin?.y ?? 0;

        const isDealDamage = hasDealDamageClause(f.clauses);
        if (isHorizontal) {
          const cx = framePx - segTopPx;
          const cy = inset + eventW + lateralShift;
          if (isDealDamage) {
            dg.moveTo(cx, cy - DIAMOND_HALF);
            dg.lineTo(cx + DIAMOND_HALF, cy);
            dg.lineTo(cx, cy + DIAMOND_HALF);
            dg.lineTo(cx - DIAMOND_HALF, cy);
            dg.closePath();
          } else {
            dg.circle(cx, cy, DIAMOND_HALF * 0.8);
          }
          dg.fill({ color: fillColor, alpha });
          dg.stroke({ color: outlineColor, alpha: isHighlighted ? 1.0 : 0.8, width: strokeWidth });
          if (isCrit) {
            dg.rect(cx - CRIT_DOT_HALF, cy - CRIT_DOT_HALF, CRIT_DOT_HALF * 2, CRIT_DOT_HALF * 2);
            dg.fill({ color: 0xffdd44 });
          }
          dg.x = ox + segTopPx; dg.y = oy;
        } else {
          const cx = inset + eventW - lateralShift;
          const cy = framePx - segTopPx;
          if (isDealDamage) {
            dg.moveTo(cx, cy - DIAMOND_HALF);
            dg.lineTo(cx + DIAMOND_HALF, cy);
            dg.lineTo(cx, cy + DIAMOND_HALF);
            dg.lineTo(cx - DIAMOND_HALF, cy);
            dg.closePath();
          } else {
            dg.circle(cx, cy, DIAMOND_HALF * 0.8);
          }
          dg.fill({ color: fillColor, alpha });
          dg.stroke({ color: outlineColor, alpha: isHighlighted ? 1.0 : 0.8, width: strokeWidth });
          if (isCrit) {
            dg.rect(cx - CRIT_DOT_HALF, cy - CRIT_DOT_HALF, CRIT_DOT_HALF * 2, CRIT_DOT_HALF * 2);
            dg.fill({ color: 0xffdd44 });
          }
          dg.x = ox; dg.y = oy + segTopPx;
        }
        // Later frames render on top of earlier frames
        dg.zIndex = absFrame;
        diamondIdx++;
      }
    }

    segEndPositions.push(segTopPx + segH);
    if (seg.properties.offset == null) offsetFrames += seg.properties.duration;
    else offsetFrames = segOffset + seg.properties.duration;
  }

  // Hide excess diamonds (e.g. conditional segment went from active → 0 duration)
  for (let i = diamondIdx; i < obj.diamonds.length; i++) {
    obj.diamonds[i].visible = false;
  }

  // Hide excess labels and masks
  for (let i = segments.length; i < obj.labels.length; i++) {
    obj.labels[i].visible = false;
    obj.labels[i].mask = null;
    if (obj.labelMasks[i]) obj.labelMasks[i].visible = false;
  }

  // Resize handles
  if (!presentation.passive) {
    for (let i = 0; i < segEndPositions.length; i++) {
      if (i >= obj.resizeHandles.length) break;
      const h = obj.resizeHandles[i];
      h.clear();
      h.visible = true;
      h.cursor = ctrlHeld ? 'row-resize' : 'default';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (h as any).__segIndex = i;
      const bPx = segEndPositions[i];
      if (ctrlHeld) {
        // Visible boundary line when Ctrl held
        const lineAlpha = 0.35;
        if (isHorizontal) {
          h.rect(bPx - 3, inset, 6, eventW);
          h.fill({ color: 0xffffff, alpha: 0.01 });
          h.rect(bPx, inset, 1, eventW);
          h.fill({ color: 0xffffff, alpha: lineAlpha });
        } else {
          h.rect(inset, bPx - 3, eventW, 6);
          h.fill({ color: 0xffffff, alpha: 0.01 });
          h.rect(inset, bPx, eventW, 1);
          h.fill({ color: 0xffffff, alpha: lineAlpha });
        }
      } else {
        // Invisible hit area only
        if (isHorizontal) {
          h.rect(bPx - 3, inset, 6, eventW);
          h.fill({ color: 0xffffff, alpha: 0.01 });
        } else {
          h.rect(inset, bPx - 3, eventW, 6);
          h.fill({ color: 0xffffff, alpha: 0.01 });
        }
      }
      h.x = 0; h.y = 0;
    }
  }

  // ── Hover-line segment highlighting ──────────────────────────────────
  // Determine which segment (if any) the hover line intersects.
  // Intersected segment keeps full brightness; non-intersected segments dim slightly.
  let hoverSegIdx = -1;
  if (hoverFrame != null && !presentation.passive) {
    for (let si = 0; si < segRects.length; si++) {
      const sr = segRects[si];
      if (hoverFrame >= sr.absStart && hoverFrame < sr.absStart + sr.absDur) {
        hoverSegIdx = si;
        break;
      }
    }
  }
  for (let si = 0; si < obj.segments.length; si++) {
    obj.segments[si].filters = si === hoverSegIdx ? [HOVER_BRIGHTNESS_FILTER] : null;
  }

  // ── Event border + selection outline ────────────────────────────────
  // Use actual rendered segment extent (maxSegEndPx) rather than pre-computed totalHeightPx,
  // so the outline matches the visual span (e.g. when segments are clamped by time-stops).
  const outlineH = maxSegEndPx > 0 ? maxSegEndPx : totalHeightPx;
  const outline = obj.selectionOutline;
  outline.clear();
  outline.visible = true;

  // Event border — darkened base color
  if (isHorizontal) { outline.roundRect(0, inset, outlineH, eventW, 2); }
  else { outline.roundRect(inset, 0, eventW, outlineH, 2); }
  outline.stroke({ color: darkenColor(baseColor, 0.4), alpha: presentation.passive ? 0.3 : 0.8, width: 1 });

  // Selection outline: bright blue (skip for non-draggable derived events); Hover outline: warm amber
  if (selected && !presentation.notDraggable) {
    if (isHorizontal) { outline.roundRect(0, inset, outlineH, eventW, 2); }
    else { outline.roundRect(inset, 0, eventW, outlineH, 2); }
    outline.stroke({ color: 0x64c8ff, alpha: 0.9, width: 2 });
  } else if (hovered) {
    if (isHorizontal) { outline.roundRect(0, inset, outlineH, eventW, 2); }
    else { outline.roundRect(inset, 0, eventW, outlineH, 2); }
    outline.stroke({ color: 0xffcc66, alpha: 0.6, width: 1.5 });
  }

  // ── Warning icon (validation warning triangle) ──────────────────────
  // Drawn on the diamond layer so it renders above all event segments,
  // and positioned at the top-right of the event (vertical) or top-left (horizontal).
  const warnG = obj.warningIcon;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (warnG as any).didViewUpdate = false;
  warnG.clear();
  if (presentation.comboWarning) {
    const s = 15;
    // Above the event in vertical mode, left of event in horizontal mode
    const cx = isHorizontal ? -s - 8 : inset + (eventW - s) / 2;
    const cy = isHorizontal ? inset + (eventW - s) / 2 : -s - 8;
    // Orange triangle with dark outline
    warnG.moveTo(cx + s / 2, cy);
    warnG.lineTo(cx + s, cy + s);
    warnG.lineTo(cx, cy + s);
    warnG.closePath();
    warnG.fill({ color: 0xf0a030, alpha: 0.95 });
    warnG.stroke({ color: 0x000000, alpha: 0.6, width: 0.5 });
    // Exclamation mark
    const ex = cx + s / 2;
    warnG.rect(ex - 1, cy + s * 0.25, 2, s * 0.4);
    warnG.fill({ color: 0x000000, alpha: 0.9 });
    warnG.circle(ex, cy + s * 0.8, 1);
    warnG.fill({ color: 0x000000, alpha: 0.9 });
    warnG.visible = true;
    // Ensure it's on the diamond layer (above all events)
    obj.diamondContainer.addChild(warnG);
  } else {
    warnG.visible = false;
  }
}
