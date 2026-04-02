# PixiJS Canvas Timeline Migration — Full Implementation Plan

## Context

The timeline renders hundreds of DOM elements (event blocks with segments, frame diamonds, labels) that cause jank during drag and scroll. We're migrating event rendering to PixiJS canvas for performance.

The canvas infrastructure is partially built in `src/view/canvas/` but the pieces aren't connected:
- `TimelineRenderer.ts` uses a single-GraphicsContext approach (slow, no culling, no hit testing)
- `EventPool.ts` + `EventRenderer.ts` implement proper per-event Container pooling (better) but are UNUSED
- `HitTester.ts` + `InteractionBridge.ts` implement spatial hit testing + event routing but are UNUSED
- Canvas has `pointerEvents: 'none'` and `hideEvents={false}`, so DOM events still render on top

**Goal:** Replace DOM event rendering with PixiJS canvas, keeping all interactions working identically.

---

## Architecture Decision

**Canvas renders:** Events (segments, diamonds, labels, outlines, resize handles), gridlines
**DOM keeps:** Resource graphs (SVG), combo/SP zones, micro-column dividers, hover line, marquee, time-stop bands, ghost events, column hover highlight, warning icons

This split makes sense because events are the performance bottleneck (hundreds of objects redrawn on drag), while overlays are few DOM elements driven by React state.

---

## Phase 1: Rewrite TimelineRenderer to use EventPool + EventRenderer

### File: `src/view/canvas/TimelineRenderer.ts` — FULL REWRITE

**Current state:** Single `Graphics` object. Builds a new `GraphicsContext` each tick, swaps it. Draws gridlines + all events in one giant path. No object pooling, no culling, no text labels.

**New architecture:**
```
app.stage
├── gridlinesGraphics    (single Graphics — redrawn on zoom/scroll/resize)
└── eventsContainer      (Container — holds EventPool's per-event Containers)
```

**Replace the constructor/ticker pattern:**

```typescript
export class TimelineRenderer {
  private app: Application;
  private gridlines: Graphics;
  private eventsContainer: Container;
  private pool: EventPool;
  private currentData: CanvasRenderData | null = null;
  private dirty = true;
  private lastGridKey = '';
  scrollOffset = 0;

  constructor(app: Application) {
    this.app = app;
    this.gridlines = new Graphics();
    this.eventsContainer = new Container();
    this.pool = new EventPool(this.eventsContainer);
    
    app.stage.addChild(this.gridlines);
    app.stage.addChild(this.eventsContainer);

    app.ticker.add(() => {
      if (!this.currentData || !this.dirty) return;
      this.dirty = false;
      this.rebuild(this.currentData);
    });
  }
```

**The `rebuild(data)` method replaces `buildContext(data)`:**

1. **Gridlines** — draw into `this.gridlines` (same logic as current, but use the Graphics directly instead of a context):
   ```typescript
   const gridKey = `${zoom}:${visStart}:${visEnd}:${isHorizontal}:${so}`;
   if (gridKey !== this.lastGridKey) {
     this.lastGridKey = gridKey;
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
   ```

2. **Events** — iterate columnViewModels, call `renderEvent()` from EventRenderer for each visible event, then position the container:
   ```typescript
   const visibleUids = new Set<string>();
   
   columnViewModels.forEach((viewModel, colKey) => {
     const pos = colPos.get(colKey);
     if (!pos) return;
     
     for (const event of viewModel.events) {
       // Visibility check (same as current)
       const evEnd = computeEventEnd(event); // helper from current code
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
       renderEvent(
         this.pool, uid, event,
         mp ? { ...pres, color: mp.color ?? pres.color } : pres,
         zoom, isHorizontal,
         selectedIds.has(uid), hoveredId === uid,
         laneW, layout, hoverFrame,
       );
       
       // Position the container (absolute Y minus scroll offset)
       const obj = this.pool.get(uid);
       if (obj) {
         const topPx = (layout ? frameToPx(layout.realStartFrame, zoom) : frameToPx(event.startFrame, zoom)) - so;
         if (isHorizontal) {
           obj.container.x = topPx;
           obj.container.y = laneX;
         } else {
           obj.container.x = laneX;
           obj.container.y = topPx;
         }
       }
     }
   });
   
   // Release events no longer visible
   this.pool.reconcile(visibleUids);
   ```

