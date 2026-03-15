import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Column, TimelineEvent, SelectedFrame, Enemy } from '../consts/viewTypes';
import { frameToPx, timelineHeight, frameToTimeLabelPrecise, pxPerFrame } from '../utils/timeline';
import {
  buildDamageTableRows,
  buildDamageTableColumns,
  computeDamageStatistics,
  DamageTableRow,
  DamageTableColumn,
  DamageStatistics,
} from '../controller/calculation/damageTableBuilder';
import { getModelEnemy } from '../controller/calculation/enemyRegistry';
import { StatusQueryService, statToFragilityElements, type WeaponFragilityEffect, type OperatorTalentFragility } from '../controller/calculation/statusQueryService';
import type { Slot } from '../controller/timeline/columnBuilder';
import type { StaggerBreak } from '../controller/timeline/staggerTimeline';
import { aggregateLoadoutStats } from '../controller/calculation/loadoutAggregator';
import { ElementType, StatType } from '../consts/enums';
import { getWeaponEffects } from '../consts/weaponSkillEffects';
import { LoadoutStats, DEFAULT_LOADOUT_STATS } from './InformationPane';
import { OperatorLoadoutState, EMPTY_LOADOUT } from './OperatorLoadoutHeader';

const ROW_HEIGHT = 20;

