import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Column, TimelineEvent, SelectedFrame } from '../consts/viewTypes';
import { frameToPx, timelineHeight, frameToTimeLabelPrecise } from '../utils/timeline';
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
  selectedFrame?: SelectedFrame | null;
  hoverFrame?: number | null;
  onScrollRef?: (el: HTMLDivElement | null) => void;
  onScroll?: (scrollTop: number) => void;
}

export default function CombatSheet({
  slots, events, columns, zoom, loadoutRowHeight,
  selectedFrame, hoverFrame, onScrollRef, onScroll: onScrollProp,
}: CombatSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableColumns = useMemo(() => buildDamageTableColumns(columns), [columns]);
  const rows = useMemo(() => buildDamageTableRows(events, columns), [events, columns]);

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

  useEffect(() => {
    onScrollRef?.(scrollRef.current);
    return () => onScrollRef?.(null);
  }, [onScrollRef]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current && onScrollProp) {
      onScrollProp(scrollRef.current.scrollTop);
    }
  }, [onScrollProp]);

  const tlHeight = timelineHeight(zoom);
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
              flex: g.columns.length,
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
            style={{ color: col.color }}
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* Scrollable body — same coordinate system as timeline body */}
      <div ref={scrollRef} className="dmg-table-scroll" onScroll={handleScroll}>
        <div
          className="dmg-body"
          style={{ height: tlHeight }}
        >
          {rows.length === 0 ? (
            <div className="dmg-body-empty">
              Add events to the timeline to see damage calculations
            </div>
          ) : (
            rows.map((row) => (
              <DamageRow
                key={row.key}
                row={row}
                tableColumns={tableColumns}
                top={frameToPx(row.absoluteFrame, zoom) - ROW_HEIGHT / 2}
                selected={!!selectedFrame
                  && selectedFrame.eventId === row.eventId
                  && selectedFrame.segmentIndex === row.segmentIndex
                  && selectedFrame.frameIndex === row.frameIndex}
                hovered={hoverFrame === row.absoluteFrame}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DamageRow({ row, tableColumns, top, selected, hovered }: {
  row: DamageTableRow;
  tableColumns: DamageTableColumn[];
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
        return (
          <div
            key={col.key}
            className={`dmg-cell${isMatch ? ' dmg-cell-value' : ' dmg-cell-blank'}`}
            style={isMatch ? { color: col.color } : undefined}
          >
            {isMatch ? row.damage : ''}
          </div>
        );
      })}
    </div>
  );
}
