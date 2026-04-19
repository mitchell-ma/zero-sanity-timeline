import { useEffect, useRef } from 'react';
import { saveToLocalStorage, SheetData } from '../utils/sheetStorage';

/** Debounced auto-save to localStorage (500ms delay). Skipped when `skip` is true. */
export function useAutoSave(buildSheetData: () => SheetData, skip: boolean = false): void {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (skip) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToLocalStorage(buildSheetData());
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [buildSheetData, skip]);
}
