/**
 * Statistics storage layer.
 *
 * Parallel to `loadoutStorage` but for comparison sheets. Each statistics sheet
 * is a `StatisticsData` blob stored under `zst-statistics-{id}`. The tree
 * (folder/statistics hierarchy + ordering) lives in `zst-statistics-tree`.
 * The active statistics sheet ID lives in `zst-active-statistics`.
 *
 * Sources reference loadouts by `LoadoutNode.uuid` (cross-peer stable identity)
 * rather than `id` (localStorage-scoped), so statistics survive loadout-tree
 * rebuilds and collaboration sync.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  StatisticsNodeType,
  StatisticsMetricType,
  StatisticsLayoutType,
  StatisticsColumnType,
  StatType,
  CritMode,
  ComparisonModeType,
} from '../consts/enums';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StatisticsNode {
  id: string;
  uuid: string;
  type: StatisticsNodeType;
  name: string;
  parentId: string | null;
  order: number;
  collapsed?: boolean;
}

export interface StatisticsTree {
  nodes: StatisticsNode[];
}

/**
 * Reference to a loadout or loadout-view that contributes to a statistics sheet.
 * `loadoutUuid` points at a `LoadoutNode.uuid`; resolution happens at render
 * time so stale references surface as placeholders instead of silent drops.
 */
export interface StatisticsSource {
  /** UUID of the referenced LoadoutNode (LOADOUT or LOADOUT_VIEW). */
  loadoutUuid: string;
  /** Optional display label override. */
  alias?: string;
  /** Display color for charts/bars. */
  color?: string;
}

/**
 * Metric-specific config. Only the fields relevant to the chosen metric are
 * consulted; unused fields are ignored.
 */
export interface StatisticsMetricConfig {
  /** For OPERATOR_DAMAGE: which operator (by entity id). */
  operatorEntityId?: string;
  /** For COLUMN_DAMAGE: which column (by column id). */
  columnId?: string;
  /** For AGGREGATED_STAT: which stat to compare. */
  statType?: StatType;
}

export interface StatisticsData {
  version: number;
  sources: StatisticsSource[];
  metrics: StatisticsMetricType[];
  layout: StatisticsLayoutType;
  config?: StatisticsMetricConfig;
  /** Columns hidden in the per-source stats table. Absent = all visible. */
  hiddenColumns?: StatisticsColumnType[];
  /** Operator slot ids whose stats rows are hidden. Absent = all rows visible. */
  hiddenOperators?: string[];
  /** Crit mode applied when simulating sources. Absent = EXPECTED. */
  critMode?: CritMode;
  /** Comparison mode for numeric cells. Absent = RAW. */
  comparisonMode?: ComparisonModeType;
}

export const STATISTICS_DATA_VERSION = 1;

export function createEmptyStatisticsData(): StatisticsData {
  return {
    version: STATISTICS_DATA_VERSION,
    sources: [],
    metrics: [
      StatisticsMetricType.TEAM_TOTAL_DAMAGE,
      StatisticsMetricType.TEAM_DPS,
      StatisticsMetricType.TIME_TO_KILL,
      StatisticsMetricType.HIGHEST_BURST,
    ],
    layout: StatisticsLayoutType.TABLE,
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TREE_KEY = 'zst-statistics-tree';
const ACTIVE_KEY = 'zst-active-statistics';
const DATA_PREFIX = 'zst-statistics-';

const MAX_FOLDER_DEPTH = 4;

// ─── ID generation ───────────────────────────────────────────────────────────

let counter = 0;
export function generateId(): string {
  return `${Date.now().toString(36)}-${(counter++).toString(36)}-s`;
}

// ─── Tree persistence ────────────────────────────────────────────────────────

export function loadStatisticsTree(): StatisticsTree {
  try {
    const raw = localStorage.getItem(TREE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.nodes && Array.isArray(parsed.nodes)) {
        const tree = parsed as StatisticsTree;
        let migrated = false;
        for (const node of tree.nodes) {
          if (!node.uuid) {
            node.uuid = uuidv4();
            migrated = true;
          }
        }
        if (migrated) saveStatisticsTree(tree);
        return tree;
      }
    }
  } catch { /* ignore */ }
  return { nodes: [] };
}

export function saveStatisticsTree(tree: StatisticsTree): void {
  try {
    localStorage.setItem(TREE_KEY, JSON.stringify(tree));
  } catch { /* ignore */ }
}

// ─── Active id ───────────────────────────────────────────────────────────────

export function loadActiveStatisticsId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveStatisticsId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch { /* ignore */ }
}

// ─── Data persistence ────────────────────────────────────────────────────────

