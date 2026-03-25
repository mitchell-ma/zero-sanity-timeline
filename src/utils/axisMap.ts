/**
 * Axis abstraction for vertical/horizontal timeline layout.
 *
 * Maps logical concepts (frame-axis, lane-axis) to physical CSS/DOM properties.
 * The core math in timeline.ts is already axis-agnostic — frameToPx returns
 * "pixels along the frame axis." We just need to route that value to the
 * correct CSS property.
 */

export type Orientation = 'vertical' | 'horizontal';

export interface AxisMap {
  /** CSS property for frame-axis position (top or left) */
  framePos: 'top' | 'left';
  /** CSS property for frame-axis extent (height or width) */
  frameSize: 'height' | 'width';
  /** CSS property for lane-axis position (left or top) */
  lanePos: 'left' | 'top';
  /** CSS property for lane-axis extent (width or height) */
  laneSize: 'width' | 'height';
  /** DOM scroll property along frame axis */
  scrollPos: 'scrollTop' | 'scrollLeft';
  /** DOM scroll property along lane axis */
  scrollLane: 'scrollLeft' | 'scrollTop';
  /** Mouse event property along frame axis */
  clientFrame: 'clientY' | 'clientX';
  /** Mouse event property along lane axis */
  clientLane: 'clientX' | 'clientY';
  /** Viewport dimension along frame axis */
  viewportFrame: 'clientHeight' | 'clientWidth';
  /** DOMRect accessor for frame-axis start */
  rectFrameStart: 'top' | 'left';
  /** DOMRect accessor for lane-axis start */
  rectLaneStart: 'left' | 'top';
  /** CSS grid template property for lane axis */
  gridTemplateLane: 'gridTemplateColumns' | 'gridTemplateRows';
  /** overflow property for frame axis */
  overflowFrame: 'overflowY' | 'overflowX';
  /** overflow property for lane axis */
  overflowLane: 'overflowX' | 'overflowY';
}

export const VERTICAL_AXIS: AxisMap = {
  framePos: 'top',
  frameSize: 'height',
  lanePos: 'left',
  laneSize: 'width',
  scrollPos: 'scrollTop',
  scrollLane: 'scrollLeft',
  clientFrame: 'clientY',
  clientLane: 'clientX',
  viewportFrame: 'clientHeight',
  rectFrameStart: 'top',
  rectLaneStart: 'left',
  gridTemplateLane: 'gridTemplateColumns',
  overflowFrame: 'overflowY',
  overflowLane: 'overflowX',
};

export const HORIZONTAL_AXIS: AxisMap = {
  framePos: 'left',
  frameSize: 'width',
  lanePos: 'top',
  laneSize: 'height',
  scrollPos: 'scrollLeft',
  scrollLane: 'scrollTop',
  clientFrame: 'clientX',
  clientLane: 'clientY',
  viewportFrame: 'clientWidth',
  rectFrameStart: 'left',
  rectLaneStart: 'top',
  gridTemplateLane: 'gridTemplateRows',
  overflowFrame: 'overflowX',
  overflowLane: 'overflowY',
};

export function getAxisMap(orientation: Orientation): AxisMap {
  return orientation === 'horizontal' ? HORIZONTAL_AXIS : VERTICAL_AXIS;
}

/** Build an inline style for positioning along the frame axis. */
export function frameStyle(axis: AxisMap, pos: number, size: number): Record<string, number> {
  return { [axis.framePos]: pos, [axis.frameSize]: size };
}

/** Build border-radius for a segment based on orientation and position. */
export function segmentRadius(axis: AxisMap, isFirst: boolean, isLast: boolean): string {
  if (isFirst && isLast) return '2px';
  if (axis.framePos === 'top') {
    // Vertical: round top-left/top-right for first, bottom-left/bottom-right for last
    if (isFirst) return '2px 2px 0 0';
    if (isLast) return '0 0 2px 2px';
  } else {
    // Horizontal: round left side for first, right side for last
    if (isFirst) return '2px 0 0 2px';
    if (isLast) return '0 2px 2px 0';
  }
  return '0';
}
