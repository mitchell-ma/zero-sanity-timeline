import { useState, useRef, useCallback } from 'react';

const MAX_HISTORY = 100;

export function useHistory<T>(initial: T) {
  const [state, setStateRaw] = useState<T>(initial);
  const stateRef = useRef<T>(initial);
  const undoRef = useRef<T[]>([]);
  const redoRef = useRef<T[]>([]);
  const batchRef = useRef<T | null>(null);
  // Remote updates that arrived mid-batch — applied once endBatch fires so
  // local batch mutations aren't overwritten while still accumulating.
  const pendingRemoteRef = useRef<T[]>([]);

  const setState = useCallback((action: T | ((prev: T) => T)) => {
    // Snapshot current state BEFORE the updater runs — ref mutations must be
    // outside the updater to avoid StrictMode double-invocation corruption.
    const snapshot = stateRef.current;
    setStateRaw((prev) => {
      const next = typeof action === 'function' ? (action as (p: T) => T)(prev) : action;
      if (next === prev) return prev;
      stateRef.current = next;
      return next;
    });
    // Push undo entry outside updater using the pre-mutation snapshot
    queueMicrotask(() => {
      if (stateRef.current !== snapshot && batchRef.current === null) {
        undoRef.current.push(snapshot);
        if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift();
        redoRef.current = [];
      }
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
      if (pendingRemoteRef.current.length > 0) {
        const pending = pendingRemoteRef.current;
        pendingRemoteRef.current = [];
        const latest = pending[pending.length - 1];
        stateRef.current = latest;
        setStateRaw(latest);
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

  const resetState = useCallback((value: T) => {
    stateRef.current = value;
    undoRef.current = [];
    redoRef.current = [];
    batchRef.current = null;
    pendingRemoteRef.current = [];
    setStateRaw(value);
  }, []);

  // Sets state from a remote source (collaboration sync) WITHOUT pushing to
  // undo/redo stacks. Deferred when a local batch is in progress — the queue
  // flushes in endBatch so remote changes never interleave with batch mutations.
  const applyRemote = useCallback((value: T) => {
    if (batchRef.current !== null) {
      pendingRemoteRef.current.push(value);
      return;
    }
    stateRef.current = value;
    setStateRaw(value);
  }, []);

  return { state, setState, resetState, beginBatch, endBatch, undo, redo, applyRemote };
}
