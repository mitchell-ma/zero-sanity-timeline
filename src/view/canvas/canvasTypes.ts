/**
 * Internal types for the PixiJS timeline canvas renderer.
 */
import type { Column } from '../../consts/viewTypes';
import type { ColumnViewModel, EventPresentation } from '../../controller/timeline/eventPresentationController';
import type { EventLayout } from '../../controller/timeline/timelineLayout';
import type { TimeStopRegion } from '../../controller/timeline/eventValidator';
import type { AxisMap } from '../../utils/axisMap';

/** Callback interface from canvas → CombatPlanner handlers.
 *  Uses React.MouseEvent signatures to match the existing handlers. */
export interface CanvasCallbacks {
  onEventDragStart: (e: React.MouseEvent, eventUid: string, startFrame: number) => void;
  onEventSelect: (e: React.MouseEvent, eventUid: string) => void;
  onEventDoubleClick: (e: React.MouseEvent, eventUid: string) => void;
  onEventContextMenu: (e: React.MouseEvent, eventUid: string) => void;
  onEventHover: (eventUid: string | null) => void;
  onFrameClick: (e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onFrameContextMenu: (e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onFrameDragStart: (e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onSegmentContextMenu: (e: React.MouseEvent, eventUid: string, segmentIndex: number) => void;
  onSegmentResizeDragStart: (e: React.MouseEvent, eventUid: string, segmentIndex: number, edge: 'start' | 'end') => void;
  onColumnContextMenu: (e: React.MouseEvent, col: Column) => void;
  onMarqueeStart: (e: React.MouseEvent) => void;
  /** Show/hide warning tooltip at the given screen coordinates. */
  onWarningHover: (eventUid: string | null, clientX: number, clientY: number) => void;
  /** Forwarded from canvas pointermove — drives drag tracking + hover line. */
  onMouseMove: (e: React.MouseEvent) => void;
  /** Forwarded from canvas pointerup — ends drags. */
  onMouseUp: () => void;
}

/** Data snapshot passed from React to the canvas renderer each update. */
export interface CanvasRenderData {
  columns: Column[];
  columnViewModels: Map<string, ColumnViewModel>;
  eventPresentations: Map<string, EventPresentation>;
  eventLayouts: Map<string, EventLayout>;
  /** Column pixel positions from CombatPlanner — matches the DOM grid exactly. */
  columnPositions: Map<string, { left: number; right: number }>;
  zoom: number;
  axis: AxisMap;
  isHorizontal: boolean;
  tlHeight: number;
  visibleStartFrame: number;
  visibleEndFrame: number;
  totalRealFrames: number;
  selectedIds: Set<string>;
  selectedFrames: readonly { eventUid: string; segmentIndex: number; frameIndex: number }[];
  draggingIds: Set<string> | null;
  hoveredId: string | null;
  hoverFrame: number | null;
  critModeGeneration: number;
  timeStopRegions: readonly TimeStopRegion[];
}

/** Result of a coordinate-based hit test on the canvas. */
export interface HitResult {
  type: 'event' | 'frame' | 'resize-handle' | 'column-empty';
  eventUid?: string;
  segmentIndex?: number;
  frameIndex?: number;
  edge?: 'start' | 'end';
  columnKey?: string;
  column?: Column;
  frame?: number;
}