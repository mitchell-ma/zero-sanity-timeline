import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Column, TimelineEvent, SelectedFrame, Enemy, ContextMenuItem } from '../consts/viewTypes';
import ContextMenu from './ContextMenu';
import { frameToPx, timelineHeight, frameToTimeLabelPrecise, pxPerFrame, secondsToFrames } from '../utils/timeline';
import {
  buildDamageTableColumns,
  computeDamageStatistics,
  DamageTableRow,
} from '../controller/calculation/damageTableBuilder';
import { getModelEnemy } from '../controller/calculation/enemyRegistry';
import { runCalculation } from '../controller/calculation/calculationController';
import type { Slot } from '../controller/timeline/columnBuilder';
import type { StaggerBreak } from '../controller/timeline/staggerTimeline';
import { ResourcePoint } from '../controller/timeline/resourceTimeline';
import { CritMode, CombatSkillsType } from '../consts/enums';
import { LoadoutProperties } from './InformationPane';
import { OperatorLoadoutState } from './OperatorLoadoutHeader';
import { OPERATORS, WEAPONS, GEARS, CONSUMABLES, TACTICALS } from '../utils/loadoutRegistry';
import { COMBAT_SKILL_LABELS, SKILL_LABELS } from '../consts/timelineColumnLabels';
import { SkillType } from '../consts/viewTypes';

const ROW_HEIGHT = 22;

// ── Sheet column definitions ────────────────────────────────────────────────

const enum SheetCol {
  TIME = 'time',
  OPERATOR = 'operator',
  TYPE = 'type',
  SOURCE = 'source',
  DAMAGE = 'damage',
  BOSS_HP = 'bossHp',
  BOSS_STAGGER = 'bossStagger',
  ULT_CHARGE = 'ultCharge',
  SKILL_POINTS = 'skillPoints',
}

interface SheetColDef {
  id: SheetCol;
  label: string;
  flex: number;
  align: 'left' | 'right';
  headerClass: string;
  cellClass: string;
  defaultVisible: boolean;
}