3. **Remove** the old `gfx`, `buildContext`, and `GraphicsContext` import. The `render()` method should just call `this.rebuild(this.currentData)` + `this.app.renderer.render(...)`.

4. **Expose pool for hit testing:** Add a getter `get eventPool() { return this.pool; }` (InteractionBridge will need it in Phase 2).

**Key import changes:**
- Remove: `GraphicsContext`
- Add: `Container` from pixi.js
- Add: `EventPool` from `./EventPool`
- Add: `renderEvent` from `./EventRenderer`

### File: `src/view/CombatPlanner.tsx` — Compute eventLayouts

**Line 1050** currently has `eventLayouts: new Map()`. Replace with actual computed layouts.

Add import:
```typescript
import { buildTimelineLayout } from '../controller/timeline/timelineLayout';
```

Add a useMemo after the `computeAllValidations` call (line ~482):
```typescript
const timelineLayoutData = useMemo(
  () => buildTimelineLayout(events),
  [events],
);
```

Update `canvasRenderData` (line ~1050):
```typescript
eventLayouts: timelineLayoutData.events,  // was: new Map()
```

Add `timelineLayoutData` to the useMemo dependency array on line ~1064.

### File: `src/view/canvas/EventRenderer.ts` — Minor fixes

The `renderEvent` function is already well-implemented. Verify these details match DOM:

1. **Micro-column color override:** The caller in TimelineRenderer must pass `mp.color` when a micro-position exists (see line in rebuild above where we spread `{ ...pres, color: mp.color ?? pres.color }`).

2. **`visualActivationDuration` handling:** EventRenderer currently doesn't handle `pres.visualActivationDuration` (which replaces segments with a single duration segment in the DOM). Add this at the top of `renderEvent`:
   ```typescript
   if (presentation.visualActivationDuration != null) {
     // Override segments with single-duration visual
     event = {
       ...event,
       segments: [{ properties: { duration: presentation.visualActivationDuration }, frames: [] }],
     } as TimelineEvent;
   }
   ```
   Import `durationSegment` from `../../consts/viewTypes` or inline the construction.

### Verification (Phase 1)

After Phase 1, keep `hideEvents={false}` and `pointerEvents: 'none'`. Both DOM and canvas events render. Visually compare:
- Take screenshot with Playwright MCP
- Canvas events should pixel-match DOM events (position, color, alpha, labels)
- Check: segments with correct alpha, frame diamonds at correct positions, labels visible

---

## Phase 2: Wire InteractionBridge + HitTester

### File: `src/view/canvas/TimelineCanvas.tsx`

**Change 1: Enable pointer events on canvas div**

Change the container div style from `pointerEvents: 'none'` to `pointerEvents: 'auto'`:
```typescript
style={{
  ...
  pointerEvents: callbacks ? 'auto' : 'none',  // enable when callbacks provided
  ...
}}
```

**Change 2: Instantiate HitTester + InteractionBridge after app init**

Add imports:
```typescript
import { HitTester } from './HitTester';
import { InteractionBridge } from './InteractionBridge';
```

Add refs:
```typescript
const hitTesterRef = useRef<HitTester | null>(null);
const bridgeRef = useRef<InteractionBridge | null>(null);
```

After `setReady(true)` in the init `.then()` block (around line 75), add:
```typescript
if (callbacks) {
  hitTesterRef.current = new HitTester();
  bridgeRef.current = new InteractionBridge({
    canvasDiv: containerRef.current!,
    scrollEl: scrollRef.current!,
    hitTester: hitTesterRef.current,
    callbacks,
    getData: () => dataRef.current,
  });
}
```

In the cleanup function (around line 78), add before app destroy:
```typescript
if (bridgeRef.current) {
  bridgeRef.current.destroy();
  bridgeRef.current = null;
}
hitTesterRef.current = null;
```

