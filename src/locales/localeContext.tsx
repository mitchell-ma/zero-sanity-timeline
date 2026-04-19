/**
 * React context wrapper for the locale system.
 *
 * Provides `useLocale()` hook that returns the same `t()` function
 * from `locale.ts` but also triggers re-renders when the locale changes.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { loadLocaleData, loadLocaleById, getCurrentLocale, t } from './locale';
// Side-effect import: loads per-operator / weapon / gear locale bundles into
// the locale registry at app startup. Must precede any render.
import './gameDataLocale';

interface LocaleContextValue {
  locale: string;
  t: typeof t;
  setLocale: (locale: string, data: Record<string, string>) => void;
  setLocaleById: (locale: string) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: getCurrentLocale(),
  t,
  setLocale: () => {},
  setLocaleById: () => {},
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(getCurrentLocale());

  const setLocale = useCallback((newLocale: string, data: Record<string, string>) => {
    loadLocaleData(newLocale, data);
    setLocaleState(newLocale);
  }, []);

  const setLocaleById = useCallback((newLocale: string) => {
    const { locale: resolved } = loadLocaleById(newLocale);
    setLocaleState(resolved);
  }, []);

  const value = useMemo(
    () => ({ locale, t, setLocale, setLocaleById }),
    [locale, setLocale, setLocaleById],
  );

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
