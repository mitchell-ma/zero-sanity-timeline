import { useRef, useCallback, useEffect } from 'react';
import {
  pxPerFrame as getPxPerFrame,
  frameToPx,
  pxToFrame,
  TOTAL_FRAMES,
} from './timeline';
import { ContextMenuState } from '../consts/viewTypes';
import { VERTICAL_AXIS, type AxisMap } from './axisMap';
import { t } from '../locales/locale';

interface TouchDragState {
  touchId: number;
  eventUid: string;
  startClientFrame: number; // touch coordinate along the frame axis at drag start
  startFrame: number;
}

export function useTouchHandlers(opts: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  bodyTopRef: React.RefObject<number | null>;
  zoomRef: React.RefObject<number>;
  onMoveEvent: (id: string, newFrame: number) => void;
  onZoom: (deltaY: number) => void;
  onContextMenu: (state: ContextMenuState | null) => void;
  setHoverFrame: (frame: number | null) => void;
  updateHoverLineDOM: (clientPos: number | null) => void;
  outerRect: DOMRect | null;
  combinedHeaderHeight: number;
  axis?: AxisMap;
}): {
  handleEventTouchStart: (e: React.TouchEvent, eventUid: string, startFrame: number) => void;
} {
  const {
    scrollRef,
    bodyTopRef,
    zoomRef,
    onMoveEvent,
    onZoom,
    onContextMenu,
    setHoverFrame,
    updateHoverLineDOM,
    outerRect,
    combinedHeaderHeight,
    axis = VERTICAL_AXIS,
  } = opts;

  const dragRef = useRef<TouchDragState | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);

  // Stable refs for values used in DOM event listeners
  const outerRectRef = useRef(outerRect);
  outerRectRef.current = outerRect;
  const combinedHeaderHeightRef = useRef(combinedHeaderHeight);
  combinedHeaderHeightRef.current = combinedHeaderHeight;
  const onMoveEventRef = useRef(onMoveEvent);
  onMoveEventRef.current = onMoveEvent;
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const onContextMenuRef = useRef(onContextMenu);
  onContextMenuRef.current = onContextMenu;
  const setHoverFrameRef = useRef(setHoverFrame);
  setHoverFrameRef.current = setHoverFrame;
  const updateHoverLineDOMRef = useRef(updateHoverLineDOM);
  updateHoverLineDOMRef.current = updateHoverLineDOM;

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }, []);

  // ─── Event drag start (called from EventBlock's onTouchStart) ─────────────
  const handleEventTouchStart = useCallback((
    e: React.TouchEvent,
    eventUid: string,
    startFrame: number,
  ) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    dragRef.current = {
      touchId: touch.identifier,
      eventUid,
      startClientFrame: touch[axis.clientFrame],
      startFrame,
    };
  }, [axis]);

  // ─── Attach touchmove / touchend / touchstart listeners via useEffect ─────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function getTouchDistance(t1: Touch, t2: Touch): number {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function handleTouchStart(e: TouchEvent) {
      // Pinch-to-zoom: two fingers
      if (e.touches.length === 2) {
        clearLongPress();
        dragRef.current = null;
        pinchStartDistRef.current = getTouchDistance(e.touches[0], e.touches[1]);
        e.preventDefault();
        return;
      }

      // Long-press detection: single touch not on an event (event touches go through handleEventTouchStart)
      if (e.touches.length === 1 && !dragRef.current) {
        const touch = e.touches[0];
        longPressOriginRef.current = { x: touch.clientX, y: touch.clientY };

        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          const origin = longPressOriginRef.current;
          if (!origin) return;

          // Determine what is under the touch point via data attributes
          const target = document.elementFromPoint(origin.x, origin.y) as HTMLElement | null;
          if (!target) return;

          // Check if an event block was long-pressed
          const eventWrap = target.closest('.event-wrap') as HTMLElement | null;
          if (eventWrap) {
            const eventUid = eventWrap.dataset.eventUid;
            if (eventUid) {
              onContextMenuRef.current({
                x: origin.x,
                y: origin.y,
                items: [
                  { label: t('ctx.editEvent'), action: () => { /* caller handles via context menu */ } },
                  { separator: true },
                  { label: t('ctx.removeEvent'), action: () => {}, danger: true },
                ],
              });
            }
            return;
          }

          // Check if an empty column area was long-pressed
          const subTimeline = target.closest('.tl-sub-timeline') as HTMLElement | null;
          if (subTimeline) {
            const scrollEl = scrollRef.current;
            if (!scrollEl || bodyTopRef.current === null) return;
            const scrollRect = scrollEl.getBoundingClientRect();
            const scrollFrame = scrollEl[axis.scrollPos];
            const originFrame = axis.clientFrame === 'clientY' ? origin.y : origin.x;
            const relFrame = originFrame - scrollRect[axis.rectFrameStart] + scrollFrame - bodyTopRef.current;
            const atFrame = pxToFrame(Math.max(0, relFrame), zoomRef.current);

            onContextMenuRef.current({
              x: origin.x,
              y: origin.y,
              items: [
                { label: `Add event at frame ${atFrame}`, action: () => {} },
              ],
            });
          }
        }, 500);
      }
    }

    function handleTouchMove(e: TouchEvent) {
      // Pinch-to-zoom
      if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
        e.preventDefault();
        const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
        const ratio = pinchStartDistRef.current / currentDist;
        // Convert ratio to a deltaY-like value: pinch out (ratio < 1) = zoom in (negative deltaY)
        const deltaY = (ratio - 1) * 200;
        onZoomRef.current(deltaY);
        pinchStartDistRef.current = currentDist;
        return;
      }

      // Long-press: cancel if finger moved too far
      if (longPressOriginRef.current && e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - longPressOriginRef.current.x;
        const dy = touch.clientY - longPressOriginRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          clearLongPress();
        }
      }

      // Event drag
      if (dragRef.current && e.touches.length === 1) {
        const touch = Array.from(e.touches).find(
          (t) => t.identifier === dragRef.current!.touchId,
        );
        if (!touch) return;
        e.preventDefault();

        const { eventUid, startClientFrame, startFrame } = dragRef.current;
        const deltaFrames = Math.round(
          (touch[axis.clientFrame] - startClientFrame) / getPxPerFrame(zoomRef.current),
        );
        const newFrame = Math.max(0, Math.min(TOTAL_FRAMES - 1, startFrame + deltaFrames));
        onMoveEventRef.current(eventUid, newFrame);

        // Update hover guide line to the dragged event's new position
        const scrollEl = scrollRef.current;
        const rect = outerRectRef.current;
        const bodyTop = bodyTopRef.current;
        if (scrollEl && rect && bodyTop !== null) {
          const scrollFrame = scrollEl[axis.scrollPos];
          const snappedRel = frameToPx(newFrame, zoomRef.current);
          setHoverFrameRef.current(newFrame);
          updateHoverLineDOMRef.current(snappedRel - scrollFrame + rect[axis.rectFrameStart] + bodyTop);
        }
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      // Clear long-press
      clearLongPress();

      // Clear event drag if the matching touch ended
      if (dragRef.current) {
        const stillActive = Array.from(e.touches).some(
          (t) => t.identifier === dragRef.current!.touchId,
        );
        if (!stillActive) {
          dragRef.current = null;
          setHoverFrameRef.current(null);
          updateHoverLineDOMRef.current(null);
        }
      }

      // Clear pinch state when fewer than 2 touches remain
      if (e.touches.length < 2) {
        pinchStartDistRef.current = null;
      }
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      clearLongPress();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, bodyTopRef, zoomRef, clearLongPress]);

  return { handleEventTouchStart };
}
