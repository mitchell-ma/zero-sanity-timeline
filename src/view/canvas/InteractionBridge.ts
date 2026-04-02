/**
 * InteractionBridge — PixiJS-native event handling for the timeline canvas.
 *
 * Follows the PixiJS dragging example pattern:
 * - Display objects have eventMode = 'static' and cursor set
 * - pointerdown on event containers starts drag
 * - stage.on('pointermove') tracks drag movement globally
 * - stage.on('pointerup') ends drag
 *
 * All events are handled at the stage level. PixiJS's built-in scene-graph
 * hit testing identifies the target display object. We walk up from the
 * target to find the event container (__eventUid) and sub-element type (label).
 */
import { Application, Container, FederatedPointerEvent } from 'pixi.js';
import type { CanvasRenderData, CanvasCallbacks } from './canvasTypes';

// ── Synthetic React.MouseEvent from PixiJS FederatedPointerEvent ─────────

function toSynthetic(e: FederatedPointerEvent): React.MouseEvent {
  return {
    clientX: e.clientX,
    clientY: e.clientY,
    button: e.button,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    preventDefault: () => e.preventDefault(),
    stopPropagation: () => e.stopPropagation(),
    nativeEvent: e.nativeEvent,
  } as unknown as React.MouseEvent;
}

/**
 * No-op preventDefault/stopPropagation variant.
 * Calling preventDefault on a native pointerdown suppresses all subsequent
 * mouse compat events (mousemove/mouseup).
 */
function toSyntheticPassive(e: FederatedPointerEvent): React.MouseEvent {
  return {
    clientX: e.clientX,
    clientY: e.clientY,
    button: e.button,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    preventDefault: () => { /* no-op */ },
    stopPropagation: () => { /* no-op */ },
    nativeEvent: e.nativeEvent,
  } as unknown as React.MouseEvent;
}

// ── Display object metadata helpers ──────────────────────────────────────

/** Walk up the display list to find the container tagged with __eventUid. */
function findEventUid(target: Container | null): string | null {
  let cur: Container | null = target;
  while (cur) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((cur as any).__eventUid) return (cur as any).__eventUid;
    cur = cur.parent;
  }
  return null;
}

/** Walk up to find the PixiJS label identifying the sub-element type. */
function getHitLabel(target: Container | null): string | null {
  let cur: Container | null = target;
  while (cur) {
    if (cur.label === 'diamond' || cur.label === 'resize' || cur.label === 'segment' || cur.label === 'warning') return cur.label;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((cur as any).__eventUid) return null; // reached event container
    cur = cur.parent;
  }
  return null;
}

/** Get the direct hit target (the Graphics object with label + indices). */
function findLabelledTarget(target: Container | null): Container | null {
  let cur: Container | null = target;
  while (cur) {
    if (cur.label === 'diamond' || cur.label === 'resize' || cur.label === 'segment') return cur;
    cur = cur.parent;
  }
  return null;
}

// ── InteractionBridge ────────────────────────────────────────────────────

export interface InteractionBridgeConfig {
  app: Application;
  canvasDiv: HTMLElement;
  scrollEl: HTMLElement;
  /** Always returns the latest callbacks (via ref indirection). */
  getCallbacks: () => CanvasCallbacks;
  getData: () => CanvasRenderData | null;
}

export class InteractionBridge {
  private app: Application;
  private canvasDiv: HTMLElement;
  private scrollEl: HTMLElement;
  private getCallbacks: () => CanvasCallbacks;
  private getData: () => CanvasRenderData | null;
  private lastHoveredUid: string | null = null;
  private lastWarningHover = false;
  private lastClickTime = 0;
  private lastClickUid = '';

