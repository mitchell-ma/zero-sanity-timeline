import { ThemeType, NumberFormatType, InteractionModeType } from '../consts/enums';
import type { GlobalSettings } from '../consts/settings';
import { t, AVAILABLE_LOCALES } from '../locales/locale';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: GlobalSettings;
  onUpdate: <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => void;
}

export default function SettingsModal({ open, onClose, settings, onUpdate }: SettingsModalProps) {
  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-rail" aria-hidden="true" />
        <div className="settings-header">
          <span className="settings-title">{t('settings.title')}</span>
          <button className="settings-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="settings-body">
          <div className="settings-row">
            <span className="settings-label">{t('settings.label.theme')}</span>
            <div className="settings-control">
              <div className="settings-toggle-group">
                <button
                  className={`settings-toggle-btn${settings.theme === ThemeType.DARK ? ' active' : ''}`}
                  onClick={() => onUpdate('theme', ThemeType.DARK)}
                >
                  {t('settings.theme.dark')}
                </button>
                <button
                  className={`settings-toggle-btn${settings.theme === ThemeType.LIGHT ? ' active' : ''}`}
                  onClick={() => onUpdate('theme', ThemeType.LIGHT)}
                >
                  {t('settings.theme.light')}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">{t('settings.label.locale')}</span>
            <div className="settings-control">
              <select
                className="settings-select"
                value={settings.locale}
                onChange={(e) => onUpdate('locale', e.target.value)}
              >
                {AVAILABLE_LOCALES.map(({ id, label }) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">{t('settings.label.decimalPlaces')}</span>
            <div className="settings-control">
              <select
                className="settings-select"
                value={settings.decimalPlaces}
                onChange={(e) => onUpdate('decimalPlaces', Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">{t('settings.label.numberFormat')}</span>
            <div className="settings-control">
              <div className="settings-toggle-group">
                <button
                  className={`settings-toggle-btn${settings.numberFormat === NumberFormatType.DECIMAL ? ' active' : ''}`}
                  onClick={() => onUpdate('numberFormat', NumberFormatType.DECIMAL)}
                >
                  {t('settings.numberFormat.decimal')}
                </button>
                <button
                  className={`settings-toggle-btn${settings.numberFormat === NumberFormatType.PERCENTAGE ? ' active' : ''}`}
                  onClick={() => onUpdate('numberFormat', NumberFormatType.PERCENTAGE)}
                >
                  {t('settings.numberFormat.percentage')}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">{t('settings.label.interactionMode')}</span>
            <div className="settings-control">
              <div className="settings-toggle-group">
                <button
                  className={`settings-toggle-btn${settings.interactionMode === InteractionModeType.STRICT ? ' active' : ''}`}
                  onClick={() => onUpdate('interactionMode', InteractionModeType.STRICT)}
                >
                  {t('settings.interactionMode.strict')}
                </button>
                <button
                  className={`settings-toggle-btn${settings.interactionMode === InteractionModeType.FREEFORM ? ' active' : ''}`}
                  onClick={() => onUpdate('interactionMode', InteractionModeType.FREEFORM)}
                >
                  {t('settings.interactionMode.freeform')}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">{t('settings.label.debugMode')}</span>
            <div className="settings-control">
              <button
                className={`settings-switch${settings.debugMode ? ' on' : ''}`}
                onClick={() => onUpdate('debugMode', !settings.debugMode)}
                role="switch"
                aria-checked={settings.debugMode}
                aria-label={t('settings.label.debugMode')}
              >
                <span className="settings-switch-track" aria-hidden="true">
                  <span className="settings-switch-thumb" />
                </span>
                <span className="settings-switch-label">
                  {settings.debugMode ? t('settings.debugMode.on') : t('settings.debugMode.off')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
