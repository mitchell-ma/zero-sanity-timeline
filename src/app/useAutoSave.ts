import { useEffect, useRef } from 'react';
import { saveToLocalStorage, SheetData } from '../utils/sheetStorage';

/** Debounced auto-save to localStorage (500ms delay). */
export function useAutoSave(buildSheetData: () => SheetData): void {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToLocalStorage(buildSheetData());
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [buildSheetData]);
}
