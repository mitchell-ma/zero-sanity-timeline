/**
 * React wrapper for the PixiJS timeline canvas.
 *
 * Viewport-sized canvas inside the scroll container with position:sticky.
 * Events drawn at viewport-relative positions (frameToPx - scrollOffset).
 * Scroll offset updated imperatively for instant response.
 *
 * Interaction uses PixiJS-native events (eventMode, pointerdown/pointermove/
 * pointerup on stage + display objects) — matching the PixiJS dragging example.
 */
import { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { Application } from 'pixi.js';
import { TimelineRenderer } from './TimelineRenderer';
import { InteractionBridge } from './InteractionBridge';
import type { CanvasRenderData, CanvasCallbacks } from './canvasTypes';
import { TIME_AXIS_WIDTH } from '../../utils/timeline';

/** Column layout recipe — enough info to recompute pixel positions for any container width. */
export interface ColumnLayoutRecipe {
  keys: string[];
  frValues: number[];
  totalFr: number;
}

function recomputeColumnPositions(recipe: ColumnLayoutRecipe, containerWidth: number) {
  const pxPerFr = recipe.totalFr > 0 ? (containerWidth - TIME_AXIS_WIDTH) / recipe.totalFr : 0;
  const map = new Map<string, { left: number; right: number }>();
  let x = TIME_AXIS_WIDTH;
  for (let i = 0; i < recipe.keys.length; i++) {
    const w = recipe.frValues[i] * pxPerFr;
    map.set(recipe.keys[i], { left: x, right: x + w });
    x += w;
  }
  return map;
}

export interface TimelineCanvasProps {
  data: CanvasRenderData;
  tlHeight: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  callbacks?: CanvasCallbacks;
  /** Ref to column layout recipe for imperative resize recomputation. */
  columnLayoutRef: React.RefObject<ColumnLayoutRecipe>;
  /** Exposed renderer ref for imperative updates (e.g. patchHoverFrame). */
  canvasRendererRef?: React.MutableRefObject<TimelineRenderer | null>;
}

export function TimelineCanvas({ data, tlHeight, scrollRef, callbacks, columnLayoutRef, canvasRendererRef }: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const rendererRef = useRef<TimelineRenderer | null>(null);
  const bridgeRef = useRef<InteractionBridge | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const [ready, setReady] = useState(false);

  // Set initial container size synchronously before first paint.
  // ResizeObserver maintains it thereafter — React never touches height/marginBottom.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const se = scrollRef.current;
    if (container && se) {
      const h = se.clientHeight;
      container.style.height = `${h}px`;
      container.style.marginBottom = `${-h}px`;
    }
  }, [scrollRef]);

  // Initialize PixiJS application
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Per-invocation flag — survives React strict mode double-fire.
    // Each effect run gets its own `destroyed` via closure, so the second
    // run's reset doesn't clobber the first cleanup's flag.
    let destroyed = false;

    const app = new Application();
    appRef.current = app;

    const w = scrollRef.current?.clientWidth ?? 800;
    const h = scrollRef.current?.clientHeight ?? 800;

    app.init({
      background: 0x000000,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      width: w,
      height: h,
    }).then(() => {
      if (destroyed) {
        try { app.destroy(true, { children: true }); } catch { /* noop */ }
        return;
      }
      if (!containerRef.current) return;

      // Prevent PixiJS from blocking native scroll
      if (app.renderer.events) {
        app.renderer.events.autoPreventDefault = false;
      }

      containerRef.current.appendChild(app.canvas as HTMLCanvasElement);

      const renderer = new TimelineRenderer(app);
      rendererRef.current = renderer;
      if (canvasRendererRef) canvasRendererRef.current = renderer;

      // Set initial scroll offset — ticker will handle first render
      const se = scrollRef.current;
      if (se) renderer.scrollOffset = dataRef.current.isHorizontal ? se.scrollLeft : se.scrollTop;
      renderer.update(dataRef.current);

      // Wire up PixiJS-native interaction bridge
      if (callbacks && containerRef.current && scrollRef.current) {
        bridgeRef.current = new InteractionBridge({
          app,
          canvasDiv: containerRef.current,
          scrollEl: scrollRef.current,
          getCallbacks: () => callbacksRef.current!,
          getData: () => dataRef.current,
        });
      }

      setReady(true);
    });

    return () => {
      destroyed = true;
      setReady(false);
      if (bridgeRef.current) {
        bridgeRef.current.destroy();
        bridgeRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
        if (canvasRendererRef) canvasRendererRef.current = null;
      }
      if (appRef.current) {
        try { appRef.current.destroy(true, { children: true }); } catch { /* noop */ }
      }
      appRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Imperative scroll listener — updates scroll offset and redraws
  useEffect(() => {
    const se = scrollRef.current;
    if (!ready || !se || !rendererRef.current) return;

    const renderer = rendererRef.current;
    const onScroll = () => {
      renderer.scrollOffset = dataRef.current.isHorizontal ? se.scrollLeft : se.scrollTop;
      // Re-queue current data for redraw at new scroll position
      renderer.update(dataRef.current);
    };
    se.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => se.removeEventListener('scroll', onScroll);
  }, [ready, scrollRef]);

  // Track Ctrl key for canvas resize-handle visibility + cursor
  useEffect(() => {
    if (!ready || !rendererRef.current) return;
    const renderer = rendererRef.current;
    const onKey = (e: KeyboardEvent) => {
      const held = e.ctrlKey || e.metaKey;
      if (held !== renderer.ctrlHeld) {
        renderer.ctrlHeld = held;
        renderer.update(dataRef.current);
      }
    };
    const onBlur = () => {
      if (renderer.ctrlHeld) {
        renderer.ctrlHeld = false;
        renderer.update(dataRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [ready]);

  // Resize — observe scroll container directly for instant response (no React state roundtrip).
  // Recomputes column positions from the live container width so events track CSS layout exactly.
  useEffect(() => {
    const se = scrollRef.current;
    if (!ready || !se || !rendererRef.current) return;
    const renderer = rendererRef.current;
    const handleResize = () => {
      const w = se.clientWidth;
      const h = se.clientHeight;
      if (w <= 0 || h <= 0) return;

      // Read actual column positions from DOM grid cells — more accurate than
      // fr-based math because CSS grid accounts for min-height constraints.
      const isHoriz = dataRef.current.isHorizontal;
      const seRect = se.getBoundingClientRect();
      const domPositions = new Map<string, { left: number; right: number }>();
      const colEls = Array.from(se.querySelectorAll<HTMLElement>('[data-col-key]'));
      for (const el of colEls) {
        const key = el.getAttribute('data-col-key');
        if (!key) continue;
        const r = el.getBoundingClientRect();
        if (isHoriz) {
          domPositions.set(key, { left: r.top - seRect.top, right: r.bottom - seRect.top });
        } else {
          domPositions.set(key, { left: r.left - seRect.left, right: r.right - seRect.left });
        }
      }

      if (domPositions.size > 0) {
        renderer.patchColumnPositions(domPositions);
      } else {
        // Fallback to fr-based computation when DOM elements aren't available yet
        const recipe = columnLayoutRef.current;
        if (recipe) {
          const crossSize = isHoriz ? h : w;
          const livePositions = recomputeColumnPositions(recipe, crossSize);
          renderer.patchColumnPositions(livePositions);
        }
      }
      // Update container div imperatively — keeps it in sync with the canvas
      // resize in the same synchronous callback, preventing blank-frame flicker.
      const container = containerRef.current;
      if (container) {
        container.style.height = `${h}px`;
        container.style.marginBottom = `${-h}px`;
      }
      renderer.resize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(se);
    handleResize();
    return () => ro.disconnect();
  }, [ready, scrollRef, columnLayoutRef]);

  // Sync render data to the PixiJS renderer during render (not in an effect).
  // React render runs synchronously BEFORE the next rAF, so the dirty flag
  // is set before the PixiJS ticker checks it. Effects run AFTER the ticker
  // has already checked dirty for this frame, causing a one-frame delay.
  if (ready && rendererRef.current) {
    rendererRef.current.update(data);
  }

  return (
    <div
      ref={containerRef}
      className="timeline-canvas"
      style={{
        position: 'sticky',
        top: 0,
        left: 0,
        width: '100%',
        pointerEvents: callbacks ? 'auto' : 'none',
        zIndex: 10,
      }}
    />
  );
}
