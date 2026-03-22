/**
 * React context wrapper for the locale system.
 *
 * Provides `useLocale()` hook that returns the same `t()` function
 * from `locale.ts` but also triggers re-renders when the locale changes.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { loadLocaleData, getCurrentLocale, t } from './locale';

interface LocaleContextValue {
  locale: string;
  t: typeof t;
  setLocale: (locale: string, data: Record<string, string>) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: getCurrentLocale(),
  t,
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(getCurrentLocale());

  const setLocale = useCallback((newLocale: string, data: Record<string, string>) => {
    loadLocaleData(newLocale, data);
    setLocaleState(newLocale);
  }, []);

  const value = useMemo(() => ({ locale, t, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
