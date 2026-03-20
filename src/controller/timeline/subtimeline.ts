import { TimelineEvent, durationSegment } from "../../consts/viewTypes";

export type SubtimelineListener = (events: TimelineEvent[]) => void;

let _nextId = 1;
function genId(): string {
  return `ev-${_nextId++}`;
}

/**
 * Manages a sorted list of TimelineEvents for a single column
 * (e.g. one operator skill column or one enemy status column).
 * Events are kept sorted by startFrame at all times.
 */
export class Subtimeline {
  readonly ownerId: string;
  readonly columnId: string;

  private events: TimelineEvent[] = [];
  private listeners: Set<SubtimelineListener> = new Set();

  constructor(ownerId: string, columnId: string) {
    this.ownerId = ownerId;
    this.columnId = columnId;
  }

  /** Subscribe to event list changes. Returns an unsubscribe function. */
  subscribe(listener: SubtimelineListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    const snapshot = this.getEvents();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  /** Get a shallow copy of the sorted event list. */
  getEvents(): TimelineEvent[] {
    return [...this.events];
  }

  /** Find an event by id, or undefined. */
  getEvent(id: string): TimelineEvent | undefined {
    return this.events.find((ev) => ev.id === id);
  }

  /** Add a new event with the given parameters. Returns the created event. */
  addEvent(params: {
    name?: string;
    startFrame: number;
    activationDuration: number;
    activeDuration: number;
    cooldownDuration: number;
  }): TimelineEvent {
    const ev: TimelineEvent = {
      id: genId(),
      name: params.name ?? this.columnId,
      ownerId: this.ownerId,
      columnId: this.columnId,
      startFrame: params.startFrame,
      segments: durationSegment(params.activationDuration),
    };
    this.insertSorted(ev);
    this.notify();
    return ev;
  }

  /** Remove an event by id. Returns true if found and removed. */
  removeEvent(id: string): boolean {
    const idx = this.events.findIndex((ev) => ev.id === id);
    if (idx === -1) return false;
    this.events.splice(idx, 1);
    this.notify();
    return true;
  }

  /** Update an event's fields. Re-sorts if startFrame changed. */
  updateEvent(id: string, updates: Partial<Omit<TimelineEvent, "id" | "ownerId" | "columnId">>): boolean {
    const idx = this.events.findIndex((ev) => ev.id === id);
    if (idx === -1) return false;
    const ev = this.events[idx];
    const startChanged = updates.startFrame !== undefined && updates.startFrame !== ev.startFrame;
    Object.assign(ev, updates);
    if (startChanged) {
      this.events.splice(idx, 1);
      this.insertSorted(ev);
    }
    this.notify();
    return true;
  }

  /** Move an event to a new start frame. */
  moveEvent(id: string, newStartFrame: number): boolean {
    return this.updateEvent(id, { startFrame: newStartFrame });
  }

  /** Replace all events with the given list. */
  setEvents(events: TimelineEvent[]): void {
    this.events = [...events].sort((a, b) => a.startFrame - b.startFrame);
    this.notify();
  }

  /** Remove all events. */
  clear(): void {
    if (this.events.length === 0) return;
    this.events = [];
    this.notify();
  }

  /** Number of events in this subtimeline. */
  get size(): number {
    return this.events.length;
  }

  /** Insert an event in sorted order by startFrame. */
  private insertSorted(ev: TimelineEvent): void {
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.events[mid].startFrame <= ev.startFrame) lo = mid + 1;
      else hi = mid;
    }
    this.events.splice(lo, 0, ev);
  }
}