### File: `src/view/canvas/HitTester.ts` — Add eventLayouts awareness

Currently `HitTester.test()` uses `frameToPx(event.startFrame, zoom)` for event positioning. But with time-stop layouts, the visual position uses `layout.realStartFrame`. Update the `test` method:

In the event loop (around line 85), change:
```typescript
const evTopPx = frameToPx(event.startFrame, zoom);
```
to:
```typescript
const layout = data.eventLayouts?.get(event.uid);
const evTopPx = layout ? frameToPx(layout.realStartFrame, zoom) : frameToPx(event.startFrame, zoom);
```

Also update segment rect computation in `getSegmentRects` to use layout segments when available. Add `layout` parameter:
```typescript
function getSegmentRects(event: TimelineEvent, zoom: number, layout?: EventLayout) {
  const rects: { topPx: number; heightPx: number; segIndex: number }[] = [];
  let offsetFrames = 0;
  for (let i = 0; i < event.segments.length; i++) {
    const seg = event.segments[i];
    const segLayout = layout?.segments?.[i];
    const segOffset = seg.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)
      ? 0
      : seg.properties.offset != null ? seg.properties.offset : offsetFrames;
    const segTopPx = segLayout ? durationToPx(segLayout.realOffset, zoom) : durationToPx(segOffset, zoom);
    const segH = segLayout ? durationToPx(segLayout.realDuration, zoom) : durationToPx(seg.properties.duration, zoom);
    if (segH > 0) {
      rects.push({ topPx: segTopPx, heightPx: segH, segIndex: i });
    }
    if (seg.properties.offset == null) offsetFrames += seg.properties.duration;
    else offsetFrames = segOffset + seg.properties.duration;
  }
  return rects;
}
```

Update the call site: `getSegmentRects(event, zoom, layout)`.

Also update frame diamond hit testing to use `derivedOffsetFrame`:
```typescript
const fPx = evTopPx + sr.topPx + durationToPx(f.derivedOffsetFrame ?? f.offsetFrame, zoom);
```
(This may already be correct — verify.)

### File: `src/view/canvas/InteractionBridge.ts` — Add cursor management + click/drag disambiguation

**Cursor management** in `onPointerMove`:
```typescript
private onPointerMove = (e: PointerEvent) => {
  const hit = this.hitTest(e);
  const uid = hit?.type === 'event' || hit?.type === 'frame' ? hit.eventUid ?? null : null;
  if (uid !== this.lastHoveredUid) {
    this.lastHoveredUid = uid;
    this.callbacks.onEventHover(uid);
  }
  
  // Update cursor based on hit target
  if (hit?.type === 'resize-handle') {
    this.canvasDiv.style.cursor = 'row-resize';
  } else if (hit?.type === 'event') {
    this.canvasDiv.style.cursor = 'grab';
  } else if (hit?.type === 'frame') {
    this.canvasDiv.style.cursor = 'pointer';
  } else {
    this.canvasDiv.style.cursor = '';
  }
};
```

**Click vs drag disambiguation:** Currently `onPointerDown` immediately calls `onEventDragStart` for left-click on events. But single clicks should route to `onEventSelect`. The existing CombatPlanner drag pipeline already handles this — `handleEventDragStart` sets up the drag state but the event doesn't move until `mousemove` exceeds a threshold. The click handler fires on `mouseup` if no drag occurred. So the current routing is correct — `onPointerDown → onEventDragStart` is fine because CombatPlanner's handlers disambiguate internally.

However, we need to also fire `onEventSelect` on click (mouseup without drag). Add to InteractionBridge:
```typescript
private pendingClick: { uid: string; event: PointerEvent } | null = null;

private onPointerDown = (e: PointerEvent) => {
  const hit = this.hitTest(e);
  if (!hit) return;
  e.stopImmediatePropagation();
  const se = toSyntheticNoStop(e);

  if (e.button === 0) {
    if (hit.type === 'frame' && ...) { ... }
    else if (hit.type === 'resize-handle' && ...) { ... }
    else if (hit.type === 'event' && hit.eventUid) {
      this.pendingClick = { uid: hit.eventUid, event: e };
      const data = this.getData();
      const ev = data ? this.findEvent(data, hit.eventUid) : null;
      if (ev) {
        this.callbacks.onEventDragStart(se, hit.eventUid, ev.startFrame);
      }
    } else if (hit.type === 'column-empty') {
      this.callbacks.onMarqueeStart(se);
    }
  }
};
```

