/**
 * Generic min-heap priority queue.
 * Elements are extracted in ascending order of the comparator.
 *
 * Used by the event processing pipeline to process derived events
 * in chronological frame order with priority tie-breaking.
 */
export class PriorityQueue<T> {
  private heap: { item: T; seq: number }[] = [];
  private seqCounter = 0;

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size() { return this.heap.length; }

  /** Clear all entries without deallocating the backing array. */
  clear() { this.heap.length = 0; this.seqCounter = 0; }

  insert(item: T) {
    this.heap.push({ item, seq: this.seqCounter++ });
    this.bubbleUp(this.heap.length - 1);
  }

  extractMin(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const min = this.heap[0].item;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return min;
  }

  peek(): T | undefined { return this.heap[0]?.item; }

  /** Direct access to the backing array items (for in-place mutation + reheapify). */
  toArray(): readonly T[] { return this.heap.map(e => e.item); }

  /** Re-heapify after external in-place mutations to entry priorities. */
  reheapify() {
    for (let i = (this.heap.length >> 1) - 1; i >= 0; i--) this.sinkDown(i);
  }

  /** Stable comparison: user comparator first, insertion order as tiebreaker. */
  private stableCompare(a: { item: T; seq: number }, b: { item: T; seq: number }): number {
    const cmp = this.compare(a.item, b.item);
    return cmp !== 0 ? cmp : a.seq - b.seq;
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.stableCompare(this.heap[i], this.heap[parent]) >= 0) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  private sinkDown(i: number) {
    const n = this.heap.length;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.stableCompare(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < n && this.stableCompare(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}
