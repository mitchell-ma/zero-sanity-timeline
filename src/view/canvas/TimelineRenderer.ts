/**
 * TimelineRenderer — draws timeline events using PixiJS v8.
 *
 * Uses EventPool for per-event Container pooling + EventRenderer for
 * segment/diamond/label drawing. Stage hierarchy:
 *   app.stage
 *   ├── gridlinesGraphics   (single Graphics — redrawn on zoom/scroll/resize)
 *   ├── eventsContainer     (Container — holds per-event segment/label/handle Containers)
 *   └── diamondLayer        (Container — holds per-event diamond Containers, above all segments)
 */
import { Application, Graphics, Container } from 'pixi.js';
import type { CanvasRenderData } from './canvasTypes';
import { EventPool } from './EventPool';
import { renderEvent } from './EventRenderer';
import { SegmentType } from '../../consts/enums';
import { frameToPx, durationToPx, pxPerFrame, getTickMarks, TOTAL_FRAMES, TIMELINE_TOP_PAD } from '../../utils/timeline';

export class TimelineRenderer {
  private app: Application;
  private gridlines: Graphics;
  private timeStopOverlay: Graphics;
  private eventsContainer: Container;
  private diamondLayer: Container;
  private pool: EventPool;
  private currentData: CanvasRenderData | null = null;
  private dirty = true;
  private lastGridKey = '';
  /** Imperative hoverFrame override — updated synchronously from mouse move,
   *  takes precedence over React-state hoverFrame in currentData. */
  private hoverFrameOverride: number | null | undefined = undefined;
  /** Imperative column positions override — read from actual DOM layout,
   *  takes precedence over React-computed fr-based positions. */
  private columnPositionsOverride: Map<string, { left: number; right: number }> | null = null;
  scrollOffset = 0;
  ctrlHeld = false;

  constructor(app: Application) {
    this.app = app;
    this.gridlines = new Graphics();
    this.timeStopOverlay = new Graphics();
    this.timeStopOverlay.eventMode = 'none';
    this.eventsContainer = new Container();
    this.eventsContainer.sortableChildren = true;
    this.diamondLayer = new Container();
    this.diamondLayer.sortableChildren = true;
    this.pool = new EventPool(this.eventsContainer, this.diamondLayer);

    app.stage.addChild(this.gridlines);
    app.stage.addChild(this.timeStopOverlay);
    app.stage.addChild(this.eventsContainer);
    app.stage.addChild(this.diamondLayer);

    app.ticker.add(() => {
      if (!this.currentData || !this.dirty) return;
      this.dirty = false;
      this.rebuild(this.currentData);
    });
  }

  update(data: CanvasRenderData) {
    this.currentData = data;
    this.dirty = true;
  }

  /** Imperatively patch column positions from DOM layout (takes precedence over React-computed values). */
  patchColumnPositions(positions: Map<string, { left: number; right: number }>) {
    this.columnPositionsOverride = positions;
    this.dirty = true;
  }

  /** Imperatively patch hoverFrame for instant diamond highlight updates. */
  patchHoverFrame(hoverFrame: number | null) {
    this.hoverFrameOverride = hoverFrame;
    this.dirty = true;
  }

  get eventPool() { return this.pool; }
  get pixiApp() { return this.app; }
  get events() { return this.eventsContainer; }

  private rebuild(data: CanvasRenderData) {
    const { columnViewModels, eventPresentations, eventLayouts,
      zoom, isHorizontal, totalRealFrames, selectedIds, selectedFrames, draggingIds, hoveredId } = data;
    // Prefer imperative overrides over React-state values (which lag by one render cycle).
    const hoverFrame = this.hoverFrameOverride !== undefined ? this.hoverFrameOverride : data.hoverFrame;
    const domColPos = this.columnPositionsOverride ?? data.columnPositions;

    const so = this.scrollOffset;
    const res = this.app.renderer.resolution || 1;
    const canvasFrameExtent = isHorizontal
      ? this.app.renderer.width / res
      : this.app.renderer.height / res;
    const ppf = pxPerFrame(zoom);
    const visStart = Math.max(0, Math.floor((so - TIMELINE_TOP_PAD - 500) / ppf));
    const visEnd = Math.min(TOTAL_FRAMES, Math.ceil((so + canvasFrameExtent + 500 - TIMELINE_TOP_PAD) / ppf));

    const colPos = new Map<string, { x: number; width: number }>();
    domColPos.forEach((pos, key) => { colPos.set(key, { x: pos.left, width: pos.right - pos.left }); });

    // ── Gridlines ───────────────────────────────────────────────────────
    const canvasW = this.app.renderer.width / res;
    const gridKey = `${zoom}:${visStart}:${visEnd}:${isHorizontal}:${so}:${canvasW}:${colPos.size}`;
    if (gridKey !== this.lastGridKey) {
      this.lastGridKey = gridKey;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.gridlines as any).didViewUpdate = false;
      this.gridlines.clear();

      const ticks = getTickMarks(zoom, visStart, visEnd, totalRealFrames);
      for (const tick of ticks) {
        const px = frameToPx(tick.frame, zoom) - so;
        colPos.forEach(pos => {
          if (isHorizontal) { this.gridlines.moveTo(px, pos.x); this.gridlines.lineTo(px, pos.x + pos.width); }
          else { this.gridlines.moveTo(pos.x, px); this.gridlines.lineTo(pos.x + pos.width, px); }
        });
        this.gridlines.stroke({ color: 0x333333, alpha: tick.major ? 0.35 : 0.15, width: 1 });
      }
    }

