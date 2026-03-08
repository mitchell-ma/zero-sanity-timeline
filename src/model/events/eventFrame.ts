export abstract class EventFrame {
  /** Frame offset from the start of the parent event. */
  offsetFrame: number;

  constructor(params: { offsetFrame?: number } = {}) {
    this.offsetFrame = params.offsetFrame ?? 0;
  }
}
