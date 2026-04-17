import { useEffect, RefObject } from 'react';

/** DOM tag names for editable elements where global shortcuts should be suppressed. */
const EDITABLE_TAG_NAMES: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Registers global undo/redo keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z).
 *  When sidebarRef is provided and the sidebar contains the active element,
 *  routes to treeUndo/treeRedo instead of timeline undo/redo. */
export function useKeyboardShortcuts(
  undo: () => void,
  redo: () => void,
  treeUndo?: () => void,
  treeRedo?: () => void,
  sidebarRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (EDITABLE_TAG_NAMES.has(tag)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        const sidebarFocused = sidebarRef?.current?.contains(document.activeElement) ?? false;
        if (sidebarFocused && treeUndo) treeUndo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault();
        const sidebarFocused = sidebarRef?.current?.contains(document.activeElement) ?? false;
        if (sidebarFocused && treeRedo) treeRedo();
        else redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, treeUndo, treeRedo, sidebarRef]);
}
