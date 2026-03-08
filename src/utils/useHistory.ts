import { useState, useRef, useCallback } from 'react';

const MAX_HISTORY = 100;

export function useHistory<T>(initial: T) {
  const [state, setStateRaw] = useState<T>(initial);
  const stateRef = useRef<T>(initial);
  const undoRef = useRef<T[]>([]);
  const redoRef = useRef<T[]>([]);
  const batchRef = useRef<T | null>(null);

  const setState = useCallback((action: T | ((prev: T) => T)) => {
    setStateRaw((prev) => {
      const next = typeof action === 'function' ? (action as (p: T) => T)(prev) : action;
      if (batchRef.current === null) {
        undoRef.current.push(prev);
        if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift();
        redoRef.current = [];
      }
      stateRef.current = next;
      return next;
    });
  }, []);

  const beginBatch = useCallback(() => {
    batchRef.current = stateRef.current;
  }, []);

  const endBatch = useCallback(() => {
    if (batchRef.current !== null) {
      const batchStart = batchRef.current;
      batchRef.current = null;
      if (batchStart !== stateRef.current) {
        undoRef.current.push(batchStart);
        if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift();
        redoRef.current = [];
      }
    }
  }, []);

  const undo = useCallback(() => {
    if (undoRef.current.length === 0) return;
    const prev = undoRef.current.pop()!;
    redoRef.current.push(stateRef.current);
    stateRef.current = prev;
    setStateRaw(prev);
  }, []);

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    const next = redoRef.current.pop()!;
    undoRef.current.push(stateRef.current);
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  return { state, setState, beginBatch, endBatch, undo, redo };
}
