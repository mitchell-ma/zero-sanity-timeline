import { useState, useRef, useCallback } from 'react';
import { SessionTree, saveSessionTree } from './sessionStorage';

const MAX_HISTORY = 100;
const HISTORY_KEY = 'zst-tree-history';

interface PersistedStacks {
  undoStack: SessionTree[];
  redoStack: SessionTree[];
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

function persistStacks(undoStack: SessionTree[], redoStack: SessionTree[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ undoStack, redoStack }));
  } catch { /* ignore */ }
}

export interface TreeHistory {
  tree: SessionTree;
  setTree: (next: SessionTree) => void;
  undo: () => void;
  redo: () => void;
  resetTree: (next: SessionTree) => void;
}

export function useTreeHistory(initial: SessionTree): TreeHistory {
  const [tree, setTreeRaw] = useState<SessionTree>(initial);
  const treeRef = useRef<SessionTree>(initial);

  const initialStacks = useRef(loadStacks());
  const undoRef = useRef<SessionTree[]>(initialStacks.current.undoStack);
  const redoRef = useRef<SessionTree[]>(initialStacks.current.redoStack);

  const setTree = useCallback((next: SessionTree) => {
    const prev = treeRef.current;
    if (prev === next) return;
    undoRef.current.push(prev);
    if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift();
    redoRef.current = [];
    treeRef.current = next;
    setTreeRaw(next);
    saveSessionTree(next);
    persistStacks(undoRef.current, redoRef.current);
  }, []);

  const undo = useCallback(() => {
    if (undoRef.current.length === 0) return;
    const prev = undoRef.current.pop()!;
    redoRef.current.push(treeRef.current);
    treeRef.current = prev;
    setTreeRaw(prev);
    saveSessionTree(prev);
    persistStacks(undoRef.current, redoRef.current);
  }, []);

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    const next = redoRef.current.pop()!;
    undoRef.current.push(treeRef.current);
    treeRef.current = next;
    setTreeRaw(next);
    saveSessionTree(next);
    persistStacks(undoRef.current, redoRef.current);
  }, []);

  const resetTree = useCallback((next: SessionTree) => {
    treeRef.current = next;
    undoRef.current = [];
    redoRef.current = [];
    setTreeRaw(next);
    saveSessionTree(next);
    persistStacks([], []);
  }, []);

  return { tree, setTree, undo, redo, resetTree };
}
