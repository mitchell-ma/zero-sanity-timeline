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
import frFR from './fr-FR.json';

const DEFAULT_LOCALE = 'en-US';
/** Must match `SETTINGS_STORAGE_KEY` in `consts/settings.ts`. Duplicated here
 *  to avoid pulling the settings module into this file's import chain — the
 *  self-init below has to run before any consumer module. */
const SETTINGS_STORAGE_KEY = 'zst-settings';

/** Registry of bundled locale dictionaries, keyed by locale identifier. */
const LOCALE_REGISTRY: Record<string, Record<string, string>> = {
  'en-US': enUS,
  'fr-FR': frFR,
};

/** Ordered list of locales available in the settings picker. */
export const AVAILABLE_LOCALES: Array<{ id: string; label: string }> = [
  { id: 'en-US', label: 'English (US)' },
  { id: 'fr-FR', label: 'Français (FR)' },
];

let currentLocale = DEFAULT_LOCALE;
let translations: Record<string, string> = enUS;
let fallbackTranslations: Record<string, string> = enUS;

// Self-init from localStorage. Must run at module load — every downstream
// module that calls `t()` at top level (e.g. `timelineColumnLabels.ts`) reads
// `translations` once and caches the result, so the correct locale must be
// active before those imports execute. React's `setLocaleById(settings.locale)`
// runs in a `useEffect`, which is too late.
(function initFromStorage() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_STORAGE_KEY) : null;
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const saved = parsed && typeof parsed.locale === 'string' ? parsed.locale : null;
    if (!saved || !LOCALE_REGISTRY[saved]) return;
    currentLocale = saved;
    translations = LOCALE_REGISTRY[saved];
  } catch { /* ignore */ }
})();

/**
 * Load a translation dictionary (typically from a JSON import).
 * When the loaded locale is `en-US`, the fallback dictionary is updated too
 * — so game-data augmentations and hot-swaps flow through both lookups.
 */
export function loadLocaleData(locale: string, data: Record<string, string>) {
  currentLocale = locale;
  translations = data;
  if (locale === DEFAULT_LOCALE) {
    fallbackTranslations = data;
  }
}

/**
 * Switch to a bundled locale by identifier. Falls back to the default
 * locale if the identifier is unknown. Returns the loaded dictionary so
 * React wrappers can mirror it into state.
 */
export function loadLocaleById(locale: string): { locale: string; data: Record<string, string> } {
  const data = LOCALE_REGISTRY[locale] ?? LOCALE_REGISTRY[DEFAULT_LOCALE];
  const resolved = LOCALE_REGISTRY[locale] ? locale : DEFAULT_LOCALE;
  loadLocaleData(resolved, data);
  return { locale: resolved, data };
}

/** Get the current locale identifier. */
export function getCurrentLocale() {
  return currentLocale;
}

/**
 * Token syntax: `{name}` · `{name:0}` · `{name:1%}` · `{name:0s}`
 *   - digits after `:` = decimal places (default 0 when a format code is present)
 *   - `%` suffix multiplies the numeric value by 100 and appends `%`
 *   - `s` suffix appends `s` (seconds)
 *   - name must not contain `:` or `}` — no expression parsing
 */
const TOKEN_REGEX = /\{([^:}]+)(?::(\d+)?([%s])?)?\}/g;

function formatToken(
  value: string | number,
  decimals: string | undefined,
  suffix: string | undefined,
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  const dp = decimals !== undefined ? parseInt(decimals, 10) : 0;
  if (suffix === '%') return (value * 100).toFixed(dp) + '%';
  if (suffix === 's') return value.toFixed(dp) + 's';
  if (decimals !== undefined) return value.toFixed(dp);
  return String(value);
}

function interpolate(raw: string, params?: Record<string, string | number>): string {
  if (!params) return raw;
  return raw.replace(TOKEN_REGEX, (match, name, decimals, suffix) => {
    if (!(name in params)) return match;
    return formatToken(params[name], decimals, suffix);
  });
}

/**
 * Translate a key, with optional `{param}` / `{param:format}` interpolation.
 *
 * Lookup chain: current locale → en-US → return the key itself (makes
 * missing translations visible during development).
 *
 * @example
 *   t('app.btn.share')                            // "SHARE"
 *   t('ctx.addAt', { time: '2.50s' })             // "Add @ 2.50s"
 *   t('op.X.pot.3.desc', { Str: 8, Inc: 0.12 })   // "+8 STR, +12% DMG"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = translations[key] ?? fallbackTranslations[key] ?? key;
  return interpolate(raw, params);
}

/**
 * Like `t()` but returns `undefined` when the key is missing from both the
 * current locale and the en-US fallback — instead of returning the key.
 * Use for optional strings (e.g. segment/frame names, which are often absent).
 */
export function tOptional(key: string, params?: Record<string, string | number>): string | undefined {
  const raw = translations[key] ?? fallbackTranslations[key];
  if (raw === undefined) return undefined;
  return interpolate(raw, params);
}

/**
 * Merge additional entries into a locale dictionary (both the registry and,
 * if the locale is currently active or is en-US, the live lookup dicts).
 * Used by game-data loaders to layer generated strings on top of the UI dict.
 */
export function registerLocale(locale: string, additions: Record<string, string>): void {
  const existing = LOCALE_REGISTRY[locale] ?? {};
  const merged = { ...existing, ...additions };
  LOCALE_REGISTRY[locale] = merged;
  if (locale === currentLocale) translations = merged;
  if (locale === DEFAULT_LOCALE) fallbackTranslations = merged;
}
