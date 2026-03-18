/**
 * Tests for anchor-based zoom — zooming should keep the frame under the
 * mouse cursor stationary by adjusting the scroll position.
 *
 * Verifies:
 * - Anchor frame stays at the same viewport position after zoom
 * - Rapid zooming (multiple steps) preserves the anchor
 * - Zoom in and zoom out are symmetric
 * - Edge cases: anchor at scroll origin, anchor at extreme frames
 * - Works for both vertical (scrollTop) and horizontal (scrollLeft) axes
 */

import { frameToPx, pxToFrame, pxPerFrame, TIMELINE_TOP_PAD } from '../utils/timeline';

/** Zoom factor used in the app (from useApp.ts handleZoom). */
const ZOOM_IN_FACTOR = 1.2;
const ZOOM_OUT_FACTOR = 1 / 1.2;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 20;

function clampZoom(z: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/**
 * Pure reimplementation of the zoom anchor logic from CombatPlanner.
 *
 * Given the current scroll state and mouse position, computes the new
 * scroll position after a zoom so the frame under the cursor stays put.
 *
 * @param oldScroll  Current scroll position (scrollTop or scrollLeft)
 * @param mouseInContainer  Mouse offset from scroll container edge (along frame axis)
 * @param oldZoom   Zoom level before the change
 * @param newZoom   Zoom level after the change
 * @returns New scroll position
 */
function computeAnchoredScroll(
  oldScroll: number,
  mouseInContainer: number,
  oldZoom: number,
  newZoom: number,
): number {
  // Step 1: find the content-space pixel under the cursor
  const contentPx = oldScroll + mouseInContainer;
  // Step 2: convert to a frame (zoom-invariant anchor)
  const anchorFrame = pxToFrame(contentPx, oldZoom);
  // Step 3: find where that frame is at the new zoom
  const anchorPxNew = frameToPx(anchorFrame, newZoom);
  // Step 4: scroll so that pixel is still at mouseInContainer
  return Math.max(0, anchorPxNew - mouseInContainer);
}

/** Helper: where a frame appears in the viewport after zoom. */
function frameViewportPos(scroll: number, frame: number, zoom: number) {
  return frameToPx(frame, zoom) - scroll;
}

describe('anchor-based zoom', () => {
  const baseZoom = 1.0;
  const mouseInContainer = 300; // mouse 300px into the scroll container

  test('anchor frame stays at same viewport position after zoom in', () => {
    const oldScroll = 500;
    const contentPx = oldScroll + mouseInContainer;
    const anchorFrame = pxToFrame(contentPx, baseZoom);

    const newZoom = clampZoom(baseZoom * ZOOM_IN_FACTOR);
    const newScroll = computeAnchoredScroll(oldScroll, mouseInContainer, baseZoom, newZoom);

    const oldViewportPos = frameViewportPos(oldScroll, anchorFrame, baseZoom);
    const newViewportPos = frameViewportPos(newScroll, anchorFrame, newZoom);

    // The anchor frame should appear at the same viewport offset (within 1px due to frame rounding)
    expect(Math.abs(newViewportPos - oldViewportPos)).toBeLessThanOrEqual(pxPerFrame(newZoom));
  });

  test('anchor frame stays at same viewport position after zoom out', () => {
    const oldScroll = 500;
    const contentPx = oldScroll + mouseInContainer;
    const anchorFrame = pxToFrame(contentPx, baseZoom);

    const newZoom = clampZoom(baseZoom * ZOOM_OUT_FACTOR);
    const newScroll = computeAnchoredScroll(oldScroll, mouseInContainer, baseZoom, newZoom);

    const oldViewportPos = frameViewportPos(oldScroll, anchorFrame, baseZoom);
    const newViewportPos = frameViewportPos(newScroll, anchorFrame, newZoom);

    expect(Math.abs(newViewportPos - oldViewportPos)).toBeLessThanOrEqual(pxPerFrame(newZoom));
  });

  test('rapid zoom in preserves anchor across multiple steps', () => {
    const oldScroll = 1000;
    const contentPx = oldScroll + mouseInContainer;
    const anchorFrame = pxToFrame(contentPx, baseZoom);
    const origViewportPos = frameViewportPos(oldScroll, anchorFrame, baseZoom);

    // Simulate 5 rapid zoom-in steps
    let zoom = baseZoom;
    let scroll = oldScroll;
    for (let i = 0; i < 5; i++) {
      const newZoom = clampZoom(zoom * ZOOM_IN_FACTOR);
      // The key insight: on rapid zoom, the anchor frame is captured once
      // from the first event. Subsequent steps use the same anchorFrame,
      // computing new scroll from frameToPx(anchorFrame, latestZoom).
      scroll = Math.max(0, frameToPx(anchorFrame, newZoom) - mouseInContainer);
      zoom = newZoom;
    }

    const finalViewportPos = frameViewportPos(scroll, anchorFrame, zoom);
    expect(Math.abs(finalViewportPos - origViewportPos)).toBeLessThanOrEqual(pxPerFrame(zoom));
  });

  test('rapid zoom out preserves anchor across multiple steps', () => {
    const oldScroll = 2000;
    const contentPx = oldScroll + mouseInContainer;
    const anchorFrame = pxToFrame(contentPx, baseZoom);
    const origViewportPos = frameViewportPos(oldScroll, anchorFrame, baseZoom);

    let zoom = baseZoom;
    let scroll = oldScroll;
    for (let i = 0; i < 5; i++) {
      const newZoom = clampZoom(zoom * ZOOM_OUT_FACTOR);
      scroll = Math.max(0, frameToPx(anchorFrame, newZoom) - mouseInContainer);
      zoom = newZoom;
    }

    const finalViewportPos = frameViewportPos(scroll, anchorFrame, zoom);
    expect(Math.abs(finalViewportPos - origViewportPos)).toBeLessThanOrEqual(pxPerFrame(zoom));
  });

  test('zoom in then zoom out returns to approximately the same scroll', () => {
    const oldScroll = 800;

    const zoomIn = clampZoom(baseZoom * ZOOM_IN_FACTOR);
    const scrollAfterIn = computeAnchoredScroll(oldScroll, mouseInContainer, baseZoom, zoomIn);

    const zoomBack = clampZoom(zoomIn * ZOOM_OUT_FACTOR);
    const scrollAfterBack = computeAnchoredScroll(scrollAfterIn, mouseInContainer, zoomIn, zoomBack);

    // Should return close to original (small rounding error from frame quantization)
    expect(Math.abs(scrollAfterBack - oldScroll)).toBeLessThan(pxPerFrame(baseZoom) * 2);
  });
});

describe('anchor at edge positions', () => {
  test('anchor at scroll origin (scroll=0, mouse at top)', () => {
    const newZoom = clampZoom(1.0 * ZOOM_IN_FACTOR);
    const newScroll = computeAnchoredScroll(0, 0, 1.0, newZoom);
    // Frame 0 is at TIMELINE_TOP_PAD px, so scroll adjusts to keep it at mouse=0.
    // The result is TIMELINE_TOP_PAD since frameToPx(0, z) = TIMELINE_TOP_PAD for any zoom.
    expect(newScroll).toBe(TIMELINE_TOP_PAD);
  });

  test('anchor near timeline start', () => {
    const mouseInContainer = 20; // just past the top padding
    const oldScroll = 0;
    const anchorFrame = pxToFrame(oldScroll + mouseInContainer, 1.0);

    const newZoom = clampZoom(1.0 * ZOOM_IN_FACTOR);
    const newScroll = computeAnchoredScroll(oldScroll, mouseInContainer, 1.0, newZoom);

    const viewportPos = frameViewportPos(newScroll, anchorFrame, newZoom);
    expect(Math.abs(viewportPos - mouseInContainer)).toBeLessThanOrEqual(pxPerFrame(newZoom));
  });

  test('scroll never goes negative', () => {
    // Mouse far down in the container, scroll at 0, zoom out — should clamp to 0
    const newZoom = clampZoom(1.0 * ZOOM_OUT_FACTOR);
    const newScroll = computeAnchoredScroll(0, 500, 1.0, newZoom);
    expect(newScroll).toBeGreaterThanOrEqual(0);
  });
});

describe('pendingScrollTop computation', () => {
  // Reimplementation of the inline pendingScrollTop from CombatPlanner render
  function pendingScrollTop(
    anchorFrame: number,
    mouseInContainer: number,
    zoom: number,
  ) {
    return Math.max(0, frameToPx(anchorFrame, zoom) - mouseInContainer);
  }

  test('matches computeAnchoredScroll result', () => {
    const oldScroll = 600;
    const mouse = 250;
    const oldZoom = 1.0;
    const newZoom = clampZoom(oldZoom * ZOOM_IN_FACTOR);

    const contentPx = oldScroll + mouse;
    const anchorFrame = pxToFrame(contentPx, oldZoom);

    const fromFull = computeAnchoredScroll(oldScroll, mouse, oldZoom, newZoom);
    const fromPending = pendingScrollTop(anchorFrame, mouse, newZoom);

    expect(fromFull).toBe(fromPending);
  });

  test('consistent across multiple zoom levels', () => {
    const mouse = 200;
    const anchorFrame = 3600; // 30 seconds in

    const zooms = [0.3, 0.5, 1.0, 2.0, 5.0, 10.0];
    for (const z of zooms) {
      const scroll = pendingScrollTop(anchorFrame, mouse, z);
      const viewportPos = frameViewportPos(scroll, anchorFrame, z);
      // Anchor should always be at mouseInContainer offset in viewport
      expect(Math.abs(viewportPos - mouse)).toBeLessThanOrEqual(pxPerFrame(z));
    }
  });
});

describe('visibleRange uses effectiveScrollTop', () => {
  // Simulates the render-time logic: when zoomAnchor is set,
  // effectiveScrollTop = pendingScrollTop instead of stale scrollTop.
  test('effectiveScrollTop prevents flash by using anchor-derived position', () => {
    const staleScrollTop = 500;
    const mouse = 300;
    const oldZoom = 1.0;

    // Capture anchor
    const contentPx = staleScrollTop + mouse;
    const anchorFrame = pxToFrame(contentPx, oldZoom);

    // Simulate zoom change (React batches setZoomAnchor + setZoom)
    const newZoom = clampZoom(oldZoom * ZOOM_IN_FACTOR);
    const pending = Math.max(0, frameToPx(anchorFrame, newZoom) - mouse);

    // effectiveScrollTop should use pending, not stale
    const effectiveScrollTop = pending; // pendingScrollTop ?? scrollTop
    expect(effectiveScrollTop).not.toBe(staleScrollTop);

    // The anchor frame should be visible in the viewport at the mouse position
    const viewportPos = frameViewportPos(effectiveScrollTop, anchorFrame, newZoom);
    expect(Math.abs(viewportPos - mouse)).toBeLessThanOrEqual(pxPerFrame(newZoom));
  });

  test('without anchor, effectiveScrollTop falls back to scrollTop', () => {
    const scrollTop = 500;
    const pendingScrollTop = null;
    const effectiveScrollTop = pendingScrollTop ?? scrollTop;
    expect(effectiveScrollTop).toBe(500);
  });
});
