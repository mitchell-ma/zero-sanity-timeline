/**
 * Generic min-heap priority queue.
 * Elements are extracted in ascending order of the comparator.
 *
 * Used by the event processing pipeline to process derived events
 * in chronological frame order with priority tie-breaking.
 */
export class PriorityQueue<T> {
  private heap: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size() { return this.heap.length; }

  /** Clear all entries without deallocating the backing array. */
  clear() { this.heap.length = 0; }

  insert(item: T) {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  extractMin(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const min = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return min;
  }

  peek(): T | undefined { return this.heap[0]; }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.heap[i], this.heap[parent]) >= 0) break;
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
      if (left < n && this.compare(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < n && this.compare(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}
