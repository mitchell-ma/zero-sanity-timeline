/**
 * Multi-loadout storage layer.
 *
 * Each loadout is a named SheetData blob stored under `zst-session-{id}`.
 * The loadout tree (folder/loadout hierarchy + ordering) lives in `zst-session-tree`.
 * The active loadout ID lives in `zst-active-session`.
 */

import { SheetData, MultiLoadoutBundle, cleanSheetData } from './sheetStorage';
import { LoadoutNodeType, ViewVariableType } from '../consts/enums';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Per-slot multi-selection of view variables, stored on a parent LOADOUT
 * to remember the configuration that generated its child views.
 *
 * Shape: `{ [slotId]: { [ViewVariableType]: number[] } }` where the array
 * is the user-selected set of values for that variable on that slot.
 */
export type ViewSelections = Record<string, Partial<Record<ViewVariableType, number[]>>>;

/**
 * Per-slot resolved override values for a single permutation, stored on a
 * LOADOUT_VIEW child. Each entry pins one variable to one concrete value.
 */
export type ViewOverride = Record<string, Partial<Record<ViewVariableType, number>>>;

export interface LoadoutNode {
  id: string;
  type: LoadoutNodeType;
  name: string;
  parentId: string | null; // null = root level
  order: number;           // sort order within parent
  collapsed?: boolean;     // folders only
  /** LOADOUT only: permutation configuration that generated child views. */
  viewSelections?: ViewSelections;
  /** LOADOUT_VIEW only: id of the parent LOADOUT this view derives from. */
  viewParentId?: string;
  /** LOADOUT_VIEW only: per-slot variable overrides applied on top of parent's sheet. */
  viewOverride?: ViewOverride;
}