  constructor(config: InteractionBridgeConfig) {
    this.app = config.app;
    this.canvasDiv = config.canvasDiv;
    this.scrollEl = config.scrollEl;
    this.getCallbacks = config.getCallbacks;
    this.getData = config.getData;

    // ── Stage setup: make entire screen interactive for global tracking ──
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;

    // All interaction handled at stage level — PixiJS hit testing identifies targets
    stage.on('pointermove', this.onStagePointerMove);
    stage.on('pointerup', this.onStagePointerUp);
    stage.on('pointerupoutside', this.onStagePointerUp);
    stage.on('pointerdown', this.onStagePointerDown);
    stage.on('rightdown', this.onStageRightDown);

    // DOM: suppress browser context menu
    this.canvasDiv.addEventListener('contextmenu', this.onDomContextMenu);
  }

  // ── Stage-level handlers ───────────────────────────────────────────────

  /** Global pointermove — drag tracking + hover + cursor + warning tooltip. */
  private onStagePointerMove = (e: FederatedPointerEvent) => {
    this.getCallbacks().onMouseMove(toSynthetic(e));

    const target = e.target as Container;
    const uid = findEventUid(target);
    if (uid !== this.lastHoveredUid) {
      this.lastHoveredUid = uid;
      this.getCallbacks().onEventHover(uid);
    }

    // Warning tooltip — show when hovering over a warning icon
    const hitLabel = getHitLabel(target);
    const isWarning = hitLabel === 'warning' && !!uid;
    if (isWarning !== this.lastWarningHover) {
      this.lastWarningHover = isWarning;
      this.getCallbacks().onWarningHover(isWarning ? uid : null, e.clientX, e.clientY);
    }

    const setCursor = (c: string) => { this.canvasDiv.style.cursor = c; this.app.canvas.style.cursor = c; };
    if (!uid) {
      setCursor('');
    } else {
      if (hitLabel === 'resize' && (e.ctrlKey || e.metaKey)) {
        setCursor('row-resize');
      } else if (hitLabel === 'diamond') {
        setCursor('pointer');
      } else if (hitLabel === 'warning') {
        setCursor('help');
      } else {
        // Set cursor based on event draggability — set on both wrapper div AND
        // the PixiJS canvas element (PixiJS's EventBoundary also sets canvas cursor,
        // so we must override it at the same level).
        const data = this.getData();
        const pres = data ? this.findPresentation(data, uid) : null;
        setCursor(pres?.notDraggable ? 'default' : 'grab');
      }
    }
  };

  /** Global pointerup — ends drags + detects clicks. */
  private onStagePointerUp = (e: FederatedPointerEvent) => {
    this.getCallbacks().onMouseUp();

    if (e.button !== 0) return;
    const target = e.target as Container;
    const uid = findEventUid(target);
    if (!uid) return;

    const hitLabel = getHitLabel(target);
    if (hitLabel === 'diamond') {
      const t = findLabelledTarget(target);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const segIndex = t ? (t as any).__segIndex : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frameIndex = t ? (t as any).__frameIndex : undefined;
      if (segIndex != null && frameIndex != null) {
        this.getCallbacks().onFrameClick(toSynthetic(e), uid, segIndex, frameIndex);
      }
      return;
    }

    // Double-click detection
    const now = Date.now();
    if (uid === this.lastClickUid && now - this.lastClickTime < 300) {
      this.getCallbacks().onEventDoubleClick(toSynthetic(e), uid);
      this.lastClickUid = '';
      this.lastClickTime = 0;
      return;
    }
    this.lastClickUid = uid;
    this.lastClickTime = now;
    this.getCallbacks().onEventSelect(toSynthetic(e), uid);
  };

