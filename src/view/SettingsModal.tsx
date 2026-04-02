import { ThemeType, NumberFormatType, InteractionModeType, PerformanceMode } from '../consts/enums';
import type { GlobalSettings } from '../consts/settings';
import { t } from '../locales/locale';

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
        <div className="settings-header">
          <span className="settings-title">{t('settings.title')}</span>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>
        <div className="settings-body">
          {/* Theme */}
          <div className="settings-row">
            <span className="settings-label">{t('settings.label.theme')}</span>
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

          {/* Interaction Mode */}
          <div className="settings-row">
            <span className="settings-label">{t('settings.label.interactionMode')}</span>
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

          {/* Locale */}
          <div className="settings-row">
            <span className="settings-label">{t('settings.label.locale')}</span>
            <select
              className="settings-select"
              value={settings.locale}
              onChange={(e) => onUpdate('locale', e.target.value)}
              disabled
            >
              <option value="en-US">English (US)</option>
            </select>
          </div>

          {/* Decimal Places */}
          <div className="settings-row">
            <span className="settings-label">{t('settings.label.decimalPlaces')}</span>
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

          {/* Number Format */}
          <div className="settings-row">
            <span className="settings-label">{t('settings.label.numberFormat')}</span>
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

          {/* Performance Mode */}
          <div className="settings-row">
            <span className="settings-label">Performance</span>
            <div className="settings-toggle-group">
              <button
                className={`settings-toggle-btn${settings.performanceMode === PerformanceMode.HIGH ? ' active' : ''}`}
                onClick={() => onUpdate('performanceMode', PerformanceMode.HIGH)}
              >
                High
              </button>
              <button
                className={`settings-toggle-btn${settings.performanceMode === PerformanceMode.BALANCED ? ' active' : ''}`}
                onClick={() => onUpdate('performanceMode', PerformanceMode.BALANCED)}
              >
                Balanced
              </button>
              <button
                className={`settings-toggle-btn${settings.performanceMode === PerformanceMode.LOW ? ' active' : ''}`}
                onClick={() => onUpdate('performanceMode', PerformanceMode.LOW)}
              >
                Low
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
