import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Column, TimelineEvent, SelectedFrame, Enemy } from '../consts/viewTypes';
import { frameToPx, timelineHeight, frameToTimeLabelPrecise, pxPerFrame, secondsToFrames } from '../utils/timeline';
import {
  buildDamageTableRows,
  buildDamageTableColumns,
  computeDamageStatistics,
  mergeRowsByFrame,
  buildCollapsedColumns,
  DamageTableRow,
  DamageTableColumn,
  MergedDamageRow,
  CollapsedColumn,
} from '../controller/calculation/damageTableBuilder';
import { getModelEnemy } from '../controller/calculation/enemyRegistry';
import { EventsQueryService, statToFragilityElements, type WeaponFragilityEffect, type OperatorTalentFragility } from '../controller/timeline/eventsQueryService';
import { getLastController } from '../controller/timeline/eventQueue';
import type { Slot } from '../controller/timeline/columnBuilder';
import type { StaggerBreak } from '../controller/timeline/staggerTimeline';
import { aggregateLoadoutStats } from '../controller/calculation/loadoutAggregator';
import { CritMode, ElementType, StatType } from '../consts/enums';
import { getWeaponEffectDefs, resolveTargetDisplay } from '../model/game-data/weaponGearEffectLoader';
import { LoadoutProperties, DEFAULT_LOADOUT_PROPERTIES } from './InformationPane';
import { OperatorLoadoutState, EMPTY_LOADOUT } from './OperatorLoadoutHeader';
import { OPERATORS, WEAPONS, GEARS, CONSUMABLES, TACTICALS } from '../utils/loadoutRegistry';

const ROW_HEIGHT = 22;

const CRIT_MODE_CYCLE: CritMode[] = [CritMode.EXPECTED, CritMode.NONE, CritMode.ALWAYS];
const CRIT_MODE_LABELS: Record<CritMode, string> = {
  [CritMode.EXPECTED]: 'E[CRIT]',
  [CritMode.NONE]: 'NO CRIT',
  [CritMode.ALWAYS]: 'MAX CRIT',
};

