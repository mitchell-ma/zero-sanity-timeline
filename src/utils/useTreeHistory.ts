import { useState, useRef, useCallback } from 'react';
import { LoadoutTree, saveLoadoutTree } from './loadoutStorage';

const MAX_HISTORY = 100;
const HISTORY_KEY = 'zst-tree-history';

interface PersistedStacks {
  undoStack: LoadoutTree[];
  redoStack: LoadoutTree[];
}

function loadStacks(): PersistedStacks {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.undoStack) && Array.isArray(parsed.redoStack)) {
        return {
          undoStack: parsed.undoStack.slice(-MAX_HISTORY),
          redoStack: parsed.redoStack.slice(-MAX_HISTORY),
        };
      }
    }
  } catch { /* ignore */ }
  return { undoStack: [], redoStack: [] };
}

function persistStacks(undoStack: LoadoutTree[], redoStack: LoadoutTree[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ undoStack, redoStack }));
  } catch { /* ignore */ }
}

export interface TreeHistory {
  tree: LoadoutTree;
  setTree: (next: LoadoutTree) => void;
  undo: () => void;
  redo: () => void;
  resetTree: (next: LoadoutTree) => void;
}

export function useTreeHistory(initial: LoadoutTree): TreeHistory {
  const [tree, setTreeRaw] = useState<LoadoutTree>(initial);
  const treeRef = useRef<LoadoutTree>(initial);

  const initialStacks = useRef(loadStacks());
  const undoRef = useRef<LoadoutTree[]>(initialStacks.current.undoStack);
  const redoRef = useRef<LoadoutTree[]>(initialStacks.current.redoStack);

  const setTree = useCallback((next: LoadoutTree) => {
    const prev = treeRef.current;
    if (prev === next) return;
    undoRef.current.push(prev);
    if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift();
    redoRef.current = [];
    treeRef.current = next;
    setTreeRaw(next);
    saveLoadoutTree(next);
    persistStacks(undoRef.current, redoRef.current);
  }, []);

  const undo = useCallback(() => {
    if (undoRef.current.length === 0) return;
    const prev = undoRef.current.pop()!;
    redoRef.current.push(treeRef.current);
    treeRef.current = prev;
    setTreeRaw(prev);
    saveLoadoutTree(prev);
    persistStacks(undoRef.current, redoRef.current);
  }, []);

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    const next = redoRef.current.pop()!;
    undoRef.current.push(treeRef.current);
    treeRef.current = next;
    setTreeRaw(next);
    saveLoadoutTree(next);
    persistStacks(undoRef.current, redoRef.current);
  }, []);

  const resetTree = useCallback((next: LoadoutTree) => {
    treeRef.current = next;
    undoRef.current = [];
    redoRef.current = [];
    setTreeRaw(next);
    saveLoadoutTree(next);
    persistStacks([], []);
  }, []);

  return { tree, setTree, undo, redo, resetTree };
}
