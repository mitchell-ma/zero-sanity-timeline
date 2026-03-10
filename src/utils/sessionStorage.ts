/**
 * Multi-session storage layer.
 *
 * Each session is a named SheetData blob stored under `zst-session-{id}`.
 * The session tree (folder/session hierarchy + ordering) lives in `zst-session-tree`.
 * The active session ID lives in `zst-active-session`.
 */

import { SheetData } from './sheetStorage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionNode {
  id: string;
  type: 'session' | 'folder';
  name: string;
  parentId: string | null; // null = root level
  order: number;           // sort order within parent
  collapsed?: boolean;     // folders only
}

export interface SessionTree {
  nodes: SessionNode[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TREE_KEY = 'zst-session-tree';
const ACTIVE_KEY = 'zst-active-session';
const SESSION_PREFIX = 'zst-session-';
const LEGACY_SHEET_KEY = 'zst-sheet';

// ─── ID generation ───────────────────────────────────────────────────────────

let counter = 0;
export function generateId(): string {
  return `${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

// ─── Tree persistence ────────────────────────────────────────────────────────

export function loadSessionTree(): SessionTree {
  try {
    const raw = localStorage.getItem(TREE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.nodes && Array.isArray(parsed.nodes)) {
        return parsed as SessionTree;
      }
    }
  } catch { /* ignore */ }
  return { nodes: [] };
}

export function saveSessionTree(tree: SessionTree): void {
  try {
    localStorage.setItem(TREE_KEY, JSON.stringify(tree));
  } catch { /* ignore */ }
}

// ─── Active session ──────────────────────────────────────────────────────────

export function loadActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveSessionId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch { /* ignore */ }
}

// ─── Session data ────────────────────────────────────────────────────────────

export function loadSessionData(id: string): SheetData | null {
  try {
    const raw = localStorage.getItem(SESSION_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as SheetData;
  } catch {
    return null;
  }
}

export function saveSessionData(id: string, data: SheetData): void {
  try {
    localStorage.setItem(SESSION_PREFIX + id, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function deleteSessionData(id: string): void {
  try {
    localStorage.removeItem(SESSION_PREFIX + id);
  } catch { /* ignore */ }
}

// ─── Tree operations ─────────────────────────────────────────────────────────

export function getChildrenOf(tree: SessionTree, parentId: string | null): SessionNode[] {
  return tree.nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

/** Generate a globally unique name by appending a number if needed. */
export function uniqueName(tree: SessionTree, baseName: string, _parentId: string | null, excludeId?: string): string {
  const names = new Set(tree.nodes.filter((n) => n.id !== excludeId).map((n) => n.name));
  if (!names.has(baseName)) return baseName;
  let i = 2;
  while (names.has(`${baseName} ${i}`)) i++;
  return `${baseName} ${i}`;
}

export function addSession(tree: SessionTree, name: string, parentId: string | null): { tree: SessionTree; node: SessionNode } {
  const siblings = getChildrenOf(tree, parentId);
  const order = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
  const uniqueN = uniqueName(tree, name, parentId);
  const node: SessionNode = { id: generateId(), type: 'session', name: uniqueN, parentId, order };
  return { tree: { nodes: [...tree.nodes, node] }, node };
}

export function addFolder(tree: SessionTree, name: string, parentId: string | null): { tree: SessionTree; node: SessionNode } | { error: string } {
  const depth = getNodeDepth(tree, parentId);
  if (depth >= MAX_FOLDER_DEPTH) {
    return { error: `Maximum folder depth of ${MAX_FOLDER_DEPTH} reached.` };
  }
  const siblings = getChildrenOf(tree, parentId);
  const order = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
  const uniqueN = uniqueName(tree, name, parentId);
  const node: SessionNode = { id: generateId(), type: 'folder', name: uniqueN, parentId, order };
  return { tree: { nodes: [...tree.nodes, node] }, node };
}

const MAX_FOLDER_DEPTH = 4;

/** Get the depth of a node (0 = root level). */
export function getNodeDepth(tree: SessionTree, parentId: string | null): number {
  let depth = 0;
  let current = parentId;
  while (current !== null) {
    depth++;
    const node = tree.nodes.find((n) => n.id === current);
    current = node?.parentId ?? null;
  }
  return depth;
}

/** Get the max depth of descendants below a node (0 if no children). */
function getSubtreeDepth(tree: SessionTree, nodeId: string): number {
  const children = tree.nodes.filter((n) => n.parentId === nodeId && n.type === 'folder');
  if (children.length === 0) return 0;
  return 1 + Math.max(...children.map((c) => getSubtreeDepth(tree, c.id)));
}

/** Get all descendant IDs of a node (recursive). */
function getDescendantIds(tree: SessionTree, nodeId: string): string[] {
  const children = tree.nodes.filter((n) => n.parentId === nodeId);
  const ids: string[] = [];
  for (const child of children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(tree, child.id));
  }
  return ids;
}

export function removeNode(tree: SessionTree, nodeId: string): { tree: SessionTree; removedSessionIds: string[] } {
  const toRemove = new Set([nodeId, ...getDescendantIds(tree, nodeId)]);
  const removedSessionIds = tree.nodes
    .filter((n) => toRemove.has(n.id) && n.type === 'session')
    .map((n) => n.id);
  return {
    tree: { nodes: tree.nodes.filter((n) => !toRemove.has(n.id)) },
    removedSessionIds,
  };
}

export function renameNode(tree: SessionTree, nodeId: string, name: string): SessionTree {
  return { nodes: tree.nodes.map((n) => (n.id === nodeId ? { ...n, name } : n)) };
}

export function toggleFolder(tree: SessionTree, folderId: string): SessionTree {
  return {
    nodes: tree.nodes.map((n) =>
      n.id === folderId && n.type === 'folder'
        ? { ...n, collapsed: !n.collapsed }
        : n,
    ),
  };
}

export function moveNode(tree: SessionTree, nodeId: string, newParentId: string | null, newOrder: number): SessionTree | { error: string } {
  // Prevent moving a folder into itself or its descendants
  if (newParentId !== null) {
    const descendants = getDescendantIds(tree, nodeId);
    if (nodeId === newParentId || descendants.includes(newParentId)) {
      return tree;
    }
  }
  // Enforce max folder depth when moving a folder
  const node = tree.nodes.find((n) => n.id === nodeId);
  if (node?.type === 'folder') {
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
  const reindexed: SessionNode[] = [];
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

// ─── Migration ───────────────────────────────────────────────────────────────

/** Migrate legacy single-sheet storage into the session system. */
export function migrateLegacySheet(): { tree: SessionTree; activeId: string } | null {
  try {
    const raw = localStorage.getItem(LEGACY_SHEET_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SheetData;
    const id = generateId();
    saveSessionData(id, data);
    const node: SessionNode = { id, type: 'session', name: 'Session 1', parentId: null, order: 0 };
    const tree: SessionTree = { nodes: [node] };
    saveSessionTree(tree);
    saveActiveSessionId(id);
    // Don't delete legacy key yet — keep as backup
    return { tree, activeId: id };
  } catch {
    return null;
  }
}