function formatDamage(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  const rounded = Math.round(n);
  if (rounded >= 10_000) return rounded.toLocaleString();
  return rounded.toString();
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

interface CombatSheetProps {
  slots: Slot[];
  events: TimelineEvent[];
  columns: Column[];
  enemy: Enemy;
  loadoutProperties: Record<string, LoadoutProperties>;
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
  critMode?: CritMode;
  onCritModeChange?: (mode: CritMode) => void;
  plannerHidden?: boolean;
}

export default function CombatSheet({
  slots, events, columns, enemy, loadoutProperties, loadouts, zoom, loadoutRowHeight,
  selectedFrames, hoverFrame, onScrollRef, onScroll: onScrollProp, onZoom,
  staggerBreaks, compact, showRealTime = true, contentFrames: contentFramesProp, onDamageClick, onDamageRows,
  critMode = CritMode.EXPECTED, onCritModeChange, plannerHidden,
}: CombatSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const formatTime = useCallback(
    (frame: number) => frameToTimeLabelPrecise(frame),
    [],
  );
  const tableColumns = useMemo(() => buildDamageTableColumns(columns), [columns]);

  // Collapsed mode: one column per operator
  const [collapsed, setCollapsed] = useState(false);
  const collapsedColumns = useMemo(
    () => buildCollapsedColumns(tableColumns, slots),
    [tableColumns, slots],
  );

  // Build aggregated stats per operator for corrosion Arts Intensity lookup
  const aggregatedStats = useMemo(() => {
    const result: Record<string, { stats: Record<StatType, number> }> = {};
    for (const slot of slots) {
      if (!slot.operator) continue;
      const slotLoadout = loadouts?.[slot.slotId] ?? EMPTY_LOADOUT;
      const slotStats = loadoutProperties[slot.slotId] ?? DEFAULT_LOADOUT_PROPERTIES;
      const agg = aggregateLoadoutStats(slot.operator.id, slotLoadout, slotStats);
      if (agg) {
        result[slot.slotId] = { stats: agg.stats };
      }
    }
    return result;
  }, [slots, loadouts, loadoutProperties]);

  // Pre-compute weapon fragility config: which slots have enemy-targeting DMG Taken debuffs
  const weaponFragility = useMemo(() => {
    const result: Record<string, WeaponFragilityEffect[]> = {};
    for (const slot of slots) {
      if (!slot.operator || !slot.weaponName) continue;
      const defs = getWeaponEffectDefs(slot.weaponName);
      if (defs.length === 0) continue;
      const effects: WeaponFragilityEffect[] = [];
      for (const def of defs) {
        if (resolveTargetDisplay(def) !== 'enemy') continue;
        for (const buff of (def.buffs ?? [])) {
          const elements = statToFragilityElements(buff.stat as string);
          if (elements) {
            effects.push({ elements, bonus: buff.valueMax ?? buff.value ?? 0 });
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
      const stats = loadoutProperties[slot.slotId];
      if (!stats) continue;

      // Xaihi Execute Process: Cryo DMG Taken +7%/10% while Cryo Infliction active
      if (slot.operator.id === 'xaihi' && stats.operator.talentOneLevel >= 1) {
        const bonus = stats.operator.talentOneLevel >= 2 ? 0.10 : 0.07;
        effects.push({ elements: [ElementType.CRYO], bonus, requiredColumnId: 'cryoInfliction' });
      }

      // Endministrator Realspace Stasis: Physical DMG Taken +10%/20% while Originium Crystals attached
      if (slot.operator.id === 'endministrator' && stats.operator.talentTwoLevel >= 1) {
        const bonus = stats.operator.talentTwoLevel >= 2 ? 0.20 : 0.10;
        effects.push({ elements: [ElementType.PHYSICAL], bonus, requiredColumnId: 'originium-crystal' });
      }
    }
    return effects;
  }, [slots, loadoutProperties]);

  const statusQuery = useMemo(
    () => new EventsQueryService(getLastController(), staggerBreaks ?? [], loadoutProperties, aggregatedStats, weaponFragility, talentFragility),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, staggerBreaks, loadoutProperties, aggregatedStats, weaponFragility, talentFragility],
  );
  const rows = useMemo(
    () => buildDamageTableRows(events, columns, slots, enemy, loadoutProperties, loadouts, statusQuery, critMode),
    [events, columns, slots, enemy, loadoutProperties, loadouts, statusQuery, critMode],
  );
  const bossMaxHp = useMemo(() => {
    const model = getModelEnemy(enemy.id);
    return model ? model.getHp() : null;
  }, [enemy.id]);
  const hasBossHp = bossMaxHp != null;

  // DPS range filter — user can set start/end time to scope the statistics window
  const [dpsRangeStart, setDpsRangeStart] = useState('');
  const [dpsRangeEnd, setDpsRangeEnd] = useState('');
  const rangeStartFrame = dpsRangeStart ? secondsToFrames(dpsRangeStart) : undefined;
  const rangeEndFrame = dpsRangeEnd ? secondsToFrames(dpsRangeEnd) : undefined;

  const statistics = useMemo(
    () => computeDamageStatistics(rows, tableColumns, bossMaxHp, rangeStartFrame, rangeEndFrame),
    [rows, tableColumns, bossMaxHp, rangeStartFrame, rangeEndFrame],
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

  // Merge rows by frame for denser display
  const mergedRows = useMemo(() => mergeRowsByFrame(rows), [rows]);

  // Find nearest merged row for hover highlighting
  const hoveredMergedKey = useMemo(() => {
    if (hoverFrame == null || mergedRows.length === 0) return null;
    const toleranceFrames = Math.ceil(8 / pxPerFrame(zoom));
    let best: MergedDamageRow | null = null;
    let bestDist = Infinity;
    for (const mr of mergedRows) {
      const dist = Math.abs(mr.absoluteFrame - hoverFrame);
      if (dist < bestDist && dist <= toleranceFrames) {
        bestDist = dist;
        best = mr;
      }
    }
    return best?.key ?? null;
  }, [hoverFrame, mergedRows, zoom]);

  // Track row+column hover from mouse interaction on cells (for + cross highlight)
  const [mouseHover, setMouseHover] = useState<{ rowKey: string; colKey: string } | null>(null);
  const activeRowKey = mouseHover?.rowKey ?? hoveredMergedKey;
  const activeColumnKey = mouseHover?.colKey ?? null;

  // Compute clamped top positions for merged rows
  const mergedRowLayout = useMemo(() => {
    const layout: { merged: MergedDamageRow; top: number }[] = [];
    let prevBottom = -Infinity;
    for (let i = 0; i < mergedRows.length; i++) {
      const mr = mergedRows[i];
      const frameTop = frameToPx(mr.absoluteFrame, zoom) - ROW_HEIGHT / 2;
      const top = compact ? i * ROW_HEIGHT : Math.max(frameTop, prevBottom);
      layout.push({ merged: mr, top });
      prevBottom = top + ROW_HEIGHT;
    }
    return layout;
  }, [mergedRows, zoom, compact]);


  const tlHeight = useMemo(() => {
    const baseHeight = timelineHeight(zoom, contentFramesProp);
    if (mergedRowLayout.length === 0) return baseHeight;
    const lastRow = mergedRowLayout[mergedRowLayout.length - 1];
    return Math.max(baseHeight, lastRow.top + ROW_HEIGHT + 16);
  }, [zoom, mergedRowLayout, contentFramesProp]);
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
            <button
              className={`dmg-crit-toggle dmg-crit-toggle--${critMode.toLowerCase()}`}
              onClick={() => {
                const idx = CRIT_MODE_CYCLE.indexOf(critMode);
                const next = CRIT_MODE_CYCLE[(idx + 1) % CRIT_MODE_CYCLE.length];
                onCritModeChange?.(next);
              }}
              title={`Crit mode: ${CRIT_MODE_LABELS[critMode]}. Click to cycle.`}
            >
              {CRIT_MODE_LABELS[critMode]}
            </button>
            <button
              className={`dmg-collapse-toggle${collapsed ? ' dmg-collapse-toggle--active' : ''}`}
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expand to individual skill columns' : 'Collapse to one column per operator'}
            >
              {collapsed ? 'EXPAND' : 'COLLAPSE'}
            </button>
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

        {/* Extended statistics row */}
        {statistics.teamTotalDamage > 0 && (
          <div className="dmg-stats-row">
            {statistics.teamDps != null && (
              <span className="dmg-stats-item" title="Team damage per second (set range to filter)">
                <span className="dmg-stats-label">DPS</span>
                <span className="dmg-stats-value">{formatDamage(statistics.teamDps)}</span>
              </span>
            )}
            <span className="dmg-stats-item dmg-stats-item--range" title="DPS time range (seconds). Leave empty for full timeline.">
              <input
                className="dmg-range-input"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={dpsRangeStart}
                onChange={(e) => setDpsRangeStart(e.target.value)}
              />
              <span className="dmg-range-sep">&ndash;</span>
              <input
                className="dmg-range-input"
                type="text"
                inputMode="decimal"
                placeholder="end"
                value={dpsRangeEnd}
                onChange={(e) => setDpsRangeEnd(e.target.value)}
              />
            </span>
            {statistics.highestTick && (
              <span className="dmg-stats-item" title={`Highest tick: ${statistics.highestTick.label}`}>
                <span className="dmg-stats-label">Peak</span>
                <span className="dmg-stats-value">{formatDamage(statistics.highestTick.damage)}</span>
              </span>
            )}
            {statistics.highestBurst && (
              <span className="dmg-stats-item" title={`Best 5s burst window: ${formatTime(statistics.highestBurst.startFrame)} – ${formatTime(statistics.highestBurst.endFrame)}`}>
                <span className="dmg-stats-label">5s Burst</span>
                <span className="dmg-stats-value">{formatDamage(statistics.highestBurst.damage)}</span>
              </span>
            )}
            {statistics.timeToKill != null && (
              <span className="dmg-stats-item dmg-stats-item--ttk" title="Time to kill">
                <span className="dmg-stats-label">TTK</span>
                <span className="dmg-stats-value">{formatTime(statistics.timeToKill)}</span>
              </span>
            )}
          </div>
        )}

        {/* Minimized loadout icons when planner is hidden */}
        {plannerHidden && (
          <div className="dmg-mini-loadout">
            {slots.map((slot) => {
              if (!slot.operator) return null;
              const opEntry = OPERATORS.find((o) => o.name === slot.operator!.name);
              const loadout = loadouts?.[slot.slotId];
              const weaponEntry = loadout?.weaponName ? WEAPONS.find((w) => w.name === loadout.weaponName) : null;
              const armorEntry = loadout?.armorName ? GEARS.find((g) => g.name === loadout.armorName) : null;
              const glovesEntry = loadout?.glovesName ? GEARS.find((g) => g.name === loadout.glovesName) : null;
              const kit1Entry = loadout?.kit1Name ? GEARS.find((g) => g.name === loadout.kit1Name) : null;
              const kit2Entry = loadout?.kit2Name ? GEARS.find((g) => g.name === loadout.kit2Name) : null;
              const consumableEntry = loadout?.consumableName ? CONSUMABLES.find((c) => c.name === loadout.consumableName) : null;
              const tacticalEntry = loadout?.tacticalName ? TACTICALS.find((t) => t.name === loadout.tacticalName) : null;

              // Always show weapon + gear slots; only show CSM/TAC if selected
              const coreItems = [weaponEntry, armorEntry, glovesEntry, kit1Entry, kit2Entry];
              const items = [
                ...coreItems,
                ...(consumableEntry ? [consumableEntry] : []),
                ...(tacticalEntry ? [tacticalEntry] : []),
              ];

              return (
                <div key={slot.slotId} className="dmg-mini-loadout-slot" style={{ '--op-color': slot.operator.color } as React.CSSProperties}>
                  <div className="dmg-mini-loadout-op">
                    {opEntry?.icon && <img className="dmg-mini-loadout-icon dmg-mini-loadout-icon--op" src={opEntry.icon} alt={slot.operator.name} />}
                    <span className="dmg-mini-loadout-name">{slot.operator.name}</span>
                  </div>
                  <div className="dmg-mini-loadout-items">
                    {items.map((entry, i) => entry?.icon ? (
                      <img key={i} className="dmg-mini-loadout-icon" src={entry.icon} alt={entry.name} title={entry.name} />
                    ) : i < coreItems.length ? (
                      <span key={i} className="dmg-mini-loadout-icon dmg-mini-loadout-icon--empty" />
                    ) : null)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className="dmg-header">
        <div className="dmg-header-time">Time</div>
        {collapsed ? (
          collapsedColumns.map((cc) => {
            const opTotal = statistics.operators.find((o) => o.ownerId === cc.ownerId)?.totalDamage ?? 0;
            return (
              <div
                key={cc.key}
                className={`dmg-header-skill${cc.key === activeColumnKey ? ' dmg-header-skill--highlighted' : ''}`}
                style={{ '--op-color': cc.color, flex: 1 } as React.CSSProperties}
              >
                <span className="dmg-header-skill-label dmg-header-skill-label--collapsed">{cc.label}</span>
                {opTotal > 0 && (
                  <span className="dmg-header-skill-total">{formatDamage(opTotal)}</span>
                )}
              </div>
            );
          })
        ) : (
          tableColumns.map((col) => {
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
          })
        )}
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
          {mergedRowLayout.length === 0 ? (
            <div className="dmg-body-empty">
              Add events to the timeline to see damage calculations
            </div>
          ) : (
            mergedRowLayout.map(({ merged, top }) => (
              <MergedRow
                key={merged.key}
                merged={merged}
                tableColumns={tableColumns}
                collapsedColumns={collapsedColumns}
                collapsed={collapsed}
                colFlexMap={colFlexMap}
                top={top}
                selectedFrames={selectedFrames}
                hovered={merged.key === activeRowKey}
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

function MergedRow({ merged, tableColumns, collapsedColumns, collapsed, colFlexMap, top, selectedFrames, hovered, highlightedColumnKey, onCellHover, onDamageClick, hasBossHp, bossMaxHp, formatTime }: {
  merged: MergedDamageRow;
  tableColumns: DamageTableColumn[];
  collapsedColumns: CollapsedColumn[];
  collapsed: boolean;
  colFlexMap: Map<string, number>;
  top: number;
  selectedFrames?: SelectedFrame[];
  hovered: boolean;
  highlightedColumnKey: string | null;
  onCellHover: (hover: { rowKey: string; colKey: string } | null) => void;
  onDamageClick?: (row: DamageTableRow) => void;
  hasBossHp: boolean;
  bossMaxHp: number | null;
  formatTime: (frame: number) => string;
}) {
  const hasSelection = selectedFrames?.some((sf) => {
    let found = false;
    merged.cells.forEach((row) => {
      if (sf.eventId === row.eventId && sf.segmentIndex === row.segmentIndex && sf.frameIndex === row.frameIndex) found = true;
    });
    return found;
  }) ?? false;

  const cellCount = merged.cells.size;
  const cls = `dmg-row${hasSelection ? ' dmg-row--selected' : ''}${hovered && !hasSelection ? ' dmg-row--hovered' : ''}${cellCount > 1 ? ' dmg-row--multi' : ''}`;

  return (
    <div className={cls} style={{ top }}>
      <div className="dmg-cell dmg-cell-time">
        {formatTime(merged.absoluteFrame)}
      </div>
      {collapsed ? (
        // Collapsed mode: one cell per operator, sum damage from all their columns
        collapsedColumns.map((cc) => {
          let totalDmg = 0;
          let clickableRow: DamageTableRow | null = null;
          let color = cc.color;
          for (const colKey of cc.sourceColumnKeys) {
            const row = merged.cells.get(colKey);
            if (row) {
              totalDmg += row.damage ?? 0;
              if (row.params && !clickableRow) clickableRow = row;
              color = row.columnKey ? (tableColumns.find((c) => c.key === row.columnKey)?.color ?? cc.color) : cc.color;
            }
          }
          const hasValue = cc.sourceColumnKeys.some((k) => merged.cells.has(k));
          const isColHighlighted = cc.key === highlightedColumnKey;
          return (
            <div
              key={cc.key}
              className={`dmg-cell${hasValue ? ' dmg-cell-value' : ' dmg-cell-blank'}${isColHighlighted ? ' dmg-cell--col-highlighted' : ''}${clickableRow ? ' dmg-cell-clickable' : ''}`}
              style={hasValue ? { color, flex: 1 } : { flex: 1 }}
              onClick={clickableRow ? () => onDamageClick?.(clickableRow!) : undefined}
              onMouseEnter={() => onCellHover({ rowKey: merged.key, colKey: cc.key })}
              onMouseLeave={() => onCellHover(null)}
            >
              {hasValue ? formatDamage(totalDmg) : ''}
            </div>
          );
        })
      ) : (
        // Expanded mode: one cell per skill column
        tableColumns.map((col) => {
          const row = merged.cells.get(col.key);
          const isColHighlighted = col.key === highlightedColumnKey;
          const flex = colFlexMap.get(col.key) ?? 1;
          let displayValue = '';
          if (row) {
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
              className={`dmg-cell${row ? ' dmg-cell-value' : ' dmg-cell-blank'}${isColHighlighted ? ' dmg-cell--col-highlighted' : ''}${row?.params ? ' dmg-cell-clickable' : ''}`}
              style={row ? { color: col.color, flex } : { flex }}
              title={row?.damage != null ? `${row.label}\n${Math.round(row.damage).toLocaleString()} damage${row.multiplier != null ? ` (${(row.multiplier * 100).toFixed(1)}% ATK)` : ''}` : undefined}
              onClick={row?.params ? () => onDamageClick?.(row) : undefined}
              onMouseEnter={() => onCellHover({ rowKey: merged.key, colKey: col.key })}
              onMouseLeave={() => onCellHover(null)}
            >
              {displayValue}
            </div>
          );
        })
      )}
      {hasBossHp && merged.hpRemaining != null && (
        <div
          className={`dmg-cell dmg-cell-hp${merged.hpRemaining <= 0 ? ' dmg-cell-hp--dead' : ''}`}
          title={`${Math.round(merged.hpRemaining).toLocaleString()} / ${Math.round(bossMaxHp!).toLocaleString()} HP`}
        >
          {formatDamage(merged.hpRemaining)}
        </div>
      )}
    </div>
  );
}