Actually — reviewing CombatPlanner's handlers more carefully: `handleEventDragStart` is called on mousedown and begins drag tracking. `handleEventSelect` is called via `onClick` on the EventBlock wrapper. In the DOM, both fire — mousedown starts drag tracking, click fires selection. 

Looking at the DOM EventBlock (line 531-534):
```tsx
onMouseDown={(e) => { if (e.button === 0) { e.stopPropagation(); if (!notDraggable) onDragStart(e, uid, startFrame); } }}
onClick={(e) => onSelect?.(e, uid)}
```

So **both** fire. The InteractionBridge currently only fires `onEventDragStart` on pointerdown. It needs to also fire `onEventSelect` on click. Add a `click` listener:

```typescript
constructor(config) {
  ...
  this.canvasDiv.addEventListener('click', this.onClick);
}

private onClick = (e: MouseEvent) => {
  if (e.button !== 0) return;
  const hit = this.hitTest(e);
  if (hit?.type === 'event' && hit.eventUid) {
    this.callbacks.onEventSelect(toSynthetic(e), hit.eventUid);
  }
};

destroy() {
  ...
  this.canvasDiv.removeEventListener('click', this.onClick);
}
```

### File: `src/view/CombatPlanner.tsx` — Flip hideEvents

Change line 2360:
```typescript
hideEvents={false}
```
to:
```typescript
hideEvents
```

And define `hideEvents` near the `useCanvasTimeline` flag:
```typescript
const useCanvasTimeline = true;
const hideEvents = useCanvasTimeline; // hide DOM events when canvas is active
```

### Verification (Phase 2)

- DOM events hidden, canvas events visible
- Click an event → selection outline appears
- Right-click event → context menu opens at correct position
- Double-click event → edit panel opens
- Drag event → moves smoothly
- Hover event → gray outline, cursor changes to grab
- Hover resize handle → cursor changes to row-resize
- Right-click column empty → column context menu
- Marquee drag on empty space → selection box appears
- Ctrl+click frame diamond → frame drag starts

---

## Phase 3: Visual Parity Polish

After Phase 2 works, fix any visual discrepancies:

### Segment borders
The DOM has dashed borders between non-first segments. EventRenderer currently uses simple `roundRect` fill+stroke. To match:
- Between segments: draw a dashed line at the boundary (or accept the visual difference — segments already have distinct positioning)
- The `stroke()` call in EventRenderer uses the segment color — verify alpha matches DOM

### Glow effect on active segments
DOM uses `box-shadow: 0 0 6px color@35%, inset 0 1px 0 rgba(255,255,255,0.12)`. Canvas equivalent would be a DropShadow filter, but that's expensive. **Skip glow on canvas** — the performance gain is more important than this subtle visual effect. The segment fill+stroke already provides visual distinction.

### Label visibility threshold
EventRenderer (line 297) already checks `totalHeightPx > 14`. Verify segment-level label logic matches DOM:
- DOM shows per-segment labels (segment name or display label for single-segment events)
- EventRenderer currently shows one label per event. May need to add per-segment labels.
- For Phase 3, keep the current single-label approach — it's close enough. Per-segment labels can be added later if needed.

