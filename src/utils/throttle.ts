/**
 * Throttles a callback using `requestAnimationFrame`.
 *
 * `every` controls the cadence: 1 = every frame (~60fps), 2 = every other
 * frame (~30fps), etc. Intermediate calls are dropped — only the latest
 * arguments are used when the callback fires.
 *
 * Returns a wrapped function with `cancel()` and `flush()` methods.
 */
export function throttleByRAF<A extends unknown[]>(
  fn: (...args: A) => void,
  every = 2,
): ((...args: A) => void) & { cancel: () => void; flush: () => void } {
  let rafId: number | null = null;
  let latestArgs: A | null = null;
  let skipped = 0;

  const schedule = () => {
    rafId = requestAnimationFrame(() => {
      skipped++;
      if (skipped >= every) {
        rafId = null;
        skipped = 0;
        if (latestArgs) {
          fn(...latestArgs);
          latestArgs = null;
        }
      } else {
        // Not yet time — reschedule to wait for the next frame
        schedule();
      }
    });
  };

  const throttled = (...args: A) => {
    latestArgs = args;
    if (rafId === null) {
      skipped = 0;
      schedule();
    }
  };

  throttled.cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    latestArgs = null;
    skipped = 0;
  };

  throttled.flush = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    skipped = 0;
    if (latestArgs) {
      fn(...latestArgs);
      latestArgs = null;
    }
  };

  return throttled;
}
