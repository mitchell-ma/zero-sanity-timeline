/**
 * Object manager for PixiJS display objects used in the timeline canvas.
 *
 * Each event uses TWO containers:
 *   - `container` (in the events layer): segments, labels, resize handles, selection outline
 *   - `diamondContainer` (in the diamond layer): frame diamonds
 * The diamond layer renders above the events layer so diamonds always appear
 * on top of ALL event segments, not just their own.
 *
 * The main container is interactive (eventMode = 'static') so PixiJS's native
 * event system handles hit testing and pointer events directly on the
 * display objects — matching the PixiJS dragging example pattern.
 *
 * No pooling or recycling — each acquire creates fresh objects when needed,
 * and reconcile destroys objects that are no longer visible.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';

/** A display object group for a single event. */
export interface PooledEvent {
  /** Root container for segments/labels/handles (in events layer). */
  container: Container;
  /** Separate container for frame diamonds (in diamond layer, renders above all events). */
  diamondContainer: Container;
  /** Reusable segment rectangles. */
  segments: Graphics[];
  /** Reusable frame diamond shapes. */
  diamonds: Graphics[];
  /** Reusable resize handle hit zones. */
  resizeHandles: Graphics[];
  /** Reusable per-segment text labels. */
  labels: Text[];
  /** Reusable per-label clip masks (Sprites for alpha-gradient fade). */
  labelMasks: Sprite[];
  /** Selection outline overlay. */
  selectionOutline: Graphics;
  /** Warning icon (rendered on top of segments). */
  warningIcon: Graphics;
}

function createPooledEvent(): PooledEvent {
  const container = new Container();
  container.visible = false;
  // Interactive — PixiJS event system handles hit testing natively
  container.eventMode = 'static';
  container.cursor = 'grab';

  const diamondContainer = new Container();
  diamondContainer.visible = false;
  // Diamonds need hit testing for click/context menu
  diamondContainer.eventMode = 'static';

  const selectionOutline = new Graphics();
  selectionOutline.visible = false;
  selectionOutline.eventMode = 'none';
  container.addChild(selectionOutline);

  // Warning icon — on diamond layer so it renders above all events
  const warningIcon = new Graphics();
  warningIcon.visible = false;
  warningIcon.eventMode = 'static';
  warningIcon.cursor = 'help';
  warningIcon.label = 'warning';
  diamondContainer.addChild(warningIcon);

  return {
    container,
    diamondContainer,
    segments: [],
    diamonds: [],
    resizeHandles: [],
    labels: [],
    labelMasks: [],
    selectionOutline,
    warningIcon,
  };
}

export class EventPool {
  private active = new Map<string, PooledEvent>();
  private eventsParent: Container;
  private diamondParent: Container;

  constructor(eventsParent: Container, diamondParent: Container) {
    this.eventsParent = eventsParent;
    this.diamondParent = diamondParent;
  }

  /** Get or create an event display object for the given UID. */
  acquire(uid: string): PooledEvent {
    const obj = this.active.get(uid);
    if (obj) return obj;

    const newObj = createPooledEvent();
    newObj.container.visible = true;
    newObj.diamondContainer.visible = true;
    // Tag containers with event uid for PixiJS event lookup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (newObj.container as any).__eventUid = uid;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (newObj.diamondContainer as any).__eventUid = uid;
    this.active.set(uid, newObj);

    this.eventsParent.addChild(newObj.container);
    this.diamondParent.addChild(newObj.diamondContainer);

    return newObj;
  }

  /** Destroy and remove an event's display objects. */
  private destroy(uid: string) {
    const obj = this.active.get(uid);
    if (!obj) return;

    // Diamonds are direct children of diamondParent, not diamondContainer — destroy them explicitly
    for (const d of obj.diamonds) d.destroy();
    obj.container.destroy({ children: true });
    obj.diamondContainer.destroy({ children: true });
    this.active.delete(uid);
  }

  /** Remove events that are no longer visible — destroys their display objects. */
  reconcile(currentUids: Set<string>) {
    const toRemove: string[] = [];
    this.active.forEach((_obj, uid) => {
      if (!currentUids.has(uid)) toRemove.push(uid);
    });
    for (const uid of toRemove) this.destroy(uid);
  }

  /** Get the event display object for a UID (if active). */
  get(uid: string): PooledEvent | undefined {
    return this.active.get(uid);
  }

  /** Ensure an event has at least N segment graphics. */
  ensureSegments(obj: PooledEvent, count: number) {
    while (obj.segments.length < count) {
      const g = new Graphics();
      g.eventMode = 'static';
      g.label = 'segment';
      obj.container.addChild(g);
      obj.segments.push(g);
    }
    // Hide excess segments
    for (let i = count; i < obj.segments.length; i++) {
      obj.segments[i].visible = false;
    }
  }

  /** Ensure an event has at least N diamond graphics (in diamond layer). */
  ensureDiamonds(obj: PooledEvent, count: number, uid: string) {
    while (obj.diamonds.length < count) {
      const g = new Graphics();
      g.eventMode = 'static';
      g.label = 'diamond';
      g.cursor = 'pointer';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (g as any).__eventUid = uid;
      // Add directly to flat diamond layer (not per-event container)
      // so individual diamonds can be z-sorted by absolute frame
      this.diamondParent.addChild(g);
      obj.diamonds.push(g);
    }
    for (let i = count; i < obj.diamonds.length; i++) {
      obj.diamonds[i].visible = false;
    }
  }

  /** Ensure an event has at least N resize handle graphics. */
  ensureResizeHandles(obj: PooledEvent, count: number) {
    while (obj.resizeHandles.length < count) {
      const g = new Graphics();
      g.eventMode = 'static';
      g.label = 'resize';
      g.cursor = 'default';
      obj.container.addChild(g);
      obj.resizeHandles.push(g);
    }
    for (let i = count; i < obj.resizeHandles.length; i++) {
      obj.resizeHandles[i].visible = false;
    }
  }

  /** Ensure an event has at least N text labels (with corresponding clip masks). */
  ensureLabels(obj: PooledEvent, count: number) {
    while (obj.labels.length < count) {
      const t = new Text({
        text: '',
        style: {
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: 10,
          fontWeight: '600',
          fill: 0xffffff,
          letterSpacing: 0.8,
        },
      });
      t.resolution = 2;
      t.eventMode = 'none';
      const m = new Sprite();
      m.eventMode = 'none';
      obj.container.addChild(m);
      obj.container.addChild(t);
      obj.labels.push(t);
      obj.labelMasks.push(m);
    }
    for (let i = count; i < obj.labels.length; i++) {
      obj.labels[i].visible = false;
      obj.labels[i].mask = null;
      obj.labelMasks[i].visible = false;
    }
  }

  /** Number of active events. */
  get activeCount() { return this.active.size; }

  destroyAll() {
    this.active.forEach(obj => {
      for (const d of obj.diamonds) d.destroy();
      obj.container.destroy({ children: true });
      obj.diamondContainer.destroy({ children: true });
    });
    this.active.clear();
  }
}