### Warning icons
Keep as DOM overlay. When `hideEvents={true}`, warning icons disappear (they're children of EventBlock). To restore them:
- Add a separate React overlay layer in CombatPlanner that renders warning icons for events with `comboWarning`
- Position them using `columnPositions` + `frameToPx()` (same as ghost events)
- This is low priority — defer to Phase 4 if needed.

---

## File Change Summary

| File | Phase | Change |
|------|-------|--------|
| `src/view/canvas/TimelineRenderer.ts` | 1 | **Full rewrite:** Replace GraphicsContext swap with EventPool+EventRenderer. Stage hierarchy: gridlines Graphics + events Container. Ticker calls renderEvent() per visible event, positions containers, reconciles pool. |
| `src/view/CombatPlanner.tsx` | 1+2 | Add `buildTimelineLayout()` call, pass `eventLayouts` to canvas. Add `hideEvents` flag. |
| `src/view/canvas/EventRenderer.ts` | 1 | Add `visualActivationDuration` handling at top of `renderEvent()`. |
| `src/view/canvas/TimelineCanvas.tsx` | 2 | Enable `pointerEvents: 'auto'`. Instantiate HitTester + InteractionBridge after app init. Clean up on unmount. |
| `src/view/canvas/HitTester.ts` | 2 | Add eventLayouts awareness: use `layout.realStartFrame` for event positioning, pass layout to `getSegmentRects()`. |
| `src/view/canvas/InteractionBridge.ts` | 2 | Add cursor management in onPointerMove. Add click listener for onEventSelect. |

## Existing Code to Reuse (DO NOT rewrite)

- `EventPool` (`src/view/canvas/EventPool.ts`) — acquire/release/reconcile, fully implemented
- `renderEvent()` (`src/view/canvas/EventRenderer.ts`) — draws segments, diamonds, labels, outlines  
- `HitTester` (`src/view/canvas/HitTester.ts`) — spatial hit testing with priority order
- `InteractionBridge` (`src/view/canvas/InteractionBridge.ts`) — pointer event translation
- `buildTimelineLayout()` (`src/controller/timeline/timelineLayout.ts:222`) — time-stop layout computation
- `frameToPx`, `durationToPx`, `pxPerFrame`, `getTickMarks` (`src/utils/timeline.ts`)
- `computeTimelinePresentation`, `computeEventPresentation` (`src/controller/timeline/eventPresentationController.ts`)

## Key Data Flow

```
CombatPlanner
  ├── columnViewModels = computeTimelinePresentation(events, columns)  [Map<colKey, ColumnViewModel>]
  ├── eventPresentations = Map<"colKey:uid", EventPresentation>  (label, color, passive, derived, etc.)
  ├── timelineLayoutData = buildTimelineLayout(events)  → { events: Map<uid, EventLayout>, timeStopRegions, totalRealFrames }
  ├── columnPositions = Map<colKey, { left, right }>  (pixel bounds from grid fractions)
  └── canvasRenderData = { columns, columnViewModels, eventPresentations, eventLayouts, columnPositions, zoom, ... }
       └── TimelineCanvas
            └── TimelineRenderer.rebuild(data)
                 ├── gridlines: single Graphics pass
                 └── per event: renderEvent(pool, uid, event, pres, zoom, ...) → positions pooled Container
```

## PixiJS API Notes

- **Graphics.roundRect(x, y, w, h, r)** + `.fill({color, alpha})` + `.stroke({color, alpha, width})` — for segments
- **Graphics.moveTo/lineTo/closePath** + `.fill({color})` — for diamond shapes
- **Text({text, style})** — for labels (Rajdhani 11px, white, resolution: 2)
- **Container.addChild()** — scene graph hierarchy
- **Display object updates MUST happen inside `app.ticker.add()` callbacks** (per CLAUDE.md)
- **`app.renderer.events.autoPreventDefault = false`** — prevent PixiJS blocking scroll (already set)
- **Object pooling via EventPool** — reuse Containers, toggle visibility, avoid GC

## Verification Checklist

After each phase, run:
1. `npx tsc --noEmit` on changed files
2. `npx eslint` on changed files  
3. Take Playwright screenshot and compare
4. Test interactions manually:
   - Single click → select
   - Double click → edit panel
   - Right click → context menu
   - Drag → move event
   - Shift+scroll → zoom
   - Hover → outline + cursor
   - Marquee → multi-select
   - Frame click → frame select
   - Resize handle drag → segment resize