    // ── Time-stop overlays (below events) ─────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.timeStopOverlay as any).didViewUpdate = false;
    this.timeStopOverlay.clear();
    if (data.timeStopRegions.length > 0) {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const tsColor = isLight ? 0x888888 : 0xffffff;
      const tsAlpha = isLight ? 0.35 : 0.2;
      for (const stop of data.timeStopRegions) {
        const stopTopPx = frameToPx(stop.startFrame, zoom) - so;
        const stopH = durationToPx(stop.durationFrames, zoom);
        if (stopTopPx + stopH < 0 || stopTopPx > canvasFrameExtent) continue;
        colPos.forEach(pos => {
          if (isHorizontal) {
            this.timeStopOverlay.rect(stopTopPx, pos.x, stopH, pos.width);
          } else {
            this.timeStopOverlay.rect(pos.x, stopTopPx, pos.width, stopH);
          }
        });
        this.timeStopOverlay.fill({ color: tsColor, alpha: tsAlpha });
      }
    }

    // ── Events ──────────────────────────────────────────────────────────
    const visibleUids = new Set<string>();

    columnViewModels.forEach((viewModel, colKey) => {
      const pos = colPos.get(colKey);
      if (!pos) return;

      for (let evIdx = 0; evIdx < viewModel.events.length; evIdx++) {
        const event = viewModel.events[evIdx];
        // Visibility check
        let evEnd = event.startFrame;
        let running = 0;
        for (const s of event.segments) {
          const off = s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)
            ? 0 : s.properties.offset != null ? s.properties.offset : running;
          const end = off + s.properties.duration;
          if (end > evEnd - event.startFrame) evEnd = event.startFrame + end;
          running = s.properties.offset == null ? running + s.properties.duration : end;
        }
        if (evEnd < visStart || event.startFrame > visEnd) continue;

        const uid = event.uid;
        visibleUids.add(uid);

        const pres = eventPresentations.get(`${colKey}:${uid}`) ?? eventPresentations.get(uid);
        if (!pres) continue;

        const layout = eventLayouts.get(uid);

        // Compute lane position (micro-columns / overlap lanes)
        const mp = viewModel.microPositions.get(uid);
        const ol = viewModel.overlapLanes.get(uid);
        const laneX = pos.x + (mp ? mp.leftFrac * pos.width : ol ? (ol.lane / ol.laneCount) * pos.width : 0);
        const laneW = mp ? mp.widthFrac * pos.width : ol ? pos.width / ol.laneCount : pos.width;

        // Render the event into its pooled container
        // Collect selected frame indices for this event
        const evSelectedFrames = selectedFrames.filter(sf => sf.eventUid === uid);

        const topPx = (layout ? frameToPx(layout.realStartFrame, zoom) : frameToPx(event.startFrame, zoom)) - so;
        // Absolute diamond origin — diamonds are direct children of the flat diamondLayer
        const diamondOrigin = isHorizontal ? { x: topPx, y: laneX } : { x: laneX, y: topPx };

        renderEvent(
          this.pool, uid, event,
          mp ? { ...pres, color: mp.color ?? pres.color } : pres,
          zoom, isHorizontal,
          selectedIds.has(uid), hoveredId === uid,
          laneW, evIdx, layout, hoverFrame, evSelectedFrames,
          this.ctrlHeld, diamondOrigin, !!(draggingIds?.has(uid)),
        );

        const obj = this.pool.get(uid);
        if (obj) {
          // Passive events (combo activation windows) render behind normal events
          obj.container.zIndex = pres.passive ? 0 : 1;
          if (isHorizontal) {
            obj.container.x = topPx;
            obj.container.y = laneX;
            obj.diamondContainer.x = topPx;
            obj.diamondContainer.y = laneX;
          } else {
            obj.container.x = laneX;
            obj.container.y = topPx;
            obj.diamondContainer.x = laneX;
            obj.diamondContainer.y = topPx;
          }
        }
      }
    });

    // Release events no longer visible
    this.pool.reconcile(visibleUids);
  }

  resize(width: number, height: number) {
    this.app.renderer.resize(width, height);
    this.lastGridKey = '';   // invalidate gridlines cache
    // Rebuild display objects AND force an immediate pixel render so the canvas
    // is never painted blank. rebuild() only updates display object state;
    // without app.render(), pixels aren't drawn until the next ticker cycle.
    if (this.currentData) {
      this.dirty = false;
      this.rebuild(this.currentData);
      this.app.render();
    }
  }

  destroy() {
    this.pool.destroyAll();
    this.gridlines.destroy();
    this.timeStopOverlay.destroy();
    this.eventsContainer.destroy({ children: true });
    this.diamondLayer.destroy({ children: true });
    this.app.stage.removeChildren();
  }
}