const SHEET_COL_DEFS: SheetColDef[] = [
  { id: SheetCol.TIME,          label: 'Time',          flex: 2, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--time',   cellClass: 'dmg-cell-time',          defaultVisible: true },
  { id: SheetCol.OPERATOR,      label: 'Operator',      flex: 4, align: 'left',  headerClass: 'dmg-header-flat dmg-header-flat--op',     cellClass: 'dmg-cell-flat-op',       defaultVisible: true },
  { id: SheetCol.TYPE,          label: 'Type',          flex: 2, align: 'left',  headerClass: 'dmg-header-flat dmg-header-flat--type',   cellClass: 'dmg-cell-flat-type',     defaultVisible: true },
  { id: SheetCol.SOURCE,        label: 'Source',        flex: 3, align: 'left',  headerClass: 'dmg-header-flat dmg-header-flat--source', cellClass: 'dmg-cell-flat-source',   defaultVisible: true },
  { id: SheetCol.DAMAGE,        label: 'Damage',        flex: 3, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--dmg',    cellClass: 'dmg-cell-flat-dmg',      defaultVisible: true },
  { id: SheetCol.BOSS_HP,       label: 'Boss HP',       flex: 3, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--hp',     cellClass: 'dmg-cell-hp',            defaultVisible: true },
  { id: SheetCol.BOSS_STAGGER,  label: 'Boss Stagger',  flex: 2, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--generic', cellClass: 'dmg-cell-flat-generic',  defaultVisible: false },
  { id: SheetCol.ULT_CHARGE,    label: 'Ult Charge',    flex: 2, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--generic', cellClass: 'dmg-cell-flat-generic',  defaultVisible: false },
  { id: SheetCol.SKILL_POINTS,  label: 'Skill Points',  flex: 2, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--generic', cellClass: 'dmg-cell-flat-generic',  defaultVisible: false },
];

const COL_DEF_MAP = new Map(SHEET_COL_DEFS.map((d) => [d.id, d]));

const DEFAULT_ORDER: SheetCol[] = SHEET_COL_DEFS.map((d) => d.id);

function buildDefaultVisible(): Record<SheetCol, boolean> {
  const v = {} as Record<SheetCol, boolean>;
  for (const d of SHEET_COL_DEFS) v[d.id] = d.defaultVisible;
  return v;
}

const LS_COL_VISIBLE_KEY = 'zst-sheet-col-visible';
const LS_COL_ORDER_KEY = 'zst-sheet-col-order';

function loadColVisible(): Record<SheetCol, boolean> {
  try {
    const raw = localStorage.getItem(LS_COL_VISIBLE_KEY);
    if (!raw) return buildDefaultVisible();
    const saved = JSON.parse(raw) as Record<string, boolean>;
    const result = buildDefaultVisible();
    for (const def of SHEET_COL_DEFS) {
      if (saved[def.id] !== undefined) result[def.id] = saved[def.id];
    }
    return result;
  } catch { return buildDefaultVisible(); }
}

function loadColOrder(): SheetCol[] {
  try {
    const raw = localStorage.getItem(LS_COL_ORDER_KEY);
    if (!raw) return DEFAULT_ORDER;
    const saved = JSON.parse(raw) as string[];
    const validIds = new Set<string>(DEFAULT_ORDER);
    const filtered = saved.filter((id) => validIds.has(id)) as SheetCol[];
    // Append any new columns not in saved order
    for (const id of DEFAULT_ORDER) {
      if (!filtered.includes(id)) filtered.push(id);
    }
    return filtered;
  } catch { return DEFAULT_ORDER; }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const CRIT_MODE_CYCLE: CritMode[] = [CritMode.EXPECTED, CritMode.NEVER, CritMode.ALWAYS, CritMode.SIMULATION];
const CRIT_MODE_LABELS: Record<CritMode, string> = {
  [CritMode.EXPECTED]: 'E[CRIT]',
  [CritMode.NEVER]: 'NO CRIT',
  [CritMode.ALWAYS]: 'MAX CRIT',
  [CritMode.SIMULATION]: 'SIM',
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

function getSkillDisplayName(skillName: string): string {
  return COMBAT_SKILL_LABELS[skillName as CombatSkillsType] ?? skillName;
}

function getCategoryLabel(columnId: string): string {
  return SKILL_LABELS[columnId as SkillType] ?? columnId.toUpperCase();
}

/** Get the resource value after all events at a given frame have been processed.
 *  Returns the last point at or before the frame (no interpolation). */
function getResourceValueAfter(points: ReadonlyArray<ResourcePoint>, frame: number): number {
  if (points.length === 0) return 0;
  // Binary search for the last point at or before `frame`
  let lo = 0;
  let hi = points.length - 1;
  let result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].frame <= frame) {
      result = points[mid].value;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

interface OperatorInfo {
  name: string;
  color: string;
  icon?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

interface CombatSheetProps {
  slots: Slot[];
  events: TimelineEvent[];
  columns: Column[];
  enemy: Enemy;
  loadoutProperties: Record<string, LoadoutProperties>;
  loadouts?: Record<string, OperatorLoadoutState>;
  zoom: number;
  loadoutRowHeight: number;
  headerRowHeight?: number;
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
  resourceGraphs?: Map<string, { points: ReadonlyArray<ResourcePoint>; min: number; max: number }>;
}

export default function CombatSheet({
  slots, events, columns, enemy, loadoutProperties, loadouts, zoom, loadoutRowHeight, headerRowHeight,
  selectedFrames, hoverFrame, onScrollRef, onScroll: onScrollProp, onZoom,
  staggerBreaks, compact, showRealTime = true, contentFrames: contentFramesProp, onDamageClick, onDamageRows,
  critMode = CritMode.EXPECTED, onCritModeChange, plannerHidden, resourceGraphs,
}: CombatSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const formatTime = useCallback(
    (frame: number) => frameToTimeLabelPrecise(frame),
    [],
  );
  const tableColumns = useMemo(() => buildDamageTableColumns(columns), [columns]);

  // Column visibility + order state (persisted to localStorage)
  const [colVisible, setColVisible] = useState<Record<SheetCol, boolean>>(loadColVisible);
  const [colOrder, setColOrder] = useState<SheetCol[]>(loadColOrder);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);

  // Persist column settings to localStorage
  useEffect(() => {
    try { localStorage.setItem(LS_COL_VISIBLE_KEY, JSON.stringify(colVisible)); } catch { /* ignore */ }
  }, [colVisible]);
  useEffect(() => {
    try { localStorage.setItem(LS_COL_ORDER_KEY, JSON.stringify(colOrder)); } catch { /* ignore */ }
  }, [colOrder]);

  // Mouse-based drag reorder — live measurement on every move
  const [draggingCol, setDraggingCol] = useState<SheetCol | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [dragColRect, setDragColRect] = useState<{ left: number; width: number } | null>(null);
  // Use a ref for colOrder inside mousemove so the closure always sees the latest
  const colOrderRef = useRef(colOrder);
  colOrderRef.current = colOrder;

  const toggleCol = useCallback((col: SheetCol) => {
    setColVisible((prev) => ({ ...prev, [col]: !prev[col] }));
  }, []);

  const handleHeaderContext = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setHeaderMenu({ x: e.clientX, y: e.clientY });
  }, []);

  /** Read live header child rects and find which column index the cursor is over. */
  const getTargetIndex = useCallback((cursorX: number): number => {
    const header = headerRef.current;
    if (!header) return -1;
    const children = Array.from(header.children) as HTMLElement[];
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      if (cursorX < rect.left + rect.width / 2) return i;
    }
    return children.length - 1;
  }, []);

  /** Compute the dragged column's rect from flex ratios — no DOM measurement needed. */
  const computeColRect = useCallback((visOrder: SheetCol[], col: SheetCol) => {
    const header = headerRef.current;
    if (!header) return;
    const parentRect = header.parentElement!.getBoundingClientRect();
    const totalWidth = header.getBoundingClientRect().width;
    const padding = parseFloat(getComputedStyle(header).paddingLeft) + parseFloat(getComputedStyle(header).paddingRight);
    const innerWidth = totalWidth - padding;
    const paddingLeft = parseFloat(getComputedStyle(header).paddingLeft);

    const defs = visOrder.map((id) => COL_DEF_MAP.get(id)!);
    const totalFlex = defs.reduce((sum, d) => sum + d.flex, 0);

    let left = paddingLeft;
    for (const d of defs) {
      const w = (d.flex / totalFlex) * innerWidth;
      if (d.id === col) {
        const headerLeft = header.getBoundingClientRect().left - parentRect.left;
        setDragColRect({ left: headerLeft + left, width: w });
        return;
      }
      left += w;
    }
  }, []);

  const handleMouseDown = useCallback((col: SheetCol, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX;
    let hasMoved = false;
    let rafId = 0;

    const onMouseMove = (me: MouseEvent) => {
      if (!hasMoved && Math.abs(me.clientX - startX) < 4) return;

      if (!hasMoved) {
        hasMoved = true;
        setDraggingCol(col);
        document.body.style.cursor = 'grabbing';
        const vis = colOrderRef.current.filter((id) => colVisible[id]);
        computeColRect(vis, col);
      }

      // Throttle reorder to animation frames
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const targetIdx = getTargetIndex(me.clientX);
        if (targetIdx === -1) return;

        const current = colOrderRef.current;
        const vis = current.filter((id) => colVisible[id]);
        const srcIdx = vis.indexOf(col);
        if (srcIdx === -1 || srcIdx === targetIdx) return;

        // Move within visible columns
        const next = [...vis];
        next.splice(srcIdx, 1);
        next.splice(targetIdx, 0, col);

        // Rebuild full order preserving hidden columns
        const hidden = current.filter((id) => !colVisible[id]);
        const full = [...next, ...hidden];
        setColOrder(full);

        // Compute overlay from flex ratios — instant, no DOM wait
        computeColRect(next, col);
      });
    };

    const onMouseUp = () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      setDraggingCol(null);
      setDragColRect(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [colVisible, getTargetIndex, computeColRect]);

  // Visible ordered column defs
  const visibleCols = useMemo(
    () => colOrder.filter((id) => colVisible[id]).map((id) => COL_DEF_MAP.get(id)!),
    [colOrder, colVisible],
  );

  // Build operator info lookup: slotId → { name, color, icon }
  const opInfoMap = useMemo(() => {
    const map = new Map<string, OperatorInfo>();
    for (const slot of slots) {
      if (!slot.operator) continue;
      const entry = OPERATORS.find((o) => o.name === slot.operator!.name);
      map.set(slot.slotId, {
        name: slot.operator.name,
        color: slot.operator.color,
        icon: entry?.icon,
      });
    }
    return map;
  }, [slots]);

  const { rows } = useMemo(
    () => runCalculation(events, columns, slots, enemy, loadoutProperties, loadouts, staggerBreaks, critMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, columns, slots, enemy, loadoutProperties, loadouts, staggerBreaks, critMode],
  );
  const bossMaxHp = useMemo(() => {
    const model = getModelEnemy(enemy.id);
    return model ? model.getHp() : null;
  }, [enemy.id]);

  // DPS range filter
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

  // Forward shift+scroll to zoom handler
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

  useEffect(() => {
    onScrollRef?.(scrollRef.current);
    return () => onScrollRef?.(null);
  }, [onScrollRef]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current && onScrollProp) {
      onScrollProp(scrollRef.current.scrollTop);
    }
  }, [onScrollProp]);

  // Find nearest row for hover highlighting
  const hoveredRowKey = useMemo(() => {
    if (hoverFrame == null || rows.length === 0) return null;
    const toleranceFrames = Math.ceil(8 / pxPerFrame(zoom));
    let best: DamageTableRow | null = null;
    let bestDist = Infinity;
    for (const row of rows) {
      const dist = Math.abs(row.absoluteFrame - hoverFrame);
      if (dist < bestDist && dist <= toleranceFrames) {
        bestDist = dist;
        best = row;
      }
    }
    return best?.key ?? null;
  }, [hoverFrame, rows, zoom]);

  // Compute row layout (top positions) — one row per DamageTableRow
  const rowLayout = useMemo(() => {
    const layout: { row: DamageTableRow; top: number }[] = [];
    let prevBottom = -Infinity;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const frameTop = frameToPx(row.absoluteFrame, zoom) - ROW_HEIGHT / 2;
      const top = compact ? i * ROW_HEIGHT : Math.max(frameTop, prevBottom);
      layout.push({ row, top });
      prevBottom = top + ROW_HEIGHT;
    }
    return layout;
  }, [rows, zoom, compact]);

  const tlHeight = useMemo(() => {
    const baseHeight = timelineHeight(zoom, contentFramesProp);
    if (rowLayout.length === 0) return baseHeight;
    const lastRow = rowLayout[rowLayout.length - 1];
    return Math.max(baseHeight, lastRow.top + ROW_HEIGHT + 16);
  }, [zoom, rowLayout, contentFramesProp]);

  if (tableColumns.length === 0) {
    return (
      <div className="dmg-table-empty">
        <span className="dmg-table-empty-text">No skill columns</span>
      </div>
    );
  }

  return (
    <div className="dmg-table-outer">
      {/* Loadout spacer — team stats summary */}
      <div
        className="dmg-loadout-spacer"
        style={{ height: loadoutRowHeight }}
      >
        <div className="dmg-loadout-ops">
          {slots.map((slot) => {
            if (!slot.operator) return null;
            const opStats = statistics.operators.find((o) => o.ownerId === slot.slotId);
            return (
              <div
                key={slot.slotId}
                className="dmg-loadout-op"
                style={{
                  '--op-color': slot.operator.color,
                  flex: 1,
                } as React.CSSProperties}
              >
                <span className="dmg-loadout-op-name">{slot.operator.name}</span>
                {opStats && opStats.totalDamage > 0 && (
                  <span className="dmg-loadout-op-stats">
                    {formatDamage(opStats.totalDamage)} ({formatPct(opStats.teamPct)})
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Team total bar */}
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

      {/* Column headers — data-driven, draggable for reorder */}
      <div
        ref={headerRef}
        className={`dmg-header${draggingCol ? ' dmg-header--reordering' : ''}`}
        style={headerRowHeight ? { height: headerRowHeight } : undefined}
        onContextMenu={handleHeaderContext}
      >
        {visibleCols.map((def) => (
          <div
            key={def.id}
            className={`${def.headerClass}${def.id === draggingCol ? ' dmg-header--dragging' : ''}`}
            style={{ flex: def.flex, textAlign: 'left' }}
            onMouseDown={(e) => handleMouseDown(def.id, e)}
          >
            {def.label}
          </div>
        ))}
      </div>

      {headerMenu && (
        <ContextMenu
          x={headerMenu.x}
          y={headerMenu.y}
          items={colOrder.map((id): ContextMenuItem => ({
            label: COL_DEF_MAP.get(id)!.label,
            checked: colVisible[id],
            keepOpen: true,
            action: () => toggleCol(id),
          }))}
          onClose={() => setHeaderMenu(null)}
        />
      )}

      {/* Scrollable body */}
      {/* Full-column drag overlay — covers header + body, not loadout area */}
      {draggingCol && dragColRect && headerRef.current && (
        <div
          className="dmg-drag-col-overlay"
          style={{
            left: dragColRect.left,
            width: dragColRect.width,
            top: headerRef.current.offsetTop,
            bottom: 0,
          }}
        />
      )}

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
              <FlatRow
                key={row.key}
                row={row}
                opInfo={opInfoMap.get(row.ownerId)}
                top={top}
                selectedFrames={selectedFrames}
                hovered={row.key === hoveredRowKey}
                onDamageClick={onDamageClick}
                visibleCols={visibleCols}
                bossMaxHp={bossMaxHp}
                formatTime={formatTime}
                resourceGraphs={resourceGraphs}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Row component ───────────────────────────────────────────────────────────

function FlatRow({ row, opInfo, top, selectedFrames, hovered, onDamageClick, visibleCols, bossMaxHp, formatTime, resourceGraphs }: {
  row: DamageTableRow;
  opInfo?: OperatorInfo;
  top: number;
  selectedFrames?: SelectedFrame[];
  hovered: boolean;
  onDamageClick?: (row: DamageTableRow) => void;
  visibleCols: SheetColDef[];
  bossMaxHp: number | null;
  formatTime: (frame: number) => string;
  resourceGraphs?: Map<string, { points: ReadonlyArray<ResourcePoint>; min: number; max: number }>;
}) {
  const hasSelection = selectedFrames?.some(
    (sf) => sf.eventId === row.eventId && sf.segmentIndex === row.segmentIndex && sf.frameIndex === row.frameIndex,
  ) ?? false;

  const opColor = opInfo?.color ?? '#666';
  const cls = `dmg-row${hasSelection ? ' dmg-row--selected' : ''}${hovered && !hasSelection ? ' dmg-row--hovered' : ''}`;

  return (
    <div className={cls} style={{ top }}>
      {visibleCols.map((def) => (
        <SheetCell
          key={def.id}
          def={def}
          row={row}
          opInfo={opInfo}
          opColor={opColor}
          bossMaxHp={bossMaxHp}
          formatTime={formatTime}
          onDamageClick={onDamageClick}
          resourceGraphs={resourceGraphs}
        />
      ))}
    </div>
  );
}

// ── Cell renderer ───────────────────────────────────────────────────────────

/** Resource graph key constants matching useResourceGraphs conventions. */
const SP_GRAPH_KEY = 'common-skill-points';
const STAGGER_GRAPH_KEY = 'enemy-stagger';

function SheetCell({ def, row, opInfo, opColor, bossMaxHp, formatTime, onDamageClick, resourceGraphs }: {
  def: SheetColDef;
  row: DamageTableRow;
  opInfo?: OperatorInfo;
  opColor: string;
  bossMaxHp: number | null;
  formatTime: (frame: number) => string;
  onDamageClick?: (row: DamageTableRow) => void;
  resourceGraphs?: Map<string, { points: ReadonlyArray<ResourcePoint>; min: number; max: number }>;
}) {
  const style: React.CSSProperties = { flex: def.flex, textAlign: def.align };

  switch (def.id) {
    case SheetCol.TIME:
      return (
        <div className={`dmg-cell ${def.cellClass}`} style={style}>
          {formatTime(row.absoluteFrame)}
        </div>
      );
    case SheetCol.OPERATOR:
      return (
        <div className={`dmg-cell ${def.cellClass}`} style={{ ...style, '--op-color': opColor } as React.CSSProperties}>
          {opInfo?.icon && (
            <img className="dmg-flat-op-icon" src={opInfo.icon} alt={opInfo.name} />
          )}
        </div>
      );
    case SheetCol.TYPE:
      return (
        <div className={`dmg-cell ${def.cellClass}`} style={{ ...style, color: opColor }}>
          {getCategoryLabel(row.columnId)}
        </div>
      );
    case SheetCol.SOURCE:
      return (
        <div className={`dmg-cell ${def.cellClass}`} style={{ ...style, color: opColor }}>
          {getSkillDisplayName(row.skillName)}
        </div>
      );
    case SheetCol.DAMAGE: {
      let displayDamage = '';
      if (row.damage != null) {
        displayDamage = formatDamage(row.damage);
      } else if (row.multiplier != null) {
        displayDamage = `${(row.multiplier * 100).toFixed(1)}%`;
      } else {
        displayDamage = '\u2014';
      }
      return (
        <div
          className={`dmg-cell ${def.cellClass}${row.params ? ' dmg-cell-clickable' : ''}`}
          style={{ ...style, color: opColor }}
          onClick={row.params ? () => onDamageClick?.(row) : undefined}
          title={row.damage != null ? `${row.label}\n${Math.round(row.damage).toLocaleString()} damage${row.multiplier != null ? ` (${(row.multiplier * 100).toFixed(1)}% ATK)` : ''}` : undefined}
        >
          {displayDamage}
        </div>
      );
    }
    case SheetCol.BOSS_HP:
      return (
        <div
          className={`dmg-cell ${def.cellClass}${row.hpRemaining != null && row.hpRemaining <= 0 ? ' dmg-cell-hp--dead' : ''}`}
          style={style}
          title={row.hpRemaining != null && bossMaxHp != null ? `${Math.round(row.hpRemaining).toLocaleString()} / ${Math.round(bossMaxHp).toLocaleString()} HP` : undefined}
        >
          {row.hpRemaining != null ? Math.round(row.hpRemaining).toLocaleString() : '\u2014'}
        </div>
      );
    case SheetCol.BOSS_STAGGER: {
      const staggerGraph = resourceGraphs?.get(STAGGER_GRAPH_KEY);
      const staggerVal = staggerGraph ? getResourceValueAfter(staggerGraph.points, row.absoluteFrame) : null;
      return (
        <div className={`dmg-cell ${def.cellClass}`} style={style}
          title={staggerVal != null && staggerGraph ? `${Math.round(staggerVal)} / ${staggerGraph.max}` : undefined}
        >
          {staggerVal != null ? Math.round(staggerVal).toLocaleString() : '\u2014'}
        </div>
      );
    }
    case SheetCol.ULT_CHARGE: {
      const ultGraph = resourceGraphs?.get(`${row.ownerId}-ultimate`);
      const ultVal = ultGraph ? getResourceValueAfter(ultGraph.points, row.absoluteFrame) : null;
      return (
        <div className={`dmg-cell ${def.cellClass}`} style={style}
          title={ultVal != null && ultGraph ? `${Math.round(ultVal)} / ${ultGraph.max}` : undefined}
        >
          {ultVal != null ? Math.round(ultVal).toLocaleString() : '\u2014'}
        </div>
      );
    }
    case SheetCol.SKILL_POINTS: {
      const spGraph = resourceGraphs?.get(SP_GRAPH_KEY);
      const spVal = spGraph ? getResourceValueAfter(spGraph.points, row.absoluteFrame) : null;
      return (
        <div className={`dmg-cell ${def.cellClass}`} style={style}
          title={spVal != null && spGraph ? `${Math.round(spVal)} / ${spGraph.max}` : undefined}
        >
          {spVal != null ? Math.round(spVal).toLocaleString() : '\u2014'}
        </div>
      );
    }
    default:
      return null;
  }
}