function formatDamage(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return Math.round(n).toString();
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

interface CombatSheetProps {
  slots: Slot[];
  events: TimelineEvent[];
  columns: Column[];
  enemy: Enemy;
  loadoutStats: Record<string, LoadoutStats>;
  loadouts?: Record<string, OperatorLoadoutState>;
  zoom: number;
  loadoutRowHeight: number;
  selectedFrames?: SelectedFrame[];
  hoverFrame?: number | null;
  onScrollRef?: (el: HTMLDivElement | null) => void;
  onScroll?: (scrollTop: number) => void;
  onZoom?: (deltaY: number) => void;
  staggerBreaks?: readonly StaggerBreak[];
  compact?: boolean;
  showRealTime?: boolean;
  contentFrames?: number;
  onDamageClick?: (row: DamageTableRow) => void;
  onDamageRows?: (rows: DamageTableRow[]) => void;
}

export default function CombatSheet({
  slots, events, columns, enemy, loadoutStats, loadouts, zoom, loadoutRowHeight,
  selectedFrames, hoverFrame, onScrollRef, onScroll: onScrollProp, onZoom,
  staggerBreaks, compact, showRealTime = true, contentFrames: contentFramesProp, onDamageClick, onDamageRows,
}: CombatSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const formatTime = useCallback(
    (frame: number) => frameToTimeLabelPrecise(frame),
    [],
  );
  const tableColumns = useMemo(() => buildDamageTableColumns(columns), [columns]);

  // Build aggregated stats per operator for corrosion Arts Intensity lookup
  const aggregatedStats = useMemo(() => {
    const result: Record<string, { stats: Record<StatType, number> }> = {};
    for (const slot of slots) {
      if (!slot.operator) continue;
      const slotLoadout = loadouts?.[slot.slotId] ?? EMPTY_LOADOUT;
      const slotStats = loadoutStats[slot.slotId] ?? DEFAULT_LOADOUT_STATS;
      const agg = aggregateLoadoutStats(slot.operator.id, slotLoadout, slotStats);
      if (agg) {
        result[slot.slotId] = { stats: agg.stats };
      }
    }
    return result;
  }, [slots, loadouts, loadoutStats]);

  // Pre-compute weapon fragility config: which slots have enemy-targeting DMG Taken debuffs
  const weaponFragility = useMemo(() => {
    const result: Record<string, WeaponFragilityEffect[]> = {};
    for (const slot of slots) {
      if (!slot.operator || !slot.weaponName) continue;
      const entry = getWeaponEffects(slot.weaponName);
      if (!entry) continue;
      const effects: WeaponFragilityEffect[] = [];
      for (const eff of entry.effects) {
        if (eff.target !== 'enemy') continue;
        for (const buff of eff.buffs) {
          const elements = statToFragilityElements(buff.stat as string);
          if (elements) {
            effects.push({ elements, bonus: buff.valueMax });
          }
        }
      }
      if (effects.length > 0) {
        result[slot.slotId] = effects;
      }
    }
    return result;
  }, [slots]);

  // Pre-compute operator talent fragility (e.g. Xaihi Execute Process)
  const talentFragility = useMemo(() => {
    const effects: OperatorTalentFragility[] = [];
    for (const slot of slots) {
      if (!slot.operator) continue;
      const stats = loadoutStats[slot.slotId];
      if (!stats) continue;

      // Xaihi Execute Process: Cryo DMG Taken +7%/10% while Cryo Infliction active
      if (slot.operator.id === 'xaihi' && stats.talentOneLevel >= 1) {
        const bonus = stats.talentOneLevel >= 2 ? 0.10 : 0.07;
        effects.push({ elements: [ElementType.CRYO], bonus, requiredColumnId: 'cryoInfliction' });
      }

      // Endministrator Realspace Stasis: Physical DMG Taken +10%/20% while Originium Crystals attached
      if (slot.operator.id === 'endministrator' && stats.talentTwoLevel >= 1) {
        const bonus = stats.talentTwoLevel >= 2 ? 0.20 : 0.10;
        effects.push({ elements: [ElementType.PHYSICAL], bonus, requiredColumnId: 'originium-crystal' });
      }
    }
    return effects;
  }, [slots, loadoutStats]);

  const statusQuery = useMemo(
    () => new StatusQueryService(events, staggerBreaks ?? [], loadoutStats, aggregatedStats, weaponFragility, talentFragility),
    [events, staggerBreaks, loadoutStats, aggregatedStats, weaponFragility, talentFragility],
  );
  const rows = useMemo(
    () => buildDamageTableRows(events, columns, slots, enemy, loadoutStats, loadouts, statusQuery),
    [events, columns, slots, enemy, loadoutStats, loadouts, statusQuery],
  );
  const bossMaxHp = useMemo(() => {
    const model = getModelEnemy(enemy.id);
    return model ? model.getHp() : null;
  }, [enemy.id]);
  const hasBossHp = bossMaxHp != null;
  const statistics = useMemo(
    () => computeDamageStatistics(rows, tableColumns, bossMaxHp),
    [rows, tableColumns, bossMaxHp],
  );

  // Lift damage rows to parent
  useEffect(() => { onDamageRows?.(rows); }, [rows, onDamageRows]);

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
  const hoveredRow = useMemo(() => {
    if (hoverFrame == null || rows.length === 0) return null;
    const toleranceFrames = Math.ceil(8 / pxPerFrame(zoom)); // 8px hit area
    let best: DamageTableRow | null = null;
    let bestDist = Infinity;
    for (const row of rows) {
      const dist = Math.abs(row.absoluteFrame - hoverFrame);
      if (dist < bestDist && dist <= toleranceFrames) {
        bestDist = dist;
        best = row;
      }
    }
    return best;
  }, [hoverFrame, rows, zoom]);
  const hoveredRowKey = hoveredRow?.key ?? null;
  const hoveredColumnKey = hoveredRow?.columnKey ?? null;

  // Track row+column hover from mouse interaction on cells (for + cross highlight)
  const [mouseHover, setMouseHover] = useState<{ rowKey: string; colKey: string } | null>(null);
  const activeRowKey = mouseHover?.rowKey ?? hoveredRowKey;
  const activeColumnKey = mouseHover?.colKey ?? hoveredColumnKey;

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
    const baseHeight = timelineHeight(zoom, contentFramesProp);
    if (rowLayout.length === 0) return baseHeight;
    const lastRow = rowLayout[rowLayout.length - 1];
    // Extend body if clamped rows push past the natural timeline height
    return Math.max(baseHeight, lastRow.top + ROW_HEIGHT + 16);
  }, [zoom, rowLayout, contentFramesProp]);
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
        <div className="dmg-loadout-ops">
          {slotGroups.map((g) => {
            const opStats = statistics.operators.find((o) => o.ownerId === g.slot.slotId);
            return (
              <div
                key={g.slot.slotId}
                className="dmg-loadout-op"
                style={{
                  '--op-color': g.slot.operator?.color ?? '#666',
                  flex: 1,
                } as React.CSSProperties}
              >
                <span className="dmg-loadout-op-name">{g.slot.operator?.name ?? '\u2014'}</span>
                {opStats && opStats.totalDamage > 0 && (
                  <span className="dmg-loadout-op-stats">
                    {formatDamage(opStats.totalDamage)} ({formatPct(opStats.teamPct)})
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Team total bar — inside loadout spacer to keep header heights aligned */}
        {statistics.teamTotalDamage > 0 && (
          <div className="dmg-team-total">
            <span className="dmg-team-total-label">Team Total</span>
            <span className="dmg-team-total-value">{formatDamage(statistics.teamTotalDamage)}</span>
            <div className="dmg-team-total-bars">
              {statistics.operators.map((op) => {
                const slot = slots.find((s) => s.slotId === op.ownerId);
                if (!slot?.operator || op.totalDamage <= 0) return null;
                return (
                  <div
                    key={op.ownerId}
                    className="dmg-team-bar-segment"
                    style={{
                      width: `${op.teamPct * 100}%`,
                      background: slot.operator.color,
                    }}
                    title={`${slot.operator.name}: ${formatDamage(op.totalDamage)} (${formatPct(op.teamPct)})`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="dmg-header">
        <div className="dmg-header-time">Time</div>
        {tableColumns.map((col) => {
          const colTotal = statistics.columnTotals.get(col.key) ?? 0;
          return (
            <div
              key={col.key}
              className={`dmg-header-skill${col.key === activeColumnKey ? ' dmg-header-skill--highlighted' : ''}`}
              style={{
                '--op-color': col.color,
                flex: colFlexMap.get(col.key) ?? 1,
              } as React.CSSProperties}
            >
              <span className="dmg-header-skill-label">{col.label}</span>
              {colTotal > 0 && (
                <span className="dmg-header-skill-total">{formatDamage(colTotal)}</span>
              )}
            </div>
          );
        })}
        {hasBossHp && (
          <div className="dmg-header-hp">
            <span className="dmg-header-skill-label">Boss HP</span>
            <span className="dmg-header-skill-total">{formatDamage(bossMaxHp!)}</span>
          </div>
        )}
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
                hovered={row.key === activeRowKey}
                highlightedColumnKey={activeColumnKey}
                onCellHover={setMouseHover}
                onDamageClick={onDamageClick}
                hasBossHp={hasBossHp}
                bossMaxHp={bossMaxHp}
                formatTime={formatTime}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DamageRow({ row, tableColumns, colFlexMap, top, selected, hovered, highlightedColumnKey, onCellHover, onDamageClick, hasBossHp, bossMaxHp, formatTime }: {
  row: DamageTableRow;
  tableColumns: DamageTableColumn[];
  colFlexMap: Map<string, number>;
  top: number;
  selected: boolean;
  hovered: boolean;
  highlightedColumnKey: string | null;
  onCellHover: (hover: { rowKey: string; colKey: string } | null) => void;
  onDamageClick?: (row: DamageTableRow) => void;
  hasBossHp: boolean;
  bossMaxHp: number | null;
  formatTime: (frame: number) => string;
}) {
  const cls = `dmg-row${selected ? ' dmg-row--selected' : ''}${hovered && !selected ? ' dmg-row--hovered' : ''}`;
  return (
    <div className={cls} style={{ top }}>
      <div className="dmg-cell dmg-cell-time">
        {formatTime(row.absoluteFrame)}
      </div>
      {tableColumns.map((col) => {
        const isMatch = col.key === row.columnKey;
        const isColHighlighted = col.key === highlightedColumnKey;
        const flex = colFlexMap.get(col.key) ?? 1;
        let displayValue = '';
        if (isMatch) {
          if (row.damage != null) {
            displayValue = formatDamage(row.damage);
          } else if (row.multiplier != null) {
            displayValue = `${(row.multiplier * 100).toFixed(1)}%`;
          } else {
            displayValue = '\u2014';
          }
        }
        return (
          <div
            key={col.key}
            className={`dmg-cell${isMatch ? ' dmg-cell-value' : ' dmg-cell-blank'}${isColHighlighted ? ' dmg-cell--col-highlighted' : ''}${isMatch && row.params ? ' dmg-cell-clickable' : ''}`}
            style={isMatch ? { color: col.color, flex } : { flex }}
            title={isMatch && row.damage != null ? `${row.label}\n${row.damage >= 1_000_000 ? row.damage.toLocaleString() : Math.round(row.damage)} damage${row.multiplier != null ? ` (${(row.multiplier * 100).toFixed(1)}% ATK)` : ''}` : undefined}
            onClick={isMatch && row.params ? () => onDamageClick?.(row) : undefined}
            onMouseEnter={() => onCellHover({ rowKey: row.key, colKey: col.key })}
            onMouseLeave={() => onCellHover(null)}
          >
            {displayValue}
          </div>
        );
      })}
      {hasBossHp && row.hpRemaining != null && (
        <div
          className={`dmg-cell dmg-cell-hp${row.hpRemaining <= 0 ? ' dmg-cell-hp--dead' : ''}`}
          title={`${row.hpRemaining >= 1_000_000 ? row.hpRemaining.toLocaleString() : Math.round(row.hpRemaining)} / ${bossMaxHp! >= 1_000_000 ? bossMaxHp!.toLocaleString() : Math.round(bossMaxHp!)} HP`}
        >
          {formatDamage(row.hpRemaining)}
        </div>
      )}
    </div>
  );
}
