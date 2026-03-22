/**
 * Module-level locale system.
 *
 * Provides a `t(key, params?)` function that can be imported anywhere —
 * controllers, consts, and views — without requiring React context.
 *
 * The React wrapper (`localeContext.tsx`) delegates to this module and
 * triggers re-renders when the locale changes.
 */

import enUS from './en-US.json';

const DEFAULT_LOCALE = 'en-US';

let currentLocale = DEFAULT_LOCALE;
let translations: Record<string, string> = enUS;

/** Load a translation dictionary (typically from a JSON import). */
export function loadLocaleData(locale: string, data: Record<string, string>) {
  currentLocale = locale;
  translations = data;
}

/** Get the current locale identifier. */
export function getCurrentLocale() {
  return currentLocale;
}

/**
 * Translate a key, with optional `{param}` interpolation.
 *
 * Falls back to the key itself when no translation is found —
 * makes missing translations visible during development.
 *
 * @example
 *   t('app.btn.share')                        // "SHARE"
 *   t('ctx.addAt', { time: '2.50s' })         // "Add @ 2.50s"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let value = translations[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }
  return value;
}