  /** Stage pointerdown — drag starts + marquee. */
  private onStagePointerDown = (e: FederatedPointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Container;
    const uid = findEventUid(target);

    if (!uid) {
      // Empty space → marquee
      this.getCallbacks().onMarqueeStart(toSyntheticPassive(e));
      return;
    }

    // Event was hit — determine sub-element and start appropriate drag
    const se = toSyntheticPassive(e);
    const hitLabel = getHitLabel(target);

    // Ctrl+click on diamond → frame drag
    if (hitLabel === 'diamond' && (e.ctrlKey || e.metaKey)) {
      const t = findLabelledTarget(target);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const segIndex = t ? (t as any).__segIndex : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frameIndex = t ? (t as any).__frameIndex : undefined;
      if (segIndex != null && frameIndex != null) {
        this.getCallbacks().onFrameDragStart(se, uid, segIndex, frameIndex);
      }
      return;
    }

    // Resize handle → segment resize drag (Ctrl required)
    if (hitLabel === 'resize' && (e.ctrlKey || e.metaKey)) {
      const t = findLabelledTarget(target);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const segIndex = t ? (t as any).__segIndex : undefined;
      if (segIndex != null) {
        this.getCallbacks().onSegmentResizeDragStart(se, uid, segIndex, 'end');
      }
      return;
    }

    // Event body → event drag start (only if draggable)
    const data = this.getData();
    const ev = data ? this.findEvent(data, uid) : null;
    if (ev) {
      const pres = data ? this.findPresentation(data, uid) : null;
      if (pres?.notDraggable) {
        // Not draggable — treat as click on empty space (marquee)
        this.getCallbacks().onMarqueeStart(se);
        return;
      }
      this.getCallbacks().onEventDragStart(se, uid, ev.startFrame);
    }
  };

  /** Stage rightdown — context menus. */
  private onStageRightDown = (e: FederatedPointerEvent) => {
    const target = e.target as Container;
    const uid = findEventUid(target);
    const se = toSynthetic(e);

    if (!uid) {
      const data = this.getData();
      if (data) {
        const col = this.findColumnAtPoint(e, data);
        if (col) this.getCallbacks().onColumnContextMenu(se, col);
      }
      return;
    }

    const hitLabel = getHitLabel(target);

    if (hitLabel === 'diamond') {
      const t = findLabelledTarget(target);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const segIndex = t ? (t as any).__segIndex : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frameIndex = t ? (t as any).__frameIndex : undefined;
      if (segIndex != null && frameIndex != null) {
        this.getCallbacks().onFrameContextMenu(se, uid, segIndex, frameIndex);
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && hitLabel === 'segment') {
      const t = findLabelledTarget(target);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const segIndex = t ? (t as any).__segIndex : undefined;
      if (segIndex != null) {
        this.getCallbacks().onSegmentContextMenu(se, uid, segIndex);
      }
      return;
    }

    this.getCallbacks().onEventContextMenu(se, uid);
  };

  // ── DOM handler ────────────────────────────────────────────────────────

  private onDomContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  // ── Helpers ────────────────────────────────────────────────────────────

  private findPresentation(data: CanvasRenderData, uid: string) {
    for (const [key, pres] of Array.from(data.eventPresentations.entries())) {
      if (key.endsWith(`:${uid}`)) return pres;
    }
    return data.eventPresentations.get(uid) ?? null;
  }

  private findEvent(data: CanvasRenderData, uid: string): { startFrame: number } | null {
    let found: { startFrame: number } | null = null;
    data.columnViewModels.forEach(vm => {
      if (found) return;
      for (const ev of vm.events) {
        if (ev.uid === uid) { found = ev; return; }
      }
    });
    return found;
  }

  private findColumnAtPoint(e: FederatedPointerEvent, data: CanvasRenderData) {
    const rect = this.scrollEl.getBoundingClientRect();
    const contentX = e.clientX - rect.left + this.scrollEl.scrollLeft;
    const contentY = e.clientY - rect.top + this.scrollEl.scrollTop;
    const lanePx = data.isHorizontal ? contentY : contentX;

    let colKey: string | null = null;
    data.columnPositions.forEach((pos, key) => {
      if (lanePx >= pos.left && lanePx < pos.right) colKey = key;
    });
    if (!colKey) return null;
    return data.columns.find(c => c.key === colKey) ?? null;
  }

  destroy() {
    const stage = this.app.stage;
    stage.off('pointermove', this.onStagePointerMove);
    stage.off('pointerup', this.onStagePointerUp);
    stage.off('pointerupoutside', this.onStagePointerUp);
    stage.off('pointerdown', this.onStagePointerDown);
    stage.off('rightdown', this.onStageRightDown);

    this.canvasDiv.removeEventListener('contextmenu', this.onDomContextMenu);
    this.canvasDiv.style.cursor = '';
  }
}
