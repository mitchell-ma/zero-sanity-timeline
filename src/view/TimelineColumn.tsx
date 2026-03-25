import React from 'react';
import EventBlock from './EventBlock';
import {
  frameToPx,
  durationToPx,
} from '../utils/timeline';
import { SKILL_COLUMNS, COMBO_WINDOW_COLUMN_ID } from '../model/channels';
import { InteractionModeType } from '../consts/enums';
import {
  TimelineEvent,
  Column,
  eventEndFrame,
  durationSegment,
} from '../consts/viewTypes';
import type { ColumnViewModel } from '../controller/timeline/eventPresentationController';
import type { EventPresentation } from '../controller/timeline/eventPresentationController';
import { computeEventPresentation } from '../controller/timeline/eventPresentationController';
import type { AxisMap } from '../utils/axisMap';
// TickMark no longer needed — gridlines are pre-rendered by parent
import type { ResourcePoint } from '../controller/timeline/resourceTimeline';
import { COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop2 = (_a: unknown, _b: unknown) => {};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const noop3 = (_a: unknown, _b: unknown, _c: unknown) => {};

interface ResourceGraph {
  points: ReadonlyArray<ResourcePoint>;
  min: number;
  max: number;
  wasted?: number;
}

export interface TimelineColumnProps {
  col: Column & { type: 'mini-timeline' };
  viewModel: ColumnViewModel | undefined;
  eventPresentations: Map<string, EventPresentation>;
  /** Pre-rendered gridline elements (stable across drag — memoized by parent). */
  gridlineElements: React.ReactNode;
  zoom: number;
  axis: AxisMap;
  isHorizontal: boolean;
  tlHeight: number;
  visibleStartFrame: number;
  visibleEndFrame: number;
  totalRealFrames: number;
  isGroupStart: boolean;
  // Resource data
  resourceGraph: ResourceGraph | undefined;
  insufficiencyZones: import('../controller/timeline/skillPointTimeline').ResourceZone[] | undefined;
  alwaysAvailableCombo: boolean;
  comboWindowEvents: TimelineEvent[];
  enemyStaggerNodes: number;
  // Presentation fallback data (for events not in the cached map)
  slotElementColors: Record<string, string>;
  alwaysAvailableComboSlots: Set<string>;
  autoFinisherIds: Set<string>;
  validationMaps: import('../controller/timeline/eventValidationController').ValidationMaps;
  allEvents: readonly TimelineEvent[];
  // Interaction state
  selectedIds: Set<string>;
  hoveredId: string | null;
  hoverFrame: number | null;
  draggingIds: Set<string> | null;
  selectedFramesByEvent: Map<string, import('../consts/viewTypes').SelectedFrame[]> | null;
  interactionMode: InteractionModeType | undefined;
  // Handlers
  onSubTimelineContextMenu: (e: React.MouseEvent, col: Column) => void;
  onTimelineMouseDown: (e: React.MouseEvent) => void;
  onDragStart: (e: React.MouseEvent, eventUid: string, startFrame: number) => void;
  onContextMenu: (e: React.MouseEvent, eventUid: string) => void;
  onSelect: (e: React.MouseEvent, eventUid: string) => void;
  onHover: (eventUid: string | null) => void;
  onTouchStart?: (e: React.TouchEvent, eventUid: string, startFrame: number) => void;
  onFrameClick?: (e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onFrameContextMenu?: (e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onFrameDragStart?: (e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => void;
  onSegmentContextMenu?: (e: React.MouseEvent, eventUid: string, segmentIndex: number) => void;
}

function TimelineColumn({
  col,
  viewModel,
  eventPresentations,
  gridlineElements,
  zoom,
  axis,
  isHorizontal,
  tlHeight,
  visibleStartFrame,
  visibleEndFrame,
  totalRealFrames,
  isGroupStart,
  resourceGraph,
  insufficiencyZones,
  alwaysAvailableCombo,
  comboWindowEvents,
  enemyStaggerNodes,
  slotElementColors,
  alwaysAvailableComboSlots,
  autoFinisherIds,
  validationMaps,
  allEvents,
  selectedIds,
  hoveredId,
  hoverFrame,
  draggingIds,
  selectedFramesByEvent,
  interactionMode,
  onSubTimelineContextMenu,
  onTimelineMouseDown,
  onDragStart,
  onContextMenu,
  onSelect,
  onHover,
  onTouchStart,
  onFrameClick,
  onFrameContextMenu,
  onFrameDragStart,
  onSegmentContextMenu,
}: TimelineColumnProps) {
  const hasMicro = !!col.microColumns;
  const microCount = col.microColumns?.length ?? 0;

  const colEvents = viewModel?.events ?? [];
  const visColEvents = colEvents.filter((ev) => {
    const evEnd = eventEndFrame(ev);
    return evEnd >= visibleStartFrame && ev.startFrame <= visibleEndFrame;
  });

  const isDerivedCol = !!col.derived && interactionMode === InteractionModeType.STRICT;

  /** Look up cached presentation, fall back to live computation for new events. */
  const getPresentation = (ev: TimelineEvent): EventPresentation => {
    const cached = eventPresentations.get(`${col.key}:${ev.uid}`);
    if (cached) return cached;
    return computeEventPresentation(ev, col, {
      slotElementColors, autoFinisherIds,
      validationMaps, interactionMode, statusViewOverrides: viewModel?.statusOverrides, events: allEvents,
    });
  };

  const buildEventBlockProps = (ev: TimelineEvent, pres: EventPresentation) => ({
    event: pres.visualActivationDuration != null
      ? { ...ev, segments: durationSegment(pres.visualActivationDuration) }
      : ev,
    zoom,
    axis,
    label: pres.label,
    color: pres.color,
    comboWarning: pres.comboWarning,
    passive: pres.passive,
    notDraggable: pres.notDraggable,
    derived: pres.derived,
    isAutoFinisher: pres.isAutoFinisher,
    skillElement: pres.skillElement,
    onDragStart: isDerivedCol || pres.passive ? noop3 : onDragStart,
    onContextMenu: isDerivedCol || pres.passive ? noop2 : onContextMenu,
    onSelect,
    onHover: pres.passive ? undefined : onHover,
    onTouchStart: isDerivedCol || pres.passive ? undefined : onTouchStart,
    onFrameClick: pres.passive ? undefined : onFrameClick,
    onFrameContextMenu: pres.passive ? undefined : onFrameContextMenu,
    onFrameDragStart: pres.passive ? undefined : onFrameDragStart,
    onSegmentContextMenu: pres.passive ? undefined : onSegmentContextMenu,
    selectedFrames: pres.passive ? undefined : selectedFramesByEvent?.get(ev.uid),
    hoverFrame: draggingIds ? null : hoverFrame,
  });

  return (
    <div
      key={`col-${col.key}`}
      className={`tl-sub-timeline${hasMicro ? ' tl-sub-timeline--mf' : ''}${isGroupStart ? ' tl-group-start' : ''}`}
      data-col-key={col.key}
      style={{ [axis.frameSize]: tlHeight } as React.CSSProperties}
      onContextMenu={(e) => onSubTimelineContextMenu(e, col)}
      onMouseDown={onTimelineMouseDown}
    >
      {gridlineElements}

      {/* Micro-column dividers (skip for dynamic-split — no fixed lanes) */}
      {hasMicro && col.microColumnAssignment !== 'dynamic-split' && Array.from({ length: microCount - 1 }, (_, i) => (
        <div
          key={`mc-div-${i}`}
          className="mf-micro-divider"
          style={{ [axis.lanePos]: `${((i + 1) / microCount) * 100}%` } as React.CSSProperties}
        />
      ))}

      {/* Resource line graph */}
      {resourceGraph && (() => {
        const { points, min: rMin, max: rMax } = resourceGraph;
        if (points.length < 2 || rMax === rMin) return null;
        const range = rMax - rMin;
        const svgPoints = points.map((pt) => {
          const val = ((pt.value - rMin) / range) * 100;
          const framePx = frameToPx(pt.frame, zoom);
          return isHorizontal
            ? { x: framePx, y: 100 - val }
            : { x: val, y: framePx };
        });
        const lineStr = svgPoints.map((p) => `${p.x},${p.y}`).join(' ');
        const lastPt = svgPoints[svgPoints.length - 1];
        const firstPt = svgPoints[0];
        const viewBox = isHorizontal ? `0 0 ${tlHeight} 100` : `0 0 100 ${tlHeight}`;
        const fillStr = isHorizontal
          ? `${lineStr} ${lastPt.x},100 ${firstPt.x},100`
          : `${lineStr} 0,${lastPt.y} 0,${firstPt.y}`;
        return (
          <svg
            className="resource-graph"
            viewBox={viewBox}
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <polygon points={fillStr} fill={col.color} fillOpacity="0.15" stroke="none" />
            <polyline points={lineStr} fill="none" stroke={col.color} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            {col.columnId === COMMON_COLUMN_IDS.STAGGER && enemyStaggerNodes > 0 && (() => {
              const lines: React.ReactElement[] = [];
              for (let i = 1; i <= enemyStaggerNodes; i++) {
                const nodeValue = rMax * i / (enemyStaggerNodes + 1);
                const val = ((nodeValue - rMin) / range) * 100;
                if (isHorizontal) {
                  const y = 100 - val;
                  lines.push(<line key={`node-${i}`} x1={0} y1={y} x2={tlHeight} y2={y} stroke={col.color} strokeWidth="0.5" strokeDasharray="4 3" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />);
                } else {
                  lines.push(<line key={`node-${i}`} x1={val} y1={0} x2={val} y2={tlHeight} stroke={col.color} strokeWidth="0.5" strokeDasharray="4 3" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />);
                }
              }
              return lines;
            })()}
          </svg>
        );
      })()}

      {/* Combo disabled background */}
      {col.columnId === SKILL_COLUMNS.COMBO && !alwaysAvailableCombo && (() => {
        const enabled: { start: number; end: number }[] = [];
        for (const w of comboWindowEvents) {
          enabled.push({ start: w.startFrame, end: eventEndFrame(w) });
        }
        return (
          <>
            <div className="sp-stripes-bg" />
            {enabled.map((zone, i) => (
              <div
                key={`combo-ok-${i}`}
                className="sp-sufficient-bg"
                style={{
                  [axis.framePos]: frameToPx(zone.start, zoom),
                  [axis.frameSize]: durationToPx(zone.end - zone.start, zoom),
                } as React.CSSProperties}
              />
            ))}
          </>
        );
      })()}

      {/* SP zones on battle columns */}
      {col.columnId === SKILL_COLUMNS.BATTLE && (() => {
        const insuffGaps = insufficiencyZones ?? [];
        const sufficient: { start: number; end: number }[] = [];
        let cursor = 0;
        for (const gap of insuffGaps) {
          if (gap.start > cursor) sufficient.push({ start: cursor, end: gap.start });
          cursor = Math.max(cursor, gap.end);
        }
        if (cursor < totalRealFrames) sufficient.push({ start: cursor, end: totalRealFrames });
        return (
          <>
            <div className="sp-stripes-bg" />
            {sufficient.map((zone, i) => (
              <div
                key={`sp-ok-${i}`}
                className="sp-sufficient-bg"
                style={{
                  [axis.framePos]: frameToPx(zone.start, zoom),
                  [axis.frameSize]: durationToPx(zone.end - zone.start, zoom),
                } as React.CSSProperties}
              />
            ))}
          </>
        );
      })()}

      {/* Events */}
      {hasMicro ? (
        visColEvents.map((ev) => {
          const mp = viewModel?.microPositions.get(ev.uid);
          const leftPct = mp ? `${mp.leftFrac * 100}%` : '0%';
          const widthPct = mp ? `${mp.widthFrac * 100}%` : '100%';
          const microColor = mp?.color ?? col.color;
          const microPres = getPresentation(ev);
          return (
            <div
              key={ev.uid}
              className="mf-micro-slot"
              style={{
                position: 'absolute',
                [axis.framePos]: 0,
                [isHorizontal ? 'right' : 'bottom']: 0,
                [axis.lanePos]: leftPct,
                [axis.laneSize]: widthPct,
              } as React.CSSProperties}
            >
              <EventBlock
                {...buildEventBlockProps(ev, { ...microPres, color: microColor })}
                selected={false}
                hovered={hoveredId === ev.uid}
              />
            </div>
          );
        })
      ) : (
        visColEvents.map((ev) => {
          const pres = getPresentation(ev);
          const isWindow = ev.columnId === COMBO_WINDOW_COLUMN_ID;
          const ol = viewModel?.overlapLanes.get(ev.uid);
          const laneStyle = ol && ol.laneCount > 1 ? {
            [axis.lanePos]: `${(ol.lane / ol.laneCount) * 100}%`,
            [axis.laneSize]: `${(1 / ol.laneCount) * 100}%`,
            [isHorizontal ? 'paddingTop' : 'paddingLeft']: '15%',
            [isHorizontal ? 'paddingBottom' : 'paddingRight']: '15%',
            boxSizing: 'border-box' as const,
          } as React.CSSProperties : undefined;
          return (
            <EventBlock
              key={ev.uid}
              {...buildEventBlockProps(ev, pres)}
              selected={isWindow ? false : selectedIds.has(ev.uid)}
              hovered={isWindow ? false : hoveredId === ev.uid}
              hoverFrame={isWindow ? undefined : draggingIds ? null : hoverFrame}
              wrapStyle={laneStyle}
            />
          );
        })
      )}

    </div>
  );
}

/**
 * Custom comparator — skip props that change identity every tick but only
 * matter when their CONTENT changes for THIS column:
 * - allEvents, validationMaps, autoFinisherIds: change identity every tick
 *   but only affect rendering through eventPresentations (cached during drag)
 *   or the getPresentation fallback (rare).
 * - comboWindowEvents: filtered inline, new array each render.
 *
 * The column re-renders when its OWN data changes: viewModel (column events),
 * resourceGraph, selectedIds, hoveredId, hoverFrame, draggingIds, zoom, etc.
 */
function timelineColumnEqual(prev: TimelineColumnProps, next: TimelineColumnProps): boolean {
  return prev.col === next.col
    && prev.viewModel === next.viewModel
    && prev.eventPresentations === next.eventPresentations
    && prev.gridlineElements === next.gridlineElements
    && prev.zoom === next.zoom
    && prev.axis === next.axis
    && prev.isHorizontal === next.isHorizontal
    && prev.tlHeight === next.tlHeight
    && prev.visibleStartFrame === next.visibleStartFrame
    && prev.visibleEndFrame === next.visibleEndFrame
    && prev.totalRealFrames === next.totalRealFrames
    && prev.isGroupStart === next.isGroupStart
    && prev.resourceGraph === next.resourceGraph
    && prev.insufficiencyZones === next.insufficiencyZones
    && prev.alwaysAvailableCombo === next.alwaysAvailableCombo
    && prev.enemyStaggerNodes === next.enemyStaggerNodes
    && prev.selectedIds === next.selectedIds
    && prev.hoveredId === next.hoveredId
    && prev.hoverFrame === next.hoverFrame
    && prev.draggingIds === next.draggingIds
    && prev.selectedFramesByEvent === next.selectedFramesByEvent
    && prev.interactionMode === next.interactionMode;
  // Intentionally skip: allEvents, validationMaps, autoFinisherIds,
  // comboWindowEvents, slotElementColors, alwaysAvailableComboSlots
  // — these change identity every tick but only affect presentation
  // (cached) or fallback computation (rare).
}

export default React.memo(TimelineColumn, timelineColumnEqual);