export interface LoadoutTree {
  nodes: LoadoutNode[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TREE_KEY = 'zst-session-tree';
const ACTIVE_KEY = 'zst-active-session';
const SESSION_PREFIX = 'zst-session-';
// ─── ID generation ───────────────────────────────────────────────────────────

let counter = 0;
export function generateId(): string {
  return `${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

// ─── Tree persistence ────────────────────────────────────────────────────────

export function loadLoadoutTree(): LoadoutTree {
  try {
    const raw = localStorage.getItem(TREE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.nodes && Array.isArray(parsed.nodes)) {
        return parsed as LoadoutTree;
      }
    }
  } catch { /* ignore */ }
  return { nodes: [] };
}

export function saveLoadoutTree(tree: LoadoutTree): void {
  try {
    localStorage.setItem(TREE_KEY, JSON.stringify(tree));
  } catch { /* ignore */ }
}

// ─── Active loadout ──────────────────────────────────────────────────────────

export function loadActiveLoadoutId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveLoadoutId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch { /* ignore */ }
}

// ─── Loadout data ────────────────────────────────────────────────────────────

export function loadLoadoutData(id: string): SheetData | null {
  try {
    const raw = localStorage.getItem(SESSION_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as SheetData;
  } catch {
    return null;
  }
}

export function saveLoadoutData(id: string, data: SheetData): void {
  try {
    localStorage.setItem(SESSION_PREFIX + id, JSON.stringify(cleanSheetData(data)));
  } catch { /* ignore */ }
}

export function deleteLoadoutData(id: string): void {
  try {
    localStorage.removeItem(SESSION_PREFIX + id);
  } catch { /* ignore */ }
}

// ─── Tree operations ─────────────────────────────────────────────────────────

export function getChildrenOf(tree: LoadoutTree, parentId: string | null): LoadoutNode[] {
  return tree.nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

/** Generate a globally unique name by appending a number if needed. */
export function uniqueName(tree: LoadoutTree, baseName: string, _parentId: string | null, excludeId?: string): string {
  const names = new Set(tree.nodes.filter((n) => n.id !== excludeId).map((n) => n.name));
  if (!names.has(baseName)) return baseName;
  let i = 2;
  while (names.has(`${baseName} ${i}`)) i++;
  return `${baseName} ${i}`;
}

export function addLoadout(tree: LoadoutTree, name: string, parentId: string | null): { tree: LoadoutTree; node: LoadoutNode } {
  const siblings = getChildrenOf(tree, parentId);
  const order = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
  const uniqueN = uniqueName(tree, name, parentId);
  const node: LoadoutNode = { id: generateId(), type: LoadoutNodeType.LOADOUT, name: uniqueN, parentId, order };
  return { tree: { nodes: [...tree.nodes, node] }, node };
}

/** Insert a new loadout right after an existing node (same parent). */
export function addLoadoutAfter(tree: LoadoutTree, name: string, afterNodeId: string): { tree: LoadoutTree; node: LoadoutNode } {
  const afterNode = tree.nodes.find((n) => n.id === afterNodeId);
  const parentId = afterNode?.parentId ?? null;
  const afterOrder = afterNode?.order ?? 0;
  // Shift siblings that come after the target node
  const shifted = tree.nodes.map((n) =>
    n.parentId === parentId && n.order > afterOrder ? { ...n, order: n.order + 1 } : n,
  );
  const uniqueN = uniqueName({ nodes: shifted }, name, parentId);
  const node: LoadoutNode = { id: generateId(), type: LoadoutNodeType.LOADOUT, name: uniqueN, parentId, order: afterOrder + 1 };
  return { tree: { nodes: [...shifted, node] }, node };
}

export function addFolder(tree: LoadoutTree, name: string, parentId: string | null): { tree: LoadoutTree; node: LoadoutNode } | { error: string } {
  const depth = getNodeDepth(tree, parentId);
  if (depth >= MAX_FOLDER_DEPTH) {
    return { error: `Maximum folder depth of ${MAX_FOLDER_DEPTH} reached.` };
  }
  const siblings = getChildrenOf(tree, parentId);
  const order = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
  const uniqueN = uniqueName(tree, name, parentId);
  const node: LoadoutNode = { id: generateId(), type: LoadoutNodeType.FOLDER, name: uniqueN, parentId, order };
  return { tree: { nodes: [...tree.nodes, node] }, node };
}

const MAX_FOLDER_DEPTH = 4;

/** Get the depth of a node (0 = root level). */
export function getNodeDepth(tree: LoadoutTree, parentId: string | null): number {
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

/** Get the max depth of descendants below a node (0 if no children). */
function getSubtreeDepth(tree: LoadoutTree, nodeId: string): number {
  const children = tree.nodes.filter((n) => n.parentId === nodeId && n.type === LoadoutNodeType.FOLDER);
  if (children.length === 0) return 0;
  return 1 + Math.max(...children.map((c) => getSubtreeDepth(tree, c.id)));
}

/** Get all descendant IDs of a node (recursive). */
function getDescendantIds(tree: LoadoutTree, nodeId: string): string[] {
  const children = tree.nodes.filter((n) => n.parentId === nodeId);
  const ids: string[] = [];
  for (const child of children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(tree, child.id));
  }
  return ids;
}

export function removeNode(tree: LoadoutTree, nodeId: string): { tree: LoadoutTree; removedLoadoutIds: string[] } {
  const toRemove = new Set([nodeId, ...getDescendantIds(tree, nodeId)]);
  const removedLoadoutIds = tree.nodes
    .filter((n) => toRemove.has(n.id) && n.type === LoadoutNodeType.LOADOUT)
    .map((n) => n.id);
  return {
    tree: { nodes: tree.nodes.filter((n) => !toRemove.has(n.id)) },
    removedLoadoutIds,
  };
}

export function renameNode(tree: LoadoutTree, nodeId: string, name: string): LoadoutTree {
  return { nodes: tree.nodes.map((n) => (n.id === nodeId ? { ...n, name } : n)) };
}

export function toggleFolder(tree: LoadoutTree, folderId: string): LoadoutTree {
  return {
    nodes: tree.nodes.map((n) =>
      n.id === folderId && n.type === LoadoutNodeType.FOLDER
        ? { ...n, collapsed: !n.collapsed }
        : n,
    ),
  };
}

export function moveNode(tree: LoadoutTree, nodeId: string, newParentId: string | null, newOrder: number): LoadoutTree | { error: string } {
  // Prevent moving a folder into itself or its descendants
  if (newParentId !== null) {
    const descendants = getDescendantIds(tree, nodeId);
    if (nodeId === newParentId || descendants.includes(newParentId)) {
      return tree;
    }
  }
  // Enforce max folder depth when moving a folder
  const node = tree.nodes.find((n) => n.id === nodeId);
  if (node?.type === LoadoutNodeType.FOLDER) {
    const targetDepth = getNodeDepth(tree, newParentId) + 1; // depth of the moved folder
    const subtreeBelow = getSubtreeDepth(tree, nodeId);      // nested folders below it
    if (targetDepth + subtreeBelow > MAX_FOLDER_DEPTH) {
      return { error: `Maximum folder depth of ${MAX_FOLDER_DEPTH} reached.` };
    }
  }
  const siblings = tree.nodes
    .filter((n) => n.parentId === newParentId && n.id !== nodeId)
    .sort((a, b) => a.order - b.order);
  // Insert at newOrder position, reindex siblings
  const reindexed: LoadoutNode[] = [];
  let idx = 0;
  for (const s of siblings) {
    if (idx === newOrder) idx++; // leave gap for inserted node
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

/** Depth-first traversal of the tree in render order, returning nodes with their depth. */
export function flattenTreeNodes(tree: LoadoutTree, parentId: string | null = null, depth: number = 0): { node: LoadoutNode; depth: number }[] {
  const result: { node: LoadoutNode; depth: number }[] = [];
  const children = getChildrenOf(tree, parentId);
  for (const node of children) {
    result.push({ node, depth });
    if (node.type === LoadoutNodeType.FOLDER) {
      result.push(...flattenTreeNodes(tree, node.id, depth + 1));
    } else if (node.type === LoadoutNodeType.LOADOUT) {
      // LOADOUT_VIEW children are nested under their parent LOADOUT.
      result.push(...flattenTreeNodes(tree, node.id, depth + 1));
    }
  }
  return result;
}

// ─── View helpers ───────────────────────────────────────────────────────────

export function isReadOnlyNode(node: LoadoutNode | null | undefined): boolean {
  return node?.type === LoadoutNodeType.LOADOUT_VIEW;
}

/**
 * Return the LOADOUT (non-view) ancestor for a given node id. For a
 * LOADOUT_VIEW this resolves to its parent loadout via `viewParentId`.
 * For a LOADOUT this returns the node itself. Returns null otherwise.
 */
export function resolveSourceLoadoutId(tree: LoadoutTree, nodeId: string | null): string | null {
  if (!nodeId) return null;
  const node = tree.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  if (node.type === LoadoutNodeType.LOADOUT) return node.id;
  if (node.type === LoadoutNodeType.LOADOUT_VIEW && node.viewParentId) return node.viewParentId;
  return null;
}

/**
 * Replace all LOADOUT_VIEW children under `parentId` with a fresh set of
 * children built from `views`. Keeps tree IDs stable across other nodes.
 *
 * Returns the new tree plus the list of newly created child nodes (for
 * persistence wiring) and the IDs of removed children (for cache cleanup).
 */
export function setLoadoutViews(
  tree: LoadoutTree,
  parentId: string,
  selections: ViewSelections,
  views: { name: string; override: ViewOverride }[],
): { tree: LoadoutTree; created: LoadoutNode[]; removedIds: string[] } {
  const removedIds = tree.nodes
    .filter((n) => n.parentId === parentId && n.type === LoadoutNodeType.LOADOUT_VIEW)
    .map((n) => n.id);
  const remaining = tree.nodes.filter((n) => !removedIds.includes(n.id));

  const created: LoadoutNode[] = views.map((v, i) => ({
    id: generateId(),
    type: LoadoutNodeType.LOADOUT_VIEW,
    name: v.name,
    parentId,
    order: i,
    viewParentId: parentId,
    viewOverride: v.override,
  }));

  const updatedParents = remaining.map((n) =>
    n.id === parentId
      ? { ...n, viewSelections: selections, ...(n.collapsed === undefined ? { collapsed: false } : {}) }
      : n,
  );

  return {
    tree: { nodes: [...updatedParents, ...created] },
    created,
    removedIds,
  };
}

/** Remove every LOADOUT_VIEW child of `parentId` and clear its `viewSelections`. */
export function clearLoadoutViews(tree: LoadoutTree, parentId: string): { tree: LoadoutTree; removedIds: string[] } {
  const removedIds = tree.nodes
    .filter((n) => n.parentId === parentId && n.type === LoadoutNodeType.LOADOUT_VIEW)
    .map((n) => n.id);
  const nextNodes = tree.nodes
    .filter((n) => !removedIds.includes(n.id))
    .map((n) => {
      if (n.id !== parentId) return n;
      const { viewSelections: _v, ...rest } = n;
      return rest;
    });
  return { tree: { nodes: nextNodes }, removedIds };
}

// ─── Bundle merge ───────────────────────────────────────────────────────────

/**
 * Merge an imported bundle into the existing tree.
 * All imported nodes get fresh IDs. Names are deduplicated globally.
 * Returns the merged tree and a map of newId → SheetData for persistence.
 */
export function mergeBundle(
  existingTree: LoadoutTree,
  bundle: MultiLoadoutBundle,
): { tree: LoadoutTree; loadoutData: Record<string, SheetData> } {
  const oldToNewId = new Map<string, string>();
  const newNodes: LoadoutNode[] = [];
  const loadoutData: Record<string, SheetData> = {};

  // Generate new IDs for all imported nodes
  for (const node of bundle.tree.nodes) {
    oldToNewId.set(node.id, generateId());
  }

  // Build a working tree for uniqueName checks (starts as existing tree, grows as we add)
  let workingTree: LoadoutTree = { nodes: [...existingTree.nodes] };

  // Process nodes in parent-first order so names are resolved correctly
  const ordered = flattenTreeNodes(bundle.tree);
  for (const { node } of ordered) {
    const newId = oldToNewId.get(node.id)!;
    // Remap parentId: if it was a root in the bundle, place at existing root.
    // If it had a parent in the bundle, use the remapped ID.
    const newParentId = node.parentId ? (oldToNewId.get(node.parentId) ?? null) : null;
    const dedupedName = uniqueName(workingTree, node.name, newParentId);

    // Compute order among new parent's children
    const siblings = getChildrenOf(workingTree, newParentId);
    const order = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;

    const newViewParentId = node.viewParentId ? oldToNewId.get(node.viewParentId) : undefined;
    const newNode: LoadoutNode = {
      id: newId,
      type: node.type,
      name: dedupedName,
      parentId: newParentId,
      order,
      ...(node.collapsed !== undefined ? { collapsed: node.collapsed } : {}),
      ...(node.viewSelections ? { viewSelections: node.viewSelections } : {}),
      ...(newViewParentId ? { viewParentId: newViewParentId } : {}),
      ...(node.viewOverride ? { viewOverride: node.viewOverride } : {}),
    };
    newNodes.push(newNode);
    workingTree = { nodes: [...workingTree.nodes, newNode] };

    // Map loadout data with new ID
    if (node.type === LoadoutNodeType.LOADOUT && bundle.loadouts[node.id]) {
      loadoutData[newId] = bundle.loadouts[node.id];
    }
  }

  return {
    tree: { nodes: [...existingTree.nodes, ...newNodes] },
    loadoutData,
  };
}

