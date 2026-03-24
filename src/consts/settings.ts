/**
 * Global settings model — defines the shape, defaults, and persistence
 * for application-wide user preferences.
 */

import { ThemeType, NumberFormatType, InteractionModeType } from './enums';

export interface GlobalSettings {
  theme: ThemeType;
  interactionMode: InteractionModeType;
  locale: string;
  decimalPlaces: number;
  numberFormat: NumberFormatType;
}

export const DEFAULT_SETTINGS: GlobalSettings = {
  theme: ThemeType.DARK,
  interactionMode: InteractionModeType.STRICT,
  locale: 'en-US',
  decimalPlaces: 2,
  numberFormat: NumberFormatType.DECIMAL,
};

const SETTINGS_STORAGE_KEY = 'zst-settings';

export function loadSettings(): GlobalSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          theme: Object.values(ThemeType).includes(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
          interactionMode: Object.values(InteractionModeType).includes(parsed.interactionMode) ? parsed.interactionMode : DEFAULT_SETTINGS.interactionMode,
          locale: typeof parsed.locale === 'string' ? parsed.locale : DEFAULT_SETTINGS.locale,
          decimalPlaces: typeof parsed.decimalPlaces === 'number' && parsed.decimalPlaces >= 0 && parsed.decimalPlaces <= 6
            ? parsed.decimalPlaces : DEFAULT_SETTINGS.decimalPlaces,
          numberFormat: Object.values(NumberFormatType).includes(parsed.numberFormat) ? parsed.numberFormat : DEFAULT_SETTINGS.numberFormat,
        };
      }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: GlobalSettings) {
  try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

/** Migrate legacy localStorage keys into global settings. */
export function migrateLegacySettings(settings: GlobalSettings): GlobalSettings {
  const migrated = { ...settings };
  try {
    const lightMode = localStorage.getItem('zst-light-mode');
    if (lightMode === 'true') migrated.theme = ThemeType.LIGHT;
    else if (lightMode === 'false') migrated.theme = ThemeType.DARK;

    const interactionMode = localStorage.getItem('zst-interaction-mode');
    if (interactionMode && Object.values(InteractionModeType).includes(interactionMode as InteractionModeType)) {
      migrated.interactionMode = interactionMode as InteractionModeType;
    }
    // Also check legacy debug mode
    if (localStorage.getItem('zst-debug-mode') === 'true') {
      migrated.interactionMode = InteractionModeType.FREEFORM;
    }
  } catch { /* ignore */ }
  return migrated;
}
