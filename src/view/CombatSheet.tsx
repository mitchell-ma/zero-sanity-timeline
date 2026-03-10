import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Column, TimelineEvent, SelectedFrame } from '../consts/viewTypes';
import { frameToPx, timelineHeight, frameToTimeLabelPrecise, pxPerFrame } from '../utils/timeline';
import {
  buildDamageTableRows,
  buildDamageTableColumns,
  DamageTableRow,
  DamageTableColumn,
} from '../controller/calculation/damageTableBuilder';
import type { Slot } from '../controller/timeline/columnBuilder';

const ROW_HEIGHT = 20;

interface CombatSheetProps {
  slots: Slot[];
  events: TimelineEvent[];
  columns: Column[];
  zoom: number;
  loadoutRowHeight: number;
  selectedFrames?: SelectedFrame[];
  hoverFrame?: number | null;
  onScrollRef?: (el: HTMLDivElement | null) => void;
  onScroll?: (scrollTop: number) => void;
  onZoom?: (deltaY: number) => void;
  compact?: boolean;
}

export default function CombatSheet({
  slots, events, columns, zoom, loadoutRowHeight,
  selectedFrames, hoverFrame, onScrollRef, onScroll: onScrollProp, onZoom, compact,
}: CombatSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableColumns = useMemo(() => buildDamageTableColumns(columns), [columns]);
  const rows = useMemo(() => buildDamageTableRows(events, columns), [events, columns]);

  // Forward shift+scroll to zoom handler (same as timeline)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onZoom) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        onZoom(e.deltaY);
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [onZoom]);

  const slotGroups = useMemo(() => {
    const groups: { slot: Slot; columns: DamageTableColumn[] }[] = [];
    for (const slot of slots) {
      const slotCols = tableColumns.filter((c) => c.ownerId === slot.slotId);
      if (slotCols.length > 0) {
        groups.push({ slot, columns: slotCols });
      }
    }
    return groups;
  }, [slots, tableColumns]);

  // Per-column flex: each group gets equal total width, columns subdivide within
  const colFlexMap = useMemo(() => {
    const map = new Map<string, number>();
    const groupCount = slotGroups.length;
    if (groupCount === 0) return map;
    for (const g of slotGroups) {
      const perCol = 1 / g.columns.length;
      for (const col of g.columns) {
        map.set(col.key, perCol);
      }
    }
    return map;
  }, [slotGroups]);

  useEffect(() => {
    onScrollRef?.(scrollRef.current);
    return () => onScrollRef?.(null);
  }, [onScrollRef]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current && onScrollProp) {
      onScrollProp(scrollRef.current.scrollTop);
    }
  }, [onScrollProp]);

  // Find nearest row within a generous pixel tolerance for hover highlighting
  const hoveredRowKey = useMemo(() => {
    if (hoverFrame == null || rows.length === 0) return null;
    const toleranceFrames = Math.ceil(8 / pxPerFrame(zoom)); // 8px hit area
    let bestKey: string | null = null;
    let bestDist = Infinity;
    for (const row of rows) {
      const dist = Math.abs(row.absoluteFrame - hoverFrame);
      if (dist < bestDist && dist <= toleranceFrames) {
        bestDist = dist;
        bestKey = row.key;
      }
    }
    return bestKey;
  }, [hoverFrame, rows, zoom]);

  // Compute clamped top positions so rows never overlap
  const rowLayout = useMemo(() => {
    const layout: { row: DamageTableRow; top: number; frameTop: number }[] = [];
    let prevBottom = -Infinity;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const frameTop = frameToPx(row.absoluteFrame, zoom) - ROW_HEIGHT / 2;
      const top = compact ? i * ROW_HEIGHT : Math.max(frameTop, prevBottom);
      layout.push({ row, top, frameTop });
      prevBottom = top + ROW_HEIGHT;
    }
    return layout;
  }, [rows, zoom, compact]);


  const tlHeight = useMemo(() => {
    const baseHeight = timelineHeight(zoom);
    if (rowLayout.length === 0) return baseHeight;
    const lastRow = rowLayout[rowLayout.length - 1];
    // Extend body if clamped rows push past the natural timeline height
    return Math.max(baseHeight, lastRow.top + ROW_HEIGHT + 16);
  }, [zoom, rowLayout]);
  const numCols = tableColumns.length;

  if (numCols === 0) {
    return (
      <div className="dmg-table-empty">
        <span className="dmg-table-empty-text">No skill columns</span>
      </div>
    );
  }

  return (
    <div className="dmg-table-outer">
      {/* Headers outside scroll — scrollbar starts below them */}
      <div
        className="dmg-loadout-spacer"
        style={{ height: loadoutRowHeight }}
      >
        {slotGroups.map((g) => (
          <div
            key={g.slot.slotId}
            className="dmg-loadout-op"
            style={{
              '--op-color': g.slot.operator?.color ?? '#666',
              flex: 1,
            } as React.CSSProperties}
          >
            {g.slot.operator?.name ?? '—'}
          </div>
        ))}
      </div>

      <div className="dmg-header">
        <div className="dmg-header-time">Time</div>
        {tableColumns.map((col) => (
          <div
            key={col.key}
            className="dmg-header-skill"
            style={{
              '--op-color': col.color,
              flex: colFlexMap.get(col.key) ?? 1,
            } as React.CSSProperties}
          >
            <span className="dmg-header-skill-label">{col.label}</span>
          </div>
        ))}
      </div>

      {/* Scrollable body — same coordinate system as timeline body */}
      <div ref={scrollRef} className="dmg-table-scroll" onScroll={handleScroll}>
        <div
          className="dmg-body"
          style={{ height: tlHeight }}
        >
          {rowLayout.length === 0 ? (
            <div className="dmg-body-empty">
              Add events to the timeline to see damage calculations
            </div>
          ) : (
            rowLayout.map(({ row, top }) => (
              <DamageRow
                key={row.key}
                row={row}
                tableColumns={tableColumns}
                colFlexMap={colFlexMap}
                top={top}
                selected={selectedFrames?.some(
                  (sf) => sf.eventId === row.eventId
                    && sf.segmentIndex === row.segmentIndex
                    && sf.frameIndex === row.frameIndex,
                ) ?? false}
                hovered={row.key === hoveredRowKey}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DamageRow({ row, tableColumns, colFlexMap, top, selected, hovered }: {
  row: DamageTableRow;
  tableColumns: DamageTableColumn[];
  colFlexMap: Map<string, number>;
  top: number;
  selected: boolean;
  hovered: boolean;
}) {
  const cls = `dmg-row${selected ? ' dmg-row--selected' : ''}${hovered && !selected ? ' dmg-row--hovered' : ''}`;
  return (
    <div className={cls} style={{ top }}>
      <div className="dmg-cell dmg-cell-time">
        {frameToTimeLabelPrecise(row.absoluteFrame)}
      </div>
      {tableColumns.map((col) => {
        const isMatch = col.key === row.columnKey;
        const flex = colFlexMap.get(col.key) ?? 1;
        return (
          <div
            key={col.key}
            className={`dmg-cell${isMatch ? ' dmg-cell-value' : ' dmg-cell-blank'}`}
            style={isMatch ? { color: col.color, flex } : { flex }}
          >
            {isMatch ? row.damage : ''}
          </div>
        );
      })}
    </div>
  );
}
