import React from 'react';
import { NounType } from '../dsl/semantics';
import {
  frameToPx,
  durationToPx,
} from '../utils/timeline';
import { InteractionModeType, ColumnType, MicroColumnAssignment } from '../consts/enums';
import {
  TimelineEvent,
  Column,
  eventEndFrame,
} from '../consts/viewTypes';
import type { ColumnViewModel } from '../controller/timeline/eventPresentationController';
import type { AxisMap } from '../utils/axisMap';
import type { ResourcePoint } from '../controller/timeline/resourceTimeline';
import { COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';

interface ResourceGraph {
  points: ReadonlyArray<ResourcePoint>;
  min: number;
  max: number;
  wasted?: number;
}

export interface TimelineColumnProps {
  col: Column & { type: ColumnType.MINI_TIMELINE };
  viewModel: ColumnViewModel | undefined;
  zoom: number;
  axis: AxisMap;
  isHorizontal: boolean;
  tlHeight: number;
  isGroupStart: boolean;
  // Resource data
  resourceGraph: ResourceGraph | undefined;
  insufficiencyZones: import('../controller/timeline/skillPointTimeline').ResourceZone[] | undefined;
  alwaysAvailableCombo: boolean;
  comboWindowEvents: TimelineEvent[];
  enemyStaggerNodes: number;
  // Interaction state
  interactionMode: InteractionModeType | undefined;
}

function TimelineColumn({
  col,
  viewModel,
  zoom,
  axis,
  isHorizontal,
  tlHeight,
  isGroupStart,
  resourceGraph,
  insufficiencyZones,
  alwaysAvailableCombo,
  comboWindowEvents,
  enemyStaggerNodes,
  interactionMode,
}: TimelineColumnProps) {
  const hasMicro = !!col.microColumns;
  const microCount = col.microColumns?.length ?? 0;

  return (
    <div
      key={`col-${col.key}`}
      className={`tl-sub-timeline${hasMicro ? ' tl-sub-timeline--mf' : ''}${isGroupStart ? ' tl-group-start' : ''}`}
      data-col-key={col.key}
      style={{ [axis.frameSize]: tlHeight } as React.CSSProperties}
    >

      {/* Micro-column dividers (skip for dynamic-split — no fixed lanes) */}
      {hasMicro && col.microColumnAssignment !== MicroColumnAssignment.DYNAMIC_SPLIT && (() => {
        const microW = Math.min(1 / microCount, 0.25);
        return Array.from({ length: microCount - 1 }, (_, i) => (
          <div
            key={`mc-div-${i}`}
            className="mf-micro-divider"
            style={{ [axis.lanePos]: `${(i + 1) * microW * 100}%` } as React.CSSProperties}
          />
        ));
      })()}

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
      {col.columnId === NounType.COMBO_SKILL && !alwaysAvailableCombo && (() => {
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

      {/* SP insufficiency zones on battle columns */}
      {col.columnId === NounType.BATTLE_SKILL && insufficiencyZones && insufficiencyZones.length > 0 && insufficiencyZones.map((zone, i) => (
        <div
          key={`sp-insuff-${i}`}
          className="sp-insufficient-zone"
          style={{
            [axis.framePos]: frameToPx(zone.start, zoom),
            [axis.frameSize]: durationToPx(zone.end - zone.start, zoom),
          } as React.CSSProperties}
        />
      ))}

    </div>
  );
}

export default React.memo(TimelineColumn);