export function loadStatisticsData(id: string): StatisticsData | null {
  try {
    const raw = localStorage.getItem(DATA_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StatisticsData;
    return migrateStatisticsData(parsed);
  } catch {
    return null;
  }
}

export function saveStatisticsData(id: string, data: StatisticsData): void {
  try {
    localStorage.setItem(DATA_PREFIX + id, JSON.stringify({ ...data, version: STATISTICS_DATA_VERSION }));
  } catch { /* ignore */ }
}

export function deleteStatisticsData(id: string): void {
  try {
    localStorage.removeItem(DATA_PREFIX + id);
  } catch { /* ignore */ }
}

function migrateStatisticsData(data: StatisticsData): StatisticsData {
  return { ...data, version: STATISTICS_DATA_VERSION };
}

// ─── Tree operations ─────────────────────────────────────────────────────────

export function getChildrenOf(tree: StatisticsTree, parentId: string | null): StatisticsNode[] {
  return tree.nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

export function uniqueName(tree: StatisticsTree, baseName: string, _parentId: string | null, excludeId?: string): string {
  const names = new Set(tree.nodes.filter((n) => n.id !== excludeId).map((n) => n.name));
  if (!names.has(baseName)) return baseName;
  let i = 2;
  while (names.has(`${baseName} ${i}`)) i++;
  return `${baseName} ${i}`;
}

export function addStatistics(tree: StatisticsTree, name: string, parentId: string | null): { tree: StatisticsTree; node: StatisticsNode } {
  const siblings = getChildrenOf(tree, parentId);
  const order = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
  const uniqueN = uniqueName(tree, name, parentId);
  const node: StatisticsNode = { id: generateId(), uuid: uuidv4(), type: StatisticsNodeType.STATISTICS, name: uniqueN, parentId, order };
  return { tree: { nodes: [...tree.nodes, node] }, node };
}

export function addStatisticsAfter(tree: StatisticsTree, name: string, afterNodeId: string): { tree: StatisticsTree; node: StatisticsNode } {
  const afterNode = tree.nodes.find((n) => n.id === afterNodeId);
  const parentId = afterNode?.parentId ?? null;
  const afterOrder = afterNode?.order ?? 0;
  const shifted = tree.nodes.map((n) =>
    n.parentId === parentId && n.order > afterOrder ? { ...n, order: n.order + 1 } : n,
  );
  const uniqueN = uniqueName({ nodes: shifted }, name, parentId);
  const node: StatisticsNode = { id: generateId(), uuid: uuidv4(), type: StatisticsNodeType.STATISTICS, name: uniqueN, parentId, order: afterOrder + 1 };
  return { tree: { nodes: [...shifted, node] }, node };
}

export function addFolder(tree: StatisticsTree, name: string, parentId: string | null): { tree: StatisticsTree; node: StatisticsNode } | { error: string } {
  const depth = getNodeDepth(tree, parentId);
  if (depth >= MAX_FOLDER_DEPTH) {
    return { error: `Maximum folder depth of ${MAX_FOLDER_DEPTH} reached.` };
  }
  const siblings = getChildrenOf(tree, parentId);
  const order = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
  const uniqueN = uniqueName(tree, name, parentId);
  const node: StatisticsNode = { id: generateId(), uuid: uuidv4(), type: StatisticsNodeType.FOLDER, name: uniqueN, parentId, order };
  return { tree: { nodes: [...tree.nodes, node] }, node };
}

export function getNodeDepth(tree: StatisticsTree, parentId: string | null): number {
  let depth = 0;
  let current = parentId;
  while (current !== null) {
    depth++;
    const currentId = current;
    const node = tree.nodes.find((n) => n.id === currentId);
    current = node?.parentId ?? null;
  }
  return depth;
}

function getSubtreeDepth(tree: StatisticsTree, nodeId: string): number {
  const children = tree.nodes.filter((n) => n.parentId === nodeId && n.type === StatisticsNodeType.FOLDER);
  if (children.length === 0) return 0;
  return 1 + Math.max(...children.map((c) => getSubtreeDepth(tree, c.id)));
}

function getDescendantIds(tree: StatisticsTree, nodeId: string): string[] {
  const children = tree.nodes.filter((n) => n.parentId === nodeId);
  const ids: string[] = [];
  for (const child of children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(tree, child.id));
  }
  return ids;
}

export function removeNode(tree: StatisticsTree, nodeId: string): { tree: StatisticsTree; removedStatisticsIds: string[] } {
  const toRemove = new Set([nodeId, ...getDescendantIds(tree, nodeId)]);
  const removedStatisticsIds = tree.nodes
    .filter((n) => toRemove.has(n.id) && n.type === StatisticsNodeType.STATISTICS)
    .map((n) => n.id);
  return {
    tree: { nodes: tree.nodes.filter((n) => !toRemove.has(n.id)) },
    removedStatisticsIds,
  };
}

export function renameNode(tree: StatisticsTree, nodeId: string, name: string): StatisticsTree {
  return { nodes: tree.nodes.map((n) => (n.id === nodeId ? { ...n, name } : n)) };
}

export function toggleFolder(tree: StatisticsTree, folderId: string): StatisticsTree {
  return {
    nodes: tree.nodes.map((n) =>
      n.id === folderId && n.type === StatisticsNodeType.FOLDER
        ? { ...n, collapsed: !n.collapsed }
        : n,
    ),
  };
}

export function moveNode(tree: StatisticsTree, nodeId: string, newParentId: string | null, newOrder: number): StatisticsTree | { error: string } {
  if (newParentId !== null) {
    const descendants = getDescendantIds(tree, nodeId);
    if (nodeId === newParentId || descendants.includes(newParentId)) {
      return tree;
    }
  }
  const node = tree.nodes.find((n) => n.id === nodeId);
  if (node?.type === StatisticsNodeType.FOLDER) {
    const targetDepth = getNodeDepth(tree, newParentId) + 1;
    const subtreeBelow = getSubtreeDepth(tree, nodeId);
    if (targetDepth + subtreeBelow > MAX_FOLDER_DEPTH) {
      return { error: `Maximum folder depth of ${MAX_FOLDER_DEPTH} reached.` };
    }
  }
  const siblings = tree.nodes
    .filter((n) => n.parentId === newParentId && n.id !== nodeId)
    .sort((a, b) => a.order - b.order);
  const reindexed: StatisticsNode[] = [];
  let idx = 0;
  for (const s of siblings) {
    if (idx === newOrder) idx++;
    reindexed.push({ ...s, order: idx });
    idx++;
  }
  return {
    nodes: tree.nodes.map((n) => {
      if (n.id === nodeId) return { ...n, parentId: newParentId, order: newOrder };
      const ri = reindexed.find((r) => r.id === n.id);
      return ri ?? n;
    }),
  };
}

// ─── Tree traversal ─────────────────────────────────────────────────────────

export function flattenTreeNodes(tree: StatisticsTree, parentId: string | null = null, depth: number = 0): { node: StatisticsNode; depth: number }[] {
  const result: { node: StatisticsNode; depth: number }[] = [];
  const children = getChildrenOf(tree, parentId);
  for (const node of children) {
    result.push({ node, depth });
    if (node.type === StatisticsNodeType.FOLDER) {
      result.push(...flattenTreeNodes(tree, node.id, depth + 1));
    }
  }
  return result;
}

// ─── Source helpers ──────────────────────────────────────────────────────────

export function addSource(data: StatisticsData, source: StatisticsSource): StatisticsData {
  if (data.sources.some((s) => s.loadoutUuid === source.loadoutUuid)) return data;
  return { ...data, sources: [...data.sources, source] };
}

export function removeSource(data: StatisticsData, loadoutUuid: string): StatisticsData {
  return { ...data, sources: data.sources.filter((s) => s.loadoutUuid !== loadoutUuid) };
}

export function updateSource(data: StatisticsData, loadoutUuid: string, patch: Partial<StatisticsSource>): StatisticsData {
  return {
    ...data,
    sources: data.sources.map((s) => (s.loadoutUuid === loadoutUuid ? { ...s, ...patch } : s)),
  };
}

export function reorderSources(data: StatisticsData, fromIndex: number, toIndex: number): StatisticsData {
  if (fromIndex === toIndex) return data;
  const next = [...data.sources];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return { ...data, sources: next };
}

export function toggleMetric(data: StatisticsData, metric: StatisticsMetricType): StatisticsData {
  const has = data.metrics.includes(metric);
  return {
    ...data,
    metrics: has ? data.metrics.filter((m) => m !== metric) : [...data.metrics, metric],
  };
}

export function toggleColumn(data: StatisticsData, column: StatisticsColumnType): StatisticsData {
  const current = data.hiddenColumns ?? [];
  const has = current.includes(column);
  return {
    ...data,
    hiddenColumns: has ? current.filter((c) => c !== column) : [...current, column],
  };
}

export function toggleOperator(data: StatisticsData, slotId: string): StatisticsData {
  const current = data.hiddenOperators ?? [];
  const has = current.includes(slotId);
  return {
    ...data,
    hiddenOperators: has ? current.filter((s) => s !== slotId) : [...current, slotId],
  };
}

export function setCritMode(data: StatisticsData, critMode: CritMode): StatisticsData {
  return { ...data, critMode };
}

export function setComparisonMode(data: StatisticsData, comparisonMode: ComparisonModeType): StatisticsData {
  return { ...data, comparisonMode };
}
