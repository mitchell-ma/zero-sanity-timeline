/**
 * @jest-environment jsdom
 */
import { clampWouldHideFrame } from '../../controller/timeline/eventPresentationController';
import { FPS } from '../../utils/timeline';

describe('clampWouldHideFrame', () => {
  it('WATERSPOUT: clamping to 1s hides 2s/3s damage ticks', () => {
    expect(clampWouldHideFrame('WATERSPOUT', 1 * FPS)).toBe(true);
  });

  it('WATERSPOUT: clamping to 0 hides 1s/2s/3s ticks', () => {
    expect(clampWouldHideFrame('WATERSPOUT', 0)).toBe(true);
  });

  it('WATERSPOUT: clamping to full duration (3s) hides nothing', () => {
    expect(clampWouldHideFrame('WATERSPOUT', 3 * FPS)).toBe(false);
  });

  it('MELTING_FLAME: no frames → never hides', () => {
    expect(clampWouldHideFrame('MELTING_FLAME', 0)).toBe(false);
  });

  it('unknown status → never hides', () => {
    expect(clampWouldHideFrame('NONEXISTENT_STATUS', 0)).toBe(false);
  });
});
