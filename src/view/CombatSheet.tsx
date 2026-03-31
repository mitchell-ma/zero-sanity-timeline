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
import { CritMode, CombatSkillType, FoldMode } from '../consts/enums';
import type { OverrideStore } from '../consts/overrideTypes';
import { LoadoutProperties } from './InformationPane';
import { OperatorLoadoutState } from './OperatorLoadoutHeader';
import { OPERATORS } from '../utils/loadoutRegistry';
import {
  getWeapon,
  getGearPiece,
  getConsumable,
  getTactical,
} from '../controller/gameDataStore';
import { SKILL_LABELS } from '../consts/enums';
import { getAllSkillLabels } from '../controller/gameDataStore';
import { SkillType } from '../consts/viewTypes';
import { t } from '../locales/locale';
import { ultimateGraphKey } from '../model/channels';

const ROW_HEIGHT = 28;
const MARQUEE_THRESHOLD = 4;

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
  { id: SheetCol.TIME,          label: t('sheet.col.time'),          flex: 2, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--time',   cellClass: 'dmg-cell-time',          defaultVisible: true },
  { id: SheetCol.OPERATOR,      label: t('sheet.col.operator'),      flex: 4, align: 'left',  headerClass: 'dmg-header-flat dmg-header-flat--op',     cellClass: 'dmg-cell-flat-op',       defaultVisible: true },
  { id: SheetCol.TYPE,          label: t('sheet.col.type'),          flex: 2, align: 'left',  headerClass: 'dmg-header-flat dmg-header-flat--type',   cellClass: 'dmg-cell-flat-type',     defaultVisible: true },
  { id: SheetCol.SOURCE,        label: t('sheet.col.source'),        flex: 3, align: 'left',  headerClass: 'dmg-header-flat dmg-header-flat--source', cellClass: 'dmg-cell-flat-source',   defaultVisible: true },
  { id: SheetCol.DAMAGE,        label: t('sheet.col.damage'),        flex: 3, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--dmg',    cellClass: 'dmg-cell-flat-dmg',      defaultVisible: true },
  { id: SheetCol.BOSS_HP,       label: t('sheet.col.bossHp'),       flex: 3, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--hp',     cellClass: 'dmg-cell-hp',            defaultVisible: true },
  { id: SheetCol.BOSS_STAGGER,  label: t('sheet.col.bossStagger'),  flex: 2, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--generic', cellClass: 'dmg-cell-flat-generic',  defaultVisible: false },
  { id: SheetCol.ULT_CHARGE,    label: t('sheet.col.ultCharge'),    flex: 2, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--generic', cellClass: 'dmg-cell-flat-generic',  defaultVisible: false },
  { id: SheetCol.SKILL_POINTS,  label: t('sheet.col.skillPoints'),  flex: 2, align: 'right', headerClass: 'dmg-header-flat dmg-header-flat--generic', cellClass: 'dmg-cell-flat-generic',  defaultVisible: false },
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

const FOLD_MODE_CYCLE: FoldMode[] = [FoldMode.FRAME, FoldMode.SEGMENT, FoldMode.EVENT];
const FOLD_MODE_LABELS: Record<FoldMode, string> = {
  [FoldMode.FRAME]: t('sheet.fold.frame'),
  [FoldMode.SEGMENT]: t('sheet.fold.segment'),
  [FoldMode.EVENT]: t('sheet.fold.event'),
};

function getSegmentStartFrame(ev: TimelineEvent, segmentIndex: number): number {
  let offset = 0;
  for (let i = 0; i < segmentIndex && i < ev.segments.length; i++) {
    const seg = ev.segments[i];
    if (seg.properties.offset != null) {
      offset = seg.properties.offset;
    }
    offset += seg.properties.duration;
  }
  const seg = ev.segments[segmentIndex];
  if (seg?.properties.offset != null) {
    offset = seg.properties.offset;
  }
  return ev.startFrame + offset;
}

function foldRows(rows: DamageTableRow[], mode: FoldMode, events: TimelineEvent[]): DamageTableRow[] {
  if (mode === FoldMode.FRAME) return rows;

  const eventMap = new Map<string, TimelineEvent>();
  for (const ev of events) eventMap.set(ev.uid, ev);

  const groups = new Map<string, DamageTableRow[]>();
  for (const row of rows) {
    const key = mode === FoldMode.EVENT
      ? `${row.eventUid}`
      : `${row.eventUid}-s${row.segmentIndex}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const folded: DamageTableRow[] = [];
  for (const group of Array.from(groups.values())) {
    const first = group[0];
    const lastRow = group[group.length - 1];
    let totalDamage: number | null = null;
    for (const r of group) {
      if (r.damage != null) {
        totalDamage = (totalDamage ?? 0) + r.damage;
      }
    }

    const ev = eventMap.get(first.eventUid);
    let startFrame = first.absoluteFrame;
    if (ev) {
      startFrame = mode === FoldMode.EVENT
        ? ev.startFrame
        : getSegmentStartFrame(ev, first.segmentIndex);
    }

    folded.push({
      ...first,
      key: mode === FoldMode.EVENT
        ? `${first.eventUid}-folded`
        : `${first.eventUid}-s${first.segmentIndex}-folded`,
      absoluteFrame: startFrame,
      damage: totalDamage,
      hpRemaining: lastRow.hpRemaining,
      params: first.params,
      foldedFrames: group.length > 1 ? group : undefined,
    });
  }
  return folded;
}

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
  return getAllSkillLabels()[skillName as CombatSkillType] ?? skillName;
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
  /** Ref-based hover frame — avoids re-renders on every mouse pixel move. */
  hoverFrameRef?: React.RefObject<number | null>;
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
  overrides?: OverrideStore;
  plannerHidden?: boolean;
  resourceGraphs?: Map<string, { points: ReadonlyArray<ResourcePoint>; min: number; max: number }>;
}

export default React.memo(function CombatSheet({
  slots, events, columns, enemy, loadoutProperties, loadouts, zoom, loadoutRowHeight, headerRowHeight,
  selectedFrames, hoverFrameRef, onScrollRef, onScroll: onScrollProp, onZoom,
  staggerBreaks, compact, showRealTime = true, contentFrames: contentFramesProp, onDamageClick, onDamageRows,
  critMode = CritMode.NEVER, onCritModeChange, overrides, plannerHidden, resourceGraphs,
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

  /** Read live header child rects and find which column index the cursor is over.
   *  Skips the dragged column to prevent oscillation — measures gaps between
   *  non-dragged columns, then maps back to the full index. */
  const getTargetIndex = useCallback((cursorX: number, dragCol?: SheetCol | null): number => {
    const header = headerRef.current;
    if (!header) return -1;
    const children = Array.from(header.children) as HTMLElement[];
    const vis = colOrderRef.current.filter((id) => colVisible[id]);

    if (!dragCol) {
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (cursorX < rect.left + rect.width / 2) return i;
      }
      return children.length - 1;
    }

    // Build list of non-dragged column indices and their rects
    const others: { visIdx: number; rect: DOMRect }[] = [];
    for (let i = 0; i < children.length; i++) {
      if (vis[i] === dragCol) continue;
      others.push({ visIdx: i, rect: children[i].getBoundingClientRect() });
    }

    // Find insertion point among non-dragged columns
    let insertBefore = others.length; // default: after all
    for (let i = 0; i < others.length; i++) {
      const r = others[i].rect;
      if (cursorX < r.left + r.width / 2) {
        insertBefore = i;
        break;
      }
    }

    // Map back to visible index: insert before the i-th non-dragged column
    if (insertBefore >= others.length) return children.length - 1;
    return others[insertBefore].visIdx > vis.indexOf(dragCol)
      ? others[insertBefore].visIdx - 1
      : others[insertBefore].visIdx;
  }, [colVisible]);

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
        const targetIdx = getTargetIndex(me.clientX, col);
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

  const { rows: rawRows } = useMemo(
    () => runCalculation(events, columns, slots, enemy, loadoutProperties, loadouts, staggerBreaks, critMode, overrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, columns, slots, enemy, loadoutProperties, loadouts, staggerBreaks, critMode, overrides],
  );
  const bossMaxHp = useMemo(() => {
    const model = getModelEnemy(enemy.id);
    return model ? model.getHp() : null;
  }, [enemy.id]);

  // Fold mode
  const [foldMode, setFoldMode] = useState(FoldMode.FRAME);
  const rows = useMemo(() => foldRows(rawRows, foldMode, events), [rawRows, foldMode, events]);

  // DPS range filter
  const [dpsRangeStart, setDpsRangeStart] = useState('');
  const [dpsRangeEnd, setDpsRangeEnd] = useState('');
  const rangeStartFrame = dpsRangeStart ? secondsToFrames(dpsRangeStart) : undefined;
  const rangeEndFrame = dpsRangeEnd ? secondsToFrames(dpsRangeEnd) : undefined;

  const statistics = useMemo(
    () => computeDamageStatistics(rawRows, tableColumns, bossMaxHp, rangeStartFrame, rangeEndFrame),
    [rawRows, tableColumns, bossMaxHp, rangeStartFrame, rangeEndFrame],
  );

  // Lift damage rows to parent
  useEffect(() => { onDamageRows?.(rawRows); }, [rawRows, onDamageRows]);

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

  // Find nearest row for hover highlighting — imperative DOM updates via rAF
  // to avoid React re-renders on every mouse pixel move.
  const prevHoveredRowRef = useRef<HTMLElement | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!hoverFrameRef) return;
    let lastFrame: number | null | undefined = undefined;
    const tick = () => {
      const hf = hoverFrameRef.current;
      if (hf !== lastFrame) {
        lastFrame = hf;
        // Remove previous highlight
        if (prevHoveredRowRef.current) {
          prevHoveredRowRef.current.classList.remove('dmg-row--hovered');
          prevHoveredRowRef.current = null;
        }
        // Find nearest row
        if (hf != null && rows.length > 0) {
          const toleranceFrames = Math.ceil(8 / pxPerFrame(zoom));
          let best: DamageTableRow | null = null;
          let bestDist = Infinity;
          for (const row of rows) {
            const dist = Math.abs(row.absoluteFrame - hf);
            if (dist < bestDist && dist <= toleranceFrames) {
              bestDist = dist;
              best = row;
            }
          }
          if (best) {
            const el = scrollRef.current?.querySelector(`[data-row-key="${best.key}"]`) as HTMLElement | null;
            if (el) {
              el.classList.add('dmg-row--hovered');
              prevHoveredRowRef.current = el;
            }
          }
        }
      }
      hoverRafRef.current = requestAnimationFrame(tick);
    };
    hoverRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current);
      if (prevHoveredRowRef.current) {
        prevHoveredRowRef.current.classList.remove('dmg-row--hovered');
        prevHoveredRowRef.current = null;
      }
    };
  }, [hoverFrameRef, rows, zoom]);

  // ── Marquee selection ────────────────────────────────────────────────────
  const [marqueeSelectedKeys, setMarqueeSelectedKeys] = useState<Set<string>>(new Set());
  const marqueeRef = useRef<{
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const rowLayoutRef = useRef<{ row: DamageTableRow; top: number }[]>([]);

  const getRowsInRect = useCallback((scrollEl: HTMLDivElement, y1: number, y2: number) => {
    const bodyRect = scrollEl.getBoundingClientRect();
    const scrollTop = scrollEl.scrollTop;
    // Convert viewport Y coords to body-relative positions
    const topRel = Math.min(y1, y2) - bodyRect.top + scrollTop;
    const bottomRel = Math.max(y1, y2) - bodyRect.top + scrollTop;
    const keys = new Set<string>();
    for (const { row, top } of rowLayoutRef.current) {
      if (top + ROW_HEIGHT >= topRel && top <= bottomRel) {
        keys.add(row.key);
      }
    }
    return keys;
  }, []);

  const handleBodyMouseDown = useCallback((e: React.MouseEvent) => {
    // Only left click, not on clickable cells
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.dmg-cell-clickable')) return;

    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const ctrlKey = e.ctrlKey || e.metaKey;
    marqueeRef.current = { startX: e.clientX, startY: e.clientY, active: false };

    const onMouseMove = (me: MouseEvent) => {
      const m = marqueeRef.current;
      if (!m) return;

      if (!m.active && (Math.abs(me.clientX - m.startX) > MARQUEE_THRESHOLD || Math.abs(me.clientY - m.startY) > MARQUEE_THRESHOLD)) {
        m.active = true;
      }

      if (!m.active) return;

      const bodyRect = scrollEl.getBoundingClientRect();
      const scrollTop = scrollEl.scrollTop;
      const x1 = Math.max(Math.min(m.startX, me.clientX), bodyRect.left) - bodyRect.left;
      const x2 = Math.min(Math.max(m.startX, me.clientX), bodyRect.right) - bodyRect.left;
      const y1 = Math.max(Math.min(m.startY, me.clientY), bodyRect.top) - bodyRect.top + scrollTop;
      const y2 = Math.min(Math.max(m.startY, me.clientY), bodyRect.bottom) - bodyRect.top + scrollTop;
      setMarqueeRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });

      const keys = getRowsInRect(scrollEl, Math.min(m.startY, me.clientY), Math.max(m.startY, me.clientY));
      setMarqueeSelectedKeys(keys);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const didDrag = marqueeRef.current?.active ?? false;
      setMarqueeRect(null);
      marqueeRef.current = null;

      // Plain click (no drag, no ctrl) → clear selection
      if (!didDrag && !ctrlKey) {
        setMarqueeSelectedKeys(new Set());
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [getRowsInRect]);

  const handleRowClick = useCallback((key: string, e: React.MouseEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.stopPropagation();
    setMarqueeSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Compute selected damage sum
  const marqueeSelectionStats = useMemo(() => {
    if (marqueeSelectedKeys.size === 0) return null;
    let totalDamage = 0;
    let count = 0;
    for (const row of rows) {
      if (marqueeSelectedKeys.has(row.key) && row.damage != null) {
        totalDamage += row.damage;
        count++;
      }
    }
    if (count === 0) return null;
    return { totalDamage, count };
  }, [marqueeSelectedKeys, rows]);

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
    rowLayoutRef.current = layout;
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
              className={`dmg-fold-toggle dmg-fold-toggle--${foldMode.toLowerCase()}`}
              onClick={() => {
                const idx = FOLD_MODE_CYCLE.indexOf(foldMode);
                const next = FOLD_MODE_CYCLE[(idx + 1) % FOLD_MODE_CYCLE.length];
                setFoldMode(next);
              }}
              title={`Fold mode: ${FOLD_MODE_LABELS[foldMode]}. Click to cycle.`}
            >
              {FOLD_MODE_LABELS[foldMode]}
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
              const weaponEntry = loadout?.weaponId ? getWeapon(loadout.weaponId) : null;
              const armorEntry = loadout?.armorId ? getGearPiece(loadout.armorId) : null;
              const glovesEntry = loadout?.glovesId ? getGearPiece(loadout.glovesId) : null;
              const kit1Entry = loadout?.kit1Id ? getGearPiece(loadout.kit1Id) : null;
              const kit2Entry = loadout?.kit2Id ? getGearPiece(loadout.kit2Id) : null;
              const consumableEntry = loadout?.consumableId ? getConsumable(loadout.consumableId) : null;
              const tacticalEntry = loadout?.tacticalId ? getTactical(loadout.tacticalId) : null;
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
            style={{ flex: def.flex, textAlign: 'center' }}
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

      <div
        ref={scrollRef}
        className={`dmg-table-scroll${marqueeRect ? ' dmg-table-scroll--selecting' : ''}`}
        onScroll={handleScroll}
        onMouseDown={handleBodyMouseDown}
      >
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
                hovered={false}
                marqueeSelected={marqueeSelectedKeys.has(row.key)}
                onDamageClick={onDamageClick}
                onRowClick={handleRowClick}
                visibleCols={visibleCols}
                bossMaxHp={bossMaxHp}
                formatTime={formatTime}
                resourceGraphs={resourceGraphs}
              />
            ))
          )}
          {marqueeRect && (
            <div
              className="selection-marquee"
              style={{
                position: 'absolute',
                left: marqueeRect.x,
                top: marqueeRect.y,
                width: marqueeRect.w,
                height: marqueeRect.h,
              }}
            />
          )}
        </div>
        {marqueeSelectionStats && (
          <div className="dmg-marquee-summary">
            <span className="dmg-marquee-summary-label">{marqueeSelectionStats.count} rows</span>
            <span className="dmg-marquee-summary-value">{formatDamage(marqueeSelectionStats.totalDamage)}</span>
          </div>
        )}
      </div>
    </div>
  );
});

// ── Row component ───────────────────────────────────────────────────────────

const FlatRow = React.memo(function FlatRow({ row, opInfo, top, selectedFrames, hovered, marqueeSelected, onDamageClick, onRowClick, visibleCols, bossMaxHp, formatTime, resourceGraphs }: {
  row: DamageTableRow;
  opInfo?: OperatorInfo;
  top: number;
  selectedFrames?: SelectedFrame[];
  hovered: boolean;
  marqueeSelected?: boolean;
  onDamageClick?: (row: DamageTableRow) => void;
  onRowClick?: (key: string, e: React.MouseEvent) => void;
  visibleCols: SheetColDef[];
  bossMaxHp: number | null;
  formatTime: (frame: number) => string;
  resourceGraphs?: Map<string, { points: ReadonlyArray<ResourcePoint>; min: number; max: number }>;
}) {
  const hasSelection = selectedFrames?.some(
    (sf) => sf.eventUid === row.eventUid && sf.segmentIndex === row.segmentIndex && sf.frameIndex === row.frameIndex,
  ) ?? false;
  const selected = hasSelection || marqueeSelected;

  const opColor = opInfo?.color ?? '#666';
  const cls = `dmg-row${selected ? ' dmg-row--selected' : ''}${hovered && !selected ? ' dmg-row--hovered' : ''}`;

  return (
    <div className={cls} data-row-key={row.key} style={{ top }} onClick={(e) => onRowClick?.(row.key, e)}>
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
});

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
      const ultGraph = resourceGraphs?.get(ultimateGraphKey(row.ownerId));
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
